-- ============================================================================
-- BLOKÁTOR #2 — chybějící standardní cesta partnerské faktury `issued -> paid`
-- ============================================================================
-- Zjištěný stav (read-only audit produkce i stagingu):
--   Partnerské faktury vznikají automaticky (cron 17 -> partner-invoice-auto-send
--   -> create_partner_invoices_for_last_week), rozešlou se e-mailem a
--   send-partner-invoice-email je posune `draft -> issued`. Tím lifecycle KONČÍ.
--   V celém repu (src/, supabase/functions/, RPC, triggery) NEEXISTUJE žádná
--   cesta, která by nastavila `partner_invoices.status = 'paid'`.
--   B2B provizní větev přitom vyžaduje `pi.status = 'paid'` -> obchodnická
--   provize nemohla nikdy vzniknout.
--
-- Tato migrace přidává JEDINOU chybějící evidenční akci. Nic víc.
--
-- Rozsah (vědomě minimální):
--   - pouze nová funkce `admin_mark_partner_invoice_paid(uuid)`
--   - žádná změna provizních sazeb, DPH, výpočtu procent, wallets, plateb,
--     Stripe, soutěží ani Partner Offers
--   - žádná změna existujících faktur (bez UPDATE/backfillu nad daty)
--   - enum `partner_invoice_status` už hodnotu 'paid' obsahuje
--     ({draft,issued,paid,void}) -> žádná změna typu není potřeba
--
-- Bezpečnostní vlastnosti:
--   - SECURITY DEFINER + SET search_path = '' (vzor jako ostatní admin RPC)
--   - guard `public.is_admin()` (pokrývá role 'admin' i 'superadmin')
--   - EXECUTE pouze pro `authenticated`; anon i PUBLIC revoked
--   - `FOR UPDATE` zámek řádku -> žádné soubežné dvojí označení
--   - povolen POUZE přechod `issued -> paid`; `draft`/`void` odmítnuto
--   - idempotence: opakované volání nad již zaplacenou fakturou nic nemění
--     a vrací `already_paid` (ne chybu), takže dvojklik v UI je bezpečný
--   - `paid_at` se nastavuje serverem (`now()`), nikdy klientem
--
-- Funkce POUZE eviduje, že platba skutečně dorazila. Neposílá žádné peníze,
-- nevytváří provizi ani doklad — provizi z ní odvodí až
-- `calculate_affiliate_commissions_for_month` (samostatná migrace).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_mark_partner_invoice_paid(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status  public.partner_invoice_status;
  v_paid_at timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  IF p_invoice_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_invoice');
  END IF;

  SELECT pi.status, pi.paid_at
  INTO v_status, v_paid_at
  FROM public.partner_invoices pi
  WHERE pi.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Idempotence: už zaplacená faktura se nikdy nepřepisuje (ani paid_at),
  -- aby se nezměnil okamžik úhrady, ze kterého se odvozuje provizní období.
  IF v_status = 'paid' THEN
    RETURN jsonb_build_object(
      'status', 'already_paid',
      'id', p_invoice_id,
      'paid_at', v_paid_at
    );
  END IF;

  -- Jediný povolený přechod. `draft` musí nejdřív projít řádným vystavením
  -- (odesláním e-mailem), `void` je terminální.
  IF v_status <> 'issued' THEN
    RETURN jsonb_build_object(
      'status', 'invalid_transition',
      'from', v_status,
      'to', 'paid'
    );
  END IF;

  UPDATE public.partner_invoices
  SET status  = 'paid',
      paid_at = now()
  WHERE id = p_invoice_id
    AND status = 'issued'   -- druhá pojistka proti souběhu
  RETURNING paid_at INTO v_paid_at;

  IF v_paid_at IS NULL THEN
    -- Souběžná transakce stav mezitím změnila; nic jsme nezapsali.
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  RETURN jsonb_build_object(
    'status', 'marked_paid',
    'id', p_invoice_id,
    'paid_at', v_paid_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_partner_invoice_paid(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_partner_invoice_paid(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_partner_invoice_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_partner_invoice_paid(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_mark_partner_invoice_paid(uuid)
  IS 'Admin/superadmin eviduje skutečně přijatou úhradu partnerské faktury (issued -> paid, paid_at=now()). Idempotentní, neposílá peníze, nevytváří provizi.';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.admin_mark_partner_invoice_paid(uuid);
-- ============================================================================
