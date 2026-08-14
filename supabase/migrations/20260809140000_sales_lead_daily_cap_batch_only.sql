BEGIN;

-- Denní strop 20 se týká POUZE dávkového (automatického) odesílání.
--
-- Migrace 20260809120000 zavedla denní strop, ale do spotřeby započítávala i
-- ruční první e-maily (`manual_initial`). Podle potvrzeného rozhodnutí je to
-- špatně: ruční odeslání je bez limitu a nesmí snižovat automatickou kapacitu
-- dne. Ruční e-mail tedy nesmí zablokovat dávkový worker a naopak vyčerpaný
-- dávkový strop nesmí bránit ručnímu odeslání.
--
-- Jediná změna oproti 20260809120000 je výpočet `v_used_today`:
--   * počítají se pouze položky dávek naplánovaných na dnešek (Europe/Prague),
--   * a to buď ve stavu `processing`, nebo s delivery `batch_initial`
--     ve stavech sending / provider_accepted / committed / uncertain,
--   * část sčítající `manual_initial` delivery je odstraněna,
--   * u delivery přibyl explicitní filtr `d.mode = batch_initial`, aby byl
--     dávkový rozsah zřejmý i bez znalosti vazby přes `batch_item_id`.
--
-- Beze změny zůstává: kill-switch jako první kontrola i serializační zámek
-- (`FOR UPDATE` na singleton řádku nastavení), `processing` v součtu jako
-- ochrana proti souběhu, vyloučení `prepared` a `provider_rejected`, timezone
-- Europe/Prague, commit_only větev, všechny pojistky leadu i oprávnění.
--
-- Ruční odesílací cesta (`send-sales-lead-email`) se touto migrací nijak
-- nemění a nezískává žádný nový limit ani guard.
CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_claim_next()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_item public.sales_lead_email_batch_items%ROWTYPE;
  v_batch public.sales_lead_email_batches%ROWTYPE;
  v_lead public.sales_leads%ROWTYPE;
  v_delivery public.sales_lead_email_deliveries%ROWTYPE;
  v_now timestamptz := now();
  v_today date;
  v_used_today integer;
  v_recipient text;
  v_domain text;
  v_guard jsonb;
  v_reason text := NULL;
BEGIN
  -- Kill-switch je i nadále úplně první kontrola a zároveň serializační zámek.
  SELECT * INTO v_settings FROM public.sales_lead_email_automation_settings WHERE singleton FOR UPDATE;
  IF NOT FOUND OR v_settings.enabled IS DISTINCT FROM true THEN
    RETURN jsonb_build_object('success', true, 'action', 'noop', 'reason', 'automation_disabled');
  END IF;

  SELECT i.* INTO v_item
  FROM public.sales_lead_email_batch_items i
  JOIN public.sales_lead_email_batches b ON b.id = i.batch_id
  JOIN public.sales_lead_email_deliveries d ON d.batch_item_id = i.id
  WHERE i.status = 'processing'
    AND b.status = 'scheduled'
    AND d.mode = 'batch_initial'
    AND d.status = 'provider_accepted'
  ORDER BY i.scheduled_for, i.id
  FOR UPDATE OF i SKIP LOCKED
  LIMIT 1;
  IF FOUND THEN
    SELECT * INTO v_delivery FROM public.sales_lead_email_deliveries
    WHERE batch_item_id = v_item.id AND status = 'provider_accepted'
    ORDER BY created_at DESC LIMIT 1;
    RETURN jsonb_build_object(
      'success', true, 'action', 'commit_only',
      'batch_item_id', v_item.id, 'batch_id', v_item.batch_id, 'lead_id', v_item.lead_id,
      'delivery_id', v_delivery.id
    );
  END IF;

  v_today := (v_now AT TIME ZONE 'Europe/Prague')::date;

  SELECT i.* INTO v_item
  FROM public.sales_lead_email_batch_items i
  JOIN public.sales_lead_email_batches b ON b.id = i.batch_id
  WHERE i.status = 'pending'
    AND b.status = 'scheduled'
    AND (
      b.scheduled_date < (v_now AT TIME ZONE b.timezone)::date
      OR v_now >= ((b.scheduled_date + b.window_end) AT TIME ZONE b.timezone)
    )
  ORDER BY i.scheduled_for, i.id
  FOR UPDATE OF i SKIP LOCKED
  LIMIT 1;
  IF FOUND THEN
    UPDATE public.sales_lead_email_batch_items
    SET status = 'skipped', skip_reason = 'scheduled_window_missed', updated_at = now()
    WHERE id = v_item.id AND status = 'pending';
    PERFORM public.sales_lead_email_batch_recalculate_status(v_item.batch_id);
    RETURN jsonb_build_object('success', true, 'action', 'skipped', 'reason', 'scheduled_window_missed',
      'batch_item_id', v_item.id, 'batch_id', v_item.batch_id, 'lead_id', v_item.lead_id);
  END IF;

  -- ── Denní strop napříč všemi dávkami ─────────────────────────────────────
  -- Počítá se pod zámkem settings, takže souběžný worker uvidí i položku, kterou
  -- tento běh za chvíli převede na `processing`.
  -- Denni strop se tyka VYHRADNE davkoveho (automatickeho) toku.
  -- Rucni prvni e-maily (manual_initial) se zamerne nepocitaji: jsou bez limitu
  -- a nesmi snizovat automatickou kapacitu dne.
  SELECT count(*)
  INTO v_used_today
  FROM public.sales_lead_email_batch_items i
  JOIN public.sales_lead_email_batches b ON b.id = i.batch_id
  WHERE b.scheduled_date = v_today
    AND (
      i.status = 'processing'
      OR EXISTS (
        SELECT 1 FROM public.sales_lead_email_deliveries d
        WHERE d.batch_item_id = i.id
          AND d.mode = 'batch_initial'
          AND d.status IN ('sending', 'provider_accepted', 'committed', 'uncertain')
      )
    );

  IF v_used_today >= v_settings.daily_limit THEN
    RETURN jsonb_build_object(
      'success', true, 'action', 'noop', 'reason', 'daily_limit_reached',
      'daily_limit', v_settings.daily_limit, 'used_today', v_used_today
    );
  END IF;

  SELECT i.* INTO v_item
  FROM public.sales_lead_email_batch_items i
  JOIN public.sales_lead_email_batches b ON b.id = i.batch_id
  WHERE i.status = 'pending'
    AND b.status = 'scheduled'
    AND b.scheduled_date = (v_now AT TIME ZONE b.timezone)::date
    AND i.scheduled_for <= v_now
    AND v_now >= ((b.scheduled_date + b.window_start) AT TIME ZONE b.timezone)
    AND v_now < ((b.scheduled_date + b.window_end) AT TIME ZONE b.timezone)
  ORDER BY i.scheduled_for, i.id
  FOR UPDATE OF i SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'action', 'noop', 'reason', 'no_due_item');
  END IF;

  SELECT * INTO v_batch FROM public.sales_lead_email_batches WHERE id = v_item.batch_id FOR UPDATE;
  IF v_batch.status <> 'scheduled' THEN
    RETURN jsonb_build_object('success', true, 'action', 'noop', 'reason', 'batch_not_scheduled');
  END IF;

  SELECT * INTO v_lead FROM public.sales_leads WHERE id = v_item.lead_id FOR UPDATE;
  v_recipient := lower(btrim(coalesce(v_lead.contact_email, '')));
  v_domain := '@' || split_part(v_recipient, '@', 2);
  IF NOT FOUND THEN
    v_reason := 'lead_not_found';
  ELSIF v_lead.status NOT IN ('novy', 'priprava', 'schvaleni_ceka') THEN
    v_reason := 'initial_email_status_not_allowed';
  ELSIF v_lead.do_not_contact THEN
    v_reason := 'do_not_contact';
  ELSIF v_lead.converted_partner_id IS NOT NULL
     OR (v_lead.ico IS NOT NULL AND EXISTS (SELECT 1 FROM public.partners p WHERE p.ico = v_lead.ico)) THEN
    v_reason := 'existing_partner';
  ELSIF v_recipient IS DISTINCT FROM lower(btrim(v_item.recipient_snapshot)) THEN
    v_reason := 'contact_email_changed';
  ELSIF v_lead.email_verified_by_admin IS NOT TRUE
     OR v_lead.email_verification_method NOT IN ('admin_manual', 'backend_verified_official_website')
     OR v_lead.email_verified_at IS NULL
     OR nullif(btrim(coalesce(v_lead.email_source, '')), '') IS NULL THEN
    v_reason := 'email_not_verified';
  ELSIF EXISTS (SELECT 1 FROM public.sales_lead_email_suppression s
                WHERE lower(btrim(s.email_pattern)) IN (v_recipient, v_domain)) THEN
    v_reason := 'suppressed';
  ELSIF public.sales_lead_initial_email_already_recorded(v_item.lead_id, v_recipient, NULL) THEN
    v_reason := 'initial_email_already_sent';
  ELSIF EXISTS (SELECT 1 FROM public.sales_lead_email_deliveries d
                WHERE d.lead_id = v_item.lead_id
                  AND (d.batch_item_id IS DISTINCT FROM v_item.id)
                  AND d.status IN ('prepared','sending','provider_accepted','committed','uncertain')) THEN
    v_reason := 'initial_email_already_claimed';
  ELSIF EXISTS (SELECT 1 FROM public.sales_lead_email_batch_items other
                WHERE other.id <> v_item.id
                  AND other.status IN ('processing', 'sent')
                  AND (other.lead_id = v_item.lead_id
                       OR lower(btrim(other.recipient_snapshot)) = v_recipient)) THEN
    v_reason := 'already_in_active_batch';
  END IF;
  IF v_reason IS NULL THEN
    v_guard := public.sales_lead_email_send_guard(v_item.lead_id);
    IF coalesce((v_guard->>'success')::boolean, false) IS NOT TRUE THEN
      v_reason := coalesce(v_guard->>'error', 'duplicate_guard_failed');
    END IF;
  END IF;

  IF v_reason IS NOT NULL THEN
    UPDATE public.sales_lead_email_batch_items
    SET status = 'skipped', skip_reason = v_reason, updated_at = now()
    WHERE id = v_item.id AND status = 'pending';
    PERFORM public.sales_lead_email_batch_recalculate_status(v_item.batch_id);
    RETURN jsonb_build_object('success', true, 'action', 'skipped', 'reason', v_reason,
      'batch_item_id', v_item.id, 'batch_id', v_item.batch_id, 'lead_id', v_item.lead_id);
  END IF;

  UPDATE public.sales_lead_email_batch_items
  SET status = 'processing', attempt_count = attempt_count + 1, updated_at = now()
  WHERE id = v_item.id AND status = 'pending'
  RETURNING * INTO v_item;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'action', 'noop', 'reason', 'item_already_taken');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'send',
    'batch_item_id', v_item.id,
    'batch_id', v_item.batch_id,
    'lead_id', v_item.lead_id,
    'performed_by', v_batch.created_by,
    'recipient', v_item.recipient_snapshot,
    'subject', v_item.subject_snapshot,
    'body_source', v_item.body_source_snapshot,
    'body_text', v_item.body_text_snapshot,
    'body_html', v_item.body_html_snapshot,
    'attempt_count', v_item.attempt_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_claim_next() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_claim_next() TO service_role;

COMMENT ON FUNCTION public.sales_lead_email_batch_claim_next() IS
  'Zabere nejvýše jednu položku k odeslání. Kontroluje kill-switch, denní strop daily_limit '
  'POUZE pro dávkový tok (Europe/Prague; počítá processing položky a batch_initial delivery '
  've stavech sending/provider_accepted/committed/uncertain), časové okno a všechny '
  'bezpečnostní podmínky leadu. Ruční první e-maily se do stropu nezapočítávají a limit '
  'nemají. Při dosažení stropu vrací noop/daily_limit_reached a nic neodešle.';

COMMIT;
