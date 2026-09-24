-- ROLLBACK Fáze 6 (migrace 20260926100000_phase6_affiliate_commissions_paid_czk.sql)
-- Vrací měsíční výpočet affiliate provizí PŘESNĚ do produkční podoby zachycené
-- read-only z xkzhjldrojjlrkezorey před nasazením Fáze 6 (md5 níže).
-- Spouštět jen po rozhodnutí Pavla.
--
-- Po rollbacku se zákaznická provize opět počítá z payments.amount (MIO vč. bonusu),
-- refundace provizi neupravují a recovery / umoření z budoucích provizí neexistuje.
-- Rollback odstraní i tabulky a sloupce Fáze 6 (viz krok 4 — před tím exportovat).

begin;

-- 1) Přepočet provize po refundaci vypnout.
drop trigger if exists trg_affiliate_commission_payment_sync on public.payments;

-- 2) Původní měsíční výpočet.
-- calculate_affiliate_commissions_for_month(p_month date)   md5 a36ce9300e2718eeb0393d8730551b9e   ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.calculate_affiliate_commissions_for_month(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;
  IF p_month IS NULL THEN RETURN jsonb_build_object('status', 'invalid_month'); END IF;

  DELETE FROM public.affiliate_commissions
  WHERE period_month = v_month AND status = 'calculated';

  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    s.aid, 'customer_payments', v_month, s.base,
    CASE WHEN s.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN s.is_vat_payer THEN ROUND(s.base * 1.21, 2) ELSE s.base END,
    'calculated'
  FROM (
    SELECT cr.affiliate_id AS aid, a.is_vat_payer,
      ROUND(SUM(pay.amount) * (a.commission_rate_customer / 100.0), 2) AS base
    FROM public.affiliate_customer_refs cr
    JOIN public.affiliate_accounts a ON a.id = cr.affiliate_id
    JOIN public.payments pay ON pay.user_id = cr.user_id
    WHERE a.status = 'approved'
      AND pay.status = 'completed'
      AND pay.amount > 0
      AND (pay.method IS NULL OR pay.method NOT IN ('bonus','partner','api'))
      AND date_trunc('month', pay.created_at)::date = v_month
    GROUP BY cr.affiliate_id, a.is_vat_payer, a.commission_rate_customer
    HAVING SUM(pay.amount) > 0
  ) s
  ON CONFLICT (affiliate_id, commission_type, period_month)
    WHERE period_month IS NOT NULL AND commission_type = 'customer_payments'
  DO NOTHING;

  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, source_invoice_id, company_ref_id,
     amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    p.referred_by_affiliate_id,
    'company_invoice',
    date_trunc('month', pi.paid_at)::date,
    pi.id,
    cref.id,
    ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2),
    CASE WHEN a.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN a.is_vat_payer
         THEN ROUND(ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2) * 1.21, 2)
         ELSE ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2) END,
    'calculated'
  FROM public.partner_invoices pi
  JOIN public.partners p           ON p.id = pi.partner_id
  JOIN public.affiliate_accounts a ON a.id = p.referred_by_affiliate_id
  LEFT JOIN public.affiliate_company_refs cref
         ON cref.partner_id   = pi.partner_id
        AND cref.affiliate_id = p.referred_by_affiliate_id
  WHERE p.referred_by_affiliate_id IS NOT NULL
    AND a.status = 'approved'
    AND pi.status = 'paid'
    AND pi.paid_at IS NOT NULL
    AND COALESCE(pi.amount_ex_vat, 0) > 0
    AND date_trunc('month', pi.paid_at)::date <= v_month
  ON CONFLICT (source_invoice_id) WHERE source_invoice_id IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'ok', 'period_month', v_month,
    'customer_rows', (SELECT count(*) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_rows',  (SELECT count(*) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated'),
    'customer_total',(SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_total', (SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated')
  );
END;
$function$;

-- 3) Nové funkce Fáze 6.
drop function if exists public.trg_fn_affiliate_commission_payment_sync();
drop function if exists public.affiliate_commission_sync_payment(uuid);
drop function if exists public._affiliate_recovery_reallocate(uuid);
drop function if exists public._affiliate_recovery_lock(uuid);
drop function if exists public._affiliate_commission_recompute(uuid);
drop function if exists public._affiliate_payment_refunded_czk(text, numeric, numeric);

-- 4) Tabulky a sloupce Fáze 6 (návrat na produkční schéma).
-- POZOR: smaže evidenci vazeb, recovery a umoření. Při rollbacku po ostrém
-- provozu je NEJDŘÍV exportovat (audit_logs se nemaže). Částky už uložených
-- provizí (amount_base_czk / amount_total_czk) zůstávají, jak jsou.
drop table if exists public.affiliate_commission_recovery_allocations;
drop table if exists public.affiliate_commission_recoveries;
drop table if exists public.affiliate_commission_payments;
alter table public.affiliate_commissions
  drop column if exists gross_amount_base_czk,
  drop column if exists recovery_offset_czk,
  drop column if exists recovery_credit_czk;

commit;
