-- ============================================================================
-- Magin lead supply agent adapter
-- ============================================================================
-- Service-role-only wrappers used by the Paperclip adapter. They expose only the
-- minimal lead-supply actions Magin needs and leave the existing CRM and
-- discovery RPCs unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(
  p_lead_ids uuid[]
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
  v_guard jsonb;
  v_recipient text;
  v_domain text;
BEGIN
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
    v_domain := '@' || split_part(v_recipient, '@', 2);

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

    IF coalesce(v_lead.do_not_contact, false) IS TRUE THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', 'do_not_contact'
      ));
      CONTINUE;
    END IF;

    IF v_lead.converted_partner_id IS NOT NULL
      OR (
        v_lead.ico IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.partners p
          WHERE p.ico = v_lead.ico
        )
      )
    THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', 'already_partner'
      ));
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sales_lead_suppressions s
      WHERE s.is_active IS TRUE
        AND lower(btrim(s.email_pattern)) IN (v_recipient, v_domain)
    ) THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', 'suppressed'
      ));
      CONTINUE;
    END IF;

    IF public.sales_lead_initial_email_already_recorded(v_lead_id, v_recipient, NULL) THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', 'initial_email_already_recorded'
      ));
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sales_lead_email_deliveries d
      WHERE d.lead_id = v_lead_id
        AND d.status IN ('prepared', 'sending', 'provider_accepted', 'committed', 'uncertain')
    ) THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', 'active_delivery_exists'
      ));
      CONTINUE;
    END IF;

    v_guard := public.sales_lead_email_send_guard(v_lead_id);

    IF coalesce((v_guard->>'success')::boolean, false) IS NOT TRUE THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', coalesce(v_guard->>'error', 'send_guard_failed'),
        'guard', v_guard
      ));
      CONTINUE;
    END IF;

    UPDATE public.sales_leads
    SET
      status = 'novy',
      updated_at = now()
    WHERE id = v_lead_id
      AND status = 'navrzeny'
      AND coalesce(email_verified_by_admin, false) IS TRUE
      AND email_verification_method = 'backend_verified_official_website'
      AND email_verified_at IS NOT NULL
      AND lower(btrim(coalesce(contact_email, ''))) = v_recipient
      AND coalesce(btrim(email_source), '') <> ''
      AND email_source ~* '^https?://';

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object(
        'lead_id', v_lead_id,
        'reason', 'lead_changed_during_approval'
      ));
      CONTINUE;
    END IF;

    INSERT INTO public.sales_lead_status_history (
      lead_id,
      old_status,
      new_status,
      changed_by,
      reason
    )
    VALUES (
      v_lead_id,
      'navrzeny',
      'novy',
      NULL,
      'Magin approved backend-verified discovery proposal'
    );

    INSERT INTO public.sales_lead_activities (
      lead_id,
      activity_type,
      direction,
      performed_by,
      metadata
    )
    VALUES (
      v_lead_id,
      'status_changed',
      'internal',
      NULL,
      jsonb_build_object(
        'from', 'navrzeny',
        'to', 'novy',
        'reason', 'Magin approved backend-verified discovery proposal',
        'actor', 'Magin - CRM operator OneMil',
        'source', 'sales-lead-magin-supply-agent',
        'verification_method', 'backend_verified_official_website'
      )
    );

    v_approved_count := v_approved_count + 1;
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

REVOKE ALL ON FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(
  p_requested_count integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_requested_count integer := least(greatest(coalesce(p_requested_count, 1), 1), 25);
  v_active_job_count integer;
  v_job_id uuid;
BEGIN
  SELECT count(*)
  INTO v_active_job_count
  FROM public.sales_lead_discovery_jobs
  WHERE status IN ('queued', 'running');

  IF v_active_job_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'discovery_job_already_active'
    );
  END IF;

  INSERT INTO public.sales_lead_discovery_jobs (
    lead_group,
    requested_count,
    created_by
  )
  VALUES (
    'e-shopy',
    v_requested_count,
    NULL
  )
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'job_id', v_job_id,
    'lead_group', 'e-shopy',
    'requested_count', v_requested_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(integer) TO service_role;

COMMENT ON FUNCTION public.sales_lead_magin_approve_backend_verified_proposals(uuid[]) IS
  'Narrow service-role-only adapter for Magin: approve only proposed leads already backend-verified from an official website.';

COMMENT ON FUNCTION public.sales_lead_magin_create_e_shopy_discovery_job(integer) IS
  'Narrow service-role-only adapter for Magin: enqueue a discovery job only for lead_group e-shopy.';

COMMIT;
