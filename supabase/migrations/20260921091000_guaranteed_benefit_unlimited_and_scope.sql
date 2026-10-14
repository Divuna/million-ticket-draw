-- Garantované nákupní benefity — admin-only base, část 2/3: neomezený benefit
-- a distribuční rozsah (Všechny / Vybrané soutěže).
--
-- Aditivní. Všechny defaulty reprodukují dnešní chování:
--   is_unlimited = false, distribution_scope = 'single_contest'.
-- Runtime nákupní cesta se v této migraci NEMĚNÍ — purchase_guaranteed_benefit_bundle_atomic
-- ani get_guaranteed_benefit_offer nové sloupce zatím nečtou.

begin;

-- 1) voucher_versions: sdílený statický kód / odkaz bez generování voucher_codes
alter table public.voucher_versions
  add column if not exists shared_code_or_url text;

comment on column public.voucher_versions.shared_code_or_url is
  'Sdílený trvalý kód nebo odkaz pro neomezený benefit (code_source = shared_static). Pro omezené benefity vždy NULL.';

alter table public.voucher_versions
  drop constraint if exists voucher_versions_code_source_check;
alter table public.voucher_versions
  add constraint voucher_versions_code_source_check
  check (code_source = any (array['generated_by_onemil'::text, 'provided_by_partner'::text, 'shared_static'::text]));

alter table public.voucher_versions
  drop constraint if exists voucher_versions_shared_code_shape_check;
alter table public.voucher_versions
  add constraint voucher_versions_shared_code_shape_check
  check (
    (code_source = 'shared_static' and shared_code_or_url is not null and length(btrim(shared_code_or_url)) > 0)
    or (code_source <> 'shared_static' and shared_code_or_url is null)
  );

-- Neomezená verze nepotřebuje počet kódů.
alter table public.voucher_versions
  drop constraint if exists voucher_versions_requested_code_count_check;
alter table public.voucher_versions
  add constraint voucher_versions_requested_code_count_check
  check (
    (code_source = 'shared_static' and requested_code_count >= 0)
    or (code_source <> 'shared_static' and requested_code_count > 0)
  );

-- Schválení neomezené verze nevyžaduje approved_code_count.
alter table public.voucher_versions
  drop constraint if exists voucher_versions_check1;
alter table public.voucher_versions
  add constraint voucher_versions_check1
  check (
    status <> 'approved'
    or (
      approved_at is not null
      and approved_by is not null
      and (
        code_source = 'shared_static'
        or (approved_code_count is not null and approved_code_count <= requested_code_count)
      )
    )
  );

-- 2) voucher_distribution_orders: neomezenost a rozsah distribuce
alter table public.voucher_distribution_orders
  add column if not exists is_unlimited boolean not null default false;

alter table public.voucher_distribution_orders
  add column if not exists distribution_scope text not null default 'single_contest';

comment on column public.voucher_distribution_orders.is_unlimited is
  'True = neomezený garantovaný benefit bez zásoby voucher_codes.';
comment on column public.voucher_distribution_orders.distribution_scope is
  'single_contest (legacy) | all_contests (současné i budoucí) | selected_contests (viz voucher_distribution_contests).';

alter table public.voucher_distribution_orders
  drop constraint if exists voucher_distribution_orders_distribution_scope_check;
alter table public.voucher_distribution_orders
  add constraint voucher_distribution_orders_distribution_scope_check
  check (distribution_scope = any (array['single_contest'::text, 'all_contests'::text, 'selected_contests'::text]));

-- contest_id zůstává povinný pro legacy single_contest, jinak je volitelný.
alter table public.voucher_distribution_orders
  alter column contest_id drop not null;

alter table public.voucher_distribution_orders
  drop constraint if exists voucher_distribution_orders_scope_contest_shape_check;
alter table public.voucher_distribution_orders
  add constraint voucher_distribution_orders_scope_contest_shape_check
  check (distribution_scope <> 'single_contest' or contest_id is not null);

-- Neomezený order nemá zásobu, kterou by šlo vyčerpat.
alter table public.voucher_distribution_orders
  drop constraint if exists voucher_distribution_orders_requested_quantity_check;
alter table public.voucher_distribution_orders
  add constraint voucher_distribution_orders_requested_quantity_check
  check (
    (is_unlimited and requested_quantity >= 0)
    or (not is_unlimited and requested_quantity > 0)
  );

alter table public.voucher_distribution_orders
  drop constraint if exists voucher_distribution_orders_check;
alter table public.voucher_distribution_orders
  add constraint voucher_distribution_orders_check
  check (is_unlimited or issued_quantity <= requested_quantity);

-- 3) Vazební tabulka pro "Vybrané soutěže"
create table if not exists public.voucher_distribution_contests (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.voucher_distribution_orders(id) on delete cascade,
  contest_id  uuid not null references public.contests(id),
  attached_at timestamptz not null default now(),
  attached_by uuid,
  detached_at timestamptz,
  detached_by uuid
);

create unique index if not exists uq_voucher_distribution_contests_active
  on public.voucher_distribution_contests (order_id, contest_id)
  where detached_at is null;

create index if not exists idx_voucher_distribution_contests_contest
  on public.voucher_distribution_contests (contest_id)
  where detached_at is null;

alter table public.voucher_distribution_contests enable row level security;

-- Čtení jen pro superadmina nebo admina s výslovným oprávněním.
-- Zápis výhradně přes SECURITY DEFINER RPC — žádná write policy záměrně.
drop policy if exists voucher_distribution_contests_select on public.voucher_distribution_contests;
create policy voucher_distribution_contests_select
  on public.voucher_distribution_contests
  for select
  to authenticated
  using (
    public.is_superadmin()
    or public.has_admin_permission('guaranteed_benefits.manage')
  );

-- 4) Backfill: existující orders zůstávají single_contest s explicitní vazbou.
insert into public.voucher_distribution_contests (order_id, contest_id)
select o.id, o.contest_id
from public.voucher_distribution_orders o
where o.contest_id is not null
  and not exists (
    select 1 from public.voucher_distribution_contests c
    where c.order_id = o.id
      and c.contest_id = o.contest_id
      and c.detached_at is null
  );

commit;
