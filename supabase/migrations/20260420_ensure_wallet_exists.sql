-- Ensure a wallet row exists for a user before any wallet operation.
-- Called from purchase-ticket Edge Function and all buy_voucher_atomic call sites.
-- Uses ON CONFLICT (user_id) DO NOTHING — never modifies an existing wallet row.
-- Columns balance_coins, bonus_balance_coins, created_at only; all others use DB defaults.
CREATE OR REPLACE FUNCTION public.ensure_wallet_exists(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.wallets (user_id, balance_coins, bonus_balance_coins, created_at)
  VALUES (p_user_id, 0, 0, now())
  ON CONFLICT (user_id) DO NOTHING;
$$;
