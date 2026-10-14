-- Minimal pre-Phase-1 schema fixture for isolated migration testing.
-- It models only the existing objects touched by the additive migration.

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null
);

create type public.app_role as enum ('user', 'admin', 'superadmin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id),
  unique (user_id, role)
);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  logo_url text,
  website_url text
);

create table public.vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  name text not null,
  image_url text not null,
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.vouchers enable row level security;
grant select on public.vouchers to anon, authenticated;

-- Reproduce the unsafe production/staging policies that existed before the
-- corrective migration. The RLS fix must safely replace both.
create policy "Public read vouchers"
  on public.vouchers for select to anon, authenticated
  using (true);
create policy "Users can view assigned vouchers or unassigned vouchers"
  on public.vouchers for select to authenticated
  using ((select auth.uid()) = user_id or user_id is null);

create table public.voucher_codes (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  code text,
  status text not null default 'available',
  issued_to_user_id uuid references public.users(id) on delete set null,
  issued_user_voucher_id uuid,
  issued_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.user_vouchers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  voucher_code_id uuid references public.voucher_codes(id) on delete restrict,
  redeemed boolean not null default false
);

create table public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  main_prize text not null,
  status text not null default 'active',
  ticket_price numeric not null default 10,
  ticket_count integer not null default 100,
  next_ticket_number integer not null default 1
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  contest_id uuid not null references public.contests(id) on delete restrict,
  number integer
);

create table public.partner_invoices (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  vat_rate numeric(5,2) not null default 21
);

create table public.partner_coin_activations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict
);

-- Key/value settings store (used by the Phase 2 feature flags).
create table public.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Wallet, ledger and prize tables touched by the classic paid ticket flow and
-- by the Phase 2 benefit purchase.
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  balance_coins numeric not null default 0
);

create table public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  amount numeric not null check (amount <> 0),
  balance_after numeric,
  type text not null,
  source text,
  reference_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.bonus_prizes (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  description text,
  title text,
  ticket_position integer,
  status text not null default 'pending',
  amount integer default 0
);

create table public.winners (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete restrict,
  prize_id uuid references public.bonus_prizes(id) on delete set null,
  user_id uuid not null references public.users(id) on delete restrict,
  ticket_id uuid references public.tickets(id) on delete set null,
  type text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_superadmin(
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = check_user_id
      and ur.role = 'superadmin'
  )
$$;

grant select on public.partners, public.vouchers, public.partner_invoices
  to authenticated;

insert into public.partners (id, name)
values (
  '01000000-0000-0000-0000-000000000001',
  'Pre-existing partner'
);

insert into public.vouchers (id, name, image_url)
values (
  '02000000-0000-0000-0000-000000000001',
  'Pre-existing classic voucher',
  'https://example.test/pre-existing-voucher.png'
);

insert into public.contests (id, title, main_prize)
values (
  '03000000-0000-0000-0000-000000000001',
  'Pre-existing contest',
  'Pre-existing prize'
);

insert into public.partner_invoices (
  id, partner_id, period_start, period_end, vat_rate
) values (
  '04000000-0000-0000-0000-000000000001',
  '01000000-0000-0000-0000-000000000001',
  current_date - 1,
  current_date,
  21
);

-- The name is quoted on purpose. The Supabase CLI migration splitter supports
-- SQL-standard "BEGIN ATOMIC" bodies by switching to a special state as soon as
-- the text ends with the word ATOMIC and then scanning for a bare END, so an
-- unquoted identifier ending in _atomic makes it swallow the remainder of the
-- file. Quoting keeps those characters inside a quoted identifier; the name is
-- already lowercase, so nothing changes semantically. With the quotes this
-- definition no longer has to be the last statement in the fixture.
create or replace function public."buy_ticket_atomic"(p_user_id uuid, p_contest_id uuid)
returns jsonb
language plpgsql
as 'begin return jsonb_build_object(''success'', false, ''fixture'', true); end';

-- Oblíbené soutěže v predmigračním, driftnutém stavu: RLS zapnuté, ale ŽÁDNÁ
-- policy (tedy deny-all i pro vlastníka) a `anon` s plnými granty. Přesně tenhle
-- stav měl staging a přesně ten má migrace
-- 20260727170000_user_contest_favorites_own_row_rls.sql opravit.
create table public.user_contest_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contest_id uuid not null references public.contests(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, contest_id)
);

alter table public.user_contest_favorites enable row level security;

grant select, insert, update, delete on public.user_contest_favorites
  to anon, authenticated, service_role;
