-- =====================================================================================
-- PRVNÍ PŘEDSTARTOVNÍ RESET OneMil — produkce xkzhjldrojjlrkezorey
-- =====================================================================================
-- NESPOUŠTĚT bez nového výslovného schválení Pavla (CLAUDE.md, „PŘEDSTARTOVNÍ RESET").
-- Mapa dat, pořadí a zdůvodnění: docs/reset/first-reset/README.md
--
-- Jeden blok DO = jedna transakce. Jakákoli chyba (kontrola před, TRUNCATE narazí na cizí
-- klíč, kontrola po) vrátí VŠE zpět. S c_dry_run = true se na konci vždy vyvolá výjimka,
-- takže se nic neuloží (suchý běh ukáže jen hlášky NOTICE).
--
-- POVINNÉ PARAMETRY (bez nich skript skončí chybou ještě před prvním zápisem):
--   c_crm_mode          'keep_reassign' = obchodní CRM zůstane, autorství po smazaných účtech
--                                         (RESTRICT sloupce) se přepíše na superadmina
--                       'delete'        = obchodní CRM (leady, e-maily, dávky…) se smaže;
--                                         seznam „nekontaktovat" (suppression) zůstane vždy
--   c_backup_file       název ověřeného souboru zálohy (01_backup_production.ps1)
--   c_dry_run           true = zkouška s rollbackem, false = ostrý běh
-- =====================================================================================

do $reset$
declare
  -- ---------------- PARAMETRY ----------------
  c_superadmin_email constant text := 'divispavel2@gmail.com';
  c_superadmin_id    constant uuid := '60f5837e-a280-4ddd-b0dd-f94cc844bb3b';
  c_crm_mode         constant text := null;      -- 'keep_reassign' | 'delete'  (POVINNÉ)
  c_backup_file      constant text := null;      -- např. 'onemil-production-pre-first-reset-20261001-080000.dump' (POVINNÉ)
  c_dry_run          constant boolean := true;   -- ostrý běh jen po schválení: false

  -- ---------------- KLASIFIKACE TABULEK public ----------------
  -- Zůstávají beze změny (systém, konfigurace, právní texty, seznam „nekontaktovat").
  k_keep text[] := array[
    'settings','content_pages','roles','_messages_policies_backup',
    'sales_lead_groups','sales_lead_public_email_domains','sales_lead_email_templates',
    'sales_lead_email_automation_settings','sales_lead_email_suppression'];
  -- Zůstanou jen řádky superadmina.
  k_partial text[] := array[
    'users','profiles','wallets','user_roles','admin_permissions','user_devices','cookie_consents'];
  -- Vyprázdní se přes DELETE (drží je cizí klíč z tabulky mimo TRUNCATE sadu).
  k_delete text[] := array['partners','affiliate_accounts'];
  -- Obchodní CRM — podle c_crm_mode buď zůstane, nebo se přidá do TRUNCATE sady.
  k_crm text[] := array[
    'sales_leads','sales_lead_activities','sales_lead_status_history',
    'sales_lead_email_batches','sales_lead_email_batch_items','sales_lead_email_batch_skips',
    'sales_lead_email_deliveries','sales_lead_email_response_tokens','sales_lead_email_draft_attachments',
    'sales_lead_duplicate_overrides','sales_lead_tasks','sales_lead_unassigned_emails',
    'sales_lead_discovery_jobs','sales_lead_magin_morning_discovery_jobs',
    'sales_lead_work_intake_runs','sales_lead_work_intake_items'];
  -- Vyprázdní se celé jedním TRUNCATE (bez CASCADE — pokud by na ně odkazovala tabulka mimo
  -- sadu, TRUNCATE selže a celý reset se vrátí).
  k_truncate text[] := array[
    -- soutěže
    'contests','bonus_prizes','tickets','winners','winner_status_history','contest_media',
    'contest_economy','contest_bundle_purchases','user_contest_favorites','prizes',
    'partner_offer_contests','partner_offer_selected_contests','voucher_distribution_contests',
    -- peněženky a platby
    'payments','payment_immediate_use_consents','wallet_lots','wallet_lot_movements',
    'wallet_transactions','bonus_transfer_history',
    -- vouchery a garantované benefity
    'vouchers','voucher_versions','voucher_codes','voucher_code_batches','voucher_distribution_orders',
    'voucher_distribution_price_rules','voucher_issuances','voucher_audit_events',
    'voucher_gallery_images','user_vouchers',
    -- partneři, Shoptet, faktury, nabídky
    'partner_api_keys','partner_api_key_usage','partner_api_requests','partner_coin_activations',
    'partner_customer_refs','partner_invoices','partner_invoice_exports','partner_invoice_items',
    'partner_invoice_item_sources','partner_invoice_lines','partner_offers','partner_offer_activations',
    'partner_offer_billing_configs','partner_offer_clicks','partner_offer_invoice_lines',
    'user_partner_offers','partner_pending_attributions','partner_product_reward_rules',
    'partner_reward_codes','partner_seen_products','shoptet_connection_requests',
    'shoptet_connection_baseline_orders','shoptet_import_runs','shoptet_import_row_log',
    'merchant_affiliate_referrals',
    -- affiliate, výplaty, influenceři, doporučení
    'affiliate_commissions','affiliate_commission_payments','affiliate_commission_recoveries',
    'affiliate_commission_recovery_allocations','affiliate_company_leads','affiliate_company_refs',
    'affiliate_customer_refs','affiliate_payout_batches','affiliate_payout_batch_items',
    'affiliate_payout_documents','affiliate_payout_document_snapshots',
    'influencer_campaigns','influencer_campaign_bonuses_czk','influencer_campaign_events',
    'influencer_campaign_partners','influencer_commissions','influencer_referrals',
    'referrals','referral_codes','referral_rewards','referral_reward_adjustments','referral_shortfalls',
    'referral_shortfall_repayments','referral_attempts','referral_blocked_users','user_security_signals',
    -- komunikace
    'messages','notifications','push_log','push_retry','email_queue',
    -- události, audit a logy testovacího provozu
    'event_logs','event_queue','event_forward_log','debug_event_log','audit_logs','admin_actions',
    'cron_audit_log','user_play_activity','user_legal_acceptances',
    -- bannery
    'banners','coming_soon_banners',
    -- staré zálohovací tabulky z testování
    'backup_audit_logs','backup_contests','backup_tickets','backup_winners','winners_orphan_backup',
    '_backup_vereonika_bad_codes_20260817'];

  v_all_classified text[];
  v_unclassified text;
  v_missing text;
  v_set text[];
  v_sql text;
  v_n bigint;
  v_t text;
  v_keep_before jsonb := '{}'::jsonb;
  v_keep_after  jsonb := '{}'::jsonb;
  v_reassigned jsonb := '{}'::jsonb;
  v_deleted_auth bigint;
  v_sa_before text;
  v_sa_after text;
  v_errors text[] := '{}';
  r record;
begin
  -- =============================== KONTROLY PŘED ===============================
  if c_crm_mode is null or c_crm_mode not in ('keep_reassign','delete') then
    raise exception 'RESET ZASTAVEN: c_crm_mode musí být ''keep_reassign'' nebo ''delete'' (rozhodnutí Pavla).';
  end if;
  if coalesce(trim(c_backup_file), '') = '' then
    raise exception 'RESET ZASTAVEN: chybí c_backup_file — nejdřív ověřená záloha (01_backup_production.ps1).';
  end if;

  perform set_config('lock_timeout', '15s', true);
  perform set_config('statement_timeout', '0', true);

  -- Superadmin: přesně jeden účet s tímto e-mailem, s očekávaným ID a rolí superadmin.
  select count(*) into v_n from auth.users where lower(email) = c_superadmin_email;
  if v_n <> 1 then raise exception 'RESET ZASTAVEN: e-mail superadmina nalezen %×', v_n; end if;
  if not exists (select 1 from auth.users where id = c_superadmin_id and lower(email) = c_superadmin_email) then
    raise exception 'RESET ZASTAVEN: ID superadmina neodpovídá (%).', c_superadmin_id;
  end if;
  if not exists (select 1 from public.user_roles where user_id = c_superadmin_id and role = 'superadmin') then
    raise exception 'RESET ZASTAVEN: účet nemá roli superadmin v user_roles.';
  end if;
  if not exists (select 1 from public.users where id = c_superadmin_id)
     or not exists (select 1 from public.profiles where id = c_superadmin_id)
     or not exists (select 1 from public.wallets where user_id = c_superadmin_id) then
    raise exception 'RESET ZASTAVEN: superadminovi chybí users/profiles/wallets řádek.';
  end if;

  -- Otisk účtu superadmina (auth.users, identity, public.users, profil, role). Reset ho nesmí
  -- nijak změnit — po resetu se porovná.
  select md5(concat_ws('|',
      (select row_to_json(u)::text from auth.users u where u.id = c_superadmin_id),
      (select string_agg(row_to_json(i)::text, ',' order by i.id) from auth.identities i where i.user_id = c_superadmin_id),
      (select row_to_json(p)::text from public.users p where p.id = c_superadmin_id),
      (select row_to_json(p)::text from public.profiles p where p.id = c_superadmin_id),
      (select string_agg(row_to_json(ur)::text, ',' order by ur.id) from public.user_roles ur where ur.user_id = c_superadmin_id)))
    into v_sa_before;

  -- Každá tabulka v public musí být zařazená právě jednou; neznámá tabulka = STOP
  -- (schéma se od vytvoření mapy změnilo a mapu je nutné zopakovat).
  v_all_classified := k_keep || k_partial || k_delete || k_crm || k_truncate;
  select string_agg(t, ', ') into v_unclassified from (
    select table_name::text t from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    except select unnest(v_all_classified)) q;
  if v_unclassified is not null then
    raise exception 'RESET ZASTAVEN: nezařazené tabulky v public: % — zopakuj read-only mapu.', v_unclassified;
  end if;
  select string_agg(t, ', ') into v_missing from (
    select unnest(v_all_classified) t
    except select table_name::text from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE') q;
  if v_missing is not null then
    raise exception 'RESET ZASTAVEN: tabulky z mapy v databázi chybí: % — zopakuj read-only mapu.', v_missing;
  end if;
  select string_agg(t, ', ') into v_t from (
    select t from unnest(v_all_classified) t group by t having count(*) > 1) q;
  if v_t is not null then raise exception 'RESET ZASTAVEN: tabulka zařazena víckrát: %', v_t; end if;

  -- Zachované tabulky se po dobu resetu zamknou proti zápisu (čtení povoleno), aby souběžný
  -- cron (např. obchodní worker) nezměnil počty mezi kontrolou před a po.
  select 'lock table ' || string_agg(format('public.%I', t), ', ') || ' in exclusive mode'
    into v_sql
    from unnest(k_keep || case when c_crm_mode = 'keep_reassign' then k_crm else '{}'::text[] end) t;
  execute v_sql;

  -- Počty zachovaných tabulek před resetem (musí po resetu sedět).
  foreach v_t in array (k_keep || case when c_crm_mode = 'keep_reassign' then k_crm else '{}'::text[] end) loop
    execute format('select count(*) from public.%I', v_t) into v_n;
    v_keep_before := v_keep_before || jsonb_build_object(v_t, v_n);
  end loop;
  raise notice 'Zachované tabulky před resetem: %', v_keep_before;

  -- Peněženky: změny zůstatku superadmina nesmí spustit synchronizaci MIO sad.
  perform set_config('onemil.wallet_lot_managed', 'on', true);

  -- ===================== KROK 1: autorství po mazaných účtech =====================
  -- Sloupce s RESTRICT / NO ACTION na auth.users v tabulkách, které zůstávají, by smazání
  -- účtů zablokovaly. Přepíší se na superadmina (počty se zapíší do auditu resetu).
  for r in
    select c.relname as tbl, a.attname as col
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid and c.relnamespace = 'public'::regnamespace
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    where k.contype = 'f' and k.confrelid = 'auth.users'::regclass
      and k.confdeltype in ('r','a') and array_length(k.conkey, 1) = 1
      and c.relname <> all (k_truncate)
      and (c_crm_mode = 'keep_reassign' or c.relname <> all (k_crm))
      and not (c.relname = 'admin_permissions' and a.attname = 'granted_by')
  loop
    execute format('update public.%I set %I = $1 where %I is not null and %I <> $1', r.tbl, r.col, r.col, r.col)
      using c_superadmin_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_reassigned := v_reassigned || jsonb_build_object(r.tbl || '.' || r.col, v_n);
    end if;
  end loop;
  raise notice 'Přepsané autorství na superadmina: %', v_reassigned;

  -- ===================== KROK 2: TRUNCATE provozních tabulek =====================
  v_set := k_truncate || case when c_crm_mode = 'delete' then k_crm else '{}'::text[] end;
  select 'truncate table ' || string_agg(format('public.%I', t), ', ') || ' restart identity'
    into v_sql from unnest(v_set) t;
  execute v_sql;
  raise notice 'TRUNCATE hotovo: % tabulek', array_length(v_set, 1);

  -- Číselné řady affiliate dokladů/dávek (nevlastní je žádná tabulka → TRUNCATE je nevynuluje).
  if to_regclass('public.affiliate_payout_document_seq') is not null then
    perform setval('public.affiliate_payout_document_seq', 1, false);
  end if;
  if to_regclass('public.affiliate_payout_batch_seq') is not null then
    perform setval('public.affiliate_payout_batch_seq', 1, false);
  end if;

  -- ===================== KROK 3: partneři a affiliate účty =====================
  delete from public.partners;
  delete from public.affiliate_accounts;

  -- ===================== KROK 4: superadmin — jen provozní data =====================
  -- Účet, profil, role, identity ani přihlášení se nemění. Peněženka zůstává, ale bez
  -- testovacích MIO (sady, pohyby a platby jsou smazané v kroku 2).
  update public.wallets set balance_coins = 0, bonus_balance_coins = 0
   where user_id = c_superadmin_id;
  delete from public.cookie_consents where user_id is distinct from c_superadmin_id;

  -- ===================== KROK 5: ostatní účty =====================
  delete from auth.users where id <> c_superadmin_id;
  get diagnostics v_deleted_auth = row_count;
  raise notice 'Smazáno auth účtů: %', v_deleted_auth;

  -- Osiřelé auth záznamy (uživatel už neexistuje, kaskáda je nezachytí — produkce má 3 identity).
  delete from auth.identities      where user_id <> c_superadmin_id;
  delete from auth.sessions        where user_id <> c_superadmin_id;
  delete from auth.refresh_tokens  where user_id is distinct from c_superadmin_id::text;
  delete from auth.one_time_tokens where user_id <> c_superadmin_id;
  delete from auth.mfa_factors     where user_id <> c_superadmin_id;

  -- Pojistka pro řádky bez vazby na auth.users (osiřelé záznamy z testování).
  delete from public.user_roles       where user_id <> c_superadmin_id;
  -- Superadmin má všechna oprávnění implicitně (has_admin_permission); řádky nepotřebuje.
  delete from public.admin_permissions;
  delete from public.user_devices     where user_id <> c_superadmin_id;
  delete from public.wallets          where user_id <> c_superadmin_id;
  delete from public.profiles         where id <> c_superadmin_id;
  delete from public.users            where id <> c_superadmin_id;

  -- =============================== KONTROLY PO ===============================
  foreach v_t in array (v_set || k_delete) loop
    execute format('select count(*) from public.%I', v_t) into v_n;
    if v_n <> 0 then v_errors := v_errors || format('%s=%s', v_t, v_n); end if;
  end loop;

  select count(*) into v_n from auth.users;
  if v_n <> 1 or not exists (select 1 from auth.users where id = c_superadmin_id) then
    v_errors := v_errors || format('auth.users=%s', v_n); end if;
  select count(*) into v_n from auth.identities where user_id <> c_superadmin_id;
  if v_n <> 0 then v_errors := v_errors || format('auth.identities cizí=%s', v_n); end if;
  select count(*) into v_n from auth.sessions where user_id <> c_superadmin_id;
  if v_n <> 0 then v_errors := v_errors || format('auth.sessions cizí=%s', v_n); end if;

  select count(*) into v_n from auth.refresh_tokens where user_id is distinct from c_superadmin_id::text;
  if v_n <> 0 then v_errors := v_errors || format('auth.refresh_tokens cizí=%s', v_n); end if;

  select md5(concat_ws('|',
      (select row_to_json(u)::text from auth.users u where u.id = c_superadmin_id),
      (select string_agg(row_to_json(i)::text, ',' order by i.id) from auth.identities i where i.user_id = c_superadmin_id),
      (select row_to_json(p)::text from public.users p where p.id = c_superadmin_id),
      (select row_to_json(p)::text from public.profiles p where p.id = c_superadmin_id),
      (select string_agg(row_to_json(ur)::text, ',' order by ur.id) from public.user_roles ur where ur.user_id = c_superadmin_id)))
    into v_sa_after;
  if v_sa_after is distinct from v_sa_before then
    v_errors := v_errors || 'účet superadmina se změnil (auth/identity/users/profil/role)'::text; end if;

  select count(*) into v_n from public.users;
  if v_n <> 1 then v_errors := v_errors || format('users=%s', v_n); end if;
  select count(*) into v_n from public.profiles;
  if v_n <> 1 then v_errors := v_errors || format('profiles=%s', v_n); end if;
  select count(*) into v_n from public.user_roles;
  if v_n <> 1 or not exists (select 1 from public.user_roles where user_id = c_superadmin_id and role = 'superadmin') then
    v_errors := v_errors || format('user_roles=%s', v_n); end if;
  select count(*) into v_n from public.wallets;
  if v_n <> 1 or not exists (select 1 from public.wallets where user_id = c_superadmin_id
                                and balance_coins = 0 and bonus_balance_coins = 0) then
    v_errors := v_errors || format('wallets=%s (superadmin musí mít 0/0)', v_n); end if;
  select count(*) into v_n from public.admin_permissions;
  if v_n <> 0 then v_errors := v_errors || format('admin_permissions=%s', v_n); end if;
  select count(*) into v_n from public.user_devices where user_id <> c_superadmin_id;
  if v_n <> 0 then v_errors := v_errors || format('user_devices cizí=%s', v_n); end if;
  select count(*) into v_n from public.cookie_consents where user_id is distinct from c_superadmin_id;
  if v_n <> 0 then v_errors := v_errors || format('cookie_consents cizí=%s', v_n); end if;
  select count(*) into v_n from public.wallet_lot_consistency_issues();
  if v_n <> 0 then v_errors := v_errors || format('wallet_lot_consistency_issues=%s', v_n); end if;

  foreach v_t in array (k_keep || case when c_crm_mode = 'keep_reassign' then k_crm else '{}'::text[] end) loop
    execute format('select count(*) from public.%I', v_t) into v_n;
    v_keep_after := v_keep_after || jsonb_build_object(v_t, v_n);
  end loop;
  if v_keep_after <> v_keep_before then
    v_errors := v_errors || format('zachované tabulky se změnily: před %s, po %s', v_keep_before, v_keep_after);
  end if;

  if array_length(v_errors, 1) > 0 then
    raise exception 'RESET ZASTAVEN (kontrola po): %', array_to_string(v_errors, '; ');
  end if;

  -- Jediný záznam auditu po resetu.
  insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
  values ('first_prelaunch_reset', 'system_reset', c_superadmin_id,
          jsonb_build_object('crm_mode', c_crm_mode, 'backup_file', c_backup_file,
                             'truncated_tables', array_length(v_set, 1),
                             'deleted_auth_users', v_deleted_auth,
                             'reassigned_to_superadmin', v_reassigned,
                             'kept_counts', v_keep_after,
                             'dry_run', c_dry_run),
          now());

  raise notice 'KONTROLY PO: OK. Smazáno auth účtů %, vyprázdněno tabulek %, zachováno %',
    v_deleted_auth, array_length(v_set, 1) + array_length(k_delete, 1), v_keep_after;

  if c_dry_run then
    raise exception 'SUCHÝ BĚH OK — vše vráceno zpět (c_dry_run = true). auth účtů ke smazání: %, vyprázdněno tabulek: %, přepsané autorství: %, zachované počty: %',
      v_deleted_auth, array_length(v_set, 1) + array_length(k_delete, 1), v_reassigned, v_keep_after;
  end if;
end
$reset$;
