-- ═══════════════════════════════════════════════════════════════════════════════
--  ⛔  STAGING ONLY — NIKDY NESPOUŠTĚT NA PRODUKCI  ⛔
-- ═══════════════════════════════════════════════════════════════════════════════
--
--  Tento soubor byl VĚDOMĚ přesunut z `supabase/migrations/` do
--  `docs/staging-sync/`, aby ho žádný budoucí `supabase db push` nemohl omylem
--  aplikovat na produkci `xkzhjldrojjlrkezorey`. Není to migrace. Je to záznam
--  jednorázového provozního zásahu na stagingu.
--
--  ▸ PROSTŘEDÍ:   pouze staging `dxmowysntemfqfnanxua`
--  ▸ PRODUKCE:    nedotčena a dotýkat se jí nesmí
--  ▸ STAV:        JIŽ APLIKOVÁNO na staging 26. 08. 2026 — staging je dorovnaný,
--                 spouštět znovu není potřeba
--  ▸ VĚTEV:       fix/staging-security-drift-sync (NEMERGOVAT do `main`)
--
--  ▸ COMMIT:      742903a2 (26. 08. 2026)
--  ▸ PŮVODNÍ NÁZEV: supabase/migrations/20260826170000_staging_security_drift_sync.sql
--
--  PROČ VZNIKL
--  Produkce dostala sérii hardening migrací, které staging nikdy nedostal, takže
--  staging byl výrazně slabší a bezpečnostní testy tam dávaly falešně optimistický
--  obraz. Strojový diff všech SECURITY DEFINER funkcí našel na stagingu 152
--  klientsky volatelných proti 125 na produkci a 47 skutečných bezpečnostních
--  rozdílů. Tento soubor srovnal GRANTY (skupiny A1/A2/D) a doplnil guard u tří
--  test/CRUD RPC (skupina B). Těla funkcí nepřepisuje produkčními — staging běží
--  prokazatelně starší logiku a přepis by byl funkční změna, ne bezpečnostní oprava.
-- ═══════════════════════════════════════════════════════════════════════════════

-- STAGING ONLY — sync SECURITY DEFINER EXECUTE grants with production.
--
-- ⚠️ This migration is intended for staging (dxmowysntemfqfnanxua). It is a no-op
-- on production (xkzhjldrojjlrkezorey): every grant it sets is already what
-- production has, so applying it there would change nothing. It is written to be
-- safe either way, but it exists to fix STAGING.
--
-- Why: production received a series of hardening migrations that staging never
-- got, so staging was materially weaker. Security testing on staging therefore
-- gave a falsely optimistic picture. A machine diff of every SECURITY DEFINER
-- function (signature + anon/authenticated EXECUTE) found staging with 152
-- client-callable SECURITY DEFINER functions against production's 125, and 47
-- genuine security differences once false positives were removed.
--
-- Production is treated as the canonical security state, but NOTHING is copied
-- blindly: this migration changes GRANTS ONLY for the drift set, plus three guard
-- insertions that have an exact production precedent. It never overwrites a
-- staging function body with production's, because a body-level diff showed the
-- two environments genuinely run DIFFERENT versions of these functions -- staging
-- holds older logic. Overwriting would be a functional change, not a security fix.
--
-- Classification used:
--   A) grant drift only          -> fixed here (grants only)
--   B) missing security guard    -> fixed here ONLY where production's guard is a
--                                   single PERFORM of an existing helper
--   C) real logic difference     -> REPORTED, NOT CHANGED (see bottom)
--   D) staging-only function     -> locked where production precedent is clear
--
-- Nothing in production is touched by this file.

BEGIN;

-- ── A1. Production has these fully locked (anon=0, authenticated=0) ────────────
-- Wallet, Stripe refunds, partner API keys, contest lifecycle, MioCoin bonus
-- generation, partner rewards, internal messaging and internal batch helpers.
DO $do$
DECLARE
  v_name text;
  v_sig  text;
  v_names text[] := ARRAY[
    '_invoke_forward_messages_to_sofinity',
    'admin_manage_payment',
    'assign_partner_offer_to_ticket',
    'check_guardian_notifications_batch',
    'create_guardian_message_for_user',
    'create_guardian_notification_if_needed',
    'create_partner_offer_invoices_for_period',
    'deduct_wallet_for_refund',
    'fn_close_contest',
    'forward_event_to_sofinity',
    'generate_miocoin_bonus',
    'generate_partner_api_key',
    'get_contest_management_data',
    'get_prizes_delivery_summary',
    'prepare_stripe_refund',
    'recalculate_bonus_wallet',
    'reverse_failed_stripe_refund',
    'rotate_partner_api_key',
    'run_pipeline_alerts',
    'safe_send_message',
    'sync_partner_offer_activations',
    'test_sofinity_player_sync',
    'try_credit_wallet_mc',
    'unlock_ticket',
    'update_onesignal_id',
    -- D) staging-only Partner API v1 leftovers. Production deliberately has NO
    --    partner_api_v1 object at all (that was an explicit postcheck when the
    --    Partner API shipped), and they create partner order rewards, so the
    --    production-equivalent posture is service_role only.
    'partner_api_v1_create_order_reward',
    'partner_api_v1_update_order_status'
  ];
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    FOR v_sig IN
      SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    END LOOP;
  END LOOP;
END
$do$;

-- claim_miocoin_bonus and transfer_bonus_to_main are overloaded and the two
-- overloads have DIFFERENT production postures, so they are handled per signature
-- rather than per name.
--   claim_miocoin_bonus(uuid)            production: anon=0 authenticated=0
--   claim_miocoin_bonus(uuid, uuid)      production: anon=0 authenticated=1 (auth.uid guard)
--   transfer_bonus_to_main(uuid)         production: anon=0 authenticated=0
--   transfer_bonus_to_main()             production: anon=0 authenticated=1 (auth.uid guard)
DO $do$
DECLARE
  v_sig text;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND ((p.proname = 'claim_miocoin_bonus'    AND p.pronargs = 1)
        OR (p.proname = 'transfer_bonus_to_main' AND p.pronargs = 1))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END
$do$;

-- ── A2. Production allows authenticated but never anon ─────────────────────────
-- Customer and admin RPCs whose production posture is anon=0, authenticated=1.
-- Only the anon grant is removed; authenticated is left exactly as production has
-- it, so staging keeps the same customer/admin surface for functional tests.
DO $do$
DECLARE
  v_name text;
  v_sig  text;
  v_names text[] := ARRAY[
    'admin_set_partner_status',
    'buy_voucher_atomic',
    'calculate_affiliate_commissions_for_month',
    'close_contest',
    'ensure_wallet_exists',
    'get_admin_activation_summary',
    'pause_contest',
    'redeem_miocoin',
    'resume_contest',
    'run_complete_admin_test_suite',
    'set_user_role',
    'setup_crud_test_data',
    'test_admin_crud_operations',
    'transfer_all_bonus_to_main_wallet',
    'trigger_contest_draw'
  ];
BEGIN
  FOREACH v_name IN ARRAY v_names LOOP
    FOR v_sig IN
      SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_name
    LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
    END LOOP;
  END LOOP;
END
$do$;

-- claim_miocoin_bonus(uuid, uuid) and transfer_bonus_to_main(): authenticated
-- stays, anon goes.
DO $do$
DECLARE
  v_sig text;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND ((p.proname = 'claim_miocoin_bonus'    AND p.pronargs = 2)
        OR (p.proname = 'transfer_bonus_to_main' AND p.pronargs = 0))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END
$do$;

-- ── B. Missing security guard, with an exact production precedent ──────────────
-- On production these three call public.assert_admin_validation_rpc_allowed()
-- (service_role passes, otherwise admin/superadmin required). Staging still runs
-- the older monolithic versions that do NOT call it, so after A2 an ordinary
-- authenticated customer could still run them. The guard is inserted into each
-- function's OWN live definition, so the staging body is otherwise untouched --
-- production's newer body is deliberately NOT copied over.
--
-- The helper itself already exists on staging (created by the F5 group B
-- migration). This block fails loudly rather than silently if it is missing.
DO $do$
DECLARE
  v_names text[] := ARRAY[
    'run_complete_admin_test_suite',
    'test_admin_crud_operations',
    'setup_crud_test_data'
  ];
  v_name  text;
  v_def   text;
  v_new   text;
  v_guard text := chr(10) || 'BEGIN' || chr(10)
                  || '  PERFORM public.assert_admin_validation_rpc_allowed();' || chr(10);
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'assert_admin_validation_rpc_allowed'
  ) THEN
    RAISE EXCEPTION 'public.assert_admin_validation_rpc_allowed() is missing - run the F5 group B migration first';
  END IF;

  FOREACH v_name IN ARRAY v_names LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_name;

    IF v_def IS NULL THEN
      RAISE NOTICE 'public.% not present - skipping', v_name;
      CONTINUE;
    END IF;

    IF v_def LIKE '%assert_admin_validation_rpc_allowed%' THEN
      RAISE NOTICE 'public.% already guarded - skipping', v_name;
      CONTINUE;
    END IF;

    v_new := regexp_replace(v_def, '\r?\nBEGIN\r?\n', v_guard);

    IF v_new = v_def THEN
      RAISE EXCEPTION 'top-level BEGIN marker not found in public.%', v_name;
    END IF;

    EXECUTE v_new;
  END LOOP;
END
$do$;

COMMIT;

-- ── C. REPORTED, DELIBERATELY NOT CHANGED (needs approval) ─────────────────────
-- Staging runs OLDER bodies than production for essentially every function in the
-- drift set -- a normalised md5 comparison of prosrc differed for all of them. So
-- for these, production allows `authenticated` and relies on an IN-BODY guard that
-- staging's older body does not have. After this migration anon is blocked on all
-- of them (matching production), but an authenticated staging user still reaches
-- logic that production would refuse:
--
--   pause_contest(uuid)                  production guard: has_role()      staging: none
--   resume_contest(uuid)                 production guard: has_role()      staging: none
--   get_admin_activation_summary()       production guard: is_admin()      staging: none
--   ensure_wallet_exists(uuid)           production guard: auth.uid()      staging: none
--   claim_miocoin_bonus(uuid, uuid)      production guard: auth.uid()      staging: none
--
-- Fixing these means either porting production's newer body (a functional change)
-- or writing a new guard against divergent logic. Both need explicit approval, so
-- they are left alone here.
--
-- Also left alone: trigger_contest_draw(uuid) is authenticated-callable and
-- UNGUARDED on production too, so staging already matches production there.
--
-- get_referral_share_card_config() exists only on staging (unmerged share-card
-- branch), is read-only and authenticated-only. Left as-is: it is legitimate
-- staging feature work, not drift.
