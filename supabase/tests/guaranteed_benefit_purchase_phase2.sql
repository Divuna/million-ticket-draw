-- Phase 2 contract test for the garantovaný nákupní benefit purchase flow.
-- It verifies the new atomic purchase RPC's shape, privileges, feature-flag
-- default and gating, and the structural uniqueness guarantees the flow relies
-- on. The full functional behaviour (charge, ticket, issuance, idempotency,
-- fail-closed, concurrency) is validated against the real staging schema, where
-- a production-identical buy_ticket_atomic is available.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;

select plan(20);

select ok(
  to_regprocedure('public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)') is not null,
  'purchase RPC exists with the expected signature'
);

-- The classic paid ticket flow stays a real function (thin wrapper).
select ok(
  to_regprocedure('public.buy_ticket_atomic(uuid,uuid)') is not null,
  'buy_ticket_atomic still exists as (uuid, uuid)'
);

-- Shared win-logic helper exists and is NOT client-executable (a direct call
-- would mint a free ticket). Only owner/security-definer callers reach it.
select ok(
  to_regprocedure('public.assign_contest_ticket_atomic(uuid,uuid)') is not null,
  'shared ticket/win helper exists'
);

select ok(
  not has_function_privilege('anon', 'public.assign_contest_ticket_atomic(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.assign_contest_ticket_atomic(uuid,uuid)', 'EXECUTE'),
  'the free-ticket helper is not callable by anon or authenticated clients'
);

-- Approved customer benefit price column and its positivity guard.
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'voucher_versions'
      and column_name = 'customer_price_miocoins'
  ),
  'voucher_versions carries the customer benefit price'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.voucher_versions'::regclass
      and conname = 'voucher_versions_customer_price_positive_check'
  ),
  'the customer benefit price must be positive when set'
);

select ok(
  (select prosecdef
     from pg_proc
     where oid = 'public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)'::regprocedure),
  'purchase RPC is SECURITY DEFINER'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'anon cannot execute the purchase RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated can execute the purchase RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'service_role can execute the purchase RPC'
);

select is(
  (
    select count(*)::integer
    from public.settings
    where key in (
      'guaranteed_benefit_purchase_enabled',
      'guaranteed_benefit_purchase_contest_allowlist'
    )
  ),
  2,
  'both feature-flag settings are seeded by the migration'
);

select is(
  (select value from public.settings where key = 'guaranteed_benefit_purchase_enabled'),
  'false',
  'the purchase feature flag defaults to OFF'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.contest_bundle_purchases'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%idempotency_key%'
  ),
  'contest_bundle_purchases enforces one row per (user, idempotency key)'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.voucher_issuances'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%voucher_code_id%'
  ),
  'a voucher code can back at most one issuance'
);

select ok(
  exists (
    select 1 from pg_indexes
    where tablename = 'voucher_issuances'
      and indexname = 'idx_voucher_issuances_one_billable_per_customer_benefit'
  ),
  'at most one billable issuance per customer and benefit'
);

-- No authenticated caller: refused before any lookup or write.
select is(
  public.purchase_guaranteed_benefit_bundle_atomic(
    null, gen_random_uuid(), gen_random_uuid()
  ) ->> 'error',
  'unauthorized',
  'without an authenticated caller the purchase is refused'
);

-- Authenticated caller, flag OFF: refused before any write.
select set_config('request.jwt.claim.sub', '99999999-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  public.purchase_guaranteed_benefit_bundle_atomic(
    '99999999-0000-0000-0000-000000000001'::uuid,
    gen_random_uuid(),
    gen_random_uuid()
  ) ->> 'error',
  'feature_disabled',
  'with the flag OFF the purchase is refused before any write'
);

-- Flag ON but the contest is outside the pilot allowlist.
update public.settings set value = 'true'
  where key = 'guaranteed_benefit_purchase_enabled';
update public.settings set value = '["11111111-1111-1111-1111-111111111111"]'
  where key = 'guaranteed_benefit_purchase_contest_allowlist';

select is(
  public.purchase_guaranteed_benefit_bundle_atomic(
    '99999999-0000-0000-0000-000000000001'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    gen_random_uuid()
  ) ->> 'error',
  'contest_not_in_pilot',
  'an enabled purchase for a non-pilot contest is refused'
);

-- Open allowlist, unknown contest: refused before any write.
update public.settings set value = '[]'
  where key = 'guaranteed_benefit_purchase_contest_allowlist';

select is(
  public.purchase_guaranteed_benefit_bundle_atomic(
    '99999999-0000-0000-0000-000000000001'::uuid,
    gen_random_uuid(),
    gen_random_uuid()
  ) ->> 'error',
  'contest_not_found',
  'an enabled purchase for a missing contest is refused before any write'
);

select * from finish();
rollback;
