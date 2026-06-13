-- Fix Partner API v1 reward code generation under a locked search_path.

CREATE OR REPLACE FUNCTION public.partner_api_v1_create_order_reward(
  p_partner_id uuid,
  p_order_id text,
  p_order_total_czk numeric,
  p_customer_email citext,
  p_base_url text DEFAULT 'https://onemil.cz'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner public.partners%rowtype;
  v_order_id text := btrim(coalesce(p_order_id, ''));
  v_existing public.partner_api_v1_order_rewards%rowtype;
  v_code text;
  v_reward_coins integer;
  v_raw_reward numeric;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_partner_id');
  END IF;

  IF v_order_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_order_id');
  END IF;

  IF p_order_total_czk IS NULL OR p_order_total_czk <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_order_total_czk');
  END IF;

  IF p_customer_email IS NULL OR btrim(p_customer_email::text) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_customer_email');
  END IF;

  SELECT *
  INTO v_partner
  FROM public.partners
  WHERE id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'partner_not_found');
  END IF;

  IF v_partner.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'partner_not_approved');
  END IF;

  SELECT *
  INTO v_existing
  FROM public.partner_api_v1_order_rewards
  WHERE partner_id = p_partner_id
    AND order_id = v_order_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'partner_id', v_existing.partner_id,
      'order_id', v_existing.order_id,
      'external_order_id', v_existing.order_id,
      'reward_code', v_existing.reward_code,
      'reward_link', public.partner_api_v1_reward_link(v_existing.reward_code, p_base_url),
      'reward_status', v_existing.reward_status,
      'order_status', v_existing.order_status,
      'coins', v_existing.reward_coins,
      'order_total_czk', v_existing.order_total_czk,
      'customer_email', v_existing.customer_email,
      'conversion', jsonb_build_object(
        'base_czk', v_existing.conversion_base_czk,
        'reward_mc', v_existing.conversion_reward_mc,
        'rounding', 'floor'
      )
    );
  END IF;

  IF v_partner.reward_base_czk IS NULL OR v_partner.reward_base_czk <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_partner_conversion_base');
  END IF;

  IF v_partner.reward_mc IS NULL OR v_partner.reward_mc <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_partner_conversion_reward');
  END IF;

  v_raw_reward := (p_order_total_czk / v_partner.reward_base_czk) * v_partner.reward_mc;
  v_reward_coins := floor(v_raw_reward)::integer;

  IF v_reward_coins <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_zero');
  END IF;

  v_code := upper(translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'XYZ'));
  WHILE EXISTS (SELECT 1 FROM public.partner_reward_codes WHERE code = v_code) LOOP
    v_code := upper(translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'XYZ'));
  END LOOP;

  INSERT INTO public.partner_reward_codes (
    code,
    partner_id,
    coins,
    external_order_id,
    customer_email,
    issued_to_email,
    status,
    metadata
  ) VALUES (
    v_code,
    p_partner_id,
    v_reward_coins,
    v_order_id,
    p_customer_email,
    p_customer_email,
    'pending'::public.partner_code_status,
    jsonb_build_object(
      'api_version', 'v1',
      'order_total_czk', p_order_total_czk,
      'conversion_base_czk', v_partner.reward_base_czk,
      'conversion_reward_mc', v_partner.reward_mc,
      'rounding', 'floor'
    )
  );

  INSERT INTO public.partner_api_v1_order_rewards (
    partner_id,
    order_id,
    reward_code,
    order_total_czk,
    customer_email,
    reward_coins,
    conversion_base_czk,
    conversion_reward_mc,
    reward_status,
    metadata
  ) VALUES (
    p_partner_id,
    v_order_id,
    v_code,
    p_order_total_czk,
    p_customer_email,
    v_reward_coins,
    v_partner.reward_base_czk,
    v_partner.reward_mc,
    'pending',
    jsonb_build_object('api_version', 'v1')
  )
  RETURNING * INTO v_existing;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'partner_id', v_existing.partner_id,
    'order_id', v_existing.order_id,
    'external_order_id', v_existing.order_id,
    'reward_code', v_existing.reward_code,
    'reward_link', public.partner_api_v1_reward_link(v_existing.reward_code, p_base_url),
    'reward_status', v_existing.reward_status,
    'order_status', v_existing.order_status,
    'coins', v_existing.reward_coins,
    'order_total_czk', v_existing.order_total_czk,
    'customer_email', v_existing.customer_email,
    'conversion', jsonb_build_object(
      'base_czk', v_existing.conversion_base_czk,
      'reward_mc', v_existing.conversion_reward_mc,
      'rounding', 'floor'
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_api_v1_create_order_reward(uuid, text, numeric, citext, text) TO service_role;
