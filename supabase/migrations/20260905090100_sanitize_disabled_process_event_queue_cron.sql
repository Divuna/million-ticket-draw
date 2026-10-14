-- Bezpečnostní audit (05. 09. 2026): odstranění natvrdo zapsaného
-- `x-internal-token` z definice VYPNUTÉHO cron jobu `process-event-queue`
-- (jobid 23).
--
-- ZJIŠTĚNÍ (read-only ověřeno na produkci před přípravou této migrace):
--   - `cron.job.command` pro job 23 obsahoval `net.http_post(...)` s
--     hlavičkou `x-internal-token` nastavenou na literální řetězec —
--     stejnou hodnotu, jakou `process_event_queue_worker` porovnává proti
--     env secretu `INTERNAL_FUNCTION_TOKEN`. Tento credential byl čitelný
--     komukoli s SELECT na `cron.job` (a tedy i v jakémkoli dumpu/auditu
--     DB), bez ohledu na to, že samotný job je `active = false`.
--   - Job zůstává VYPNUTÝ (`active = false`) už dnes; tato migrace jeho stav
--     NEMĚNÍ a explicitně ho ponechává vypnutý.
--
-- OPRAVA: `cron.job.command` se přepisuje na volání nové wrapper funkce
-- `public.run_process_event_queue_worker_cron()`, která token i cílovou
-- URL čte bezpečně z `vault.decrypted_secrets` — stejný ověřený vzor jako
-- `run_process_email_queue_cron()` (jobid 16) a `enqueue_send_push_edge_request()`.
-- Žádný credential není nikde napsaný natvrdo. Cílová URL, hlavička i tělo
-- requestu (`{}`) zůstávají beze změny; mění se jen ZDROJ hodnoty tokenu.
--
-- Tato migrace je POUZE připravena v repozitáři. Nebyla aplikována na
-- produkci ani staging v rámci tohoto auditu. Cron zůstává vypnutý —
-- migrace ho NESMÍ znovu zapnout.

CREATE OR REPLACE FUNCTION public.run_process_event_queue_worker_cron()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_token text;
  v_base_url text;
  v_request_id bigint;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return jsonb_build_object('ok', false, 'error', 'pg_net_missing');
  end if;

  begin
    select decrypted_secret into v_token
    from vault.decrypted_secrets
    where name = 'internal_function_token';

    select decrypted_secret into v_base_url
    from vault.decrypted_secrets
    where name = 'edge_functions_url';
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'vault_unavailable');
  end;

  if v_token is null or v_token = '' then
    return jsonb_build_object('ok', false, 'error', 'internal_function_token_missing');
  end if;

  if v_base_url is null or v_base_url = '' then
    return jsonb_build_object('ok', false, 'error', 'edge_functions_url_missing');
  end if;

  select net.http_post(
    url := rtrim(v_base_url, '/') || '/process_event_queue_worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-token', v_token
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  return jsonb_build_object('ok', true, 'request_id', v_request_id);
end;
$function$;

REVOKE ALL ON FUNCTION public.run_process_event_queue_worker_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_process_event_queue_worker_cron() TO service_role;

-- Přepíše jen `command` u existujícího jobu 23; `active` explicitně
-- ponecháno false, `schedule` beze změny. Job se tímto NEZAPÍNÁ.
SELECT cron.alter_job(
  job_id := 23,
  command := 'select public.run_process_event_queue_worker_cron();',
  active := false
);
