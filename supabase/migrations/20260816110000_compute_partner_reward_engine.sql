-- Shared partner reward engine (Phase 2).
--
-- CRITICAL INVARIANT: this is the ONE place where a partner MioCoin reward is
-- calculated. The Shoptet widget preview, the Shoptet CSV import and the Partner
-- Order API must all route through this function — never re-implement the maths
-- in TypeScript, in the widget JS, or in a second RPC. What the customer is shown
-- in the cart and what OneMil actually issues after the order must come from the
-- same code path with the same inputs.
--
-- The function is PURE: it reads partners + partner_product_reward_rules and
-- returns a result. It never writes, never issues a code and never touches
-- wallets. create_partner_order_reward calls it and persists the result.
--
-- Confirmed product rules encoded here:
--   * quantity multiplies the reward (SKU = 10 MC, 2 pcs → 20 MC)
--   * ratio rewards use the REAL after-discount unit price
--   * rounding happens ONCE on the order total, never per item
--   * whole_shop keeps today's exact behaviour (order total / base * mc)
--
-- Items payload shape (jsonb array):
--   [{ "code": "ABC123", "name": "...", "quantity": 2, "unit_price_czk": 249.00 }]
--   `name` is optional and display-only. `code` is the only matching key.
--
-- Rollback: DROP FUNCTION IF EXISTS public.compute_partner_reward(uuid, numeric, jsonb);

begin;

CREATE OR REPLACE FUNCTION public.compute_partner_reward(
  p_partner_id      uuid,
  p_order_total_czk numeric,
  p_items           jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner    public.partners%rowtype;
  v_mode       text;
  v_has_items  boolean;
  v_item       jsonb;
  v_key        text;
  v_qty        numeric;
  v_unit       numeric;
  v_rule       public.partner_product_reward_rules%rowtype;
  v_item_mc    numeric;
  v_total_mc   numeric := 0;
  v_applied    text;
  v_breakdown  jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'partner_not_found');
  END IF;

  -- The global conversion is required in every mode: whole_shop uses it directly,
  -- whole_shop_with_exceptions uses it as the per-item fallback, and
  -- selected_products still records it in the audit snapshot.
  IF v_partner.reward_base_czk IS NULL OR v_partner.reward_base_czk <= 0
     OR v_partner.reward_mc IS NULL OR v_partner.reward_mc <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_partner_conversion_settings');
  END IF;

  v_mode := coalesce(v_partner.reward_mode, 'whole_shop');

  v_has_items := p_items IS NOT NULL
                 AND jsonb_typeof(p_items) = 'array'
                 AND jsonb_array_length(p_items) > 0;

  -- ── Order-total path ───────────────────────────────────────────────────────
  -- whole_shop always ignores items (bit-for-bit the legacy calculation).
  -- whole_shop_with_exceptions degrades safely to the global rate when the caller
  -- has no item data (e.g. a partner still using the header-only Shoptet export).
  IF v_mode = 'whole_shop' OR (v_mode = 'whole_shop_with_exceptions' AND NOT v_has_items) THEN
    IF p_order_total_czk IS NULL OR p_order_total_czk <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_order_total_czk');
    END IF;

    v_total_mc := (p_order_total_czk / v_partner.reward_base_czk) * v_partner.reward_mc;

    RETURN jsonb_build_object(
      'success',         true,
      'coins',           floor(v_total_mc)::integer,
      'reward_mode',     v_mode,
      'computed_from',   'order_total',
      'global_base_czk', v_partner.reward_base_czk,
      'global_mc',       v_partner.reward_mc,
      'raw_total_mc',    v_total_mc,
      'items',           v_breakdown
    );
  END IF;

  -- ── selected_products without items ────────────────────────────────────────
  -- Refusing is deliberate: falling back to the order total would pay out the
  -- whole basket at the global rate, which is the opposite of what the partner
  -- configured. The caller surfaces this as an explicit error.
  IF NOT v_has_items THEN
    RETURN jsonb_build_object(
      'success',     false,
      'error',       'items_required_for_reward_mode',
      'reward_mode', v_mode
    );
  END IF;

  -- ── Item path ──────────────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_key  := lower(trim(coalesce(v_item->>'code', '')));
    v_qty  := coalesce(nullif(trim(coalesce(v_item->>'quantity', '')), '')::numeric, 0);
    v_unit := coalesce(nullif(trim(coalesce(v_item->>'unit_price_czk', '')), '')::numeric, 0);

    CONTINUE WHEN v_key = '' OR v_qty <= 0;

    SELECT * INTO v_rule
    FROM public.partner_product_reward_rules
    WHERE partner_id = p_partner_id
      AND lower(product_key) = v_key
      AND active
    LIMIT 1;

    IF FOUND THEN
      IF v_rule.reward_type = 'fixed_mc' THEN
        v_item_mc := v_rule.fixed_mc * v_qty;
        v_applied := 'rule_fixed_mc';
      ELSE
        v_item_mc := (v_unit * v_qty / v_rule.ratio_base_czk) * v_rule.ratio_mc;
        v_applied := 'rule_ratio';
      END IF;
    ELSIF v_mode = 'whole_shop_with_exceptions' THEN
      v_item_mc := (v_unit * v_qty / v_partner.reward_base_czk) * v_partner.reward_mc;
      v_applied := 'global_rate';
    ELSE
      -- selected_products: a product without an active rule earns nothing.
      v_item_mc := 0;
      v_applied := 'no_rule';
    END IF;

    v_total_mc := v_total_mc + v_item_mc;

    v_breakdown := v_breakdown || jsonb_build_object(
      'code',           v_key,
      'quantity',       v_qty,
      'unit_price_czk', v_unit,
      'applied',        v_applied,
      'mc',             v_item_mc
    );
  END LOOP;

  -- Single rounding on the summed total (confirmed rule D): rounding each item
  -- separately would systematically lose fractions on multi-item baskets.
  RETURN jsonb_build_object(
    'success',         true,
    'coins',           floor(v_total_mc)::integer,
    'reward_mode',     v_mode,
    'computed_from',   'items',
    'global_base_czk', v_partner.reward_base_czk,
    'global_mc',       v_partner.reward_mc,
    'raw_total_mc',    v_total_mc,
    'items',           v_breakdown
  );
END;
$$;

COMMENT ON FUNCTION public.compute_partner_reward(uuid, numeric, jsonb) IS
  'Single source of truth for partner MioCoin reward calculation. Pure/no writes. Used by create_partner_order_reward (issuance) and the public widget preview endpoint (display) so both always agree.';

-- service_role only. The public widget preview reaches this through a
-- service-role Edge Function, so no anon/authenticated EXECUTE is needed.
REVOKE ALL ON FUNCTION public.compute_partner_reward(uuid, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_partner_reward(uuid, numeric, jsonb) TO service_role;

commit;
