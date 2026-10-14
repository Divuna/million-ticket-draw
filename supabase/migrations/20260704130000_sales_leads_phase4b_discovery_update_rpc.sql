-- ============================================================================
-- SALES LEADS — Fáze 4B: RPC pro ruční editaci zařazení navrženého leadu
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §17 (§17.2, 17.5, 17.6, 17.8)
-- ============================================================================
-- ⛔ NEAPLIKOVÁNO. Zapsáno pouze jako soubor v repu. Aplikace na staging/
--    produkci vyžaduje výslovné schválení Pavla (přes apply_migration).
--
-- Doplňuje RPC `sales_lead_update_discovery` — umožňuje člověku s oprávněním
-- `sales_leads.manage` ručně upravit zařazení leadu: `lead_group`,
-- `lead_quality`, `discovery_source`. Sloupce existují z Fáze 4A; tato RPC
-- je klientská write cesta (RLS na sales_leads nemá write policy).
--
-- `discovery_meta` je záměrně NEeditovatelné z UI (jen čitelný technický
-- kontext) — RPC ho nemění.
--
-- ⚠️ Nemění status leadu (schválení/odmítnutí jde přes sales_lead_set_status,
--    Fáze 4A) a NEODESÍLÁ e-maily. AI nemá EXECUTE (grant jen authenticated,
--    guard has_admin_permission).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_update_discovery(uuid, text, smallint, text);
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.has_admin_permission(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.has_admin_permission(text, uuid)';
  END IF;
  IF to_regclass('public.sales_leads') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency table public.sales_leads — apply Phase 1 first';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sales_leads' AND column_name='lead_group'
  ) THEN
    RAISE EXCEPTION 'Missing column public.sales_leads.lead_group — apply Phase 4A first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_update_discovery(
  p_lead_id          uuid,
  p_lead_group       text,
  p_lead_quality     smallint DEFAULT NULL,
  p_discovery_source text DEFAULT NULL
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

  BEGIN
    UPDATE public.sales_leads SET
      lead_group       = NULLIF(btrim(coalesce(p_lead_group, '')), ''),
      lead_quality     = COALESCE(p_lead_quality, lead_quality),
      discovery_source = NULLIF(btrim(coalesce(p_discovery_source, '')), '')
      -- discovery_meta NEUPRAVUJE (jen čitelný kontext)
    WHERE id = p_lead_id;
  EXCEPTION
    WHEN check_violation THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END;

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (p_lead_id, 'field_updated', 'internal', v_caller,
          jsonb_build_object('scope', 'discovery'));

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_update_discovery(uuid, text, smallint, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_update_discovery(uuid, text, smallint, text) TO authenticated;
