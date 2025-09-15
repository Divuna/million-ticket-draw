-- Fix search_path security issues for the new functions
CREATE OR REPLACE FUNCTION notify_sofinity_event(
  p_event_name text,
  p_user_id uuid DEFAULT NULL,
  p_contest_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_payload jsonb;
  v_url text;
  v_request_id bigint;
BEGIN
  -- Get the Supabase project URL
  v_url := 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/send_event_to_sofinity';
  
  -- Prepare the payload
  v_payload := jsonb_build_object(
    'event_name', p_event_name,
    'user_id', p_user_id,
    'contest_id', p_contest_id,
    'metadata', COALESCE(p_metadata, '{}'::jsonb),
    'timestamp', now()::text
  );

  -- Make async HTTP request to the edge function
  SELECT INTO v_request_id net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := v_payload
  );

EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the main operation
    RAISE LOG 'Failed to send event to Sofinity: %', SQLERRM;
END;
$$;

-- Trigger function for user registration
CREATE OR REPLACE FUNCTION trigger_user_registered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM notify_sofinity_event(
    'user_registered',
    NEW.id,
    NULL,
    jsonb_build_object(
      'email', NEW.email,
      'name', NEW.name,
      'role', NEW.role
    )
  );
  RETURN NEW;
END;
$$;

-- Trigger function for voucher purchase
CREATE OR REPLACE FUNCTION trigger_voucher_purchased()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM notify_sofinity_event(
    'voucher_purchased',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'voucher_id', NEW.id,
      'code', NEW.code,
      'value', NEW.value
    )
  );
  RETURN NEW;
END;
$$;

-- Trigger function for coin redemption (ticket purchase)
CREATE OR REPLACE FUNCTION trigger_coin_redeemed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM notify_sofinity_event(
    'coin_redeemed',
    NEW.user_id,
    NEW.contest_id,
    jsonb_build_object(
      'ticket_id', NEW.id,
      'ticket_number', NEW.number
    )
  );
  RETURN NEW;
END;
$$;