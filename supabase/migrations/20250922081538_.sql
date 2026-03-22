-- Remove any old trigger that might be causing conflicts and create the correct one
DROP TRIGGER IF EXISTS trigger_voucher_purchased ON vouchers;

-- Fix the voucher trigger function to use correct table structure
CREATE OR REPLACE FUNCTION public.trg_voucher_purchased()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Skip external notification for test vouchers (identified by name starting with "Test Voucher")
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

-- Create trigger for voucher updates when assigned to user
CREATE TRIGGER trigger_voucher_purchased
  AFTER UPDATE ON vouchers
  FOR EACH ROW
  WHEN (OLD.user_id IS NULL AND NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION trg_voucher_purchased();;
