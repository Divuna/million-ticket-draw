-- Partner API v1 staging implementation.
-- Staging target: dxmowysntemfqfnanxua.
-- Production must not be touched by this migration without explicit approval.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum
    WHERE enumtypid = 'public.partner_code_status'::regtype
      AND enumlabel = 'pending'
  ) THEN
    ALTER TYPE public.partner_code_status ADD VALUE 'pending';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.partner_api_v1_order_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  reward_code text NOT NULL REFERENCES public.partner_reward_codes(code) ON DELETE RESTRICT,
  order_total_czk numeric(12,2) NOT NULL,
  customer_email citext NOT NULL,
  reward_coins integer NOT NULL CHECK (reward_coins > 0),
  conversion_base_czk numeric(12,2) NOT NULL,
  conversion_reward_mc numeric(12,4) NOT NULL,
  order_status text,
  reward_status text NOT NULL DEFAULT 'pending'
    CHECK (reward_status IN ('pending', 'active', 'cancelled', 'redeemed')),
  activated_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT partner_api_v1_order_rewards_order_total_positive
    CHECK (order_total_czk > 0),
  CONSTRAINT partner_api_v1_order_rewards_unique_order
    UNIQUE (partner_id, order_id),
  CONSTRAINT partner_api_v1_order_rewards_unique_code
    UNIQUE (reward_code)
);

ALTER TABLE public.partner_api_v1_order_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_api_v1_order_rewards_admin_select
  ON public.partner_api_v1_order_rewards;

CREATE POLICY partner_api_v1_order_rewards_admin_select
  ON public.partner_api_v1_order_rewards
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE INDEX IF NOT EXISTS idx_partner_api_v1_order_rewards_partner_created
  ON public.partner_api_v1_order_rewards(partner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_partner_api_v1_order_rewards_reward_status
  ON public.partner_api_v1_order_rewards(reward_status);

CREATE OR REPLACE FUNCTION public.partner_api_v1_reward_link(
  p_code text,
  p_base_url text DEFAULT 'https://onemil.cz'
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT rtrim(coalesce(nullif(p_base_url, ''), 'https://onemil.cz'), '/')
    || '/profile?miocoin_code='
    || encode(convert_to(coalesce(p_code, ''), 'UTF8'), 'escape');
$$;

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

CREATE OR REPLACE FUNCTION public.partner_api_v1_update_order_status(
  p_partner_id uuid,
  p_order_id text,
  p_order_status text,
  p_base_url text DEFAULT 'https://onemil.cz'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id text := btrim(coalesce(p_order_id, ''));
  v_order_status text := lower(btrim(coalesce(p_order_status, '')));
  v_target text;
  v_order public.partner_api_v1_order_rewards%rowtype;
  v_code public.partner_reward_codes%rowtype;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_partner_id');
  END IF;

  IF v_order_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_order_id');
  END IF;

  IF v_order_status = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_order_status');
  END IF;

  IF v_order_status IN ('paid', 'delivered', 'completed') THEN
    v_target := 'active';
  ELSIF v_order_status IN ('cancelled', 'returned', 'unpaid', 'not_picked_up') THEN
    v_target := 'cancelled';
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'unsupported_order_status');
  END IF;

  SELECT *
  INTO v_order
  FROM public.partner_api_v1_order_rewards
  WHERE partner_id = p_partner_id
    AND order_id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'order_not_found');
  END IF;

  SELECT *
  INTO v_code
  FROM public.partner_reward_codes
  WHERE code = v_order.reward_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_code_not_found');
  END IF;

  IF v_code.status = 'activated' THEN
    UPDATE public.partner_api_v1_order_rewards
    SET order_status = v_order_status,
        reward_status = 'redeemed',
        updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;

    RETURN jsonb_build_object(
      'success', true,
      'partner_id', v_order.partner_id,
      'order_id', v_order.order_id,
      'external_order_id', v_order.order_id,
      'order_status', v_order.order_status,
      'reward_status', v_order.reward_status,
      'reward_code', v_order.reward_code,
      'reward_link', public.partner_api_v1_reward_link(v_order.reward_code, p_base_url),
      'coins', v_order.reward_coins,
      'already_redeemed', true
    );
  END IF;

  IF v_target = 'active' THEN
    UPDATE public.partner_reward_codes
    SET status = 'issued',
        cancelled_at = NULL,
        metadata = metadata || jsonb_build_object(
          'last_partner_order_status', v_order_status,
          'activated_by_partner_status_at', now()
        )
    WHERE code = v_order.reward_code;

    UPDATE public.partner_api_v1_order_rewards
    SET order_status = v_order_status,
        reward_status = 'active',
        activated_at = coalesce(activated_at, now()),
        cancelled_at = NULL,
        updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  ELSE
    UPDATE public.partner_reward_codes
    SET status = 'cancelled',
        cancelled_at = now(),
        metadata = metadata || jsonb_build_object(
          'last_partner_order_status', v_order_status,
          'cancelled_by_partner_status_at', now()
        )
    WHERE code = v_order.reward_code;

    UPDATE public.partner_api_v1_order_rewards
    SET order_status = v_order_status,
        reward_status = 'cancelled',
        cancelled_at = coalesce(cancelled_at, now()),
        updated_at = now()
    WHERE id = v_order.id
    RETURNING * INTO v_order;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'partner_id', v_order.partner_id,
    'order_id', v_order.order_id,
    'external_order_id', v_order.order_id,
    'order_status', v_order.order_status,
    'reward_status', v_order.reward_status,
    'reward_code', v_order.reward_code,
    'reward_link', public.partner_api_v1_reward_link(v_order.reward_code, p_base_url),
    'coins', v_order.reward_coins
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.log_partner_coin_activation_from_reward()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.activated_at IS NOT NULL OR NEW.activated_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (SELECT 1 FROM public.partner_coin_activations WHERE code = NEW.code) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.partner_coin_activations (
    partner_id,
    user_id,
    code,
    coins,
    external_order_id,
    activated_at,
    created_at,
    invoiced
  ) VALUES (
    NEW.partner_id,
    NEW.activated_by_user_id,
    NEW.code,
    NEW.coins,
    coalesce(NEW.external_order_id, NEW.code),
    NEW.activated_at,
    now(),
    false
  );

  UPDATE public.partner_api_v1_order_rewards
  SET reward_status = 'redeemed',
      updated_at = now()
  WHERE reward_code = NEW.code;

  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.partner_api_v1_reward_link(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_api_v1_create_order_reward(uuid, text, numeric, citext, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_api_v1_update_order_status(uuid, text, text, text) TO service_role;
