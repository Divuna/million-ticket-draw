-- Create the missing trigger to update wallets after payment insertion
DROP TRIGGER IF EXISTS trg_update_wallet_after_payment ON public.payments;

CREATE TRIGGER trg_update_wallet_after_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_wallet_after_payment();;
