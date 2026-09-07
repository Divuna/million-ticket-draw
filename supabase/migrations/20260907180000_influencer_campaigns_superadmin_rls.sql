-- Doplnění chybějících RLS policies pro Admin → Affiliate kampaně.
--
-- PROBLÉM (potvrzeno read-only auditem)
-- `public.influencer_campaigns` a `public.influencer_campaign_partners` mají
-- RLS zapnuté, ale ŽÁDNÉ policies. `authenticated` má přitom plný tabulkový
-- grant SELECT/INSERT/UPDATE/DELETE (jen GRANT, žádná RLS). Postgres proto
-- pro SELECT/UPDATE/DELETE bez jediné policy vyhodnotí `USING` jako `false`
-- a dotaz tiše uspěje s 0 řádky (žádná chyba); pro INSERT bez `WITH CHECK`
-- naopak tvrdě selže (`42501`). Výsledek: `src/pages/AdminInfluencerCampaigns.tsx`
-- (dostupné jen přes `RequireSuperadmin`) je pro superadmina v prohlížeči
-- funkčně nefunkční — načtení vždy vrátí prázdný seznam, vytvoření vždy
-- selže, úprava/smazání/přiřazení tiše nezasáhnou žádný řádek.
--
-- Tabulky ANI jejich data se touto migrací neruší ani nemění — v produkci
-- už existují (`influencer_campaigns` 1 řádek, `influencer_campaign_partners`
-- 1 řádek), řešíme výhradně chybějící RLS policy.
--
-- ŘEŠENÍ
-- Jedna `FOR ALL` policy na tabulku, vzor přesně podle
-- `admin_permissions_superadmin_write` (`20260623_admin_permissions.sql`) a
-- produkčního re-gatingu affiliate finance objektů na `is_superadmin()`
-- (`docs`/`CLAUDE.md`, sekce PHASE 1 — AFFILIATE FINANCE LOCK): frontend má
-- route-level `RequireSuperadmin`, takže DB guard musí odpovídat, ne ho
-- zúžit ani rozšířit. `is_admin()` by rozsah oprávnění ROZŠÍŘIL nad rámec
-- toho, co dnes route/UI garantuje — proto výhradně `is_superadmin()`.
--
-- Žádný grant se nemění (authenticated grant zůstává — RLS je teď skutečná
-- brána), žádné RLS se nevypíná, žádný obecný `authenticated` přístup se
-- nepovoluje — obě nové policy jsou striktně `is_superadmin()`-scoped.

BEGIN;

DROP POLICY IF EXISTS influencer_campaigns_superadmin_all ON public.influencer_campaigns;
CREATE POLICY influencer_campaigns_superadmin_all ON public.influencer_campaigns
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS influencer_campaign_partners_superadmin_all ON public.influencer_campaign_partners;
CREATE POLICY influencer_campaign_partners_superadmin_all ON public.influencer_campaign_partners
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

COMMIT;
