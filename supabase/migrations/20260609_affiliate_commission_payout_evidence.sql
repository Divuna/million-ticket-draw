-- ============================================================================
-- VÝPLATA B2B PROVIZÍ — MINIMÁLNÍ PRŮKAZNÝ PODKLAD (fáze 1)
-- ============================================================================
-- Směr: OneMil → obchodník/affiliate (opačný než partner_invoices = firma→OneMil).
-- Cíl: zabránit označení provize jako 'paid' bez jasného podkladu. NEVYTVÁŘÍ nový
-- výplatní systém ani dávkovou tabulku, NEMĚNÍ výpočet provizí.
--
-- Změny:
--   1) affiliate_commissions: 3 nové nullable sloupce
--        paid_by uuid              — kdo (admin) potvrdil výplatu
--        payment_reference text    — reference platby / VS / poznámka / ID transakce
--        actual_payment_date date  — reálné datum bankovní platby (zadané adminem)
--   2) admin_set_affiliate_commission_status: při přechodu na 'paid' vyžaduje
--      payment_reference + actual_payment_date, uloží paid_by=auth.uid(),
--      paid_at=now() (čas systémového potvrzení). Přechod na 'approved' beze změny.
--
-- NEPŘIDÁVÁ: ready_to_pay stav, affiliate_payouts dávku.
-- Aplikovat RUČNĚ v SQL Editoru: STAGING → postcheck → PRODUKCE (schválení Pavla).
-- Rollback na konci souboru.
-- ============================================================================

BEGIN;

-- ── 1) Nové sloupce (aditivní, nullable) ────────────────────────────────────
ALTER TABLE public.affiliate_commissions
  ADD COLUMN IF NOT EXISTS paid_by uuid,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS actual_payment_date date;

-- ── 2) RPC: nová 4-arg signatura (stará 2-arg dropnuta kvůli jednoznačnosti) ─
-- Approve cesta volá jen 2 named args → defaulty doplní zbytek (žádná ambiguita,
-- protože stará 2-arg verze je odstraněna).
DROP FUNCTION IF EXISTS public.admin_set_affiliate_commission_status(uuid, text);

CREATE OR REPLACE FUNCTION public.admin_set_affiliate_commission_status(
  p_commission_id uuid,
  p_new_status text,
  p_payment_reference text DEFAULT NULL,
  p_actual_payment_date date DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current text;
  v_affiliate uuid;
  v_payout_account text;
BEGIN
  IF NOT public.is_admin() THEN RETURN jsonb_build_object('status', 'forbidden'); END IF;

  IF p_new_status IS NULL OR p_new_status NOT IN ('approved', 'paid') THEN
    RETURN jsonb_build_object('status', 'invalid_status');
  END IF;

  SELECT ac.status, ac.affiliate_id
    INTO v_current, v_affiliate
  FROM public.affiliate_commissions ac
  WHERE ac.id = p_commission_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

  IF NOT (
       (v_current = 'calculated' AND p_new_status = 'approved')
    OR (v_current = 'approved'   AND p_new_status = 'paid')
  ) THEN
    RETURN jsonb_build_object('status', 'invalid_transition', 'from', v_current, 'to', p_new_status);
  END IF;

  -- ── Při výplatě vyžaduj podklad ───────────────────────────────────────────
  IF p_new_status = 'paid' THEN
    -- platební údaje příjemce musí existovat
    SELECT aa.payout_account INTO v_payout_account
    FROM public.affiliate_accounts aa WHERE aa.id = v_affiliate;
    IF v_payout_account IS NULL OR btrim(v_payout_account) = '' THEN
      RETURN jsonb_build_object('status', 'missing_payout_account');
    END IF;
    -- reference platby povinná
    IF p_payment_reference IS NULL OR btrim(p_payment_reference) = '' THEN
      RETURN jsonb_build_object('status', 'missing_payment_reference');
    END IF;
    -- reálné datum platby povinné
    IF p_actual_payment_date IS NULL THEN
      RETURN jsonb_build_object('status', 'missing_actual_payment_date');
    END IF;

    UPDATE public.affiliate_commissions
    SET status              = 'paid',
        paid_at             = now(),
        paid_by             = auth.uid(),
        payment_reference   = btrim(p_payment_reference),
        actual_payment_date = p_actual_payment_date
    WHERE id = p_commission_id;
  ELSE
    -- approved: jen přechod stavu, payout pole se nedotýkají
    UPDATE public.affiliate_commissions
    SET status = 'approved'
    WHERE id = p_commission_id;
  END IF;

  RETURN jsonb_build_object('status', 'updated', 'id', p_commission_id, 'from', v_current, 'to', p_new_status);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_affiliate_commission_status(uuid, text, text, date) TO authenticated;

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.admin_set_affiliate_commission_status(uuid, text, text, date);
-- -- obnovit původní 2-arg admin_set_affiliate_commission_status (viz migrace 508474fe)
-- ALTER TABLE public.affiliate_commissions
--   DROP COLUMN IF EXISTS actual_payment_date,
--   DROP COLUMN IF EXISTS payment_reference,
--   DROP COLUMN IF EXISTS paid_by;
-- COMMIT;
-- ============================================================================
