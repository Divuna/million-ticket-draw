-- Contract for keeping contest ticket sequencing out of public PostgREST.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;

select plan(19);

select has_view(
  'public',
  'public_contests',
  'the sanitized public contest view exists'
);

select ok(
  coalesce(
    (select 'security_invoker=true' = any(c.reloptions)
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'public_contests'),
    false
  ),
  'the public view executes with caller privileges'
);

select ok(
  not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'public_contests'
       and column_name = 'next_ticket_number'
  ),
  'the public view omits next_ticket_number'
);

select is(
  (
    select count(*)::integer
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'public_contests'
       and column_name ~* '(next.*ticket|ticket.*position|winning.*position)'
  ),
  0,
  'the public view exposes no ticket sequencing or future winning position'
);

select ok(
  not has_column_privilege('anon', 'public.contests', 'next_ticket_number', 'SELECT'),
  'anon cannot read contests.next_ticket_number'
);

select ok(
  not has_column_privilege('authenticated', 'public.contests', 'next_ticket_number', 'SELECT'),
  'authenticated customers cannot read contests.next_ticket_number'
);

select ok(
  has_column_privilege('anon', 'public.contests', 'id', 'SELECT'),
  'anon has the safe source-column privilege needed by the public view'
);

select ok(
  has_column_privilege('authenticated', 'public.contests', 'id', 'SELECT'),
  'authenticated has the safe source-column privilege needed by the public view'
);

select ok(
  has_table_privilege('anon', 'public.public_contests', 'SELECT'),
  'anon can query the sanitized public view'
);

select ok(
  has_table_privilege('authenticated', 'public.public_contests', 'SELECT'),
  'authenticated can query the sanitized public view'
);

select ok(
  has_column_privilege('service_role', 'public.contests', 'next_ticket_number', 'SELECT'),
  'service role retains direct internal read access'
);

insert into auth.users (id, email) values
  ('d0000001-0000-4000-8000-000000000001', 'contest-customer@onemil.test'),
  ('d0000002-0000-4000-8000-000000000002', 'contest-superadmin@onemil.test');

insert into public.users (id, email) values
  ('d0000001-0000-4000-8000-000000000001', 'contest-customer@onemil.test'),
  ('d0000002-0000-4000-8000-000000000002', 'contest-superadmin@onemil.test');

insert into public.user_roles (user_id, role) values
  ('d0000002-0000-4000-8000-000000000002', 'superadmin');

insert into public.contests (
  id,
  title,
  main_prize,
  name,
  next_ticket_number
) values (
  'd0000003-0000-4000-8000-000000000003',
  'Privacy contract contest',
  'Privacy contract prize',
  'Privacy contract contest',
  37
);

set role anon;
select set_config('request.jwt.claim.role', 'anon', true);
select set_config('request.jwt.claim.sub', '', true);

select throws_ok(
  $$select next_ticket_number from public.contests limit 1$$,
  '42501',
  null,
  'an anonymous direct API projection of next_ticket_number is denied'
);

select lives_ok(
  $$select id, title, main_prize, ticket_count from public.public_contests limit 1$$,
  'the anonymous sanitized contest contract works'
);

set role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'd0000001-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select next_ticket_number from public.contests limit 1$$,
  '42501',
  null,
  'an authenticated customer direct projection of next_ticket_number is denied'
);

select lives_ok(
  $$select id, title, main_prize, ticket_count from public.public_contests limit 1$$,
  'the authenticated sanitized contest contract works'
);

select throws_ok(
  $$select * from public.get_contest_ticket_state_internal(
    array['d0000003-0000-4000-8000-000000000003'::uuid]
  )$$,
  '42501',
  'Superadmin or service role required',
  'an authenticated customer cannot call the internal ticket-state RPC'
);

select set_config('request.jwt.claim.sub', 'd0000002-0000-4000-8000-000000000002', true);

select is(
  (
    select next_ticket_number
      from public.get_contest_ticket_state_internal(
        array['d0000003-0000-4000-8000-000000000003'::uuid]
      )
  ),
  37,
  'a superadmin can inspect the internal ticket state through the guarded RPC'
);

reset role;
set role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);

select is(
  (
    select next_ticket_number
      from public.contests
     where id = 'd0000003-0000-4000-8000-000000000003'
  ),
  37,
  'service role retains direct internal table access'
);

select is(
  (
    select next_ticket_number
      from public.get_contest_ticket_state_internal(
        array['d0000003-0000-4000-8000-000000000003'::uuid]
      )
  ),
  37,
  'service role can inspect internal ticket state through the guarded RPC'
);

reset role;

select * from finish();
rollback;
