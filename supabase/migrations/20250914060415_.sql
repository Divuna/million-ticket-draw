-- Remove duplicate stripe_session_id entries, keeping only the first one
DELETE FROM public.payments p1 
WHERE p1.stripe_session_id IS NOT NULL 
AND EXISTS (
  SELECT 1 FROM public.payments p2 
  WHERE p2.stripe_session_id = p1.stripe_session_id 
  AND p2.created_at < p1.created_at
);

-- Add unique index on payments(stripe_session_id) to prevent duplicate processing
CREATE UNIQUE INDEX idx_payments_stripe_session_id_unique 
ON public.payments (stripe_session_id) 
WHERE stripe_session_id IS NOT NULL;;
