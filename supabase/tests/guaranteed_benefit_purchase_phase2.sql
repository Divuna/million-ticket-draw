-- Phase 2 contract test for the garantovaný nákupní benefit purchase flow.
-- It verifies the new atomic purchase RPC's shape, privileges, feature-flag
-- default and gating, and the structural uniqueness guarantees the flow relies
-- on. The full functional behaviour (charge, ticket, issuance, idempotency,
-- fail-closed, concurrency) is validated against the real staging schema, where
-- a production-identical buy_ticket_atomic is available.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;

select plan(45);

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
  not has_function_privilege(
    'authenticated',
    'public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute the internal purchase RPC'
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

-- ── Mystery kupon: read-only nabídka nesmí nic prozradit ──────────────────
select ok(
  to_regprocedure('public.get_guaranteed_benefit_offer(uuid)') is not null,
  'the read-only offer RPC exists'
);

select ok(
  not has_function_privilege('anon', 'public.get_guaranteed_benefit_offer(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_guaranteed_benefit_offer(uuid)', 'EXECUTE'),
  'only authenticated clients can read the offer'
);

-- The offer must never leak coupon identity: name, partner, image, code or
-- counts. An unavailable offer therefore carries a single key.
select is(
  (select array_agg(k order by k)
     from jsonb_object_keys(public.get_guaranteed_benefit_offer(gen_random_uuid())) k),
  array['available'],
  'an unavailable offer exposes nothing but availability'
);

-- The purchase price comes from contests.ticket_price, so the RPC body must
-- not read the legacy per-benefit customer price at all.
select ok(
  (select prosrc
     from pg_proc
     where oid = 'public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)'::regprocedure)
  not like '%customer_price_miocoins%',
  'the mystery purchase ignores the legacy per-benefit customer price'
);

-- Public wrapper contracts: customer identity is always auth.uid(), internal
-- functions are service-only, and named argument forwarding cannot be swapped.
select ok(
  to_regprocedure('public.buy_ticket_public(uuid,uuid)') is not null,
  'the classic public purchase wrapper exists'
);

select ok(
  to_regprocedure('public.purchase_guaranteed_benefit_bundle_public(uuid,uuid,uuid)') is not null,
  'the mystery public purchase wrapper exists'
);

select ok(
  not has_function_privilege('anon', 'public.buy_ticket_atomic(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.buy_ticket_atomic(uuid,uuid)', 'EXECUTE'),
  'classic atomic purchase is not customer-executable'
);

select ok(
  not has_function_privilege('anon', 'public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)', 'EXECUTE'),
  'mystery atomic purchase is not customer-executable'
);

select ok(
  not has_function_privilege('anon', 'public.buy_ticket_public(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.buy_ticket_public(uuid,uuid)', 'EXECUTE'),
  'only authenticated customers can execute the classic public wrapper'
);

select ok(
  not has_function_privilege('anon', 'public.purchase_guaranteed_benefit_bundle_public(uuid,uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.purchase_guaranteed_benefit_bundle_public(uuid,uuid,uuid)', 'EXECUTE'),
  'only authenticated customers can execute the mystery public wrapper'
);

select ok(
  (select prosrc
     from pg_proc
    where oid = 'public.buy_ticket_public(uuid,uuid)'::regprocedure)
  ~ 'buy_ticket_atomic\([[:space:]]*p_user_id[[:space:]]*=>[[:space:]]*v_user,[[:space:]]*p_contest_id[[:space:]]*=>[[:space:]]*p_contest_id',
  'classic wrapper forwards user then contest by explicit argument name'
);

select ok(
  (select prosrc
     from pg_proc
    where oid = 'public.purchase_guaranteed_benefit_bundle_public(uuid,uuid,uuid)'::regprocedure)
  ~ 'purchase_guaranteed_benefit_bundle_atomic\([[:space:]]*p_user_id[[:space:]]*=>[[:space:]]*v_user,[[:space:]]*p_contest_id[[:space:]]*=>[[:space:]]*p_contest_id,[[:space:]]*p_idempotency_key[[:space:]]*=>[[:space:]]*p_idempotency_key',
  'mystery wrapper forwards all internal arguments by explicit name'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'f1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'wrapper-customer-a@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f1000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'wrapper-customer-b@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f1000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 'wrapper-approver@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'wrapper-customer-a@example.test'),
  ('f1000000-0000-4000-8000-000000000002', 'wrapper-customer-b@example.test');

select set_config(
  'request.jwt.claim.sub',
  'f1000000-0000-4000-8000-000000000001',
  true
);

insert into public.wallets (id, user_id, balance_coins) values
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001',
    100
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000002',
    100
  );

insert into public.contests (
  id, title, name, main_prize, status, ticket_price, ticket_count,
  next_ticket_number
) values
  (
    'f3000000-0000-4000-8000-000000000001',
    'Classic wrapper test', 'Classic wrapper test', 'Main prize',
    'active', 10, 100, 1
  ),
  (
    'f3000000-0000-4000-8000-000000000002',
    'Mystery wrapper test', 'Mystery wrapper test', 'Main prize',
    'active', 15, 100, 1
  );

insert into public.partners (
  id, auth_user_id, name, company_name
) values (
  'f4000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000003',
  'Wrapper test partner',
  'Wrapper test company'
);

insert into public.vouchers (
  id, name, image_url, is_public, partner_id, workflow_status,
  distribution_mode, approved_at, approved_by
) values (
  'f5000000-0000-4000-8000-000000000001',
  'Mystery wrapper voucher',
  'https://example.test/wrapper-voucher.png',
  false,
  'f4000000-0000-4000-8000-000000000001',
  'approved',
  'guaranteed_purchase_benefit',
  now(),
  'f1000000-0000-4000-8000-000000000003'
);

insert into public.voucher_versions (
  id, voucher_id, version_number, status, name, short_description,
  terms_text, how_to_use_text, benefit_kind, currency, code_source,
  requested_code_count, approved_code_count, approved_at, approved_by
) values (
  'f6000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  1, 'approved', 'Mystery wrapper voucher', 'Wrapper test',
  'Wrapper terms', 'Use wrapper code', 'other', 'CZK',
  'provided_by_partner', 1, 1, now(),
  'f1000000-0000-4000-8000-000000000003'
);

update public.vouchers
set current_approved_version_id = 'f6000000-0000-4000-8000-000000000001'
where id = 'f5000000-0000-4000-8000-000000000001';

insert into public.voucher_distribution_price_rules (
  id, scope, partner_id, unit_price_ex_vat, vat_rate_percent, currency,
  created_by
) values (
  'f7000000-0000-4000-8000-000000000001',
  'partner',
  'f4000000-0000-4000-8000-000000000001',
  5, 21, 'CZK',
  'f1000000-0000-4000-8000-000000000003'
);

insert into public.voucher_distribution_orders (
  id, partner_id, voucher_id, voucher_version_id, contest_id,
  requested_quantity, status, price_rule_id, unit_price_ex_vat_snapshot,
  vat_rate_percent_snapshot, currency_snapshot, decided_by, decided_at
) values (
  'f8000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000001',
  'f3000000-0000-4000-8000-000000000002',
  1, 'approved',
  'f7000000-0000-4000-8000-000000000001',
  5, 21, 'CZK',
  'f1000000-0000-4000-8000-000000000003',
  now()
);

insert into public.voucher_codes (
  id, voucher_id, code, status, distribution_order_id
) values (
  'f9000000-0000-4000-8000-000000000001',
  'f5000000-0000-4000-8000-000000000001',
  'WRAPPER-TEST-CODE',
  'available',
  'f8000000-0000-4000-8000-000000000001'
);

create temporary table wrapper_purchase_results (
  flow text primary key,
  result jsonb not null
);
grant select, insert on table wrapper_purchase_results to authenticated;

select set_config(
  'request.jwt.claim.sub',
  'f1000000-0000-4000-8000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set role authenticated;

insert into wrapper_purchase_results (flow, result)
select
  'classic',
  public.buy_ticket_public(
    'f3000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001'
  );

insert into wrapper_purchase_results (flow, result)
select
  'classic-spoof',
  public.buy_ticket_public(
    'f3000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000002'
  );

reset role;

select is(
  (select (result->>'success')::boolean from wrapper_purchase_results where flow = 'classic'),
  true,
  'authenticated customer buys a classic ticket through buy_ticket_public'
);

select ok(
  not (select result ?| array[
    'ticket_number', 'next_bonus_position', 'distance_to_next_bonus',
    'remaining_tickets'
  ] from wrapper_purchase_results where flow = 'classic'),
  'classic public purchase response contains no internal ticket state'
);

select is(
  (select balance_coins from public.wallets
    where user_id = 'f1000000-0000-4000-8000-000000000001'),
  90::numeric,
  'classic public purchase deducts exactly the contest ticket price'
);

select is(
  (select count(*)::integer from public.tickets
    where contest_id = 'f3000000-0000-4000-8000-000000000001'),
  1,
  'classic public purchase creates exactly one ticket'
);

select results_eq(
  $$
    select user_id, contest_id, number
    from public.tickets
    where contest_id = 'f3000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      'f1000000-0000-4000-8000-000000000001'::uuid,
      'f3000000-0000-4000-8000-000000000001'::uuid,
      1
    )
  $$,
  'classic wrapper forwards authenticated user and contest in the correct order'
);

select is(
  (select result->>'error' from wrapper_purchase_results where flow = 'classic-spoof'),
  'Forbidden',
  'classic wrapper rejects a different supplied user_id'
);

select ok(
  (select balance_coins = 90 from public.wallets
    where user_id = 'f1000000-0000-4000-8000-000000000001')
  and (select count(*) = 1 from public.tickets
    where contest_id = 'f3000000-0000-4000-8000-000000000001'),
  'rejected classic spoof changes neither balance nor ticket count'
);

update public.settings
set value = 'true'
where key = 'guaranteed_benefit_purchase_enabled';
update public.settings
set value = '[]'
where key = 'guaranteed_benefit_purchase_contest_allowlist';

set role authenticated;

insert into wrapper_purchase_results (flow, result)
select
  'mystery',
  public.purchase_guaranteed_benefit_bundle_public(
    'f1000000-0000-4000-8000-000000000001',
    'f3000000-0000-4000-8000-000000000002',
    'fa000000-0000-4000-8000-000000000001'
  );

insert into wrapper_purchase_results (flow, result)
select
  'mystery-spoof',
  public.purchase_guaranteed_benefit_bundle_public(
    'f1000000-0000-4000-8000-000000000002',
    'f3000000-0000-4000-8000-000000000002',
    'fa000000-0000-4000-8000-000000000002'
  );

reset role;

select is(
  (select (result->>'success')::boolean from wrapper_purchase_results where flow = 'mystery'),
  true,
  'authenticated customer completes a mystery purchase through the public wrapper'
);

select ok(
  not (select result ?| array[
    'ticket_number', 'next_bonus_position', 'distance_to_next_bonus',
    'remaining_tickets'
  ] from wrapper_purchase_results where flow = 'mystery'),
  'mystery public purchase response contains no internal ticket state'
);

select is(
  (select balance_coins from public.wallets
    where user_id = 'f1000000-0000-4000-8000-000000000001'),
  75::numeric,
  'mystery public purchase deducts exactly the second contest ticket price'
);

select is(
  (select count(*)::integer from public.tickets
    where contest_id = 'f3000000-0000-4000-8000-000000000002'),
  1,
  'mystery public purchase creates exactly one ticket'
);

select is(
  (select count(*)::integer from public.voucher_issuances
    where user_id = 'f1000000-0000-4000-8000-000000000001'
      and ticket_id in (
        select id from public.tickets
        where contest_id = 'f3000000-0000-4000-8000-000000000002'
      )),
  1,
  'mystery public purchase creates exactly one matching voucher issuance'
);

select is(
  (select result->>'error' from wrapper_purchase_results where flow = 'mystery-spoof'),
  'forbidden',
  'mystery wrapper rejects a different supplied user_id'
);

select ok(
  (select balance_coins = 75 from public.wallets
    where user_id = 'f1000000-0000-4000-8000-000000000001')
  and (select count(*) = 1 from public.tickets
    where contest_id = 'f3000000-0000-4000-8000-000000000002'),
  'rejected mystery spoof changes neither balance nor ticket count'
);

select * from finish();
rollback;
