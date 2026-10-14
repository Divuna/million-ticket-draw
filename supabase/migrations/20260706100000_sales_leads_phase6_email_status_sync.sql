-- ============================================================================
-- SALES LEADS — Oprava po Fázi 6: propsání „Osloveno" + přesná poslední aktivita
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §18
-- ============================================================================
-- Zapsáno jako soubor v repu. Aplikace na staging/produkci vyžaduje výslovné
-- schválení Pavla (přes apply_migration).
--
-- Problém: ruční odeslání e-mailu (Fáze 3C, EF `send-sales-lead-email`) zapisuje
-- aktivitu `email_sent`, ale NIKDY neposouvá `sales_leads.status` na `osloveno`.
-- Horní karta „Osloveno" v `/admin/sales-leads` počítá
-- `status IN ('osloveno','follow_up')` — proto zůstávala 0, i když e-maily byly
-- reálně odeslané. Sloupec „Poslední aktivita" v seznamu navíc čte
-- `sales_leads.updated_at`, který se NEmění při vložení řádku do
-- `sales_lead_activities` (jen při přímé UPDATE `sales_leads`) — takže odeslání
-- e-mailu, poznámka nebo jiná aktivita se v „Poslední aktivitě" neprojevily.
--
-- Řešení (tento soubor):
--   1. Trigger na `sales_lead_activities` AFTER INSERT, který nastaví
--      `sales_leads.updated_at = now()` pro daný lead — „Poslední aktivita"
--      v seznamu i detailu tak vždy odpovídá realitě, bez ohledu na typ aktivity.
--   2. Nová RPC `sales_lead_mark_emailed(p_lead_id uuid, p_performed_by uuid)` —
--      SECURITY DEFINER, EXECUTE JEN `service_role` (volá ji výhradně EF
--      `send-sales-lead-email` po úspěšném odeslání, nikdy klient/UI přímo).
--      Pokud je lead ve stavu `schvaleni_ceka`, posune ho na `osloveno` úplně
--      stejným způsobem jako `sales_lead_set_status` (status_history +
--      activity `status_changed`, metadata `{auto:true, trigger:'email_sent'}`).
--      Pokud lead už je dál v pipeline (`osloveno`/`follow_up`/`odpovedel`/
--      `jednani`/`konvertovan`) nebo v jiném stavu, NEDĚLÁ nic — nikdy nevrací
--      lead zpět ani nepřeskakuje stavy. Nikdy nemění `do_not_contact`,
--      nikdy neschvaluje kontakt, nikdy neodesílá e-mail.
--
-- Neřeší (mimo rozsah, viz spec §18.3): příjem odpovědí od firem. Status
-- `odpovedel` a aktivita `reply_received` v schématu existují od Fáze 1, ale
-- v celém repu NENÍ žádný webhook/mechanismus, který by odpověď firmy zachytil
-- automaticky — admin ji musí manuálně nastavit v detailu leadu (tlačítko
-- „Odpověděl"). Toto zůstává ruční, dokud nebude schválen a implementován
-- samostatný inbound e-mail mechanismus (mimo rozsah této opravy).
--
-- Rozsah: pouze `sales_leads`/`sales_lead_activities`/`sales_lead_status_history`
-- (modul Obchod / Leady). Nesahá na wallets/payments/contests/tickets/winners/
-- Stripe/`buy_ticket_atomic`/`email_queue`.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_sales_lead_activities_touch_lead ON public.sales_lead_activities;
--   DROP FUNCTION IF EXISTS public.sales_lead_activities_touch_lead();
--   DROP FUNCTION IF EXISTS public.sales_lead_mark_emailed(uuid, uuid);
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.sales_leads') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.sales_leads — apply Phase 1 first';
  END IF;
  IF to_regclass('public.sales_lead_activities') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.sales_lead_activities — apply Phase 1 first';
  END IF;
  IF to_regclass('public.sales_lead_status_history') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.sales_lead_status_history — apply Phase 1 first';
  END IF;
END $$;

-- ── 1. Trigger: libovolná nová aktivita bumpne sales_leads.updated_at ───────
CREATE OR REPLACE FUNCTION public.sales_lead_activities_touch_lead()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.sales_leads SET updated_at = now() WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_lead_activities_touch_lead ON public.sales_lead_activities;
CREATE TRIGGER trg_sales_lead_activities_touch_lead
  AFTER INSERT ON public.sales_lead_activities
  FOR EACH ROW EXECUTE FUNCTION public.sales_lead_activities_touch_lead();

-- ── 2. RPC sales_lead_mark_emailed — auto-přechod schvaleni_ceka → osloveno ─
-- Service-role-only (stejný vzor jako sales_lead_propose z Fáze 5A) — volá se
-- výhradně z EF `send-sales-lead-email` po úspěšném odeslání konceptu člověkem.
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

  IF v_lead.status <> 'schvaleni_ceka' THEN
    -- Lead není ve stavu čekajícím na oslovení (už je dál v pipeline, nebo je
    -- v jiném/blokovaném stavu) — status se NEMĚNÍ. E-mail už byl odeslán
    -- (aktivitu email_sent zapisuje volající EF samostatně); toto je jen
    -- doprovodná synchronizace stavu pro standardní workflow prvního oslovení.
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
