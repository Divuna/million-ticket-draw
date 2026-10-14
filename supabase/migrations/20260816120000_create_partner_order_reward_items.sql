-- create_partner_order_reward routed through the shared reward engine (Phase 3).
--
-- What changes:
--   * The inline `floor(total / base * mc)` calculation is REPLACED by a call to
--     public.compute_partner_reward(...). One engine, no second implementation.
--   * A new optional p_items argument carries order line items (Shoptet item-level
--     CSV export, or Partner Order API items[]).
--   * The audit snapshot in metadata is extended so it stays possible to
--     reconstruct afterwards exactly how a reward was produced.
--   * Observed product codes are cached into partner_seen_products so the partner
--     dashboard product picker offers keys guaranteed to match real orders.
--
-- What deliberately does NOT change:
--   * Idempotency key stays (partner_id, external_order_id) with the existing
--     unique index and advisory lock.
--   * Callers passing only the original five named arguments (import-shoptet-orders,
--     partner-activate) keep working unchanged — p_items defaults to NULL and the
--     whole_shop path is bit-for-bit the previous calculation.
--   * coins is still computed exactly once, at code creation, and never recomputed.
--     Changing the conversion or a product rule later never rewrites issued codes.
--
-- The old five-argument signature is dropped so no ambiguous overload can exist
-- (same pattern as 20260603_affiliate_registration_rpc_drop_old_signature.sql).
--
-- Rollback: restore the function body from
--   20260613200849_partner_order_api_crypto_schema_fix.sql
-- and drop the six-argument variant.

begin;

DROP FUNCTION IF EXISTS public.create_partner_order_reward(uuid, text, numeric, citext, jsonb);

CREATE OR REPLACE FUNCTION public.create_partner_order_reward(
  p_partner_id        uuid,
  p_external_order_id text,
  p_order_total_czk   numeric,
  p_customer_email    citext,
  p_metadata          jsonb DEFAULT '{}'::jsonb,
  p_items             jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner     public.partners%rowtype;
  v_order_id    text := nullif(trim(coalesce(p_external_order_id, '')), '');
  v_email       citext := nullif(trim(coalesce(p_customer_email::text, '')), '')::citext;
  v_order_total numeric := p_order_total_czk;
  v_reward      jsonb;
  v_coins       integer;
  v_code        text;
  v_existing    public.partner_reward_codes%rowtype;
  v_metadata    jsonb;
  v_item        jsonb;
  v_item_key    text;
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

  -- Single shared engine — same call the widget preview endpoint makes.
  v_reward := public.compute_partner_reward(p_partner_id, v_order_total, p_items);

  IF coalesce((v_reward->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', coalesce(v_reward->>'error', 'reward_computation_failed'));
  END IF;

  v_coins := (v_reward->>'coins')::integer;

  IF v_coins <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'reward_amount_too_low');
  END IF;

  v_code := upper(translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'XYZ'));
  WHILE EXISTS (SELECT 1 FROM public.partner_reward_codes WHERE code = v_code) LOOP
    v_code := upper(translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/=', 'XYZ'));
  END LOOP;

  -- Audit snapshot: enough to reconstruct later which mode, which global
  -- conversion and which per-product rule produced this exact coin amount.
  v_metadata :=
    coalesce(p_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'source', 'partner_order_api',
      'order_total_czk', v_order_total,
      'conversion_reward_base_czk', v_reward->'global_base_czk',
      'conversion_reward_mc', v_reward->'global_mc',
      'reward_mode', v_reward->>'reward_mode',
      'reward_computed_from', v_reward->>'computed_from',
      'reward_raw_total_mc', v_reward->'raw_total_mc',
      'reward_items', v_reward->'items',
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

  -- Remember observed product codes for the partner dashboard picker. Best effort:
  -- a failure here must never block reward issuance.
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    BEGIN
      FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_item_key := nullif(trim(coalesce(v_item->>'code', '')), '');
        CONTINUE WHEN v_item_key IS NULL;

        INSERT INTO public.partner_seen_products (partner_id, product_key, last_seen_name, last_seen_at)
        VALUES (p_partner_id, v_item_key, nullif(trim(coalesce(v_item->>'name', '')), ''), now())
        ON CONFLICT (partner_id, lower(product_key)) DO UPDATE
          SET last_seen_name = coalesce(excluded.last_seen_name, public.partner_seen_products.last_seen_name),
              last_seen_at   = now();
      END LOOP;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'duplicate', false,
    'code', v_code,
    'coins', v_coins,
    'status', 'pending',
    'external_order_id', v_order_id,
    'customer_email', v_email,
    'reward_mode', v_reward->>'reward_mode',
    'reward_computed_from', v_reward->>'computed_from'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_order_reward(uuid, text, numeric, citext, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_order_reward(uuid, text, numeric, citext, jsonb, jsonb) TO service_role;

commit;
