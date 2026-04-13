-- Block 2 (per-offer billing): update create_partner_offer_invoices_for_period
-- ─────────────────────────────────────────────────────────────────────────────
-- Changes vs. previous version (20260412_extend_partner_offer_invoices_numbering):
--   • Billing source changed from partner_offer_billing_configs (partner-level)
--     to partner_offers (offer-level) via poa.offer_id.
--   • billing_mode = 'paid_distribution' filter now reads from partner_offers.
--   • price_per_activation per invoice line now reads from partner_offers
--     (each activation can carry a different price from its offer).
--   • net_amount is SUM(po.price_per_activation) over the period, not a flat
--     partner-level rate × count.
--   • Other modes (affiliate_direct / affiliate_external / hybrid / free) are
--     excluded from billing — activations are not invoiced and not marked
--     invoiced=true for those modes.
--   • Everything else (idempotency check, invoice numbering, line INSERT,
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

  -- ── Outer loop: one invoice per partner with paid_distribution activations ──
  FOR rec IN
    SELECT
      poa.partner_id,
      SUM(po.price_per_activation)::numeric(12,2)  AS net_amount,
      COUNT(poa.id)::integer                        AS activations
    FROM partner_offer_activations poa
    JOIN partner_offers po ON po.id = poa.offer_id
    WHERE po.billing_mode           = 'paid_distribution'
      AND poa.activated_at         >= p_start::timestamptz
      AND poa.activated_at          < (p_end + 1)::timestamptz
      AND NOT poa.invoiced
      AND NOT EXISTS (
        SELECT 1
        FROM partner_invoices pi
        WHERE pi.partner_id   = poa.partner_id
          AND pi.type         = 'offer'
          AND pi.period_start = p_start
          AND pi.period_end   = p_end
          AND pi.status      != 'void'
      )
    GROUP BY poa.partner_id
    HAVING COUNT(poa.id) > 0
  LOOP
    net_amount := rec.net_amount;

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

    -- ── Inner loop: one line per paid_distribution activation ──────────────
    FOR act IN
      SELECT
        poa.id          AS activation_id,
        poa.activated_at,
        po.price_per_activation
      FROM partner_offer_activations poa
      JOIN partner_offers po ON po.id = poa.offer_id
      WHERE poa.partner_id          = rec.partner_id
        AND po.billing_mode         = 'paid_distribution'
        AND poa.activated_at       >= p_start::timestamptz
        AND poa.activated_at        < (p_end + 1)::timestamptz
        AND NOT poa.invoiced
    LOOP
      INSERT INTO partner_offer_invoice_lines (
        invoice_id,
        activation_id,
        activated_at,
        amount
      ) VALUES (
        new_inv_id,
        act.activation_id,
        act.activated_at,
        act.price_per_activation
      );

      UPDATE partner_offer_activations
         SET invoiced   = true,
             invoice_id = new_inv_id
       WHERE id = act.activation_id;
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
