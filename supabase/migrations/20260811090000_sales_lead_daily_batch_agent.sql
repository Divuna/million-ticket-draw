-- Nejužší bezpečné serverové propojení pro externího denního agenta (Magin).
--
-- Proč vůbec existuje: každá stávající cesta k založení a aktivaci dávky
-- (sales_lead_email_batch_create / _prepare_paused / _activate_admin) je gatovaná
-- přes auth.uid() + has_admin_permission('sales_leads.manage'). Volání přes
-- service_role má auth.uid() = NULL, takže by skončilo na 'access_denied'.
-- Externí agent přitom NESMÍ držet service-role klíč ani přihlášení admina.
--
-- Řešení kopíruje už schválený vzor plánovače discovery jobů: jedna
-- SECURITY DEFINER funkce volatelná POUZE service rolí, která si sama ověří
-- vlastníka přes sales_lead_pick_discovery_owner() a teprve pod jeho identitou
-- zavolá EXISTUJÍCÍ admin cestu. Žádná bezpečnostní bariéra se neobchází ani
-- nekopíruje — všechny kontroly dál dělá sales_lead_email_batch_check_one()
-- a sales_lead_email_batch_create().
--
-- Funkce NIKDY neodesílá e-mail. Rozesílání a rozložení do okna 08:30–16:30
-- zůstává výhradně na existujícím workeru.

BEGIN;

CREATE OR REPLACE FUNCTION public.sales_lead_email_batch_agent_run(
  p_scheduled_date date,
  p_requested_count integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_settings public.sales_lead_email_automation_settings%ROWTYPE;
  v_owner uuid;
  v_template_id uuid;
  v_template_count integer;
  v_existing public.sales_lead_email_batches%ROWTYPE;
  v_candidate record;
  v_check jsonb;
  v_lead_ids uuid[] := ARRAY[]::uuid[];
  v_idempotency_key text;
  v_prepare jsonb;
  v_activate jsonb;
  v_batch_id uuid;
  v_scheduled_count integer;
  v_skipped_count integer;
  v_first_at timestamptz;
  v_last_at timestamptz;
BEGIN
  -- 1. Vstupní rozsah. Agent nesmí požádat o víc, než dovolí denní limit.
  IF p_scheduled_date IS NULL OR p_requested_count IS NULL OR p_requested_count < 1 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_request');
  END IF;

  -- 2. Serializace se spínačem automatiky (stejný zámek jako admin cesta).
  SELECT * INTO v_settings
  FROM public.sales_lead_email_automation_settings
  WHERE singleton
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'automation_settings_missing');
  END IF;
  IF v_settings.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('success', false, 'error', 'automation_disabled');
  END IF;
  IF p_requested_count > v_settings.daily_limit THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'requested_count_above_daily_limit',
      'daily_limit', v_settings.daily_limit
    );
  END IF;

  -- 3. Idempotence na den. Existující dávku nikdy nezdvojíme ani znovu
  --    neaktivujeme; zrušená dávka se také nenahrazuje novou.
  SELECT * INTO v_existing
  FROM public.sales_lead_email_batches
  WHERE scheduled_date = p_scheduled_date
  ORDER BY created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'action', 'already_exists',
      'batch_id', v_existing.id,
      'batch_status', v_existing.status,
      'scheduled_date', p_scheduled_date,
      'scheduled_count', v_existing.scheduled_count,
      'created_second_batch', false
    );
  END IF;

  -- 4. Vlastník. Musí existovat v auth.users, mít roli admin/superadmin a projít
  --    has_admin_permission('sales_leads.manage'). Bez něj se vědomě nic nezaloží.
  v_owner := public.sales_lead_pick_discovery_owner();
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_owner_available');
  END IF;

  -- 5. Šablona. Server ji vybírá sám — agent ji nesmí ovlivnit. Musí být právě
  --    jedna aktivní šablona typu 'initial', jinak fail-closed.
  SELECT count(*), min(id) INTO v_template_count, v_template_id
  FROM public.sales_lead_email_templates
  WHERE is_active AND template_type = 'initial';
  IF v_template_count <> 1 THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'active_initial_template_not_unique',
      'active_template_count', v_template_count
    );
  END IF;

  -- 6. Výběr leadů. Pouze skupina 'e-shopy'. Levný předfiltr jen zužuje množinu;
  --    o způsobilosti rozhoduje kanonická sales_lead_email_batch_check_one().
  FOR v_candidate IN
    SELECT l.id
    FROM public.sales_leads l
    WHERE l.lead_group = 'e-shopy'
      AND l.status IN ('novy', 'priprava', 'schvaleni_ceka')
      AND l.do_not_contact IS NOT TRUE
      AND l.email_verified_by_admin IS TRUE
      AND l.contact_email IS NOT NULL
    ORDER BY l.created_at ASC, l.id ASC
  LOOP
    EXIT WHEN array_length(v_lead_ids, 1) >= p_requested_count;
    v_check := public.sales_lead_email_batch_check_one(v_candidate.id, v_template_id);
    IF coalesce((v_check->>'eligible')::boolean, false) THEN
      v_lead_ids := v_lead_ids || v_candidate.id;
    END IF;
  END LOOP;

  IF coalesce(array_length(v_lead_ids, 1), 0) = 0 THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'no_eligible_leads',
      'scheduled_date', p_scheduled_date, 'requested_count', p_requested_count
    );
  END IF;

  -- 7. Pod identitou ověřeného vlastníka zavoláme EXISTUJÍCÍ admin cestu.
  --    set_config(..., true) je transakčně lokální, takže identita nepřežije
  --    tuto funkci. Bariéry uvnitř create/activate zůstávají beze změny.
  v_idempotency_key := 'magin-daily-' || to_char(p_scheduled_date, 'YYYY-MM-DD');
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );

  v_prepare := public.sales_lead_email_batch_prepare_paused(
    v_lead_ids, v_template_id, p_scheduled_date, v_idempotency_key
  );
  IF coalesce((v_prepare->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false, 'error', coalesce(v_prepare->>'error', 'prepare_failed'),
      'stage', 'prepare'
    );
  END IF;

  v_batch_id := nullif(v_prepare->>'batch_id', '')::uuid;
  IF v_batch_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'prepare_missing_batch_id', 'stage', 'prepare');
  END IF;

  v_activate := public.sales_lead_email_batch_activate_admin(v_batch_id);
  IF coalesce((v_activate->>'success')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false, 'error', coalesce(v_activate->>'error', 'activate_failed'),
      'stage', 'activate', 'batch_id', v_batch_id
    );
  END IF;

  -- 8. Souhrn pro hlášení Řediteli.
  SELECT b.scheduled_count, b.skipped_count INTO v_scheduled_count, v_skipped_count
  FROM public.sales_lead_email_batches b WHERE b.id = v_batch_id;

  SELECT min(i.scheduled_at), max(i.scheduled_at) INTO v_first_at, v_last_at
  FROM public.sales_lead_email_batch_items i WHERE i.batch_id = v_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'action', 'created_and_activated',
    'batch_id', v_batch_id,
    'scheduled_date', p_scheduled_date,
    'requested_count', p_requested_count,
    'scheduled_count', v_scheduled_count,
    'skipped_count', v_skipped_count,
    'lead_group', 'e-shopy',
    'template_id', v_template_id,
    'first_scheduled_at', v_first_at,
    'last_scheduled_at', v_last_at,
    'created_second_batch', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_email_batch_agent_run(date, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_email_batch_agent_run(date, integer) TO service_role;

COMMENT ON FUNCTION public.sales_lead_email_batch_agent_run(date, integer) IS
  'Denní vstup externího agenta (Magin). Volatelné pouze service rolí z Edge Function '
  'sales-lead-daily-batch-agent. Skupinu (e-shopy), šablonu i způsobilost určuje server; '
  'agent posílá jen datum a počet. Idempotentní na den, nikdy nevytvoří druhou dávku, '
  'nikdy neaktivuje starou pozastavenou dávku a nikdy neodesílá e-mail.';

COMMIT;
