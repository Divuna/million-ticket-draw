-- Phase 1: authenticated, asynchronous ChatGPT Work intake for verified e-shops.
-- This migration creates no cron, email batch, sender, OpenAI call, or ARES call.
BEGIN;

ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_discovery_source_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_discovery_source_check CHECK (
  discovery_source IS NULL OR discovery_source IN (
    'ai_navrh', 'verejny_rejstrik', 'shoptet_katalog', 'web_katalog',
    'doporuceni', 'rucne', 'chatgpt_work_intake'
  )
);

CREATE TABLE public.sales_lead_work_intake_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_batch_id text NOT NULL UNIQUE CHECK (length(btrim(external_batch_id)) BETWEEN 8 AND 200),
  schema_version smallint NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  item_count smallint NOT NULL CHECK (item_count BETWEEN 1 AND 150),
  accepted_count integer NOT NULL CHECK (accepted_count BETWEEN 1 AND 150),
  created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz,
  completed_at timestamptz,
  last_error text
);

CREATE TABLE public.sales_lead_work_intake_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.sales_lead_work_intake_runs(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 149),
  website text NOT NULL CHECK (length(btrim(website)) BETWEEN 4 AND 2048),
  public_email text NOT NULL CHECK (length(btrim(public_email)) BETWEEN 3 AND 320),
  email_source_url text NOT NULL CHECK (length(btrim(email_source_url)) BETWEEN 4 AND 2048),
  normalized_website text,
  normalized_domain text,
  normalized_email text,
  normalized_source_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','created','skipped','rejected')),
  reason text,
  lead_id uuid REFERENCES public.sales_leads(id) ON DELETE SET NULL,
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  processed_at timestamptz,
  CONSTRAINT sales_lead_work_intake_items_run_position_unique UNIQUE (run_id, position)
);

CREATE INDEX sales_lead_work_intake_items_claim_idx
  ON public.sales_lead_work_intake_items(run_id, status, position);

ALTER TABLE public.sales_lead_work_intake_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_lead_work_intake_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sales_lead_work_intake_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sales_lead_work_intake_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sales_lead_work_intake_runs TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.sales_lead_work_intake_items TO service_role;

CREATE OR REPLACE FUNCTION public.sales_lead_normalize_domain(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(btrim(p_value)), '^https?://(?:[^/@]*@)?', '', 'i'),
        '(:[0-9]+)?[/?#].*$|:[0-9]+$', ''
      ),
      '^www\.|\.$', '', 'g'
    ),
    ''
  );
$$;

CREATE INDEX IF NOT EXISTS idx_partners_work_intake_domain
  ON public.partners(public.sales_lead_normalize_domain(website_url));
CREATE INDEX IF NOT EXISTS idx_partners_work_intake_email
  ON public.partners(lower(btrim(contact_email))) WHERE contact_email IS NOT NULL;

-- Shared guard ready for later reuse by batching/claim paths. Phase 1 calls it only
-- from the intake commit RPC and does not change any email-delivery function.
CREATE OR REPLACE FUNCTION public.sales_lead_partner_match_reason(
  p_website text,
  p_email text,
  p_ico text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_domain text := public.sales_lead_normalize_domain(coalesce(p_website, ''));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_email_domain text := split_part(v_email, '@', 2);
BEGIN
  IF nullif(btrim(coalesce(p_ico, '')), '') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.partners p WHERE p.ico = btrim(p_ico)
  ) THEN RETURN 'existing_partner_ico'; END IF;

  IF v_domain IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.partners p
    WHERE public.sales_lead_normalize_domain(p.website_url) = v_domain
  ) THEN RETURN 'existing_partner_domain'; END IF;

  IF v_email <> '' AND EXISTS (
    SELECT 1 FROM public.partners p WHERE lower(btrim(p.contact_email)) = v_email
  ) THEN RETURN 'existing_partner_email'; END IF;

  IF v_email_domain <> ''
     AND NOT EXISTS (SELECT 1 FROM public.sales_lead_public_email_domains d WHERE d.domain = v_email_domain)
     AND EXISTS (
       SELECT 1 FROM public.partners p
       WHERE split_part(lower(btrim(p.contact_email)), '@', 2) = v_email_domain
     )
  THEN RETURN 'existing_partner_email_domain'; END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_lead_work_intake_submit(
  p_external_batch_id text,
  p_request_fingerprint text,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.sales_lead_work_intake_runs%ROWTYPE;
  v_owner uuid;
  v_count integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'items_must_be_array'; END IF;
  v_count := jsonb_array_length(p_items);
  IF v_count < 1 OR v_count > 150 THEN RAISE EXCEPTION 'items_count_out_of_range'; END IF;
  IF length(btrim(coalesce(p_external_batch_id,''))) NOT BETWEEN 8 AND 200
     OR coalesce(p_request_fingerprint,'') !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_idempotency_input';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('work-intake:' || p_external_batch_id, 0));
  SELECT * INTO v_run FROM public.sales_lead_work_intake_runs
    WHERE external_batch_id = p_external_batch_id FOR UPDATE;
  IF FOUND THEN
    IF v_run.request_fingerprint <> p_request_fingerprint THEN
      RETURN jsonb_build_object('success',false,'error','idempotency_conflict','run_id',v_run.id);
    END IF;
    RETURN jsonb_build_object('success',true,'replayed',true,'run_id',v_run.id,'status',v_run.status);
  END IF;

  v_owner := public.sales_lead_pick_discovery_owner();
  IF v_owner IS NULL THEN RAISE EXCEPTION 'no_eligible_sales_lead_owner'; END IF;

  INSERT INTO public.sales_lead_work_intake_runs(
    external_batch_id, request_fingerprint, item_count, accepted_count, created_by
  ) VALUES (btrim(p_external_batch_id), p_request_fingerprint, v_count, v_count, v_owner)
  RETURNING * INTO v_run;

  INSERT INTO public.sales_lead_work_intake_items(
    run_id, position, website, public_email, email_source_url
  )
  SELECT v_run.id, (e.ordinality - 1)::smallint,
         coalesce(e.value->>'website',''), coalesce(e.value->>'public_email',''),
         coalesce(e.value->>'email_source_url','')
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS e(value, ordinality);

  RETURN jsonb_build_object('success',true,'replayed',false,'run_id',v_run.id,'status',v_run.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_lead_work_intake_claim(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_item public.sales_lead_work_intake_items%ROWTYPE;
BEGIN
  UPDATE public.sales_lead_work_intake_runs
    SET status='processing', started_at=coalesce(started_at,clock_timestamp())
    WHERE id=p_run_id AND status IN ('pending','processing');
  SELECT * INTO v_item FROM public.sales_lead_work_intake_items
    WHERE run_id=p_run_id AND status='pending' ORDER BY position
    FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.sales_lead_work_intake_items SET status='processing' WHERE id=v_item.id;
  RETURN jsonb_build_object('id',v_item.id,'position',v_item.position,'website',v_item.website,
    'public_email',v_item.public_email,'email_source_url',v_item.email_source_url);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_lead_work_intake_refresh(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_pending integer; v_processing integer;
BEGIN
  SELECT count(*) FILTER (WHERE status='pending'), count(*) FILTER (WHERE status='processing')
    INTO v_pending,v_processing FROM public.sales_lead_work_intake_items WHERE run_id=p_run_id;
  UPDATE public.sales_lead_work_intake_runs r SET
    created_count=(SELECT count(*) FROM public.sales_lead_work_intake_items WHERE run_id=p_run_id AND status='created'),
    skipped_count=(SELECT count(*) FROM public.sales_lead_work_intake_items WHERE run_id=p_run_id AND status='skipped'),
    rejected_count=(SELECT count(*) FROM public.sales_lead_work_intake_items WHERE run_id=p_run_id AND status='rejected'),
    status=CASE WHEN v_pending=0 AND v_processing=0 THEN 'done' ELSE 'processing' END,
    completed_at=CASE WHEN v_pending=0 AND v_processing=0 THEN clock_timestamp() ELSE NULL END
  WHERE r.id=p_run_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_lead_work_intake_finish_item(
  p_item_id uuid,
  p_outcome text,
  p_reason text,
  p_evidence jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_run_id uuid;
BEGIN
  IF p_outcome NOT IN ('skipped','rejected') THEN RAISE EXCEPTION 'invalid_outcome'; END IF;
  UPDATE public.sales_lead_work_intake_items SET status=p_outcome, reason=left(p_reason,200),
    verification_evidence=coalesce(p_evidence,'{}'::jsonb), processed_at=clock_timestamp()
    WHERE id=p_item_id AND status='processing' RETURNING run_id INTO v_run_id;
  IF v_run_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','item_not_processing'); END IF;
  PERFORM public.sales_lead_work_intake_refresh(v_run_id);
  RETURN jsonb_build_object('success',true,'outcome',p_outcome,'reason',p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_lead_work_intake_commit(
  p_item_id uuid,
  p_website text,
  p_domain text,
  p_email text,
  p_source_url text,
  p_evidence jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item public.sales_lead_work_intake_items%ROWTYPE;
  v_run public.sales_lead_work_intake_runs%ROWTYPE;
  v_reason text;
  v_lead_id uuid;
  v_email text := lower(btrim(p_email));
  v_domain text := public.sales_lead_normalize_domain(p_domain);
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_item FROM public.sales_lead_work_intake_items WHERE id=p_item_id FOR UPDATE;
  IF NOT FOUND OR v_item.status <> 'processing' THEN
    RETURN jsonb_build_object('success',false,'error','item_not_processing');
  END IF;
  SELECT * INTO v_run FROM public.sales_lead_work_intake_runs WHERE id=v_item.run_id FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('lead-domain:' || coalesce(v_domain,''),0));
  PERFORM pg_advisory_xact_lock(hashtextextended('lead-email:' || v_email,0));

  v_reason := public.sales_lead_partner_match_reason(p_website,v_email,NULL);
  IF v_reason IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_leads l
    WHERE l.do_not_contact AND (l.website_domain=v_domain OR lower(btrim(l.contact_email))=v_email)
  ) THEN v_reason := 'do_not_contact'; END IF;
  IF v_reason IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_lead_email_suppression s
    WHERE s.email_pattern IN (v_email,'@' || split_part(v_email,'@',2))
  ) THEN v_reason := 'suppressed'; END IF;
  IF v_reason IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_lead_email_batch_items bi
    WHERE lower(btrim(bi.recipient_snapshot))=v_email
  ) THEN v_reason := 'previous_or_active_batch'; END IF;
  IF v_reason IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_leads l WHERE l.website_domain=v_domain
  ) THEN v_reason := 'duplicate_domain'; END IF;
  IF v_reason IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_leads l WHERE lower(btrim(l.contact_email))=v_email
  ) THEN v_reason := 'duplicate_email'; END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.sales_lead_work_intake_items SET status='skipped',reason=v_reason,
      normalized_website=p_website,normalized_domain=v_domain,normalized_email=v_email,
      normalized_source_url=p_source_url,verification_evidence=coalesce(p_evidence,'{}'::jsonb),processed_at=v_now
      WHERE id=p_item_id;
    PERFORM public.sales_lead_work_intake_refresh(v_item.run_id);
    RETURN jsonb_build_object('success',true,'outcome','skipped','reason',v_reason);
  END IF;

  INSERT INTO public.sales_leads(
    company_name, website, contact_email, email_source, email_verified_by_admin,
    email_verification_method, email_verified_at, status, source, created_by,
    lead_group, discovery_source, discovery_meta, website_verification_status,
    website_verification_source, website_confidence, website_verified_at,
    website_verification_evidence, contact_data_provenance
  ) VALUES (
    v_domain,p_website,v_email,p_source_url,true,'backend_verified_official_website',v_now,
    'novy','work_intake',v_run.created_by,'e-shopy','chatgpt_work_intake',
    jsonb_build_object('work_intake',jsonb_build_object('run_id',v_run.id,'external_batch_id',v_run.external_batch_id,'item_id',p_item_id),
      'website_verification',jsonb_build_object('status','verified','source','deterministic_work_intake','confidence',100,'verifiedAt',v_now,'evidence',coalesce(p_evidence,'{}'::jsonb),'alternatives','[]'::jsonb)),
    'overeny','deterministic_work_intake',100,v_now,coalesce(p_evidence,'{}'::jsonb),
    jsonb_build_object('website',jsonb_build_object('source','chatgpt_work_intake','verified_at',v_now),
      'email',jsonb_build_object('source_url',p_source_url,'method','exact_http_source_match','verified_at',v_now))
  ) RETURNING id INTO v_lead_id;

  INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
  VALUES (v_lead_id,'lead_created','internal',v_run.created_by,
    jsonb_build_object('source','chatgpt_work_intake','run_id',v_run.id,'item_id',p_item_id));
  UPDATE public.sales_lead_work_intake_items SET status='created',reason='created',lead_id=v_lead_id,
    normalized_website=p_website,normalized_domain=v_domain,normalized_email=v_email,
    normalized_source_url=p_source_url,verification_evidence=coalesce(p_evidence,'{}'::jsonb),processed_at=v_now
    WHERE id=p_item_id;
  PERFORM public.sales_lead_work_intake_refresh(v_item.run_id);
  RETURN jsonb_build_object('success',true,'outcome','created','lead_id',v_lead_id);
EXCEPTION WHEN unique_violation THEN
  UPDATE public.sales_lead_work_intake_items SET status='skipped',reason='duplicate_race',processed_at=clock_timestamp()
    WHERE id=p_item_id AND status='processing';
  PERFORM public.sales_lead_work_intake_refresh(v_item.run_id);
  RETURN jsonb_build_object('success',true,'outcome','skipped','reason','duplicate_race');
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_normalize_domain(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_partner_match_reason(text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_work_intake_submit(text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_work_intake_claim(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_work_intake_finish_item(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_work_intake_refresh(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_work_intake_commit(uuid,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_normalize_domain(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_partner_match_reason(text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_work_intake_submit(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_work_intake_claim(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_work_intake_finish_item(uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_work_intake_refresh(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_work_intake_commit(uuid,text,text,text,text,jsonb) TO service_role;

COMMIT;
