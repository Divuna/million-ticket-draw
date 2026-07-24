begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;

select plan(20);

select ok(
  to_regclass('public.voucher_versions') is not null
  and to_regclass('public.voucher_distribution_price_rules') is not null
  and to_regclass('public.voucher_distribution_orders') is not null
  and to_regclass('public.voucher_issuances') is not null
  and to_regclass('public.contest_bundle_purchases') is not null
  and to_regclass('public.partner_invoice_items') is not null
  and to_regclass('public.partner_invoice_item_sources') is not null
  and to_regclass('public.voucher_audit_events') is not null,
  'all Phase 1 foundation tables exist'
);

select ok(
  (
    select bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'voucher_versions',
        'voucher_distribution_price_rules',
        'voucher_distribution_orders',
        'voucher_issuances',
        'contest_bundle_purchases',
        'partner_invoice_items',
        'partner_invoice_item_sources',
        'voucher_audit_events'
      )
  ),
  'RLS is enabled on every new client-visible table'
);

select ok(
  to_regprocedure(
    'public.superadmin_review_guaranteed_benefit_version(uuid,text,integer,text)'
  ) is not null
  and to_regprocedure(
    'public.superadmin_set_voucher_distribution_price(uuid,numeric,numeric,text)'
  ) is not null
  and to_regprocedure(
    'public.superadmin_set_guaranteed_benefit_status(uuid,text,text)'
  ) is not null
  and to_regprocedure(
    'public.superadmin_review_voucher_distribution_order(uuid,text,uuid,text)'
  ) is not null,
  'all guarded superadmin RPCs exist'
);

select results_eq(
  $$
    select distribution_mode, workflow_status
    from public.vouchers
    where id = '02000000-0000-0000-0000-000000000001'
  $$,
  $$ values ('classic'::text, 'legacy'::text) $$,
  'a voucher row created before the migration remains readable and classic'
);

select results_eq(
  $$
    select c.title, pi.vat_rate
    from public.contests c
    cross join public.partner_invoices pi
    where c.id = '03000000-0000-0000-0000-000000000001'
      and pi.id = '04000000-0000-0000-0000-000000000001'
  $$,
  $$ values ('Pre-existing contest'::text, 21::numeric) $$,
  'pre-existing contest and invoice rows remain readable'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'phase1-partner-a@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'phase1-partner-b@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.partners (
  id, auth_user_id, name, logo_url, website_url
) values
  (
    '20000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'Phase 1 Partner A', 'https://example.test/a.png', 'https://a.example.test'
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000002',
    'Phase 1 Partner B', 'https://example.test/b.png', 'https://b.example.test'
  );

insert into public.vouchers (
  id, name, image_url, is_public, partner_id, workflow_status, distribution_mode
) values
  (
    '30000000-0000-0000-0000-000000000001',
    'Phase 1 Benefit A', 'https://example.test/benefit-a.png', false,
    '20000000-0000-0000-0000-000000000001',
    'draft', 'guaranteed_purchase_benefit'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    'Phase 1 Benefit B', 'https://example.test/benefit-b.png', false,
    '20000000-0000-0000-0000-000000000002',
    'draft', 'guaranteed_purchase_benefit'
  );

insert into public.voucher_versions (
  id, voucher_id, version_number, status, name, terms_text, how_to_use_text,
  benefit_kind, code_source, requested_code_count
) values
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    1, 'submitted', 'Phase 1 Benefit A v1', 'Terms A', 'Use A',
    'other', 'provided_by_partner', 10
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    1, 'submitted', 'Phase 1 Benefit B v1', 'Terms B', 'Use B',
    'other', 'generated_by_onemil', 10
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.voucher_versions),
  1,
  'partner A sees only its own voucher version, not partner B data'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.voucher_versions',
    'UPDATE'
  ),
  'authenticated clients have no direct approval-table UPDATE privilege'
);

select throws_ok(
  $$
    select public.superadmin_review_guaranteed_benefit_version(
      '40000000-0000-0000-0000-000000000001',
      'approved',
      10,
      'partner must not self-approve'
    )
  $$,
  '42501',
  'Only a superadmin can review a voucher version',
  'partner cannot approve its own voucher through the guarded RPC'
);

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);

update public.voucher_versions
set status = 'approved',
    approved_code_count = 10,
    approved_at = now(),
    approved_by = '10000000-0000-0000-0000-000000000001'
where id = '40000000-0000-0000-0000-000000000001';

select throws_ok(
  $$
    update public.voucher_versions
    set terms_text = 'Retrospectively changed terms'
    where id = '40000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Approved voucher versions are immutable',
  'approved terms cannot be changed'
);

insert into public.voucher_distribution_price_rules (
  id, scope, unit_price_ex_vat
) values (
  '50000000-0000-0000-0000-000000000001',
  'global',
  0
);

select is(
  (
    select unit_price_ex_vat
    from public.voucher_distribution_price_rules
    where id = '50000000-0000-0000-0000-000000000001'
  ),
  0::numeric,
  '0 CZK is a valid explicit distribution price'
);

select is(
  (
    select vat_rate_percent
    from public.voucher_distribution_price_rules
    where id = '50000000-0000-0000-0000-000000000001'
  ),
  21::numeric,
  'VAT is stored as percent 21, not fraction 0.21'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'voucher_issuances'
      and indexdef ilike '%unique%'
      and indexdef ilike '%voucher_code_id%'
  ),
  'voucher_code_id has database-level double-issuance protection'
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'voucher_issuances'
      and indexdef ilike '%unique%'
      and indexdef ilike '%ticket_id%'
  ),
  'ticket_id cannot be linked to two issuances'
);

insert into public.contests (
  id, title, main_prize
) values (
  '60000000-0000-0000-0000-000000000001',
  'Phase 1 untouched contest',
  'Existing prize'
);

insert into public.voucher_distribution_orders (
  id, partner_id, voucher_id, voucher_version_id, contest_id,
  requested_quantity, status, price_rule_id,
  unit_price_ex_vat_snapshot, vat_rate_percent_snapshot, currency_snapshot,
  decided_by, decided_at
) values (
  '70000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '60000000-0000-0000-0000-000000000001',
  10, 'approved', '50000000-0000-0000-0000-000000000001',
  0, 21, 'CZK',
  '10000000-0000-0000-0000-000000000001', now()
);

select throws_ok(
  $$
    update public.voucher_distribution_price_rules
    set unit_price_ex_vat = 99
    where id = '50000000-0000-0000-0000-000000000001'
  $$,
  'P0001',
  'Used price values are immutable',
  'a historical price used by an order cannot change'
);

insert into public.partner_invoices (
  id, partner_id, period_start, period_end
) values (
  '80000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  current_date,
  current_date
);

insert into public.partner_invoice_items (
  id, invoice_id, item_type, description_snapshot, quantity,
  unit_price_ex_vat, amount_ex_vat, vat_rate_percent, vat_amount,
  amount_inc_vat
) values (
  '90000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  'guaranteed_purchase_benefit',
  'Phase 1 zero-price item',
  1, 0, 0, 21, 0, 0
);

select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'partner_invoice_item_sources'
      and indexdef ilike '%unique%'
      and indexdef ilike '%source_type%'
      and indexdef ilike '%source_id%'
  ),
  'the same typed source_id cannot be invoiced twice'
);

insert into public.vouchers (
  id, name, image_url
) values (
  'b0000000-0000-0000-0000-000000000001',
  'Legacy voucher remains valid',
  'https://example.test/legacy.png'
);

select results_eq(
  $$
    select distribution_mode, workflow_status
    from public.vouchers
    where id = 'b0000000-0000-0000-0000-000000000001'
  $$,
  $$ values ('classic'::text, 'legacy'::text) $$,
  'legacy voucher inserts retain classic behavior'
);

select ok(
  to_regprocedure('public.buy_ticket_atomic(uuid,uuid)') is not null,
  'existing buy_ticket_atomic remains present'
);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'partner_invoices'
      and column_name = 'vat_rate'
  ),
  'existing partner invoice VAT column remains intact'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.voucher_issuances',
    'INSERT'
  )
  and not has_table_privilege(
    'authenticated',
    'public.partner_invoice_items',
    'INSERT'
  ),
  'authenticated clients cannot write issuance or invoice foundation tables'
);

select is(
  (
    select count(*)::integer
    from public.voucher_audit_events
    where public.voucher_audit_has_raw_code_key(before_data)
       or public.voucher_audit_has_raw_code_key(after_data)
  ),
  0,
  'audit contains no raw voucher code values'
);

select * from finish();
rollback;
