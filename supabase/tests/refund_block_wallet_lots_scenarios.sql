-- Scénářové testy refund bloku (F2 + F3 + F4) — STAGING ONLY.
--
-- Běží celé v jedné transakci a na konci VŽDY vyhodí výjimku
-- `RESULTS: …`, takže se nic neuloží (vynucený ROLLBACK). Výsledek je
-- v textu výjimky: každý řádek PASS/FAIL + souhrn.
--
-- Spuštění (staging workdir, nikdy ne produkce):
--   supabase db query --linked --workdir <staging-workdir> -f supabase/tests/refund_block_wallet_lots_scenarios.sql

do $$
declare
  r        text[] := '{}'::text[];
  fails    int := 0;
  u1 uuid; u2 uuid; u3 uuid; u4 uuid; u5 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid; p5a uuid; p5b uuid; p6 uuid;
  res jsonb; res2 jsonb;
  n numeric; n2 numeric; c int;
  l1 uuid; l2 uuid; l3 uuid;

  procedure_dummy int;
  info text;
begin
  -- ---------------------------------------------------------------------------
  -- pomocné: založení testovacího uživatele (auth.users → trigger založí users/wallets)
  -- ---------------------------------------------------------------------------
  perform set_config('request.jwt.claims', '', true);

  for c in 1..5 loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at,
                            raw_app_meta_data, raw_user_meta_data)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'refundblock-' || c || '-' || floor(random()*1e9)::text || '@onemil.test', '',
            now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
    returning id into l1;
    insert into public.users (id, email) values (l1, 'refundblock-u' || c || '@onemil.test') on conflict (id) do nothing;
    if c = 1 then u1 := l1; elsif c = 2 then u2 := l1; elsif c = 3 then u3 := l1; elsif c = 4 then u4 := l1; else u5 := l1; end if;
  end loop;

  -- ===========================================================================
  -- S1 + S4: 300 Kč → 300 placených + 10 bonusových MIO, plně nepoužito → refundace
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (u1, 310, 'stripe', 'completed', 'cs_test_rb_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into p1;

  select count(*) into c from public.wallet_lots where payment_id = p1;
  r := array_append(r, case when c = 2 then 'PASS' else 'FAIL' end || ' S1 dobití vytvoří 2 sady (placená+bonus): ' || c);
  select balance_coins into n from public.wallets where user_id = u1;
  r := array_append(r, case when n = 310 then 'PASS' else 'FAIL' end || ' S1 zůstatek 310: ' || n);
  select remaining_amount into n from public.wallet_lots where payment_id = p1 and source = 'payment_paid';
  select remaining_amount into n2 from public.wallet_lots where payment_id = p1 and source = 'payment_bonus';
  r := array_append(r, case when n = 300 and n2 = 10 then 'PASS' else 'FAIL' end || ' S1 placená 300 / bonus 10: ' || n || '/' || n2);
  select count(*) into c from public.wallet_transactions where reference_id = p1 and type = 'payment_credit' and amount = 310;
  r := array_append(r, case when c = 1 then 'PASS' else 'FAIL' end || ' S1 právě jeden payment_credit 310');

  res := public.prepare_stripe_refund(p1);
  r := array_append(r, case when (res->>'ok')::boolean and (res->>'refund_amount_czk')::numeric = 300
                              and (res->>'refund_amount_haler')::bigint = 30000
                              and (res->>'refund_paid_mio')::numeric = 300 and (res->>'refund_bonus_mio')::numeric = 10
                              and (res->>'full_refund')::boolean
                         then 'PASS' else 'FAIL' end || ' S1 prepare: 300 Kč / 30000 haléřů / 300 + bonus 10 zrušen: ' || res::text);
  select balance_coins into n from public.wallets where user_id = u1;
  r := array_append(r, case when n = 0 then 'PASS' else 'FAIL' end || ' S1 zůstatek po přípravě 0: ' || n);

  perform public.record_stripe_refund_status(p1, 're_rb_' || p1, 'succeeded');
  res := public.finalize_stripe_refund(p1);
  select count(*) into c from public.wallet_lots where payment_id = p1 and status = 'refunded';
  r := array_append(r, case when (res->>'ok')::boolean and c = 2 then 'PASS' else 'FAIL' end
                      || ' S1 finalize: platba refunded, obě sady refunded (' || c || ')');

  -- ===========================================================================
  -- S2: částečně spotřebované dobití (300 → 310, spotřeba 150)
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (u2, 310, 'stripe', 'completed', 'cs_test_rb_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into p2;
  res := public.wallet_debit_fefo(u2, 150, 'test_consume', null, '{}'::jsonb, false);
  select remaining_amount into n from public.wallet_lots where payment_id = p2 and source = 'payment_paid';
  select remaining_amount into n2 from public.wallet_lots where payment_id = p2 and source = 'payment_bonus';
  r := array_append(r, case when n = 150 and n2 = 10 then 'PASS' else 'FAIL' end
                      || ' S2 FEFO čerpá nejdřív placenou sadu (dříve připsaná): placená ' || n || ', bonus ' || n2);

  res := public.prepare_stripe_refund(p2);
  r := array_append(r, case when (res->>'ok')::boolean and (res->>'refund_amount_czk')::numeric = 150
                              and (res->>'refund_amount_haler')::bigint = 15000
                              and (res->>'refund_paid_mio')::numeric = 150 and (res->>'refund_bonus_mio')::numeric = 10
                              and not (res->>'full_refund')::boolean
                         then 'PASS' else 'FAIL' end || ' S2 částečná refundace 150 Kč, bonus 10 zrušen: ' || res::text);
  select balance_coins into n from public.wallets where user_id = u2;
  r := array_append(r, case when n = 0 then 'PASS' else 'FAIL' end || ' S2 zůstatek 0 (spotřebovaných 150 se nevrací): ' || n);

  -- ===========================================================================
  -- S7 opakované volání stejné refundace (idempotence)
  -- ===========================================================================
  res2 := public.prepare_stripe_refund(p2);
  select count(*) into c from public.wallet_transactions where reference_id = p2 and type = 'refund_debit';
  select balance_coins into n from public.wallets where user_id = u2;
  r := array_append(r, case when (res2->>'ok')::boolean and (res2->>'already_prepared')::boolean
                              and (res2->>'refund_amount_czk')::numeric = 150 and c = 1 and n = 0
                         then 'PASS' else 'FAIL' end
                      || ' S7 druhé prepare: already_prepared, stejná částka, 1 refund_debit, žádný další odečet');

  -- ===========================================================================
  -- S5 Stripe refund failure → obnova přesně toho, co tato refundace odečetla
  -- ===========================================================================
  perform public.record_stripe_refund_status(p2, 're_rb_' || p2, 'failed');
  res := public.reverse_failed_stripe_refund(p2, 'failed');
  select remaining_amount into n from public.wallet_lots where payment_id = p2 and source = 'payment_paid';
  select remaining_amount into n2 from public.wallet_lots where payment_id = p2 and source = 'payment_bonus';
  r := array_append(r, case when (res->>'ok')::boolean and (res->>'restored')::numeric = 160 and n = 150 and n2 = 10
                         then 'PASS' else 'FAIL' end
                      || ' S5 reverze vrátí 150 + 10 do původních sad: ' || res::text);
  select balance_coins into n from public.wallets where user_id = u2;
  r := array_append(r, case when n = 160 then 'PASS' else 'FAIL' end || ' S5 zůstatek zpět 160: ' || n);
  select count(*) into c from public.payments where id = p2 and status = 'completed' and refund_amount_czk is null;
  r := array_append(r, case when c = 1 then 'PASS' else 'FAIL' end || ' S5 platba zpět completed, refund částky vynulované');
  res := public.reverse_failed_stripe_refund(p2, 'failed');
  select balance_coins into n from public.wallets where user_id = u2;
  r := array_append(r, case when (res->>'already_reversed')::boolean and n = 160 then 'PASS' else 'FAIL' end
                      || ' S5 opakovaná reverze nic nepřičte: ' || n);
  res := public.prepare_stripe_refund(p2);
  r := array_append(r, case when res->>'code' = 'refund_failed_needs_manual_review' then 'PASS' else 'FAIL' end
                      || ' S5 po selhání se refundace automaticky neopakuje: ' || coalesce(res->>'code', 'ok'));

  -- ===========================================================================
  -- S3 plně spotřebované dobití
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (u3, 310, 'stripe', 'completed', 'cs_test_rb_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into p3;
  perform public.wallet_debit_fefo(u3, 305, 'test_consume', null, '{}'::jsonb, false);
  res := public.prepare_stripe_refund(p3);
  select balance_coins into n from public.wallets where user_id = u3;
  select count(*) into c from public.payments where id = p3 and status = 'completed';
  r := array_append(r, case when res->>'code' = 'nothing_to_refund' and n = 5 and c = 1 then 'PASS' else 'FAIL' end
                      || ' S3 plně spotřebovaná placená sada → nothing_to_refund, zbytek bonusu 5 nedotčen: ' || n);

  -- ===========================================================================
  -- S6 + S8 + S10: dvě dobití téhož uživatele, FEFO přes více sad,
  -- refundace nikdy nesáhne na cizí sadu
  -- ===========================================================================
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (u4, 310, 'stripe', 'completed', 'cs_test_rb_' || gen_random_uuid(), 300, 300, 10, 'czk', false)
  returning id into p5a;
  perform pg_sleep(0.01);
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (u4, 525, 'stripe', 'completed', 'cs_test_rb_' || gen_random_uuid(), 500, 500, 25, 'czk', false)
  returning id into p5b;

  res := public.wallet_debit_fefo(u4, 400, 'test_consume', null, '{}'::jsonb, false);
  select string_agg(l.source || '@' || (case when l.payment_id = p5a then 'A' else 'B' end) || '=' || l.remaining_amount, ', ' order by l.credited_at)
  into info
  from public.wallet_lots l where l.user_id = u4;
  r := array_append(r, 'INFO S8 sady po čerpání 400: ' || info);
  select remaining_amount into n from public.wallet_lots where payment_id = p5b and source = 'payment_paid';
  select remaining_amount into n2 from public.wallet_lots where payment_id = p5a and source = 'payment_bonus';
  r := array_append(r, case when n = 410 and n2 = 0 then 'PASS' else 'FAIL' end
                      || ' S8 FEFO 400: A placená 300 → A bonus 10 → B placená 90 (B placená zbývá ' || n || ')');

  res := public.prepare_stripe_refund(p5a);
  r := array_append(r, case when res->>'code' = 'nothing_to_refund' then 'PASS' else 'FAIL' end
                      || ' S6 dobití A plně vyčerpané → nothing_to_refund (neodečte z B)');

  res := public.prepare_stripe_refund(p5b);
  r := array_append(r, case when (res->>'ok')::boolean and (res->>'refund_amount_czk')::numeric = 410
                              and (res->>'refund_paid_mio')::numeric = 410 and (res->>'refund_bonus_mio')::numeric = 25
                         then 'PASS' else 'FAIL' end || ' S6 dobití B: 410 Kč, bonus 25 zrušen: ' || res::text);
  select count(*) into c from public.wallet_lot_movements m join public.wallet_lots l on l.id = m.lot_id
  where m.reference_id = p5b and m.movement_type in ('refund_debit', 'bonus_cancel') and l.payment_id is distinct from p5b;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end
                      || ' S10 refundace B nemá žádný pohyb mimo sady platby B: ' || c);
  select count(*) into c from public.wallet_lot_movements m join public.wallet_lots l on l.id = m.lot_id
  where l.payment_id = p5a and m.movement_type in ('refund_debit', 'bonus_cancel');
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' S10 sady platby A refundací B nedotčeny');

  -- ===========================================================================
  -- S9 + S8b: expirace jedné sady neovlivní jinou; FEFO podle expires_at
  -- ===========================================================================
  l1 := (public.wallet_credit_lot(u5, 100, 'partner_code', null, 'TESTCODE1')->>'lot_id')::uuid;
  l2 := (public.wallet_credit_lot(u5, 100, 'partner_code', null, 'TESTCODE2')->>'lot_id')::uuid;
  l3 := (public.wallet_credit_lot(u5, 100, 'partner_code', null, 'TESTCODE3')->>'lot_id')::uuid;
  -- l3 (připsaná poslední) má nejbližší expiraci → FEFO ji čerpá první.
  update public.wallet_lots set expires_at = now() + interval '10 days' where id = l3;
  perform public.wallet_debit_fefo(u5, 50, 'test_consume', null, '{}'::jsonb, false);
  select remaining_amount into n from public.wallet_lots where id = l3;
  select remaining_amount into n2 from public.wallet_lots where id = l1;
  r := array_append(r, case when n = 50 and n2 = 100 then 'PASS' else 'FAIL' end
                      || ' S8b FEFO bere nejbližší expiraci (l3 ' || n || ', l1 ' || n2 || ')');

  -- l1 expiruje, l2 a l3 zůstávají
  update public.wallet_lots set expires_at = now() - interval '1 minute' where id = l1;
  n := public.wallet_expire_due_lots(u5);
  select count(*) into c from public.wallet_lots where id = l1 and status = 'expired' and remaining_amount = 0;
  r := array_append(r, case when n = 100 and c = 1 then 'PASS' else 'FAIL' end || ' S9 expirace odepíše jen l1: ' || n);
  select remaining_amount into n from public.wallet_lots where id = l2;
  select remaining_amount into n2 from public.wallet_lots where id = l3;
  r := array_append(r, case when n = 100 and n2 = 50 then 'PASS' else 'FAIL' end || ' S9 l2 a l3 nedotčeny: ' || n || '/' || n2);
  select balance_coins into n from public.wallets where user_id = u5;
  select count(*) into c from public.wallet_transactions where user_id = u5 and type = 'mio_expiry' and amount = -100;
  r := array_append(r, case when n = 150 and c = 1 then 'PASS' else 'FAIL' end || ' S9 zůstatek 150 + záznam mio_expiry: ' || n);

  -- Expirovaná placená sada se refundací nevrací
  insert into public.payments (user_id, amount, method, status, stripe_session_id,
                               paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (u5, 50, 'stripe', 'completed', 'cs_test_rb_' || gen_random_uuid(), 50, 50, 0, 'czk', false)
  returning id into p6;
  select count(*) into c from public.wallet_lots where payment_id = p6;
  r := array_append(r, case when c = 1 then 'PASS' else 'FAIL' end || ' S4b balíček 50 Kč bez bonusu = jen placená sada');
  update public.wallet_lots set expires_at = now() - interval '1 minute' where payment_id = p6;
  res := public.prepare_stripe_refund(p6);
  r := array_append(r, case when res->>'code' = 'nothing_to_refund' then 'PASS' else 'FAIL' end
                      || ' S9b expirovaná placená sada → nothing_to_refund');

  -- ===========================================================================
  -- Nedostatek MIO a legacy platba
  -- ===========================================================================
  begin
    perform public.wallet_debit_fefo(u5, 100000, 'test_consume', null, '{}'::jsonb, false);
    r := array_append(r, 'FAIL X1 nedostatek MIO neodmítnut');
  exception when others then
    r := array_append(r, case when sqlerrm = 'insufficient_miocoins' then 'PASS' else 'FAIL' end || ' X1 nedostatek MIO → insufficient_miocoins (' || sqlerrm || ')');
  end;

  insert into public.payments (user_id, amount, method, status, stripe_session_id)
  values (u5, 40, 'stripe', 'completed', 'cs_test_rb_legacy_' || gen_random_uuid())
  returning id into p4;
  select count(*) into c from public.wallet_lots where payment_id = p4 and source = 'payment_legacy';
  res := public.prepare_stripe_refund(p4);
  r := array_append(r, case when c = 1 and res->>'code' = 'legacy_payment_not_supported' then 'PASS' else 'FAIL' end
                      || ' X2 platba bez Kč: sada payment_legacy, refundace odmítnuta bez odečtu');

  -- ===========================================================================
  -- Přímá změna zůstatku mimo centrální funkce → synchronizační trigger
  -- ===========================================================================
  select balance_coins into n from public.wallets where user_id = u5;
  update public.wallets set balance_coins = balance_coins + 25 where user_id = u5;
  update public.wallets set balance_coins = balance_coins - 30 where user_id = u5;
  select count(*) into c from public.wallet_lots where user_id = u5 and source = 'direct_balance_change';
  select count(*) into procedure_dummy from public.wallet_lot_movements m join public.wallet_lots l on l.id = m.lot_id
  where l.user_id = u5 and m.movement_type = 'direct_debit';
  r := array_append(r, case when c = 1 and procedure_dummy >= 1 then 'PASS' else 'FAIL' end
                      || ' X3 přímé +25 vytvoří sadu, přímé −30 čerpá FEFO');

  -- ===========================================================================
  -- Konzistence: součet neexpirovaných sad = zůstatek (všichni testovací i celý staging)
  -- ===========================================================================
  select count(*) into c from public.wallet_lot_consistency_issues() i where i.user_id in (u1, u2, u3, u4, u5);
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' K1 testovací uživatelé konzistentní: ' || c);
  select count(*) into c from public.wallet_lot_consistency_issues();
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' K2 celý staging konzistentní: ' || c);

  -- Pohyby jsou neměnné
  begin
    update public.wallet_lot_movements set amount = amount where user_id = u1;
    r := array_append(r, 'FAIL K3 pohyb šel změnit');
  exception when others then
    r := array_append(r, 'PASS K3 wallet_lot_movements jsou neměnné');
  end;

  select count(*) into fails from unnest(r) x where x like 'FAIL%';
  raise exception 'RESULTS: % fail(s) / % checks%', fails, array_length(r, 1), E'\n' || array_to_string(r, E'\n');
end $$;
