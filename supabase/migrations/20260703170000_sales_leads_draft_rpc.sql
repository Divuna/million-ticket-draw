-- ============================================================================
-- SALES LEADS — Fáze 3B: RPC pro ruční uložení upraveného návrhu e-mailu
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md (§7, §11, §14)
-- ============================================================================
-- ⛔ NEAPLIKOVÁNO. Zapsáno pouze jako soubor v repu. Aplikace na staging/
--    produkci vyžaduje výslovné schválení Pavla (přes apply_migration).
--
-- Doplňuje RPC `sales_lead_save_draft` — umožňuje člověku s oprávněním
-- `sales_leads.manage` ručně upravit a uložit návrh oslovovacího e-mailu
-- (subject + body). Sloupce draft_email_subject / draft_email_body /
-- draft_prepared_by už existují z Fáze 1; activity typ 'draft_edited' už je
-- povolen CHECK constraintem z Fáze 1 — žádná změna schématu není potřeba.
--
-- AI-generovaný návrh zapisují Edge Functions přes service_role (obcházejí
-- RLS). Tato RPC je pro RUČNÍ úpravu z klienta (RLS nemá write policy).
--
-- ⚠️ Toto NEODESÍLÁ e-mail. Jen ukládá interní koncept. Odeslání je samostatná
--    pozdější fáze (Fáze 3 e-mail) s vlastním schválením.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_save_draft(uuid, text, text);
-- ============================================================================

DO $$
BEGIN
  IF to_regprocedure('public.has_admin_permission(text, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency public.has_admin_permission(text, uuid)';
  END IF;
  IF to_regclass('public.sales_leads') IS NULL THEN
    RAISE EXCEPTION 'Missing dependency table public.sales_leads — apply Phase 1 first';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sales_lead_save_draft(
  p_lead_id uuid,
  p_subject text,
  p_body    text
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

  UPDATE public.sales_leads SET
    draft_email_subject = NULLIF(btrim(coalesce(p_subject, '')), ''),
    draft_email_body    = NULLIF(btrim(coalesce(p_body, '')), ''),
    draft_prepared_by   = 'admin'
  WHERE id = p_lead_id;

  INSERT INTO public.sales_lead_activities
    (lead_id, activity_type, direction, performed_by, metadata)
  VALUES (p_lead_id, 'draft_edited', 'internal', v_caller, '{}'::jsonb);

  RETURN jsonb_build_object('success', true, 'lead_id', p_lead_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sales_lead_save_draft(uuid, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sales_lead_save_draft(uuid, text, text) TO authenticated;
