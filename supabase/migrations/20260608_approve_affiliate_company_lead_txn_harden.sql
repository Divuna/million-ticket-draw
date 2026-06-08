-- ============================================================================
-- OneMil B2B company leads — Phase 2D Block 1 hardening
-- ============================================================================
-- Follow-up to 20260608_approve_affiliate_company_lead_txn.sql.
--
-- Supabase apply_migration auto-grants EXECUTE to anon / authenticated / postgres
-- / service_role for every new function. record_affiliate_company_ref_by_id is an
-- internal helper that must not be callable directly by end users.
--
-- This migration explicitly revokes direct EXECUTE from anon and authenticated on
-- record_affiliate_company_ref_by_id. The function remains callable from within
-- approve_affiliate_company_lead_txn because SECURITY DEFINER functions execute
-- under the privileges of the function owner (postgres), not the calling role.
--
-- approve_affiliate_company_lead_txn EXECUTE for authenticated is preserved.
--
-- Staging-only until production rollout is explicitly approved by Pavel.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.record_affiliate_company_ref_by_id(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_affiliate_company_ref_by_id(uuid, uuid, text) FROM authenticated;
