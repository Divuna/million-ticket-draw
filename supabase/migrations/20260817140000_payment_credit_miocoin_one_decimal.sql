-- MioCoin one-decimal rule — follow-up 2/2: the payment → MioCoin → wallet path.
--
-- WHAT payments.amount ACTUALLY IS (verified read-only, production, 16. 08. 2026)
--   payments.amount is a MIOCOIN QUANTITY, not a CZK amount.
--   supabase/functions/stripe-webhook/index.ts:
--       priceCzk      = session.amount_total / 100      (whole CZK, enforced)
--       coinsToCredit = miocoinsForCzkPrice(priceCzk)   (50→50, 300→310, 500→525,
--                                                        1200→1280, otherwise 1:1)
--       payments.insert({ amount: coinsToCredit, ... })
--   The CZK price is never stored in `payments`; it stays in Stripe. The column is
--   numeric(18,2) purely for historical reasons.
--
--   Because the webhook rejects any amount_total that is not a whole CZK amount,
--   coinsToCredit is always an integer. All 136 real payments (method 'stripe' /
--   'stripe_test') are whole numbers. The only two non-conforming rows are
--   method='test' and method='test_crud', both amount=999.99 — synthetic test data.
--
-- WHY THIS MIGRATION EXISTS ANYWAY
--   Nothing between `payments` and `wallets` normalises the value, so any writer of
--   `payments` other than the Stripe webhook (manual admin insert, a future payment
--   method, a test harness) can put a 2-decimal MioCoin figure straight into
--   wallets.balance_coins. That is exactly how wallet_transactions grew its
--   999.99 MC row. We fix the FUTURE source; historical rows are untouched.
--
-- THREE MIOCOIN QUANTITIES ARE DERIVED FROM payments.amount — all three normalised:
--   1. update_wallet_after_payment        — the top-up credit
--   2. prepare_stripe_refund              — the refund debit (MUST stay symmetric
--                                           with 1, otherwise a refund would leave a
--                                           fractional residue in the wallet)
--   3. create_referral_reward_from_payment — referral_rewards.reward_mc, which used
--                                           ROUND(amount * 0.05, 2). The live 500 Kč
--                                           package (525 MC) produced 26.25 MC — a
--                                           real, non-test violation. reward_mc does
--                                           reach a wallet via try_credit_wallet_mc
--                                           (reverse_failed_stripe_refund) and the
--                                           admin payout flow.
--
-- MONEY IS NOT TOUCHED
--   No CZK value is constrained or re-rounded. payments.amount keeps numeric(18,2)
--   and gets NO CHECK constraint: adding one would fail on the two existing test
--   rows, and the confirmed decision is that test data is reset before launch rather
--   than migrated. Invoice money, VAT and price_per_coin keep 2 decimals.
--
-- EXISTING DATA IS NOT CHANGED
--   This migration only replaces function bodies. It performs no UPDATE, no DELETE
--   and no backfill. The two 999.99 test payments, the 999.99 wallet transaction,
--   the 10117.91 wallet balance and the one 2-decimal referral_rewards row all stay
--   exactly as they are. For every real payment round(x, 1) = x, so behaviour is
--   unchanged for all genuine data.
--
-- Rollback: restore the three function bodies from their previous definitions
--   (captured in onemil_history.md, 16. 08. 2026).

begin;

-- ── 1. Top-up credit ─────────────────────────────────────────────────────────
-- Only change: NEW.amount is normalised once into v_coins, and v_coins is what
-- reaches wallets.balance_coins and wallet_transactions.amount. Status handling,
-- idempotency and the ledger shape are untouched.

CREATE OR REPLACE FUNCTION public.update_wallet_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_id   uuid;
  v_new_balance numeric;
  v_coins       numeric;
BEGIN
  -- 1. Připisuje se výhradně dokončená platba.
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  -- 2. Nekladná nebo chybějící částka se ignoruje.
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- 2b. MioCoin pravidlo: do peněženky smí vstoupit hodnota s max. 1 desetinným
  --     místem. payments.amount JE počet MioCoinů (viz hlavička migrace), takže
  --     se normalizuje právě tady, jednou, těsně před zápisem. Pro každou reálnou
  --     Stripe platbu je round(x, 1) = x, chování se tedy nemění.
  v_coins := round(NEW.amount, 1);

  IF v_coins <= 0 THEN
    RETURN NEW;
  END IF;

  -- 3. Idempotence — pro tuto platbu už kredit i historie existují.
  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions
    WHERE reference_id = NEW.id
      AND type = 'payment_credit'
  ) THEN
    RETURN NEW;
  END IF;

  -- 4. Připsání na peněženku; chybějící peněženka se založí.
  INSERT INTO public.wallets (user_id, balance_coins, created_at)
  VALUES (NEW.user_id, v_coins, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance_coins = public.wallets.balance_coins + EXCLUDED.balance_coins
  RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;

  -- 5. Právě jeden řádek účetní historie.
  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    NEW.user_id,
    v_wallet_id,
    v_coins,
    v_new_balance,
    'payment_credit',
    'update_wallet_after_payment',
    NEW.id,
    jsonb_build_object(
      'method',             NEW.method,
      'payment_status',     NEW.status,
      'payment_created_at', NEW.created_at,
      'payment_amount',     NEW.amount,
      'credited_mc',        v_coins
    )
  );

  RETURN NEW;
END;
$$;

-- ── 2. Refund debit ──────────────────────────────────────────────────────────
-- Only change: the debited MioCoin amount is normalised the same way the credit is.
-- Credit and debit MUST use the identical normalisation, otherwise refunding a
-- payment whose amount had two decimals would leave a fractional residue behind.
-- Everything else — locking, idempotency, status transitions, error codes — is
-- byte-for-byte the previous behaviour.

CREATE OR REPLACE FUNCTION public.prepare_stripe_refund(p_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment      public.payments%rowtype;
  v_wallet_id    uuid;
  v_balance      numeric;
  v_new_balance  numeric;
  v_already      boolean := false;
  v_debit        numeric;
BEGIN
  IF p_payment_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'Chybí ID platby.'
    );
  END IF;

  -- Zámek platby pro celou dobu transakce.
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'Platba nebyla nalezena.'
    );
  END IF;

  IF v_payment.status = 'refunded' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'already_refunded',
      'message', 'Platba už byla refundována.'
    );
  END IF;

  -- Neúspěšná Stripe refundace se NIKDY nespouští znovu automaticky.
  -- Platba je sice zpátky `completed`, ale evidovaná refundace to prozradí.
  IF v_payment.stripe_refund_id IS NOT NULL
     AND v_payment.stripe_refund_status IN ('failed', 'canceled') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'refund_failed_needs_manual_review',
      'message', 'Předchozí refundace u Stripe selhala. Je nutná ruční kontrola, automatické opakování není povolené.'
    );
  END IF;

  -- Povolen je jen první pokus (`completed`) nebo bezpečné zopakování
  -- rozpracované refundace (`refund_pending`).
  IF v_payment.status NOT IN ('completed', 'refund_pending') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'message', 'Refundovat lze jen dokončenou platbu.'
    );
  END IF;

  IF v_payment.stripe_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'missing_stripe_session',
      'message', 'K této platbě chybí Stripe session, refundaci nelze provést.'
    );
  END IF;

  IF v_payment.amount IS NULL OR v_payment.amount <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_amount',
      'message', 'Platba nemá kladnou částku.'
    );
  END IF;

  -- Stejná normalizace jako u kreditu v update_wallet_after_payment — jinak by
  -- refundace platby s dvěma desetinnými místy nechala v peněžence zbytek.
  v_debit := round(v_payment.amount, 1);

  -- Už jednou odečteno? Pak se MioCoiny nesmí odečíst podruhé.
  SELECT true INTO v_already
  FROM public.wallet_transactions
  WHERE reference_id = p_payment_id
    AND type = 'refund_debit'
  LIMIT 1;

  v_already := COALESCE(v_already, false);

  IF NOT v_already THEN
    -- Zámek peněženky ve stejné transakci jako zámek platby.
    SELECT id, balance_coins INTO v_wallet_id, v_balance
    FROM public.wallets
    WHERE user_id = v_payment.user_id
    FOR UPDATE;

    -- Chybějící peněženka i nedostatečný zůstatek = stejný obchodní výsledek:
    -- část MioCoinů už není k dispozici, refundace se nesmí spustit.
    IF v_wallet_id IS NULL OR v_balance < v_debit THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'insufficient_balance',
        'message', 'Refundaci nelze provést, protože část MioCoinů z této platby již byla použita.'
      );
    END IF;

    -- Odečte se přesně celá připsaná částka, nikdy méně.
    UPDATE public.wallets
    SET balance_coins = balance_coins - v_debit
    WHERE id = v_wallet_id
    RETURNING balance_coins INTO v_new_balance;

    INSERT INTO public.wallet_transactions (
      user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
    ) VALUES (
      v_payment.user_id,
      v_wallet_id,
      -v_debit,
      v_new_balance,
      'refund_debit',
      'prepare_stripe_refund',
      p_payment_id,
      jsonb_build_object(
        'payment_status_before', v_payment.status,
        'debited',               v_debit
      )
    );
  END IF;

  -- Stav se posouvá jen z `completed`; opakování na `refund_pending` nechává beze změny.
  IF v_payment.status = 'completed' THEN
    UPDATE public.payments
    SET status = 'refund_pending',
        refund_updated_at = now()
    WHERE id = p_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',                true,
    'already_prepared',  v_already,
    'payment_id',        p_payment_id,
    'user_id',           v_payment.user_id,
    'amount',            v_payment.amount,
    'stripe_session_id', v_payment.stripe_session_id,
    'stripe_refund_id',  v_payment.stripe_refund_id,
    'status',            'refund_pending'
  );
END;
$$;

-- ── 3. Referral reward derived from a payment ────────────────────────────────
-- Only change: ROUND(NEW.amount * v_rate, 2) → ROUND(..., 1).
--
-- reward_mc is a MIOCOIN quantity, not money — it is credited into
-- wallets.balance_coins through try_credit_wallet_mc — so the 2-decimal rounding
-- was a genuine rule violation on a live path: the 500 Kč package credits 525 MC,
-- and 525 * 0.05 = 26.25 MC. The commission RATE (0.05) is unchanged; no new
-- business rate or MioCoin price is introduced here.

CREATE OR REPLACE FUNCTION public.create_referral_reward_from_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_referrer uuid;
  v_rate numeric := 0.05;
  v_reward numeric;
  v_min_topup numeric := COALESCE(
    current_setting('app.referral.min_topup_mc', true)::numeric,
    0
  );
BEGIN
  -- only completed payments
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- minimum topup check (SAFE)
  IF NEW.amount < v_min_topup THEN
    RETURN NEW;
  END IF;

  -- find referrer
  SELECT referrer_user_id
  INTO v_referrer
  FROM referrals
  WHERE referred_user_id = NEW.user_id
    AND status = 'active';

  IF v_referrer IS NULL THEN
    RETURN NEW;
  END IF;

  -- calculate reward — MioCoin quantity, so ONE decimal place (not two).
  v_reward := ROUND(NEW.amount * v_rate, 1);

  INSERT INTO referral_rewards (
    referrer_user_id,
    referred_user_id,
    payment_id,
    payment_stripe_session_id,
    paid_amount_mc,
    commission_rate,
    reward_mc,
    status,
    created_at
  )
  VALUES (
    v_referrer,
    NEW.user_id,
    NEW.id,
    NEW.stripe_session_id,
    NEW.amount,
    v_rate,
    v_reward,
    'earned',
    now()
  )
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN NEW;
END;
$$;

commit;
