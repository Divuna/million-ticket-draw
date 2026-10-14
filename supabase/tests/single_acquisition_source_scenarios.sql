-- Scénářové testy: jeden odměňovaný zdroj přivedení hráče (affiliate NEBO hráčské doporučení).
-- STAGING ONLY. Jedna transakce, na konci VŽDY výjimka `RESULTS: …` (vynucený ROLLBACK).
-- Skutečný souběh obou volání ověřuje spec 195 (Playwright).
--
-- Spuštění (staging workdir, nikdy ne produkce):
--   supabase db query --linked --workdir <staging-workdir> -f supabase/tests/single_acquisition_source_scenarios.sql

create function pg_temp.sa_user() returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'sa-' || v || '@onemil.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');
  insert into public.users (id, email) values (v, 'sa-' || v || '@onemil.test') on conflict (id) do nothing;
  return v;
end $$;

-- Hráč s vlastním doporučovacím kódem.
create function pg_temp.sa_ref_code(p_user uuid) returns text language plpgsql as $$
declare v text := 'SAR' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 9));
begin
  insert into public.referral_codes (user_id, code) values (p_user, v)
  on conflict (user_id) do update set code = excluded.code;
  return v;
end $$;

-- Schválený affiliate (influencer); p_owner = přihlášený účet affiliate (může být null).
create function pg_temp.sa_aff(p_owner uuid) returns text language plpgsql as $$
declare v text := 'SAA' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 9));
begin
  insert into public.affiliate_accounts (name, email, ref_code, modes, status, commission_rate_customer,
                                         commission_rate_company, auth_user_id)
  values ('SA ' || v, lower(v) || '@onemil.test', v, array['influencer'], 'approved', 5, 5, p_owner);
  return v;
end $$;

create function pg_temp.sa_as(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.sa_referral(p_user uuid, p_code text) returns text language plpgsql as $$
begin
  perform pg_temp.sa_as(p_user);
  return public.set_my_referrer_by_code(p_code, 'test');
end $$;

create function pg_temp.sa_affiliate(p_user uuid, p_code text) returns text language plpgsql as $$
begin
  perform pg_temp.sa_as(p_user);
  return public.record_affiliate_customer_ref(p_code)->>'status';
end $$;

create function pg_temp.sa_sources(p_user uuid) returns text language sql as $$
  select (select count(*) from public.referrals where referred_user_id = p_user)::text || '/'
      || (select count(*) from public.affiliate_customer_refs where user_id = p_user)::text;
$$;

do $$
declare
  r text[] := '{}'::text[];
  fails int := 0;
  u uuid; x uuid; y uuid; own uuid;
  c1 text; c2 text; a1 text; a2 text;
  s1 text; s2 text;
  pay uuid; n int; n2 int; ok boolean;
  v_month date := date_trunc('month', now())::date;
begin
  -- A: affiliate první → hráčské doporučení se nezapíše
  u := pg_temp.sa_user(); x := pg_temp.sa_user(); c1 := pg_temp.sa_ref_code(x); a1 := pg_temp.sa_aff(null);
  s1 := pg_temp.sa_affiliate(u, a1); s2 := pg_temp.sa_referral(u, c1);
  r := array_append(r, case when s1 = 'recorded' and s2 = 'rejected:already_attributed_to_other_source' and pg_temp.sa_sources(u) = '0/1'
                         then 'PASS' else 'FAIL' end || ' A affiliate první → doporučení odmítnuto (' || s1 || ' / ' || s2 || ', zdroje ' || pg_temp.sa_sources(u) || ')');

  -- B: hráčské doporučení první → affiliate se nezapíše
  u := pg_temp.sa_user(); x := pg_temp.sa_user(); c1 := pg_temp.sa_ref_code(x); a1 := pg_temp.sa_aff(null);
  s1 := pg_temp.sa_referral(u, c1); s2 := pg_temp.sa_affiliate(u, a1);
  r := array_append(r, case when s1 = 'accepted' and s2 = 'already_attributed_to_other_source' and pg_temp.sa_sources(u) = '1/0'
                         then 'PASS' else 'FAIL' end || ' B doporučení první → affiliate odmítnut (' || s1 || ' / ' || s2 || ', zdroje ' || pg_temp.sa_sources(u) || ')');

  -- C: dva affiliate → first-touch prvního
  u := pg_temp.sa_user(); a1 := pg_temp.sa_aff(null); a2 := pg_temp.sa_aff(null);
  s1 := pg_temp.sa_affiliate(u, a1); s2 := pg_temp.sa_affiliate(u, a2);
  r := array_append(r, case when s1 = 'recorded' and s2 = 'already_attributed'
                              and (select a.ref_code from public.affiliate_customer_refs cr join public.affiliate_accounts a on a.id = cr.affiliate_id where cr.user_id = u) = a1
                         then 'PASS' else 'FAIL' end || ' C dva affiliate → zůstává první (' || s2 || ')');

  -- D: dvě hráčská doporučení → first-touch prvního
  u := pg_temp.sa_user(); x := pg_temp.sa_user(); y := pg_temp.sa_user(); c1 := pg_temp.sa_ref_code(x); c2 := pg_temp.sa_ref_code(y);
  s1 := pg_temp.sa_referral(u, c1); s2 := pg_temp.sa_referral(u, c2);
  r := array_append(r, case when s1 = 'accepted' and s2 = 'rejected:already_has_referrer'
                              and (select referrer_user_id from public.referrals where referred_user_id = u) = x
                         then 'PASS' else 'FAIL' end || ' D dvě doporučení → zůstává první (' || s2 || ')');

  -- F: opakování téhož požadavku je idempotentní
  u := pg_temp.sa_user(); x := pg_temp.sa_user(); c1 := pg_temp.sa_ref_code(x); a1 := pg_temp.sa_aff(null);
  s1 := pg_temp.sa_affiliate(u, a1); s2 := pg_temp.sa_affiliate(u, a1);
  y := pg_temp.sa_user();
  perform pg_temp.sa_referral(y, c1);
  r := array_append(r, case when s1 = 'recorded' and s2 = 'already_attributed' and pg_temp.sa_sources(u) = '0/1'
                              and pg_temp.sa_referral(y, c1) = 'rejected:already_has_referrer' and pg_temp.sa_sources(y) = '1/0'
                         then 'PASS' else 'FAIL' end || ' F opakovaný stejný požadavek → beze změny, bez duplicity');

  -- G: affiliate nesmí doporučit sám sebe (hráčský účet vlastníka affiliate zůstává hráčem)
  own := pg_temp.sa_user(); a1 := pg_temp.sa_aff(own);
  s1 := pg_temp.sa_affiliate(own, a1);
  x := pg_temp.sa_user(); c1 := pg_temp.sa_ref_code(x);
  s2 := pg_temp.sa_referral(own, c1);
  r := array_append(r, case when s1 = 'self_referral' and s2 = 'accepted' and pg_temp.sa_sources(own) = '1/0'
                         then 'PASS' else 'FAIL' end || ' G affiliate sám sebe → self_referral; jako hráč může mít cizí doporučení (' || s1 || ' / ' || s2 || ')');

  -- H: hráčský self-referral zůstává blokovaný
  u := pg_temp.sa_user(); c1 := pg_temp.sa_ref_code(u);
  s1 := pg_temp.sa_referral(u, c1);
  r := array_append(r, case when s1 = 'rejected:self_referral' and pg_temp.sa_sources(u) = '0/0' then 'PASS' else 'FAIL' end
                      || ' H hráč sám sebe → ' || s1);

  -- Pojistka: přímý zápis (admin/service_role) druhého zdroje neprojde
  u := pg_temp.sa_user(); a1 := pg_temp.sa_aff(null); x := pg_temp.sa_user();
  perform pg_temp.sa_affiliate(u, a1);
  ok := false;
  begin
    insert into public.referrals (referred_user_id, referrer_user_id, code_used, source, status) values (u, x, 'X', 'test', 'active');
  exception when others then ok := sqlerrm = 'already_attributed_to_other_source';
  end;
  y := pg_temp.sa_user(); c1 := pg_temp.sa_ref_code(x);
  perform pg_temp.sa_referral(y, c1);
  n := 0;
  begin
    insert into public.affiliate_customer_refs (affiliate_id, user_id, source)
    select id, y, 'test' from public.affiliate_accounts where ref_code = a1;
  exception when others then n := case when sqlerrm = 'already_attributed_to_other_source' then 1 else 0 end;
  end;
  r := array_append(r, case when ok and n = 1 and pg_temp.sa_sources(u) = '0/1' and pg_temp.sa_sources(y) = '1/0'
                         then 'PASS' else 'FAIL' end || ' P přímý zápis druhého zdroje (admin/service_role) → výjimka, nic nevznikne');

  -- I: po dobití vznikne odměna jen podle vítězného zdroje
  perform set_config('request.jwt.claims', '', true);
  -- I1 affiliate vítěz → Kč provize, žádná MIO odměna
  u := pg_temp.sa_user(); x := pg_temp.sa_user(); c1 := pg_temp.sa_ref_code(x); a1 := pg_temp.sa_aff(null);
  perform pg_temp.sa_affiliate(u, a1); perform pg_temp.sa_referral(u, c1);
  perform set_config('request.jwt.claims', '', true);
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (u, 300, 'stripe', 'completed', 'cs_test_sa_' || gen_random_uuid(), 300, 300, 0, 'czk', false) returning id into pay;
  perform public.calculate_affiliate_commissions_for_month(v_month);
  select count(*) into n from public.affiliate_commission_payments where payment_id = pay;
  select count(*) into n2 from public.referral_rewards where payment_id = pay or referred_user_id = u;
  r := array_append(r, case when n = 1 and n2 = 0 then 'PASS' else 'FAIL' end
                      || ' I1 affiliate vítěz, dobití 300 Kč → affiliate provize ' || n || ', MIO odměn ' || n2);
  -- I2 hráčské doporučení vítěz → MIO odměna, žádná Kč provize
  u := pg_temp.sa_user(); x := pg_temp.sa_user(); c1 := pg_temp.sa_ref_code(x); a1 := pg_temp.sa_aff(null);
  perform pg_temp.sa_referral(u, c1); perform pg_temp.sa_affiliate(u, a1);
  perform set_config('request.jwt.claims', '', true);
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (u, 300, 'stripe', 'completed', 'cs_test_sa_' || gen_random_uuid(), 300, 300, 0, 'czk', false) returning id into pay;
  perform public.calculate_affiliate_commissions_for_month(v_month);
  select count(*) into n from public.affiliate_commission_payments where payment_id = pay;
  select count(*) into n2 from public.referral_rewards where referred_user_id = u and referrer_user_id = x;
  r := array_append(r, case when n = 0 and n2 >= 1 then 'PASS' else 'FAIL' end
                      || ' I2 doporučení vítěz, dobití 300 Kč → affiliate provize ' || n || ', MIO odměn ' || n2);

  -- K: bezpečnost
  r := array_append(r, case when not has_function_privilege('anon', 'public._acquisition_source_lock(uuid)', 'execute')
                              and not has_function_privilege('authenticated', 'public._acquisition_source_lock(uuid)', 'execute')
                         then 'PASS' else 'FAIL' end || ' K zámek zdroje není volatelný klientem');
  select count(*) into n from public.referrals rr join public.affiliate_customer_refs a on a.user_id = rr.referred_user_id;
  r := array_append(r, case when n = 0 then 'PASS' else 'FAIL' end || ' K2 žádný hráč se dvěma zdroji: ' || n);

  select count(*) into fails from unnest(r) t(line) where t.line like 'FAIL%';
  raise exception 'RESULTS: % fail(s) / % checks%', fails, array_length(r, 1), E'\n' || array_to_string(r, E'\n');
end $$;
