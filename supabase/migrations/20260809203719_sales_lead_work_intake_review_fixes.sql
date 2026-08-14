-- Review fixes for the Work intake already applied on staging.
-- Adds a recoverable claim lease and reuses the existing duplicate/outreach guards.
BEGIN;

ALTER TABLE public.sales_lead_work_intake_items
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);

ALTER TABLE public.sales_lead_work_intake_items
  DROP CONSTRAINT IF EXISTS sales_lead_work_intake_items_website_check,
  DROP CONSTRAINT IF EXISTS sales_lead_work_intake_items_public_email_check,
  DROP CONSTRAINT IF EXISTS sales_lead_work_intake_items_email_source_url_check;

ALTER TABLE public.sales_lead_work_intake_items
  ADD CONSTRAINT sales_lead_work_intake_items_website_check CHECK (length(btrim(website)) <= 2048),
  ADD CONSTRAINT sales_lead_work_intake_items_public_email_check CHECK (length(btrim(public_email)) <= 320),
  ADD CONSTRAINT sales_lead_work_intake_items_email_source_url_check CHECK (length(btrim(email_source_url)) <= 2048);

CREATE OR REPLACE FUNCTION public.sales_lead_work_intake_claim(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_item public.sales_lead_work_intake_items%ROWTYPE;
BEGIN
  UPDATE public.sales_lead_work_intake_items
    SET status='pending', claimed_at=NULL
    WHERE run_id=p_run_id AND status='processing'
      AND (claimed_at IS NULL OR claimed_at < clock_timestamp() - interval '2 minutes');

  UPDATE public.sales_lead_work_intake_runs
    SET status='processing', started_at=coalesce(started_at,clock_timestamp()),
        completed_at=NULL, last_error=NULL
    WHERE id=p_run_id;

  SELECT * INTO v_item FROM public.sales_lead_work_intake_items
    WHERE run_id=p_run_id AND status='pending' ORDER BY position
    FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  UPDATE public.sales_lead_work_intake_items
    SET status='processing', claimed_at=clock_timestamp(), attempt_count=attempt_count+1
    WHERE id=v_item.id;
  RETURN jsonb_build_object('id',v_item.id,'position',v_item.position,'website',v_item.website,
    'public_email',v_item.public_email,'email_source_url',v_item.email_source_url);
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
    claimed_at=NULL, verification_evidence=coalesce(p_evidence,'{}'::jsonb), processed_at=clock_timestamp()
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
  v_matches jsonb;
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
    WHERE lower(btrim(s.email_pattern)) IN (v_email,'@' || split_part(v_email,'@',2))
  ) THEN v_reason := 'suppressed'; END IF;
  IF v_reason IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_lead_activities a
    LEFT JOIN public.sales_leads activity_lead ON activity_lead.id=a.lead_id
    WHERE a.activity_type='email_sent' AND a.direction='outbound'
      AND lower(btrim(coalesce(a.metadata->>'to',activity_lead.contact_email,'')))=v_email
  ) THEN v_reason := 'previous_outreach'; END IF;
  IF v_reason IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_lead_email_batch_items bi
    WHERE bi.status IN ('pending','processing','sent','failed')
      AND lower(btrim(bi.recipient_snapshot))=v_email
  ) THEN v_reason := 'previous_or_active_batch'; END IF;
  IF v_reason IS NULL AND EXISTS (
    SELECT 1 FROM public.sales_leads l WHERE l.website_domain=v_domain
  ) THEN v_reason := 'duplicate_domain'; END IF;
  IF v_reason IS NULL THEN
    v_matches := public.sales_lead_duplicate_matches(v_email,NULL);
    IF jsonb_array_length(v_matches) > 0 THEN
      v_reason := CASE WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_matches) match WHERE match->>'match_type'='exact_email'
      ) THEN 'duplicate_email' ELSE 'duplicate_email_domain' END;
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.sales_lead_work_intake_items SET status='skipped',reason=v_reason,claimed_at=NULL,
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
  UPDATE public.sales_lead_work_intake_items SET status='created',reason='created',lead_id=v_lead_id,claimed_at=NULL,
    normalized_website=p_website,normalized_domain=v_domain,normalized_email=v_email,
    normalized_source_url=p_source_url,verification_evidence=coalesce(p_evidence,'{}'::jsonb),processed_at=v_now
    WHERE id=p_item_id;
  PERFORM public.sales_lead_work_intake_refresh(v_item.run_id);
  RETURN jsonb_build_object('success',true,'outcome','created','lead_id',v_lead_id);
EXCEPTION WHEN unique_violation THEN
  UPDATE public.sales_lead_work_intake_items SET status='skipped',reason='duplicate_race',claimed_at=NULL,
    processed_at=clock_timestamp() WHERE id=p_item_id AND status='processing';
  PERFORM public.sales_lead_work_intake_refresh(v_item.run_id);
  RETURN jsonb_build_object('success',true,'outcome','skipped','reason','duplicate_race');
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_work_intake_claim(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_work_intake_finish_item(uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sales_lead_work_intake_commit(uuid,text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_work_intake_claim(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_work_intake_finish_item(uuid,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.sales_lead_work_intake_commit(uuid,text,text,text,text,jsonb) TO service_role;

COMMIT;
