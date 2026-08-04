BEGIN;

-- Rozliší ruční potvrzení od důkazu ověřeného backendem. Existující záznamy
-- zůstávají beze změny (NULL = historický způsob ověření není znám).
ALTER TABLE public.sales_leads
  ADD COLUMN email_verification_method text,
  ADD COLUMN email_verified_at timestamptz,
  ADD CONSTRAINT sales_leads_email_verification_method_check
    CHECK (email_verification_method IS NULL OR email_verification_method IN (
      'admin_manual',
      'backend_verified_official_website'
    ));

COMMENT ON COLUMN public.sales_leads.email_verification_method IS
  'admin_manual nebo backend_verified_official_website; NULL u historických záznamů';
COMMENT ON COLUMN public.sales_leads.email_verified_at IS
  'Čas posledního úspěšného potvrzení aktuálního contact_email';

-- Ruční editace nesmí omylem zdědit označení „ověřeno backendem“.
CREATE OR REPLACE FUNCTION public.sales_lead_set_email_verification_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.email_verified_by_admin IS TRUE
       AND NEW.email_verification_method IS NULL THEN
      NEW.email_verification_method := 'admin_manual';
      NEW.email_verified_at := COALESCE(NEW.email_verified_at, clock_timestamp());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.contact_email IS DISTINCT FROM OLD.contact_email
     OR NEW.email_source IS DISTINCT FROM OLD.email_source
     OR NEW.email_verified_by_admin IS DISTINCT FROM OLD.email_verified_by_admin THEN
    IF NEW.email_verified_by_admin IS NOT TRUE OR NEW.contact_email IS NULL THEN
      NEW.email_verification_method := NULL;
      NEW.email_verified_at := NULL;
    ELSIF NEW.email_verification_method IS NOT DISTINCT FROM OLD.email_verification_method THEN
      NEW.email_verification_method := 'admin_manual';
      NEW.email_verified_at := clock_timestamp();
    ELSIF NEW.email_verification_method = 'admin_manual' THEN
      NEW.email_verified_at := COALESCE(NEW.email_verified_at, clock_timestamp());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sales_lead_email_verification_metadata
BEFORE INSERT OR UPDATE OF contact_email, email_source, email_verified_by_admin,
  email_verification_method, email_verified_at
ON public.sales_leads
FOR EACH ROW EXECUTE FUNCTION public.sales_lead_set_email_verification_metadata();

-- Jediný zápisový bod pro kandidáta, jehož přesnou zdrojovou stránku ověřil
-- backend. Funkce sama nic nestahuje; její volání je omezeno na service_role.
CREATE OR REPLACE FUNCTION public.sales_lead_store_backend_verified_contact(
  p_lead_id uuid,
  p_created_by uuid,
  p_email text,
  p_source_url text,
  p_expected_updated_at timestamptz,
  p_expected_website text,
  p_expected_website_verified_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lead public.sales_leads%ROWTYPE;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_source text := btrim(coalesce(p_source_url, ''));
  v_matches jsonb;
  v_verified_at timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_lead
  FROM public.sales_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;
  IF NULLIF(btrim(coalesce(v_lead.contact_email, '')), '') IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'contact_already_present');
  END IF;
  IF v_lead.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'contact_changed_since_lookup');
  END IF;
  IF v_lead.website_verification_status IS DISTINCT FROM 'overeny'
     OR v_lead.website IS DISTINCT FROM p_expected_website
     OR v_lead.website_verified_at IS DISTINCT FROM p_expected_website_verified_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'verified_website_changed_since_lookup');
  END IF;
  IF v_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;
  IF v_source !~* '^https?://' THEN
    RETURN jsonb_build_object('success', false, 'error', 'source_url_required');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(split_part(v_email, '@', 2), 0));
  v_matches := public.sales_lead_duplicate_matches(v_email, p_lead_id);
  IF jsonb_array_length(v_matches) > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'duplicate_conflict', 'conflicts', v_matches
    );
  END IF;

  UPDATE public.sales_leads
  SET contact_email = v_email,
      email_source = v_source,
      email_verified_by_admin = true,
      email_verification_method = 'backend_verified_official_website',
      email_verified_at = v_verified_at,
      contact_data_provenance = jsonb_set(
        coalesce(contact_data_provenance, '{}'::jsonb),
        '{email}',
        jsonb_build_object(
          'value', v_email,
          'source_url', v_source,
          'method', 'backend_verified_official_website',
          'verified_at', v_verified_at
        ),
        true
      ),
      proposed_contact_email = NULL,
      proposed_contact_source_url = NULL,
      proposed_contact_at = NULL,
      proposed_contact_by = NULL,
      proposed_contact_status = NULL
  WHERE id = p_lead_id;

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (
    p_lead_id,
    'contact_approved',
    'internal',
    p_created_by,
    jsonb_build_object(
      'email', v_email,
      'source_url', v_source,
      'verification_method', 'backend_verified_official_website'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'verified_at', v_verified_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_store_backend_verified_contact(
  uuid, uuid, text, text, timestamptz, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_store_backend_verified_contact(
  uuid, uuid, text, text, timestamptz, text, timestamptz
) TO service_role;

-- AI bez backendového důkazu už nesmí zanechat čekající návrh. RPC zůstává
-- pouze kvůli kompatibilitě ručních admin nástrojů.
CREATE OR REPLACE FUNCTION public.sales_lead_propose_contact(
  p_lead_id uuid,
  p_created_by uuid,
  p_email text,
  p_source_url text,
  p_proposed_by text DEFAULT 'ai'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_source text := NULLIF(btrim(coalesce(p_source_url, '')), '');
BEGIN
  IF p_proposed_by IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'backend_verification_required');
  END IF;
  PERFORM 1 FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;
  IF v_email = '' OR v_email NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;
  IF v_source IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'source_url_required');
  END IF;

  UPDATE public.sales_leads SET
    proposed_contact_email = v_email,
    proposed_contact_source_url = v_source,
    proposed_contact_at = now(),
    proposed_contact_by = 'admin',
    proposed_contact_status = 'neovereny'
  WHERE id = p_lead_id;
  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (
    p_lead_id, 'contact_proposed', 'internal', p_created_by,
    jsonb_build_object('proposed_by', 'admin', 'source_url', v_source)
  );
  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'status', 'neovereny');
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_propose_contact(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_propose_contact(uuid, uuid, text, text, text)
  TO service_role;

-- Historické discovery RPC umí vytvořit neověřený AI návrh bez backendového
-- důkazu. Aktuální kód ho už nevolá, proto ho fail-closed znepřístupníme místo
-- udržování druhé zapisovací cesty.
REVOKE ALL ON FUNCTION public.sales_lead_propose_with_contact(
  uuid, text, text, text, text, text, jsonb, text, text, text, text, smallint, text
) FROM PUBLIC, anon, authenticated, service_role;

-- Historický AI návrh lze zamítnout, ale už ne schválit bez nového ověření.
CREATE OR REPLACE FUNCTION public.sales_lead_review_contact(p_lead_id uuid, p_decision text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_lead public.sales_leads%ROWTYPE;
  v_matches jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage', v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;
  SELECT * INTO v_lead FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'lead_not_found'); END IF;
  IF v_lead.proposed_contact_status IS DISTINCT FROM 'neovereny'
     OR NULLIF(btrim(coalesce(v_lead.proposed_contact_email, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_pending_contact');
  END IF;
  IF p_decision = 'approve' AND v_lead.proposed_contact_by IS DISTINCT FROM 'admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'backend_verification_required');
  END IF;
  IF p_decision = 'approve' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(split_part(lower(v_lead.proposed_contact_email), '@', 2), 0));
    v_matches := public.sales_lead_duplicate_matches(v_lead.proposed_contact_email, p_lead_id);
    IF jsonb_array_length(v_matches) > 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'duplicate_conflict', 'conflicts', v_matches);
    END IF;
    UPDATE public.sales_leads SET
      contact_email = lower(btrim(v_lead.proposed_contact_email)),
      email_verified_by_admin = true,
      email_source = coalesce(NULLIF(btrim(coalesce(email_source, '')), ''), v_lead.proposed_contact_source_url),
      proposed_contact_status = 'overeny'
    WHERE id = p_lead_id;
    INSERT INTO public.sales_lead_activities(lead_id, activity_type, direction, performed_by, metadata)
    VALUES (p_lead_id, 'contact_approved', 'internal', v_caller,
      jsonb_build_object('email', v_lead.proposed_contact_email, 'verification_method', 'admin_manual'));
    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'status', 'overeny');
  ELSIF p_decision = 'reject' THEN
    UPDATE public.sales_leads SET proposed_contact_status = 'zamitnuty' WHERE id = p_lead_id;
    INSERT INTO public.sales_lead_activities(lead_id, activity_type, direction, performed_by, metadata)
    VALUES (p_lead_id, 'contact_rejected', 'internal', v_caller, '{}'::jsonb);
    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'status', 'zamitnuty');
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'invalid_decision');
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_review_contact(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_review_contact(uuid, text) TO authenticated;

COMMIT;
