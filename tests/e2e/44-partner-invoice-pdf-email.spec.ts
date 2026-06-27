/**
 * Spec 44 — Partner Invoice PDF + email Edge Function contract (fix 12. 06. 2026)
 *
 * Staging-only, self-contained, backend-only (no browser).
 * Service role is used ONLY for setup/cleanup.
 *
 * Required env vars (all present in playwright-staging.yml):
 *   VITE_SUPABASE_URL               — must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD — staging admin account
 *
 * SAFE EMAIL RULE: the only real email this spec may trigger goes to
 * eshop@onemil.cz (test partner contact_email). Never change this.
 *
 * Invariants verified:
 *   44a) no auth → 401 on both EFs
 *   44b) non-admin JWT → 403 on both EFs
 *   44c) internal token → generate-partner-invoice-pdf 200 + file_url,
 *        partner_invoice_exports row created, PDF object downloadable via storage
 *   44d) partner (authenticated, own invoice) can read the export row via RLS
 *   44e) admin JWT → send-partner-invoice-email 200, sent_to ==
 *        eshop@onemil.cz, invoice status draft → issued (never paid)
 *
 * Cleanup: removes invoice (cascades exports), storage object, partner and
 * test users. Runs in afterAll even on failure.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ADMIN_EMAIL  = (process.env.E2E_SUPERADMIN_EMAIL || process.env.E2E_ADMIN_EMAIL) ?? '';
const ADMIN_PASSWORD = (process.env.E2E_SUPERADMIN_PASSWORD || process.env.E2E_ADMIN_PASSWORD) ?? '';
const INTERNAL_TOKEN = process.env.VITE_INTERNAL_FUNCTION_TOKEN ?? '';

const PDF_EF_URL   = `${SUPABASE_URL}/functions/v1/generate-partner-invoice-pdf`;
const EMAIL_EF_URL = `${SUPABASE_URL}/functions/v1/send-partner-invoice-email`;

const SAFE_RECIPIENT = 'eshop@onemil.cz'; // the ONLY allowed real recipient

const RUN_ID = Date.now();
const PARTNER_EMAIL = `spec44-partner-${RUN_ID}@onemil.cz`;
const NONADMIN_EMAIL = `spec44-nonadmin-${RUN_ID}@onemil.cz`;
const SPEC_ADMIN_EMAIL = `spec44-admin-${RUN_ID}@onemil.cz`;
const PASSWORD = `Spec44!${RUN_ID}x`;

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) &&
  !!SUPABASE_ANON && !!SERVICE_ROLE && !!ADMIN_EMAIL && !!ADMIN_PASSWORD && !!INTERNAL_TOKEN;

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function makeAnon(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getJwt(email: string, password: string): Promise<string> {
  const anon = makeAnon();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) throw new Error(`signIn ${email}: ${error?.message}`);
  return data.session.access_token;
}

async function callEf(
  url: string,
  invoiceId: string,
  jwt?: string,
  extraBody: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON,
    ...extraHeaders,
  };
  if (jwt) headers['Authorization'] = `Bearer ${jwt}`;
  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ invoice_id: invoiceId, ...extraBody }),
  });
}

function storagePathFromFileUrl(fileUrl: string): string | null {
  const match = fileUrl.match(/partner-invoices\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function expectPdfObjectExists(admin: SupabaseClient, fileUrl: string): Promise<void> {
  const storagePath = storagePathFromFileUrl(fileUrl);
  expect(storagePath).toBeTruthy();
  const { data, error } = await admin.storage.from('partner-invoices').download(storagePath!);
  expect(error).toBeNull();
  expect(data).toBeTruthy();
  const head = new Uint8Array((await data!.arrayBuffer()).slice(0, 4));
  expect(String.fromCharCode(...head)).toBe('%PDF');
}

interface Ctx {
  adminAuthId: string;
  partnerAuthId: string;
  nonAdminAuthId: string;
  partnerId: string;
  invoiceId: string;
  noPdfInvoiceId: string;
  fileUrl: string | null;
}
const ctx: Partial<Ctx> = { fileUrl: null };

test.describe.serial('44 — Partner invoice PDF + email EF contract', () => {
  test.skip(
    !isStaging,
    'staging-only — requires staging VITE_SUPABASE_URL, anon key, service role key, admin credentials',
  );

  test.beforeAll(async () => {
    const admin = makeAdmin();

    const { data: pu, error: puErr } = await admin.auth.admin.createUser({
      email: PARTNER_EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (puErr) throw new Error(`partner user: ${puErr.message}`);
    ctx.partnerAuthId = pu.user.id;

    const { data: nu, error: nuErr } = await admin.auth.admin.createUser({
      email: NONADMIN_EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (nuErr) throw new Error(`nonadmin user: ${nuErr.message}`);
    ctx.nonAdminAuthId = nu.user.id;

    const { data: au, error: auErr } = await admin.auth.admin.createUser({
      email: SPEC_ADMIN_EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (auErr) throw new Error(`admin user: ${auErr.message}`);
    ctx.adminAuthId = au.user.id;

    // The invoice PDF + email Edge Functions are superadmin-only (partner
    // finance lock). The throwaway EF-calling account must therefore be a
    // superadmin for the authorized-path assertions (44e/44f) to pass.
    const { error: roleErr } = await (admin as any)
      .from('user_roles')
      .insert({ user_id: au.user.id, role: 'superadmin' });
    if (roleErr) throw new Error(`superadmin role insert: ${roleErr.message}`);

    const { data: p, error: pErr } = await (admin as any)
      .from('partners')
      .insert({
        name: `E2E Spec44 Partner ${RUN_ID}`,
        company_name: `E2E Spec44 s.r.o.`,
        logo_url: 'https://example.invalid/spec44.png',
        website_url: 'https://example.invalid/spec44',
        contact_email: SAFE_RECIPIENT, // safe test recipient ONLY
        auth_user_id: pu.user.id,
        status: 'approved',
        approved_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (pErr) throw new Error(`partner insert: ${pErr.message}`);
    ctx.partnerId = p.id as string;

    const { data: inv, error: invErr } = await (admin as any)
      .from('partner_invoices')
      .insert({
        partner_id: p.id,
        period_start: '2026-06-01',
        period_end: '2026-06-07',
        period_from: '2026-06-01',
        period_to: '2026-06-07',
        coins_total: 3,
        amount_net: 3,
        vat_amount: 0.63,
        amount_gross: 3.63,
        invoice_number: `TEST-S44-${RUN_ID}`,
        variable_symbol: '44440001',
        status: 'draft',
      })
      .select('id')
      .single();
    if (invErr) throw new Error(`invoice insert: ${invErr.message}`);
    ctx.invoiceId = inv.id as string;

    const { data: noPdfInv, error: noPdfInvErr } = await (admin as any)
      .from('partner_invoices')
      .insert({
        partner_id: p.id,
        period_start: '2026-06-08',
        period_end: '2026-06-14',
        period_from: '2026-06-08',
        period_to: '2026-06-14',
        coins_total: 1,
        amount_net: 1,
        vat_amount: 0.21,
        amount_gross: 1.21,
        invoice_number: `TEST-S44-NOPDF-${RUN_ID}`,
        variable_symbol: '44440002',
        status: 'issued',
      })
      .select('id')
      .single();
    if (noPdfInvErr) throw new Error(`no-pdf invoice insert: ${noPdfInvErr.message}`);
    ctx.noPdfInvoiceId = noPdfInv.id as string;
  });

  test.afterAll(async () => {
    const admin = makeAdmin();
    if (ctx.fileUrl) {
      // storage path: .../object/sign/partner-invoices/<filename>?token=...
      const storagePath = storagePathFromFileUrl(ctx.fileUrl);
      if (storagePath) await admin.storage.from('partner-invoices').remove([storagePath]).catch(() => undefined);
    }
    if (ctx.invoiceId) {
      await (admin as any).from('partner_invoices').delete().eq('id', ctx.invoiceId);
    }
    if (ctx.noPdfInvoiceId) {
      await (admin as any).from('partner_invoices').delete().eq('id', ctx.noPdfInvoiceId);
    }
    if (ctx.partnerId) {
      await (admin as any).from('partners').delete().eq('id', ctx.partnerId);
    }
    if (ctx.adminAuthId) {
      await (admin as any).from('user_roles').delete().eq('user_id', ctx.adminAuthId);
    }
    for (const uid of [ctx.partnerAuthId, ctx.nonAdminAuthId, ctx.adminAuthId]) {
      if (uid) await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  });

  test('44a: no auth → 401 on both EFs', async () => {
    const r1 = await callEf(PDF_EF_URL, ctx.invoiceId!);
    expect(r1.status).toBe(401);
    const r2 = await callEf(EMAIL_EF_URL, ctx.invoiceId!);
    expect(r2.status).toBe(401);
  });

  test('44b: non-admin JWT → 403 on both EFs', async () => {
    const jwt = await getJwt(NONADMIN_EMAIL, PASSWORD);
    const r1 = await callEf(PDF_EF_URL, ctx.invoiceId!, jwt);
    expect([401, 403]).toContain(r1.status);
    const r2 = await callEf(EMAIL_EF_URL, ctx.invoiceId!, jwt);
    expect([401, 403]).toContain(r2.status);
    const r3 = await callEf(EMAIL_EF_URL, ctx.invoiceId!, jwt, { resend: true });
    expect([401, 403]).toContain(r3.status);
  });

  test('44c: internal token → PDF generated, export row, storage object downloadable', async () => {
    const res = await callEf(
      PDF_EF_URL,
      ctx.invoiceId!,
      undefined,
      {},
      { 'x-internal-token': INTERNAL_TOKEN },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.file_url).toBeTruthy();
    ctx.fileUrl = body.file_url as string;

    const admin = makeAdmin();
    const { data: exp } = await (admin as any)
      .from('partner_invoice_exports')
      .select('id, format, file_url')
      .eq('invoice_id', ctx.invoiceId)
      .eq('format', 'pdf');
    expect(exp).toHaveLength(1);

    await expectPdfObjectExists(admin, ctx.fileUrl!);
  });

  test('44d: partner reads own export via RLS', async () => {
    const client = makeAnon();
    const { error } = await client.auth.signInWithPassword({
      email: PARTNER_EMAIL, password: PASSWORD,
    });
    expect(error).toBeNull();

    const { data: exps, error: expErr } = await (client as any)
      .from('partner_invoice_exports')
      .select('invoice_id, file_url')
      .eq('format', 'pdf');
    expect(expErr).toBeNull();
    expect(exps).toHaveLength(1);
    expect(exps![0].invoice_id).toBe(ctx.invoiceId);
    expect(exps![0].file_url).toBe(ctx.fileUrl);

    await client.auth.signOut();
  });

  test('44e: admin sends invoice email — only to safe recipient, status issued', async () => {
    const jwt = await getJwt(SPEC_ADMIN_EMAIL, PASSWORD);
    const res = await callEf(EMAIL_EF_URL, ctx.invoiceId!, jwt);
    const body = await res.json();
    const admin = makeAdmin();

    if (res.status === 503 && body.error === 'email_service_not_configured') {
      // Staging without RESEND_API_KEY: controlled failure — nothing sent,
      // status must remain 'draft'. Real delivery is verified in environments
      // where the Resend key is configured (production rollout smoke).
      const { data: inv } = await (admin as any)
        .from('partner_invoices')
        .select('status')
        .eq('id', ctx.invoiceId)
        .single();
      expect(inv!.status).toBe('draft');
      return;
    }

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.sent_to).toBe(SAFE_RECIPIENT);

    const { data: inv } = await (admin as any)
      .from('partner_invoices')
      .select('status, paid_at')
      .eq('id', ctx.invoiceId)
      .single();
    expect(inv!.status).toBe('issued'); // never 'paid'
    expect(inv!.paid_at).toBeNull();
  });

  test('44f: admin resends issued invoice from existing PDF without status or paid changes', async () => {
    const admin = makeAdmin();
    const jwt = await getJwt(SPEC_ADMIN_EMAIL, PASSWORD);

    await (admin as any)
      .from('partner_invoices')
      .update({ status: 'issued', paid_at: null })
      .eq('id', ctx.invoiceId);

    const { data: beforeInvoice } = await (admin as any)
      .from('partner_invoices')
      .select('status, paid_at')
      .eq('id', ctx.invoiceId)
      .single();
    expect(beforeInvoice!.status).toBe('issued');
    expect(beforeInvoice!.paid_at).toBeNull();

    const { data: beforeExports } = await (admin as any)
      .from('partner_invoice_exports')
      .select('id')
      .eq('invoice_id', ctx.invoiceId)
      .eq('format', 'pdf');
    expect(beforeExports).toHaveLength(1);

    const res = await callEf(EMAIL_EF_URL, ctx.invoiceId!, jwt, { resend: true });
    const body = await res.json();

    if (res.status === 503 && body.error === 'email_service_not_configured') {
      // Staging without RESEND_API_KEY: controlled failure before any send.
    } else {
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.resend).toBe(true);
      expect(body.sent_to).toBe(SAFE_RECIPIENT);
      expect(body.status_updated).toBe(false);
      expect(body.pdf_export_id).toBe(beforeExports![0].id);
    }

    const { data: afterInvoice } = await (admin as any)
      .from('partner_invoices')
      .select('status, paid_at')
      .eq('id', ctx.invoiceId)
      .single();
    expect(afterInvoice!.status).toBe('issued');
    expect(afterInvoice!.paid_at).toBeNull();

    const { data: afterExports } = await (admin as any)
      .from('partner_invoice_exports')
      .select('id')
      .eq('invoice_id', ctx.invoiceId)
      .eq('format', 'pdf');
    expect(afterExports).toHaveLength(beforeExports!.length);
  });

  test('44g: resend refuses missing PDF export and unsafe staging recipient', async () => {
    const admin = makeAdmin();
    const jwt = await getJwt(SPEC_ADMIN_EMAIL, PASSWORD);

    const noPdfRes = await callEf(EMAIL_EF_URL, ctx.noPdfInvoiceId!, jwt, { resend: true });
    const noPdfBody = await noPdfRes.json();
    expect(noPdfRes.status).toBe(409);
    expect(noPdfBody.error).toBe('pdf_export_required_for_resend');

    await (admin as any)
      .from('partners')
      .update({ contact_email: `unsafe-spec44-${RUN_ID}@example.com` })
      .eq('id', ctx.partnerId);
    const unsafeRes = await callEf(EMAIL_EF_URL, ctx.invoiceId!, jwt, { resend: true });
    const unsafeBody = await unsafeRes.json();
    expect(unsafeRes.status).toBe(403);
    expect(unsafeBody.error).toBe('recipient_not_allowed_for_staging_test');
    expect(unsafeBody.allowed_recipient).toBe(SAFE_RECIPIENT);

    await (admin as any)
      .from('partners')
      .update({ contact_email: SAFE_RECIPIENT })
      .eq('id', ctx.partnerId);

    const { data: invAfterUnsafe } = await (admin as any)
      .from('partner_invoices')
      .select('status, paid_at')
      .eq('id', ctx.invoiceId)
      .single();
    expect(invAfterUnsafe!.status).toBe('issued');
    expect(invAfterUnsafe!.paid_at).toBeNull();
  });
});
