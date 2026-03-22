-- Fix trigger_notification_sent to use correct URL and net.http_post signature
CREATE OR REPLACE FUNCTION public.trigger_notification_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  payload jsonb;
BEGIN
  payload := jsonb_build_object(
    'event_name', 'notification_sent',
    'user_id', NEW.user_id,
    'contest_id', NULL,
    'metadata', jsonb_build_object(
      'type', NEW.type,
      'message', NEW.message,
      'status', NEW.status,
      'notification_id', NEW.id
    ),
    'timestamp', now()
  );

  INSERT INTO public.audit_logs (event, user_id, metadata)
  VALUES ('notification_sent', NEW.user_id, payload);

  BEGIN
    PERFORM net.http_post(
      url := 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/sofinity-event',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := payload
    );
    
    INSERT INTO public.audit_logs (event, user_id, metadata)
    VALUES ('notification_sent_success', NEW.user_id, jsonb_build_object('notification_id', NEW.id));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_logs (event, user_id, metadata)
    VALUES (
      'notification_sent_error',
      NEW.user_id,
      jsonb_build_object(
        'notification_id', NEW.id,
        'error_message', SQLERRM
      )
    );
  END;

  RETURN NEW;
END;
$$;;
