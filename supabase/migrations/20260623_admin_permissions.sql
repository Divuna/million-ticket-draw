-- ============================================================================
-- admin_permissions — Phase 2 granular subadmin permissions (safe first slice)
-- ============================================================================
-- Foundation for delegating SAFE, non-sensitive admin areas to scoped subadmins.
-- First-slice keys only: vouchers.manage, content.manage, banners.manage,
-- notifications.manage. NO sensitive areas (contest internals, tickets, revenue,
-- payments, invoices, commissions, payouts, winners, prize delivery, audit/system/
-- settings, admin role management) are represented here.
--
-- Security model:
--   • superadmin (is_superadmin()) implicitly has EVERY permission — no row needed.
--   • a normal admin (role='admin') has a permission only if an explicit
--     admin_permissions row exists for (user_id, permission_key).
--   • only superadmin may grant/revoke (insert/update/delete) permissions.
--   • a normal admin may read ONLY their own permission rows.
--   • anon cannot read or write, and cannot execute the helper.
--
-- Additive: creates a new table + helper + RLS. Changes NO existing policy, RPC,
-- table, or behavior. Nothing reads this yet (frontend wiring is a later phase).
--
-- Scope: applied to STAGING (dxmowysntemfqfnanxua) only. Production untouched.
-- Rollback:
--   DROP FUNCTION IF EXISTS public.has_admin_permission(text, uuid);
--   DROP TABLE IF EXISTS public.admin_permissions;
-- ============================================================================

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
