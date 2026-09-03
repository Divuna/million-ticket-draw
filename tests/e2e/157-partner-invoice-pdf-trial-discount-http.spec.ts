/**
 * Spec 157 — generate-partner-invoice-pdf HTTP contract for the Fáze 3
 * zahajovací sleva (trial discount), using REAL authenticated user JWTs.
 *
 * Staging-only, self-contained, backend-only (no browser).
 *
 * WHY THIS SPEC EXISTS: the Fáze 1–4 pre-production audit could not exercise
 * this Edge Function over real HTTP because (a) creating a brand-new test
 * user via `/auth/v1/signup` hits Supabase's built-in Auth SMTP
 * `429 over_email_send_rate_limit` on staging (pre-existing, documented,
 * unrelated to Fáze 1–4), and (b) a manually SQL-inserted `auth.users` row
 * cannot complete a normal password-grant login (GoTrue
 * `500 Database error querying schema`, confirmed independent of password
 * correctness).
 *
 * NO SHARED ACCOUNT'S PERMISSIONS ARE EVER CHANGED BY THIS SPEC:
 *   - E2E_TEST_EMAIL / E2E_TEST_PASSWORD (a plain, already-existing customer
 *     account) is used ONLY for the negative test. Its `user_roles` row is
 *     never read, inserted, updated or deleted here.
 *   - E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD is a SEPARATE,
 *     pre-existing staging account (`superadmin-e2e@onemil.cz` by default)
 *     that already permanently holds `user_roles.role='superadmin'` for
 *     reasons entirely unrelated to this spec. This spec only signs in with
 *     its existing password — it never grants, revokes or otherwise touches
 *     any role anywhere.
 *
 * The PDF Edge Function's own authorization model (see
 * supabase/functions/generate-partner-invoice-pdf/index.ts,
 * authorizeRequest()) is flat and global: internal token, OR service-role
 * bearer, OR any authenticated JWT belonging to a `user_roles.role =
 * 'superadmin'` account — there is no per-partner ownership check. A normal
 * partner account therefore cannot call this EF for its own invoice at all
 * (partners read their PDFs via a signed URL created by admin action, never
 * by calling this function directly) — the only "legitimate" positive path
 * for this exact endpoint is a superadmin identity, which is what
 * E2E_SUPERADMIN_EMAIL already, permanently, and independently of this
 * spec, is.
 *
 * Service role (`E2E_SUPABASE_SERVICE_ROLE_KEY`) is used ONLY to create and
 * remove an isolated test partner + trial-window activations + invoices
 * (fixture setup, exactly like specs 43/44). It is never sent as the
 * Authorization bearer to the Edge Function under test.
 *
 * Required env vars (present in playwright-staging.yml):
 *   VITE_SUPABASE_URL             — must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD             — plain customer (negative test)
 *   E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD — pre-existing superadmin (positive tests)
 *
 * Invariants verified:
 *   157a) a real, ordinary authenticated JWT (E2E_TEST_EMAIL, never
 *         superadmin, role untouched by this spec) is denied (401/403) when
 *         requesting a partner invoice it has no relation to — "neoprávněný
 *         uživatel nedostane cizí fakturu".
 *   157b) a real superadmin JWT (pre-existing E2E_SUPERADMIN_EMAIL, role
 *         never modified by this spec) gets 200, PDF generated (storage
 *         object downloadable, starts with %PDF), trial_discount_rendered
 *         =true, and the 5 MC partial-discount invoice shows free=2/billable=3.
 *   157c) same superadmin session, 0 Kč invoice (2 MC == free cap): 200,
 *         trial_discount_rendered=true, invoice amount_gross=0.00.
 *
 * Neither password is ever logged: only process.env.E2E_TEST_PASSWORD /
 * E2E_SUPERADMIN_PASSWORD are read and passed straight into
 * signInWithPassword(); never interpolated into a console.log/test
 * title/error message anywhere in this file.
 *
 * Cleanup (afterAll, runs even on failure): removes the two invoices
 * (cascades invoice_lines/exports), storage objects, activations, reward
 * codes and the test partner. Nothing about either E2E account is ever
 * created, modified, or restored, because nothing about them was changed.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? '';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? '';
const SUPERADMIN_EMAIL = process.env.E2E_SUPERADMIN_EMAIL ?? '';
const SUPERADMIN_PASSWORD = process.env.E2E_SUPERADMIN_PASSWORD ?? '';

const PDF_EF_URL = `${SUPABASE_URL}/functions/v1/generate-partner-invoice-pdf`;

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) &&
  !!SUPABASE_ANON && !!SERVICE_ROLE &&
  !!TEST_EMAIL && !!TEST_PASSWORD &&
  !!SUPERADMIN_EMAIL && !!SUPERADMIN_PASSWORD;

const RUN_ID = Date.now();
// Fixed, entirely-in-the-past trial window — never interacts with any real
// partner's trial.
const TRIAL_START = '2026-01-01T00:00:00+00:00';
const TRIAL_END = '2026-01-31T00:00:00+00:00';

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
  if (error || !data.session?.access_token) {
    throw new Error(`sign-in failed for the configured account: ${error?.message ?? 'no session'}`);
  }
  return data.session.access_token;
}

async function callPdfEf(invoiceId: string, jwt: string): Promise<Response> {
  return fetch(PDF_EF_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ invoice_id: invoiceId }),
  });
}

async function expectPdfObjectExists(admin: SupabaseClient, storagePath: string): Promise<void> {
  expect(storagePath).toBeTruthy();
  const { data, error } = await admin.storage.from('partner-invoices').download(storagePath);
  expect(error).toBeNull();
  expect(data).toBeTruthy();
  const head = new Uint8Array((await data!.arrayBuffer()).slice(0, 4));
  expect(String.fromCharCode(...head)).toBe('%PDF');
}

interface Ctx {
  partnerId: string;
  discountInvoiceId: string;
  zeroInvoiceId: string;
  discountStoragePath: string | null;
  zeroStoragePath: string | null;
}
const ctx: Partial<Ctx> = { discountStoragePath: null, zeroStoragePath: null };

test.describe.serial('157 — generate-partner-invoice-pdf trial discount (real user JWTs, staging)', () => {
  test.skip(
    !isStaging,
    'staging-only — requires staging VITE_SUPABASE_URL, anon key, service role key, E2E_TEST_EMAIL/PASSWORD and E2E_SUPERADMIN_EMAIL/PASSWORD',
  );

  test.beforeAll(async () => {
    const admin = makeAdmin();

    // Isolated test partner, unrelated to any real partner or to either
    // E2E account used below, with a fixed, past trial window.
    const { data: partner, error: partnerErr } = await (admin as any)
      .from('partners')
      .insert({
        name: `E2E Spec157 Partner ${RUN_ID}`,
        contact_email: `spec157-partner-${RUN_ID}@onemiltest.dev`,
        logo_url: 'https://example.invalid/spec157.png',
        website_url: 'https://example.invalid/spec157',
        status: 'approved',
        approved_at: new Date().toISOString(),
        price_per_coin: 1,
        vat_rate: 0.21,
        trial_started_at: TRIAL_START,
        trial_ends_at: TRIAL_END,
      })
      .select('id')
      .single();
    if (partnerErr) throw new Error(`partner insert: ${partnerErr.message}`);
    ctx.partnerId = partner.id as string;

    // A throwaway auth user id is needed only as the FK target on
    // partner_coin_activations.user_id (reporting metadata, not an
    // authorization boundary for this EF). Reuse the service-role
    // connection's own lookup of the superadmin test account's id — it
    // already exists and logging in as it is exercised anyway in 157b/157c,
    // so no new account is created for this either.
    const { data: saUser, error: saLookupErr } = await (admin as any).auth.admin.listUsers();
    if (saLookupErr) throw new Error(`listUsers: ${saLookupErr.message}`);
    const activationUserId = saUser.users.find((u: any) => u.email === SUPERADMIN_EMAIL)?.id;
    if (!activationUserId) throw new Error('E2E_SUPERADMIN_EMAIL account not found on staging');

    // Two reward codes + activations inside the trial window:
    //   - 5 MC on 2026-01-15 -> free=2 (cap), billable=3 (partial discount)
    //   - 2 MC on 2026-01-01 -> free=2, billable=0 (0 Kč invoice)
    const codes = [
      { code: `SPEC157-5MC-${RUN_ID}`, coins: 5, activatedAt: '2026-01-15T12:00:00+00:00' },
      { code: `SPEC157-2MC-${RUN_ID}`, coins: 2, activatedAt: '2026-01-01T00:00:00+00:00' },
    ];
    for (const c of codes) {
      const { error: rcErr } = await (admin as any).from('partner_reward_codes').insert({
        code: c.code,
        partner_id: ctx.partnerId,
        coins: c.coins,
        status: 'activated',
        issued_at: '2025-12-01T00:00:00+00:00',
        activated_at: c.activatedAt,
        activated_by_user_id: activationUserId,
        issued_to_customer_at: '2025-12-01T00:00:00+00:00',
      });
      if (rcErr) throw new Error(`reward code ${c.code}: ${rcErr.message}`);

      const { error: actErr } = await (admin as any).from('partner_coin_activations').insert({
        partner_id: ctx.partnerId,
        code: c.code,
        user_id: activationUserId,
        coins: c.coins,
        external_order_id: `SPEC157-ORD-${c.coins}MC-${RUN_ID}`,
        activated_at: c.activatedAt,
        invoiced: false,
      });
      if (actErr) throw new Error(`activation ${c.code}: ${actErr.message}`);
    }

    // Generate both invoices via the SAME production RPC the weekly/manual
    // invoicing pipeline uses (not a re-implementation of the math here).
    const { data: discountInvoiceId, error: genErr1 } = await (admin as any).rpc(
      'generate_partner_invoice',
      { p_partner_id: ctx.partnerId, p_period_from: '2026-01-15', p_period_to: '2026-01-15' },
    );
    if (genErr1) throw new Error(`generate_partner_invoice (5 MC): ${genErr1.message}`);
    ctx.discountInvoiceId = discountInvoiceId as string;

    const { data: zeroInvoiceId, error: genErr2 } = await (admin as any).rpc(
      'generate_partner_invoice',
      { p_partner_id: ctx.partnerId, p_period_from: '2026-01-01', p_period_to: '2026-01-01' },
    );
    if (genErr2) throw new Error(`generate_partner_invoice (0 Kč): ${genErr2.message}`);
    ctx.zeroInvoiceId = zeroInvoiceId as string;
  });

  test.afterAll(async () => {
    const admin = makeAdmin();

    for (const path of [ctx.discountStoragePath, ctx.zeroStoragePath]) {
      if (path) await admin.storage.from('partner-invoices').remove([path]).catch(() => undefined);
    }
    for (const invoiceId of [ctx.discountInvoiceId, ctx.zeroInvoiceId]) {
      if (invoiceId) await (admin as any).from('partner_invoices').delete().eq('id', invoiceId);
    }
    if (ctx.partnerId) {
      await (admin as any).from('partner_coin_activations').delete().eq('partner_id', ctx.partnerId);
      await (admin as any).from('partner_reward_codes').delete().eq('partner_id', ctx.partnerId);
      await (admin as any).from('partners').delete().eq('id', ctx.partnerId);
    }
    // Deliberately nothing here touches user_roles or either E2E account —
    // this spec never changed either of them.
  });

  test('157a: an ordinary authenticated JWT (E2E_TEST_EMAIL, role untouched) is denied — no invoice leaks to an unauthorized user', async () => {
    const jwt = await getJwt(TEST_EMAIL, TEST_PASSWORD);
    const res = await callPdfEf(ctx.discountInvoiceId!, jwt);
    expect([401, 403]).toContain(res.status);
    const body = await res.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });

  test('157b: pre-existing superadmin JWT gets 200 and correct 5 MC partial-discount PDF contract', async () => {
    const admin = makeAdmin();
    const jwt = await getJwt(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);

    const res = await callPdfEf(ctx.discountInvoiceId!, jwt);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.trial_discount_rendered).toBe(true);
    expect(body.storage_path).toBeTruthy();
    ctx.discountStoragePath = body.storage_path as string;
    await expectPdfObjectExists(admin, ctx.discountStoragePath!);

    const { data: inv } = await (admin as any)
      .from('partner_invoices')
      .select('coins_total, coins_free_total, amount_net_before_discount, discount_net, amount_net, vat_amount, amount_gross')
      .eq('id', ctx.discountInvoiceId)
      .single();
    expect(Number(inv!.coins_total)).toBe(5);
    expect(Number(inv!.coins_free_total)).toBe(2); // free cap, not the full 5
    expect(Number(inv!.amount_net_before_discount)).toBe(5);
    expect(Number(inv!.discount_net)).toBe(2);
    expect(Number(inv!.amount_net)).toBe(3); // billable = 5 - 2
    expect(Number(inv!.vat_amount)).toBe(0.63);
    expect(Number(inv!.amount_gross)).toBe(3.63);
  });

  test('157c: same superadmin session, 0 Kč invoice (2 MC == free cap) renders 200 with zero amounts', async () => {
    const admin = makeAdmin();
    const jwt = await getJwt(SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD);

    const res = await callPdfEf(ctx.zeroInvoiceId!, jwt);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.trial_discount_rendered).toBe(true);
    ctx.zeroStoragePath = body.storage_path as string;
    await expectPdfObjectExists(admin, ctx.zeroStoragePath!);

    const { data: inv } = await (admin as any)
      .from('partner_invoices')
      .select('coins_total, coins_free_total, amount_net, vat_amount, amount_gross, status')
      .eq('id', ctx.zeroInvoiceId)
      .single();
    expect(Number(inv!.coins_total)).toBe(2);
    expect(Number(inv!.coins_free_total)).toBe(2);
    expect(Number(inv!.amount_net)).toBe(0);
    expect(Number(inv!.vat_amount)).toBe(0);
    expect(Number(inv!.amount_gross)).toBe(0);
    expect(inv!.status).toBe('draft'); // still a normal draft invoice, not skipped
  });
});
