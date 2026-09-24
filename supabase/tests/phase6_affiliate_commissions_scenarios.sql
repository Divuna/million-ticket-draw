-- Scénářové testy Fáze 6 — affiliate provize v Kč. STAGING ONLY.
--
-- Běží v jedné transakci a na konci VŽDY vyhodí výjimku `RESULTS: …`
-- (vynucený ROLLBACK). Výsledek je v textu výjimky.
--
-- Spuštění (staging workdir, nikdy ne produkce):
--   supabase db query --linked --workdir <staging-workdir> -f supabase/tests/phase6_affiliate_commissions_scenarios.sql

do $$
declare
  r      text[] := '{}'::text[];
  fails  int := 0;
  v_month date := date_trunc('month', now())::date;
  u      uuid[] := '{}'::uuid[];
  a      uuid[] := '{}'::uuid[];
  tmp    uuid;
  i      int;
  -- zákazníci
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid; c8 uuid; c9 uuid; c10 uuid; cx uuid; cref uuid;
  -- affiliate účty
  a1 uuid; a2 uuid; a3 uuid; a4 uuid; a5 uuid; a6 uuid; a7 uuid; a8 uuid; a9 uuid; a10 uuid; av uuid;
  p1 uuid; p2 uuid; p4 uuid; p5 uuid; p6 uuid; p7 uuid; p8 uuid; p9 uuid; p10 uuid; pv uuid; px uuid; pr uuid;
  com uuid; partner uuid; inv uuid; inv2 uuid;
  res jsonb;
  n numeric; n2 numeric; c int; cc int;
begin
  perform set_config('request.jwt.claims', '', true);

  -- Uživatelé (zákazníci + referrer pro křížový test)
  for i in 1..13 loop
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                            email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
            'phase6-' || i || '-' || floor(random()*1e9)::text || '@onemil.test', '',
            now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}')
    returning id into tmp;
    insert into public.users (id, email) values (tmp, 'phase6-' || tmp || '@onemil.test') on conflict (id) do nothing;
    u := array_append(u, tmp);
  end loop;
  c1 := u[1]; c2 := u[2]; c3 := u[3]; c4 := u[4]; c5 := u[5]; c6 := u[6]; c7 := u[7];
  c8 := u[8]; c9 := u[9]; c10 := u[10]; cx := u[11]; cref := u[12];

  -- Affiliate účty (sazba 5 %, schválené, influencer); av je plátce DPH
  for i in 1..11 loop
    insert into public.affiliate_accounts (name, email, ref_code, modes, status, commission_rate_customer,
                                           commission_rate_company, is_vat_payer, vat_id)
    values ('Phase6 A' || i, 'phase6-aff-' || i || '-' || floor(random()*1e9)::text || '@onemil.test',
            'P6X' || i || floor(random()*1e6)::text, array['influencer','sales_rep'], 'approved', 5, 5,
            i = 11, case when i = 11 then 'CZ12345678' end)
    returning id into tmp;
    a := array_append(a, tmp);
  end loop;
  a1 := a[1]; a2 := a[2]; a3 := a[3]; a4 := a[4]; a5 := a[5]; a6 := a[6]; a7 := a[7];
  a8 := a[8]; a9 := a[9]; a10 := a[10]; av := a[11];

  insert into public.affiliate_customer_refs (affiliate_id, user_id, source) values
    (a1, c1, 'test'), (a2, c2, 'test'), (a3, c3, 'test'), (a4, c4, 'test'), (a5, c5, 'test'),
    (a6, c6, 'test'), (a7, c7, 'test'), (a8, c8, 'test'), (a9, c9, 'test'), (a10, c10, 'test'),
    (av, u[13], 'test');

  -- Platby (tvar stripe-webhook)
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c1, 310, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 10, 'czk', false) returning id into p1;
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c2, 150, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 150, 150, 0, 'czk', false) returning id into p2;
  -- c3: jen neplacené / historické / partnerské transakce
  insert into public.payments (user_id, amount, method, status) values (c3, 50, 'bonus', 'completed');
  insert into public.payments (user_id, amount, method, status, stripe_session_id)
  values (c3, 300, 'stripe', 'completed', 'cs_test_p6_legacy_' || gen_random_uuid());
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c3, 100, 'partner', 'completed', 'cs_test_p6_' || gen_random_uuid(), 100, 100, 0, 'czk', false);
  insert into public.payments (user_id, amount, method, status, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c3, 100, 'stripe', 'completed', 100, 100, 0, 'czk', false);
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c4, 100, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 100, 100, 0, 'czk', false) returning id into p4;
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c5, 310, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 10, 'czk', false) returning id into p5;
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c6, 310, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 10, 'czk', false) returning id into p6;
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c7, 310, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 10, 'czk', false) returning id into p7;
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c8, 310, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 10, 'czk', false) returning id into p8;
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c9, 310, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 10, 'czk', false) returning id into p9;
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c10, 310, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 10, 'czk', false) returning id into p10;
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (u[13], 310, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 10, 'czk', false) returning id into pv;
  -- zákazník bez affiliate atribuce
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (cx, 310, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 10, 'czk', false) returning id into px;

  res := public.calculate_affiliate_commissions_for_month(v_month);

  -- ===========================================================================
  -- C1–C5 zákaznická větev
  -- ===========================================================================
  select amount_base_czk, amount_total_czk into n, n2 from public.affiliate_commissions
  where affiliate_id = a1 and commission_type = 'customer_payments' and period_month = v_month;
  r := array_append(r, case when n = 15.00 and n2 = 15.00 then 'PASS' else 'FAIL' end
                      || ' C1 platba 300 Kč / 310 MIO → provize 15,00 Kč (ne 15,50): ' || n);
  select amount_base_czk into n from public.affiliate_commissions
  where affiliate_id = a2 and commission_type = 'customer_payments' and period_month = v_month;
  r := array_append(r, case when n = 7.50 then 'PASS' else 'FAIL' end || ' C2 platba 150 Kč → 7,50 Kč: ' || n);
  select count(*) into c from public.affiliate_commission_payments where payment_id = p1 and paid_amount_czk = 300 and commission_rate = 5;
  r := array_append(r, case when c = 1 then 'PASS' else 'FAIL' end || ' C3 bonus MIO nemění základ (vazba 300 Kč, ne 310)');
  select count(*) into c from public.affiliate_commissions where affiliate_id = a3;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end
                      || ' C4 bonus / historická bez Kč / partner / bez Stripe session → provize 0');
  select count(*) into c from public.affiliate_commission_payments where payment_id = px;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' C5 zákazník bez affiliate atribuce → nic');
  select amount_base_czk, amount_total_czk, vat_rate into n, n2, c from public.affiliate_commissions
  where affiliate_id = av and commission_type = 'customer_payments' and period_month = v_month;
  r := array_append(r, case when n = 15.00 and n2 = 18.15 and c = 21 then 'PASS' else 'FAIL' end
                      || ' C6 plátce DPH: základ 15,00 + 21 % = 18,15 (' || n || ' / ' || n2 || ')');

  -- C7 opakované spuštění výpočtu → bez duplicit
  select count(*), coalesce(sum(amount_base_czk), 0) into c, n from public.affiliate_commissions
  where period_month = v_month and commission_type = 'customer_payments' and affiliate_id = any(a);
  select count(*) into cc from public.affiliate_commission_payments where affiliate_id = any(a);
  res := public.calculate_affiliate_commissions_for_month(v_month);
  res := public.calculate_affiliate_commissions_for_month(v_month);
  select count(*), coalesce(sum(amount_base_czk), 0) into i, n2 from public.affiliate_commissions
  where period_month = v_month and commission_type = 'customer_payments' and affiliate_id = any(a);
  r := array_append(r, case when i = c and n2 = n
                              and (select count(*) from public.affiliate_commission_payments where affiliate_id = any(a)) = cc
                         then 'PASS' else 'FAIL' end
                      || ' C7 3× výpočet: stejné řádky (' || c || ') i součet (' || n || '), vazby bez duplicit');

  -- ===========================================================================
  -- R — refundace (provize ve stavu calculated)
  -- ===========================================================================
  -- R1 částečná refundace skutečnou cestou: c1 utratí 200 → refundace 100 Kč
  perform public.wallet_debit_fefo(c1, 200, 'test_consume', null, '{}'::jsonb, false);
  res := public.prepare_stripe_refund(p1);
  select amount_base_czk into n from public.affiliate_commissions where affiliate_id = a1 and period_month = v_month and commission_type = 'customer_payments';
  r := array_append(r, case when (res->>'refund_amount_czk')::numeric = 100 and n = 10.00 then 'PASS' else 'FAIL' end
                      || ' R1 refundace 100 z 300 Kč → čistá provize 10,00 Kč: ' || n);
  -- R2 opakovaný refund / finalize → žádné dvojí storno
  res := public.prepare_stripe_refund(p1);
  perform public.record_stripe_refund_status(p1, 're_p6_' || p1, 'succeeded');
  perform public.finalize_stripe_refund(p1);
  perform public.finalize_stripe_refund(p1);
  perform public.affiliate_commission_sync_payment(p1);
  select amount_base_czk into n from public.affiliate_commissions where affiliate_id = a1 and period_month = v_month and commission_type = 'customer_payments';
  select count(*) into c from public.audit_logs where event = 'affiliate_commission_adjusted' and metadata->>'payment_id' = p1::text;
  r := array_append(r, case when n = 10.00 and c = 1 then 'PASS' else 'FAIL' end
                      || ' R2 opakovaná refund událost / finalize / sync → stále 10,00, jedna úprava (' || c || ')');
  -- R2b opakovaný výpočet po refundaci drží čistou částku
  res := public.calculate_affiliate_commissions_for_month(v_month);
  select amount_base_czk into n from public.affiliate_commissions where affiliate_id = a1 and period_month = v_month and commission_type = 'customer_payments';
  r := array_append(r, case when n = 10.00 then 'PASS' else 'FAIL' end || ' R2b přepočet měsíce po refundaci: 10,00');

  -- R3 několik postupných částečných refundací (100 Kč → provize 5,00): 33,33 / 66,66 / 100
  update public.payments set status = 'refunded', refund_amount_czk = 33.33 where id = p4;
  select amount_base_czk into n from public.affiliate_commissions where affiliate_id = a4 and period_month = v_month and commission_type = 'customer_payments';
  r := array_append(r, case when n = 3.33 then 'PASS' else 'FAIL' end || ' R3a refundováno 33,33 z 100 → 3,33: ' || n);
  update public.payments set refund_amount_czk = 66.66 where id = p4;
  select amount_base_czk into n from public.affiliate_commissions where affiliate_id = a4 and period_month = v_month and commission_type = 'customer_payments';
  r := array_append(r, case when n = 1.67 then 'PASS' else 'FAIL' end || ' R3b kumulativně 66,66 → 1,67: ' || n);
  update public.payments set refund_amount_czk = 100 where id = p4;
  select amount_base_czk, amount_total_czk into n, n2 from public.affiliate_commissions where affiliate_id = a4 and period_month = v_month and commission_type = 'customer_payments';
  r := array_append(r, case when n = 0 and n2 = 0 then 'PASS' else 'FAIL' end || ' R3c celých 100 → 0,00 (bez zbytku zaokrouhlení): ' || n);

  -- R4 úplná refundace skutečnou cestou → 0
  res := public.prepare_stripe_refund(p5);
  perform public.record_stripe_refund_status(p5, 're_p6_' || p5, 'succeeded');
  perform public.finalize_stripe_refund(p5);
  select amount_base_czk into n from public.affiliate_commissions where affiliate_id = a5 and period_month = v_month and commission_type = 'customer_payments';
  r := array_append(r, case when n = 0 then 'PASS' else 'FAIL' end || ' R4 úplná refundace → čistá provize 0,00: ' || n);

  -- R5 neúspěšná Stripe refundace → provize obnovena
  perform public.wallet_debit_fefo(c6, 200, 'test_consume', null, '{}'::jsonb, false);
  perform public.prepare_stripe_refund(p6);
  select amount_base_czk into n from public.affiliate_commissions where affiliate_id = a6 and period_month = v_month and commission_type = 'customer_payments';
  perform public.record_stripe_refund_status(p6, 're_p6_' || p6, 'failed');
  perform public.reverse_failed_stripe_refund(p6, 'failed');
  select amount_base_czk into n2 from public.affiliate_commissions where affiliate_id = a6 and period_month = v_month and commission_type = 'customer_payments';
  r := array_append(r, case when n = 10.00 and n2 = 15.00 then 'PASS' else 'FAIL' end
                      || ' R5 selhání Stripe: 10,00 → obnoveno 15,00');

  -- ===========================================================================
  -- P — stav provize v payout workflow
  -- ===========================================================================
  -- P1 schválená, bez výplatního dokladu → úprava proběhne, stav zůstane approved
  update public.affiliate_commissions set status = 'approved'
  where affiliate_id = a7 and period_month = v_month and commission_type = 'customer_payments';
  perform public.wallet_debit_fefo(c7, 200, 'test_consume', null, '{}'::jsonb, false);
  perform public.prepare_stripe_refund(p7);
  select amount_base_czk, status into n, res from (select amount_base_czk, to_jsonb(status) status from public.affiliate_commissions
    where affiliate_id = a7 and period_month = v_month and commission_type = 'customer_payments') s;
  r := array_append(r, case when n = 10.00 and res #>> '{}' = 'approved' then 'PASS' else 'FAIL' end
                      || ' P1 approved bez dokladu: refundace 100 Kč → 10,00, stav approved');
  -- P1b úplná refundace schválené → 0; výplatní doklad pak nevznikne
  update public.payments set refund_amount_czk = 300 where id = p7;
  select id, amount_base_czk into com, n from public.affiliate_commissions where affiliate_id = a7 and period_month = v_month and commission_type = 'customer_payments';
  res := public.prepare_affiliate_payout_document(com);
  r := array_append(r, case when n = 0 and not (res->>'success')::boolean and res->>'status' = 'invalid_amount' then 'PASS' else 'FAIL' end
                      || ' P1b approved plně refundovaná → 0,00, výplatní doklad odmítnut (' || (res->>'status') || ')');

  -- P2 výplatní doklad vystaven (ready_to_pay) → částka beze změny, vznikne recovery (detail: phase6_affiliate_recovery_scenarios.sql)
  update public.affiliate_commissions set status = 'ready_to_pay'
  where affiliate_id = a8 and period_month = v_month and commission_type = 'customer_payments';
  perform public.wallet_debit_fefo(c8, 200, 'test_consume', null, '{}'::jsonb, false);
  perform public.prepare_stripe_refund(p8);
  select amount_base_czk into n from public.affiliate_commissions where affiliate_id = a8 and period_month = v_month and commission_type = 'customer_payments';
  select unapplied_refund_czk, refunded_czk into n2, i from public.affiliate_commission_payments where payment_id = p8;
  select count(*) into c from public.audit_logs where event = 'affiliate_commission_recovery_recorded' and metadata->>'payment_id' = p8::text;
  select amount_czk into n from public.affiliate_commission_recoveries where payment_id = p8;
  r := array_append(r, case when n = 5.00 and n2 = 100 and i = 0 and c = 1
                              and (select amount_base_czk from public.affiliate_commissions where affiliate_id = a8 and period_month = v_month and commission_type = 'customer_payments') = 15.00
                         then 'PASS' else 'FAIL' end
                      || ' P2 ready_to_pay: provize 15,00 beze změny, nezapočteno 100 Kč, recovery 5,00 + audit');
  -- P2b neúspěšná refundace vrátí i evidenci
  perform public.record_stripe_refund_status(p8, 're_p6_' || p8, 'failed');
  perform public.reverse_failed_stripe_refund(p8, 'failed');
  select unapplied_refund_czk into n2 from public.affiliate_commission_payments where payment_id = p8;
  select amount_czk into n from public.affiliate_commission_recoveries where payment_id = p8;
  r := array_append(r, case when n2 = 0 and n = 0 then 'PASS' else 'FAIL' end || ' P2b selhání Stripe: nezapočtená refundace i recovery zpět na 0');

  -- P3 vyplacená (paid) → nic se automaticky nemění
  update public.affiliate_commissions set status = 'paid', paid_at = now()
  where affiliate_id = a9 and period_month = v_month and commission_type = 'customer_payments';
  perform public.prepare_stripe_refund(p9);
  perform public.record_stripe_refund_status(p9, 're_p6_' || p9, 'succeeded');
  perform public.finalize_stripe_refund(p9);
  select amount_base_czk, amount_total_czk into n, n2 from public.affiliate_commissions where affiliate_id = a9 and period_month = v_month and commission_type = 'customer_payments';
  select unapplied_refund_czk into i from public.affiliate_commission_payments where payment_id = p9;
  select count(*) into c from public.affiliate_commissions where affiliate_id = a9 and status = 'paid';
  r := array_append(r, case when n = 15.00 and n2 = 15.00 and i = 300 and c = 1
                              and (select amount_czk from public.affiliate_commission_recoveries where payment_id = p9) = 15.00
                         then 'PASS' else 'FAIL' end
                      || ' P3 paid: provize 15,00 beze změny, stav paid, nezapočteno 300 Kč, recovery 15,00');
  -- P4 recalc nesahá na approved/ready/paid
  res := public.calculate_affiliate_commissions_for_month(v_month);
  select count(*) into c from public.affiliate_commissions
  where affiliate_id in (a7, a8, a9) and period_month = v_month
    and ((affiliate_id = a7 and status = 'approved' and amount_base_czk = 0)
      or (affiliate_id = a8 and status = 'ready_to_pay' and amount_base_czk = 15)
      or (affiliate_id = a9 and status = 'paid' and amount_base_czk = 15));
  r := array_append(r, case when c = 3 then 'PASS' else 'FAIL' end || ' P4 přepočet měsíce nemění approved / ready_to_pay / paid');

  -- ===========================================================================
  -- F — firemní větev (regrese)
  -- ===========================================================================
  insert into public.partners (name, logo_url, website_url, referred_by_affiliate_id)
  values ('Phase6 Firma', 'https://example.com/logo.png', 'https://example.com', a10) returning id into partner;
  insert into public.affiliate_company_refs (affiliate_id, partner_id) values (a10, partner);
  -- faktura za minulý měsíc, zaplacená letos v aktuálním měsíci (opožděně)
  insert into public.partner_invoices (partner_id, period_start, period_end, status, paid_at, amount_ex_vat, type)
  values (partner, (v_month - interval '2 months')::date, (v_month - interval '1 month' - interval '1 day')::date,
          'paid', now(), 1234.00, 'coin') returning id into inv;
  -- nezaplacená faktura → nic
  insert into public.partner_invoices (partner_id, period_start, period_end, status, amount_ex_vat, type)
  values (partner, (v_month - interval '1 month')::date, (v_month - interval '1 day')::date, 'issued', 999.00, 'coin') returning id into inv2;
  res := public.calculate_affiliate_commissions_for_month(v_month);
  res := public.calculate_affiliate_commissions_for_month(v_month);
  select count(*), max(amount_base_czk), max(amount_total_czk) into c, n, n2 from public.affiliate_commissions where source_invoice_id = inv;
  select count(*) into cc from public.affiliate_commissions where source_invoice_id = inv2;
  r := array_append(r, case when c = 1 and n = 61.70 and n2 = 61.70 and cc = 0 then 'PASS' else 'FAIL' end
                      || ' F1 firemní: 5 % z 1 234 Kč bez DPH = 61,70, opožděná úhrada zachycena, jedna provize, nezaplacená nic');
  select count(*) into c from public.affiliate_commission_payments l join public.affiliate_commissions c0 on c0.id = l.commission_id where c0.source_invoice_id = inv;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' F2 firemní provize nemá platební vazby (beze změny modelu)');

  -- ===========================================================================
  -- X — křížový případ: stejná platba → affiliate provize v Kč i odměna za doporučení v MIO
  -- ===========================================================================
  insert into public.referrals (referred_user_id, referrer_user_id, code_used, source, status)
  values (c10, cref, 'P6REF', 'test', 'active');
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk, base_mio, bonus_mio, currency, stripe_livemode)
  values (c10, 300, 'stripe', 'completed', 'cs_test_p6_' || gen_random_uuid(), 300, 300, 0, 'czk', false) returning id into pr;
  select count(*) into c from public.referral_rewards where payment_id = pr;
  update public.affiliate_commissions set status = 'calculated' where affiliate_id = a10 and period_month = v_month and commission_type = 'customer_payments';
  res := public.calculate_affiliate_commissions_for_month(v_month);
  select count(*) into cc from public.affiliate_commission_payments where payment_id = pr;
  r := array_append(r, case when c >= 1 and cc = 1 then 'INFO' else 'INFO' end
                      || ' X stejná platba 300 Kč: odměn za doporučení ' || c || ', affiliate vazeb ' || cc
                      || ' (oba systémy platí současně, žádná priorita — rozhodnutí Pavla)');

  -- ===========================================================================
  -- K — konzistence a bezpečnost
  -- ===========================================================================
  select count(*) into c from public.wallet_lot_consistency_issues();
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' K1 MIO sady konzistentní (Fáze 6 nesahá na peněženky): ' || c);
  select count(*) into c from public.affiliate_commission_payments l join public.affiliate_commissions c0 on c0.id = l.commission_id
  where c0.status in ('calculated') and c0.gross_amount_base_czk <> (
    select coalesce(round(sum((x.paid_amount_czk - x.refunded_czk) * x.commission_rate / 100.0), 2), 0)
    from public.affiliate_commission_payments x where x.commission_id = c0.id);
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' K2 každá calculated provize: hrubá částka = součet svých vazeb');
  select count(*) into c from (select payment_id from public.affiliate_commission_payments group by payment_id having count(*) > 1) d;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' K3 platba nejvýše v jedné provizi');
  r := array_append(r, case when not has_function_privilege('anon', 'public.affiliate_commission_sync_payment(uuid)', 'execute')
                              and not has_function_privilege('authenticated', 'public.affiliate_commission_sync_payment(uuid)', 'execute')
                              and not has_function_privilege('anon', 'public.calculate_affiliate_commissions_for_month(date)', 'execute')
                         then 'PASS' else 'FAIL' end || ' K4 finanční funkce bez anon; přepočet jen server');

  select count(*) into fails from unnest(r) x where x like 'FAIL%';
  raise exception 'RESULTS: % fail(s) / % checks%', fails, array_length(r, 1), E'\n' || array_to_string(r, E'\n');
end $$;
