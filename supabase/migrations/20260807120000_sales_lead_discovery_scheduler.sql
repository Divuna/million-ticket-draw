-- ============================================================================
-- SALES LEADS — automatické zakládání discovery jobů + přísnější deduplikace.
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §26.
-- ============================================================================
-- Zapsáno jako soubor v repu. Aplikace na staging/produkci vyžaduje výslovné
-- schválení Pavla. TÍMTO SOUBOREM SE NESPOUŠTÍ ŽÁDNÉ SQL.
--
-- Proč: discovery worker (cron → run_sales_lead_discovery_worker →
-- sales-lead-discover) je funkční, ale sám nové firmy NEHLEDÁ — jen zpracuje
-- frontu `sales_lead_discovery_jobs`, kterou dosud plnil výhradně člověk
-- v administraci. Fronta je prázdná od 23. 07. 2026, takže cron od té doby
-- každou minutu jen nastartuje a hned skončí.
--
-- Tato migrace doplňuje POUZE chybějící článek — plánovač, který jednou denně
-- založí jeden discovery job, pokud žádný neběží. Architektura workeru,
-- ověřování webu ani ukládání do Návrhů se NEMĚNÍ.
--
-- Rozsah: `sales_lead_discovery_jobs`, dvě propose RPC, jeden nový cron.
-- Nedotýká se peněženek, plateb, soutěží, partnerů, e-mailových dávek ani
-- e-mailové automatiky.
--
-- Rollback:
--   SELECT cron.unschedule('sales_lead_discovery_scheduler_daily');
--   DROP FUNCTION IF EXISTS public.run_sales_lead_discovery_scheduler();
--   DROP FUNCTION IF EXISTS public.sales_lead_pick_next_discovery_group();
--   ALTER TABLE public.sales_lead_discovery_jobs DROP COLUMN IF EXISTS auto_created;
--   -- a obnovit sales_lead_propose / _with_contact z předchozích migrací
-- ============================================================================

BEGIN;

-- ── 1. Audit: rozlišení automatického a ručního jobu ────────────────────────
-- Ostatní auditní data (kategorie, kandidáti, uložené, duplicity, finish_reason)
-- už tabulka nese — nový dashboard není potřeba.
ALTER TABLE public.sales_lead_discovery_jobs
  ADD COLUMN IF NOT EXISTS auto_created boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales_lead_discovery_jobs.auto_created IS
  'true = job založil automatický plánovač run_sales_lead_discovery_scheduler(); false = člověk z administrace.';

-- ── 2. Rotace kategorií (LRU nad SKUTEČNÝM číselníkem) ──────────────────────
-- Vybere aktivní skupinu z `sales_lead_groups`, která se v discovery jobech
-- používala nejdéle (nikdy použitá má přednost). Tím se zabrání tomu, aby
-- systém hledal každý den totéž. Nevymýšlí nové názvy kategorií.
--
-- `jine` je záměrně vyloučena — je to catch-all pro klasifikaci, ne cílový
-- segment k aktivnímu vyhledávání.
CREATE OR REPLACE FUNCTION public.sales_lead_pick_next_discovery_group()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.slug
  FROM public.sales_lead_groups g
  LEFT JOIN LATERAL (
    SELECT max(j.created_at) AS last_used
    FROM public.sales_lead_discovery_jobs j
    WHERE j.lead_group = g.slug
  ) u ON true
  WHERE g.is_active
    AND g.slug <> 'jine'
  ORDER BY u.last_used ASC NULLS FIRST, g.sort_order ASC, g.slug ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_pick_next_discovery_group()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_pick_next_discovery_group()
  TO service_role;

-- ── 2b. Vlastník automatického jobu ─────────────────────────────────────────
-- `sales_leads.created_by` má FK na `auth.users` (ON DELETE RESTRICT) a je
-- NOT NULL. `sales_lead_discovery_jobs` ale FK NEMÁ, takže jeho `created_by`
-- může „viset" na smazaného uživatele. Kdyby takové UUID prošlo do jobu,
-- každý `sales_lead_propose` by skončil foreign_key_violation a job by spálil
-- všech 80 kandidátů s 0 uloženými leady — tiché selhání vypadající jako
-- saturace kategorie.
--
-- Proto se vlastník VŽDY validuje:
--   • existuje v auth.users,
--   • má aktuálně roli admin nebo superadmin,
--   • projde kanonickou kontrolou has_admin_permission('sales_leads.manage')
--     (ta vrací true i pro superadmina).
--
-- Pořadí: autor posledního discovery jobu, pokud je stále vhodný; jinak
-- deterministicky superadmin, pak nejstarší admin. Nezakládá žádný systémový
-- účet a nemění role ani auth uživatele.
CREATE OR REPLACE FUNCTION public.sales_lead_pick_discovery_owner()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH eligible AS (
    SELECT DISTINCT ON (u.id)
      u.id,
      u.created_at,
      (r.role::text = 'superadmin') AS is_superadmin
    FROM auth.users u
    JOIN public.user_roles r ON r.user_id = u.id
    WHERE r.role::text IN ('admin', 'superadmin')
      AND public.has_admin_permission('sales_leads.manage', u.id)
    ORDER BY u.id, (r.role::text = 'superadmin') DESC
  ),
  last_owner AS (
    SELECT j.created_by AS id
    FROM public.sales_lead_discovery_jobs j
    WHERE j.created_by IS NOT NULL
    ORDER BY j.created_at DESC
    LIMIT 1
  )
  SELECT e.id
  FROM eligible e
  ORDER BY
    -- 1) autor posledního jobu, ale JEN když je stále vhodný
    (e.id = (SELECT id FROM last_owner)) DESC,
    -- 2) jinak deterministicky: superadmin, pak nejstarší účet
    e.is_superadmin DESC,
    e.created_at ASC,
    e.id ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_pick_discovery_owner()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_pick_discovery_owner()
  TO service_role;

-- ── 3. Plánovač ─────────────────────────────────────────────────────────────
-- JEDINÝ účel: založit discovery job. Nic neodesílá, nevytváří e-mailovou
-- dávku, nezapíná automatiku, nemění stavy leadů.
--
-- Idempotence: pokud existuje job ve stavu queued/running, nevytvoří nic.
-- Advisory lock brání souběžnému vytvoření dvou jobů.
--
-- Parametry vycházejí z 13 historických jobů: requested_count 5–10,
-- max_candidates vždy 80. Volíme konzervativní 5/80 — pozdější běhy měly kvůli
-- saturaci vyšší podíl duplicit, takže menší dávka šetří OpenAI/web search.
--
-- `created_by`: `sales_leads.created_by` je NOT NULL, takže job musí nést
-- reálného admina, jinak by worker neuložil ani jeden lead. Bereme autora
-- posledního discovery jobu, jinak libovolného superadmina. Bez něj se job
-- ZÁMĚRNĚ nevytvoří (fail closed).
CREATE OR REPLACE FUNCTION public.run_sales_lead_discovery_scheduler()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_group text;
  v_created_by uuid;
  v_job_id uuid;
BEGIN
  -- Jen jeden plánovač najednou.
  IF NOT pg_try_advisory_xact_lock(hashtextextended('sales_lead_discovery_scheduler', 0)) THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'scheduler_busy');
  END IF;

  -- Nikdy dva paralelní discovery joby.
  IF EXISTS (
    SELECT 1 FROM public.sales_lead_discovery_jobs
    WHERE status IN ('queued', 'running')
  ) THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'job_already_active');
  END IF;

  v_group := public.sales_lead_pick_next_discovery_group();
  IF v_group IS NULL THEN
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'no_active_group');
  END IF;

  -- Vlastník se vždy validuje (existuje + admin/superadmin + sales_leads.manage).
  -- Nikdy se nepoužije UUID jen proto, že bylo na starém jobu.
  v_created_by := public.sales_lead_pick_discovery_owner();

  IF v_created_by IS NULL THEN
    -- sales_leads.created_by je NOT NULL — bez platného vlastníka by worker
    -- neuložil nic. Fail closed: žádný job, žádný částečný zápis, bez výjimky.
    RETURN jsonb_build_object('success', true, 'created', false, 'reason', 'no_owner_available');
  END IF;

  INSERT INTO public.sales_lead_discovery_jobs (
    lead_group, requested_count, max_candidates, status, created_by, auto_created
  )
  VALUES (v_group, 5, 80, 'queued', v_created_by, true)
  RETURNING id INTO v_job_id;

  RETURN jsonb_build_object(
    'success', true,
    'created', true,
    'job_id', v_job_id,
    'lead_group', v_group,
    'created_by', v_created_by,
    'requested_count', 5,
    'max_candidates', 80
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_sales_lead_discovery_scheduler()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_sales_lead_discovery_scheduler()
  TO service_role;

-- ── 4. Cron: 1× denně ───────────────────────────────────────────────────────
-- Frekvence: jeden nový job denně, a to jen když žádný neběží. Worker si ho
-- pak po dávkách dotáhne (běží každou minutu). Denní kadence průběžně doplňuje
-- Návrhy a nepálí zbytečně OpenAI/web search.
-- V SQL příkazu NENÍ žádný secret — token i URL čte až worker z Vaultu.
SELECT cron.unschedule('sales_lead_discovery_scheduler_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sales_lead_discovery_scheduler_daily');

SELECT cron.schedule(
  'sales_lead_discovery_scheduler_daily',
  '20 4 * * *',
  $cron$SELECT public.run_sales_lead_discovery_scheduler();$cron$
);

-- ── 5. Přísnější deduplikace před uložením leadu ────────────────────────────
-- Rozšiřuje STÁVAJÍCÍ `sales_lead_propose` (na kterou `_with_contact` deleguje,
-- takže jedno místo pokryje obě cesty).
--
-- Nově blokuje také:
--   • shodný contact_email,
--   • lead s do_not_contact,
--   • suppression podle PŘESNÉHO e-mailu (dosud jen doménová),
--   • ARCHIVOVANÉ leady — dřív `status <> 'archivovan'` archivované vyřazoval,
--     takže stejná firma mohla vzniknout znovu. Nově blokují i ony, čímž je
--     pokryta i „dříve oslovená / odpovědělá firma".
CREATE OR REPLACE FUNCTION public.sales_lead_propose(
  p_created_by uuid,
  p_company_name text,
  p_lead_group text,
  p_discovery_source text,
  p_lead_quality smallint DEFAULT 0,
  p_discovery_meta jsonb DEFAULT '{}'::jsonb,
  p_website text DEFAULT NULL::text,
  p_ico text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text,
  p_industry text DEFAULT NULL::text,
  p_contact_email text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_id uuid;
  v_domain text;
  v_name text := btrim(coalesce(p_company_name, ''));
  v_ico text := NULLIF(btrim(coalesce(p_ico, '')), '');
  v_website text := NULLIF(btrim(coalesce(p_website, '')), '');
  v_email text := NULLIF(lower(btrim(coalesce(p_contact_email, ''))), '');
BEGIN
  IF v_name = '' THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'company_name_required');
  END IF;
  IF NULLIF(btrim(coalesce(p_lead_group, '')), '') IS NULL
     OR NULLIF(btrim(coalesce(p_discovery_source, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'classification_required');
  END IF;

  IF v_website IS NOT NULL THEN
    v_domain := lower(regexp_replace(
      regexp_replace(v_website, '^https?://(?:[^/@]*@)?', '', 'i'),
      '(:[0-9]+)?[/?#].*$|:[0-9]+$', ''));
    v_domain := NULLIF(regexp_replace(v_domain, '^www\.', ''), '');
  END IF;

  -- Pozn.: `status <> 'archivovan'` je ZÁMĚRNĚ pryč — archivovaná firma
  -- (i dříve oslovená či odpovědělá) se nesmí automaticky založit znovu.
  IF v_ico IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_leads WHERE ico = v_ico
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'duplicate_ico');
  END IF;
  IF v_domain IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_leads WHERE website_domain = v_domain
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'duplicate_domain');
  END IF;
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_leads WHERE lower(btrim(contact_email)) = v_email
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'duplicate_email');
  END IF;

  -- Firma označená „nekontaktovat" se nesmí objevit jako nový lead.
  IF EXISTS (
    SELECT 1 FROM public.sales_leads
    WHERE do_not_contact IS TRUE
      AND (
        (v_domain IS NOT NULL AND website_domain = v_domain)
        OR (v_ico IS NOT NULL AND ico = v_ico)
        OR (v_email IS NOT NULL AND lower(btrim(contact_email)) = v_email)
      )
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'do_not_contact');
  END IF;

  IF v_ico IS NOT NULL AND to_regclass('public.partners') IS NOT NULL THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM public.partners WHERE ico = v_ico) THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'already_partner');
      END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
  END IF;

  -- Suppression: doménová i podle přesné adresy.
  IF v_domain IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_lead_email_suppression
    WHERE email_pattern = '@' || v_domain
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'suppressed_domain');
  END IF;
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_lead_email_suppression
    WHERE lower(btrim(email_pattern)) = v_email
       OR (email_pattern LIKE '@%' AND v_email LIKE '%' || lower(btrim(email_pattern)))
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'suppressed_email');
  END IF;

  BEGIN
    INSERT INTO public.sales_leads (
      company_name, website, ico, city, industry,
      status, lead_group, lead_quality, discovery_source, discovery_meta,
      source, created_by,
      email_verified_by_admin
    ) VALUES (
      v_name, v_website, v_ico,
      NULLIF(btrim(coalesce(p_city, '')), ''),
      NULLIF(btrim(coalesce(p_industry, '')), ''),
      'navrzeny',
      p_lead_group,
      COALESCE(p_lead_quality, 0),
      p_discovery_source,
      COALESCE(p_discovery_meta, '{}'::jsonb),
      'ai_vyhledavani',
      p_created_by,
      false
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'duplicate');
    WHEN check_violation THEN
      RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'invalid_input');
    WHEN foreign_key_violation THEN
      -- Typicky neplatný `created_by` (FK na auth.users). Dřív to byla
      -- neodchycená výjimka, kterou worker jen zalogoval — job pak spálil
      -- všechny kandidáty s 0 uloženými leady. Nově vrátí čitelný důvod.
      RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'invalid_owner');
  END;

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (v_id, 'lead_discovered', 'internal', p_created_by,
          jsonb_build_object('discovery_source', p_discovery_source, 'lead_group', p_lead_group));

  RETURN jsonb_build_object('success', true, 'outcome', 'created', 'lead_id', v_id);
END;
$$;

-- ── 6. Předání e-mailu do dedupu ────────────────────────────────────────────
-- `_with_contact` už e-mail zná; nově ho předá i do `sales_lead_propose`,
-- aby se duplicitní/potlačený kontakt zachytil ještě PŘED vznikem leadu.
-- Zbytek funkce zůstává beze změny.
CREATE OR REPLACE FUNCTION public.sales_lead_propose_with_contact(
  p_created_by uuid,
  p_company_name text,
  p_lead_group text,
  p_discovery_source text,
  p_email text,
  p_email_source_url text,
  p_discovery_meta jsonb DEFAULT '{}'::jsonb,
  p_website text DEFAULT NULL::text,
  p_ico text DEFAULT NULL::text,
  p_city text DEFAULT NULL::text,
  p_industry text DEFAULT NULL::text,
  p_lead_quality smallint DEFAULT 0,
  p_proposed_by text DEFAULT 'ai'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_source text := btrim(coalesce(p_email_source_url, ''));
  v_result jsonb;
  v_lead_id uuid;
  v_matches jsonb;
  v_verified_at timestamptz := clock_timestamp();
  v_contact_block_reason text;
BEGIN
  IF p_proposed_by IS DISTINCT FROM 'backend_verified_official_website' THEN
    RETURN jsonb_build_object(
      'success', false,
      'outcome', 'error',
      'reason', 'backend_verification_required'
    );
  END IF;
  IF v_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$' THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'invalid_email');
  END IF;
  IF v_source !~* '^https?://' THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'source_url_required');
  END IF;

  -- Duplicitní nebo potlačený e-mail nesmí být uložen. Firma ale může vzniknout
  -- bez kontaktu, což je bezpečné chování discovery.
  PERFORM pg_advisory_xact_lock(hashtextextended(split_part(v_email, '@', 2), 0));
  v_matches := public.sales_lead_duplicate_matches(v_email, NULL);
  IF jsonb_array_length(v_matches) > 0 THEN
    v_contact_block_reason := 'duplicate_conflict';
  ELSIF EXISTS (
    SELECT 1
    FROM public.sales_lead_email_suppression s
    WHERE lower(s.email_pattern) = v_email
       OR (s.email_pattern LIKE '@%' AND v_email LIKE '%' || lower(s.email_pattern))
  ) THEN
    v_contact_block_reason := 'suppressed';
  END IF;

  v_result := public.sales_lead_propose(
    p_created_by,
    p_company_name,
    p_lead_group,
    p_discovery_source,
    p_lead_quality,
    coalesce(p_discovery_meta, '{}'::jsonb),
    p_website,
    p_ico,
    p_city,
    p_industry,
    v_email
  );
  IF coalesce(v_result->>'outcome', '') IS DISTINCT FROM 'created' THEN
    RETURN v_result;
  END IF;

  v_lead_id := (v_result->>'lead_id')::uuid;
  IF v_contact_block_reason IS NOT NULL THEN
    RETURN v_result || jsonb_build_object(
      'contact_stored', false,
      'contact_reason', v_contact_block_reason
    );
  END IF;

  UPDATE public.sales_leads
  SET contact_email = v_email,
      email_source = v_source,
      email_verified_by_admin = true,
      email_verification_method = 'backend_verified_official_website',
      email_verified_at = v_verified_at,
      contact_data_provenance = jsonb_set(
        coalesce(contact_data_provenance, '{}'::jsonb),
        '{email}',
        jsonb_build_object(
          'value', v_email,
          'source_url', v_source,
          'method', 'backend_verified_official_website',
          'verified_at', v_verified_at
        ),
        true
      )
  WHERE id = v_lead_id
    AND contact_email IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'new discovery lead contact changed before atomic insert completed';
  END IF;

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (
    v_lead_id,
    'contact_approved',
    'internal',
    p_created_by,
    jsonb_build_object(
      'email', v_email,
      'source_url', v_source,
      'verification_method', 'backend_verified_official_website',
      'source', 'sales_lead_discover'
    )
  );

  RETURN v_result || jsonb_build_object(
    'contact_stored', true,
    'verified_at', v_verified_at,
    'verification_method', 'backend_verified_official_website'
  );
END;
$$;

COMMIT;
