BEGIN;

-- Public response links for prepared sales-lead e-mail batches.
-- Existing batch items are intentionally untouched. Only newly inserted items
-- receive one response token and two CTA links.
CREATE TABLE IF NOT EXISTS public.sales_lead_email_response_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  batch_item_id uuid NOT NULL UNIQUE
    REFERENCES public.sales_lead_email_batch_items(id) ON DELETE CASCADE,
  recipient_snapshot text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  response_name text,
  response_phone text,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_lead_email_response_token_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT sales_lead_email_response_status_check
    CHECK (status IN ('pending', 'interested', 'declined')),
  CONSTRAINT sales_lead_email_response_result_check
    CHECK (
      (status = 'pending' AND responded_at IS NULL)
      OR
      (status IN ('interested', 'declined') AND responded_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_sales_lead_email_response_tokens_lead
  ON public.sales_lead_email_response_tokens (lead_id, created_at DESC);

ALTER TABLE public.sales_lead_email_response_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_lead_email_response_tokens FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.sales_lead_email_response_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.sales_lead_email_attach_response_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_token_hash text;
  v_edge_base text;
  v_response_url text;
  v_interest_url text;
  v_decline_url text;
  v_html_interest_url text;
  v_html_decline_url text;
  v_body_source text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT btrim(decrypted_secret)
  INTO v_edge_base
  FROM vault.decrypted_secrets
  WHERE name = 'edge_functions_url'
  LIMIT 1;

  IF nullif(v_edge_base, '') IS NULL THEN
    RAISE EXCEPTION 'sales_lead_response_url_not_configured';
  END IF;

  v_edge_base := regexp_replace(v_edge_base, '/+$', '', 'g');
  IF v_edge_base !~* '^https://[a-z0-9-]+\.supabase\.co(/functions/v1)?$' THEN
    RAISE EXCEPTION 'sales_lead_response_url_invalid';
  END IF;
  IF v_edge_base !~* '/functions/v1$' THEN
    v_edge_base := v_edge_base || '/functions/v1';
  END IF;
  v_response_url := v_edge_base || '/sales-lead-response';

  LOOP
    v_token :=
      replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
    v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
    BEGIN
      INSERT INTO public.sales_lead_email_response_tokens (
        token_hash,
        lead_id,
        batch_item_id,
        recipient_snapshot,
        expires_at
      )
      VALUES (
        v_token_hash,
        NEW.lead_id,
        NEW.id,
        lower(btrim(NEW.recipient_snapshot)),
        now() + interval '90 days'
      );
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  v_interest_url := v_response_url || '?token=' || v_token || '&action=interest';
  v_decline_url := v_response_url || '?token=' || v_token || '&action=decline';
  v_html_interest_url := replace(v_interest_url, '&', '&amp;');
  v_html_decline_url := replace(v_decline_url, '&', '&amp;');

  v_body_source := NEW.body_source_snapshot
    || E'\n\n**Vyberte prosím:**'
    || E'\n\n[Mám zájem](' || v_interest_url || ')'
    || E'\n\n[Nemám zájem](' || v_decline_url || ')';

  UPDATE public.sales_lead_email_batch_items
  SET body_source_snapshot = v_body_source,
      body_text_snapshot = NEW.body_text_snapshot
        || E'\n\nMám zájem: ' || v_interest_url
        || E'\nNemám zájem: ' || v_decline_url,
      body_html_snapshot = NEW.body_html_snapshot
        || '<div style="margin-top:24px;padding-top:20px;border-top:1px solid #eee7dc;font-family:Arial,sans-serif">'
        || '<div style="margin:0 0 12px 0;font-size:14px;color:#4b5563">Vyberte prosím:</div>'
        || '<a href="' || v_html_interest_url || '" style="display:inline-block;margin:0 10px 10px 0;padding:12px 20px;border-radius:10px;background:#f97316;color:#ffffff;text-decoration:none;font-weight:700">Mám zájem</a>'
        || '<a href="' || v_html_decline_url || '" style="display:inline-block;margin:0 0 10px 0;padding:11px 18px;border-radius:10px;border:1px solid #d6d3d1;background:#ffffff;color:#57534e;text-decoration:none;font-weight:600">Nemám zájem</a>'
        || '</div>',
      updated_at = now()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_attach_response_links()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_attach_response_links()
  TO service_role;

DROP TRIGGER IF EXISTS trg_sales_lead_email_attach_response_links
  ON public.sales_lead_email_batch_items;
CREATE TRIGGER trg_sales_lead_email_attach_response_links
AFTER INSERT ON public.sales_lead_email_batch_items
FOR EACH ROW
EXECUTE FUNCTION public.sales_lead_email_attach_response_links();

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

  IF v_response.status <> 'pending' THEN
    IF (v_response.status = 'interested' AND v_action = 'interest')
       OR (v_response.status = 'declined' AND v_action = 'decline') THEN
      RETURN jsonb_build_object(
        'success', true,
        'action', v_action,
        'idempotent_replay', true
      );
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'response_already_recorded');
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
      'idempotent_replay', false
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
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_response_submit(text,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_response_submit(text,text,text,text)
  TO service_role;

COMMIT;
