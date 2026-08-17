-- MioCoin — one-decimal rule, part 2/4: the reward engine.
--
-- Bug this fixes (verified read-only on production xkzhjldrojjlrkezorey, 18. 08. 2026):
--   compute_partner_reward returned `floor(v_total_mc)::integer`. A partner with a
--   whole_shop conversion below the natural integer boundary (e.g. 100 Kc = 3.7 MC)
--   or a per-SKU fixed_mc rule under 2 MC has the engine compute the correct
--   fractional amount and then floor it away — a live example: 660 Kc at
--   100 Kc = 3.7 MC computes 24.42 raw MC and today floors to 24, silently
--   discarding 0.42 MC per order.
--
-- What changes:
--   * `coins` is now numeric, rounded ONCE on the summed order total: round(x, 1).
--   * Per-item amounts stay raw in `mc` (audit) and gain `mc_display`, which is the
--     ONLY rounded per-item figure any caller may render. Callers must never round
--     themselves — that is what keeps "what the cart shows" and "what is issued"
--     provably identical.
--   * `issuable` / `min_reward_mc` express the 0.5 MC floor, so both the preview
--     endpoint and the issuance RPC apply the same threshold from the same source.
--
-- What deliberately does NOT change:
--   * signature, STABLE/purity, SECURITY DEFINER, service_role-only grants
--   * whole_shop / whole_shop_with_exceptions / selected_products semantics
--   * quantity multiplies the reward; ratio rules use the real after-discount price
--   * rounding still happens exactly once, never per item
--   * 1 MC = 1 Kc is not a value this function reads or sets — the global
--     conversion rate (reward_base_czk / reward_mc) is entirely partner-configured
--     and untouched by this migration
--
-- Rounding semantics: round(numeric, 1) in Postgres is half-away-from-zero, which
-- for the positive-only reward domain is the standard round(raw_total_mc, 1):
--   4.95 → 5.0 · 4.85 → 4.9 · 4.84 → 4.8 · 24.42 → 24.4
--
-- Rollback: restore the body from 20260816110000_compute_partner_reward_engine.sql.

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
  v_coins      numeric;
  v_min_mc     numeric := public.miocoin_min_partner_reward_mc();
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
  -- whole_shop always ignores items.
  -- whole_shop_with_exceptions degrades safely to the global rate when the caller
  -- has no item data (e.g. a partner still using the header-only Shoptet export).
  IF v_mode = 'whole_shop' OR (v_mode = 'whole_shop_with_exceptions' AND NOT v_has_items) THEN
    IF p_order_total_czk IS NULL OR p_order_total_czk <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_order_total_czk');
    END IF;

    -- Full numeric precision here; the single rounding happens below.
    v_total_mc := (p_order_total_czk / v_partner.reward_base_czk) * v_partner.reward_mc;
    v_coins    := round(v_total_mc, 1);

    RETURN jsonb_build_object(
      'success',         true,
      'coins',           v_coins,
      'issuable',        v_coins >= v_min_mc,
      'min_reward_mc',   v_min_mc,
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
  -- Each item is computed at full numeric precision and summed. NOTHING is
  -- rounded inside this loop — rounding per item would systematically lose
  -- fractions on multi-item baskets, which is exactly what the confirmed rule
  -- forbids. `mc_display` is a presentation value for a single-product badge and
  -- is never summed.
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
      'mc',             v_item_mc,
      'mc_display',     round(v_item_mc, 1)
    );
  END LOOP;

  -- Single rounding on the summed total (confirmed rule).
  v_coins := round(v_total_mc, 1);

  RETURN jsonb_build_object(
    'success',         true,
    'coins',           v_coins,
    'issuable',        v_coins >= v_min_mc,
    'min_reward_mc',   v_min_mc,
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
  'Single source of truth for partner MioCoin reward calculation. Pure/no writes. Items are summed at full precision and the ORDER TOTAL is rounded exactly once to 1 decimal place; no caller may round again. Used by create_partner_order_reward (issuance) and partner-reward-preview (display) so both always agree.';

-- service_role only. The public widget preview reaches this through a
-- service-role Edge Function, so no anon/authenticated EXECUTE is needed.
REVOKE ALL ON FUNCTION public.compute_partner_reward(uuid, numeric, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_partner_reward(uuid, numeric, jsonb) TO service_role;

commit;
