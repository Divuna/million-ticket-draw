-- ============================================================================
-- Garantovaný nákupní benefit — Phase 2: real bundle purchase flow
-- ============================================================================
-- Additive only. This migration:
--   * adds a NEW versioned atomic purchase RPC
--       public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid)
--   * does NOT modify buy_ticket_atomic — it CALLS it, so the current main and
--     bonus winning logic is preserved verbatim with zero drift,
--   * is gated by feature-flag settings that default to OFF, so merging this to
--     production does not activate the flow. Activation is a separate data step,
--     enabled first only on staging.
--
-- One purchase, one transaction. If any part fails, nothing is committed:
-- no ticket, no benefit, no MioCoin deduction, no billable issuance.
--
-- The customer is charged the contest ticket price (the only MioCoin price in
-- the schema). buy_ticket_atomic performs the balance check, the MioCoin
-- deduction, the ticket creation, and the main/bonus winning logic. This RPC
-- additionally issues exactly one garantovaný nákupní benefit from an approved
-- partner distribution order and records the immutable issuance.
--
-- The partner distribution price (ex VAT + VAT, in CZK) is an independent
-- billing concern. It is copied as an immutable historical snapshot from the
-- approved distribution order onto the voucher_issuance. Only the first issuance
-- of the same benefit to the same customer is billable.
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
     or to_regclass('public.voucher_codes') is null
     or to_regclass('public.user_vouchers') is null
     or to_regclass('public.settings') is null then
    raise exception 'Missing garantovaný nákupní benefit Phase 2 dependency';
  end if;
end $$;

-- Feature flags. Default OFF so a production merge does not activate anything.
-- Activation (enable + pilot contest allowlist) is a separate data step run
-- first only on staging.
insert into public.settings (key, value)
values ('guaranteed_benefit_purchase_enabled', 'false')
on conflict (key) do nothing;

insert into public.settings (key, value)
values ('guaranteed_benefit_purchase_contest_allowlist', '[]')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- purchase_guaranteed_benefit_bundle_atomic
-- ---------------------------------------------------------------------------
create or replace function public.purchase_guaranteed_benefit_bundle_atomic(
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
  v_ticket_price    numeric;
  v_contest_status  text;
  v_bundle_id       uuid;
  v_existing        public.contest_bundle_purchases%rowtype;
  v_code            record;
  v_billable        boolean;
  v_billing_reason  text;
  v_uv_id           uuid;
  v_ticket_id       uuid;
  v_issuance_id     uuid;
  v_bt              jsonb;
  v_fail            text;
begin
  -- 1. Authenticated caller who owns the purchase.
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  if p_user_id is not null and p_user_id <> v_user then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if p_idempotency_key is null then
    return jsonb_build_object('success', false, 'error', 'idempotency_key_required');
  end if;

  -- 2. Feature flag: disabled by default, enabled first only on staging.
  select value into v_flag
  from public.settings
  where key = 'guaranteed_benefit_purchase_enabled';
  if coalesce(v_flag, 'false') <> 'true' then
    return jsonb_build_object('success', false, 'error', 'feature_disabled');
  end if;

  -- Optional pilot allowlist. Empty/absent means the flag alone governs.
  select value into v_allowlist
  from public.settings
  where key = 'guaranteed_benefit_purchase_contest_allowlist';
  if v_allowlist is not null
     and btrim(v_allowlist) not in ('', '[]')
     and not (v_allowlist::jsonb ? p_contest_id::text) then
    return jsonb_build_object('success', false, 'error', 'contest_not_in_pilot');
  end if;

  -- 3. Contest must exist and be active. buy_ticket_atomic re-checks under lock;
  --    this early read also gives us the customer charge amount.
  select ticket_price, status
  into v_ticket_price, v_contest_status
  from public.contests
  where id = p_contest_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'contest_not_found');
  end if;
  if v_contest_status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'contest_not_active');
  end if;

  -- Everything that writes runs in one subtransaction. Any failure rolls the
  -- whole thing back (including the pending idempotency row), so a failed
  -- attempt leaves no trace and can be safely retried.
  begin
    -- 4. Idempotency guard.
    insert into public.contest_bundle_purchases (
      idempotency_key, user_id, contest_id, charged_miocoins, status
    ) values (
      p_idempotency_key, v_user, p_contest_id, v_ticket_price, 'pending'
    )
    on conflict (user_id, idempotency_key) do nothing
    returning id into v_bundle_id;

    if v_bundle_id is null then
      -- A committed row for this key can only be a completed purchase, because
      -- any non-completed attempt rolls its pending row back.
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

    -- 5. Select and lock exactly one available code from an approved distribution
    --    order for this contest with remaining capacity. Fail closed if none.
    --    Preference: a benefit the customer has not received yet, then the
    --    least-issued and oldest order.
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

    -- 6. Billing: only the first issuance of the same benefit to the same
    --    customer is billable.
    v_billable := not exists (
      select 1 from public.voucher_issuances vi
      where vi.user_id = v_user and vi.voucher_id = v_code.voucher_id
    );
    v_billing_reason := case
      when v_billable then 'first_customer_issuance'
      else 'repeat_customer_issuance'
    end;

    -- 7. Create the user voucher (stored in the existing purchased-vouchers area).
    --    A code-bearing user_voucher is redeemed=true by the existing convention
    --    (see user_vouchers_voucher_code_requires_redeemed): the customer now owns
    --    the code, exactly like a classic acquired code voucher.
    insert into public.user_vouchers (
      user_id, voucher_id, voucher_code_id, acquisition_source, redeemed
    ) values (
      v_user, v_code.voucher_id, v_code.code_id, 'guaranteed_purchase_benefit', true
    )
    returning id into v_uv_id;

    -- 8. Mark the code issued. The unique code can never be issued again.
    update public.voucher_codes
    set status = 'issued',
        issued_to_user_id = v_user,
        issued_user_voucher_id = v_uv_id,
        issued_at = now()
    where id = v_code.code_id;

    -- 9. Ticket + MioCoin charge + main/bonus winning logic, via the UNCHANGED
    --    buy_ticket_atomic. A business failure (insufficient balance, contest
    --    full/closed) returns success=false, which we escalate to roll back.
    v_bt := public.buy_ticket_atomic(v_user, p_contest_id);
    if coalesce(v_bt->>'success', 'false') <> 'true' then
      v_fail := coalesce(v_bt->>'error', 'ticket_purchase_failed');
      raise exception 'GB_FAIL';
    end if;
    v_ticket_id := (v_bt->>'ticket_row_id')::uuid;

    -- 10. Record the immutable issuance. All links and the historical price
    --     snapshot are validated by the Phase 1 guard triggers.
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

    -- 11. Advance the order counters (guarded columns are untouched).
    update public.voucher_distribution_orders
    set issued_quantity = issued_quantity + 1,
        billable_issued_quantity =
          billable_issued_quantity + (case when v_billable then 1 else 0 end),
        updated_at = now()
    where id = v_code.order_id;

    -- 12. Complete the idempotent bundle record.
    update public.contest_bundle_purchases
    set status = 'completed',
        ticket_id = v_ticket_id,
        voucher_issuance_id = v_issuance_id,
        completed_at = now()
    where id = v_bundle_id;

    return jsonb_build_object(
      'success', true,
      'idempotent', false,
      'ticket_row_id', v_ticket_id,
      'ticket_number', (v_bt->>'ticket_number')::integer,
      'won_type', v_bt->'won_type',
      'won_prize', v_bt->'won_prize',
      'remaining_tickets', (v_bt->>'remaining_tickets')::integer,
      'next_bonus_position', v_bt->'next_bonus_position',
      'distance_to_next_bonus', v_bt->'distance_to_next_bonus',
      'voucher_id', v_code.voucher_id,
      'user_voucher_id', v_uv_id,
      'voucher_issuance_id', v_issuance_id,
      'billable', v_billable,
      'charged_miocoins', v_ticket_price
    );

  exception
    when others then
      -- Subtransaction rolled back: no ticket, no benefit, no deduction,
      -- no billable issuance, no pending row. Return a structured error.
      return jsonb_build_object(
        'success', false,
        'error', coalesce(v_fail, sqlerrm)
      );
  end;
end;
$$;

revoke all on function public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) is
  'Atomic garantovaný nákupní benefit + free contest ticket purchase. Delegates ticket, MioCoin charge and winning logic to the unchanged buy_ticket_atomic; issues one benefit code from an approved distribution order. Feature-flag gated, OFF by default.';

commit;
