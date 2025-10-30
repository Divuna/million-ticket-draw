-- Update notify_sofinity_event to include Authorization header
CREATE OR REPLACE FUNCTION public.notify_sofinity_event(
  p_event_name text,
  p_user_id uuid DEFAULT NULL,
  p_contest_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payload jsonb;
  v_url text;
  v_has_pg_net boolean := false;
  v_anon_key text;
BEGIN
  -- Build payload WITH source_system
  v_payload := jsonb_build_object(
    'event_name', p_event_name,
    'user_id', p_user_id,
    'contest_id', p_contest_id,
    'source_system', 'onemil',
    'metadata', coalesce(p_metadata, '{}'::jsonb),
    'timestamp', now()::text
  );

  -- Log locally with source_system
  INSERT INTO event_logs (event_name, user_id, contest_id, metadata, source_system)
  VALUES (p_event_name, p_user_id, p_contest_id, coalesce(p_metadata, '{}'::jsonb), 'onemil');

  -- Send to Sofinity Edge Function
  SELECT EXISTS (
    SELECT 1 FROM pg_proc pr
    JOIN pg_namespace ns ON ns.oid = pr.pronamespace
    WHERE ns.nspname = 'net' AND pr.proname = 'http_post'
  ) INTO v_has_pg_net;

  IF v_has_pg_net THEN
    -- Get anon key for authentication
    v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U';
    
    v_url := 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/send_event_to_sofinity';
    
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key,
        'apikey', v_anon_key
      ),
      body := v_payload
    );
  END IF;

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_sofinity_event error: %', SQLERRM;
END;
$$;