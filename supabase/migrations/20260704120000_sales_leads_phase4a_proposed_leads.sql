-- ============================================================================
-- SALES LEADS — Fáze 4A: DB základ pro automaticky navržené leady
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §17 (§17.1–17.6, 17.10)
-- ============================================================================
-- ⛔ NEAPLIKOVÁNO. Zapsáno pouze jako soubor v repu. Aplikace na staging/
--    produkci vyžaduje výslovné schválení Pavla (přes apply_migration).
--
-- Rozsah (čistě aditivní — jen sloupce + CHECK + rozšíření jedné RPC):
--   • nový vstupní stav `navrzeny` (AI/automat navrhl firmu, čeká na lidskou
--     kontrolu) — přidán do CHECK constraintu `sales_leads.status`
--   • nové sloupce: lead_group, lead_quality, discovery_source, discovery_meta
--   • bezpečné CHECK kontroly hodnot nových sloupců
--   • rozšíření SECURITY DEFINER RPC `sales_lead_set_status` o přechody
--     ze stavu `navrzeny` POUZE do `novy` / `nekontaktovat` / `archivovan`
--
-- Neporušitelné pravidlo (§17.0):
--   • Z `navrzeny` NELZE přejít do žádného odesílacího stavu (schvaleni_ceka/
--     osloveno/follow_up/…). Lidská kontrola je povinná brána.
--   • AI/automat NEMÁ EXECUTE na sales_lead_set_status (grant jen authenticated,
--     guard has_admin_permission) — AI nemá cestu ke schválení ani odeslání.
--   • Tato migrace NEODESÍLÁ e-maily, nevytváří EF, nemění frontend.
--
-- Mimo rozsah (invarianty): wallets, payments, contests, tickets, winners,
-- buy_ticket_atomic, Stripe, RLS jiných tabulek — nedotčeny.
--
-- Rollback:
--   -- vrátit původní status CHECK (bez 'navrzeny'):
--   ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
--   ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_status_check CHECK (status IN (
--     'novy','priprava','schvaleni_ceka','osloveno','follow_up','odpovedel',
--     'jednani','konvertovan','odmitl','nekontaktovat','archivovan'));
--   ALTER TABLE public.sales_leads
--     DROP COLUMN IF EXISTS discovery_meta,
--     DROP COLUMN IF EXISTS discovery_source,
--     DROP COLUMN IF EXISTS lead_quality,
--     DROP COLUMN IF EXISTS lead_group;
--   -- a znovu vytvořit sales_lead_set_status z 20260703150000 (bez navrzeny větve).
-- ============================================================================

-- ── Guard: závislosti musí existovat ─────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.sales_leads') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.sales_leads — apply Phase 1 first';
  END IF;
  IF to_regprocedure('public.has_admin_permission(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.has_admin_permission(text, uuid)';
  END IF;
  IF to_regprocedure('public.sales_lead_set_status(uuid, text, text)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.sales_lead_set_status — apply Phase 1 first';
  END IF;
END $$;

-- ── 1. Nový stav `navrzeny` v CHECK constraintu status ──────────────────────
-- Superset původní množiny → existující řádky zůstávají validní.
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_status_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_status_check CHECK (status IN (
  'navrzeny',
  'novy', 'priprava', 'schvaleni_ceka', 'osloveno', 'follow_up',
  'odpovedel', 'jednani', 'konvertovan', 'odmitl', 'nekontaktovat',
  'archivovan'
));

-- ── 2. Nové sloupce + bezpečné CHECK kontroly (§17.3, 17.5, 17.6) ────────────
-- Marketingová skupina leadu (nezávislá na detailním `industry`).
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS lead_group      text,
  ADD COLUMN IF NOT EXISTS lead_quality    smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discovery_source text,
  ADD COLUMN IF NOT EXISTS discovery_meta  jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Skupina leadu — číselník dle §17.2 (NULL povoleno, dokud člověk nepotvrdí).
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_lead_group_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_lead_group_check CHECK (
  lead_group IS NULL OR lead_group IN (
    'e-shopy', 'auto-moto', 'luxusni-zbozi', 'sport',
    'cestovani', 'gastronomie', 'lokalni-sluzby', 'jine'
  )
);

-- Kvalita leadu — 0 neohodnoceno · 1 nízká · 2 střední · 3 vysoká.
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_lead_quality_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_lead_quality_check CHECK (
  lead_quality BETWEEN 0 AND 3
);

-- Zdroj nalezení — dokumentovaný číselník (§17.6); NULL povoleno.
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_discovery_source_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_discovery_source_check CHECK (
  discovery_source IS NULL OR discovery_source IN (
    'ai_navrh', 'verejny_rejstrik', 'shoptet_katalog', 'web_katalog',
    'doporuceni', 'rucne'
  )
);

-- Index pro filtrování navržených leadů ve frontend záložce „Návrhy".
CREATE INDEX IF NOT EXISTS idx_sales_leads_lead_group
  ON public.sales_leads (lead_group) WHERE lead_group IS NOT NULL;

-- ── 3. Rozšíření sales_lead_set_status o přechody ze stavu `navrzeny` ────────
-- Identické s Fází 1 + jediná nová větev: `navrzeny` smí JEN do novy.
-- (navrzeny → nekontaktovat řeší univerzální blocklist větev nahoře;
--  navrzeny → archivovan řeší univerzální archivace větev; cokoli jiného = false,
--  takže navrzeny → odesílací stavy je zablokované.)
CREATE OR REPLACE FUNCTION public.sales_lead_set_status(
  p_lead_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_lead public.sales_leads%ROWTYPE;
  v_allowed boolean := false;
BEGIN
  IF v_caller IS NULL
     OR NOT (public.has_admin_permission('sales_leads.manage', v_caller)
             OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  SELECT * INTO v_lead FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  IF p_new_status = v_lead.status THEN
    RETURN jsonb_build_object('success', false, 'error', 'status_unchanged');
  END IF;

  v_allowed := CASE
    -- Blocklist: z kteréhokoli stavu (vč. navrzeny); jednosměrný
    WHEN p_new_status = 'nekontaktovat' THEN v_lead.status <> 'nekontaktovat'
    -- Návrat z blocklistu: pouze superadmin, jen do priprava/archivovan
    WHEN v_lead.status = 'nekontaktovat'
      THEN public.is_superadmin(v_caller) AND p_new_status IN ('priprava', 'archivovan')
    -- Archivace: z kteréhokoli stavu mimo konvertovan (vč. navrzeny → archivovan)
    WHEN p_new_status = 'archivovan' THEN v_lead.status <> 'konvertovan'
    -- konvertovan je finální
    WHEN v_lead.status = 'konvertovan' THEN false
    -- Fáze 4A: navržený lead smí JEN do novy (lidské schválení). Do odesílacích
    -- stavů se rovnou přejít nedá — jde jen novy/nekontaktovat/archivovan.
    WHEN v_lead.status = 'navrzeny'       THEN p_new_status = 'novy'
    -- Reaktivace odmítnutého leadu (vědomá, s důvodem)
    WHEN v_lead.status = 'odmitl' THEN p_new_status = 'priprava'
    -- Standardní workflow
    WHEN v_lead.status = 'novy'           THEN p_new_status = 'priprava'
    WHEN v_lead.status = 'priprava'       THEN p_new_status = 'schvaleni_ceka'
    WHEN v_lead.status = 'schvaleni_ceka' THEN p_new_status IN ('priprava', 'osloveno')
    WHEN v_lead.status = 'osloveno'       THEN p_new_status IN ('follow_up', 'odpovedel')
    WHEN v_lead.status = 'follow_up'      THEN p_new_status = 'odpovedel'
    WHEN v_lead.status = 'odpovedel'      THEN p_new_status IN ('jednani', 'odmitl')
    WHEN v_lead.status = 'jednani'        THEN p_new_status IN ('konvertovan', 'odmitl')
    -- Obnova z archivu (vědomá reaktivace)
    WHEN v_lead.status = 'archivovan'     THEN p_new_status = 'priprava'
    ELSE false
  END;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'transition_not_allowed',
      'from', v_lead.status, 'to', p_new_status
    );
  END IF;

  IF (p_new_status IN ('nekontaktovat', 'odmitl')
      OR v_lead.status IN ('nekontaktovat', 'odmitl', 'archivovan'))
     AND NULLIF(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'reason_required');
  END IF;

  UPDATE public.sales_leads
  SET status = p_new_status,
      do_not_contact = CASE
        WHEN p_new_status = 'nekontaktovat' THEN true
        WHEN v_lead.status = 'nekontaktovat' THEN false
        ELSE do_not_contact
      END,
      do_not_contact_reason = CASE
        WHEN p_new_status = 'nekontaktovat' THEN p_reason
        WHEN v_lead.status = 'nekontaktovat' THEN NULL
        ELSE do_not_contact_reason
      END
  WHERE id = p_lead_id;

  INSERT INTO public.sales_lead_status_history
    (lead_id, old_status, new_status, changed_by, reason)
  VALUES (p_lead_id, v_lead.status, p_new_status, v_caller, p_reason);

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (
    p_lead_id,
    CASE
      WHEN p_new_status = 'nekontaktovat' THEN 'do_not_contact_set'
      WHEN p_new_status = 'konvertovan'   THEN 'converted'
      ELSE 'status_changed'
    END,
    'internal',
    v_caller,
    jsonb_build_object('from', v_lead.status, 'to', p_new_status, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'success', true, 'lead_id', p_lead_id,
    'old_status', v_lead.status, 'new_status', p_new_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_set_status(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_set_status(uuid, text, text) TO authenticated;
