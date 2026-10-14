-- PR 3: admin-only preparation of first-email batches.
-- This migration changes no sender, worker, cron, Edge Function, email_queue,
-- reply, follow-up, or provider integration. A stored row never sends email.

BEGIN;

CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_create(
  p_lead_ids uuid[],
  p_template_id uuid,
  p_scheduled_date date,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_existing public.sales_lead_email_batches%ROWTYPE;
  v_template public.sales_lead_email_templates%ROWTYPE;
  v_result jsonb;
  v_recipient_lock text;
  v_lead_id uuid;
  v_eligible jsonb := '[]'::jsonb;
  v_ineligible jsonb := '[]'::jsonb;
  v_seen_recipients text[] := ARRAY[]::text[];
  v_active_today integer;
  v_available integer;
  v_batch_id uuid;
  v_batch_status text;
  v_count integer;
  v_index integer := 0;
  v_window_seconds numeric;
  v_scheduled_for timestamptz;
  v_request_fingerprint text;
  v_window jsonb;
  v_actual_window_start timestamptz;
  v_actual_window_end timestamptz;
  v_inserted_skips integer;
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage', v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;
  IF p_lead_ids IS NULL OR coalesce(array_length(p_lead_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_ids_required');
  END IF;
  IF coalesce(array_length(p_lead_ids, 1), 0) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'too_many_selected_leads');
  END IF;
  IF nullif(btrim(coalesce(p_idempotency_key, '')), '') IS NULL
     OR length(btrim(p_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_idempotency_key');
  END IF;
  IF p_scheduled_date IS NULL OR p_scheduled_date < (now() AT TIME ZONE 'Europe/Prague')::date THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_scheduled_date');
  END IF;

  SELECT encode(extensions.digest(convert_to(
    coalesce(string_agg(selected_id::text, ',' ORDER BY selected_id), '')
    || '|' || coalesce(p_template_id::text, '')
    || '|' || p_scheduled_date::text,
    'UTF8'
  ), 'sha256'), 'hex') INTO v_request_fingerprint
  FROM (
    SELECT DISTINCT x AS selected_id
    FROM unnest(p_lead_ids) AS requested(x)
    WHERE x IS NOT NULL
  ) fingerprint_input;

  SELECT * INTO v_existing
  FROM public.sales_lead_email_batches
  WHERE idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM v_caller
       OR v_existing.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
      RETURN jsonb_build_object('success', false, 'error', 'idempotency_key_conflict');
    END IF;
    SELECT * INTO v_settings
    FROM public.sales_lead_email_automation_settings
    WHERE singleton;
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_replay', true,
      'batch_id', v_existing.id,
      'batch_status', v_existing.status,
      'automation_enabled', v_settings.enabled,
      'scheduled_count', v_existing.scheduled_count,
      'skipped_count', v_existing.skipped_count,
      'ineligible', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'lead_id', s.requested_lead_id,
          'company_name', s.company_name_snapshot,
          'reason', s.reason
        ) ORDER BY s.created_at, s.id)
        FROM public.sales_lead_email_batch_skips s
        WHERE s.batch_id = v_existing.id
      ), '[]'::jsonb)
    );
  END IF;

  -- The singleton row serializes daily-capacity decisions and provides the
  -- current kill-switch snapshot. Disabled means prepare as paused, not reject.
  SELECT * INTO v_settings
  FROM public.sales_lead_email_automation_settings
  WHERE singleton
  FOR UPDATE;
  v_batch_status := CASE WHEN v_settings.enabled THEN 'scheduled' ELSE 'paused' END;

  SELECT * INTO v_template FROM public.sales_lead_email_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'template_not_found'); END IF;

  -- Lock selected leads in a consistent order, then take deterministic advisory
  -- locks for both lead IDs and normalized recipients.
  PERFORM 1 FROM public.sales_leads l
  WHERE l.id IN (SELECT DISTINCT x FROM unnest(p_lead_ids) AS selected(x) WHERE x IS NOT NULL)
  ORDER BY l.id FOR UPDATE;
  FOR v_lead_id IN
    SELECT DISTINCT x FROM unnest(p_lead_ids) AS selected(x) WHERE x IS NOT NULL ORDER BY x
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('sales-lead-batch:lead:' || v_lead_id::text, 0));
  END LOOP;
  FOR v_recipient_lock IN
    SELECT DISTINCT lower(btrim(l.contact_email)) AS recipient
    FROM public.sales_leads l
    WHERE l.id IN (SELECT DISTINCT x FROM unnest(p_lead_ids) AS selected(x) WHERE x IS NOT NULL)
      AND nullif(btrim(l.contact_email), '') IS NOT NULL
    ORDER BY recipient
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('sales-lead-batch:email:' || v_recipient_lock, 0));
  END LOOP;

  SELECT count(*) INTO v_active_today
  FROM public.sales_lead_email_batch_items i
  JOIN public.sales_lead_email_batches b ON b.id = i.batch_id
  WHERE b.scheduled_date = p_scheduled_date
    AND i.status IN ('pending', 'processing', 'sent', 'failed');
  v_available := greatest(v_settings.daily_limit - v_active_today, 0);

  FOR v_lead_id IN
    SELECT DISTINCT x FROM unnest(p_lead_ids) AS selected(x) WHERE x IS NOT NULL ORDER BY x
  LOOP
    v_result := public.sales_lead_email_batch_check_one(v_lead_id, p_template_id);
    IF coalesce((v_result->>'eligible')::boolean, false)
       AND (v_result->>'recipient') = ANY(v_seen_recipients) THEN
      v_result := v_result || jsonb_build_object(
        'eligible', false,
        'reason', 'duplicate_recipient_in_selection'
      );
    ELSIF coalesce((v_result->>'eligible')::boolean, false)
       AND jsonb_array_length(v_eligible) >= v_available THEN
      v_result := v_result || jsonb_build_object(
        'eligible', false,
        'reason', 'daily_limit_exceeded'
      );
    END IF;
    IF coalesce((v_result->>'eligible')::boolean, false) THEN
      v_seen_recipients := array_append(v_seen_recipients, v_result->>'recipient');
      v_eligible := v_eligible || jsonb_build_array(v_result);
    ELSE
      v_ineligible := v_ineligible || jsonb_build_array(v_result);
    END IF;
  END LOOP;

  v_count := jsonb_array_length(v_eligible);
  IF v_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'no_eligible_leads',
      'ineligible', v_ineligible
    );
  END IF;
  IF v_count > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_limit_exceeded');
  END IF;

  v_window := public.sales_lead_email_batch_schedule_window(
    p_scheduled_date,
    v_settings.timezone,
    v_settings.window_start,
    v_settings.window_end,
    v_count
  );
  IF coalesce((v_window->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_window->>'error');
  END IF;
  v_actual_window_start := (v_window->>'window_start')::timestamptz;
  v_actual_window_end := (v_window->>'window_end')::timestamptz;

  INSERT INTO public.sales_lead_email_batches (
    status,
    template_id,
    template_name_snapshot,
    created_by,
    scheduled_date,
    timezone,
    window_start,
    window_end,
    daily_limit,
    idempotency_key,
    request_fingerprint,
    scheduled_count,
    skipped_count
  ) VALUES (
    v_batch_status,
    v_template.id,
    v_template.name,
    v_caller,
    p_scheduled_date,
    v_settings.timezone,
    (v_actual_window_start AT TIME ZONE v_settings.timezone)::time,
    (v_actual_window_end AT TIME ZONE v_settings.timezone)::time,
    v_settings.daily_limit,
    btrim(p_idempotency_key),
    v_request_fingerprint,
    v_count,
    jsonb_array_length(v_ineligible)
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.sales_lead_email_batch_skips (
    batch_id,
    requested_lead_id,
    company_name_snapshot,
    reason
  )
  SELECT
    v_batch_id,
    (skipped.value->>'lead_id')::uuid,
    nullif(skipped.value->>'company_name', ''),
    skipped.value->>'reason'
  FROM jsonb_array_elements(v_ineligible) AS skipped(value);
  GET DIAGNOSTICS v_inserted_skips = ROW_COUNT;
  IF v_inserted_skips IS DISTINCT FROM jsonb_array_length(v_ineligible) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'sales_lead_email_batch_skip_audit_mismatch';
  END IF;

  v_window_seconds := extract(epoch FROM (v_actual_window_end - v_actual_window_start));
  FOR v_result IN SELECT value FROM jsonb_array_elements(v_eligible)
  LOOP
    v_scheduled_for := v_actual_window_start
      + make_interval(secs => (v_index * v_window_seconds / v_count)::double precision);
    INSERT INTO public.sales_lead_email_batch_items (
      batch_id,
      lead_id,
      status,
      scheduled_for,
      recipient_snapshot,
      email_source_snapshot,
      email_verification_method_snapshot,
      email_verified_at_snapshot,
      subject_snapshot,
      body_source_snapshot,
      body_text_snapshot,
      body_html_snapshot,
      template_id_snapshot,
      template_updated_at_snapshot,
      company_name_snapshot
    ) VALUES (
      v_batch_id,
      (v_result->>'lead_id')::uuid,
      'pending',
      v_scheduled_for,
      v_result->>'recipient',
      v_result->>'email_source',
      v_result->>'email_verification_method',
      (v_result->>'email_verified_at')::timestamptz,
      v_result->>'subject',
      v_result->>'body_source',
      v_result->>'body_text',
      v_result->>'body_html',
      (v_result->>'template_id')::uuid,
      (v_result->>'template_updated_at')::timestamptz,
      v_result->>'company_name'
    );
    v_index := v_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'idempotent_replay', false,
    'batch_id', v_batch_id,
    'batch_status', v_batch_status,
    'automation_enabled', v_settings.enabled,
    'scheduled_count', v_count,
    'skipped_count', jsonb_array_length(v_ineligible),
    'ineligible', v_ineligible
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
    FROM public.sales_lead_email_batches
    WHERE idempotency_key = btrim(p_idempotency_key);
    IF FOUND
       AND v_existing.created_by = v_caller
       AND v_existing.request_fingerprint = v_request_fingerprint THEN
      SELECT * INTO v_settings
      FROM public.sales_lead_email_automation_settings
      WHERE singleton;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent_replay', true,
        'batch_id', v_existing.id,
        'batch_status', v_existing.status,
        'automation_enabled', v_settings.enabled,
        'scheduled_count', v_existing.scheduled_count,
        'skipped_count', v_existing.skipped_count,
        'ineligible', coalesce((
          SELECT jsonb_agg(jsonb_build_object(
            'lead_id', s.requested_lead_id,
            'company_name', s.company_name_snapshot,
            'reason', s.reason
          ) ORDER BY s.created_at, s.id)
          FROM public.sales_lead_email_batch_skips s
          WHERE s.batch_id = v_existing.id
        ), '[]'::jsonb)
      );
    END IF;
    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'idempotency_key_conflict');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'concurrent_enrollment_conflict');
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text)
  TO authenticated;

COMMENT ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text) IS
  'Atomically rechecks eligibility and stores at most 20 frozen first-email items. When automation is disabled, the batch is prepared only as paused. A database row never sends email or calls a provider.';

-- Admin-only safe entry point. The administration UI must call ONLY this
-- wrapper. It refuses to do anything unless automation is provably disabled,
-- and it accepts nothing except a paused batch. Any other outcome rolls the
-- whole attempt back, so no batch, item, or skip row survives.
CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_prepare_paused(
  p_lead_ids uuid[],
  p_template_id uuid,
  p_scheduled_date date,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_result jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage', v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  -- Hold the kill-switch row for the rest of this transaction. The wrapped call
  -- takes the same lock, so automation cannot be enabled between this check and
  -- the stored batch status.
  SELECT * INTO v_settings
  FROM public.sales_lead_email_automation_settings
  WHERE singleton
  FOR UPDATE;
  IF NOT FOUND OR v_settings.enabled IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('success', false, 'error', 'automation_must_be_disabled');
  END IF;

  BEGIN
    v_result := public.sales_lead_email_batch_create(
      p_lead_ids,
      p_template_id,
      p_scheduled_date,
      p_idempotency_key
    );
    IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
       OR (v_result->>'batch_status') IS DISTINCT FROM 'paused'
       OR (v_result->>'automation_enabled')::boolean IS DISTINCT FROM false THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'sales_lead_email_batch_prepare_paused_rejected';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- Every write made by the wrapped call is rolled back with this block.
      IF v_result IS NOT NULL
         AND coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
         AND nullif(v_result->>'error', '') IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', v_result->>'error',
          'ineligible', coalesce(v_result->'ineligible', '[]'::jsonb)
        );
      END IF;
      RETURN jsonb_build_object('success', false, 'error', 'unexpected_batch_state');
  END;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_prepare_paused(uuid[],uuid,date,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_prepare_paused(uuid[],uuid,date,text)
  TO authenticated;

COMMENT ON FUNCTION public.sales_lead_email_batch_prepare_paused(uuid[],uuid,date,text) IS
  'Admin-only wrapper. Requires disabled automation, reuses the existing atomic enrollment, and accepts only a paused batch; anything else is rolled back. Never sends email or calls a provider.';

-- Fail closed after every application of this migration. A later explicit,
-- separately approved operational step is required to enable automation.
UPDATE public.sales_lead_email_automation_settings
SET enabled = false,
    updated_at = clock_timestamp(),
    updated_by = NULL
WHERE singleton;

COMMIT;
