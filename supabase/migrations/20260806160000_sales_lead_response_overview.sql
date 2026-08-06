-- ============================================================================
-- SALES LEADS — administrační přehled reakcí „Mám zájem“ / „Nemám zájem“.
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §24.
-- ============================================================================
-- Zapsáno jako soubor v repu. Aplikace na staging/produkci vyžaduje výslovné
-- schválení Pavla. TÍMTO SOUBOREM SE NESPOUŠTÍ ŽÁDNÉ SQL.
--
-- Proč RPC a ne přímý SELECT z frontendu:
--   `sales_lead_email_response_tokens` má REVOKE ALL pro anon i authenticated
--   (service_role only). Administrace se k autoritativnímu konečnému stavu
--   tokenu jinak než přes SECURITY DEFINER funkci nedostane. Frontend NIKDY
--   nepoužívá service-role klíč.
--
-- Autoritativní zdroj pravdy:
--   Konečný stav response tokenu (`interested` / `declined`). Pro každý lead se
--   bere NEJNOVĚJŠÍ zodpovězený token, takže jeden lead nemůže spadnout do obou
--   skupin současně. Aktivita `interest_link` slouží jen jako fallback pro lead,
--   který token nemá (např. po úklidu testovacích dat).
--
-- Nepřečtené počty se počítají VÝHRADNĚ z reakcí na tlačítka v obchodním
-- e-mailu, ne ze všech leadů v daném stavu:
--   • zájem    → activity_type='reply_received',    metadata source='interest_link'
--   • odmítnutí→ activity_type='do_not_contact_set', metadata source='decline_link'
--   Ručně nastavený stav „Nekontaktovat“ zakládá `do_not_contact_set` BEZ
--   metadata.source, takže se do počtu nových odmítnutí nikdy nezapočítá.
--
-- Rozsah: jen čtení `sales_leads` / `sales_lead_activities` /
-- `sales_lead_email_response_tokens` / `sales_lead_email_suppression`
-- + rozšíření značení přečtení. Nesahá na wallets/payments/contests/tickets/
-- winners/Stripe/`buy_ticket_atomic`/`email_queue`/dávky/automatiku.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_response_overview();
--   DROP INDEX IF EXISTS public.idx_sales_lead_activities_unread_decline;
--   -- a obnovit předchozí definici sales_lead_mark_replies_read
--   -- z 20260711100000_sales_leads_activity_read_state.sql
-- ============================================================================

BEGIN;

-- ── 1. Parciální index pro nepřečtená odmítnutí z tlačítka ──────────────────
-- Zrcadlí existující idx_sales_lead_activities_unread_reply. Drží jen
-- nepřečtená `do_not_contact_set` (ručně nastavená i z tlačítka) — malý index.
CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_unread_decline
  ON public.sales_lead_activities (lead_id)
  WHERE activity_type = 'do_not_contact_set' AND read_at IS NULL;

-- ── 2. Rozšíření existující funkce značení přečtení ─────────────────────────
-- Záměrně se rozšiřuje STÁVAJÍCÍ funkce (stejný název i signatura), aby detail
-- leadu nemusel volat druhou. Nově označí i odmítnutí z tlačítka „Nemám zájem“.
--
-- KRITICKÉ: funkce mění VÝHRADNĚ `read_at` / `read_by`. Nikdy neruší
-- `do_not_contact`, `do_not_contact_reason`, suppression ani stav
-- `nekontaktovat` — přečtení je jen UI příznak.
--
-- Ručně nastavené „Nekontaktovat“ (bez metadata.source) se ZÁMĚRNĚ neoznačuje,
-- aby se chování ručních záznamů nezměnilo.
CREATE OR REPLACE FUNCTION public.sales_lead_mark_replies_read(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_marked integer;
BEGIN
  IF NOT (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  UPDATE public.sales_lead_activities
    SET read_at = now(), read_by = auth.uid()
    WHERE lead_id = p_lead_id
      AND read_at IS NULL
      AND (
        activity_type = 'reply_received'
        OR (
          activity_type = 'do_not_contact_set'
          AND metadata->>'source' = 'decline_link'
        )
      );
  GET DIAGNOSTICS v_marked = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'marked_count', v_marked);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_mark_replies_read(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_mark_replies_read(uuid) TO authenticated;

-- ── 3. Read-only přehled reakcí pro administraci ────────────────────────────
-- Žádný zápis. Vrací jen údaje, které administrace už vidí v detailu leadu;
-- surový token ani jeho hash se nikdy nevrací.
CREATE OR REPLACE FUNCTION public.sales_lead_response_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  WITH settled AS (
    -- Nejnovější zodpovězený token na lead = autoritativní konečná odpověď.
    SELECT DISTINCT ON (t.lead_id)
      t.lead_id,
      t.status,
      t.responded_at,
      t.response_name,
      t.response_phone,
      t.recipient_snapshot,
      t.batch_item_id
    FROM public.sales_lead_email_response_tokens t
    WHERE t.status IN ('interested', 'declined')
    ORDER BY t.lead_id, t.responded_at DESC NULLS LAST
  ),
  interest_activity AS (
    -- Fallback pro lead bez tokenu + zdroj času a nepřečtenosti.
    SELECT DISTINCT ON (a.lead_id)
      a.lead_id,
      a.created_at,
      a.metadata->>'batch_item_id' AS batch_item_id
    FROM public.sales_lead_activities a
    WHERE a.activity_type = 'reply_received'
      AND a.direction = 'inbound'
      AND a.metadata->>'source' = 'interest_link'
      AND (a.metadata->>'interest')::boolean IS TRUE
    ORDER BY a.lead_id, a.created_at DESC
  ),
  unread_interest AS (
    SELECT a.lead_id, count(*) AS unread
    FROM public.sales_lead_activities a
    WHERE a.activity_type = 'reply_received'
      AND a.direction = 'inbound'
      AND a.read_at IS NULL
      AND a.metadata->>'source' = 'interest_link'
      AND (a.metadata->>'interest')::boolean IS TRUE
    GROUP BY a.lead_id
  ),
  decline_activity AS (
    SELECT DISTINCT ON (a.lead_id)
      a.lead_id,
      a.created_at,
      a.metadata->>'batch_item_id' AS batch_item_id
    FROM public.sales_lead_activities a
    WHERE a.activity_type = 'do_not_contact_set'
      AND a.direction = 'inbound'
      AND a.metadata->>'source' = 'decline_link'
    ORDER BY a.lead_id, a.created_at DESC
  ),
  unread_decline AS (
    SELECT a.lead_id, count(*) AS unread
    FROM public.sales_lead_activities a
    WHERE a.activity_type = 'do_not_contact_set'
      AND a.direction = 'inbound'
      AND a.read_at IS NULL
      AND a.metadata->>'source' = 'decline_link'
    GROUP BY a.lead_id
  ),
  -- Jeden lead = jedna skupina. Token vyhrává; aktivita jen doplňuje lead bez tokenu.
  resolved AS (
    SELECT
      l.id AS lead_id,
      COALESCE(
        s.status,
        CASE WHEN ia.lead_id IS NOT NULL THEN 'interested' END
      ) AS response_status,
      COALESCE(s.responded_at, ia.created_at, da.created_at) AS responded_at,
      COALESCE(s.batch_item_id::text, ia.batch_item_id, da.batch_item_id) AS batch_item_id,
      s.response_name,
      s.response_phone,
      s.recipient_snapshot,
      l.company_name,
      l.status AS lead_status,
      l.priority,
      l.contact_person,
      l.contact_phone,
      l.contact_email,
      l.do_not_contact,
      l.do_not_contact_reason,
      COALESCE(ui.unread, 0) AS unread_interest,
      COALESCE(ud.unread, 0) AS unread_decline
    FROM public.sales_leads l
    LEFT JOIN settled s ON s.lead_id = l.id
    LEFT JOIN interest_activity ia ON ia.lead_id = l.id
    LEFT JOIN decline_activity da ON da.lead_id = l.id
    LEFT JOIN unread_interest ui ON ui.lead_id = l.id
    LEFT JOIN unread_decline ud ON ud.lead_id = l.id
    WHERE s.lead_id IS NOT NULL OR ia.lead_id IS NOT NULL OR da.lead_id IS NOT NULL
  )
  SELECT jsonb_build_object(
    'success', true,
    'interested', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lead_id', r.lead_id,
        'company_name', r.company_name,
        'lead_status', r.lead_status,
        'priority', r.priority,
        'contact_person', NULLIF(btrim(COALESCE(r.response_name, r.contact_person, '')), ''),
        'contact_phone', NULLIF(btrim(COALESCE(r.response_phone, r.contact_phone, '')), ''),
        'contact_email', NULLIF(btrim(COALESCE(r.contact_email, r.recipient_snapshot, '')), ''),
        'responded_at', r.responded_at,
        'batch_item_id', r.batch_item_id,
        'unread', r.unread_interest > 0
      ) ORDER BY r.unread_interest > 0 DESC, r.responded_at DESC NULLS LAST, r.company_name)
      FROM resolved r
      WHERE r.response_status = 'interested'
    ), '[]'::jsonb),
    'declined', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'lead_id', r.lead_id,
        'company_name', r.company_name,
        'lead_status', r.lead_status,
        'contact_email', NULLIF(btrim(COALESCE(r.contact_email, r.recipient_snapshot, '')), ''),
        'responded_at', r.responded_at,
        'batch_item_id', r.batch_item_id,
        'do_not_contact', r.do_not_contact,
        'do_not_contact_reason', r.do_not_contact_reason,
        'suppressed', EXISTS (
          SELECT 1 FROM public.sales_lead_email_suppression sup
          WHERE lower(btrim(sup.email_pattern))
                = lower(btrim(COALESCE(r.recipient_snapshot, r.contact_email, '')))
        ),
        'unread', r.unread_decline > 0
      ) ORDER BY r.unread_decline > 0 DESC, r.responded_at DESC NULLS LAST, r.company_name)
      FROM resolved r
      WHERE r.response_status = 'declined'
    ), '[]'::jsonb),
    'interested_total', (SELECT count(*) FROM resolved WHERE response_status = 'interested'),
    'declined_total', (SELECT count(*) FROM resolved WHERE response_status = 'declined'),
    'interested_unread', COALESCE((
      SELECT sum(r.unread_interest) FROM resolved r WHERE r.response_status = 'interested'
    ), 0),
    'declined_unread', COALESCE((
      SELECT sum(r.unread_decline) FROM resolved r WHERE r.response_status = 'declined'
    ), 0)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_response_overview() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_response_overview() TO authenticated;

COMMIT;
