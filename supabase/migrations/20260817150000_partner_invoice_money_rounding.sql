-- Partner coin invoices: CZK amounts must be stored rounded to 2 decimal places.
--
-- BUG (verified on staging dxmowysntemfqfnanxua, 17. 08. 2026)
--   A 4.3 MC invoice at price_per_coin = 1 Kč and vat_rate = 0.21 stored:
--       amount_net   = 4.30000
--       vat_amount   = 0.90        (only because the column is numeric(14,2))
--       amount_gross = 5.203000000
--   Expected: 4.30 / 0.90 / 5.20.
--
-- WHY ONLY SOME COLUMNS SHOWED IT
--   amount_ex_vat, vat_amount and amount_inc_vat are numeric(14,2), so the column
--   type silently rounded them. amount_net and amount_gross are UNCONSTRAINED
--   numeric, so they kept the raw product. The money was therefore wrong in the
--   database even where the PDF happened to look right (the PDF's formatCurrency
--   rounds for display only).
--
-- ROOT CAUSE (three live invoice creators, none of which rounded money)
--   create_partner_invoices_for_last_week:
--       v_amount_net   := v_coins_total * price_per_coin
--       v_vat_amount   := v_amount_net * vat_rate
--       v_amount_gross := v_amount_net + v_vat_amount
--   generate_partner_invoice: identical shape.
--   create_partner_invoices_for_period: worse — it wrote raw expressions inline and
--       derived gross from its OWN formula rather than from net + VAT:
--           amount_net   = (coins * price_per_coin)
--           vat_amount   = (coins * price_per_coin * vat_rate)      -- from UNROUNDED net
--           amount_gross = (coins * price_per_coin * (1 + vat_rate))
--       Rounding those three independently could still leave gross <> net + vat.
--
-- THE RULE APPLIED HERE (money only — MioCoin quantity rules are untouched)
--       amount_net   = round(coins_total * price_per_coin, 2)
--       vat_amount   = round(amount_net * vat_rate, 2)      -- from the ROUNDED net
--       amount_gross = round(amount_net + vat_amount, 2)    -- never its own formula
--   so 4.30 + 0.90 = 5.20 always holds. Legacy aliases stay consistent:
--       amount_ex_vat  = amount_net
--       amount_inc_vat = amount_gross
--
-- NOT CHANGED
--   * create_partner_offer_invoices_for_period — audited and already correct. Its
--     net_amount is numeric(12,2), and for a net that is already exact to 2 dp,
--     round(net * 1.21, 2) is identically net + round(net * 0.21, 2), so its gross
--     can never disagree with net + VAT. Left alone deliberately.
--   * vat_rate, price_per_coin, the MioCoin price, invoice periods, invoice
--     numbering, status logic, invoice lines, activation flagging, affiliate
--     commission — all byte-for-byte as before. Only the money maths changed.
--   * Function signatures and volatility are preserved
--     (last_week -> TABLE(invoice_id uuid), period -> void, generate -> uuid), and
--     CREATE OR REPLACE keeps the existing EXECUTE grants on each function.
--   * NO historical data is touched. This migration contains no UPDATE and no
--     backfill; existing invoices keep whatever they already stored.
--
-- Rollback: restore the three bodies from their previous definitions
--   (20260612125606_partner_invoice_line_snapshots.sql +
--    20260629180000_partner_invoice_vat_fraction_fix.sql +
--    20260717230000_partner_invoice_auto_send_toggle.sql).

begin;

-- ── 1. Weekly cron path ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_partner_invoices_for_last_week()
RETURNS TABLE(invoice_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_start date;
  v_period_end   date;
  v_partner      record;
  v_invoice_id   uuid;
  v_coins_total  numeric;
  v_amount_net   numeric;
  v_vat_amount   numeric;
  v_amount_gross numeric;
  v_invoice_number text;
  v_variable_symbol text;
  v_issue_date   date;
  v_due_date     date;
  v_taxable_date date;
  v_existing_id  uuid;
BEGIN
  v_period_start := (date_trunc('week', now())::date) - 7;
  v_period_end   := (date_trunc('week', now())::date) - 1;
  v_issue_date   := date_trunc('week', now())::date;
  v_due_date     := v_issue_date + 7;
  v_taxable_date := v_period_end;

  FOR v_partner IN
    SELECT * FROM public.partners
    WHERE status = 'approved' AND approved_at IS NOT NULL
      AND suspended_at IS NULL AND rejected_at IS NULL
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
    IF v_existing_id IS NOT NULL THEN CONTINUE; END IF;

    SELECT COALESCE(SUM(coins), 0) INTO v_coins_total
      FROM public.partner_coin_activations
     WHERE partner_id = v_partner.id AND invoiced = false
       AND activated_at >= v_period_start AND activated_at < (v_period_end + 1);
    IF v_coins_total = 0 THEN CONTINUE; END IF;

    -- Money is CZK: 2 decimal places, VAT from the rounded net, gross from the
    -- rounded parts so amount_gross = amount_net + vat_amount always holds.
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

    INSERT INTO public.partner_invoice_lines (invoice_id, activation_id, external_order_id, coins, activated_at)
    SELECT v_invoice_id, id, external_order_id, coins, activated_at
    FROM public.partner_coin_activations
    WHERE partner_id = v_partner.id AND invoiced = false
      AND activated_at >= v_period_start AND activated_at < (v_period_end + 1);

    UPDATE public.partner_coin_activations SET invoiced = true
     WHERE id IN (SELECT l.activation_id FROM public.partner_invoice_lines l WHERE l.invoice_id = v_invoice_id);

    invoice_id := v_invoice_id;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$$;

-- ── 2. Explicit period path ──────────────────────────────────────────────────
-- Structural note: the money is now computed into locals BEFORE the INSERT.
-- Previously the INSERT selected raw expressions straight from public.partners,
-- which is what let amount_gross be derived from its own formula instead of from
-- net + VAT. Partner selection, idempotency and every other statement are unchanged.

CREATE OR REPLACE FUNCTION public.create_partner_invoices_for_period(p_period_from date, p_period_to date)
RETURNS void
LANGUAGE plpgsql
AS $$
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

    -- Money is CZK: 2 decimal places, VAT from the rounded net, gross from the
    -- rounded parts so amount_gross = amount_net + vat_amount always holds.
    v_amount_net   := round(v_coins * v_price_per_coin, 2);
    v_vat_amount   := round(v_amount_net * v_vat_rate, 2);
    v_amount_gross := round(v_amount_net + v_vat_amount, 2);

    SELECT gin.invoice_number, gin.variable_symbol
      INTO v_invoice_number, v_variable_symbol
    FROM public.generate_invoice_number(v_issue_date) gin;

    INSERT INTO public.partner_invoices (
      partner_id,
      period_start,
      period_end,
      period_from,
      period_to,
      invoice_number,
      variable_symbol,
      issue_date,
      due_date,
      taxable_date,
      coins_total,
      coins_activated,
      amount_net,
      amount_ex_vat,
      vat_rate,
      vat_amount,
      amount_gross,
      amount_inc_vat,
      status,
      created_at
    ) VALUES (
      v_partner.partner_id,
      p_period_from,
      p_period_to,
      p_period_from,
      p_period_to,
      v_invoice_number,
      v_variable_symbol,
      v_issue_date,
      v_due_date,
      v_taxable_date,
      v_coins,
      v_coins,
      v_amount_net,
      v_amount_net,
      v_vat_rate,
      v_vat_amount,
      v_amount_gross,
      v_amount_gross,
      'draft',
      now()
    )
    RETURNING id INTO v_invoice_id;

    INSERT INTO public.partner_invoice_lines (
      invoice_id,
      activation_id,
      external_order_id,
      coins,
      activated_at
    )
    SELECT
      v_invoice_id,
      id,
      external_order_id,
      coins,
      activated_at
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
$$;

-- ── 3. Single-partner manual path ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.generate_partner_invoice(p_partner_id uuid, p_period_from date, p_period_to date)
RETURNS uuid
LANGUAGE plpgsql
AS $$
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

  -- vat_rate is a fraction (0.21), not a percent -> no /100.
  -- Money is CZK: 2 decimal places, VAT from the rounded net, gross from the
  -- rounded parts so amount_gross = amount_net + vat_amount always holds.
  v_amount_net   := round(v_coins_total * v_price_per_coin, 2);
  v_vat_amount   := round(v_amount_net * v_vat_rate, 2);
  v_amount_gross := round(v_amount_net + v_vat_amount, 2);

  INSERT INTO public.partner_invoices (
    id,
    partner_id,
    period_start,
    period_end,
    period_from,
    period_to,
    coins_total,
    amount_net,
    vat_rate,
    vat_amount,
    amount_gross,
    status,
    issued_at,
    created_at
  ) VALUES (
    gen_random_uuid(),
    p_partner_id,
    p_period_from,
    p_period_to,
    p_period_from,
    p_period_to,
    v_coins_total,
    v_amount_net,
    v_vat_rate,
    v_vat_amount,
    v_amount_gross,
    'draft',
    now(),
    now()
  )
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.partner_invoice_lines (
    invoice_id,
    activation_id,
    external_order_id,
    coins,
    activated_at
  )
  SELECT
    v_invoice_id,
    id,
    external_order_id,
    coins,
    activated_at
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
$$;

COMMENT ON FUNCTION public.create_partner_invoices_for_last_week() IS
  'Weekly partner coin invoicing. CZK amounts are stored rounded to 2 decimals: amount_net = round(coins * price_per_coin, 2), vat_amount = round(amount_net * vat_rate, 2), amount_gross = round(amount_net + vat_amount, 2).';
COMMENT ON FUNCTION public.create_partner_invoices_for_period(date, date) IS
  'Partner coin invoicing for an explicit period. CZK amounts are stored rounded to 2 decimals and amount_gross is derived from the rounded net + rounded VAT, never from its own formula.';
COMMENT ON FUNCTION public.generate_partner_invoice(uuid, date, date) IS
  'Single-partner coin invoice for a max 7-day period. CZK amounts are stored rounded to 2 decimals; amount_gross = amount_net + vat_amount.';

commit;
