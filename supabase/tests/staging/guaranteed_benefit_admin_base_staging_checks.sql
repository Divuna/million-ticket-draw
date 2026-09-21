-- Funkční ověření admin-only základu garantovaných benefitů proti STAGINGU.
--
-- Spouštět POUZE na stagingu dxmowysntemfqfnanxua, v Supabase SQL Editoru.
-- Celý skript běží v jedné transakci zakončené ROLLBACK — nezanechává data.
-- NIKDY nespouštět proti produkci xkzhjldrojjlrkezorey.
--
-- Vzor odpovídá zavedené praxi projektu: dočasný role flip + grant oprávnění
-- uvnitř transakce s rollbackem (viz Phase 1/2 staging ověření v CLAUDE.md).
--
-- Předpoklady (staging): admin bez klíče a superadmin níže existují.
--   admin      3960e47f-b583-4ef9-a48f-786bfe432bbd  admin-e2e@onemil.cz
--   superadmin c951dcc8-503e-4a1a-9544-bfc989b3bf60  superadmin-e2e@onemil.cz
--
-- Poznámky k psaní dalších testů (zjištěno při ověřování):
--   * Čtení voucher_* tabulek pod rolí authenticated blokuje RLS — read-back
--     dělat po `reset role`, nebo přes admin_* RPC.
--   * admin_get_guaranteed_benefit je STABLE; nevolat ho ve stejném SQL
--     statementu jako admin_set_benefit_distribution (vidí starý snapshot).

begin;

create temp table t_res(seq serial, name text, expected text, actual text) on commit drop;
create temp table t_ctx(k text primary key, v text) on commit drop;
grant all on t_res, t_ctx to authenticated;
grant usage on all sequences in schema pg_temp to authenticated;

-- ═══ A. Oprávnění ══════════════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into t_res(name,expected,actual)
  select 'A1 admin bez klice can=false','false', public.can_manage_guaranteed_benefits()::text;
insert into t_res(name,expected,actual)
  select 'A2 admin bez klice list=forbidden','forbidden', (public.admin_list_guaranteed_benefits()->>'error');
insert into t_res(name,expected,actual)
  select 'A3 admin bez klice create partner=forbidden','forbidden',
         (public.admin_create_benefit_partner('X Test s.r.o.')->>'error');
insert into t_res(name,expected,actual)
  select 'E3 admin bez klice nevidi vazebni tabulku','0',
         (select count(*)::text from public.voucher_distribution_contests);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"c951dcc8-503e-4a1a-9544-bfc989b3bf60","role":"authenticated"}';
insert into t_res(name,expected,actual)
  select 'A4 superadmin can=true','true', public.can_manage_guaranteed_benefits()::text;
reset role;

do $$
declare v text;
begin
  set local role anon;
  begin
    perform public.can_manage_guaranteed_benefits();
    v := 'callable';
  exception when insufficient_privilege then
    v := 'permission_denied';
  end;
  reset role;
  insert into t_res(name,expected,actual) values ('A5 anon EXECUTE zakazan','permission_denied', v);
end $$;

-- grant klíče adminovi (rollbackne se)
insert into public.admin_permissions(user_id, permission_key)
values ('3960e47f-b583-4ef9-a48f-786bfe432bbd','guaranteed_benefits.manage');

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into t_res(name,expected,actual)
  select 'A6 admin s klicem can=true','true', public.can_manage_guaranteed_benefits()::text;
insert into t_res(name,expected,actual)
  select 'A7 admin s klicem list ok','true', (public.admin_list_guaranteed_benefits()->>'success');
insert into t_res(name,expected,actual)
  select 'E4 admin s klicem vidi vazebni tabulku','true',
         ((select count(*) from public.voucher_distribution_contests) > 0)::text;
reset role;

-- ═══ B. Deduplikace firmy ══════════════════════════════════════════════════
insert into public.partners (name, logo_url, website_url, contact_email, ico, benefit_only_record, created_for)
values ('DEDUP TEST a.s.', '', 'https://www.dedup-test.cz/kontakt', 'info@dedup-test.cz', '12345678', true, 'guaranteed_benefit');

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';

insert into t_res(name,expected,actual)
  select 'B1 dedup podle ICO (jina formatace)','false|ico',
    (public.admin_create_benefit_partner('Uplne jiny nazev', null, null, null, null, null, '123 456 78')->>'was_created')
    ||'|'||
    (public.admin_create_benefit_partner('Uplne jiny nazev', null, null, null, null, null, '123 456 78')->>'matched_by');

insert into t_res(name,expected,actual)
  select 'B2 dedup podle domeny (jiny zapis URL)','false|website_domain',
    (public.admin_create_benefit_partner('Jiny nazev 2', null, 'http://dedup-test.cz/o-nas')->>'was_created')
    ||'|'||
    (public.admin_create_benefit_partner('Jiny nazev 2', null, 'http://dedup-test.cz/o-nas')->>'matched_by');

insert into t_res(name,expected,actual)
  select 'B3 dedup podle e-mailu (case+mezery)','false|contact_email',
    (public.admin_create_benefit_partner('Jiny nazev 3', null, null, null, '  INFO@Dedup-Test.CZ ')->>'was_created')
    ||'|'||
    (public.admin_create_benefit_partner('Jiny nazev 3', null, null, null, '  INFO@Dedup-Test.CZ ')->>'matched_by');

insert into t_res(name,expected,actual)
  select 'B4 fuzzy nazev vyzaduje potvrzeni','name_match_needs_confirmation',
    (public.admin_create_benefit_partner('DEDUP TEST')->>'error');

insert into t_res(name,expected,actual)
  select 'B5 potvrzeni zaklada novou firmu','true',
    (public.admin_create_benefit_partner('DEDUP TEST', null, null, null, null, null, null, null, null, null, null, 'CZ', true)->>'was_created');

insert into t_res(name,expected,actual)
  select 'B6 nova firma bez shody','true',
    (public.admin_create_benefit_partner('Zcela Nova Firma XYZ 99', null, 'https://nova-firma-xyz99.cz', null, 'kontakt@nova-firma-xyz99.cz', null, '99887766')->>'was_created');
reset role;

insert into t_res(name,expected,actual)
  select 'B7 evidencni firma bez partnerskych prav','true|false|false|false|false',
    p.benefit_only_record::text ||'|'|| (p.auth_user_id is not null)::text ||'|'||
    p.shoptet_import_enabled::text ||'|'|| p.payout_ready::text ||'|'||
    (p.public_ref_code is not null)::text
  from public.partners p where p.name = 'Zcela Nova Firma XYZ 99';

insert into t_res(name,expected,actual)
  select 'B8 evidencni firma nema API klic','0', count(*)::text
  from public.partner_api_keys k join public.partners p on p.id = k.partner_id
  where p.name = 'Zcela Nova Firma XYZ 99';

-- ═══ C. Vytvoření benefitu ═════════════════════════════════════════════════
set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';

insert into t_ctx select 'partner',
  (public.admin_create_benefit_partner('BENEFIT TEST FIRMA ABC', null, 'https://benefit-test-abc.cz')->>'partner_id');

insert into t_ctx select 'unl', (public.admin_create_guaranteed_benefit(
  (select v from t_ctx where k='partner')::uuid,
  'Neomezena sleva 10 %', 'Sleva 10 % na vse', 'Zadejte kod v kosiku.', 'Neplati na akcni zbozi.',
  'percentage', 10, null, 'CZK', null, null, null,
  true, 'ONEMIL10', null, 'all_contests', null)->>'order_id');

insert into t_ctx select 'lim', (public.admin_create_guaranteed_benefit(
  (select v from t_ctx where k='partner')::uuid,
  'Omezena sleva 50 Kc', 'Sleva 50 Kc', 'Zadejte kod v kosiku.', 'Jednorazove.',
  'fixed_amount', 50, null, 'CZK', null, null, null,
  false, null, array['ABC-1','ABC-2','ABC-2','  ABC-3  '], 'selected_contests',
  array(select id from public.contests where status='active' limit 1))->>'order_id');

insert into t_res(name,expected,actual)
  select 'C3 neomezeny bez trvaleho kodu = chyba','shared_code_or_url_required',
    (public.admin_create_guaranteed_benefit((select v from t_ctx where k='partner')::uuid,
      'X','x','x','x','other',null,null,'CZK',null,null,null,true,null,null,'all_contests',null)->>'error');

insert into t_res(name,expected,actual)
  select 'C4 omezeny bez kodu = chyba','codes_required',
    (public.admin_create_guaranteed_benefit((select v from t_ctx where k='partner')::uuid,
      'X','x','x','x','other',null,null,'CZK',null,null,null,false,null,null,'all_contests',null)->>'error');

insert into t_res(name,expected,actual)
  select 'C5 vybrane souteze bez vyberu = chyba','contest_selection_required',
    (public.admin_create_guaranteed_benefit((select v from t_ctx where k='partner')::uuid,
      'X','x','x','x','other',null,null,'CZK',null,null,null,true,'KOD',null,'selected_contests',null)->>'error');

insert into t_res(name,expected,actual)
  select 'D1 bezny partner je chraneny','not_a_benefit_only_partner',
    (public.admin_update_benefit_partner(
       (select id from public.partners where benefit_only_record=false order by created_at limit 1),'HACK')->>'error');
reset role;

insert into t_res(name,expected,actual)
  select 'C1 neomezeny: unlimited|scope|source|pocet_kodu','true|all_contests|shared_static|0',
    o.is_unlimited::text||'|'||o.distribution_scope||'|'||vv.code_source||'|'||
    (select count(*) from public.voucher_codes vc where vc.distribution_order_id=o.id)::text
  from public.voucher_distribution_orders o
  join public.voucher_versions vv on vv.id=o.voucher_version_id
  where o.id=(select v from t_ctx where k='unl')::uuid;

insert into t_res(name,expected,actual)
  select 'C1b neomezeny ma trvaly kod a contest_id NULL','ONEMIL10|true',
    vv.shared_code_or_url||'|'||(o.contest_id is null)::text
  from public.voucher_distribution_orders o
  join public.voucher_versions vv on vv.id=o.voucher_version_id
  where o.id=(select v from t_ctx where k='unl')::uuid;

insert into t_res(name,expected,actual)
  select 'C1c all_contests nevytvari vyctove vazby','0',
    (select count(*)::text from public.voucher_distribution_contests dc
      where dc.order_id=(select v from t_ctx where k='unl')::uuid and dc.detached_at is null);

insert into t_res(name,expected,actual)
  select 'C2 omezeny: unlimited|scope|source|req|volne|souteze','false|selected_contests|provided_by_partner|3|3|1',
    o.is_unlimited::text||'|'||o.distribution_scope||'|'||vv.code_source||'|'||o.requested_quantity::text||'|'||
    (select count(*) from public.voucher_codes vc where vc.distribution_order_id=o.id and vc.status='available')::text||'|'||
    (select count(*) from public.voucher_distribution_contests dc where dc.order_id=o.id and dc.detached_at is null)::text
  from public.voucher_distribution_orders o
  join public.voucher_versions vv on vv.id=o.voucher_version_id
  where o.id=(select v from t_ctx where k='lim')::uuid;

insert into t_res(name,expected,actual)
  select 'C2b duplicitni a orezane kody deduplikovany','ABC-1,ABC-2,ABC-3',
    string_agg(vc.code, ',' order by vc.code)
  from public.voucher_codes vc where vc.distribution_order_id=(select v from t_ctx where k='lim')::uuid;

insert into t_res(name,expected,actual)
  select 'C7 benefit vznika jako koncept','requested|draft|draft',
    o.status||'|'||vv.status||'|'||v.workflow_status
  from public.voucher_distribution_orders o
  join public.voucher_versions vv on vv.id=o.voucher_version_id
  join public.vouchers v on v.id=o.voucher_id
  where o.id=(select v from t_ctx where k='unl')::uuid;

insert into t_res(name,expected,actual)
  select 'C8 zadne vydani benefitu nevzniklo','0',
    (select count(*)::text from public.voucher_issuances vi
     where vi.distribution_order_id in (select v::uuid from t_ctx where k in ('unl','lim')));

-- ═══ C6. Přepínání distribuce (každá mutace/čtení zvlášť) ══════════════════
set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into t_res(name,expected,actual)
  select 'C6a prepnuti na vybrane souteze','true',
    (public.admin_set_benefit_distribution((select v from t_ctx where k='unl')::uuid, 'selected_contests',
       array(select id from public.contests where status='active' limit 1))->>'success');
reset role;

insert into t_res(name,expected,actual)
  select 'C6b scope a pocet vazeb po prepnuti','selected_contests|1',
    (select o.distribution_scope from public.voucher_distribution_orders o
      where o.id=(select v from t_ctx where k='unl')::uuid)
    ||'|'||
    (select count(*)::text from public.voucher_distribution_contests dc
      where dc.order_id=(select v from t_ctx where k='unl')::uuid and dc.detached_at is null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"3960e47f-b583-4ef9-a48f-786bfe432bbd","role":"authenticated"}';
insert into t_res(name,expected,actual)
  select 'C6c zpet na vsechny souteze','true',
    (public.admin_set_benefit_distribution((select v from t_ctx where k='unl')::uuid, 'all_contests', null)->>'success');
reset role;

insert into t_res(name,expected,actual)
  select 'C6d aktivni vazby 0, historie zachovana','all_contests|0|1',
    (select o.distribution_scope from public.voucher_distribution_orders o
      where o.id=(select v from t_ctx where k='unl')::uuid)
    ||'|'||
    (select count(*)::text from public.voucher_distribution_contests dc
      where dc.order_id=(select v from t_ctx where k='unl')::uuid and dc.detached_at is null)
    ||'|'||
    (select count(*)::text from public.voucher_distribution_contests dc
      where dc.order_id=(select v from t_ctx where k='unl')::uuid and dc.detached_at is not null);

-- ═══ D. Guardy evidenční firmy ═════════════════════════════════════════════
do $$
declare v text;
begin
  begin
    update public.partners set auth_user_id = 'c951dcc8-503e-4a1a-9544-bfc989b3bf60'
    where name = 'BENEFIT TEST FIRMA ABC';
    v := 'allowed';
  exception when others then v := 'blocked';
  end;
  insert into t_res(name,expected,actual) values ('D2 evidencni firma nesmi mit auth ucet','blocked', v);
end $$;

do $$
declare v text;
begin
  begin
    insert into public.partner_api_keys(partner_id, key_prefix, key_hash)
    values ((select id from public.partners where name='BENEFIT TEST FIRMA ABC'), 'test1234', 'x');
    v := 'allowed';
  exception when others then v := 'blocked';
  end;
  insert into t_res(name,expected,actual) values ('D3 evidencni firma nesmi mit API klic','blocked', v);
end $$;

do $$
declare v text;
begin
  begin
    update public.partners set status='approved'::partner_status where name='BENEFIT TEST FIRMA ABC';
    v := 'allowed';
  exception when others then v := 'blocked';
  end;
  insert into t_res(name,expected,actual) values ('D4 evidencni firma neni approved partner','blocked', v);
end $$;

-- ═══ F. Historická data ════════════════════════════════════════════════════
insert into t_res(name,expected,actual)
  select 'F1 legacy ordery zustavaji single_contest a omezene','11|11',
    (select count(*)::text from public.voucher_distribution_orders where distribution_scope='single_contest')
    ||'|'||
    (select count(*)::text from public.voucher_distribution_orders where not is_unlimited and status<>'requested');

select name, expected, actual, (expected = actual) as pass from t_res order by seq;

rollback;
