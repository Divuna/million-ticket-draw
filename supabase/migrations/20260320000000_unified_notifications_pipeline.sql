-- Unified notification pipeline:
--   event_logs → notifications → push (OneSignal)
--
-- Production-safe, idempotent:
-- - functions use CREATE OR REPLACE
-- - triggers are created only if missing
-- - push is driven ONLY by notifications rows (not push_log)
-- - winners/event_logs writing logic is untouched

-- 1) event_logs (source of events) → enqueue notifications rows
CREATE OR REPLACE FUNCTION public.enqueue_notifications_from_event_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_meta jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
  v_type text;
  v_title text;
  v_message text;
BEGIN
  -- Need a recipient and an event name
  IF NEW.user_id IS NULL OR NEW.event_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map event name → notification fields
  IF NEW.event_name = 'prize_won' THEN
    v_type := 'success';
    v_title := 'Výhra';
    -- In practice we expect event_logs.metadata.notes to contain the localized prize text
    v_message := COALESCE(v_meta->>'notes', 'Vyhrál(a) jsi na OneMil!');
  ELSIF NEW.event_name = 'coin_redeemed' THEN
    v_type := 'success';
    v_title := 'MioCoin uplatněn';
    v_message := COALESCE(
      CONCAT('Uplatnil(a) jsi MioCoin. Ticket: ', COALESCE(v_meta->>'ticket_number', '?')),
      'MioCoin uplatněn.'
    );
  ELSIF NEW.event_name = 'contest_closed' THEN
    v_type := 'info';
    v_title := 'Soutěž uzavřena';
    v_message := COALESCE(v_meta->>'title', 'Soutěž je uzavřena. Výsledky jsou k dispozici.');
  ELSE
    RETURN NEW; -- ignore unrelated event names
  END IF;

  -- De-duplication (prevents duplicates during replays/multi-trigger cases)
  -- Scope is narrow: same user+type+title+message in last 1 day.
  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = NEW.user_id
      AND n.type = v_type
      AND n.title IS NOT DISTINCT FROM v_title
      AND n.message = v_message
      AND n.created_at >= now() - interval '1 day'
  ) THEN
    INSERT INTO public.notifications (user_id, type, title, message, status)
    VALUES (NEW.user_id, v_type, v_title, v_message, 'queued');
  END IF;

  RETURN NEW;
END;
$$;

-- 2) notifications → send OneSignal push and update row
CREATE OR REPLACE FUNCTION public.trigger_send_push_from_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_player_id text;
  v_title text;
BEGIN
  -- Single pipeline rule: only process rows that still have no delivery result.
  IF NEW.push_delivered IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- No recipient → fail fast
  IF NEW.user_id IS NULL THEN
    UPDATE public.notifications
    SET status = 'failed',
        push_delivered = false,
        sent_at = now(),
        push_response = jsonb_build_object('error', 'Missing user_id')
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  v_title := COALESCE(NEW.title, '');

  -- Prefer the most recently updated web device, fallback to any device
  SELECT ud.player_id
  INTO v_player_id
  FROM public.user_devices ud
  WHERE ud.user_id = NEW.user_id
    AND ud.player_id IS NOT NULL
    AND ud.player_id <> ''
  ORDER BY
    (ud.device_type = 'web') DESC,
    ud.updated_at DESC NULLS LAST,
    ud.created_at DESC NULLS LAST
  LIMIT 1;

  IF v_player_id IS NULL THEN
    UPDATE public.notifications
    SET status = 'failed',
        push_delivered = false,
        sent_at = now(),
        push_response = jsonb_build_object('error', 'Missing OneSignal player_id')
    WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  BEGIN
    -- Call the DB-side OneSignal sender using positional arguments.
    -- This avoids runtime failures due to parameter-name mismatches across environments.
    -- First try the common 3-arg variant: (message, player_id, title).
    EXECUTE 'SELECT public.send_push_via_onesignal($1, $2, $3)'
    USING NEW.message, v_player_id, v_title;

    UPDATE public.notifications
    SET status = 'sent',
        push_delivered = true,
        sent_at = COALESCE(sent_at, now())
    WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback: some deployments may expose a 4-arg variant that also accepts push_log_id.
    -- We still keep push_log as non-primary (we pass NULL so it should not be required).
    BEGIN
      EXECUTE 'SELECT public.send_push_via_onesignal($1, $2, $3, $4)'
      USING NEW.message, v_player_id, NULL::text, v_title;

      UPDATE public.notifications
      SET status = 'sent',
          push_delivered = true,
          sent_at = COALESCE(sent_at, now())
      WHERE id = NEW.id;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.notifications
      SET status = 'failed',
          push_delivered = false,
          sent_at = now(),
          push_response = jsonb_build_object('error', SQLERRM)
      WHERE id = NEW.id;
    END;
  END;

  RETURN NEW;
END;
$$;

-- 3) Create triggers if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgname = 'trg_enqueue_notifications_from_event_logs'
      AND t.tgrelid = 'public.event_logs'::regclass
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_enqueue_notifications_from_event_logs
    AFTER INSERT ON public.event_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.enqueue_notifications_from_event_logs();
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgname = 'trg_send_push_from_notifications'
      AND t.tgrelid = 'public.notifications'::regclass
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_send_push_from_notifications
    AFTER INSERT ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_send_push_from_notifications();
  END IF;
END
$$;

