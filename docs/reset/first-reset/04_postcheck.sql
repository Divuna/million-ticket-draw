-- READ-ONLY kontrola po resetu (nic nezapisuje). Očekávané hodnoty: README.md, „Očekávané počty".

-- 1) Jediný účet = superadmin, beze změny role
select u.id, u.email,
       (select json_agg(role) from public.user_roles where user_id = u.id) as roles,
       (select role from public.users where id = u.id)                   as public_users_role,
       (select count(*) from auth.identities where user_id = u.id)        as identities,
       (select row_to_json(w) from (select balance_coins, bonus_balance_coins from public.wallets where user_id = u.id) w) as wallet
from auth.users u;

select (select count(*) from auth.users)          as auth_users,        -- 1
       (select count(*) from auth.identities)     as identities,        -- 2
       (select count(*) from public.users)        as users,             -- 1
       (select count(*) from public.profiles)     as profiles,          -- 1
       (select count(*) from public.user_roles)   as user_roles,        -- 1
       (select count(*) from public.wallets)      as wallets,           -- 1 (0 / 0)
       (select count(*) from public.admin_permissions) as admin_permissions, -- 0
       (select count(*) from public.audit_logs)   as audit_logs,        -- 1 (first_prelaunch_reset)
       (select count(*) from public.wallet_lot_consistency_issues()) as wallet_issues; -- 0

-- 2) Všechny tabulky s počty (provozní musí být 0)
select table_name as t,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as n
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by 2 desc, 1;

-- 3) Záznam resetu
select event, created_at, metadata from public.audit_logs where event = 'first_prelaunch_reset';

-- 4) Systém beze změny
select (select count(*) from public.settings)      as settings,       -- 22
       (select count(*) from public.content_pages) as content_pages,  -- 18
       (select count(*) from cron.job)             as cron_jobs,      -- 13
       (select count(*) from supabase_migrations.schema_migrations) as migrations;
