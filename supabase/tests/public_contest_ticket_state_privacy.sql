-- Contract for keeping contest ticket sequencing out of public PostgREST.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;

select plan(37);

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

select is(
  (
    select count(*)::integer
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) acl
     where n.nspname = 'public'
       and p.proname in (
         'get_contests_json',
         'get_contest_bonus_stats',
         'get_contest_bonus_stats_enhanced'
       )
       and acl.grantee = 0
       and acl.privilege_type = 'EXECUTE'
  ),
  0,
  'PUBLIC has no EXECUTE privilege on any legacy contest-position RPC'
);

select ok(
  not has_function_privilege('anon', 'public.get_contests_json()', 'EXECUTE'),
  'anon cannot execute get_contests_json'
);

select ok(
  not has_function_privilege('authenticated', 'public.get_contests_json()', 'EXECUTE'),
  'authenticated cannot execute legacy get_contests_json'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_contest_bonus_stats_enhanced(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute get_contest_bonus_stats_enhanced'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_contest_bonus_stats_enhanced(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute legacy get_contest_bonus_stats_enhanced'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_contest_bonus_stats(uuid)',
    'EXECUTE'
  ),
  'anon cannot execute get_contest_bonus_stats'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_contest_bonus_stats(uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute legacy get_contest_bonus_stats'
);

select ok(
  has_function_privilege('service_role', 'public.get_contests_json()', 'EXECUTE')
  and has_function_privilege(
    'service_role',
    'public.get_contest_bonus_stats(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.get_contest_bonus_stats_enhanced(uuid)',
    'EXECUTE'
  ),
  'service role retains all three internal contest-inspection RPCs'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_contests_json_internal_superadmin()',
    'EXECUTE'
  ),
  'authenticated role can reach the separately guarded superadmin endpoint'
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

insert into public.bonus_prizes (
  id,
  contest_id,
  description,
  ticket_position,
  status,
  amount
) values (
  'd0000004-0000-4000-8000-000000000004',
  'd0000003-0000-4000-8000-000000000003',
  'Internal future bonus',
  23,
  'pending',
  10
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

select throws_ok(
  $$select public.get_contests_json()$$,
  '42501',
  null,
  'anon cannot call the legacy contest JSON RPC directly'
);

select throws_ok(
  $$select * from public.get_contest_bonus_stats_enhanced(
    'd0000003-0000-4000-8000-000000000003'
  )$$,
  '42501',
  null,
  'anon cannot call the enhanced future-position RPC directly'
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
  $$select public.get_contests_json()$$,
  '42501',
  null,
  'an authenticated customer cannot call legacy get_contests_json'
);

select throws_ok(
  $$select * from public.get_contest_bonus_stats_enhanced(
    'd0000003-0000-4000-8000-000000000003'
  )$$,
  '42501',
  null,
  'an authenticated customer cannot call the enhanced future-position RPC'
);

select throws_ok(
  $$select public.get_contests_json_internal_superadmin()$$,
  '42501',
  'Superadmin required',
  'an authenticated customer cannot call the guarded superadmin endpoint'
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
    public.get_contests_json_internal_superadmin()
      -> 0
      -> 'bonus_tickets'
      ->> 0
  )::integer,
  23,
  'a superadmin can inspect future positions through the guarded endpoint'
);

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
    public.get_contests_json()
      -> 0
      -> 'bonus_tickets'
      ->> 0
  )::integer,
  23,
  'service role can still use the legacy internal contest JSON RPC'
);

select is(
  (
    select min_position
      from public.get_contest_bonus_stats_enhanced(
        'd0000003-0000-4000-8000-000000000003'
      )
  ),
  23,
  'service role can still inspect enhanced internal bonus positions'
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

select is(
  (
    select count(*)::integer
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and (
         has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       )
       and pg_get_functiondef(p.oid) ~* (
         'ticket_number|ticket_position|next_ticket_number|'
         'next_bonus_position|bonus_tickets|main_prize_ticket|'
         'first_20_positions|min_position|max_position'
       )
       and p.proname not in (
         'buy_ticket_public',
         'purchase_guaranteed_benefit_bundle_public'
       )
       and pg_get_functiondef(p.oid)
         !~* 'is_superadmin\s*\(\s*auth\.uid\s*\(\s*\)\s*\)'
  ),
  0,
  'no unguarded customer-executable SECURITY DEFINER function exposes internal ticket state'
);

select * from finish();
rollback;
