CREATE OR REPLACE FUNCTION public.trigger_send_push_from_notifications()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_player_id text;
  v_push_log_id text;
BEGIN
  -- Najdi player_id uživatele
  SELECT ud.player_id
  INTO v_player_id
  FROM public.user_devices ud
  WHERE ud.user_id = NEW.user_id
    AND ud.player_id IS NOT NULL
    AND ud.player_id <> ''
  ORDER BY ud.updated_at DESC NULLS LAST, ud.created_at DESC NULLS LAST
  LIMIT 1;

  -- Bez player_id pouze označ jako failed, nikdy neblokuj insert notifikace
  IF v_player_id IS NULL THEN
    BEGIN
      UPDATE public.notifications
      SET status = 'failed',
          push_delivered = false
      WHERE id = NEW.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE LOG 'trigger_send_push_from_notifications status update failed (notification_id=%): %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
  END IF;

  -- Navázat existující push_log nebo vytvořit nový lokální záznam
  BEGIN
    SELECT pl.id::text
    INTO v_push_log_id
    FROM public.push_log pl
    WHERE pl.user_id = NEW.user_id
      AND pl.title IS NOT DISTINCT FROM NEW.title
      AND pl.message = NEW.message
      AND pl.created_at >= COALESCE(NEW.created_at, now()) - interval '5 minutes'
    ORDER BY pl.created_at DESC
    LIMIT 1;

    IF v_push_log_id IS NULL THEN
      INSERT INTO public.push_log (user_id, player_id, title, message, status, created_at)
      VALUES (NEW.user_id, v_player_id, NEW.title, NEW.message, 'pending', now())
      RETURNING id::text INTO v_push_log_id;
    ELSE
      UPDATE public.push_log
      SET player_id = COALESCE(public.push_log.player_id, v_player_id),
          status = CASE WHEN public.push_log.status IN ('sent', 'error') THEN public.push_log.status ELSE 'pending' END
      WHERE id::text = v_push_log_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'trigger_send_push_from_notifications push_log upsert failed (notification_id=%): %', NEW.id, SQLERRM;
  END;

  -- Nevolat OneSignal synchronně uvnitř transakce nákupu.
  -- Odeslání se zpracuje asynchronně mimo kritickou cestu.
  BEGIN
    UPDATE public.notifications
    SET status = 'queued',
        push_delivered = false
    WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG 'trigger_send_push_from_notifications queued status update failed (notification_id=%): %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trigger_send_push_from_notifications failed (notification_id=%): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;