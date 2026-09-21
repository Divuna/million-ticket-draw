-- Garantované benefity — DISTRIBUCE DO SOUTĚŽÍ, ověření proti STAGINGU.
--
-- Spouštět POUZE na stagingu dxmowysntemfqfnanxua, v Supabase SQL Editoru.
-- Každý blok běží ve vlastní transakci zakončené ROLLBACK — nezanechává data.
-- NIKDY nespouštět proti produkci xkzhjldrojjlrkezorey.
--
-- Pozn. `public.contests` má NOT NULL `title` i `name` — testovací soutěž musí
-- vyplnit obojí, jinak INSERT spadne na `title`.
-- Soutěž ve stavu 'active' navíc vyžaduje `rules_pdf_url`
-- (trigger enforce_contest_active_requires_rules_pdf).

-- ═══ D(1–6). all_contests / selected_contests a budoucí soutěže ════════════
begin;

create temp table d_res(seq serial, name text, expected text, actual text) on commit drop;
create temp table d_ctx(k text primary key, v text) on commit drop;
grant all on d_res, d_ctx to authenticated;
grant usage on all sequences in schema pg_temp to authenticated;

insert into public.admin_permissions(user_id, permission_key)
values ('3960e47f-b583-4ef9-a48f-786bfe432bbd','guaranteed_benefits.manage');

insert into public.contests (id, title, name, status, ticket_price, ticket_count, main_prize, rules_pdf_url)
values ('dd000001-0000-4000-8000-000000000001','DIST ACTIVE 1','DIST ACTIVE 1','active',5,1000,'x','https://example.com/r.pdf'),
       ('dd000001-0000-4000-8000-000000000002','DIST ACTIVE 2','DIST ACTIVE 2','active',5,1000,'x','https://example.com/r.pdf'),
       ('dd000001-0000-4000-8000-000000000003','DIST PENDING 1','DIST PENDING 1','pending',5,1000,'x','https://example.com/r.pdf'),
       ('dd000001-0000-4000-8000-000000000004','DIST DRAFT 1','DIST DRAFT 1','draft',5,1000,'x','https://example.com/r.pdf');

insert into d_ctx select 'nAP', (select count(*)::text from public.contests where status in ('active','pending'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';

insert into d_ctx select 'partner',
  (public.admin_create_benefit_partner('DIST TEST FIRMA', null, 'https://dist-test.cz')->>'partner_id');

insert into d_ctx select 'all', (public.admin_create_guaranteed_benefit(
  (select v from d_ctx where k='partner')::uuid,
  'ALL benefit', 'x', 'Zadejte kod.', 'Podminky.',
  'percentage', 10, null, 'CZK', null, null, null,
  true, 'ALLCODE', null, 'all_contests', null, 5, 21)->>'order_id');
reset role;

insert into d_res(name,expected,actual)
  select 'D1 novy approved all_contests -> vsechny active/pending',
    (select v from d_ctx where k='nAP'),
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='all')::uuid and detached_at is null);

insert into d_res(name,expected,actual)
  select 'D1b draft soutez se nenapojila','0',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='all')::uuid and detached_at is null
        and contest_id='dd000001-0000-4000-8000-000000000004');

insert into public.contests (id, title, name, status, ticket_price, ticket_count, main_prize, rules_pdf_url)
values ('dd000001-0000-4000-8000-000000000005','DIST NEW PENDING','DIST NEW PENDING','pending',5,1000,'x','https://example.com/r.pdf');
insert into d_res(name,expected,actual)
  select 'D2 nova pending soutez -> automaticka vazba','1',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='all')::uuid and detached_at is null
        and contest_id='dd000001-0000-4000-8000-000000000005');

insert into public.contests (id, title, name, status, ticket_price, ticket_count, main_prize, rules_pdf_url)
values ('dd000001-0000-4000-8000-000000000006','DIST NEW ACTIVE','DIST NEW ACTIVE','active',5,1000,'x','https://example.com/r.pdf');
insert into d_res(name,expected,actual)
  select 'D3 nova active soutez -> automaticka vazba','1',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='all')::uuid and detached_at is null
        and contest_id='dd000001-0000-4000-8000-000000000006');

update public.contests set status='active' where id='dd000001-0000-4000-8000-000000000004';
insert into d_res(name,expected,actual)
  select 'D4 prechod draft->active napoji benefit','1',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='all')::uuid and detached_at is null
        and contest_id='dd000001-0000-4000-8000-000000000004');

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into d_ctx select 'sel', (public.admin_create_guaranteed_benefit(
  (select v from d_ctx where k='partner')::uuid,
  'SELECTED benefit', 'x', 'Zadejte kod.', 'Podminky.',
  'percentage', 10, null, 'CZK', null, null, null,
  true, 'SELCODE', null, 'selected_contests',
  array['dd000001-0000-4000-8000-000000000001'::uuid,'dd000001-0000-4000-8000-000000000002'::uuid],
  5, 21)->>'order_id');
reset role;

insert into d_res(name,expected,actual)
  select 'D5 selected_contests -> pouze vybrane 2','2',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='sel')::uuid and detached_at is null);

insert into public.contests (id, title, name, status, ticket_price, ticket_count, main_prize, rules_pdf_url)
values ('dd000001-0000-4000-8000-000000000007','DIST AFTER SELECTED','DIST AFTER SELECTED','active',5,1000,'x','https://example.com/r.pdf');
insert into d_res(name,expected,actual)
  select 'D6 selected benefit se na novou soutez nenapoji','2',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='sel')::uuid and detached_at is null);

select name, expected, actual, (expected = actual) as pass from d_res order by seq;

rollback;

-- ═══ D(7–21). Přepínání rozsahu, suspended, duplicity ═════════════════════
begin;

create temp table d_res(seq serial, name text, expected text, actual text) on commit drop;
create temp table d_ctx(k text primary key, v text) on commit drop;
grant all on d_res, d_ctx to authenticated;
grant usage on all sequences in schema pg_temp to authenticated;

insert into public.admin_permissions(user_id, permission_key)
values ('3960e47f-b583-4ef9-a48f-786bfe432bbd','guaranteed_benefits.manage');

insert into public.contests (id, title, name, status, ticket_price, ticket_count, main_prize, rules_pdf_url)
values ('dd000002-0000-4000-8000-000000000001','SW A1','SW A1','active',5,1000,'x','https://example.com/r.pdf'),
       ('dd000002-0000-4000-8000-000000000002','SW A2','SW A2','active',5,1000,'x','https://example.com/r.pdf'),
       ('dd000002-0000-4000-8000-000000000003','SW P1','SW P1','pending',5,1000,'x','https://example.com/r.pdf');

insert into d_ctx select 'nAP', (select count(*)::text from public.contests where status in ('active','pending'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into d_ctx select 'partner',
  (public.admin_create_benefit_partner('SWITCH TEST FIRMA', null, 'https://switch-test.cz')->>'partner_id');
insert into d_ctx select 'ord', (public.admin_create_guaranteed_benefit(
  (select v from d_ctx where k='partner')::uuid,
  'SWITCH benefit', 'x', 'Zadejte kod.', 'Podminky.',
  'percentage', 10, null, 'CZK', null, null, null,
  true, 'SWCODE', null, 'all_contests', null, 5, 21)->>'order_id');
reset role;

insert into d_res(name,expected,actual)
  select 'D7 start: all_contests = vsechny active/pending',
    (select v from d_ctx where k='nAP'),
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='ord')::uuid and detached_at is null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into d_res(name,expected,actual)
  select 'D8 all->selected: aktivni vazby = 2','true|2',
    (r->>'success')||'|'||(r->>'active_links')
  from (select public.admin_set_benefit_distribution((select v from d_ctx where k='ord')::uuid,'selected_contests',
    array['dd000002-0000-4000-8000-000000000001'::uuid,'dd000002-0000-4000-8000-000000000002'::uuid]) as r) s;
reset role;

insert into d_res(name,expected,actual)
  select 'D9 all->selected: ostatni maji detached_at',
    ((select v from d_ctx where k='nAP')::int - 2)::text,
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='ord')::uuid and detached_at is not null);

insert into d_res(name,expected,actual)
  select 'D10 historie se nemaze (celkem radku)',
    (select v from d_ctx where k='nAP'),
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='ord')::uuid);

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into d_res(name,expected,actual)
  select 'D11 zmena vyberu: aktivni vazby = 2','true|2',
    (r->>'success')||'|'||(r->>'active_links')
  from (select public.admin_set_benefit_distribution((select v from d_ctx where k='ord')::uuid,'selected_contests',
    array['dd000002-0000-4000-8000-000000000001'::uuid,'dd000002-0000-4000-8000-000000000003'::uuid]) as r) s;
reset role;

insert into d_res(name,expected,actual)
  select 'D12 zachovana vazba A1 aktivni a nezdvojena','1',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='ord')::uuid
        and contest_id='dd000002-0000-4000-8000-000000000001' and detached_at is null);
insert into d_res(name,expected,actual)
  select 'D13 odebrana A2 ma detached_at','0',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='ord')::uuid
        and contest_id='dd000002-0000-4000-8000-000000000002' and detached_at is null);
insert into d_res(name,expected,actual)
  select 'D14 nova P1 je aktivni','1',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='ord')::uuid
        and contest_id='dd000002-0000-4000-8000-000000000003' and detached_at is null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into d_res(name,expected,actual)
  select 'D15 selected->all doplni vsechny active/pending','true|'||(select v from d_ctx where k='nAP'),
    (r->>'success')||'|'||(r->>'active_links')
  from (select public.admin_set_benefit_distribution((select v from d_ctx where k='ord')::uuid,'all_contests',null) as r) s;

insert into d_res(name,expected,actual)
  select 'D16 pozastaveni benefitu','true|suspended',
    (r->>'success')||'|'||(r->>'order_status')
  from (select public.admin_set_guaranteed_benefit_status((select v from d_ctx where k='ord')::uuid,'suspended','test') as r) s;
reset role;

insert into public.contests (id, title, name, status, ticket_price, ticket_count, main_prize, rules_pdf_url)
values ('dd000002-0000-4000-8000-000000000009','SW SUSPENDED NEW','SW SUSPENDED NEW','active',5,1000,'x','https://example.com/r.pdf');

insert into d_res(name,expected,actual)
  select 'D17 suspended benefit se na novou soutez NEnapoji','0',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='ord')::uuid and detached_at is null
        and contest_id='dd000002-0000-4000-8000-000000000009');

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into d_res(name,expected,actual)
  select 'D18 navrat suspended->approved','true|approved',
    (r->>'success')||'|'||(r->>'order_status')
  from (select public.admin_set_guaranteed_benefit_status((select v from d_ctx where k='ord')::uuid,'approved',null) as r) s;
reset role;

insert into d_res(name,expected,actual)
  select 'D19 po navratu se vazby dosynchronizovaly (vc. nove souteze)','1',
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='ord')::uuid and detached_at is null
        and contest_id='dd000002-0000-4000-8000-000000000009');

insert into d_res(name,expected,actual)
  select 'D20 po navratu = vsechny active/pending',
    (select count(*)::text from public.contests where status in ('active','pending')),
    (select count(*)::text from public.voucher_distribution_contests
      where order_id=(select v from d_ctx where k='ord')::uuid and detached_at is null);

insert into d_res(name,expected,actual)
  select 'D21 zadne duplicitni AKTIVNI vazby','0',
    (select coalesce(count(*)::text,'0') from (
      select order_id, contest_id from public.voucher_distribution_contests
      where detached_at is null group by 1,2 having count(*) > 1) x);

select name, expected, actual, (expected = actual) as pass from d_res order by seq;

rollback;

-- ═══ PO. Regrese: Partner Offers zůstávají izolované ══════════════════════
begin;

create temp table p_res(seq serial, name text, expected text, actual text) on commit drop;

-- Partner Offers funkce se nesmi dotknout benefitovych tabulek.
insert into p_res(name,expected,actual)
  select 'PO1 trg_fn_link_offers_to_new_contest bez benefitu','false',
    (pg_get_functiondef(p.oid) ilike '%voucher_distribution%')::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='trg_fn_link_offers_to_new_contest';

insert into p_res(name,expected,actual)
  select 'PO2 trg_fn_link_approved_offer_to_contests bez benefitu','false',
    (pg_get_functiondef(p.oid) ilike '%voucher_distribution%')::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='trg_fn_link_approved_offer_to_contests';

insert into p_res(name,expected,actual)
  select 'PO3 assign_partner_offer_to_ticket bez benefitu','false',
    (pg_get_functiondef(p.oid) ilike '%voucher_distribution%')::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='assign_partner_offer_to_ticket';

-- Dva nezavisle triggery na contests, kazdy s vlastni funkci.
insert into p_res(name,expected,actual)
  select 'PO4 contests: oba triggery vedle sebe',
    'trg_contest_link_offers=trg_fn_link_offers_to_new_contest|trg_link_guaranteed_benefits_to_contest=trg_fn_link_guaranteed_benefits_to_contest',
    string_agg(t.tgname||'='||p.proname, '|' order by t.tgname)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  join pg_proc p on p.oid=t.tgfoid
  where n.nspname='public' and c.relname='contests' and not t.tgisinternal
    and t.tgname in ('trg_contest_link_offers','trg_link_guaranteed_benefits_to_contest');

insert into public.contests (id, title, name, status, ticket_price, ticket_count, main_prize, rules_pdf_url)
values ('dd000003-0000-4000-8000-000000000001','PO REGRESSION CONTEST','PO REGRESSION CONTEST','active',5,1000,'x','https://example.com/r.pdf');

-- POZOR: linkovaci trigger Partner Offers NEfiltruje valid_from/valid_to.
-- Platnost resi az assign_partner_offer_to_ticket. Ocekavani musi sedet
-- s podminkou v trg_fn_link_offers_to_new_contest.
insert into p_res(name,expected,actual)
  select 'PO5 nova soutez napojila vsechny approved all_contests nabidky',
    (select count(*)::text from public.partner_offers
      where status='approved' and deployment_mode='all_contests'),
    (select count(*)::text from public.partner_offer_contests
      where contest_id='dd000003-0000-4000-8000-000000000001' and detached_at is null);

insert into public.contests (id, title, name, status, ticket_price, ticket_count, main_prize, rules_pdf_url)
values ('dd000003-0000-4000-8000-000000000002','PO TRANSITION','PO TRANSITION','pending',5,1000,'x','https://example.com/r.pdf');
update public.contests set status='active' where id='dd000003-0000-4000-8000-000000000002';

insert into p_res(name,expected,actual)
  select 'PO5c pending->active neduplikuje Partner Offers vazby','0',
    (select coalesce(count(*)::text,'0') from (
      select offer_id, contest_id from public.partner_offer_contests
      where contest_id='dd000003-0000-4000-8000-000000000002' and detached_at is null
      group by 1,2 having count(*) > 1) x);

insert into p_res(name,expected,actual)
  select 'PO5d pending->active neduplikuje benefit vazby','0',
    (select coalesce(count(*)::text,'0') from (
      select order_id, contest_id from public.voucher_distribution_contests
      where contest_id='dd000003-0000-4000-8000-000000000002' and detached_at is null
      group by 1,2 having count(*) > 1) x);

insert into p_res(name,expected,actual)
  select 'PO6 partner_offer_selected_contests stale prazdna','0',
    (select count(*)::text from public.partner_offer_selected_contests);

insert into p_res(name,expected,actual)
  select 'PO7 sync funkce bez klientskych grantu','false|false',
    has_function_privilege('anon','public.sync_guaranteed_benefit_order_contests(uuid)','EXECUTE')::text
    ||'|'||
    has_function_privilege('authenticated','public.sync_guaranteed_benefit_order_contests(uuid)','EXECUTE')::text;

insert into p_res(name,expected,actual)
  select 'PO8 purchase RPC stale filtruje na contest_id','true',
    (pg_get_functiondef(p.oid) ilike '%o.contest_id = p_contest_id%')::text
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='purchase_guaranteed_benefit_bundle_atomic';

insert into p_res(name,expected,actual)
  select 'PO9 buy_ticket_atomic beze zmeny grantu','true',
    has_function_privilege('authenticated','public.buy_ticket_atomic(uuid,uuid)','EXECUTE')::text;

select name, expected, actual, (expected = actual) as pass from p_res order by seq;

rollback;
