-- ============================================================================
-- SALES LEADS — Fáze 5C fix: atomické vytvoření navrženého leadu S kontaktem
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §17 (§17.8.2)
-- ============================================================================
-- ⛔ NEAPLIKOVÁNO. Zapsáno pouze jako soubor v repu. Aplikace na staging/
--    produkci vyžaduje výslovné schválení Pavla (přes apply_migration).
--
-- Oprava kritické chyby v původním Fáze 5C flow: EF `sales-lead-discover`
-- volala nejdřív `sales_lead_propose` (vytvoří lead) a AŽ POTOM
-- `sales_lead_propose_contact` (uloží návrh e-mailu) jako dva oddělené kroky.
-- Když druhý krok selhal, zůstal uložený lead BEZ navrženého e-mailu — což
-- porušuje zadání „kontakty bez e-mailu se vůbec nemají ukládat".
--
-- Řešení: nová RPC `sales_lead_propose_with_contact` vytvoří lead A uloží
-- navržený e-mail v JEDNÉ atomické operaci (jeden INSERT se sloupci
-- `proposed_contact_*` rovnou vyplněnými, žádný následný UPDATE). Uvnitř
-- jednoho volání SECURITY DEFINER funkce běží vše v jedné transakci volajícího
-- příkazu — pokud validace e-mailu selže, INSERT se vůbec neprovede a lead
-- nevznikne. Pokud validace projde, INSERT vloží lead i návrh e-mailu najednou
-- → nemůže nastat stav „lead existuje, ale bez navrženého e-mailu".
--
-- Zachovává VŠECHNA pravidla Fáze 5A (dedup IČO/doména, partner blokace,
-- suppression, hardcoded status='navrzeny') i Fáze 5B (proposed_contact_status
-- vždy 'neovereny', contact_email/email_verified_by_admin se NIKDY nevyplní
-- automaticky — jen člověk přes sales_lead_review_contact).
--
-- Bezpečnostní model: EXECUTE POUZE pro `service_role` (stejné jako
-- sales_lead_propose) — anon/authenticated nemají EXECUTE.
--
-- Původní RPC `sales_lead_propose` (bez kontaktu) a `sales_lead_propose_contact`
-- (samostatné doplnění návrhu k existujícímu leadu) ZŮSTÁVAJÍ beze změny —
-- nejsou touto migrací nijak upraveny ani odstraněny. EF `sales-lead-discover`
-- je v tomto PR přepnuta na volání POUZE nové `sales_lead_propose_with_contact`.
--
-- Mimo rozsah (invarianty): wallets, payments, contests, tickets, winners,
-- buy_ticket_atomic, Stripe, email_queue, RLS jiných tabulek — nedotčeny.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_propose_with_contact(uuid, text, text, text, text, text, jsonb, text, text, text, text, smallint, text);
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
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sales_leads' AND column_name='proposed_contact_email'
  ) THEN
    RAISE EXCEPTION 'Missing column public.sales_leads.proposed_contact_email — apply Phase 5B first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_propose_with_contact(
  p_created_by       uuid,
  p_company_name     text,
  p_lead_group       text,
  p_discovery_source text,
  p_email            text,
  p_email_source_url text,
  p_discovery_meta   jsonb DEFAULT '{}'::jsonb,
  p_website          text DEFAULT NULL,
  p_ico              text DEFAULT NULL,
  p_city             text DEFAULT NULL,
  p_industry         text DEFAULT NULL,
  p_lead_quality     smallint DEFAULT 0,
  p_proposed_by      text DEFAULT 'ai'
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
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_source_url text := NULLIF(btrim(coalesce(p_email_source_url, '')), '');
BEGIN
  -- Povinná pole návrhu.
  IF v_name = '' THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'company_name_required');
  END IF;
  IF NULLIF(btrim(coalesce(p_lead_group, '')), '') IS NULL
     OR NULLIF(btrim(coalesce(p_discovery_source, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'outcome', 'error', 'reason', 'classification_required');
  END IF;

  -- ── Bariéra: bez platného veřejného e-mailu + zdroje se lead VŮBEC
  -- nevytvoří. Kontrola proběhne PŘED jakýmkoli INSERTem — atomicky
  -- zaručuje, že nemůže vzniknout lead bez navrženého kontaktu.
  IF v_email = '' OR v_email NOT LIKE '%@%.%' OR v_source_url IS NULL THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'missing_public_email');
  END IF;

  -- Odvození holé domény z website (stejná logika jako normalizační trigger).
  IF v_website IS NOT NULL THEN
    v_domain := lower(regexp_replace(
      regexp_replace(v_website, '^https?://(?:[^/@]*@)?', '', 'i'),
      '(:[0-9]+)?[/?#].*$|:[0-9]+$', ''));
    v_domain := NULLIF(regexp_replace(v_domain, '^www\.', ''), '');
  END IF;

  -- ── DEDUP + blokace (§17.4, 17.7) — stejné jako sales_lead_propose ────────
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

  IF v_ico IS NOT NULL AND to_regclass('public.partners') IS NOT NULL THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM public.partners WHERE ico = v_ico) THEN
        RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'already_partner');
      END IF;
    EXCEPTION WHEN undefined_column THEN
      NULL;
    END;
  END IF;

  IF v_domain IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sales_lead_email_suppression
    WHERE email_pattern = '@' || v_domain
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'suppressed_domain');
  END IF;

  -- Suppression podle navrženého e-mailu samotného (nad rámec domény webu).
  IF EXISTS (
    SELECT 1 FROM public.sales_lead_email_suppression
    WHERE lower(email_pattern) = v_email
       OR (email_pattern LIKE '@%' AND v_email LIKE '%' || lower(email_pattern))
  ) THEN
    RETURN jsonb_build_object('success', true, 'outcome', 'skipped', 'reason', 'suppressed_email');
  END IF;

  -- ── Atomický INSERT: lead + navržený kontakt v JEDNÉ operaci ──────────────
  -- status vždy 'navrzeny' (hardcoded); contact_email zůstává NULL;
  -- email_verified_by_admin zůstává false (sloupcový default); proposed_contact_*
  -- se vyplní rovnou tady — žádný samostatný druhý krok, který by mohl selhat
  -- a zanechat lead bez návrhu e-mailu.
  BEGIN
    INSERT INTO public.sales_leads (
      company_name, website, ico, city, industry,
      status, lead_group, lead_quality, discovery_source, discovery_meta,
      source, created_by,
      proposed_contact_email, proposed_contact_source_url,
      proposed_contact_at, proposed_contact_by, proposed_contact_status
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
      v_email,
      v_source_url,
      now(),
      CASE WHEN p_proposed_by = 'admin' THEN 'admin' ELSE 'ai' END,
      'neovereny'
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

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (v_id, 'contact_proposed', 'internal', p_created_by,
          jsonb_build_object('proposed_by', p_proposed_by, 'source_url', v_source_url));

  RETURN jsonb_build_object('success', true, 'outcome', 'created', 'lead_id', v_id);
END;
$$;

-- EXECUTE jen service_role (stejně jako sales_lead_propose) — anon/authenticated
-- nemají EXECUTE; AI nemá cestu k volání mimo ověřenou EF přes service-role.
REVOKE EXECUTE ON FUNCTION public.sales_lead_propose_with_contact(uuid, text, text, text, text, text, jsonb, text, text, text, text, smallint, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sales_lead_propose_with_contact(uuid, text, text, text, text, text, jsonb, text, text, text, text, smallint, text) TO service_role;
