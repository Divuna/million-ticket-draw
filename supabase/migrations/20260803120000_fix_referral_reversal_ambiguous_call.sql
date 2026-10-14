-- =============================================================================
-- Oprava nejednoznačného volání try_credit_wallet_mc v reverzi odměny za doporučení
-- =============================================================================
--
-- PROBLÉM (ověřeno na produkci xkzhjldrojjlrkezorey 03. 08. 2026 rollback-only testem):
--   `public.reverse_referral_reward_on_payment_status_change()` volala
--     PERFORM public.try_credit_wallet_mc(v_referrer, (0 - v_reward));
--   V produkci ale existují tři overloady:
--     try_credit_wallet_mc(p_user_id uuid)                                   -> void
--     try_credit_wallet_mc(p_user_id uuid, p_amount_mc numeric)              -> boolean
--     try_credit_wallet_mc(p_user_id uuid, p_amount numeric,
--                          p_reason text DEFAULT 'topup')                    -> void
--   Poziční dvouargumentové volání proto vyhovuje DVĚMA kandidátům a Postgres
--   ho odmítne chybou `42725: function ... is not unique`.
--
-- DOPAD:
--   Trigger `trg_payments_referral_reverse` (AFTER UPDATE OF status ON payments)
--   selhal při KAŽDÉ změně stavu platby z `completed` na jiný, pokud k platbě
--   existovala `referral_rewards` se `status = 'earned'` — a protože výjimka
--   z triggeru ruší celou transakci, samotný UPDATE se vrátil zpět.
--   Odpovídá tomu i produkční stav: 16 odměn `earned`, 0 `reversed` — reverzní
--   větev nikdy úspěšně neproběhla.
--
-- ROZSAH TÉTO MIGRACE:
--   Mění se VÝHRADNĚ ten jeden řádek s voláním — pojmenovaný argument
--   `p_amount_mc` váže právě booleanovou variantu `(uuid, numeric)`.
--   Vše ostatní zůstává znak po znaku stejné: podmínky, výběr odměny,
--   zápis `reversed` / `reversed_at` / `reverse_reason`, návratová hodnota,
--   `SECURITY DEFINER`, absence `SET search_path` i trigger samotný.
--   Migrace NEMĚNÍ žádná data, žádné zůstatky a nedělá žádný zpětný doplněk
--   odměn, které kvůli defektu nikdy nebyly stornovány.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reverse_referral_reward_on_payment_status_change()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$
DECLARE
  v_reward_id uuid;
  v_referrer uuid;
  v_reward numeric;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    -- Reverse if reward exists and not reversed yet
    SELECT rr.id, rr.referrer_user_id, rr.reward_mc
    INTO v_reward_id, v_referrer, v_reward
    FROM public.referral_rewards rr
    WHERE rr.payment_id = NEW.id
      AND rr.status = 'earned'
    LIMIT 1;

    IF v_reward_id IS NOT NULL THEN
      UPDATE public.referral_rewards
      SET status = 'reversed',
          reversed_at = now(),
          reverse_reason = 'payment_status_changed:' || COALESCE(NEW.status, 'null')
      WHERE id = v_reward_id;

      -- Attempt to debit wallet (safe dynamic): credit negative amount.
      -- Pojmenované argumenty jsou nutné: poziční volání je mezi overloady
      -- `(uuid, numeric)` a `(uuid, numeric, text DEFAULT ...)` nejednoznačné.
      PERFORM public.try_credit_wallet_mc(p_user_id => v_referrer, p_amount_mc => (0 - v_reward));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.reverse_referral_reward_on_payment_status_change() IS
  'Trigger funkce pro trg_payments_referral_reverse. Při přechodu platby z completed na jiný stav stornuje odměnu za doporučení a odečte ji doporučujícímu. Volání try_credit_wallet_mc MUSÍ používat pojmenované argumenty (p_user_id, p_amount_mc) — poziční volání je kvůli overloadu (uuid, numeric, text DEFAULT) nejednoznačné a shodilo by celou transakci chybou 42725.';
