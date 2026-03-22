-- Drop the duplicate trigger and function that's causing double crediting
DROP TRIGGER IF EXISTS trg_after_payment_insert ON public.payments;
DROP FUNCTION IF EXISTS public.after_payment_insert();;
