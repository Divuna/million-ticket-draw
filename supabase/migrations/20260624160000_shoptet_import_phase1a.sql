-- Shoptet CSV importer — Phase 1A groundwork (STAGING ONLY).
-- Additive. Creates per-partner config, import-run monitoring tables (safe
-- counters only, NO customer PII), and Vault-backed secret RPCs for the
-- Shoptet CSV export URL. Nothing here creates rewards or sends email.
--
-- Scope: apply to STAGING (dxmowysntemfqfnanxua) only. Production untouched.
-- Rollback: see docs/rollback/shoptet_import_phase1a_rollback.sql

begin;

-- ── 1. Per-partner config ────────────────────────────────────────────────────
alter table public.partners
  add column if not exists shoptet_import_enabled boolean not null default false;

alter table public.partners
  add column if not exists shoptet_export_secret_name text;

alter table public.partners
  add column if not exists shoptet_customer_delivery text not null default 'partner';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'partners_shoptet_customer_delivery_check'
  ) then
    alter table public.partners
      add constraint partners_shoptet_customer_delivery_check
      check (shoptet_customer_delivery in ('partner','onemil','both'));
  end if;
end $$;

-- ── 2. Import run summary (safe counters only — no emails, no URL) ────────────
create table if not exists public.shoptet_import_runs (
  id                       uuid primary key default gen_random_uuid(),
  partner_id               uuid references public.partners(id) on delete set null,
  trigger                  text not null default 'admin'   check (trigger in ('admin','cron')),
  mode                     text not null default 'dry_run' check (mode in ('dry_run','live')),
  status                   text not null default 'running' check (status in ('running','ok','partial','failed')),
  rows_total               integer not null default 0,
  rows_valid               integer not null default 0,
  rows_invalid             integer not null default 0,
  rows_would_create        integer not null default 0,
  rows_would_status_update integer not null default 0,
  rows_skipped_dup         integer not null default 0,
  rows_created             integer not null default 0,
  rows_status_updated      integer not null default 0,
  rows_failed              integer not null default 0,
  error_summary            text,
  started_at               timestamptz not null default now(),
  finished_at              timestamptz
);
alter table public.shoptet_import_runs enable row level security;

-- Optional per-row audit. external_order_id (order code) + outcome only.
-- NEVER store customer emails, the export URL, tokens, or other PII here.
create table if not exists public.shoptet_import_row_log (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.shoptet_import_runs(id) on delete cascade,
  external_order_id text,
  action            text not null check (action in
                      ('would_create','would_status_update','skip_dup','invalid','error','create','status_update')),
  result            text,
  message           text,
  created_at        timestamptz not null default now()
);
alter table public.shoptet_import_row_log enable row level security;

create index if not exists idx_shoptet_import_runs_partner on public.shoptet_import_runs (partner_id, started_at desc);
create index if not exists idx_shoptet_import_row_log_run on public.shoptet_import_row_log (run_id);

-- ── 3. RLS: admin/superadmin read; writes only via service_role (RLS bypass) ──
drop policy if exists shoptet_import_runs_admin_read on public.shoptet_import_runs;
create policy shoptet_import_runs_admin_read on public.shoptet_import_runs
  for select to authenticated
  using (public.is_admin() or public.is_superadmin());

drop policy if exists shoptet_import_row_log_admin_read on public.shoptet_import_row_log;
create policy shoptet_import_row_log_admin_read on public.shoptet_import_row_log
  for select to authenticated
  using (public.is_admin() or public.is_superadmin());

-- ── 4. Vault-backed secret RPCs (service_role only) ──────────────────────────
-- Store the Shoptet export URL in Vault; expose only the secret NAME elsewhere.
create or replace function public.set_shoptet_export_secret(p_partner_id uuid, p_url text)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text;
  v_existing uuid;
begin
  if p_partner_id is null or nullif(trim(coalesce(p_url, '')), '') is null then
    raise exception 'partner_id and url are required';
  end if;
  if not exists (select 1 from public.partners where id = p_partner_id) then
    raise exception 'partner not found';
  end if;

  v_name := 'shoptet_export_url_' || replace(p_partner_id::text, '-', '');

  select id into v_existing from vault.secrets where name = v_name;
  if v_existing is null then
    perform vault.create_secret(p_url, v_name, 'Shoptet CSV export URL');
  else
    perform vault.update_secret(v_existing, p_url, v_name, 'Shoptet CSV export URL');
  end if;

  update public.partners
     set shoptet_export_secret_name = v_name,
         updated_at = now()
   where id = p_partner_id;

  return v_name; -- secret NAME only; never the URL
end $$;
revoke all on function public.set_shoptet_export_secret(uuid, text) from public, anon, authenticated;
grant execute on function public.set_shoptet_export_secret(uuid, text) to service_role;

-- Server-side read of the decrypted URL (service_role only; importer EF use).
create or replace function public.get_shoptet_export_url(p_partner_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text;
  v_url text;
begin
  select shoptet_export_secret_name into v_name
    from public.partners where id = p_partner_id;
  if v_name is null then
    return null;
  end if;
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = v_name;
  return v_url;
end $$;
revoke all on function public.get_shoptet_export_url(uuid) from public, anon, authenticated;
grant execute on function public.get_shoptet_export_url(uuid) to service_role;

commit;
