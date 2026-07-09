-- ============================================================================
-- SALES LEADS — Fáze 3A write RPC (ruční přidání + editace leadu)
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§5, §11, §14)
-- ============================================================================
-- ⛔ NEAPLIKOVÁNO. Zapsáno pouze jako soubor v repu. Aplikace na staging/
--    produkci vyžaduje výslovné schválení Pavla (přes apply_migration).
--
-- Doplňuje ke Fázi 1 dvě SECURITY DEFINER RPC pro klientský zápis (RLS na
-- sales_leads nemá INSERT/UPDATE policy — zápisy jdou výhradně přes RPC /
-- service_role):
--   • sales_lead_create        — ruční založení leadu
--   • sales_lead_update_fields — editace základních firemních/kontaktních polí
--
-- Změna stavu NENÍ součástí — ta jde přes existující RPC sales_lead_set_status
-- (Fáze 1). Obě RPC mají interní permission guard
-- (has_admin_permission('sales_leads.manage') OR is_superadmin()) a zapisují
-- audit do sales_lead_activities. Neposílají e-maily, nevolají AI ani Resend.
--
-- Mimo rozsah (invarianty): wallets, payments, contests, tickets, winners,
-- buy_ticket_atomic, email_queue, Stripe, RLS jiných tabulek — nedotčeny.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_create(text,text,text,text,text,text,text,text,text,text,text,text,text);
--   DROP FUNCTION IF EXISTS public.sales_lead_update_fields(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text);
-- ============================================================================

-- ── Guard: závislosti musí existovat ─────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.has_admin_permission(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.has_admin_permission(text, uuid)';
  END IF;
  IF to_regclass('public.sales_leads') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency table public.sales_leads — apply Phase 1 first';
  END IF;
END $$;

-- ── 1. sales_lead_create ─────────────────────────────────────────────────────
-- Založí lead ve stavu 'novy' (default). Prázdné volitelné texty → NULL.
-- Vrací {success, lead_id} nebo {success:false, error}. Duplicitu z dedup
-- indexů hlásí jako 'duplicate'; porušení CHECK (IČO/website) jako 'invalid_input'.
CREATE OR REPLACE FUNCTION public.sales_lead_create(
  p_company_name   text,
  p_ico            text DEFAULT NULL,
  p_dic            text DEFAULT NULL,
  p_website        text DEFAULT NULL,
  p_industry       text DEFAULT NULL,
  p_city           text DEFAULT NULL,
  p_company_size   text DEFAULT NULL,
  p_contact_person text DEFAULT NULL,
  p_contact_role   text DEFAULT NULL,
  p_contact_email  text DEFAULT NULL,
  p_contact_phone  text DEFAULT NULL,
  p_email_source   text DEFAULT NULL,
  p_notes          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_caller IS NULL
     OR NOT (public.has_admin_permission('sales_leads.manage', v_caller)
             OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  IF NULLIF(btrim(coalesce(p_company_name, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_name_required');
  END IF;

  BEGIN
    INSERT INTO public.sales_leads (
      company_name, ico, dic, website, industry, city, company_size,
      contact_person, contact_role, contact_email, contact_phone,
      email_source, notes, source, created_by
    ) VALUES (
      btrim(p_company_name),
      NULLIF(btrim(coalesce(p_ico, '')), ''),
      NULLIF(btrim(coalesce(p_dic, '')), ''),
      NULLIF(btrim(coalesce(p_website, '')), ''),
      NULLIF(btrim(coalesce(p_industry, '')), ''),
      NULLIF(btrim(coalesce(p_city, '')), ''),
      NULLIF(btrim(coalesce(p_company_size, '')), ''),
      NULLIF(btrim(coalesce(p_contact_person, '')), ''),
      NULLIF(btrim(coalesce(p_contact_role, '')), ''),
      NULLIF(btrim(coalesce(p_contact_email, '')), ''),
      NULLIF(btrim(coalesce(p_contact_phone, '')), ''),
      NULLIF(btrim(coalesce(p_email_source, '')), ''),
      NULLIF(btrim(coalesce(p_notes, '')), ''),
      'rucne',
      v_caller
    )
    RETURNING id INTO v_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error', 'duplicate');
    WHEN check_violation THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END;

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (v_id, 'lead_created', 'internal', v_caller,
          jsonb_build_object('company_name', btrim(p_company_name)));

  RETURN jsonb_build_object('success', true, 'lead_id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_create(text,text,text,text,text,text,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_create(text,text,text,text,text,text,text,text,text,text,text,text,text) TO authenticated;

-- ── 2. sales_lead_update_fields ──────────────────────────────────────────────
-- Editace základních firemních/kontaktních polí. NEMĚNÍ status (to řeší
-- sales_lead_set_status). Prázdný text → NULL (vymazání volitelného pole);
-- company_name musí zůstat neprázdné. Zapisuje audit 'field_updated'.
CREATE OR REPLACE FUNCTION public.sales_lead_update_fields(
  p_lead_id                uuid,
  p_company_name           text,
  p_ico                    text DEFAULT NULL,
  p_dic                    text DEFAULT NULL,
  p_website                text DEFAULT NULL,
  p_industry               text DEFAULT NULL,
  p_city                   text DEFAULT NULL,
  p_company_size           text DEFAULT NULL,
  p_contact_person         text DEFAULT NULL,
  p_contact_role           text DEFAULT NULL,
  p_contact_email          text DEFAULT NULL,
  p_contact_phone          text DEFAULT NULL,
  p_email_source           text DEFAULT NULL,
  p_email_verified_by_admin boolean DEFAULT NULL,
  p_notes                  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_exists boolean;
BEGIN
  IF v_caller IS NULL
     OR NOT (public.has_admin_permission('sales_leads.manage', v_caller)
             OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  SELECT true INTO v_exists FROM public.sales_leads WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  IF NULLIF(btrim(coalesce(p_company_name, '')), '') IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'company_name_required');
  END IF;

  BEGIN
    UPDATE public.sales_leads SET
      company_name           = btrim(p_company_name),
      ico                    = NULLIF(btrim(coalesce(p_ico, '')), ''),
      dic                    = NULLIF(btrim(coalesce(p_dic, '')), ''),
      website                = NULLIF(btrim(coalesce(p_website, '')), ''),
      industry               = NULLIF(btrim(coalesce(p_industry, '')), ''),
      city                   = NULLIF(btrim(coalesce(p_city, '')), ''),
      company_size           = NULLIF(btrim(coalesce(p_company_size, '')), ''),
      contact_person         = NULLIF(btrim(coalesce(p_contact_person, '')), ''),
      contact_role           = NULLIF(btrim(coalesce(p_contact_role, '')), ''),
      contact_email          = NULLIF(btrim(coalesce(p_contact_email, '')), ''),
      contact_phone          = NULLIF(btrim(coalesce(p_contact_phone, '')), ''),
      email_source           = NULLIF(btrim(coalesce(p_email_source, '')), ''),
      email_verified_by_admin = COALESCE(p_email_verified_by_admin, email_verified_by_admin),
      notes                  = NULLIF(btrim(coalesce(p_notes, '')), '')
    WHERE id = p_lead_id;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error', 'duplicate');
    WHEN check_violation THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END;

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (p_lead_id, 'field_updated', 'internal', v_caller, '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_update_fields(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_update_fields(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text) TO authenticated;
