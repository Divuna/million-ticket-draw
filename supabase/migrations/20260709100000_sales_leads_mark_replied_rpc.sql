-- ============================================================================
-- SALES LEADS — RPC sales_lead_mark_replied: posun leadu na `odpovedel` po
-- přijetí příchozí odpovědi firmy (inbound).
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §18 (příjem odpovědí)
-- ============================================================================
-- Zapsáno jako soubor v repu. Aplikace na staging/produkci vyžaduje výslovné
-- schválení Pavla (přes apply_migration). ŽÁDNÉ produkční SQL v tomto PR.
--
-- Kontext: e-maily z leadů se odesílají přes EF `send-sales-lead-email`
-- (`from` = b2b@onemil.cz), odpovědi chodí na `reply+LEAD_ID@reply.onemil.cz`.
-- Novou EF `sales-lead-inbound` zpracuje příchozí webhook, zapíše aktivitu
-- `reply_received` a zavolá tuto RPC pro synchronizaci stavu.
--
-- Chování (stejný bezpečný vzor jako `sales_lead_mark_emailed`):
--   • Posune lead na `odpovedel` z KTERÉHOKOLI raného / oslovovacího stavu, kde
--     odpověď firmy dává smysl jako posun vpřed:
--       `novy`, `priprava`, `schvaleni_ceka`, `osloveno`, `follow_up`
--   • Pokud je lead už DÁL v pipeline (`odpovedel`/`jednani`/`konvertovan`) nebo
--     v jiném / blokovaném stavu (`navrzeny`/`odmitl`/`nekontaktovat`/
--     `archivovan`), NEDĚLÁ nic — nikdy nevrací lead zpět ani nepřeskakuje stavy.
--   • Idempotentní: opětovné volání u leadu už ve `odpovedel` → status_changed=false.
--   • Zachovává zápis do `sales_lead_status_history` i aktivitu `status_changed`
--     (metadata `{auto:true, trigger:'reply_received'}`).
--   • Nikdy nemění `do_not_contact`, nikdy neschvaluje kontakt, nikdy neodesílá
--     e-mail.
--
-- Grant: SECURITY DEFINER, EXECUTE jen `service_role` (volá výhradně EF
-- `sales-lead-inbound` pod service-role klíčem). anon/authenticated bez EXECUTE.
--
-- Rozsah: pouze `sales_leads`/`sales_lead_status_history`/`sales_lead_activities`
-- (modul Obchod / Leady). Nesahá na wallets/payments/contests/tickets/winners/
-- Stripe/`buy_ticket_atomic`/`email_queue`.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_mark_replied(uuid, uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sales_lead_mark_replied(
  p_lead_id uuid,
  p_performed_by uuid DEFAULT NULL
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

  -- Přesun do 'odpovedel' jen z raných / oslovovacích stavů. Lead už dál
  -- v pipeline nebo v blokovaném/jiném stavu se NEMĚNÍ (nikdy zpět, nikdy
  -- přeskočení stavu). Aktivitu `reply_received` zapisuje volající EF zvlášť;
  -- toto je jen doprovodná synchronizace stavu.
  IF v_lead.status NOT IN ('novy', 'priprava', 'schvaleni_ceka', 'osloveno', 'follow_up') THEN
    RETURN jsonb_build_object(
      'success', true, 'status_changed', false, 'current_status', v_lead.status
    );
  END IF;

  UPDATE public.sales_leads SET status = 'odpovedel' WHERE id = p_lead_id;

  INSERT INTO public.sales_lead_status_history
    (lead_id, old_status, new_status, changed_by, reason)
  VALUES (p_lead_id, v_lead.status, 'odpovedel', p_performed_by, 'Automaticky po přijetí odpovědi');

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (
    p_lead_id, 'status_changed', 'internal', p_performed_by,
    jsonb_build_object('from', v_lead.status, 'to', 'odpovedel', 'auto', true, 'trigger', 'reply_received')
  );

  RETURN jsonb_build_object(
    'success', true, 'status_changed', true,
    'old_status', v_lead.status, 'new_status', 'odpovedel'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_mark_replied(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sales_lead_mark_replied(uuid, uuid) TO service_role;
