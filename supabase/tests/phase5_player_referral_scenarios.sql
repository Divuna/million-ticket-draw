-- Scénářové testy Fáze 5 — osobní doporučení hráčů (finální pravidla). STAGING ONLY.
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
  u      uuid[] := '{}'::uuid[];
  ua uuid; ub uuid; uc uuid; ud uuid; ue uuid; uf uuid; ug uuid;
  uh uuid; ui uuid; ui2 uuid; uj uuid;
  uk uuid; un uuid; ul uuid; um uuid; uz uuid;
  tmp uuid;
  pb1 uuid; pb2 uuid; pc uuid; pd1 uuid; pd2 uuid; pe uuid; pf uuid; pg uuid;
  pi uuid; pi2 uuid; pj uuid; pn uuid; pl uuid; pm uuid; pz uuid;
  res jsonb; res2 jsonb;
  n numeric; n2 numeric; n3 numeric; base numeric; c int; c2 int;
  sess text;
  i int;
begin
  perform set_config('request.jwt.claims', '', true);

  for i in 1..16 loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'phase5-' || i || '-' || floor(random()*1e9)::text || '@onemil.test', '',
            now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
    returning id into tmp;
    insert into public.users (id, email) values (tmp, 'phase5-' || tmp || '@onemil.test') on conflict (id) do nothing;
    u := array_append(u, tmp);
  end loop;
  ua := u[1]; ub := u[2]; uc := u[3]; ud := u[4]; ue := u[5]; uf := u[6]; ug := u[7];
  uh := u[8]; ui := u[9]; ui2 := u[10]; uj := u[11];
  uk := u[12]; un := u[13]; ul := u[14]; um := u[15]; uz := u[16];

  -- ===========================================================================
  -- T3: samotná registrace s kódem nic nepřipíše
  -- ===========================================================================
  insert into public.referrals (referred_user_id, referrer_user_id, code_used, source, status) values
    (ub, ua, 'P5A', 'test', 'active'), (ud, ua, 'P5A', 'test', 'active'),
    (ue, ua, 'P5A', 'test', 'active'), (uf, ua, 'P5A', 'test', 'active'),
    (ug, ua, 'P5A', 'test', 'active'), (uz, ua, 'P5A', 'test', 'active'),
    (uj, ua, 'P5A', 'test', 'blocked'),
    (ui, uh, 'P5H', 'test', 'active'), (ui2, uh, 'P5H', 'test', 'active'),
    (un, uk, 'P5K', 'test', 'active'), (ul, uk, 'P5K', 'test', 'active'), (um, uk, 'P5K', 'test', 'active');

  select count(*) into c from public.referral_rewards where referrer_user_id in (ua, uh, uk);
  select coalesce(sum(balance_coins), 0) into n from public.wallets where user_id in (ua, uh, uk);
  r := array_append(r, case when c = 0 and n = 0 then 'PASS' else 'FAIL' end
                      || ' T3 samotná registrace/vazba: 0 odměn, 0 MIO');

  -- ===========================================================================
  -- T1: první dobití 300 Kč → 5 % (15) + jednorázových 15 MIO
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ub, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pb1;
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pb1 and status = 'earned'
    and credited_at is not null and lot_id is not null and credited_mc = reward_mc and shortfall_offset_mc = 0
    and ((reward_type = 'percent' and reward_mc = 15 and paid_amount_czk = 300)
         or (reward_type = 'first_topup_bonus' and reward_mc = 15));
  r := array_append(r, case when n = 30 and c = 2 then 'PASS' else 'FAIL' end
                      || ' T1 první dobití 300 Kč → 15 (5 %) + 15 bonus = ' || n);
  select count(*) into c from public.wallet_transactions where user_id = ua and reference_id = pb1
    and type in ('referral_reward', 'referral_first_topup_bonus') and amount = 15;
  r := array_append(r, case when c = 2 then 'PASS' else 'FAIL' end || ' T1 historie MIO: 2× +15');

  -- T10: samostatné sady, nepeněžní, 12 měsíců
  select count(*) into c from public.wallet_lots l join public.referral_rewards rr on rr.lot_id = l.id
  where rr.payment_id = pb1 and l.user_id = ua and l.payment_id is null
    and l.source = case rr.reward_type when 'percent' then 'referral_reward' else 'referral_first_topup_bonus' end
    and l.credited_amount = 15 and l.paid_mio = 0 and l.bonus_mio = 15
    and l.expires_at = l.credited_at + interval '12 months';
  r := array_append(r, case when c = 2 then 'PASS' else 'FAIL' end || ' T10 dvě samostatné nepeněžní sady, expirace +12 měsíců');

  -- ===========================================================================
  -- T2: druhé dobití 500 Kč → jen 5 % (25)
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ub, 525, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 500, 500, 25, 'czk', false)
  returning id into pb2;
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where referred_user_id = ub and reward_type = 'first_topup_bonus';
  r := array_append(r, case when n = 55 and c = 1 then 'PASS' else 'FAIL' end
                      || ' T2 druhé dobití → jen +25, bonus stále jednou (' || n || ')');

  -- ===========================================================================
  -- T4: bez vazby / blokovaná vazba / neplacená platba → nic
  -- ===========================================================================
  select balance_coins into base from public.wallets where user_id = ua;
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (uc, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pc;
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (uj, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pj;
  insert into public.payments (user_id, amount, method, status) values (ub, 50, 'bonus', 'completed');
  select count(*) into c from public.referral_rewards where payment_id in (pc, pj) or (referred_user_id = ub and paid_amount_czk is null);
  select balance_coins into n from public.wallets where user_id = ua;
  r := array_append(r, case when c = 0 and n = base then 'PASS' else 'FAIL' end
                      || ' T4 bez vazby / blokovaná / neplacená platba: nic');

  -- ===========================================================================
  -- T8: opakovaný webhook / opakované vyhodnocení → žádné dvojí připsání
  -- ===========================================================================
  select stripe_session_id into sess from public.payments where id = pb1;
  begin
    insert into public.payments (user_id, amount, method, status, stripe_session_id,
                                 paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
    values (ub, 310, 'stripe', 'completed', sess, 300, 300, 10, 'czk', false);
    r := array_append(r, 'FAIL T8 duplicitní session šla vložit');
  exception when unique_violation then
    r := array_append(r, 'PASS T8 duplicitní Stripe session odmítnuta');
  end;
  select balance_coins into n from public.wallets where user_id = ua;
  res := public.referral_award_for_payment(pb1);
  perform public._referral_credit_reward(id) from public.referral_rewards where payment_id = pb1;
  select balance_coins into n2 from public.wallets where user_id = ua;
  r := array_append(r, case when n = n2 and not (res->>'awarded')::boolean then 'PASS' else 'FAIL' end
                      || ' T8 opakované vyhodnocení i připsání: beze změny (' || n2 || ')');

  -- ===========================================================================
  -- T5: úplná refundace
  -- ===========================================================================
  select balance_coins into base from public.wallets where user_id = ua;
  res := public.prepare_stripe_refund(pb2);
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pb2 and status = 'reversed'
    and reversal_target_mc = 25 and reversed_mc = 25 and reversal_shortfall_mc = 0;
  r := array_append(r, case when (res->>'full_refund')::boolean and n = base - 25 and c = 1 then 'PASS' else 'FAIL' end
                      || ' T5 plná refundace 500 Kč → −25 (' || base || ' → ' || n || ')');
  res := public.prepare_stripe_refund(pb2);
  select balance_coins into n2 from public.wallets where user_id = ua;
  select count(*) into c from public.referral_reward_adjustments where payment_id = pb2;
  r := array_append(r, case when (res->>'already_prepared')::boolean and n2 = n and c = 1 then 'PASS' else 'FAIL' end
                      || ' T5 opakovaná refund událost: žádný dvojí odečet');
  perform public.record_stripe_refund_status(pb2, 're_p5_' || pb2, 'succeeded');
  perform public.finalize_stripe_refund(pb2);
  perform public.finalize_stripe_refund(pb2);
  select balance_coins into n2 from public.wallets where user_id = ua;
  r := array_append(r, case when n2 = n then 'PASS' else 'FAIL' end || ' T5 finalize (2×): beze změny');

  -- Úplná refundace PRVNÍHO dobití → −15 −15; další dobití bonus znovu nedá.
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ud, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pd1;
  select balance_coins into base from public.wallets where user_id = ua;
  perform public.prepare_stripe_refund(pd1);
  perform public.record_stripe_refund_status(pd1, 're_p5_' || pd1, 'succeeded');
  perform public.finalize_stripe_refund(pd1);
  select balance_coins into n from public.wallets where user_id = ua;
  r := array_append(r, case when n = base - 30 then 'PASS' else 'FAIL' end
                      || ' T5b plná refundace 1. dobití → −15 −15 (' || base || ' → ' || n || ')');
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ud, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pd2;
  select count(*) into c from public.referral_rewards where referred_user_id = ud and reward_type = 'first_topup_bonus';
  select balance_coins into n2 from public.wallets where user_id = ua;
  r := array_append(r, case when c = 1 and n2 = n + 15 then 'PASS' else 'FAIL' end
                      || ' T5c po refundaci 1. dobití: nové dobití jen 5 %, bonus podruhé nevznikl');

  -- ===========================================================================
  -- T6: 15 MIO + částečná refundace 1/3 → storno 5 z 5 % a 5 z bonusu
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ue, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pe;
  perform public.wallet_debit_fefo(ue, 200, 'test_consume', null, '{}'::jsonb, false);
  select balance_coins into base from public.wallets where user_id = ua;
  res := public.prepare_stripe_refund(pe);
  select balance_coins into n from public.wallets where user_id = ua;
  select reversal_target_mc into n2 from public.referral_rewards where payment_id = pe and reward_type = 'percent';
  select reversal_target_mc into n3 from public.referral_rewards where payment_id = pe and reward_type = 'first_topup_bonus';
  select count(*) into c from public.referral_rewards where payment_id = pe and status = 'partially_reversed' and reversed_mc = 5;
  r := array_append(r, case when (res->>'refund_amount_czk')::numeric = 100 and n2 = 5 and n3 = 5 and c = 2
                              and n = base - 10 then 'PASS' else 'FAIL' end
                      || ' T6 refundace 100 z 300 Kč (1/3): 5 % −5, bonus −5, celkem ' || base || ' → ' || n);

  -- ===========================================================================
  -- T6b: postupné částečné refundace + zaokrouhlení na 1 desetinné místo
  --      100 Kč → 5 % = 5,0 a bonus 15; tři události po 1/3 (33,33 Kč).
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (uf, 100, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 100, 100, 0, 'czk', false)
  returning id into pf;
  select balance_coins into base from public.wallets where user_id = ua;
  res := public._referral_reverse_for_payment(pf, 33.33, 'test_partial:1', 'test_partial');
  select reversal_target_mc into n from public.referral_rewards where payment_id = pf and reward_type = 'percent';
  select reversal_target_mc into n2 from public.referral_rewards where payment_id = pf and reward_type = 'first_topup_bonus';
  r := array_append(r, case when n = 1.7 and n2 = 5 then 'PASS' else 'FAIL' end
                      || ' T6b 1. třetina: 5 % → 1,7 (zaokrouhleno z 1,6665), bonus → 5,0 (' || n || ' / ' || n2 || ')');
  res := public._referral_reverse_for_payment(pf, 33.33, 'test_partial:2', 'test_partial');
  select reversal_target_mc into n from public.referral_rewards where payment_id = pf and reward_type = 'percent';
  select reversal_target_mc into n2 from public.referral_rewards where payment_id = pf and reward_type = 'first_topup_bonus';
  r := array_append(r, case when n = 3.3 and n2 = 10 then 'PASS' else 'FAIL' end
                      || ' T6b 2. třetina: kumulativně 3,3 / 10,0 (' || n || ' / ' || n2 || ')');
  res := public._referral_reverse_for_payment(pf, 33.34, 'test_partial:3', 'test_partial');
  select reversal_target_mc into n from public.referral_rewards where payment_id = pf and reward_type = 'percent';
  select reversal_target_mc into n2 from public.referral_rewards where payment_id = pf and reward_type = 'first_topup_bonus';
  select count(*) into c from public.referral_rewards where payment_id = pf and status = 'reversed';
  select balance_coins into n3 from public.wallets where user_id = ua;
  r := array_append(r, case when n = 5 and n2 = 15 and c = 2 and n3 = base - 20 then 'PASS' else 'FAIL' end
                      || ' T6b 3. třetina: celé 5,0 / 15,0, stav reversed, doporučující −20 (' || base || ' → ' || n3 || ')');
  select count(*), coalesce(sum(target_mc), 0) into c, n from public.referral_reward_adjustments where payment_id = pf;
  r := array_append(r, case when c = 6 and n = 20 then 'PASS' else 'FAIL' end
                      || ' T6b 6 úprav (2 odměny × 3 události), součet 20 (bez kumulativní chyby)');
  res := public._referral_reverse_for_payment(pf, 33.33, 'test_partial:3', 'test_partial');
  select balance_coins into n from public.wallets where user_id = ua;
  r := array_append(r, case when n = n3 then 'PASS' else 'FAIL' end || ' T6b opakovaná událost stejného klíče: nic');

  -- ===========================================================================
  -- T7: neúspěšná Stripe refundace bez pohledávky → přesná obnova
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ug, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pg;
  select balance_coins into base from public.wallets where user_id = ua;
  perform public.prepare_stripe_refund(pg);
  perform public.record_stripe_refund_status(pg, 're_p5_' || pg, 'failed');
  res := public.reverse_failed_stripe_refund(pg, 'failed');
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pg and status = 'earned' and reversal_target_mc = 0;
  select count(*) into c2 from public.referral_reward_adjustments where payment_id = pg and restored_at is not null;
  r := array_append(r, case when n = base and c = 2 and c2 = 2 and (res->>'referral_reward_restored')::boolean
                         then 'PASS' else 'FAIL' end
                      || ' T7 selhání Stripe: přesná obnova do stejných sad (' || n || ')');
  res := public.reverse_failed_stripe_refund(pg, 'failed');
  select balance_coins into n2 from public.wallets where user_id = ua;
  r := array_append(r, case when (res->>'already_reversed')::boolean and n2 = n then 'PASS' else 'FAIL' end
                      || ' T7 opakovaná událost selhání: žádné dvojí vrácení');

  -- ===========================================================================
  -- SF: utracená odměna → pohledávka 25 → umoření dvěma budoucími odměnami
  --     (přesně příklad Pavla: 25 → +15 = 0 do peněženky, zbývá 10 → +15 = 10 splaceno, 5 připsáno)
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ui, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pi;
  perform public.wallet_debit_fefo(uh, 25, 'test_consume', null, '{}'::jsonb, false);
  res := public.prepare_stripe_refund(pi);
  select balance_coins into n from public.wallets where user_id = uh;
  select coalesce(sum(amount_mc), 0), count(*) into n2, c from public.referral_shortfalls where referrer_user_id = uh;
  r := array_append(r, case when n = 0 and n2 = 25 and c = 2 then 'PASS' else 'FAIL' end
                      || ' SF1 utraceno 25 z 30 → vráceno 5, pohledávka 25, zůstatek nikdy pod nulou (' || n || ')');
  select count(*) into c from public.wallet_lots where user_id = uh and remaining_amount < 0;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' SF1 žádná sada v mínusu, jiné sady nedotčeny');

  -- první budoucí odměna 15 (5 % z 300 Kč od ui2) → vše na pohledávku
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ui2, 300, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 0, 'czk', false)
  returning id into pi2;
  select credited_mc, shortfall_offset_mc into n, n2 from public.referral_rewards where payment_id = pi2 and reward_type = 'percent';
  select sum(amount_mc - repaid_mc - cancelled_mc) into n3 from public.referral_shortfalls where referrer_user_id = uh;
  r := array_append(r, case when n = 0 and n2 = 15 then 'PASS' else 'FAIL' end
                      || ' SF2 odměna 15 → na pohledávku 15, do peněženky 0');
  -- druhá budoucí odměna 15 (bonus za 1. dobití ui2) → splatí 10, připíše 5
  select credited_mc, shortfall_offset_mc into n, n2 from public.referral_rewards where payment_id = pi2 and reward_type = 'first_topup_bonus';
  select coalesce(sum(amount_mc - repaid_mc - cancelled_mc), 0) into n3 from public.referral_shortfalls where referrer_user_id = uh;
  select balance_coins into base from public.wallets where user_id = uh;
  r := array_append(r, case when n = 5 and n2 = 10 and n3 = 0 and base = 5 then 'PASS' else 'FAIL' end
                      || ' SF3 další odměna 15 → splaceno 10, připsáno 5, pohledávka 0, zůstatek ' || base);
  select count(*), coalesce(sum(amount_mc), 0) into c, n from public.referral_shortfall_repayments where referrer_user_id = uh;
  r := array_append(r, case when n = 25 and c >= 2 then 'PASS' else 'FAIL' end
                      || ' SF4 auditní stopa umoření: ' || c || ' řádků, celkem ' || n);
  select count(*) into c from public.wallet_transactions where user_id = uh and reference_id = pi2
    and type = 'referral_first_topup_bonus' and amount = 5
    and (metadata->>'gross_mio')::numeric = 15 and (metadata->>'shortfall_offset_mio')::numeric = 10;
  r := array_append(r, case when c = 1 then 'PASS' else 'FAIL' end
                      || ' SF4 historie: +5 s metadaty hrubá 15 / na pohledávku 10');
  select count(*) into c from public.audit_logs where user_id = uh and event in ('referral_shortfall_created', 'referral_shortfall_repaid');
  r := array_append(r, case when c >= 3 then 'PASS' else 'FAIL' end || ' SF4 audit vzniku i umoření pohledávky');

  -- ===========================================================================
  -- SFR: selhání Stripe refundace s pohledávkou, která už byla částečně umořena
  --      K: starší pohledávka X (20) od N, pak L (30 → 20 na X, 10 připsáno a
  --      utraceno), refundace L vytvoří pohledávku Y (30), M (20) z ní umoří 20,
  --      pak Stripe refundace L selže → Y zrušena (10) + vráceno umořených 20.
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (un, 100, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 100, 100, 0, 'czk', false)
  returning id into pn;
  perform public.wallet_debit_fefo(uk, 20, 'test_consume', null, '{}'::jsonb, false);
  perform public.prepare_stripe_refund(pn);
  perform public.record_stripe_refund_status(pn, 're_p5_' || pn, 'succeeded');
  perform public.finalize_stripe_refund(pn);
  select coalesce(sum(amount_mc), 0) into n from public.referral_shortfalls where payment_id = pn;
  r := array_append(r, case when n = 20 then 'PASS' else 'FAIL' end || ' SFR1 starší pohledávka X = 20');

  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (ul, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pl;
  select balance_coins into n from public.wallets where user_id = uk;
  select coalesce(sum(repaid_mc), 0) into n2 from public.referral_shortfalls where payment_id = pn;
  r := array_append(r, case when n = 10 and n2 = 20 then 'PASS' else 'FAIL' end
                      || ' SFR2 odměny L 30: 20 na X, připsáno 10 (' || n || ')');
  perform public.wallet_debit_fefo(uk, 10, 'test_consume', null, '{}'::jsonb, false);

  perform public.prepare_stripe_refund(pl);
  select coalesce(sum(amount_mc), 0) into n from public.referral_shortfalls where payment_id = pl;
  select balance_coins into n2 from public.wallets where user_id = uk;
  r := array_append(r, case when n = 30 and n2 = 0 then 'PASS' else 'FAIL' end
                      || ' SFR3 refundace L → pohledávka Y = 30, zůstatek 0');

  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (um, 100, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 100, 100, 0, 'czk', false)
  returning id into pm;
  select coalesce(sum(repaid_mc), 0) into n from public.referral_shortfalls where payment_id = pl;
  select coalesce(sum(credited_mc), 0), coalesce(sum(shortfall_offset_mc), 0) into n2, n3
  from public.referral_rewards where payment_id = pm;
  r := array_append(r, case when n = 20 and n2 = 0 and n3 = 20 then 'PASS' else 'FAIL' end
                      || ' SFR4 odměny M 20 → celé na pohledávku Y');

  perform public.record_stripe_refund_status(pl, 're_p5_' || pl, 'failed');
  res := public.reverse_failed_stripe_refund(pl, 'failed');
  select balance_coins into n from public.wallets where user_id = uk;
  select coalesce(sum(cancelled_mc), 0), coalesce(sum(released_mc), 0), count(*) filter (where cancelled_at is null)
  into n2, n3, c from public.referral_shortfalls where payment_id = pl;
  r := array_append(r, case when n = 20 and n2 = 10 and n3 = 20 and c = 0 then 'PASS' else 'FAIL' end
                      || ' SFR5 selhání: Y zrušena (10 nesplaceno) + vráceno 20 umořených, zůstatek ' || n);
  select coalesce(sum(repaid_mc), 0), coalesce(sum(cancelled_mc), 0), count(*) filter (where cancelled_at is not null)
  into n2, n3, c from public.referral_shortfalls where payment_id = pn;
  select coalesce(sum(credited_mc), 0) + coalesce(sum(shortfall_offset_mc), 0) into base
  from public.referral_rewards where payment_id = pm;
  r := array_append(r, case when n2 = 20 and n3 = 0 and c = 0 and base = 20 then 'PASS' else 'FAIL' end
                      || ' SFR6 jiná pohledávka X i odměny M beze změny');
  select count(*) into c from public.referral_rewards where payment_id = pl and status = 'earned' and reversal_target_mc = 0;
  r := array_append(r, case when c = 2 then 'PASS' else 'FAIL' end || ' SFR7 odměny L zpět earned');
  res2 := public.reverse_failed_stripe_refund(pl, 'failed');
  select balance_coins into n2 from public.wallets where user_id = uk;
  r := array_append(r, case when (res2->>'already_reversed')::boolean and n2 = n then 'PASS' else 'FAIL' end
                      || ' SFR8 opakované selhání: žádné dvojí vrácení ani zrušení');

  -- ===========================================================================
  -- Storno mimo refundaci (completed → failed) a historická odměna
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (uz, 310, 'stripe', 'completed', 'cs_test_p5_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into pz;
  select balance_coins into base from public.wallets where user_id = ua;
  update public.payments set status = 'failed' where id = pz;
  update public.payments set status = 'completed' where id = pz;
  update public.payments set status = 'failed' where id = pz;
  select balance_coins into n from public.wallets where user_id = ua;
  r := array_append(r, case when n = base - 30 then 'PASS' else 'FAIL' end
                      || ' ST1 completed → failed (i opakovaně): odměny vráceny jednou (' || base || ' → ' || n || ')');
  insert into public.referral_rewards (referrer_user_id, referred_user_id, payment_id, paid_amount_mc,
                                       commission_rate, reward_mc, status, reward_type)
  values (ua, uc, pc, 310, 0.05, 15.5, 'earned', 'percent');
  select balance_coins into base from public.wallets where user_id = ua;
  update public.payments set status = 'failed' where id = pc;
  select balance_coins into n from public.wallets where user_id = ua;
  select count(*) into c from public.referral_rewards where payment_id = pc and status = 'reversed' and reversal_target_mc = 0;
  r := array_append(r, case when n = base and c = 1 then 'PASS' else 'FAIL' end
                      || ' ST2 nikdy nepřipsaná historická odměna: jen stav, bez odečtu');

  -- ===========================================================================
  -- T11: konzistence sad a zůstatků; žádná přímá změna mimo lot cestu
  -- ===========================================================================
  select count(*) into c from public.wallet_lot_consistency_issues() i where i.user_id = any(u);
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' T11 testovací uživatelé konzistentní: ' || c);
  select count(*) into c from public.wallet_lot_consistency_issues();
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' T11 celý staging konzistentní: ' || c);
  select count(*) into c from public.wallet_lots where user_id in (ua, uh, uk) and source = 'direct_balance_change';
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' T11 doporučujícím nic mimo lot cestu: ' || c);
  select count(*) into c from public.wallets where user_id = any(u) and balance_coins < 0;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' T11 žádná peněženka v mínusu');

  -- Neměnnost auditní stopy umoření
  begin
    update public.referral_shortfall_repayments set amount_mc = amount_mc where referrer_user_id = uh;
    r := array_append(r, 'FAIL T11 umoření šlo změnit');
  exception when others then
    r := array_append(r, 'PASS T11 auditní stopa umoření je neměnná');
  end;

  select count(*) into fails from unnest(r) x where x like 'FAIL%';
  raise exception 'RESULTS: % fail(s) / % checks%', fails, array_length(r, 1), E'\n' || array_to_string(r, E'\n');
end $$;
