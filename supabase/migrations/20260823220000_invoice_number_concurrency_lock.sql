-- Invoice numbering: make the series safe against concurrent allocation.
--
-- Cause: public.generate_invoice_number(date) allocates by reading
--     SELECT COALESCE(MAX(substring(variable_symbol from 5)::int), 0) + 1
-- and takes no lock. A plain SELECT reserves nothing and reads the calling
-- transaction's MVCC snapshot, which cannot see another transaction's
-- uncommitted invoice. Two transactions that allocate at the same time both
-- read the same MAX, both derive the same number and both insert it. Nothing
-- downstream objected, because public.partner_invoices had NO unique constraint
-- and NO unique index on invoice_number or variable_symbol, and there is no
-- sequence behind the series.
--
-- Reproduced on staging (both halves of the defect, deterministically):
--   * three consecutive calls to generate_invoice_number all returned
--     OMA-20260001 — the generator reserves nothing;
--   * two invoices for two DIFFERENT partners were inserted with the identical
--     invoice_number OMA-20260001 and the identical variable_symbol 20260001,
--     and the database accepted both.
--
-- Affected paths — all three share ONE series, so they can also collide with
-- each other, not just with themselves:
--   * create_partner_invoices_for_last_week()      weekly cron (job 17)
--   * create_partner_invoices_for_period(date,date) admin / backfill
--   * create_partner_offer_invoices_for_period(date,date) partner OFFER invoices
-- (generate_partner_invoice() never sets a number and is unaffected.)
--
-- Impact if it fires: two partners receive the same accounting document number
-- and, worse, the same variable symbol — so an incoming payment cannot be
-- attributed to one invoice at all.
--
-- Fix, two layers:
--
--   1. pg_advisory_xact_lock in the generator, keyed per year. It is taken
--      BEFORE the MAX read and, being a *_xact_* lock, is held until the CALLING
--      transaction commits — i.e. across the caller's INSERT. A second
--      allocator therefore waits and then reads a MAX that already includes the
--      first invoice. Rollback releases the lock and the number is reused, so
--      the series stays gap-free.
--
--   2. Partial unique indexes as the hard backstop, so a future path that
--      forgets the lock gets a loud 23505 instead of silently minting a
--      duplicate. Partial (WHERE ... IS NOT NULL) because generate_partner_invoice
--      legitimately leaves both columns NULL on the rows it creates.
--
-- Both environments were checked before writing this: production and staging
-- contain ZERO duplicate invoice_number and ZERO duplicate variable_symbol, so
-- the indexes build without touching a single row.
--
-- The generator's EXECUTE grant is narrowed to service_role at the same time.
-- It is called only from the three functions above, which are themselves
-- service_role-only (and the offer one is SECURITY DEFINER, so it runs as its
-- owner); nothing in the frontend or any Edge Function calls it. Leaving
-- EXECUTE open to anon/authenticated would now also hand an anonymous caller
-- the ability to take the year lock, which is exactly what the fix must not do.
--
-- Preserved unchanged: the OMA-YYYYNNNN / YYYYNNNN format, the MAX+1 semantics
-- (so the series continues from the existing invoices), every historical
-- invoice, the invoicing logic in all three functions, the F1 rounding, and the
-- F2/F3 permission model. No data is read, written or renumbered.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Serialise allocation. Body otherwise byte-identical to the deployed version.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_invoice_number(p_issue_date date)
RETURNS TABLE(invoice_number text, variable_symbol text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_year text := to_char(p_issue_date, 'YYYY');
  v_last int;
  v_next int;
BEGIN
  -- Allocation must be serialised: the MAX read below reserves nothing, so two
  -- concurrent transactions would otherwise derive the same number. The lock is
  -- per-year and transaction-scoped, so it is still held while the caller does
  -- its INSERT and is released on COMMIT or ROLLBACK.
  PERFORM pg_advisory_xact_lock(hashtextextended('partner_invoice_number:' || v_year, 0));

  -- bere max z VS ve tvaru YYYYNNNN (např. 20260001)
  SELECT COALESCE(MAX(substring(pi.variable_symbol from 5)::int), 0)
    INTO v_last
  FROM public.partner_invoices pi
  WHERE pi.variable_symbol LIKE v_year || '%'
    AND length(pi.variable_symbol) = 8;

  v_next := v_last + 1;

  RETURN QUERY
  SELECT
    'OMA-' || v_year || lpad(v_next::text, 4, '0'),
    v_year || lpad(v_next::text, 4, '0');
END;
$function$;

REVOKE ALL ON FUNCTION public.generate_invoice_number(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invoice_number(date) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Hard backstop. NULLs stay allowed: generate_partner_invoice() creates rows
--    without a number, and three legacy production rows have none either.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS partner_invoices_invoice_number_uniq
  ON public.partner_invoices (invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS partner_invoices_variable_symbol_uniq
  ON public.partner_invoices (variable_symbol)
  WHERE variable_symbol IS NOT NULL;

COMMIT;
