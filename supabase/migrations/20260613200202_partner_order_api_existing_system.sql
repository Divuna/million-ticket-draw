-- Partner API order rewards on the existing OneMil reward-code system.
--
-- This intentionally does not create a new Edge Function or a new reward table.
-- Order creation writes pending rows to public.partner_reward_codes; customer
-- wallet credit still happens only through public.redeem_miocoin_code().

ALTER TYPE public.partner_code_status ADD VALUE IF NOT EXISTS 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_reward_codes_order_api_idempotency
  ON public.partner_reward_codes (partner_id, external_order_id)
  WHERE external_order_id IS NOT NULL
    AND metadata->>'source' = 'partner_order_api';

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

CREATE OR REPLACE FUNCTION public.update_partner_order_reward_status(
  p_partner_id uuid,
  p_external_order_id text,
  p_order_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id text := nullif(trim(coalesce(p_external_order_id, '')), '');
  v_order_status text := lower(replace(trim(coalesce(p_order_status, '')), '-', '_'));
  v_row public.partner_reward_codes%rowtype;
  v_new_status public.partner_code_status;
  v_metadata jsonb;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_partner_id');
  END IF;

  IF v_order_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_external_order_id');
  END IF;

  IF v_order_status IS NULL OR v_order_status = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_order_status');
  END IF;

  SELECT * INTO v_row
  FROM public.partner_reward_codes
  WHERE partner_id = p_partner_id
    AND external_order_id = v_order_id
    AND metadata->>'source' = 'partner_order_api'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_not_found');
  END IF;

  v_metadata := coalesce(v_row.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'order_status', v_order_status,
      'order_status_updated_at', now()
    );

  IF v_order_status IN ('paid', 'delivered', 'completed') THEN
    IF v_row.status = 'activated' THEN
      RETURN jsonb_build_object(
        'success', true,
        'code', v_row.code,
        'coins', v_row.coins,
        'status', 'activated',
        'external_order_id', v_row.external_order_id,
        'already_redeemed', true
      );
    END IF;

    IF v_row.status IN ('cancelled', 'expired') THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'reward_not_activatable',
        'code', v_row.code,
        'status', v_row.status
      );
    END IF;

    v_new_status := 'issued';

    UPDATE public.partner_reward_codes
    SET status = v_new_status,
        metadata = v_metadata
    WHERE code = v_row.code
    RETURNING * INTO v_row;

  ELSIF v_order_status IN ('cancelled', 'returned', 'unpaid', 'not_picked_up') THEN
    IF v_row.status = 'activated' THEN
      RETURN jsonb_build_object(
        'success', true,
        'code', v_row.code,
        'coins', v_row.coins,
        'status', 'activated',
        'external_order_id', v_row.external_order_id,
        'already_redeemed', true,
        'not_cancelled_reason', 'already_redeemed'
      );
    END IF;

    IF v_row.status = 'cancelled' THEN
      UPDATE public.partner_reward_codes
      SET metadata = v_metadata
      WHERE code = v_row.code
      RETURNING * INTO v_row;
    ELSE
      UPDATE public.partner_reward_codes
      SET status = 'cancelled',
          cancelled_at = coalesce(cancelled_at, now()),
          metadata = v_metadata
      WHERE code = v_row.code
      RETURNING * INTO v_row;
    END IF;

  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'unsupported_order_status');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'code', v_row.code,
    'coins', v_row.coins,
    'status', v_row.status,
    'external_order_id', v_row.external_order_id,
    'customer_email', v_row.customer_email
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.redeem_miocoin_code(p_code text)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_email       text;
  v_code        text := upper(trim(coalesce(p_code, '')));
  v_row         public.partner_reward_codes%rowtype;
  v_restrict    citext;
  v_wallet_id   uuid;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_logged_in');
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  SELECT * INTO v_row
  FROM public.partner_reward_codes
  WHERE upper(code) = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  IF v_row.status = 'activated' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used');
  ELSIF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'cancelled');
  ELSIF v_row.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  ELSIF v_row.status = 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'pending');
  ELSIF v_row.status <> 'issued' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  IF v_row.expired_at IS NOT NULL AND v_row.expired_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  v_restrict := coalesce(v_row.issued_to_email, v_row.customer_email);
  IF v_restrict IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NULL OR v_restrict <> v_email::citext THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_mismatch');
    END IF;
  END IF;

  PERFORM public.ensure_wallet_exists(v_uid);

  UPDATE public.wallets
  SET balance_coins = balance_coins + v_row.coins
  WHERE user_id = v_uid
  RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    v_uid,
    v_wallet_id,
    v_row.coins,
    v_new_balance,
    'miocoin_code_credit',
    'redeem_miocoin_code',
    NULL,
    jsonb_build_object('code', v_row.code, 'partner_id', v_row.partner_id)
  );

  UPDATE public.partner_reward_codes
  SET status = 'activated',
      activated_at = now(),
      activated_by_user_id = v_uid
  WHERE code = v_row.code;

  RETURN jsonb_build_object(
    'success', true,
    'coins', v_row.coins,
    'new_balance', v_new_balance
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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_order_reward(uuid, text, numeric, citext, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_partner_order_reward_status(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_order_reward(uuid, text, numeric, citext, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_partner_order_reward_status(uuid, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.redeem_miocoin_code(text) TO authenticated;
