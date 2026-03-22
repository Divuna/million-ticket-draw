
-- ====================================================================
-- Fix 1: create_partner_invoices_for_last_week (cron job)
-- - Normalize period to Monday–Sunday (Mon date to Sun date)
-- - Check both period_start/period_end AND period_from/period_to for duplicates
-- - Populate all 4 period columns consistently
-- ====================================================================
CREATE OR REPLACE FUNCTION public.create_partner_invoices_for_last_week()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
  -- Last completed week: Monday 00:00 to Sunday 23:59
  -- date_trunc('week', now()) = current Monday
  v_period_start := (date_trunc('week', now())::date) - 7;  -- previous Monday
  v_period_end   := (date_trunc('week', now())::date) - 1;  -- previous Sunday

  -- Issue date = first Monday after period_end = current Monday
  v_issue_date   := date_trunc('week', now())::date;
  v_due_date     := v_issue_date + 7;
  v_taxable_date := v_period_end;

  FOR v_partner IN
    SELECT *
    FROM public.partners
    WHERE status = 'approved'
      AND approved_at IS NOT NULL
      AND suspended_at IS NULL
      AND rejected_at IS NULL
  LOOP
    -- Idempotence: check ALL period column combinations for this partner+week
    SELECT id INTO v_existing_id
    FROM public.partner_invoices
    WHERE partner_id = v_partner.id
      AND (
        -- Match on period_start/period_end
        (period_start = v_period_start AND period_end = v_period_end)
        OR
        -- Match on period_from/period_to
        (period_from = v_period_start AND period_to = v_period_end)
        OR
        -- Match old format where period_to was next Monday
        (period_from = v_period_start AND period_to = v_period_end + 1)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    -- Sum activated coins in period (uninvoiced)
    SELECT COALESCE(SUM(coins), 0)
      INTO v_coins_total
      FROM public.partner_coin_activations
     WHERE partner_id = v_partner.id
       AND invoiced = false
       AND activated_at >= v_period_start
       AND activated_at <  (v_period_end + 1);  -- < next Monday

    IF v_coins_total = 0 THEN
      CONTINUE;
    END IF;

    -- Calculations
    v_amount_net   := v_coins_total * v_partner.price_per_coin;
    v_vat_amount   := v_amount_net * (v_partner.vat_rate / 100);
    v_amount_gross := v_amount_net + v_vat_amount;

    -- Generate invoice number + VS
    SELECT gin.invoice_number, gin.variable_symbol
      INTO v_invoice_number, v_variable_symbol
    FROM public.generate_invoice_number(v_issue_date) gin;

    -- Create invoice with ALL period columns populated
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
    )
    VALUES (
      v_partner.id,
      v_period_start,
      v_period_end,
      v_period_start,
      v_period_end,
      v_invoice_number,
      v_variable_symbol,
      v_issue_date,
      v_due_date,
      v_taxable_date,
      v_coins_total,
      v_coins_total,
      v_amount_net,
      v_amount_net,
      v_partner.vat_rate,
      v_vat_amount,
      v_amount_gross,
      v_amount_gross,
      'draft',
      now()
    )
    RETURNING id INTO v_invoice_id;

    -- Mark coins as invoiced
    UPDATE public.partner_coin_activations
       SET invoiced = true
     WHERE partner_id = v_partner.id
       AND invoiced = false
       AND activated_at >= v_period_start
       AND activated_at <  (v_period_end + 1);

    -- Enqueue email
    PERFORM public.enqueue_partner_invoice_email(v_invoice_id);
  END LOOP;
END;
$function$;


-- ====================================================================
-- Fix 2: create_partner_invoices_for_period (manual trigger)
-- - Add duplicate check before insert
-- - Populate all 4 period columns
-- ====================================================================
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
    -- Idempotence: check for existing invoice for this partner+period
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
    )
    SELECT
      p.id,
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
      (v_coins * p.price_per_coin),
      (v_coins * p.price_per_coin),
      p.vat_rate,
      (v_coins * p.price_per_coin * p.vat_rate),
      (v_coins * p.price_per_coin * (1 + p.vat_rate)),
      (v_coins * p.price_per_coin * (1 + p.vat_rate)),
      'draft',
      now()
    FROM public.partners p
    WHERE p.id = v_partner.partner_id
    RETURNING id INTO v_invoice_id;

    UPDATE public.partner_coin_activations
    SET invoiced = true
    WHERE partner_id = v_partner.partner_id
      AND activated_at >= p_period_from
      AND activated_at <  (p_period_to + 1)
      AND invoiced = false;
  END LOOP;
END;
$function$;


-- ====================================================================
-- Fix 3: generate_partner_invoice (single partner, manual)
-- - Add duplicate check before insert
-- ====================================================================
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
  -- Validate period
  IF p_period_from IS NULL OR p_period_to IS NULL THEN
    RAISE EXCEPTION 'period_from and period_to must be provided';
  END IF;

  IF p_period_to < p_period_from THEN
    RAISE EXCEPTION 'period_to must be >= period_from';
  END IF;

  IF (p_period_to - p_period_from) > 7 THEN
    RAISE EXCEPTION 'generate_partner_invoice supports MAX 7-day period only';
  END IF;

  -- Idempotence: check for existing invoice
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
    RAISE EXCEPTION 'Invoice already exists for partner % period % – %', p_partner_id, p_period_from, p_period_to;
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

  v_amount_net := v_coins_total * v_price_per_coin;
  v_vat_amount := v_amount_net * (v_vat_rate / 100);
  v_amount_gross := v_amount_net + v_vat_amount;

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

  RETURN v_invoice_id;
END;
$function$;
;
