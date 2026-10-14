-- Storage bucket voucher-images: sjednocení write RLS na canonical
-- has_admin_permission a odstranění duplicitních policies.
--
-- POTVRZENÝ PROBLÉM (read-only cleanup audit)
-- `storage.objects` pro bucket `voucher-images` mělo 8 policies celkem:
--   - 2× duplicitní SELECT (stejný význam, jiný název)
--   - 2× duplicitní INSERT — obě na staré `public.users.role`
--   - 2× duplicitní UPDATE — obě na staré `public.users.role`
--   - 2× duplicitní DELETE — obě na staré `public.users.role`
-- Frontend route `/admin/vouchers` je gatovaná granulárním oprávněním
-- `vouchers.manage` (`RequirePermission permission="vouchers.manage"` →
-- `useAdminPermissions().can()` → canonical `user_roles` + `admin_permissions`).
-- Canonical admin s explicitním grantem `vouchers.manage`, ale starou
-- `public.users.role` neodpovídající 'admin'/'superadmin', by route prošel
-- a upload/update/delete voucher obrázku by DB tiše/chybně zamítla — stejný
-- vzor jako dřív u `banner-images` (viz `20260907190000_…`).
--
-- ŘEŠENÍ
-- Přesně 4 výsledné policies, žádná duplicita:
--   1× SELECT   veřejné čtení (beze změny významu)
--   1× INSERT   authenticated, public.has_admin_permission('vouchers.manage')
--   1× UPDATE   authenticated, public.has_admin_permission('vouchers.manage')
--   1× DELETE   authenticated, public.has_admin_permission('vouchers.manage')
--
-- Žádná nová funkce oprávnění — výhradně existující canonical
-- `public.has_admin_permission(text, uuid)`. Voláno jako skalární poddotaz
-- `(SELECT public.has_admin_permission(...))`, stejný vzor jako u
-- `banner-images`, aby ho planner mohl povýšit na InitPlan.
--
-- MIMO ROZSAH (nedotčeno): tabulka `vouchers`, ceny voucherů, nákup
-- voucherů, MioCoiny, `voucher_codes`, `user_vouchers`, `bonus_prizes`,
-- `banners`, jiné storage buckety, sloupec `public.users.role` samotný.

BEGIN;

-- ── SELECT: sjednotit dvě duplicitní veřejné policy na jednu ──────────────
DROP POLICY IF EXISTS "Allow public read access to voucher images" ON storage.objects;
-- "Public can view voucher images" (SELECT, public, USING bucket_id='voucher-images') ponechána beze změny.

-- ── INSERT: odstranit obě staré duplicity postavené na users.role ────────
DROP POLICY IF EXISTS "Admins can upload voucher images" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin upload voucher images" ON storage.objects;

CREATE POLICY "voucher_images_admin_insert" ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'voucher-images'
    AND (SELECT public.has_admin_permission('vouchers.manage'))
  );

-- ── UPDATE: odstranit obě staré duplicity postavené na users.role ────────
DROP POLICY IF EXISTS "Admins can update voucher images" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin update voucher images" ON storage.objects;

CREATE POLICY "voucher_images_admin_update" ON storage.objects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    bucket_id = 'voucher-images'
    AND (SELECT public.has_admin_permission('vouchers.manage'))
  )
  WITH CHECK (
    bucket_id = 'voucher-images'
    AND (SELECT public.has_admin_permission('vouchers.manage'))
  );

-- ── DELETE: odstranit obě staré duplicity postavené na users.role ────────
DROP POLICY IF EXISTS "Admins can delete voucher images" ON storage.objects;
DROP POLICY IF EXISTS "Allow admin delete voucher images" ON storage.objects;

CREATE POLICY "voucher_images_admin_delete" ON storage.objects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    bucket_id = 'voucher-images'
    AND (SELECT public.has_admin_permission('vouchers.manage'))
  );

COMMIT;
