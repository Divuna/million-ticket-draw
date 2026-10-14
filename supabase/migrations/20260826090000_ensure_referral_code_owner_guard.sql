-- F2 (critical) — public.ensure_referral_code(uuid) was SECURITY DEFINER with no
-- auth.uid() guard and EXECUTE granted to anon.
--
-- Reproduced on staging as role `anon` (transaction rolled back):
--   * anon called ensure_referral_code(<real user id>) and got that user's code
--     back verbatim ("bgd2imqwyg" === the row in referral_codes) — i.e. a
--     user_id -> referral_code oracle for anyone who can guess/obtain a uuid;
--   * anon called ensure_referral_code('ffff0002-...-0000000000f2') and the
--     function INSERTED a referral_codes row for that entirely fabricated uuid
--     (fake_row_created = 1). referral_codes.code is UNIQUE and the table has no
--     FK, so an unauthenticated caller could mint rows and burn codes at will.
--
-- The table itself was never the hole: RLS is on, the only SELECT policies are
-- own-row + admin, and anon holds no table grant. The SECURITY DEFINER function
-- bypassed all of that.
--
-- Fix — the smallest change that closes it without breaking the referral flow:
--
-- 1. The original body moves verbatim into public.ensure_referral_code_for(uuid),
--    an internal worker that anon and authenticated cannot call at all.
--
-- 2. public.ensure_referral_code(uuid) keeps its exact signature and becomes a
--    guarded wrapper: auth.uid() is mandatory and p_user_id must equal it.
--    The signature is deliberately NOT changed to a no-arg function: the live
--    production bundle still calls the 1-arg form, so dropping it would break
--    /profile for every customer until the next Lovable Publish.
--    ReferralSection.tsx already passes user.id and nothing else, so the guard
--    is invisible to the app.
--
-- 3. set_my_referrer_by_code is repointed at the internal worker. THIS IS THE
--    PART THAT MAKES THE GUARD SAFE. That function does
--        PERFORM public.ensure_referral_code(v_referrer);
--    where v_referrer is the REFERRER — never auth.uid(), since self-referral is
--    rejected a few lines above. With a naive guard that PERFORM would raise,
--    and because the function ends in EXCEPTION WHEN OTHERS it would not surface
--    an error at all: it would silently return 'error' and referral attribution
--    would stop working, visible only as referral_attempts.result='error'.
--    The rewrite is done by string-replacing that single call in the function's
--    own live definition, so the body stays byte-identical everywhere else and
--    the staging/production formatting drift is preserved. The DO block refuses
--    to run if the expected call is not present exactly once.
--
-- Deliberately NOT done here:
--
--   * No SET search_path on these functions. It looks like free hardening and it
--     is a trap: an empty search_path propagates into generate_referral_code(),
--     which calls gen_random_bytes() from the `extensions` schema, and the call
--     then fails with "function gen_random_bytes(integer) does not exist".
--     Verified on staging. It would break ONLY the new-user path (an existing
--     user returns the cached code before ever reaching the generator), so a
--     smoke test on an existing account would not catch it. Hardening these
--     three functions together is a separate change.
--
--   * No FK on referral_codes.user_id. Once the guard is in place p_user_id can
--     only ever be auth.uid(), i.e. a real auth user, so the FK is defence in
--     depth rather than the control. Production is clean (70 rows, 0 orphans) so
--     it could be added, but staging holds 643 orphans out of 645 (E2E throwaway
--     users deleted without cascade, ~10/day) and would need a cleanup first.
--     No other table in the referral subsystem (referrals, referral_rewards,
--     referral_attempts) carries an FK either.
--
-- Unchanged: referral_codes schema/RLS/grants, generate_referral_code, referral
-- rewards, attribution, is_self_referral, referral_attempts, wallets, ledger.

BEGIN;

-- 1. internal worker — original body, verbatim
CREATE OR REPLACE FUNCTION public.ensure_referral_code_for(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_existing text;
  v_new text;
BEGIN
  SELECT code INTO v_existing FROM public.referral_codes WHERE user_id = p_user_id;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  v_new := public.generate_referral_code();

  INSERT INTO public.referral_codes (user_id, code)
  VALUES (p_user_id, v_new)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT code INTO v_existing FROM public.referral_codes WHERE user_id = p_user_id;
  RETURN v_existing;
END;
$function$;

-- Reachable only from inside SECURITY DEFINER callers (which run as the owner)
-- and from service_role. Supabase adds implicit grants, so revoke explicitly.
REVOKE ALL ON FUNCTION public.ensure_referral_code_for(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_referral_code_for(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ensure_referral_code_for(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_referral_code_for(uuid) TO service_role;

-- 2. guarded public wrapper — same signature the app already calls
CREATE OR REPLACE FUNCTION public.ensure_referral_code(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_me uuid;
BEGIN
  v_me := auth.uid();

  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL OR p_user_id <> v_me THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN public.ensure_referral_code_for(v_me);
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_referral_code(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_referral_code(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_referral_code(uuid) TO authenticated;
-- service_role keeps the EXECUTE it already had on the wrapper (Supabase grants it
-- by default; REVOKE ... FROM PUBLIC does not remove a direct role grant). It is
-- left in place deliberately rather than revoked: a service_role call has no
-- auth.uid(), so the guard rejects it with not_authenticated and the grant confers
-- nothing. service_role's working path is ensure_referral_code_for.

-- 3. repoint set_my_referrer_by_code at the internal worker, changing nothing else
DO $do$
DECLARE
  v_def  text;
  v_hits int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_my_referrer_by_code'
    AND p.pronargs = 5;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'set_my_referrer_by_code(text,text,text,text,text) not found';
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, 'public.ensure_referral_code(v_referrer)', '')))
            / length('public.ensure_referral_code(v_referrer)');

  IF v_hits <> 1 THEN
    RAISE EXCEPTION
      'expected exactly 1 call to public.ensure_referral_code(v_referrer), found %', v_hits;
  END IF;

  EXECUTE replace(v_def,
                  'public.ensure_referral_code(v_referrer)',
                  'public.ensure_referral_code_for(v_referrer)');
END
$do$;

COMMIT;
