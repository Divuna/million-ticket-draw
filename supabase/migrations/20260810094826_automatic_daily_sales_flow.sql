-- Automatic daily e-shop acquisition reuses the existing discovery job,
-- deterministic Work intake, batch RPC and guarded sender. No new data object.
BEGIN;

ALTER TABLE public.sales_lead_email_automation_settings
  DROP CONSTRAINT sales_lead_email_automation_settings_daily_limit_check,
  ADD CONSTRAINT sales_lead_email_automation_settings_daily_limit_check
    CHECK (daily_limit BETWEEN 1 AND 100);
ALTER TABLE public.sales_lead_email_batches
  DROP CONSTRAINT sales_lead_email_batches_daily_limit_check,
  ADD CONSTRAINT sales_lead_email_batches_daily_limit_check
    CHECK (daily_limit BETWEEN 1 AND 100),
  DROP CONSTRAINT sales_lead_email_batches_scheduled_count_check,
  ADD CONSTRAINT sales_lead_email_batches_scheduled_count_check
    CHECK (scheduled_count BETWEEN 0 AND 100);

-- The existing eight-hour window can safely fit 100 single-shot worker calls
-- only when its conservative minimum spacing follows the new four-minute poll.
DO $migration$
DECLARE v_definition text;
BEGIN
  SELECT pg_get_functiondef('public.sales_lead_email_batch_schedule_window(date,text,time,time,integer,timestamptz)'::regprocedure)
    INTO v_definition;
  IF position('interval ''5 minutes''' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'sales_lead_email_batch_schedule_window source contract changed';
  END IF;
  v_definition := replace(v_definition, 'interval ''5 minutes''', 'interval ''4 minutes''');
  EXECUTE v_definition;
END
$migration$;

-- Preserve the audited implementation of the existing RPC. Only widen its
-- hard batch cap and admit the service-role worker with a validated admin owner.
DO $migration$
DECLARE
  v_definition text;
  v_original text;
BEGIN
  SELECT pg_get_functiondef('public.sales_lead_email_batch_create(uuid[],uuid,date,text)'::regprocedure)
    INTO v_definition;
  v_original := v_definition;
  v_definition := replace(v_definition,
    'v_caller uuid := auth.uid();',
    'v_caller uuid := auth.uid();' || E'\n  v_service_role boolean := coalesce(auth.jwt()->>''role'', '''') = ''service_role'';');
  v_definition := replace(v_definition,
    'IF v_caller IS NULL OR NOT public.has_admin_permission(''sales_leads.manage'', v_caller) THEN',
    E'IF v_service_role AND v_caller IS NULL THEN\n    v_caller := public.sales_lead_pick_discovery_owner();\n  END IF;\n  IF v_caller IS NULL OR (NOT v_service_role AND NOT public.has_admin_permission(''sales_leads.manage'', v_caller)) THEN');
  v_definition := replace(v_definition,
    'IF v_count > 20 THEN',
    'IF v_count > 100 THEN');
  IF v_definition = v_original
     OR position('v_service_role boolean' IN v_definition) = 0
     OR position('IF v_count > 100 THEN' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'sales_lead_email_batch_create source contract changed';
  END IF;
  EXECUTE v_definition;
END
$migration$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text)
  TO service_role;
COMMENT ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text) IS
  'Atomically rechecks eligibility and stores at most 100 frozen first-email items. Authenticated administrators and the automatic service-role worker share identical guards. A row never sends email.';
COMMENT ON FUNCTION public.sales_lead_email_batch_schedule_window(date,text,time,time,integer,timestamptz) IS
  'Returns the guarded Europe/Prague delivery window with at least four minutes per item; performs no send.';

CREATE OR REPLACE FUNCTION public.run_sales_lead_discovery_scheduler()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_owner uuid;
  v_job_id uuid;
  v_today date := (now() AT TIME ZONE 'Europe/Prague')::date;
  v_first_automatic_date date;
  v_daily_limit integer;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('sales_lead_discovery_scheduler', 0)) THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'scheduler_busy');
  END IF;
  SELECT * INTO v_settings FROM public.sales_lead_email_automation_settings WHERE singleton FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.enabled THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'email_automation_disabled');
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_lead_discovery_jobs WHERE status IN ('queued','running')) THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'job_already_active');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sales_lead_email_batches
    WHERE scheduled_date = v_today AND idempotency_key = 'auto-sales-' || v_today::text
      AND status <> 'cancelled'
  ) THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'daily_batch_exists');
  END IF;

  SELECT min(scheduled_date) INTO v_first_automatic_date
  FROM public.sales_lead_email_batches
  WHERE idempotency_key LIKE 'auto-sales-%' AND status <> 'cancelled';
  v_daily_limit := CASE WHEN v_first_automatic_date IS NULL THEN 20
    ELSE least(100, 20 * greatest(1, v_today - v_first_automatic_date + 1)) END;
  UPDATE public.sales_lead_email_automation_settings
  SET daily_limit = v_daily_limit, updated_at = clock_timestamp(), updated_by = NULL
  WHERE singleton;

  v_owner := public.sales_lead_pick_discovery_owner();
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'no_owner_available');
  END IF;
  INSERT INTO public.sales_lead_discovery_jobs
    (lead_group, requested_count, max_candidates, status, created_by, auto_created)
  VALUES ('e-shopy', v_daily_limit, least(300, v_daily_limit * 3), 'queued', v_owner, true)
  RETURNING id INTO v_job_id;
  RETURN jsonb_build_object('success', true, 'created', true, 'job_id', v_job_id,
    'lead_group', 'e-shopy', 'requested_count', v_daily_limit,
    'max_candidates', least(300, v_daily_limit * 3));
END;
$$;

REVOKE ALL ON FUNCTION public.run_sales_lead_discovery_scheduler() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_sales_lead_discovery_scheduler() TO service_role;
COMMENT ON FUNCTION public.run_sales_lead_discovery_scheduler() IS
  'Daily fail-closed 20/40/60/80/100 ramp. Creates only an automatic e-shopy job; the worker reuses inventory, intake and guarded batch creation.';

-- Keep every existing email worker command and credential source unchanged;
-- only increase polling cadence so up to 100 messages fit the 08:30-16:30 window.
DO $$
DECLARE v_job record;
BEGIN
  FOR v_job IN SELECT jobid FROM cron.job
    WHERE jobname = 'sales_lead_email_batch_worker_every_5_min'
       OR command ILIKE '%process-sales-lead-email-batch%'
  LOOP
    PERFORM cron.alter_job(v_job.jobid, schedule := '*/4 * * * *');
  END LOOP;
END;
$$;

COMMIT;
