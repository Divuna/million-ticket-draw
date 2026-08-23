-- F1: partner invoice money must be CZK with at most 2 decimal places.
--
-- Partner MioCoins became decimal (1 decimal place, min 0.5 MC) in
-- 20260818100000..20260818100300. The three coin-invoice functions were never
-- updated with it: they multiplied the coin amount straight into the money
-- columns with no rounding. `vat_amount`, `amount_ex_vat` and `amount_inc_vat`
-- are numeric(14,2) so they silently truncated, but `amount_net` and
-- `amount_gross` are unconstrained numeric and kept the full expansion.
--
-- Concrete consequence for 11.5 MC at 1 CZK/MC and 21% VAT:
--     amount_net   = 11.50
--     vat_amount   = 2.42        (rounded by the column type)
--     amount_gross = 13.915      (NOT rounded -> 3 decimals on an invoice)
--     amount_inc_vat = 13.92     (rounded by the column type)
-- so amount_net + vat_amount <> amount_gross, and amount_gross <> amount_inc_vat.
-- Two columns holding the same figure disagreed, and the partner-facing UI and
-- PDF read amount_gross.
--
-- Rounding rule applied here (same in all three functions):
--     amount_net   = round(coins * price_per_coin, 2)
--     vat_amount   = round(amount_net * vat_rate, 2)   -- from the ROUNDED net
--     amount_gross = round(amount_net + vat_amount, 2) -- net + VAT, always
-- so amount_net + vat_amount = amount_gross holds by construction.
--
-- NOT changed by this migration:
--   * 1 MC = 1 CZK excl. VAT (partners.price_per_coin stays the only source),
--   * vat_rate stays a fraction (0.21), never a percent -- see 20260629180000,
--   * MioCoin quantities keep their 1-decimal rule and their CHECK constraints,
--   * period/idempotency/line-snapshot/invoiced-flag logic is byte-identical,
--   * no existing invoice row is read, updated or recalculated.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Weekly cron path (pg_cron job 17 -> partner-invoice-auto-send).
--    Body identical to the deployed version except the money block.
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

    -- Money is CZK: 2 decimal places. VAT is derived from the ROUNDED net and
    -- gross from the rounded parts, so amount_gross = amount_net + vat_amount
    -- always holds. vat_rate is a fraction (0.21), never a percent.
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

-- The weekly function stays internal-only (20260718090000). CREATE OR REPLACE
-- preserves the ACL, but re-assert it so the migration is self-contained.
REVOKE ALL ON FUNCTION public.create_partner_invoices_for_last_week()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_invoices_for_last_week()
TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Explicit period path (admin / backfill).
--    The deployed version computed the money inline inside INSERT..SELECT.
--    The amounts are hoisted into variables so VAT can be taken from the
--    already-rounded net; everything else is unchanged.
-- ---------------------------------------------------------------------------
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

    -- A partner without pricing must not produce a zero-value invoice.
    IF v_price_per_coin IS NULL THEN
      CONTINUE;
    END IF;

    -- Money is CZK: 2 decimal places. VAT from the ROUNDED net, gross from the
    -- rounded parts, so amount_gross = amount_net + vat_amount always holds.
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

-- ---------------------------------------------------------------------------
-- 3. Single-partner path (max 7-day period).
--    Body identical to the deployed version except the money block.
-- ---------------------------------------------------------------------------
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

  -- Money is CZK: 2 decimal places. VAT from the ROUNDED net, gross from the
  -- rounded parts, so amount_gross = amount_net + vat_amount always holds.
  -- vat_rate is a fraction (0.21), not a percent -> no /100 (see 20260629180000).
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
-- 4. Database-level guard.
--    The functions above are not the only possible writer, so the invariant is
--    also enforced by the table. These CHECKs test the VALUE, not the display
--    scale: 12.10000000 = round(12.10000000, 2) is true, so every existing row
--    (production and staging, verified before writing this migration) passes
--    and NO existing invoice is rewritten. Columns stay `numeric` on purpose --
--    an ALTER TYPE would rewrite already-issued invoices.
-- ---------------------------------------------------------------------------
ALTER TABLE public.partner_invoices
  ADD CONSTRAINT partner_invoices_amount_net_2dp
    CHECK (amount_net IS NULL OR amount_net = round(amount_net, 2)),
  ADD CONSTRAINT partner_invoices_vat_amount_2dp
    CHECK (vat_amount IS NULL OR vat_amount = round(vat_amount, 2)),
  ADD CONSTRAINT partner_invoices_amount_gross_2dp
    CHECK (amount_gross IS NULL OR amount_gross = round(amount_gross, 2)),
  ADD CONSTRAINT partner_invoices_amount_ex_vat_2dp
    CHECK (amount_ex_vat IS NULL OR amount_ex_vat = round(amount_ex_vat, 2)),
  ADD CONSTRAINT partner_invoices_amount_inc_vat_2dp
    CHECK (amount_inc_vat IS NULL OR amount_inc_vat = round(amount_inc_vat, 2));

COMMIT;
