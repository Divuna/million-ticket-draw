-- ============================================================================
-- is_superadmin() — Phase 1 gate helper for superadmin-only access
-- ============================================================================
-- Returns true ONLY when the given user (default: current auth.uid()) has
-- role='superadmin' in public.user_roles. This is the foundation for the
-- Phase 1 re-gating of sensitive admin areas from "admin OR superadmin" down to
-- superadmin-only. Mirrors the existing is_admin() helper shape.
--
-- This migration is ADDITIVE ONLY: it creates the helper and does NOT change any
-- existing RLS policy, RPC, or frontend. No sensitive gate is switched yet.
--
-- Scope: applied on STAGING (dxmowysntemfqfnanxua) only. Production untouched.
-- Rollback: DROP FUNCTION public.is_superadmin(uuid);
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_superadmin(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = check_user_id
      AND ur.role = 'superadmin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;
