-- ============================================================================
-- FÁZE 3 — Zahajovací sleva ve fakturaci partnera
--
-- ⚠️ TENTO SOUBOR JE ZPĚTNÝ ZÁZNAM JIŽ APLIKOVANÉ PRODUKČNÍ MIGRACE.
--    Verze `20260903200935` (`partner_trial_invoice_discount_prod_parity_fix`)
--    je na produkci `xkzhjldrojjlrkezorey` aplikovaná od 03. 09. 2026. SQL níže
--    je doslovný přepis `supabase_migrations.schema_migrations.statements` pro
--    tuto verzi (read-only export, 05. 09. 2026) — nic se jím znovu nenasazuje.
--
-- Pravidlo (Pavel, 03. 09. 2026):
--   O nároku na slevu rozhoduje ČAS AKTIVACE, ne čas vydání odměny:
--       activated_at >= partners.trial_started_at
--   AND activated_at <  partners.trial_ends_at        (konec EXKLUZIVNĚ)
--
--   free_mc     = least(activated_mc, partner_trial_free_mc())   -- default 2
--   billable_mc = coins - coins_free                             -- generated column
--   Mimo trial: coins_free = 0, tedy billable = coins.
--
--   Faktura zůstává normální fakturou v normální číselné řadě i při 0 Kč
--   a musí ukázat PLNOU hodnotu aktivovaných MioCoinů i slevu vedle sebe.
--   `coins_total` se NEPŘEPISUJE na nižší hodnotu.
--
-- ZÁVAZNÉ INVARIANTY:
--   * `amount_net_before_discount - discount_net = amount_net`.
--   * DPH se počítá až ze ZÁKLADU PO SLEVĚ (`v_amount_net * vat_rate`).
--     `vat_rate` zůstává zlomek (0.21), nikdy procento — viz `CLAUDE.md`.
--   * `coins_billable` je GENERATED ALWAYS AS (coins - coins_free) STORED —
--     nikdy se nezapisuje ručně.
--   * Strop zdarma má jediný zdroj: `public.partner_trial_free_mc()` čtoucí
--     settings `partner_trial_free_mc_per_reward`. Žádná funkce si dvojku
--     nedefinuje sama.
--   * Všechny tři fakturační funkce musí zůstat konzistentní — kdo mění jednu,
--     mění všechny tři.
--
-- ⚠️ PARITA S ŽIVOU PRODUKCÍ:
--   Přípona `_prod_parity_fix` v názvu produkční verze je záměrná — všechny tři
--   funkce byly psány přepisem ŽIVÝCH produkčních definic (ne stagingových),
--   aby migrace nezanesla staging drift do produkce.
--
-- STAV K 05. 09. 2026: produkce má 0 faktur s vyplněným
--   `amount_net_before_discount` — slevová logika je nasazená, ale zatím ji
--   žádná faktura nepoužila.
--
-- NAVAZUJE: `supabase/functions/generate-partner-invoice-pdf/index.ts` (v194)
--   zobrazuje slevu v PDF a vrací `trial_discount_rendered`.
--
-- ROLLBACK: viz docs/rollback/phase3_partner_trial_invoice_discount_rollback.sql
-- ============================================================================

INSERT INTO public.settings (key, value)
VALUES ('partner_trial_free_mc_per_reward', '2')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.partner_trial_free_mc()
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(regexp_replace(
      (SELECT s.value FROM public.settings s WHERE s.key = 'partner_trial_free_mc_per_reward'),
      '[^0-9.]', '', 'g'), '')::numeric,
    2);
$$;
REVOKE ALL ON FUNCTION public.partner_trial_free_mc() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_trial_free_mc() TO authenticated, service_role;

ALTER TABLE public.partner_invoice_lines
  ADD COLUMN IF NOT EXISTS coins_free numeric NOT NULL DEFAULT 0;

ALTER TABLE public.partner_invoice_lines
  ADD COLUMN IF NOT EXISTS coins_billable numeric
    GENERATED ALWAYS AS (coins - coins_free) STORED;

ALTER TABLE public.partner_invoices
  ADD COLUMN IF NOT EXISTS coins_free_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS amount_net_before_discount numeric,
  ADD COLUMN IF NOT EXISTS discount_net numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_reason text;

COMMENT ON COLUMN public.partner_invoices.amount_net_before_discount IS
  'Standardní hodnota všech aktivovaných MioCoinů před zahajovací slevou. '
  'Invariant: amount_net_before_discount - discount_net = amount_net.';
COMMENT ON COLUMN public.partner_invoice_lines.coins_free IS
  'MioCoiny této aktivace pokryté zahajovací akcí (0 mimo trial).';

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
  v_coins_free numeric;
  v_amount_before numeric;
  v_discount_net numeric;
  v_amount_net numeric;
  v_vat_amount numeric;
  v_amount_gross numeric;
  v_invoice_number text;
  v_variable_symbol text;
  v_issue_date date;
  v_due_date date;
  v_taxable_date date;
  v_existing_id uuid;
  v_free_cap numeric := public.partner_trial_free_mc();
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

    SELECT COALESCE(SUM(coins), 0),
           COALESCE(SUM(
             CASE WHEN v_partner.trial_started_at IS NOT NULL
                   AND v_partner.trial_ends_at IS NOT NULL
                   AND activated_at >= v_partner.trial_started_at
                   AND activated_at <  v_partner.trial_ends_at
                  THEN LEAST(coins, v_free_cap) ELSE 0 END), 0)
      INTO v_coins_total, v_coins_free
      FROM public.partner_coin_activations
     WHERE partner_id = v_partner.id
       AND invoiced = false
       AND activated_at >= v_period_start
       AND activated_at < (v_period_end + 1);

    IF v_coins_total = 0 THEN
      CONTINUE;
    END IF;

    v_amount_before := round(v_coins_total * v_partner.price_per_coin, 2);
    v_discount_net  := round(v_coins_free  * v_partner.price_per_coin, 2);
    v_amount_net    := v_amount_before - v_discount_net;
    v_vat_amount    := round(v_amount_net * v_partner.vat_rate, 2);
    v_amount_gross  := round(v_amount_net + v_vat_amount, 2);

    SELECT gin.invoice_number, gin.variable_symbol
      INTO v_invoice_number, v_variable_symbol
    FROM public.generate_invoice_number(v_issue_date) gin;

    INSERT INTO public.partner_invoices (
      partner_id, period_start, period_end, period_from, period_to,
      invoice_number, variable_symbol, issue_date, due_date, taxable_date,
      coins_total, coins_activated, amount_net, amount_ex_vat, vat_rate,
      vat_amount, amount_gross, amount_inc_vat, status, created_at,
      coins_free_total, amount_net_before_discount, discount_net, discount_reason
    ) VALUES (
      v_partner.id, v_period_start, v_period_end, v_period_start, v_period_end,
      v_invoice_number, v_variable_symbol, v_issue_date, v_due_date, v_taxable_date,
      v_coins_total, v_coins_total, v_amount_net, v_amount_net, v_partner.vat_rate,
      v_vat_amount, v_amount_gross, v_amount_gross, 'draft', now(),
      v_coins_free, v_amount_before, v_discount_net,
      CASE WHEN v_coins_free > 0
           THEN 'Zahajovací akce OneMil – první ' || trim(to_char(v_free_cap, 'FM999999990.99'))
                || ' MioCoiny z každé aktivované odměny zdarma'
           ELSE NULL END
    ) RETURNING id INTO v_invoice_id;

    INSERT INTO public.partner_invoice_lines (
      invoice_id, activation_id, external_order_id, coins, activated_at, coins_free
    )
    SELECT v_invoice_id, id, external_order_id, coins, activated_at,
           CASE WHEN v_partner.trial_started_at IS NOT NULL
                 AND v_partner.trial_ends_at IS NOT NULL
                 AND activated_at >= v_partner.trial_started_at
                 AND activated_at <  v_partner.trial_ends_at
                THEN LEAST(coins, v_free_cap) ELSE 0 END
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
  v_coins_free numeric;
  v_invoice_id uuid;
  v_invoice_number text;
  v_variable_symbol text;
  v_issue_date date;
  v_due_date date;
  v_taxable_date date;
  v_existing_id uuid;
  v_price_per_coin numeric;
  v_vat_rate numeric;
  v_trial_start timestamptz;
  v_trial_end timestamptz;
  v_amount_before numeric;
  v_discount_net numeric;
  v_amount_net numeric;
  v_vat_amount numeric;
  v_amount_gross numeric;
  v_free_cap numeric := public.partner_trial_free_mc();
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

    SELECT p.price_per_coin, p.vat_rate, p.trial_started_at, p.trial_ends_at
      INTO v_price_per_coin, v_vat_rate, v_trial_start, v_trial_end
    FROM public.partners p
    WHERE p.id = v_partner.partner_id;

    IF v_price_per_coin IS NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(
             CASE WHEN v_trial_start IS NOT NULL AND v_trial_end IS NOT NULL
                   AND activated_at >= v_trial_start
                   AND activated_at <  v_trial_end
                  THEN LEAST(coins, v_free_cap) ELSE 0 END), 0)
      INTO v_coins_free
    FROM public.partner_coin_activations
    WHERE partner_id = v_partner.partner_id
      AND activated_at >= p_period_from
      AND activated_at <  (p_period_to + 1)
      AND invoiced = false;

    v_amount_before := round(v_coins * v_price_per_coin, 2);
    v_discount_net  := round(v_coins_free * v_price_per_coin, 2);
    v_amount_net    := v_amount_before - v_discount_net;
    v_vat_amount    := round(v_amount_net * v_vat_rate, 2);
    v_amount_gross  := round(v_amount_net + v_vat_amount, 2);

    SELECT gin.invoice_number, gin.variable_symbol
      INTO v_invoice_number, v_variable_symbol
    FROM public.generate_invoice_number(v_issue_date) gin;

    INSERT INTO public.partner_invoices (
      partner_id, period_start, period_end, period_from, period_to,
      invoice_number, variable_symbol, issue_date, due_date, taxable_date,
      coins_total, coins_activated, amount_net, amount_ex_vat, vat_rate,
      vat_amount, amount_gross, amount_inc_vat, status, created_at,
      coins_free_total, amount_net_before_discount, discount_net, discount_reason
    ) VALUES (
      v_partner.partner_id, p_period_from, p_period_to, p_period_from, p_period_to,
      v_invoice_number, v_variable_symbol, v_issue_date, v_due_date, v_taxable_date,
      v_coins, v_coins, v_amount_net, v_amount_net, v_vat_rate,
      v_vat_amount, v_amount_gross, v_amount_gross, 'draft', now(),
      v_coins_free, v_amount_before, v_discount_net,
      CASE WHEN v_coins_free > 0
           THEN 'Zahajovací akce OneMil – první ' || trim(to_char(v_free_cap, 'FM999999990.99'))
                || ' MioCoiny z každé aktivované odměny zdarma'
           ELSE NULL END
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.partner_invoice_lines (
      invoice_id, activation_id, external_order_id, coins, activated_at, coins_free
    )
    SELECT v_invoice_id, id, external_order_id, coins, activated_at,
           CASE WHEN v_trial_start IS NOT NULL AND v_trial_end IS NOT NULL
                 AND activated_at >= v_trial_start
                 AND activated_at <  v_trial_end
                THEN LEAST(coins, v_free_cap) ELSE 0 END
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
  v_trial_start timestamptz;
  v_trial_end timestamptz;
  v_coins_total numeric;
  v_coins_free numeric;
  v_amount_before numeric;
  v_discount_net numeric;
  v_amount_net numeric;
  v_vat_amount numeric;
  v_amount_gross numeric;
  v_existing_id uuid;
  v_free_cap numeric := public.partner_trial_free_mc();
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

  SELECT vat_rate, price_per_coin, trial_started_at, trial_ends_at
  INTO v_vat_rate, v_price_per_coin, v_trial_start, v_trial_end
  FROM public.partners
  WHERE id = p_partner_id;

  IF v_price_per_coin IS NULL THEN
    RAISE EXCEPTION 'Partner % not found or invalid pricing', p_partner_id;
  END IF;

  SELECT COALESCE(SUM(coins), 0),
         COALESCE(SUM(
           CASE WHEN v_trial_start IS NOT NULL AND v_trial_end IS NOT NULL
                 AND activated_at >= v_trial_start
                 AND activated_at <  v_trial_end
                THEN LEAST(coins, v_free_cap) ELSE 0 END), 0)
  INTO v_coins_total, v_coins_free
  FROM public.partner_coin_activations
  WHERE partner_id = p_partner_id
    AND activated_at::date BETWEEN p_period_from AND p_period_to
    AND invoiced = false;

  IF v_coins_total = 0 THEN
    RAISE EXCEPTION 'No uninvoiced activations for given period';
  END IF;

  v_amount_before := round(v_coins_total * v_price_per_coin, 2);
  v_discount_net  := round(v_coins_free  * v_price_per_coin, 2);
  v_amount_net    := v_amount_before - v_discount_net;
  v_vat_amount    := round(v_amount_net * v_vat_rate, 2);
  v_amount_gross  := round(v_amount_net + v_vat_amount, 2);

  INSERT INTO public.partner_invoices (
    id, partner_id, period_start, period_end, period_from, period_to,
    coins_total, amount_net, vat_rate, vat_amount, amount_gross,
    status, issued_at, created_at,
    coins_free_total, amount_net_before_discount, discount_net, discount_reason
  ) VALUES (
    gen_random_uuid(), p_partner_id, p_period_from, p_period_to, p_period_from, p_period_to,
    v_coins_total, v_amount_net, v_vat_rate, v_vat_amount, v_amount_gross,
    'draft', now(), now(),
    v_coins_free, v_amount_before, v_discount_net,
    CASE WHEN v_coins_free > 0
         THEN 'Zahajovací akce OneMil – první ' || trim(to_char(v_free_cap, 'FM999999990.99'))
              || ' MioCoiny z každé aktivované odměny zdarma'
         ELSE NULL END
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.partner_invoice_lines (
    invoice_id, activation_id, external_order_id, coins, activated_at, coins_free
  )
  SELECT v_invoice_id, id, external_order_id, coins, activated_at,
         CASE WHEN v_trial_start IS NOT NULL AND v_trial_end IS NOT NULL
               AND activated_at >= v_trial_start
               AND activated_at <  v_trial_end
              THEN LEAST(coins, v_free_cap) ELSE 0 END
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
