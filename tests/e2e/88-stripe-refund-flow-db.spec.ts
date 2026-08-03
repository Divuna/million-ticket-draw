/**
 * Spec 88 — chování zpevněných Stripe refundací proti reálné databázi
 *
 * STAGING ONLY a opt-in. Spouštět až po aplikaci migrace
 * `20260803090000_harden_stripe_refund_flow.sql` na staging.
 * **Nikdy nevolá Stripe** — testuje jen databázovou část toku
 * (`prepare_stripe_refund` / `finalize_stripe_refund`), tedy přesně ty kroky,
 * které v Edge Function běží PŘED a PO volání Stripe.
 *
 * Required env:
 *   E2E_REFUND_HARDENING=1
 *   VITE_SUPABASE_URL - musí obsahovat staging ref dxmowysntemfqfnanxua
 *   VITE_SUPABASE_ANON_KEY
 *   E2E_SUPABASE_SERVICE_ROLE_KEY
 */
import { expect, test } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const STAGING_REF = 'dxmowysntemfqfnanxua';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? '';
const ENABLED = process.env.E2E_REFUND_HARDENING === '1';

const INSUFFICIENT_MESSAGE =
  'Refundaci nelze provést, protože část MioCoinů z této platby již byla použita.';

function skipIfNotEnabled() {
  if (!ENABLED || !SUPABASE_URL.includes(STAGING_REF) || !SUPABASE_ANON || !SERVICE_ROLE) {
    test.skip(true, 'staging-only opt-in — vyžaduje E2E_REFUND_HARDENING=1 a staging Supabase env');
  }
}

const admin = (): SupabaseClient =>
  createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const createdUserIds: string[] = [];

/**
 * Vytvoří testovacího uživatele, peněženku s daným zůstatkem a platbu.
 * Platba se vloží jako `pending` (aby ji nezpracoval INSERT trigger) a teprve
 * potom se přepne na `completed` — zůstatek tak zůstává přesně pod kontrolou.
 */
async function seedPayment(db: SupabaseClient, walletBalance: number, paymentAmount: number) {
  const email = `spec88-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@onemil.test`;
  const { data: created, error: userError } = await db.auth.admin.createUser({
    email,
    password: `Spec88-${Math.random().toString(36).slice(2, 10)}!`,
    email_confirm: true,
  });
  if (userError || !created.user) throw new Error(`createUser failed: ${userError?.message}`);
  const userId = created.user.id;
  createdUserIds.push(userId);

  const { error: walletError } = await db
    .from('wallets')
    .upsert({ user_id: userId, balance_coins: walletBalance }, { onConflict: 'user_id' });
  if (walletError) throw new Error(`wallet seed failed: ${walletError.message}`);

  const { data: payment, error: paymentError } = await db
    .from('payments')
    .insert({
      user_id: userId,
      amount: paymentAmount,
      status: 'pending',
      method: 'stripe',
      stripe_session_id: `cs_test_spec88_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    })
    .select('id')
    .single();
  if (paymentError || !payment) throw new Error(`payment seed failed: ${paymentError?.message}`);

  const { error: statusError } = await db
    .from('payments')
    .update({ status: 'completed' })
    .eq('id', payment.id);
  if (statusError) throw new Error(`payment status seed failed: ${statusError.message}`);

  // Zůstatek nastavíme až nakonec, aby ho případný trigger neovlivnil.
  const { error: balanceError } = await db
    .from('wallets')
    .update({ balance_coins: walletBalance })
    .eq('user_id', userId);
  if (balanceError) throw new Error(`wallet balance seed failed: ${balanceError.message}`);

  return { userId, paymentId: payment.id as string };
}

async function balanceOf(db: SupabaseClient, userId: string): Promise<number> {
  const { data } = await db.from('wallets').select('balance_coins').eq('user_id', userId).single();
  return Number(data?.balance_coins ?? 0);
}

async function paymentStatus(db: SupabaseClient, paymentId: string): Promise<string> {
  const { data } = await db.from('payments').select('status').eq('id', paymentId).single();
  return String(data?.status ?? '');
}

async function ledgerRows(db: SupabaseClient, paymentId: string, type: string) {
  const { data } = await db
    .from('wallet_transactions')
    .select('amount, type, source, reference_id')
    .eq('reference_id', paymentId)
    .eq('type', type);
  return data ?? [];
}

const refundDebitRows = (db: SupabaseClient, paymentId: string) =>
  ledgerRows(db, paymentId, 'refund_debit');

const refundReversalRows = (db: SupabaseClient, paymentId: string) =>
  ledgerRows(db, paymentId, 'refund_reversal');

async function paymentRefundFields(db: SupabaseClient, paymentId: string) {
  const { data } = await db
    .from('payments')
    .select('status, stripe_refund_id, stripe_refund_status, refund_updated_at')
    .eq('id', paymentId)
    .single();
  return data;
}

/** Simuluje to, co po volání Stripe udělá Edge Function nebo webhook. */
async function applyStripeStatus(
  db: SupabaseClient,
  paymentId: string,
  refundId: string,
  status: string,
) {
  await db.rpc('record_stripe_refund_status', {
    p_payment_id: paymentId,
    p_refund_id: refundId,
    p_status: status,
  });

  if (status === 'succeeded') {
    return db.rpc('finalize_stripe_refund', { p_payment_id: paymentId });
  }
  if (status === 'failed' || status === 'canceled') {
    return db.rpc('reverse_failed_stripe_refund', {
      p_payment_id: paymentId,
      p_stripe_status: status,
    });
  }
  // pending / requires_action — nic dalšího se nevolá.
  return { data: null, error: null };
}

test.describe('stripe refund database flow', () => {
  test.beforeEach(() => skipIfNotEnabled());

  test.afterAll(async () => {
    if (!ENABLED || !SERVICE_ROLE || !SUPABASE_URL.includes(STAGING_REF)) return;
    const db = admin();
    for (const userId of createdUserIds) {
      await db.from('wallet_transactions').delete().eq('user_id', userId);
      await db.from('payments').delete().eq('user_id', userId);
      await db.from('wallets').delete().eq('user_id', userId);
      await db.auth.admin.deleteUser(userId);
    }
  });

  test('88a full balance deducts the exact amount and creates one negative ledger row', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    const { data, error } = await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(data.already_prepared).toBe(false);
    expect(Number(data.amount)).toBe(310);

    expect(await balanceOf(db, userId)).toBe(190);
    expect(await paymentStatus(db, paymentId)).toBe('refund_pending');

    const rows = await refundDebitRows(db, paymentId);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(-310);
    expect(rows[0].source).toBe('prepare_stripe_refund');
    expect(rows[0].reference_id).toBe(paymentId);
  });

  test('88b partially spent balance blocks the refund before Stripe', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 100, 310);

    const { data, error } = await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    expect(error).toBeNull();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('insufficient_balance');
    expect(data.message).toBe(INSUFFICIENT_MESSAGE);

    // Nic se nesmělo změnit.
    expect(await balanceOf(db, userId)).toBe(100);
    expect(await paymentStatus(db, paymentId)).toBe('completed');
    expect(await refundDebitRows(db, paymentId)).toHaveLength(0);
  });

  test('88c repeated preparation never deducts twice', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    const balanceAfterFirst = await balanceOf(db, userId);

    const { data, error } = await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    expect(error).toBeNull();
    expect(data.ok).toBe(true);
    expect(data.already_prepared).toBe(true);

    expect(await balanceOf(db, userId)).toBe(balanceAfterFirst);
    expect(await refundDebitRows(db, paymentId)).toHaveLength(1);
  });

  test('88h stripe pending keeps the payment in refund_pending', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    await applyStripeStatus(db, paymentId, `re_spec88_pending_${Date.now()}`, 'pending');

    const fields = await paymentRefundFields(db, paymentId);
    expect(fields?.status).toBe('refund_pending');
    expect(fields?.stripe_refund_status).toBe('pending');
    expect(fields?.stripe_refund_id).toBeTruthy();
    expect(fields?.refund_updated_at).toBeTruthy();

    expect(await balanceOf(db, userId)).toBe(190);
    expect(await refundReversalRows(db, paymentId)).toHaveLength(0);
  });

  test('88i stripe requires_action keeps the payment in refund_pending', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    await applyStripeStatus(db, paymentId, `re_spec88_ra_${Date.now()}`, 'requires_action');

    const fields = await paymentRefundFields(db, paymentId);
    expect(fields?.status).toBe('refund_pending');
    expect(fields?.stripe_refund_status).toBe('requires_action');

    expect(await balanceOf(db, userId)).toBe(190);
    expect(await refundReversalRows(db, paymentId)).toHaveLength(0);
  });

  test('88j stripe failed restores the MioCoins once and returns the payment to completed', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    expect(await balanceOf(db, userId)).toBe(190);

    const refundId = `re_spec88_failed_${Date.now()}`;
    await applyStripeStatus(db, paymentId, refundId, 'failed');

    const fields = await paymentRefundFields(db, paymentId);
    // Peníze zákazníkovi vráceny nebyly → platba zůstává ekonomicky dokončená.
    expect(fields?.status).toBe('completed');
    expect(fields?.stripe_refund_status).toBe('failed');
    expect(fields?.stripe_refund_id).toBe(refundId);

    expect(await balanceOf(db, userId)).toBe(500);
    const reversal = await refundReversalRows(db, paymentId);
    expect(reversal).toHaveLength(1);
    expect(Number(reversal[0].amount)).toBe(310);
    expect(reversal[0].source).toBe('reverse_failed_stripe_refund');

    // Opakovaná událost (webhook retry) nesmí vrátit MioCoiny podruhé.
    await applyStripeStatus(db, paymentId, refundId, 'failed');
    expect(await balanceOf(db, userId)).toBe(500);
    expect(await refundReversalRows(db, paymentId)).toHaveLength(1);

    // Nová automatická refundace je zablokovaná uloženým failed refundem.
    const { data: retry } = await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    expect(retry.ok).toBe(false);
    expect(retry.code).toBe('refund_failed_needs_manual_review');
    expect(await balanceOf(db, userId)).toBe(500);
    expect(await paymentStatus(db, paymentId)).toBe('completed');
  });

  test('88k stripe canceled restores the MioCoins exactly once', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    const refundId = `re_spec88_canceled_${Date.now()}`;
    await applyStripeStatus(db, paymentId, refundId, 'canceled');

    const fields = await paymentRefundFields(db, paymentId);
    expect(fields?.status).toBe('completed');
    expect(fields?.stripe_refund_status).toBe('canceled');

    expect(await balanceOf(db, userId)).toBe(500);
    expect(await refundReversalRows(db, paymentId)).toHaveLength(1);
  });

  test('88n a failed refund restores the referral reward and credits the referrer once', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);
    const { userId: referrerId } = await seedPayment(db, 1000, 50);

    // Odměna za doporučení stornovaná přechodem completed -> refund_pending.
    const { error: rewardError } = await db.from('referral_rewards').insert({
      referrer_user_id: referrerId,
      referred_user_id: userId,
      payment_id: paymentId,
      paid_amount_mc: 310,
      commission_rate: 0.1,
      reward_mc: 31,
      status: 'earned',
    });
    expect(rewardError).toBeNull();

    const referrerBefore = await balanceOf(db, referrerId);

    // Příprava refundace → produkční trigger odměnu stornuje a odečte ji.
    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });

    const { data: afterPrepare } = await db
      .from('referral_rewards')
      .select('status, reverse_reason')
      .eq('payment_id', paymentId)
      .single();
    expect(afterPrepare?.status).toBe('reversed');
    expect(afterPrepare?.reverse_reason).toBe('payment_status_changed:refund_pending');

    // Stripe refundace selže → odměna se musí obnovit.
    const refundId = `re_spec88_reward_${Date.now()}`;
    await applyStripeStatus(db, paymentId, refundId, 'failed');

    const { data: afterReverse } = await db
      .from('referral_rewards')
      .select('status, reversed_at, reverse_reason')
      .eq('payment_id', paymentId)
      .single();
    expect(afterReverse?.status).toBe('earned');
    expect(afterReverse?.reversed_at).toBeNull();
    expect(afterReverse?.reverse_reason).toBeNull();

    const referrerAfter = await balanceOf(db, referrerId);
    expect(referrerAfter).toBe(referrerBefore);

    // Opakovaná událost nesmí odměnu připsat podruhé.
    await applyStripeStatus(db, paymentId, refundId, 'failed');
    expect(await balanceOf(db, referrerId)).toBe(referrerAfter);
    expect(await refundReversalRows(db, paymentId)).toHaveLength(1);
    expect(await paymentStatus(db, paymentId)).toBe('completed');
  });

  test('88o a late failed event after succeeded changes nothing', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    const refundId = `re_spec88_late_${Date.now()}`;
    await applyStripeStatus(db, paymentId, refundId, 'succeeded');
    expect(await paymentStatus(db, paymentId)).toBe('refunded');

    // Pozdní `failed` — Stripe negarantuje pořadí doručení událostí.
    await applyStripeStatus(db, paymentId, refundId, 'failed');

    const fields = await paymentRefundFields(db, paymentId);
    expect(fields?.status).toBe('refunded');
    expect(fields?.stripe_refund_status).toBe('succeeded');

    expect(await balanceOf(db, userId)).toBe(190);
    expect(await refundReversalRows(db, paymentId)).toHaveLength(0);
  });

  test('88q a late pending after failed keeps everything terminal', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);
    const { userId: referrerId } = await seedPayment(db, 1000, 50);

    await db.from('referral_rewards').insert({
      referrer_user_id: referrerId,
      referred_user_id: userId,
      payment_id: paymentId,
      paid_amount_mc: 310,
      commission_rate: 0.1,
      reward_mc: 31,
      status: 'earned',
    });

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    const refundId = `re_spec88_terminal_${Date.now()}`;
    await applyStripeStatus(db, paymentId, refundId, 'failed');

    const balanceAfterFailure = await balanceOf(db, userId);
    const referrerAfterFailure = await balanceOf(db, referrerId);

    // Starší událost doručená až teď (Stripe negarantuje pořadí).
    const { data: late } = await db.rpc('record_stripe_refund_status', {
      p_payment_id: paymentId,
      p_refund_id: refundId,
      p_status: 'pending',
    });
    expect(late.ok).toBe(true);
    expect(late.ignored).toBe(true);
    expect(late.code).toBe('terminal_state');
    expect(late.stripe_refund_status).toBe('failed');
    expect(late.status).toBe('completed');

    const fields = await paymentRefundFields(db, paymentId);
    expect(fields?.status).toBe('completed');
    expect(fields?.stripe_refund_status).toBe('failed');

    expect(await balanceOf(db, userId)).toBe(balanceAfterFailure);
    expect(await balanceOf(db, referrerId)).toBe(referrerAfterFailure);
    expect(await refundReversalRows(db, paymentId)).toHaveLength(1);

    const { data: reward } = await db
      .from('referral_rewards')
      .select('status')
      .eq('payment_id', paymentId)
      .single();
    expect(reward?.status).toBe('earned');

    // Nový automatický pokus zůstává zablokovaný.
    const { data: retry } = await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    expect(retry.ok).toBe(false);
    expect(retry.code).toBe('refund_failed_needs_manual_review');
  });

  test('88r a late requires_action after canceled keeps everything terminal', async () => {
    const db = admin();
    const { paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    const refundId = `re_spec88_cancel_terminal_${Date.now()}`;
    await applyStripeStatus(db, paymentId, refundId, 'canceled');

    const { data: late } = await db.rpc('record_stripe_refund_status', {
      p_payment_id: paymentId,
      p_refund_id: refundId,
      p_status: 'requires_action',
    });
    expect(late.ignored).toBe(true);

    const fields = await paymentRefundFields(db, paymentId);
    expect(fields?.status).toBe('completed');
    expect(fields?.stripe_refund_status).toBe('canceled');
  });

  test('88s a late succeeded after failed does not resurrect the refund', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    const refundId = `re_spec88_failed_then_ok_${Date.now()}`;
    await applyStripeStatus(db, paymentId, refundId, 'failed');

    const { data: late } = await db.rpc('record_stripe_refund_status', {
      p_payment_id: paymentId,
      p_refund_id: refundId,
      p_status: 'succeeded',
    });
    expect(late.ok).toBe(true);
    expect(late.ignored).toBe(true);
    expect(late.stripe_refund_status).toBe('failed');

    // Efektivní stav je pořád `failed`, takže finalize nesmí projít.
    const finalize = await db.rpc('finalize_stripe_refund', { p_payment_id: paymentId });
    expect(finalize.data.ok).toBe(false);

    const fields = await paymentRefundFields(db, paymentId);
    expect(fields?.status).toBe('completed');
    expect(fields?.stripe_refund_status).toBe('failed');
    expect(await balanceOf(db, userId)).toBe(500);
  });

  test('88t an existing refund_reversal never leaves the payment in refund_pending', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    const refundId = `re_spec88_reversal_${Date.now()}`;
    await applyStripeStatus(db, paymentId, refundId, 'failed');

    // Simulace dřívějšího částečného běhu: platba zpět v refund_pending,
    // ale reverzní ledger řádek už existuje.
    await db.from('payments').update({ status: 'refund_pending' }).eq('id', paymentId);

    const { data: repeat } = await db.rpc('reverse_failed_stripe_refund', {
      p_payment_id: paymentId,
      p_stripe_status: 'failed',
    });
    expect(repeat.ok).toBe(true);
    expect(repeat.already_reversed).toBe(true);
    expect(repeat.status).toBe('completed');
    expect(repeat.stripe_refund_status).toBe('failed');

    expect(await paymentStatus(db, paymentId)).toBe('completed');
    expect(await balanceOf(db, userId)).toBe(500);
    expect(await refundReversalRows(db, paymentId)).toHaveLength(1);
  });

  test('88u record_stripe_refund_status rejects an unknown stripe status', async () => {
    const db = admin();
    const { paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });

    const { data } = await db.rpc('record_stripe_refund_status', {
      p_payment_id: paymentId,
      p_refund_id: `re_spec88_bogus_${Date.now()}`,
      p_status: 'something_else',
    });

    expect(data.ok).toBe(false);
    expect(data.code).toBe('invalid_stripe_status');
    expect((await paymentRefundFields(db, paymentId))?.stripe_refund_id).toBeNull();
  });

  test('88p finalize refuses a refund that is not succeeded at stripe', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });

    // Bez uloženého refund ID.
    const noId = await db.rpc('finalize_stripe_refund', { p_payment_id: paymentId });
    expect(noId.data.ok).toBe(false);
    expect(noId.data.code).toBe('missing_stripe_refund_id');

    // S refundem, který je teprve `pending`.
    await db.rpc('record_stripe_refund_status', {
      p_payment_id: paymentId,
      p_refund_id: `re_spec88_notdone_${Date.now()}`,
      p_status: 'pending',
    });
    const notSucceeded = await db.rpc('finalize_stripe_refund', { p_payment_id: paymentId });
    expect(notSucceeded.data.ok).toBe(false);
    expect(notSucceeded.data.code).toBe('stripe_refund_not_succeeded');

    expect(await paymentStatus(db, paymentId)).toBe('refund_pending');
    expect(await balanceOf(db, userId)).toBe(190);
  });

  test('88l a repeated succeeded webhook does not change the balance twice', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    const refundId = `re_spec88_succeeded_${Date.now()}`;

    await applyStripeStatus(db, paymentId, refundId, 'succeeded');
    expect(await paymentStatus(db, paymentId)).toBe('refunded');
    expect(await balanceOf(db, userId)).toBe(190);

    // Druhé doručení téže události.
    await applyStripeStatus(db, paymentId, refundId, 'succeeded');
    expect(await paymentStatus(db, paymentId)).toBe('refunded');
    expect(await balanceOf(db, userId)).toBe(190);
    expect(await refundDebitRows(db, paymentId)).toHaveLength(1);
    expect(await refundReversalRows(db, paymentId)).toHaveLength(0);

    // Pozdní `failed` událost nesmí dokončenou refundaci vzít zpět.
    const { data: late } = await db.rpc('reverse_failed_stripe_refund', {
      p_payment_id: paymentId,
      p_stripe_status: 'failed',
    });
    expect(late.ok).toBe(false);
    expect(late.code).toBe('already_refunded');
    expect(await paymentStatus(db, paymentId)).toBe('refunded');
    expect(await balanceOf(db, userId)).toBe(190);
  });

  test('88m a second stripe refund id for the same payment is rejected', async () => {
    const db = admin();
    const { paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    const firstId = `re_spec88_first_${Date.now()}`;
    await applyStripeStatus(db, paymentId, firstId, 'pending');

    const { data } = await db.rpc('record_stripe_refund_status', {
      p_payment_id: paymentId,
      p_refund_id: `re_spec88_second_${Date.now()}`,
      p_status: 'pending',
    });

    expect(data.ok).toBe(false);
    expect(data.code).toBe('refund_id_conflict');
    expect((await paymentRefundFields(db, paymentId))?.stripe_refund_id).toBe(firstId);
  });

  test('88d finalize completes refund_pending and is safe to repeat', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    // Dokončit lze jen refundaci, kterou Stripe potvrdil jako `succeeded`.
    await db.rpc('record_stripe_refund_status', {
      p_payment_id: paymentId,
      p_refund_id: `re_spec88_final_${Date.now()}`,
      p_status: 'succeeded',
    });

    const first = await db.rpc('finalize_stripe_refund', { p_payment_id: paymentId });
    expect(first.error).toBeNull();
    expect(first.data.ok).toBe(true);
    expect(first.data.already_final).toBe(false);
    expect(await paymentStatus(db, paymentId)).toBe('refunded');

    const second = await db.rpc('finalize_stripe_refund', { p_payment_id: paymentId });
    expect(second.error).toBeNull();
    expect(second.data.ok).toBe(true);
    expect(second.data.already_final).toBe(true);

    // Dokončení nesmí sáhnout na peníze ani ledger.
    expect(await balanceOf(db, userId)).toBe(190);
    expect(await refundDebitRows(db, paymentId)).toHaveLength(1);
  });

  test('88e a refunded payment cannot be refunded again', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    await applyStripeStatus(db, paymentId, `re_spec88_done_${Date.now()}`, 'succeeded');

    const { data, error } = await db.rpc('prepare_stripe_refund', { p_payment_id: paymentId });
    expect(error).toBeNull();
    expect(data.ok).toBe(false);
    expect(data.code).toBe('already_refunded');

    expect(await balanceOf(db, userId)).toBe(190);
    expect(await refundDebitRows(db, paymentId)).toHaveLength(1);
  });

  test('88f refund helpers are not callable by anon or authenticated clients', async () => {
    const anon = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const prepare = await anon.rpc('prepare_stripe_refund', {
      p_payment_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(prepare.error).not.toBeNull();

    const finalize = await anon.rpc('finalize_stripe_refund', {
      p_payment_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(finalize.error).not.toBeNull();
  });

  test('88g legacy admin_manage_payment refuses the refund operation', async () => {
    const db = admin();
    const { userId, paymentId } = await seedPayment(db, 500, 310);

    const { error } = await db.rpc('admin_manage_payment', {
      p_payment_id: paymentId,
      p_new_status: null,
      p_operation: 'refund',
    });

    expect(error).not.toBeNull();
    expect(String(error?.message)).toContain('zakázána');

    // Žádné MioCoiny nesmí přibýt.
    expect(await balanceOf(db, userId)).toBe(500);
    expect(await paymentStatus(db, paymentId)).toBe('completed');
  });
});
