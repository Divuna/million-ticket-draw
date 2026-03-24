-- OneMil: user chat no longer enqueues event_queue → Sofinity.
-- After INSERT on messages (sender = user), invoke Edge Function ai-chat via pg_net (same pattern as send-push).

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.forward_user_message_to_sofinity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/ai-chat';
  -- Public anon JWT for project xkzhjldrojjlrkezorey (same as enqueue_send_push_edge migration).
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U';
  v_internal_token text := current_setting('app.settings.internal_function_token', true);
  v_headers jsonb;
  v_has_pg_net boolean := false;
BEGIN
  IF NEW.sender IS DISTINCT FROM 'user' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net' AND p.proname = 'http_post'
  ) INTO v_has_pg_net;

  IF NOT v_has_pg_net THEN
    RAISE WARNING 'forward_user_message_to_sofinity: pg_net net.http_post not available; ai-chat not invoked';
    RETURN NEW;
  END IF;

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || v_anon_key,
    'apikey', v_anon_key
  );

  IF v_internal_token IS NOT NULL AND v_internal_token <> '' THEN
    v_headers := v_headers || jsonb_build_object('x-internal-token', v_internal_token);
  END IF;

  PERFORM net.http_post(
    url := v_url,
    headers := v_headers,
    body := jsonb_build_object('message_id', NEW.id::text)
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'forward_user_message_to_sofinity: ai-chat invoke failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.forward_user_message_to_sofinity() IS
  'On user message insert, calls Edge Function ai-chat (OpenAI) via pg_net. Set database app.settings.internal_function_token to match Edge INTERNAL_FUNCTION_TOKEN.';

-- Trigger name unchanged for stability.
DROP TRIGGER IF EXISTS trg_forward_user_message_to_sofinity ON public.messages;
CREATE TRIGGER trg_forward_user_message_to_sofinity
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.forward_user_message_to_sofinity();
