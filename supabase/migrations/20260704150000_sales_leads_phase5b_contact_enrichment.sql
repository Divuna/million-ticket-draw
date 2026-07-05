-- ============================================================================
-- SALES LEADS — Fáze 5B: bezpečné dohledání kontaktu (neověřený návrh e-mailu)
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §17 (§17.0, 17.3, 17.6, 17.8)
-- ============================================================================
-- ⛔ NEAPLIKOVÁNO. Zapsáno pouze jako soubor v repu. Aplikace na staging/
--    produkci vyžaduje výslovné schválení Pavla (přes apply_migration).
--
-- Cíl: po nalezení firmy (Fáze 5A) umět DOHLEDAT veřejný kontaktní e-mail, ale
-- bezpečně — AI ho NIKDY nevymýšlí a NIKDY nepřepíše odesílací `contact_email`.
-- Návrh e-mailu se ukládá ODDĚLENĚ jako **neověřený**; teprve člověk ho ručně
-- schválí, čímž se vyplní `contact_email` a `email_verified_by_admin=true`.
--
-- Přidává:
--   • sloupce `proposed_contact_email`, `proposed_contact_source_url`,
--     `proposed_contact_at`, `proposed_contact_by`, `proposed_contact_status`
--     (`neovereny`/`overeny`/`zamitnuty`).
--   • RPC `sales_lead_propose_contact` — uloží neověřený návrh (service_role,
--     volá enrichment EF). NIKDY nemění `contact_email`/`email_verified_by_admin`
--     ani status leadu, NIKDY neodesílá e-mail.
--   • RPC `sales_lead_review_contact` — člověk s `sales_leads.manage` návrh
--     SCHVÁLÍ (→ `contact_email` + `email_verified_by_admin=true`) nebo ZAMÍTNE.
--   • activity typy `contact_proposed`, `contact_approved`, `contact_rejected`.
--
-- Mimo rozsah (invarianty): wallets, payments, contests, tickets, winners,
-- buy_ticket_atomic, Stripe, email_queue, RLS jiných tabulek — nedotčeny.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_review_contact(uuid, text);
--   DROP FUNCTION IF EXISTS public.sales_lead_propose_contact(uuid, uuid, text, text, text);
--   ALTER TABLE public.sales_leads
--     DROP COLUMN IF EXISTS proposed_contact_status,
--     DROP COLUMN IF EXISTS proposed_contact_by,
--     DROP COLUMN IF EXISTS proposed_contact_at,
--     DROP COLUMN IF EXISTS proposed_contact_source_url,
--     DROP COLUMN IF EXISTS proposed_contact_email;
--   -- a vrátit activity CHECK bez contact_* typů.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.sales_leads') IS NULL THEN
    RAISE EXCEPTION 'Missing table public.sales_leads — apply Phase 1 first';
  END IF;
  IF to_regprocedure('public.has_admin_permission(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.has_admin_permission(text, uuid)';
  END IF;
END $$;

-- ── 1. Sloupce pro neověřený návrh kontaktu ─────────────────────────────────
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS proposed_contact_email      text,
  ADD COLUMN IF NOT EXISTS proposed_contact_source_url text,
  ADD COLUMN IF NOT EXISTS proposed_contact_at         timestamptz,
  ADD COLUMN IF NOT EXISTS proposed_contact_by         text,       -- 'ai' | 'admin'
  ADD COLUMN IF NOT EXISTS proposed_contact_status     text;       -- neovereny/overeny/zamitnuty

ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_proposed_contact_status_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_proposed_contact_status_check CHECK (
  proposed_contact_status IS NULL
  OR proposed_contact_status IN ('neovereny', 'overeny', 'zamitnuty')
);

ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_proposed_contact_by_check;
ALTER TABLE public.sales_leads ADD CONSTRAINT sales_leads_proposed_contact_by_check CHECK (
  proposed_contact_by IS NULL OR proposed_contact_by IN ('ai', 'admin')
);

-- ── 2. Nové activity typy ────────────────────────────────────────────────────
ALTER TABLE public.sales_lead_activities DROP CONSTRAINT IF EXISTS sales_lead_activities_type_check;
ALTER TABLE public.sales_lead_activities ADD CONSTRAINT sales_lead_activities_type_check CHECK (activity_type IN (
  'lead_created', 'field_updated', 'ai_research', 'draft_created',
  'draft_edited', 'draft_approved', 'email_sent', 'email_failed',
  'reply_received', 'call_logged', 'note_added', 'status_changed',
  'do_not_contact_set', 'converted', 'lead_discovered',
  'contact_proposed', 'contact_approved', 'contact_rejected'
));

-- ── 3. RPC sales_lead_propose_contact — uloží NEOVĚŘENÝ návrh (service_role) ─
-- Volá enrichment EF (po ověření admina). NIKDY nemění contact_email /
-- email_verified_by_admin / status; NIKDY neodesílá e-mail.
CREATE OR REPLACE FUNCTION public.sales_lead_propose_contact(
  p_lead_id     uuid,
  p_created_by  uuid,
  p_email       text,
  p_source_url  text,
  p_proposed_by text DEFAULT 'ai'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_src   text := NULLIF(btrim(coalesce(p_source_url, '')), '');
BEGIN
  SELECT true INTO v_exists FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  -- Bez vymýšlení: musí přijít neprázdný e-mail se zdrojovou URL.
  IF v_email = '' OR v_email NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_email');
  END IF;
  IF v_src IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'source_url_required');
  END IF;

  UPDATE public.sales_leads SET
    proposed_contact_email      = v_email,
    proposed_contact_source_url = v_src,
    proposed_contact_at         = now(),
    proposed_contact_by         = CASE WHEN p_proposed_by = 'admin' THEN 'admin' ELSE 'ai' END,
    proposed_contact_status     = 'neovereny'
    -- ⚠️ contact_email a email_verified_by_admin se ZDE NEMĚNÍ (jen člověk při schválení)
  WHERE id = p_lead_id;

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (p_lead_id, 'contact_proposed', 'internal', p_created_by,
          jsonb_build_object('proposed_by', p_proposed_by, 'source_url', v_src));

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'status', 'neovereny');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_propose_contact(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sales_lead_propose_contact(uuid, uuid, text, text, text) TO service_role;

-- ── 4. RPC sales_lead_review_contact — člověk SCHVÁLÍ / ZAMÍTNE návrh ────────
-- Teprve schválení vyplní contact_email + email_verified_by_admin=true.
-- NIKDY neodesílá e-mail, NIKDY nemění stav leadu.
CREATE OR REPLACE FUNCTION public.sales_lead_review_contact(
  p_lead_id  uuid,
  p_decision text  -- 'approve' | 'reject'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_lead public.sales_leads%ROWTYPE;
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

  IF v_lead.proposed_contact_status IS DISTINCT FROM 'neovereny'
     OR NULLIF(btrim(coalesce(v_lead.proposed_contact_email, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_pending_contact');
  END IF;

  IF p_decision = 'approve' THEN
    BEGIN
      UPDATE public.sales_leads SET
        contact_email           = v_lead.proposed_contact_email,   -- teprve TEĎ (ruční schválení člověkem)
        email_verified_by_admin = true,
        email_source            = COALESCE(NULLIF(btrim(coalesce(email_source, '')), ''),
                                           v_lead.proposed_contact_source_url),
        proposed_contact_status = 'overeny'
      WHERE id = p_lead_id;
    EXCEPTION
      WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'duplicate');
      WHEN check_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
    END;

    INSERT INTO public.sales_lead_activities
      (lead_id, activity_type, direction, performed_by, metadata)
    VALUES (p_lead_id, 'contact_approved', 'internal', v_caller,
            jsonb_build_object('email', v_lead.proposed_contact_email));

    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'status', 'overeny');

  ELSIF p_decision = 'reject' THEN
    UPDATE public.sales_leads SET
      proposed_contact_status = 'zamitnuty'
      -- contact_email se NEMĚNÍ
    WHERE id = p_lead_id;

    INSERT INTO public.sales_lead_activities
      (lead_id, activity_type, direction, performed_by, metadata)
    VALUES (p_lead_id, 'contact_rejected', 'internal', v_caller, '{}'::jsonb);

    RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id, 'status', 'zamitnuty');
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'invalid_decision');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_review_contact(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_review_contact(uuid, text) TO authenticated;
