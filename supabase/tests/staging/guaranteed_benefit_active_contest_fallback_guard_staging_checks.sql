-- Funkční ověření ochrany aktivní soutěže před ztrátou posledního
-- neomezeného garantovaného benefitu proti STAGINGU `dxmowysntemfqfnanxua`.
--
-- Každý blok běží v transakci, která KONČÍ `rollback` — staging data se nemění.
-- Bloky pouštět JEDNOTLIVĚ; sdílejí testovací UUID prefixem `2a`/`2b`/`2c`.
--
-- PASTI (ověřeno při psaní, neopakovat):
--   * Guard trigger je AFTER, ne BEFORE — u INSERTu rovnou jako `active` ještě
--     neexistuje řádek v `contests`, když BEFORE trigger běží, takže pokus
--     o FK insert do `voucher_distribution_contests` by vždy selhal. AFTER
--     trigger vidí vlastní právě-vloženou řádku uvnitř téže transakce a při
--     RAISE EXCEPTION rollbackne celou transakci (i ten INSERT).
--   * Trigger `trg_require_unlimited_benefit_for_active_contest` je vázán na
--     `AFTER INSERT OR UPDATE OF status` — musí se jmenovat abecedně AŽ PO
--     `trg_link_guaranteed_benefits_to_contest`, jinak by guard viděl stav
--     PŘED existující (nefatální) synchronizací.
--   * Test "INSERT rovnou jako active bez benefitu" musí běžet v transakci,
--     kde JEŠTĚ neexistuje žádný approved `all_contests` neomezený benefit —
--     jinak ho takový dřív vytvořený benefit (v téže transakci) automaticky
--     pokryje a test dá falešně "NO_ERROR". Vždy nejdřív ověřit
--     `select count(*) from voucher_distribution_orders … all_contests …` = 0.
--   * `admin_set_benefit_distribution` s `p_scope='selected_contests'` a
--     PRÁZDNÝM polem vrací `contest_selection_required` DŘÍV, než se vůbec
--     dostane k novému guardu — pro test "odebrání poslední soutěže ze
--     selected_contests" použít NEPRÁZDNÉ pole, které aktivní soutěž
--     jen vynechává (např. jinou soutěž, nebo placeholder UUID).
--   * Kontrolovat stav HNED po odmítnutém volání, ne až po dalších voláních
--     ve stejné transakci — jinak pozdější (povolené) volání kontaminuje
--     assertion na "nic se nezměnilo".

-- ===========================================================================
-- BLOK 1 — základní blokace aktivace (žádný / jen omezený / neomezený benefit)
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;

insert into auth.users(id) values ('2a000000-0000-4000-8000-0000000000ad');
insert into public.users(id, email) values ('2a000000-0000-4000-8000-0000000000ad','gb-guard-admin@onemil.test');
insert into public.user_roles(user_id, role) values ('2a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('2a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('2b000000-0000-4000-8000-000000000001','GB GUARD PARTNER','GB GUARD PARTNER s.r.o.','','',true,'guaranteed_benefit');

-- T1: soutez bez jakehokoli benefitu -> aktivace ma selhat
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-000000000001','GUARD T1 NONE','GUARD T1 NONE','V','pending',10,1000,1,'https://example.com/t1.pdf');

do $blk$
declare v_err text;
begin
  begin
    update public.contests set status='active' where id='2c000000-0000-4000-8000-000000000001';
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  insert into t_env(k,v) values ('t1_activate', v_err);
end $blk$;

-- T2: soutez jen s omezenym benefitem -> aktivace ma selhat
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-000000000002','GUARD T2 LIMITED ONLY','GUARD T2 LIMITED ONLY','V','pending',10,1000,1,'https://example.com/t2.pdf');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 't2_limited', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'T2 LIMITED',
   p_how_to_use => 'Kod', p_terms => 'P', p_is_unlimited => false, p_codes => array['T2-LIM-1'],
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['2c000000-0000-4000-8000-000000000002']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;

do $blk$
declare v_err text;
begin
  begin
    update public.contests set status='active' where id='2c000000-0000-4000-8000-000000000002';
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  insert into t_env(k,v) values ('t2_activate', v_err);
end $blk$;

-- T3: soutez s neomezenym benefitem -> aktivace ma projit
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-000000000003','GUARD T3 UNLIMITED','GUARD T3 UNLIMITED','V','pending',10,1000,1,'https://example.com/t3.pdf');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 't3_unlimited', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'T3 UNLIMITED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/t3-shared',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['2c000000-0000-4000-8000-000000000003']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;

do $blk$
declare v_err text;
begin
  begin
    update public.contests set status='active' where id='2c000000-0000-4000-8000-000000000003';
    v_err := 'OK';
  exception when others then v_err := sqlerrm;
  end;
  insert into t_env(k,v) values ('t3_activate', v_err);
end $blk$;

select * from (values
 ('T1 aktivace bez benefitu selze', (select case when v like '%chybi schvaleny neomezeny%' then 'BLOCKED' else v end from t_env where k='t1_activate'), 'BLOCKED'),
 ('T2 aktivace jen s omezenym benefitem selze', (select case when v like '%chybi schvaleny neomezeny%' then 'BLOCKED' else v end from t_env where k='t2_activate'), 'BLOCKED'),
 ('T3 aktivace s neomezenym benefitem projde', (select v from t_env where k='t3_activate'), 'OK'),
 ('T3b soutez je opravdu active', (select status from public.contests where id='2c000000-0000-4000-8000-000000000003'), 'active'),
 ('T1b soutez zustala pending', (select status from public.contests where id='2c000000-0000-4000-8000-000000000001'), 'pending'),
 ('T2b soutez zustala pending', (select status from public.contests where id='2c000000-0000-4000-8000-000000000002'), 'pending')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK 2A — synchronizace před kontrolou (all_contests bez existující vazby)
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;

insert into auth.users(id) values ('2a000000-0000-4000-8000-0000000000ad');
insert into public.users(id, email) values ('2a000000-0000-4000-8000-0000000000ad','gb-guard-admin@onemil.test');
insert into public.user_roles(user_id, role) values ('2a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('2a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('2b000000-0000-4000-8000-000000000001','GB GUARD PARTNER','GB GUARD PARTNER s.r.o.','','',true,'guaranteed_benefit');

-- Soutez existuje jako DRAFT PŘED benefitem (draft neni active/pending, takze
-- existujici sync trigger na contests se pri vzniku benefitu vubec nespusti).
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-000000000004','GUARD T4 DRAFT SYNC','GUARD T4 DRAFT SYNC','V','draft',10,1000,1,'https://example.com/t4.pdf');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 't4_unlimited_allc', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'T4 UNLIMITED ALL_CONTESTS',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/t4-shared',
   p_distribution_scope => 'all_contests',
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;

insert into t_env(k,v) select 't4_link_before',
  (select count(*)::text from public.voucher_distribution_contests
   where order_id = (select (v::jsonb->>'order_id')::uuid from t_env where k='t4_unlimited_allc')
     and contest_id = '2c000000-0000-4000-8000-000000000004');

do $blk$
declare v_err text;
begin
  begin
    update public.contests set status='active' where id='2c000000-0000-4000-8000-000000000004';
    v_err := 'OK';
  exception when others then v_err := sqlerrm;
  end;
  insert into t_env(k,v) values ('t4_activate', v_err);
end $blk$;

insert into t_env(k,v) select 't4_link_after',
  (select count(*)::text from public.voucher_distribution_contests
   where order_id = (select (v::jsonb->>'order_id')::uuid from t_env where k='t4_unlimited_allc')
     and contest_id = '2c000000-0000-4000-8000-000000000004' and detached_at is null);

select * from (values
 ('T4 link neexistuje pred aktivaci (draft nikdy nebyla active/pending)', (select v from t_env where k='t4_link_before'), '0'),
 ('T4 aktivace draft->active projde (sync + kontrola)', (select v from t_env where k='t4_activate'), 'OK'),
 ('T4 po aktivaci link EXISTUJE (guard ho domaterializoval)', (select v from t_env where k='t4_link_after'), '1')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK 2B — draft/pending povoleny, běžný UPDATE, INSERT rovnou jako active
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;

-- Ověřit, že v reálném stagingu opravdu neexistuje předchozí approved
-- all_contests neomezený benefit, který by tento test kontaminoval.
insert into t_env(k,v) select 'preexisting_allc_unlimited',
  (select count(*)::text from public.voucher_distribution_orders o
   join public.vouchers v on v.id=o.voucher_id
   where o.status='approved' and o.is_unlimited and o.distribution_scope='all_contests'
     and v.distribution_mode='guaranteed_purchase_benefit');

insert into auth.users(id) values ('2a000000-0000-4000-8000-0000000000ad');
insert into public.users(id, email) values ('2a000000-0000-4000-8000-0000000000ad','gb-guard-admin@onemil.test');
insert into public.user_roles(user_id, role) values ('2a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('2a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('2b000000-0000-4000-8000-000000000001','GB GUARD PARTNER','GB GUARD PARTNER s.r.o.','','',true,'guaranteed_benefit');

-- T5: draft bez benefitu -> povolen
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-000000000005','GUARD T5 DRAFT NOBENEFIT','GUARD T5 DRAFT NOBENEFIT','V','draft',10,1000,1,'https://example.com/t5.pdf');

-- T6: pending bez benefitu -> povolen
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-000000000006','GUARD T6 PENDING NOBENEFIT','GUARD T6 PENDING NOBENEFIT','V','pending',10,1000,1,'https://example.com/t6.pdf');

-- T7: bezny UPDATE jiz aktivni souteze (napr. next_ticket_number) -> povolen
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-000000000007','GUARD T7 ORDINARY UPDATE','GUARD T7 ORDINARY UPDATE','V','pending',10,1000,1,'https://example.com/t7.pdf');
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 't7_unlimited', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'T7 UNLIMITED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/t7-shared',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['2c000000-0000-4000-8000-000000000007']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;
update public.contests set status='active' where id='2c000000-0000-4000-8000-000000000007';

do $blk$
declare v_err text;
begin
  begin
    update public.contests set next_ticket_number = next_ticket_number + 1 where id='2c000000-0000-4000-8000-000000000007';
    v_err := 'OK';
  exception when others then v_err := sqlerrm;
  end;
  insert into t_env(k,v) values ('t7_ordinary_update', v_err);
end $blk$;

-- T8: INSERT rovnou jako active bez ZADNEHO benefitu v cele DB -> odmitnuto
do $blk$
declare v_err text;
begin
  begin
    insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
    values ('2c000000-0000-4000-8000-000000000008','GUARD T8 INSERT ACTIVE NOBENEFIT','GUARD T8 INSERT ACTIVE NOBENEFIT','V','active',10,1000,1,'https://example.com/t8.pdf');
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  insert into t_env(k,v) values ('t8_insert_active', v_err);
end $blk$;

-- T9: az potom vznikne all_contests neomezeny benefit a INSERT active projde
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 't9_unlimited_allc', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'T9 UNLIMITED ALL_CONTESTS',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/t9-shared',
   p_distribution_scope => 'all_contests',
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;

do $blk$
declare v_err text;
begin
  begin
    insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
    values ('2c000000-0000-4000-8000-000000000009','GUARD T9 INSERT ACTIVE WITH ALLCONTESTS','GUARD T9 INSERT ACTIVE WITH ALLCONTESTS','V','active',10,1000,1,'https://example.com/t9.pdf');
    v_err := 'OK';
  exception when others then v_err := sqlerrm;
  end;
  insert into t_env(k,v) values ('t9_insert_active', v_err);
end $blk$;

select * from (values
 ('T0 zadny existujici all_contests unlimited benefit v DB pred testem', (select v from t_env where k='preexisting_allc_unlimited'), '0'),
 ('T5 draft bez benefitu zustava draft', (select status from public.contests where id='2c000000-0000-4000-8000-000000000005'), 'draft'),
 ('T6 pending bez benefitu zustava pending', (select status from public.contests where id='2c000000-0000-4000-8000-000000000006'), 'pending'),
 ('T7 bezny update jiz aktivni souteze projde', (select v from t_env where k='t7_ordinary_update'), 'OK'),
 ('T7b next_ticket_number se opravdu zmenil', (select next_ticket_number::text from public.contests where id='2c000000-0000-4000-8000-000000000007'), '2'),
 ('T8 INSERT rovnou jako active bez benefitu selze', (select case when v like '%chybi schvaleny neomezeny%' then 'BLOCKED' else v end from t_env where k='t8_insert_active'), 'BLOCKED'),
 ('T8b radek se vubec nevytvoril', (select count(*)::text from public.contests where id='2c000000-0000-4000-8000-000000000008'), '0'),
 ('T9 INSERT rovnou jako active s existujicim all_contests benefitem projde', (select v from t_env where k='t9_insert_active'), 'OK'),
 ('T9b soutez opravdu vznikla jako active', (select status from public.contests where id='2c000000-0000-4000-8000-000000000009'), 'active')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK 3A — ochrana posledního fallbacku: suspend/end/detach jediné vazby
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;

insert into auth.users(id) values ('2a000000-0000-4000-8000-0000000000ad');
insert into public.users(id, email) values ('2a000000-0000-4000-8000-0000000000ad','gb-guard-admin@onemil.test');
insert into public.user_roles(user_id, role) values ('2a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('2a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('2b000000-0000-4000-8000-000000000001','GB GUARD PARTNER','GB GUARD PARTNER s.r.o.','','',true,'guaranteed_benefit');

insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-00000000000a','GUARD U1 SOLE FALLBACK','GUARD U1 SOLE FALLBACK','V','pending',10,1000,1,'https://example.com/u1.pdf');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'sole', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'U1 SOLE UNLIMITED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/u1-shared',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['2c000000-0000-4000-8000-00000000000a']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;
update public.contests set status='active' where id='2c000000-0000-4000-8000-00000000000a';

-- U1a: pozastaveni jedineho neomezeneho fallbacku aktivni souteze -> odmitnuto
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'u1a_suspend', public.admin_set_guaranteed_benefit_status(
  (select (v::jsonb->>'order_id')::uuid from t_env where k='sole'), 'suspended', null)::text;
reset role;

-- U1b: ukonceni jedineho neomezeneho fallbacku aktivni souteze -> odmitnuto
set local role authenticated;
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
insert into t_env(k,v) select 'u1b_end', public.admin_set_guaranteed_benefit_status(
  (select (v::jsonb->>'order_id')::uuid from t_env where k='sole'), 'ended', null)::text;
reset role;

-- U1d: prepnuti all_contests -> selected_contests bez zahrnuti aktivni souteze -> odmitnuto
set local role authenticated;
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
insert into t_env(k,v) select 'u1d_switch_to_all', public.admin_set_benefit_distribution(
  (select (v::jsonb->>'order_id')::uuid from t_env where k='sole'), 'all_contests', null)::text;
insert into t_env(k,v) select 'u1d_switch_to_selected_without_u1', public.admin_set_benefit_distribution(
  (select (v::jsonb->>'order_id')::uuid from t_env where k='sole'), 'selected_contests',
  array['00000000-0000-4000-8000-000000000000']::uuid[])::text;
reset role;

select * from (values
 ('U1a pozastaveni jedineho fallbacku odmitnuto', (select v::jsonb->>'success' from t_env where k='u1a_suspend'), 'false'),
 ('U1a error kod', (select v::jsonb->>'error' from t_env where k='u1a_suspend'), 'would_leave_active_contest_without_unlimited_fallback'),
 ('U1a order zustal approved (zadny zapis)',
   (select status from public.voucher_distribution_orders where id=(select (v::jsonb->>'order_id')::uuid from t_env where k='sole')),
   'approved'),
 ('U1b ukonceni jedineho fallbacku odmitnuto', (select v::jsonb->>'success' from t_env where k='u1b_end'), 'false'),
 ('U1b error kod', (select v::jsonb->>'error' from t_env where k='u1b_end'), 'would_leave_active_contest_without_unlimited_fallback'),
 ('U1d prechod na all_contests (bez rizika) povolen', (select v::jsonb->>'success' from t_env where k='u1d_switch_to_all'), 'true'),
 ('U1d nasledny prechod all_contests->selected_contests bez aktivni souteze odmitnuto',
   (select v::jsonb->>'success' from t_env where k='u1d_switch_to_selected_without_u1'), 'false'),
 ('U1d error kod', (select v::jsonb->>'error' from t_env where k='u1d_switch_to_selected_without_u1'), 'would_leave_active_contest_without_unlimited_fallback'),
 ('U1d order zustal all_contests (odmitnuty prechod se nezapsal)',
   (select distribution_scope from public.voucher_distribution_orders where id=(select (v::jsonb->>'order_id')::uuid from t_env where k='sole')),
   'all_contests'),
 ('Soutez ma stale aktivni fallback po vsech odmitnutych pokusech',
   (select public.guaranteed_benefit_has_active_unlimited_fallback('2c000000-0000-4000-8000-00000000000a')::text), 'true')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK 3B — odebrání konkrétní aktivní soutěže ze selected_contests výběru
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;

insert into auth.users(id) values ('2a000000-0000-4000-8000-0000000000ad');
insert into public.users(id, email) values ('2a000000-0000-4000-8000-0000000000ad','gb-guard-admin@onemil.test');
insert into public.user_roles(user_id, role) values ('2a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('2a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('2b000000-0000-4000-8000-000000000001','GB GUARD PARTNER','GB GUARD PARTNER s.r.o.','','',true,'guaranteed_benefit');

insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values
 ('2c000000-0000-4000-8000-00000000000a','GUARD U1 SOLE FALLBACK','GUARD U1 SOLE FALLBACK','V','pending',10,1000,1,'https://example.com/u1.pdf'),
 ('2c000000-0000-4000-8000-00000000000b','GUARD U2 OTHER SELECTED','GUARD U2 OTHER SELECTED','V','pending',10,1000,1,'https://example.com/u2.pdf');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'sole', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'U1 SOLE UNLIMITED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/u1-shared',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['2c000000-0000-4000-8000-00000000000a','2c000000-0000-4000-8000-00000000000b']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;
update public.contests set status='active' where id='2c000000-0000-4000-8000-00000000000a';

-- U1c: zúžení výběru tak, že se odebere PRÁVĚ aktivní soutěž U1 (U2 zůstává) -> odmítnuto
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'u1c_remove_active', public.admin_set_benefit_distribution(
  (select (v::jsonb->>'order_id')::uuid from t_env where k='sole'), 'selected_contests',
  array['2c000000-0000-4000-8000-00000000000b']::uuid[])::text;
reset role;

insert into t_env(k,v) select 'u2_link_after_rejected_call',
  (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select (v::jsonb->>'order_id')::uuid from t_env where k='sole')
        and contest_id='2c000000-0000-4000-8000-00000000000b' and detached_at is null);

-- Kontrolní případ: zúžení výběru odebráním jen U2 (neaktivní) -> POVOLENO
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'u1c_remove_inactive', public.admin_set_benefit_distribution(
  (select (v::jsonb->>'order_id')::uuid from t_env where k='sole'), 'selected_contests',
  array['2c000000-0000-4000-8000-00000000000a']::uuid[])::text;
reset role;

select * from (values
 ('U1c odebrani AKTIVNI souteze z vyberu (jediny fallback) odmitnuto', (select v::jsonb->>'success' from t_env where k='u1c_remove_active'), 'false'),
 ('U1c error kod', (select v::jsonb->>'error' from t_env where k='u1c_remove_active'), 'would_leave_active_contest_without_unlimited_fallback'),
 ('U1c vazba na U1 zustala aktivni po odmitnutem volani',
   (select public.guaranteed_benefit_has_active_unlimited_fallback('2c000000-0000-4000-8000-00000000000a')::text), 'true'),
 ('U1c vazba na U2 zustala nedotcena HNED po odmitnutem volani (pred dalsim krokem)',
   (select v from t_env where k='u2_link_after_rejected_call'), '1'),
 ('Kontrola: odebrani NEAKTIVNI souteze (U2) je povoleno', (select v::jsonb->>'success' from t_env where k='u1c_remove_inactive'), 'true'),
 ('Po povolene akci U2 opravdu odpojena', (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select (v::jsonb->>'order_id')::uuid from t_env where k='sole')
        and contest_id='2c000000-0000-4000-8000-00000000000b' and detached_at is null), '0'),
 ('Po povolene akci U1 stale pripojena', (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select (v::jsonb->>'order_id')::uuid from t_env where k='sole')
        and contest_id='2c000000-0000-4000-8000-00000000000a' and detached_at is null), '1')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK 3C — existence druhého neomezeného benefitu akci povolí
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;

insert into auth.users(id) values ('2a000000-0000-4000-8000-0000000000ad');
insert into public.users(id, email) values ('2a000000-0000-4000-8000-0000000000ad','gb-guard-admin@onemil.test');
insert into public.user_roles(user_id, role) values ('2a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('2a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('2b000000-0000-4000-8000-000000000001','GB GUARD PARTNER','GB GUARD PARTNER s.r.o.','','',true,'guaranteed_benefit');

insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-00000000000c','GUARD U3 TWO FALLBACKS','GUARD U3 TWO FALLBACKS','V','pending',10,1000,1,'https://example.com/u3.pdf');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'first', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'U3 FIRST UNLIMITED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/u3-first',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['2c000000-0000-4000-8000-00000000000c']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
insert into t_env(k,v) select 'second', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'U3 SECOND UNLIMITED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/u3-second',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['2c000000-0000-4000-8000-00000000000c']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;
update public.contests set status='active' where id='2c000000-0000-4000-8000-00000000000c';

-- Pozastaveni PRVNIHO benefitu je povoleno, protoze existuje DRUHY
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'suspend_first_with_backup', public.admin_set_guaranteed_benefit_status(
  (select (v::jsonb->>'order_id')::uuid from t_env where k='first'), 'suspended', null)::text;
reset role;

-- Nyni je DRUHY posledni zbyvajici -> jeho pozastaveni ma byt odmitnuto
set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'suspend_second_now_sole', public.admin_set_guaranteed_benefit_status(
  (select (v::jsonb->>'order_id')::uuid from t_env where k='second'), 'suspended', null)::text;
reset role;

select * from (values
 ('U3a: pozastaveni PRVNIHO benefitu (existuje druhy) povoleno', (select v::jsonb->>'success' from t_env where k='suspend_first_with_backup'), 'true'),
 ('U3a order first je nyni suspended', (select status from public.voucher_distribution_orders where id=(select (v::jsonb->>'order_id')::uuid from t_env where k='first')), 'suspended'),
 ('U3a soutez ma stale fallback (druhy benefit)', (select public.guaranteed_benefit_has_active_unlimited_fallback('2c000000-0000-4000-8000-00000000000c')::text), 'true'),
 ('U3b: pozastaveni DRUHEHO (nyni jedineho) benefitu odmitnuto', (select v::jsonb->>'success' from t_env where k='suspend_second_now_sole'), 'false'),
 ('U3b error kod', (select v::jsonb->>'error' from t_env where k='suspend_second_now_sole'), 'would_leave_active_contest_without_unlimited_fallback'),
 ('U3b order second zustal approved', (select status from public.voucher_distribution_orders where id=(select (v::jsonb->>'order_id')::uuid from t_env where k='second')), 'approved')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK 4 — kill-switch
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;

update public.settings set value = 'false' where key = 'guaranteed_benefit_active_contest_guard_enabled';

insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-00000000000d','GUARD KS DISABLED','GUARD KS DISABLED','V','pending',10,1000,1,'https://example.com/ks.pdf');

do $blk$
declare v_err text;
begin
  begin
    update public.contests set status='active' where id='2c000000-0000-4000-8000-00000000000d';
    v_err := 'OK';
  exception when others then v_err := sqlerrm;
  end;
  insert into t_env(k,v) values ('ks_disabled_activate', v_err);
end $blk$;

update public.settings set value = 'true' where key = 'guaranteed_benefit_active_contest_guard_enabled';
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-00000000000e','GUARD KS REENABLED','GUARD KS REENABLED','V','pending',10,1000,1,'https://example.com/ks2.pdf');

do $blk$
declare v_err text;
begin
  begin
    update public.contests set status='active' where id='2c000000-0000-4000-8000-00000000000e';
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm;
  end;
  insert into t_env(k,v) values ('ks_reenabled_activate', v_err);
end $blk$;

select * from (values
 ('KS1 guard vypnuty: aktivace bez benefitu projde', (select v from t_env where k='ks_disabled_activate'), 'OK'),
 ('KS1b soutez opravdu active', (select status from public.contests where id='2c000000-0000-4000-8000-00000000000d'), 'active'),
 ('KS2 guard znovu zapnuty: aktivace bez benefitu opet selze',
   (select case when v like '%chybi schvaleny neomezeny%' then 'BLOCKED' else v end from t_env where k='ks_reenabled_activate'), 'BLOCKED')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK 5 — regrese Partner Offers a izolace
-- ===========================================================================
begin;
set local statement_timeout = '120s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;

insert into auth.users(id) values ('2a000000-0000-4000-8000-0000000000ad');
insert into public.users(id, email) values ('2a000000-0000-4000-8000-0000000000ad','gb-guard-admin@onemil.test');
insert into public.user_roles(user_id, role) values ('2a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('2a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('2b000000-0000-4000-8000-000000000001','GB GUARD PARTNER','GB GUARD PARTNER s.r.o.','','',true,'guaranteed_benefit');

set local request.jwt.claims = '{"sub":"2a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'allc', public.admin_create_guaranteed_benefit(
   p_partner_id => '2b000000-0000-4000-8000-000000000001', p_name => 'PO REGRESSION UNLIMITED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/po-regr-shared',
   p_distribution_scope => 'all_contests',
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;

insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('2c000000-0000-4000-8000-00000000000f','PO REGRESSION CONTEST','PO REGRESSION CONTEST','V','active',10,1000,1,'https://example.com/po-regr.pdf');

select * from (values
 ('PO1 Partner Offers trigger na contests nedotcen',
   (select count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
      where n.nspname='public' and c.relname='contests' and t.tgname='trg_contest_link_offers'
        and p.proname='trg_fn_link_offers_to_new_contest' and not t.tgisinternal), '1'),
 ('PO2 linkovaci funkce PO nesaha na guard/benefit tabulky',
   (select case when pg_get_functiondef(p.oid) ilike '%voucher_distribution%'
                  or pg_get_functiondef(p.oid) ilike '%guaranteed_benefit%' then 'contaminated' else 'clean' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='trg_fn_link_offers_to_new_contest'), 'clean'),
 ('PO3 novy guard trigger nesaha na Partner Offers',
   (select case when pg_get_functiondef(p.oid) ilike '%partner_offer%' then 'contaminated' else 'clean' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='trg_fn_require_unlimited_benefit_for_active_contest'), 'clean'),
 ('PO4 admin_set_guaranteed_benefit_status nesaha na Partner Offers',
   (select case when pg_get_functiondef(p.oid) ilike '%partner_offer%' then 'contaminated' else 'clean' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='admin_set_guaranteed_benefit_status'), 'clean'),
 ('PO5 admin_set_benefit_distribution nesaha na Partner Offers',
   (select case when pg_get_functiondef(p.oid) ilike '%partner_offer%' then 'contaminated' else 'clean' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='admin_set_benefit_distribution'), 'clean'),
 ('PO6 pocet vsech triggeru na contests: 6 (5 puvodnich + novy guard)',
   (select count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='contests' and not t.tgisinternal), '6'),
 ('R1 nova soutez vznikla jako active (guard neblokoval, benefit existuje)',
   (select status from public.contests where id='2c000000-0000-4000-8000-00000000000f'), 'active'),
 ('R2 soutez ma aktivni benefit fallback', (select public.guaranteed_benefit_has_active_unlimited_fallback('2c000000-0000-4000-8000-00000000000f')::text), 'true'),
 ('R3 soutez dostala spravny pocet Partner Offers vazeb (rovno approved all_contests nabidkam)',
   (select count(*)::text from public.partner_offer_contests where contest_id='2c000000-0000-4000-8000-00000000000f'),
   (select count(*)::text from public.partner_offers where status='approved' and deployment_mode='all_contests'))
) as t(step, actual, expected);
rollback;
