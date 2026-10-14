-- ============================================================================
-- Chráněná serverová cesta pro vystavení partnerské faktury (draft -> issued)
-- ============================================================================
-- Zjištěný stav (read-only admin audit, viz CLAUDE.md "ADMIN NÁLEZY —
-- PŘÍMÉ ZÁPISY", nález P1 #4):
--   `issueInvoice()` v src/pages/AdminPartnersPortal.tsx měnila
--   `partner_invoices.status` přímým klientským
--   `.update({ status: 'issued', issued_at: <čas z prohlížeče> })`.
--   Chyběla: serverová validace přechodu (šlo by zapsat i z jiného stavu,
--   pokud by RLS byla volnější), `issued_at` z klienta (ne serveru),
--   a audit záznam v `admin_actions` — na rozdíl od sesterské cesty
--   `admin_mark_partner_invoice_paid` (issued -> paid).
--
-- Tato migrace přidává JEDINOU chybějící chráněnou akci: `draft -> issued`.
-- Nic víc.
--
-- Rozsah (vědomě minimální):
--   - pouze nová funkce `admin_issue_partner_invoice(uuid)`
--   - žádná změna částek, DPH, MioCoinů, plateb, provizí
--   - žádná změna automatického vystavování faktur (cron 17 /
--     partner-invoice-auto-send / create_partner_invoices_for_last_week /
--     send-partner-invoice-email zůstávají beze změny)
--   - žádná změna existujících faktur (bez UPDATE/backfillu nad daty)
--   - enum `partner_invoice_status` už hodnotu 'issued' obsahuje
--     ({draft,issued,paid,void}) -> žádná změna typu není potřeba
--
-- Bezpečnostní vlastnosti:
--   - SECURITY DEFINER + SET search_path = '' (vzor jako
--     admin_mark_partner_invoice_paid / admin_update_winner_status)
--   - guard `public.is_superadmin()` — NIKOLI `is_admin()`. Živá produkční
--     RLS policy `partner_invoices_admin_update` (kterou tato RPC nahrazuje)
--     má `qual = is_superadmin()`, tedy dosavadní efektivní oprávnění pro
--     ruční vystavení faktury bylo už teď striktně superadmin-only.
--     Guard proto zachovává PŘESNĚ stejnou úroveň — NEROZŠIŘUJE ji na
--     běžného admina (na rozdíl od `admin_mark_partner_invoice_paid`, která
--     používá širší `is_admin()` — to je jiná, samostatně schválená cesta
--     a není důvod ji sem kopírovat).
--   - EXECUTE pouze pro `authenticated`; anon i PUBLIC revoked
--   - `FOR UPDATE` zámek řádku -> žádné soubežné dvojí vystavení
--   - povolen POUZE přechod `draft -> issued`; `issued`, `paid` i `void`
--     jsou odmítnuty jako `invalid_transition` (žádná tichá idempotence —
--     opakované vystavení už vystavené faktury je chyba, ne no-op)
--   - `issued_at` se nastavuje serverem (`now()`), nikdy klientem
--   - při úspěchu vytvoří auditní záznam `admin_actions` (stejný vzor jako
--     `admin_update_winner_status` / `update_bonus_prize_delivery_status`)
--   - při jakémkoli selhání (forbidden/not_found/invalid_transition/
--     conflict) se ani faktura, ani audit nezapisuje — funkce vrátí stav,
--     nevyhazuje výjimku, takže frontend dostane strukturovanou odpověď
--
-- Funkce POUZE mění stav evidence faktury. Nesahá na PDF, e-mail, částky,
-- DPH ani MioCoiny.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_issue_partner_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id   uuid := auth.uid();
  v_status     public.partner_invoice_status;
  v_issued_at  timestamptz;
BEGIN
  IF NOT public.is_superadmin(v_admin_id) THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  IF p_invoice_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_invoice');
  END IF;

  SELECT pi.status, pi.issued_at
  INTO v_status, v_issued_at
  FROM public.partner_invoices pi
  WHERE pi.id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Jediný povolený přechod. issued/paid/void se nikdy tiše nepřijímají —
  -- opakované nebo zpětné vystavení je chyba, ne no-op.
  IF v_status <> 'draft' THEN
    RETURN jsonb_build_object(
      'status', 'invalid_transition',
      'from', v_status,
      'to', 'issued'
    );
  END IF;

  UPDATE public.partner_invoices
  SET status    = 'issued',
      issued_at = now()
  WHERE id = p_invoice_id
    AND status = 'draft'   -- druhá pojistka proti souběhu
  RETURNING issued_at INTO v_issued_at;

  IF v_issued_at IS NULL THEN
    -- Souběžná transakce stav mezitím změnila; nic jsme nezapsali.
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  INSERT INTO public.admin_actions (
    admin_id, action_type, target_table, target_id, notes, metadata
  ) VALUES (
    v_admin_id,
    'partner_invoice_issued',
    'partner_invoices',
    p_invoice_id,
    'Faktura vystavena (draft → issued)',
    jsonb_build_object(
      'previous_status', 'draft',
      'new_status',      'issued',
      'issued_at',       v_issued_at
    )
  );

  RETURN jsonb_build_object(
    'status',     'issued',
    'id',         p_invoice_id,
    'issued_at',  v_issued_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_issue_partner_invoice(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_issue_partner_invoice(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_issue_partner_invoice(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_issue_partner_invoice(uuid) TO service_role;

COMMENT ON FUNCTION public.admin_issue_partner_invoice(uuid)
  IS 'Superadmin vystaví partnerskou fakturu (draft -> issued, issued_at=now()). Povolen jen draft -> issued; issued/paid/void odmítnuty. Auditováno v admin_actions. Nemění částky, DPH, PDF ani e-mail.';

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP FUNCTION IF EXISTS public.admin_issue_partner_invoice(uuid);
-- ============================================================================
