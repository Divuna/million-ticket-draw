-- Create event_forward_log table for audit and retry tracking
CREATE TABLE IF NOT EXISTS public.event_forward_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  event_name text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, success, failed
  response_data jsonb,
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on event_forward_log
ALTER TABLE public.event_forward_log ENABLE ROW LEVEL SECURITY;

-- Allow admins to view logs
CREATE POLICY "Admin access to forward logs"
ON public.event_forward_log
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'superadmin')
  )
);

-- Create function to call sofinity-forwarder edge function
CREATE OR REPLACE FUNCTION public.trigger_sofinity_forward()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_event_name text;
  v_metadata jsonb;
BEGIN
  -- Determine event name based on table
  CASE TG_TABLE_NAME
    WHEN 'user_vouchers' THEN
      v_event_name := 'voucher_redeemed';
      v_metadata := jsonb_build_object(
        'voucher_id', NEW.voucher_id,
        'user_id', NEW.user_id,
        'redeemed', NEW.redeemed
      );
    WHEN 'users' THEN
      v_event_name := 'user_created';
      v_metadata := jsonb_build_object(
        'user_id', NEW.id,
        'email', NEW.email,
        'role', NEW.role
      );
    WHEN 'winners' THEN
      v_event_name := 'winner_created';
      v_metadata := jsonb_build_object(
        'winner_id', NEW.id,
        'user_id', NEW.user_id,
        'contest_id', NEW.contest_id,
        'type', NEW.type,
        'status', NEW.status
      );
  END CASE;

  -- Call the edge function via http
  PERFORM net.http_post(
    url := 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/sofinity-forwarder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('request.headers')::json->>'authorization'
    ),
    body := jsonb_build_object(
      'table_name', TG_TABLE_NAME,
      'record_id', NEW.id,
      'event_name', v_event_name,
      'metadata', v_metadata
    )
  );

  RETURN NEW;
END;
$$;

-- Create triggers on the three tables
DROP TRIGGER IF EXISTS trigger_user_vouchers_sofinity ON public.user_vouchers;
CREATE TRIGGER trigger_user_vouchers_sofinity
AFTER INSERT ON public.user_vouchers
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sofinity_forward();

DROP TRIGGER IF EXISTS trigger_users_sofinity ON public.users;
CREATE TRIGGER trigger_users_sofinity
AFTER INSERT ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sofinity_forward();

DROP TRIGGER IF EXISTS trigger_winners_sofinity ON public.winners;
CREATE TRIGGER trigger_winners_sofinity
AFTER INSERT ON public.winners
FOR EACH ROW
EXECUTE FUNCTION public.trigger_sofinity_forward();;
