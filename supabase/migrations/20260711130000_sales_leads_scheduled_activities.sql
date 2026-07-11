BEGIN;

ALTER TABLE public.sales_lead_activities
  ADD COLUMN IF NOT EXISTS scheduled_for timestamptz,
  ADD COLUMN IF NOT EXISTS activity_status text NOT NULL DEFAULT 'dokonceno',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.sales_lead_activities DROP CONSTRAINT IF EXISTS sales_lead_activities_status_check;
ALTER TABLE public.sales_lead_activities ADD CONSTRAINT sales_lead_activities_status_check
  CHECK (activity_status IN ('naplanovano','dokonceno','zruseno'));

-- Zachová již uložené budoucí schůzky/telefonáty. Původní implementace
-- ukládala plánovaný termín chybně do created_at.
UPDATE public.sales_lead_activities
SET scheduled_for = created_at,
    activity_status = 'naplanovano'
WHERE activity_type IN ('call_logged','meeting_logged','note_added')
  AND created_at > now()
  AND scheduled_for IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_scheduled
  ON public.sales_lead_activities (scheduled_for, lead_id)
  WHERE activity_status = 'naplanovano' AND scheduled_for IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sales_lead_log_activity(
  p_lead_id uuid, p_kind text, p_happened_at timestamptz, p_result text,
  p_next_step text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_id uuid; v_type text; v_planned boolean;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied');
  END IF;
  v_type:=CASE p_kind WHEN 'telefonat' THEN 'call_logged' WHEN 'schuzka' THEN 'meeting_logged' WHEN 'poznamka' THEN 'note_added' END;
  IF v_type IS NULL OR p_happened_at IS NULL OR length(btrim(coalesce(p_result,'')))<1 OR length(p_result)>5000 OR length(coalesce(p_note,''))>10000 OR length(coalesce(p_next_step,''))>2000 THEN
    RETURN jsonb_build_object('success',false,'error','invalid_input');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales_leads WHERE id=p_lead_id) THEN RETURN jsonb_build_object('success',false,'error','lead_not_found'); END IF;
  v_planned := p_happened_at > now();
  INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,created_at,scheduled_for,activity_status,body_snapshot,metadata)
  VALUES(p_lead_id,v_type,'internal',v_caller,now(),p_happened_at,CASE WHEN v_planned THEN 'naplanovano' ELSE 'dokonceno' END,
    NULLIF(btrim(coalesce(p_note,'')),''),jsonb_build_object('result',btrim(p_result),'next_step',NULLIF(btrim(coalesce(p_next_step,'')),''))) RETURNING id INTO v_id;
  RETURN jsonb_build_object('success',true,'activity_id',v_id,'scheduled',v_planned);
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_scheduled_activity_update(
  p_activity_id uuid, p_scheduled_for timestamptz, p_result text,
  p_next_step text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_lead_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN RETURN jsonb_build_object('success',false,'error','access_denied'); END IF;
  IF p_scheduled_for IS NULL OR p_scheduled_for <= now() OR length(btrim(coalesce(p_result,'')))<1 THEN RETURN jsonb_build_object('success',false,'error','invalid_input'); END IF;
  UPDATE public.sales_lead_activities SET scheduled_for=p_scheduled_for,body_snapshot=NULLIF(btrim(coalesce(p_note,'')),''),metadata=jsonb_build_object('result',btrim(p_result),'next_step',NULLIF(btrim(coalesce(p_next_step,'')),''))
  WHERE id=p_activity_id AND activity_type IN ('call_logged','meeting_logged','note_added') AND activity_status='naplanovano' RETURNING lead_id INTO v_lead_id;
  IF v_lead_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','activity_not_found'); END IF;
  RETURN jsonb_build_object('success',true,'lead_id',v_lead_id);
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_scheduled_activity_set_status(p_activity_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_activity public.sales_lead_activities%rowtype;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN RETURN jsonb_build_object('success',false,'error','access_denied'); END IF;
  IF p_status NOT IN ('dokonceno','zruseno') THEN RETURN jsonb_build_object('success',false,'error','invalid_status'); END IF;
  SELECT * INTO v_activity FROM public.sales_lead_activities WHERE id=p_activity_id FOR UPDATE;
  IF NOT FOUND OR v_activity.activity_type NOT IN ('call_logged','meeting_logged','note_added') THEN RETURN jsonb_build_object('success',false,'error','activity_not_found'); END IF;
  IF v_activity.activity_status<>'naplanovano' THEN RETURN jsonb_build_object('success',true,'unchanged',true); END IF;
  UPDATE public.sales_lead_activities SET activity_status=p_status,
    completed_at=CASE WHEN p_status='dokonceno' THEN now() END, completed_by=CASE WHEN p_status='dokonceno' THEN v_caller END,
    cancelled_at=CASE WHEN p_status='zruseno' THEN now() END, cancelled_by=CASE WHEN p_status='zruseno' THEN v_caller END
  WHERE id=p_activity_id;
  RETURN jsonb_build_object('success',true,'lead_id',v_activity.lead_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_update(uuid,timestamptz,text,text,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_set_status(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_update(uuid,timestamptz,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_set_status(uuid,text) TO authenticated;

COMMIT;
