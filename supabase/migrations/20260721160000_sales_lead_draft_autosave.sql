-- ====================================================================
-- Rozpracované e-mailové koncepty — tiché automatické ukládání
--
-- PROČ:
--   Rozepsaný e-mail se ukládal jen ručně tlačítkem. Při zavření stránky,
--   výpadku sítě nebo vybití zařízení se text ztratil.
--   Existující `sales_lead_save_draft` se pro autosave použít nedá:
--     * zapisuje `draft_edited` aktivitu při KAŽDÉM volání → autosave po
--       ~2,5 s by zahltil audit stovkami řádků,
--     * nemá časové razítko → pomalý starší požadavek by mohl přepsat
--       novější text.
--
-- CO DĚLÁ:
--   1) `sales_leads.draft_updated_at` — kdy byl koncept naposledy uložen.
--      Zároveň slouží jako příznak „lead má rozpracovaný koncept" pro
--      záložku Rozpracované (NOT NULL = má koncept).
--   2) `sales_lead_autosave_draft(...)` — tiché ukládání:
--        * kontrola oprávnění `sales_leads.manage` (nebo superadmin),
--        * LAST-WRITE-WINS: požadavek starší než uložená verze se ZAHODÍ
--          (vrací `stale: true`) → pomalé připojení nepřepíše novější text,
--        * audit `draft_edited` zapíše POUZE při vzniku konceptu
--          (prázdný → neprázdný), ne při každém autosave,
--        * prázdný předmět i tělo = smazání konceptu (`draft_updated_at`
--          na NULL) → lead zmizí z Rozpracovaných.
--   3) Backfill `draft_updated_at` pro existující neprázdné koncepty, aby se
--      hned objevily v Rozpracovaných.
--
-- CO ZÁMĚRNĚ NEDĚLÁ:
--   - nemění `sales_lead_save_draft` (ruční uložení dál loguje aktivitu),
--   - nemaže leady ani historii — smazání konceptu čistí jen text,
--   - nemění pravidla odesílání e-mailů, Resend ani příchozí odpovědi.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.sales_lead_autosave_draft(uuid, text, text, timestamptz);
--   ALTER TABLE public.sales_leads DROP COLUMN IF EXISTS draft_updated_at;
-- ====================================================================

ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS draft_updated_at timestamptz;

-- Existující koncepty se musí objevit v Rozpracovaných.
UPDATE public.sales_leads
SET draft_updated_at = coalesce(draft_updated_at, updated_at, now())
WHERE draft_updated_at IS NULL
  AND (NULLIF(btrim(coalesce(draft_email_subject, '')), '') IS NOT NULL
       OR NULLIF(btrim(coalesce(draft_email_body, '')), '') IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_sales_leads_draft_updated_at
  ON public.sales_leads (draft_updated_at)
  WHERE draft_updated_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sales_lead_autosave_draft(
  p_lead_id uuid,
  p_subject text,
  p_body text,
  p_client_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller  uuid := auth.uid();
  v_lead    public.sales_leads%ROWTYPE;
  v_subject text := NULLIF(btrim(coalesce(p_subject, '')), '');
  v_body    text := NULLIF(btrim(coalesce(p_body, '')), '');
  v_had     boolean;
  v_has     boolean;
  v_when    timestamptz := coalesce(p_client_updated_at, now());
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

  -- Starší požadavek nesmí přepsat novější uloženou verzi.
  IF v_lead.draft_updated_at IS NOT NULL AND v_when <= v_lead.draft_updated_at THEN
    RETURN jsonb_build_object(
      'success', true, 'stale', true, 'lead_id', p_lead_id,
      'draft_updated_at', v_lead.draft_updated_at
    );
  END IF;

  v_had := (NULLIF(btrim(coalesce(v_lead.draft_email_subject, '')), '') IS NOT NULL
            OR NULLIF(btrim(coalesce(v_lead.draft_email_body, '')), '') IS NOT NULL);
  v_has := (v_subject IS NOT NULL OR v_body IS NOT NULL);

  UPDATE public.sales_leads SET
    draft_email_subject = v_subject,
    draft_email_body    = v_body,
    draft_prepared_by   = CASE WHEN v_has THEN 'admin' ELSE NULL END,
    draft_updated_at    = CASE WHEN v_has THEN v_when ELSE NULL END
  WHERE id = p_lead_id;

  -- Audit jen při VZNIKU konceptu — autosave jinak nic neloguje.
  IF v_has AND NOT v_had THEN
    INSERT INTO public.sales_lead_activities
      (lead_id, activity_type, direction, performed_by, metadata)
    VALUES (p_lead_id, 'draft_edited', 'internal', v_caller,
            jsonb_build_object('autosaved', true));
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'stale', false, 'lead_id', p_lead_id,
    'has_draft', v_has, 'draft_updated_at', CASE WHEN v_has THEN v_when ELSE NULL END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sales_lead_autosave_draft(uuid, text, text, timestamptz)
  FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sales_lead_autosave_draft(uuid, text, text, timestamptz)
  TO authenticated;
