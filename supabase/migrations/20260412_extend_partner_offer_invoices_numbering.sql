-- Block 2: Invoice numbering for create_partner_offer_invoices_for_period
-- ─────────────────────────────────────────────────────────────────────────────
-- Changes vs. the previous version:
--   • Declares v_invoice_number / v_variable_symbol and calls
--     generate_invoice_number(v_issue_date) before every INSERT — same
--     sequential OMA-YYYY#### numbering used by coin invoices.
--   • Sets issue_date (CURRENT_DATE), due_date (CURRENT_DATE + 14),
--     taxable_date (p_end) — mirrors create_partner_invoices_for_period.
--   • Stores vat_rate = 21 explicitly (column is NOT NULL; value matches the
--     hardcoded 0.21/1.21 multipliers already present in the function).
--   • All other logic (billing_mode filter, idempotency check, line items,
--     invoiced flag, returned jsonb) is unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_partner_offer_invoices_for_period(
  p_start date,
  p_end   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rec               record;
  act               record;
  new_inv_id        uuid;
  net_amount        numeric(12,2);
  inv_count         integer := 0;
  total_act_count   integer := 0;
  -- invoice numbering
  v_invoice_number  text;
  v_variable_symbol text;
  v_issue_date      date;
  v_due_date        date;
  v_taxable_date    date;
BEGIN
  -- Date fields — same pattern as create_partner_invoices_for_period
  v_issue_date   := CURRENT_DATE;
  v_due_date     := CURRENT_DATE + 14;
  v_taxable_date := p_end;

  FOR rec IN
    SELECT
      cfg.partner_id,
      cfg.price_per_activation,
      COUNT(poa.id)::integer AS activations
    FROM partner_offer_billing_configs cfg
    JOIN partner_offer_activations poa ON poa.partner_id = cfg.partner_id
    WHERE cfg.billing_mode = 'paid_distribution'
      AND poa.activated_at >= p_start::timestamptz
      AND poa.activated_at <  (p_end + 1)::timestamptz
      AND NOT poa.invoiced
      AND NOT EXISTS (
        SELECT 1
        FROM partner_invoices pi
        WHERE pi.partner_id  = cfg.partner_id
          AND pi.type        = 'offer'
          AND pi.period_start = p_start
          AND pi.period_end   = p_end
          AND pi.status      != 'void'
      )
    GROUP BY cfg.partner_id, cfg.price_per_activation
    HAVING COUNT(poa.id) > 0
  LOOP
    net_amount := rec.activations * rec.price_per_activation;

    -- Generate unique sequential invoice number for this invoice
    SELECT gin.invoice_number, gin.variable_symbol
      INTO v_invoice_number, v_variable_symbol
    FROM public.generate_invoice_number(v_issue_date) gin;

    INSERT INTO partner_invoices (
      partner_id,
      period_start,
      period_end,
      type,
      invoice_number,
      variable_symbol,
      issue_date,
      due_date,
      taxable_date,
      coins_activated,
      amount_ex_vat,
      vat_rate,
      vat_amount,
      amount_inc_vat,
      amount_net,
      amount_gross,
      status
    ) VALUES (
      rec.partner_id,
      p_start,
      p_end,
      'offer',
      v_invoice_number,
      v_variable_symbol,
      v_issue_date,
      v_due_date,
      v_taxable_date,
      0,
      net_amount,
      21,
      round(net_amount * 0.21, 2),
      round(net_amount * 1.21, 2),
      net_amount,
      round(net_amount * 1.21, 2),
      'draft'
    )
    RETURNING id INTO new_inv_id;

    FOR act IN
      SELECT id, activated_at
      FROM partner_offer_activations
      WHERE partner_id   = rec.partner_id
        AND activated_at >= p_start::timestamptz
        AND activated_at <  (p_end + 1)::timestamptz
        AND NOT invoiced
    LOOP
      INSERT INTO partner_offer_invoice_lines (
        invoice_id,
        activation_id,
        activated_at,
        amount
      ) VALUES (
        new_inv_id,
        act.id,
        act.activated_at,
        rec.price_per_activation
      );

      UPDATE partner_offer_activations
         SET invoiced   = true,
             invoice_id = new_inv_id
       WHERE id = act.id;
    END LOOP;

    inv_count       := inv_count + 1;
    total_act_count := total_act_count + rec.activations;
  END LOOP;

  RETURN jsonb_build_object(
    'invoices_created',   inv_count,
    'activations_billed', total_act_count,
    'period_start',       p_start,
    'period_end',         p_end
  );
END;
$$;
