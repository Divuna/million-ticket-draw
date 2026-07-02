-- ============================================================================
-- Secure process-email-queue cron dispatch with an internal token.
-- ============================================================================
-- Scope:
--   - Adds a small SECURITY DEFINER cron dispatcher that reads existing
--     Vault secrets `internal_function_token` and `edge_functions_url`.
--   - Replaces the existing pg_cron job `process_email_queue_every_10_min`,
--     if it exists, so cron sends `x-internal-token` to the Edge Function.
--   - Does not create a new cron job when the environment does not already
--     have one, keeping staging/no-cron environments inert.
--   - Does not touch email_queue data.
-- ============================================================================

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

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid, schedule
    from cron.job
    where jobname = 'process_email_queue_every_10_min'
  loop
    perform cron.unschedule(v_job.jobid);
    perform cron.schedule(
      'process_email_queue_every_10_min',
      v_job.schedule,
      $cron$select public.run_process_email_queue_cron();$cron$
    );
  end loop;
end $$;
