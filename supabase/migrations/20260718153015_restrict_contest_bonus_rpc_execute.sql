-- Restrict contest-closing and MioCoin bonus mutation RPCs to trusted paths.
--
-- Security context:
-- - public.fn_close_contest(uuid) is a legacy SECURITY DEFINER helper that can
--   close contests and insert a main winner without an app-role check.
-- - public.generate_miocoin_bonus(uuid, integer) is a SECURITY DEFINER helper
--   that inserts MioCoin bonus prizes.
-- - public.generate_miocoin_bonus is used by the internal
--   process_event_queue_miocoin() database routine.
--
-- The legitimate admin contest-control path remains public.close_contest(),
-- public.trigger_contest_draw(), public.pause_contest(), and
-- public.resume_contest(), all of which enforce admin/superadmin checks in the
-- function body. Those RPCs must remain callable by authenticated admins from
-- the admin UI, but should not be callable by anonymous users.
--
-- No contest rows, winners, bonus prizes, wallets, or payments are modified by
-- this migration.

ALTER FUNCTION public.fn_close_contest(uuid) SET search_path TO public;
ALTER FUNCTION public.generate_miocoin_bonus(uuid, integer) SET search_path TO public;
ALTER FUNCTION public.process_event_queue_miocoin() SET search_path TO public;
ALTER FUNCTION public.close_contest(uuid) SET search_path TO public;
ALTER FUNCTION public.trigger_contest_draw(uuid) SET search_path TO public;
ALTER FUNCTION public.pause_contest(uuid) SET search_path TO public;
ALTER FUNCTION public.resume_contest(uuid) SET search_path TO public;

-- Legacy unguarded close helper: no current application, Edge Function, trigger
-- or cron caller was found. Keep it unavailable through PostgREST RPC.
REVOKE ALL ON FUNCTION public.fn_close_contest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_close_contest(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.fn_close_contest(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.fn_close_contest(uuid) FROM service_role;

-- Internal MioCoin bonus helper: allow trusted server/internal execution only.
REVOKE ALL ON FUNCTION public.generate_miocoin_bonus(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_miocoin_bonus(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.generate_miocoin_bonus(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_miocoin_bonus(uuid, integer) TO service_role;

-- Internal queue processor may be invoked by trusted server automation. Ordinary
-- users must not be able to drive bonus generation by calling the queue runner.
REVOKE ALL ON FUNCTION public.process_event_queue_miocoin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_event_queue_miocoin() FROM anon;
REVOKE ALL ON FUNCTION public.process_event_queue_miocoin() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_event_queue_miocoin() TO service_role;

-- Admin contest-control RPCs already enforce app-role checks. Preserve the
-- authenticated admin UI path while removing anonymous/PUBLIC execution.
REVOKE ALL ON FUNCTION public.close_contest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_contest(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.close_contest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_contest(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.trigger_contest_draw(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trigger_contest_draw(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.trigger_contest_draw(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.trigger_contest_draw(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.pause_contest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pause_contest(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pause_contest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_contest(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.resume_contest(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resume_contest(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.resume_contest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_contest(uuid) TO service_role;
