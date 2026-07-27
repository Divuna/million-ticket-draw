-- Kontrakt own-row RLS pro `public.user_contest_favorites`.
--
-- Baseline fixture zakládá tabulku v driftnutém stavu (RLS zapnuté, nula
-- policies, `anon` s granty), takže tenhle test ověřuje jak strukturu, kterou
-- migrace 20260727170000 vytvoří, tak skutečné chování: vlastník vidí a maže
-- jen své řádky, cizí přihlášený uživatel neuvidí, nevloží ani nesmaže nic.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;

select plan(13);

-- ── Struktura ─────────────────────────────────────────────────────────────

select is(
  (select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'user_contest_favorites'),
  3,
  'the table carries exactly three policies'
);

select is(
  (select count(*)::integer from pg_policies
    where schemaname = 'public' and tablename = 'user_contest_favorites'
      and cmd = 'UPDATE'),
  0,
  'no UPDATE policy exists — favourites are added and removed, never rewritten'
);

select ok(
  (select relrowsecurity from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'user_contest_favorites'),
  'row level security stays enabled'
);

select is(
  (select roles::text || ' | ' || permissive || ' | ' || qual
     from pg_policies
    where schemaname = 'public' and tablename = 'user_contest_favorites'
      and policyname = 'user_contest_favorites_select_own'),
  '{authenticated} | PERMISSIVE | (user_id = auth.uid())',
  'SELECT policy is permissive, authenticated-only and own-row'
);

select is(
  (select roles::text || ' | ' || permissive || ' | ' || with_check
     from pg_policies
    where schemaname = 'public' and tablename = 'user_contest_favorites'
      and policyname = 'user_contest_favorites_insert_own'),
  '{authenticated} | PERMISSIVE | (user_id = auth.uid())',
  'INSERT policy checks the row belongs to the caller'
);

select is(
  (select roles::text || ' | ' || permissive || ' | ' || qual
     from pg_policies
    where schemaname = 'public' and tablename = 'user_contest_favorites'
      and policyname = 'user_contest_favorites_delete_own'),
  '{authenticated} | PERMISSIVE | (user_id = auth.uid())',
  'DELETE policy is own-row'
);

select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'user_contest_favorites'
      and grantee = 'anon'),
  0,
  'anon holds no privileges on the favourites table'
);

-- ── Chování ───────────────────────────────────────────────────────────────
-- Dva vlastníci a jedna soutěž. FK na auth.users se pro seed obchází, aby test
-- nemusel zakládat plnohodnotné auth účty.

insert into public.contests (id, title, main_prize)
values ('c0000001-0000-4000-8000-000000000001', 'RLS fixture contest', 'RLS fixture prize');

set session_replication_role = replica;
insert into public.user_contest_favorites (user_id, contest_id) values
  ('a0000001-0000-4000-8000-000000000001', 'c0000001-0000-4000-8000-000000000001'),
  ('b0000002-0000-4000-8000-000000000002', 'c0000001-0000-4000-8000-000000000001');
set session_replication_role = origin;

set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000001-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::integer from public.user_contest_favorites),
  1,
  'the owner sees exactly their own favourite, never the other user''s'
);

select set_config('request.jwt.claim.sub', 'b0000002-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::integer from public.user_contest_favorites
    where user_id = 'a0000001-0000-4000-8000-000000000001'),
  0,
  'a different signed-in user cannot read a foreign favourite'
);

with attempted as (
  delete from public.user_contest_favorites
   where user_id = 'a0000001-0000-4000-8000-000000000001'
  returning 1
)
select is(
  (select count(*)::integer from attempted),
  0,
  'a different signed-in user cannot delete a foreign favourite'
);

select throws_ok(
  $$insert into public.user_contest_favorites (user_id, contest_id)
    values ('a0000001-0000-4000-8000-000000000001', 'c0000001-0000-4000-8000-000000000001')$$,
  '42501',
  null,
  'a different signed-in user cannot insert a row owned by someone else'
);

-- Vlastník naopak svoje řádky spravovat smí.
select set_config('request.jwt.claim.sub', 'a0000001-0000-4000-8000-000000000001', true);

with removed as (
  delete from public.user_contest_favorites
   where user_id = 'a0000001-0000-4000-8000-000000000001'
  returning 1
)
select is(
  (select count(*)::integer from removed),
  1,
  'the owner can remove their own favourite'
);

select lives_ok(
  $$insert into public.user_contest_favorites (user_id, contest_id)
    values ('a0000001-0000-4000-8000-000000000001', 'c0000001-0000-4000-8000-000000000001')$$,
  'the owner can add a favourite for themselves'
);

reset role;

select * from finish();
rollback;
