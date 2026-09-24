-- JEDEN ODMĚŇOVANÝ ZDROJ PŘIVEDENÍ HRÁČE (24. 9. 2026)
--
-- Potvrzené pravidlo (Pavel): U hráče může existovat pouze jeden odměňovaný zdroj
-- přivedení: affiliate nebo hráčské doporučení. Platí permanentní first-touch —
-- první úspěšně zapsaný zdroj zůstává a druhý se už nepřidá.
--
-- Zápisové cesty (ověřeno v produkci i v repu):
--   * public.referrals               ← set_my_referrer_by_code (ReferralSection, Register,
--                                       useApplyPendingReferral); přímý zápis jen service_role.
--   * public.affiliate_customer_refs ← record_affiliate_customer_ref (useApplyPendingAffiliateRef);
--                                       přímý zápis admin (RLS aff_customer_refs_admin_write) a service_role.
--   Žádná jiná DB funkce ani trigger do nich nezapisuje. Register.tsx ukládá stejné ?ref=
--   do obou pending klíčů, takže obě RPC mohou po přihlášení běžet současně.
--
-- Řešení: zámek uživatele (_acquisition_source_lock) + kontrola druhého systému v obou
-- funkcích (čitelný stav) + pojistné triggery na obou tabulkách (i přímé zápisy).
-- Při souběhu vyhraje přesně ten zápis, který získá zámek první; druhý nic nezapíše.
--
-- ZÁMĚRNĚ NEDOTČENO: vnitřní first-touch obou systémů, self-referral blokace,
-- affiliate provize (Fáze 6), MIO odměny za doporučení (Fáze 5), refundace/recovery.
-- Affiliate účet a hráčský účet téhož člověka se nemění.

begin;

create or replace function public._acquisition_source_lock(p_user_id uuid)
 returns void
 language sql
 set search_path to ''
as $function$
  select pg_advisory_xact_lock(hashtext('onemil_acquisition_source'), hashtext(p_user_id::text));
$function$;

-- Pojistka pro každý zápis (i admin/service_role): druhý zdroj se nepřidá.
create or replace function public.trg_fn_referrals_single_acquisition_source()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' and new.referred_user_id is not distinct from old.referred_user_id then
    return new;
  end if;
  perform public._acquisition_source_lock(new.referred_user_id);
  if exists (select 1 from public.affiliate_customer_refs a where a.user_id = new.referred_user_id) then
    raise exception 'already_attributed_to_other_source'
      using detail = 'Hráč už má affiliate zdroj přivedení; hráčské doporučení se nepřidá.';
  end if;
  return new;
end;
$function$;

create or replace function public.trg_fn_affiliate_customer_refs_single_acquisition_source()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then
    return new;
  end if;
  perform public._acquisition_source_lock(new.user_id);
  if exists (select 1 from public.referrals r where r.referred_user_id = new.user_id) then
    raise exception 'already_attributed_to_other_source'
      using detail = 'Hráč už má hráčské doporučení; affiliate zdroj se nepřidá.';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_referrals_single_acquisition_source on public.referrals;
create trigger trg_referrals_single_acquisition_source
  before insert or update of referred_user_id on public.referrals
  for each row execute function public.trg_fn_referrals_single_acquisition_source();

drop trigger if exists trg_affiliate_customer_refs_single_acquisition_source on public.affiliate_customer_refs;
create trigger trg_affiliate_customer_refs_single_acquisition_source
  before insert or update of user_id on public.affiliate_customer_refs
  for each row execute function public.trg_fn_affiliate_customer_refs_single_acquisition_source();

-- Hráčské doporučení: produkční definice + zámek a kontrola affiliate zdroje.
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

  -- Jediný odměňovaný zdroj přivedení: zámek uživatele serializuje souběh s affiliate.
  PERFORM public._acquisition_source_lock(v_me);

  -- already has referrer?
  IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.referred_user_id = v_me) THEN
    RETURN 'rejected:already_has_referrer';
  END IF;

  -- already attributed to an affiliate? (first-touch napříč systémy, nic se nepřepisuje)
  IF EXISTS (SELECT 1 FROM public.affiliate_customer_refs a WHERE a.user_id = v_me) THEN
    INSERT INTO public.referral_attempts (referred_user_id, attempted_code, source, device_id, ip_hash, fingerprint_hash, result, reason)
    VALUES (v_me, p_code, p_source, p_device_id, p_ip_hash, p_fingerprint_hash, 'rejected', 'already_attributed_to_other_source');
    RETURN 'rejected:already_attributed_to_other_source';
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

-- Affiliate atribuce: produkční definice + zámek a kontrola hráčského doporučení.
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
  -- Jediný odměňovaný zdroj přivedení: zámek uživatele serializuje souběh s hráčským doporučením.
  PERFORM public._acquisition_source_lock(v_uid);
  SELECT affiliate_id INTO v_existing FROM public.affiliate_customer_refs WHERE user_id = v_uid LIMIT 1;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('status', 'already_attributed'); END IF;
  -- Už má hráčské doporučení → první zdroj zůstává, affiliate se nepřidá.
  IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.referred_user_id = v_uid) THEN
    RETURN jsonb_build_object('status', 'already_attributed_to_other_source');
  END IF;
  INSERT INTO public.affiliate_customer_refs (affiliate_id, user_id, source)
  VALUES (v_aff.id, v_uid, 'direct_link') ON CONFLICT (user_id) DO NOTHING;
  RETURN jsonb_build_object('status', 'recorded', 'affiliate_id', v_aff.id);
END;
$function$;

revoke all on function public._acquisition_source_lock(uuid) from public, anon, authenticated;
revoke all on function public.trg_fn_referrals_single_acquisition_source() from public, anon, authenticated;
revoke all on function public.trg_fn_affiliate_customer_refs_single_acquisition_source() from public, anon, authenticated;

commit;
