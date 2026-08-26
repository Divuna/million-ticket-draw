-- F4 (critical) — public.get_due_offer_reminder_rows() is SECURITY DEFINER,
-- anon-executable, and returns customer e-mail addresses.
--
-- The function JOINs auth.users and selects au.email AS user_email for every
-- pending Partner Offer reminder, alongside user_id, offer and partner. Being
-- SECURITY DEFINER it bypasses RLS entirely, and anon held EXECUTE, so the grant
-- was the only thing standing in front of the data — and it was open.
--
-- Reproduced on staging as role anon (transaction rolled back): the call returned
-- 582 rows covering 6 distinct customer e-mail addresses. This is NOT theoretical
-- there. Production currently returns 0 due rows, so nothing is leaking today, but
-- the door opens by itself the moment reminders fall due.
--
-- Staging and production carried a byte-identical definition (md5 31d14980...), so
-- this is not environment drift.
--
-- Who actually uses this RPC — the full chain, verified end to end:
--
--   pg_cron job 24 "send_offer_reminders_daily" (0 8 * * *)
--     -> public.run_send_offer_reminders_cron()   [SECURITY DEFINER; anon=false,
--        authenticated=false already — reads the Vault token and net.http_post's
--        the Edge Function]
--     -> Edge Function send-offer-reminders       [verify_jwt=false, guarded by
--        the x-internal-token header]
--     -> createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
--     -> .rpc("get_due_offer_reminder_rows")      [so the caller is service_role]
--
-- That Edge Function is the ONLY caller anywhere: no other .rpc() in src/, no
-- other Edge Function, no database function, no view. No frontend or admin screen
-- needs it, so authenticated gets no grant either — not just anon.
--
-- Fix: grants only. The function body is not touched at all, so reminder
-- eligibility, user selection, scheduling windows and e-mail content are provably
-- unchanged. This mirrors run_send_offer_reminders_cron() in the same flow, which
-- is already locked down by grants alone with no in-body guard — the canonical
-- Postgres answer for an internal-only function, and the existing house pattern
-- for this chain.
--
-- Checked while here (reported, NOT changed): get_due_offer_reminder_rows() is the
-- only anon-executable function in the schema that returns an e-mail column.
-- notify_referral_reward_multi() is anon-granted and reads auth.users, but it
-- RETURNS trigger and is bound to a real trigger, so PostgREST cannot invoke it as
-- an RPC and the grant is inert.

BEGIN;

-- Supabase adds implicit grants, so revoke explicitly.
REVOKE ALL ON FUNCTION public.get_due_offer_reminder_rows() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_due_offer_reminder_rows() FROM anon;
REVOKE ALL ON FUNCTION public.get_due_offer_reminder_rows() FROM authenticated;

-- service_role is the role the send-offer-reminders Edge Function actually runs
-- as; it is the only grant the reminder flow needs.
GRANT EXECUTE ON FUNCTION public.get_due_offer_reminder_rows() TO service_role;

COMMIT;
