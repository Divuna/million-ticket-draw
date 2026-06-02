-- Migration proposal: admin_set_affiliate_commission_rate RPC
-- Purpose:
--   Add admin-only SECURITY DEFINER RPC to change an affiliate partner's
--   individual commission rate by closing the current open interval and
--   opening a new interval in affiliate_commission_rate_history.
--
-- Scope:
--   - Adds RPC only.
--   - Does NOT calculate commissions.
--   - Does NOT modify attribution, registration, partner/register, payments,
--     wallet, Partner Offers, customer referrals, B2B partner program,
--     or existing influencer system.

CREATE OR REPLACE FUNCTION public.admin_set_affiliate_commission_rate(
  p_affiliate_partner_id uuid,
  p_commission_rate numeric,
  p_valid_from timestamptz DEFAULT clock_timestamp(),
  p_reason text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reason text := trim(coalesce(p_reason, ''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_partner_status text;
  v_old_rate_id uuid;
  v_old_commission_rate numeric;
  v_old_valid_from timestamptz;
  v_new_rate_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'P0001';
  END IF;

  IF p_affiliate_partner_id IS NULL THEN
    RAISE EXCEPTION 'affiliate_partner_id_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_commission_rate IS NULL THEN
    RAISE EXCEPTION 'commission_rate_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_commission_rate < 0 OR p_commission_rate > 1 THEN
    RAISE EXCEPTION 'commission_rate_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF p_valid_from IS NULL THEN
    RAISE EXCEPTION 'valid_from_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_valid_from < clock_timestamp() - interval '5 minutes' THEN
    RAISE EXCEPTION 'commission_rate_valid_from_in_past' USING ERRCODE = 'P0001';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata_must_be_object' USING ERRCODE = 'P0001';
  END IF;

  SELECT status
  INTO v_partner_status
  FROM public.affiliate_partners
  WHERE id = p_affiliate_partner_id
  FOR UPDATE;

  IF v_partner_status IS NULL THEN
    RAISE EXCEPTION 'affiliate_partner_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_partner_status NOT IN ('pending', 'active', 'paused') THEN
    RAISE EXCEPTION 'affiliate_partner_status_invalid_for_rate_change' USING ERRCODE = 'P0001';
  END IF;

  SELECT id, commission_rate, valid_from
  INTO v_old_rate_id, v_old_commission_rate, v_old_valid_from
  FROM public.affiliate_commission_rate_history
  WHERE affiliate_partner_id = p_affiliate_partner_id
    AND valid_to IS NULL
  ORDER BY valid_from DESC
  LIMIT 1
  FOR UPDATE;

  IF v_old_rate_id IS NULL THEN
    RAISE EXCEPTION 'open_commission_rate_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF p_valid_from <= v_old_valid_from THEN
    RAISE EXCEPTION 'commission_rate_valid_from_overlaps_past' USING ERRCODE = 'P0001';
  END IF;

  IF v_old_commission_rate = p_commission_rate THEN
    RAISE EXCEPTION 'commission_rate_unchanged' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.affiliate_commission_rate_history
    WHERE affiliate_partner_id = p_affiliate_partner_id
      AND id <> v_old_rate_id
      AND tstzrange(valid_from, valid_to, '[)') &&
          tstzrange(p_valid_from, NULL, '[)')
  ) THEN
    RAISE EXCEPTION 'commission_rate_valid_from_overlaps_past' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.affiliate_commission_rate_history
  SET valid_to = p_valid_from
  WHERE id = v_old_rate_id;

  INSERT INTO public.affiliate_commission_rate_history (
    affiliate_partner_id,
    commission_rate,
    valid_from,
    valid_to,
    created_by,
    reason
  )
  VALUES (
    p_affiliate_partner_id,
    p_commission_rate,
    p_valid_from,
    NULL,
    v_actor,
    v_reason
  )
  RETURNING id INTO v_new_rate_id;

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
    'affiliate_commission_rate_changed',
    'affiliate_commission_rate_history',
    v_new_rate_id,
    jsonb_build_object(
      'rate_history_id', v_old_rate_id,
      'commission_rate', v_old_commission_rate,
      'valid_from', v_old_valid_from,
      'valid_to', p_valid_from
    ),
    jsonb_build_object(
      'rate_history_id', v_new_rate_id,
      'commission_rate', p_commission_rate,
      'valid_from', p_valid_from,
      'valid_to', NULL
    ),
    v_reason,
    v_metadata || jsonb_build_object(
      'rpc', 'admin_set_affiliate_commission_rate',
      'affiliate_partner_id', p_affiliate_partner_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'affiliate_partner_id', p_affiliate_partner_id,
    'old_rate_history_id', v_old_rate_id,
    'new_rate_history_id', v_new_rate_id,
    'old_commission_rate', v_old_commission_rate,
    'new_commission_rate', p_commission_rate,
    'valid_from', p_valid_from
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_affiliate_commission_rate(
  uuid, numeric, timestamptz, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_set_affiliate_commission_rate(
  uuid, numeric, timestamptz, text, jsonb
) TO authenticated;
