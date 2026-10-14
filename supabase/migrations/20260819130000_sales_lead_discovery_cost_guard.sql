BEGIN;

ALTER TABLE public.sales_lead_discovery_jobs
  ADD COLUMN IF NOT EXISTS search_api_calls integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS classification_api_calls integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS provider_errors integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_provider_error text,
  ADD COLUMN IF NOT EXISTS input_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS output_tokens bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens bigint NOT NULL DEFAULT 0;

ALTER TABLE public.sales_lead_discovery_jobs
  ALTER COLUMN max_candidates SET DEFAULT 20;

ALTER TABLE public.sales_lead_discovery_jobs
  DROP CONSTRAINT IF EXISTS sales_lead_discovery_jobs_max_candidates_cost_cap;
ALTER TABLE public.sales_lead_discovery_jobs
  ADD CONSTRAINT sales_lead_discovery_jobs_max_candidates_cost_cap
  CHECK (max_candidates BETWEEN 1 AND 20) NOT VALID;

ALTER TABLE public.sales_lead_discovery_jobs
  DROP CONSTRAINT IF EXISTS sales_lead_discovery_jobs_cost_telemetry_nonnegative;
ALTER TABLE public.sales_lead_discovery_jobs
  ADD CONSTRAINT sales_lead_discovery_jobs_cost_telemetry_nonnegative
  CHECK (
    search_api_calls >= 0
    AND classification_api_calls >= 0
    AND provider_errors >= 0
    AND input_tokens >= 0
    AND output_tokens >= 0
    AND total_tokens >= 0
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.run_sales_lead_discovery_scheduler()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group text;
  v_created_by uuid;
  v_job_id uuid;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('sales_lead_discovery_scheduler', 0)) THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'scheduler_busy');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales_lead_discovery_jobs
    WHERE status IN ('queued', 'running')
  ) THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'job_already_active');
  END IF;

  v_group := public.sales_lead_pick_next_discovery_group();
  IF v_group IS NULL THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'no_active_group');
  END IF;

  v_created_by := public.sales_lead_pick_discovery_owner();
  IF v_created_by IS NULL THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'no_owner_available');
  END IF;

  INSERT INTO public.sales_lead_discovery_jobs (
    lead_group, requested_count, max_candidates, status, created_by, auto_created
  )
  VALUES (v_group, 5, 20, 'queued', v_created_by, true)
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'created', true,
    'job_id', v_job_id,
    'lead_group', v_group,
    'created_by', v_created_by,
    'requested_count', 5,
    'max_candidates', 20
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_sales_lead_discovery_scheduler()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_sales_lead_discovery_scheduler()
  TO service_role;

COMMENT ON COLUMN public.sales_lead_discovery_jobs.search_api_calls IS
  'Count of direct OpenAI web-search API calls for the discovery job.';
COMMENT ON COLUMN public.sales_lead_discovery_jobs.classification_api_calls IS
  'Count of direct OpenAI classification API calls for the discovery job.';
COMMENT ON COLUMN public.sales_lead_discovery_jobs.provider_errors IS
  'Count of terminal direct-provider failures for the discovery job.';
COMMENT ON COLUMN public.sales_lead_discovery_jobs.last_provider_error IS
  'Safe provider failure code only; never a provider response body or credential.';

COMMIT;
