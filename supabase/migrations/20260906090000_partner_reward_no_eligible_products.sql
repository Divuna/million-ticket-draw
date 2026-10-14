-- ============================================================================
-- selected_products: objednávka bez vybraného produktu NENÍ chyba
--
-- ŘEŠENÝ PROBLÉM (potvrzeno na produkci 05. 09. 2026):
--   `create_partner_order_reward` má jedinou bránu pro nízkou odměnu:
--       IF v_coins IS NULL OR v_coins < v_min_mc THEN -> 'reward_amount_too_low'
--   V režimu `selected_products` ale `compute_partner_reward` vrací
--   `coins = 0` i tehdy, když objednávka prostě NEOBSAHUJE žádný vybraný
--   produkt (každá položka dostane `applied='no_rule'`, tedy 0 MC).
--   Obě situace tak spadly do stejné chyby a Shoptet live import je logoval
--   jako `error/create_failed` -> `rows_failed > 0` -> běh `partial`.
--
--   Obchodně jsou to ale dvě různé věci:
--     * žádný vybraný produkt  = normální objednávka bez nároku na MioCoiny,
--     * vybraný produkt je, ale vyjde pod minimem = skutečná chyba.
--
-- OPRAVA (nejmenší bezpečná změna v existujícím toku):
--   1. `compute_partner_reward` nově vrací v items větvi dvě ČISTĚ ADITIVNÍ
--      diagnostická pole:
--         eligible_items — počet položek, na které se reálně uplatnilo
--                          pravidlo produktu nebo globální sazba,
--         counted_items  — počet položek, které vůbec vstoupily do výpočtu
--                          (neprázdný kód a quantity > 0).
--      Výpočet, zaokrouhlení, `coins`, `issuable` ani větev `whole_shop`
--      se NEMĚNÍ. Nevzniká druhý engine — počítá se dál jen tady.
--   2. `create_partner_order_reward` PŘED kontrolou minima rozliší případ
--      „items větev + eligible_items = 0" a vrátí
--         { success: true, skipped: true, reason: 'no_eligible_products' }
--      bez vytvoření reward kódu.
--
-- CO SE VĚDOMĚ NEMĚNÍ:
--   * `whole_shop` — návratová hodnota i chování beze změny.
--   * `whole_shop_with_exceptions` — položka bez pravidla tam dostává
--     `applied='global_rate'`, takže `eligible_items` je > 0 a nová brána
--     se nikdy neuplatní.
--   * Minimum odměny — `reward_amount_too_low` zůstává PŘESNĚ jak bylo pro
--     případ, kdy vybraný produkt existuje, ale součet je pod
--     `miocoin_min_partner_reward_mc()`.
--   * `reward_trigger_status` — kdy se odměna vydává, se nemění vůbec;
--     tato funkce jen zakládá kód ve stavu `pending`.
--   * `items_required_for_reward_mode` — objednávka BEZ položek v režimu
--     vyžadujícím položky zůstává chybou (jiný případ než „položky jsou,
--     ale žádná není vybraná").
--   * Idempotence na `partner_id + external_order_id`, advisory lock,
--     duplicate větev, generování kódu, metadata.
--
-- JEDNA ZÁMĚRNÁ ZMĚNA NAVÍC (viz PR):
--   Zápis do `partner_seen_products` se přesunul PŘED brány způsobilosti.
--   Dřív se produkty zaznamenaly jen při úspěšném vydání odměny, takže
--   u partnera, jehož objednávky nárok nemají, zůstal katalog prázdný a
--   admin neměl z čeho pravidlo nastavit. Jde o stejný best-effort blok
--   (`EXCEPTION WHEN OTHERS THEN NULL`) nad stejnou tabulkou, jen dřív.
--
-- ⚠️ NEAPLIKOVÁNO NA PRODUKCI. Vyžaduje samostatné schválení Pavla.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Engine — aditivní diagnostika, žádná změna výpočtu
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_partner_reward(
  p_partner_id uuid,
  p_order_total_czk numeric,
  p_items jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_eligible   integer := 0;
  v_counted    integer := 0;
BEGIN
  SELECT * INTO v_partner FROM public.partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'partner_not_found');
  END IF;

  IF v_partner.reward_base_czk IS NULL OR v_partner.reward_base_czk <= 0
     OR v_partner.reward_mc IS NULL OR v_partner.reward_mc <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_partner_conversion_settings');
  END IF;

  v_mode := coalesce(v_partner.reward_mode, 'whole_shop');

  v_has_items := p_items IS NOT NULL
                 AND jsonb_typeof(p_items) = 'array'
                 AND jsonb_array_length(p_items) > 0;

  IF v_mode = 'whole_shop' OR (v_mode = 'whole_shop_with_exceptions' AND NOT v_has_items) THEN
    IF p_order_total_czk IS NULL OR p_order_total_czk <= 0 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_order_total_czk');
    END IF;

    -- Full numeric precision here; the single rounding happens on the next line.
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

  IF NOT v_has_items THEN
    RETURN jsonb_build_object(
      'success',     false,
      'error',       'items_required_for_reward_mode',
      'reward_mode', v_mode
    );
  END IF;

  -- Items are summed at FULL precision. Nothing is rounded inside this loop —
  -- rounding per item would systematically lose fractions on multi-item baskets.
  -- mc_display is a presentation value for a single-product badge, never summed.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_key  := lower(trim(coalesce(v_item->>'code', '')));
    v_qty  := coalesce(nullif(trim(coalesce(v_item->>'quantity', '')), '')::numeric, 0);
    v_unit := coalesce(nullif(trim(coalesce(v_item->>'unit_price_czk', '')), '')::numeric, 0);

    CONTINUE WHEN v_key = '' OR v_qty <= 0;

    v_counted := v_counted + 1;

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
      v_item_mc := 0;
      v_applied := 'no_rule';
    END IF;

    -- Diagnostika: kolik položek reálně zakládá nárok na odměnu.
    -- Nemění výpočet, jen umožní volajícímu odlišit „žádný vybraný produkt"
    -- od „vybraný produkt je, ale vyšlo to pod minimem".
    IF v_applied <> 'no_rule' THEN
      v_eligible := v_eligible + 1;
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
    'eligible_items',  v_eligible,
    'counted_items',   v_counted,
    'items',           v_breakdown
  );
END;
$function$;

-- ----------------------------------------------------------------------------
-- 2. Vydání odměny — rozlišení „bez nároku" vs „pod minimem"
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partner_order_reward(
  p_partner_id uuid,
  p_external_order_id text,
  p_order_total_czk numeric,
  p_customer_email citext,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_items jsonb DEFAULT NULL::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner     public.partners%rowtype;
  v_order_id    text := nullif(trim(coalesce(p_external_order_id, '')), '');
  v_email       citext := nullif(trim(coalesce(p_customer_email::text, '')), '')::citext;
  v_order_total numeric := p_order_total_czk;
  v_reward      jsonb;
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

  v_reward := public.compute_partner_reward(p_partner_id, v_order_total, p_items);

  IF coalesce((v_reward->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', coalesce(v_reward->>'error', 'reward_computation_failed'));
  END IF;

  -- Katalog viděných produktů se plní i u objednávek bez nároku na odměnu,
  -- jinak by admin neměl z čeho pravidla nastavit. Best-effort: selhání
  -- zápisu nikdy neshodí vydání odměny.
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

  v_coins := (v_reward->>'coins')::numeric;

  -- Objednávka v režimu vybraných produktů, která ŽÁDNÝ vybraný produkt
  -- neobsahuje, je normální objednávka bez nároku na MioCoiny — ne chyba.
  -- Nevzniká reward kód, zákazníkovi se nic neposílá a volající (Shoptet
  -- import) to díky success=true nezapočítá jako selhání.
  -- MUSÍ zůstat PŘED kontrolou minima níže.
  IF v_reward->>'computed_from' = 'items'
     AND coalesce((v_reward->>'eligible_items')::integer, 0) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'skipped', true,
      'reason', 'no_eligible_products',
      'duplicate', false,
      'coins', 0,
      'external_order_id', v_order_id,
      'reward_mode', v_reward->>'reward_mode',
      'counted_items', coalesce((v_reward->>'counted_items')::integer, 0)
    );
  END IF;

  -- Beze změny: vybraný produkt existuje, ale součet je pod minimem.
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
    code, partner_id, coins, external_order_id, customer_email, issued_to_email, status, metadata
  ) VALUES (
    v_code, p_partner_id, v_coins, v_order_id, v_email, v_email, 'pending', v_metadata
  );

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
$function$;
