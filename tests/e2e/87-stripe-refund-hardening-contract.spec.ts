/**
 * Spec 87 — kontrakt zpevněných Stripe refundací (statická kontrola zdrojů)
 *
 * Běží všude, nepotřebuje databázi ani síť a **nikdy nevolá Stripe**.
 * Chování proti reálné databázi ověřuje staging-only spec 88.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Konce řádků se normalizují — na Windows git checkoutuje CRLF a víceřádkové
// aserce by kvůli tomu selhaly.
const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

const MIGRATION = 'supabase/migrations/20260803090000_harden_stripe_refund_flow.sql';
const EDGE_FUNCTION = 'supabase/functions/stripe-refund/index.ts';
const WEBHOOK = 'supabase/functions/stripe-webhook/index.ts';
const ADMIN_PAGE = 'src/pages/AdminPayments.tsx';

const INSUFFICIENT_MESSAGE =
  'Refundaci nelze provést, protože část MioCoinů z této platby již byla použita.';

test.describe('stripe refund hardening contract', () => {
  test('prepare_stripe_refund locks the payment and wallet and requires the full balance', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.prepare_stripe_refund(p_payment_id uuid)');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path TO 'public'");

    // Zámek platby i peněženky ve stejné transakci.
    expect(migration).toContain('FROM public.payments\n  WHERE id = p_payment_id\n  FOR UPDATE');
    expect(migration).toContain('FROM public.wallets\n    WHERE user_id = v_payment.user_id\n    FOR UPDATE');

    // Povolen jen první pokus nebo zopakování rozpracované refundace.
    expect(migration).toContain("IF v_payment.status NOT IN ('completed', 'refund_pending') THEN");

    // Nedostatek MioCoinů zastaví refundaci přesně definovanou hláškou.
    expect(migration).toContain('v_wallet_id IS NULL OR v_balance < v_payment.amount');
    expect(migration).toContain(INSUFFICIENT_MESSAGE);
    expect(migration).toContain("'insufficient_balance'");

    // Odečítá se přesná celá částka, nikdy ořezaný zbytek.
    expect(migration).toContain('SET balance_coins = balance_coins - v_payment.amount');
    expect(migration).not.toContain('GREATEST(0, v_balance - v_payment.amount)');
  });

  test('prepare_stripe_refund writes exactly one negative refund_debit row with reference_id', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain("'refund_debit'");
    expect(migration).toContain("'prepare_stripe_refund'");
    expect(migration).toContain('-v_payment.amount');
    expect(migration).toContain('p_payment_id,'); // reference_id

    // Druhý běh už neodečítá.
    expect(migration).toContain('IF NOT v_already THEN');
    expect(migration).toContain("AND type = 'refund_debit'");

    // Databázová pojistka proti dvěma odečtům pro jednu platbu.
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_refund_debit_per_payment');
    expect(migration).toContain("WHERE type = 'refund_debit' AND reference_id IS NOT NULL");
  });

  test('payments table stores the stripe refund id, status and timestamp', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS stripe_refund_id text');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS stripe_refund_status text');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS refund_updated_at timestamptz');

    // Stripe refund ID musí být unikátní, pokud není NULL.
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uniq_payments_stripe_refund_id');
    expect(migration).toContain('WHERE stripe_refund_id IS NOT NULL');

    // Uložení stavu nikdy nesmí sáhnout na peníze ani na stav platby.
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.record_stripe_refund_status(');
    const recordBody = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.record_stripe_refund_status('),
      migration.indexOf('COMMENT ON FUNCTION public.record_stripe_refund_status'),
    );
    expect(recordBody).not.toContain('public.wallets');
    expect(recordBody).not.toContain('wallet_transactions');
    expect(recordBody).not.toContain("SET status =");
    expect(recordBody).toContain("'refund_id_conflict'");

    // Přijímají se jen skutečné Stripe stavy.
    expect(recordBody).toContain("IF p_status NOT IN ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') THEN");
    expect(recordBody).toContain("'invalid_stripe_status'");

    // Terminální jsou VŠECHNY tři stavy — succeeded, failed i canceled.
    expect(recordBody).toContain("v_payment.stripe_refund_status IN ('succeeded', 'failed', 'canceled')");
    expect(recordBody).toContain('p_status IS DISTINCT FROM v_payment.stripe_refund_status');
    expect(recordBody).toContain("v_payment.status = 'refunded' AND p_status <> 'succeeded'");
    expect(recordBody).toContain("'terminal_state'");
    expect(recordBody).toContain("'ignored', true");

    // Ignorovaná událost vrací skutečně uložený stav, ne ten příchozí.
    expect(recordBody).toContain("'stripe_refund_status', v_payment.stripe_refund_status");
    expect(recordBody).toContain("'status', v_payment.status");
  });

  test('both edge functions branch on the effective status returned by the database', () => {
    const edge = read(EDGE_FUNCTION);
    const webhook = read(WEBHOOK);

    for (const source of [edge, webhook]) {
      expect(source).toContain('const effectiveStatus = rec.stripe_refund_status ?? refundStatus');
      expect(source).toContain("effectiveStatus === 'failed' || effectiveStatus === 'canceled'");
      expect(source).toContain('p_stripe_status: effectiveStatus');
    }

    // Po uložení stavu se už nikde nevětví podle příchozí proměnné.
    const edgeAfterRecord = edge.slice(edge.indexOf('const effectiveStatus'));
    expect(edgeAfterRecord).not.toContain("refundStatus === 'failed'");
    expect(edgeAfterRecord).not.toContain("refundStatus === 'pending'");
    expect(edgeAfterRecord).not.toContain("refundStatus !== 'succeeded'");

    const webhookAfterRecord = webhook.slice(
      webhook.indexOf('const effectiveStatus'),
      webhook.indexOf('serve(async (req)'),
    );
    expect(webhookAfterRecord).not.toContain("refundStatus === 'succeeded'");
    expect(webhookAfterRecord).not.toContain("refundStatus === 'failed'");

    // Ignorovaná starší událost se jen potvrdí, webhook kvůli ní nevrací 500.
    expect(webhook).toContain('refund_event_ignored_terminal');
    expect(webhook).toContain('return { handled: true }');
  });

  test('finalize refuses to complete without a succeeded stripe refund', () => {
    const migration = read(MIGRATION);

    const finalizeBody = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.finalize_stripe_refund'),
      migration.indexOf('COMMENT ON FUNCTION public.finalize_stripe_refund'),
    );

    // Databáze nedůvěřuje Edge Function — kontroluje si obojí sama.
    expect(finalizeBody).toContain('IF v_payment.stripe_refund_id IS NULL THEN');
    expect(finalizeBody).toContain("'missing_stripe_refund_id'");
    expect(finalizeBody).toContain("IF v_payment.stripe_refund_status IS DISTINCT FROM 'succeeded' THEN");
    expect(finalizeBody).toContain("'stripe_refund_not_succeeded'");
  });

  test('failed or canceled refunds restore MioCoins, the referral reward and the completed payment', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.reverse_failed_stripe_refund(');

    const reverseBody = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.reverse_failed_stripe_refund('),
      migration.indexOf('COMMENT ON FUNCTION public.reverse_failed_stripe_refund'),
    );

    // Přijímají se jen skutečné neúspěšné Stripe stavy.
    expect(reverseBody).toContain("p_stripe_status NOT IN ('failed', 'canceled')");
    expect(reverseBody).toContain("'invalid_stripe_status'");

    // Právě jeden kladný ledger řádek se správným typem, zdrojem a referencí.
    expect(reverseBody).toContain("'refund_reversal'");
    expect(reverseBody).toContain("'reverse_failed_stripe_refund'");

    // Opakovaná událost končí bezpečným ok:true bez další změny peněz i odměny,
    // ale platbu nikdy nenechá viset v `refund_pending`.
    expect(reverseBody).toContain("'already_reversed',   true");
    const alreadyBranch = reverseBody.slice(
      reverseBody.indexOf('IF COALESCE(v_already, false) THEN'),
      reverseBody.indexOf("-- První reverze smí proběhnout"),
    );
    expect(alreadyBranch).toContain("IF v_payment.status <> 'completed' THEN");
    expect(alreadyBranch).toContain("SET status               = 'completed'");
    expect(alreadyBranch).toContain("WHEN v_payment.stripe_refund_status IN ('failed', 'canceled')");
    expect(alreadyBranch).not.toContain('wallet_transactions');
    expect(alreadyBranch).not.toContain('referral_rewards');
    expect(alreadyBranch).not.toContain('try_credit_wallet_mc');

    // První reverze smí proběhnout jen z rozpracované refundace.
    expect(reverseBody).toContain("IF v_payment.status <> 'refund_pending' THEN");

    // Vrací se přesně to, co bylo odečteno, a jen když odečet existoval.
    expect(reverseBody).toContain("AND type = 'refund_debit'");
    expect(reverseBody).toContain("'nothing_to_reverse'");

    // Dokončenou refundaci nelze vzít zpět.
    expect(reverseBody).toContain("IF v_payment.status = 'refunded' THEN");

    // Obnova doporučovací odměny stornované přechodem completed -> refund_pending.
    expect(reverseBody).toContain('FROM public.referral_rewards');
    expect(reverseBody).toContain("AND status = 'reversed'");
    expect(reverseBody).toContain("AND reverse_reason = 'payment_status_changed:refund_pending'");
    expect(reverseBody).toContain('FOR UPDATE');
    expect(reverseBody).toContain("SET status         = 'earned'");
    expect(reverseBody).toContain('reversed_at    = NULL');
    expect(reverseBody).toContain('reverse_reason = NULL');
    // Poziční dvouargumentové volání je v produkci nejednoznačné (42725) —
    // pojmenovaný argument váže právě booleanovou variantu (uuid, numeric).
    expect(reverseBody).toContain('public.try_credit_wallet_mc(p_user_id => v_referrer, p_amount_mc => v_reward_mc)');
    expect(reverseBody).not.toContain('try_credit_wallet_mc(v_referrer, v_reward_mc)');
    expect(reverseBody).toContain('RAISE EXCEPTION');

    // Platba se vrací mezi dokončené — peníze zákazníkovi vráceny nebyly.
    expect(reverseBody).toContain("SET status               = 'completed'");
    expect(reverseBody).toContain('stripe_refund_status = p_stripe_status');
    expect(reverseBody).not.toContain("'refund_failed'");

    // Databázová pojistka proti dvojímu vrácení.
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_refund_reversal_per_payment');
    expect(migration).toContain("WHERE type = 'refund_reversal' AND reference_id IS NOT NULL");
  });

  test('a payment with a failed stripe refund cannot be refunded automatically again', () => {
    const migration = read(MIGRATION);

    const prepareBody = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.prepare_stripe_refund'),
      migration.indexOf('COMMENT ON FUNCTION public.prepare_stripe_refund'),
    );

    expect(prepareBody).toContain('IF v_payment.stripe_refund_id IS NOT NULL');
    expect(prepareBody).toContain("AND v_payment.stripe_refund_status IN ('failed', 'canceled') THEN");
    expect(prepareBody).toContain("'refund_failed_needs_manual_review'");
    expect(prepareBody).toContain('ruční kontrola');

    // Trvalý stav `refund_failed` už neexistuje.
    expect(migration).not.toContain("status = 'refund_failed'");
  });

  test('refund helper functions are restricted to service role', () => {
    const migration = read(MIGRATION);

    for (const signature of [
      'public.prepare_stripe_refund(uuid)',
      'public.record_stripe_refund_status(uuid, text, text)',
      'public.finalize_stripe_refund(uuid)',
      'public.reverse_failed_stripe_refund(uuid, text)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM authenticated`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`);
    }
  });

  test('finalize_stripe_refund only moves the status and is safe to repeat', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.finalize_stripe_refund(p_payment_id uuid)');
    expect(migration).toContain("IF v_payment.status = 'refunded' THEN");
    expect(migration).toContain("'already_final', true");
    expect(migration).toContain("IF v_payment.status <> 'refund_pending' THEN");

    // Dokončení mění jen stav a nesmí sahat na peníze.
    const finalizeBody = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.finalize_stripe_refund'),
      migration.indexOf('COMMENT ON FUNCTION public.finalize_stripe_refund'),
    );
    expect(finalizeBody).toContain('UPDATE public.payments');
    expect(finalizeBody).toContain("'refunded'");
    expect(finalizeBody).not.toContain('public.wallets');
    expect(finalizeBody).not.toContain('wallet_transactions');
  });

  test('legacy admin_manage_payment can no longer refund or credit wallets', () => {
    const migration = read(MIGRATION);

    expect(migration).toContain("IF p_operation = 'refund' THEN");
    expect(migration).toContain('Refundace přes admin_manage_payment je zakázána');

    const adminFunction = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.admin_manage_payment'),
      migration.indexOf('COMMENT ON FUNCTION public.admin_manage_payment'),
    );
    // Vykonatelný kód už nesmí zapisovat kreditní řádek ani přičítat zůstatek.
    // (Zmínka v komentáři popisuje jen starou chybu.)
    expect(adminFunction).not.toContain("'admin_refund_credit'");
    expect(adminFunction).not.toContain('balance_coins + v_old_record.amount');
    expect(adminFunction).not.toContain('INSERT INTO public.wallet_transactions');
    expect(adminFunction).not.toContain('INSERT INTO public.wallets');

    // Ostatní funkčnost (změna stavu) zůstává.
    expect(adminFunction).toContain("IF p_operation = 'update_status' AND p_new_status IS NOT NULL THEN");

    expect(migration).toContain('REVOKE ALL ON FUNCTION public.admin_manage_payment(uuid, text, text) FROM PUBLIC');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.admin_manage_payment(uuid, text, text) FROM anon');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.admin_manage_payment(uuid, text, text) FROM authenticated');
  });

  test('edge function prepares the refund before Stripe and uses an idempotency key', () => {
    const edge = read(EDGE_FUNCTION);

    const prepareIndex = edge.indexOf("'prepare_stripe_refund'");
    const stripeIndex = edge.indexOf('stripe.refunds.create');
    expect(prepareIndex).toBeGreaterThan(-1);
    expect(stripeIndex).toBeGreaterThan(-1);
    expect(prepareIndex).toBeLessThan(stripeIndex);

    expect(edge).toContain('idempotencyKey: `onemil-refund-${paymentId}`');
    expect(edge).toContain("'finalize_stripe_refund'");

    // Metadata obsahují jen ID platby — žádné osobní údaje ani session ID.
    expect(edge).toContain('metadata: { onemil_payment_id: paymentId }');

    // Autorizace zůstává: JWT + role administrátora.
    expect(edge).toContain('supabaseClient.auth.getUser(token)');
    expect(edge).toContain("'Forbidden: admin role required'");
  });

  test('edge function branches on every stripe refund status', () => {
    const edge = read(EDGE_FUNCTION);

    // succeeded → uložit stav, dokončit, teprve pak 200.
    const recordIndex = edge.indexOf("'record_stripe_refund_status'");
    const finalizeIndex = edge.indexOf("'finalize_stripe_refund'");
    const successIndex = edge.indexOf("status: 'refunded'");
    expect(recordIndex).toBeGreaterThan(-1);
    expect(recordIndex).toBeLessThan(finalizeIndex);
    expect(finalizeIndex).toBeLessThan(successIndex);

    // pending / requires_action → 202, bez finalize.
    expect(edge).toContain("if (effectiveStatus === 'pending' || effectiveStatus === 'requires_action')");
    expect(edge).toContain('Refundace byla přijata a čeká na dokončení u Stripe.');
    expect(edge).toContain('202,');

    // failed / canceled → vrácení MioCoinů, platba zpět na completed, nikdy refunded.
    expect(edge).toContain("if (effectiveStatus === 'failed' || effectiveStatus === 'canceled')");
    expect(edge).toContain("'reverse_failed_stripe_refund'");
    expect(edge).toContain("code: 'stripe_refund_failed'");
    expect(edge).toContain("status: 'completed'");
    expect(edge).not.toContain("'refund_failed'");

    const failedBranch = edge.slice(
      edge.indexOf("if (refundStatus === 'failed' || refundStatus === 'canceled')"),
      edge.indexOf("if (refundStatus === 'pending' || refundStatus === 'requires_action')"),
    );
    expect(failedBranch).not.toContain("'finalize_stripe_refund'");
  });

  test('a known stripe refund id is retrieved instead of created again', () => {
    const edge = read(EDGE_FUNCTION);

    expect(edge).toContain('const knownRefundId = prep.stripe_refund_id ?? null');
    expect(edge).toContain('if (knownRefundId) {');
    expect(edge).toContain('stripe.refunds.retrieve(knownRefundId)');

    // Nový create běží jen ve větvi bez známého refund ID.
    const createBranch = edge.slice(edge.indexOf('} else {'), edge.indexOf('} catch (stripeError)'));
    expect(createBranch).toContain('stripe.refunds.create');
    expect(createBranch).toContain('idempotencyKey');

    const retrieveBranch = edge.slice(edge.indexOf('if (knownRefundId) {'), edge.indexOf('} else {'));
    expect(retrieveBranch).not.toContain('stripe.refunds.create');
  });

  test('webhook handles refund events idempotently and keeps checkout flow intact', () => {
    const webhook = read(WEBHOOK);

    // Podpis zůstává povinný.
    expect(webhook).toContain('stripe.webhooks.constructEventAsync(body, signature, webhookSecret)');
    expect(webhook).toContain('Webhook signature verification failed');

    // Původní tok checkout.session.completed beze změny.
    expect(webhook).toContain("if (event.type === 'checkout.session.completed')");
    expect(webhook).toContain('Payment already processed');
    expect(webhook).toContain("status: 'completed'");

    // Nové refundační události.
    expect(webhook).toContain("REFUND_EVENT_TYPES = new Set(['refund.created', 'refund.updated', 'refund.failed'])");
    expect(webhook).toContain('refund.metadata?.onemil_payment_id');
    expect(webhook).toContain("'record_stripe_refund_status'");
    expect(webhook).toContain("'finalize_stripe_refund'");
    expect(webhook).toContain("'reverse_failed_stripe_refund'");

    // Rozpad podle EFEKTIVNÍHO stavu: succeeded finalizuje, failed/canceled vrací,
    // ostatní jen aktualizuje.
    expect(webhook).toContain("if (effectiveStatus === 'succeeded')");
    expect(webhook).toContain("if (effectiveStatus === 'failed' || effectiveStatus === 'canceled')");
    expect(webhook).toContain('refund_still_pending');

    // Refundační větev nesmí sahat na peněženku přímo — jen přes jištěné RPC.
    const refundHandler = webhook.slice(
      webhook.indexOf('async function handleRefundEvent('),
      webhook.indexOf('serve(async (req)'),
    );
    expect(refundHandler).not.toContain("from('wallets')");
    expect(refundHandler).not.toContain("from('wallet_transactions')");
  });

  test('edge function never reports success when the wallet or status step fails', () => {
    const edge = read(EDGE_FUNCTION);

    // Finální 200 odpověď smí přijít až po úspěšném finalize.
    const finalSuccessIndex = edge.indexOf("message: 'Platba byla refundována a MioCoiny odečteny.'");
    const finalizeFailIndex = edge.indexOf("code: 'finalize_failed'");
    expect(finalSuccessIndex).toBeGreaterThan(-1);
    expect(finalizeFailIndex).toBeGreaterThan(-1);
    expect(finalizeFailIndex).toBeLessThan(finalSuccessIndex);

    // Nejasná Stripe chyba nechává platbu rozpracovanou pro bezpečné zopakování.
    expect(edge).toContain("code: 'stripe_call_failed'");
    expect(edge).toContain("status: 'refund_pending'");

    // Chybová větev přípravy musí vracet chybu, ne úspěch.
    expect(edge).toContain('if (!prep || prep.ok !== true)');
  });

  test('edge function does not log stripe session ids, tokens or personal data', () => {
    const edge = read(EDGE_FUNCTION);

    const logLines = edge
      .split('\n')
      .filter((line) => line.includes('console.log') || line.includes('console.error') || line.includes('console.warn'));

    expect(logLines.length).toBeGreaterThan(0);
    for (const line of logLines) {
      expect(line).not.toContain('stripe_session_id');
      expect(line).not.toContain('sessionId');
      expect(line).not.toContain('token');
      expect(line).not.toContain('email');
    }

    // Audit log ukládá jen ID platby a refundace, ne Stripe session.
    const auditBlock = edge.slice(edge.indexOf("event: 'payment_refunded'"), edge.indexOf('if (auditError)'));
    expect(auditBlock).not.toContain('stripe_session_id');
    expect(auditBlock).toContain('stripe_refund_id');
  });

  test('admin payments page derives the failed refund state from the stripe status', () => {
    const page = read(ADMIN_PAGE);

    expect(page).toContain("case \"refund_pending\":");
    expect(page).toContain('Refundace čeká');
    expect(page).toContain('Refundace selhala');

    // Selhaná refundace se pozná z completed + stripe_refund_status,
    // nikoli z neexistujícího stavu `refund_failed`.
    expect(page).toContain("payment.status === 'completed' &&");
    expect(page).toContain("payment.stripe_refund_status === 'failed' || payment.stripe_refund_status === 'canceled'");
    expect(page).not.toContain("payment.status === 'refund_failed'");

    expect(page).toContain("payment.status === 'refund_pending'");
    expect(page).toContain('Ověřit stav refundace');

    // U selhané refundace nesmí být žádné tlačítko pro novou refundaci.
    expect(page).toContain('{!isFailedRefund(payment) &&');
    const failedBlock = page.slice(
      page.indexOf('{isFailedRefund(payment) && ('),
      page.indexOf('</TableCell>', page.indexOf('{isFailedRefund(payment) && (')),
    );
    expect(failedBlock).not.toContain('<Button');
    expect(failedBlock).toContain('Nutná ruční kontrola');

    // Platba zůstává mezi dokončenými, takže se dál počítá do tržeb.
    expect(page).toContain("summarizePaymentReporting(filteredPayments.filter(p => p.status === 'completed'))");

    expect(page).toContain('disabled={refundingPaymentId !== null}');
    expect(page).toContain('setRefundingPaymentId(paymentId)');
    expect(page).toContain('setRefundingPaymentId(null)');

    // Chyba ze serveru se zobrazuje uživateli beze změny textu.
    expect(page).toContain("throw new Error(result.error");
    expect(page).toContain("variant: 'destructive'");
  });
});
