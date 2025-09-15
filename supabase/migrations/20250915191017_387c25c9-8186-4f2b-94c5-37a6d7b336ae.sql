-- Check current users table and create triggers for Sofinity events

-- The public.users table already exists with the correct structure
-- Now we need to create the actual triggers on the tables

-- Create trigger on users table for user_registered event
CREATE TRIGGER on_user_registered
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_registered();

-- Create trigger on vouchers table for voucher_purchased event  
CREATE TRIGGER on_voucher_purchased
  AFTER INSERT ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION trigger_voucher_purchased();

-- Create trigger on tickets table for coin_redeemed event
CREATE TRIGGER on_coin_redeemed
  AFTER INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION trigger_coin_redeemed();