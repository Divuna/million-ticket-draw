-- ============================================================================
-- Garantovaný nákupní benefit — Phase 1 data foundation
-- ============================================================================
-- Additive only. This migration does not activate a purchase flow, modify
-- buy_ticket_atomic, or connect the new invoice items to invoice automation.
--
-- VAT convention in the new objects is deliberately explicit and isolated:
-- vat_rate_percent = 21 means 21 %, and calculations divide by 100.
-- Existing partner_invoices.vat_rate remains untouched.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.vouchers') is null
     or to_regclass('public.voucher_codes') is null
     or to_regclass('public.user_vouchers') is null
     or to_regclass('public.partners') is null
     or to_regclass('public.contests') is null
     or to_regclass('public.tickets') is null
     or to_regclass('public.partner_invoices') is null then
    raise exception 'Missing garantovaný nákupní benefit Phase 1 dependency';
  end if;
  if to_regprocedure('public.is_superadmin(uuid)') is null then
    raise exception 'Missing dependency public.is_superadmin(uuid)';
  end if;
end $$;

-- Existing rows remain classic/legacy and keep their current behavior.
alter table public.vouchers
  add column if not exists partner_id uuid references public.partners(id) on delete restrict,
  add column if not exists workflow_status text not null default 'legacy',
  add column if not exists distribution_mode text not null default 'classic',
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists decision_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vouchers'::regclass
      and conname = 'vouchers_workflow_status_check'
  ) then
    alter table public.vouchers add constraint vouchers_workflow_status_check
      check (workflow_status in (
        'legacy', 'draft', 'submitted', 'approved', 'rejected', 'suspended', 'ended'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vouchers'::regclass
      and conname = 'vouchers_distribution_mode_check'
  ) then
    alter table public.vouchers add constraint vouchers_distribution_mode_check
      check (distribution_mode in ('classic', 'guaranteed_purchase_benefit'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vouchers'::regclass
      and conname = 'vouchers_guaranteed_benefit_shape_check'
  ) then
    alter table public.vouchers add constraint vouchers_guaranteed_benefit_shape_check
      check (
        distribution_mode = 'classic'
        or (partner_id is not null and is_public = false and workflow_status <> 'legacy')
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vouchers'::regclass
      and conname = 'vouchers_approval_shape_check'
  ) then
    alter table public.vouchers add constraint vouchers_approval_shape_check
      check (
        (workflow_status <> 'approved' or (approved_at is not null and approved_by is not null))
        and (workflow_status <> 'rejected' or rejected_at is not null)
      );
  end if;
end $$;

create index if not exists idx_vouchers_partner_workflow
  on public.vouchers(partner_id, workflow_status)
  where partner_id is not null;

create table public.voucher_versions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  name text not null check (length(btrim(name)) > 0),
  short_description text,
  usage_description text,
  terms_text text not null check (length(btrim(terms_text)) > 0),
  how_to_use_text text not null check (length(btrim(how_to_use_text)) > 0),
  image_url text,
  banner_url text,
  benefit_kind text not null
    check (benefit_kind in ('fixed_amount', 'percentage', 'product', 'other')),
  benefit_value numeric(14,2) check (benefit_value is null or benefit_value >= 0),
  currency text not null default 'CZK' check (currency ~ '^[A-Z]{3}$'),
  minimum_purchase_amount numeric(14,2)
    check (minimum_purchase_amount is null or minimum_purchase_amount >= 0),
  valid_from timestamptz,
  valid_until timestamptz,
  code_source text not null
    check (code_source in ('generated_by_onemil', 'provided_by_partner')),
  requested_code_count integer not null check (requested_code_count > 0),
  approved_code_count integer check (approved_code_count is null or approved_code_count > 0),
  created_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  submitted_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejected_at timestamptz,
  rejected_by uuid references auth.users(id) on delete set null,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (voucher_id, version_number),
  check (valid_until is null or valid_from is null or valid_until > valid_from),
  check (
    status <> 'approved'
    or (
      approved_at is not null
      and approved_by is not null
      and approved_code_count is not null
      and approved_code_count <= requested_code_count
    )
  ),
  check (status <> 'rejected' or rejected_at is not null)
);

create index idx_voucher_versions_voucher_status
  on public.voucher_versions(voucher_id, status);

alter table public.vouchers
  add column if not exists current_approved_version_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vouchers'::regclass
      and conname = 'vouchers_current_approved_version_id_fkey'
  ) then
    alter table public.vouchers
      add constraint vouchers_current_approved_version_id_fkey
      foreign key (current_approved_version_id)
      references public.voucher_versions(id) on delete restrict;
  end if;
end $$;

create index if not exists idx_vouchers_current_approved_version
  on public.vouchers(current_approved_version_id)
  where current_approved_version_id is not null;

create table public.voucher_distribution_price_rules (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'partner')),
  partner_id uuid references public.partners(id) on delete restrict,
  unit_price_ex_vat numeric(14,2) not null check (unit_price_ex_vat >= 0),
  vat_rate_percent numeric(5,2) not null default 21
    check (vat_rate_percent >= 0 and vat_rate_percent <= 100),
  currency text not null default 'CZK' check (currency ~ '^[A-Z]{3}$'),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (scope = 'global' and partner_id is null)
    or (scope = 'partner' and partner_id is not null)
  ),
  check (valid_until is null or valid_until > valid_from)
);

create unique index idx_voucher_price_rules_one_open_global
  on public.voucher_distribution_price_rules(scope)
  where scope = 'global' and active and valid_until is null;
create unique index idx_voucher_price_rules_one_open_partner
  on public.voucher_distribution_price_rules(partner_id)
  where scope = 'partner' and active and valid_until is null;
create index idx_voucher_price_rules_effective
  on public.voucher_distribution_price_rules(partner_id, active, valid_from, valid_until);

create table public.voucher_distribution_orders (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  voucher_version_id uuid not null references public.voucher_versions(id) on delete restrict,
  contest_id uuid not null references public.contests(id) on delete restrict,
  requested_quantity integer not null check (requested_quantity > 0),
  issued_quantity integer not null default 0 check (issued_quantity >= 0),
  billable_issued_quantity integer not null default 0 check (billable_issued_quantity >= 0),
  status text not null default 'requested'
    check (status in ('requested', 'approved', 'rejected', 'suspended', 'ended', 'cancelled')),
  price_rule_id uuid references public.voucher_distribution_price_rules(id) on delete restrict,
  unit_price_ex_vat_snapshot numeric(14,2)
    check (unit_price_ex_vat_snapshot is null or unit_price_ex_vat_snapshot >= 0),
  vat_rate_percent_snapshot numeric(5,2)
    check (
      vat_rate_percent_snapshot is null
      or (vat_rate_percent_snapshot >= 0 and vat_rate_percent_snapshot <= 100)
    ),
  currency_snapshot text check (currency_snapshot is null or currency_snapshot ~ '^[A-Z]{3}$'),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, voucher_id, voucher_version_id, contest_id),
  check (issued_quantity <= requested_quantity),
  check (billable_issued_quantity <= issued_quantity),
  check (
    status not in ('approved', 'suspended', 'ended')
    or (
      price_rule_id is not null
      and unit_price_ex_vat_snapshot is not null
      and vat_rate_percent_snapshot is not null
      and currency_snapshot is not null
      and decided_by is not null
      and decided_at is not null
    )
  )
);

create index idx_voucher_distribution_orders_partner_status
  on public.voucher_distribution_orders(partner_id, status);
create index idx_voucher_distribution_orders_contest_status
  on public.voucher_distribution_orders(contest_id, status);
create index idx_voucher_distribution_orders_voucher
  on public.voucher_distribution_orders(voucher_id, voucher_version_id);
create index idx_voucher_distribution_orders_version
  on public.voucher_distribution_orders(voucher_version_id);
create index idx_voucher_distribution_orders_price_rule
  on public.voucher_distribution_orders(price_rule_id)
  where price_rule_id is not null;

alter table public.voucher_codes
  add column if not exists distribution_order_id uuid
  references public.voucher_distribution_orders(id) on delete restrict;

create index if not exists idx_voucher_codes_distribution_order_status
  on public.voucher_codes(distribution_order_id, status)
  where distribution_order_id is not null;

alter table public.user_vouchers
  add column if not exists acquisition_source text not null default 'legacy';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_vouchers'::regclass
      and conname = 'user_vouchers_acquisition_source_check'
  ) then
    alter table public.user_vouchers add constraint user_vouchers_acquisition_source_check
      check (acquisition_source in (
        'legacy', 'favorite', 'direct_purchase', 'guaranteed_purchase_benefit'
      ));
  end if;
end $$;

create table public.voucher_issuances (
  id uuid primary key default gen_random_uuid(),
  distribution_order_id uuid not null
    references public.voucher_distribution_orders(id) on delete restrict,
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  voucher_version_id uuid not null references public.voucher_versions(id) on delete restrict,
  voucher_code_id uuid not null unique references public.voucher_codes(id) on delete restrict,
  user_id uuid not null references public.users(id) on delete restrict,
  user_voucher_id uuid not null unique references public.user_vouchers(id) on delete restrict,
  ticket_id uuid not null unique references public.tickets(id) on delete restrict,
  status text not null default 'issued'
    check (status in ('issued', 'revoked', 'replaced')),
  billable boolean not null,
  billing_reason text not null
    check (billing_reason in ('first_customer_issuance', 'repeat_customer_issuance')),
  unit_price_ex_vat_snapshot numeric(14,2) not null check (unit_price_ex_vat_snapshot >= 0),
  vat_rate_percent_snapshot numeric(5,2) not null default 21
    check (vat_rate_percent_snapshot >= 0 and vat_rate_percent_snapshot <= 100),
  currency_snapshot text not null default 'CZK' check (currency_snapshot ~ '^[A-Z]{3}$'),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (
    (billable and billing_reason = 'first_customer_issuance')
    or (not billable and billing_reason = 'repeat_customer_issuance')
  )
);

-- The first issuance of a benefit to a customer is the only billable one.
create unique index idx_voucher_issuances_one_billable_per_customer_benefit
  on public.voucher_issuances(user_id, voucher_id)
  where billable;
create index idx_voucher_issuances_order
  on public.voucher_issuances(distribution_order_id, issued_at);
create index idx_voucher_issuances_partner_reporting
  on public.voucher_issuances(voucher_id, issued_at);
create index idx_voucher_issuances_version
  on public.voucher_issuances(voucher_version_id);
create index idx_voucher_issuances_user
  on public.voucher_issuances(user_id, issued_at);

create table public.contest_bundle_purchases (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null,
  user_id uuid not null references public.users(id) on delete restrict,
  contest_id uuid not null references public.contests(id) on delete restrict,
  ticket_id uuid unique references public.tickets(id) on delete restrict,
  voucher_issuance_id uuid unique references public.voucher_issuances(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'failed', 'reversed')),
  charged_miocoins numeric(14,2) not null check (charged_miocoins >= 0),
  failure_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key),
  check (
    status <> 'completed'
    or (ticket_id is not null and voucher_issuance_id is not null and completed_at is not null)
  )
);

create index idx_contest_bundle_purchases_user_created
  on public.contest_bundle_purchases(user_id, created_at desc);
create index idx_contest_bundle_purchases_contest
  on public.contest_bundle_purchases(contest_id, created_at desc);

create table public.partner_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.partner_invoices(id) on delete restrict,
  item_type text not null
    check (item_type in ('coin_activation', 'guaranteed_purchase_benefit')),
  description_snapshot text not null check (length(btrim(description_snapshot)) > 0),
  quantity numeric(14,2) not null check (quantity > 0),
  unit_price_ex_vat numeric(14,2) not null check (unit_price_ex_vat >= 0),
  amount_ex_vat numeric(14,2) not null check (amount_ex_vat >= 0),
  vat_rate_percent numeric(5,2) not null default 21
    check (vat_rate_percent >= 0 and vat_rate_percent <= 100),
  vat_amount numeric(14,2) not null check (vat_amount >= 0),
  amount_inc_vat numeric(14,2) not null check (amount_inc_vat >= 0),
  currency text not null default 'CZK' check (currency ~ '^[A-Z]{3}$'),
  voucher_id uuid references public.vouchers(id) on delete restrict,
  contest_id uuid references public.contests(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (amount_ex_vat = round(quantity * unit_price_ex_vat, 2)),
  check (vat_amount = round(amount_ex_vat * (vat_rate_percent / 100), 2)),
  check (amount_inc_vat = amount_ex_vat + vat_amount)
);

create index idx_partner_invoice_items_invoice
  on public.partner_invoice_items(invoice_id);
create index idx_partner_invoice_items_voucher
  on public.partner_invoice_items(voucher_id)
  where voucher_id is not null;
create index idx_partner_invoice_items_contest
  on public.partner_invoice_items(contest_id)
  where contest_id is not null;

create table public.partner_invoice_item_sources (
  id uuid primary key default gen_random_uuid(),
  partner_invoice_item_id uuid not null
    references public.partner_invoice_items(id) on delete restrict,
  source_type text not null check (source_type in ('coin_activation', 'voucher_issuance')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create index idx_partner_invoice_item_sources_item
  on public.partner_invoice_item_sources(partner_invoice_item_id);

create table public.voucher_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in (
    'voucher', 'voucher_version', 'distribution_price_rule',
    'distribution_order', 'voucher_issuance', 'partner_invoice_item'
  )),
  entity_id uuid not null,
  event_type text not null check (length(btrim(event_type)) > 0),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  reason text,
  before_data jsonb not null default '{}'::jsonb,
  after_data jsonb not null default '{}'::jsonb,
  correlation_id uuid,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(before_data) = 'object'),
  check (jsonb_typeof(after_data) = 'object')
);

create index idx_voucher_audit_events_entity
  on public.voucher_audit_events(entity_type, entity_id, created_at desc);
create index idx_voucher_audit_events_actor
  on public.voucher_audit_events(actor_user_id, created_at desc)
  where actor_user_id is not null;

-- Reject raw-code-shaped keys at any nesting level. IDs such as
-- voucher_code_id are intentionally allowed; the actual code value is not.
create or replace function public.voucher_audit_has_raw_code_key(payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  item jsonb;
  key_name text;
begin
  if payload is null then
    return false;
  end if;
  if jsonb_typeof(payload) = 'object' then
    for key_name, item in select key, value from jsonb_each(payload)
    loop
      if lower(key_name) in ('code', 'raw_code', 'voucher_code', 'full_code') then
        return true;
      end if;
      if public.voucher_audit_has_raw_code_key(item) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for item in select value from jsonb_array_elements(payload)
    loop
      if public.voucher_audit_has_raw_code_key(item) then
        return true;
      end if;
    end loop;
  end if;
  return false;
end;
$$;

revoke all on function public.voucher_audit_has_raw_code_key(jsonb)
  from public, anon, authenticated;

alter table public.voucher_audit_events
  add constraint voucher_audit_events_no_raw_codes_check
  check (
    not public.voucher_audit_has_raw_code_key(before_data)
    and not public.voucher_audit_has_raw_code_key(after_data)
  );

create or replace function public.guard_voucher_audit_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Voucher audit events are append-only';
end;
$$;

revoke all on function public.guard_voucher_audit_append_only()
  from public, anon, authenticated;

create trigger voucher_audit_events_append_only_guard
  before update or delete on public.voucher_audit_events
  for each row execute function public.guard_voucher_audit_append_only();

-- Immutable approved terms and historical price snapshots.
create or replace function public.guard_guaranteed_benefit_history()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'voucher_versions' then
    if tg_op = 'DELETE' and old.status = 'approved' then
      raise exception 'Approved voucher versions cannot be deleted';
    elsif tg_op = 'UPDATE' and old.status = 'approved' and new is distinct from old then
      raise exception 'Approved voucher versions are immutable';
    end if;
  elsif tg_table_name = 'voucher_distribution_price_rules' then
    if tg_op = 'DELETE' and exists (
      select 1 from public.voucher_distribution_orders
      where price_rule_id = old.id
    ) then
      raise exception 'A price rule used by an order is immutable';
    end if;
    if tg_op = 'UPDATE'
       and exists (
         select 1 from public.voucher_distribution_orders
         where price_rule_id = old.id
       )
       and (
         new.scope,
         new.partner_id,
         new.unit_price_ex_vat,
         new.vat_rate_percent,
         new.currency,
         new.valid_from,
         new.created_by,
         new.created_at
       ) is distinct from (
         old.scope,
         old.partner_id,
         old.unit_price_ex_vat,
         old.vat_rate_percent,
         old.currency,
         old.valid_from,
         old.created_by,
         old.created_at
       ) then
      raise exception 'Used price values are immutable';
    end if;
  elsif tg_table_name = 'voucher_distribution_orders' then
    if tg_op = 'DELETE' and (
      old.issued_quantity > 0
      or exists (
        select 1 from public.voucher_issuances
        where distribution_order_id = old.id
      )
    ) then
      raise exception 'Used distribution orders cannot be deleted';
    end if;
    if tg_op = 'UPDATE'
       and old.status in ('approved', 'suspended', 'ended')
       and (
         new.partner_id,
         new.voucher_id,
         new.voucher_version_id,
         new.contest_id,
         new.requested_quantity,
         new.price_rule_id,
         new.unit_price_ex_vat_snapshot,
         new.vat_rate_percent_snapshot,
         new.currency_snapshot
       ) is distinct from (
         old.partner_id,
         old.voucher_id,
         old.voucher_version_id,
         old.contest_id,
         old.requested_quantity,
         old.price_rule_id,
         old.unit_price_ex_vat_snapshot,
         old.vat_rate_percent_snapshot,
         old.currency_snapshot
       ) then
      raise exception 'Approved order terms and price snapshots are immutable';
    end if;
  elsif tg_table_name = 'voucher_issuances' then
    if tg_op = 'DELETE' then
      raise exception 'Voucher issuances cannot be deleted';
    end if;
    if tg_op = 'UPDATE' and (
      new.distribution_order_id,
      new.voucher_id,
      new.voucher_version_id,
      new.voucher_code_id,
      new.user_id,
      new.user_voucher_id,
      new.ticket_id,
      new.billable,
      new.billing_reason,
      new.unit_price_ex_vat_snapshot,
      new.vat_rate_percent_snapshot,
      new.currency_snapshot,
      new.issued_at
    ) is distinct from (
      old.distribution_order_id,
      old.voucher_id,
      old.voucher_version_id,
      old.voucher_code_id,
      old.user_id,
      old.user_voucher_id,
      old.ticket_id,
      old.billable,
      old.billing_reason,
      old.unit_price_ex_vat_snapshot,
      old.vat_rate_percent_snapshot,
      old.currency_snapshot,
      old.issued_at
    ) then
      raise exception 'Voucher issuance identity and billing snapshot are immutable';
    end if;
  elsif tg_table_name = 'partner_invoice_items' then
    if tg_op = 'DELETE' then
      raise exception 'Partner invoice items cannot be deleted';
    end if;
    if tg_op = 'UPDATE' and new is distinct from old then
      raise exception 'Partner invoice item snapshots are immutable';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_guaranteed_benefit_history() from public, anon, authenticated;

create trigger voucher_versions_history_guard
  before update or delete on public.voucher_versions
  for each row execute function public.guard_guaranteed_benefit_history();
create trigger voucher_price_rules_history_guard
  before update or delete on public.voucher_distribution_price_rules
  for each row execute function public.guard_guaranteed_benefit_history();
create trigger voucher_distribution_orders_history_guard
  before update or delete on public.voucher_distribution_orders
  for each row execute function public.guard_guaranteed_benefit_history();
create trigger voucher_issuances_history_guard
  before update or delete on public.voucher_issuances
  for each row execute function public.guard_guaranteed_benefit_history();
create trigger partner_invoice_items_history_guard
  before update or delete on public.partner_invoice_items
  for each row execute function public.guard_guaranteed_benefit_history();

create or replace function public.validate_guaranteed_benefit_links()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_partner_id uuid;
  v_voucher_id uuid;
  v_version_status text;
  v_order record;
  v_ticket record;
  v_user_voucher record;
begin
  if tg_table_name = 'vouchers' then
    if new.current_approved_version_id is not null then
      select vv.voucher_id, vv.status
        into v_voucher_id, v_version_status
      from public.voucher_versions vv
      where vv.id = new.current_approved_version_id;
      if v_voucher_id is distinct from new.id or v_version_status <> 'approved' then
        raise exception 'Current approved version must be approved and belong to the voucher';
      end if;
    end if;
  elsif tg_table_name = 'voucher_distribution_orders' then
    select v.partner_id into v_partner_id
    from public.vouchers v where v.id = new.voucher_id;
    select vv.voucher_id, vv.status into v_voucher_id, v_version_status
    from public.voucher_versions vv where vv.id = new.voucher_version_id;
    if v_partner_id is distinct from new.partner_id
       or v_voucher_id is distinct from new.voucher_id then
      raise exception 'Order partner, voucher and version do not match';
    end if;
    if new.status in ('approved', 'suspended', 'ended')
       and v_version_status <> 'approved' then
      raise exception 'Only an approved voucher version can be distributed';
    end if;
  elsif tg_table_name = 'voucher_issuances' then
    select * into v_order
    from public.voucher_distribution_orders
    where id = new.distribution_order_id;
    select user_id, contest_id into v_ticket
    from public.tickets where id = new.ticket_id;
    select user_id, voucher_id, voucher_code_id, acquisition_source
      into v_user_voucher
    from public.user_vouchers where id = new.user_voucher_id;
    if v_order.status <> 'approved'
       or v_order.voucher_id <> new.voucher_id
       or v_order.voucher_version_id <> new.voucher_version_id
       or v_order.contest_id <> v_ticket.contest_id
       or v_ticket.user_id <> new.user_id
       or v_user_voucher.user_id <> new.user_id
       or v_user_voucher.voucher_id <> new.voucher_id
       or v_user_voucher.voucher_code_id <> new.voucher_code_id
       or v_user_voucher.acquisition_source <> 'guaranteed_purchase_benefit'
       or v_order.unit_price_ex_vat_snapshot <> new.unit_price_ex_vat_snapshot
       or v_order.vat_rate_percent_snapshot <> new.vat_rate_percent_snapshot
       or v_order.currency_snapshot <> new.currency_snapshot then
      raise exception 'Issuance links or historical price snapshot do not match';
    end if;
    if not exists (
      select 1 from public.voucher_codes vc
      where vc.id = new.voucher_code_id
        and vc.voucher_id = new.voucher_id
        and vc.distribution_order_id = new.distribution_order_id
        and vc.status = 'issued'
        and vc.issued_to_user_id = new.user_id
        and vc.issued_user_voucher_id = new.user_voucher_id
    ) then
      raise exception 'Issued voucher code does not match the issuance';
    end if;
    if exists (
      select 1
      from public.voucher_issuances vi
      where vi.user_id = new.user_id
        and vi.voucher_id = new.voucher_id
        and vi.id <> new.id
    ) then
      if new.billable or new.billing_reason <> 'repeat_customer_issuance' then
        raise exception 'A repeated customer benefit issuance must not be billable';
      end if;
    elsif not new.billable or new.billing_reason <> 'first_customer_issuance' then
      raise exception 'The first customer benefit issuance must be billable';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_guaranteed_benefit_links() from public, anon, authenticated;

create trigger vouchers_approved_version_link_guard
  before insert or update on public.vouchers
  for each row execute function public.validate_guaranteed_benefit_links();
create trigger voucher_distribution_orders_link_guard
  before insert or update on public.voucher_distribution_orders
  for each row execute function public.validate_guaranteed_benefit_links();
create trigger voucher_issuances_link_guard
  before insert or update on public.voucher_issuances
  for each row execute function public.validate_guaranteed_benefit_links();

create or replace function public.guard_voucher_delete_and_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_is_service boolean :=
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.voucher_versions where voucher_id = old.id)
       or exists (select 1 from public.voucher_distribution_orders where voucher_id = old.id)
       or exists (select 1 from public.voucher_issuances where voucher_id = old.id)
       or exists (select 1 from public.user_vouchers where voucher_id = old.id and redeemed) then
      raise exception 'Used or versioned vouchers cannot be deleted';
    end if;
    return old;
  end if;

  if (
    new.workflow_status is distinct from old.workflow_status
    and new.workflow_status in ('approved', 'rejected', 'suspended', 'ended')
  ) or new.current_approved_version_id is distinct from old.current_approved_version_id
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.rejected_at is distinct from old.rejected_at
     or new.rejected_by is distinct from old.rejected_by then
    if not v_is_service and not public.is_superadmin(auth.uid()) then
      raise exception 'Only a superadmin can review, suspend or end a voucher';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_voucher_delete_and_review() from public, anon, authenticated;

create trigger vouchers_delete_and_review_guard
  before update or delete on public.vouchers
  for each row execute function public.guard_voucher_delete_and_review();

create or replace function public.audit_guaranteed_benefit_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_new_distribution_mode text := 'classic';
  v_old_distribution_mode text := 'classic';
begin
  -- OLD/NEW are table-shaped records. Never dereference a vouchers-only field
  -- while this shared trigger is running for another audited table.
  if tg_table_name = 'vouchers' then
    if tg_op <> 'DELETE' then
      v_new_distribution_mode := coalesce(new.distribution_mode, 'classic');
    end if;
    if tg_op <> 'INSERT' then
      v_old_distribution_mode := coalesce(old.distribution_mode, 'classic');
    end if;
    if v_new_distribution_mode <> 'guaranteed_purchase_benefit'
       and v_old_distribution_mode <> 'guaranteed_purchase_benefit' then
      return coalesce(new, old);
    end if;
  end if;

  v_entity_type := case tg_table_name
    when 'vouchers' then 'voucher'
    when 'voucher_versions' then 'voucher_version'
    when 'voucher_distribution_price_rules' then 'distribution_price_rule'
    when 'voucher_distribution_orders' then 'distribution_order'
    when 'voucher_issuances' then 'voucher_issuance'
    when 'partner_invoice_items' then 'partner_invoice_item'
  end;
  v_entity_id := case when tg_op = 'DELETE' then old.id else new.id end;

  insert into public.voucher_audit_events (
    entity_type, entity_id, event_type, actor_user_id, actor_role,
    before_data, after_data
  ) values (
    v_entity_type,
    v_entity_id,
    lower(tg_op),
    auth.uid(),
    current_setting('request.jwt.claim.role', true),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else '{}'::jsonb end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else '{}'::jsonb end
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.audit_guaranteed_benefit_change() from public, anon, authenticated;

create trigger vouchers_guaranteed_benefit_audit
  after insert or update or delete on public.vouchers
  for each row execute function public.audit_guaranteed_benefit_change();
create trigger voucher_versions_audit
  after insert or update or delete on public.voucher_versions
  for each row execute function public.audit_guaranteed_benefit_change();
create trigger voucher_price_rules_audit
  after insert or update or delete on public.voucher_distribution_price_rules
  for each row execute function public.audit_guaranteed_benefit_change();
create trigger voucher_distribution_orders_audit
  after insert or update or delete on public.voucher_distribution_orders
  for each row execute function public.audit_guaranteed_benefit_change();
create trigger voucher_issuances_audit
  after insert or update or delete on public.voucher_issuances
  for each row execute function public.audit_guaranteed_benefit_change();
create trigger partner_invoice_items_audit
  after insert or update or delete on public.partner_invoice_items
  for each row execute function public.audit_guaranteed_benefit_change();

create or replace function public.guard_partner_invoice_item_source()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_invoice_partner_id uuid;
  v_item_type text;
  v_source_partner_id uuid;
  v_billable boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Invoice item source links cannot be deleted';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Invoice item source links are immutable';
  end if;

  select pi.partner_id, pii.item_type
    into v_invoice_partner_id, v_item_type
  from public.partner_invoice_items pii
  join public.partner_invoices pi on pi.id = pii.invoice_id
  where pii.id = new.partner_invoice_item_id;

  if new.source_type = 'voucher_issuance' then
    select vdo.partner_id, vi.billable
      into v_source_partner_id, v_billable
    from public.voucher_issuances vi
    join public.voucher_distribution_orders vdo
      on vdo.id = vi.distribution_order_id
    where vi.id = new.source_id;
    if v_item_type <> 'guaranteed_purchase_benefit'
       or not coalesce(v_billable, false)
       or v_source_partner_id is distinct from v_invoice_partner_id then
      raise exception 'Voucher issuance source does not match the invoice item';
    end if;
  else
    select pca.partner_id into v_source_partner_id
    from public.partner_coin_activations pca
    where pca.id = new.source_id;
    if v_item_type <> 'coin_activation'
       or v_source_partner_id is distinct from v_invoice_partner_id then
      raise exception 'Coin activation source does not match the invoice item';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_partner_invoice_item_source()
  from public, anon, authenticated;

create trigger partner_invoice_item_sources_guard
  before insert or update or delete on public.partner_invoice_item_sources
  for each row execute function public.guard_partner_invoice_item_source();

-- Approval/lifecycle writes are available only through guarded superadmin RPCs.
-- No authenticated role receives direct INSERT/UPDATE/DELETE on these tables.
create or replace function public.superadmin_review_guaranteed_benefit_version(
  p_version_id uuid,
  p_decision text,
  p_approved_code_count integer default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_version public.voucher_versions%rowtype;
begin
  if v_caller is null or not public.is_superadmin(v_caller) then
    raise exception 'Only a superadmin can review a voucher version'
      using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_version
  from public.voucher_versions
  where id = p_version_id
  for update;
  if not found then
    raise exception 'Voucher version not found';
  end if;
  if v_version.status <> 'submitted' then
    raise exception 'Only a submitted voucher version can be reviewed';
  end if;

  if p_decision = 'approved' then
    if p_approved_code_count is null
       or p_approved_code_count <= 0
       or p_approved_code_count > v_version.requested_code_count then
      raise exception 'Approved code count must be between 1 and the requested count';
    end if;
    update public.voucher_versions
    set status = 'approved',
        approved_code_count = p_approved_code_count,
        approved_at = now(),
        approved_by = v_caller,
        rejected_at = null,
        rejected_by = null,
        decision_reason = nullif(btrim(p_reason), ''),
        updated_at = now()
    where id = p_version_id;

    update public.vouchers
    set workflow_status = 'approved',
        current_approved_version_id = p_version_id,
        approved_at = now(),
        approved_by = v_caller,
        rejected_at = null,
        rejected_by = null,
        decision_reason = nullif(btrim(p_reason), ''),
        updated_at = now()
    where id = v_version.voucher_id;
  else
    update public.voucher_versions
    set status = 'rejected',
        rejected_at = now(),
        rejected_by = v_caller,
        decision_reason = nullif(btrim(p_reason), ''),
        updated_at = now()
    where id = p_version_id;

    update public.vouchers
    set workflow_status = 'rejected',
        rejected_at = now(),
        rejected_by = v_caller,
        decision_reason = nullif(btrim(p_reason), ''),
        updated_at = now()
    where id = v_version.voucher_id;
  end if;
end;
$$;

create or replace function public.superadmin_set_voucher_distribution_price(
  p_partner_id uuid,
  p_unit_price_ex_vat numeric,
  p_vat_rate_percent numeric default 21,
  p_currency text default 'CZK'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_rule_id uuid;
  v_scope text := case when p_partner_id is null then 'global' else 'partner' end;
begin
  if v_caller is null or not public.is_superadmin(v_caller) then
    raise exception 'Only a superadmin can set a distribution price'
      using errcode = '42501';
  end if;
  if p_unit_price_ex_vat is null or p_unit_price_ex_vat < 0 then
    raise exception 'Price excluding VAT is required and cannot be negative';
  end if;
  if p_vat_rate_percent is null
     or p_vat_rate_percent < 0
     or p_vat_rate_percent > 100 then
    raise exception 'VAT rate percent must be between 0 and 100';
  end if;
  if p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter ISO code';
  end if;
  if p_partner_id is not null
     and not exists (select 1 from public.partners where id = p_partner_id) then
    raise exception 'Partner not found';
  end if;

  update public.voucher_distribution_price_rules
  set active = false,
      valid_until = now(),
      updated_at = now()
  where scope = v_scope
    and partner_id is not distinct from p_partner_id
    and active
    and valid_until is null;

  insert into public.voucher_distribution_price_rules (
    scope, partner_id, unit_price_ex_vat, vat_rate_percent,
    currency, created_by
  ) values (
    v_scope, p_partner_id, p_unit_price_ex_vat, p_vat_rate_percent,
    upper(p_currency), v_caller
  )
  returning id into v_rule_id;

  return v_rule_id;
end;
$$;

create or replace function public.superadmin_set_guaranteed_benefit_status(
  p_voucher_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_current_status text;
begin
  if v_caller is null or not public.is_superadmin(v_caller) then
    raise exception 'Only a superadmin can change the voucher lifecycle'
      using errcode = '42501';
  end if;
  if p_status not in ('suspended', 'ended') then
    raise exception 'Lifecycle status must be suspended or ended';
  end if;

  select workflow_status into v_current_status
  from public.vouchers
  where id = p_voucher_id
    and distribution_mode = 'guaranteed_purchase_benefit'
  for update;
  if not found then
    raise exception 'Garantovaný nákupní benefit not found';
  end if;
  if (p_status = 'suspended' and v_current_status <> 'approved')
     or (p_status = 'ended' and v_current_status not in ('approved', 'suspended')) then
    raise exception 'Invalid garantovaný nákupní benefit lifecycle transition';
  end if;

  update public.vouchers
  set workflow_status = p_status,
      decision_reason = nullif(btrim(p_reason), ''),
      updated_at = now()
  where id = p_voucher_id;
end;
$$;

create or replace function public.superadmin_review_voucher_distribution_order(
  p_order_id uuid,
  p_status text,
  p_price_rule_id uuid default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_order public.voucher_distribution_orders%rowtype;
  v_rule public.voucher_distribution_price_rules%rowtype;
begin
  if v_caller is null or not public.is_superadmin(v_caller) then
    raise exception 'Only a superadmin can review or change an order'
      using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'suspended', 'ended') then
    raise exception 'Unsupported order status';
  end if;

  select * into v_order
  from public.voucher_distribution_orders
  where id = p_order_id
  for update;
  if not found then
    raise exception 'Distribution order not found';
  end if;

  if p_status in ('approved', 'rejected') and v_order.status <> 'requested' then
    raise exception 'Only a requested order can be approved or rejected';
  elsif p_status = 'suspended' and v_order.status <> 'approved' then
    raise exception 'Only an approved order can be suspended';
  elsif p_status = 'ended' and v_order.status not in ('approved', 'suspended') then
    raise exception 'Only an approved or suspended order can be ended';
  end if;

  if p_status = 'approved' then
    if p_price_rule_id is null then
      raise exception 'An explicit price rule is required, including for a 0 CZK price';
    end if;
    select * into v_rule
    from public.voucher_distribution_price_rules
    where id = p_price_rule_id
      and active
      and valid_from <= now()
      and (valid_until is null or valid_until > now())
    for share;
    if not found then
      raise exception 'Active price rule not found';
    end if;
    if v_rule.scope = 'partner' and v_rule.partner_id <> v_order.partner_id then
      raise exception 'Partner price rule does not belong to the order partner';
    end if;
    if v_rule.scope = 'global' and exists (
      select 1
      from public.voucher_distribution_price_rules partner_rule
      where partner_rule.scope = 'partner'
        and partner_rule.partner_id = v_order.partner_id
        and partner_rule.active
        and partner_rule.valid_from <= now()
        and (partner_rule.valid_until is null or partner_rule.valid_until > now())
    ) then
      raise exception 'An active individual partner price must take precedence';
    end if;

    update public.voucher_distribution_orders
    set status = 'approved',
        price_rule_id = v_rule.id,
        unit_price_ex_vat_snapshot = v_rule.unit_price_ex_vat,
        vat_rate_percent_snapshot = v_rule.vat_rate_percent,
        currency_snapshot = v_rule.currency,
        decided_by = v_caller,
        decided_at = now(),
        decision_reason = nullif(btrim(p_reason), ''),
        updated_at = now()
    where id = p_order_id;
  else
    update public.voucher_distribution_orders
    set status = p_status,
        decided_by = v_caller,
        decided_at = now(),
        decision_reason = nullif(btrim(p_reason), ''),
        updated_at = now()
    where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.superadmin_review_guaranteed_benefit_version(uuid, text, integer, text)
  from public, anon;
revoke all on function public.superadmin_set_voucher_distribution_price(uuid, numeric, numeric, text)
  from public, anon;
revoke all on function public.superadmin_set_guaranteed_benefit_status(uuid, text, text)
  from public, anon;
revoke all on function public.superadmin_review_voucher_distribution_order(uuid, text, uuid, text)
  from public, anon;
grant execute on function public.superadmin_review_guaranteed_benefit_version(uuid, text, integer, text)
  to authenticated, service_role;
grant execute on function public.superadmin_set_voucher_distribution_price(uuid, numeric, numeric, text)
  to authenticated, service_role;
grant execute on function public.superadmin_set_guaranteed_benefit_status(uuid, text, text)
  to authenticated, service_role;
grant execute on function public.superadmin_review_voucher_distribution_order(uuid, text, uuid, text)
  to authenticated, service_role;

-- RLS: clients can read only data in their ownership scope. New workflow,
-- issuance, approval and invoice tables intentionally have no client writes.
alter table public.voucher_versions enable row level security;
alter table public.voucher_distribution_price_rules enable row level security;
alter table public.voucher_distribution_orders enable row level security;
alter table public.voucher_issuances enable row level security;
alter table public.contest_bundle_purchases enable row level security;
alter table public.partner_invoice_items enable row level security;
alter table public.partner_invoice_item_sources enable row level security;
alter table public.voucher_audit_events enable row level security;

revoke all on public.voucher_versions from public, anon, authenticated;
revoke all on public.voucher_distribution_price_rules from public, anon, authenticated;
revoke all on public.voucher_distribution_orders from public, anon, authenticated;
revoke all on public.voucher_issuances from public, anon, authenticated;
revoke all on public.contest_bundle_purchases from public, anon, authenticated;
revoke all on public.partner_invoice_items from public, anon, authenticated;
revoke all on public.partner_invoice_item_sources from public, anon, authenticated;
revoke all on public.voucher_audit_events from public, anon, authenticated;

grant select on public.voucher_versions to authenticated;
grant select on public.voucher_distribution_price_rules to authenticated;
grant select on public.voucher_distribution_orders to authenticated;
grant select on public.voucher_issuances to authenticated;
grant select on public.contest_bundle_purchases to authenticated;
grant select on public.partner_invoice_items to authenticated;
grant select on public.partner_invoice_item_sources to authenticated;
grant select on public.voucher_audit_events to authenticated;
grant all on public.voucher_versions to service_role;
grant all on public.voucher_distribution_price_rules to service_role;
grant all on public.voucher_distribution_orders to service_role;
grant all on public.voucher_issuances to service_role;
grant all on public.contest_bundle_purchases to service_role;
grant all on public.partner_invoice_items to service_role;
grant all on public.partner_invoice_item_sources to service_role;
grant all on public.voucher_audit_events to service_role;

create policy voucher_versions_partner_own_select
  on public.voucher_versions for select to authenticated
  using (
    exists (
      select 1
      from public.vouchers v
      join public.partners p on p.id = v.partner_id
      where v.id = voucher_versions.voucher_id
        and p.auth_user_id = (select auth.uid())
    )
    or (select public.is_superadmin((select auth.uid())))
  );

create policy voucher_price_rules_partner_relevant_select
  on public.voucher_distribution_price_rules for select to authenticated
  using (
    scope = 'global'
    or exists (
      select 1 from public.partners p
      where p.id = voucher_distribution_price_rules.partner_id
        and p.auth_user_id = (select auth.uid())
    )
    or (select public.is_superadmin((select auth.uid())))
  );

create policy voucher_distribution_orders_partner_own_select
  on public.voucher_distribution_orders for select to authenticated
  using (
    exists (
      select 1 from public.partners p
      where p.id = voucher_distribution_orders.partner_id
        and p.auth_user_id = (select auth.uid())
    )
    or (select public.is_superadmin((select auth.uid())))
  );

create policy voucher_issuances_owner_select
  on public.voucher_issuances for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.voucher_distribution_orders vdo
      join public.partners p on p.id = vdo.partner_id
      where vdo.id = voucher_issuances.distribution_order_id
        and p.auth_user_id = (select auth.uid())
    )
    or (select public.is_superadmin((select auth.uid())))
  );

create policy contest_bundle_purchases_user_select
  on public.contest_bundle_purchases for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_superadmin((select auth.uid())))
  );

create policy partner_invoice_items_partner_own_select
  on public.partner_invoice_items for select to authenticated
  using (
    exists (
      select 1
      from public.partner_invoices pi
      join public.partners p on p.id = pi.partner_id
      where pi.id = partner_invoice_items.invoice_id
        and p.auth_user_id = (select auth.uid())
    )
    or (select public.is_superadmin((select auth.uid())))
  );

create policy partner_invoice_item_sources_partner_own_select
  on public.partner_invoice_item_sources for select to authenticated
  using (
    exists (
      select 1
      from public.partner_invoice_items pii
      join public.partner_invoices pi on pi.id = pii.invoice_id
      join public.partners p on p.id = pi.partner_id
      where pii.id = partner_invoice_item_sources.partner_invoice_item_id
        and p.auth_user_id = (select auth.uid())
    )
    or (select public.is_superadmin((select auth.uid())))
  );

create policy voucher_audit_events_superadmin_select
  on public.voucher_audit_events for select to authenticated
  using ((select public.is_superadmin((select auth.uid()))));

-- Safe partner visibility on the extended legacy table. Existing public/admin
-- policies remain intact; this policy cannot reveal another partner's rows.
create policy vouchers_partner_own_select
  on public.vouchers for select to authenticated
  using (
    partner_id in (
      select p.id
      from public.partners p
      where p.auth_user_id = (select auth.uid())
    )
  );

comment on table public.voucher_versions is
  'Immutable approved terms for the garantovaný nákupní benefit.';
comment on table public.voucher_distribution_orders is
  'Partner distribution capacity requested for a specific contest; not a purchase.';
comment on column public.voucher_distribution_price_rules.unit_price_ex_vat is
  'Explicit price excluding VAT. Zero is valid; NULL is not.';
comment on column public.voucher_distribution_price_rules.vat_rate_percent is
  'Percentage convention: 21 means 21 percent; calculations divide by 100.';
comment on table public.voucher_issuances is
  'One immutable record per actually issued garantovaný nákupní benefit.';
comment on table public.contest_bundle_purchases is
  'Future idempotency foundation only. No current purchase function uses this table.';
comment on table public.partner_invoice_items is
  'Future shared invoice items. Not connected to current invoice automation.';
comment on table public.partner_invoice_item_sources is
  'Unique source mapping prevents the same issuance from being invoiced twice.';
comment on table public.voucher_audit_events is
  'Audit metadata and snapshots. Raw voucher code values are forbidden.';

commit;
