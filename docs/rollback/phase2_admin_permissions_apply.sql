-- ============================================================================
-- PHASE 2 PRODUCTION APPLY — admin_permissions DB foundation (ADDITIVE ONLY)
-- ============================================================================
-- Target project: xkzhjldrojjlrkezorey (PRODUCTION)
--
-- ⛔ DO NOT RUN until Pavel gives explicit written approval AND a manual
--    pg_dump backup has been taken (PITR is OFF on this project).
--
-- This script mirrors the staging migration
--   supabase/migrations/20260623_admin_permissions.sql
-- applied & validated on staging dxmowysntemfqfnanxua (E2E run 28043183824).
--
-- Scope (EXACTLY these objects, nothing else):
--   • public.admin_permissions (table + unique + index + RLS)
--   • public.has_admin_permission(check_key text, check_user_id uuid default auth.uid())
--   • RLS policies admin_permissions_select / admin_permissions_superadmin_write
--   • grants/revokes for the helper
--
-- Allowed permission keys (data only — NOT enforced by a CHECK so future keys
-- can be added without a migration; frontend uses only these four):
--   vouchers.manage, content.manage, banners.manage, notifications.manage
--
-- Explicitly NOT touched: contest internals, tickets, revenue/statistics,
-- payments, invoices, commissions, payouts, winners, prize delivery,
-- audit/system/settings, admin role management, user_roles, any Phase 1 object.
--
-- Dependency: public.is_superadmin(uuid) MUST already exist in production
-- (applied in Phase 1). The PRE-APPLY GUARD below aborts if it is missing.
--
-- Idempotent where safe: re-running creates nothing twice and does not error.
-- ============================================================================

BEGIN;

-- ── 0. PRE-APPLY GUARD: require is_superadmin() (Phase 1 dependency) ──────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'is_superadmin'
  ) THEN
    RAISE EXCEPTION
      'ABORT: public.is_superadmin() not found. Apply Phase 1 helper before Phase 2.';
  END IF;
END $$;

-- ── 1. Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_permissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL,
  granted_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_admin_permissions_user_id
  ON public.admin_permissions (user_id);

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- ── 2. Helper ────────────────────────────────────────────────────────────────
-- Returns true when the user is a superadmin (implicitly all permissions) OR has
-- an explicit row for the given key. SECURITY DEFINER so it can evaluate any
-- user's permission regardless of the caller's RLS scope.
CREATE OR REPLACE FUNCTION public.has_admin_permission(
  check_key text,
  check_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin(check_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.admin_permissions ap
      WHERE ap.user_id = check_user_id
        AND ap.permission_key = check_key
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_admin_permission(text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_admin_permission(text, uuid) TO authenticated;

-- ── 3. RLS policies ──────────────────────────────────────────────────────────
-- Read: own rows for any authenticated user; superadmin reads all.
DROP POLICY IF EXISTS admin_permissions_select ON public.admin_permissions;
CREATE POLICY admin_permissions_select ON public.admin_permissions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

-- Grant/revoke (insert/update/delete): superadmin only.
DROP POLICY IF EXISTS admin_permissions_superadmin_write ON public.admin_permissions;
CREATE POLICY admin_permissions_superadmin_write ON public.admin_permissions
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

COMMIT;

-- After COMMIT, run docs/rollback/phase2_admin_permissions_verification.sql
-- to confirm the additive objects exist and are scoped correctly.
