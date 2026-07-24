-- Minimal pre-Phase-1 schema fixture for isolated migration testing.
-- It models only the existing objects touched by the additive migration.

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade
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
  name text not null,
  image_url text not null,
  is_public boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.voucher_codes (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  status text not null default 'available',
  issued_to_user_id uuid references public.users(id) on delete set null,
  issued_user_voucher_id uuid
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
  main_prize text not null
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete restrict,
  contest_id uuid not null references public.contests(id) on delete restrict
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

create or replace function public.is_superadmin(p_user_id uuid)
returns boolean
language sql
stable
as $$
  select false
$$;

create or replace function public.buy_ticket_atomic(p_user_id uuid, p_contest_id uuid)
returns jsonb
language sql
as $$
  select jsonb_build_object('success', false, 'fixture', true)
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
