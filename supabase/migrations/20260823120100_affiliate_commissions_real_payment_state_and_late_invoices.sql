-- ============================================================================
-- BLOKÁTOR #1 + #3 — provize se nikdy nespočítaly
-- ============================================================================
-- Přepisuje se POUZE tělo `calculate_affiliate_commissions_for_month(date)`.
-- Beze změny zůstává: sazby (`commission_rate_customer`, `commission_rate_company`),
-- způsob výpočtu procent, DPH logika (dle `is_vat_payer` obchodníka),
-- first-touch atribuce, per-invoice model, unikátní indexy, guard `is_admin()`,
-- granty, `SECURITY DEFINER`, `search_path`.
--
-- ── BLOKÁTOR #1: zákaznická (Influencer) větev četla neexistující stav ──────
-- Zjištěný stav: `stripe-webhook` po úspěšné platbě zapisuje
-- `payments.status = 'completed'` (index.ts:386). Funkce ale filtrovala
-- `pay.status = 'paid'`.
-- Produkční důkaz: 130 řádků 'completed', 8 'refunded', 0 'paid'.
-- Staging: 7 řádků 'completed', 0 'paid'.
-- JOIN se tedy nikdy netrefil a Influencer provize nemohla vzniknout.
--
-- Oprava: filtr na skutečný produkční stav úspěšné platby -> 'completed'.
-- Refundace se NEZAPOČÍTÁVAJÍ: refundovaná platba má `status='refunded'`
-- (samostatná hodnota, ne 'completed'), takže z výpočtu přirozeně vypadne.
-- Vyloučení interních metod ('bonus','partner','api') zůstává beze změny.
--
-- ── BLOKÁTOR #3: obchodnická větev se vázala na období faktury ──────────────
-- Zjištěný stav: B2B větev filtrovala
-- `date_trunc('month', pi.period_start) = v_month`, přičemž cron 25 běží
-- jen jednou (2. dne v měsíci) a jen za předchozí měsíc. Faktura označená
-- jako zaplacená po tomto jediném běhu už nebyla nikdy přehodnocena a
-- zůstala navždy bez provize.
-- Produkční důkaz: u všech 6 faktur už jediné hodnotící okno uplynulo.
--
-- Oprava: řídit se skutečným okamžikem úhrady `pi.paid_at` a použít
-- KUMULATIVNÍ okno `date_trunc('month', pi.paid_at) <= v_month`.
--   * běžný případ: faktura zaplacená v měsíci M se zachytí během za M;
--   * opožděná úhrada: zachytí se během za měsíc, kdy k úhradě došlo;
--   * vynechaný/spadlý běh cronu: dožene se kterýmkoli pozdějším během,
--     protože okno je kumulativní — žádná uhrazená faktura nepropadne.
-- `period_month` provize = měsíc SKUTEČNÉ ÚHRADY (`paid_at`), ne měsíc
-- období faktury -> účetně odpovídá tomu, kdy nárok vznikl.
--
-- Idempotence (bez druhého provizního enginu):
--   * `uq_affiliate_commissions_invoice` (UNIQUE na `source_invoice_id`)
--     + `ON CONFLICT ... DO NOTHING` -> jedna faktura = nejvýše jedna provize,
--     ať se funkce spustí jakkoli často a za jakýkoli měsíc;
--   * úvodní DELETE maže výhradně `status='calculated'` daného `period_month`,
--     takže historicky `approved`/`ready_to_pay`/`in_payment_batch`/`paid`
--     provize se nikdy nepřepisují ani nemažou.
--
-- Faktury s `paid_at IS NULL` se vědomě nezapočítávají — nelze u nich určit
-- okamžik vzniku nároku. Nová `admin_mark_partner_invoice_paid` vždy `paid_at`
-- nastavuje, takže se to týká jen historických ručních zásahů.
-- ============================================================================

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
  -- approved / ready_to_pay / in_payment_batch / paid zůstávají nedotčeny.
  DELETE FROM public.affiliate_commissions
  WHERE period_month = v_month AND status = 'calculated';

  -- ── ZÁKAZNICKÁ VĚTEV (customer_payments) ──────────────────────────────────
  -- Jediná změna oproti předchozí verzi: pay.status 'paid' -> 'completed'.
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
      AND pay.status = 'completed'          -- skutečný stav úspěšné Stripe platby
      AND pay.amount > 0
      AND (pay.method IS NULL OR pay.method NOT IN ('bonus','partner','api'))
      AND date_trunc('month', pay.created_at)::date = v_month
    GROUP BY cr.affiliate_id, a.is_vat_payer, a.commission_rate_customer
    HAVING SUM(pay.amount) > 0
  ) s
  ON CONFLICT (affiliate_id, commission_type, period_month)
    WHERE period_month IS NOT NULL AND commission_type = 'customer_payments'
  DO NOTHING;

  -- ── B2B VĚTEV (company_invoice) — PER-INVOICE, řízeno paid_at ─────────────
  -- Kumulativní okno: zachytí i fakturu uhrazenou po běhu cronu i po
  -- vynechaném běhu. Duplicitu blokuje UNIQUE(source_invoice_id).
  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, source_invoice_id, company_ref_id,
     amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    p.referred_by_affiliate_id,
    'company_invoice',
    date_trunc('month', pi.paid_at)::date,                            -- měsíc skutečné úhrady
    pi.id,                                                            -- source_invoice_id
    cref.id,                                                          -- company_ref_id (nullable)
    ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2), -- provize bez DPH
    CASE WHEN a.is_vat_payer THEN 21 ELSE 0 END,                      -- DPH dle plátcovství obchodníka
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

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Obnovit tělo funkce z migrace 20260609_b2b_commissions_per_invoice.sql
-- (varianta s `pay.status = 'paid'` a B2B filtrem na `pi.period_start`).
-- Granty ani indexy tato migrace nemění, takže se nic dalšího vracet nemusí.
-- ============================================================================
