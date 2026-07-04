-- ============================================================================
-- SALES LEADS — Fáze 5A: RPC pro bezpečné vložení automaticky navrženého leadu
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §17 (§17.1, 17.3, 17.4, 17.6, 17.7, 17.10)
-- ============================================================================
-- ⛔ NEAPLIKOVÁNO. Zapsáno pouze jako soubor v repu. Aplikace na staging/
--    produkci vyžaduje výslovné schválení Pavla (přes apply_migration).
--
-- RPC `sales_lead_propose` — jediná bezpečná cesta, jak automatické discovery
-- (EF `sales-lead-discover`) vloží NAVRŽENÝ lead. Tvrdá pravidla:
--   • lead vznikne VŽDY ve stavu `navrzeny` (hardcoded) — NIKDY v odesílacím
--     stavu. Do oslovování/odesílání se dostane jen lidským schválením
--     (`sales_lead_set_status`, Fáze 4A).
--   • povinné `lead_group`, `lead_quality`, `discovery_source`, `discovery_meta`.
--   • NIKDY nevyplňuje `contact_email` jako ověřený odesílací kontakt
--     (AI nesmí vymýšlet kontakty; e-mail zůstává null, `email_verified_by_admin`
--     = false). Odeslání e-mailu řeší výhradně člověk (Fáze 3C).
--   • DEDUP + blokace (§17.4, 17.7): pokud existuje lead se stejným IČO nebo
--     doménou (mimo `archivovan`), nebo je firma už partner, nebo je doména/
--     e-mail na `sales_lead_email_suppression` → lead se NEVYTVOŘÍ a vrátí se
--     `outcome='skipped'` s důvodem.
--
-- Bezpečnostní model:
--   • EXECUTE POUZE pro `service_role` (EF přes service-role klienta po ověření
--     admina + `sales_leads.manage`). anon/authenticated NEMAJÍ EXECUTE — běžný
--     uživatel RPC nezavolá; AI nemá cestu k vytvoření odesílatelného stavu.
--   • Zapisuje audit `lead_discovered` do `sales_lead_activities`.
--
-- Mimo rozsah (invarianty): wallets, payments, contests, tickets, winners,
-- buy_ticket_atomic, Stripe, email_queue, RLS jiných tabulek — nedotčeny.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_propose(uuid, text, text, text, text, smallint, text, jsonb, text, text);
--   -- vrátit activity CHECK bez 'lead_discovered' (viz níže) pokud bylo přidáno.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.sales_leads') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.sales_leads — apply Phase 1 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sales_leads' AND column_name='lead_group'
  ) THEN
    RAISE EXCEPTION 'Missing column public.sales_leads.lead_group — apply Phase 4A first';
  END IF;
END $$;

-- ── 1. Nový activity typ `lead_discovered` (§17.6) ──────────────────────────
-- Rozšíření CHECK constraintu (superset — existující řádky zůstávají validní).
ALTER TABLE public.sales_lead_activities DROP CONSTRAINT IF EXISTS sales_lead_activities_type_check;
ALTER TABLE public.sales_lead_activities ADD CONSTRAINT sales_lead_activities_type_check CHECK (activity_type IN (
  'lead_created', 'field_updated', 'ai_research', 'draft_created',
  'draft_edited', 'draft_approved', 'email_sent', 'email_failed',
  'reply_received', 'call_logged', 'note_added', 'status_changed',
  'do_not_contact_set', 'converted',
  'lead_discovered'
));

-- ── 2. sales_lead_propose ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_lead_propose(
  p_created_by       uuid,
  p_company_name     text,
  p_lead_group       text,
  p_discovery_source text,
  p_lead_quality     smallint DEFAULT 0,
  p_discovery_meta   jsonb DEFAULT '{}'::jsonb,
  p_website          text DEFAULT NULL,
  p_ico              text DEFAULT NULL,
  p_city             text DEFAULT NULL,
  p_industry         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_domain text;
  v_name text := btrim(coalesce(p_company_name, ''));
  v_ico text := NULLIF(btrim(coalesce(p_ico, '')), '');
  v_website text := NULLIF(btrim(coalesce(p_website, '')), '');
BEGIN
  -- Povinná pole návrhu.
  IF v_name = '' THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'company_name_required');
  END IF;
  IF NULLIF(btrim(coalesce(p_lead_group, '')), '') IS NULL
     OR NULLIF(btrim(coalesce(p_discovery_source, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'classification_required');
  END IF;

  -- Odvození holé domény z website (stejná logika jako normalizační trigger).
  IF v_website IS NOT NULL THEN
    v_domain := lower(regexp_replace(
      regexp_replace(v_website, '^https?://(?:[^/@]*@)?', '', 'i'),
      '(:[0-9]+)?[/?#].*$|:[0-9]+$', ''));
    v_domain := NULLIF(regexp_replace(v_domain, '^www\.', ''), '');
  END IF;

  -- ── DEDUP + blokace (§17.4, 17.7) — návrh se v těchto případech NEVYTVOŘÍ ──
  -- (a) už existuje lead se stejným IČO nebo doménou (mimo archiv)
  IF v_ico IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_leads
    WHERE ico = v_ico AND status <> 'archivovan'
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'duplicate_ico');
  END IF;
  IF v_domain IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_leads
    WHERE website_domain = v_domain AND status <> 'archivovan'
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'duplicate_domain');
  END IF;

  -- (b) firma už je partner (podle IČO na partners, best-effort)
  IF v_ico IS NOT NULL AND to_regclass('public.partners') IS NOT NULL THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM public.partners WHERE ico = v_ico) THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'already_partner');
      END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL; -- partners nemá ico → přeskočit tuto kontrolu
    END;
  END IF;

  -- (c) doména na suppression listu (§12) → blokace
  IF v_domain IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_lead_email_suppression
    WHERE email_pattern = '@' || v_domain
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'suppressed_domain');
  END IF;

  -- ── Vložení NAVRŽENÉHO leadu (status hardcoded 'navrzeny') ────────────────
  BEGIN
    INSERT INTO public.sales_leads (
      company_name, website, ico, city, industry,
      status, lead_group, lead_quality, discovery_source, discovery_meta,
      source, created_by,
      email_verified_by_admin  -- vždy false; contact_email zůstává NULL
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
  END;

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (v_id, 'lead_discovered', 'internal', p_created_by,
          jsonb_build_object('discovery_source', p_discovery_source, 'lead_group', p_lead_group));

  RETURN jsonb_build_object('success', true, 'outcome', 'created', 'lead_id', v_id);
END;
$$;

-- EXECUTE jen service_role (EF). anon/authenticated NEMAJÍ — běžný uživatel ani
-- AI nemůže vytvořit navrzeny lead přímo; jen ověřená EF přes service-role.
REVOKE EXECUTE ON FUNCTION public.sales_lead_propose(uuid, text, text, text, smallint, jsonb, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sales_lead_propose(uuid, text, text, text, smallint, jsonb, text, text, text, text) TO service_role;
