-- ============================================================================
-- Voucher codes foundation (Phase 1, staging-only)
-- ============================================================================
-- Additive database foundation for future unique voucher codes.
--
-- Scope:
--   - Create voucher_code_batches for generated/imported code batches.
--   - Create voucher_codes as the inventory of real unique codes.
--   - Add nullable user_vouchers.voucher_code_id link for future purchases.
--
-- Deliberately unchanged:
--   - No buy_voucher_atomic changes.
--   - No wallet, Stripe, contest, ticket, UI, route, Edge Function changes.
--   - No production apply in this phase.
--
-- Security:
--   - RLS enabled on new public tables.
--   - No anon grants.
--   - Admin/superadmin can manage codes.
--   - A user can only SELECT an issued code assigned to their own user id.
--   - Code status values are limited to available/issued/voided. No used state.
--
-- Rollback:
--   ALTER TABLE public.user_vouchers DROP CONSTRAINT IF EXISTS user_vouchers_voucher_code_requires_redeemed;
--   ALTER TABLE public.user_vouchers DROP COLUMN IF EXISTS voucher_code_id;
--   DROP TABLE IF EXISTS public.voucher_codes;
--   DROP TABLE IF EXISTS public.voucher_code_batches;
--   DROP FUNCTION IF EXISTS public.voucher_codes_set_updated_at();
--   DROP FUNCTION IF EXISTS public.voucher_code_batches_set_updated_at();
-- ============================================================================

begin;

-- 1. Batches for imported/generated code inventory.
create table if not exists public.voucher_code_batches (
  id              uuid        primary key default gen_random_uuid(),
  voucher_id      uuid        not null references public.vouchers(id) on delete cascade,
  source          text        not null
                                constraint voucher_code_batches_source_check
                                check (source in ('generated_by_onemil', 'provided_by_partner')),
  label           text,
  total_count     integer     not null default 0 check (total_count >= 0),
  import_filename text,
  notes           text,
  created_by      uuid        references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_voucher_code_batches_voucher_id
  on public.voucher_code_batches(voucher_id);

create index if not exists idx_voucher_code_batches_created_at
  on public.voucher_code_batches(created_at desc);

-- 2. Real unique voucher codes. These are sensitive values.
create table if not exists public.voucher_codes (
  id                     uuid        primary key default gen_random_uuid(),
  voucher_id             uuid        not null references public.vouchers(id) on delete cascade,
  batch_id               uuid        references public.voucher_code_batches(id) on delete set null,
  code                   text        not null check (length(btrim(code)) > 0),
  status                 text        not null default 'available'
                                         constraint voucher_codes_status_check
                                         check (status in ('available', 'issued', 'voided')),
  issued_to_user_id      uuid        references public.users(id),
  issued_user_voucher_id uuid        unique references public.user_vouchers(id),
  issued_at              timestamptz,
  voided_at              timestamptz,
  voided_by              uuid        references auth.users(id) on delete set null,
  void_reason            text,
  created_by             uuid        references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint voucher_codes_status_shape_check check (
    (
      status = 'available'
      and issued_to_user_id is null
      and issued_user_voucher_id is null
      and issued_at is null
      and voided_at is null
    )
    or (
      status = 'issued'
      and issued_to_user_id is not null
      and issued_user_voucher_id is not null
      and issued_at is not null
      and voided_at is null
    )
    or (
      status = 'voided'
      and voided_at is not null
    )
  )
);

-- Case/whitespace-normalized uniqueness prevents accidental duplicate partner codes.
create unique index if not exists idx_voucher_codes_code_normalized_unique
  on public.voucher_codes (lower(btrim(code)));

create index if not exists idx_voucher_codes_voucher_status
  on public.voucher_codes(voucher_id, status);

create index if not exists idx_voucher_codes_batch_id
  on public.voucher_codes(batch_id);

create index if not exists idx_voucher_codes_issued_to_user_id
  on public.voucher_codes(issued_to_user_id)
  where issued_to_user_id is not null;

create index if not exists idx_voucher_codes_issued_user_voucher_id
  on public.voucher_codes(issued_user_voucher_id)
  where issued_user_voucher_id is not null;

-- 3. Future link from purchased user voucher to the issued code.
alter table public.user_vouchers
  add column if not exists voucher_code_id uuid references public.voucher_codes(id);

create unique index if not exists idx_user_vouchers_voucher_code_id_unique
  on public.user_vouchers(voucher_code_id)
  where voucher_code_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_vouchers_voucher_code_requires_redeemed'
      and conrelid = 'public.user_vouchers'::regclass
  ) then
    alter table public.user_vouchers
      add constraint user_vouchers_voucher_code_requires_redeemed
      check (voucher_code_id is null or redeemed = true);
  end if;
end $$;

-- 4. updated_at triggers, local to this foundation.
create or replace function public.voucher_code_batches_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.voucher_code_batches_set_updated_at() from public, anon, authenticated;

create or replace function public.voucher_codes_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function public.voucher_codes_set_updated_at() from public, anon, authenticated;

drop trigger if exists voucher_code_batches_updated_at on public.voucher_code_batches;
create trigger voucher_code_batches_updated_at
  before update on public.voucher_code_batches
  for each row execute function public.voucher_code_batches_set_updated_at();

drop trigger if exists voucher_codes_updated_at on public.voucher_codes;
create trigger voucher_codes_updated_at
  before update on public.voucher_codes
  for each row execute function public.voucher_codes_set_updated_at();

-- 5. Explicit grants for Data API exposure. RLS remains the row-level guard.
revoke all on public.voucher_code_batches from anon;
revoke all on public.voucher_codes from anon;

grant select, insert, update, delete on public.voucher_code_batches to authenticated, service_role;
grant select, insert, update, delete on public.voucher_codes to authenticated, service_role;

-- 6. RLS policies.
alter table public.voucher_code_batches enable row level security;
alter table public.voucher_codes enable row level security;

drop policy if exists voucher_code_batches_admin_all on public.voucher_code_batches;
create policy voucher_code_batches_admin_all
  on public.voucher_code_batches
  for all
  to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists voucher_codes_admin_all on public.voucher_codes;
create policy voucher_codes_admin_all
  on public.voucher_codes
  for all
  to authenticated
  using (public.is_admin() or public.is_superadmin())
  with check (public.is_admin() or public.is_superadmin());

drop policy if exists voucher_codes_user_select_issued_own on public.voucher_codes;
create policy voucher_codes_user_select_issued_own
  on public.voucher_codes
  for select
  to authenticated
  using (
    status = 'issued'
    and issued_to_user_id = (select auth.uid())
  );

-- 7. Schema comments for future implementers/admin tooling.
comment on table public.voucher_code_batches is
  'Batch metadata for OneMil-generated or partner-provided unique voucher codes. Phase 1 foundation only.';

comment on table public.voucher_codes is
  'Sensitive inventory of real unique voucher codes. OneMil tracks issued/voided, not partner-side usage.';

comment on column public.voucher_codes.code is
  'Real partner/OneMil voucher code. Sensitive: never log and never expose publicly.';

comment on column public.voucher_codes.status is
  'Allowed values: available, issued, voided. No used state in Phase 1.';

comment on column public.user_vouchers.voucher_code_id is
  'Future nullable link from a purchased user voucher to the issued unique voucher code.';

commit;
