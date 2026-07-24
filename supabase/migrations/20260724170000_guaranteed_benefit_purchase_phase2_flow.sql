-- ============================================================================
-- Garantovaný nákupní benefit — Phase 2: real bundle purchase flow
-- ============================================================================
-- Additive and behavior-preserving. This migration:
--
--   1. adds an approved-term customer price for the benefit
--      (voucher_versions.customer_price_miocoins),
--   2. extracts the ticket-creation and win-resolution core of the existing
--      buy_ticket_atomic into ONE shared helper assign_contest_ticket_atomic
--      (no MioCoin charge). buy_ticket_atomic becomes a thin wrapper that keeps
--      the classic paid ticket flow FUNCTIONALLY IDENTICAL — same auth, same
--      contest lock order, same balance check, same ticket_price charge, same
--      ticket numbering, same winners/bonus/close rows, same returned JSON.
--      The winning logic lives in exactly one place; it is not duplicated.
--   3. adds the versioned atomic purchase RPC
--      purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid). The customer
--      pays customer_price_miocoins for the benefit (ledger type
--      'benefit_purchase'); the contest ticket is created FREE as a bonus by
--      calling the shared helper. buy_ticket_atomic is not called and never
--      charges here, so no 'ticket_purchase' record is produced by the bundle.
--
-- One purchase, one transaction. If any part fails, nothing is committed:
-- no ticket, no benefit, no MioCoin deduction, no billable issuance.
--
-- The partner distribution price (ex VAT + VAT, in CZK) is an independent
-- billing concern copied as an immutable snapshot from the approved order onto
-- the voucher_issuance. Only the first issuance of a benefit to a customer is
-- billable.
--
-- Feature-flag gated, OFF by default: merging this does not activate the flow.
--
-- NOTE ON QUOTED FUNCTION NAMES: top-level statements below write the function
-- names as public."..._atomic". The Supabase CLI migration splitter supports
-- SQL-standard "BEGIN ATOMIC" bodies by switching to a special state as soon as
-- the text ends with the word ATOMIC, and then scanning for a bare END. An
-- unquoted identifier ending in _atomic triggers that state, so the splitter
-- swallows the rest of the file into one chunk and Postgres rejects it with
-- "cannot insert multiple commands into a prepared statement". Double-quoting
-- makes the parser read those characters inside a quoted identifier instead.
-- The names are already lowercase, so quoting changes nothing semantically.
-- ============================================================================

begin;

do $$
begin
  if to_regprocedure('public.buy_ticket_atomic(uuid,uuid)') is null then
    raise exception 'Missing dependency public.buy_ticket_atomic(uuid,uuid)';
  end if;
  if to_regclass('public.contest_bundle_purchases') is null
     or to_regclass('public.voucher_issuances') is null
     or to_regclass('public.voucher_distribution_orders') is null
     or to_regclass('public.voucher_versions') is null
     or to_regclass('public.voucher_codes') is null
     or to_regclass('public.user_vouchers') is null
     or to_regclass('public.settings') is null then
    raise exception 'Missing garantovaný nákupní benefit Phase 2 dependency';
  end if;
end $$;

-- Feature flags. Default OFF so a production merge does not activate anything.
insert into public.settings (key, value)
values ('guaranteed_benefit_purchase_enabled', 'false')
on conflict (key) do nothing;

insert into public.settings (key, value)
values ('guaranteed_benefit_purchase_contest_allowlist', '[]')
on conflict (key) do nothing;

-- Customer MioCoin price of the benefit, an approved and historically preserved
-- term. Positive when present; the purchase fails closed if it is not set.
alter table public.voucher_versions
  add column if not exists customer_price_miocoins numeric(14,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.voucher_versions'::regclass
      and conname = 'voucher_versions_customer_price_positive_check'
  ) then
    alter table public.voucher_versions
      add constraint voucher_versions_customer_price_positive_check
      check (customer_price_miocoins is null or customer_price_miocoins > 0);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- assign_contest_ticket_atomic — shared ticket + win core (no wallet charge)
-- ---------------------------------------------------------------------------
-- This is the exact ticket-creation and win-resolution logic previously inline
-- in buy_ticket_atomic, with no MioCoin deduction. It is the single source of
-- truth for winning logic, used by both the classic paid wrapper and the free
-- benefit bundle. It is intentionally NOT executable by clients (a direct call
-- would mint a free ticket); only owner/security-definer callers reach it.
create or replace function public."assign_contest_ticket_atomic"(
  p_user_id uuid,
  p_contest_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ticket_count         integer;
  v_contest_status       text;
  v_next_ticket          integer;
  v_new_ticket_id        uuid;
  v_bonus_prize_id       uuid;
  v_bonus_title          text;
  v_next_bonus_position  integer;
begin
  select ticket_count, status, next_ticket_number
  into v_ticket_count, v_contest_status, v_next_ticket
  from public.contests where id = p_contest_id for update;

  if v_contest_status is null then
    return jsonb_build_object('success', false, 'error', 'Contest not found');
  end if;
  if v_contest_status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'Contest not active');
  end if;
  if v_next_ticket > v_ticket_count then
    return jsonb_build_object('success', false, 'error', 'Contest full');
  end if;

  update public.contests set next_ticket_number = next_ticket_number + 1 where id = p_contest_id;

  insert into public.tickets (contest_id, user_id, number)
  values (p_contest_id, p_user_id, v_next_ticket)
  returning id into v_new_ticket_id;

  select id, coalesce(title, description)
  into v_bonus_prize_id, v_bonus_title
  from public.bonus_prizes
  where contest_id = p_contest_id
    and ticket_position = v_next_ticket
    and status = 'pending'
  limit 1;

  if v_next_ticket = v_ticket_count then
    insert into public.winners (user_id, contest_id, ticket_id, type)
    values (p_user_id, p_contest_id, v_new_ticket_id, 'main');
    update public.contests set status = 'closed' where id = p_contest_id;
  end if;

  if v_bonus_prize_id is not null then
    insert into public.winners (user_id, contest_id, ticket_id, prize_id, type)
    values (p_user_id, p_contest_id, v_new_ticket_id, v_bonus_prize_id, 'bonus');
    update public.bonus_prizes set status = 'won' where id = v_bonus_prize_id;
  end if;

  select ticket_position
  into v_next_bonus_position
  from public.bonus_prizes
  where contest_id = p_contest_id
    and ticket_position > v_next_ticket
    and status = 'pending'
  order by ticket_position asc
  limit 1;

  return jsonb_build_object(
    'success',               true,
    'ticket_row_id',         v_new_ticket_id,
    'ticket_number',         v_next_ticket,
    'won_type',              case
                               when v_next_ticket = v_ticket_count then 'main'
                               when v_bonus_prize_id is not null   then 'bonus'
                               else null
                             end,
    'won_prize',             case
                               when v_next_ticket = v_ticket_count then 'Hlavni vyhra'
                               when v_bonus_prize_id is not null   then v_bonus_title
                               else null
                             end,
    'remaining_tickets',     v_ticket_count - v_next_ticket,
    'next_bonus_position',   v_next_bonus_position,
    'distance_to_next_bonus', v_next_bonus_position - v_next_ticket
  );
end;
$$;

revoke all on function public."assign_contest_ticket_atomic"(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public."assign_contest_ticket_atomic"(uuid, uuid) to service_role;

comment on function public."assign_contest_ticket_atomic"(uuid, uuid) is
  'Shared ticket + win-resolution core (no MioCoin charge). Single source of truth for winning logic. Not client-executable; reached only through security-definer callers.';

-- ---------------------------------------------------------------------------
-- buy_ticket_atomic — thin wrapper, classic paid flow (behavior preserved)
-- ---------------------------------------------------------------------------
create or replace function public."buy_ticket_atomic"(
  p_user_id uuid,
  p_contest_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_auth_uid       uuid;
  v_ticket_price   numeric;
  v_ticket_count   integer;
  v_contest_status text;
  v_next_ticket    integer;
  v_wallet_id      uuid;
  v_balance        numeric;
  v_new_balance    numeric;
  v_result         jsonb;
begin
  v_auth_uid := auth.uid();
  if v_auth_uid is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;
  if p_user_id is not null and p_user_id <> v_auth_uid then
    return jsonb_build_object('success', false, 'error', 'Forbidden');
  end if;

  -- Lock and validate the contest first (unchanged lock order), then the wallet.
  select ticket_price, ticket_count, status, next_ticket_number
  into v_ticket_price, v_ticket_count, v_contest_status, v_next_ticket
  from public.contests where id = p_contest_id for update;

  if v_contest_status is null then
    return jsonb_build_object('success', false, 'error', 'Contest not found');
  end if;
  if v_contest_status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'Contest not active');
  end if;
  if v_next_ticket > v_ticket_count then
    return jsonb_build_object('success', false, 'error', 'Contest full');
  end if;

  select id, balance_coins into v_wallet_id, v_balance
  from public.wallets where user_id = v_auth_uid for update;

  if v_wallet_id is null then
    return jsonb_build_object('success', false, 'error', 'Wallet not found');
  end if;
  if v_balance is null or v_balance < v_ticket_price then
    return jsonb_build_object('success', false, 'error', 'Nedostatek miocoinu');
  end if;

  v_new_balance := v_balance - v_ticket_price;
  update public.wallets set balance_coins = v_new_balance where id = v_wallet_id;

  -- Ticket creation + winning logic through the shared helper.
  v_result := public.assign_contest_ticket_atomic(v_auth_uid, p_contest_id);

  if v_ticket_price <> 0 then
    insert into public.wallet_transactions
      (user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata)
    values
      (v_auth_uid,
       v_wallet_id,
       -v_ticket_price,
       v_new_balance,
       'ticket_purchase',
       'buy_ticket_atomic',
       (v_result->>'ticket_row_id')::uuid,
       jsonb_build_object('contest_id', p_contest_id, 'ticket_number', (v_result->>'ticket_number')::integer));
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- purchase_guaranteed_benefit_bundle_atomic — benefit purchase + free ticket
-- ---------------------------------------------------------------------------
create or replace function public."purchase_guaranteed_benefit_bundle_atomic"(
  p_user_id uuid,
  p_contest_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user            uuid := auth.uid();
  v_flag            text;
  v_allowlist       text;
  v_contest_status  text;
  v_bundle_id       uuid;
  v_existing        public.contest_bundle_purchases%rowtype;
  v_code            record;
  v_price           numeric;
  v_billable        boolean;
  v_billing_reason  text;
  v_wallet_id       uuid;
  v_balance         numeric;
  v_new_balance     numeric;
  v_uv_id           uuid;
  v_ticket_id       uuid;
  v_issuance_id     uuid;
  v_ticket          jsonb;
  v_fail            text;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  if p_user_id is not null and p_user_id <> v_user then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if p_idempotency_key is null then
    return jsonb_build_object('success', false, 'error', 'idempotency_key_required');
  end if;

  select value into v_flag
  from public.settings
  where key = 'guaranteed_benefit_purchase_enabled';
  if coalesce(v_flag, 'false') <> 'true' then
    return jsonb_build_object('success', false, 'error', 'feature_disabled');
  end if;

  select value into v_allowlist
  from public.settings
  where key = 'guaranteed_benefit_purchase_contest_allowlist';
  if v_allowlist is not null
     and btrim(v_allowlist) not in ('', '[]')
     and not (v_allowlist::jsonb ? p_contest_id::text) then
    return jsonb_build_object('success', false, 'error', 'contest_not_in_pilot');
  end if;

  -- Lock and validate the contest first (same lock order as the classic flow).
  select status into v_contest_status
  from public.contests where id = p_contest_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'contest_not_found');
  end if;
  if v_contest_status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'contest_not_active');
  end if;

  begin
    -- Idempotency guard (charged amount is set at completion once the price is known).
    insert into public.contest_bundle_purchases (
      idempotency_key, user_id, contest_id, charged_miocoins, status
    ) values (
      p_idempotency_key, v_user, p_contest_id, 0, 'pending'
    )
    on conflict (user_id, idempotency_key) do nothing
    returning id into v_bundle_id;

    if v_bundle_id is null then
      select * into v_existing
      from public.contest_bundle_purchases
      where user_id = v_user and idempotency_key = p_idempotency_key;
      if v_existing.status = 'completed' then
        return jsonb_build_object(
          'success', true,
          'idempotent', true,
          'ticket_row_id', v_existing.ticket_id,
          'voucher_issuance_id', v_existing.voucher_issuance_id,
          'charged_miocoins', v_existing.charged_miocoins
        );
      end if;
      v_fail := 'purchase_already_in_progress';
      raise exception 'GB_FAIL';
    end if;

    -- Lock one available code from an approved distribution order for this
    -- contest with remaining capacity. Fail closed if none. Preference: a
    -- benefit the customer has not received yet, then least-issued / oldest.
    select vc.id                          as code_id,
           o.id                           as order_id,
           o.voucher_id                   as voucher_id,
           o.voucher_version_id           as voucher_version_id,
           o.unit_price_ex_vat_snapshot   as unit_price_ex_vat_snapshot,
           o.vat_rate_percent_snapshot    as vat_rate_percent_snapshot,
           o.currency_snapshot            as currency_snapshot
    into v_code
    from public.voucher_codes vc
    join public.voucher_distribution_orders o
      on o.id = vc.distribution_order_id
    join public.vouchers v
      on v.id = o.voucher_id
    where o.contest_id = p_contest_id
      and o.status = 'approved'
      and o.issued_quantity < o.requested_quantity
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vc.status = 'available'
    order by
      (exists (
        select 1 from public.voucher_issuances vi
        where vi.user_id = v_user and vi.voucher_id = o.voucher_id
      )) asc,
      o.issued_quantity asc,
      o.submitted_at asc,
      vc.created_at asc
    for update of vc skip locked
    limit 1;

    if not found then
      v_fail := 'no_benefit_available';
      raise exception 'GB_FAIL';
    end if;

    -- Customer benefit price (approved term). Fail closed if not set.
    select customer_price_miocoins into v_price
    from public.voucher_versions
    where id = v_code.voucher_version_id;
    if v_price is null or v_price <= 0 then
      v_fail := 'benefit_price_not_set';
      raise exception 'GB_FAIL';
    end if;

    -- Only the first issuance of the same benefit to the same customer is billable.
    v_billable := not exists (
      select 1 from public.voucher_issuances vi
      where vi.user_id = v_user and vi.voucher_id = v_code.voucher_id
    );
    v_billing_reason := case
      when v_billable then 'first_customer_issuance'
      else 'repeat_customer_issuance'
    end;

    -- Charge the customer for the benefit (never the ticket).
    select id, balance_coins into v_wallet_id, v_balance
    from public.wallets where user_id = v_user for update;
    if v_wallet_id is null then
      v_fail := 'wallet_not_found';
      raise exception 'GB_FAIL';
    end if;
    if v_balance is null or v_balance < v_price then
      v_fail := 'insufficient_miocoins';
      raise exception 'GB_FAIL';
    end if;
    v_new_balance := v_balance - v_price;
    update public.wallets set balance_coins = v_new_balance where id = v_wallet_id;

    -- Create the user voucher (owned code voucher: redeemed=true by convention).
    insert into public.user_vouchers (
      user_id, voucher_id, voucher_code_id, acquisition_source, redeemed
    ) values (
      v_user, v_code.voucher_id, v_code.code_id, 'guaranteed_purchase_benefit', true
    )
    returning id into v_uv_id;

    -- Mark the code issued. The unique code can never be issued again.
    update public.voucher_codes
    set status = 'issued',
        issued_to_user_id = v_user,
        issued_user_voucher_id = v_uv_id,
        issued_at = now()
    where id = v_code.code_id;

    -- FREE ticket + winning logic through the shared helper (no charge here).
    v_ticket := public.assign_contest_ticket_atomic(v_user, p_contest_id);
    if coalesce(v_ticket->>'success', 'false') <> 'true' then
      v_fail := coalesce(v_ticket->>'error', 'ticket_creation_failed');
      raise exception 'GB_FAIL';
    end if;
    v_ticket_id := (v_ticket->>'ticket_row_id')::uuid;

    -- Immutable issuance with the historical partner-price snapshot.
    insert into public.voucher_issuances (
      distribution_order_id, voucher_id, voucher_version_id, voucher_code_id,
      user_id, user_voucher_id, ticket_id, billable, billing_reason,
      unit_price_ex_vat_snapshot, vat_rate_percent_snapshot, currency_snapshot
    ) values (
      v_code.order_id, v_code.voucher_id, v_code.voucher_version_id, v_code.code_id,
      v_user, v_uv_id, v_ticket_id, v_billable, v_billing_reason,
      v_code.unit_price_ex_vat_snapshot, v_code.vat_rate_percent_snapshot,
      v_code.currency_snapshot
    )
    returning id into v_issuance_id;

    -- Ledger entry for the benefit purchase (never 'ticket_purchase').
    insert into public.wallet_transactions
      (user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata)
    values
      (v_user, v_wallet_id, -v_price, v_new_balance, 'benefit_purchase',
       'purchase_guaranteed_benefit_bundle_atomic', v_ticket_id,
       jsonb_build_object(
         'contest_id', p_contest_id,
         'voucher_id', v_code.voucher_id,
         'voucher_issuance_id', v_issuance_id,
         'ticket_number', (v_ticket->>'ticket_number')::integer,
         'free_ticket', true));

    update public.voucher_distribution_orders
    set issued_quantity = issued_quantity + 1,
        billable_issued_quantity =
          billable_issued_quantity + (case when v_billable then 1 else 0 end),
        updated_at = now()
    where id = v_code.order_id;

    update public.contest_bundle_purchases
    set status = 'completed',
        ticket_id = v_ticket_id,
        voucher_issuance_id = v_issuance_id,
        charged_miocoins = v_price,
        completed_at = now()
    where id = v_bundle_id;

    return jsonb_build_object(
      'success', true,
      'idempotent', false,
      'ticket_row_id', v_ticket_id,
      'ticket_number', (v_ticket->>'ticket_number')::integer,
      'ticket_free', true,
      'won_type', v_ticket->'won_type',
      'won_prize', v_ticket->'won_prize',
      'remaining_tickets', (v_ticket->>'remaining_tickets')::integer,
      'next_bonus_position', v_ticket->'next_bonus_position',
      'distance_to_next_bonus', v_ticket->'distance_to_next_bonus',
      'voucher_id', v_code.voucher_id,
      'user_voucher_id', v_uv_id,
      'voucher_issuance_id', v_issuance_id,
      'billable', v_billable,
      'charged_miocoins', v_price
    );

  exception
    when others then
      return jsonb_build_object(
        'success', false,
        'error', coalesce(v_fail, sqlerrm)
      );
  end;
end;
$$;

revoke all on function public."purchase_guaranteed_benefit_bundle_atomic"(uuid, uuid, uuid)
  from public, anon;
grant execute on function public."purchase_guaranteed_benefit_bundle_atomic"(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public."purchase_guaranteed_benefit_bundle_atomic"(uuid, uuid, uuid) is
  'Atomic garantovaný nákupní benefit purchase: charges customer_price_miocoins as benefit_purchase and creates the contest ticket FREE via assign_contest_ticket_atomic. buy_ticket_atomic is unchanged in behavior and not used here. Feature-flag gated, OFF by default.';

commit;
