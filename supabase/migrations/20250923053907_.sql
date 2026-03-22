-- Ensure redeemed_count is maintained automatically based on user_vouchers
CREATE OR REPLACE FUNCTION public.trg_user_voucher_redeemed_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Handle INSERT events
  IF TG_OP = 'INSERT' THEN
    IF NEW.redeemed = true THEN
      UPDATE vouchers 
      SET redeemed_count = redeemed_count + 1,
          updated_at = now()
      WHERE id = NEW.voucher_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Transition from not redeemed -> redeemed
    IF COALESCE(OLD.redeemed, false) = false AND NEW.redeemed = true THEN
      UPDATE vouchers 
      SET redeemed_count = redeemed_count + 1,
          updated_at = now()
      WHERE id = NEW.voucher_id;
    -- Transition from redeemed -> not redeemed (safety)
    ELSIF OLD.redeemed = true AND COALESCE(NEW.redeemed, false) = false THEN
      UPDATE vouchers 
      SET redeemed_count = GREATEST(redeemed_count - 1, 0),
          updated_at = now()
      WHERE id = NEW.voucher_id;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

-- Recreate triggers to use the function
DROP TRIGGER IF EXISTS trg_user_voucher_redeemed_insert ON public.user_vouchers;
DROP TRIGGER IF EXISTS trg_user_voucher_redeemed_update ON public.user_vouchers;

CREATE TRIGGER trg_user_voucher_redeemed_insert
AFTER INSERT ON public.user_vouchers
FOR EACH ROW
EXECUTE FUNCTION public.trg_user_voucher_redeemed_count();

CREATE TRIGGER trg_user_voucher_redeemed_update
AFTER UPDATE ON public.user_vouchers
FOR EACH ROW
EXECUTE FUNCTION public.trg_user_voucher_redeemed_count();;
