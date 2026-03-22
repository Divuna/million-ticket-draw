-- Move push sending from DB-side HTTP calls to Edge Function.
-- Flow after this migration:
--   notifications -> push_log (existing trigger) -> trigger_push_log_enqueue_send_push_edge -> edge function send-push -> OneSignal

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trigger function that enqueues a call to Edge Function instead of calling OneSignal from SQL.
CREATE OR REPLACE FUNCTION public.enqueue_send_push_edge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text := 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/send-push';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U';
  v_internal_token text := current_setting('app.settings.internal_function_token', true);
  v_headers jsonb;
BEGIN
  -- Process only newly queued/pending push rows.
  IF COALESCE(NEW.status, '') NOT IN ('pending', 'queued') THEN
    RETURN NEW;
  END IF;

  -- Fast fail in DB for missing/invalid player_id.
  IF NEW.player_id IS NULL
     OR NEW.player_id = ''
     OR length(NEW.player_id) < 10
     OR NEW.player_id !~ '^[A-Za-z0-9_-]+$'
  THEN
    UPDATE public.push_log
    SET
      status = 'error',
      sent_at = now(),
      response = jsonb_build_object(
        'ok', false,
        'error', 'Invalid player_id (null/empty/format)',
        'player_id', NEW.player_id
      )
    WHERE id = NEW.id;

    RETURN NEW;
  END IF;

  -- Build headers for edge function call.
  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon_key,
    'apikey', v_anon_key
  );

  IF v_internal_token IS NOT NULL AND v_internal_token <> '' THEN
    v_headers := v_headers || jsonb_build_object('x-internal-token', v_internal_token);
  END IF;

  -- Enqueue async call to send-push edge function.
  PERFORM net.http_post(
    url := v_url,
    headers := v_headers,
    body := jsonb_build_object(
      'push_log_id', NEW.id::text,
      'player_id', NEW.player_id,
      'title', COALESCE(NEW.title, ''),
      'message', COALESCE(NEW.message, '')
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  UPDATE public.push_log
  SET
    status = 'error',
    sent_at = now(),
    response = jsonb_build_object(
      'ok', false,
      'error', 'enqueue_send_push_edge exception',
      'exception', SQLERRM
    )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Remove old push_log trigger(s) that call send_push_via_onesignal directly.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tgname, pg_get_triggerdef(oid) AS def
    FROM pg_trigger
    WHERE tgrelid = 'public.push_log'::regclass
      AND NOT tgisinternal
  LOOP
    IF t.def ILIKE '%send_push_via_onesignal%' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.push_log;', t.tgname);
    END IF;
  END LOOP;
END
$$;

-- Ensure single trigger for edge enqueue exists.
DROP TRIGGER IF EXISTS trg_push_log_enqueue_send_push_edge ON public.push_log;
CREATE TRIGGER trg_push_log_enqueue_send_push_edge
AFTER INSERT ON public.push_log
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_send_push_edge();

