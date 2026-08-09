-- Allow admins to prepare a batch safely even while the global automation is on.
-- The safe admin entry point always leaves the newly created batch PAUSED before
-- the transaction commits. A paused batch is invisible to the worker until the
-- admin explicitly activates it with sales_lead_email_batch_activate_admin().

BEGIN;

CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_prepare_paused(
  p_lead_ids uuid[],
  p_template_id uuid,
  p_scheduled_date date,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_result jsonb;
  v_batch_id uuid;
  v_batch_status text;
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage', v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  -- Serialize with the automation switch. The wrapped create call takes the same
  -- row lock. If automation is currently enabled it may internally create the
  -- row as scheduled, but that row is uncommitted and therefore cannot be seen
  -- by the worker. Before this transaction commits we force the batch to paused.
  SELECT * INTO v_settings
  FROM public.sales_lead_email_automation_settings
  WHERE singleton
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'automation_settings_missing');
  END IF;

  BEGIN
    v_result := public.sales_lead_email_batch_create(
      p_lead_ids,
      p_template_id,
      p_scheduled_date,
      p_idempotency_key
    );

    IF coalesce((v_result->>'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'sales_lead_email_batch_prepare_paused_rejected';
    END IF;

    v_batch_id := nullif(v_result->>'batch_id', '')::uuid;
    v_batch_status := v_result->>'batch_status';

    IF v_batch_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'sales_lead_email_batch_prepare_paused_missing_batch';
    END IF;

    -- A replay is valid only when the previously prepared batch is already paused.
    IF coalesce((v_result->>'idempotent_replay')::boolean, false) THEN
      IF v_batch_status IS DISTINCT FROM 'paused' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'sales_lead_email_batch_prepare_paused_replay_not_paused';
      END IF;
    ELSE
      IF v_batch_status NOT IN ('paused', 'scheduled') THEN
        RAISE EXCEPTION USING
          ERRCODE = '23514',
          MESSAGE = 'sales_lead_email_batch_prepare_paused_unexpected_state';
      END IF;

      IF v_batch_status = 'scheduled' THEN
        UPDATE public.sales_lead_email_batches
        SET status = 'paused', updated_at = clock_timestamp()
        WHERE id = v_batch_id AND status = 'scheduled';

        IF NOT FOUND THEN
          RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'sales_lead_email_batch_prepare_paused_update_failed';
        END IF;
      END IF;
    END IF;

    v_result := v_result || jsonb_build_object(
      'batch_status', 'paused',
      'automation_enabled', v_settings.enabled
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Writes performed by sales_lead_email_batch_create are rolled back with
      -- this subtransaction on any unexpected state.
      IF v_result IS NOT NULL
         AND coalesce((v_result->>'success')::boolean, false) IS NOT TRUE
         AND nullif(v_result->>'error', '') IS NOT NULL THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', v_result->>'error',
          'ineligible', coalesce(v_result->'ineligible', '[]'::jsonb)
        );
      END IF;
      RETURN jsonb_build_object('success', false, 'error', 'unexpected_batch_state');
  END;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_prepare_paused(uuid[],uuid,date,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_prepare_paused(uuid[],uuid,date,text)
  TO authenticated;

-- The administration UI has used the safe wrapper since PR #314. Remove the
-- legacy direct authenticated entry point so a client cannot bypass the
-- always-paused preparation invariant while automation is enabled.
REVOKE EXECUTE ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_create(uuid[],uuid,date,text)
  TO service_role;

COMMENT ON FUNCTION public.sales_lead_email_batch_prepare_paused(uuid[],uuid,date,text) IS
  'Admin-safe batch preparation. Works with automation on or off but always commits the prepared batch as paused; explicit activation is required before the worker can send it.';

COMMIT;
