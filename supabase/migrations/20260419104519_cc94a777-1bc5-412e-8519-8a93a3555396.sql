CREATE OR REPLACE FUNCTION public.log_partner_coin_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- Vouchery (public.vouchers) NEJSOU propojené s partner_reward_codes
  -- (partner_reward_codes nemá sloupec voucher_id ani jiný odkaz na voucher).
  -- Trigger původně padal na "column voucher_id does not exist" při UPDATE
  -- user_vouchers.redeemed, což blokovalo nákup voucheru z oblíbených.
  -- Dokud nebude existovat reálná vazba voucher → partner reward, trigger
  -- bezpečně neprovádí žádnou akci.
  RETURN NEW;
END;
$function$;