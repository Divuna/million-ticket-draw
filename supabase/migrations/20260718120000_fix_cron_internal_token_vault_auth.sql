-- ============================================================================
-- Fix cron 401s for process-email-queue and send-offer-reminders.
-- ============================================================================
-- Root cause: the pg_cron jobs authenticate with the Vault secret
-- `internal_function_token`, but the Edge Functions compared the incoming
-- `x-internal-token` only against the deployed Edge secret
-- INTERNAL_FUNCTION_TOKEN, which had drifted away from the Vault value.
-- Result: every scheduled call returned HTTP 401.
--
-- This migration makes the correct, Vault-based token available to the Edge
-- Functions for server-side verification (same pattern as the existing
-- verify_shoptet_cron_token), and repoints the email-queue cron to a Vault
-- dispatcher so the cron sends the correct token WITHOUT hardcoding it.
--
-- No secret value is written here; everything is read from Vault at runtime.
-- No email_queue / event_queue / contest / wallet / payment / invoice data is
-- touched. No new cron job is created and the */10 schedule is preserved.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.verify_internal_function_token(text);
--   -- restore the previous process_email_queue_every_10_min command if needed.
-- ============================================================================

-- Server-side verification of the internal function token against Vault.
-- SECURITY DEFINER so the Vault secret is never exposed to the caller; only
-- service_role (the Edge Functions' key) may execute it.
create or replace function public.verify_internal_function_token(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets s
    where s.name = 'internal_function_token'
      and p_token is not null
      and p_token <> ''
      and s.decrypted_secret = p_token
  );
$$;

revoke all on function public.verify_internal_function_token(text) from public, anon, authenticated;
grant execute on function public.verify_internal_function_token(text) to service_role;

-- Vault dispatcher for the email-queue cron: reads the Vault token and posts it
-- as x-internal-token. Idempotent; safe to re-run.
create or replace function public.run_process_email_queue_cron()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    url := rtrim(v_base_url, '/') || '/process-email-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-token', v_token
    ),
    body := '{}'::jsonb
  ) into v_request_id;

  return jsonb_build_object('ok', true, 'request_id', v_request_id);
end;
$$;

revoke all on function public.run_process_email_queue_cron() from public, anon, authenticated;
grant execute on function public.run_process_email_queue_cron() to service_role;

-- Repoint the EXISTING process_email_queue_every_10_min cron to the Vault
-- dispatcher, preserving its schedule. cron.schedule upserts by job name, so
-- no second/duplicate job is created. Only touches the job if it exists.
do $$
declare
  v_schedule text;
begin
  select schedule into v_schedule
  from cron.job
  where jobname = 'process_email_queue_every_10_min'
  limit 1;

  if v_schedule is not null then
    perform cron.schedule(
      'process_email_queue_every_10_min',
      v_schedule,
      $cron$select public.run_process_email_queue_cron();$cron$
    );
  end if;
end $$;
