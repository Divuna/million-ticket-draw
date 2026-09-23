-- Scénářové testy Fáze 5 — osobní doporučení hráčů. STAGING ONLY.
--
-- Běží v jedné transakci a na konci VŽDY vyhodí výjimku `RESULTS: …`,
-- takže se nic neuloží (vynucený ROLLBACK). Výsledek je v textu výjimky.
--
-- Spuštění (staging workdir, nikdy ne produkce):
--   supabase db query --linked --workdir <staging-workdir> -f supabase/tests/phase5_player_referral_scenarios.sql

do $$
declare
  r      text[] := '{}'::text[];
  fails  int := 0;
  ua uuid;  -- doporučující A
  ub uuid;  -- doporučený B (první + druhé dobití, refundace druhého)
  uc uuid;  -- bez doporučení
  ud uuid;  -- doporučený D (refundace PRVNÍHO dobití, pak nové dobití)
  ue uuid;  -- doporučený E (částečná refundace)
  ug uuid;  -- doporučený G (neúspěšná refundace)
  uh uuid;  -- doporučující H (utratí odměnu → nedoplatek reverze)
  ui uuid;  -- doporučený I (od H)
  uj uuid;  -- doporučený J (blokovaná vazba)
  uk uuid;  -- doporučený K (platba ručně přepnuta do failed)
  ul uuid;  -- doporučený L (150 Kč → 7,5 MIO)
  tmp uuid;
  pb1 uuid; pb2 uuid; pc uuid; pd1 uuid; pd2 uuid; pe uuid; pg uuid; pi uuid; pj uuid; pk uuid; pl uuid;
  res jsonb;
  n numeric; n2 numeric; base_a numeric; c int; c2 int;
  sess text;
begin
  perform set_config('request.jwt.claims', '', true);

  for c in 1..11 loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'phase5-' || c || '-' || floor(random()*1e9)::text || '@onemil.test', '',
            now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
    returning id into tmp;
    insert into public.users (id, email) values (tmp, 'phase5-u' || c || '-' || tmp || '@onemil.test') on conflict (id) do nothing;
    case c when 1 then ua := tmp; when 2 then ub := tmp; when 3 then uc := tmp; when 4 then ud := tmp;
           when 5 then ue := tmp; when 6 then ug := tmp; when 7 then uh := tmp; when 8 then ui := tmp;
           when 9 then uj := tmp; when 10 then uk := tmp; else ul := tmp; end case;
  end loop;

  -- ===========================================================================
  -- T3: registrace s kódem sama o sobě nic nepřipíše
  -- ===========================================================================
  insert into public.referrals (referred_user_id, referrer_user_id, code_used, source, status) values
    (ub, ua, 'PHASE5A', 'test', 'active'), (ud, ua, 'PHASE5A', 'test', 'active'),
    (ue, ua, 'PHASE5A', 'test', 'active'), (ug, ua, 'PHASE5A', 'test', 'active'),
    (ui, uh, 'PHASE5H', 'test', 'active'), (uj, ua, 'PHASE5A', 'test', 'blocked'),
    (uk, ua, 'PHASE5A', 'test', 'active'), (ul, ua, 'PHASE5A', 'test', 'active');

  select count(*) into c from public.referral_rewards where referrer_user_id in (ua, uh);
  select coalesce(sum(balance_coins), 0) into n from public.wallets where user_id in (ua, uh);
  r := array_append(r, case when c = 0 and n = 0 then 'PASS' else 'FAIL' end
                      || ' T3 samotná registrace/vazba: 0 odměn, 0 MIO (' || c || ' / ' || n || ')');

  -- ===========================================================================
  -- T1: první dobití 300 Kč → 5 % (15 MIO) + jednorázových 15 MIO
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ub, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pb1;

  select balance_coins into n from public.wallets where user_id = ua;
  r := array_append(r, case when n = 30 then 'PASS' else 'FAIL' end || ' T1 doporučující dostal 15 + 15 = 30 MIO: ' || n);
  select count(*) into c from public.referral_rewards where payment_id = pb1 and reward_type = 'percent'
    and reward_mc = 15 and paid_amount_czk = 300 and lot_id is not null and status = 'earned';
  select count(*) into c2 from public.referral_rewards where payment_id = pb1 and reward_type = 'first_topup_bonus'
    and reward_mc = 15 and lot_id is not null and status = 'earned';
  r := array_append(r, case when c = 1 and c2 = 1 then 'PASS' else 'FAIL' end
                      || ' T1 dvě odměny s vlastní sadou (5 % z 300 Kč = 15, bonus 15)');
  select balance_coins into n from public.wallets where user_id = ub;
  r := array_append(r, case when n = 310 then 'PASS' else 'FAIL' end || ' T1 doporučený má své 310 MIO beze změny: ' || n);
  select count(*) into c from public.wallet_transactions where user_id = ua and reference_id = pb1
    and type in ('referral_reward', 'referral_first_topup_bonus') and amount = 15;
  r := array_append(r, case when c = 2 then 'PASS' else 'FAIL' end || ' T1 historie MIO: 2 záznamy +15 (' || c || ')');

  -- ===========================================================================
  -- T10: samostatné sady s 12měsíční expirací, nepeněžní (bonus_mio), mimo payment_id
  -- ===========================================================================
  select count(*) into c from public.wallet_lots l
  join public.referral_rewards rr on rr.lot_id = l.id
  where rr.payment_id = pb1
    and l.user_id = ua
    and l.source = case rr.reward_type when 'percent' then 'referral_reward' else 'referral_first_topup_bonus' end
    and l.credited_amount = rr.reward_mc and l.remaining_amount = rr.reward_mc
    and l.paid_mio = 0 and l.bonus_mio = rr.reward_mc
    and l.payment_id is null
    and l.expires_at = l.credited_at + interval '12 months'
    and l.status = 'active';
  r := array_append(r, case when c = 2 then 'PASS' else 'FAIL' end
                      || ' T10 dvě samostatné referral sady, nepeněžní, expirace +12 měsíců (' || c || ')');

  -- ===========================================================================
  -- T2: druhé dobití 500 Kč → jen 5 % (25 MIO), žádný další bonus
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ub, 525, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 500, 500, 25, 'czk', false)
  returning id into pb2;
  select balance_coins into n from public.wallets where user_id = ua;
  r := array_append(r, case when n = 55 then 'PASS' else 'FAIL' end || ' T2 druhé dobití 500 Kč → +25 (celkem 55): ' || n);
  select count(*) into c from public.referral_rewards where referred_user_id = ub and reward_type = 'first_topup_bonus';
  select count(*) into c2 from public.referral_rewards where payment_id = pb2;
  r := array_append(r, case when c = 1 and c2 = 1 then 'PASS' else 'FAIL' end
                      || ' T2 bonus 15 MIO stále jen jednou; druhá platba má jen 5 %');

  -- Zaokrouhlení na 1 desetinné místo: 150 Kč → 7,5 MIO (+ 15 bonus).
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ul, 150, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 150, 150, 0, 'czk', false)
  returning id into pl;
  select reward_mc into n from public.referral_rewards where payment_id = pl and reward_type = 'percent';
  r := array_append(r, case when n = 7.5 then 'PASS' else 'FAIL' end || ' T2b 150 Kč → 7,5 MIO: ' || n);

  -- ===========================================================================
  -- T4: uživatel bez vazby i s blokovanou vazbou → nic; neplacené platby → nic
  -- ===========================================================================
  select balance_coins into base_a from public.wallets where user_id = ua;
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (uc, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pc;
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (uj, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pj;
  -- Bonusová/partnerská platba bez zaplacených Kč
  insert into public.payments (user_id, amount, method, status) values (ub, 50, 'bonus', 'completed');
  select count(*) into c from public.referral_rewards where payment_id in (pc, pj) or (referred_user_id = ub and paid_amount_czk is null);
  select balance_coins into n from public.wallets where user_id = ua;
  r := array_append(r, case when c = 0 and n = base_a then 'PASS' else 'FAIL' end
                      || ' T4 bez vazby / blokovaná vazba / neplacená platba: 0 odměn, zůstatek beze změny');

  -- ===========================================================================
  -- T8: opakovaný webhook — stejná session se nevloží, opakované vyhodnocení nic nepřipíše
  -- ===========================================================================
  select stripe_session_id into sess from public.payments where id = pb1;
  begin
    insert into public.payments (user_id, amount, method, status, stripe_session_id,
                                 paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
    values (ub, 310, 'stripe', 'completed', sess, 300, 300, 10, 'czk', false);
    r := array_append(r, 'FAIL T8 duplicitní session šla vložit');
  exception when unique_violation then
    r := array_append(r, 'PASS T8 duplicitní Stripe session odmítnuta (unique)');
  end;
  select balance_coins into n from public.wallets where user_id = ua;
  res := public.referral_award_for_payment(pb1);
  res := public.referral_award_for_payment(pb1);
  select balance_coins into n2 from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pb1;
  r := array_append(r, case when n = n2 and c = 2 and not (res->>'awarded')::boolean then 'PASS' else 'FAIL' end
                      || ' T8 opakované vyhodnocení platby: žádné dvojí připsání (' || n || ' → ' || n2 || ', odměn ' || c || ')');

  -- ===========================================================================
  -- T5: refundace druhého dobití (celá) → 5 % se vrátí celé, bonus z 1. platby zůstane
  -- ===========================================================================
  select balance_coins into base_a from public.wallets where user_id = ua;
  res := public.prepare_stripe_refund(pb2);
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pb2 and status = 'reversed'
    and reversal_target_mc = 25 and reversed_mc = 25 and reversal_shortfall_mc = 0;
  r := array_append(r, case when (res->>'ok')::boolean and (res->>'full_refund')::boolean and n = base_a - 25 and c = 1
                         then 'PASS' else 'FAIL' end
                      || ' T5 plná refundace 500 Kč → doporučující −25 (' || base_a || ' → ' || n || ')');
  select count(*) into c from public.referral_rewards where payment_id = pb1 and status = 'earned';
  r := array_append(r, case when c = 2 then 'PASS' else 'FAIL' end || ' T5 odměny z jiné platby nedotčeny');
  select count(*) into c from public.wallet_transactions where user_id = ua and reference_id = pb2 and type = 'referral_reversal' and amount = -25;
  r := array_append(r, case when c = 1 then 'PASS' else 'FAIL' end || ' T5 historie MIO: právě jedna reverze −25');
  -- Opakovaná příprava nesmí odečíst podruhé.
  res := public.prepare_stripe_refund(pb2);
  select balance_coins into n2 from public.wallets where user_id = ua;
  r := array_append(r, case when (res->>'already_prepared')::boolean and n2 = n then 'PASS' else 'FAIL' end
                      || ' T5 opakovaná příprava: žádný dvojí odečet (' || n2 || ')');
  perform public.record_stripe_refund_status(pb2, 're_p5_' || pb2, 'succeeded');
  res := public.finalize_stripe_refund(pb2);
  select balance_coins into n2 from public.wallets where user_id = ua;
  r := array_append(r, case when (res->>'ok')::boolean and n2 = n then 'PASS' else 'FAIL' end
                      || ' T5 finalize: stav refunded, doporučující beze změny');

  -- Refundace PRVNÍHO dobití (celá) → vrátí 5 % i 15 MIO; nové dobití bonus znovu nedá.
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ud, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pd1;
  select balance_coins into base_a from public.wallets where user_id = ua;
  res := public.prepare_stripe_refund(pd1);
  perform public.record_stripe_refund_status(pd1, 're_p5_' || pd1, 'succeeded');
  perform public.finalize_stripe_refund(pd1);
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pd1 and status = 'reversed';
  r := array_append(r, case when n = base_a - 30 and c = 2 then 'PASS' else 'FAIL' end
                      || ' T5b plná refundace 1. dobití → −15 (5 %) −15 (bonus): ' || base_a || ' → ' || n);
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ud, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pd2;
  select count(*) into c from public.referral_rewards where referred_user_id = ud and reward_type = 'first_topup_bonus';
  select count(*) into c2 from public.referral_rewards where payment_id = pd2 and reward_type = 'percent' and status = 'earned';
  select balance_coins into n2 from public.wallets where user_id = ua;
  r := array_append(r, case when c = 1 and c2 = 1 and n2 = n + 15 then 'PASS' else 'FAIL' end
                      || ' T5c dobití po refundaci 1. dobití: jen 5 % (+15), bonus podruhé nevznikl');
  -- Unikátní index drží i přímý pokus o druhý bonus.
  begin
    insert into public.referral_rewards (referrer_user_id, referred_user_id, payment_id, paid_amount_mc,
                                         commission_rate, reward_mc, status, reward_type)
    values (ua, ud, pd2, 310, 0, 15, 'earned', 'first_topup_bonus');
    r := array_append(r, 'FAIL T5d druhý bonus šel vložit');
  exception when unique_violation then
    r := array_append(r, 'PASS T5d druhý bonus pro stejného doporučeného zablokován indexem');
  end;

  -- ===========================================================================
  -- T6: částečná refundace → poměrná reverze 5 %, bonus 15 MIO zůstává
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ue, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pe;
  perform public.wallet_debit_fefo(ue, 200, 'test_consume', null, '{}'::jsonb, false);
  select balance_coins into base_a from public.wallets where user_id = ua;
  res := public.prepare_stripe_refund(pe);
  select balance_coins into n from public.wallets where user_id = ua;
  select reversal_target_mc into n2 from public.referral_rewards where payment_id = pe and reward_type = 'percent';
  select count(*) into c from public.referral_rewards where payment_id = pe and reward_type = 'first_topup_bonus' and status = 'earned';
  r := array_append(r, case when (res->>'refund_amount_czk')::numeric = 100 and not (res->>'full_refund')::boolean
                              and n2 = 5 and n = base_a - 5 and c = 1 then 'PASS' else 'FAIL' end
                      || ' T6 refundace 100 z 300 Kč → 5 % reverze 5,0 z 15; bonus zůstává (' || base_a || ' → ' || n || ')');
  select count(*) into c from public.referral_rewards where payment_id = pe and reward_type = 'percent'
    and status = 'partially_reversed' and reversed_mc = 5;
  r := array_append(r, case when c = 1 then 'PASS' else 'FAIL' end || ' T6 stav partially_reversed, odečteno 5');
  select remaining_amount into n from public.wallet_lots l join public.referral_rewards rr on rr.lot_id = l.id
  where rr.payment_id = pe and rr.reward_type = 'percent';
  r := array_append(r, case when n = 10 then 'PASS' else 'FAIL' end || ' T6 odečteno ze sady odměny (zbývá 10): ' || n);

  -- ===========================================================================
  -- T7: neúspěšná Stripe refundace → přesná obnova, žádné dvojí vrácení
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ug, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pg;
  select balance_coins into base_a from public.wallets where user_id = ua;
  res := public.prepare_stripe_refund(pg);
  select balance_coins into n from public.wallets where user_id = ua;
  r := array_append(r, case when n = base_a - 30 then 'PASS' else 'FAIL' end
                      || ' T7 příprava refundace: doporučující −30 (' || base_a || ' → ' || n || ')');
  perform public.record_stripe_refund_status(pg, 're_p5_' || pg, 'failed');
  res := public.reverse_failed_stripe_refund(pg, 'failed');
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pg and status = 'earned'
    and reversal_target_mc = 0 and reversed_mc = 0;
  r := array_append(r, case when (res->>'ok')::boolean and (res->>'referral_reward_restored')::boolean
                              and n = base_a and c = 2 then 'PASS' else 'FAIL' end
                      || ' T7 selhání Stripe: odměny obnoveny do stavu earned, zůstatek zpět ' || n);
  select count(*) into c from public.wallet_lot_movements where reference_id = pg and movement_type = 'referral_restore';
  select count(*) into c2 from public.wallet_lots l join public.referral_rewards rr on rr.lot_id = l.id
  where rr.payment_id = pg and l.status = 'active' and l.remaining_amount = 15;
  r := array_append(r, case when c = 2 and c2 = 2 then 'PASS' else 'FAIL' end
                      || ' T7 vráceno do stejných sad (2 pohyby referral_restore, sady znovu 15/15)');
  res := public.reverse_failed_stripe_refund(pg, 'failed');
  select balance_coins into n2 from public.wallets where user_id = ua;
  r := array_append(r, case when (res->>'already_reversed')::boolean and n2 = n then 'PASS' else 'FAIL' end
                      || ' T7 opakovaná událost: žádné dvojí vrácení (' || n2 || ')');

  -- ===========================================================================
  -- T5e: doporučující odměnu utratil → reverze jen z její sady, nedoplatek do evidence
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ui, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pi;
  perform public.wallet_debit_fefo(uh, 25, 'test_consume', null, '{}'::jsonb, false);
  res := public.prepare_stripe_refund(pi);
  select balance_coins into n from public.wallets where user_id = uh;
  select coalesce(sum(reversed_mc), 0), coalesce(sum(reversal_shortfall_mc), 0) into n2, base_a
  from public.referral_rewards where payment_id = pi;
  select count(*) into c from public.audit_logs where event = 'referral_reversal_shortfall' and user_id = uh;
  r := array_append(r, case when n = 0 and n2 = 5 and base_a = 25 and c >= 1 then 'PASS' else 'FAIL' end
                      || ' T5e utraceno 25 z 30: vráceno 5, nedoplatek 25 zapsán, zůstatek H = ' || n);

  -- ===========================================================================
  -- Storno mimo refundaci (completed → failed) → plná reverze triggerem
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (uk, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pk;
  select balance_coins into base_a from public.wallets where user_id = ua;
  update public.payments set status = 'failed' where id = pk;
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pk and status = 'reversed';
  r := array_append(r, case when n = base_a - 30 and c = 2 then 'PASS' else 'FAIL' end
                      || ' T5f completed → failed: odměny vráceny triggerem (' || base_a || ' → ' || n || ')');

  -- Historická (nikdy nepřipsaná) odměna se při stornu NEodečítá z peněženky.
  insert into public.referral_rewards (referrer_user_id, referred_user_id, payment_id, paid_amount_mc,
                                       commission_rate, reward_mc, status, reward_type)
  values (ua, uc, pc, 310, 0.05, 15.5, 'earned', 'percent');
  select balance_coins into base_a from public.wallets where user_id = ua;
  update public.payments set status = 'failed' where id = pc;
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pc and status = 'reversed' and reversed_mc = 0;
  r := array_append(r, case when n = base_a and c = 1 then 'PASS' else 'FAIL' end
                      || ' T5g nepřipsaná historická odměna: jen stav, žádný odečet (' || n || ')');

  -- ===========================================================================
  -- T11: konzistence sad a zůstatků
  -- ===========================================================================
  select count(*) into c from public.wallet_lot_consistency_issues() i
  where i.user_id in (ua, ub, uc, ud, ue, ug, uh, ui, uj, uk, ul);
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' T11 testovací uživatelé konzistentní: ' || c);
  select count(*) into c from public.wallet_lot_consistency_issues();
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' T11 celý staging konzistentní: ' || c);

  -- Žádná přímá změna zůstatku mimo lot cestu (sync trigger nesměl založit sadu).
  select count(*) into c from public.wallet_lots
  where user_id in (ua, uh) and source = 'direct_balance_change';
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end
                      || ' T11 doporučujícím nic nešlo přímou změnou balance_coins: ' || c);

  select count(*) into fails from unnest(r) x where x like 'FAIL%';
  raise exception 'RESULTS: % fail(s) / % checks%', fails, array_length(r, 1), E'\n' || array_to_string(r, E'\n');
end $$;
