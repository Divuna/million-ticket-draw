-- ============================================================================
-- OneMil Affiliate v2 - remove legacy registration RPC overload
-- ============================================================================
-- The 12-argument register_affiliate_account RPC stores the full public profile
-- fields from /affiliate/register. The previous 5-argument overload can make
-- PostgREST fail with an ambiguous function lookup after both signatures exist.
--
-- Additive schema change was applied in:
-- 20260603_affiliate_registration_profile_fields.sql
--
-- Safe to apply to staging first. Production requires explicit approval.
-- ============================================================================

DROP FUNCTION IF EXISTS public.register_affiliate_account(text, text, text, text[], text);
