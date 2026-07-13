-- Team-owned plain-text templates for Administrace -> Obchod -> Leady.
-- Reading is limited to sales_leads.manage; only a superadmin can mutate.
-- Templates are never deleted and are copied into the existing editors, so
-- later edits cannot change saved drafts or communication history snapshots.

DO $$
BEGIN
  IF to_regprocedure('public.has_admin_permission(text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.has_admin_permission(text,uuid)';
  END IF;
  IF to_regprocedure('public.is_superadmin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.is_superadmin(uuid)';
  END IF;
END $$;

CREATE TABLE public.sales_lead_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_type text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_lead_email_templates_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT sales_lead_email_templates_type_check
    CHECK (template_type IN ('initial', 'reply', 'follow_up')),
  CONSTRAINT sales_lead_email_templates_subject_check
    CHECK (char_length(btrim(subject)) BETWEEN 1 AND 300),
  CONSTRAINT sales_lead_email_templates_body_check
    CHECK (char_length(btrim(body)) BETWEEN 1 AND 20000),
  CONSTRAINT sales_lead_email_templates_sort_order_check
    CHECK (sort_order BETWEEN 0 AND 10000)
);

CREATE INDEX sales_lead_email_templates_picker_idx
  ON public.sales_lead_email_templates (template_type, is_active, sort_order, lower(name));

ALTER TABLE public.sales_lead_email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_lead_email_templates_select
  ON public.sales_lead_email_templates
  FOR SELECT
  TO authenticated
  USING (
    public.is_superadmin(auth.uid())
    OR (
      is_active
      AND public.has_admin_permission('sales_leads.manage', auth.uid())
    )
  );

REVOKE ALL ON TABLE public.sales_lead_email_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.sales_lead_email_templates TO authenticated;

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
  v_opt_out constant text := 'Pokud si nepřejete být kontaktováni, odpovězte prosím slovem NEKONTAKTOVAT a příště vás nebudeme oslovovat.';
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

  IF p_template_type IN ('initial', 'follow_up')
     AND position(v_opt_out IN v_body) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'opt_out_sentence_required');
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

CREATE OR REPLACE FUNCTION public.sales_lead_email_template_set_active(
  p_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_name text;
BEGIN
  IF v_caller IS NULL OR NOT public.is_superadmin(v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied_superadmin_only');
  END IF;

  UPDATE public.sales_lead_email_templates
     SET is_active = coalesce(p_is_active, false),
         updated_by = v_caller,
         updated_at = now()
   WHERE id = p_id
   RETURNING name INTO v_name;

  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'template_not_found');
  END IF;

  INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
  VALUES (
    CASE WHEN p_is_active THEN 'sales_lead_email_template_activated' ELSE 'sales_lead_email_template_deactivated' END,
    v_caller,
    jsonb_build_object('template_id', p_id, 'name', v_name, 'is_active', coalesce(p_is_active, false)),
    now()
  );

  RETURN jsonb_build_object('success', true, 'id', p_id, 'is_active', coalesce(p_is_active, false));
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_template_upsert(uuid,text,text,text,text,integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_template_upsert(uuid,text,text,text,text,integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.sales_lead_email_template_set_active(uuid,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_template_set_active(uuid,boolean)
  TO authenticated;

COMMENT ON TABLE public.sales_lead_email_templates IS
  'Team-owned plain-text CRM email templates. Superadmin-managed; never deleted.';
