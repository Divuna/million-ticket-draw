BEGIN;

-- Bezpečné spuštění připravené e-mailové dávky přímo z administrace.
--
-- Stav před touto migrací: `sales_lead_email_batch_prepare_paused` (admin UI)
-- umí vyrobit jen `paused` dávku a odmítne pracovat, dokud není automatika
-- vypnutá. Jediný přechod `paused → scheduled` je
-- `sales_lead_email_batch_activate`, který je service_role only a v aplikaci ho
-- nevolá nic — admin tedy dávku nemá jak spustit bez ručního SQL.
--
-- ZÁMĚRNÁ ZMĚNA CHOVÁNÍ: z `sales_lead_email_batch_activate` mizí podmínka
-- `automation_must_be_enabled`. Byla redundantní jako pojistka proti odeslání a
-- zároveň znemožňovala jediný smysluplný postup (připravit dávku dopředu,
-- kill-switch nechat vypnutý). Skutečnou a jedinou branou odeslání zůstává
-- `sales_lead_email_batch_claim_next`, která při `enabled <> true` okamžitě
-- vrací `noop / automation_disabled` a žádnou položku nezabere. Dávka ve stavu
-- `scheduled` při vypnuté automatice je tedy prokazatelně nečinná.
--
-- Všechny ostatní pojistky zůstávají beze změny: jen `paused` dávka, žádná
-- `processing` položka, platné datum a okno, alespoň jedna `pending` položka,
-- zámky `FOR UPDATE` a podmíněný UPDATE proti dvojí aktivaci.
--
-- Aktivace sama NEODESÍLÁ e-mail, NEVOLÁ poskytovatele a NEMĚNÍ
-- `sales_lead_email_automation_settings`.

CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_activate(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch public.sales_lead_email_batches%ROWTYPE;
  v_now timestamptz := now();
  v_today date;
  v_window_end timestamptz;
BEGIN
  SELECT * INTO v_batch FROM public.sales_lead_email_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'batch_not_found'); END IF;
  IF v_batch.status <> 'paused' THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_not_activatable', 'batch_status', v_batch.status);
  END IF;
  PERFORM 1 FROM public.sales_lead_email_batch_items
  WHERE batch_id = p_batch_id ORDER BY id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.sales_lead_email_batch_items
             WHERE batch_id = p_batch_id AND status = 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_processing');
  END IF;

  v_today := (v_now AT TIME ZONE v_batch.timezone)::date;
  v_window_end := (v_batch.scheduled_date + v_batch.window_end) AT TIME ZONE v_batch.timezone;
  IF v_batch.scheduled_date < v_today OR v_now >= v_window_end THEN
    RETURN jsonb_build_object('success', false, 'error', 'scheduled_window_missed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_lead_email_batch_items
                 WHERE batch_id = p_batch_id AND status = 'pending') THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_pending_items');
  END IF;

  UPDATE public.sales_lead_email_batches
  SET status = 'scheduled', updated_at = now()
  WHERE id = p_batch_id AND status = 'paused';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_not_activatable');
  END IF;
  RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'batch_status', 'scheduled');
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_activate(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_activate(uuid) TO service_role;

COMMENT ON FUNCTION public.sales_lead_email_batch_activate(uuid) IS
  'Přepne jednu paused dávku na scheduled. Neodesílá e-mail, nevolá poskytovatele a nemění '
  'kill-switch. Odeslání hlídá výhradně sales_lead_email_batch_claim_next, která při vypnuté '
  'automatice nezabere žádnou položku. Service-role only — administrace volá obálku '
  'sales_lead_email_batch_activate_admin.';

-- Admin-only vstupní bod pro administraci. Stejný vzor jako
-- `sales_lead_email_batch_prepare_paused`: obálka ověří volajícího a deleguje na
-- už existující logiku, aby nevznikl druhý paralelní systém.
CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_activate_admin(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL OR NOT public.has_admin_permission('sales_leads.manage', v_caller) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;
  IF p_batch_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'batch_not_found');
  END IF;

  RETURN public.sales_lead_email_batch_activate(p_batch_id);
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_activate_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_activate_admin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.sales_lead_email_batch_activate_admin(uuid) IS
  'Admin-gated vstup pro tlačítko „Spustit dávku“. Vyžaduje has_admin_permission(sales_leads.manage) '
  'a deleguje na sales_lead_email_batch_activate. Neodesílá e-mail a nemění kill-switch.';

COMMIT;
