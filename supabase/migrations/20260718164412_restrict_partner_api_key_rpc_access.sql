-- Security hardening for partner API key RPCs.
--
-- Confirmed issue:
-- public.generate_partner_api_key(uuid) and public.rotate_partner_api_key(uuid)
-- are SECURITY DEFINER RPCs that revoke/create partner API keys for any
-- supplied partner_id. Current legitimate callers are service-role Edge
-- Functions that perform their own admin/partner ownership checks before
-- invoking the RPC. Ordinary client roles must not be able to call these
-- mutation helpers directly.

ALTER FUNCTION public.generate_partner_api_key(uuid) SET search_path TO public;
REVOKE ALL ON FUNCTION public.generate_partner_api_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_partner_api_key(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.generate_partner_api_key(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_partner_api_key(uuid) TO service_role;

ALTER FUNCTION public.rotate_partner_api_key(uuid) SET search_path TO public;
REVOKE ALL ON FUNCTION public.rotate_partner_api_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rotate_partner_api_key(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rotate_partner_api_key(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_partner_api_key(uuid) TO service_role;
