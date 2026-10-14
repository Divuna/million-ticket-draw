-- =============================================================================
-- Oprava produkčního nesouladu: public.update_wallet_after_payment()
-- =============================================================================
--
-- STAV PŘED OPRAVOU (produkce xkzhjldrojjlrkezorey, ověřeno 02. 08. 2026):
--   Funkce byla zjednodušená na pouhé
--     UPDATE public.wallets SET balance_coins = balance_coins + NEW.amount
--     WHERE user_id = NEW.user_id;
--   tedy bez kontroly stavu platby, bez SECURITY DEFINER a bez zápisu do
--   účetní historie `wallet_transactions`. Zpevněná verze z migrace
--   20260315200000_wallet_hardening.sql sice byla aplikovaná a 16.–21. 3. 2026
--   fungovala (71 řádků `payment_credit`), ale poté byla přímo v databázi
--   přepsána starým tělem — mimo jakoukoli migraci.
--
-- PROČ K PŘEPSÁNÍ DOŠLO (a proč se to touto migrací neopakuje):
--   Původní zpevněná verze zapisovala
--     INSERT INTO public.wallets (user_id, balance_coins, balance_vouchers, ...)
--   jenže produkční `wallets` sloupec `balance_vouchers` NEMÁ. Každá dokončená
--   platba proto skončila chybou „column does not exist" a Stripe webhook
--   vracel 500 (incident PAY03, 30. 06. 2026). Tato migrace pracuje výhradně
--   se skutečnými sloupci produkčního schématu:
--     wallets            = id, user_id, balance_coins, created_at, bonus_balance_coins
--     wallet_transactions = id, user_id, wallet_id, amount, balance_after,
--                           type, source, reference_id, metadata, created_at
--     payments            = id, user_id, amount, method, stripe_session_id,
--                           status, created_at
--
-- ROZSAH:
--   Mění se POUZE tělo funkce public.update_wallet_after_payment().
--   Trigger `trg_update_wallet_after_payment` (AFTER INSERT ON public.payments
--   FOR EACH ROW) zůstává beze změny. Nemění se refundní logika
--   (`admin_manage_payment`), žádná data, žádné zůstatky a neprovádí se žádný
--   zpětný doplněk historie starých plateb.
--
-- POZNÁMKY K CHOVÁNÍ:
--   * Připisuje se jen při INSERT platby se `status = 'completed'` — což je
--     přesně to, co dělá Edge Function `stripe-webhook`. Přechod
--     pending -> completed přes UPDATE by kredit nevytvořil; takové řádky
--     v produkci neexistují (statusy jsou pouze `completed` a `refunded`)
--     a doplnění UPDATE triggeru je vědomě mimo rozsah této migrace.
--   * Idempotence: existující řádek `payment_credit` s `reference_id = NEW.id`
--     zastaví jak připsání, tak zápis historie. Hlavní ochranou proti dvojímu
--     připsání zůstává UNIQUE(stripe_session_id) na `payments`.
--   * Ochrana proti nekladné částce je vědomé zpřísnění — platba s NULL nebo
--     zápornou částkou nesmí tiše odčerpat peněženku.
--   * Do `metadata` jdou jen provozní údaje (metoda, stav, čas vzniku platby).
--     `stripe_session_id` se záměrně neukládá.
--   * Přepočet balíčků (50 -> 50, 300 -> 310, 500 -> 525, 1200 -> 1280) dělá
--     Edge Function `create-stripe-checkout`; funkce jen připíše `NEW.amount`,
--     takže bonusy zůstávají beze změny.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_wallet_after_payment()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_id   uuid;
  v_new_balance numeric;
BEGIN
  -- 1. Připisuje se výhradně dokončená platba.
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  -- 2. Nekladná nebo chybějící částka se ignoruje.
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
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
  VALUES (NEW.user_id, NEW.amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance_coins = public.wallets.balance_coins + EXCLUDED.balance_coins
  RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;

  -- 5. Právě jeden řádek účetní historie.
  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    NEW.user_id,
    v_wallet_id,
    NEW.amount,
    v_new_balance,
    'payment_credit',
    'update_wallet_after_payment',
    NEW.id,
    jsonb_build_object(
      'method',             NEW.method,
      'payment_status',     NEW.status,
      'payment_created_at', NEW.created_at
    )
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_wallet_after_payment() IS
  'AFTER INSERT trigger na public.payments. Připíše balance_coins pouze u platby se status = completed a založí právě jeden řádek payment_credit ve wallet_transactions. Idempotentní přes reference_id. Nikdy nepoužívat balance_vouchers — ten sloupec v produkčním schématu neexistuje.';
