-- Migration proposal: admin_record_affiliate_commission_for_payment RPC
-- Purpose:
--   Add a safe admin-only manual RPC for recording an affiliate commission from
--   a paid MioCoin top-up payment.
--
-- Scope:
--   - Adds RPC only.
--   - Does NOT create a payments trigger.
--   - Does NOT modify Stripe webhook.
--   - Does NOT modify payments flow.
--   - Does NOT modify wallet logic.
--   - Does NOT connect automatic commission creation.
--   - Uses explicit p_paid_amount_czk because payments.amount stores MioCoins,
--     not necessarily the paid CZK amount.

CREATE OR REPLACE FUNCTION public.admin_record_affiliate_commission_for_payment(
  p_payment_id uuid,
  p_paid_amount_czk numeric,
  p_paid_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT 'Affiliate commission recorded from paid MioCoin top-up',
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
  v_payment record;
  v_paid_at timestamptz;
  v_attribution record;
  v_rate record;
  v_commission_amount_czk numeric(12, 2);
  v_commission_event_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'P0001';
  END IF;

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'payment_id_required' USING ERRCODE = 'P0001';
  END IF;

  IF p_paid_amount_czk IS NULL OR p_paid_amount_czk <= 0 THEN
    RAISE EXCEPTION 'paid_amount_czk_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata_must_be_object' USING ERRCODE = 'P0001';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    p.id,
    p.user_id,
    p.amount,
    p.method,
    p.status,
    p.stripe_session_id,
    p.created_at
  INTO v_payment
  FROM public.payments p
  WHERE p.id = p_payment_id
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION 'payment_not_completed' USING ERRCODE = 'P0001';
  END IF;

  IF lower(coalesce(v_payment.method, '')) <> 'stripe' THEN
    RAISE EXCEPTION 'payment_method_not_eligible' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.affiliate_commission_events ace
    WHERE ace.payment_id = p_payment_id
  ) THEN
    RAISE EXCEPTION 'affiliate_commission_event_already_exists' USING ERRCODE = 'P0001';
  END IF;

  v_paid_at := coalesce(p_paid_at, v_payment.created_at);

  IF v_paid_at IS NULL THEN
    RAISE EXCEPTION 'paid_at_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    uaa.id AS attribution_id,
    uaa.user_id,
    uaa.affiliate_partner_id,
    uaa.affiliate_code_id,
    uaa.source,
    uaa.attributed_at,
    uaa.locked,
    ap.status AS affiliate_partner_status
  INTO v_attribution
  FROM public.user_affiliate_attributions uaa
  JOIN public.affiliate_partners ap ON ap.id = uaa.affiliate_partner_id
  WHERE uaa.user_id = v_payment.user_id
  LIMIT 1;

  IF v_attribution.attribution_id IS NULL THEN
    RAISE EXCEPTION 'affiliate_attribution_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_attribution.locked THEN
    RAISE EXCEPTION 'affiliate_attribution_not_locked' USING ERRCODE = 'P0001';
  END IF;

  IF v_attribution.attributed_at > v_paid_at THEN
    RAISE EXCEPTION 'affiliate_attribution_after_payment' USING ERRCODE = 'P0001';
  END IF;

  IF v_attribution.affiliate_partner_status <> 'active' THEN
    RAISE EXCEPTION 'affiliate_partner_not_active' USING ERRCODE = 'P0001';
  END IF;

  SELECT
    r.id AS rate_history_id,
    r.commission_rate,
    r.valid_from,
    r.valid_to
  INTO v_rate
  FROM public.affiliate_commission_rate_history r
  WHERE r.affiliate_partner_id = v_attribution.affiliate_partner_id
    AND r.valid_from <= v_paid_at
    AND (r.valid_to IS NULL OR r.valid_to > v_paid_at)
  ORDER BY r.valid_from DESC
  LIMIT 1;

  IF v_rate.rate_history_id IS NULL THEN
    RAISE EXCEPTION 'commission_rate_not_found_for_payment_time' USING ERRCODE = 'P0001';
  END IF;

  v_commission_amount_czk := round((p_paid_amount_czk * v_rate.commission_rate)::numeric, 2);

  BEGIN
    INSERT INTO public.affiliate_commission_events (
      affiliate_partner_id,
      user_id,
      payment_id,
      payment_amount_snapshot,
      payment_amount_source,
      commission_rate_snapshot,
      commission_amount_czk,
      status,
      calculated_at,
      metadata
    )
    VALUES (
      v_attribution.affiliate_partner_id,
      v_payment.user_id,
      p_payment_id,
      p_paid_amount_czk,
      'admin_rpc.p_paid_amount_czk',
      v_rate.commission_rate,
      v_commission_amount_czk,
      'calculated',
      now(),
      jsonb_build_object(
        'rpc', 'admin_record_affiliate_commission_for_payment',
        'payment_method', v_payment.method,
        'payment_status', v_payment.status,
        'payment_created_at', v_payment.created_at,
        'paid_at_used_for_rate', v_paid_at,
        'stripe_session_id', v_payment.stripe_session_id,
        'payments_amount_miocoins_snapshot', v_payment.amount,
        'attribution_id', v_attribution.attribution_id,
        'affiliate_code_id', v_attribution.affiliate_code_id,
        'attribution_source', v_attribution.source,
        'rate_history_id', v_rate.rate_history_id,
        'rate_valid_from', v_rate.valid_from,
        'rate_valid_to', v_rate.valid_to,
        'client_metadata', v_metadata
      )
    )
    RETURNING id INTO v_commission_event_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'affiliate_commission_event_already_exists' USING ERRCODE = 'P0001';
  END;

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
    'affiliate_commission_event_recorded',
    'affiliate_commission_events',
    v_commission_event_id,
    NULL,
    jsonb_build_object(
      'affiliate_partner_id', v_attribution.affiliate_partner_id,
      'user_id', v_payment.user_id,
      'payment_id', p_payment_id,
      'paid_amount_czk', p_paid_amount_czk,
      'payment_amount_source', 'admin_rpc.p_paid_amount_czk',
      'payments_amount_miocoins_snapshot', v_payment.amount,
      'commission_rate_snapshot', v_rate.commission_rate,
      'commission_amount_czk', v_commission_amount_czk,
      'status', 'calculated',
      'attribution_id', v_attribution.attribution_id,
      'rate_history_id', v_rate.rate_history_id
    ),
    v_reason,
    jsonb_build_object(
      'rpc', 'admin_record_affiliate_commission_for_payment',
      'payment_method', v_payment.method,
      'payment_status', v_payment.status,
      'stripe_session_id', v_payment.stripe_session_id,
      'paid_at_used_for_rate', v_paid_at,
      'client_metadata', v_metadata
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'affiliate_commission_event_id', v_commission_event_id,
    'affiliate_partner_id', v_attribution.affiliate_partner_id,
    'user_id', v_payment.user_id,
    'payment_id', p_payment_id,
    'paid_amount_czk', p_paid_amount_czk,
    'payment_amount_source', 'admin_rpc.p_paid_amount_czk',
    'payments_amount_miocoins_snapshot', v_payment.amount,
    'commission_rate_snapshot', v_rate.commission_rate,
    'commission_amount_czk', v_commission_amount_czk,
    'status', 'calculated',
    'paid_at_used_for_rate', v_paid_at,
    'rate_history_id', v_rate.rate_history_id,
    'attribution_id', v_attribution.attribution_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_affiliate_commission_for_payment(
  uuid, numeric, timestamptz, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_record_affiliate_commission_for_payment(
  uuid, numeric, timestamptz, text, jsonb
) TO authenticated;
