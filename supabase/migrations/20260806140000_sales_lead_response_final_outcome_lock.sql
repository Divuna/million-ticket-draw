BEGIN;

-- One response token must have exactly one final outcome: 'interested' or 'declined'.
-- Once an outcome is recorded it can never change, and re-opening the opposite CTA
-- link must not write anything at all.
--
-- Before this migration the opposite-action POST returned
-- { success: false, error: 'response_already_recorded' }, which gave the public page
-- no authoritative state to render. The page therefore fell back to the requested
-- action and showed the plain first-time confirmation ("Děkujeme za projevený zájem")
-- even after the recipient had already declined, and vice versa.
--
-- The submit RPC now always reports the authoritative stored outcome:
--   * pending + action            -> records the outcome once (unchanged behaviour)
--   * final   + same action       -> idempotent replay, no writes
--   * final   + opposite action   -> returns the ORIGINAL outcome, no writes,
--                                    flagged with conflicting_action = true
--
-- No suppression row is removed, no do_not_contact flag is cleared, no stored name or
-- phone is overwritten, and no extra activity is inserted on any replay.
CREATE OR REPLACE FUNCTION public.sales_lead_email_response_submit(
  p_token_hash text,
  p_action text,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_response public.sales_lead_email_response_tokens%ROWTYPE;
  v_lead public.sales_leads%ROWTYPE;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_recipient text;
  v_old_status text;
  v_settled_action text;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF v_action NOT IN ('interest', 'decline') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
  END IF;

  SELECT *
  INTO v_response
  FROM public.sales_lead_email_response_tokens
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_token');
  END IF;
  IF v_response.expires_at <= v_now THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired_token');
  END IF;

  -- Already final. Report the stored outcome and write nothing, whichever CTA
  -- link was opened. An opposite request can never flip a recorded answer.
  IF v_response.status <> 'pending' THEN
    v_settled_action := CASE v_response.status
      WHEN 'interested' THEN 'interest'
      ELSE 'decline'
    END;
    RETURN jsonb_build_object(
      'success', true,
      'action', v_settled_action,
      'status', v_response.status,
      'idempotent_replay', true,
      'conflicting_action', v_settled_action IS DISTINCT FROM v_action
    );
  END IF;

  SELECT *
  INTO v_lead
  FROM public.sales_leads
  WHERE id = v_response.lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  v_recipient := lower(btrim(v_response.recipient_snapshot));
  v_old_status := v_lead.status;

  IF v_action = 'interest' THEN
    IF length(v_name) NOT BETWEEN 2 AND 120 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_name');
    END IF;
    IF length(v_phone) NOT BETWEEN 6 AND 40
       OR v_phone !~ '^[0-9+() ./-]+$'
       OR length(regexp_replace(v_phone, '[^0-9]', '', 'g')) < 6 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_phone');
    END IF;
    IF v_lead.do_not_contact IS TRUE
       OR v_lead.status IN ('nekontaktovat', 'konvertovan', 'archivovan') THEN
      RETURN jsonb_build_object('success', false, 'error', 'lead_not_actionable');
    END IF;

    UPDATE public.sales_leads
    SET contact_person = v_name,
        contact_phone = v_phone,
        priority = 1,
        next_action_at = v_now,
        status = 'odpovedel',
        updated_at = v_now
    WHERE id = v_lead.id;

    IF v_old_status IS DISTINCT FROM 'odpovedel' THEN
      INSERT INTO public.sales_lead_status_history (
        lead_id, old_status, new_status, changed_by, reason
      )
      VALUES (
        v_lead.id, v_old_status, 'odpovedel', NULL,
        'Příjemce zvolil Mám zájem v obchodním e-mailu'
      );
    END IF;

    INSERT INTO public.sales_lead_activities (
      lead_id,
      activity_type,
      direction,
      subject,
      body_snapshot,
      performed_by,
      metadata,
      read_at
    )
    VALUES (
      v_lead.id,
      'reply_received',
      'inbound',
      'Mám zájem o spolupráci',
      'Jméno: ' || v_name || E'\nTelefon: ' || v_phone,
      NULL,
      jsonb_build_object(
        'source', 'interest_link',
        'interest', true,
        'batch_item_id', v_response.batch_item_id,
        'recipient', v_recipient
      ),
      NULL
    );

    UPDATE public.sales_lead_email_response_tokens
    SET status = 'interested',
        response_name = v_name,
        response_phone = v_phone,
        responded_at = v_now,
        updated_at = v_now
    WHERE id = v_response.id;

    RETURN jsonb_build_object(
      'success', true,
      'action', 'interest',
      'status', 'interested',
      'idempotent_replay', false,
      'conflicting_action', false
    );
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_recipient, 0));

  UPDATE public.sales_leads
  SET do_not_contact = true,
      do_not_contact_reason = 'Příjemce zvolil Nemám zájem v obchodním e-mailu',
      status = 'nekontaktovat',
      next_action_at = NULL,
      updated_at = v_now
  WHERE id = v_lead.id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_lead_email_suppression s
    WHERE lower(btrim(s.email_pattern)) = v_recipient
  ) THEN
    INSERT INTO public.sales_lead_email_suppression (
      email_pattern, reason, created_by
    )
    VALUES (
      v_recipient,
      'Příjemce zvolil Nemám zájem v obchodním e-mailu',
      NULL
    );
  END IF;

  IF v_old_status IS DISTINCT FROM 'nekontaktovat' THEN
    INSERT INTO public.sales_lead_status_history (
      lead_id, old_status, new_status, changed_by, reason
    )
    VALUES (
      v_lead.id, v_old_status, 'nekontaktovat', NULL,
      'Příjemce zvolil Nemám zájem v obchodním e-mailu'
    );
  END IF;

  INSERT INTO public.sales_lead_activities (
    lead_id,
    activity_type,
    direction,
    subject,
    body_snapshot,
    performed_by,
    metadata
  )
  VALUES (
    v_lead.id,
    'do_not_contact_set',
    'inbound',
    'Nemám zájem',
    'Příjemce odmítl další obchodní e-maily a spolupráci.',
    NULL,
    jsonb_build_object(
      'source', 'decline_link',
      'declined', true,
      'batch_item_id', v_response.batch_item_id,
      'recipient', v_recipient
    )
  );

  UPDATE public.sales_lead_email_response_tokens
  SET status = 'declined',
      responded_at = v_now,
      updated_at = v_now
  WHERE id = v_response.id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'decline',
    'status', 'declined',
    'idempotent_replay', false,
    'conflicting_action', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_response_submit(text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_response_submit(text,text,text,text)
  TO service_role;

COMMIT;
