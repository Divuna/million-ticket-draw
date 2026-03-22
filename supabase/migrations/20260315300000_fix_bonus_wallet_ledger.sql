-- Migration: 20260315300000_fix_bonus_wallet_ledger.sql
-- Purpose: Add wallet_transactions ledger entry to on_bonus_winner_add_to_bonus_wallet.
--
-- Root cause: The wallet hardening (migrations 20260315200000 and 20260315201000)
-- added ledger entries to all wallet-modifying functions, but missed the
-- on_bonus_winner_add_to_bonus_wallet trigger function.
-- This means bonus_balance_coins credits are not auditable via wallet_transactions.
--
-- Fix: Rewrite the trigger function to also write a ledger entry after the credit.

CREATE OR REPLACE FUNCTION public.on_bonus_winner_add_to_bonus_wallet()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_bonus_amount  NUMERIC;
  v_wallet_id     UUID;
  v_new_balance   NUMERIC;
BEGIN
  IF NEW.type = 'bonus' AND NEW.delivered = false THEN
    SELECT COALESCE(amount, 0)
    INTO   v_bonus_amount
    FROM   public.bonus_prizes
    WHERE  id = NEW.prize_id;

    IF v_bonus_amount IS NULL OR v_bonus_amount = 0 THEN
      RETURN NEW;
    END IF;

    UPDATE public.wallets
    SET    bonus_balance_coins = COALESCE(bonus_balance_coins, 0) + v_bonus_amount
    WHERE  user_id = NEW.user_id
    RETURNING id, bonus_balance_coins INTO v_wallet_id, v_new_balance;

    IF v_wallet_id IS NOT NULL THEN
      INSERT INTO public.wallet_transactions (
        user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
      ) VALUES (
        NEW.user_id,
        v_wallet_id,
        v_bonus_amount,
        v_new_balance,
        'bonus_credit',
        'on_bonus_winner_add_to_bonus_wallet',
        NULL,
        jsonb_build_object(
          'contest_id', NEW.contest_id,
          'prize_id',   NEW.prize_id,
          'winner_id',  NEW.id
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
