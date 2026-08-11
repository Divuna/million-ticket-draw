-- ============================================================================
-- Magin lead supply agent adapter
-- ============================================================================
-- Service-role-only wrappers used by the Paperclip adapter. They expose only the
-- minimal lead-supply actions Magin needs and delegate the writes to existing
-- OneMil CRM/discovery RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(
  p_lead_ids uuid[],
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead_id uuid;
  v_lead public.sales_leads%ROWTYPE;
  v_requested_count integer := coalesce(array_length(p_lead_ids, 1), 0);
  v_approved_count integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_approve_result jsonb;
  v_recipient text;
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
      'error', 'lead_ids_required'
    );
  END IF;

  IF v_requested_count > 100 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'too_many_leads',
      'max_leads', 100
    );
  END IF;

  FOREACH v_lead_id IN ARRAY p_lead_ids LOOP
    SELECT *
    INTO v_lead
    FROM public.sales_leads
    WHERE id = v_lead_id
    FOR UPDATE;

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', 'lead_not_found'
      ));
      CONTINUE;
    END IF;

    v_recipient := lower(btrim(coalesce(v_lead.contact_email, '')));

    IF v_lead.status IS DISTINCT FROM 'navrzeny' THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', 'not_proposed'
      ));
      CONTINUE;
    END IF;

    IF coalesce(v_lead.email_verified_by_admin, false) IS NOT TRUE
      OR v_lead.email_verification_method IS DISTINCT FROM 'backend_verified_official_website'
      OR v_lead.email_verified_at IS NULL
      OR v_recipient = ''
      OR length(v_recipient) > 320
      OR v_recipient !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
      OR coalesce(btrim(v_lead.email_source), '') = ''
      OR length(v_lead.email_source) > 2048
      OR v_lead.email_source !~* '^https?://'
    THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', 'email_not_backend_verified_from_official_website'
      ));
      CONTINUE;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

    v_approve_result := public.sales_lead_approve_proposed(
      v_lead_id,
      v_lead.company_name,
      v_lead.ico,
      v_lead.dic,
      v_lead.website,
      v_lead.industry,
      v_lead.city,
      v_lead.address,
      v_lead.company_size,
      v_lead.contact_person,
      v_lead.contact_role,
      v_lead.contact_email,
      v_lead.contact_phone,
      v_lead.email_source,
      v_lead.email_verified_by_admin,
      v_lead.notes,
      false,
      NULL
    );

    IF coalesce((v_approve_result->>'success')::boolean, false) IS TRUE THEN
      v_approved_count := v_approved_count + 1;
    ELSE
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', coalesce(v_approve_result->>'error', 'approve_proposed_failed'),
        'approval_result', v_approve_result
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'requested_count', v_requested_count,
    'approved_count', v_approved_count,
    'skipped_count', jsonb_array_length(v_skipped),
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(uuid[], uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(
  p_requested_count integer DEFAULT 5,
  p_actor_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requested_count integer := least(greatest(coalesce(p_requested_count, 5), 1), 25);
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

  PERFORM set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  RETURN public.sales_lead_discovery_job_create('e-shopy', v_requested_count);
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(integer, uuid) TO service_role;

COMMENT ON FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(uuid[], uuid) IS
  'Narrow service-role-only adapter for Magin: pre-check backend-verified proposals, then delegate approval to sales_lead_approve_proposed.';

COMMENT ON FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(integer, uuid) IS
  'Narrow service-role-only adapter for Magin: delegate discovery job creation to sales_lead_discovery_job_create with lead_group e-shopy.';

COMMIT;
