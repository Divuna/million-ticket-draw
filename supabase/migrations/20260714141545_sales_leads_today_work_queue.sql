BEGIN;

-- Rozšiřujeme existující CRM úkoly a plánované aktivity. Nevzniká třetí
-- paralelní tabulka práce; záložka Dnes čte tyto dva zdroje.
ALTER TABLE public.sales_lead_tasks
  ADD COLUMN IF NOT EXISTS task_type text NOT NULL DEFAULT 'ukol';

ALTER TABLE public.sales_lead_tasks
  DROP CONSTRAINT IF EXISTS sales_lead_tasks_task_type_check;
ALTER TABLE public.sales_lead_tasks
  ADD CONSTRAINT sales_lead_tasks_task_type_check
  CHECK (task_type IN ('ukol', 'follow_up'));

ALTER TABLE public.sales_lead_tasks
  DROP CONSTRAINT IF EXISTS sales_lead_tasks_status_check;
ALTER TABLE public.sales_lead_tasks
  ADD CONSTRAINT sales_lead_tasks_status_check
  CHECK (status IN ('ceka', 'rozpracovano', 'dokonceno', 'zruseno'));

ALTER TABLE public.sales_lead_tasks
  DROP CONSTRAINT IF EXISTS sales_lead_tasks_completion_check;
ALTER TABLE public.sales_lead_tasks
  ADD CONSTRAINT sales_lead_tasks_completion_check CHECK (
    (status IN ('ceka', 'rozpracovano') AND completed_at IS NULL AND completed_by IS NULL) OR
    (status IN ('dokonceno', 'zruseno') AND completed_at IS NOT NULL)
  );

DROP INDEX IF EXISTS public.idx_sales_lead_tasks_open_due;
CREATE INDEX idx_sales_lead_tasks_open_due
  ON public.sales_lead_tasks(due_at)
  WHERE status IN ('ceka', 'rozpracovano');

ALTER TABLE public.sales_lead_activities
  DROP CONSTRAINT IF EXISTS sales_lead_activities_status_check;
ALTER TABLE public.sales_lead_activities
  ADD CONSTRAINT sales_lead_activities_status_check
  CHECK (activity_status IN ('naplanovano', 'rozpracovano', 'dokonceno', 'zruseno'));

ALTER TABLE public.sales_lead_activities
  DROP CONSTRAINT IF EXISTS sales_lead_activities_type_check;
ALTER TABLE public.sales_lead_activities
  ADD CONSTRAINT sales_lead_activities_type_check CHECK (activity_type IN (
    'lead_created','field_updated','ai_research','draft_created','draft_edited','draft_approved',
    'email_sent','email_failed','email_delivered','email_delivery_delayed','email_bounced','email_suppressed',
    'reply_received','call_logged','meeting_logged','note_added','status_changed','do_not_contact_set',
    'converted','lead_discovered','contact_proposed','contact_approved','contact_rejected',
    'duplicate_override_confirmed','task_created','task_started','task_reopened','task_rescheduled',
    'task_completed','task_cancelled'
  ));

DROP FUNCTION IF EXISTS public.sales_lead_task_create(uuid,text,timestamptz,uuid,text);
CREATE FUNCTION public.sales_lead_task_create(
  p_lead_id uuid,
  p_title text,
  p_due_at timestamptz,
  p_assigned_admin_id uuid,
  p_note text DEFAULT NULL,
  p_task_type text DEFAULT 'ukol'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied');
  END IF;
  IF p_due_at IS NULL
     OR length(btrim(coalesce(p_title,''))) NOT BETWEEN 1 AND 200
     OR p_task_type NOT IN ('ukol','follow_up')
     OR NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=p_assigned_admin_id AND role IN ('admin','superadmin')) THEN
    RETURN jsonb_build_object('success',false,'error','invalid_input');
  END IF;
  INSERT INTO public.sales_lead_tasks(lead_id,title,due_at,assigned_admin_id,note,task_type,created_by)
  VALUES(p_lead_id,btrim(p_title),p_due_at,p_assigned_admin_id,NULLIF(btrim(coalesce(p_note,'')),''),p_task_type,v_caller)
  RETURNING id INTO v_id;
  INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
  VALUES(p_lead_id,'task_created','internal',v_caller,jsonb_build_object(
    'task_id',v_id,'title',btrim(p_title),'due_at',p_due_at,
    'assigned_admin_id',p_assigned_admin_id,'task_type',p_task_type
  ));
  UPDATE public.sales_leads SET next_action_at=(
    SELECT min(due_at) FROM public.sales_lead_tasks
    WHERE lead_id=p_lead_id AND status IN ('ceka','rozpracovano')
  ) WHERE id=p_lead_id;
  RETURN jsonb_build_object('success',true,'task_id',v_id);
EXCEPTION WHEN foreign_key_violation THEN
  RETURN jsonb_build_object('success',false,'error','lead_not_found');
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_task_set_status(p_task_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_task public.sales_lead_tasks%rowtype; v_activity_type text;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied');
  END IF;
  IF p_status NOT IN ('ceka','rozpracovano','dokonceno','zruseno') THEN
    RETURN jsonb_build_object('success',false,'error','invalid_status');
  END IF;
  SELECT * INTO v_task FROM public.sales_lead_tasks WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','task_not_found'); END IF;
  IF v_task.status=p_status THEN RETURN jsonb_build_object('success',true,'unchanged',true); END IF;
  IF v_task.status IN ('dokonceno','zruseno') THEN
    RETURN jsonb_build_object('success',false,'error','task_closed');
  END IF;

  UPDATE public.sales_lead_tasks SET
    status=p_status,
    completed_by=CASE WHEN p_status IN ('dokonceno','zruseno') THEN v_caller ELSE NULL END,
    completed_at=CASE WHEN p_status IN ('dokonceno','zruseno') THEN now() ELSE NULL END,
    updated_at=now()
  WHERE id=p_task_id;

  v_activity_type:=CASE p_status
    WHEN 'ceka' THEN 'task_reopened'
    WHEN 'rozpracovano' THEN 'task_started'
    WHEN 'dokonceno' THEN 'task_completed'
    ELSE 'task_cancelled'
  END;
  INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
  VALUES(v_task.lead_id,v_activity_type,'internal',v_caller,jsonb_build_object(
    'task_id',p_task_id,'title',v_task.title,'previous_status',v_task.status,'new_status',p_status
  ));
  UPDATE public.sales_leads SET next_action_at=(
    SELECT min(due_at) FROM public.sales_lead_tasks
    WHERE lead_id=v_task.lead_id AND status IN ('ceka','rozpracovano')
  ) WHERE id=v_task.lead_id;
  RETURN jsonb_build_object('success',true,'lead_id',v_task.lead_id);
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_task_reschedule(p_task_id uuid,p_due_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_task public.sales_lead_tasks%rowtype;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied');
  END IF;
  IF p_due_at IS NULL OR p_due_at <= now() THEN
    RETURN jsonb_build_object('success',false,'error','invalid_due_at');
  END IF;
  SELECT * INTO v_task FROM public.sales_lead_tasks WHERE id=p_task_id FOR UPDATE;
  IF NOT FOUND OR v_task.status NOT IN ('ceka','rozpracovano') THEN
    RETURN jsonb_build_object('success',false,'error','task_not_open');
  END IF;
  UPDATE public.sales_lead_tasks SET due_at=p_due_at,updated_at=now() WHERE id=p_task_id;
  INSERT INTO public.sales_lead_activities(lead_id,activity_type,direction,performed_by,metadata)
  VALUES(v_task.lead_id,'task_rescheduled','internal',v_caller,jsonb_build_object(
    'task_id',p_task_id,'title',v_task.title,'previous_due_at',v_task.due_at,'due_at',p_due_at
  ));
  UPDATE public.sales_leads SET next_action_at=(
    SELECT min(due_at) FROM public.sales_lead_tasks
    WHERE lead_id=v_task.lead_id AND status IN ('ceka','rozpracovano')
  ) WHERE id=v_task.lead_id;
  RETURN jsonb_build_object('success',true,'lead_id',v_task.lead_id);
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_scheduled_activity_update(
  p_activity_id uuid, p_scheduled_for timestamptz, p_result text,
  p_next_step text DEFAULT NULL, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_lead_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied');
  END IF;
  IF p_scheduled_for IS NULL OR p_scheduled_for <= now() OR length(btrim(coalesce(p_result,'')))<1 THEN
    RETURN jsonb_build_object('success',false,'error','invalid_input');
  END IF;
  UPDATE public.sales_lead_activities
  SET scheduled_for=p_scheduled_for,
      body_snapshot=NULLIF(btrim(coalesce(p_note,'')),''),
      metadata=jsonb_build_object('result',btrim(p_result),'next_step',NULLIF(btrim(coalesce(p_next_step,'')),''))
  WHERE id=p_activity_id
    AND activity_type IN ('call_logged','meeting_logged','note_added')
    AND activity_status IN ('naplanovano','rozpracovano')
  RETURNING lead_id INTO v_lead_id;
  IF v_lead_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','activity_not_found'); END IF;
  RETURN jsonb_build_object('success',true,'lead_id',v_lead_id);
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_scheduled_activity_set_status(p_activity_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_activity public.sales_lead_activities%rowtype;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied');
  END IF;
  IF p_status NOT IN ('naplanovano','rozpracovano','dokonceno','zruseno') THEN
    RETURN jsonb_build_object('success',false,'error','invalid_status');
  END IF;
  SELECT * INTO v_activity FROM public.sales_lead_activities WHERE id=p_activity_id FOR UPDATE;
  IF NOT FOUND OR v_activity.activity_type NOT IN ('call_logged','meeting_logged','note_added') THEN
    RETURN jsonb_build_object('success',false,'error','activity_not_found');
  END IF;
  IF v_activity.activity_status=p_status THEN RETURN jsonb_build_object('success',true,'unchanged',true); END IF;
  IF v_activity.activity_status IN ('dokonceno','zruseno') THEN
    RETURN jsonb_build_object('success',false,'error','activity_closed');
  END IF;
  UPDATE public.sales_lead_activities SET
    activity_status=p_status,
    completed_at=CASE WHEN p_status='dokonceno' THEN now() ELSE NULL END,
    completed_by=CASE WHEN p_status='dokonceno' THEN v_caller ELSE NULL END,
    cancelled_at=CASE WHEN p_status='zruseno' THEN now() ELSE NULL END,
    cancelled_by=CASE WHEN p_status='zruseno' THEN v_caller ELSE NULL END
  WHERE id=p_activity_id;
  RETURN jsonb_build_object('success',true,'lead_id',v_activity.lead_id);
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_scheduled_activity_reschedule(p_activity_id uuid,p_scheduled_for timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_caller uuid:=auth.uid(); v_lead_id uuid;
BEGIN
  IF v_caller IS NULL OR NOT (public.has_admin_permission('sales_leads.manage',v_caller) OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success',false,'error','access_denied');
  END IF;
  IF p_scheduled_for IS NULL OR p_scheduled_for <= now() THEN
    RETURN jsonb_build_object('success',false,'error','invalid_scheduled_for');
  END IF;
  UPDATE public.sales_lead_activities SET scheduled_for=p_scheduled_for
  WHERE id=p_activity_id
    AND activity_type IN ('call_logged','meeting_logged','note_added')
    AND activity_status IN ('naplanovano','rozpracovano')
  RETURNING lead_id INTO v_lead_id;
  IF v_lead_id IS NULL THEN RETURN jsonb_build_object('success',false,'error','activity_not_open'); END IF;
  RETURN jsonb_build_object('success',true,'lead_id',v_lead_id);
END $$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_task_create(uuid,text,timestamptz,uuid,text,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_lead_task_set_status(uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_lead_task_reschedule(uuid,timestamptz) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_update(uuid,timestamptz,text,text,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_set_status(uuid,text) FROM PUBLIC,anon;
REVOKE EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_reschedule(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_task_create(uuid,text,timestamptz,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_task_set_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_task_reschedule(uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_update(uuid,timestamptz,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_set_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_scheduled_activity_reschedule(uuid,timestamptz) TO authenticated;

COMMIT;
