/**
 * Spec 194 — Fáze 6: affiliate provize ze skutečně zaplacených Kč.
 *
 * STAGING ONLY. Souběh měsíčního výpočtu s refundací (každé volání je
 * samostatné spojení/transakce) musí skončit konzistentně: provize = součet
 * jejích plateb po refundacích, žádná platba dvakrát, žádná duplicita.
 * Stripe se nevolá. Pravidla jednotlivě: `supabase/tests/phase6_affiliate_commissions_scenarios.sql`.
 *
 * Required env: VITE_SUPABASE_URL (staging), E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const MIGRATION = 'supabase/migrations/20260926100000_phase6_affiliate_commissions_paid_czk.sql';

function skipIfNotStaging() {
  if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) {
    test.skip(true, 'staging-only — vyžaduje staging Supabase URL a service role klíč');
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const createdUserIds: string[] = [];
const rand = () => Math.random().toString(36).slice(2, 10);
const month = () => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};

async function createUser(db: SupabaseClient): Promise<string> {
  const email = `spec194-${Date.now()}-${rand()}@onemil.test`;
  const { data, error } = await db.auth.admin.createUser({ email, password: `Spec194-${rand()}!`, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  const { error: e2 } = await db.from('users').upsert({ id: data.user.id, email }, { onConflict: 'id' });
  if (e2) throw new Error(`public.users seed failed: ${e2.message}`);
  return data.user.id;
}

async function createAffiliateWithCustomer(db: SupabaseClient) {
  const { data: aff, error } = await db
    .from('affiliate_accounts')
    .insert({
      name: `Spec194 ${rand()}`, email: `spec194-aff-${rand()}@onemil.test`, ref_code: `S194${rand()}`,
      modes: ['influencer'], status: 'approved', commission_rate_customer: 5, commission_rate_company: 5,
    })
    .select('id')
    .single();
  if (error || !aff) throw new Error(`affiliate insert failed: ${error?.message}`);
  const customer = await createUser(db);
  const { error: e2 } = await db.from('affiliate_customer_refs').insert({ affiliate_id: aff.id, user_id: customer, source: 'spec194' });
  if (e2) throw new Error(`affiliate ref failed: ${e2.message}`);
  return { affiliateId: aff.id as string, customer };
}

async function topUp(db: SupabaseClient, userId: string, czk: number, bonus: number): Promise<string> {
  const { data, error } = await db
    .from('payments')
    .insert({
      user_id: userId, amount: czk + bonus, method: 'stripe', status: 'completed',
      stripe_session_id: `cs_test_spec194_${Date.now()}_${rand()}`,
      paid_amount_czk: czk, base_mio: czk, bonus_mio: bonus, currency: 'czk', stripe_livemode: false,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`topUp failed: ${error?.message}`);
  return data.id as string;
}

async function commission(db: SupabaseClient, affiliateId: string) {
  const { data, error } = await db
    .from('affiliate_commissions')
    .select('id, amount_base_czk, amount_total_czk, status')
    .eq('affiliate_id', affiliateId)
    .eq('commission_type', 'customer_payments')
    .eq('period_month', month());
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function linesFor(db: SupabaseClient, affiliateId: string) {
  const { data, error } = await db
    .from('affiliate_commission_payments')
    .select('commission_id, payment_id, paid_amount_czk, refunded_czk, commission_rate')
    .eq('affiliate_id', affiliateId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

test.describe('194 affiliate provize v Kč (staging DB + kontrakt)', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    for (const id of createdUserIds) await db.auth.admin.deleteUser(id);
  });

  test('194a: souběh měsíčního výpočtu a refundace → konzistentní provize', async () => {
    skipIfNotStaging();
    const db = admin();

    for (let round = 0; round < 3; round++) {
      const { affiliateId, customer } = await createAffiliateWithCustomer(db);
      const paymentId = await topUp(db, customer, 300, 10);
      await topUp(db, customer, 150, 0);
      // zákazník utratí 200 MIO → refundovat půjde 100 Kč z první platby
      const spent = await admin().rpc('wallet_debit_fefo', {
        p_user_id: customer, p_amount: 200, p_reason: 'spec194_spend', p_reference_id: null, p_metadata: {}, p_allow_partial: false,
      });
      expect(spent.error).toBeNull();

      const results = await Promise.all([
        admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() }),
        admin().rpc('prepare_stripe_refund', { p_payment_id: paymentId }),
        admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() }),
        admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() }),
      ]);
      for (const r of results) expect(r.error).toBeNull();

      const rows = await commission(db, affiliateId);
      expect(rows).toHaveLength(1);
      const lines = await linesFor(db, affiliateId);
      expect(lines).toHaveLength(2);
      expect(new Set(lines.map((l) => l.payment_id)).size).toBe(2);

      // Provize = součet jejích plateb po refundacích; refundace 100 Kč je započtena.
      const expected = Math.round(
        lines.reduce((s, l) => s + (Number(l.paid_amount_czk) - Number(l.refunded_czk)) * Number(l.commission_rate) / 100, 0) * 100,
      ) / 100;
      expect(Number(rows[0].amount_base_czk)).toBe(expected);
      expect(expected).toBe(17.5); // (300 − 100 + 150) × 5 %
    }
  });

  test('194b: souběžné opakované výpočty → bez duplicit', async () => {
    skipIfNotStaging();
    const db = admin();
    const { affiliateId, customer } = await createAffiliateWithCustomer(db);
    await topUp(db, customer, 300, 10);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => admin().rpc('calculate_affiliate_commissions_for_month', { p_month: month() })),
    );
    for (const r of results) expect(r.error).toBeNull();

    const rows = await commission(db, affiliateId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount_base_czk)).toBe(15);
    expect(await linesFor(db, affiliateId)).toHaveLength(1);
  });

  test('194c: kontrakt — zákaznický základ ze zaplacených Kč, firemní větev beze změny', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('pay.paid_amount_czk IS NOT NULL');
    expect(sql).not.toMatch(/SUM\(pay\.amount\)/);
    // Firemní větev: 5 % ze zaplacené faktury bez DPH, jedna provize na fakturu.
    expect(sql).toContain("ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2)");
    expect(sql).toContain("AND pi.status = 'paid'");
    expect(sql).toContain('AND date_trunc(\'month\', pi.paid_at)::date <= v_month');
    expect(sql).toContain('ON CONFLICT (source_invoice_id) WHERE source_invoice_id IS NOT NULL DO NOTHING');
    // Vyplacená / dokladovaná provize se automaticky nemění.
    expect(sql).toContain("v_c.status = 'calculated' or (v_c.status = 'approved' and v_c.payout_document_id is null)");
    // Fáze 6 nesahá na peněženky MIO ani na refundační funkce.
    expect(sql).not.toMatch(/update public\.wallets/i);
    expect(sql).not.toMatch(/create or replace function public\.(prepare_stripe_refund|reverse_failed_stripe_refund|finalize_stripe_refund)/i);
  });
});
