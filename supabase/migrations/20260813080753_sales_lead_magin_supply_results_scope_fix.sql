-- ============================================================================
-- Magin lead supply adapter: discovery result scope fix
-- ============================================================================
-- The discovery job itself is constrained to lead_group = 'e-shopy'. Leads saved
-- by the existing worker may still carry another classified lead_group, while
-- their discovery_meta.job_id proves they belong to Magin's current process.
-- Keep the read path scoped by owned e-shopy jobs + discovery_meta.job_id, and
-- return the saved lead_group as data instead of filtering those rows out.

BEGIN;

CREATE OR REPLACE FUNCTION public.sales_lead_magin_get_discovery_job_results(
  p_job_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requested_count integer := coalesce(array_length(p_job_ids, 1), 0);
  v_job_count integer := 0;
  v_created_count integer := 0;
  v_discovered_lead_count integer := 0;
  v_backend_verified_count integer := 0;
  v_backend_verified_proposed_count integer := 0;
  v_jobs jsonb := '[]'::jsonb;
  v_leads jsonb := '[]'::jsonb;
  v_backend_verified_lead_ids jsonb := '[]'::jsonb;
  v_eligible_lead_ids jsonb := '[]'::jsonb;
BEGIN
  IF p_actor_user_id IS NULL
    OR NOT (
      public.has_admin_permission('sales_leads.manage', p_actor_user_id)
      OR public.is_superadmin(p_actor_user_id)
    )
  THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'approved_actor_required'
    );
  END IF;

  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'job_ids_required'
    );
  END IF;

  IF v_requested_count > 50 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'too_many_jobs',
      'max_jobs', 50
    );
  END IF;

  WITH requested_jobs AS (
    SELECT DISTINCT unnest(p_job_ids) AS id
  ),
  scoped_jobs AS (
    SELECT
      j.id,
      j.status,
      j.requested_count,
      j.created_count,
      j.finish_reason,
      j.search_exhausted,
      j.created_at,
      j.finished_at
    FROM public.sales_lead_discovery_jobs j
    JOIN requested_jobs r ON r.id = j.id
    WHERE j.created_by = p_actor_user_id
      AND j.lead_group = 'e-shopy'
  )
  SELECT
    count(*),
    coalesce(sum(created_count), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'job_id', id,
          'status', status,
          'requested_count', requested_count,
          'created_count', created_count,
          'finish_reason', finish_reason,
          'search_exhausted', search_exhausted,
          'created_at', created_at,
          'finished_at', finished_at
        )
        ORDER BY created_at
      ),
      '[]'::jsonb
    )
  INTO v_job_count, v_created_count, v_jobs
  FROM scoped_jobs;

  IF v_job_count <> v_requested_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'job_not_found_or_not_owned'
    );
  END IF;

  WITH scoped_leads AS (
    SELECT
      l.id,
      l.status,
      l.lead_group,
      l.source,
      l.discovery_meta->>'job_id' AS job_id,
      (
        coalesce(l.email_verified_by_admin, false) IS TRUE
        AND l.email_verification_method IS NOT DISTINCT FROM 'backend_verified_official_website'
        AND l.email_verified_at IS NOT NULL
        AND coalesce(btrim(l.contact_email), '') <> ''
        AND coalesce(btrim(l.email_source), '') ~* '^https?://'
      ) AS backend_verified
    FROM public.sales_leads l
    WHERE l.discovery_meta->>'job_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND (l.discovery_meta->>'job_id')::uuid = ANY(p_job_ids)
  ),
  classified_leads AS (
    SELECT
      id,
      status,
      lead_group,
      source,
      job_id,
      backend_verified,
      (status = 'navrzeny' AND backend_verified) AS approval_eligible
    FROM scoped_leads
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE backend_verified),
    count(*) FILTER (WHERE approval_eligible),
    coalesce(
      jsonb_agg(id ORDER BY id) FILTER (WHERE backend_verified),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(id ORDER BY id) FILTER (WHERE approval_eligible),
      '[]'::jsonb
    ),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'lead_id', id,
          'job_id', job_id,
          'lead_group', lead_group,
          'source', source,
          'status', status,
          'backend_verified', backend_verified,
          'approval_eligible', approval_eligible
        )
        ORDER BY job_id, id
      ),
      '[]'::jsonb
    )
  INTO
    v_discovered_lead_count,
    v_backend_verified_count,
    v_backend_verified_proposed_count,
    v_backend_verified_lead_ids,
    v_eligible_lead_ids,
    v_leads
  FROM classified_leads;

  RETURN jsonb_build_object(
    'success', true,
    'job_count', v_job_count,
    'created_count', v_created_count,
    'discovered_lead_count', v_discovered_lead_count,
    'backend_verified_count', v_backend_verified_count,
    'backend_verified_proposed_count', v_backend_verified_proposed_count,
    'backend_verified_lead_ids', v_backend_verified_lead_ids,
    'eligible_lead_ids', v_eligible_lead_ids,
    'jobs', v_jobs,
    'leads', v_leads
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_magin_get_discovery_job_results(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_magin_get_discovery_job_results(uuid[], uuid) TO service_role;

COMMENT ON FUNCTION public.sales_lead_magin_get_discovery_job_results(uuid[], uuid) IS
  'Narrow service-role-only read adapter for Magin: returns leads created by supplied owned e-shopy discovery jobs and eligible lead_ids for existing approval RPC.';

COMMIT;
