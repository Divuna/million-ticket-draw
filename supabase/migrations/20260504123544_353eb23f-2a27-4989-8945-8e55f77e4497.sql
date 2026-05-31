-- 1) Remove duplicate notification trigger on event_logs.
DROP TRIGGER IF EXISTS trg_enqueue_notifications_from_event_logs
  ON public.event_logs;

-- 2) Replace fn_send_event_to_sofinity with an async enqueue version
--    (uses notify_sofinity_event -> event_queue, processed by worker).
CREATE OR REPLACE FUNCTION public.fn_send_event_to_sofinity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_event_name text;
    v_user_id    uuid;
    v_contest_id uuid;
    v_metadata   jsonb := '{}'::jsonb;
BEGIN
    IF TG_TABLE_NAME = 'tickets' THEN
        v_event_name := 'ticket_purchased';
        v_user_id    := NEW.user_id;
        v_contest_id := NEW.contest_id;
        v_metadata   := jsonb_build_object(
            'ticket_id',     NEW.id,
            'ticket_number', NEW.number
        );

    ELSIF TG_TABLE_NAME = 'winners' THEN
        v_event_name := 'prize_won';
        v_user_id    := NEW.user_id;
        v_contest_id := NEW.contest_id;
        v_metadata   := jsonb_build_object(
            'winner_id', NEW.id,
            'ticket_id', NEW.ticket_id,
            'type',      NEW.type
        );

    ELSIF TG_TABLE_NAME = 'contests' THEN
        IF TG_OP = 'INSERT' THEN
            v_event_name := 'contest_created';
            v_contest_id := NEW.id;
        ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
            IF NEW.status = 'closed' THEN
                v_event_name := 'contest_closed';
            ELSE
                v_event_name := 'contest_update';
            END IF;
            v_contest_id := NEW.id;
        END IF;
        v_metadata := jsonb_build_object(
            'contest_id', NEW.id,
            'status',     NEW.status
        );
    END IF;

    IF v_event_name IS NOT NULL THEN
        BEGIN
            PERFORM public.notify_sofinity_event(
                v_event_name,
                v_user_id,
                v_contest_id,
                v_metadata
            );
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING
              'fn_send_event_to_sofinity enqueue failed (%, %): %',
              TG_TABLE_NAME, TG_OP, SQLERRM;
        END;
    END IF;

    RETURN NEW;
END;
$function$;