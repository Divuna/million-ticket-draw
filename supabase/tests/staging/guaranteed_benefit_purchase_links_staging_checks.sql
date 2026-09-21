-- Funkční ověření napojení nákupu garantovaných benefitů na materializované
-- vazby `voucher_distribution_contests` proti STAGINGU `dxmowysntemfqfnanxua`.
--
-- Každý blok běží v transakci, která KONČÍ `rollback` — staging data se nemění.
-- Bloky pouštět JEDNOTLIVĚ; sdílejí stejná testovací UUID.
--
-- PASTI (ověřeno při psaní, neopakovat):
--   * `public.users.id` má FK na `auth.users(id)` a `admin_permissions.user_id`
--     také — testovacího admina je nutné založit v `auth.users` i `public.users`.
--     `select id from user_roles where role='admin'` vrací `user_roles.id`,
--     NE `user_id`.
--   * `public.contests` vyžaduje `title` i `main_prize`; `active` navíc
--     `rules_pdf_url`.
--   * `guard_guaranteed_benefit_history` drží u schváleného orderu neměnné
--     mj. `contest_id` a `requested_quantity` — legacy order NELZE vyrobit
--     UPDATEm existujícího, musí se vložit rovnou v legacy tvaru.
--   * Linkovací trigger Partner Offers filtruje `deployment_mode='all_contests'`
--     — očekávaný počet vazeb se musí počítat stejnou podmínkou.
--   * Čtení `voucher_*` pod rolí `authenticated` blokuje RLS → read-back
--     dělat až po `reset role`.

-- ===========================================================================
-- BLOK A — priorita omezeného benefitu, fallback na neomezený, opakovaný nákup
-- ===========================================================================
begin;
set local statement_timeout = '240s';

create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;

update public.settings set value = 'true' where key = 'guaranteed_benefit_purchase_enabled';

insert into auth.users(id) values
 ('1a000000-0000-4000-8000-0000000000ad'),
 ('1a000000-0000-4000-8000-000000000001'),
 ('1a000000-0000-4000-8000-000000000002');
insert into public.users(id, email) values
 ('1a000000-0000-4000-8000-0000000000ad','gb-link-admin@onemil.test'),
 ('1a000000-0000-4000-8000-000000000001','gb-link-1@onemil.test'),
 ('1a000000-0000-4000-8000-000000000002','gb-link-2@onemil.test');
insert into public.user_roles(user_id, role) values ('1a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('1a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.wallets(user_id, balance_coins) values
 ('1a000000-0000-4000-8000-000000000001', 1000),
 ('1a000000-0000-4000-8000-000000000002', 1000);
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('1c000000-0000-4000-8000-000000000001','GB LINK TEST','GB LINK TEST','Testovaci vyhra','active',10,1000,1,'https://example.com/gb-link-rules.pdf');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('1b000000-0000-4000-8000-000000000001','GB LINK TEST PARTNER','GB LINK TEST PARTNER s.r.o.','','',true,'guaranteed_benefit');

set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'limited', public.admin_create_guaranteed_benefit(
   p_partner_id => '1b000000-0000-4000-8000-000000000001', p_name => 'GB LINK LIMITED A',
   p_how_to_use => 'Pouzij kod', p_terms => 'Podminky', p_is_unlimited => false,
   p_codes => array['GBLINK-LIMITED-A1'], p_distribution_scope => 'selected_contests',
   p_contest_ids => array['1c000000-0000-4000-8000-000000000001']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
insert into t_env(k,v) select 'unlimited', public.admin_create_guaranteed_benefit(
   p_partner_id => '1b000000-0000-4000-8000-000000000001', p_name => 'GB LINK UNLIMITED B',
   p_how_to_use => 'Pouzij odkaz', p_terms => 'Podminky', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/gb-shared-B',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['1c000000-0000-4000-8000-000000000001']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;

set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into t_env(k,v) select 'offer_before', public.get_guaranteed_benefit_offer('1c000000-0000-4000-8000-000000000001')::text;
insert into t_env(k,v) select 'buy1', public.purchase_guaranteed_benefit_bundle_atomic(
  null, '1c000000-0000-4000-8000-000000000001', '9a000000-0000-4000-8000-000000000001')::text;
set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into t_env(k,v) select 'offer_after_limited', public.get_guaranteed_benefit_offer('1c000000-0000-4000-8000-000000000001')::text;
insert into t_env(k,v) select 'buy2', public.purchase_guaranteed_benefit_bundle_atomic(
  null, '1c000000-0000-4000-8000-000000000001', '9a000000-0000-4000-8000-000000000002')::text;
insert into t_env(k,v) select 'buy3', public.purchase_guaranteed_benefit_bundle_atomic(
  null, '1c000000-0000-4000-8000-000000000001', '9a000000-0000-4000-8000-000000000003')::text;
reset role;

with e as (select k, v::jsonb as j from t_env),
 lim as (select (j->>'order_id')::uuid oid from e where k='limited'),
 unl as (select (j->>'order_id')::uuid oid from e where k='unlimited'),
 b1 as (select j from e where k='buy1'), b2 as (select j from e where k='buy2'), b3 as (select j from e where k='buy3')
select * from (values
 ('A1  limited create success', (select (j->>'success') from e where k='limited'), 'true'),
 ('A2  unlimited create success', (select (j->>'success') from e where k='unlimited'), 'true'),
 ('A3  buy1 je OMEZENY', (select j->>'is_unlimited' from b1), 'false'),
 ('A4  buy1 kod = omezeny kod', (select j->'coupon'->>'code' from b1), 'GBLINK-LIMITED-A1'),
 ('A5  buy1 billable', (select j->>'billable' from b1), 'true'),
 ('A6  buy2 je NEOMEZENY', (select j->>'is_unlimited' from b2), 'true'),
 ('A7  buy2 kod = shared_code_or_url', (select j->'coupon'->>'code' from b2), 'https://partner.example/gb-shared-B'),
 ('A8  buy2 billable', (select j->>'billable' from b2), 'true'),
 ('A9  buy3 stejny voucher jako buy2', (select case when (select j->>'voucher_id' from b3)=(select j->>'voucher_id' from b2) then 'same' else 'diff' end), 'same'),
 ('A10 buy3 NON-billable', (select j->>'billable' from b3), 'false'),
 ('A11 issuance buy2 bez voucher_code_id', (select case when voucher_code_id is null then 'null' else 'notnull' end from public.voucher_issuances where id=(select (j->>'voucher_issuance_id')::uuid from b2)), 'null'),
 ('A12 user_voucher buy2 bez voucher_code_id', (select case when voucher_code_id is null then 'null' else 'notnull' end from public.user_vouchers where id=(select (j->>'user_voucher_id')::uuid from b2)), 'null'),
 ('A13 issuance buy1 MA voucher_code_id', (select case when voucher_code_id is null then 'null' else 'notnull' end from public.voucher_issuances where id=(select (j->>'voucher_issuance_id')::uuid from b1)), 'notnull'),
 ('A14 omezeny kod je issued', (select status from public.voucher_codes where distribution_order_id=(select oid from lim)), 'issued'),
 ('A15 neomezeny order NEMA voucher_codes', (select count(*)::text from public.voucher_codes where distribution_order_id=(select oid from unl)), '0'),
 ('A16 3 tikety v test soutezi', (select count(*)::text from public.tickets where contest_id='1c000000-0000-4000-8000-000000000001'), '3'),
 ('A17 wallet cust1 = 990', (select balance_coins::text from public.wallets where user_id='1a000000-0000-4000-8000-000000000001'), '990.00'),
 ('A18 wallet cust2 = 980', (select balance_coins::text from public.wallets where user_id='1a000000-0000-4000-8000-000000000002'), '980.00'),
 ('A19 neomezeny order issued=2 billable=1', (select issued_quantity||'/'||billable_issued_quantity from public.voucher_distribution_orders where id=(select oid from unl)), '2/1'),
 ('A20 omezeny order issued=1 billable=1', (select issued_quantity||'/'||billable_issued_quantity from public.voucher_distribution_orders where id=(select oid from lim)), '1/1'),
 ('A21 nabidka pred nakupem dostupna', (select j->>'available' from e where k='offer_before'), 'true'),
 ('A22 nabidka po vycerpani omezeneho dostupna', (select j->>'available' from e where k='offer_after_limited'), 'true')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK B — žádný benefit, dva neomezené benefity, idempotence
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;
update public.settings set value = 'true' where key = 'guaranteed_benefit_purchase_enabled';

insert into auth.users(id) values
 ('1a000000-0000-4000-8000-0000000000ad'),
 ('1a000000-0000-4000-8000-000000000001');
insert into public.users(id, email) values
 ('1a000000-0000-4000-8000-0000000000ad','gb-link-admin@onemil.test'),
 ('1a000000-0000-4000-8000-000000000001','gb-link-1@onemil.test');
insert into public.user_roles(user_id, role) values ('1a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('1a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.wallets(user_id, balance_coins) values ('1a000000-0000-4000-8000-000000000001', 1000);
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values
 ('1c000000-0000-4000-8000-000000000002','GB LINK TEST Y','GB LINK TEST Y','Vyhra Y','active',10,1000,1,'https://example.com/y.pdf'),
 ('1c000000-0000-4000-8000-000000000003','GB LINK TEST Z','GB LINK TEST Z','Vyhra Z','active',10,1000,1,'https://example.com/z.pdf');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('1b000000-0000-4000-8000-000000000001','GB LINK TEST PARTNER','GB LINK TEST PARTNER s.r.o.','','',true,'guaranteed_benefit');

set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'unlB', public.admin_create_guaranteed_benefit(
   p_partner_id => '1b000000-0000-4000-8000-000000000001', p_name => 'GB LINK UNLIMITED B',
   p_how_to_use => 'Odkaz B', p_terms => 'Podminky', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/gb-shared-B',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['1c000000-0000-4000-8000-000000000002']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
insert into t_env(k,v) select 'unlC', public.admin_create_guaranteed_benefit(
   p_partner_id => '1b000000-0000-4000-8000-000000000001', p_name => 'GB LINK UNLIMITED C',
   p_how_to_use => 'Odkaz C', p_terms => 'Podminky', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/gb-shared-C',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['1c000000-0000-4000-8000-000000000002']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;

set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into t_env(k,v) select 'offerZ', public.get_guaranteed_benefit_offer('1c000000-0000-4000-8000-000000000003')::text;
insert into t_env(k,v) select 'buyZ', public.purchase_guaranteed_benefit_bundle_atomic(
  null, '1c000000-0000-4000-8000-000000000003', '9b000000-0000-4000-8000-000000000001')::text;
insert into t_env(k,v) select 'buyY1', public.purchase_guaranteed_benefit_bundle_atomic(
  null, '1c000000-0000-4000-8000-000000000002', '9b000000-0000-4000-8000-000000000002')::text;
insert into t_env(k,v) select 'buyY2', public.purchase_guaranteed_benefit_bundle_atomic(
  null, '1c000000-0000-4000-8000-000000000002', '9b000000-0000-4000-8000-000000000003')::text;
insert into t_env(k,v) select 'buyY2again', public.purchase_guaranteed_benefit_bundle_atomic(
  null, '1c000000-0000-4000-8000-000000000002', '9b000000-0000-4000-8000-000000000003')::text;
reset role;

with e as (select k, v::jsonb as j from t_env),
 codes as (select string_agg(c, '|' order by c) as used
           from (select j->'coupon'->>'code' as c from e where k in ('buyY1','buyY2')) s)
select * from (values
 ('B1  nabidka v soutezi bez benefitu', (select j->>'available' from e where k='offerZ'), 'false'),
 ('B2  nakup selze s no_benefit_available', (select j->>'error' from e where k='buyZ'), 'no_benefit_available'),
 ('B3  success=false', (select j->>'success' from e where k='buyZ'), 'false'),
 ('B4  zadny tiket v soutezi Z', (select count(*)::text from public.tickets where contest_id='1c000000-0000-4000-8000-000000000003'), '0'),
 ('B5  zadny bundle radek pro soutez Z', (select count(*)::text from public.contest_bundle_purchases where contest_id='1c000000-0000-4000-8000-000000000003'), '0'),
 ('B6  buyY1 je neomezeny', (select j->>'is_unlimited' from e where k='buyY1'), 'true'),
 ('B7  buyY2 je neomezeny', (select j->>'is_unlimited' from e where k='buyY2'), 'true'),
 ('B8  buyY1 a buyY2 jsou RUZNE benefity', (select case when (select j->>'voucher_id' from e where k='buyY1') <> (select j->>'voucher_id' from e where k='buyY2') then 'diff' else 'same' end), 'diff'),
 ('B9  pouzity OBA sdilene kody', (select used from codes), 'https://partner.example/gb-shared-B|https://partner.example/gb-shared-C'),
 ('B10 opakovane volani je idempotentni', (select j->>'idempotent' from e where k='buyY2again'), 'true'),
 ('B11 stejny ticket_row_id', (select case when (select j->>'ticket_row_id' from e where k='buyY2again')=(select j->>'ticket_row_id' from e where k='buyY2') then 'same' else 'diff' end), 'same'),
 ('B12 v soutezi Y jen 2 tikety', (select count(*)::text from public.tickets where contest_id='1c000000-0000-4000-8000-000000000002'), '2'),
 ('B13 jen 2 issuance pro zakaznika', (select count(*)::text from public.voucher_issuances where user_id='1a000000-0000-4000-8000-000000000001'), '2'),
 ('B14 wallet = 980 (soutez Z neodecetla nic)', (select balance_coins::text from public.wallets where user_id='1a000000-0000-4000-8000-000000000001'), '980.00'),
 ('B15 zadne voucher_codes pro neomezene ordery', (select count(*)::text from public.voucher_codes vc join public.voucher_distribution_orders o on o.id=vc.distribution_order_id where o.is_unlimited), '0')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK C — validace: historické single_contest, negativní případy, kontrakt
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;
update public.settings set value = 'true' where key = 'guaranteed_benefit_purchase_enabled';

insert into auth.users(id) values
 ('1a000000-0000-4000-8000-0000000000ad'),
 ('1a000000-0000-4000-8000-000000000001'),
 ('1a000000-0000-4000-8000-000000000002'),
 ('1a000000-0000-4000-8000-000000000003');
insert into public.users(id, email) values
 ('1a000000-0000-4000-8000-0000000000ad','gb-link-admin@onemil.test'),
 ('1a000000-0000-4000-8000-000000000001','gb-link-1@onemil.test'),
 ('1a000000-0000-4000-8000-000000000002','gb-link-2@onemil.test'),
 ('1a000000-0000-4000-8000-000000000003','gb-link-3@onemil.test');
insert into public.user_roles(user_id, role) values ('1a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key)
values ('1a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values
 ('1c000000-0000-4000-8000-000000000001','GB LEGACY C1','GB LEGACY C1','Vyhra','active',10,1000,1,'https://example.com/1.pdf'),
 ('1c000000-0000-4000-8000-000000000004','GB LEGACY C2','GB LEGACY C2','Vyhra','active',10,1000,1,'https://example.com/4.pdf');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('1b000000-0000-4000-8000-000000000001','GB LINK TEST PARTNER','GB LINK TEST PARTNER s.r.o.','','',true,'guaranteed_benefit');

set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'base', public.admin_create_guaranteed_benefit(
   p_partner_id => '1b000000-0000-4000-8000-000000000001', p_name => 'GB LEGACY BENEFIT',
   p_how_to_use => 'Kod', p_terms => 'Podminky', p_is_unlimited => false,
   p_codes => array['GBLEG-1'], p_distribution_scope => 'selected_contests',
   p_contest_ids => array['1c000000-0000-4000-8000-000000000001']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
reset role;

-- legacy order: single_contest, BEZ vazby ve voucher_distribution_contests
insert into public.voucher_distribution_orders
  (id, partner_id, voucher_id, voucher_version_id, contest_id, requested_quantity, status,
   is_unlimited, distribution_scope, price_rule_id, unit_price_ex_vat_snapshot,
   vat_rate_percent_snapshot, currency_snapshot, submitted_by, decided_by, decided_at)
select '1d000000-0000-4000-8000-000000000001'::uuid, o.partner_id, o.voucher_id, o.voucher_version_id,
       '1c000000-0000-4000-8000-000000000001'::uuid, 5, 'approved', false, 'single_contest',
       o.price_rule_id, o.unit_price_ex_vat_snapshot, o.vat_rate_percent_snapshot,
       o.currency_snapshot, o.submitted_by, o.decided_by, o.decided_at
from public.voucher_distribution_orders o
where o.id = (select (v::jsonb->>'order_id')::uuid from t_env where k='base');

insert into public.voucher_codes (id, voucher_id, code, status, distribution_order_id, created_by)
select ('1e000000-0000-4000-8000-00000000000'||n)::uuid, o.voucher_id, 'GBLEG-LEGACY-'||n, 'available',
       '1d000000-0000-4000-8000-000000000001'::uuid, o.decided_by
from public.voucher_distribution_orders o, generate_series(1,3) n
where o.id = '1d000000-0000-4000-8000-000000000001';

insert into public.tickets (id, contest_id, user_id, number) values
 ('1f000000-0000-4000-8000-000000000001','1c000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001',900),
 ('1f000000-0000-4000-8000-000000000002','1c000000-0000-4000-8000-000000000004','1a000000-0000-4000-8000-000000000002',900),
 ('1f000000-0000-4000-8000-000000000003','1c000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000003',901);

insert into public.user_vouchers (id, user_id, voucher_id, voucher_code_id, acquisition_source, redeemed)
select ('2f000000-0000-4000-8000-00000000000'||n)::uuid,
       ('1a000000-0000-4000-8000-00000000000'||n)::uuid, o.voucher_id,
       case when n in (1,2) then ('1e000000-0000-4000-8000-00000000000'||n)::uuid else null end,
       'guaranteed_purchase_benefit', true
from public.voucher_distribution_orders o, generate_series(1,3) n
where o.id = '1d000000-0000-4000-8000-000000000001';

update public.voucher_codes vc
set status='issued', issued_to_user_id = uv.user_id, issued_user_voucher_id = uv.id, issued_at = now()
from public.user_vouchers uv
where uv.voucher_code_id = vc.id and vc.distribution_order_id = '1d000000-0000-4000-8000-000000000001';

-- C1: legacy issuance BEZ vazby -> musí PROJÍT
do $blk$
declare v_err text; o record;
begin
  select * into o from public.voucher_distribution_orders where id='1d000000-0000-4000-8000-000000000001';
  begin
    insert into public.voucher_issuances (distribution_order_id, voucher_id, voucher_version_id,
      voucher_code_id, user_id, user_voucher_id, ticket_id, billable, billing_reason,
      unit_price_ex_vat_snapshot, vat_rate_percent_snapshot, currency_snapshot)
    values (o.id, o.voucher_id, o.voucher_version_id,
      '1e000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000001',
      '2f000000-0000-4000-8000-000000000001','1f000000-0000-4000-8000-000000000001',
      true,'first_customer_issuance', o.unit_price_ex_vat_snapshot, o.vat_rate_percent_snapshot, o.currency_snapshot);
    v_err := 'OK';
  exception when others then v_err := sqlerrm; end;
  insert into t_env(k,v) values ('c1_legacy_no_link', v_err);
end $blk$;

-- C2: tiket z jiné soutěže, bez vazby a bez shody contest_id -> musí SELHAT
do $blk$
declare v_err text; o record;
begin
  select * into o from public.voucher_distribution_orders where id='1d000000-0000-4000-8000-000000000001';
  begin
    insert into public.voucher_issuances (distribution_order_id, voucher_id, voucher_version_id,
      voucher_code_id, user_id, user_voucher_id, ticket_id, billable, billing_reason,
      unit_price_ex_vat_snapshot, vat_rate_percent_snapshot, currency_snapshot)
    values (o.id, o.voucher_id, o.voucher_version_id,
      '1e000000-0000-4000-8000-000000000002','1a000000-0000-4000-8000-000000000002',
      '2f000000-0000-4000-8000-000000000002','1f000000-0000-4000-8000-000000000002',
      true,'first_customer_issuance', o.unit_price_ex_vat_snapshot, o.vat_rate_percent_snapshot, o.currency_snapshot);
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm; end;
  insert into t_env(k,v) values ('c2_wrong_contest', v_err);
end $blk$;

-- C3: OMEZENÝ order + voucher_code_id NULL -> musí SELHAT
do $blk$
declare v_err text; o record;
begin
  select * into o from public.voucher_distribution_orders where id='1d000000-0000-4000-8000-000000000001';
  begin
    insert into public.voucher_issuances (distribution_order_id, voucher_id, voucher_version_id,
      voucher_code_id, user_id, user_voucher_id, ticket_id, billable, billing_reason,
      unit_price_ex_vat_snapshot, vat_rate_percent_snapshot, currency_snapshot)
    values (o.id, o.voucher_id, o.voucher_version_id,
      null,'1a000000-0000-4000-8000-000000000003',
      '2f000000-0000-4000-8000-000000000003','1f000000-0000-4000-8000-000000000003',
      false,'repeat_customer_issuance', o.unit_price_ex_vat_snapshot, o.vat_rate_percent_snapshot, o.currency_snapshot);
    v_err := 'NO_ERROR';
  exception when others then v_err := sqlerrm; end;
  insert into t_env(k,v) values ('c3_limited_null_code', v_err);
end $blk$;

select * from (values
 ('C1 legacy single_contest issuance BEZ vazby projde',
   (select v from t_env where k='c1_legacy_no_link'), 'OK'),
 ('C2 issuance s tiketem z nenavazane souteze selze',
   (select case when v like '%not linked to the distribution order%' then 'BLOCKED' else left(v,90) end from t_env where k='c2_wrong_contest'), 'BLOCKED'),
 ('C3 omezeny benefit bez kodu selze',
   (select case when v like '%unlimited benefit issuance may omit the voucher code%' then 'BLOCKED' else left(v,90) end from t_env where k='c3_limited_null_code'), 'BLOCKED'),
 ('C4 vsechny historicke issuance dal splnuji novou validaci',
   (select count(*)::text from public.voucher_issuances vi
      join public.voucher_distribution_orders o on o.id = vi.distribution_order_id
      join public.tickets t on t.id = vi.ticket_id
      where not exists (select 1 from public.voucher_distribution_contests dc
                        where dc.order_id=vi.distribution_order_id and dc.contest_id=t.contest_id and dc.detached_at is null)
        and o.contest_id is distinct from t.contest_id), '0'),
 ('C5 limited SELECT pouziva FOR UPDATE ... SKIP LOCKED',
   (select case when pg_get_functiondef(p.oid) ilike '%for update of vc skip locked%' then 'yes' else 'no' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='purchase_guaranteed_benefit_bundle_atomic'), 'yes')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK D — souběh o poslední kód, pozastavený benefit, odpojená vazba
-- ===========================================================================
begin;
set local statement_timeout = '240s';
create temp table t_env(k text primary key, v text) on commit drop;
grant all on t_env to authenticated;
update public.settings set value = 'true' where key = 'guaranteed_benefit_purchase_enabled';

insert into auth.users(id)
select ('1a000000-0000-4000-8000-00000000000'||n)::uuid from generate_series(1,5) n;
insert into auth.users(id) values ('1a000000-0000-4000-8000-0000000000ad');
insert into public.users(id, email)
select ('1a000000-0000-4000-8000-00000000000'||n)::uuid, 'gb-d-'||n||'@onemil.test' from generate_series(1,5) n;
insert into public.users(id, email) values ('1a000000-0000-4000-8000-0000000000ad','gb-d-admin@onemil.test');
insert into public.user_roles(user_id, role) values ('1a000000-0000-4000-8000-0000000000ad','admin');
insert into public.admin_permissions(user_id, permission_key) values ('1a000000-0000-4000-8000-0000000000ad','guaranteed_benefits.manage');
insert into public.wallets(user_id, balance_coins)
select ('1a000000-0000-4000-8000-00000000000'||n)::uuid, 1000 from generate_series(1,5) n;
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values
 ('1c000000-0000-4000-8000-000000000001','D C1','D C1','V','active',10,1000,1,'https://example.com/1.pdf'),
 ('1c000000-0000-4000-8000-000000000002','D C2','D C2','V','active',10,1000,1,'https://example.com/2.pdf'),
 ('1c000000-0000-4000-8000-000000000003','D C3','D C3','V','active',10,1000,1,'https://example.com/3.pdf');
insert into public.partners(id, name, company_name, logo_url, website_url, benefit_only_record, created_for)
values ('1b000000-0000-4000-8000-000000000001','GB D PARTNER','GB D PARTNER s.r.o.','','',true,'guaranteed_benefit');

set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-0000000000ad","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'L', public.admin_create_guaranteed_benefit(
   p_partner_id => '1b000000-0000-4000-8000-000000000001', p_name => 'D LIMITED',
   p_how_to_use => 'Kod', p_terms => 'P', p_is_unlimited => false, p_codes => array['D-LIM-1'],
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['1c000000-0000-4000-8000-000000000001']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
insert into t_env(k,v) select 'U', public.admin_create_guaranteed_benefit(
   p_partner_id => '1b000000-0000-4000-8000-000000000001', p_name => 'D UNLIMITED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/d-shared',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['1c000000-0000-4000-8000-000000000001']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
insert into t_env(k,v) select 'V', public.admin_create_guaranteed_benefit(
   p_partner_id => '1b000000-0000-4000-8000-000000000001', p_name => 'D SUSPENDED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/d-susp',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['1c000000-0000-4000-8000-000000000002']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;
insert into t_env(k,v) select 'W', public.admin_create_guaranteed_benefit(
   p_partner_id => '1b000000-0000-4000-8000-000000000001', p_name => 'D DETACHED',
   p_how_to_use => 'Odkaz', p_terms => 'P', p_is_unlimited => true,
   p_shared_code_or_url => 'https://partner.example/d-det',
   p_distribution_scope => 'selected_contests',
   p_contest_ids => array['1c000000-0000-4000-8000-000000000003']::uuid[],
   p_unit_price_ex_vat => 5, p_vat_rate_percent => 21)::text;

set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000001","role":"authenticated"}';
insert into t_env(k,v) select 'd1', public.purchase_guaranteed_benefit_bundle_atomic(null,'1c000000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000001')::text;
set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into t_env(k,v) select 'd2', public.purchase_guaranteed_benefit_bundle_atomic(null,'1c000000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000002')::text;
set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000003","role":"authenticated"}';
insert into t_env(k,v) select 'd3', public.purchase_guaranteed_benefit_bundle_atomic(null,'1c000000-0000-4000-8000-000000000001','9c000000-0000-4000-8000-000000000003')::text;
reset role;

update public.voucher_distribution_orders set status='suspended'
where id = (select (v::jsonb->>'order_id')::uuid from t_env where k='V');
set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'd_susp_offer', public.get_guaranteed_benefit_offer('1c000000-0000-4000-8000-000000000002')::text;
insert into t_env(k,v) select 'd_susp', public.purchase_guaranteed_benefit_bundle_atomic(null,'1c000000-0000-4000-8000-000000000002','9c000000-0000-4000-8000-000000000004')::text;
reset role;
update public.voucher_distribution_orders set status='approved'
where id = (select (v::jsonb->>'order_id')::uuid from t_env where k='V');
set local role authenticated;
insert into t_env(k,v) select 'd_resumed', public.purchase_guaranteed_benefit_bundle_atomic(null,'1c000000-0000-4000-8000-000000000002','9c000000-0000-4000-8000-000000000005')::text;
reset role;

update public.voucher_distribution_contests set detached_at = now()
where order_id = (select (v::jsonb->>'order_id')::uuid from t_env where k='W');
set local request.jwt.claims = '{"sub":"1a000000-0000-4000-8000-000000000005","role":"authenticated"}';
set local role authenticated;
insert into t_env(k,v) select 'd_det_offer', public.get_guaranteed_benefit_offer('1c000000-0000-4000-8000-000000000003')::text;
insert into t_env(k,v) select 'd_det', public.purchase_guaranteed_benefit_bundle_atomic(null,'1c000000-0000-4000-8000-000000000003','9c000000-0000-4000-8000-000000000006')::text;
reset role;

with e as (select k, v::jsonb j from t_env)
select * from (values
 ('D1 prave JEDEN nakup dostal omezeny benefit',
   (select count(*)::text from e where k in ('d1','d2','d3') and j->>'is_unlimited'='false'), '1'),
 ('D2 zbyle DVA presly na neomezeny',
   (select count(*)::text from e where k in ('d1','d2','d3') and j->>'is_unlimited'='true'), '2'),
 ('D3 vsechny tri nakupy uspesne',
   (select count(*)::text from e where k in ('d1','d2','d3') and j->>'success'='true'), '3'),
 ('D4 omezeny kod vydan prave jednou',
   (select count(*)::text from public.voucher_codes vc where vc.code='D-LIM-1' and vc.status='issued'), '1'),
 ('D5 zadny volny omezeny kod nezustal',
   (select count(*)::text from public.voucher_codes vc
      where vc.distribution_order_id=(select (v::jsonb->>'order_id')::uuid from t_env where k='L') and vc.status='available'), '0'),
 ('D6 pozastaveny benefit: nabidka nedostupna', (select j->>'available' from e where k='d_susp_offer'), 'false'),
 ('D7 pozastaveny benefit: nakup selze', (select j->>'error' from e where k='d_susp'), 'no_benefit_available'),
 ('D8 po navratu na approved nakup projde', (select j->>'success' from e where k='d_resumed'), 'true'),
 ('D9 po navratu je to neomezeny benefit', (select j->>'is_unlimited' from e where k='d_resumed'), 'true'),
 ('D10 odpojena vazba: nabidka nedostupna', (select j->>'available' from e where k='d_det_offer'), 'false'),
 ('D11 odpojena vazba: nakup selze', (select j->>'error' from e where k='d_det'), 'no_benefit_available'),
 ('D12 pri selhani se neodecetlo nic (cust5 = 1000)',
   (select balance_coins::text from public.wallets where user_id='1a000000-0000-4000-8000-000000000005'), '1000.00'),
 ('D13 celkem 4 issuance', (select count(*)::text from public.voucher_issuances vi
    where vi.user_id::text like '1a000000-0000-4000-8000-00000000000%'), '4')
) as t(step, actual, expected);
rollback;

-- ===========================================================================
-- BLOK E — regrese Partner Offers a izolace
-- ===========================================================================
begin;
set local statement_timeout = '120s';
insert into public.contests(id, title, name, main_prize, status, ticket_price, ticket_count, next_ticket_number, rules_pdf_url)
values ('1c000000-0000-4000-8000-0000000000e1','PO REGRESE','PO REGRESE','V','active',10,1000,1,'https://example.com/e1.pdf');

select * from (values
 ('E1 Partner Offers trigger na contests je nedotceny',
   (select count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace join pg_proc p on p.oid=t.tgfoid
      where n.nspname='public' and c.relname='contests' and t.tgname='trg_contest_link_offers'
        and p.proname='trg_fn_link_offers_to_new_contest' and not t.tgisinternal), '1'),
 ('E2 linkovaci funkce PO nesaha na benefitove tabulky',
   (select case when pg_get_functiondef(p.oid) ilike '%voucher_distribution%' then 'contaminated' else 'clean' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='trg_fn_link_offers_to_new_contest'), 'clean'),
 ('E3 assign_partner_offer_to_ticket nesaha na benefity',
   (select case when pg_get_functiondef(p.oid) ilike '%voucher_distribution%'
                  or pg_get_functiondef(p.oid) ilike '%guaranteed%' then 'contaminated' else 'clean' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='assign_partner_offer_to_ticket'), 'clean'),
 ('E4 nakupni RPC nesaha na Partner Offers',
   (select case when pg_get_functiondef(p.oid) ilike '%partner_offer%' then 'contaminated' else 'clean' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='purchase_guaranteed_benefit_bundle_atomic'), 'clean'),
 ('E5 validace nesaha na Partner Offers',
   (select case when pg_get_functiondef(p.oid) ilike '%partner_offer%' then 'contaminated' else 'clean' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='validate_guaranteed_benefit_links'), 'clean'),
 -- POZOR: trigger Partner Offers filtruje deployment_mode='all_contests'.
 ('E6 nova soutez dostala vazby vsech approved all_contests nabidek',
   (select count(*)::text from public.partner_offer_contests where contest_id='1c000000-0000-4000-8000-0000000000e1'),
   (select count(*)::text from public.partner_offers where status='approved' and deployment_mode='all_contests')),
 ('E6b nova soutez dostala odpovidajici benefitove vazby',
   (select count(*)::text from public.voucher_distribution_contests where contest_id='1c000000-0000-4000-8000-0000000000e1'),
   (select count(*)::text from public.voucher_distribution_orders o join public.vouchers v on v.id=o.voucher_id
      where o.status='approved' and o.distribution_scope='all_contests' and v.distribution_mode='guaranteed_purchase_benefit')),
 ('E7 benefitovy trigger na contests bezi nezavisle vedle PO',
   (select count(*)::text from pg_trigger t join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname='contests'
        and t.tgname in ('trg_contest_link_offers','trg_link_guaranteed_benefits_to_contest')
        and not t.tgisinternal), '2'),
 ('E8 buy_ticket_atomic nedotcen benefitovou logikou',
   (select case when pg_get_functiondef(p.oid) ilike '%voucher_distribution_contests%' then 'contaminated' else 'clean' end
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='buy_ticket_atomic'), 'clean'),
 ('E9 anon nema EXECUTE na nakupni RPC',
   (select has_function_privilege('anon','public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)','EXECUTE')::text), 'false'),
 ('E10 authenticated ma EXECUTE na nakupni RPC',
   (select has_function_privilege('authenticated','public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)','EXECUTE')::text), 'true')
) as t(step, actual, expected);
rollback;
