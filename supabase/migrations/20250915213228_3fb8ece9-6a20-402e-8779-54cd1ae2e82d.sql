-- Add audit triggers to public.users table for comprehensive logging
-- This will log all INSERT/UPDATE/DELETE operations on the users table

-- Create audit trigger for users table using existing fn_audit_users function
CREATE TRIGGER audit_users_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_users();