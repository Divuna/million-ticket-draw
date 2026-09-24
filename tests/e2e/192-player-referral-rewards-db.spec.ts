/**
 * Spec 192 — Fáze 5: osobní doporučení hráčů (5 % ze zaplacených Kč + 15 MIO).
 *
 * STAGING ONLY. Ověřuje databázovou část se SKUTEČNĚ souběžnými požadavky
 * (každé volání je samostatné spojení/transakce): opakovaný webhook, souběžná
 * první dobití, souběžné vyhodnocení a souběžná refundace nesmí nikdy připsat
 * ani odečíst dvakrát. Stripe se nevolá.
 *
 * Jednotlivá pravidla (první/druhé dobití, registrace, bez vazby, refundace,
 * částečná refundace, neúspěšná refundace, sady a expirace, konzistence) jsou
 * ve scénářích `supabase/tests/phase5_player_referral_scenarios.sql`.
 *
 * Required env:
 *   VITE_SUPABASE_URL - musí obsahovat staging ref dxmowysntemfqfnanxua
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';

function skipIfNotStaging() {
  if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) {
    test.skip(true, 'staging-only — vyžaduje staging Supabase URL a service role klíč');
  }
}

/** Každý klient = vlastní HTTP spojení → vlastní transakce na serveru. */
const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false, autoRefreshToken: false } });

const createdUserIds: string[] = [];

async function createUser(db: SupabaseClient): Promise<string> {
  const email = `spec192-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@onemil.test`;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: `Spec192-${Math.random().toString(36).slice(2, 10)}!`,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  createdUserIds.push(data.user.id);
  const { error: usersError } = await db.from('users').upsert({ id: data.user.id, email }, { onConflict: 'id' });
  if (usersError) throw new Error(`public.users seed failed: ${usersError.message}`);
  return data.user.id;
}

async function link(db: SupabaseClient, referrer: string, referred: string) {
  const { error } = await db
    .from('referrals')
    .insert({ referred_user_id: referred, referrer_user_id: referrer, code_used: 'SPEC192', source: 'spec192', status: 'active' });
  if (error) throw new Error(`referral link failed: ${error.message}`);
}

const session = () => `cs_test_spec192_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/** Zápis dokončeného dobití ve tvaru stripe-webhook (vlastní spojení). */
const insertTopUp = (userId: string, stripeSessionId: string, czk: number, bonus: number) =>
  admin()
    .from('payments')
    .insert({
      user_id: userId,
      amount: czk + bonus,
      method: 'stripe',
      status: 'completed',
      stripe_session_id: stripeSessionId,
      paid_amount_czk: czk,
      base_mio: czk,
      bonus_mio: bonus,
      currency: 'czk',
      stripe_livemode: false,
    })
    .select('id')
    .single();

async function balance(db: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await db.from('wallets').select('balance_coins').eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.balance_coins ?? 0);
}

async function rewards(db: SupabaseClient, referred: string) {
  const { data, error } = await db
    .from('referral_rewards')
    .select('id, payment_id, reward_type, reward_mc, status, lot_id, reversed_mc')
    .eq('referred_user_id', referred);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Oznámení odměn za doporučení (zpráva do Zpráv) pro daného doporučujícího. */
async function referralNotices(db: SupabaseClient, referrer: string): Promise<number> {
  const { count, error } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', referrer)
    .eq('topic', 'referral')
    .in('event', ['referral_reward_earned', 'referral_reward_offset']);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function consistencyIssuesFor(db: SupabaseClient, userIds: string[]): Promise<number> {
  const { data, error } = await db.rpc('wallet_lot_consistency_issues');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { user_id: string }[]).filter((row) => userIds.includes(row.user_id)).length;
}

test.describe('192 osobní doporučení — souběh a idempotence (staging DB)', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    if (!SUPABASE_URL.includes(STAGING_REF) || !SERVICE_ROLE) return;
    const db = admin();
    // Jako spec 190: uživatele s platbami smazat nejde (FK plateb) — zůstanou
    // jako konzistentní testovací data stagingu (sady ↔ odměny ↔ platby).
    for (const id of createdUserIds) {
      await db.auth.admin.deleteUser(id);
    }
  });

  test('192a: stejný webhook 6× souběžně → jedna platba, odměna připsána jednou', async () => {
    skipIfNotStaging();
    const db = admin();
    const referrer = await createUser(db);
    const referred = await createUser(db);
    await link(db, referrer, referred);

    const sid = session();
    const results = await Promise.all(Array.from({ length: 6 }, () => insertTopUp(referred, sid, 300, 10)));
    const ok = results.filter((r) => !r.error);
    expect(ok).toHaveLength(1);

    const { count } = await db.from('payments').select('id', { count: 'exact', head: true }).eq('stripe_session_id', sid);
    expect(count).toBe(1);
    expect(await balance(db, referrer)).toBe(30);
    const rw = await rewards(db, referred);
    expect(rw).toHaveLength(2);
    expect(rw.every((r) => r.lot_id !== null && r.status === 'earned')).toBe(true);
    // Jedno oznámení na každou odměnu, i když webhook přišel 6× současně.
    expect(await referralNotices(db, referrer)).toBe(2);
    expect(await consistencyIssuesFor(db, [referrer, referred])).toBe(0);
  });

  test('192b: souběžná první dobití téhož doporučeného → 15 MIO jen jednou', async () => {
    skipIfNotStaging();
    const db = admin();
    const referrer = await createUser(db);
    const referred = await createUser(db);
    await link(db, referrer, referred);

    const results = await Promise.all(Array.from({ length: 5 }, () => insertTopUp(referred, session(), 100, 0)));
    expect(results.every((r) => !r.error)).toBe(true);

    const rw = await rewards(db, referred);
    expect(rw.filter((r) => r.reward_type === 'first_topup_bonus')).toHaveLength(1);
    expect(rw.filter((r) => r.reward_type === 'percent')).toHaveLength(5);
    // 5 × 5 % ze 100 Kč + jediný bonus 15.
    expect(await balance(db, referrer)).toBe(5 * 5 + 15);
    expect(await consistencyIssuesFor(db, [referrer, referred])).toBe(0);
  });

  test('192c: souběžné opakované vyhodnocení téže platby → žádné dvojí připsání', async () => {
    skipIfNotStaging();
    const db = admin();
    const referrer = await createUser(db);
    const referred = await createUser(db);
    await link(db, referrer, referred);

    const { data: pay, error } = await insertTopUp(referred, session(), 300, 10);
    if (error || !pay) throw new Error(`topUp failed: ${error?.message}`);
    const before = await balance(db, referrer);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => admin().rpc('referral_award_for_payment', { p_payment_id: pay.id })),
    );
    expect(results.every((r) => !r.error)).toBe(true);
    expect(results.every((r) => (r.data as { awarded: boolean }).awarded === false)).toBe(true);
    expect(await balance(db, referrer)).toBe(before);
    expect(await rewards(db, referred)).toHaveLength(2);
    // Opakované vyhodnocení neposílá další oznámení.
    expect(await referralNotices(db, referrer)).toBe(2);
  });

  test('192d: souběžná příprava refundace → odměna za doporučení odečtena jednou', async () => {
    skipIfNotStaging();
    const db = admin();
    const referrer = await createUser(db);
    const referred = await createUser(db);
    await link(db, referrer, referred);

    const { data: pay, error } = await insertTopUp(referred, session(), 300, 10);
    if (error || !pay) throw new Error(`topUp failed: ${error?.message}`);
    expect(await balance(db, referrer)).toBe(30);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => admin().rpc('prepare_stripe_refund', { p_payment_id: pay.id })),
    );
    expect(results.every((r) => !r.error)).toBe(true);
    const fresh = results.filter((r) => (r.data as { already_prepared: boolean }).already_prepared === false);
    expect(fresh).toHaveLength(1);

    expect(await balance(db, referrer)).toBe(0);
    const { count } = await db
      .from('wallet_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('reference_id', pay.id)
      .eq('type', 'referral_reversal');
    expect(count).toBe(2);
    expect(await consistencyIssuesFor(db, [referrer, referred])).toBe(0);
  });

  test('192f: souběh nové odměny a refundace u téhož doporučujícího → žádná ztráta ani dvojí pohyb', async () => {
    skipIfNotStaging();
    const db = admin();

    for (let round = 0; round < 3; round++) {
      const referrer = await createUser(db);
      const first = await createUser(db);
      const second = await createUser(db);
      await link(db, referrer, first);
      await link(db, referrer, second);

      const { data: pay, error } = await insertTopUp(first, session(), 300, 10);
      if (error || !pay) throw new Error(`topUp failed: ${error?.message}`);
      expect(await balance(db, referrer)).toBe(30);

      // Doporučující utratí 25 z 30 → storno vytvoří pohledávku.
      const spent = await admin().rpc('wallet_debit_fefo', {
        p_user_id: referrer, p_amount: 25, p_reason: 'spec192_spend',
        p_reference_id: null, p_metadata: {}, p_allow_partial: false,
      });
      expect(spent.error).toBeNull();

      // Refundace prvního doporučeného a nové dobití druhého současně.
      const [refund, topUp] = await Promise.all([
        admin().rpc('prepare_stripe_refund', { p_payment_id: pay.id }),
        insertTopUp(second, session(), 300, 0),
      ]);
      expect(refund.error).toBeNull();
      expect(topUp.error).toBeNull();

      const bal = await balance(db, referrer);
      expect(bal).toBeGreaterThanOrEqual(0);

      const { data: sfs } = await db
        .from('referral_shortfalls')
        .select('amount_mc, repaid_mc, cancelled_mc')
        .eq('referrer_user_id', referrer);
      const outstanding = (sfs ?? []).reduce(
        (s, x) => s + Number(x.amount_mc) - Number(x.repaid_mc) - Number(x.cancelled_mc), 0);

      const { data: rw } = await db
        .from('referral_rewards')
        .select('reward_mc, reversal_target_mc')
        .eq('referrer_user_id', referrer);
      const entitlement = (rw ?? []).reduce((s, x) => s + Number(x.reward_mc) - Number(x.reversal_target_mc), 0);

      // Nárok (30 za druhého doporučeného) − utraceno (25) = zůstatek − otevřená pohledávka,
      // v obou možných pořadích souběhu.
      expect(entitlement).toBe(30);
      expect(Math.round((bal - outstanding) * 10) / 10).toBe(5);
      expect(await consistencyIssuesFor(db, [referrer, first, second])).toBe(0);
    }
  });

  test('192e: celkový staging bez odchylek sad a zůstatků', async () => {
    skipIfNotStaging();
    const { data, error } = await admin().rpc('wallet_lot_consistency_issues');
    if (error) throw new Error(error.message);
    expect(data ?? []).toHaveLength(0);
  });
});
