/**
 * Spec 40 — Affiliate payout batches (Phase B proposal)
 *
 * Staging-only and opt-in. These tests must run only after Phase A/B migrations
 * are explicitly applied to staging.
 *
 * Required env:
 *   E2E_AFFILIATE_PAYOUTS=1
 *   VITE_SUPABASE_URL              — must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL
 *   E2E_ADMIN_PASSWORD
 */
import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const ENABLED = process.env.E2E_AFFILIATE_PAYOUTS === '1';

function skipIfNotEnabled() {
  if (
    !ENABLED ||
    !SUPABASE_URL.includes(STAGING_REF) ||
    !SUPABASE_ANON ||
    !SERVICE_ROLE ||
    !ADMIN_EMAIL ||
    !ADMIN_PASSWORD
  ) {
    test.skip(
      true,
      'staging-only opt-in — requires E2E_AFFILIATE_PAYOUTS=1 and staging Supabase/admin env',
    );
  }
}

function makeServiceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function makeAdminUserClient(): Promise<SupabaseClient> {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (error) throw new Error(`Cannot sign in admin user: ${error.message}`);
  return client;
}

async function loginAsAdmin(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('sb-'));
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (_) { /* ignore */ }
  });
  await page.goto('/login');
  await page.fill('#email', ADMIN_EMAIL);
  await page.fill('#password', ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Přihlásit se', exact: true }).click();
  await page.waitForURL(/\/admin/, { timeout: 20_000 });
  await page.waitForLoadState('networkidle', { timeout: 15_000 });
}

async function seedReadyCommission(admin: SupabaseClient): Promise<{ affiliateId: string; commissionId: string }> {
  const ts = Date.now();
  const { data: affiliate, error: affiliateError } = await (admin as any)
    .from('affiliate_accounts')
    .insert({
      name: `E2E Spec40 Obchodník ${ts}`,
      email: `spec40-${ts}@example.test`,
      ref_code: `SPEC40${ts % 100000}`,
      status: 'approved',
      payout_account: '12545857',
      payout_bank: '0800',
      ico: '12345678',
      vat_id: null,
      is_vat_payer: false,
    })
    .select('id')
    .single();
  if (affiliateError || !affiliate) {
    throw new Error(`Cannot create test affiliate: ${affiliateError?.message}`);
  }

  const { data: commission, error: commissionError } = await (admin as any)
    .from('affiliate_commissions')
    .insert({
      affiliate_id: affiliate.id,
      commission_type: 'company_invoice',
      period_month: '2020-01-01',
      amount_base_czk: 123.45,
      vat_rate: 0,
      amount_total_czk: 123.45,
      status: 'ready_to_pay',
    })
    .select('id')
    .single();
  if (commissionError || !commission) {
    await (admin as any).from('affiliate_accounts').delete().eq('id', affiliate.id);
    throw new Error(`Cannot create test commission: ${commissionError?.message}`);
  }

  return { affiliateId: affiliate.id, commissionId: commission.id };
}

async function cleanup(admin: SupabaseClient, ids: { affiliateId?: string; commissionId?: string; batchId?: string }) {
  if (ids.batchId) {
    await (admin as any).from('affiliate_payout_batch_items').delete().eq('batch_id', ids.batchId);
    await (admin as any).from('affiliate_payout_batches').delete().eq('id', ids.batchId);
  }
  if (ids.commissionId) {
    await (admin as any).from('affiliate_commissions').delete().eq('id', ids.commissionId);
  }
  if (ids.affiliateId) {
    await (admin as any).from('affiliate_accounts').delete().eq('id', ids.affiliateId);
  }
}

test.describe('40 — affiliate payout batches', () => {
  test.beforeEach(() => {
    skipIfNotEnabled();
  });

  test('40a) RPC vytvoří dávku a označí celou dávku jako zaplacenou', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string; batchId?: string } = {};

    try {
      const seeded = await seedReadyCommission(service);
      ids.affiliateId = seeded.affiliateId;
      ids.commissionId = seeded.commissionId;

      const { data: created, error: createError } = await (adminUser as any).rpc(
        'create_affiliate_payout_batch',
        { p_commission_ids: [seeded.commissionId] },
      );
      expect(createError).toBeFalsy();
      expect(created?.status).toBe('created');
      expect(created?.batch_id).toBeTruthy();
      ids.batchId = created.batch_id;

      const { data: item, error: itemError } = await (service as any)
        .from('affiliate_payout_batch_items')
        .select('variable_symbol,payment_message,constant_symbol')
        .eq('batch_id', ids.batchId)
        .single();
      expect(itemError).toBeFalsy();
      expect(item.variable_symbol).toMatch(/^\d{1,10}$/);
      expect(item.payment_message.length).toBeLessThanOrEqual(35);
      expect(item.constant_symbol).toBe('0000');

      const { data: batchedCommission } = await (service as any)
        .from('affiliate_commissions')
        .select('status,payout_batch_id')
        .eq('id', seeded.commissionId)
        .single();
      expect(batchedCommission.status).toBe('in_payment_batch');
      expect(batchedCommission.payout_batch_id).toBe(ids.batchId);

      const { data: paid, error: paidError } = await (adminUser as any).rpc(
        'mark_affiliate_payout_batch_paid',
        { p_batch_id: ids.batchId },
      );
      expect(paidError).toBeFalsy();
      expect(paid?.status).toBe('paid');

      const { data: paidCommission } = await (service as any)
        .from('affiliate_commissions')
        .select('status,paid_at')
        .eq('id', seeded.commissionId)
        .single();
      expect(paidCommission.status).toBe('paid');
      expect(paidCommission.paid_at).toBeTruthy();
    } finally {
      await cleanup(service, ids);
    }
  });

  test('40b) UI zobrazí detail dávky a dovolí označit dávku jako zaplacenou', async ({ page }) => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string; batchId?: string } = {};

    try {
      const seeded = await seedReadyCommission(service);
      ids.affiliateId = seeded.affiliateId;
      ids.commissionId = seeded.commissionId;

      const { data: created, error: createError } = await (adminUser as any).rpc(
        'create_affiliate_payout_batch',
        { p_commission_ids: [seeded.commissionId] },
      );
      expect(createError).toBeFalsy();
      ids.batchId = created.batch_id;

      await loginAsAdmin(page);
      await page.goto(`/admin/affiliate-payouts/${ids.batchId}`);
      await expect(page.getByRole('heading', { name: created.batch_number })).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText('E2E Spec40 Obchodník').first()).toBeVisible({ timeout: 15_000 });

      await page.getByTestId('btn-mark-affiliate-payout-batch-paid').click();
      await expect(
        page.getByText('Tato akce neposílá peníze. Pouze potvrzuje, že platba byla provedena v bance.'),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Označit jako zaplacené', exact: true }).click();
      await expect(page.getByText('Zaplaceno').first()).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanup(service, ids);
    }
  });
});
