/**
 * Spec 87 — kontrakt zpevněných Stripe refundací (statická kontrola zdrojů)
 *
 * Běží všude, nepotřebuje databázi ani síť a **nikdy nevolá Stripe**.
 * Chování proti reálné databázi ověřuje staging-only spec 88.
 */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const MIGRATION = 'supabase/migrations/20260803090000_harden_stripe_refund_flow.sql';
const EDGE_FUNCTION = 'supabase/functions/stripe-refund/index.ts';
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

  test('refund helper functions are restricted to service role', () => {
    const migration = read(MIGRATION);

    for (const signature of [
      'public.prepare_stripe_refund(uuid)',
      'public.finalize_stripe_refund(uuid)',
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
    expect(migration).toContain("SET status = 'refunded'");

    // Dokončení nesmí sahat na peníze.
    const finalizeBody = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.finalize_stripe_refund'),
      migration.indexOf('-- 4. Granty nových funkcí'),
    );
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

    // Autorizace zůstává: JWT + role administrátora.
    expect(edge).toContain('supabaseClient.auth.getUser(token)');
    expect(edge).toContain("'Forbidden: admin role required'");
  });

  test('edge function never reports success when the wallet or status step fails', () => {
    const edge = read(EDGE_FUNCTION);

    const successIndex = edge.indexOf('success: true');
    const finalizeFailIndex = edge.indexOf("code: 'finalize_failed'");
    expect(finalizeFailIndex).toBeGreaterThan(-1);
    expect(finalizeFailIndex).toBeLessThan(successIndex);

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

  test('admin payments page exposes refund_pending and blocks repeated clicks', () => {
    const page = read(ADMIN_PAGE);

    expect(page).toContain("case \"refund_pending\":");
    expect(page).toContain('Refundace čeká');
    expect(page).toContain("payment.status === 'refund_pending'");
    expect(page).toContain('Dokončit refundaci');
    expect(page).toContain('disabled={refundingPaymentId !== null}');
    expect(page).toContain('setRefundingPaymentId(paymentId)');
    expect(page).toContain('setRefundingPaymentId(null)');

    // Chyba ze serveru se zobrazuje uživateli beze změny textu.
    expect(page).toContain("throw new Error(result.error");
    expect(page).toContain("variant: 'destructive'");
  });
});
