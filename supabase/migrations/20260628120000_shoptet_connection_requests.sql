-- Shoptet self-service Phase 2 — connection requests + reward trigger status.
-- Additive. Creates shoptet_connection_requests table, adds reward_trigger_status
-- column to partners, trigger function for updated_at, RLS policies, and three
-- Vault helper RPCs for pending URL lifecycle.
-- NEVER stores the Shoptet export URL in any application table.
--
-- Scope: STAGING (dxmowysntemfqfnanxua) ONLY. Production untouched.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.shoptet_connection_requests;
--   DROP FUNCTION IF EXISTS public.shoptet_conn_req_set_updated_at();
--   DROP FUNCTION IF EXISTS public.store_shoptet_pending_url(uuid, text);
--   DROP FUNCTION IF EXISTS public.promote_shoptet_pending_url(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.delete_shoptet_pending_url(uuid);
--   ALTER TABLE public.partners DROP COLUMN IF EXISTS reward_trigger_status;

begin;

-- ── 1. New column on partners ─────────────────────────────────────────────────
-- DEFAULT 'paid' preserves BOHEMIA behaviour unchanged.
alter table public.partners
  add column if not exists reward_trigger_status text not null default 'paid';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'partners_reward_trigger_status_check'
  ) then
    alter table public.partners
      add constraint partners_reward_trigger_status_check
      check (reward_trigger_status in ('paid','shipped','completed'));
  end if;
end $$;

-- ── 2. shoptet_connection_requests ───────────────────────────────────────────
-- The export URL is NEVER stored here. url_received is a boolean flag only.
create table if not exists public.shoptet_connection_requests (
  id               uuid        primary key default gen_random_uuid(),
  partner_id       uuid        not null
                               references public.partners(id) on delete cascade,
  shop_name        text        not null
                               check (char_length(shop_name) between 1 and 200),
  trigger_status   text        not null default 'paid'
                               constraint scr_trigger_status_check
                               check (trigger_status in ('paid','shipped','completed')),
  reward_czk       numeric     not null check (reward_czk > 0),
  reward_mc        numeric     not null check (reward_mc > 0),
  url_received     boolean     not null default false,
  status           text        not null default 'draft'
                               constraint scr_status_check
                               check (status in ('draft','submitted','approved','active','rejected')),
  partner_note     text
                   check (partner_note is null or char_length(partner_note) <= 500),
  rejection_reason text
                   check (rejection_reason is null or char_length(rejection_reason) <= 500),
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  reviewed_by      uuid        references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- One pending/active request per partner at a time.
create unique index if not exists scr_partner_pending_unique
  on public.shoptet_connection_requests(partner_id)
  where status in ('submitted','approved','active');

create index if not exists idx_scr_partner_id
  on public.shoptet_connection_requests(partner_id);

create index if not exists idx_scr_status
  on public.shoptet_connection_requests(status);

-- updated_at trigger (inline — no external function dependency).
create or replace function public.shoptet_conn_req_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists scr_updated_at on public.shoptet_connection_requests;
create trigger scr_updated_at
  before update on public.shoptet_connection_requests
  for each row execute function public.shoptet_conn_req_set_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
alter table public.shoptet_connection_requests enable row level security;

-- Partner reads own requests (all statuses — partner needs to see request state).
drop policy if exists scr_partner_select on public.shoptet_connection_requests;
create policy scr_partner_select on public.shoptet_connection_requests
  for select to authenticated
  using (
    partner_id in (
      select id from public.partners where auth_user_id = auth.uid()
    )
  );

-- Partner inserts only a clean draft — cannot bootstrap to submitted/active/rejected.
-- EF submit-shoptet-connection (service_role) and admin bypass RLS entirely.
drop policy if exists scr_partner_insert on public.shoptet_connection_requests;
create policy scr_partner_insert on public.shoptet_connection_requests
  for insert to authenticated
  with check (
    status        = 'draft'
    and url_received  = false
    and submitted_at  is null
    and reviewed_at   is null
    and reviewed_by   is null
    and partner_id in (
      select id from public.partners where auth_user_id = auth.uid()
    )
  );

-- Partner updates only own draft in clean state.
-- USING: row must currently be an own draft.
-- WITH CHECK: row must remain a clean draft after update — prevents writing
--             url_received/submitted_at/reviewed_at/reviewed_by via direct client.
drop policy if exists scr_partner_update_draft on public.shoptet_connection_requests;
create policy scr_partner_update_draft on public.shoptet_connection_requests
  for update to authenticated
  using (
    status = 'draft'
    and partner_id in (
      select id from public.partners where auth_user_id = auth.uid()
    )
  )
  with check (
    status        = 'draft'
    and url_received  = false
    and submitted_at  is null
    and reviewed_at   is null
    and reviewed_by   is null
    and partner_id in (
      select id from public.partners where auth_user_id = auth.uid()
    )
  );

-- Admin/superadmin: full access for approve/reject flow.
drop policy if exists scr_admin_all on public.shoptet_connection_requests;
create policy scr_admin_all on public.shoptet_connection_requests
  for all to authenticated
  using  (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

-- ── 4. Vault helper RPCs (service_role only) ─────────────────────────────────
-- Vault key naming mirrors Phase 1A pattern:
--   pending:  shoptet_pending_url_{request_id_no_dashes}
--   final:    shoptet_export_url_{partner_id_no_dashes}

-- Stores the partner-submitted URL as a pending Vault key.
-- Called by submit-shoptet-connection EF. URL never reaches any app table.
create or replace function public.store_shoptet_pending_url(
  p_request_id uuid,
  p_url        text
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name     text;
  v_existing uuid;
begin
  if p_request_id is null or nullif(trim(coalesce(p_url, '')), '') is null then
    raise exception 'request_id and url are required';
  end if;
  if not exists (
    select 1 from public.shoptet_connection_requests where id = p_request_id
  ) then
    raise exception 'request not found';
  end if;

  v_name := 'shoptet_pending_url_' || replace(p_request_id::text, '-', '');

  select id into v_existing from vault.secrets where name = v_name;
  if v_existing is null then
    perform vault.create_secret(p_url, v_name, 'Shoptet pending export URL');
  else
    perform vault.update_secret(v_existing, p_url, v_name, 'Shoptet pending export URL');
  end if;

  return v_name; -- secret NAME only; URL never returned
end $$;
revoke all on function public.store_shoptet_pending_url(uuid, text)
  from public, anon, authenticated;
grant execute on function public.store_shoptet_pending_url(uuid, text)
  to service_role;

-- Promotes the pending URL to the partner's permanent Vault key.
-- Deletes the temp pending key. Called by approve-shoptet-connection EF.
create or replace function public.promote_shoptet_pending_url(
  p_request_id uuid,
  p_partner_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_pending_name text;
  v_final_name   text;
  v_pending_id   uuid;
  v_final_id     uuid;
  v_url          text;
begin
  v_pending_name := 'shoptet_pending_url_' || replace(p_request_id::text, '-', '');
  v_final_name   := 'shoptet_export_url_'  || replace(p_partner_id::text,  '-', '');

  select id, decrypted_secret
    into v_pending_id, v_url
    from vault.decrypted_secrets
   where name = v_pending_name;

  if v_pending_id is null or v_url is null then
    raise exception 'pending_url_not_found for request %', p_request_id;
  end if;

  -- Write URL to permanent key (same pattern as set_shoptet_export_secret)
  select id into v_final_id from vault.secrets where name = v_final_name;
  if v_final_id is null then
    perform vault.create_secret(v_url, v_final_name, 'Shoptet CSV export URL');
  else
    perform vault.update_secret(v_final_id, v_url, v_final_name, 'Shoptet CSV export URL');
  end if;

  -- Delete temp key (best-effort; lingering key is encrypted, not a security issue)
  begin
    perform vault.delete_secret(v_pending_id);
  exception when others then
    delete from vault.secrets where id = v_pending_id;
  end;

  return v_final_name; -- final secret NAME only
end $$;
revoke all on function public.promote_shoptet_pending_url(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.promote_shoptet_pending_url(uuid, uuid)
  to service_role;

-- Deletes the pending Vault key (used on reject or failed submit cleanup).
create or replace function public.delete_shoptet_pending_url(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_name text;
  v_id   uuid;
begin
  v_name := 'shoptet_pending_url_' || replace(p_request_id::text, '-', '');
  select id into v_id from vault.secrets where name = v_name;
  if v_id is null then
    return; -- already gone, no-op
  end if;
  begin
    perform vault.delete_secret(v_id);
  exception when others then
    delete from vault.secrets where id = v_id;
  end;
end $$;
revoke all on function public.delete_shoptet_pending_url(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_shoptet_pending_url(uuid)
  to service_role;

commit;
