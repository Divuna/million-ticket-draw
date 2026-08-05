BEGIN;

CREATE TABLE public.sales_lead_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_key text NOT NULL UNIQUE CHECK (delivery_key ~ '^[0-9a-f]{64}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  batch_item_id uuid REFERENCES public.sales_lead_email_batch_items(id) ON DELETE SET NULL,
  mode text NOT NULL CHECK (mode IN ('manual_initial', 'batch_initial')),
  status text NOT NULL CHECK (status IN (
    'prepared', 'sending', 'provider_accepted', 'committed',
    'provider_rejected', 'uncertain'
  )),
  recipient_snapshot text NOT NULL,
  subject_snapshot text NOT NULL,
  body_source_snapshot text NOT NULL,
  body_text_snapshot text NOT NULL,
  body_html_snapshot text NOT NULL,
  attachment_metadata jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(attachment_metadata) = 'array'),
  performed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  outbound_capture_id uuid NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  provider_accepted_at timestamptz,
  committed_at timestamptz,
  CONSTRAINT sales_lead_email_deliveries_mode_batch_check CHECK (
    (mode = 'manual_initial' AND batch_item_id IS NULL)
    OR (mode = 'batch_initial' AND batch_item_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_sales_lead_email_deliveries_provider_message
  ON public.sales_lead_email_deliveries(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX idx_sales_lead_email_deliveries_lead
  ON public.sales_lead_email_deliveries(lead_id, created_at DESC);
CREATE UNIQUE INDEX uq_sales_lead_email_deliveries_blocking_lead
  ON public.sales_lead_email_deliveries(lead_id)
  WHERE status IN ('prepared', 'sending', 'provider_accepted', 'committed', 'uncertain');

ALTER TABLE public.sales_lead_email_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_lead_email_deliveries_manager_select
  ON public.sales_lead_email_deliveries FOR SELECT TO authenticated
  USING (public.has_admin_permission('sales_leads.manage', (SELECT auth.uid())));
REVOKE ALL ON TABLE public.sales_lead_email_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sales_lead_email_deliveries TO authenticated;
GRANT ALL ON TABLE public.sales_lead_email_deliveries TO service_role;

ALTER TABLE public.sales_lead_activities
  ADD COLUMN email_delivery_id uuid
    REFERENCES public.sales_lead_email_deliveries(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX uq_sales_lead_activities_email_delivery
  ON public.sales_lead_activities(email_delivery_id)
  WHERE activity_type = 'email_sent' AND email_delivery_id IS NOT NULL;

CREATE FUNCTION public.sales_lead_initial_email_claim(
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
  v_guard jsonb;
  v_recipient text := lower(btrim(p_recipient));
  v_domain text;
BEGIN
  IF p_mode <> 'manual_initial' OR p_batch_item_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_delivery_not_enabled');
  END IF;
  IF p_delivery_key !~ '^[0-9a-f]{64}$' OR p_request_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_delivery_identity');
  END IF;
  IF btrim(p_subject) = '' THEN RETURN jsonb_build_object('success', false, 'error', 'email_subject_required'); END IF;
  IF btrim(p_body_source) = '' THEN RETURN jsonb_build_object('success', false, 'error', 'email_body_required'); END IF;
  IF length(btrim(p_subject)) > 300 THEN RETURN jsonb_build_object('success', false, 'error', 'email_subject_too_long'); END IF;
  IF length(btrim(p_body_source)) > 20000 THEN RETURN jsonb_build_object('success', false, 'error', 'email_body_too_long'); END IF;
  IF (p_subject || E'\n' || p_body_source) ~ '\{\{[^{}]+\}\}' THEN
    RETURN jsonb_build_object('success', false, 'error', 'unresolved_template_variables');
  END IF;

  SELECT * INTO v_lead FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'lead_not_found'); END IF;

  SELECT * INTO v_delivery FROM public.sales_lead_email_deliveries
  WHERE delivery_key = p_delivery_key;
  IF FOUND THEN
    IF v_delivery.request_fingerprint <> p_request_fingerprint OR v_delivery.lead_id <> p_lead_id THEN
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
      UPDATE public.sales_lead_email_deliveries SET status = 'sending', attempt_count = attempt_count + 1,
        last_error_code = NULL, updated_at = now() WHERE id = v_delivery.id;
      RETURN jsonb_build_object('success', true, 'action', 'call_provider', 'delivery_id', v_delivery.id,
        'outbound_capture_id', v_delivery.outbound_capture_id);
    END IF;
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
  IF EXISTS (SELECT 1 FROM public.sales_lead_activities
    WHERE lead_id = p_lead_id AND activity_type = 'email_sent' AND direction = 'outbound'
      AND metadata @> '{"sent_by":"human"}'::jsonb) THEN
    RETURN jsonb_build_object('success', false, 'error', 'initial_email_already_sent');
  END IF;
  IF EXISTS (SELECT 1 FROM public.sales_lead_email_deliveries
    WHERE lead_id = p_lead_id AND status IN ('prepared','sending','provider_accepted','committed','uncertain')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'initial_email_already_claimed');
  END IF;
  v_guard := public.sales_lead_email_send_guard(p_lead_id);
  IF coalesce((v_guard->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', coalesce(v_guard->>'error', 'duplicate_override_required'));
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

CREATE FUNCTION public.sales_lead_initial_email_record_provider_result(
  p_delivery_id uuid,
  p_result text,
  p_provider_message_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_delivery public.sales_lead_email_deliveries%ROWTYPE;
BEGIN
  SELECT * INTO v_delivery FROM public.sales_lead_email_deliveries WHERE id = p_delivery_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'delivery_not_found'); END IF;
  IF v_delivery.status = 'committed' THEN RETURN jsonb_build_object('success', true, 'status', 'committed'); END IF;
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

CREATE FUNCTION public.sales_lead_initial_email_commit(p_delivery_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delivery public.sales_lead_email_deliveries%ROWTYPE;
  v_status jsonb;
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

  INSERT INTO public.sales_lead_activities(
    lead_id, activity_type, direction, subject, body_snapshot, email_message_id,
    performed_by, metadata, email_delivery_id
  ) VALUES (
    v_delivery.lead_id, 'email_sent', 'outbound', v_delivery.subject_snapshot,
    v_delivery.body_source_snapshot, v_delivery.provider_message_id, v_delivery.performed_by,
    jsonb_build_object('sent_by','human','from','b2b@onemil.cz','reply_to','b2b@onemil.cz',
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
  RETURN jsonb_build_object('success', true, 'already_committed', false, 'delivery_id', v_delivery.id,
    'status_result', v_status);
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_initial_email_claim(text,text,uuid,text,uuid,text,text,text,text,text,jsonb,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_initial_email_record_provider_result(uuid,text,text,text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_initial_email_commit(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_initial_email_claim(text,text,uuid,text,uuid,text,text,text,text,text,jsonb,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_initial_email_record_provider_result(uuid,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_initial_email_commit(uuid) TO service_role;

COMMIT;
