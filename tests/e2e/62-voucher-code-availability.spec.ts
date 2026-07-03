/**
 * Spec 62 - voucher availability follows voucher_codes inventory.
 *
 * Staging-only regression coverage for PR D. The public/customer catalog must
 * not show a voucher as buyable when it has no available voucher_codes row, and
 * direct RPC purchase must fail before wallet debit or code issue.
 */

import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';
import { loginViaUI } from './helpers/auth';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

const isStaging = SUPABASE_URL.includes(STAGING_REF) && Boolean(SUPABASE_ANON) && Boolean(SERVICE_ROLE);

const RUN_ID = Date.now();
const CUSTOMER_EMAIL = `spec62-customer-${RUN_ID}@onemil.cz`;
const PASSWORD = `Spec62!${RUN_ID}x`;
const EMPTY_VOUCHER_NAME = `E2E Spec62 No Code Voucher ${RUN_ID}`;
const STOCKED_VOUCHER_NAME = `E2E Spec62 Stocked Voucher ${RUN_ID}`;
const STOCKED_CODE = `SPEC62-STOCKED-${RUN_ID}`;

const ctx: {
  customerAuthId?: string;
  emptyVoucherId?: string;
  stockedVoucherId?: string;
  stockedCodeId?: string;
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

async function customerClient(): Promise<SupabaseClient<Database>> {
  const client = makeAnon();
  const { error } = await client.auth.signInWithPassword({
    email: CUSTOMER_EMAIL,
    password: PASSWORD,
  });
  if (error) throw new Error(`customer signIn: ${error.message}`);
  return client;
}

async function insertVoucher(name: string): Promise<string> {
  const { data, error } = await makeAdmin()
    .from('vouchers')
    .insert({
      name,
      image_url: `https://example.invalid/${encodeURIComponent(name)}.png`,
      banner_url: `https://example.invalid/${encodeURIComponent(name)}-banner.png`,
      is_public: true,
      max_quantity: 100,
      redeemed_count: 0,
      start_date: new Date(Date.now() - 60_000).toISOString(),
      end_date: new Date(Date.now() + 3_600_000).toISOString(),
    })
    .select('id')
    .single();

  if (error) throw new Error(`insert voucher ${name}: ${error.message}`);
  return data.id as string;
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

  ctx.emptyVoucherId = await insertVoucher(EMPTY_VOUCHER_NAME);
  ctx.stockedVoucherId = await insertVoucher(STOCKED_VOUCHER_NAME);

  const { data: codeData, error: codeError } = await admin
    .from('voucher_codes')
    .insert({
      voucher_id: ctx.stockedVoucherId,
      code: STOCKED_CODE,
      status: 'available',
    })
    .select('id')
    .single();
  if (codeError) throw new Error(`voucher_codes insert: ${codeError.message}`);
  ctx.stockedCodeId = codeData.id as string;
}

async function cleanupData(): Promise<void> {
  const admin = makeAdmin();
  const voucherIds = [ctx.emptyVoucherId, ctx.stockedVoucherId].filter(Boolean) as string[];

  for (const voucherId of voucherIds) {
    await admin.from('wallet_transactions').delete().eq('reference_id', voucherId);
  }

  if (voucherIds.length > 0) {
    await admin
      .from('user_vouchers')
      .update({ voucher_code_id: null })
      .in('voucher_id', voucherIds);

    await admin
      .from('voucher_codes')
      .update({
        status: 'voided',
        issued_to_user_id: null,
        issued_user_voucher_id: null,
        issued_at: null,
        voided_at: new Date().toISOString(),
        void_reason: 'spec62 cleanup',
      })
      .in('voucher_id', voucherIds);

    await admin.from('user_vouchers').delete().in('voucher_id', voucherIds);
    await admin.from('voucher_codes').delete().in('voucher_id', voucherIds);
    await admin.from('vouchers').delete().in('id', voucherIds);
  }

  if (ctx.customerAuthId) {
    await admin.from('wallets').delete().eq('user_id', ctx.customerAuthId);
    await admin.from('users').delete().eq('id', ctx.customerAuthId);
    await admin.auth.admin.deleteUser(ctx.customerAuthId).catch(() => undefined);
  }
}

test.describe.serial('62 - voucher availability follows voucher_codes', () => {
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

  test('public voucher without available code is hidden and direct RPC fails safely', async ({ page }) => {
    expect(ctx.customerAuthId).toBeTruthy();
    expect(ctx.emptyVoucherId).toBeTruthy();
    expect(ctx.stockedVoucherId).toBeTruthy();

    await loginViaUI(page, CUSTOMER_EMAIL, PASSWORD);

    await page.goto('/');
    await expect(page.getByAltText(`${STOCKED_VOUCHER_NAME} banner`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByAltText(`${EMPTY_VOUCHER_NAME} banner`)).toHaveCount(0);

    await page.goto('/vouchers');

    await expect(page.getByRole('heading', { name: 'Vouchery' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByAltText(`${STOCKED_VOUCHER_NAME} banner`)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByAltText(`${EMPTY_VOUCHER_NAME} banner`)).toHaveCount(0);

    const admin = makeAdmin();
    const customer = await customerClient();

    const { data: walletBefore, error: walletBeforeError } = await admin
      .from('wallets')
      .select('balance_coins')
      .eq('user_id', ctx.customerAuthId)
      .single();
    expect(walletBeforeError, `wallet before: ${walletBeforeError?.message}`).toBeNull();

    const { data: emptyResult, error: emptyRpcError } = await customer.rpc('buy_voucher_atomic', {
      p_user_id: ctx.customerAuthId,
      p_voucher_id: ctx.emptyVoucherId,
    });

    expect(emptyRpcError, `empty voucher RPC transport: ${emptyRpcError?.message}`).toBeNull();
    expect(emptyResult?.success, `empty voucher must fail: ${JSON.stringify(emptyResult)}`).toBe(false);
    expect(String(emptyResult?.error ?? '')).toMatch(/available|dostup|code/i);

    const { data: walletAfterEmpty, error: walletAfterEmptyError } = await admin
      .from('wallets')
      .select('balance_coins')
      .eq('user_id', ctx.customerAuthId)
      .single();
    expect(walletAfterEmptyError, `wallet after empty: ${walletAfterEmptyError?.message}`).toBeNull();
    expect(walletAfterEmpty.balance_coins).toBe(walletBefore.balance_coins);

    const { count: emptyPurchaseCount, error: emptyPurchaseCountError } = await admin
      .from('user_vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', ctx.customerAuthId)
      .eq('voucher_id', ctx.emptyVoucherId)
      .eq('redeemed', true);
    expect(emptyPurchaseCountError, `empty purchase count: ${emptyPurchaseCountError?.message}`).toBeNull();
    expect(emptyPurchaseCount).toBe(0);

    const { data: stockedResult, error: stockedRpcError } = await customer.rpc('buy_voucher_atomic', {
      p_user_id: ctx.customerAuthId,
      p_voucher_id: ctx.stockedVoucherId,
    });

    expect(stockedRpcError, `stocked voucher RPC transport: ${stockedRpcError?.message}`).toBeNull();
    expect(stockedResult?.success, `stocked voucher must succeed: ${JSON.stringify(stockedResult)}`).toBe(true);
    expect(stockedResult?.voucher_code_id).toBe(ctx.stockedCodeId);

    const { data: issuedCode, error: issuedCodeError } = await admin
      .from('voucher_codes')
      .select('status, issued_to_user_id, issued_user_voucher_id')
      .eq('id', ctx.stockedCodeId)
      .single();
    expect(issuedCodeError, `issued code: ${issuedCodeError?.message}`).toBeNull();
    expect(issuedCode.status).toBe('issued');
    expect(issuedCode.issued_to_user_id).toBe(ctx.customerAuthId);
    expect(issuedCode.issued_user_voucher_id).toBeTruthy();
  });
});
