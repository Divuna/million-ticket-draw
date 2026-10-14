-- ============================================================================
-- ROLLBACK — FÁZE 3: zahajovací sleva ve fakturaci
--   migrace: supabase/migrations/20260903200935_partner_trial_invoice_discount_prod_parity_fix.sql
--
-- Definice v sekci 1 jsou LITERÁLNÍ živé produkční definice, staženy a
-- ověřeny (md5) bezprostředně před nasazením FÁZE 3 (03. 09. 2026):
--   create_partner_invoices_for_last_week  bc63ea116586e8245cee9a2954134af4
--   create_partner_invoices_for_period     dec8d897a638786aa53c793496869691
--   generate_partner_invoice               3d416d7bb925f8aa75e03fa804beb3fc
--
-- ⚠️ Pokud se produkce mezi nasazením FÁZE 3 a rollbackem ještě jednou změnila
--    (např. jiná oprava faktur), NEPOUŽÍVEJ tyto texty naslepo — nejdřív znovu
--    ověř `SELECT md5(pg_get_functiondef(oid))` proti hodnotám výše. Shodují
--    se → bezpečné použít text níže. Neshodují se → STOP, zachytit novou
--    živou definici a rollback přepsat.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Obnovit původní produkční definice tří fakturačních funkcí
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partner_invoices_for_last_week()
 RETURNS TABLE(invoice_id uuid)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_period_start date;
  v_period_end date;
  v_partner record;
  v_invoice_id uuid;
  v_coins_total numeric;
  v_amount_net numeric;
  v_vat_amount numeric;
  v_amount_gross numeric;
  v_invoice_number text;
  v_variable_symbol text;
  v_issue_date date;
  v_due_date date;
  v_taxable_date date;
  v_existing_id uuid;
BEGIN
  v_period_start := (date_trunc('week', now())::date) - 7;
  v_period_end := (date_trunc('week', now())::date) - 1;
  v_issue_date := date_trunc('week', now())::date;
  v_due_date := v_issue_date + 7;
  v_taxable_date := v_period_end;

  FOR v_partner IN
    SELECT * FROM public.partners
    WHERE status = 'approved'
      AND approved_at IS NOT NULL
      AND suspended_at IS NULL
      AND rejected_at IS NULL
  LOOP
    SELECT id INTO v_existing_id
    FROM public.partner_invoices
    WHERE partner_id = v_partner.id
      AND (
        (period_start = v_period_start AND period_end = v_period_end)
        OR (period_from = v_period_start AND period_to = v_period_end)
        OR (period_from = v_period_start AND period_to = v_period_end + 1)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(coins), 0)
      INTO v_coins_total
      FROM public.partner_coin_activations
     WHERE partner_id = v_partner.id
       AND invoiced = false
       AND activated_at >= v_period_start
       AND activated_at < (v_period_end + 1);

    IF v_coins_total = 0 THEN
      CONTINUE;
    END IF;

    v_amount_net   := round(v_coins_total * v_partner.price_per_coin, 2);
    v_vat_amount   := round(v_amount_net * v_partner.vat_rate, 2);
    v_amount_gross := round(v_amount_net + v_vat_amount, 2);

    SELECT gin.invoice_number, gin.variable_symbol
      INTO v_invoice_number, v_variable_symbol
    FROM public.generate_invoice_number(v_issue_date) gin;

    INSERT INTO public.partner_invoices (
      partner_id, period_start, period_end, period_from, period_to,
      invoice_number, variable_symbol, issue_date, due_date, taxable_date,
      coins_total, coins_activated, amount_net, amount_ex_vat, vat_rate,
      vat_amount, amount_gross, amount_inc_vat, status, created_at
    ) VALUES (
      v_partner.id, v_period_start, v_period_end, v_period_start, v_period_end,
      v_invoice_number, v_variable_symbol, v_issue_date, v_due_date, v_taxable_date,
      v_coins_total, v_coins_total, v_amount_net, v_amount_net, v_partner.vat_rate,
      v_vat_amount, v_amount_gross, v_amount_gross, 'draft', now()
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO public.partner_invoice_lines (
      invoice_id, activation_id, external_order_id, coins, activated_at
    )
    SELECT v_invoice_id, id, external_order_id, coins, activated_at
    FROM public.partner_coin_activations
    WHERE partner_id = v_partner.id
      AND invoiced = false
      AND activated_at >= v_period_start
      AND activated_at < (v_period_end + 1);

    UPDATE public.partner_coin_activations
       SET invoiced = true
     WHERE id IN (
       SELECT l.activation_id
       FROM public.partner_invoice_lines l
       WHERE l.invoice_id = v_invoice_id
     );

    invoice_id := v_invoice_id;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_partner_invoices_for_period(p_period_from date, p_period_to date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_partner record;
  v_coins numeric;
  v_invoice_id uuid;
  v_invoice_number text;
  v_variable_symbol text;
  v_issue_date date;
  v_due_date date;
  v_taxable_date date;
  v_existing_id uuid;
  v_price_per_coin numeric;
  v_vat_rate numeric;
  v_amount_net numeric;
  v_vat_amount numeric;
  v_amount_gross numeric;
BEGIN
  v_issue_date := current_date;
  v_due_date := (current_date + 14);
  v_taxable_date := p_period_to;

  FOR v_partner IN
    SELECT DISTINCT partner_id
    FROM public.partner_coin_activations
    WHERE activated_at >= p_period_from
      AND activated_at <  (p_period_to + 1)
      AND invoiced = false
  LOOP
    SELECT id INTO v_existing_id
    FROM public.partner_invoices
    WHERE partner_id = v_partner.partner_id
      AND (
        (period_start = p_period_from AND period_end = p_period_to)
        OR
        (period_from = p_period_from AND period_to = p_period_to)
        OR
        (period_start = p_period_from AND period_end = p_period_to + 1)
        OR
        (period_from = p_period_from AND period_to = p_period_to + 1)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(coins), 0)
      INTO v_coins
    FROM public.partner_coin_activations
    WHERE partner_id = v_partner.partner_id
      AND activated_at >= p_period_from
      AND activated_at <  (p_period_to + 1)
      AND invoiced = false;

    IF v_coins = 0 THEN
      CONTINUE;
    END IF;

    SELECT p.price_per_coin, p.vat_rate
      INTO v_price_per_coin, v_vat_rate
    FROM public.partners p
    WHERE p.id = v_partner.partner_id;

    IF v_price_per_coin IS NULL THEN
      CONTINUE;
    END IF;

    v_amount_net   := round(v_coins * v_price_per_coin, 2);
    v_vat_amount   := round(v_amount_net * v_vat_rate, 2);
    v_amount_gross := round(v_amount_net + v_vat_amount, 2);

    SELECT gin.invoice_number, gin.variable_symbol
      INTO v_invoice_number, v_variable_symbol
    FROM public.generate_invoice_number(v_issue_date) gin;

    INSERT INTO public.partner_invoices (
      partner_id, period_start, period_end, period_from, period_to,
      invoice_number, variable_symbol, issue_date, due_date, taxable_date,
      coins_total, coins_activated, amount_net, amount_ex_vat, vat_rate,
      vat_amount, amount_gross, amount_inc_vat, status, created_at
    ) VALUES (
      v_partner.partner_id, p_period_from, p_period_to, p_period_from, p_period_to,
      v_invoice_number, v_variable_symbol, v_issue_date, v_due_date, v_taxable_date,
      v_coins, v_coins, v_amount_net, v_amount_net, v_vat_rate,
      v_vat_amount, v_amount_gross, v_amount_gross, 'draft', now()
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.partner_invoice_lines (
      invoice_id, activation_id, external_order_id, coins, activated_at
    )
    SELECT v_invoice_id, id, external_order_id, coins, activated_at
    FROM public.partner_coin_activations
    WHERE partner_id = v_partner.partner_id
      AND activated_at >= p_period_from
      AND activated_at <  (p_period_to + 1)
      AND invoiced = false;

    UPDATE public.partner_coin_activations
    SET invoiced = true
    WHERE id IN (
      SELECT activation_id
      FROM public.partner_invoice_lines
      WHERE invoice_id = v_invoice_id
    );
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_partner_invoice(p_partner_id uuid, p_period_from date, p_period_to date)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_invoice_id uuid;
  v_vat_rate numeric;
  v_price_per_coin numeric;
  v_coins_total numeric;
  v_amount_net numeric;
  v_vat_amount numeric;
  v_amount_gross numeric;
  v_existing_id uuid;
BEGIN
  IF p_period_from IS NULL OR p_period_to IS NULL THEN
    RAISE EXCEPTION 'period_from and period_to must be provided';
  END IF;

  IF p_period_to < p_period_from THEN
    RAISE EXCEPTION 'period_to must be >= period_from';
  END IF;

  IF (p_period_to - p_period_from) > 7 THEN
    RAISE EXCEPTION 'generate_partner_invoice supports MAX 7-day period only';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.partner_invoices
  WHERE partner_id = p_partner_id
    AND (
      (period_start = p_period_from AND period_end = p_period_to)
      OR
      (period_from = p_period_from AND period_to = p_period_to)
    )
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice already exists for partner % period % - %', p_partner_id, p_period_from, p_period_to;
  END IF;

  SELECT vat_rate, price_per_coin
  INTO v_vat_rate, v_price_per_coin
  FROM public.partners
  WHERE id = p_partner_id;

  IF v_price_per_coin IS NULL THEN
    RAISE EXCEPTION 'Partner % not found or invalid pricing', p_partner_id;
  END IF;

  SELECT COALESCE(SUM(coins), 0)
  INTO v_coins_total
  FROM public.partner_coin_activations
  WHERE partner_id = p_partner_id
    AND activated_at::date BETWEEN p_period_from AND p_period_to
    AND invoiced = false;

  IF v_coins_total = 0 THEN
    RAISE EXCEPTION 'No uninvoiced activations for given period';
  END IF;

  v_amount_net   := round(v_coins_total * v_price_per_coin, 2);
  v_vat_amount   := round(v_amount_net * v_vat_rate, 2);
  v_amount_gross := round(v_amount_net + v_vat_amount, 2);

  INSERT INTO public.partner_invoices (
    id, partner_id, period_start, period_end, period_from, period_to,
    coins_total, amount_net, vat_rate, vat_amount, amount_gross,
    status, issued_at, created_at
  ) VALUES (
    gen_random_uuid(), p_partner_id, p_period_from, p_period_to, p_period_from, p_period_to,
    v_coins_total, v_amount_net, v_vat_rate, v_vat_amount, v_amount_gross,
    'draft', now(), now()
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.partner_invoice_lines (
    invoice_id, activation_id, external_order_id, coins, activated_at
  )
  SELECT v_invoice_id, id, external_order_id, coins, activated_at
  FROM public.partner_coin_activations
  WHERE partner_id = p_partner_id
    AND activated_at::date BETWEEN p_period_from AND p_period_to
    AND invoiced = false;

  UPDATE public.partner_coin_activations
  SET invoiced = true
  WHERE id IN (
    SELECT activation_id
    FROM public.partner_invoice_lines
    WHERE invoice_id = v_invoice_id
  );

  RETURN v_invoice_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Odstranit sloupce (aditivní, nikde jinde se nečtou po bodu 1)
--    coins_billable je GENERATED ze coins_free -> dropovat v tomto pořadí.
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_invoice_lines
  DROP COLUMN IF EXISTS coins_billable,
  DROP COLUMN IF EXISTS coins_free;

ALTER TABLE public.partner_invoices
  DROP COLUMN IF EXISTS coins_free_total,
  DROP COLUMN IF EXISTS amount_net_before_discount,
  DROP COLUMN IF EXISTS discount_net,
  DROP COLUMN IF EXISTS discount_reason;

-- ---------------------------------------------------------------------------
-- 3. Helper + nastavení
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.partner_trial_free_mc();
DELETE FROM public.settings WHERE key = 'partner_trial_free_mc_per_reward';

COMMIT;

-- ---------------------------------------------------------------------------
-- 4. Edge Function generate-partner-invoice-pdf
--    Znovu nasadit PŘEDCHOZÍ verzi daného prostředí (zachyceno 03. 09. 2026
--    bezprostředně před nasazením FÁZE 3):
--      produkce v192  ezbr_sha256 ef50f06a4ca1ebe390dd1f5176c5d5318cecebcdd63592696ff73907e05f9165
--    ⚠️ Pokud produkce mezi nasazením a rollbackem povýšila na jinou verzi
--       (jak se to už jednou stalo — z v191 na v192 během této epizody),
--       NEPOUŽÍVEJ tento hash naslepo. Nejdřív ověř aktuální verzi přes
--       get_edge_function a případně zachyť novou "před" verzi.
--    Zdroj v192 je uložen 1:1 (bez trial diffu) v git historii jako
--    `origin/main:supabase/functions/generate-partner-invoice-pdf/index.ts`
--    před merge commitem FÁZE 3 — použij `git show <pre-fáze3-main-sha>:...`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- POSTCHECK (očekáváno: samé 0 + původní md5)
-- ---------------------------------------------------------------------------
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
--      AND table_name='partner_invoices'
--      AND column_name IN ('coins_free_total','amount_net_before_discount','discount_net','discount_reason')) AS inv_cols_left,
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
--      AND table_name='partner_invoice_lines'
--      AND column_name IN ('coins_free','coins_billable'))                                                    AS line_cols_left,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.proname='partner_trial_free_mc')                                        AS helper_left,
--   (SELECT count(*) FROM public.settings WHERE key='partner_trial_free_mc_per_reward')                       AS setting_left,
--   (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.proname='create_partner_invoices_for_last_week')                        AS weekly_md5_expect_bc63ea11,
--   (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.proname='create_partner_invoices_for_period')                           AS period_md5_expect_dec8d897,
--   (SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.proname='generate_partner_invoice')                                     AS generate_md5_expect_3d416d7b;
--
-- POZOR: rollback NEMÍ přepočítávat ani mazat už vystavené faktury.
-- Faktury vydané během FÁZE 3 jsou historický snapshot a zůstávají, jak jsou.
