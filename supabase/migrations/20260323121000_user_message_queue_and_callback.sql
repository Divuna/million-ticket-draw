-- Activate user-only message enqueueing into event_queue
CREATE OR REPLACE FUNCTION public.forward_user_message_to_sofinity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_request_id text;
  v_message_content text;
BEGIN
  -- Loop prevention: only user-originated chat messages are forwarded.
  IF NEW.sender <> 'user' THEN
    RETURN NEW;
  END IF;

  v_source_request_id := 'message:' || NEW.id::text;
  v_message_content := btrim(
    regexp_replace(
      regexp_replace(COALESCE(NEW.content, ''), '```[\\s\\S]*?```', ' ', 'g'),
      '\\s+',
      ' ',
      'g'
    )
  );

  -- Duplicate prevention for repeated trigger executions/replays.
  IF EXISTS (
    SELECT 1
    FROM public.event_queue eq
    WHERE eq.source_request_id = v_source_request_id
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.event_queue (
    event_name,
    user_id,
    contest_id,
    metadata,
    source_system,
    status,
    retry_count,
    source_request_id
  ) VALUES (
    'user_message',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'message_id', NEW.id,
      'user_id', NEW.user_id,
      'message_content', v_message_content
    ),
    'onemil',
    'pending',
    0,
    v_source_request_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_forward_user_message_to_sofinity ON public.messages;
CREATE TRIGGER trg_forward_user_message_to_sofinity
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.forward_user_message_to_sofinity();
