-- Sales leads: řízené výjimky duplicit + serverová ochrana odesílání.
-- NEAPLIKOVÁNO. Migrace je pouze součástí PR.

BEGIN;

CREATE TABLE public.sales_lead_public_email_domains (
  domain text PRIMARY KEY CHECK (domain = lower(btrim(domain)) AND domain <> ''),
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sales_lead_public_email_domains(domain) VALUES
  ('gmail.com'), ('googlemail.com'), ('seznam.cz'), ('email.cz'), ('post.cz'),
  ('outlook.com'), ('outlook.cz'), ('hotmail.com'), ('hotmail.cz'), ('live.com'),
  ('msn.com'), ('centrum.cz'), ('atlas.cz'), ('volny.cz'), ('yahoo.com'),
  ('yahoo.co.uk'), ('icloud.com'), ('me.com'), ('proton.me'), ('protonmail.com'),
  ('zoho.com'), ('aol.com'), ('gmx.com'), ('gmx.de'), ('mail.com'), ('yandex.com');

ALTER TABLE public.sales_lead_public_email_domains ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_lead_public_email_domains FROM PUBLIC, anon, authenticated;

CREATE TABLE public.sales_lead_duplicate_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  matched_lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  match_type text NOT NULL CHECK (match_type IN ('exact_email', 'email_domain')),
  matched_value text NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  confirmed_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_lead_duplicate_override_not_self CHECK (lead_id <> matched_lead_id),
  CONSTRAINT sales_lead_duplicate_override_unique UNIQUE (lead_id, matched_lead_id, match_type, matched_value)
);

CREATE INDEX idx_sales_lead_duplicate_overrides_lead
  ON public.sales_lead_duplicate_overrides(lead_id);
ALTER TABLE public.sales_lead_duplicate_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_lead_duplicate_overrides_select ON public.sales_lead_duplicate_overrides
  FOR SELECT TO authenticated
  USING (public.has_admin_permission('sales_leads.manage', auth.uid()) OR public.is_superadmin(auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.sales_lead_duplicate_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sales_lead_duplicate_overrides TO authenticated;

-- Přesnou e-mailovou duplicitu nově řídí RPC, aby mohla existovat auditovaná výjimka.
DROP INDEX IF EXISTS public.uq_sales_leads_contact_email;
CREATE INDEX idx_sales_leads_contact_email_normalized
  ON public.sales_leads(lower(btrim(contact_email))) WHERE contact_email IS NOT NULL;
CREATE INDEX idx_sales_leads_contact_email_domain
  ON public.sales_leads(lower(split_part(btrim(contact_email), '@', 2))) WHERE contact_email LIKE '%@%';

CREATE OR REPLACE FUNCTION public.sales_lead_duplicate_matches(
  p_contact_email text,
  p_exclude_lead_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT lower(btrim(coalesce(p_contact_email, ''))) AS email
  ), normalized AS (
    SELECT email, split_part(email, '@', 2) AS domain FROM input
  ), matches AS (
    SELECT l.id, l.company_name, l.contact_email, l.status,
      CASE WHEN lower(btrim(l.contact_email)) = n.email THEN 'exact_email' ELSE 'email_domain' END AS match_type,
      CASE WHEN lower(btrim(l.contact_email)) = n.email THEN n.email ELSE n.domain END AS matched_value,
      (SELECT min(a.created_at) FROM public.sales_lead_activities a
       WHERE a.lead_id = l.id AND a.activity_type = 'email_sent') AS first_contacted_at
    FROM public.sales_leads l CROSS JOIN normalized n
    WHERE n.email LIKE '%@%'
      AND l.id IS DISTINCT FROM p_exclude_lead_id
      AND (
        lower(btrim(l.contact_email)) = n.email
        OR (
          n.domain <> ''
          AND NOT EXISTS (SELECT 1 FROM public.sales_lead_public_email_domains d WHERE d.domain = n.domain)
          AND lower(split_part(btrim(l.contact_email), '@', 2)) = n.domain
        )
      )
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'lead_id', id, 'company_name', company_name, 'contact_email', contact_email,
    'status', status, 'match_type', match_type, 'matched_value', matched_value,
    'first_contacted_at', first_contacted_at
  ) ORDER BY match_type, company_name), '[]'::jsonb) FROM matches;
$$;
REVOKE EXECUTE ON FUNCTION public.sales_lead_duplicate_matches(text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_duplicate_matches(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.sales_lead_check_duplicate(
  p_contact_email text,
  p_exclude_lead_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_caller uuid := auth.uid(); v_matches jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage', v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;
  v_matches := public.sales_lead_duplicate_matches(p_contact_email, p_exclude_lead_id);
  RETURN jsonb_build_object('success', true, 'has_conflict', jsonb_array_length(v_matches) > 0, 'conflicts', v_matches);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sales_lead_check_duplicate(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_check_duplicate(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_lead_record_duplicate_overrides(
  p_lead_id uuid, p_matches jsonb, p_reason text, p_caller uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_match jsonb;
BEGIN
  FOR v_match IN SELECT value FROM jsonb_array_elements(p_matches) LOOP
    INSERT INTO public.sales_lead_duplicate_overrides
      (lead_id, matched_lead_id, match_type, matched_value, reason, confirmed_by)
    VALUES (p_lead_id, (v_match->>'lead_id')::uuid, v_match->>'match_type',
      v_match->>'matched_value', btrim(p_reason), p_caller)
    ON CONFLICT (lead_id, matched_lead_id, match_type, matched_value)
    DO UPDATE SET reason = excluded.reason, confirmed_by = excluded.confirmed_by, created_at = now();
  END LOOP;
  INSERT INTO public.sales_lead_activities(lead_id, activity_type, direction, performed_by, metadata)
  VALUES (p_lead_id, 'duplicate_override_confirmed', 'internal', p_caller,
    jsonb_build_object('reason', btrim(p_reason), 'conflicts', p_matches));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sales_lead_record_duplicate_overrides(uuid,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_record_duplicate_overrides(uuid,jsonb,text,uuid) TO service_role;

ALTER TABLE public.sales_lead_activities DROP CONSTRAINT sales_lead_activities_type_check;
ALTER TABLE public.sales_lead_activities ADD CONSTRAINT sales_lead_activities_type_check CHECK (activity_type IN (
  'lead_created','field_updated','ai_research','draft_created','draft_edited','draft_approved',
  'email_sent','email_failed','reply_received','call_logged','note_added','status_changed',
  'do_not_contact_set','converted','lead_discovered','contact_proposed','contact_approved',
  'contact_rejected','duplicate_override_confirmed'
));

DROP FUNCTION public.sales_lead_create(text,text,text,text,text,text,text,text,text,text,text,text,text);
CREATE FUNCTION public.sales_lead_create(
  p_company_name text, p_ico text DEFAULT NULL, p_dic text DEFAULT NULL, p_website text DEFAULT NULL,
  p_industry text DEFAULT NULL, p_city text DEFAULT NULL, p_company_size text DEFAULT NULL,
  p_contact_person text DEFAULT NULL, p_contact_role text DEFAULT NULL, p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL, p_email_source text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_duplicate_override boolean DEFAULT false, p_duplicate_override_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_id uuid; v_matches jsonb; v_email text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage', v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;
  IF NULLIF(btrim(coalesce(p_company_name,'')),'') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_name_required');
  END IF;
  v_email := NULLIF(lower(btrim(coalesce(p_contact_email,''))), '');
  IF v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(split_part(v_email,'@',2), 0));
  END IF;
  v_matches := public.sales_lead_duplicate_matches(v_email, NULL);
  IF jsonb_array_length(v_matches) > 0 AND NOT p_duplicate_override THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_conflict', 'conflicts', v_matches);
  END IF;
  IF jsonb_array_length(v_matches) > 0 AND length(btrim(coalesce(p_duplicate_override_reason,''))) < 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_override_reason_required', 'conflicts', v_matches);
  END IF;
  BEGIN
    INSERT INTO public.sales_leads(company_name,ico,dic,website,industry,city,company_size,
      contact_person,contact_role,contact_email,contact_phone,email_source,notes,source,created_by)
    VALUES (btrim(p_company_name),NULLIF(btrim(coalesce(p_ico,'')),''),NULLIF(btrim(coalesce(p_dic,'')),''),
      NULLIF(btrim(coalesce(p_website,'')),''),NULLIF(btrim(coalesce(p_industry,'')),''),
      NULLIF(btrim(coalesce(p_city,'')),''),NULLIF(btrim(coalesce(p_company_size,'')),''),
      NULLIF(btrim(coalesce(p_contact_person,'')),''),NULLIF(btrim(coalesce(p_contact_role,'')),''),v_email,
      NULLIF(btrim(coalesce(p_contact_phone,'')),''),NULLIF(btrim(coalesce(p_email_source,'')),''),
      NULLIF(btrim(coalesce(p_notes,'')),''),'rucne',v_caller) RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'error','duplicate');
    WHEN check_violation THEN RETURN jsonb_build_object('success',false,'error','invalid_input'); END;
  INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
    VALUES(v_id,'lead_created','internal',v_caller,jsonb_build_object('company_name',btrim(p_company_name)));
  IF jsonb_array_length(v_matches) > 0 THEN
    PERFORM public.sales_lead_record_duplicate_overrides(v_id,v_matches,p_duplicate_override_reason,v_caller);
  END IF;
  RETURN jsonb_build_object('success',true,'lead_id',v_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.sales_lead_create(text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_create(text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text) TO authenticated;

DROP FUNCTION public.sales_lead_update_fields(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text);
CREATE FUNCTION public.sales_lead_update_fields(
  p_lead_id uuid, p_company_name text, p_ico text DEFAULT NULL, p_dic text DEFAULT NULL,
  p_website text DEFAULT NULL, p_industry text DEFAULT NULL, p_city text DEFAULT NULL,
  p_company_size text DEFAULT NULL, p_contact_person text DEFAULT NULL, p_contact_role text DEFAULT NULL,
  p_contact_email text DEFAULT NULL, p_contact_phone text DEFAULT NULL, p_email_source text DEFAULT NULL,
  p_email_verified_by_admin boolean DEFAULT NULL, p_notes text DEFAULT NULL,
  p_duplicate_override boolean DEFAULT false, p_duplicate_override_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller uuid := auth.uid(); v_matches jsonb; v_email text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage',v_caller) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied'); END IF;
  PERFORM 1 FROM public.sales_leads WHERE id=p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','lead_not_found'); END IF;
  IF NULLIF(btrim(coalesce(p_company_name,'')),'') IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','company_name_required'); END IF;
  v_email := NULLIF(lower(btrim(coalesce(p_contact_email,''))), '');
  IF v_email IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(split_part(v_email,'@',2), 0));
  END IF;
  v_matches := public.sales_lead_duplicate_matches(v_email,p_lead_id);
  IF jsonb_array_length(v_matches)>0 AND NOT p_duplicate_override THEN
    RETURN jsonb_build_object('success',false,'error','duplicate_conflict','conflicts',v_matches); END IF;
  IF jsonb_array_length(v_matches)>0 AND length(btrim(coalesce(p_duplicate_override_reason,'')))<3 THEN
    RETURN jsonb_build_object('success',false,'error','duplicate_override_reason_required','conflicts',v_matches); END IF;
  BEGIN
    UPDATE public.sales_leads SET company_name=btrim(p_company_name),ico=NULLIF(btrim(coalesce(p_ico,'')),''),
      dic=NULLIF(btrim(coalesce(p_dic,'')),''),website=NULLIF(btrim(coalesce(p_website,'')),''),
      industry=NULLIF(btrim(coalesce(p_industry,'')),''),city=NULLIF(btrim(coalesce(p_city,'')),''),
      company_size=NULLIF(btrim(coalesce(p_company_size,'')),''),contact_person=NULLIF(btrim(coalesce(p_contact_person,'')),''),
      contact_role=NULLIF(btrim(coalesce(p_contact_role,'')),''),contact_email=v_email,
      contact_phone=NULLIF(btrim(coalesce(p_contact_phone,'')),''),email_source=NULLIF(btrim(coalesce(p_email_source,'')),''),
      email_verified_by_admin=coalesce(p_email_verified_by_admin,email_verified_by_admin),
      notes=NULLIF(btrim(coalesce(p_notes,'')),'') WHERE id=p_lead_id;
  EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'error','duplicate');
    WHEN check_violation THEN RETURN jsonb_build_object('success',false,'error','invalid_input'); END;
  INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
    VALUES(p_lead_id,'field_updated','internal',v_caller,'{}'::jsonb);
  DELETE FROM public.sales_lead_duplicate_overrides WHERE lead_id=p_lead_id;
  IF jsonb_array_length(v_matches)>0 THEN
    PERFORM public.sales_lead_record_duplicate_overrides(p_lead_id,v_matches,p_duplicate_override_reason,v_caller);
  END IF;
  RETURN jsonb_build_object('success',true,'lead_id',p_lead_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.sales_lead_update_fields(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_update_fields(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,boolean,text) TO authenticated;

-- Schválení AI návrhu kontaktu nesmí obejít novou ochranu. Pokud narazí na
-- duplicitu, admin ji vyřeší v běžné editaci, kde je dostupná auditovaná výjimka.
CREATE OR REPLACE FUNCTION public.sales_lead_review_contact(p_lead_id uuid, p_decision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_lead public.sales_leads%ROWTYPE; v_matches jsonb;
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage',v_caller) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied'); END IF;
  SELECT * INTO v_lead FROM public.sales_leads WHERE id=p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','lead_not_found'); END IF;
  IF v_lead.proposed_contact_status IS DISTINCT FROM 'neovereny'
     OR NULLIF(btrim(coalesce(v_lead.proposed_contact_email,'')),'') IS NULL THEN
    RETURN jsonb_build_object('success',false,'error','no_pending_contact'); END IF;
  IF p_decision='approve' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(split_part(lower(v_lead.proposed_contact_email),'@',2),0));
    v_matches:=public.sales_lead_duplicate_matches(v_lead.proposed_contact_email,p_lead_id);
    IF jsonb_array_length(v_matches)>0 THEN
      RETURN jsonb_build_object('success',false,'error','duplicate_conflict','conflicts',v_matches); END IF;
    UPDATE public.sales_leads SET contact_email=lower(btrim(v_lead.proposed_contact_email)),
      email_verified_by_admin=true,
      email_source=coalesce(NULLIF(btrim(coalesce(email_source,'')),''),v_lead.proposed_contact_source_url),
      proposed_contact_status='overeny' WHERE id=p_lead_id;
    INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
      VALUES(p_lead_id,'contact_approved','internal',v_caller,jsonb_build_object('email',v_lead.proposed_contact_email));
    RETURN jsonb_build_object('success',true,'lead_id',p_lead_id,'status','overeny');
  ELSIF p_decision='reject' THEN
    UPDATE public.sales_leads SET proposed_contact_status='zamitnuty' WHERE id=p_lead_id;
    INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
      VALUES(p_lead_id,'contact_rejected','internal',v_caller,'{}'::jsonb);
    RETURN jsonb_build_object('success',true,'lead_id',p_lead_id,'status','zamitnuty');
  END IF;
  RETURN jsonb_build_object('success',false,'error','invalid_decision');
END; $$;
REVOKE EXECUTE ON FUNCTION public.sales_lead_review_contact(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_review_contact(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sales_lead_email_send_guard(p_lead_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_email text; v_matches jsonb; v_match jsonb;
BEGIN
  SELECT contact_email INTO v_email FROM public.sales_leads WHERE id=p_lead_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','lead_not_found'); END IF;
  v_matches:=public.sales_lead_duplicate_matches(v_email,p_lead_id);
  FOR v_match IN SELECT value FROM jsonb_array_elements(v_matches) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.sales_lead_duplicate_overrides o
      WHERE o.lead_id=p_lead_id AND o.matched_lead_id=(v_match->>'lead_id')::uuid
      AND o.match_type=v_match->>'match_type' AND o.matched_value=v_match->>'matched_value') THEN
      RETURN jsonb_build_object('success',false,'error','duplicate_override_required','conflicts',v_matches);
    END IF;
  END LOOP;
  RETURN jsonb_build_object('success',true);
END; $$;
REVOKE EXECUTE ON FUNCTION public.sales_lead_email_send_guard(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_send_guard(uuid) TO service_role;

COMMIT;
