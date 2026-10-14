-- ====================================================================
-- sales_lead_approve_proposed — schválení navrženého leadu jednou akcí
--
-- PROČ:
--   Schválení navrženého leadu vyžadovalo tři kroky: uložit údaje
--   (sales_lead_update_fields), kliknout „Schválit návrh" a potvrdit změnu
--   stavu (sales_lead_set_status). Mezi kroky mohl lead zůstat napůl uložený.
--
-- CO DĚLÁ:
--   Jedna transakční RPC POUZE pro přechod `navrzeny -> novy`:
--     1) uloží upravená pole leadu (vč. email_verified_by_admin),
--     2) změní stav na `novy`.
--   Obojí voláním EXISTUJÍCÍCH funkcí — žádné paralelní ukládání:
--     public.sales_lead_update_fields(...)  → duplicitní kontroly, validace
--     public.sales_lead_set_status(...)     → pravidla přechodů, historie,
--                                             audit (sales_lead_activities)
--
-- ATOMICITA:
--   Vnitřní blok s EXCEPTION handlerem tvoří subtransakci. Pokud kterýkoli
--   krok selže, VŠECHNY zápisy bloku se odvolají a vrátí se čitelná chyba —
--   lead nikdy nezůstane napůl uložený. (Hodnoty proměnných PL/pgSQL
--   rollback subtransakce nemaže, takže původní chybu umíme vrátit.)
--
-- BEZPEČNOST:
--   SECURITY DEFINER + kontrola oprávnění `sales_leads.manage` (nebo
--   superadmin) hned na začátku; volané funkce si oprávnění kontrolují také
--   (auth.uid() se voláním nemění). Funkce je striktně omezená na jediný
--   přechod `navrzeny -> novy` — žádné jiné přechody neumí.
--   Pravidla pro odesílání e-mailů se NEMĚNÍ: schválit lze i bez
--   `email_verified_by_admin`, odeslání e-mailu ale hlídají beze změny
--   stávající kontroly jinde.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.sales_lead_approve_proposed(
--     uuid, text, text, text, text, text, text, text, text, text, text,
--     text, text, text, boolean, text, boolean, text);
-- ====================================================================

CREATE OR REPLACE FUNCTION public.sales_lead_approve_proposed(
  p_lead_id uuid,
  p_company_name text,
  p_ico text,
  p_dic text,
  p_website text,
  p_industry text,
  p_city text,
  p_address text,
  p_company_size text,
  p_contact_person text,
  p_contact_role text,
  p_contact_email text,
  p_contact_phone text,
  p_email_source text,
  p_email_verified_by_admin boolean,
  p_notes text,
  p_duplicate_override boolean DEFAULT false,
  p_duplicate_override_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_status text;
  v_fail   jsonb;
  v_res    jsonb;
BEGIN
  IF v_caller IS NULL
     OR NOT (public.has_admin_permission('sales_leads.manage', v_caller)
             OR public.is_superadmin(v_caller)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;

  SELECT status INTO v_status FROM public.sales_leads WHERE id = p_lead_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  -- Striktně jen schválení návrhu; ostatní přechody řeší sales_lead_set_status.
  IF v_status <> 'navrzeny' THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'transition_not_allowed',
      'from', v_status, 'to', 'novy'
    );
  END IF;

  BEGIN
    -- 1) Uložení upravených údajů (duplicitní kontroly zůstávají).
    v_res := public.sales_lead_update_fields(
      p_lead_id, p_company_name, p_ico, p_dic, p_website, p_industry, p_city,
      p_address, p_company_size, p_contact_person, p_contact_role,
      p_contact_email, p_contact_phone, p_email_source,
      p_email_verified_by_admin, p_notes,
      coalesce(p_duplicate_override, false), p_duplicate_override_reason
    );
    IF NOT coalesce((v_res ->> 'success')::boolean, false) THEN
      v_fail := v_res;
      RAISE EXCEPTION 'sales_lead_approve_rollback';
    END IF;

    -- 2) Změna stavu (historie + audit vzniknou právě jednou).
    v_res := public.sales_lead_set_status(p_lead_id, 'novy', NULL);
    IF NOT coalesce((v_res ->> 'success')::boolean, false) THEN
      v_fail := v_res;
      RAISE EXCEPTION 'sales_lead_approve_rollback';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Subtransakce se odvolala → žádný částečně uložený stav.
    RETURN coalesce(
      v_fail,
      jsonb_build_object('success', false, 'error', 'approve_failed')
    );
  END;

  RETURN jsonb_build_object(
    'success', true,
    'lead_id', p_lead_id,
    'old_status', 'navrzeny',
    'new_status', 'novy'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sales_lead_approve_proposed(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, boolean, text, boolean, text
) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.sales_lead_approve_proposed(
  uuid, text, text, text, text, text, text, text, text, text, text, text,
  text, text, boolean, text, boolean, text
) TO authenticated;
