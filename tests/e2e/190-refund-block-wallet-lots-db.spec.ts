/**
 * Spec 190 — refund blok (F2 + F3 + F4): MIO sady, FEFO, refundace v2.
 *
 * STAGING ONLY. Testuje databázovou část proti reálnému stagingu se
 * SKUTEČNĚ souběžnými požadavky (každé RPC je samostatné spojení/transakce).
 * Nikdy nevolá Stripe — refundační tok se ověřuje přes stejná RPC, která
 * volá Edge Function `stripe-refund` před a po volání Stripe.
 *
 * Scénářové testy jednotlivých pravidel jsou v
 * `supabase/tests/refund_block_wallet_lots_scenarios.sql`.
 *
 * Required env:
 *   VITE_SUPABASE_URL - musí obsahovat staging ref dxmowysntemfqfnanxua
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';

function skipIfNotStaging() {
  if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) {
    test.skip(true, 'staging-only — vyžaduje staging Supabase URL a service role klíč');
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const createdUserIds: string[] = [];

async function createUser(db: SupabaseClient): Promise<string> {
  const email = `spec190-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@onemil.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: `Spec190-${Math.random().toString(36).slice(2, 10)}!`,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  return data.user.id;
}

/** Dokončené Stripe dobití ve tvaru, jaký zapisuje stripe-webhook. */
async function topUp(db: SupabaseClient, userId: string, czk: number, bonus: number): Promise<string> {
  const { data, error } = await db
    .from('payments')
    .insert({
      user_id: userId,
      amount: czk + bonus,
      method: 'stripe',
      status: 'completed',
      stripe_session_id: `cs_test_spec190_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      paid_amount_czk: czk,
      base_mio: czk,
      bonus_mio: bonus,
      currency: 'czk',
      stripe_livemode: false,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`topUp failed: ${error?.message}`);
  return data.id as string;
}

async function balance(db: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await db.from('wallets').select('balance_coins').eq('user_id', userId).single();
  if (error) throw new Error(error.message);
  return Number(data.balance_coins);
}

async function lotsRemaining(db: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await db
    .from('wallet_lots')
    .select('remaining_amount, status, expires_at')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  const now = Date.now();
  return (data ?? [])
    .filter((l) => l.status === 'active' && new Date(l.expires_at as string).getTime() > now)
    .reduce((sum, l) => sum + Number(l.remaining_amount), 0);
}

async function consistencyIssuesFor(db: SupabaseClient, userIds: string[]): Promise<number> {
  const { data, error } = await db.rpc('wallet_lot_consistency_issues');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { user_id: string }[]).filter((row) => userIds.includes(row.user_id)).length;
}

const debit = (db: SupabaseClient, userId: string, amount: number) =>
  db.rpc('wallet_debit_fefo', {
    p_user_id: userId,
    p_amount: amount,
    p_reason: 'spec190_concurrency',
    p_reference_id: null,
    p_metadata: {},
    p_allow_partial: false,
  });

test.describe('190 refund blok — MIO sady, FEFO, refundace v2 (staging DB)', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    for (const id of createdUserIds) {
      await db.auth.admin.deleteUser(id);
    }
  });

  test('190a: 300 Kč → 300 placených + 10 bonusových MIO ve dvou sadách', async () => {
    skipIfNotStaging();
    const db = admin();
    const user = await createUser(db);
    const paymentId = await topUp(db, user, 300, 10);

    const { data: lots } = await db
      .from('wallet_lots')
      .select('source, credited_amount, remaining_amount, paid_mio, bonus_mio, paid_amount_czk, parent_lot_id, expires_at, credited_at')
      .eq('payment_id', paymentId)
      .order('credited_at');
    expect(lots).toHaveLength(2);
    expect(lots![0]).toMatchObject({ source: 'payment_paid', paid_mio: 300, paid_amount_czk: 300 });
    expect(Number(lots![0].remaining_amount)).toBe(300);
    expect(lots![1]).toMatchObject({ source: 'payment_bonus', bonus_mio: 10 });
    expect(Number(lots![1].remaining_amount)).toBe(10);
    expect(lots![1].parent_lot_id).not.toBeNull();

    // 12 měsíců od připsání.
    const credited = new Date(lots![0].credited_at as string);
    const expires = new Date(lots![0].expires_at as string);
    const months = (expires.getFullYear() - credited.getFullYear()) * 12 + (expires.getMonth() - credited.getMonth());
    expect(months).toBe(12);

    expect(await balance(db, user)).toBe(310);
    expect(await consistencyIssuesFor(db, [user])).toBe(0);
  });

  test('190b: souběžné čerpání — 12 × 40 MIO ze 310 projde přesně 7×, nikdy do mínusu', async () => {
    skipIfNotStaging();
    const db = admin();
    const user = await createUser(db);
    await topUp(db, user, 300, 10);

    const results = await Promise.all(Array.from({ length: 12 }, () => debit(db, user, 40)));
    const ok = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error);

    expect(ok).toBe(7);
    for (const r of failed) expect(r.error?.message).toContain('insufficient_miocoins');
    expect(await balance(db, user)).toBe(30);
    expect(await lotsRemaining(db, user)).toBe(30);
    expect(await consistencyIssuesFor(db, [user])).toBe(0);
  });

  test('190c: souběžná příprava téže refundace — právě jeden odečet, stejná částka', async () => {
    skipIfNotStaging();
    const db = admin();
    const user = await createUser(db);
    const paymentId = await topUp(db, user, 300, 10);
    await debit(db, user, 100);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => db.rpc('prepare_stripe_refund', { p_payment_id: paymentId })),
    );
    for (const r of results) {
      expect(r.error).toBeNull();
      expect(r.data.ok).toBe(true);
      expect(Number(r.data.refund_amount_czk)).toBe(200);
      expect(Number(r.data.refund_amount_haler)).toBe(20000);
    }
    expect(results.filter((r) => r.data.already_prepared === false)).toHaveLength(1);

    const { count } = await db
      .from('wallet_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('reference_id', paymentId)
      .eq('type', 'refund_debit');
    expect(count).toBe(1);
    expect(await balance(db, user)).toBe(0);
    expect(await consistencyIssuesFor(db, [user])).toBe(0);
  });

  test('190d: souběh refundace s čerpáním — každé MIO je buď spotřebované, nebo refundované', async () => {
    skipIfNotStaging();
    const db = admin();
    const user = await createUser(db);
    const paymentId = await topUp(db, user, 300, 10);

    const [refund, ...debits] = await Promise.all([
      db.rpc('prepare_stripe_refund', { p_payment_id: paymentId }),
      ...Array.from({ length: 5 }, () => debit(db, user, 50)),
    ]);
    const consumed = debits.filter((r) => !r.error).length * 50;
    expect(refund.error).toBeNull();

    const refundedPaid = refund.data.ok ? Number(refund.data.refund_paid_mio) : 0;
    const cancelledBonus = refund.data.ok ? Number(refund.data.refund_bonus_mio) : 0;
    const left = await balance(db, user);

    // Celkem 310 MIO: spotřeba + refundovaná placená + zrušený bonus + zbytek = 310.
    expect(consumed + refundedPaid + cancelledBonus + left).toBe(310);
    expect(left).toBeGreaterThanOrEqual(0);
    if (refund.data.ok) {
      // Kč odpovídá jen nevyčerpané placené části.
      expect(Number(refund.data.refund_amount_czk)).toBe(refundedPaid);
      expect(refundedPaid).toBeLessThanOrEqual(300);
    }
    expect(await consistencyIssuesFor(db, [user])).toBe(0);
  });

  test('190e: refundace nikdy nesáhne na jinou sadu téhož uživatele', async () => {
    skipIfNotStaging();
    const db = admin();
    const user = await createUser(db);
    const paymentA = await topUp(db, user, 300, 10);
    const paymentB = await topUp(db, user, 500, 25);

    const { data: before } = await db.from('wallet_lots').select('id, remaining_amount').eq('payment_id', paymentA);
    const prep = await db.rpc('prepare_stripe_refund', { p_payment_id: paymentB });
    expect(prep.data.ok).toBe(true);
    expect(Number(prep.data.refund_amount_czk)).toBe(500);
    expect(Number(prep.data.refund_bonus_mio)).toBe(25);

    const { data: after } = await db.from('wallet_lots').select('id, remaining_amount').eq('payment_id', paymentA);
    expect(after).toEqual(before);
    expect(await balance(db, user)).toBe(310);
    expect(await consistencyIssuesFor(db, [user])).toBe(0);
  });

  test('190f: Stripe selhání vrátí přesně odečtené MIO do původních sad', async () => {
    skipIfNotStaging();
    const db = admin();
    const user = await createUser(db);
    const paymentId = await topUp(db, user, 300, 10);
    await debit(db, user, 120);

    const prep = await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    expect(Number(prep.data.refund_amount_czk)).toBe(180);
    expect(await balance(db, user)).toBe(0);

    await db.rpc('record_stripe_refund_status', {
      p_payment_id: paymentId,
      p_refund_id: `re_spec190_${paymentId}`,
      p_status: 'failed',
    });
    const reverse = await db.rpc('reverse_failed_stripe_refund', { p_payment_id: paymentId, p_stripe_status: 'failed' });
    expect(reverse.data.ok).toBe(true);
    expect(Number(reverse.data.restored)).toBe(190);
    expect(await balance(db, user)).toBe(190);

    const { data: lots } = await db
      .from('wallet_lots')
      .select('source, remaining_amount, status')
      .eq('payment_id', paymentId)
      .order('credited_at');
    expect(lots!.map((l) => [l.source, Number(l.remaining_amount), l.status])).toEqual([
      ['payment_paid', 180, 'active'],
      ['payment_bonus', 10, 'active'],
    ]);
    expect(await consistencyIssuesFor(db, [user])).toBe(0);
  });

  test('190g: sady a interní funkce nejsou dostupné klientským rolím', async () => {
    skipIfNotStaging();
    test.skip(!SUPABASE_ANON, 'chybí anon klíč');
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: false } });
    const credit = await anon.rpc('wallet_credit_lot', { p_user_id: createdUserIds[0], p_amount: 1000, p_source: 'partner_code' });
    expect(credit.error).not.toBeNull();
    const debitAttempt = await anon.rpc('wallet_debit_fefo', { p_user_id: createdUserIds[0], p_amount: 1, p_reason: 'x' });
    expect(debitAttempt.error).not.toBeNull();
    const lots = await anon.from('wallet_lots').select('id').limit(1);
    expect(lots.data ?? []).toHaveLength(0);

    const cfg = await anon.rpc('get_immediate_use_consent_config');
    expect(cfg.error).toBeNull();
    expect(cfg.data).toHaveProperty('required');
  });
});

// ---------------------------------------------------------------------------
// Statický kontrakt (bez databáze)
// ---------------------------------------------------------------------------

const read = (path: string) => readFileSync(path, 'utf8');

test.describe('190 refund blok — kontrakt zdrojů', () => {
  test('190s1: stripe-refund posílá Stripe konkrétní částku v haléřích', () => {
    const src = read('supabase/functions/stripe-refund/index.ts');
    expect(src).toContain('prep.refund_amount_haler');
    expect(src).toContain('amount: refundAmountHaler');
    expect(src).toContain("idempotencyKey: `onemil-refund-${paymentId}`");
  });

  test('190s2: stripe-webhook zapisuje zaplacené Kč, základ, bonus a Stripe režim', () => {
    const src = read('supabase/functions/stripe-webhook/index.ts');
    for (const field of ['paid_amount_czk: priceCzk', 'base_mio: baseMio', 'bonus_mio: bonusMio', 'stripe_livemode: event.livemode === true']) {
      expect(src).toContain(field);
    }
    expect(src).toContain('amount: coinsToCredit');
  });

  test('190s3: souhlas s okamžitým použitím — znění jen ze serveru, nikdy v kódu', () => {
    const edge = read('supabase/functions/create-stripe-checkout/index.ts');
    expect(edge).toContain("'get_immediate_use_consent_config'");
    expect(edge).toContain("code: 'immediate_use_consent_required'");
    const dialog = read('src/components/ImmediateUseConsentDialog.tsx');
    expect(dialog).toContain('{text}');
  });

  test('190s4: migrace drží jediný FEFO algoritmus a 12měsíční platnost', () => {
    const m = read('supabase/migrations/20260924100000_refund_block_wallet_lots.sql');
    expect(m).toContain('order by expires_at asc, credited_at asc, id asc');
    expect(m).toContain("interval '12 months'");
    expect(m.match(/create or replace function public\._wallet_lots_consume/g)).toHaveLength(1);
  });
});
