-- F5 group A — anon-executable SECURITY DEFINER RPCs that write internal state.
--
-- All of these bypass RLS (SECURITY DEFINER, owner postgres) and held EXECUTE for
-- anon, so the grant was the only control. Each was reproduced on staging as role
-- anon inside a rolled-back transaction, with the write verified AS THE OWNER
-- afterwards (verifying while still `SET ROLE anon` hides the row behind RLS and
-- produces a false negative — that mistake was made and corrected during testing).
--
--   upsert_user_security_signals   anon overwrote another user's anti-fraud
--                                  signals (device_id / ip_hash / fingerprint_hash),
--                                  which feed is_self_referral()
--   mark_user_played               anon moved another user's last_played_at
--   upsert_partner_offer_billing_config
--                                  anon overwrote a partner's billing_mode and
--                                  price_per_activation
--   approve_affiliate_company_lead_txn
--                                  its admin check validates p_admin_user_id, a
--                                  CALLER-SUPPLIED parameter, not auth.uid(). As
--                                  anon, passing a known admin uuid passed the
--                                  check and reached the lead lookup
--                                  ("lead_not_found", i.e. the guard did not stop
--                                  it). A classic confused deputy: on a lead in
--                                  pending_admin_approval this creates a partner
--                                  account and writes affiliate attribution.
--   process_referral_inactivity    anon could trigger the daily cron job's mass
--                                  UPDATE of public.referrals
--   log_partner_api_key_usage (x2) anon inserted arbitrary partner telemetry rows
--   log_partner_api_request        with an attacker-chosen partner_id
--   get_user_role                  anon read any user's role; returned 'admin' for
--                                  a known uuid. Not a write, but it is exactly
--                                  the enabler for the confused deputy above, so
--                                  it is closed in the same pass.
--
-- Fix: grants only. No function body is touched, so no behaviour changes.
-- Verified callers (repo-wide grep over src/, supabase/functions/, plus a
-- database-side prosrc scan):
--
--   upsert_user_security_signals        <- set_my_referrer_by_code (SECURITY
--                                          DEFINER, runs as owner -> needs no grant)
--   approve_affiliate_company_lead_txn  <- Edge Function approve-affiliate-company-lead
--                                          (service_role)
--   log_partner_api_request             <- partner_api_guard, partner_api_ping
--                                          (SECURITY DEFINER) and EF partner-activate
--   log_partner_api_key_usage           <- EF partner-activate (service_role)
--   process_referral_inactivity         <- pg_cron job 18
--   mark_user_played                    <- NO caller anywhere
--   upsert_partner_offer_billing_config <- NO caller; PartnerDashboard only READS
--                                          partner_offer_billing_configs directly
--   get_user_role                       <- NO caller
--
-- So service_role is the only role any of them needs, and no frontend or admin
-- screen loses anything.
--
-- Deliberately NOT changed here: generate_winner(uuid),
-- calculate_influencer_commissions_current_month(), enqueue_partner_invoice_email,
-- handle_influencer_signup, insert_ai_message, activate_partner_reward,
-- process_push_retries, send_push_via_onesignal, get_pending_event_forward_log.
-- They are SECURITY INVOKER, so the caller's RLS still applies. Measured on
-- staging: anon and a plain customer calling generate_winner() and
-- calculate_influencer_commissions_current_month() wrote NOTHING (winners
-- 347 -> 347, influencer_commissions 0 -> 0). Their grants are wider than needed
-- but they are not exploitable, and narrowing them risks the cron/Edge Function
-- paths that do use them.

BEGIN;

-- Supabase adds implicit grants, so revoke explicitly in every case.

REVOKE ALL ON FUNCTION public.upsert_user_security_signals(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_user_security_signals(uuid, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_user_security_signals(uuid, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_user_security_signals(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.mark_user_played(uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_user_played(uuid, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.mark_user_played(uuid, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_user_played(uuid, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_partner_offer_billing_config(uuid, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_partner_offer_billing_config(uuid, text, numeric, text) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_partner_offer_billing_config(uuid, text, numeric, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_partner_offer_billing_config(uuid, text, numeric, text) TO service_role;

REVOKE ALL ON FUNCTION public.approve_affiliate_company_lead_txn(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_affiliate_company_lead_txn(uuid, uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.approve_affiliate_company_lead_txn(uuid, uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.approve_affiliate_company_lead_txn(uuid, uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.process_referral_inactivity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_referral_inactivity() FROM anon;
REVOKE ALL ON FUNCTION public.process_referral_inactivity() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_inactivity() TO service_role;

REVOKE ALL ON FUNCTION public.log_partner_api_key_usage(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_partner_api_key_usage(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.log_partner_api_key_usage(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_partner_api_key_usage(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.log_partner_api_key_usage(uuid, text, inet, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_partner_api_key_usage(uuid, text, inet, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_partner_api_key_usage(uuid, text, inet, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_partner_api_key_usage(uuid, text, inet, text) TO service_role;

REVOKE ALL ON FUNCTION public.log_partner_api_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_partner_api_request(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.log_partner_api_request(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_partner_api_request(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_user_role(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO service_role;

COMMIT;
