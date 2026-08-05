-- PR 4: internal worker for manually prepared first-email batches.
-- This migration adds no cron, no pg_cron, no pg_net, no network call, no
-- email_queue write, and no automatic lead selection. Nothing here can send an
-- e-mail on its own: every function below only prepares, records, or accounts
-- for work that an explicitly deployed and separately approved worker performs.
-- Automation stays disabled at the end of this migration.

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared history detection
-- ---------------------------------------------------------------------------
-- One place that decides whether a first business e-mail was already recorded.
-- It recognises legacy manual activities (sent_by=human), delivery-backed
-- activities (email_delivery_id), and batch activities (delivery_mode).
CREATE FUNCTION public.sales_lead_initial_email_already_recorded(
  p_lead_id uuid,
  p_recipient text,
  p_exclude_delivery_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales_lead_activities a
    LEFT JOIN public.sales_leads activity_lead ON activity_lead.id = a.lead_id
    WHERE a.activity_type = 'email_sent'
      AND a.direction = 'outbound'
      AND (
        a.metadata->>'sent_by' = 'human'
        OR a.email_delivery_id IS NOT NULL
        OR a.metadata->>'delivery_mode' = 'batch_initial'
      )
      AND (p_exclude_delivery_id IS NULL OR a.email_delivery_id IS DISTINCT FROM p_exclude_delivery_id)
      AND (
        a.lead_id = p_lead_id
        OR (
          nullif(lower(btrim(coalesce(p_recipient, ''))), '') IS NOT NULL
          AND lower(btrim(coalesce(a.metadata->>'to', activity_lead.contact_email, '')))
              = lower(btrim(p_recipient))
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.sales_lead_initial_email_already_recorded(uuid,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_initial_email_already_recorded(uuid,text,uuid) TO service_role;

-- Batch preparation must use the same widened detection.
CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_check_one(
  p_lead_id uuid,
  p_template_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead public.sales_leads%ROWTYPE;
  v_template public.sales_lead_email_templates%ROWTYPE;
  v_recipient text;
  v_domain text;
  v_subject text;
  v_body_source text;
  v_body_text text;
  v_body_html text;
  v_guard jsonb;
BEGIN
  SELECT * INTO v_template FROM public.sales_lead_email_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'reason', 'template_not_found'); END IF;
  IF NOT v_template.is_active THEN RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'reason', 'template_inactive'); END IF;
  IF v_template.template_type IS DISTINCT FROM 'initial' THEN RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'reason', 'template_not_initial'); END IF;

  SELECT * INTO v_lead FROM public.sales_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'reason', 'lead_not_found'); END IF;
  IF v_lead.status NOT IN ('novy', 'priprava', 'schvaleni_ceka') THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'initial_email_status_not_allowed');
  END IF;
  IF v_lead.do_not_contact THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'do_not_contact');
  END IF;
  IF v_lead.converted_partner_id IS NOT NULL
     OR (v_lead.ico IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.partners p WHERE p.ico = v_lead.ico
     )) THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'existing_partner');
  END IF;

  v_recipient := lower(btrim(coalesce(v_lead.contact_email, '')));
  IF length(v_recipient) > 320 OR v_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'invalid_contact_email');
  END IF;
  IF v_lead.email_verified_by_admin IS NOT TRUE
     OR v_lead.email_verification_method NOT IN ('admin_manual', 'backend_verified_official_website')
     OR v_lead.email_verified_at IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'email_not_verified');
  END IF;
  IF nullif(btrim(coalesce(v_lead.email_source, '')), '') IS NULL THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'email_source_missing');
  END IF;
  IF length(btrim(v_lead.email_source)) > 2048 THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'email_source_too_long');
  END IF;

  v_domain := '@' || split_part(v_recipient, '@', 2);
  IF EXISTS (
    SELECT 1 FROM public.sales_lead_email_suppression s
    WHERE lower(btrim(s.email_pattern)) IN (v_recipient, v_domain)
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'suppressed');
  END IF;

  IF public.sales_lead_initial_email_already_recorded(p_lead_id, v_recipient, NULL) THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'initial_email_already_sent');
  END IF;

  v_guard := public.sales_lead_email_send_guard(p_lead_id);
  IF coalesce((v_guard->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name,
      'reason', coalesce(v_guard->>'error', 'duplicate_guard_failed')
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sales_lead_email_batch_items i
    WHERE i.status IN ('pending', 'processing', 'sent', 'failed')
      AND (i.lead_id = p_lead_id OR lower(btrim(i.recipient_snapshot)) = v_recipient)
  ) THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'already_in_active_batch');
  END IF;

  v_subject := public.sales_lead_email_batch_render_source(v_template.subject, v_lead.company_name, v_lead.contact_person, v_lead.contact_role, v_lead.city, v_lead.website);
  v_body_source := public.sales_lead_email_batch_render_source(v_template.body, v_lead.company_name, v_lead.contact_person, v_lead.contact_role, v_lead.city, v_lead.website);
  IF (v_subject || E'\n' || v_body_source) ~ '\{\{[^{}]+\}\}' THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'unresolved_template_variables');
  END IF;
  IF length(btrim(v_subject)) NOT BETWEEN 1 AND 300 THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'invalid_subject');
  END IF;
  IF length(btrim(v_body_source)) NOT BETWEEN 1 AND 20000 THEN
    RETURN jsonb_build_object('eligible', false, 'lead_id', p_lead_id, 'company_name', v_lead.company_name, 'reason', 'invalid_body');
  END IF;

  v_body_text := public.sales_lead_email_batch_render_text(v_body_source);
  v_body_html := public.sales_lead_email_batch_render_html(v_body_source);
  RETURN jsonb_build_object(
    'eligible', true,
    'lead_id', p_lead_id,
    'company_name', v_lead.company_name,
    'recipient', v_recipient,
    'email_source', btrim(v_lead.email_source),
    'email_verification_method', v_lead.email_verification_method,
    'email_verified_at', v_lead.email_verified_at,
    'subject', v_subject,
    'body_source', v_body_source,
    'body_text', v_body_text,
    'body_html', v_body_html,
    'template_id', v_template.id,
    'template_name', v_template.name,
    'template_updated_at', v_template.updated_at
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Batch status accounting
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.sales_lead_email_batch_recalculate_status(p_batch_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch public.sales_lead_email_batches%ROWTYPE;
  v_open integer;
  v_failed integer;
  v_next text;
BEGIN
  SELECT * INTO v_batch FROM public.sales_lead_email_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND OR v_batch.status <> 'scheduled' THEN
    RETURN coalesce(v_batch.status, 'batch_not_found');
  END IF;
  SELECT
    count(*) FILTER (WHERE i.status IN ('pending', 'processing')),
    count(*) FILTER (WHERE i.status = 'failed')
  INTO v_open, v_failed
  FROM public.sales_lead_email_batch_items i
  WHERE i.batch_id = p_batch_id;
  IF v_open > 0 THEN
    RETURN 'scheduled';
  END IF;
  v_next := CASE WHEN v_failed > 0 THEN 'failed' ELSE 'completed' END;
  UPDATE public.sales_lead_email_batches
  SET status = v_next, updated_at = now()
  WHERE id = p_batch_id;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_recalculate_status(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_recalculate_status(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Controlled batch activation (paused -> scheduled)
-- ---------------------------------------------------------------------------
-- Service-role only. PR 4 adds no UI and no automatic caller for this RPC.
CREATE FUNCTION public.sales_lead_email_batch_activate(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_batch public.sales_lead_email_batches%ROWTYPE;
  v_now timestamptz := now();
  v_today date;
  v_window_end timestamptz;
BEGIN
  SELECT * INTO v_settings FROM public.sales_lead_email_automation_settings WHERE singleton FOR UPDATE;
  IF NOT FOUND OR v_settings.enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success', false, 'error', 'automation_must_be_enabled');
  END IF;

  SELECT * INTO v_batch FROM public.sales_lead_email_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'batch_not_found'); END IF;
  IF v_batch.status <> 'paused' THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_not_activatable', 'batch_status', v_batch.status);
  END IF;
  -- Freeze the prepared items too; activation must never rewrite them.
  PERFORM 1 FROM public.sales_lead_email_batch_items
  WHERE batch_id = p_batch_id ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.sales_lead_email_batch_items
             WHERE batch_id = p_batch_id AND status = 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_processing');
  END IF;

  v_today := (v_now AT TIME ZONE v_batch.timezone)::date;
  v_window_end := (v_batch.scheduled_date + v_batch.window_end) AT TIME ZONE v_batch.timezone;
  IF v_batch.scheduled_date < v_today OR v_now >= v_window_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'scheduled_window_missed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_lead_email_batch_items
                 WHERE batch_id = p_batch_id AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_pending_items');
  END IF;

  UPDATE public.sales_lead_email_batches
  SET status = 'scheduled', updated_at = now()
  WHERE id = p_batch_id AND status = 'paused';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_not_activatable');
  END IF;
  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'batch_status', 'scheduled');
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_activate(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_activate(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Worker claim: at most one item per call
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.sales_lead_email_batch_claim_next()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_item public.sales_lead_email_batch_items%ROWTYPE;
  v_batch public.sales_lead_email_batches%ROWTYPE;
  v_lead public.sales_leads%ROWTYPE;
  v_delivery public.sales_lead_email_deliveries%ROWTYPE;
  v_now timestamptz := now();
  v_today date;
  v_recipient text;
  v_domain text;
  v_guard jsonb;
  v_reason text := NULL;
BEGIN
  -- The kill switch is the first barrier and stays locked for the whole call.
  SELECT * INTO v_settings FROM public.sales_lead_email_automation_settings WHERE singleton FOR UPDATE;
  IF NOT FOUND OR v_settings.enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success', true, 'action', 'noop', 'reason', 'automation_disabled');
  END IF;

  -- Phase 0: an accepted provider call whose commit failed may only be finished.
  SELECT i.* INTO v_item
  FROM public.sales_lead_email_batch_items i
  JOIN public.sales_lead_email_batches b ON b.id = i.batch_id
  JOIN public.sales_lead_email_deliveries d ON d.batch_item_id = i.id
  WHERE i.status = 'processing'
    AND b.status = 'scheduled'
    AND d.mode = 'batch_initial'
    AND d.status = 'provider_accepted'
  ORDER BY i.scheduled_for, i.id
  FOR UPDATE OF i SKIP LOCKED
  LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_delivery FROM public.sales_lead_email_deliveries
    WHERE batch_item_id = v_item.id AND status = 'provider_accepted'
    ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object(
      'success', true, 'action', 'commit_only',
      'batch_item_id', v_item.id, 'batch_id', v_item.batch_id, 'lead_id', v_item.lead_id,
      'delivery_id', v_delivery.id
    );
  END IF;

  v_today := (v_now AT TIME ZONE 'Europe/Prague')::date;

  -- Phase 1: an item whose day or window has passed is never sent later.
  SELECT i.* INTO v_item
  FROM public.sales_lead_email_batch_items i
  JOIN public.sales_lead_email_batches b ON b.id = i.batch_id
  WHERE i.status = 'pending'
    AND b.status = 'scheduled'
    AND (
      b.scheduled_date < (v_now AT TIME ZONE b.timezone)::date
      OR v_now >= ((b.scheduled_date + b.window_end) AT TIME ZONE b.timezone)
    )
  ORDER BY i.scheduled_for, i.id
  FOR UPDATE OF i SKIP LOCKED
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.sales_lead_email_batch_items
    SET status = 'skipped', skip_reason = 'scheduled_window_missed', updated_at = now()
    WHERE id = v_item.id AND status = 'pending';
    PERFORM public.sales_lead_email_batch_recalculate_status(v_item.batch_id);
    RETURN jsonb_build_object('success', true, 'action', 'skipped', 'reason', 'scheduled_window_missed',
      'batch_item_id', v_item.id, 'batch_id', v_item.batch_id, 'lead_id', v_item.lead_id);
  END IF;

  -- Phase 2: exactly one item that is due right now inside its own window.
  SELECT i.* INTO v_item
  FROM public.sales_lead_email_batch_items i
  JOIN public.sales_lead_email_batches b ON b.id = i.batch_id
  WHERE i.status = 'pending'
    AND b.status = 'scheduled'
    AND b.scheduled_date = (v_now AT TIME ZONE b.timezone)::date
    AND i.scheduled_for <= v_now
    AND v_now >= ((b.scheduled_date + b.window_start) AT TIME ZONE b.timezone)
    AND v_now < ((b.scheduled_date + b.window_end) AT TIME ZONE b.timezone)
  ORDER BY i.scheduled_for, i.id
  FOR UPDATE OF i SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'action', 'noop', 'reason', 'no_due_item');
  END IF;

  SELECT * INTO v_batch FROM public.sales_lead_email_batches WHERE id = v_item.batch_id FOR UPDATE;
  IF v_batch.status <> 'scheduled' THEN
    RETURN jsonb_build_object('success', true, 'action', 'noop', 'reason', 'batch_not_scheduled');
  END IF;

  -- Re-verify every barrier immediately before the item becomes processing.
  SELECT * INTO v_lead FROM public.sales_leads WHERE id = v_item.lead_id FOR UPDATE;
  v_recipient := lower(btrim(coalesce(v_lead.contact_email, '')));
  v_domain := '@' || split_part(v_recipient, '@', 2);
  IF NOT FOUND THEN
    v_reason := 'lead_not_found';
  ELSIF v_lead.status NOT IN ('novy', 'priprava', 'schvaleni_ceka') THEN
    v_reason := 'initial_email_status_not_allowed';
  ELSIF v_lead.do_not_contact THEN
    v_reason := 'do_not_contact';
  ELSIF v_lead.converted_partner_id IS NOT NULL
     OR (v_lead.ico IS NOT NULL AND EXISTS (SELECT 1 FROM public.partners p WHERE p.ico = v_lead.ico)) THEN
    v_reason := 'existing_partner';
  ELSIF v_recipient IS DISTINCT FROM lower(btrim(v_item.recipient_snapshot)) THEN
    v_reason := 'contact_email_changed';
  ELSIF v_lead.email_verified_by_admin IS NOT TRUE
     OR v_lead.email_verification_method NOT IN ('admin_manual', 'backend_verified_official_website')
     OR v_lead.email_verified_at IS NULL
     OR nullif(btrim(coalesce(v_lead.email_source, '')), '') IS NULL THEN
    v_reason := 'email_not_verified';
  ELSIF EXISTS (SELECT 1 FROM public.sales_lead_email_suppression s
                WHERE lower(btrim(s.email_pattern)) IN (v_recipient, v_domain)) THEN
    v_reason := 'suppressed';
  ELSIF public.sales_lead_initial_email_already_recorded(v_item.lead_id, v_recipient, NULL) THEN
    v_reason := 'initial_email_already_sent';
  ELSIF EXISTS (SELECT 1 FROM public.sales_lead_email_deliveries d
                WHERE d.lead_id = v_item.lead_id
                  AND (d.batch_item_id IS DISTINCT FROM v_item.id)
                  AND d.status IN ('prepared','sending','provider_accepted','committed','uncertain')) THEN
    v_reason := 'initial_email_already_claimed';
  ELSIF EXISTS (SELECT 1 FROM public.sales_lead_email_batch_items other
                WHERE other.id <> v_item.id
                  AND other.status IN ('processing', 'sent')
                  AND (other.lead_id = v_item.lead_id
                       OR lower(btrim(other.recipient_snapshot)) = v_recipient)) THEN
    v_reason := 'already_in_active_batch';
  END IF;
  IF v_reason IS NULL THEN
    v_guard := public.sales_lead_email_send_guard(v_item.lead_id);
    IF coalesce((v_guard->>'success')::boolean, false) IS NOT TRUE THEN
      v_reason := coalesce(v_guard->>'error', 'duplicate_guard_failed');
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.sales_lead_email_batch_items
    SET status = 'skipped', skip_reason = v_reason, updated_at = now()
    WHERE id = v_item.id AND status = 'pending';
    PERFORM public.sales_lead_email_batch_recalculate_status(v_item.batch_id);
    RETURN jsonb_build_object('success', true, 'action', 'skipped', 'reason', v_reason,
      'batch_item_id', v_item.id, 'batch_id', v_item.batch_id, 'lead_id', v_item.lead_id);
  END IF;

  UPDATE public.sales_lead_email_batch_items
  SET status = 'processing', attempt_count = attempt_count + 1, updated_at = now()
  WHERE id = v_item.id AND status = 'pending'
  RETURNING * INTO v_item;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'action', 'noop', 'reason', 'item_already_taken');
  END IF;

  -- Only frozen snapshots leave this function.
  RETURN jsonb_build_object(
    'success', true,
    'action', 'send',
    'batch_item_id', v_item.id,
    'batch_id', v_item.batch_id,
    'lead_id', v_item.lead_id,
    'performed_by', v_batch.created_by,
    'recipient', v_item.recipient_snapshot,
    'subject', v_item.subject_snapshot,
    'body_source', v_item.body_source_snapshot,
    'body_text', v_item.body_text_snapshot,
    'body_html', v_item.body_html_snapshot,
    'attempt_count', v_item.attempt_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_claim_next()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_claim_next() TO service_role;

-- ---------------------------------------------------------------------------
-- Failed batch attempt
-- ---------------------------------------------------------------------------
CREATE FUNCTION public.sales_lead_email_batch_item_record_failure(
  p_batch_item_id uuid,
  p_outcome text,
  p_error_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.sales_lead_email_batch_items%ROWTYPE;
  v_delivery public.sales_lead_email_deliveries%ROWTYPE;
  v_batch_status text;
BEGIN
  IF p_outcome NOT IN ('rejected', 'uncertain') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_outcome');
  END IF;
  IF nullif(btrim(coalesce(p_error_code, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'error_code_required');
  END IF;

  SELECT * INTO v_item FROM public.sales_lead_email_batch_items
  WHERE id = p_batch_item_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'batch_item_not_found'); END IF;
  IF v_item.status <> 'processing' THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_item_not_processing', 'batch_item_status', v_item.status);
  END IF;
  PERFORM 1 FROM public.sales_lead_email_batches WHERE id = v_item.batch_id FOR UPDATE;

  SELECT * INTO v_delivery FROM public.sales_lead_email_deliveries
  WHERE batch_item_id = v_item.id ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    PERFORM 1 FROM public.sales_lead_email_deliveries WHERE id = v_delivery.id FOR UPDATE;
    -- An accepted or committed provider call must never be turned into a failure.
    IF v_delivery.status IN ('provider_accepted', 'committed') THEN
      RETURN jsonb_build_object('success', false, 'error', 'provider_accepted_commit_required');
    END IF;
  END IF;

  UPDATE public.sales_lead_email_batch_items
  SET status = 'failed', error_code = btrim(p_error_code), updated_at = now()
  WHERE id = v_item.id AND status = 'processing';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_item_not_processing');
  END IF;
  v_batch_status := public.sales_lead_email_batch_recalculate_status(v_item.batch_id);

  RETURN jsonb_build_object(
    'success', true, 'batch_item_id', v_item.id, 'batch_item_status', 'failed',
    'batch_status', v_batch_status, 'outcome', p_outcome,
    'delivery_status', v_delivery.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_item_record_failure(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_item_record_failure(uuid,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Delivery evidence: batch support
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_lead_initial_email_claim(
  p_delivery_key text,
  p_request_fingerprint text,
  p_lead_id uuid,
  p_mode text,
  p_batch_item_id uuid,
  p_recipient text,
  p_subject text,
  p_body_source text,
  p_body_text text,
  p_body_html text,
  p_attachment_metadata jsonb,
  p_performed_by uuid,
  p_outbound_capture_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lead public.sales_leads%ROWTYPE;
  v_delivery public.sales_lead_email_deliveries%ROWTYPE;
  v_item public.sales_lead_email_batch_items%ROWTYPE;
  v_batch public.sales_lead_email_batches%ROWTYPE;
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_guard jsonb;
  v_recipient text := lower(btrim(p_recipient));
  v_domain text;
  v_retry_rejected boolean := false;
  v_now timestamptz := now();
BEGIN
  IF p_mode NOT IN ('manual_initial', 'batch_initial') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_delivery_mode');
  END IF;
  IF p_mode = 'manual_initial' AND p_batch_item_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_delivery_mode');
  END IF;
  IF p_mode = 'batch_initial' AND p_batch_item_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_item_id_required');
  END IF;
  IF p_delivery_key !~ '^[0-9a-f]{64}$' OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_delivery_identity');
  END IF;

  IF p_mode = 'batch_initial' THEN
    -- Batch deliveries exist only for an item the worker already claimed, in a
    -- scheduled batch, inside its own window, with byte-identical snapshots.
    SELECT * INTO v_settings FROM public.sales_lead_email_automation_settings WHERE singleton FOR UPDATE;
    IF NOT FOUND OR v_settings.enabled IS DISTINCT FROM true THEN
      RETURN jsonb_build_object('success', false, 'error', 'automation_disabled');
    END IF;
    SELECT * INTO v_item FROM public.sales_lead_email_batch_items WHERE id = p_batch_item_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'batch_item_not_found'); END IF;
    IF v_item.lead_id IS DISTINCT FROM p_lead_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'batch_item_lead_mismatch');
    END IF;
    IF v_item.status <> 'processing' THEN
      RETURN jsonb_build_object('success', false, 'error', 'batch_item_not_processing');
    END IF;
    SELECT * INTO v_batch FROM public.sales_lead_email_batches WHERE id = v_item.batch_id FOR UPDATE;
    IF NOT FOUND OR v_batch.status <> 'scheduled' THEN
      RETURN jsonb_build_object('success', false, 'error', 'batch_not_scheduled');
    END IF;
    IF v_batch.scheduled_date <> (v_now AT TIME ZONE v_batch.timezone)::date
       OR v_now < ((v_batch.scheduled_date + v_batch.window_start) AT TIME ZONE v_batch.timezone)
       OR v_now >= ((v_batch.scheduled_date + v_batch.window_end) AT TIME ZONE v_batch.timezone) THEN
      RETURN jsonb_build_object('success', false, 'error', 'scheduled_window_missed');
    END IF;
    IF v_item.scheduled_for > v_now THEN
      RETURN jsonb_build_object('success', false, 'error', 'batch_item_not_due');
    END IF;
    IF v_recipient IS DISTINCT FROM lower(btrim(v_item.recipient_snapshot))
       OR p_subject IS DISTINCT FROM v_item.subject_snapshot
       OR p_body_source IS DISTINCT FROM v_item.body_source_snapshot
       OR p_body_text IS DISTINCT FROM v_item.body_text_snapshot
       OR p_body_html IS DISTINCT FROM v_item.body_html_snapshot THEN
      RETURN jsonb_build_object('success', false, 'error', 'batch_snapshot_mismatch');
    END IF;
    IF coalesce(jsonb_array_length(coalesce(p_attachment_metadata, '[]'::jsonb)), 0) <> 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'batch_attachments_not_allowed');
    END IF;
  END IF;

  SELECT * INTO v_lead FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'lead_not_found'); END IF;

  IF p_mode = 'batch_initial' THEN
    -- Last barrier before any delivery row or provider call: the locked lead
    -- must still satisfy every preparation-time condition, and the worker must
    -- act as the person who created the batch.
    IF p_performed_by IS DISTINCT FROM v_batch.created_by THEN
      RETURN jsonb_build_object('success', false, 'error', 'batch_performer_mismatch');
    END IF;
    IF v_lead.converted_partner_id IS NOT NULL
       OR (v_lead.ico IS NOT NULL AND EXISTS (SELECT 1 FROM public.partners p WHERE p.ico = v_lead.ico)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'existing_partner');
    END IF;
    IF v_lead.email_verification_method IS NULL
       OR v_lead.email_verification_method NOT IN ('admin_manual', 'backend_verified_official_website')
       OR v_lead.email_verified_at IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_not_verified');
    END IF;
    IF nullif(btrim(coalesce(v_lead.email_source, '')), '') IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_source_missing');
    END IF;
    IF length(btrim(v_lead.email_source)) > 2048 THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_source_too_long');
    END IF;
  END IF;

  SELECT * INTO v_delivery FROM public.sales_lead_email_deliveries
  WHERE delivery_key = p_delivery_key;
  IF FOUND THEN
    IF v_delivery.request_fingerprint <> p_request_fingerprint OR v_delivery.lead_id <> p_lead_id
       OR v_delivery.mode <> p_mode
       OR v_delivery.batch_item_id IS DISTINCT FROM p_batch_item_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'delivery_key_conflict');
    END IF;
    IF v_delivery.status = 'committed' THEN
      RETURN jsonb_build_object('success', true, 'action', 'already_committed', 'delivery_id', v_delivery.id,
        'provider_message_id', v_delivery.provider_message_id, 'outbound_capture_id', v_delivery.outbound_capture_id);
    ELSIF v_delivery.status = 'provider_accepted' THEN
      RETURN jsonb_build_object('success', true, 'action', 'commit_only', 'delivery_id', v_delivery.id,
        'provider_message_id', v_delivery.provider_message_id, 'outbound_capture_id', v_delivery.outbound_capture_id);
    ELSIF v_delivery.status IN ('sending', 'prepared') THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_delivery_in_progress', 'retry_blocked', true);
    ELSIF v_delivery.status = 'uncertain' THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_delivery_outcome_uncertain', 'retry_blocked', true);
    ELSIF v_delivery.status = 'provider_rejected' THEN
      v_retry_rejected := true;
    END IF;
  END IF;

  IF btrim(p_subject) = '' THEN RETURN jsonb_build_object('success', false, 'error', 'email_subject_required'); END IF;
  IF btrim(p_body_source) = '' THEN RETURN jsonb_build_object('success', false, 'error', 'email_body_required'); END IF;
  IF length(btrim(p_subject)) > 300 THEN RETURN jsonb_build_object('success', false, 'error', 'email_subject_too_long'); END IF;
  IF length(btrim(p_body_source)) > 20000 THEN RETURN jsonb_build_object('success', false, 'error', 'email_body_too_long'); END IF;
  IF (p_subject || E'\n' || p_body_source) ~ '\{\{[^{}]+\}\}' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unresolved_template_variables');
  END IF;

  IF v_lead.status = 'navrzeny' THEN RETURN jsonb_build_object('success', false, 'error', 'proposal_not_approved'); END IF;
  IF v_lead.status NOT IN ('novy', 'priprava', 'schvaleni_ceka') THEN
    RETURN jsonb_build_object('success', false, 'error', 'initial_email_status_not_allowed');
  END IF;
  IF v_lead.do_not_contact THEN RETURN jsonb_build_object('success', false, 'error', 'do_not_contact'); END IF;
  IF v_recipient = '' OR length(v_recipient) > 320
     OR v_recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR v_recipient <> lower(btrim(coalesce(v_lead.contact_email, '')))
     OR v_lead.email_verified_by_admin IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_contact_email');
  END IF;
  v_domain := '@' || split_part(v_recipient, '@', 2);
  IF EXISTS (SELECT 1 FROM public.sales_lead_email_suppression WHERE email_pattern IN (v_recipient, v_domain)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'suppressed');
  END IF;
  IF public.sales_lead_initial_email_already_recorded(p_lead_id, v_recipient, v_delivery.id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'initial_email_already_sent');
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_lead_email_deliveries
    WHERE lead_id = p_lead_id AND id IS DISTINCT FROM v_delivery.id
      AND status IN ('prepared','sending','provider_accepted','committed','uncertain')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'initial_email_already_claimed');
  END IF;
  v_guard := public.sales_lead_email_send_guard(p_lead_id);
  IF coalesce((v_guard->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', coalesce(v_guard->>'error', 'duplicate_override_required'));
  END IF;

  IF v_retry_rejected THEN
    UPDATE public.sales_lead_email_deliveries
      SET status = 'sending', attempt_count = attempt_count + 1,
        last_error_code = NULL, updated_at = now()
      WHERE id = v_delivery.id AND status = 'provider_rejected';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_delivery_in_progress', 'retry_blocked', true);
    END IF;
    RETURN jsonb_build_object('success', true, 'action', 'call_provider', 'delivery_id', v_delivery.id,
      'outbound_capture_id', v_delivery.outbound_capture_id);
  END IF;

  INSERT INTO public.sales_lead_email_deliveries(
    delivery_key, request_fingerprint, lead_id, batch_item_id, mode, status,
    recipient_snapshot, subject_snapshot, body_source_snapshot, body_text_snapshot,
    body_html_snapshot, attachment_metadata, performed_by, outbound_capture_id, attempt_count
  ) VALUES (
    p_delivery_key, p_request_fingerprint, p_lead_id, p_batch_item_id, p_mode, 'sending',
    v_recipient, p_subject, p_body_source, p_body_text, p_body_html,
    coalesce(p_attachment_metadata, '[]'::jsonb), p_performed_by, p_outbound_capture_id, 1
  ) RETURNING * INTO v_delivery;

  RETURN jsonb_build_object('success', true, 'action', 'call_provider', 'delivery_id', v_delivery.id,
    'outbound_capture_id', v_delivery.outbound_capture_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'email_delivery_in_progress', 'retry_blocked', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_lead_initial_email_record_provider_result(
  p_delivery_id uuid,
  p_result text,
  p_provider_message_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delivery public.sales_lead_email_deliveries%ROWTYPE;
  v_item_status text;
BEGIN
  SELECT * INTO v_delivery FROM public.sales_lead_email_deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'delivery_not_found'); END IF;
  IF v_delivery.status = 'committed' THEN RETURN jsonb_build_object('success', true, 'status', 'committed'); END IF;
  IF v_delivery.mode = 'batch_initial' THEN
    -- Fail closed: a batch outcome belongs to an item the worker still holds.
    SELECT status INTO v_item_status FROM public.sales_lead_email_batch_items
    WHERE id = v_delivery.batch_item_id FOR UPDATE;
    IF v_item_status IS DISTINCT FROM 'processing' THEN
      RETURN jsonb_build_object('success', false, 'error', 'batch_item_not_processing');
    END IF;
  END IF;
  IF p_result = 'accepted' THEN
    IF p_provider_message_id IS NULL OR btrim(p_provider_message_id) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'provider_message_id_required');
    END IF;
    IF v_delivery.status = 'provider_accepted' AND v_delivery.provider_message_id IS DISTINCT FROM p_provider_message_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'provider_message_id_conflict');
    END IF;
    UPDATE public.sales_lead_email_deliveries SET status='provider_accepted', provider_message_id=p_provider_message_id,
      provider_accepted_at=coalesce(provider_accepted_at,now()), last_error_code=NULL, updated_at=now()
      WHERE id=p_delivery_id AND status IN ('sending','provider_accepted');
  ELSIF p_result = 'rejected' THEN
    UPDATE public.sales_lead_email_deliveries SET status='provider_rejected', last_error_code=coalesce(p_error_code,'email_send_failed'),
      updated_at=now() WHERE id=p_delivery_id AND status='sending';
  ELSIF p_result = 'uncertain' THEN
    UPDATE public.sales_lead_email_deliveries SET status='uncertain', last_error_code=coalesce(p_error_code,'provider_outcome_unknown'),
      updated_at=now() WHERE id=p_delivery_id AND status='sending';
  ELSE RETURN jsonb_build_object('success', false, 'error', 'invalid_provider_result');
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'invalid_delivery_transition'); END IF;
  RETURN jsonb_build_object('success', true, 'status', p_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_lead_initial_email_commit(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delivery public.sales_lead_email_deliveries%ROWTYPE;
  v_status jsonb;
  v_item public.sales_lead_email_batch_items%ROWTYPE;
  v_batch_status text := NULL;
BEGIN
  SELECT * INTO v_delivery FROM public.sales_lead_email_deliveries WHERE id=p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'delivery_not_found'); END IF;
  PERFORM 1 FROM public.sales_leads WHERE id=v_delivery.lead_id FOR UPDATE;
  IF v_delivery.status='committed' THEN
    RETURN jsonb_build_object('success', true, 'already_committed', true, 'delivery_id', v_delivery.id);
  END IF;
  IF v_delivery.status<>'provider_accepted' THEN
    RETURN jsonb_build_object('success', false, 'error', 'provider_acceptance_required');
  END IF;
  IF v_delivery.mode = 'batch_initial' THEN
    SELECT * INTO v_item FROM public.sales_lead_email_batch_items
    WHERE id = v_delivery.batch_item_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'batch_item_not_found'); END IF;
    IF v_item.status NOT IN ('processing', 'sent') THEN
      RETURN jsonb_build_object('success', false, 'error', 'batch_item_not_processing');
    END IF;
    PERFORM 1 FROM public.sales_lead_email_batches WHERE id = v_item.batch_id FOR UPDATE;
  END IF;

  INSERT INTO public.sales_lead_activities(
    lead_id, activity_type, direction, subject, body_snapshot, email_message_id,
    performed_by, metadata, email_delivery_id
  ) VALUES (
    v_delivery.lead_id, 'email_sent', 'outbound', v_delivery.subject_snapshot,
    v_delivery.body_source_snapshot, v_delivery.provider_message_id, v_delivery.performed_by,
    jsonb_build_object(
      'sent_by', CASE WHEN v_delivery.mode = 'batch_initial' THEN 'system' ELSE 'human' END,
      'delivery_mode', v_delivery.mode,
      'batch_item_id', v_delivery.batch_item_id,
      'from','b2b@onemil.cz','reply_to','b2b@onemil.cz',
      'to',v_delivery.recipient_snapshot,'reused_from_activity_id',NULL,'reuse_mode',NULL,
      'original_recipient',NULL,'resend_email_id',v_delivery.provider_message_id,
      'outbound_capture_id',v_delivery.outbound_capture_id,'attachments',v_delivery.attachment_metadata,
      'references',jsonb_build_array(),'delivery_id',v_delivery.id),
    v_delivery.id
  ) ON CONFLICT (email_delivery_id) WHERE activity_type='email_sent' AND email_delivery_id IS NOT NULL DO NOTHING;

  v_status := public.sales_lead_mark_emailed(v_delivery.lead_id, v_delivery.performed_by);
  IF coalesce((v_status->>'success')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'sales_lead_initial_email_commit_failed:%', coalesce(v_status->>'error','status_sync_failed');
  END IF;
  UPDATE public.sales_lead_email_deliveries SET status='committed', committed_at=coalesce(committed_at,now()),
    updated_at=now() WHERE id=v_delivery.id;

  IF v_delivery.mode = 'batch_initial' THEN
    UPDATE public.sales_lead_email_batch_items
    SET status = 'sent', error_code = NULL, updated_at = now()
    WHERE id = v_item.id AND status = 'processing';
    v_batch_status := public.sales_lead_email_batch_recalculate_status(v_item.batch_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'already_committed', false, 'delivery_id', v_delivery.id,
    'status_result', v_status, 'batch_status', v_batch_status);
END;
$$;

COMMENT ON FUNCTION public.sales_lead_email_batch_claim_next() IS
  'Service-role only. Locks the kill switch, refuses everything unless automation is enabled, and hands out at most one due item of one scheduled batch. Never calls a provider or an Edge Function.';
COMMENT ON FUNCTION public.sales_lead_email_batch_activate(uuid) IS
  'Service-role only. Moves exactly one paused batch to scheduled while automation is enabled. Never rewrites frozen snapshots and never sends anything.';

-- Fail closed. Enabling automation stays a separate, explicitly approved step.
UPDATE public.sales_lead_email_automation_settings
SET enabled = false,
    updated_at = clock_timestamp(),
    updated_by = NULL
WHERE singleton;

COMMIT;
