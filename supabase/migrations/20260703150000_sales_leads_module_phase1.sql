-- ============================================================================
-- SALES LEADS — Fáze 1 DB základ pro admin modul „Obchod / Leady"
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§3, §4, §9, §11, §12, §14)
-- ============================================================================
-- ⛔ NEAPLIKOVÁNO. Migrace je zapsaná pouze jako soubor v repu.
--    Aplikace na staging/produkci vyžaduje výslovné schválení Pavla.
--
-- Rozsah (čistě aditivní):
--   • 4 nové tabulky: sales_leads, sales_lead_activities,
--     sales_lead_status_history, sales_lead_email_suppression
--   • RLS POUZE na těchto nových tabulkách — žádná existující policy,
--     tabulka, RPC ani EF se nemění
--   • SECURITY DEFINER RPC sales_lead_set_status (jediná write cesta
--     pro změnu stavu z klienta; guard přechodů + audit)
--   • dedup unikátní indexy (e-mail / IČO / doména, mimo archiv)
--
-- Security model (zrcadlí admin_permissions vzor):
--   • SELECT: has_admin_permission('sales_leads.manage') OR is_superadmin()
--   • ŽÁDNÁ klientská INSERT/UPDATE/DELETE policy — zápisy výhradně přes
--     SECURITY DEFINER RPC (interní guard) nebo service_role (Edge Functions)
--   • anon: žádný přístup, žádný EXECUTE
--   • sales_lead_activities je append-only (žádný UPDATE/DELETE z klienta)
--
-- Mimo rozsah (invarianty — modul se jich NIKDY nedotýká):
--   wallets, payments, contests, tickets, winners, buy_ticket_atomic,
--   email_queue, process-email-queue, Stripe, RLS jiných tabulek.
--
-- Závislosti: public.is_superadmin(uuid), public.has_admin_permission(text, uuid)
--   (Phase 1/2 admin foundation — na produkci i stagingu už aplikováno).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_set_status(uuid, text, text);
--   DROP FUNCTION IF EXISTS public.sales_leads_normalize();
--   DROP TABLE IF EXISTS public.sales_lead_status_history;
--   DROP TABLE IF EXISTS public.sales_lead_activities;
--   DROP TABLE IF EXISTS public.sales_lead_email_suppression;
--   DROP TABLE IF EXISTS public.sales_leads;
-- ============================================================================

BEGIN;

-- ── Guard: závislosti musí existovat ─────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.is_superadmin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.is_superadmin(uuid) — apply Phase 1 admin foundation first';
  END IF;
  IF to_regprocedure('public.has_admin_permission(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.has_admin_permission(text, uuid) — apply Phase 2 admin foundation first';
  END IF;
END $$;

-- ── 1. Tabulka sales_leads ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_leads (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identifikace firmy (§3)
  company_name             text NOT NULL,
  ico                      text,
  dic                      text,
  website                  text,
  -- Normalizovaná doména z website (plní trigger; slouží pro dedup index)
  website_domain           text,
  industry                 text,
  city                     text,
  company_size             text,

  -- Kontakt (§3)
  contact_person           text,
  contact_role             text,
  -- Normalizuje se na lowercase triggerem; dedup index níže
  contact_email            text,
  contact_phone            text,
  email_source             text,
  email_verified_by_admin  boolean NOT NULL DEFAULT false,

  -- Workflow (§4)
  status                   text NOT NULL DEFAULT 'novy',
  assigned_admin_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  priority                 smallint NOT NULL DEFAULT 0,
  next_action_at           timestamptz,
  do_not_contact           boolean NOT NULL DEFAULT false,
  do_not_contact_reason    text,
  converted_partner_id     uuid REFERENCES public.partners(id) ON DELETE SET NULL,

  -- AI / e-mail příprava (§6, §7) — jen návrhy; odeslání řeší až Fáze 3 EF
  ai_research_summary      text,
  ai_research_at           timestamptz,
  draft_email_subject      text,
  draft_email_body         text,
  draft_prepared_by        text,
  draft_approved_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  draft_approved_at        timestamptz,

  -- Meta
  source                   text NOT NULL DEFAULT 'rucne',
  notes                    text,
  created_by               uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sales_leads_status_check CHECK (status IN (
    'novy', 'priprava', 'schvaleni_ceka', 'osloveno', 'follow_up',
    'odpovedel', 'jednani', 'konvertovan', 'odmitl', 'nekontaktovat',
    'archivovan'
  )),
  CONSTRAINT sales_leads_ico_check CHECK (ico IS NULL OR ico ~ '^[0-9]{8}$'),
  CONSTRAINT sales_leads_website_check CHECK (website IS NULL OR website ~* '^https://'),
  CONSTRAINT sales_leads_priority_check CHECK (priority IN (0, 1)),
  CONSTRAINT sales_leads_draft_prepared_by_check CHECK (
    draft_prepared_by IS NULL OR draft_prepared_by IN ('ai', 'admin')
  ),
  -- Blocklist konzistence: stav nekontaktovat vyžaduje flag + důvod
  CONSTRAINT sales_leads_dnc_reason_check CHECK (
    status <> 'nekontaktovat' OR (do_not_contact AND do_not_contact_reason IS NOT NULL)
  )
);

-- ── 2. Dedup unikátní indexy (§9) — case-insensitive, partial, mimo archiv ──
-- Záměrně NEvynechávají 'nekontaktovat': blocklistnutá firma nesmí být
-- omylem přidána a oslovena znovu pod novým leadem.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_leads_contact_email
  ON public.sales_leads (lower(contact_email))
  WHERE contact_email IS NOT NULL AND status <> 'archivovan';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_leads_ico
  ON public.sales_leads (ico)
  WHERE ico IS NOT NULL AND status <> 'archivovan';

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_leads_website_domain
  ON public.sales_leads (website_domain)
  WHERE website_domain IS NOT NULL AND status <> 'archivovan';

-- Provozní indexy (seznam, filtry, follow-up plánování)
CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON public.sales_leads (status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_assigned_admin
  ON public.sales_leads (assigned_admin_id) WHERE assigned_admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_leads_next_action_at
  ON public.sales_leads (next_action_at) WHERE next_action_at IS NOT NULL;

-- ── 3. Normalizační trigger (lowercase e-mail + doména z website) ────────────
CREATE OR REPLACE FUNCTION public.sales_leads_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.contact_email := NULLIF(lower(btrim(NEW.contact_email)), '');
  -- website → holá doména: bez schématu, credentials, portu, cesty a 'www.'
  IF NEW.website IS NOT NULL THEN
    NEW.website_domain := lower(
      regexp_replace(
        regexp_replace(NEW.website, '^https?://(?:[^/@]*@)?', '', 'i'),
        '(:[0-9]+)?[/?#].*$|:[0-9]+$', ''
      )
    );
    NEW.website_domain := NULLIF(regexp_replace(NEW.website_domain, '^www\.', ''), '');
  ELSE
    NEW.website_domain := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_leads_normalize ON public.sales_leads;
CREATE TRIGGER trg_sales_leads_normalize
  BEFORE INSERT OR UPDATE ON public.sales_leads
  FOR EACH ROW EXECUTE FUNCTION public.sales_leads_normalize();

-- ── 4. Tabulka sales_lead_activities (§11, append-only) ─────────────────────
CREATE TABLE IF NOT EXISTS public.sales_lead_activities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  activity_type     text NOT NULL,
  direction         text,
  subject           text,
  body_snapshot     text,
  email_message_id  text,
  performed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT sales_lead_activities_type_check CHECK (activity_type IN (
    'lead_created', 'field_updated', 'ai_research', 'draft_created',
    'draft_edited', 'draft_approved', 'email_sent', 'email_failed',
    'reply_received', 'call_logged', 'note_added', 'status_changed',
    'do_not_contact_set', 'converted'
  )),
  CONSTRAINT sales_lead_activities_direction_check CHECK (
    direction IS NULL OR direction IN ('outbound', 'inbound', 'internal')
  )
);

CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_lead
  ON public.sales_lead_activities (lead_id, created_at DESC);

-- ── 5. Tabulka sales_lead_status_history (audit stavů) ──────────────────────
CREATE TABLE IF NOT EXISTS public.sales_lead_status_history (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  old_status  text NOT NULL,
  new_status  text NOT NULL,
  changed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_lead_status_history_lead
  ON public.sales_lead_status_history (lead_id, created_at DESC);

-- ── 6. Tabulka sales_lead_email_suppression (§12, globální blocklist) ───────
CREATE TABLE IF NOT EXISTS public.sales_lead_email_suppression (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Přesný e-mail ('info@firma.cz') nebo celá doména ('@firma.cz')
  email_pattern  text NOT NULL,
  reason         text NOT NULL,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_lead_email_suppression_pattern_check CHECK (
    email_pattern = lower(btrim(email_pattern)) AND email_pattern LIKE '%@%'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_lead_email_suppression_pattern
  ON public.sales_lead_email_suppression (email_pattern);

-- ── 7. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.sales_leads                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_lead_activities       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_lead_status_history   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_lead_email_suppression ENABLE ROW LEVEL SECURITY;

-- SELECT: držitel sales_leads.manage nebo superadmin. Žádná write policy —
-- zápisy jdou výhradně přes SECURITY DEFINER RPC / service_role (EF).
DROP POLICY IF EXISTS sales_leads_select ON public.sales_leads;
CREATE POLICY sales_leads_select ON public.sales_leads
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin());

DROP POLICY IF EXISTS sales_lead_activities_select ON public.sales_lead_activities;
CREATE POLICY sales_lead_activities_select ON public.sales_lead_activities
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin());

DROP POLICY IF EXISTS sales_lead_status_history_select ON public.sales_lead_status_history;
CREATE POLICY sales_lead_status_history_select ON public.sales_lead_status_history
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin());

DROP POLICY IF EXISTS sales_lead_email_suppression_select ON public.sales_lead_email_suppression;
CREATE POLICY sales_lead_email_suppression_select ON public.sales_lead_email_suppression
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin());

-- ── 8. RPC sales_lead_set_status — jediná klientská write cesta pro stav ────
-- Guard povolených přechodů (§4) + plný audit (status_history + activity).
-- SECURITY DEFINER: obchází RLS, proto má vlastní interní permission guard.
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
  -- Interní permission guard (RPC obchází RLS)
  IF v_caller IS NULL
     OR NOT (public.has_admin_permission('sales_leads.manage', v_caller)
             OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  -- Zamknout řádek proti souběžné změně stavu
  SELECT * INTO v_lead FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  IF p_new_status = v_lead.status THEN
    RETURN jsonb_build_object('success', false, 'error', 'status_unchanged');
  END IF;

  -- Povolené přechody (§4)
  v_allowed := CASE
    -- Blocklist: z kteréhokoli stavu; jednosměrný (návrat řeší větev níže)
    WHEN p_new_status = 'nekontaktovat' THEN v_lead.status <> 'nekontaktovat'
    -- Návrat z blocklistu: pouze superadmin, jen do priprava/archivovan
    WHEN v_lead.status = 'nekontaktovat'
      THEN public.is_superadmin(v_caller) AND p_new_status IN ('priprava', 'archivovan')
    -- Archivace: z kteréhokoli stavu mimo konvertovan
    WHEN p_new_status = 'archivovan' THEN v_lead.status <> 'konvertovan'
    -- konvertovan je finální
    WHEN v_lead.status = 'konvertovan' THEN false
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

  -- Povinný důvod u citlivých přechodů
  IF (p_new_status IN ('nekontaktovat', 'odmitl')
      OR v_lead.status IN ('nekontaktovat', 'odmitl', 'archivovan'))
     AND NULLIF(btrim(coalesce(p_reason, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'reason_required');
  END IF;

  -- Provedení změny (+ blocklist flag konzistence)
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

  -- Auditní stopa
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

COMMIT;
