-- Bezpečnostní audit (05. 09. 2026): odstranění natvrdo zapsaného credentialu
-- z `public._invoke_forward_messages_to_sofinity()`.
--
-- ZJIŠTĚNÍ (read-only ověřeno na produkci před přípravou této migrace):
--   - Funkce je SECURITY DEFINER a v těle měla přímo napsaný Bearer token
--     (`Authorization: 'Bearer <literal>'`) volající vlastní produkční
--     Edge Function `forward_messages_to_sofinity`.
--   - Funkce NENÍ připojena k žádnému triggeru (`pg_trigger` neobsahuje
--     žádný záznam s `tgfoid` ukazujícím na tuto funkci) a žádná jiná funkce
--     v `public` schématu ji nevolá (`pg_get_functiondef(...) ILIKE
--     '%_invoke_forward_messages_to_sofinity%'` nevrátilo žádný jiný řádek).
--   - Funkce je tedy prokazatelně nepoužívaná (osiřelá) — tato oprava proto
--     nemění žádné produkční chování, pouze odstraňuje riziko úniku
--     credentialu při čtení definice funkce (`pg_get_functiondef`,
--     `information_schema.routines`, DB dump apod.).
--
-- OPRAVA: literál nahrazen bezpečným načtením ze Supabase Vault, stejným
-- vzorem jako ostatní interní cron/helper funkce v tomto projektu
-- (`run_process_email_queue_cron`, `enqueue_send_push_edge_request`) —
-- tajemství se čte z `vault.decrypted_secrets`, nikde není napsané natvrdo.
-- Cílová URL, hlavička (`Authorization: Bearer <token>`) i chování při
-- selhání (tichý návrat, žádná chyba navenek) zůstávají beze změny.
--
-- Tato migrace je POUZE připravena v repozitáři. Nebyla aplikována na
-- produkci ani staging v rámci tohoto auditu.

CREATE OR REPLACE FUNCTION public._invoke_forward_messages_to_sofinity()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _resp RECORD;
  _token text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO _token
    FROM vault.decrypted_secrets
    WHERE name = 'INTERNAL_WEBHOOK_TOKEN'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault nedostupný — beze změny předchozího chování (funkce chybu navenek
    -- nikdy nevracela), jen se neprovede odchozí volání.
    RETURN;
  END;

  IF _token IS NULL OR _token = '' THEN
    RETURN;
  END IF;

  SELECT *
  INTO _resp
  FROM net.http_post(
    url := 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/forward_messages_to_sofinity',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || _token,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );

  RETURN; -- ignore the response (beze změny předchozího chování)
END;
$function$;
