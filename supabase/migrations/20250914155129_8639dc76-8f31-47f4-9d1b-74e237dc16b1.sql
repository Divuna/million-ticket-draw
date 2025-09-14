-- Fix search_path security issue for the update_wallet_after_payment function
CREATE OR REPLACE FUNCTION public.update_wallet_after_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
begin
  -- Only process payments with 'completed' status
  if new.status = 'completed' then
    -- Create or update wallet for the user
    insert into public.wallets (user_id, balance_coins, balance_vouchers, created_at)
    values (
      new.user_id,
      new.amount,
      new.amount,
      now()
    )
    on conflict (user_id) do update
      set balance_coins = wallets.balance_coins + new.amount,
          balance_vouchers = wallets.balance_vouchers + new.amount;
  end if;

  return new;
end;
$function$