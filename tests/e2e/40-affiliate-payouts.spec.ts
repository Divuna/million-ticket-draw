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

async function seedCommission(
  admin: SupabaseClient,
  status: 'approved' | 'ready_to_pay' = 'ready_to_pay',
): Promise<{ affiliateId: string; commissionId: string }> {
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
      status,
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

  test('40a) RPC vytvoří dávku a po Fázi D nepovolí paid bez exportu', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string; batchId?: string } = {};

    try {
      const seeded = await seedCommission(service, 'ready_to_pay');
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
      expect(paid?.status).toBe('invalid_batch_status');
      expect(paid?.required_status).toBe('exported');

      const { data: paidCommission } = await (service as any)
        .from('affiliate_commissions')
        .select('status,paid_at,payout_batch_id')
        .eq('id', seeded.commissionId)
        .single();
      expect(paidCommission.status).toBe('in_payment_batch');
      expect(paidCommission.paid_at).toBeFalsy();
      expect(paidCommission.payout_batch_id).toBe(ids.batchId);
    } finally {
      await cleanup(service, ids);
    }
  });

  test('40b) UI zobrazí detail dávky a po Fázi D nabídne export před paid', async ({ page }) => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string; batchId?: string } = {};

    try {
      const seeded = await seedCommission(service, 'ready_to_pay');
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

      await expect(page.getByTestId('btn-generate-affiliate-bank-export')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId('btn-mark-affiliate-payout-batch-paid')).toHaveCount(0);
    } finally {
      await cleanup(service, ids);
    }
  });

  test('40c) staré per-row RPC odmítne approved → paid', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string } = {};

    try {
      const seeded = await seedCommission(service, 'approved');
      ids.affiliateId = seeded.affiliateId;
      ids.commissionId = seeded.commissionId;

      const { data, error } = await (adminUser as any).rpc(
        'admin_set_affiliate_commission_status',
        {
          p_commission_id: seeded.commissionId,
          p_new_status: 'paid',
        },
      );

      expect(error).toBeFalsy();
      expect(data?.status).toBe('invalid_transition');

      const { data: commission } = await (service as any)
        .from('affiliate_commissions')
        .select('status,paid_at')
        .eq('id', seeded.commissionId)
        .single();
      expect(commission.status).toBe('approved');
      expect(commission.paid_at).toBeFalsy();
    } finally {
      await cleanup(service, ids);
    }
  });

  test('40d) AdminAffiliateAccounts detail nemá per-row paid akci', async ({ page }) => {
    const service = makeServiceClient();
    const ids: { affiliateId?: string; commissionId?: string } = {};

    try {
      const seeded = await seedCommission(service, 'approved');
      ids.affiliateId = seeded.affiliateId;
      ids.commissionId = seeded.commissionId;

      await loginAsAdmin(page);
      await page.goto('/admin/affiliate-accounts');
      await page.getByTestId(`detail-affiliate-${seeded.affiliateId}`).click();

      await expect(page.getByText('Provize —').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole('button', { name: 'Vyplatit', exact: true })).toHaveCount(0);
      await expect(page.getByText('Označit jako vyplacené')).toHaveCount(0);
      await expect(page.locator(`[data-testid="affiliate-account-commission-approve-${seeded.commissionId}"]`)).toHaveCount(0);
    } finally {
      await cleanup(service, ids);
    }
  });
});
