CREATE OR REPLACE FUNCTION public.sales_lead_email_template_upsert(
  p_id uuid,
  p_name text,
  p_template_type text,
  p_subject text,
  p_body text,
  p_sort_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_subject text := btrim(coalesce(p_subject, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_without_allowed_variables text;
BEGIN
  IF v_caller IS NULL OR NOT public.is_superadmin(v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied_superadmin_only');
  END IF;

  IF char_length(v_name) NOT BETWEEN 1 AND 120
     OR p_template_type NOT IN ('initial', 'reply', 'follow_up')
     OR char_length(v_subject) NOT BETWEEN 1 AND 300
     OR char_length(v_body) NOT BETWEEN 1 AND 20000
     OR coalesce(p_sort_order, 0) NOT BETWEEN 0 AND 10000 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_template');
  END IF;

  v_without_allowed_variables := regexp_replace(
    v_subject || E'\n' || v_body,
    '\{\{(company_name|contact_person|contact_role|city|website)\}\}',
    '',
    'g'
  );
  IF position('{{' IN v_without_allowed_variables) > 0
     OR position('}}' IN v_without_allowed_variables) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'unsupported_template_variable');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.sales_lead_email_templates (
      name, template_type, subject, body, sort_order, created_by, updated_by
    ) VALUES (
      v_name, p_template_type, v_subject, v_body, coalesce(p_sort_order, 0), v_caller, v_caller
    ) RETURNING id INTO v_id;

    INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
    VALUES (
      'sales_lead_email_template_created',
      v_caller,
      jsonb_build_object('template_id', v_id, 'name', v_name, 'template_type', p_template_type),
      now()
    );
  ELSE
    UPDATE public.sales_lead_email_templates
       SET name = v_name,
           template_type = p_template_type,
           subject = v_subject,
           body = v_body,
           sort_order = coalesce(p_sort_order, 0),
           updated_by = v_caller,
           updated_at = now()
     WHERE id = p_id
     RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'template_not_found');
    END IF;

    INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
    VALUES (
      'sales_lead_email_template_updated',
      v_caller,
      jsonb_build_object('template_id', v_id, 'name', v_name, 'template_type', p_template_type),
      now()
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_template_upsert(uuid,text,text,text,text,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_template_upsert(uuid,text,text,text,text,integer)
  TO authenticated;

COMMENT ON FUNCTION public.sales_lead_email_template_upsert(uuid,text,text,text,text,integer) IS
  'Creates or updates a team sales-lead email template. Superadmin-only; opt-out text is optional.';
