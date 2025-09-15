-- Create generic audit function for any table with user_id column
CREATE OR REPLACE FUNCTION public.fn_audit_generic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  audit_user_id uuid;
BEGIN
  -- Extract user_id from NEW or OLD record depending on operation
  IF TG_OP = 'DELETE' THEN
    audit_user_id := (to_jsonb(OLD) ->> 'user_id')::uuid;
  ELSE
    audit_user_id := (to_jsonb(NEW) ->> 'user_id')::uuid;
  END IF;

  -- Insert audit log entry
  INSERT INTO audit_logs(event, user_id, metadata, created_at)
  VALUES (
    TG_OP, -- INSERT / UPDATE / DELETE
    audit_user_id,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
    ),
    now()
  );

  -- Return appropriate record
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;

-- Add audit triggers to vouchers table
CREATE TRIGGER audit_vouchers_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_generic();

-- Add audit triggers to tickets table  
CREATE TRIGGER audit_tickets_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_generic();

-- Add audit triggers to payments table
CREATE TRIGGER audit_payments_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_generic();