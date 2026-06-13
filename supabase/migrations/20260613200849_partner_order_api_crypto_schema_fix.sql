-- Staging already recorded the base Partner API order migration before the
-- pgcrypto schema qualification fix. Recreate only the affected RPC.

CREATE OR REPLACE FUNCTION public.create_partner_order_reward(
  p_partner_id uuid,
  p_external_order_id text,
  p_order_total_czk numeric,
  p_customer_email citext,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner public.partners%rowtype;
  v_order_id text := nullif(trim(coalesce(p_external_order_id, '')), '');
  v_email citext := nullif(trim(coalesce(p_customer_email::text, '')), '')::citext;
  v_order_total numeric := p_order_total_czk;
  v_coins integer;
  v_code text;
  v_existing public.partner_reward_codes%rowtype;
  v_metadata jsonb;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_partner_id');
  END IF;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_external_order_id');
  END IF;

  IF v_order_total IS NULL OR v_order_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_order_total_czk');
  END IF;

  IF v_email IS NULL OR position('@' in v_email::text) <= 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_customer_email');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_partner_id::text || ':' || v_order_id, 0));

  SELECT * INTO v_existing
  FROM public.partner_reward_codes
  WHERE partner_id = p_partner_id
    AND external_order_id = v_order_id
    AND metadata->>'source' = 'partner_order_api'
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'duplicate', true,
      'code', v_existing.code,
      'coins', v_existing.coins,
      'status', v_existing.status,
      'external_order_id', v_existing.external_order_id,
      'customer_email', v_existing.customer_email
    );
  END IF;

  SELECT * INTO v_partner
  FROM public.partners
  WHERE id = p_partner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'partner_not_found');
  END IF;

  IF v_partner.status <> 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'partner_not_approved');
  END IF;

  IF v_partner.reward_base_czk IS NULL OR v_partner.reward_base_czk <= 0
     OR v_partner.reward_mc IS NULL OR v_partner.reward_mc <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_partner_conversion_settings');
  END IF;

  v_coins := floor((v_order_total / v_partner.reward_base_czk) * v_partner.reward_mc)::integer;

  IF v_coins <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_amount_too_low');
  END IF;

  v_code := upper(translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'XYZ'));
  WHILE EXISTS (SELECT 1 FROM public.partner_reward_codes WHERE code = v_code) LOOP
    v_code := upper(translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'XYZ'));
  END LOOP;

  v_metadata :=
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'partner_order_api',
      'order_total_czk', v_order_total,
      'conversion_reward_base_czk', v_partner.reward_base_czk,
      'conversion_reward_mc', v_partner.reward_mc,
      'order_status', 'pending'
    );

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
    v_coins,
    v_order_id,
    v_email,
    v_email,
    'pending',
    v_metadata
  );

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'code', v_code,
    'coins', v_coins,
    'status', 'pending',
    'external_order_id', v_order_id,
    'customer_email', v_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_order_reward(uuid, text, numeric, citext, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_order_reward(uuid, text, numeric, citext, jsonb) TO service_role;
