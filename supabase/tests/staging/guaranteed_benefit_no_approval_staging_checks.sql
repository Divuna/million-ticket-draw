-- Garantované benefity BEZ schvalovacího workflow — ověření proti STAGINGU.
--
-- Spouštět POUZE na stagingu dxmowysntemfqfnanxua, v Supabase SQL Editoru.
-- Oba bloky běží ve vlastní transakci zakončené ROLLBACK — nezanechávají data.
-- NIKDY nespouštět proti produkci xkzhjldrojjlrkezorey.
--
-- Navazuje na guaranteed_benefit_admin_base_staging_checks.sql (blok A–F).
-- Ověřuje rozhodnutí Pavla: v první verzi NENÍ schvalovací workflow —
-- benefit je po uložení rovnou provozní a admin s `guaranteed_benefits.manage`
-- si sám nastaví i cenu pro OneMil.
--
-- Předpoklady (staging):
--   admin      3960e47f-b583-4ef9-a48f-786bfe432bbd  admin-e2e@onemil.cz
--   superadmin c951dcc8-503e-4a1a-9544-bfc989b3bf60  superadmin-e2e@onemil.cz
--   alespoň jedna soutěž ve stavu 'active'
--
-- Pozn. `public.audit_logs` má sloupce (user_id, event, metadata, created_at) —
-- nikoli `action`/`timestamp`.

-- ═══ G. Benefit je po vytvoření rovnou provozní ════════════════════════════
begin;

create temp table g_res(seq serial, name text, expected text, actual text) on commit drop;
create temp table g_ctx(k text primary key, v text) on commit drop;
grant all on g_res, g_ctx to authenticated;
grant usage on all sequences in schema pg_temp to authenticated;

insert into public.admin_permissions(user_id, permission_key)
values ('3960e47f-b583-4ef9-a48f-786bfe432bbd','guaranteed_benefits.manage');

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';

insert into g_ctx select 'partner',
  (public.admin_create_benefit_partner('NOAPPROVAL TEST FIRMA', null, 'https://noapproval-test.cz')->>'partner_id');

insert into g_ctx select 'unl', (public.admin_create_guaranteed_benefit(
  (select v from g_ctx where k='partner')::uuid,
  'Neomezena sleva 10 %', 'Sleva 10 %', 'Zadejte kod v kosiku.', 'Neplati na akcni zbozi.',
  'percentage', 10, null, 'CZK', null, null, null,
  true, 'ONEMIL10', null, 'all_contests', null, 7.50, 21)->>'order_id');

insert into g_res(name,expected,actual)
  select 'G1 admin s klicem zalozi benefit bez superadmina','true|approved|7.50|21.00|CZK',
    (r->>'success')||'|'||(r->>'order_status')||'|'||(r->>'unit_price_ex_vat')||'|'||(r->>'vat_rate_percent')||'|'||(r->>'currency')
  from (select public.admin_create_guaranteed_benefit(
    (select v from g_ctx where k='partner')::uuid,
    'Druha neomezena sleva', 'x', 'Zadejte kod.', 'Podminky.',
    'percentage', 5, null, 'CZK', null, null, null,
    true, 'ONEMIL5', null, 'all_contests', null, 7.50, 21) as r) s;

insert into g_ctx select 'lim', (public.admin_create_guaranteed_benefit(
  (select v from g_ctx where k='partner')::uuid,
  'Omezena sleva 50 Kc', 'x', 'Zadejte kod.', 'Jednorazove.',
  'fixed_amount', 50, null, 'CZK', null, null, null,
  false, null, array['NA-1','NA-2','NA-3'], 'selected_contests',
  array(select id from public.contests where status='active' limit 1), 12, 21)->>'order_id');

insert into g_res(name,expected,actual)
  select 'G2 benefit bez ceny se zalozi s 0','true|approved|0.00',
    (r->>'success')||'|'||(r->>'order_status')||'|'||(r->>'unit_price_ex_vat')
  from (select public.admin_create_guaranteed_benefit(
    (select v from g_ctx where k='partner')::uuid,
    'Benefit zdarma', 'x', 'Zadejte kod.', 'Podminky.',
    'other', null, null, 'CZK', null, null, null,
    true, 'FREE1', null, 'all_contests', null, null, 21) as r) s;

insert into g_res(name,expected,actual)
  select 'G3 admin s klicem nastavi cenu pro OneMil','true',
    (public.admin_set_guaranteed_benefit_price((select v from g_ctx where k='partner')::uuid, 9.25, 21, 'CZK')->>'success');

insert into g_res(name,expected,actual)
  select 'G4 admin pozastavi benefit','true|suspended',
    (r->>'success')||'|'||(r->>'order_status')
  from (select public.admin_set_guaranteed_benefit_status((select v from g_ctx where k='unl')::uuid,'suspended','test') as r) s;

insert into g_res(name,expected,actual)
  select 'G5 admin benefit znovu zapne','true|approved',
    (r->>'success')||'|'||(r->>'order_status')
  from (select public.admin_set_guaranteed_benefit_status((select v from g_ctx where k='unl')::uuid,'approved',null) as r) s;

-- Ne schvalovaci krok, ale auditni invariant: obsah vydaneho benefitu je nemenny.
insert into g_res(name,expected,actual)
  select 'G6 obsah schvaleneho benefitu je nemenny','benefit_content_immutable',
    (public.admin_update_guaranteed_benefit((select v from g_ctx where k='unl')::uuid,'HACK')->>'error');

insert into g_res(name,expected,actual)
  select 'G7 admin vidi cenu v detailu','7.50|21.00|CZK',
    (b->'benefit'->>'unit_price_ex_vat_snapshot')||'|'||(b->'benefit'->>'vat_rate_percent_snapshot')||'|'||(b->'benefit'->>'currency_snapshot')
  from (select public.admin_get_guaranteed_benefit((select v from g_ctx where k='unl')::uuid) as b) s;

insert into g_res(name,expected,actual)
  select 'G15 distribuci lze menit i u provozniho benefitu','true|selected_contests',
    (r->>'success')||'|'||(r->>'distribution_scope')
  from (select public.admin_set_benefit_distribution((select v from g_ctx where k='unl')::uuid,'selected_contests',
     array(select id from public.contests where status='active' limit 1)) as r) s;
reset role;

insert into g_res(name,expected,actual)
  select 'G8 order|version|voucher po vytvoreni','approved|approved|approved',
    o.status||'|'||vv.status||'|'||v.workflow_status
  from public.voucher_distribution_orders o
  join public.voucher_versions vv on vv.id=o.voucher_version_id
  join public.vouchers v on v.id=o.voucher_id
  where o.id=(select v from g_ctx where k='unl')::uuid;

insert into g_res(name,expected,actual)
  select 'G9 cenovy snapshot + decided_by vyplneny','true|true',
    (o.price_rule_id is not null and o.unit_price_ex_vat_snapshot is not null
      and o.vat_rate_percent_snapshot is not null and o.currency_snapshot is not null)::text
    ||'|'|| (o.decided_by is not null and o.decided_at is not null)::text
  from public.voucher_distribution_orders o where o.id=(select v from g_ctx where k='unl')::uuid;

insert into g_res(name,expected,actual)
  select 'G10 omezeny: volne kody|approved_code_count|status','3|3|approved',
    (select count(*)::text from public.voucher_codes vc where vc.distribution_order_id=o.id and vc.status='available')
    ||'|'|| vv.approved_code_count::text ||'|'|| o.status
  from public.voucher_distribution_orders o
  join public.voucher_versions vv on vv.id=o.voucher_version_id
  where o.id=(select v from g_ctx where k='lim')::uuid;

insert into g_res(name,expected,actual)
  select 'G11 current_approved_version_id nastaveno','true',
    (v.current_approved_version_id = o.voucher_version_id)::text
  from public.voucher_distribution_orders o join public.vouchers v on v.id=o.voucher_id
  where o.id=(select v from g_ctx where k='unl')::uuid;

insert into g_res(name,expected,actual)
  select 'G12 audit zachovan (created|price_set|status_set)','true',
    (count(*) filter (where a.event='guaranteed_benefit_created') >= 3
     and count(*) filter (where a.event='guaranteed_benefit_price_set') >= 1
     and count(*) filter (where a.event='guaranteed_benefit_status_set') >= 2)::text
  from public.audit_logs a
  where a.user_id='3960e47f-b583-4ef9-a48f-786bfe432bbd'
    and a.created_at > now() - interval '2 minutes';

insert into g_res(name,expected,actual)
  select 'G13 zadne vydani benefitu nevzniklo','0',
    (select count(*)::text from public.voucher_issuances vi
     where vi.distribution_order_id in (select v::uuid from g_ctx where k in ('unl','lim')));

insert into g_res(name,expected,actual)
  select 'G14 evidencni firma stale bez prav','true|false|false|false',
    p.benefit_only_record::text||'|'||(p.auth_user_id is not null)::text||'|'||
    p.shoptet_import_enabled::text||'|'||p.payout_ready::text
  from public.partners p where p.id=(select v from g_ctx where k='partner')::uuid;

select name, expected, actual, (expected = actual) as pass from g_res order by seq;

rollback;

-- ═══ R. Regrese: klasický voucherový katalog zůstává superadmin-only ═══════
-- Uvolnění guardu `guard_voucher_delete_and_review` se smí týkat VÝHRADNĚ
-- vouchers s distribution_mode = 'guaranteed_purchase_benefit'.
begin;

create temp table r_res(seq serial, name text, expected text, actual text) on commit drop;
grant all on r_res to authenticated;
grant usage on all sequences in schema pg_temp to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into r_res(name,expected,actual)
  select 'R1 admin bez klice can=false','false', public.can_manage_guaranteed_benefits()::text;
insert into r_res(name,expected,actual)
  select 'R2 admin bez klice nezalozi benefit','forbidden',
    (public.admin_create_guaranteed_benefit(
      (select id from public.partners limit 1),'X','x','x','x','other',null,null,'CZK',
      null,null,null,true,'K',null,'all_contests',null,1,21)->>'error');
insert into r_res(name,expected,actual)
  select 'R3 admin bez klice nenastavi cenu','forbidden',
    (public.admin_set_guaranteed_benefit_price((select id from public.partners limit 1), 5, 21, 'CZK')->>'error');
insert into r_res(name,expected,actual)
  select 'R4 admin bez klice nemeni stav benefitu','forbidden',
    (public.admin_set_guaranteed_benefit_status((select id from public.voucher_distribution_orders limit 1),'suspended',null)->>'error');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c951dcc8-503e-4a1a-9544-bfc989b3bf60","role":"authenticated"}';
insert into r_res(name,expected,actual)
  select 'R5 superadmin can=true','true', public.can_manage_guaranteed_benefits()::text;
reset role;

insert into public.admin_permissions(user_id, permission_key)
values ('3960e47f-b583-4ef9-a48f-786bfe432bbd','guaranteed_benefits.manage');

insert into public.vouchers (id, name, image_url, is_public, workflow_status, distribution_mode)
values ('aaaa1111-0000-4000-8000-00000000cafe','CLASSIC REGRESSION VOUCHER','', false, 'draft', 'classic');

do $$
declare v text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
  begin
    update public.vouchers
    set workflow_status='approved', approved_at=now(), approved_by='3960e47f-b583-4ef9-a48f-786bfe432bbd'
    where id='aaaa1111-0000-4000-8000-00000000cafe';
    v := 'allowed';
  exception when others then v := 'blocked';
  end;
  reset role;
  insert into r_res(name,expected,actual)
  values ('R6 admin s klicem NESMI schvalit klasicky voucher','blocked', v);
end $$;

do $$
declare v text;
begin
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
  begin
    update public.vouchers
    set distribution_mode='guaranteed_purchase_benefit',
        workflow_status='approved', approved_at=now(), approved_by='3960e47f-b583-4ef9-a48f-786bfe432bbd'
    where id='aaaa1111-0000-4000-8000-00000000cafe';
    v := 'allowed';
  exception when others then v := 'blocked';
  end;
  reset role;
  insert into r_res(name,expected,actual)
  values ('R7 preklopeni classic->benefit neobejde branu','blocked', v);
end $$;

insert into public.partners (name, logo_url, website_url, benefit_only_record, created_for)
values ('REGRESSION BENEFIT FIRMA', '', 'https://regression-benefit.cz', true, 'guaranteed_benefit');

do $$
declare v text;
begin
  begin
    update public.partners set auth_user_id='c951dcc8-503e-4a1a-9544-bfc989b3bf60'
    where name='REGRESSION BENEFIT FIRMA';
    v := 'allowed';
  exception when others then v := 'blocked';
  end;
  insert into r_res(name,expected,actual) values ('R8 evidencni firma bez auth uctu','blocked', v);
end $$;

do $$
declare v text;
begin
  begin
    insert into public.partner_api_keys(partner_id, key_prefix, key_hash)
    values ((select id from public.partners where name='REGRESSION BENEFIT FIRMA'), 'regr1234', 'x');
    v := 'allowed';
  exception when others then v := 'blocked';
  end;
  insert into r_res(name,expected,actual) values ('R9 evidencni firma bez API klice','blocked', v);
end $$;

select name, expected, actual, (expected = actual) as pass from r_res order by seq;

rollback;
