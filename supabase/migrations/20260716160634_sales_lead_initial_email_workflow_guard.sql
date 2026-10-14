-- Initial lead e-mail workflow guard.
--
-- Invariants:
--   navrzeny -> novy only through the existing human approval transition;
--   first e-mail is allowed only from novy/priprava/schvaleni_ceka;
--   a successful first e-mail moves an early lead to osloveno;
--   downstream states are never moved backwards.
--
-- The final DO block is a narrowly guarded, idempotent remediation for the
-- confirmed Cyklomania.cz incident. It is intentionally part of the migration
-- but must not be applied to production without explicit approval.

BEGIN;

CREATE OR REPLACE FUNCTION public.sales_lead_mark_emailed(
  p_lead_id uuid,
  p_performed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.sales_leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead
  FROM public.sales_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  IF v_lead.status = 'navrzeny' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'proposal_not_approved',
      'status_changed', false,
      'current_status', v_lead.status
    );
  END IF;

  IF v_lead.status IN ('osloveno', 'follow_up', 'odpovedel', 'jednani', 'konvertovan') THEN
    RETURN jsonb_build_object(
      'success', true,
      'status_changed', false,
      'current_status', v_lead.status
    );
  END IF;

  IF v_lead.status NOT IN ('novy', 'priprava', 'schvaleni_ceka') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'initial_email_status_not_allowed',
      'status_changed', false,
      'current_status', v_lead.status
    );
  END IF;

  UPDATE public.sales_leads
  SET status = 'osloveno'
  WHERE id = p_lead_id;

  INSERT INTO public.sales_lead_status_history
    (lead_id, old_status, new_status, changed_by, reason)
  VALUES
    (p_lead_id, v_lead.status, 'osloveno', p_performed_by, 'Automaticky po úspěšném odeslání prvního e-mailu');

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (
    p_lead_id,
    'status_changed',
    'internal',
    p_performed_by,
    jsonb_build_object(
      'from', v_lead.status,
      'to', 'osloveno',
      'auto', true,
      'trigger', 'initial_email_sent'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'status_changed', true,
    'old_status', v_lead.status,
    'new_status', 'osloveno'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_mark_emailed(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_mark_emailed(uuid, uuid)
  TO service_role;

DO $$
DECLARE
  v_lead_id CONSTANT uuid := 'd1b4cdff-70a2-4422-8140-fde9b80d0eb8';
  v_performed_by uuid;
BEGIN
  SELECT a.performed_by
  INTO v_performed_by
  FROM public.sales_leads l
  JOIN LATERAL (
    SELECT performed_by
    FROM public.sales_lead_activities
    WHERE lead_id = l.id
      AND activity_type = 'email_sent'
      AND direction = 'outbound'
    ORDER BY created_at DESC
    LIMIT 1
  ) a ON true
  WHERE l.id = v_lead_id
    AND lower(l.company_name) = 'cyklomania.cz'
    AND l.status = 'navrzeny';

  IF FOUND THEN
    UPDATE public.sales_leads
    SET status = 'osloveno'
    WHERE id = v_lead_id
      AND status = 'navrzeny';

    INSERT INTO public.sales_lead_status_history
      (lead_id, old_status, new_status, changed_by, reason)
    VALUES (
      v_lead_id,
      'navrzeny',
      'osloveno',
      v_performed_by,
      'Bezpečná oprava: první e-mail byl prokazatelně odeslán před zavedením workflow guardu'
    );

    INSERT INTO public.sales_lead_activities
      (lead_id, activity_type, direction, performed_by, metadata)
    VALUES (
      v_lead_id,
      'status_changed',
      'internal',
      v_performed_by,
      jsonb_build_object(
        'from', 'navrzeny',
        'to', 'osloveno',
        'auto', true,
        'trigger', 'cyklomania_initial_email_remediation'
      )
    );
  END IF;
END $$;

COMMIT;
