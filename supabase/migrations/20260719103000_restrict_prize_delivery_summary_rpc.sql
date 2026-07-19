-- Restrict legacy prize delivery summary RPC.
--
-- The function returns operational delivery counters and concatenated
-- bonus_prizes.admin_notes. It is not called by the current frontend or Edge
-- Functions, so keep it available only to trusted server-side automation.

ALTER FUNCTION public.get_prizes_delivery_summary(uuid) SET search_path TO public;

REVOKE ALL ON FUNCTION public.get_prizes_delivery_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_prizes_delivery_summary(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_prizes_delivery_summary(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_prizes_delivery_summary(uuid) TO service_role;
