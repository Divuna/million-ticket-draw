-- ============================================================================
-- PHASE 2 PRODUCTION ROLLBACK — admin_permissions DB foundation
-- ============================================================================
-- Target project: xkzhjldrojjlrkezorey (PRODUCTION)
--
-- Reverses ONLY the Phase 2 admin_permissions objects created by
--   docs/rollback/phase2_admin_permissions_apply.sql
--
-- ⚠️ This is a structural rollback. Dropping public.admin_permissions removes
--    any granted subadmin permission rows. If permissions were already in use,
--    every non-superadmin scoped to vouchers/content/banners/notifications
--    loses access to those areas (superadmin is unaffected — is_superadmin()
--    grants implicit-all and does not depend on this table).
--
-- ❗ MUST NOT touch:
--    • public.is_superadmin()        (Phase 1 helper — shared dependency)
--    • public.user_roles             (role source of truth)
--    • any Phase 1 object / policy / RPC / Edge Function
--    • contest internals, tickets, revenue, payments, invoices, commissions,
--      payouts, winners, prize delivery, audit/system/settings, admin role mgmt
--
-- Idempotent: safe to run even if objects are already gone.
-- ============================================================================

BEGIN;

-- Drop policies first (defensive; DROP TABLE would cascade them anyway).
DROP POLICY IF EXISTS admin_permissions_superadmin_write ON public.admin_permissions;
DROP POLICY IF EXISTS admin_permissions_select          ON public.admin_permissions;

-- Drop the helper (exact signature only).
DROP FUNCTION IF EXISTS public.has_admin_permission(text, uuid);

-- Drop the table (cascades its index idx_admin_permissions_user_id,
-- unique constraint, and FKs from admin_permissions to auth.users only).
DROP TABLE IF EXISTS public.admin_permissions;

COMMIT;

-- Post-rollback sanity (run manually, expect the noted results):
--   • public.has_admin_permission       → does NOT exist
--   • public.admin_permissions          → does NOT exist
--   • public.is_superadmin              → STILL EXISTS (untouched)
--   • public.user_roles                 → STILL EXISTS, row count unchanged
