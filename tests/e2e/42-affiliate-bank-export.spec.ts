/**
 * Spec 42 - Affiliate payout bank export (Phase D proposal)
 *
 * Staging-only and opt-in. These tests must run only after Phase A/B/C/D files
 * are explicitly applied/deployed to staging.
 *
 * Required env:
 *   E2E_AFFILIATE_PAYOUTS=1
 *   VITE_SUPABASE_URL - must contain staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 *   E2E_ADMIN_EMAIL
 *   E2E_ADMIN_PASSWORD
 */
import { test, expect } from '@playwright/test';
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
      'staging-only opt-in - requires E2E_AFFILIATE_PAYOUTS=1 and staging Supabase/admin env',
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

async function readFunctionErrorPayload(data: any, error: any): Promise<any> {
  if (data) return data;

  const context = error?.context;
  if (context && typeof context.json === 'function') {
    try {
      return await context.json();
    } catch (_) {
      // Fall through to generic shape.
    }
  }

  return {
    error: error?.message ?? 'unknown_function_error',
    status: error?.name ?? 'unknown_function_error',
  };
}

async function seedReadyCommission(
  admin: SupabaseClient,
): Promise<{ affiliateId: string; commissionId: string }> {
  const ts = Date.now();
  const { data: affiliate, error: affiliateError } = await (admin as any)
    .from('affiliate_accounts')
    .insert({
      name: `E2E Spec42 Obchodnik ${ts}`,
      email: `spec42-${ts}@example.test`,
      ref_code: `SPEC42${ts % 100000}`,
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

async function createBatch(
  adminUser: SupabaseClient,
  commissionId: string,
): Promise<{ batchId: string; batchNumber: string }> {
  const { data, error } = await (adminUser as any).rpc(
    'create_affiliate_payout_batch',
    { p_commission_ids: [commissionId] },
  );
  expect(error).toBeFalsy();
  expect(data?.status).toBe('created');
  return { batchId: data.batch_id, batchNumber: data.batch_number };
}

async function prepareBatchForExport(admin: SupabaseClient, batchId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await (admin as any)
    .from('affiliate_payout_batches')
    .update({
      due_date: today,
      payer_account: '1234567890',
      payer_bank_code: '3030',
    })
    .eq('id', batchId);
  expect(error).toBeFalsy();
}

async function cleanup(
  admin: SupabaseClient,
  ids: { affiliateId?: string; commissionId?: string; batchId?: string; exportPath?: string },
) {
  if (ids.exportPath) {
    await (admin as any).storage.from('affiliate-bank-exports').remove([ids.exportPath]);
  }
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

test.describe('42 - affiliate bank export', () => {
  test.beforeEach(() => {
    skipIfNotEnabled();
  });

  test('42a) vytvori Air Bank .kpc export a povoli paid az po exportu', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string; batchId?: string; exportPath?: string } = {};

    try {
      const seeded = await seedReadyCommission(service);
      ids.affiliateId = seeded.affiliateId;
      ids.commissionId = seeded.commissionId;
      const batch = await createBatch(adminUser, seeded.commissionId);
      ids.batchId = batch.batchId;
      await prepareBatchForExport(service, batch.batchId);

      const { data, error } = await (adminUser as any).functions.invoke(
        'generate-affiliate-bank-export',
        { body: { batch_id: batch.batchId } },
      );
      expect(error).toBeFalsy();
      expect(data?.success).toBe(true);
      expect(data?.status).toBe('exported');
      expect(data?.bank_export_storage_path).toMatch(/\.kpc$/);
      ids.exportPath = data.bank_export_storage_path;

      const { data: batchRow } = await (service as any)
        .from('affiliate_payout_batches')
        .select('status,bank_export_storage_path,bank_export_sha256,bank_export_size_bytes')
        .eq('id', batch.batchId)
        .single();
      expect(batchRow.status).toBe('exported');
      expect(batchRow.bank_export_storage_path).toBe(ids.exportPath);
      expect(batchRow.bank_export_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(batchRow.bank_export_size_bytes).toBeGreaterThan(0);
      expect(batchRow.bank_export_size_bytes).toBeLessThanOrEqual(50 * 1024);

      const { data: blob, error: downloadError } = await (service as any).storage
        .from('affiliate-bank-exports')
        .download(ids.exportPath);
      expect(downloadError).toBeFalsy();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect([...bytes].every((byte) => byte <= 0x7f)).toBe(true);
      const text = Buffer.from(bytes).toString('ascii');
      expect(text).toContain('UHL1\r\n');
      expect(text).toContain('\r\n5 +\r\n');
      expect(text).not.toMatch(/[^\r]\n/);
      expect(text).toContain('00000000012345');

      const { data: paid, error: paidError } = await (adminUser as any).rpc(
        'mark_affiliate_payout_batch_paid',
        { p_batch_id: batch.batchId },
      );
      expect(paidError).toBeFalsy();
      expect(paid?.status).toBe('paid');
    } finally {
      await cleanup(service, ids);
    }
  });

  test('42b) chybejici ucet platce vrati rizenou chybu', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string; batchId?: string; exportPath?: string } = {};

    try {
      const seeded = await seedReadyCommission(service);
      ids.affiliateId = seeded.affiliateId;
      ids.commissionId = seeded.commissionId;
      const batch = await createBatch(adminUser, seeded.commissionId);
      ids.batchId = batch.batchId;

      const { data, error } = await (adminUser as any).functions.invoke(
        'generate-affiliate-bank-export',
        { body: { batch_id: batch.batchId } },
      );
      expect(error).toBeTruthy();
      const payload = await readFunctionErrorPayload(data, error);
      expect(payload?.error ?? payload?.status).toBe('missing_payer_account');
    } finally {
      await cleanup(service, ids);
    }
  });

  test('42c) created davku nelze oznacit jako paid pred exportem', async () => {
    const service = makeServiceClient();
    const adminUser = await makeAdminUserClient();
    const ids: { affiliateId?: string; commissionId?: string; batchId?: string } = {};

    try {
      const seeded = await seedReadyCommission(service);
      ids.affiliateId = seeded.affiliateId;
      ids.commissionId = seeded.commissionId;
      const batch = await createBatch(adminUser, seeded.commissionId);
      ids.batchId = batch.batchId;

      const { data, error } = await (adminUser as any).rpc(
        'mark_affiliate_payout_batch_paid',
        { p_batch_id: batch.batchId },
      );
      expect(error).toBeFalsy();
      expect(data?.status).toBe('invalid_batch_status');
      expect(data?.required_status).toBe('exported');
    } finally {
      await cleanup(service, ids);
    }
  });
});
