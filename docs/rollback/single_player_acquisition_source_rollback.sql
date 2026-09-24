-- ROLLBACK: jeden odměňovaný zdroj přivedení (migrace 20260927100000_single_player_acquisition_source.sql)
-- Vrací set_my_referrer_by_code a record_affiliate_customer_ref PŘESNĚ do produkční podoby
-- zachycené read-only z xkzhjldrojjlrkezorey před změnou (md5 níže) a ruší pojistné triggery.
-- Data v referrals ani affiliate_customer_refs se nemění. Spouštět jen po rozhodnutí Pavla.

begin;

drop trigger if exists trg_referrals_single_acquisition_source on public.referrals;
drop trigger if exists trg_affiliate_customer_refs_single_acquisition_source on public.affiliate_customer_refs;

-- set_my_referrer_by_code(p_code text, p_source text, p_device_id text, p_ip_hash text, p_fingerprint_hash text)   md5 a06899eb14db36346228c3e8031a6399   ACL: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.set_my_referrer_by_code(p_code text, p_source text DEFAULT 'manual'::text, p_device_id text DEFAULT NULL::text, p_ip_hash text DEFAULT NULL::text, p_fingerprint_hash text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_me uuid;
  v_referrer uuid;
  v_referrer_code_owner uuid;
  v_result text;
  v_reason text;
  v_email_confirmed_at timestamptz;
BEGIN
  v_me := auth.uid();
  IF v_me IS NULL THEN
    RETURN 'error:not_authenticated';
  END IF;

  -- must be email-verified
  SELECT u.email_confirmed_at INTO v_email_confirmed_at
  FROM auth.users u
  WHERE u.id = v_me;

  IF v_email_confirmed_at IS NULL THEN
    RETURN 'rejected:email_not_verified';
  END IF;

  -- store/update signals for referred user (used for self-referral)
  PERFORM public.upsert_user_security_signals(v_me, p_device_id, p_ip_hash, p_fingerprint_hash);

  -- already has referrer?
  IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.referred_user_id = v_me) THEN
    RETURN 'rejected:already_has_referrer';
  END IF;

  -- find code owner
  SELECT rc.user_id INTO v_referrer_code_owner
  FROM public.referral_codes rc
  WHERE rc.code = p_code;

  IF v_referrer_code_owner IS NULL THEN
    INSERT INTO public.referral_attempts (referred_user_id, attempted_code, source, device_id, ip_hash, fingerprint_hash, result, reason)
    VALUES (v_me, p_code, p_source, p_device_id, p_ip_hash, p_fingerprint_hash, 'rejected', 'invalid_code');
    RETURN 'rejected:invalid_code';
  END IF;

  v_referrer := v_referrer_code_owner;

  -- cannot refer yourself
  IF v_referrer = v_me THEN
    INSERT INTO public.referral_attempts (referred_user_id, attempted_code, source, device_id, ip_hash, fingerprint_hash, result, reason)
    VALUES (v_me, p_code, p_source, p_device_id, p_ip_hash, p_fingerprint_hash, 'rejected', 'self_referral_same_user');
    RETURN 'rejected:self_referral';
  END IF;

  -- self-referral fraud (device/ip/fingerprint)
  IF public.is_self_referral(v_referrer, v_me) THEN
    INSERT INTO public.referral_attempts (referred_user_id, attempted_code, source, device_id, ip_hash, fingerprint_hash, result, reason)
    VALUES (v_me, p_code, p_source, p_device_id, p_ip_hash, p_fingerprint_hash, 'rejected', 'self_referral_signals_match');
    RETURN 'rejected:self_referral';
  END IF;

  -- referrer blocked globally?
  IF EXISTS (SELECT 1 FROM public.referral_blocked_users b WHERE b.user_id = v_referrer AND b.blocked = true) THEN
    INSERT INTO public.referral_attempts (referred_user_id, attempted_code, source, device_id, ip_hash, fingerprint_hash, result, reason)
    VALUES (v_me, p_code, p_source, p_device_id, p_ip_hash, p_fingerprint_hash, 'rejected', 'referrer_blocked');
    RETURN 'rejected:referrer_blocked';
  END IF;

  -- ensure referrer has code (safe)
  PERFORM public.ensure_referral_code_for(v_referrer);

  INSERT INTO public.referrals (referred_user_id, referrer_user_id, code_used, source, status, created_at)
  VALUES (v_me, v_referrer, p_code, p_source, 'active', now());

  INSERT INTO public.referral_attempts (referred_user_id, attempted_code, source, device_id, ip_hash, fingerprint_hash, result, reason)
  VALUES (v_me, p_code, p_source, p_device_id, p_ip_hash, p_fingerprint_hash, 'accepted', NULL);

  RETURN 'accepted';
EXCEPTION WHEN OTHERS THEN
  v_reason := SQLERRM;
  INSERT INTO public.referral_attempts (referred_user_id, attempted_code, source, device_id, ip_hash, fingerprint_hash, result, reason)
  VALUES (COALESCE(v_me, gen_random_uuid()), p_code, p_source, p_device_id, p_ip_hash, p_fingerprint_hash, 'error', v_reason);
  RETURN 'error';
END;
$function$;

-- record_affiliate_customer_ref(p_ref_code text)   md5 32415f21d7f157f2bb6fd14d87fcce47   ACL: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.record_affiliate_customer_ref(p_ref_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_aff       public.affiliate_accounts%ROWTYPE;
  v_existing  uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_ref_code IS NULL OR length(btrim(p_ref_code)) = 0 THEN RETURN jsonb_build_object('status', 'invalid_code'); END IF;
  SELECT * INTO v_aff FROM public.affiliate_accounts WHERE ref_code = btrim(p_ref_code) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'invalid_code'); END IF;
  IF v_aff.status <> 'approved' THEN RETURN jsonb_build_object('status', 'not_eligible', 'reason', 'not_approved'); END IF;
  IF NOT ('influencer' = ANY (v_aff.modes)) THEN RETURN jsonb_build_object('status', 'not_eligible', 'reason', 'not_influencer'); END IF;
  IF v_aff.auth_user_id = v_uid THEN RETURN jsonb_build_object('status', 'self_referral'); END IF;
  SELECT affiliate_id INTO v_existing FROM public.affiliate_customer_refs WHERE user_id = v_uid LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status', 'already_attributed'); END IF;
  INSERT INTO public.affiliate_customer_refs (affiliate_id, user_id, source)
  VALUES (v_aff.id, v_uid, 'direct_link') ON CONFLICT (user_id) DO NOTHING;
  RETURN jsonb_build_object('status', 'recorded', 'affiliate_id', v_aff.id);
END;
$function$;

drop function if exists public.trg_fn_referrals_single_acquisition_source();
drop function if exists public.trg_fn_affiliate_customer_refs_single_acquisition_source();
drop function if exists public._acquisition_source_lock(uuid);

commit;
