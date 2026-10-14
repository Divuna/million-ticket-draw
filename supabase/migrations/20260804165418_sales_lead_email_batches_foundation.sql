-- PR 1: passive database foundation for manually planned first-sales-email batches.
-- This migration deliberately contains no worker, cron, HTTP call, Resend call,
-- generic email_queue write, backfill, or automatic batch creation.

BEGIN;

CREATE TABLE public.sales_lead_email_automation_settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Europe/Prague'
    CHECK (timezone = 'Europe/Prague'),
  window_start time NOT NULL DEFAULT time '08:30',
  window_end time NOT NULL DEFAULT time '16:30',
  daily_limit smallint NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 20),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT sales_lead_email_automation_window_check CHECK (window_start < window_end)
);

INSERT INTO public.sales_lead_email_automation_settings (singleton, enabled)
VALUES (true, false);

CREATE TABLE public.sales_lead_email_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'paused', 'cancelled', 'completed', 'failed')),
  template_id uuid REFERENCES public.sales_lead_email_templates(id) ON DELETE SET NULL,
  template_name_snapshot text NOT NULL CHECK (length(btrim(template_name_snapshot)) BETWEEN 1 AND 120),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  scheduled_date date NOT NULL,
  timezone text NOT NULL DEFAULT 'Europe/Prague' CHECK (timezone = 'Europe/Prague'),
  window_start time NOT NULL DEFAULT time '08:30',
  window_end time NOT NULL DEFAULT time '16:30',
  daily_limit smallint NOT NULL DEFAULT 20 CHECK (daily_limit BETWEEN 1 AND 20),
  idempotency_key text NOT NULL CHECK (length(btrim(idempotency_key)) BETWEEN 8 AND 200),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  scheduled_count smallint NOT NULL DEFAULT 0 CHECK (scheduled_count BETWEEN 0 AND 20),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason text,
  CONSTRAINT sales_lead_email_batches_window_check CHECK (window_start < window_end),
  CONSTRAINT sales_lead_email_batches_cancel_check CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL
      AND length(btrim(cancel_reason)) BETWEEN 3 AND 1000)
    OR
    (status <> 'cancelled' AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)
  ),
  CONSTRAINT sales_lead_email_batches_idempotency_unique UNIQUE (idempotency_key)
);

CREATE TABLE public.sales_lead_email_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.sales_lead_email_batches(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled')),
  scheduled_for timestamptz NOT NULL,
  recipient_snapshot text NOT NULL CHECK (length(recipient_snapshot) BETWEEN 3 AND 320),
  email_source_snapshot text NOT NULL CHECK (length(btrim(email_source_snapshot)) BETWEEN 1 AND 2048),
  email_verification_method_snapshot text NOT NULL
    CHECK (email_verification_method_snapshot IN ('admin_manual', 'backend_verified_official_website')),
  email_verified_at_snapshot timestamptz NOT NULL,
  subject_snapshot text NOT NULL CHECK (length(btrim(subject_snapshot)) BETWEEN 1 AND 300),
  body_source_snapshot text NOT NULL CHECK (length(btrim(body_source_snapshot)) BETWEEN 1 AND 20000),
  body_text_snapshot text NOT NULL CHECK (length(btrim(body_text_snapshot)) BETWEEN 1 AND 20000),
  body_html_snapshot text NOT NULL CHECK (length(btrim(body_html_snapshot)) BETWEEN 1 AND 100000),
  template_id_snapshot uuid NOT NULL,
  template_updated_at_snapshot timestamptz NOT NULL,
  company_name_snapshot text NOT NULL CHECK (length(btrim(company_name_snapshot)) BETWEEN 1 AND 300),
  skip_reason text,
  error_code text,
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_lead_email_batch_items_batch_lead_unique UNIQUE (batch_id, lead_id),
  CONSTRAINT sales_lead_email_batch_items_terminal_detail_check CHECK (
    (status = 'skipped' AND length(btrim(skip_reason)) >= 1)
    OR (status = 'failed' AND length(btrim(error_code)) >= 1)
    OR status IN ('pending', 'processing', 'sent', 'cancelled')
  )
);

CREATE TABLE public.sales_lead_email_batch_skips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.sales_lead_email_batches(id) ON DELETE RESTRICT,
  requested_lead_id uuid NOT NULL,
  company_name_snapshot text,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- These partial unique indexes are the final, race-safe enrollment barrier.
-- An advisory lock in the creation RPC makes the expected failure deterministic;
-- the indexes still protect correctness if a future caller omits that lock.
CREATE UNIQUE INDEX sales_lead_email_batch_items_active_lead_unique
  ON public.sales_lead_email_batch_items (lead_id)
  WHERE status IN ('pending', 'processing', 'sent', 'failed');

CREATE UNIQUE INDEX sales_lead_email_batch_items_active_recipient_unique
  ON public.sales_lead_email_batch_items (lower(btrim(recipient_snapshot)))
  WHERE status IN ('pending', 'processing', 'sent', 'failed');

CREATE INDEX sales_lead_email_batches_status_date_idx
  ON public.sales_lead_email_batches (status, scheduled_date, created_at);
CREATE INDEX sales_lead_email_batches_created_by_idx
  ON public.sales_lead_email_batches (created_by, created_at DESC);
CREATE INDEX sales_lead_email_batch_items_batch_status_schedule_idx
  ON public.sales_lead_email_batch_items (batch_id, status, scheduled_for);
CREATE INDEX sales_lead_email_batch_items_lead_idx
  ON public.sales_lead_email_batch_items (lead_id, created_at DESC);
CREATE INDEX sales_lead_email_batch_skips_batch_idx
  ON public.sales_lead_email_batch_skips (batch_id, created_at);

ALTER TABLE public.sales_lead_email_automation_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_lead_email_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_lead_email_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_lead_email_batch_skips ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION public.sales_lead_email_batch_item_preserve_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.batch_id IS DISTINCT FROM OLD.batch_id
     OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.scheduled_for IS DISTINCT FROM OLD.scheduled_for
     OR NEW.recipient_snapshot IS DISTINCT FROM OLD.recipient_snapshot
     OR NEW.email_source_snapshot IS DISTINCT FROM OLD.email_source_snapshot
     OR NEW.email_verification_method_snapshot IS DISTINCT FROM OLD.email_verification_method_snapshot
     OR NEW.email_verified_at_snapshot IS DISTINCT FROM OLD.email_verified_at_snapshot
     OR NEW.subject_snapshot IS DISTINCT FROM OLD.subject_snapshot
     OR NEW.body_source_snapshot IS DISTINCT FROM OLD.body_source_snapshot
     OR NEW.body_text_snapshot IS DISTINCT FROM OLD.body_text_snapshot
     OR NEW.body_html_snapshot IS DISTINCT FROM OLD.body_html_snapshot
     OR NEW.template_id_snapshot IS DISTINCT FROM OLD.template_id_snapshot
     OR NEW.template_updated_at_snapshot IS DISTINCT FROM OLD.template_updated_at_snapshot
     OR NEW.company_name_snapshot IS DISTINCT FROM OLD.company_name_snapshot THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'sales_lead_email_batch_snapshot_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_lead_email_batch_item_preserve_snapshot
BEFORE UPDATE ON public.sales_lead_email_batch_items
FOR EACH ROW EXECUTE FUNCTION public.sales_lead_email_batch_item_preserve_snapshot();

CREATE POLICY sales_lead_email_automation_settings_select
  ON public.sales_lead_email_automation_settings FOR SELECT TO authenticated
  USING ((SELECT public.has_admin_permission('sales_leads.manage', auth.uid())));
CREATE POLICY sales_lead_email_batches_select
  ON public.sales_lead_email_batches FOR SELECT TO authenticated
  USING ((SELECT public.has_admin_permission('sales_leads.manage', auth.uid())));
CREATE POLICY sales_lead_email_batch_items_select
  ON public.sales_lead_email_batch_items FOR SELECT TO authenticated
  USING ((SELECT public.has_admin_permission('sales_leads.manage', auth.uid())));
CREATE POLICY sales_lead_email_batch_skips_select
  ON public.sales_lead_email_batch_skips FOR SELECT TO authenticated
  USING ((SELECT public.has_admin_permission('sales_leads.manage', auth.uid())));

REVOKE ALL ON TABLE public.sales_lead_email_automation_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales_lead_email_batches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales_lead_email_batch_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sales_lead_email_batch_skips FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sales_lead_email_automation_settings TO authenticated;
GRANT SELECT ON TABLE public.sales_lead_email_batches TO authenticated;
GRANT SELECT ON TABLE public.sales_lead_email_batch_items TO authenticated;
GRANT SELECT ON TABLE public.sales_lead_email_batch_skips TO authenticated;

-- Helpers below are deliberately not executable by API roles. They run only as
-- implementation details of the guarded public RPCs.
CREATE FUNCTION public.sales_lead_email_batch_render_source(
  p_value text,
  p_company_name text,
  p_contact_person text,
  p_contact_role text,
  p_city text,
  p_website text
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT replace(replace(replace(replace(replace(
    coalesce(p_value, ''),
    '{{company_name}}', coalesce(nullif(btrim(p_company_name), ''), '{{company_name}}')),
    '{{contact_person}}', coalesce(nullif(btrim(p_contact_person), ''), '{{contact_person}}')),
    '{{contact_role}}', coalesce(nullif(btrim(p_contact_role), ''), '{{contact_role}}')),
    '{{city}}', coalesce(nullif(btrim(p_city), ''), '{{city}}')),
    '{{website}}', coalesce(nullif(btrim(p_website), ''), '{{website}}'));
$$;

CREATE FUNCTION public.sales_lead_email_batch_render_text(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p_value, ''), '\[([^]\r\n]+)\]\(([^)\r\n]+)\)', '\1', 'g'),
        '\*\*([^*\r\n]+)\*\*', '\1', 'g'),
      '(^|[^*])\*([^*\r\n]+)\*(?!\*)', '\1\2', 'g'),
    '^\s*[-•]\s+', '• ', 'gm');
$$;

CREATE FUNCTION public.sales_lead_email_batch_render_emphasis_html(p_value text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
  SELECT regexp_replace(
    regexp_replace(
      replace(replace(replace(replace(replace(coalesce(p_value, ''),
        '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;'),
      '\*\*([^*\r\n]+)\*\*', '<strong>\1</strong>', 'g'),
    '(^|[^*])\*([^*\r\n]+)\*(?!\*)', '\1<em>\2</em>', 'g');
$$;

CREATE FUNCTION public.sales_lead_email_batch_render_inline_html(p_value text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_remaining text := coalesce(p_value, '');
  v_output text := '';
  v_match text[];
  v_full_match text;
  v_position integer;
  v_href text;
  v_external_attributes text;
BEGIN
  LOOP
    v_match := regexp_match(
      v_remaining,
      '\[([^]\r\n]+)\]\(((https?://|mailto:)[^)[:space:]]+)\)',
      'i'
    );
    EXIT WHEN v_match IS NULL;
    v_href := v_match[2];
    v_full_match := '[' || v_match[1] || '](' || v_href || ')';
    v_position := strpos(v_remaining, v_full_match);
    v_external_attributes := CASE WHEN v_href ~* '^https?://'
      THEN ' target="_blank" rel="noopener noreferrer nofollow"'
      ELSE ''
    END;
    v_output := v_output
      || public.sales_lead_email_batch_render_emphasis_html(left(v_remaining, v_position - 1))
      || '<a href="'
      || replace(replace(replace(replace(replace(v_href,
           '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')
      || '"' || v_external_attributes
      || ' style="color:#d97706;text-decoration:underline">'
      || public.sales_lead_email_batch_render_emphasis_html(v_match[1])
      || '</a>';
    v_remaining := substring(v_remaining FROM v_position + length(v_full_match));
  END LOOP;
  RETURN v_output || public.sales_lead_email_batch_render_emphasis_html(v_remaining);
END;
$$;

CREATE FUNCTION public.sales_lead_email_batch_render_html(p_value text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_line text;
  v_html text := '';
  v_list_type text := NULL;
  v_item text;
BEGIN
  FOR v_line IN
    SELECT regexp_split_to_table(regexp_replace(coalesce(p_value, ''), E'\r\n?', E'\n', 'g'), E'\n')
  LOOP
    IF v_line ~ '^\s*[-•]\s+(.+)$' THEN
      IF v_list_type IS DISTINCT FROM 'ul' THEN
        IF v_list_type IS NOT NULL THEN v_html := v_html || '</' || v_list_type || '>'; END IF;
        v_html := v_html || '<ul style="margin:0 0 12px 22px;padding:0">';
        v_list_type := 'ul';
      END IF;
      v_item := regexp_replace(v_line, '^\s*[-•]\s+', '');
      v_html := v_html || '<li style="margin:0 0 5px 0">' || public.sales_lead_email_batch_render_inline_html(v_item) || '</li>';
    ELSIF v_line ~ '^\s*[0-9]+[.)]\s+(.+)$' THEN
      IF v_list_type IS DISTINCT FROM 'ol' THEN
        IF v_list_type IS NOT NULL THEN v_html := v_html || '</' || v_list_type || '>'; END IF;
        v_html := v_html || '<ol style="margin:0 0 12px 22px;padding:0">';
        v_list_type := 'ol';
      END IF;
      v_item := regexp_replace(v_line, '^\s*[0-9]+[.)]\s+', '');
      v_html := v_html || '<li style="margin:0 0 5px 0">' || public.sales_lead_email_batch_render_inline_html(v_item) || '</li>';
    ELSE
      IF v_list_type IS NOT NULL THEN
        v_html := v_html || '</' || v_list_type || '>';
        v_list_type := NULL;
      END IF;
      IF btrim(v_line) = '' THEN
        v_html := v_html || '<div style="height:10px;line-height:10px">&nbsp;</div>';
      ELSE
        v_html := v_html || '<div style="margin:0 0 7px 0">' || public.sales_lead_email_batch_render_inline_html(v_line) || '</div>';
      END IF;
    END IF;
  END LOOP;
  IF v_list_type IS NOT NULL THEN v_html := v_html || '</' || v_list_type || '>'; END IF;
  RETURN '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#202124">' || v_html || '</div>';
END;
$$;

CREATE FUNCTION public.sales_lead_email_batch_check_one(
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

  IF EXISTS (
    SELECT 1
    FROM public.sales_lead_activities a
    LEFT JOIN public.sales_leads activity_lead ON activity_lead.id = a.lead_id
    WHERE a.activity_type = 'email_sent'
      AND a.direction = 'outbound'
      AND a.metadata->>'sent_by' = 'human'
      AND (
        a.lead_id = p_lead_id
        OR lower(btrim(coalesce(a.metadata->>'to', activity_lead.contact_email, ''))) = v_recipient
      )
  ) THEN
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

CREATE FUNCTION public.sales_lead_email_batch_schedule_window(
  p_scheduled_date date,
  p_timezone text,
  p_window_start time,
  p_window_end time,
  p_item_count integer,
  p_now timestamptz DEFAULT clock_timestamp()
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_local_now timestamp;
  v_local_start timestamp;
  v_local_end timestamp;
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_scheduled_date IS NULL OR p_timezone IS DISTINCT FROM 'Europe/Prague'
     OR p_window_start IS NULL OR p_window_end IS NULL OR p_window_start >= p_window_end
     OR p_item_count IS NULL OR p_item_count < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_scheduling_window');
  END IF;
  v_local_now := p_now AT TIME ZONE p_timezone;
  IF p_scheduled_date < v_local_now::date THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_scheduled_date');
  END IF;
  v_local_end := p_scheduled_date + p_window_end;
  v_local_start := p_scheduled_date + p_window_start;
  IF p_scheduled_date = v_local_now::date THEN
    v_local_start := greatest(v_local_start, v_local_now + interval '5 minutes');
  END IF;
  -- Five minutes per item is the minimum safe remaining distribution window.
  IF v_local_start >= v_local_end
     OR v_local_end - v_local_start < p_item_count * interval '5 minutes' THEN
    RETURN jsonb_build_object('success', false, 'error', 'scheduling_window_closed');
  END IF;
  v_start := v_local_start AT TIME ZONE p_timezone;
  v_end := v_local_end AT TIME ZONE p_timezone;
  RETURN jsonb_build_object(
    'success', true,
    'window_start', v_start,
    'window_end', v_end,
    'window_start_local', v_local_start,
    'window_end_local', v_local_end
  );
END;
$$;

CREATE FUNCTION public.sales_lead_email_batch_preview(
  p_lead_ids uuid[],
  p_template_id uuid,
  p_scheduled_date date
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_result jsonb;
  v_lead_id uuid;
  v_eligible jsonb := '[]'::jsonb;
  v_ineligible jsonb := '[]'::jsonb;
  v_seen_recipients text[] := ARRAY[]::text[];
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_active_today integer;
  v_available integer;
  v_window jsonb;
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
  IF p_scheduled_date IS NULL OR p_scheduled_date < (now() AT TIME ZONE 'Europe/Prague')::date THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_scheduled_date');
  END IF;
  SELECT * INTO v_settings FROM public.sales_lead_email_automation_settings WHERE singleton;
  SELECT count(*) INTO v_active_today
  FROM public.sales_lead_email_batch_items i
  JOIN public.sales_lead_email_batches b ON b.id = i.batch_id
  WHERE b.scheduled_date = p_scheduled_date AND i.status IN ('pending', 'processing', 'sent', 'failed');
  v_available := greatest(v_settings.daily_limit - v_active_today, 0);

  FOR v_lead_id IN SELECT DISTINCT x FROM unnest(p_lead_ids) AS selected(x) WHERE x IS NOT NULL ORDER BY x LOOP
    v_result := public.sales_lead_email_batch_check_one(v_lead_id, p_template_id);
    IF (v_result->>'eligible')::boolean AND (v_result->>'recipient') = ANY(v_seen_recipients) THEN
      v_result := v_result || jsonb_build_object('eligible', false, 'reason', 'duplicate_recipient_in_selection');
    ELSIF (v_result->>'eligible')::boolean AND jsonb_array_length(v_eligible) >= v_available THEN
      v_result := v_result || jsonb_build_object('eligible', false, 'reason', 'daily_limit_exceeded');
    END IF;
    IF coalesce((v_result->>'eligible')::boolean, false) THEN
      v_seen_recipients := array_append(v_seen_recipients, v_result->>'recipient');
      v_eligible := v_eligible || jsonb_build_array(v_result);
    ELSE
      v_ineligible := v_ineligible || jsonb_build_array(v_result);
    END IF;
  END LOOP;

  v_window := public.sales_lead_email_batch_schedule_window(
    p_scheduled_date, v_settings.timezone, v_settings.window_start, v_settings.window_end,
    greatest(jsonb_array_length(v_eligible), 1)
  );
  IF coalesce((v_window->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_window->>'error');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'automation_enabled', v_settings.enabled,
    'daily_limit', v_settings.daily_limit,
    'daily_remaining', v_available,
    'window_start', v_window->'window_start',
    'window_end', v_window->'window_end',
    'eligible_count', jsonb_array_length(v_eligible),
    'ineligible_count', jsonb_array_length(v_ineligible),
    'eligible', v_eligible,
    'ineligible', v_ineligible
  );
END;
$$;

CREATE FUNCTION public.sales_lead_email_batch_create(
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

  SELECT * INTO v_existing FROM public.sales_lead_email_batches WHERE idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_existing.created_by IS DISTINCT FROM v_caller
       OR v_existing.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
      RETURN jsonb_build_object('success', false, 'error', 'idempotency_key_conflict');
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'idempotent_replay', true, 'batch_id', v_existing.id,
      'scheduled_count', v_existing.scheduled_count, 'skipped_count', v_existing.skipped_count
    );
  END IF;

  -- The singleton row serializes daily-capacity decisions and is the kill switch.
  SELECT * INTO v_settings FROM public.sales_lead_email_automation_settings WHERE singleton FOR UPDATE;
  IF NOT v_settings.enabled THEN
    RETURN jsonb_build_object('success', false, 'error', 'automation_disabled');
  END IF;
  SELECT * INTO v_template FROM public.sales_lead_email_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'template_not_found'); END IF;

  -- Lock selected leads in a consistent order, then take deterministic advisory
  -- locks for both lead IDs and normalized recipients.
  PERFORM 1 FROM public.sales_leads l
  WHERE l.id IN (SELECT DISTINCT x FROM unnest(p_lead_ids) AS selected(x) WHERE x IS NOT NULL)
  ORDER BY l.id FOR UPDATE;
  FOR v_lead_id IN SELECT DISTINCT x FROM unnest(p_lead_ids) AS selected(x) WHERE x IS NOT NULL ORDER BY x LOOP
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
  WHERE b.scheduled_date = p_scheduled_date AND i.status IN ('pending', 'processing', 'sent', 'failed');
  v_available := greatest(v_settings.daily_limit - v_active_today, 0);

  FOR v_lead_id IN SELECT DISTINCT x FROM unnest(p_lead_ids) AS selected(x) WHERE x IS NOT NULL ORDER BY x LOOP
    v_result := public.sales_lead_email_batch_check_one(v_lead_id, p_template_id);
    IF coalesce((v_result->>'eligible')::boolean, false) AND (v_result->>'recipient') = ANY(v_seen_recipients) THEN
      v_result := v_result || jsonb_build_object('eligible', false, 'reason', 'duplicate_recipient_in_selection');
    ELSIF coalesce((v_result->>'eligible')::boolean, false) AND jsonb_array_length(v_eligible) >= v_available THEN
      v_result := v_result || jsonb_build_object('eligible', false, 'reason', 'daily_limit_exceeded');
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
    RETURN jsonb_build_object('success', false, 'error', 'no_eligible_leads', 'ineligible', v_ineligible);
  END IF;
  IF v_count > 20 THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_limit_exceeded');
  END IF;

  v_window := public.sales_lead_email_batch_schedule_window(
    p_scheduled_date, v_settings.timezone, v_settings.window_start, v_settings.window_end, v_count
  );
  IF coalesce((v_window->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', v_window->>'error');
  END IF;
  v_actual_window_start := (v_window->>'window_start')::timestamptz;
  v_actual_window_end := (v_window->>'window_end')::timestamptz;

  INSERT INTO public.sales_lead_email_batches (
    status, template_id, template_name_snapshot, created_by, scheduled_date,
    timezone, window_start, window_end, daily_limit, idempotency_key, request_fingerprint,
    scheduled_count, skipped_count
  ) VALUES (
    'scheduled', v_template.id, v_template.name, v_caller, p_scheduled_date,
    v_settings.timezone, (v_actual_window_start AT TIME ZONE v_settings.timezone)::time,
    (v_actual_window_end AT TIME ZONE v_settings.timezone)::time,
    v_settings.daily_limit, btrim(p_idempotency_key), v_request_fingerprint,
    v_count, jsonb_array_length(v_ineligible)
  ) RETURNING id INTO v_batch_id;

  INSERT INTO public.sales_lead_email_batch_skips (
    batch_id, requested_lead_id, company_name_snapshot, reason
  )
  SELECT
    v_batch_id,
    (skipped.value->>'lead_id')::uuid,
    nullif(skipped.value->>'company_name', ''),
    skipped.value->>'reason'
  FROM jsonb_array_elements(v_ineligible) AS skipped(value);
  GET DIAGNOSTICS v_inserted_skips = ROW_COUNT;
  IF v_inserted_skips IS DISTINCT FROM jsonb_array_length(v_ineligible) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'sales_lead_email_batch_skip_audit_mismatch';
  END IF;

  v_window_seconds := extract(epoch FROM (v_actual_window_end - v_actual_window_start));
  FOR v_result IN SELECT value FROM jsonb_array_elements(v_eligible) LOOP
    v_scheduled_for := v_actual_window_start
      + make_interval(secs => (v_index * v_window_seconds / v_count)::double precision);
    INSERT INTO public.sales_lead_email_batch_items (
      batch_id, lead_id, status, scheduled_for, recipient_snapshot,
      email_source_snapshot, email_verification_method_snapshot, email_verified_at_snapshot,
      subject_snapshot, body_source_snapshot, body_text_snapshot, body_html_snapshot,
      template_id_snapshot, template_updated_at_snapshot, company_name_snapshot
    ) VALUES (
      v_batch_id, (v_result->>'lead_id')::uuid, 'pending', v_scheduled_for,
      v_result->>'recipient', v_result->>'email_source', v_result->>'email_verification_method',
      (v_result->>'email_verified_at')::timestamptz, v_result->>'subject',
      v_result->>'body_source', v_result->>'body_text', v_result->>'body_html',
      (v_result->>'template_id')::uuid, (v_result->>'template_updated_at')::timestamptz,
      v_result->>'company_name'
    );
    v_index := v_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true, 'idempotent_replay', false, 'batch_id', v_batch_id,
    'scheduled_count', v_count, 'skipped_count', jsonb_array_length(v_ineligible),
    'ineligible', v_ineligible
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM public.sales_lead_email_batches WHERE idempotency_key = btrim(p_idempotency_key);
    IF FOUND AND v_existing.created_by = v_caller
       AND v_existing.request_fingerprint = v_request_fingerprint THEN
      RETURN jsonb_build_object(
        'success', true, 'idempotent_replay', true, 'batch_id', v_existing.id,
        'scheduled_count', v_existing.scheduled_count, 'skipped_count', v_existing.skipped_count
      );
    END IF;
    IF FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'idempotency_key_conflict');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'concurrent_enrollment_conflict');
END;
$$;

CREATE FUNCTION public.sales_lead_email_batch_cancel(
  p_batch_id uuid,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_batch public.sales_lead_email_batches%ROWTYPE;
  v_cancelled_count integer;
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage', v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;
  IF length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 3 AND 1000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'cancel_reason_required');
  END IF;
  SELECT * INTO v_batch FROM public.sales_lead_email_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'batch_not_found'); END IF;
  IF v_batch.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true, 'batch_id', p_batch_id, 'cancelled_count', 0);
  END IF;
  IF v_batch.status NOT IN ('scheduled', 'paused') THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_not_cancellable');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.sales_lead_email_batch_items
    WHERE batch_id = p_batch_id AND status = 'processing'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_processing');
  END IF;

  UPDATE public.sales_lead_email_batch_items
  SET status = 'cancelled', updated_at = clock_timestamp()
  WHERE batch_id = p_batch_id AND status = 'pending';
  GET DIAGNOSTICS v_cancelled_count = ROW_COUNT;

  UPDATE public.sales_lead_email_batches
  SET status = 'cancelled', cancelled_at = clock_timestamp(), cancelled_by = v_caller,
      cancel_reason = btrim(p_reason), updated_at = clock_timestamp()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true, 'already_cancelled', false, 'batch_id', p_batch_id,
    'cancelled_count', v_cancelled_count
  );
END;
$$;

CREATE FUNCTION public.sales_lead_email_automation_set_enabled(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.is_superadmin(v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied_superadmin_only');
  END IF;
  IF p_enabled IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'enabled_required'); END IF;
  UPDATE public.sales_lead_email_automation_settings
  SET enabled = p_enabled, updated_at = clock_timestamp(), updated_by = v_caller
  WHERE singleton;
  RETURN jsonb_build_object('success', true, 'enabled', p_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_render_source(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_email_batch_render_text(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_email_batch_render_emphasis_html(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_email_batch_render_inline_html(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_email_batch_render_html(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_email_batch_schedule_window(date,text,time,time,integer,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_email_batch_check_one(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_email_batch_item_preserve_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_render_source(text,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_render_text(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_render_emphasis_html(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_render_inline_html(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_render_html(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_schedule_window(date,text,time,time,integer,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_check_one(uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_preview(uuid[],uuid,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sales_lead_email_batch_cancel(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sales_lead_email_automation_set_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_preview(uuid[],uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_cancel(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_automation_set_enabled(boolean) TO authenticated;

COMMENT ON TABLE public.sales_lead_email_automation_settings IS
  'Global kill switch and scheduling defaults for manually planned first-sales-email batches. Defaults disabled.';
COMMENT ON TABLE public.sales_lead_email_batches IS
  'Audit header for manually created first-sales-email batches. Rows never send email by themselves.';
COMMENT ON TABLE public.sales_lead_email_batch_items IS
  'Frozen recipient/template/render snapshots for future dispatch. PR 1 creates pending or cancelled items only.';
COMMENT ON TABLE public.sales_lead_email_batch_skips IS
  'Narrow immutable audit of selected leads rejected while a batch was created; contains no message content.';
COMMENT ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text) IS
  'Atomically rechecks eligibility and stores a passive batch of at most 20 frozen first-email items. Performs no network or send operation.';

COMMIT;
