begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;

select plan(11);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'rls-partner-a@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'rls-partner-b@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000003',
    'authenticated', 'authenticated', 'rls-superadmin@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'd1000000-0000-0000-0000-000000000004',
    'authenticated', 'authenticated', 'rls-issued-user@example.test', '',
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.users (id) values
  ('d1000000-0000-0000-0000-000000000001'),
  ('d1000000-0000-0000-0000-000000000002'),
  ('d1000000-0000-0000-0000-000000000003'),
  ('d1000000-0000-0000-0000-000000000004');

insert into public.partners (
  id, auth_user_id, name, logo_url, website_url
) values
  (
    'd2000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'RLS Partner A', 'https://example.test/rls-a.png', 'https://a.example.test'
  ),
  (
    'd2000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000002',
    'RLS Partner B', 'https://example.test/rls-b.png', 'https://b.example.test'
  );

insert into public.vouchers (
  id, user_id, name, image_url, is_public,
  partner_id, workflow_status, distribution_mode
) values
  (
    'd3000000-0000-0000-0000-000000000001',
    null,
    'RLS public classic', 'https://example.test/public.png', true,
    null, 'legacy', 'classic'
  ),
  (
    'd3000000-0000-0000-0000-000000000002',
    null,
    'RLS private classic', 'https://example.test/private.png', false,
    null, 'legacy', 'classic'
  ),
  (
    'd3000000-0000-0000-0000-000000000003',
    null,
    'RLS benefit A', 'https://example.test/benefit-a.png', false,
    'd2000000-0000-0000-0000-000000000001',
    'draft', 'guaranteed_purchase_benefit'
  ),
  (
    'd3000000-0000-0000-0000-000000000004',
    null,
    'RLS benefit B', 'https://example.test/benefit-b.png', false,
    'd2000000-0000-0000-0000-000000000002',
    'draft', 'guaranteed_purchase_benefit'
  );

insert into public.user_vouchers (
  id, user_id, voucher_id, redeemed, acquisition_source
) values
  (
    'd4000000-0000-0000-0000-000000000001',
    'd1000000-0000-0000-0000-000000000001',
    'd3000000-0000-0000-0000-000000000001',
    false,
    'favorite'
  ),
  (
    'd4000000-0000-0000-0000-000000000002',
    'd1000000-0000-0000-0000-000000000004',
    'd3000000-0000-0000-0000-000000000003',
    false,
    'guaranteed_purchase_benefit'
  );

create or replace function public.is_superadmin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user_id = 'd1000000-0000-0000-0000-000000000003'::uuid
$$;

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vouchers'
      and policyname = 'vouchers_anon_guaranteed_benefit_guard'
      and permissive = 'RESTRICTIVE'
  )
  and exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'vouchers'
      and policyname = 'vouchers_authenticated_guaranteed_benefit_guard'
      and permissive = 'RESTRICTIVE'
  ),
  'restrictive fail-closed voucher policies exist'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (
    select count(*)::integer
    from public.vouchers
    where id = 'd3000000-0000-0000-0000-000000000002'
  ),
  0,
  'anon cannot see an is_public=false classic voucher'
);

select is(
  (
    select count(*)::integer
    from public.vouchers
    where id in (
      'd3000000-0000-0000-0000-000000000003',
      'd3000000-0000-0000-0000-000000000004'
    )
  ),
  0,
  'anon cannot see any guaranteed purchase benefit'
);

select results_eq(
  $$
    select name
    from public.vouchers
    where id = 'd3000000-0000-0000-0000-000000000001'
  $$,
  $$ values ('RLS public classic'::text) $$,
  'a public classic voucher remains readable by anon'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-0000-0000-000000000001',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::integer
    from public.vouchers
    where id = 'd3000000-0000-0000-0000-000000000004'
  ),
  0,
  'authenticated partner cannot see another partner benefit'
);

select results_eq(
  $$
    select name
    from public.vouchers
    where id = 'd3000000-0000-0000-0000-000000000003'
  $$,
  $$ values ('RLS benefit A'::text) $$,
  'the owning partner can see its guaranteed purchase benefit'
);

select is(
  (
    select count(*)::integer
    from public.vouchers
    where id = 'd3000000-0000-0000-0000-000000000002'
  ),
  0,
  'authenticated users cannot browse private unassigned classic vouchers'
);

select results_eq(
  $$
    select v.name
    from public.user_vouchers uv
    join public.vouchers v on v.id = uv.voucher_id
    where uv.user_id = 'd1000000-0000-0000-0000-000000000001'
      and uv.acquisition_source = 'favorite'
  $$,
  $$ values ('RLS public classic'::text) $$,
  'existing favorite voucher joins remain readable'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-0000-0000-000000000004',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$
    select name
    from public.vouchers
    where id = 'd3000000-0000-0000-0000-000000000003'
  $$,
  $$ values ('RLS benefit A'::text) $$,
  'an issued user can see its guaranteed purchase benefit via user_vouchers'
);

reset role;
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'd1000000-0000-0000-0000-000000000003',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select count(*)::integer
    from public.vouchers
    where id in (
      'd3000000-0000-0000-0000-000000000001',
      'd3000000-0000-0000-0000-000000000002',
      'd3000000-0000-0000-0000-000000000003',
      'd3000000-0000-0000-0000-000000000004'
    )
  ),
  4,
  'superadmin can see classic and guaranteed vouchers'
);

reset role;

select ok(
  to_regprocedure('public.buy_ticket_atomic(uuid,uuid)') is not null,
  'existing ticket purchase RPC remains present'
);

select * from finish();
rollback;
