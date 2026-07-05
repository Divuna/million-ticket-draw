-- ============================================================================
-- SALES LEADS — Fáze 6: bezpečné mazání leadů (jednotlivě i hromadně)
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §17 (§17.11)
-- ============================================================================
-- ⛔ NEAPLIKOVÁNO. Zapsáno pouze jako soubor v repu. Aplikace na staging/
--    produkci vyžaduje výslovné schválení Pavla (přes apply_migration).
--
-- Cíl: umožnit administrátorovi s oprávněním `sales_leads.manage` smazat lead
-- (jednotlivě i hromadně) z modulu Obchod / Leady — např. duplicity, testovací
-- záznamy nebo nepoužitelné návrhy. Mazání se týká VÝHRADNĚ tabulek modulu
-- Obchod / Leady; nesahá na wallets/payments/contests/tickets/winners/Stripe/
-- `buy_ticket_atomic`.
--
-- Cascade: `sales_lead_activities.lead_id` a `sales_lead_status_history.lead_id`
-- mají už z Fáze 1 `ON DELETE CASCADE` na `sales_leads(id)` — smazání řádku
-- v `sales_leads` automaticky smaže navázané aktivity i historii stavů. Žádná
-- další úklidová logika není potřeba.
--
-- Bezpečnostní model:
--   • Obě RPC jsou SECURITY DEFINER s interním guardem
--     `has_admin_permission('sales_leads.manage') OR is_superadmin()`.
--   • EXECUTE jen pro `authenticated` (anon nemá) — guard uvnitř funkce dál
--     omezuje na skutečné držitele oprávnění.
--   • Mazání NIKDY neodesílá e-mail, NIKDY neschvaluje kontakt, NIKDY nemění
--     stav jiných leadů.
--   • Žádné mazání mimo `sales_leads` (a jeho cascade-navázané tabulky).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_delete(uuid);
--   DROP FUNCTION IF EXISTS public.sales_lead_delete_bulk(uuid[]);
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

-- ── 1. sales_lead_delete — smazání JEDNOHO leadu ────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_lead_delete(
  p_lead_id uuid
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

  -- Cascade (ON DELETE CASCADE z Fáze 1) smaže navázané
  -- sales_lead_activities a sales_lead_status_history automaticky.
  DELETE FROM public.sales_leads WHERE id = p_lead_id;

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_delete(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_delete(uuid) TO authenticated;

-- ── 2. sales_lead_delete_bulk — hromadné smazání VÍCE leadů najednou ────────
CREATE OR REPLACE FUNCTION public.sales_lead_delete_bulk(
  p_lead_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_deleted_ids uuid[];
BEGIN
  IF v_caller IS NULL
     OR NOT (public.has_admin_permission('sales_leads.manage', v_caller)
             OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  IF p_lead_ids IS NULL OR array_length(p_lead_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_leads_selected');
  END IF;

  -- Cascade (ON DELETE CASCADE z Fáze 1) smaže navázané
  -- sales_lead_activities a sales_lead_status_history automaticky.
  WITH deleted AS (
    DELETE FROM public.sales_leads
    WHERE id = ANY(p_lead_ids)
    RETURNING id
  )
  SELECT array_agg(id) INTO v_deleted_ids FROM deleted;

  RETURN jsonb_build_object(
    'success', true,
    'deleted_count', COALESCE(array_length(v_deleted_ids, 1), 0),
    'deleted_ids', COALESCE(to_jsonb(v_deleted_ids), '[]'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_delete_bulk(uuid[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_delete_bulk(uuid[]) TO authenticated;
