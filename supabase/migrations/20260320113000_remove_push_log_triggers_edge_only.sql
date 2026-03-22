-- Remove DB trigger-based push sending completely.
-- Push delivery is now handled by explicit Edge Function invocation from application code.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.push_log'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.push_log;', t.tgname);
  END LOOP;
END
$$;

-- Optional cleanup of legacy DB sender wrappers/functions.
DROP FUNCTION IF EXISTS public.enqueue_send_push_edge();
DROP FUNCTION IF EXISTS public.trg_push_log_send_onesignal();

