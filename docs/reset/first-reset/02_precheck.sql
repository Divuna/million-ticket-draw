-- READ-ONLY kontrola těsně před resetem (nic nezapisuje). Spustit na produkci
-- xkzhjldrojjlrkezorey. Výsledek porovnat s docs/reset/first-reset/README.md.

-- 1) Superadmin
select u.id, u.email, u.email_confirmed_at, u.last_sign_in_at,
       (select json_agg(role) from public.user_roles where user_id = u.id) as roles,
       (select role from public.users where id = u.id)                   as public_users_role,
       (select count(*) from auth.identities where user_id = u.id)        as identities,
       (select balance_coins from public.wallets where user_id = u.id)    as wallet_mio
from auth.users u where lower(u.email) = 'divispavel2@gmail.com';

-- 2) Přesné počty všech tabulek v public
select table_name as t,
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::bigint as n
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by 2 desc, 1;

-- 3) Počet tabulek (mapa 30. 9. 2026: 136). Jiné číslo = schéma se změnilo → zopakovat mapu.
select count(*) as public_tables from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';

-- 4) Auth, cron, vault, storage
select (select count(*) from auth.users)      as auth_users,
       (select count(*) from auth.identities) as identities,
       (select count(*) from auth.sessions)   as sessions,
       (select count(*) from cron.job)        as cron_jobs,
       (select json_agg(name order by name) from vault.secrets) as vault_names,
       (select count(*) from storage.objects) as storage_objects;

-- 5) Běžící obchodní dávky (před resetem by neměla běžet žádná ve stavu processing)
select status, count(*) from public.sales_lead_email_batch_items group by 1;
