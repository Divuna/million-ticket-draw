-- ============================================================================
-- OneMil Affiliate program — monthly commission calculation (third safe step)
-- ============================================================================
-- SECURITY DEFINER RPC that computes both commission planes for a given month
-- and writes 'calculated' rows into affiliate_commissions. Staging only.
--
-- Isolation guarantees:
--   - No change to customer accounts, Partner portal, payments, tickets,
--     contests, wallet, or buy_ticket_atomic.
--   - Reads payments / partner_invoices / partners read-only.
--   - Writes ONLY to affiliate_commissions.
--
-- Two planes:
--   1) customer_payments : SUM(payments.amount) of real paid top-ups by
--      first-touch customers (affiliate_customer_refs), x commission_rate_customer.
--      Excludes non-cash methods ('bonus','partner','api'), mirrors the existing
--      influencer calc rules.
--   2) company_invoice   : SUM(partner_invoices.amount_ex_vat) where status='paid'
--      for companies attributed via partners.referred_by_affiliate_id,
--      x commission_rate_company.
--
-- VAT rule (per affiliate_accounts.is_vat_payer):
--   - amount_base_czk  = commission computed from the ex-VAT source amount
--   - VAT payer      -> amount_total_czk = ROUND(amount_base_czk * 1.21, 2), vat_rate = 21
--   - non VAT payer  -> amount_total_czk = amount_base_czk,                  vat_rate = 0
--
-- Idempotence:
--   - Aggregated per (affiliate_id, commission_type, period_month).
--   - Partial UNIQUE index enforces no duplicates per month.
--   - Re-run deletes only 'calculated' rows for the month and recomputes;
--     'approved'/'paid' rows are LOCKED (never deleted, skipped via ON CONFLICT).
--
-- Authorization:
--   - Admin (is_admin()) or service-role/cron context (auth.uid() IS NULL).
--   - Any other authenticated user -> {"status":"forbidden"}.
--
-- Idempotent DDL: CREATE OR REPLACE / IF NOT EXISTS.
-- ============================================================================

-- Idempotence guard: one aggregated row per affiliate/type/month.
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_commissions_month
  ON public.affiliate_commissions (affiliate_id, commission_type, period_month)
  WHERE period_month IS NOT NULL;

CREATE OR REPLACE FUNCTION public.calculate_affiliate_commissions_for_month(p_month date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  -- Authorization: admin or backend/cron (no JWT). Block normal users.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  IF p_month IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_month');
  END IF;

  -- Recompute only draft rows for this month; locked rows are preserved.
  DELETE FROM public.affiliate_commissions
  WHERE period_month = v_month
    AND status = 'calculated';

  -- ---- Plane 1: customer payments --------------------------------------
  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    s.aid,
    'customer_payments',
    v_month,
    s.base,
    CASE WHEN s.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN s.is_vat_payer THEN ROUND(s.base * 1.21, 2) ELSE s.base END,
    'calculated'
  FROM (
    SELECT
      cr.affiliate_id AS aid,
      a.is_vat_payer,
      ROUND(SUM(pay.amount) * (a.commission_rate_customer / 100.0), 2) AS base
    FROM public.affiliate_customer_refs cr
    JOIN public.affiliate_accounts a ON a.id = cr.affiliate_id
    JOIN public.payments pay ON pay.user_id = cr.user_id
    WHERE a.status = 'approved'
      AND pay.status = 'paid'
      AND pay.amount > 0
      AND (pay.method IS NULL OR pay.method NOT IN ('bonus','partner','api'))
      AND date_trunc('month', pay.created_at)::date = v_month
    GROUP BY cr.affiliate_id, a.is_vat_payer, a.commission_rate_customer
    HAVING SUM(pay.amount) > 0
  ) s
  ON CONFLICT (affiliate_id, commission_type, period_month)
    WHERE period_month IS NOT NULL
  DO NOTHING;

  -- ---- Plane 2: company invoices ---------------------------------------
  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    s.aid,
    'company_invoice',
    v_month,
    s.base,
    CASE WHEN s.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN s.is_vat_payer THEN ROUND(s.base * 1.21, 2) ELSE s.base END,
    'calculated'
  FROM (
    SELECT
      p.referred_by_affiliate_id AS aid,
      a.is_vat_payer,
      ROUND(SUM(pi.amount_ex_vat) * (a.commission_rate_company / 100.0), 2) AS base
    FROM public.partner_invoices pi
    JOIN public.partners p ON p.id = pi.partner_id
    JOIN public.affiliate_accounts a ON a.id = p.referred_by_affiliate_id
    WHERE p.referred_by_affiliate_id IS NOT NULL
      AND a.status = 'approved'
      AND pi.status = 'paid'
      AND COALESCE(pi.amount_ex_vat, 0) > 0
      AND date_trunc('month', pi.period_start)::date = v_month
    GROUP BY p.referred_by_affiliate_id, a.is_vat_payer, a.commission_rate_company
    HAVING SUM(pi.amount_ex_vat) > 0
  ) s
  ON CONFLICT (affiliate_id, commission_type, period_month)
    WHERE period_month IS NOT NULL
  DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'ok',
    'period_month', v_month,
    'customer_rows', (SELECT count(*) FROM public.affiliate_commissions
                      WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_rows',  (SELECT count(*) FROM public.affiliate_commissions
                      WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated'),
    'customer_total',(SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions
                      WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_total', (SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions
                      WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_affiliate_commissions_for_month(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_affiliate_commissions_for_month(date) TO authenticated;
