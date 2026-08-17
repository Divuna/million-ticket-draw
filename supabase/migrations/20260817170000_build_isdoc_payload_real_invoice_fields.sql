-- build_isdoc_payload: expose the real invoice fields ISDOC 6.0.1 needs.
--
-- WHY
--   The previous payload returned only period_from/to, the totals and per-line
--   {external_order_id, coins, activated_at}. generate-isdoc therefore INVENTED
--   the things it was missing:
--     * invoice number  -> "INV-<year>-<first 8 chars of the uuid>"
--     * IssueDate       -> today
--     * TaxPointDate    -> today
--     * PaymentDueDate  -> today + 14 days
--   while partner_invoices already stores the real invoice_number, variable_symbol,
--   issue_date, due_date and taxable_date. An accounting document must reproduce
--   the invoice, not re-derive it.
--
--   It also had no unit price, so it could not express UnitPrice / InvoicedQuantity
--   and instead put the MioCoin quantity into LineExtensionAmount, a money field.
--
-- WHAT CHANGES
--   Additive only. Every key the old payload returned is still returned with the
--   same name and meaning, so nothing that reads the old shape breaks. Added:
--     invoice_number, variable_symbol, issue_date, due_date, taxable_date,
--     price_per_coin, coins_activated
--   and per line: unit_price_czk.
--
--   The function stays the single read-only projection of an existing invoice. It
--   does NOT recompute money: amount_net, vat_rate, vat_amount and amount_gross are
--   read straight from partner_invoices, which is the financial authority after
--   20260817150000 (net rounded to 2 dp, VAT from the rounded net, gross = net + VAT).
--
-- NOT CHANGED
--   No invoice data, no calculation, no numbering, no status, no RLS. No UPDATE,
--   no DELETE, no backfill. The old migration is not rewritten.
--
-- Rollback: restore the previous body (period/totals/lines only) from
--   20260612125606_partner_invoice_line_snapshots.sql lineage.

begin;

CREATE OR REPLACE FUNCTION public.build_isdoc_payload(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  inv   record;
  ppc   numeric;
  lines jsonb;
BEGIN
  SELECT * INTO inv
  FROM public.partner_invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  -- Unit price of one MioCoin for this partner. Used only to express UnitPrice on
  -- the ISDOC line; the line total still comes from the invoice, never from
  -- quantity * unit price.
  SELECT price_per_coin INTO ppc
  FROM public.partners
  WHERE id = inv.partner_id;

  SELECT jsonb_agg(
           jsonb_build_object(
             'external_order_id', l.external_order_id,
             'coins',             l.coins,
             'activated_at',      l.activated_at,
             'unit_price_czk',    ppc
           )
           ORDER BY l.activated_at, l.id
         )
  INTO lines
  FROM public.partner_invoice_lines l
  WHERE l.invoice_id = p_invoice_id;

  RETURN jsonb_build_object(
    -- identity of the real invoice
    'invoice_id',      inv.id,
    'invoice_number',  inv.invoice_number,
    'variable_symbol', inv.variable_symbol,
    -- real invoice dates; never derived from now()
    'issue_date',      inv.issue_date,
    'due_date',        inv.due_date,
    'taxable_date',    inv.taxable_date,
    'period_from',     coalesce(inv.period_from, inv.period_start),
    'period_to',       coalesce(inv.period_to, inv.period_end),
    -- MioCoin quantity (max 1 decimal) and its unit price
    'coins_total',     inv.coins_total,
    'coins_activated', inv.coins_activated,
    'price_per_coin',  ppc,
    -- money, exactly as stored on the invoice (2 decimals)
    'amount_net',      inv.amount_net,
    'vat_rate',        inv.vat_rate,
    'vat_amount',      inv.vat_amount,
    'amount_gross',    inv.amount_gross,
    'currency',        'CZK',
    'lines',           coalesce(lines, '[]'::jsonb)
  );
END;
$$;

COMMENT ON FUNCTION public.build_isdoc_payload(uuid) IS
  'Read-only projection of an existing partner invoice for the ISDOC export. Returns the REAL invoice_number, variable_symbol, issue_date, due_date and taxable_date plus the stored money totals — it never recomputes money and never derives dates from now().';

commit;
