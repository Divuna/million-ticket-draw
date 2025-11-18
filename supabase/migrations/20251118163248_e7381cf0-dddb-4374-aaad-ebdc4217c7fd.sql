-- Fix customer message sending: remove dependency on notify_sofinity_event/net.http_post

-- 1) Replace forward_user_message_to_sofinity so it only enqueues event into event_queue
CREATE OR REPLACE FUNCTION public.forward_user_message_to_sofinity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_user_name text;
  v_event_id uuid;
BEGIN
  -- Only handle messages from users (not admin replies)
  IF NEW.sender <> 'user' THEN
    RETURN NEW;
  END IF;

  -- Get basic user info for metadata
  SELECT email, name INTO v_user_email, v_user_name
  FROM public.users
  WHERE id = NEW.user_id;

  -- Insert into event_queue; existing background processing / edge functions
  -- can forward this to Sofinity (similar pattern as other events)
  INSERT INTO public.event_queue (
    event_name,
    user_id,
    contest_id,
    metadata,
    source_system,
    status
  ) VALUES (
    'customer_message_sent',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'message_id', NEW.id,
      'user_email', v_user_email,
      'user_name', v_user_name,
      'title', NEW.title,
      'content', NEW.content,
      'category', NEW.category,
      'created_at', NEW.created_at
    ),
    'onemil',
    'pending'
  ) RETURNING id INTO v_event_id;

  RETURN NEW;
END;
$$;

-- Trigger definition already exists; no change needed other than new function body
