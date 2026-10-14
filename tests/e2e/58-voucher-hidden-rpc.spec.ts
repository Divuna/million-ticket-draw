/**
 * Spec 58 - hidden voucher RPC guard
 *
 * Staging-only backend regression test. It creates a hidden voucher with valid
 * inventory, signs in as a customer, and calls buy_voucher_atomic directly.
 * The RPC must reject hidden vouchers even when the caller knows the voucher id.
 */

import { test, expect } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const isStaging =
  SUPABASE_URL.includes(STAGING_REF) && !!SUPABASE_ANON && !!SERVICE_ROLE;

const RUN_ID = Date.now();
const CUSTOMER_EMAIL = `spec58-customer-${RUN_ID}@onemil.cz`;
const PASSWORD = `Spec58!${RUN_ID}x`;
const VOUCHER_NAME = `E2E Spec58 Hidden Voucher ${RUN_ID}`;
const VOUCHER_CODE = `SPEC58-HIDDEN-${RUN_ID}`;

const ctx: {
  customerAuthId?: string;
  voucherId?: string;
  voucherCodeId?: string;
} = {};

function makeAdmin(): SupabaseClient<Database> {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function makeAnon(): SupabaseClient<Database> {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function setupData(): Promise<void> {
  const admin = makeAdmin();

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: CUSTOMER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError) throw new Error(`createUser(customer): ${userError.message}`);
  ctx.customerAuthId = userData.user.id;

  const { error: publicUserError } = await admin
    .from('users')
    .upsert({ id: ctx.customerAuthId, email: CUSTOMER_EMAIL, role: 'user' }, { onConflict: 'id' });
  if (publicUserError) throw new Error(`public.users upsert: ${publicUserError.message}`);

  const { error: walletError } = await admin
    .from('wallets')
    .upsert({ user_id: ctx.customerAuthId, balance_coins: 100 }, { onConflict: 'user_id' });
  if (walletError) throw new Error(`wallets upsert: ${walletError.message}`);

  const { data: voucher, error: voucherError } = await admin
    .from('vouchers')
    .insert({
      name: VOUCHER_NAME,
      image_url: 'https://example.invalid/spec58-hidden-voucher.png',
      is_public: false,
      max_quantity: 1,
      redeemed_count: 0,
      start_date: new Date(Date.now() - 60_000).toISOString(),
      end_date: new Date(Date.now() + 3_600_000).toISOString(),
    })
    .select('id')
    .single();
  if (voucherError) throw new Error(`vouchers insert: ${voucherError.message}`);
  ctx.voucherId = voucher.id as string;

  const { data: voucherCode, error: codeError } = await admin
    .from('voucher_codes')
    .insert({
      voucher_id: ctx.voucherId,
      code: VOUCHER_CODE,
      status: 'available',
    })
    .select('id')
    .single();
  if (codeError) throw new Error(`voucher_codes insert: ${codeError.message}`);
  ctx.voucherCodeId = voucherCode.id as string;
}

async function cleanupData(): Promise<void> {
  const admin = makeAdmin();

  if (ctx.voucherId) {
    await admin.from('wallet_transactions').delete().eq('reference_id', ctx.voucherId);
    await admin.from('user_vouchers').delete().eq('voucher_id', ctx.voucherId);
    await admin.from('voucher_codes').delete().eq('voucher_id', ctx.voucherId);
    await admin.from('vouchers').delete().eq('id', ctx.voucherId);
  }

  if (ctx.customerAuthId) {
    await admin.from('wallets').delete().eq('user_id', ctx.customerAuthId);
    await admin.from('users').delete().eq('id', ctx.customerAuthId);
    await admin.auth.admin.deleteUser(ctx.customerAuthId).catch(() => undefined);
  }
}

async function customerClient(): Promise<SupabaseClient<Database>> {
  const client = makeAnon();
  const { error } = await client.auth.signInWithPassword({
    email: CUSTOMER_EMAIL,
    password: PASSWORD,
  });
  if (error) throw new Error(`customer signIn: ${error.message}`);
  return client;
}

test.describe.serial('58 - buy_voucher_atomic hidden voucher guard', () => {
  test.skip(
    !isStaging,
    'staging-only - requires VITE_SUPABASE_URL (staging), VITE_SUPABASE_ANON_KEY, E2E_SUPABASE_SERVICE_ROLE_KEY',
  );

  test.beforeAll(async () => {
    await setupData();
  });

  test.afterAll(async () => {
    await cleanupData();
  });

  test('rejects a direct RPC purchase for a hidden voucher with available code inventory', async () => {
    const admin = makeAdmin();
    const customer = await customerClient();

    const { data: walletBefore, error: walletBeforeError } = await admin
      .from('wallets')
      .select('balance_coins')
      .eq('user_id', ctx.customerAuthId)
      .single();
    expect(walletBeforeError, `wallet before: ${walletBeforeError?.message}`).toBeNull();

    const { data: result, error: rpcError } = await customer.rpc('buy_voucher_atomic', {
      p_user_id: ctx.customerAuthId,
      p_voucher_id: ctx.voucherId,
    });

    expect(rpcError, `buy_voucher_atomic transport error: ${rpcError?.message}`).toBeNull();
    expect(result?.success, `Hidden voucher purchase must fail: ${JSON.stringify(result)}`).toBe(false);
    expect(String(result?.error ?? '')).toMatch(/dostup|available/i);

    const { data: walletAfter, error: walletAfterError } = await admin
      .from('wallets')
      .select('balance_coins')
      .eq('user_id', ctx.customerAuthId)
      .single();
    expect(walletAfterError, `wallet after: ${walletAfterError?.message}`).toBeNull();
    expect(walletAfter.balance_coins).toBe(walletBefore.balance_coins);

    const { count: purchaseCount, error: purchaseCountError } = await admin
      .from('user_vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.customerAuthId)
      .eq('voucher_id', ctx.voucherId)
      .eq('redeemed', true);
    expect(purchaseCountError, `user_vouchers count: ${purchaseCountError?.message}`).toBeNull();
    expect(purchaseCount).toBe(0);

    const { data: codeAfter, error: codeAfterError } = await admin
      .from('voucher_codes')
      .select('status, issued_to_user_id, issued_user_voucher_id')
      .eq('id', ctx.voucherCodeId)
      .single();
    expect(codeAfterError, `voucher code after: ${codeAfterError?.message}`).toBeNull();
    expect(codeAfter.status).toBe('available');
    expect(codeAfter.issued_to_user_id).toBeNull();
    expect(codeAfter.issued_user_voucher_id).toBeNull();
  });
});
