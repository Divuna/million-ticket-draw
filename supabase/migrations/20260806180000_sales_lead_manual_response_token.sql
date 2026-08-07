-- ============================================================================
-- SALES LEADS — response token i pro RUČNĚ odeslaný první obchodní e-mail.
-- Spec: docs/SALES_LEADS_ADMIN_SPEC.md §25.
-- ============================================================================
-- Zapsáno jako soubor v repu. Aplikace na staging/produkci vyžaduje výslovné
-- schválení Pavla. TÍMTO SOUBOREM SE NESPOUŠTÍ ŽÁDNÉ SQL.
--
-- Proč: `sales_lead_email_response_tokens.batch_item_id` byl NOT NULL, takže
-- token šlo vydat jen k položce e-mailové dávky. Ruční první e-mail žádnou
-- položku dávky nemá, a proto pro něj CTA „Mám zájem“ / „Nemám zájem“ vůbec
-- nešlo vytvořit. Sloupec je nově nullable — UNIQUE zůstává (Postgres povoluje
-- více NULL hodnot), takže vazba dávka↔token je pro dávkovou cestu stále 1:1.
--
-- Rozsah: pouze `sales_lead_email_response_tokens` + jedna nová RPC.
-- Existující řádky, dávky ani uzamčené snapshoty se NEMĚNÍ. Žádný e-mail,
-- žádná automatika, žádný cron, žádné produkční e-maily/peněženky/platby/
-- soutěže/partneři.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.sales_lead_issue_manual_response_token(uuid, text);
--   -- pozor: zpět na NOT NULL lze jen po odstranění manuálních tokenů
--   -- DELETE FROM public.sales_lead_email_response_tokens WHERE batch_item_id IS NULL;
--   -- ALTER TABLE public.sales_lead_email_response_tokens
--   --   ALTER COLUMN batch_item_id SET NOT NULL;
-- ============================================================================

BEGIN;

-- ── 1. Token smí vzniknout i bez položky dávky ──────────────────────────────
ALTER TABLE public.sales_lead_email_response_tokens
  ALTER COLUMN batch_item_id DROP NOT NULL;

-- ── 2. Vydání tokenu pro ruční první e-mail ─────────────────────────────────
-- Volá výhradně Edge Function `send-sales-lead-email` (service_role) těsně před
-- sestavením těla e-mailu, tedy PŘED uzamčením snapshotu.
--
-- Vrací SYROVÝ token (příjemce ho dostane v odkazu). Hash se ukládá, syrový
-- token se nikdy neperzistuje — stejný model jako u dávkové cesty.
CREATE OR REPLACE FUNCTION public.sales_lead_issue_manual_response_token(
  p_lead_id uuid,
  p_recipient text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_token_hash text;
  v_recipient text := lower(btrim(coalesce(p_recipient, '')));
BEGIN
  IF p_lead_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_required');
  END IF;
  IF v_recipient = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'recipient_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sales_leads WHERE id = p_lead_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_not_found');
  END IF;

  LOOP
    v_token :=
      replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
    v_token_hash := encode(extensions.digest(v_token, 'sha256'), 'hex');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.sales_lead_email_response_tokens r
      WHERE r.token_hash = v_token_hash
    );
  END LOOP;

  INSERT INTO public.sales_lead_email_response_tokens (
    token_hash, lead_id, batch_item_id, recipient_snapshot, expires_at
  )
  VALUES (
    v_token_hash, p_lead_id, NULL, v_recipient, now() + interval '90 days'
  );

  RETURN jsonb_build_object('success', true, 'token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_issue_manual_response_token(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_issue_manual_response_token(uuid, text)
  TO service_role;

COMMIT;
