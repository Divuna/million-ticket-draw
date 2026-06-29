-- Automatic Shoptet import scheduler (STAGING dxmowysntemfqfnanxua).
--
-- Goal: run `import-shoptet-orders` automatically every 15 minutes for every
-- partner with shoptet_import_enabled = true, recording each run in
-- shoptet_import_runs with trigger = 'cron'. Duplicate codes are already
-- prevented by create_partner_order_reward (advisory lock + dedup); this layer
-- only schedules and dispatches.
--
-- Auth: the orchestrator reads a dedicated dispatch token from Vault and sends
-- it as x-internal-token. The Edge Function verifies it server-side via
-- verify_shoptet_cron_token (SECURITY DEFINER) so the secret is never exposed.
-- The production INTERNAL_FUNCTION_TOKEN is NOT used or copied here.
--
-- Scope: STAGING only. Production untouched. Partner API (partner-activate),
-- the partner dashboard, and BOHEMIA config are not modified.
--
-- ⚠️ PROD ROLLOUT (separate, approved step): change v_url to the production
--   functions base URL and create the Vault secret on production.
--
-- Rollback:
--   SELECT cron.unschedule('shoptet_auto_import_15min');
--   DROP FUNCTION IF EXISTS public.run_shoptet_cron_imports();
--   DROP FUNCTION IF EXISTS public.verify_shoptet_cron_token(text);
--   -- (Vault secret 'shoptet_cron_internal_token' may be left or deleted via vault API.)

-- ── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- ── Dispatch token in Vault (generated once, never printed) ──────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'shoptet_cron_internal_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'shoptet_cron_internal_token',
      'Internal dispatch token for pg_cron -> import-shoptet-orders (staging)'
    );
  end if;
end $$;

-- ── Server-side token verification (used by the Edge Function) ───────────────
create or replace function public.verify_shoptet_cron_token(p_token text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from vault.decrypted_secrets s
    where s.name = 'shoptet_cron_internal_token'
      and p_token is not null
      and p_token <> ''
      and s.decrypted_secret = p_token
  );
$$;

revoke all on function public.verify_shoptet_cron_token(text) from public, anon, authenticated;
grant execute on function public.verify_shoptet_cron_token(text) to service_role;

-- ── Orchestrator: dispatch import for each enabled partner ───────────────────
create or replace function public.run_shoptet_cron_imports()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- STAGING functions base URL. PROD rollout must replace this.
  v_url     text := 'https://dxmowysntemfqfnanxua.supabase.co/functions/v1/import-shoptet-orders';
  v_token   text;
  v_partner record;
  v_dispatched      int := 0;
  v_skipped_running int := 0;
begin
  select decrypted_secret into v_token
  from vault.decrypted_secrets
  where name = 'shoptet_cron_internal_token';

  if v_token is null then
    return jsonb_build_object('ok', false, 'error', 'cron_token_missing');
  end if;

  for v_partner in
    select id
    from public.partners
    where shoptet_import_enabled = true
  loop
    -- Overlap guard: skip partners with an import already running (< 30 min old).
    if exists (
      select 1
      from public.shoptet_import_runs r
      where r.partner_id = v_partner.id
        and r.status = 'running'
        and r.started_at > now() - interval '30 minutes'
    ) then
      v_skipped_running := v_skipped_running + 1;
      continue;
    end if;

    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-token', v_token
      ),
      body    := jsonb_build_object(
        'partner_id', v_partner.id,
        'mode', 'live',
        'trigger', 'cron'
      )
    );
    v_dispatched := v_dispatched + 1;
  end loop;

  return jsonb_build_object('ok', true, 'dispatched', v_dispatched, 'skipped_running', v_skipped_running);
end;
$$;

revoke all on function public.run_shoptet_cron_imports() from public, anon, authenticated;
grant execute on function public.run_shoptet_cron_imports() to service_role;

-- ── Schedule: every 15 minutes ───────────────────────────────────────────────
select cron.schedule(
  'shoptet_auto_import_15min',
  '*/15 * * * *',
  $cron$ select public.run_shoptet_cron_imports(); $cron$
);
