-- Disable the legacy public winner feed because it exposes internal UUIDs.
REVOKE ALL ON FUNCTION public.get_latest_winners(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_latest_winners(integer) FROM anon;
REVOKE ALL ON FUNCTION public.get_latest_winners(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_winners(integer) TO service_role;
