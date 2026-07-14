-- Safe inbound routing for Sales Leads.
-- Public replies go to b2b@onemil.cz; lead association is based only on
-- RFC threading identifiers captured from Resend delivery/receiving events.

ALTER TABLE public.sales_lead_activities
  ADD COLUMN IF NOT EXISTS rfc_message_id text,
  ADD COLUMN IF NOT EXISTS provider_thread_id text;

CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_outbound_rfc_message
  ON public.sales_lead_activities (rfc_message_id)
  WHERE activity_type = 'email_sent' AND rfc_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_outbound_thread
  ON public.sales_lead_activities (provider_thread_id)
  WHERE activity_type = 'email_sent' AND provider_thread_id IS NOT NULL;

-- A provider receive id identifies one inbound message globally, not only
-- within a lead. This is the database-level idempotency backstop.
DROP INDEX IF EXISTS public.uq_sales_lead_activities_inbound_reply;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_lead_activities_inbound_provider_id
  ON public.sales_lead_activities (email_message_id)
  WHERE activity_type = 'reply_received' AND email_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sales_lead_unassigned_emails (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id     text NOT NULL UNIQUE,
  rfc_message_id      text,
  provider_thread_id  text,
  in_reply_to         text,
  references_ids      text[] NOT NULL DEFAULT '{}',
  from_email          text NOT NULL,
  from_name           text,
  to_addresses        text[] NOT NULL DEFAULT '{}',
  subject             text,
  body_snapshot       text,
  received_at         timestamptz NOT NULL DEFAULT now(),
  status              text NOT NULL DEFAULT 'unassigned'
    CHECK (status IN ('unassigned', 'resolved', 'ignored')),
  assigned_lead_id    uuid REFERENCES public.sales_leads(id) ON DELETE SET NULL,
  assigned_activity_id uuid REFERENCES public.sales_lead_activities(id) ON DELETE SET NULL,
  resolved_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at         timestamptz,
  resolution_note     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_lead_unassigned_emails_queue
  ON public.sales_lead_unassigned_emails (status, received_at DESC);

ALTER TABLE public.sales_lead_unassigned_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_lead_unassigned_emails_select
  ON public.sales_lead_unassigned_emails;
CREATE POLICY sales_lead_unassigned_emails_select
  ON public.sales_lead_unassigned_emails
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    public.has_admin_permission('sales_leads.manage', auth.uid())
    OR public.is_superadmin(auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE ON public.sales_lead_unassigned_emails
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sales_lead_unassigned_emails TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_lead_unassigned_email_assign(
  p_email_id uuid,
  p_lead_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_email public.sales_lead_unassigned_emails%ROWTYPE;
  v_activity_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT (
    public.has_admin_permission('sales_leads.manage', v_caller)
    OR public.is_superadmin(v_caller)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sales_leads WHERE id = p_lead_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  SELECT * INTO v_email
  FROM public.sales_lead_unassigned_emails
  WHERE id = p_email_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_not_found');
  END IF;
  IF v_email.status <> 'unassigned' THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_already_resolved');
  END IF;

  BEGIN
    INSERT INTO public.sales_lead_activities (
      lead_id, activity_type, direction, subject, body_snapshot,
      email_message_id, rfc_message_id, provider_thread_id, performed_by, metadata
    ) VALUES (
      p_lead_id, 'reply_received', 'inbound', v_email.subject, v_email.body_snapshot,
      v_email.resend_email_id, v_email.rfc_message_id, v_email.provider_thread_id,
      NULL,
      jsonb_build_object(
        'from', v_email.from_email,
        'to', v_email.to_addresses,
        'email_id', v_email.resend_email_id,
        'message_id', v_email.rfc_message_id,
        'in_reply_to', v_email.in_reply_to,
        'references', v_email.references_ids,
        'assignment_method', 'manual',
        'unassigned_email_id', v_email.id
      )
    ) RETURNING id INTO v_activity_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_already_assigned');
  END;

  UPDATE public.sales_lead_unassigned_emails
  SET status = 'resolved', assigned_lead_id = p_lead_id,
      assigned_activity_id = v_activity_id, resolved_by = v_caller,
      resolved_at = now(), updated_at = now()
  WHERE id = p_email_id;

  -- Preserve the existing lead-status workflow used by automatic inbound replies.
  PERFORM public.sales_lead_mark_replied(p_lead_id, v_caller);

  RETURN jsonb_build_object(
    'success', true, 'lead_id', p_lead_id, 'activity_id', v_activity_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_unassigned_email_assign(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_unassigned_email_assign(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_lead_unassigned_email_set_status(
  p_email_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT (
    public.has_admin_permission('sales_leads.manage', v_caller)
    OR public.is_superadmin(v_caller)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;
  IF p_status NOT IN ('resolved', 'ignored') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_status');
  END IF;

  UPDATE public.sales_lead_unassigned_emails
  SET status = p_status, resolved_by = v_caller, resolved_at = now(),
      resolution_note = NULLIF(btrim(coalesce(p_note, '')), ''), updated_at = now()
  WHERE id = p_email_id AND status = 'unassigned';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'email_not_found_or_resolved');
  END IF;
  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_unassigned_email_set_status(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_unassigned_email_set_status(uuid, text, text)
  TO authenticated;

COMMENT ON TABLE public.sales_lead_unassigned_emails IS
  'Inbound messages without one unambiguous RFC/provider thread match. Never matched by sender, subject, company, or recipient token.';
