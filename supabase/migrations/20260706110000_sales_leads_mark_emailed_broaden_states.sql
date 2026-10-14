-- ============================================================================
-- SALES LEADS — Oprava po PR #200: mark_emailed posune do „Osloveno" i z raných
-- stavů (novy / priprava / schvaleni_ceka), ne jen ze schvaleni_ceka
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §18 (§18.4)
-- ============================================================================
-- Zapsáno jako soubor v repu. Aplikace na staging/produkci vyžaduje výslovné
-- schválení Pavla (přes apply_migration).
--
-- Problém (ověřeno na produkci): tlačítko „Odeslat e-mail" v detailu leadu není
-- vázané na stav `schvaleni_ceka` — člověk může odeslat e-mail i u leadu ve
-- stavu `novy` nebo `priprava` (stačí uložený koncept + kontaktní e-mail).
-- Původní `sales_lead_mark_emailed` (PR #200) posouvala do `osloveno` POUZE
-- lead ve stavu `schvaleni_ceka`. Reálně odeslaný lead ve stavu `novy`
-- (např. produkční `ICONIC POINT`) tak zůstal `novy` — horní karta „Osloveno"
-- (počítá `status IN ('osloveno','follow_up')`) ho nezapočítala, přestože
-- aktivita `email_sent` existuje.
--
-- Oprava: `sales_lead_mark_emailed` nyní posune lead na `osloveno` z KTERÉHOKOLI
-- z raných stavů první oslovovací fáze:
--   • `novy`
--   • `priprava`
--   • `schvaleni_ceka`
-- Pokud je lead už dál v pipeline (`osloveno`/`follow_up`/`odpovedel`/`jednani`/
-- `konvertovan`) nebo v jiném/blokovaném stavu (`navrzeny`/`odmitl`/
-- `nekontaktovat`/`archivovan`), NEDĚLÁ nic — nikdy nevrací lead zpět ani
-- nepřeskakuje stavy. Zachovává zápis do `sales_lead_status_history` i aktivitu
-- `status_changed` (metadata `{auto:true, trigger:'email_sent'}`). Nikdy nemění
-- `do_not_contact`, nikdy neschvaluje kontakt, nikdy neodesílá e-mail.
--
-- Beze změny: trigger `trg_sales_lead_activities_touch_lead` (PR #200) i EF
-- `send-sales-lead-email`, která tuto RPC volá best-effort po odeslání — jen
-- se rozšiřuje množina zdrojových stavů uvnitř RPC. Grant zůstává service_role.
--
-- Rozsah: pouze `sales_leads`/`sales_lead_activities`/`sales_lead_status_history`
-- (modul Obchod / Leady). Nesahá na wallets/payments/contests/tickets/winners/
-- Stripe/`buy_ticket_atomic`/`email_queue`.
--
-- Rollback (obnoví PR #200 chování jen ze schvaleni_ceka):
--   viz definice v 20260706100000_sales_leads_phase6_email_status_sync.sql
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.sales_lead_mark_emailed(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.sales_lead_mark_emailed(uuid, uuid) — apply 20260706100000 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_mark_emailed(
  p_lead_id uuid,
  p_performed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead public.sales_leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  -- Přesun do 'osloveno' z kteréhokoli raného stavu první oslovovací fáze.
  -- Lead už dál v pipeline / v jiném stavu se NEMĚNÍ (nikdy nevrací zpět,
  -- nikdy nepřeskakuje stavy). E-mail už byl odeslán (aktivitu email_sent
  -- zapisuje volající EF samostatně); toto je jen doprovodná synchronizace
  -- stavu pro standardní workflow prvního oslovení.
  IF v_lead.status NOT IN ('novy', 'priprava', 'schvaleni_ceka') THEN
    RETURN jsonb_build_object(
      'success', true, 'status_changed', false, 'current_status', v_lead.status
    );
  END IF;

  UPDATE public.sales_leads SET status = 'osloveno' WHERE id = p_lead_id;

  INSERT INTO public.sales_lead_status_history
    (lead_id, old_status, new_status, changed_by, reason)
  VALUES (p_lead_id, v_lead.status, 'osloveno', p_performed_by, 'Automaticky po odeslání e-mailu');

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (
    p_lead_id, 'status_changed', 'internal', p_performed_by,
    jsonb_build_object('from', v_lead.status, 'to', 'osloveno', 'auto', true, 'trigger', 'email_sent')
  );

  RETURN jsonb_build_object(
    'success', true, 'status_changed', true,
    'old_status', v_lead.status, 'new_status', 'osloveno'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_mark_emailed(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sales_lead_mark_emailed(uuid, uuid) TO service_role;
