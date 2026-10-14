-- MioCoin — one-decimal rule, part 3/4: issuance paths + Czech MioCoin formatting.
--
-- Every path that can create or report a partner reward code is aligned here, so
-- no route can bypass the invariants:
--
--   1. public.format_miocoin_cz(numeric)          — one Czech formatter (0,6 MioCoinu)
--   2. public.create_partner_order_reward(...)    — numeric coins, 0.5 floor, no own rounding
--   3. public.generate_partner_reward_code(...)   — numeric coins + the same validation
--   4. public.update_partner_order_reward_status  — customer e-mail prints 0,6 not 0.6
--
-- What deliberately does NOT change:
--   * Idempotency stays (partner_id, external_order_id): the same advisory lock,
--     the same duplicate short-circuit. The known multi-shop idempotency issue is
--     explicitly out of scope here.
--   * coins is still computed exactly ONCE, at code creation, by
--     compute_partner_reward, and is never recomputed later.
--   * update_partner_order_reward_status still only moves status and carries the
--     already-issued coins value through untouched.
--   * redeem_miocoin_code and log_partner_coin_activation_from_reward need no
--     change at all: they already pass coins through verbatim into
--     wallets.balance_coins / wallet_transactions.amount /
--     partner_coin_activations.coins, all of which are numeric.
--
-- Rollback: restore create_partner_order_reward from
--   20260816120000_create_partner_order_reward_items.sql,
-- restore generate_partner_reward_code / update_partner_order_reward_status from
-- their previous definitions, and DROP FUNCTION public.format_miocoin_cz(numeric).

begin;

-- ── 1. Czech MioCoin formatting, server side ─────────────────────────────────
-- Mirrors src/lib/miocoin.ts and the copy inside public/shoptet-widget.js.
-- Czech grammar: 1 MioCoin · 2–4 MioCoiny · 5+ MioCoinů · any decimal → MioCoinu.

CREATE OR REPLACE FUNCTION public.format_miocoin_cz(p_value numeric)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_rounded numeric;
  v_number  text;
  v_word    text;
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  v_rounded := round(p_value, 1);

  IF v_rounded = trunc(v_rounded) THEN
    -- Whole number: print it without a trailing ",0" and decline normally.
    v_number := trunc(v_rounded)::bigint::text;
    IF trunc(v_rounded) = 1 THEN
      v_word := 'MioCoin';
    ELSIF trunc(v_rounded) >= 2 AND trunc(v_rounded) <= 4 THEN
      v_word := 'MioCoiny';
    ELSE
      v_word := 'MioCoinů';
    END IF;
  ELSE
    -- Decimal: Czech uses a comma and the genitive singular ("0,6 MioCoinu").
    v_number := replace(trim(to_char(v_rounded, 'FM999999999990.0')), '.', ',');
    v_word   := 'MioCoinu';
  END IF;

  RETURN v_number || ' ' || v_word;
END;
$$;

COMMENT ON FUNCTION public.format_miocoin_cz(numeric) IS
  'Czech-formatted MioCoin amount, max 1 decimal place with a decimal comma: 0,6 MioCoinu / 1 MioCoin / 3 MioCoiny / 5 MioCoinů. Display only — never use for calculation.';

REVOKE ALL ON FUNCTION public.format_miocoin_cz(numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.format_miocoin_cz(numeric) TO authenticated, service_role;

-- ── 2. create_partner_order_reward ───────────────────────────────────────────

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
  -- numeric, NOT integer: a 0.6 MC reward used to be truncated to 0 here.
  v_coins       numeric;
  v_min_mc      numeric := public.miocoin_min_partner_reward_mc();
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
  -- It has ALREADY applied the one and only rounding; this function must not
  -- round, floor, truncate or cast the result again.
  v_reward := public.compute_partner_reward(p_partner_id, v_order_total, p_items);

  IF coalesce((v_reward->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', coalesce(v_reward->>'error', 'reward_computation_failed'));
  END IF;

  v_coins := (v_reward->>'coins')::numeric;

  -- Confirmed rule: a reward below 0.5 MC (after the single rounding) is not issued.
  IF v_coins IS NULL OR v_coins < v_min_mc THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'reward_amount_too_low',
      'coins', v_coins,
      'min_reward_mc', v_min_mc
    );
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
      'reward_min_mc', v_min_mc,
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

-- ── 3. generate_partner_reward_code ──────────────────────────────────────────
-- Manual/admin issuance path. It has no app caller today (service_role only), but
-- it writes partner_reward_codes.coins directly, so it must obey the same rules —
-- otherwise it would be a hole around the invariant. The integer signature is
-- dropped so no ambiguous overload can survive.

DROP FUNCTION IF EXISTS public.generate_partner_reward_code(uuid, integer, text, citext, jsonb);

CREATE OR REPLACE FUNCTION public.generate_partner_reward_code(
  p_partner_id        uuid,
  p_coins             numeric,
  p_external_order_id text DEFAULT NULL::text,
  p_customer_email    citext DEFAULT NULL::citext,
  p_metadata          jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $$
DECLARE
  v_code    text;
  v_partner public.partners%rowtype;
  v_min_mc  numeric := public.miocoin_min_partner_reward_mc();
BEGIN
  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id;

  IF v_partner.id IS NULL THEN
    RAISE EXCEPTION 'Partner not found';
  END IF;

  -- allow admin always, allow partner only for itself and when approved
  IF NOT public.is_admin() THEN
    IF v_partner.auth_user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Not allowed';
    END IF;
    IF v_partner.status <> 'approved' THEN
      RAISE EXCEPTION 'Partner not approved';
    END IF;
  END IF;

  IF p_coins IS NULL OR p_coins < v_min_mc THEN
    RAISE EXCEPTION 'Invalid coins: minimum is % MC', v_min_mc;
  END IF;

  -- Rejected, never silently rounded: 1.25 must not become 1.3.
  IF p_coins <> round(p_coins, 1) THEN
    RAISE EXCEPTION 'Invalid coins: MioCoin values allow at most 1 decimal place';
  END IF;

  v_code := upper(translate(encode(gen_random_bytes(9), 'base64'), '+/=', 'XYZ'));
  WHILE EXISTS (SELECT 1 FROM public.partner_reward_codes WHERE code = v_code) LOOP
    v_code := upper(translate(encode(gen_random_bytes(9), 'base64'), '+/=', 'XYZ'));
  END LOOP;

  INSERT INTO public.partner_reward_codes(
    code, partner_id, coins, external_order_id, customer_email, issued_to_email, metadata
  )
  VALUES (
    v_code, p_partner_id, p_coins, p_external_order_id, p_customer_email, p_customer_email, coalesce(p_metadata, '{}'::jsonb)
  );

  RETURN v_code;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_partner_reward_code(uuid, numeric, text, citext, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_partner_reward_code(uuid, numeric, text, citext, jsonb) TO service_role;

COMMENT ON FUNCTION public.generate_partner_reward_code(uuid, numeric, text, citext, jsonb)
  IS 'Financial reward issuance. service_role only; not callable by anon or authenticated. Coins must be >= 0.5 MC with at most 1 decimal place.';

-- ── 4. update_partner_order_reward_status: Czech amount in the customer e-mail ─
-- Status handling is unchanged. The ONLY change is that the coin amount printed to
-- the customer goes through format_miocoin_cz, so a 0.6 MC reward reads
-- "0,6 MioCoinu" instead of the raw "0.6" an English cast would produce.

CREATE OR REPLACE FUNCTION public.update_partner_order_reward_status(
  p_partner_id        uuid,
  p_external_order_id text,
  p_order_status      text
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
  v_was_pending boolean := false;
  v_delivery text;
  v_partner_name text;
  v_email_enqueued boolean := false;
  v_redeem_url text;
  v_email_body text;
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

  SELECT shoptet_customer_delivery, name
    INTO v_delivery, v_partner_name
  FROM public.partners
  WHERE id = p_partner_id;

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

    v_was_pending := (v_row.status = 'pending');
    v_new_status := 'issued';

    IF v_was_pending
       AND v_delivery = 'onemil'
       AND (v_metadata->>'customer_email_enqueued_at') IS NULL
       AND v_row.customer_email IS NOT NULL THEN

      v_redeem_url := 'https://onemil.cz/profile?miocoin_code=' || v_row.code;

      v_email_body := format($html$<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2128;">
<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0A0B0F;padding:24px 32px;"><span style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">One<span style="color:#FF8A00;">Mil</span></span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:22px;color:#1d2128;">Mate pripravene MioCoiny</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3f47;">Dobry den,</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3f47;">dekujeme za nakup u <strong>%1$s</strong>. Ziskali jste <strong>%2$s</strong>, ktere muzete uplatnit ve sve penezence OneMil.</p>
<div style="margin:24px 0;padding:20px;background:#fff7ed;border:1px solid #FF8A00;border-radius:10px;text-align:center;">
<div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#8E98A6;margin-bottom:8px;">Vas MioCoin kod</div>
<div style="font-size:26px;font-weight:700;letter-spacing:3px;color:#0A0B0F;font-family:'Courier New',monospace;">%3$s</div></div>
<div style="text-align:center;margin:28px 0;"><a href="%4$s" style="display:inline-block;background:#FF8A00;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;">Uplatnit MioCoiny</a></div>
<p style="margin:0;font-size:13px;line-height:1.6;color:#8E98A6;">Kod uplatnite po prihlaseni v sekci Profil &rarr; Penezenka. Pokud tlacitko nefunguje, pouzijte odkaz:<br><a href="%4$s" style="color:#FF8A00;word-break:break-all;">%4$s</a></p>
</td></tr>
<tr><td style="background:#f4f5f7;padding:20px 32px;text-align:center;"><p style="margin:0;font-size:12px;color:#8E98A6;">MioCoiny jsou interni kredit OneMil a lze je pouzit pouze v ramci platformy OneMil.<br>&copy; OneMil - Luxusni souteze. Skutecne vyhry.</p></td></tr>
</table></td></tr></table></body></html>$html$,
        coalesce(v_partner_name, 'partnera OneMil'),
        public.format_miocoin_cz(v_row.coins),
        v_row.code,
        v_redeem_url
      );

      INSERT INTO public.email_queue (email, subject, body, status)
      VALUES (
        v_row.customer_email::text,
        'Mate pripravene MioCoiny od OneMil',
        v_email_body,
        'pending'
      );

      v_email_enqueued := true;
      v_metadata := v_metadata || jsonb_build_object('customer_email_enqueued_at', now());
    END IF;

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
    'customer_email', v_row.customer_email,
    'newly_issued', v_was_pending AND v_row.status = 'issued',
    'email_enqueued', v_email_enqueued
  );
END;
$$;

commit;
