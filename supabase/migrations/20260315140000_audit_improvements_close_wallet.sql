-- =============================================================================
-- Audit improvements:
-- 1) close_contest: set search_path for SECURITY DEFINER (no behavior change).
-- 2) Atomic wallet deduction for refunds + CHECK constraint for balance safety.
-- Run manually in Supabase SQL Editor. Do not run via CLI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) close_contest: add search_path for SECURITY DEFINER safety
--    (Unification: edge function will call this RPC instead of custom logic,
--     so manual close will use random draw consistently.)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_contest(p_contest_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ticket record;
  v_status text;
begin
  select status
  into v_status
  from contests
  where id = p_contest_id;

  if v_status = 'closed' then
    return;
  end if;

  perform 1
  from contests
  where id = p_contest_id
  for update;

  select *
  into v_ticket
  from tickets
  where contest_id = p_contest_id
  order by random()
  limit 1;

  if v_ticket is null then
    update contests
    set status = 'closed'
    where id = p_contest_id;
    return;
  end if;

  insert into winners (
    contest_id,
    user_id,
    ticket_id,
    type,
    created_at
  )
  values (
    p_contest_id,
    v_ticket.user_id,
    v_ticket.id,
    'main',
    now()
  );

  update contests
  set status = 'closed'
  where id = p_contest_id;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 2a) Atomic wallet deduction for refunds (avoids read-then-write race)
--     Callable by service role from stripe-refund edge function.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_wallet_for_refund(p_user_id uuid, p_amount numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_new_balance numeric;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE wallets
  SET balance_coins = GREATEST(0, balance_coins - p_amount)
  WHERE user_id = p_user_id
  RETURNING balance_coins INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
  END IF;

  RETURN v_new_balance;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2b) Enforce non-negative balance (safety net for bugs/future code)
--     NOT VALID: does not scan existing rows (avoids failure if any are negative).
--     After fixing any negative balances, run:
--       ALTER TABLE public.wallets VALIDATE CONSTRAINT wallets_balance_coins_non_negative;
-- -----------------------------------------------------------------------------
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_balance_coins_non_negative
  CHECK (balance_coins >= 0) NOT VALID;
