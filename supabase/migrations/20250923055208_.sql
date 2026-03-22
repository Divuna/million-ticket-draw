-- Fix legacy voucher trigger referencing non-existent columns
-- 1) Drop any old triggers on vouchers that might reference NEW.code/NEW.value
DROP TRIGGER IF EXISTS on_voucher_purchased ON public.vouchers;
DROP TRIGGER IF EXISTS trg_voucher_purchased ON public.vouchers;
DROP TRIGGER IF EXISTS voucher_purchased_trigger ON public.vouchers;

-- 2) Drop legacy functions with outdated logic (if they exist)
DROP FUNCTION IF EXISTS public.on_voucher_purchased() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_voucher_purchased() CASCADE;

-- 3) Recreate the correct trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.trg_voucher_purchased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Skip external notification for test vouchers
  IF NEW.name LIKE 'Test Voucher%' OR NEW.name LIKE 'CRUD-TEST-%' THEN
    RETURN NEW;
  END IF;

  PERFORM notify_sofinity_event(
    'voucher_purchased',
    NEW.user_id,
    NULL,
    jsonb_build_object('voucher_id', NEW.id, 'name', NEW.name, 'image_url', NEW.image_url)
  );
  RETURN NEW;
end;
$function$;

-- 4) Recreate a clean trigger bound to the corrected function
CREATE TRIGGER trg_voucher_purchased
AFTER INSERT ON public.vouchers
FOR EACH ROW
EXECUTE FUNCTION public.trg_voucher_purchased();;
