-- Úklid Vaultu po resetu — SAMOSTATNÝ krok, jen po schválení a až po úspěšném 03_reset.sql.
-- Smaže jen Shoptet exportní odkazy, na které už žádný partner neodkazuje
-- (partners.shoptet_export_secret_name). URL dávají přístup k exportu objednávek reálného
-- e-shopu; po smazání partnera nemají vlastníka.
-- Systémové secrety (tokeny cronu, internal tokeny, Meta broker, URL projektu) zůstávají.
--
-- POZOR: aliasy jsou povinné — partners má vlastní sloupec `name`, takže nekvalifikované
-- `name` v poddotazu by se vázalo na partnera a smazalo by i odkazy živých partnerů.

begin;

select s.name as ke_smazani
from vault.secrets s
where s.name like 'shoptet\_export\_url\_%'
  and not exists (select 1 from public.partners p where p.shoptet_export_secret_name = s.name);

delete from vault.secrets s
where s.name like 'shoptet\_export\_url\_%'
  and not exists (select 1 from public.partners p where p.shoptet_export_secret_name = s.name);

-- Očekáváno po resetu: smazány 2 (…2f707490…, …61c23960…), zůstává 9.
select count(*) as vault_secrets_after, json_agg(s.name order by s.name) as names from vault.secrets s;

commit;
