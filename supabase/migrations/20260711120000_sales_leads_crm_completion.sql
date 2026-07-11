BEGIN;

ALTER TABLE public.sales_lead_activities DROP CONSTRAINT IF EXISTS sales_lead_activities_type_check;
ALTER TABLE public.sales_lead_activities ADD CONSTRAINT sales_lead_activities_type_check CHECK (activity_type IN (
  'lead_created','field_updated','ai_research','draft_created','draft_edited','draft_approved',
  'email_sent','email_failed','email_delivered','email_delivery_delayed','email_bounced','email_suppressed',
  'reply_received','call_logged','meeting_logged','note_added','status_changed','do_not_contact_set',
  'converted','lead_discovered','contact_proposed','contact_approved','contact_rejected',
  'duplicate_override_confirmed','task_created','task_completed','task_cancelled'
));

CREATE TABLE public.sales_lead_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  due_at timestamptz NOT NULL,
  assigned_admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  note text CHECK (note IS NULL OR length(note) <= 5000),
  status text NOT NULL DEFAULT 'ceka' CHECK (status IN ('ceka','dokonceno','zruseno')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_lead_tasks_completion_check CHECK (
    (status='ceka' AND completed_at IS NULL AND completed_by IS NULL) OR
    (status IN ('dokonceno','zruseno') AND completed_at IS NOT NULL)
  )
);
CREATE INDEX idx_sales_lead_tasks_open_due ON public.sales_lead_tasks(due_at) WHERE status='ceka';
CREATE INDEX idx_sales_lead_tasks_lead ON public.sales_lead_tasks(lead_id, created_at DESC);
ALTER TABLE public.sales_lead_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY sales_lead_tasks_select ON public.sales_lead_tasks FOR SELECT TO authenticated
  USING (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin());

CREATE OR REPLACE FUNCTION public.sales_lead_log_activity(
  p_lead_id uuid, p_kind text, p_happened_at timestamptz, p_result text,
  p_next_step text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_id uuid; v_type text;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied');
  END IF;
  v_type:=CASE p_kind WHEN 'telefonat' THEN 'call_logged' WHEN 'schuzka' THEN 'meeting_logged' WHEN 'poznamka' THEN 'note_added' END;
  IF v_type IS NULL OR p_happened_at IS NULL OR length(btrim(coalesce(p_result,'')))<1 OR length(p_result)>5000 OR length(coalesce(p_note,''))>10000 OR length(coalesce(p_next_step,''))>2000 THEN
    RETURN jsonb_build_object('success',false,'error','invalid_input');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales_leads WHERE id=p_lead_id) THEN RETURN jsonb_build_object('success',false,'error','lead_not_found'); END IF;
  INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,created_at,body_snapshot,metadata)
  VALUES(p_lead_id,v_type,'internal',v_caller,p_happened_at,NULLIF(btrim(coalesce(p_note,'')),''),
    jsonb_build_object('result',btrim(p_result),'next_step',NULLIF(btrim(coalesce(p_next_step,'')),''))) RETURNING id INTO v_id;
  IF NULLIF(btrim(coalesce(p_next_step,'')),'') IS NOT NULL THEN
    UPDATE public.sales_leads SET next_action_at=p_happened_at WHERE id=p_lead_id AND next_action_at IS NULL;
  END IF;
  RETURN jsonb_build_object('success',true,'activity_id',v_id);
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_task_create(p_lead_id uuid,p_title text,p_due_at timestamptz,p_assigned_admin_id uuid,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_id uuid;
BEGIN
 IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN RETURN jsonb_build_object('success',false,'error','access_denied'); END IF;
 IF p_due_at IS NULL OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 200 OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_assigned_admin_id AND role IN ('admin','superadmin')) THEN RETURN jsonb_build_object('success',false,'error','invalid_input'); END IF;
 INSERT INTO public.sales_lead_tasks(lead_id,title,due_at,assigned_admin_id,note,created_by) VALUES(p_lead_id,btrim(p_title),p_due_at,p_assigned_admin_id,NULLIF(btrim(coalesce(p_note,'')),''),v_caller) RETURNING id INTO v_id;
 INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata) VALUES(p_lead_id,'task_created','internal',v_caller,jsonb_build_object('task_id',v_id,'title',btrim(p_title),'due_at',p_due_at,'assigned_admin_id',p_assigned_admin_id));
 UPDATE public.sales_leads SET next_action_at=(SELECT min(due_at) FROM public.sales_lead_tasks WHERE lead_id=p_lead_id AND status='ceka') WHERE id=p_lead_id;
 RETURN jsonb_build_object('success',true,'task_id',v_id);
EXCEPTION WHEN foreign_key_violation THEN RETURN jsonb_build_object('success',false,'error','lead_not_found');
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_task_set_status(p_task_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_task public.sales_lead_tasks%rowtype;
BEGIN
 IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN RETURN jsonb_build_object('success',false,'error','access_denied'); END IF;
 IF p_status NOT IN ('dokonceno','zruseno') THEN RETURN jsonb_build_object('success',false,'error','invalid_status'); END IF;
 SELECT * INTO v_task FROM public.sales_lead_tasks WHERE id=p_task_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','task_not_found'); END IF;
 IF v_task.status<>'ceka' THEN RETURN jsonb_build_object('success',true,'unchanged',true); END IF;
 UPDATE public.sales_lead_tasks SET status=p_status,completed_by=v_caller,completed_at=now(),updated_at=now() WHERE id=p_task_id;
 INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata) VALUES(v_task.lead_id,CASE p_status WHEN 'dokonceno' THEN 'task_completed' ELSE 'task_cancelled' END,'internal',v_caller,jsonb_build_object('task_id',p_task_id,'title',v_task.title));
 UPDATE public.sales_leads SET next_action_at=(SELECT min(due_at) FROM public.sales_lead_tasks WHERE lead_id=v_task.lead_id AND status='ceka') WHERE id=v_task.lead_id;
 RETURN jsonb_build_object('success',true);
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_overview(p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_from timestamptz:=coalesce(p_from,'-infinity'); v_to timestamptz:=coalesce(p_to,'infinity');
BEGIN
 IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN RETURN jsonb_build_object('success',false,'error','access_denied'); END IF;
 RETURN jsonb_build_object('success',true,
  'statuses',(SELECT coalesce(jsonb_object_agg(status,cnt),'{}') FROM (SELECT status,count(*) cnt FROM public.sales_leads WHERE created_at>=v_from AND created_at<v_to GROUP BY status)s),
  'contacted',(SELECT count(DISTINCT lead_id) FROM public.sales_lead_activities WHERE activity_type='email_sent' AND created_at>=v_from AND created_at<v_to),
  'replied',(SELECT count(DISTINCT lead_id) FROM public.sales_lead_activities WHERE activity_type='reply_received' AND created_at>=v_from AND created_at<v_to),
  'converted',(SELECT count(DISTINCT lead_id) FROM public.sales_lead_status_history WHERE new_status='konvertovan' AND created_at>=v_from AND created_at<v_to),
  'by_admin',(SELECT coalesce(jsonb_agg(x),'[]') FROM (SELECT assigned_admin_id,count(*) total,count(*) FILTER(WHERE status='konvertovan') converted FROM public.sales_leads WHERE created_at>=v_from AND created_at<v_to GROUP BY assigned_admin_id)x));
END $$;

REVOKE ALL ON public.sales_lead_tasks FROM PUBLIC,anon;
GRANT SELECT ON public.sales_lead_tasks TO authenticated;
REVOKE EXECUTE ON FUNCTION public.sales_lead_log_activity(uuid,text,timestamptz,text,text,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_lead_task_create(uuid,text,timestamptz,uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_lead_task_set_status(uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_lead_overview(timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_log_activity(uuid,text,timestamptz,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_task_create(uuid,text,timestamptz,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_task_set_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_overview(timestamptz,timestamptz) TO authenticated;

COMMIT;
