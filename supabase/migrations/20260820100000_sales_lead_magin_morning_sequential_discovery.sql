-- ============================================================================
-- Magin morning sequential discovery orchestration
--
-- This is a narrow service-role-only extension of the existing Magin supply
-- adapter. It does not call the worker, OpenAI, Resend, or the batch sender.
-- It only decides whether exactly one next e-shopy discovery job may be created.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_lead_magin_morning_discovery_jobs (
  scheduled_date date NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_count integer NOT NULL CHECK (target_count BETWEEN 1 AND 90),
  job_id uuid PRIMARY KEY REFERENCES public.sales_lead_discovery_jobs(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scheduled_date, actor_user_id, job_id)
);

CREATE INDEX IF NOT EXISTS sales_lead_magin_morning_discovery_jobs_day_idx
  ON public.sales_lead_magin_morning_discovery_jobs (scheduled_date, actor_user_id, created_at DESC);

ALTER TABLE public.sales_lead_magin_morning_discovery_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_lead_magin_morning_discovery_jobs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.sales_lead_magin_get_e_shopy_morning_discovery_state(
  p_target_count integer,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_template_id uuid;
  v_template_count integer;
  v_candidate record;
  v_check jsonb;
  v_eligible_count integer := 0;
  v_scheduled_date date := timezone('Europe/Prague', now())::date;
  v_active_job_id uuid;
  v_morning_job_count integer := 0;
  v_previous_status text;
  v_previous_finish_reason text;
  v_previous_job_id uuid;
  v_remaining_deficit integer;
BEGIN
  IF p_actor_user_id IS NULL
    OR NOT (
      public.has_admin_permission('sales_leads.manage', p_actor_user_id)
      OR public.is_superadmin(p_actor_user_id)
    )
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'approved_actor_required');
  END IF;

  IF p_target_count IS NULL OR p_target_count < 1 OR p_target_count > 90 THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_count_out_of_range');
  END IF;

  SELECT * INTO v_settings
  FROM public.sales_lead_email_automation_settings
  WHERE singleton;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'automation_settings_missing');
  END IF;
  IF v_settings.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'automation_disabled');
  END IF;
  IF p_target_count > v_settings.daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'target_count_above_daily_limit',
      'daily_limit', v_settings.daily_limit
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.sales_lead_email_batches
    WHERE scheduled_date = v_scheduled_date
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'daily_batch_already_exists',
      'scheduled_date', v_scheduled_date,
      'eligible_count', 0,
      'remaining_deficit', 0,
      'requested_count', 0
    );
  END IF;

  SELECT b.template_id INTO v_template_id
  FROM public.sales_lead_email_batches b
  WHERE b.status <> 'cancelled'
  ORDER BY b.scheduled_date DESC, b.created_at DESC
  LIMIT 1;

  IF v_template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sales_lead_email_templates t
    WHERE t.id = v_template_id AND t.is_active AND t.template_type = 'initial'
  ) THEN
    v_template_id := NULL;
  END IF;

  IF v_template_id IS NULL THEN
    SELECT count(*), min(id) INTO v_template_count, v_template_id
    FROM public.sales_lead_email_templates
    WHERE is_active AND template_type = 'initial';
    IF v_template_count <> 1 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'active_initial_template_not_unique',
        'active_template_count', v_template_count
      );
    END IF;
  END IF;

  FOR v_candidate IN
    SELECT l.id
    FROM public.sales_leads l
    WHERE l.lead_group = 'e-shopy'
      AND l.status IN ('novy', 'priprava', 'schvaleni_ceka')
      AND l.do_not_contact IS NOT TRUE
      AND l.email_verified_by_admin IS TRUE
      AND l.contact_email IS NOT NULL
    ORDER BY l.created_at ASC, l.id ASC
  LOOP
    v_check := public.sales_lead_email_batch_check_one(v_candidate.id, v_template_id);
    IF coalesce((v_check->>'eligible')::boolean, false) THEN
      v_eligible_count := v_eligible_count + 1;
      EXIT WHEN v_eligible_count >= p_target_count;
    END IF;
  END LOOP;

  v_remaining_deficit := greatest(p_target_count - v_eligible_count, 0);

  IF v_remaining_deficit = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'inventory_sufficient',
      'scheduled_date', v_scheduled_date,
      'eligible_count', v_eligible_count,
      'remaining_deficit', 0,
      'requested_count', 0
    );
  END IF;

  SELECT j.id INTO v_active_job_id
  FROM public.sales_lead_discovery_jobs j
  WHERE j.status IN ('queued', 'running')
  ORDER BY j.created_at ASC
  LIMIT 1;
  IF v_active_job_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'active_discovery_job_exists',
      'scheduled_date', v_scheduled_date,
      'eligible_count', v_eligible_count,
      'remaining_deficit', v_remaining_deficit,
      'requested_count', 0,
      'active_job_id', v_active_job_id
    );
  END IF;

  SELECT count(*) INTO v_morning_job_count
  FROM public.sales_lead_magin_morning_discovery_jobs m
  WHERE m.scheduled_date = v_scheduled_date
    AND m.actor_user_id = p_actor_user_id;

  SELECT j.id, j.status, j.finish_reason
  INTO v_previous_job_id, v_previous_status, v_previous_finish_reason
  FROM public.sales_lead_magin_morning_discovery_jobs m
  JOIN public.sales_lead_discovery_jobs j ON j.id = m.job_id
  WHERE m.scheduled_date = v_scheduled_date
    AND m.actor_user_id = p_actor_user_id
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF v_previous_job_id IS NOT NULL
    AND (
      v_previous_status IS DISTINCT FROM 'done'
      OR v_previous_finish_reason IS DISTINCT FROM 'target_reached'
    )
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'discovery_chain_stopped',
      'scheduled_date', v_scheduled_date,
      'eligible_count', v_eligible_count,
      'remaining_deficit', v_remaining_deficit,
      'requested_count', 0,
      'last_job_id', v_previous_job_id,
      'last_job_status', v_previous_status,
      'last_finish_reason', v_previous_finish_reason
    );
  END IF;

  IF v_morning_job_count >= 4 THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'morning_job_cap_reached',
      'scheduled_date', v_scheduled_date,
      'eligible_count', v_eligible_count,
      'remaining_deficit', v_remaining_deficit,
      'requested_count', 0,
      'automatic_jobs_created', v_morning_job_count,
      'max_automatic_jobs', 4
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'discovery_needed',
    'scheduled_date', v_scheduled_date,
    'eligible_count', v_eligible_count,
    'remaining_deficit', v_remaining_deficit,
    'requested_count', least(25, v_remaining_deficit),
    'automatic_jobs_created', v_morning_job_count,
    'max_automatic_jobs', 4
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_lead_magin_create_next_e_shopy_morning_discovery_job(
  p_target_count integer,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state jsonb;
  v_create jsonb;
  v_job_id uuid;
  v_requested_count integer;
  v_scheduled_date date := timezone('Europe/Prague', now())::date;
BEGIN
  IF p_actor_user_id IS NULL
    OR NOT (
      public.has_admin_permission('sales_leads.manage', p_actor_user_id)
      OR public.is_superadmin(p_actor_user_id)
    )
  THEN
    RETURN jsonb_build_object('success', false, 'error', 'approved_actor_required');
  END IF;

  IF p_target_count IS NULL OR p_target_count < 1 OR p_target_count > 90 THEN
    RETURN jsonb_build_object('success', false, 'error', 'target_count_out_of_range');
  END IF;

  IF NOT pg_try_advisory_xact_lock(
    hashtextextended('sales_lead_magin_morning_discovery:' || p_actor_user_id::text || ':' || v_scheduled_date::text, 0)
  ) THEN
    RETURN jsonb_build_object('success', true, 'action', 'morning_discovery_busy', 'requested_count', 0);
  END IF;

  v_state := public.sales_lead_magin_get_e_shopy_morning_discovery_state(
    p_target_count,
    p_actor_user_id
  );

  IF coalesce((v_state->>'success')::boolean, false) IS NOT TRUE
    OR v_state->>'action' IS DISTINCT FROM 'discovery_needed'
  THEN
    RETURN v_state;
  END IF;

  v_requested_count := (v_state->>'requested_count')::integer;
  IF v_requested_count IS NULL OR v_requested_count < 1 OR v_requested_count > 25 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_server_requested_count');
  END IF;

  PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  v_create := public.sales_lead_discovery_job_create('e-shopy', v_requested_count);
  IF coalesce((v_create->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', coalesce(v_create->>'error', 'discovery_job_create_failed'),
      'requested_count', 0
    );
  END IF;

  v_job_id := nullif(v_create->>'job_id', '')::uuid;
  IF v_job_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'discovery_job_id_missing');
  END IF;

  INSERT INTO public.sales_lead_magin_morning_discovery_jobs (
    scheduled_date, actor_user_id, target_count, job_id
  ) VALUES (
    v_scheduled_date, p_actor_user_id, p_target_count, v_job_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'action', 'created_discovery_job',
    'job_id', v_job_id,
    'scheduled_date', v_scheduled_date,
    'requested_count', v_requested_count,
    'eligible_count', (v_state->>'eligible_count')::integer,
    'remaining_deficit', (v_state->>'remaining_deficit')::integer,
    'automatic_jobs_created', (v_state->>'automatic_jobs_created')::integer + 1,
    'max_automatic_jobs', 4
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_magin_get_e_shopy_morning_discovery_state(integer, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_magin_create_next_e_shopy_morning_discovery_job(integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_magin_get_e_shopy_morning_discovery_state(integer, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_magin_create_next_e_shopy_morning_discovery_job(integer, uuid)
  TO service_role;

COMMENT ON TABLE public.sales_lead_magin_morning_discovery_jobs IS
  'Server-side audit and cap for Magin morning e-shopy discovery. One next job only; no retries or parallel jobs.';
COMMENT ON FUNCTION public.sales_lead_magin_get_e_shopy_morning_discovery_state(integer, uuid) IS
  'Read-only Magin morning state: canonical current eligibility, active-job guard, previous terminal outcome, and one next requested_count <= 25.';
COMMENT ON FUNCTION public.sales_lead_magin_create_next_e_shopy_morning_discovery_job(integer, uuid) IS
  'Creates at most one next Magin e-shopy discovery job after server-side state validation; max four tracked jobs per Prague morning date.';

COMMIT;
