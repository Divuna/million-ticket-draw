-- Add unique index on payments(stripe_session_id) to prevent duplicate processing
CREATE UNIQUE INDEX idx_payments_stripe_session_id_unique 
ON public.payments (stripe_session_id) 
WHERE stripe_session_id IS NOT NULL;