-- Fix: event_logs → notifications pipeline blocked by RLS on public.notifications.
--
-- PostgreSQL evaluates row security for statements inside SECURITY DEFINER triggers
-- using the **session role that fired the trigger**, not the function owner. So
-- INSERT INTO notifications from enqueue_notifications_from_event_logs() must be
-- allowed by an INSERT policy for role "authenticated" (buyer, admin RPC caller).
--
-- Also standardize trigger name to trg_event_logs_notifications (drops legacy name).

-- -----------------------------------------------------------------------------
-- 1) Trigger function: keep SECURITY DEFINER + explicit INSERT columns (incl. type)
-- -----------------------------------------------------------------------------
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
  IF NEW.user_id IS NULL OR NEW.event_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_name = 'prize_won' THEN
    v_type := 'success';
    v_title := 'Výhra';
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
    RETURN NEW;
  END IF;

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

-- -----------------------------------------------------------------------------
-- 2) Single AFTER INSERT trigger on event_logs (canonical name)
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_enqueue_notifications_from_event_logs ON public.event_logs;
DROP TRIGGER IF EXISTS trg_event_logs_notifications ON public.event_logs;

CREATE TRIGGER trg_event_logs_notifications
  AFTER INSERT ON public.event_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_notifications_from_event_logs();

-- -----------------------------------------------------------------------------
-- 3) RLS: allow pipeline INSERT without disabling RLS
-- -----------------------------------------------------------------------------
-- Service role continues to bypass RLS in Supabase; this policy helps authenticated sessions.

DROP POLICY IF EXISTS "notifications_insert_pipeline_authenticated" ON public.notifications;

CREATE POLICY "notifications_insert_pipeline_authenticated"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role)
    OR public.has_role((SELECT auth.uid()), 'superadmin'::public.app_role)
  );
