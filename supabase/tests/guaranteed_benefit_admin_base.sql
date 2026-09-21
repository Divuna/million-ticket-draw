-- Kontraktní test pro admin-only základ garantovaných nákupních benefitů.
--
-- Ověřuje strukturu a oprávnění, na kterých stojí bezpečnost oblasti:
--   * nové oprávnění je gated helperem can_manage_guaranteed_benefits,
--   * anon nemá EXECUTE na žádné nové RPC,
--   * evidenční firma (benefit_only_record) má guard triggery,
--   * vazební tabulka má RLS a POUZE SELECT policy (zápis jen přes RPC),
--   * neomezený benefit je vyjádřitelný bez voucher_codes,
--   * defaulty reprodukují dnešní chování (is_unlimited=false,
--     distribution_scope='single_contest').
--
-- Funkční chování (dedup firmy, vytvoření omezeného/neomezeného benefitu,
-- přepínání distribuce, gating rolí) je ověřeno proti stagingu skriptem
-- supabase/tests/staging/guaranteed_benefit_admin_base_staging_checks.sql.

begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_temp;

select plan(42);

-- ── Gate helper ────────────────────────────────────────────────────────────
select ok(
  to_regprocedure('public.can_manage_guaranteed_benefits(uuid)') is not null,
  'gate helper can_manage_guaranteed_benefits(uuid) existuje'
);

select ok(
  not has_function_privilege('anon', 'public.can_manage_guaranteed_benefits(uuid)', 'EXECUTE'),
  'anon nemá EXECUTE na gate helper'
);

select ok(
  has_function_privilege('authenticated', 'public.can_manage_guaranteed_benefits(uuid)', 'EXECUTE'),
  'authenticated má EXECUTE na gate helper'
);

select is(
  (select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'can_manage_guaranteed_benefits'),
  true,
  'gate helper je SECURITY DEFINER'
);

-- ── Nové RPC existují a nejsou volatelné anonymně ──────────────────────────
select ok(
  to_regprocedure('public.admin_search_benefit_partners(text)') is not null,
  'admin_search_benefit_partners existuje'
);
select ok(
  to_regprocedure('public.admin_match_benefit_partner(text,text,text,text)') is not null,
  'admin_match_benefit_partner existuje'
);
select ok(
  to_regprocedure('public.admin_create_benefit_partner(text,text,text,text,text,text,text,text,text,text,text,text,boolean)') is not null,
  'admin_create_benefit_partner existuje'
);
select ok(
  to_regprocedure('public.admin_update_benefit_partner(uuid,text,text,text,text,text,text,text,text,text,text,text,text)') is not null,
  'admin_update_benefit_partner existuje'
);
select ok(
  to_regprocedure('public.admin_create_guaranteed_benefit(uuid,text,text,text,text,text,numeric,numeric,text,timestamptz,timestamptz,text,boolean,text,text[],text,uuid[])') is not null,
  'admin_create_guaranteed_benefit existuje'
);
select ok(
  to_regprocedure('public.admin_set_benefit_distribution(uuid,text,uuid[])') is not null,
  'admin_set_benefit_distribution existuje'
);
select ok(
  to_regprocedure('public.admin_list_guaranteed_benefits()') is not null,
  'admin_list_guaranteed_benefits existuje'
);

select ok(
  not has_function_privilege('anon', 'public.admin_create_benefit_partner(text,text,text,text,text,text,text,text,text,text,text,text,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_create_guaranteed_benefit(uuid,text,text,text,text,text,numeric,numeric,text,timestamptz,timestamptz,text,boolean,text,text[],text,uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_set_benefit_distribution(uuid,text,uuid[])', 'EXECUTE'),
  'anon nemá EXECUTE na žádné zapisující RPC'
);

-- ── Evidenční firma ────────────────────────────────────────────────────────
select has_column('public', 'partners', 'benefit_only_record', 'partners.benefit_only_record existuje');
select has_column('public', 'partners', 'created_for', 'partners.created_for existuje');

select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'partners' and column_name = 'benefit_only_record'),
  'false',
  'benefit_only_record má default false — existující partneři se nemění'
);

select ok(
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'partners'
            and t.tgname = 'trg_guard_benefit_only_partner' and not t.tgisinternal),
  'guard trigger na partners existuje'
);

select ok(
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'partner_api_keys'
            and t.tgname = 'trg_guard_benefit_only_partner_api_key' and not t.tgisinternal),
  'guard trigger na partner_api_keys existuje'
);

-- ── Neomezený benefit ──────────────────────────────────────────────────────
select has_column('public', 'voucher_versions', 'shared_code_or_url', 'voucher_versions.shared_code_or_url existuje');
select has_column('public', 'voucher_distribution_orders', 'is_unlimited', 'voucher_distribution_orders.is_unlimited existuje');
select has_column('public', 'voucher_distribution_orders', 'distribution_scope', 'voucher_distribution_orders.distribution_scope existuje');

select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'voucher_distribution_orders' and column_name = 'is_unlimited'),
  'false',
  'is_unlimited má default false — legacy ordery se nemění'
);

select is(
  (select column_default from information_schema.columns
   where table_schema = 'public' and table_name = 'voucher_distribution_orders' and column_name = 'distribution_scope'),
  '''single_contest''::text',
  'distribution_scope má default single_contest — legacy ordery se nemění'
);

select ok(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conname = 'voucher_versions_code_source_check') like '%shared_static%',
  'code_source povoluje shared_static'
);

-- ── Vazební tabulka ────────────────────────────────────────────────────────
select has_table('public', 'voucher_distribution_contests', 'voucher_distribution_contests existuje');

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'voucher_distribution_contests'),
  'voucher_distribution_contests má zapnuté RLS'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'voucher_distribution_contests' and cmd = 'SELECT'),
  1,
  'vazební tabulka má právě jednu SELECT policy'
);

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'voucher_distribution_contests' and cmd <> 'SELECT'),
  0,
  'vazební tabulka nemá žádnou write policy — zápis jen přes SECURITY DEFINER RPC'
);

-- ── Bez schvalovacího workflow (první verze) ───────────────────────────────
select ok(
  to_regprocedure('public.admin_create_guaranteed_benefit(uuid,text,text,text,text,text,numeric,numeric,text,timestamptz,timestamptz,text,boolean,text,text[],text,uuid[],numeric,numeric)') is not null,
  'admin_create_guaranteed_benefit přijímá i cenu pro OneMil'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'admin_create_guaranteed_benefit'),
  1,
  'existuje právě jedna verze admin_create_guaranteed_benefit (žádný nejednoznačný overload)'
);

select ok(
  to_regprocedure('public.admin_set_guaranteed_benefit_price(uuid,numeric,numeric,text)') is not null
  and has_function_privilege('authenticated', 'public.admin_set_guaranteed_benefit_price(uuid,numeric,numeric,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_set_guaranteed_benefit_price(uuid,numeric,numeric,text)', 'EXECUTE'),
  'cenu pro OneMil smí nastavit admin s oprávněním, nikdy anon'
);

select ok(
  to_regprocedure('public.admin_set_guaranteed_benefit_status(uuid,text,text)') is not null
  and has_function_privilege('authenticated', 'public.admin_set_guaranteed_benefit_status(uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_set_guaranteed_benefit_status(uuid,text,text)', 'EXECUTE'),
  'provozní stav benefitu řídí admin s oprávněním, nikdy anon'
);

-- Interní cenový helper se nesmí volat z klienta.
select ok(
  not has_function_privilege('anon', 'public.resolve_benefit_price_rule(uuid,numeric,numeric,text,uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.resolve_benefit_price_rule(uuid,numeric,numeric,text,uuid)', 'EXECUTE'),
  'interní resolve_benefit_price_rule není volatelný z klienta'
);

-- ── Distribuce do soutěží ──────────────────────────────────────────────────
select ok(
  to_regprocedure('public.sync_guaranteed_benefit_order_contests(uuid)') is not null
  and not has_function_privilege('anon', 'public.sync_guaranteed_benefit_order_contests(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.sync_guaranteed_benefit_order_contests(uuid)', 'EXECUTE'),
  'interní sync distribuce existuje a není volatelný z klienta'
);

select ok(
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'voucher_distribution_orders'
            and t.tgname = 'trg_sync_benefit_order_contests' and not t.tgisinternal),
  'trigger synchronizace na voucher_distribution_orders existuje'
);

select ok(
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relname = 'contests'
            and t.tgname = 'trg_link_guaranteed_benefits_to_contest' and not t.tgisinternal),
  'vlastní trigger garantovaných benefitů na contests existuje'
);

-- Partner Offers musí zůstat izolované: jejich trigger na contests zůstává
-- beze změny a běží nezávisle vedle benefitového.
select ok(
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          join pg_proc p on p.oid = t.tgfoid
          where n.nspname = 'public' and c.relname = 'contests'
            and t.tgname = 'trg_contest_link_offers'
            and p.proname = 'trg_fn_link_offers_to_new_contest'
            and not t.tgisinternal),
  'Partner Offers trigger na contests je nedotčený'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'trg_fn_link_offers_to_new_contest')
   not ilike '%voucher_distribution%',
  'Partner Offers linkovací funkce nesahá na benefitové tabulky'
);

-- ── Napojení nákupu na materializované vazby ───────────────────────────────
-- Neomezený benefit nespotřebovává voucher_codes → issuance musí kód povolit
-- jako NULL. Omezený benefit kód dál vyžaduje (drží trigger, ne sloupec).
select col_is_null(
  'public', 'voucher_issuances', 'voucher_code_id',
  'voucher_issuances.voucher_code_id je nullable (neomezený benefit bez kódu)'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchase_guaranteed_benefit_bundle_atomic')
   ilike '%voucher_distribution_contests%',
  'nákup vybírá benefit přes voucher_distribution_contests'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'purchase_guaranteed_benefit_bundle_atomic')
   ilike '%for update of vc skip locked%',
  'souběh nad posledními kódy drží FOR UPDATE ... SKIP LOCKED'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_guaranteed_benefit_offer')
   ilike '%voucher_distribution_contests%',
  'dostupnost nabídky se počítá přes voucher_distribution_contests'
);

select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'validate_guaranteed_benefit_links')
   ilike '%voucher_distribution_contests%',
  'validace issuance ověřuje vazbu soutěže přes voucher_distribution_contests'
);

-- buy_ticket_atomic zůstává mimo benefitovou logiku.
select ok(
  (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'buy_ticket_atomic')
   not ilike '%voucher_distribution%',
  'buy_ticket_atomic nesahá na garantované benefity'
);

select * from finish();
rollback;
