-- Runtime privacy and purchase contracts for historical winner notes and the
-- service-role Edge purchase bridge.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;

create temporary table winner_note_sanitizer_variants (
  case_id integer generated always as identity,
  note_text text not null
);

insert into winner_note_sanitizer_variants (note_text) values
  ('Sluchátka #34'),
  ('Sluchátka # 34'),
  ('Sluchátka, tiket 34'),
  ('Sluchátka, TIKET:34'),
  ('Sluchátka, tiket č. 34'),
  ('Sluchátka, číslo tiketu 34'),
  ('Sluchátka, číslo tiketu: 34'),
  ('Sluchátka, ticket_number=34'),
  ('Sluchátka, ticket-position 34'),
  ('Sluchátka, ticket_position:34'),
  ('Sluchátka, 34. tiket'),
  ('Sluchátka, 34 tiket'),
  ('Sluchátka, tiket číslo 34'),
  ('Sluchátka, pozice 34'),
  ('Sluchátka, pozici 34'),
  ('Sluchátka, pořadí 34'),
  ('Sluchátka, poradi:34'),
  ('Sluchátka, 34. pozice'),
  ('Sluchátka, 34 pozici'),
  ('Výhra na 34. pozici'),
  ('Výhra – pozice: 34'),
  ('Sluchátka, 34. pořadí'),
  ('Sluchátka, pořadové číslo 34'),
  ('Sluchátka, tiket—34'),
  ('Sluchátka, ticket34'),
  ('Headphones, ticket 34'),
  ('Headphones, ticket #34'),
  ('Headphones, ticket no. 34'),
  ('Headphones, ticket number 34'),
  ('Headphones, ticket-number:34'),
  ('Headphones, ticket_position 34'),
  ('Headphones, position 34'),
  ('Headphones, position: 34'),
  ('Headphones, 34th position'),
  ('Headphones, 34 th position'),
  ('Headphones, 34. position'),
  ('Prize at position 34'),
  ('Winner on the 34th position'),
  ('Headphones, 34th ticket'),
  ('Headphones, ticket thirty-four'),
  ('Headphones, thirty-fourth position'),
  (E'Headphones, TICKET NUMBER:\t34'),
  ('Sluchátka, Pozice---34'),
  ('Sluchátka #000034'),
  ('Sluchátka, tiket 1 234'),
  ('Headphones, ticket 1,234'),
  ('Headphones, ticket 1.234'),
  ('Headphones, ticket 1-234'),
  ('Sluchátka, číslo   tiketu :: 34'),
  ('iPhone 15 Pro – výhra na 34. pozici');

create temporary table winner_note_spelled_order_variants (
  case_id integer generated always as identity,
  note_text text not null
);

insert into winner_note_spelled_order_variants (note_text) values
  ('Výhra na třicáté čtvrté příčce'),
  ('Výhra na třicátém čtvrtém místě'),
  ('Třicátá čtvrtá pozice přinesla výhru'),
  ('Třicátý čtvrtý tiket vyhrál'),
  ('Tiket třicet čtyři'),
  ('Tiket třicátý čtvrtý'),
  ('Pozice třicet čtyři'),
  ('Pořadí třicet čtyři'),
  ('Příčka třicátá čtvrtá'),
  ('Místo třicáté čtvrté'),
  ('výherní slot třicet čtyři'),
  ('číslo tiketu třicet čtyři'),
  ('třicet-čtyři – výherní tiket'),
  ('třicátá-čtvrtá: výherní příčka'),
  ('výhra, příčka: třicátá čtvrtá'),
  ('na místě číslo třicet čtyři'),
  ('první výherní pozice'),
  ('druhá výherní příčka'),
  ('sto dvacátý pátý tiket'),
  ('tiket tisíc dvě stě třicet čtyři'),
  ('won at rank thirty-four'),
  ('thirty-fourth place won'),
  ('position thirty four'),
  ('thirty fourth position'),
  ('ticket thirty-four'),
  ('thirty-fourth ticket'),
  ('rank: thirty-four'),
  ('thirty-four — winning rank'),
  ('place thirty fourth'),
  ('thirty fourth place'),
  ('slot thirty-four'),
  ('thirty-fourth slot'),
  ('ticket number thirty four'),
  ('number thirty-four ticket'),
  ('the first winning position'),
  ('second place winner'),
  ('one hundred twenty-third ticket'),
  ('ticket one thousand two hundred'),
  ('winner at the ninetieth rank'),
  ('eighty eighth place winner');

select plan(124);

select is(
  public.sanitize_winner_note_public('Sluchátka #34'),
  'Sluchátka',
  'hash ticket number is removed from a historical note'
);

select is(
  public.sanitize_winner_note_public('Sluchátka, tiket 34'),
  'Sluchátka',
  'Czech natural-language ticket number is removed'
);

select is(
  public.sanitize_winner_note_public('Sluchátka — ticket no. 34'),
  'Sluchátka',
  'English natural-language ticket number is removed'
);

select is(
  public.sanitize_winner_note_public('Sluchátka; číslo tiketu: 34'),
  'Sluchátka',
  'labelled Czech ticket number is removed'
);

select is(
  public.sanitize_winner_note_public('Sluchátka | ticket_number=34'),
  'Sluchátka',
  'database field-name format is removed'
);

select is(
  public.sanitize_winner_note_public('Sluchátka {"ticket_number":"34"}'),
  'Sluchátka',
  'JSON-like historical ticket field is removed'
);

select is(
  public.sanitize_winner_note_public('Sluchátka, 34. tiket'),
  'Sluchátka',
  'reversed ticket-order format is removed'
);

select is(
  public.sanitize_winner_note_public('Výhra na 34. pozici'),
  'Výhra',
  'a Czech number-before-position phrase preserves only meaningful public text'
);

select is(
  public.sanitize_winner_note_public('position 34'),
  null,
  'an English position-before-number phrase cannot expose a numeric value'
);

select ok(
  coalesce(
    public.sanitize_winner_note_public(note_text) !~ '[[:digit:]]'
    and public.sanitize_winner_note_public(note_text) !~* (
      'ticket|tiket|pozic|position|pořad|porad|'
      'ticket_number|ticket_position|číslo|cislo'
    ),
    true
  ),
  format(
    'generated Czech/English winner-note variant %s has no public sequence token: %s',
    case_id,
    note_text
  )
)
from winner_note_sanitizer_variants
order by case_id;

select is(
  public.sanitize_winner_note_public(note_text),
  null,
  format(
    'fully textual Czech/English ordering fails closed: %s',
    note_text
  )
)
from winner_note_spelled_order_variants
order by case_id;

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'winners'
  ),
  'raw winners rows are absent from the public Realtime publication'
);

select ok(
  not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'contests'
  ),
  'raw contest sequence state is absent from the public Realtime publication'
);

select ok(
  not has_column_privilege('anon', 'public.winners', 'notes', 'SELECT'),
  'raw winners.notes is not selectable by anon'
);

select ok(
  not has_column_privilege('authenticated', 'public.winners', 'notes', 'SELECT'),
  'raw winners.notes is not selectable by authenticated customers'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_bonus_prizes'
      and column_name in ('status', 'ticket_position')
  ),
  'public bonus catalogue exposes neither lifecycle status nor ticket position'
);

select ok(
  has_table_privilege('anon', 'public.public_bonus_prizes', 'SELECT')
  and has_table_privilege('authenticated', 'public.public_bonus_prizes', 'SELECT'),
  'anon and authenticated customers can still read the sanitized bonus catalogue'
);

select ok(
  not has_column_privilege('anon', 'public.bonus_prizes', 'status', 'SELECT')
  and not has_column_privilege('anon', 'public.bonus_prizes', 'ticket_position', 'SELECT'),
  'anon cannot bypass the catalogue to read internal bonus state'
);

select ok(
  not has_column_privilege('authenticated', 'public.bonus_prizes', 'status', 'SELECT')
  and not has_column_privilege('authenticated', 'public.bonus_prizes', 'ticket_position', 'SELECT'),
  'authenticated customers cannot bypass the catalogue to read internal bonus state'
);

select is(
  (
    select public
    from storage.buckets
    where id = 'ticket-shares'
  ),
  false,
  'historical ticket share objects are no longer in a public bucket'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public can view ticket share images'
  ),
  'historical ticket share objects have no public read policy'
);

select ok(
  has_column_privilege('authenticated', 'public.winners', 'id', 'SELECT')
  and has_column_privilege('authenticated', 'public.winners', 'status', 'SELECT'),
  'safe winner columns remain available for customer count/status operations'
);

select ok(
  not exists (
    select 1
    from aclexplode(
      coalesce(
        (select proacl from pg_proc where oid = 'public.get_my_wins_public()'::regprocedure),
        acldefault(
          'f',
          (select proowner from pg_proc where oid = 'public.get_my_wins_public()'::regprocedure)
        )
      )
    ) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  )
  and not has_function_privilege('anon', 'public.get_my_wins_public()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_my_wins_public()', 'EXECUTE'),
  'only authenticated customers can execute the sanitized own-wins contract'
);

select ok(
  not exists (
    select 1
    from aclexplode(
      coalesce(
        (select proacl from pg_proc where oid = 'public.buy_ticket_atomic_service(uuid,uuid)'::regprocedure),
        acldefault(
          'f',
          (select proowner from pg_proc where oid = 'public.buy_ticket_atomic_service(uuid,uuid)'::regprocedure)
        )
      )
    ) acl
    where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  )
  and not has_function_privilege('anon', 'public.buy_ticket_atomic_service(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.buy_ticket_atomic_service(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.buy_ticket_atomic_service(uuid,uuid)', 'EXECUTE'),
  'the Edge purchase bridge is service-role-only'
);

insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'notes-customer@onemil.test'),
  ('e1000000-0000-4000-8000-000000000002', 'notes-superadmin@onemil.test');

insert into public.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'notes-customer@onemil.test'),
  ('e1000000-0000-4000-8000-000000000002', 'notes-superadmin@onemil.test');

insert into public.user_roles (user_id, role) values
  ('e1000000-0000-4000-8000-000000000002', 'superadmin');

insert into public.contests (
  id, title, name, main_prize, status, ticket_price, ticket_count,
  next_ticket_number
) values (
  'e2000000-0000-4000-8000-000000000001',
  'Edge purchase privacy test',
  'Edge purchase privacy test',
  'Main prize',
  'active',
  10,
  100,
  1
);

insert into public.wallets (id, user_id, balance_coins) values (
  'e3000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  100
);

insert into public.winners (
  id, contest_id, user_id, type, notes, status, delivered, user_seen
) values (
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'bonus',
  'Sluchátka — číslo tiketu: 34',
  'pending',
  false,
  false
);

set role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select notes from public.winners where id = 'e4000000-0000-4000-8000-000000000001'$$,
  '42501',
  null,
  'customer cannot project the untouched internal note'
);

select is(
  (
    select public_notes
    from public.get_my_wins_public()
    where id = 'e4000000-0000-4000-8000-000000000001'
  ),
  'Sluchátka',
  'customer receives the historical note without its ticket number'
);

select is(
  (
    select count(*)::integer
    from public.get_my_wins_public()
    where public_notes ~* (
      '#[[:space:]]*[0-9]+|ticket_number|ticket_position|'
      '(ticket|tiket)[^[:digit:]]{0,24}[0-9]+'
    )
  ),
  0,
  'sanitized customer payload contains no recognised ticket sequence'
);

select throws_ok(
  $$select * from public.get_winner_internal_notes_superadmin(
    array['e4000000-0000-4000-8000-000000000001'::uuid]
  )$$,
  '42501',
  'Superadmin required',
  'ordinary customer cannot read the internal-note endpoint'
);

select throws_ok(
  $$select public.buy_ticket_atomic(
    'e1000000-0000-4000-8000-000000000001',
    'e2000000-0000-4000-8000-000000000001'
  )$$,
  '42501',
  null,
  'customer still cannot execute the internal atomic purchase directly'
);

select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);

select is(
  (
    select notes
    from public.get_winner_internal_notes_superadmin(
      array['e4000000-0000-4000-8000-000000000001'::uuid]
    )
  ),
  'Sluchátka — číslo tiketu: 34',
  'superadmin sees the untouched original historical note'
);

reset role;
select is(
  (
    select notes
    from public.winners
    where id = 'e4000000-0000-4000-8000-000000000001'
  ),
  'Sluchátka — číslo tiketu: 34',
  'sanitization never overwrites stored audit data'
);

set role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

create temporary table edge_purchase_result(result jsonb);
grant select, insert on edge_purchase_result to service_role;

insert into edge_purchase_result(result)
select public.buy_ticket_atomic_service(
  p_user_id => 'e1000000-0000-4000-8000-000000000001',
  p_contest_id => 'e2000000-0000-4000-8000-000000000001'
);

select is(
  (select (result->>'success')::boolean from edge_purchase_result),
  true,
  'service-role Edge bridge completes the classic purchase'
);

select is(
  (
    select balance_coins
    from public.wallets
    where user_id = 'e1000000-0000-4000-8000-000000000001'
  ),
  90::numeric,
  'Edge bridge deducts exactly the contest ticket price'
);

select is(
  (
    select count(*)::integer
    from public.tickets
    where contest_id = 'e2000000-0000-4000-8000-000000000001'
      and user_id = 'e1000000-0000-4000-8000-000000000001'
  ),
  1,
  'Edge bridge creates exactly one ticket for the verified customer'
);

select is(
  current_setting('request.jwt.claim.sub', true),
  '',
  'service bridge restores the request identity after the atomic call'
);

select is(
  (
    select notes
    from public.winners
    where id = 'e4000000-0000-4000-8000-000000000001'
  ),
  'Sluchátka — číslo tiketu: 34',
  'service role retains direct access to the original internal note'
);

reset role;

select * from finish();
rollback;
