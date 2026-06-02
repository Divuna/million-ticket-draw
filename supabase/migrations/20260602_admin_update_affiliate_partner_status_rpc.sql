-- Migration proposal: admin_update_affiliate_partner_status RPC
-- Purpose:
--   Add admin-only SECURITY DEFINER RPC to update affiliate partner status
--   with audit logging.
--
-- Scope:
--   - Adds RPC only.
--   - Does NOT change commission rates.
--   - Does NOT change affiliate codes.
--   - Does NOT connect registration, partner/register, payments, wallet,
--     commission calculations, customer referrals, B2B partner program,
--     or existing influencer system.

CREATE OR REPLACE FUNCTION public.admin_update_affiliate_partner_status(
  p_affiliate_partner_id uuid,
  p_new_status text,
  p_reason text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_new_status text := lower(trim(coalesce(p_new_status, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_old_status text;
  v_old_contract_ends_at timestamptz;
  v_new_contract_ends_at timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'P0001';
  END IF;

  IF p_affiliate_partner_id IS NULL THEN
    RAISE EXCEPTION 'affiliate_partner_id_required' USING ERRCODE = 'P0001';
  END IF;

  IF v_new_status = '' THEN
    RAISE EXCEPTION 'new_status_required' USING ERRCODE = 'P0001';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata_must_be_object' USING ERRCODE = 'P0001';
  END IF;

  IF v_new_status NOT IN ('pending', 'active', 'paused', 'terminated', 'rejected') THEN
    RAISE EXCEPTION 'affiliate_status_invalid' USING ERRCODE = 'P0001';
  END IF;

  SELECT status, contract_ends_at
  INTO v_old_status, v_old_contract_ends_at
  FROM public.affiliate_partners
  WHERE id = p_affiliate_partner_id
  FOR UPDATE;

  IF v_old_status IS NULL THEN
    RAISE EXCEPTION 'affiliate_partner_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_old_status = v_new_status THEN
    RAISE EXCEPTION 'affiliate_status_unchanged' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    (v_old_status = 'pending' AND v_new_status IN ('active', 'rejected', 'terminated')) OR
    (v_old_status = 'active' AND v_new_status IN ('paused', 'terminated')) OR
    (v_old_status = 'paused' AND v_new_status IN ('active', 'terminated'))
  ) THEN
    RAISE EXCEPTION 'affiliate_status_transition_not_allowed' USING ERRCODE = 'P0001';
  END IF;

  v_new_contract_ends_at := CASE
    WHEN v_new_status = 'terminated' THEN now()
    ELSE v_old_contract_ends_at
  END;

  UPDATE public.affiliate_partners
  SET status = v_new_status,
      contract_ends_at = v_new_contract_ends_at,
      updated_at = now()
  WHERE id = p_affiliate_partner_id;

  INSERT INTO public.affiliate_audit_logs (
    actor_user_id,
    action,
    entity_table,
    entity_id,
    old_data,
    new_data,
    reason,
    metadata
  )
  VALUES (
    v_actor,
    'affiliate_partner_status_updated',
    'affiliate_partners',
    p_affiliate_partner_id,
    jsonb_build_object(
      'status', v_old_status,
      'contract_ends_at', v_old_contract_ends_at
    ),
    jsonb_build_object(
      'status', v_new_status,
      'contract_ends_at', v_new_contract_ends_at
    ),
    v_reason,
    v_metadata || jsonb_build_object(
      'rpc', 'admin_update_affiliate_partner_status'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'affiliate_partner_id', p_affiliate_partner_id,
    'old_status', v_old_status,
    'new_status', v_new_status,
    'old_contract_ends_at', v_old_contract_ends_at,
    'new_contract_ends_at', v_new_contract_ends_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_affiliate_partner_status(
  uuid, text, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_update_affiliate_partner_status(
  uuid, text, text, jsonb
) TO authenticated;
