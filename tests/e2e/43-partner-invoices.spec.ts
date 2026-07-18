/**
 * Spec 43 — Partner Invoice RLS visibility (migration 20260612090000_partner_invoice_rls_policies)
 *
 * Staging-only, self-contained. Service role is used ONLY for setup/cleanup.
 *
 * Required env vars (all present in playwright-staging.yml):
 *   VITE_SUPABASE_URL               — must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *
 * Setup: two partners (A, B) with auth users; one draft invoice for partner A
 * with one invoice line (via reward code + coin activation FK chain) and one
 * PDF export row with a fake private Storage path (no real PDF is generated, no email is
 * sent, nothing is marked paid).
 *
 * Invariants verified:
 *   43a) UI: partner A logs in at /partner/login and /partner/invoices shows
 *        exactly their invoice (amount visible, PDF link present)
 *   43b) UI: partner B logs in and /partner/invoices shows the empty state —
 *        partner A's invoice is NOT visible
 *   43c) DB/PostgREST as partner A: sees exactly 1 own invoice, 1 export, 1 line
 *   43d) DB/PostgREST as partner B: sees 0 invoices, 0 exports, 0 lines
 *
 * Cleanup: deletes invoice (cascades exports), lines, activation, reward code,
 * both partners and both auth users. Runs in afterAll even on failure.
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// ─── Constants ────────────────────────────────────────────────────────────────

const STAGING_REF  = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const INTERNAL_TOKEN = process.env.INTERNAL_FUNCTION_TOKEN ?? '';
const PDF_OVERVIEW_ENABLED = process.env.E2E_PARTNER_INVOICES === '1';

const RUN_ID = Date.now();
const PARTNER_A_EMAIL = `spec43-partner-a-${RUN_ID}@onemil.cz`;
const PARTNER_B_EMAIL = `spec43-partner-b-${RUN_ID}@onemil.cz`;
const PASSWORD = `Spec43!${RUN_ID}x`;
const REWARD_CODE = `SPEC43-${RUN_ID}`;
// Distinctive gross amount so the UI assertion cannot match anything else
const AMOUNT_NET = 100.0;
const VAT_AMOUNT = 21.0;
const AMOUNT_GROSS = 121.0;

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!SUPABASE_ANON && !!SERVICE_ROLE;

// ─── Service-role helpers (setup/cleanup only) ───────────────────────────────

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

interface Ctx {
  authA: string;
  authB: string;
  partnerA: string;
  partnerB: string;
  activationId: string;
  invoiceId: string;
}

const ctx: Partial<Ctx> = {};

async function createPartnerWithUser(
  admin: SupabaseClient,
  email: string,
  label: string,
): Promise<{ authUserId: string; partnerId: string }> {
  const { data: u, error: uErr } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (uErr) throw new Error(`createUser ${label}: ${uErr.message}`);

  const { data: p, error: pErr } = await (admin as any)
    .from('partners')
    .insert({
      name: `E2E Spec43 ${label} ${RUN_ID}`,
      company_name: `E2E Spec43 ${label} s.r.o.`,
      logo_url: 'https://example.invalid/spec43-logo.png',
      website_url: 'https://example.invalid/spec43',
      contact_email: email,
      auth_user_id: u.user.id,
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`partners insert ${label}: ${pErr.message}`);

  return { authUserId: u.user.id, partnerId: p.id as string };
}

async function setupData(): Promise<void> {
  const admin = makeAdmin();

  const a = await createPartnerWithUser(admin, PARTNER_A_EMAIL, 'Partner A');
  const b = await createPartnerWithUser(admin, PARTNER_B_EMAIL, 'Partner B');
  ctx.authA = a.authUserId;
  ctx.authB = b.authUserId;
  ctx.partnerA = a.partnerId;
  ctx.partnerB = b.partnerId;

  // FK chain for an invoice line: reward code -> coin activation
  const { error: codeErr } = await (admin as any)
    .from('partner_reward_codes')
    .insert({
      code: REWARD_CODE,
      partner_id: a.partnerId,
      coins: 5,
      status: 'activated',
      activated_at: new Date().toISOString(),
    });
  if (codeErr) throw new Error(`reward code insert: ${codeErr.message}`);

  const { data: act, error: actErr } = await (admin as any)
    .from('partner_coin_activations')
    .insert({
      partner_id: a.partnerId,
      code: REWARD_CODE,
      user_id: a.authUserId,
      coins: 5,
      invoiced: true,
    })
    .select('id')
    .single();
  if (actErr) throw new Error(`activation insert: ${actErr.message}`);
  ctx.activationId = act.id as string;

  // Draft invoice for partner A — stays 'draft', never marked paid
  const { data: inv, error: invErr } = await (admin as any)
    .from('partner_invoices')
    .insert({
      partner_id: a.partnerId,
      period_start: '2026-06-01',
      period_end: '2026-06-07',
      period_from: '2026-06-01',
      period_to: '2026-06-07',
      coins_total: 5,
      amount_net: AMOUNT_NET,
      vat_amount: VAT_AMOUNT,
      amount_gross: AMOUNT_GROSS,
      status: 'draft',
    })
    .select('id')
    .single();
  if (invErr) throw new Error(`invoice insert: ${invErr.message}`);
  ctx.invoiceId = inv.id as string;

  const { error: lineErr } = await (admin as any)
    .from('partner_invoice_lines')
    .insert({
      invoice_id: inv.id,
      activation_id: act.id,
      coins: 5,
      activated_at: new Date().toISOString(),
    });
  if (lineErr) throw new Error(`line insert: ${lineErr.message}`);

  // Fake PDF export row — no real PDF generated, no storage upload
  const { error: expErr } = await (admin as any)
    .from('partner_invoice_exports')
    .insert({
      invoice_id: inv.id,
      format: 'pdf',
      file_url: null,
      storage_bucket: 'partner-invoices',
      storage_path: `spec43/${inv.id}.pdf`,
    });
  if (expErr) throw new Error(`export insert: ${expErr.message}`);
}

async function cleanupData(): Promise<void> {
  const admin = makeAdmin();
  // Order matters: lines before activation (RESTRICT), activation before code
  // (RESTRICT); deleting the invoice cascades exports + lines.
  if (ctx.invoiceId) {
    await (admin as any).from('partner_invoices').delete().eq('id', ctx.invoiceId);
  }
  if (ctx.activationId) {
    await (admin as any).from('partner_coin_activations').delete().eq('id', ctx.activationId);
  }
  await (admin as any).from('partner_reward_codes').delete().eq('code', REWARD_CODE);
  for (const pid of [ctx.partnerA, ctx.partnerB]) {
    if (pid) await (admin as any).from('partners').delete().eq('id', pid);
  }
  for (const uid of [ctx.authA, ctx.authB]) {
    if (uid) await admin.auth.admin.deleteUser(uid).catch(() => undefined);
  }
}

// ─── UI helper ────────────────────────────────────────────────────────────────

async function loginAsPartner(page: Page, email: string): Promise<void> {
  await page.goto('/partner/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /Přihlásit se/i }).click();
  await page.waitForURL(/\/partner\/dashboard/, { timeout: 20_000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe.serial('43 — Partner invoice RLS visibility', () => {
  test.skip(
    !isStaging,
    'staging-only — requires VITE_SUPABASE_URL (staging), VITE_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY',
  );

  test.beforeAll(async () => {
    await setupData();
  });

  test.afterAll(async () => {
    await cleanupData();
  });

  test('43a: partner A sees own invoice on /partner/invoices', async ({ page }) => {
    await loginAsPartner(page, PARTNER_A_EMAIL);
    await page.goto('/partner/invoices');

    // Invoice row: gross amount + Koncept badge + PDF download link
    await expect(page.getByText('121,00 Kč')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Koncept')).toBeVisible();
    await expect(page.getByRole('link', { name: /Stáhnout/i })).toBeVisible();
    // Exactly one invoice row
    await expect(page.locator('tbody tr')).toHaveCount(1);
  });

  test('43b: partner B does NOT see partner A invoice', async ({ page }) => {
    await loginAsPartner(page, PARTNER_B_EMAIL);
    await page.goto('/partner/invoices');

    await expect(page.getByText('Zatím nemáte žádné faktury.')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('121,00 Kč')).not.toBeVisible();
  });

  test('43c: PostgREST as partner A sees own invoice, export and line', async () => {
    const client = makeAnon();
    const { error: signErr } = await client.auth.signInWithPassword({
      email: PARTNER_A_EMAIL,
      password: PASSWORD,
    });
    expect(signErr).toBeNull();

    const { data: invs, error: invErr } = await (client as any)
      .from('partner_invoices')
      .select('id, amount_gross, status');
    expect(invErr).toBeNull();
    expect(invs).toHaveLength(1);
    expect(invs![0].id).toBe(ctx.invoiceId);

    const { data: exps, error: expErr } = await (client as any)
      .from('partner_invoice_exports')
      .select('invoice_id, format, file_url, storage_bucket, storage_path');
    expect(expErr).toBeNull();
    expect(exps).toHaveLength(1);
    expect(exps![0].invoice_id).toBe(ctx.invoiceId);
    expect(exps![0].file_url).toBeNull();
    expect(exps![0].storage_bucket).toBe('partner-invoices');

    const { data: lines, error: lineErr } = await (client as any)
      .from('partner_invoice_lines')
      .select('invoice_id, coins');
    expect(lineErr).toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines![0].invoice_id).toBe(ctx.invoiceId);

    await client.auth.signOut();
  });

  test('43d: PostgREST as partner B sees nothing', async () => {
    const client = makeAnon();
    const { error: signErr } = await client.auth.signInWithPassword({
      email: PARTNER_B_EMAIL,
      password: PASSWORD,
    });
    expect(signErr).toBeNull();

    for (const table of [
      'partner_invoices',
      'partner_invoice_exports',
      'partner_invoice_lines',
    ]) {
      const { data, error } = await (client as any).from(table).select('*');
      expect(error, `${table} select should not error`).toBeNull();
      expect(data, `${table} must be empty for partner B`).toHaveLength(0);
    }

    await client.auth.signOut();
  });
});

async function callGeneratePdf(invoiceId: string) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-partner-invoice-pdf`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      'Content-Type': 'application/json',
      'x-internal-token': INTERNAL_TOKEN,
    },
    body: JSON.stringify({ invoice_id: invoiceId }),
  });

  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function cleanupPdfOverviewData(
  admin: SupabaseClient,
  ids: {
    partnerId?: string;
    authUserId?: string;
    invoiceId?: string;
    rewardCodes: string[];
    activationIds: string[];
    pdfPath?: string;
  },
) {
  if (ids.pdfPath) {
    await (admin as any).storage.from('partner-invoices').remove([ids.pdfPath]);
  }
  if (ids.invoiceId) {
    await (admin as any).from('partner_invoice_exports').delete().eq('invoice_id', ids.invoiceId);
    await (admin as any).from('partner_invoice_lines').delete().eq('invoice_id', ids.invoiceId);
    await (admin as any).from('partner_invoices').delete().eq('id', ids.invoiceId);
  }
  if (ids.activationIds.length > 0) {
    await (admin as any).from('partner_coin_activations').delete().in('id', ids.activationIds);
  }
  if (ids.rewardCodes.length > 0) {
    await (admin as any).from('partner_reward_codes').delete().in('code', ids.rewardCodes);
  }
  if (ids.partnerId) {
    await (admin as any).from('partners').delete().eq('id', ids.partnerId);
  }
  if (ids.authUserId) {
    await admin.auth.admin.deleteUser(ids.authUserId).catch(() => undefined);
  }
}

test.describe('43e — Partner invoice PDF overview lines', () => {
  test.beforeEach(() => {
    if (
      !PDF_OVERVIEW_ENABLED ||
      !SUPABASE_URL.includes(STAGING_REF) ||
      !SUPABASE_ANON ||
      !INTERNAL_TOKEN ||
      !SERVICE_ROLE
    ) {
      test.skip(
        true,
        'staging-only opt-in — requires E2E_PARTNER_INVOICES=1 and staging Supabase/function env',
      );
    }
  });

  test('43e: PDF activation overview total matches invoice-linked lines only', async () => {
    test.setTimeout(90_000);
    const admin = makeAdmin();
    const unique = Date.now();
    const periodFrom = '2020-03-02';
    const periodTo = '2020-03-08';
    const ids: {
      partnerId?: string;
      authUserId?: string;
      invoiceId?: string;
      rewardCodes: string[];
      activationIds: string[];
      pdfPath?: string;
    } = { rewardCodes: [], activationIds: [] };

    try {
      const { data: authUser, error: authUserError } = await admin.auth.admin.createUser({
        email: `spec43-invoice-${unique}@onemil.cz`,
        password: `Spec43Invoice${unique}!`,
        email_confirm: true,
      });
      expect(authUserError).toBeNull();
      expect(authUser.user).toBeTruthy();
      ids.authUserId = authUser.user!.id;

      const { data: partner, error: partnerError } = await (admin as any)
        .from('partners')
        .insert({
          name: `Spec43 Invoice Partner ${unique}`,
          company_name: `Spec43 Invoice Partner ${unique} s.r.o.`,
          contact_email: 'eshop@onemil.cz',
          website_url: 'https://spec43.example.test',
          logo_url: '',
          auth_user_id: authUser.user!.id,
          status: 'approved',
          approved_at: new Date().toISOString(),
          price_per_coin: 1,
          vat_rate: 0,
          billing_street: 'Testovaci 43',
          billing_city: 'Praha',
          billing_zip: '11000',
          billing_country: 'CZ',
        })
        .select('id')
        .single();
      expect(partnerError).toBeNull();
      ids.partnerId = partner.id;

      const rewardRows = [
        {
          code: `S43A${String(unique).slice(-8)}`,
          partner_id: partner.id,
          coins: 5,
          status: 'activated',
          external_order_id: `SPEC43-CAPTURED-${unique}`,
          issued_to_email: 'eshop@onemil.cz',
          customer_email: 'eshop@onemil.cz',
        },
        {
          code: `S43B${String(unique).slice(-8)}`,
          partner_id: partner.id,
          coins: 10,
          status: 'activated',
          external_order_id: `SPEC43-PREINVOICED-${unique}`,
          issued_to_email: 'eshop@onemil.cz',
          customer_email: 'eshop@onemil.cz',
        },
      ];
      ids.rewardCodes = rewardRows.map((row) => row.code);

      const { error: rewardError } = await (admin as any)
        .from('partner_reward_codes')
        .insert(rewardRows);
      expect(rewardError).toBeNull();

      const activationRows = [
        {
          partner_id: partner.id,
          code: rewardRows[0].code,
          coins: 5,
          user_id: authUser.user!.id,
          external_order_id: rewardRows[0].external_order_id,
          activated_at: `${periodFrom}T10:00:00.000Z`,
          invoiced: false,
        },
        {
          partner_id: partner.id,
          code: rewardRows[1].code,
          coins: 10,
          user_id: authUser.user!.id,
          external_order_id: rewardRows[1].external_order_id,
          activated_at: `${periodFrom}T11:00:00.000Z`,
          invoiced: true,
        },
      ];

      const { data: activations, error: activationError } = await (admin as any)
        .from('partner_coin_activations')
        .insert(activationRows)
        .select('id,coins,invoiced');
      expect(activationError).toBeNull();
      ids.activationIds = activations.map((row: any) => row.id);

      const { error: rpcError } = await (admin as any).rpc('create_partner_invoices_for_period', {
        p_period_from: periodFrom,
        p_period_to: periodTo,
      });
      expect(rpcError).toBeNull();

      const { data: invoice, error: invoiceError } = await (admin as any)
        .from('partner_invoices')
        .select('id,coins_total,coins_activated')
        .eq('partner_id', partner.id)
        .eq('period_start', periodFrom)
        .eq('period_end', periodTo)
        .single();
      expect(invoiceError).toBeNull();
      ids.invoiceId = invoice.id;
      expect(Number(invoice.coins_total)).toBe(5);
      expect(Number(invoice.coins_activated)).toBe(5);

      const { data: lines, error: linesError } = await (admin as any)
        .from('partner_invoice_lines')
        .select('activation_id,coins,external_order_id')
        .eq('invoice_id', invoice.id);
      expect(linesError).toBeNull();
      expect(lines).toHaveLength(1);
      expect(Number(lines[0].coins)).toBe(5);
      expect(lines[0].external_order_id).toBe(rewardRows[0].external_order_id);

      const { data: allActivations, error: allActivationError } = await (admin as any)
        .from('partner_coin_activations')
        .select('coins,invoiced')
        .eq('partner_id', partner.id)
        .gte('activated_at', periodFrom)
        .lt('activated_at', '2020-03-09');
      expect(allActivationError).toBeNull();
      const dateRangeCoins = allActivations.reduce(
        (sum: number, row: any) => sum + Number(row.coins),
        0,
      );
      expect(dateRangeCoins).toBe(15);

      const pdf = await callGeneratePdf(invoice.id);
      expect(pdf.status).toBe(200);
      expect(pdf.body.success).toBe(true);
      expect(pdf.body.activation_overview_source).toBe('partner_invoice_lines');
      expect(pdf.body.activation_overview_rows).toBe(1);
      expect(pdf.body.activation_overview_total_coins).toBe(5);
      expect(pdf.body.activation_overview_total_coins).toBe(Number(invoice.coins_total));
      expect(pdf.body.activation_overview_total_coins).not.toBe(dateRangeCoins);
      ids.pdfPath = pdf.body.storage_path;
    } finally {
      await cleanupPdfOverviewData(admin, ids);
    }
  });
});
