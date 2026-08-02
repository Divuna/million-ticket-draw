-- =============================================================================
-- Zpevnění Stripe refundací
-- =============================================================================
--
-- STAV PŘED OPRAVOU (produkce xkzhjldrojjlrkezorey, ověřeno 03. 08. 2026):
--   * Administrace volá Edge Function `stripe-refund`, ta nejdřív vrátí peníze
--     přes Stripe a AŽ POTOM odečítá MioCoiny.
--   * `deduct_wallet_for_refund` při nedostatku MioCoinů odečte jen zbytek
--     (`GREATEST(0, balance - amount)`) a zůstatek omezí na nulu. Zákazník tak
--     může MioCoiny utratit a přesto získat celou platbu zpět.
--   * Selhání odečtu se pouze zaloguje — funkce i tak vrátí `success: true`.
--   * Stará `admin_manage_payment` má v refundní větvi opačné znaménko:
--     MioCoiny při refundaci **přičítá** a zapisuje `admin_refund_credit`.
--     Aktuální administrace ji nevolá (v produkci 0 řádků `admin_refund_credit`).
--
-- OBCHODNÍ PRAVIDLO (nové):
--   Refundaci lze zahájit pouze tehdy, když má uživatel v běžném zůstatku
--   alespoň celý počet MioCoinů připsaný danou platbou. Pokud část už použil,
--   refundace se zastaví JEŠTĚ PŘED voláním Stripe.
--
-- ROZSAH TÉTO MIGRACE:
--   1. parciální unikátní index — jedna platba = nejvýše jeden `refund_debit`
--   2. nová `public.prepare_stripe_refund(uuid)`  (service_role only)
--   3. nová `public.finalize_stripe_refund(uuid)` (service_role only)
--   4. `public.admin_manage_payment(...)` — refundní větev zablokována,
--      větev `update_status` beze změny; odebrán PUBLIC/anon/authenticated
--   5. `public.deduct_wallet_for_refund(...)` — ponechána beze změny funkce,
--      jen označena jako legacy; Edge Function ji už nevolá
--
-- POZNÁMKY KE SCHÉMATU (ověřeno proti produkci):
--   * `payments.status` je `text` BEZ CHECK constraintu → nový stav
--     `refund_pending` nevyžaduje změnu schématu.
--   * `wallet_transactions.amount` má `CHECK (amount <> 0)` → záporná částka
--     je povolená, nulová ne.
--   * V produkci neexistuje ani jeden řádek `refund_debit`, takže nový unikátní
--     index nemůže na existujících datech selhat.
--   * Na `payments` je trigger `trg_payments_referral_reverse`
--     (AFTER UPDATE OF status). Reverzi odměny za doporučení provede při
--     přechodu `completed → refund_pending`; následné `refund_pending → refunded`
--     už nic nereverzuje (podmínka `OLD.status = 'completed'`). Reverze tedy
--     proběhne právě jednou, jen o krok dřív než dosud.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Jedna platba = nejvýše jeden odečet MioCoinů za refundaci
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_refund_debit_per_payment
  ON public.wallet_transactions (reference_id)
  WHERE type = 'refund_debit' AND reference_id IS NOT NULL;

COMMENT ON INDEX public.uniq_wallet_tx_refund_debit_per_payment IS
  'Databázová pojistka: pro jednu platbu nemůže vzniknout druhý řádek refund_debit. Historické řádky bez reference_id index neblokuje.';

-- -----------------------------------------------------------------------------
-- 2. Příprava refundace — jediná operace, která odečítá MioCoiny
-- -----------------------------------------------------------------------------
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
    IF v_wallet_id IS NULL OR v_balance < v_payment.amount THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'insufficient_balance',
        'message', 'Refundaci nelze provést, protože část MioCoinů z této platby již byla použita.'
      );
    END IF;

    -- Odečte se přesně celá částka platby, nikdy méně.
    UPDATE public.wallets
    SET balance_coins = balance_coins - v_payment.amount
    WHERE id = v_wallet_id
    RETURNING balance_coins INTO v_new_balance;

    INSERT INTO public.wallet_transactions (
      user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
    ) VALUES (
      v_payment.user_id,
      v_wallet_id,
      -v_payment.amount,
      v_new_balance,
      'refund_debit',
      'prepare_stripe_refund',
      p_payment_id,
      jsonb_build_object(
        'payment_status_before', v_payment.status,
        'debited',               v_payment.amount
      )
    );
  END IF;

  -- Stav se posouvá jen z `completed`; opakování na `refund_pending` nechává beze změny.
  IF v_payment.status = 'completed' THEN
    UPDATE public.payments
    SET status = 'refund_pending'
    WHERE id = p_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',                true,
    'already_prepared',  v_already,
    'payment_id',        p_payment_id,
    'user_id',           v_payment.user_id,
    'amount',            v_payment.amount,
    'stripe_session_id', v_payment.stripe_session_id,
    'status',            'refund_pending'
  );
END;
$$;

COMMENT ON FUNCTION public.prepare_stripe_refund(uuid) IS
  'Připraví Stripe refundaci: zamkne platbu i peněženku, ověří celý zůstatek z dané platby, jednou odečte přesnou částku, založí právě jeden refund_debit s reference_id a posune platbu na refund_pending. Opakované volání už neodečítá. Určeno výhradně pro service_role (Edge Function stripe-refund).';

-- -----------------------------------------------------------------------------
-- 3. Dokončení refundace — pouze změna stavu, nikdy peníze
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_stripe_refund(p_payment_id uuid)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_payment public.payments%rowtype;
BEGIN
  IF p_payment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input');
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Opakované volání je bezpečné.
  IF v_payment.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'already_final', true, 'status', 'refunded');
  END IF;

  IF v_payment.status <> 'refund_pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_status', 'status', v_payment.status);
  END IF;

  UPDATE public.payments
  SET status = 'refunded'
  WHERE id = p_payment_id;

  RETURN jsonb_build_object('ok', true, 'already_final', false, 'status', 'refunded');
END;
$$;

COMMENT ON FUNCTION public.finalize_stripe_refund(uuid) IS
  'Dokončí refundaci posunem refund_pending -> refunded. Nikdy nemění zůstatky ani ledger. Idempotentní. Určeno výhradně pro service_role.';

-- -----------------------------------------------------------------------------
-- 4. Granty nových funkcí — jen service_role a vlastník
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.prepare_stripe_refund(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prepare_stripe_refund(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.prepare_stripe_refund(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_stripe_refund(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_stripe_refund(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_stripe_refund(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_stripe_refund(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_stripe_refund(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 5. Stará admin_manage_payment — refundní větev natvrdo zablokována
--    Větev `update_status`, audit, Sofinity událost i návratová hodnota
--    zůstávají beze změny.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_manage_payment(
  p_payment_id uuid,
  p_new_status text,
  p_operation text
)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id      uuid;
  v_old_record    payments%rowtype;
  v_new_record    payments%rowtype;
  v_user_email    text;
  v_payload       jsonb;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = v_admin_id AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat platby';
  END IF;

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'ID platby je povinné';
  END IF;

  -- Refundace zde už NIKDY neproběhne. Původní větev MioCoiny chybně
  -- PŘIČÍTALA (`admin_refund_credit`). Refundace patří výhradně do
  -- prepare_stripe_refund + Edge Function stripe-refund + finalize_stripe_refund.
  IF p_operation = 'refund' THEN
    RAISE EXCEPTION 'Refundace přes admin_manage_payment je zakázána. Použijte Stripe refundaci v administraci plateb.';
  END IF;

  SELECT * INTO v_old_record FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platba nebyla nalezena';
  END IF;

  SELECT email INTO v_user_email FROM users WHERE id = v_old_record.user_id;

  IF p_operation = 'update_status' AND p_new_status IS NOT NULL THEN
    UPDATE payments SET status = p_new_status
    WHERE id = p_payment_id
    RETURNING * INTO v_new_record;
  ELSE
    RAISE EXCEPTION 'Neplatná operace nebo stav platby';
  END IF;

  INSERT INTO admin_actions (admin_id, action_type, target_table, target_id, notes, metadata)
  VALUES (
    v_admin_id,
    CONCAT('payment_', p_operation),
    'payments',
    p_payment_id,
    CONCAT('Změna stavu platby na: ', p_new_status, ' pro ', v_user_email),
    jsonb_build_object(
      'old_data',      to_jsonb(v_old_record),
      'new_data',      to_jsonb(v_new_record),
      'user_email',    v_user_email,
      'operation',     p_operation,
      'refund_amount', NULL
    )
  );

  v_payload := jsonb_build_object(
    'event_name',  CONCAT('payment_', p_operation),
    'payment_id',  p_payment_id,
    'old_status',  v_old_record.status,
    'new_status',  v_new_record.status,
    'amount',      v_old_record.amount,
    'user_email',  v_user_email,
    'admin_id',    v_admin_id,
    'timestamp',   now()
  );

  PERFORM notify_sofinity_event(CONCAT('payment_', p_operation), v_admin_id, NULL, v_payload);

  RETURN json_build_object(
    'success',      true,
    'message',      'Stav platby byl úspěšně změněn',
    'payment_id',   p_payment_id,
    'payment_data', row_to_json(v_new_record)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba při správě platby: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.admin_manage_payment(uuid, text, text) IS
  'Pouze změna stavu platby (update_status). Operace refund je natvrdo zakázána — dřívější verze při refundaci MioCoiny chybně přičítala. Refundace jde výhradně přes prepare_stripe_refund / stripe-refund / finalize_stripe_refund.';

REVOKE ALL ON FUNCTION public.admin_manage_payment(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_manage_payment(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.admin_manage_payment(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_payment(uuid, text, text) TO service_role;

-- -----------------------------------------------------------------------------
-- 6. Legacy deduct_wallet_for_refund — beze změny těla, jen označení.
--    Zůstává service_role-only; Edge Function ji už nevolá. Nemazat bez
--    ověření dalších volajících.
-- -----------------------------------------------------------------------------
COMMENT ON FUNCTION public.deduct_wallet_for_refund(uuid, numeric) IS
  'LEGACY. Ořezává odečet na nulu (GREATEST(0, ...)), takže může refundovat víc peněz, než kolik zbývá MioCoinů. Nepoužívat pro nové refundace — Edge Function stripe-refund používá prepare_stripe_refund. Ponecháno jen pro service_role kvůli případným historickým opravám.';
