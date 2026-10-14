BEGIN;

ALTER TABLE public.sales_leads
  ADD COLUMN address text;

COMMENT ON COLUMN public.sales_leads.address IS
  'Úplná adresa sídla firmy; při ručním načtení pochází z ARES a před uložením je editovatelná.';

DROP FUNCTION public.sales_lead_create(text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text);
CREATE FUNCTION public.sales_lead_create(
  p_company_name text, p_ico text DEFAULT NULL, p_dic text DEFAULT NULL, p_website text DEFAULT NULL,
  p_industry text DEFAULT NULL, p_city text DEFAULT NULL, p_address text DEFAULT NULL,
  p_company_size text DEFAULT NULL, p_contact_person text DEFAULT NULL, p_contact_role text DEFAULT NULL,
  p_contact_email text DEFAULT NULL, p_contact_phone text DEFAULT NULL, p_email_source text DEFAULT NULL,
  p_notes text DEFAULT NULL, p_duplicate_override boolean DEFAULT false,
  p_duplicate_override_reason text DEFAULT NULL
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
    INSERT INTO public.sales_leads(company_name,ico,dic,website,industry,city,address,company_size,
      contact_person,contact_role,contact_email,contact_phone,email_source,notes,source,created_by)
    VALUES (btrim(p_company_name),NULLIF(btrim(coalesce(p_ico,'')),''),NULLIF(btrim(coalesce(p_dic,'')),''),
      NULLIF(btrim(coalesce(p_website,'')),''),NULLIF(btrim(coalesce(p_industry,'')),''),
      NULLIF(btrim(coalesce(p_city,'')),''),NULLIF(btrim(coalesce(p_address,'')),''),
      NULLIF(btrim(coalesce(p_company_size,'')),''),NULLIF(btrim(coalesce(p_contact_person,'')),''),
      NULLIF(btrim(coalesce(p_contact_role,'')),''),v_email,NULLIF(btrim(coalesce(p_contact_phone,'')),''),
      NULLIF(btrim(coalesce(p_email_source,'')),''),NULLIF(btrim(coalesce(p_notes,'')),''),'rucne',v_caller)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('success',false,'error','duplicate');
    WHEN check_violation THEN RETURN jsonb_build_object('success',false,'error','invalid_input'); END;
  INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
    VALUES(v_id,'lead_created','internal',v_caller,jsonb_build_object('company_name',btrim(p_company_name)));
  IF jsonb_array_length(v_matches) > 0 THEN
    PERFORM public.sales_lead_record_duplicate_overrides(v_id,v_matches,p_duplicate_override_reason,v_caller);
  END IF;
  RETURN jsonb_build_object('success',true,'lead_id',v_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.sales_lead_create(text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_create(text,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text) TO authenticated;

DROP FUNCTION public.sales_lead_update_fields(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,boolean,text);
CREATE FUNCTION public.sales_lead_update_fields(
  p_lead_id uuid, p_company_name text, p_ico text DEFAULT NULL, p_dic text DEFAULT NULL,
  p_website text DEFAULT NULL, p_industry text DEFAULT NULL, p_city text DEFAULT NULL,
  p_address text DEFAULT NULL, p_company_size text DEFAULT NULL, p_contact_person text DEFAULT NULL,
  p_contact_role text DEFAULT NULL, p_contact_email text DEFAULT NULL, p_contact_phone text DEFAULT NULL,
  p_email_source text DEFAULT NULL, p_email_verified_by_admin boolean DEFAULT NULL, p_notes text DEFAULT NULL,
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
      address=NULLIF(btrim(coalesce(p_address,'')),''),company_size=NULLIF(btrim(coalesce(p_company_size,'')),''),
      contact_person=NULLIF(btrim(coalesce(p_contact_person,'')),''),contact_role=NULLIF(btrim(coalesce(p_contact_role,'')),''),
      contact_email=v_email,contact_phone=NULLIF(btrim(coalesce(p_contact_phone,'')),''),
      email_source=NULLIF(btrim(coalesce(p_email_source,'')),''),
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
REVOKE EXECUTE ON FUNCTION public.sales_lead_update_fields(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_update_fields(uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,boolean,text) TO authenticated;

COMMIT;
