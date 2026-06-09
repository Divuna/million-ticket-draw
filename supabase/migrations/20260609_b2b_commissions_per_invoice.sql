-- ============================================================================
-- B2B PROVIZE — JEDNA PROVIZE NA JEDNU FAKTURU (per-invoice)
-- ============================================================================
-- Cíl: každá B2B provize (commission_type='company_invoice') musí být navázaná
-- na konkrétní zaplacenou fakturu (source_invoice_id) a na atribuci firmy
-- (company_ref_id), aby admin viděl, z čeho provize vznikla, než ji schválí.
--
-- Změny:
--   1) Přepis POUZE B2B větve funkce calculate_affiliate_commissions_for_month:
--      místo jedné měsíčně agregované provize na obchodníka vzniká jedna provize
--      na každou zaplacenou partner_invoices. Vyplní source_invoice_id a
--      (pokud existuje) company_ref_id.
--   2) Zákaznická / influencer větev (commission_type='customer_payments')
--      ZŮSTÁVÁ BEZE ZMĚNY — nadále agregovaná po měsících.
--   3) Úprava unikátních indexů:
--        - customer provize: měsíčně unikátní (zúžený index)
--        - B2B company provize: unikátní podle source_invoice_id
--
-- Bezpečnost / kontext:
--   - V produkci je 0 reálných company_invoice provizí → žádný backfill,
--     žádné double-counting, žádné approved/paid legacy řádky k odsouhlasení.
--   - DPH PROVIZE se řídí plátcovstvím obchodníka (a.is_vat_payer) — stávající
--     logika. DPH FAKTURY (partner_invoices.vat_amount) se pouze zobrazuje v UI,
--     do výpočtu provize nevstupuje.
--   - Aplikovat RUČNĚ v Supabase SQL Editoru: nejdřív STAGING, po postchecku
--     PRODUKCE — vyžaduje výslovné schválení Pavla (mění se provizní logika).
--
-- Rollback (viz konec souboru).
-- ============================================================================

BEGIN;

-- ── 1) Unikátní indexy ──────────────────────────────────────────────────────
-- Starý index bránil více řádkům na (obchodník, typ, měsíc) — per-invoice model
-- potřebuje více company řádků za měsíc, proto ho zúžíme jen na customer_payments.
DROP INDEX IF EXISTS public.uq_affiliate_commissions_month;

CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_commissions_month_customer
  ON public.affiliate_commissions (affiliate_id, commission_type, period_month)
  WHERE period_month IS NOT NULL AND commission_type = 'customer_payments';

-- Jedna B2B provize na jednu fakturu.
CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_commissions_invoice
  ON public.affiliate_commissions (source_invoice_id)
  WHERE source_invoice_id IS NOT NULL;

-- ── 1b) Admin SELECT na partner_invoices ────────────────────────────────────
-- partner_invoices má RLS zapnuté, ale ŽÁDNOU policy → authenticated admin
-- nemůže fakturu přečíst z prohlížeče, takže /admin/affiliate-commissions by
-- u zdroje výpočtu (firma, č. faktury, částky) vždy ukázal „Neuvedeno".
-- Aditivní admin-only SELECT policy (vzor jako affiliate_company_refs). NEMĚNÍ
-- přístup partnerů ani service-role; pouze přidává čtení pro adminy.
DROP POLICY IF EXISTS partner_invoices_admin_select ON public.partner_invoices;
CREATE POLICY partner_invoices_admin_select
  ON public.partner_invoices FOR SELECT TO authenticated
  USING (public.is_admin());

-- ── 2) Přepis funkce ────────────────────────────────────────────────────────
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

  -- Smaže pouze přepočitatelné (calculated) řádky daného měsíce.
  -- approved/paid zůstávají nedotčeny.
  DELETE FROM public.affiliate_commissions
  WHERE period_month = v_month AND status = 'calculated';

  -- ── ZÁKAZNICKÁ VĚTEV (customer_payments) — BEZE ZMĚNY ─────────────────────
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
    WHERE a.status = 'approved' AND pay.status = 'paid' AND pay.amount > 0
      AND (pay.method IS NULL OR pay.method NOT IN ('bonus','partner','api'))
      AND date_trunc('month', pay.created_at)::date = v_month
    GROUP BY cr.affiliate_id, a.is_vat_payer, a.commission_rate_customer
    HAVING SUM(pay.amount) > 0
  ) s
  ON CONFLICT (affiliate_id, commission_type, period_month)
    WHERE period_month IS NOT NULL AND commission_type = 'customer_payments'
  DO NOTHING;

  -- ── B2B VĚTEV (company_invoice) — PER-INVOICE ─────────────────────────────
  -- Jedna provize na jednu zaplacenou fakturu; vyplní source_invoice_id a
  -- (pokud existuje atribuce) company_ref_id.
  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, source_invoice_id, company_ref_id,
     amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    p.referred_by_affiliate_id,
    'company_invoice',
    v_month,
    pi.id,                                                            -- source_invoice_id
    cref.id,                                                          -- company_ref_id (nullable)
    ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2), -- amount_base_czk (provize bez DPH)
    CASE WHEN a.is_vat_payer THEN 21 ELSE 0 END,                      -- vat_rate (DPH PROVIZE dle plátcovství obchodníka)
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
    AND COALESCE(pi.amount_ex_vat, 0) > 0
    AND date_trunc('month', pi.period_start)::date = v_month
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

COMMIT;

-- ============================================================================
-- ROLLBACK (návrat k měsíčně agregované B2B větvi + původní index)
-- ============================================================================
-- BEGIN;
-- DROP POLICY IF EXISTS partner_invoices_admin_select ON public.partner_invoices;
-- DROP INDEX IF EXISTS public.uq_affiliate_commissions_invoice;
-- DROP INDEX IF EXISTS public.uq_affiliate_commissions_month_customer;
-- CREATE UNIQUE INDEX uq_affiliate_commissions_month
--   ON public.affiliate_commissions (affiliate_id, commission_type, period_month)
--   WHERE period_month IS NOT NULL;
-- -- + obnovit původní tělo funkce calculate_affiliate_commissions_for_month
-- --   (verze s GROUP BY p.referred_by_affiliate_id, bez source_invoice_id).
-- COMMIT;
-- ============================================================================
