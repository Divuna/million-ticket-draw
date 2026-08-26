-- STAGING ONLY — category C of the staging security drift: five functions whose
-- staging bodies are OLDER than production's and therefore lack the authorization
-- guard production has. The previous migration
-- (20260826170000_staging_security_drift_sync) already removed anon from all five;
-- this one closes the remaining gap for `authenticated`.
--
-- ⚠️ Intended for staging (dxmowysntemfqfnanxua). It is a no-op on production
-- (xkzhjldrojjlrkezorey): every guard below is already present there, and each
-- block skips a function that already carries its guard.
--
-- Method: production's definition was diffed line by line against staging's for
-- each function. In every case the ONLY difference that matters is the guard --
-- the business statements are the same. So only the guard is transplanted, into
-- each function's OWN live definition, and the staging body is left otherwise
-- byte-identical. Production's newer body is deliberately NOT copied.
--
--   pause_contest(uuid)
--     prod : has_role(admin) OR has_role(superadmin) -> else 'Admin access required'
--     body : UPDATE public.contests SET status = 'paused' WHERE id = contest_id
--     staging body is the same statement, verbatim. Guard prepended.
--
--   resume_contest(uuid)
--     identical to the above with status = 'active'. Guard prepended.
--
--   get_admin_activation_summary()
--     prod : a `WHERE public.is_admin()` predicate inside the SQL body, so a
--            non-admin gets ZERO ROWS rather than an exception. That behaviour is
--            mirrored exactly -- this is a reporting RPC and the admin UI expects
--            an empty result, not an error.
--     staging SELECT/JOIN/GROUP BY list is otherwise identical.
--
--   ensure_wallet_exists(uuid)
--     prod : NULL check, a service_role bypass, then p_user_id = auth.uid()
--     The INSERT ... ON CONFLICT DO NOTHING is BYTE-IDENTICAL in both
--     environments; production only wraps it in plpgsql to host the guard.
--     Staging is LANGUAGE sql, so hosting a guard requires switching it to
--     plpgsql. That is a wrapper change, not a logic change: the executed
--     statement is unchanged and the return type stays void.
--     Verified safe for the one internal caller: redeem_miocoin_code calls
--     ensure_wallet_exists(v_uid) where v_uid comes from auth.uid(), so the guard
--     passes. The service_role bypass is kept for parity with production.
--
--   claim_miocoin_bonus(uuid, uuid)
--     prod : auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()
--            -> 'Unauthorized'
--     Everything after that is the same wallet/ledger/winner logic (staging omits
--     some `public.` prefixes, but both set search_path = public, so it resolves
--     identically). Guard prepended; the wallet and ledger writes are untouched.
--
-- Nothing in production is touched by this file.

BEGIN;

-- ── 1. pause_contest / resume_contest / claim_miocoin_bonus ───────────────────
-- Guard is inserted right after the function's own top-level BEGIN.
DO $do$
DECLARE
  v_rec   record;
  v_def   text;
  v_new   text;
  v_admin text := chr(10) || 'BEGIN' || chr(10)
    || '  IF NOT (public.has_role(auth.uid(), ''admin''::public.app_role)' || chr(10)
    || '          OR public.has_role(auth.uid(), ''superadmin''::public.app_role)) THEN' || chr(10)
    || '    RAISE EXCEPTION ''Admin access required'';' || chr(10)
    || '  END IF;' || chr(10);
  v_own text := chr(10) || 'BEGIN' || chr(10)
    || '  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN' || chr(10)
    || '    RAISE EXCEPTION ''Unauthorized'';' || chr(10)
    || '  END IF;' || chr(10);
  v_guard text;
BEGIN
  FOR v_rec IN
    SELECT p.oid, p.proname, p.pronargs
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (p.proname IN ('pause_contest', 'resume_contest')
        OR (p.proname = 'claim_miocoin_bonus' AND p.pronargs = 2))
  LOOP
    v_def := pg_get_functiondef(v_rec.oid);

    IF v_def ILIKE '%auth.uid()%' THEN
      RAISE NOTICE 'public.% already guarded - skipping', v_rec.proname;
      CONTINUE;
    END IF;

    v_guard := CASE WHEN v_rec.proname = 'claim_miocoin_bonus' THEN v_own ELSE v_admin END;
    v_new   := regexp_replace(v_def, '\r?\nBEGIN\r?\n', v_guard);

    IF v_new = v_def THEN
      RAISE EXCEPTION 'top-level BEGIN marker not found in public.%', v_rec.proname;
    END IF;

    EXECUTE v_new;
  END LOOP;
END
$do$;

-- ── 2. get_admin_activation_summary() ─────────────────────────────────────────
-- SQL-language function: production filters with `WHERE public.is_admin()` before
-- GROUP BY, returning zero rows to a non-admin instead of raising. Mirrored.
DO $do$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
BEGIN
  SELECT p.oid INTO v_oid
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_admin_activation_summary';

  IF v_oid IS NULL THEN
    RAISE NOTICE 'public.get_admin_activation_summary() not present - skipping';
    RETURN;
  END IF;

  v_def := pg_get_functiondef(v_oid);

  IF v_def ILIKE '%is_admin()%' THEN
    RAISE NOTICE 'public.get_admin_activation_summary() already guarded - skipping';
    RETURN;
  END IF;

  v_new := regexp_replace(v_def, '\r?\n  GROUP BY',
                          chr(10) || '  WHERE public.is_admin()' || chr(10) || '  GROUP BY');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'GROUP BY marker not found in public.get_admin_activation_summary()';
  END IF;

  EXECUTE v_new;
END
$do$;

-- ── 3. ensure_wallet_exists(uuid) ─────────────────────────────────────────────
-- Only function here that needs a language change (sql -> plpgsql) to host the
-- guard. The INSERT below is byte-identical to staging's existing statement and to
-- production's; nothing about wallet creation changes.
DO $do$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ensure_wallet_exists'
      AND p.prosrc ILIKE '%auth.uid()%'
  ) THEN
    RAISE NOTICE 'public.ensure_wallet_exists() already guarded - skipping';
    RETURN;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.ensure_wallet_exists(p_user_id uuid)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public'
    AS $body$
    BEGIN
      IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'User ID is required';
      END IF;

      IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
         AND (auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized';
      END IF;

      INSERT INTO public.wallets (user_id, balance_coins, bonus_balance_coins, created_at)
      VALUES (p_user_id, 0, 0, now())
      ON CONFLICT (user_id) DO NOTHING;
    END;
    $body$;
  $fn$;
END
$do$;

COMMIT;
