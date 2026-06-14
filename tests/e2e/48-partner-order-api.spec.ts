/**
 * Spec 48 — Partner API order reward flow (existing-system implementation)
 *
 * Staging-only, self-contained backend/integration spec. Exercises the real
 * existing-system RPCs introduced by the Partner API order flow:
 *   - create_partner_order_reward         (service_role only)
 *   - update_partner_order_reward_status  (service_role only)
 *   - redeem_miocoin_code                 (authenticated customer)
 *
 * It proves the implementation reuses the existing system (partner_reward_codes,
 * partner_coin_activations, redeem_miocoin_code) and that NO new endpoint/table
 * is involved. Service role is used ONLY to create/clean a throwaway approved
 * partner + customer auth user and to drive the partner-side RPCs (which a real
 * partner reaches via the partner-activate Edge Function).
 *
 * Required env vars (present in playwright-staging.yml):
 *   VITE_SUPABASE_URL            — must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *
 * Verifies:
 *   48a) create order reward → status `pending`, OneMil-calculated coins
 *   48b) duplicate order (same external_order_id) → SAME code, no second row
 *   48c) `pending` reward cannot be redeemed
 *   48d) NO invoice / activation (billing) during order creation
 *   48e) `paid` order status → reward moves to `issued`
 *   48f) `issued` reward can be redeemed → wallet credited, activation row appears
 *   48g) `cancelled` reward cannot be redeemed
 *
 * Cleanup: deletes all created rows + auth users in afterAll, even on failure.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF   = 'dxmowysntemfqfnanxua';
const SUPABASE_URL  = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE  = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const RUN_ID = Date.now();
const PARTNER_EMAIL  = `spec48-partner-${RUN_ID}@onemil.cz`;
const CUSTOMER_EMAIL = `spec48-customer-${RUN_ID}@onemil.cz`;
const PASSWORD = `Spec48!${RUN_ID}x`;

// Conversion: 100 Kč = 1 MioCoin. Order 250 Kč → floor(250/100*1) = 2 coins.
const REWARD_BASE_CZK = 100;
const REWARD_MC = 1;
const ORDER_TOTAL = 250;
const EXPECTED_COINS = 2;

const ORDER_HAPPY  = `SPEC48-ORDER-HAPPY-${RUN_ID}`;
const ORDER_CANCEL = `SPEC48-ORDER-CANCEL-${RUN_ID}`;

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!SUPABASE_ANON && !!SERVICE_ROLE;

function makeAdmin(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ctx: { partnerAuthId?: string; customerAuthId?: string; partnerId?: string } = {};

async function setupData(): Promise<void> {
  const admin = makeAdmin();

  // Partner auth user (partners.auth_user_id FK target)
  const { data: pu, error: puErr } = await admin.auth.admin.createUser({
    email: PARTNER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (puErr) throw new Error(`createUser(partner): ${puErr.message}`);
  ctx.partnerAuthId = pu.user.id;

  // Customer auth user — its auth email must match the reward's customer_email
  const { data: cu, error: cuErr } = await admin.auth.admin.createUser({
    email: CUSTOMER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (cuErr) throw new Error(`createUser(customer): ${cuErr.message}`);
  ctx.customerAuthId = cu.user.id;

  // Approved partner with explicit conversion settings
  const { data: p, error: pErr } = await (admin as any)
    .from('partners')
    .insert({
      name: `E2E Spec48 Partner ${RUN_ID}`,
      company_name: `E2E Spec48 Partner ${RUN_ID} s.r.o.`,
      logo_url: 'https://example.invalid/spec48-logo.png',
      website_url: 'https://example.invalid/spec48',
      contact_email: PARTNER_EMAIL,
      auth_user_id: ctx.partnerAuthId,
      status: 'approved',
      approved_at: new Date().toISOString(),
      reward_base_czk: REWARD_BASE_CZK,
      reward_mc: REWARD_MC,
    })
    .select('id')
    .single();
  if (pErr) throw new Error(`partners insert: ${pErr.message}`);
  ctx.partnerId = p.id as string;
}

async function cleanupData(): Promise<void> {
  const admin = makeAdmin();
  if (ctx.partnerId) {
    await (admin as any).from('partner_coin_activations').delete().eq('partner_id', ctx.partnerId);
    await (admin as any).from('partner_reward_codes').delete().eq('partner_id', ctx.partnerId);
    await (admin as any).from('partner_invoices').delete().eq('partner_id', ctx.partnerId);
  }
  if (ctx.customerAuthId) {
    await (admin as any).from('wallet_transactions').delete().eq('user_id', ctx.customerAuthId);
    await (admin as any).from('wallets').delete().eq('user_id', ctx.customerAuthId);
    await admin.auth.admin.deleteUser(ctx.customerAuthId).catch(() => undefined);
  }
  if (ctx.partnerAuthId) {
    await admin.auth.admin.deleteUser(ctx.partnerAuthId).catch(() => undefined);
  }
}

/** Sign in as the customer and return an authenticated client. */
async function customerClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: CUSTOMER_EMAIL,
    password: PASSWORD,
  });
  if (error) throw new Error(`customer signIn: ${error.message}`);
  return client;
}

test.describe.serial('48 — Partner API order reward flow (existing system)', () => {
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

  test('48a–48d: create reward, duplicate idempotency, pending cannot redeem, no billing on create', async () => {
    const admin = makeAdmin();

    // 48a: create order reward → pending, OneMil-calculated coins
    const { data: created, error: createErr } = await admin.rpc('create_partner_order_reward', {
      p_partner_id: ctx.partnerId,
      p_external_order_id: ORDER_HAPPY,
      p_order_total_czk: ORDER_TOTAL,
      p_customer_email: CUSTOMER_EMAIL,
      p_metadata: { spec: '48' },
    });
    expect(createErr, `create_partner_order_reward error: ${createErr?.message}`).toBeNull();
    expect(created?.success, `create failed: ${JSON.stringify(created)}`).toBe(true);
    expect(created.status).toBe('pending');
    expect(created.coins).toBe(EXPECTED_COINS);
    expect(created.duplicate).toBe(false);
    const code: string = created.code;
    expect(code, 'a reward code must be returned').toBeTruthy();

    // 48b: duplicate order (same external_order_id) → SAME code, flagged duplicate
    const { data: dup, error: dupErr } = await admin.rpc('create_partner_order_reward', {
      p_partner_id: ctx.partnerId,
      p_external_order_id: ORDER_HAPPY,
      p_order_total_czk: ORDER_TOTAL,
      p_customer_email: CUSTOMER_EMAIL,
      p_metadata: { spec: '48-dup' },
    });
    expect(dupErr, `duplicate error: ${dupErr?.message}`).toBeNull();
    expect(dup?.success).toBe(true);
    expect(dup.duplicate).toBe(true);
    expect(dup.code).toBe(code);

    // Exactly one code row exists for this order
    const { count: codeCount } = await (admin as any)
      .from('partner_reward_codes')
      .select('code', { count: 'exact', head: true })
      .eq('partner_id', ctx.partnerId)
      .eq('external_order_id', ORDER_HAPPY);
    expect(codeCount, 'duplicate must not create a second code row').toBe(1);

    // 48d: NO billing artifacts during order creation
    const { count: invoiceCount } = await (admin as any)
      .from('partner_invoices')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', ctx.partnerId);
    expect(invoiceCount, 'no invoice may be created during order creation').toBe(0);

    const { count: activationCount } = await (admin as any)
      .from('partner_coin_activations')
      .select('id', { count: 'exact', head: true })
      .eq('code', code);
    expect(activationCount, 'no activation (billing) row before redemption').toBe(0);

    // 48c: pending reward cannot be redeemed
    const customer = await customerClient();
    const { data: redeemPending, error: redeemPendingErr } =
      await customer.rpc('redeem_miocoin_code', { p_code: code });
    expect(redeemPendingErr, `redeem rpc transport error: ${redeemPendingErr?.message}`).toBeNull();
    expect(redeemPending?.success).toBe(false);
    expect(redeemPending?.error).toBe('pending');
  });

  test('48e–48f: paid → issued, issued can be redeemed, billing activation appears', async () => {
    const admin = makeAdmin();

    // 48e: paid order status → reward moves to issued
    const { data: paid, error: paidErr } = await admin.rpc('update_partner_order_reward_status', {
      p_partner_id: ctx.partnerId,
      p_external_order_id: ORDER_HAPPY,
      p_order_status: 'paid',
    });
    expect(paidErr, `update status error: ${paidErr?.message}`).toBeNull();
    expect(paid?.success).toBe(true);
    expect(paid.status).toBe('issued');
    const code: string = paid.code;

    // 48f: issued reward can be redeemed → wallet credited
    const customer = await customerClient();
    const { data: redeemed, error: redeemErr } =
      await customer.rpc('redeem_miocoin_code', { p_code: code });
    expect(redeemErr, `redeem error: ${redeemErr?.message}`).toBeNull();
    expect(redeemed?.success, `redeem failed: ${JSON.stringify(redeemed)}`).toBe(true);
    expect(redeemed.coins).toBe(EXPECTED_COINS);
    expect(Number(redeemed.new_balance)).toBeGreaterThanOrEqual(EXPECTED_COINS);

    // Code is now activated
    const { data: codeRow } = await (admin as any)
      .from('partner_reward_codes')
      .select('status')
      .eq('code', code)
      .single();
    expect(codeRow?.status).toBe('activated');

    // Billing activation row now exists (created by existing trigger at redemption)
    const { count: activationCount } = await (admin as any)
      .from('partner_coin_activations')
      .select('id', { count: 'exact', head: true })
      .eq('code', code);
    expect(activationCount, 'activation (billing) row appears only after redemption').toBe(1);
  });

  test('48g: cancelled reward cannot be redeemed', async () => {
    const admin = makeAdmin();

    // Create a second order, then cancel it
    const { data: created, error: createErr } = await admin.rpc('create_partner_order_reward', {
      p_partner_id: ctx.partnerId,
      p_external_order_id: ORDER_CANCEL,
      p_order_total_czk: ORDER_TOTAL,
      p_customer_email: CUSTOMER_EMAIL,
      p_metadata: { spec: '48-cancel' },
    });
    expect(createErr, `create(cancel) error: ${createErr?.message}`).toBeNull();
    expect(created?.success).toBe(true);
    const code: string = created.code;

    const { data: cancelled, error: cancelErr } = await admin.rpc('update_partner_order_reward_status', {
      p_partner_id: ctx.partnerId,
      p_external_order_id: ORDER_CANCEL,
      p_order_status: 'cancelled',
    });
    expect(cancelErr, `cancel error: ${cancelErr?.message}`).toBeNull();
    expect(cancelled?.success).toBe(true);
    expect(cancelled.status).toBe('cancelled');

    // Cancelled reward cannot be redeemed
    const customer = await customerClient();
    const { data: redeem, error: redeemErr } =
      await customer.rpc('redeem_miocoin_code', { p_code: code });
    expect(redeemErr, `redeem rpc transport error: ${redeemErr?.message}`).toBeNull();
    expect(redeem?.success).toBe(false);
    expect(redeem?.error).toBe('cancelled');
  });
});
