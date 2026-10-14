-- Admin → Bannery: sjednocení write RLS na canonical `has_admin_permission`.
--
-- POTVRZENÝ PROBLÉM (read-only audit)
-- `banners` a storage bucket `banner-images` měly write policy postavenou na
-- staré `public.users.role`:
--
--   EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid()
--           AND u.role = ANY (ARRAY['admin','superadmin']))
--
-- Frontend route `/admin/banners` je ale gatovaná granulárním oprávněním
-- `banners.manage` (`RequirePermission permission="banners.manage"` →
-- `useAdminPermissions().can()` → canonical `user_roles` + `admin_permissions`).
-- Kanonický admin `admintest@onemil.cz` (`user_roles.role='admin'`,
-- `admin_permissions` obsahuje `banners.manage`) route projde, ale
-- `public.users.role='user'` u něj DB write dál zamítá — ověřeno přímo na
-- produkčních datech. `coming_soon_banners` navíc dovolovala zápis KAŽDÉMU
-- adminovi jen podle `user_roles`, bez ohledu na `banners.manage` — širší
-- oprávnění, než frontend vyžaduje.
--
-- ŘEŠENÍ
-- Všechny tři write cesty (`banners`, `coming_soon_banners`,
-- `storage.objects` bucket `banner-images`) teď používají VÝHRADNĚ
-- `public.has_admin_permission('banners.manage')` — existující canonical
-- funkce (SECURITY DEFINER, `is_superadmin()` OR `admin_permissions` grant).
-- Žádný nový paralelní systém oprávnění. Volání je zabalené do skalárního
-- poddotazu `(SELECT public.has_admin_permission(...))`, aby ho planner mohl
-- povýšit na InitPlan (funkce je STABLE) — bezpečnostně beze změny, jde jen
-- o výkonovou hygienu ze stejného důvodu jako `20260825140000_…initplan`.
--
-- Veřejné čtení (`banners`, `coming_soon_banners` SELECT, `banner-images`
-- storage SELECT) se NEMĚNÍ.
--
-- MIMO ROZSAH (vědomě nedotčeno): `bonus_prizes`, storage bucket
-- `voucher-images` — mají vlastní zdokumentovaný důvod ponechání starého
-- modelu (`CLAUDE.md`, „BUDOUCÍ VÝHERNÍ POZICE"). `public.users.role` se
-- jako sloupec nemaže — to je samostatný budoucí cleanup až po odstranění
-- všech zbývajících závislostí.

BEGIN;

-- ── 1. banners ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin full access to banners" ON public.banners;

CREATE POLICY "banners_admin_write" ON public.banners
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT public.has_admin_permission('banners.manage')))
  WITH CHECK ((SELECT public.has_admin_permission('banners.manage')));

-- "Public read banners" (SELECT, anon+authenticated, USING true) beze změny.

-- ── 2. coming_soon_banners ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can manage coming soon banners" ON public.coming_soon_banners;

CREATE POLICY "coming_soon_banners_admin_write" ON public.coming_soon_banners
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((SELECT public.has_admin_permission('banners.manage')))
  WITH CHECK ((SELECT public.has_admin_permission('banners.manage')));

-- "Anyone can view coming soon banners" (SELECT, public, USING true) beze změny.

-- ── 3. storage.objects — bucket banner-images ──────────────────────────
DROP POLICY IF EXISTS "Admin can upload banner images" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update banner images" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete banner images" ON storage.objects;

CREATE POLICY "banner_images_admin_insert" ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'banner-images'
    AND (SELECT public.has_admin_permission('banners.manage'))
  );

CREATE POLICY "banner_images_admin_update" ON storage.objects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    bucket_id = 'banner-images'
    AND (SELECT public.has_admin_permission('banners.manage'))
  )
  WITH CHECK (
    bucket_id = 'banner-images'
    AND (SELECT public.has_admin_permission('banners.manage'))
  );

CREATE POLICY "banner_images_admin_delete" ON storage.objects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    bucket_id = 'banner-images'
    AND (SELECT public.has_admin_permission('banners.manage'))
  );

-- "Public can view banner images" (SELECT, public, bucket_id='banner-images')
-- beze změny. Bucket contest-banners a jeho policies nedotčeny.

COMMIT;
