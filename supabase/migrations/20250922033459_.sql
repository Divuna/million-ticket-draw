-- Harden notify_sofinity_event against missing net.http_post and update legacy triggers to use it

-- 1) Safe notify_sofinity_event: call net.http_post only if extension function exists; always log locally
CREATE OR REPLACE FUNCTION public.notify_sofinity_event(
  p_event_name text,
  p_user_id uuid DEFAULT NULL::uuid,
  p_contest_id uuid DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payload jsonb;
  v_url text;
  v_has_pg_net boolean := false;
BEGIN
  -- Build payload
  v_payload := jsonb_build_object(
    'event_name', p_event_name,
    'user_id', p_user_id,
    'contest_id', p_contest_id,
    'metadata', coalesce(p_metadata, '{}'::jsonb),
    'timestamp', now()::text
  );

  -- Always log locally; this must never fail
  INSERT INTO event_logs (event_name, user_id, contest_id, metadata)
  VALUES (p_event_name, p_user_id, p_contest_id, coalesce(p_metadata, '{}'::jsonb));

  -- Check if pg_net (net.http_post) is available; if not, exit gracefully
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc pr
    JOIN pg_namespace ns ON ns.oid = pr.pronamespace
    WHERE ns.nspname = 'net' AND pr.proname = 'http_post'
  ) INTO v_has_pg_net;

  IF NOT v_has_pg_net THEN
    -- pg_net not available; skip external call
    RETURN;
  END IF;

  -- If available, send to Edge Function
  v_url := 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/send_event_to_sofinity';
  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_payload
  );

EXCEPTION WHEN OTHERS THEN
  -- Never fail caller due to external notification; just log and continue
  RAISE LOG 'notify_sofinity_event error: %', SQLERRM;
END;
$function$;

-- 2) Update legacy trigger functions that directly called net.http_post
--    to route through notify_sofinity_event and to skip known test data
CREATE OR REPLACE FUNCTION public.trg_user_registered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Skip external notification for known test data patterns
  IF NEW.email LIKE '%test%' OR NEW.email = 'divispavel2@gmail.com' THEN
    RETURN NEW;
  END IF;

  PERFORM notify_sofinity_event(
    'user_registered',
    NEW.id,
    NULL,
    jsonb_build_object('email', NEW.email, 'role', NEW.role)
  );
  RETURN NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trg_voucher_purchased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Skip external notification for test vouchers created by CRUD tests
  IF NEW.code LIKE 'CRUD-TEST-%' THEN
    RETURN NEW;
  END IF;

  PERFORM notify_sofinity_event(
    'voucher_purchased',
    NEW.user_id,
    NULL,
    jsonb_build_object('voucher_id', NEW.id, 'code', NEW.code, 'value', NEW.value)
  );
  RETURN NEW;
end;
$function$;
;
