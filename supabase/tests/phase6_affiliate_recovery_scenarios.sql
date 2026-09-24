-- Scénářové testy Fáze 6 — recovery, umoření z budoucích affiliate provizí a souběh
-- refundace × výplatní doklad (snapshot). STAGING ONLY.
--
-- Pravidlo (Pavel): provize, kterou už kvůli výplatnímu dokladu / dávce / výplatě
-- nelze zpětně snížit, se při refundaci nemění; vznikne recovery téhož affiliate,
-- kterou automaticky umoří jeho budoucí provize (nejstarší první). Záporná provize
-- nevzniká, jiný affiliate se nedotkne.
--
-- Běží v jedné transakci a na konci VŽDY vyhodí výjimku `RESULTS: …`
-- (vynucený ROLLBACK). Pomocné funkce jsou v pg_temp a zmizí se sezením.
--
-- Spuštění (staging workdir, nikdy ne produkce):
--   supabase db query --linked --workdir <staging-workdir> -f supabase/tests/phase6_affiliate_recovery_scenarios.sql

create function pg_temp.p6r_aff(p_vat boolean default false) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.affiliate_accounts (name, email, ref_code, modes, status, commission_rate_customer,
                                         commission_rate_company, is_vat_payer, vat_id)
  values ('P6R ' || gen_random_uuid(), 'p6r-' || gen_random_uuid() || '@onemil.test',
          'P6R' || floor(random() * 1e9)::text, array['influencer', 'sales_rep'], 'approved', 5, 5,
          p_vat, case when p_vat then 'CZ12345678' end)
  returning id into v;
  return v;
end $$;

create function pg_temp.p6r_cust(p_aff uuid) returns uuid language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'p6r-' || v || '@onemil.test', '', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}');
  insert into public.users (id, email) values (v, 'p6r-' || v || '@onemil.test') on conflict (id) do nothing;
  insert into public.affiliate_customer_refs (affiliate_id, user_id, source) values (p_aff, v, 'test');
  return v;
end $$;

create function pg_temp.p6r_pay(p_user uuid, p_czk numeric, p_month date) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.payments (user_id, amount, method, status, stripe_session_id, paid_amount_czk,
                               base_mio, bonus_mio, currency, stripe_livemode, created_at)
  values (p_user, p_czk, 'stripe', 'completed', 'cs_test_p6r_' || gen_random_uuid(), p_czk,
          p_czk, 0, 'czk', false, p_month + interval '3 days')
  returning id into v;
  return v;
end $$;

create function pg_temp.p6r_calc(p_month date) returns void language plpgsql as $$
begin perform public.calculate_affiliate_commissions_for_month(p_month); end $$;

create function pg_temp.p6r_c(p_aff uuid, p_month date) returns public.affiliate_commissions language sql as $$
  select * from public.affiliate_commissions
  where affiliate_id = p_aff and period_month = p_month and commission_type = 'customer_payments';
$$;

create function pg_temp.p6r_lock(p_aff uuid, p_month date, p_status text) returns void language sql as $$
  update public.affiliate_commissions
  set status = p_status, paid_at = case when p_status = 'paid' then now() else paid_at end
  where affiliate_id = p_aff and period_month = p_month and commission_type = 'customer_payments';
$$;

-- Refundace platby (0 = refundace selhala / vrácena → completed).
create function pg_temp.p6r_refund(p_pay uuid, p_czk numeric) returns void language sql as $$
  update public.payments
  set status = case when p_czk > 0 then 'refunded' else 'completed' end,
      refund_amount_czk = case when p_czk > 0 then p_czk else null end
  where id = p_pay;
$$;

create function pg_temp.p6r_rec(p_pay uuid) returns numeric language sql as $$
  select amount_czk from public.affiliate_commission_recoveries where payment_id = p_pay;
$$;

create function pg_temp.p6r_state(p_aff uuid) returns jsonb language sql as $$
  select public._affiliate_recovery_reallocate(p_aff);
$$;

create function pg_temp.p6r_alloc(p_commission uuid, p_recovery_payment uuid, p_kind text) returns numeric language sql as $$
  select coalesce(sum(al.amount_czk), 0)
  from public.affiliate_commission_recovery_allocations al
  join public.affiliate_commission_recoveries r on r.id = al.recovery_id
  where al.commission_id = p_commission and al.released_at is null and al.kind = p_kind
    and (p_recovery_payment is null or r.payment_id = p_recovery_payment);
$$;

do $$
declare
  r   text[] := '{}'::text[];
  fails int := 0;
  m0 date := date_trunc('month', now())::date;
  m1 date := (date_trunc('month', now()) + interval '1 month')::date;
  m2 date := (date_trunc('month', now()) + interval '2 months')::date;
  m3 date := (date_trunc('month', now()) + interval '3 months')::date;
  a uuid; b uuid; cu uuid; cu2 uuid; p uuid; p2 uuid; q uuid;
  cm public.affiliate_commissions;
  cm2 public.affiliate_commissions;
  st jsonb; res jsonb;
  n numeric; n2 numeric; c int; c2 int;
  partner uuid; inv uuid;
begin
  perform set_config('request.jwt.claims', '', true);

  -- ===========================================================================
  -- V1–V6: stav paid, kumulativní částečné refundace, úplná, opakovaná
  -- ===========================================================================
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid');
  perform pg_temp.p6r_refund(p, 100);
  cm := pg_temp.p6r_c(a, m0);
  r := array_append(r, case when pg_temp.p6r_rec(p) = 5.00 and cm.amount_base_czk = 15.00 and cm.status = 'paid'
                              and (pg_temp.p6r_state(a)->>'open_recovery_czk')::numeric = 5.00
                         then 'PASS' else 'FAIL' end
                      || ' V1 paid 15 Kč → refundace 100/300 → recovery 5,00, provize 15,00 beze změny: ' || pg_temp.p6r_rec(p));
  select count(*) into c from public.audit_logs where event = 'affiliate_commission_recovery_recorded' and metadata->>'payment_id' = p::text;
  res := public.affiliate_commission_sync_payment(p);
  perform pg_temp.p6r_refund(p, 100);
  select count(*) into c2 from public.audit_logs where event = 'affiliate_commission_recovery_recorded' and metadata->>'payment_id' = p::text;
  r := array_append(r, case when res->>'status' = 'unchanged_locked' and c = 1 and c2 = 1 and pg_temp.p6r_rec(p) = 5.00
                              and (select count(*) from public.affiliate_commission_recoveries where payment_id = p) = 1
                         then 'PASS' else 'FAIL' end
                      || ' V6 opakovaný refund / sync → bez duplicity (' || (res->>'status') || ', audit ' || c2 || ')');
  perform pg_temp.p6r_refund(p, 150);
  r := array_append(r, case when pg_temp.p6r_rec(p) = 7.50 then 'PASS' else 'FAIL' end
                      || ' V4 další refundace 50 → celkem 150 Kč → recovery 7,50: ' || pg_temp.p6r_rec(p));
  perform pg_temp.p6r_refund(p, 300);
  r := array_append(r, case when pg_temp.p6r_rec(p) = 15.00 and (pg_temp.p6r_c(a, m0)).amount_base_czk = 15.00 then 'PASS' else 'FAIL' end
                      || ' V5 úplná refundace → recovery 15,00, vyplacená provize beze změny: ' || pg_temp.p6r_rec(p));

  -- V4b zaokrouhlení kumulativně (100 Kč → 5 Kč; 33,33 / 66,66 / 100)
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 100, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid');
  perform pg_temp.p6r_refund(p, 33.33); n := pg_temp.p6r_rec(p);
  perform pg_temp.p6r_refund(p, 66.66); n2 := pg_temp.p6r_rec(p);
  perform pg_temp.p6r_refund(p, 100);
  r := array_append(r, case when n = 1.67 and n2 = 3.33 and pg_temp.p6r_rec(p) = 5.00 then 'PASS' else 'FAIL' end
                      || ' V4b kumulativní zaokrouhlení 33,33/66,66/100 → 1,67 / 3,33 / 5,00 (bez zbytku)');

  -- V2 ready_to_pay, V3 in_payment_batch
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'ready_to_pay');
  perform pg_temp.p6r_refund(p, 100); cm := pg_temp.p6r_c(a, m0);
  r := array_append(r, case when pg_temp.p6r_rec(p) = 5.00 and cm.amount_base_czk = 15.00 and cm.status = 'ready_to_pay' then 'PASS' else 'FAIL' end
                      || ' V2 ready_to_pay → recovery 5,00, provize i stav beze změny');
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'in_payment_batch');
  perform pg_temp.p6r_refund(p, 100); cm := pg_temp.p6r_c(a, m0);
  r := array_append(r, case when pg_temp.p6r_rec(p) = 5.00 and cm.amount_base_czk = 15.00 and cm.status = 'in_payment_batch' then 'PASS' else 'FAIL' end
                      || ' V3 in_payment_batch → recovery 5,00, provize i stav beze změny');

  -- ===========================================================================
  -- V7 Pavlův příklad: recovery 25 → provize 15 → recovery 10 → provize 20 → výplata 10
  --     + firemní provize téhož affiliate se nezapočítává
  -- ===========================================================================
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a);
  insert into public.partners (name, logo_url, website_url, referred_by_affiliate_id)
  values ('P6R Firma', 'https://example.com/logo.png', 'https://example.com', a) returning id into partner;
  insert into public.partner_invoices (partner_id, period_start, period_end, status, paid_at, amount_ex_vat, type)
  values (partner, (m0 - interval '1 month')::date, (m0 - interval '1 day')::date, 'paid', now(), 1234.00, 'coin') returning id into inv;
  p := pg_temp.p6r_pay(cu, 500, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid');
  perform pg_temp.p6r_refund(p, 500);
  r := array_append(r, case when pg_temp.p6r_rec(p) = 25.00 then 'PASS' else 'FAIL' end
                      || ' V7a provize 25 vyplacena, úplná refundace → recovery 25,00');
  perform pg_temp.p6r_pay(cu, 300, m1); perform pg_temp.p6r_calc(m1); cm := pg_temp.p6r_c(a, m1);
  st := pg_temp.p6r_state(a);
  r := array_append(r, case when cm.gross_amount_base_czk = 15 and cm.recovery_offset_czk = 15 and cm.amount_base_czk = 0
                              and (st->>'open_recovery_czk')::numeric = 10
                         then 'PASS' else 'FAIL' end
                      || ' V7b nová provize 15 → k výplatě 0, recovery 10 (' || cm.amount_base_czk || ' / ' || (st->>'open_recovery_czk') || ')');
  select count(*) into c from public.audit_logs
  where event = 'affiliate_commission_recovery_applied' and metadata->>'commission_id' = cm.id::text
    and (metadata->>'gross_amount_base_czk')::numeric = 15 and (metadata->>'recovery_offset_czk')::numeric = 15
    and (metadata->>'net_amount_base_czk')::numeric = 0 and (metadata->>'remaining_recovery_czk')::numeric = 10;
  r := array_append(r, case when c = 1 then 'PASS' else 'FAIL' end
                      || ' V7c audit: hrubá 15, umořeno 15, k výplatě 0, zbývá 10');
  perform pg_temp.p6r_lock(a, m1, 'paid');
  perform pg_temp.p6r_pay(cu, 400, m2); perform pg_temp.p6r_calc(m2); cm := pg_temp.p6r_c(a, m2);
  st := pg_temp.p6r_state(a);
  r := array_append(r, case when cm.gross_amount_base_czk = 20 and cm.recovery_offset_czk = 10 and cm.amount_base_czk = 10
                              and (st->>'open_recovery_czk')::numeric = 0
                         then 'PASS' else 'FAIL' end
                      || ' V7d další provize 20 → umořeno 10, k výplatě 10, recovery 0');
  select count(*), max(amount_base_czk), max(recovery_offset_czk) into c, n, n2
  from public.affiliate_commissions where source_invoice_id = inv;
  r := array_append(r, case when c = 1 and n = 61.70 and n2 = 0 then 'PASS' else 'FAIL' end
                      || ' V7e firemní provize téhož affiliate 61,70 beze změny (bez umoření)');

  -- ===========================================================================
  -- V8 budoucí provize přesně rovna recovery
  -- ===========================================================================
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid'); perform pg_temp.p6r_refund(p, 300);
  perform pg_temp.p6r_pay(cu, 300, m1); perform pg_temp.p6r_calc(m1); cm := pg_temp.p6r_c(a, m1);
  perform pg_temp.p6r_lock(a, m1, 'paid');
  perform pg_temp.p6r_pay(cu, 100, m2); perform pg_temp.p6r_calc(m2); cm2 := pg_temp.p6r_c(a, m2);
  r := array_append(r, case when cm.amount_base_czk = 0 and cm.recovery_offset_czk = 15
                              and cm2.amount_base_czk = 5 and cm2.recovery_offset_czk = 0
                              and (pg_temp.p6r_state(a)->>'open_recovery_czk')::numeric = 0
                         then 'PASS' else 'FAIL' end
                      || ' V8 recovery 15 = provize 15 → k výplatě 0, recovery 0; další provize 5 celá k výplatě');

  -- ===========================================================================
  -- V9/V10 několik recovery postupně (nejstarší první) + několik budoucích provizí
  -- ===========================================================================
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a);
  p := pg_temp.p6r_pay(cu, 300, m0); p2 := pg_temp.p6r_pay(cu, 200, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid');
  perform pg_temp.p6r_refund(p, 100);          -- Ra = 5 (starší)
  perform pg_temp.p6r_refund(p2, 200);         -- Rb = 10
  perform pg_temp.p6r_pay(cu, 200, m1); perform pg_temp.p6r_calc(m1); cm := pg_temp.p6r_c(a, m1);
  r := array_append(r, case when pg_temp.p6r_rec(p) = 5 and pg_temp.p6r_rec(p2) = 10
                              and cm.gross_amount_base_czk = 10 and cm.amount_base_czk = 0
                              and pg_temp.p6r_alloc(cm.id, p, 'offset') = 5 and pg_temp.p6r_alloc(cm.id, p2, 'offset') = 5
                         then 'PASS' else 'FAIL' end
                      || ' V9 dvě recovery 5 + 10, provize 10 → nejdřív celá starší 5, pak 5 z novější');
  perform pg_temp.p6r_lock(a, m1, 'paid');
  perform pg_temp.p6r_pay(cu, 300, m2); perform pg_temp.p6r_calc(m2); cm := pg_temp.p6r_c(a, m2);
  perform pg_temp.p6r_lock(a, m2, 'paid');
  perform pg_temp.p6r_pay(cu, 100, m3); perform pg_temp.p6r_calc(m3); cm2 := pg_temp.p6r_c(a, m3);
  r := array_append(r, case when cm.amount_base_czk = 10 and pg_temp.p6r_alloc(cm.id, p2, 'offset') = 5
                              and cm2.amount_base_czk = 5 and cm2.recovery_offset_czk = 0
                              and (pg_temp.p6r_state(a)->>'open_recovery_czk')::numeric = 0
                         then 'PASS' else 'FAIL' end
                      || ' V10 několik budoucích provizí: 15 → umořeno 5, k výplatě 10; další 5 celá k výplatě');
  -- V15 opakovaný přepočet měsíce s umořením → bez duplicit
  select count(*) into c from public.affiliate_commission_recovery_allocations where affiliate_id = a and released_at is null;
  perform pg_temp.p6r_calc(m3); perform pg_temp.p6r_calc(m3);
  select count(*) into c2 from public.affiliate_commission_recovery_allocations where affiliate_id = a and released_at is null;
  r := array_append(r, case when c = c2 and (pg_temp.p6r_c(a, m3)).amount_base_czk = 5 then 'PASS' else 'FAIL' end
                      || ' V15 opakovaný přepočet → stejné aktivní alokace (' || c || '/' || c2 || ')');

  -- ===========================================================================
  -- V11 oddělení dvou affiliate
  -- ===========================================================================
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  b := pg_temp.p6r_aff(); cu2 := pg_temp.p6r_cust(b);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid'); perform pg_temp.p6r_refund(p, 300);
  perform pg_temp.p6r_pay(cu2, 300, m1); perform pg_temp.p6r_calc(m1); cm := pg_temp.p6r_c(b, m1);
  r := array_append(r, case when cm.amount_base_czk = 15 and cm.recovery_offset_czk = 0
                              and (pg_temp.p6r_state(a)->>'open_recovery_czk')::numeric = 15
                              and not exists (select 1 from public.affiliate_commission_recovery_allocations where affiliate_id = b)
                         then 'PASS' else 'FAIL' end
                      || ' V11 recovery affiliate A se nikdy nesáhne na provizi affiliate B');

  -- ===========================================================================
  -- V12 selhaná Stripe refundace (skutečná cesta) → přesná obnova, jiná recovery beze změny
  -- ===========================================================================
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a);
  p := pg_temp.p6r_pay(cu, 300, m0); p2 := pg_temp.p6r_pay(cu, 200, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid');
  perform pg_temp.p6r_refund(p2, 100);                         -- jiná recovery 5
  res := public.prepare_stripe_refund(p);                      -- nevyčerpaných 300 Kč
  n := pg_temp.p6r_rec(p);
  perform public.record_stripe_refund_status(p, 're_p6r_' || p, 'failed');
  perform public.reverse_failed_stripe_refund(p, 'failed');
  r := array_append(r, case when n = 15 and pg_temp.p6r_rec(p) = 0 and pg_temp.p6r_rec(p2) = 5
                              and (pg_temp.p6r_state(a)->>'open_recovery_czk')::numeric = 5
                              and (pg_temp.p6r_state(a)->>'pending_credit_czk')::numeric = 0
                         then 'PASS' else 'FAIL' end
                      || ' V12 selhání Stripe: recovery 15 → 0, jiná recovery 5 beze změny (' || n || ')');

  -- ===========================================================================
  -- V13 selhání, když je recovery jen předběžně umořená (provize ještě měnitelná)
  -- ===========================================================================
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid'); perform pg_temp.p6r_refund(p, 300);
  perform pg_temp.p6r_pay(cu, 200, m1); perform pg_temp.p6r_calc(m1); n := (pg_temp.p6r_c(a, m1)).amount_base_czk;
  perform pg_temp.p6r_refund(p, 0);
  cm := pg_temp.p6r_c(a, m1);
  r := array_append(r, case when n = 0 and cm.amount_base_czk = 10 and cm.recovery_offset_czk = 0 and cm.recovery_credit_czk = 0
                              and pg_temp.p6r_alloc(cm.id, null, 'offset') = 0
                              and exists (select 1 from public.affiliate_commission_recovery_allocations
                                          where commission_id = cm.id and released_at is not null)
                         then 'PASS' else 'FAIL' end
                      || ' V13 selhání při předběžném umoření: provize 0 → přesně zpět 10, historie alokace zachována');

  -- ===========================================================================
  -- V14 selhání až po KONEČNÉM umoření → přesně vrácený nárok v další provizi
  -- ===========================================================================
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid'); perform pg_temp.p6r_refund(p, 300);
  perform pg_temp.p6r_pay(cu, 200, m1); perform pg_temp.p6r_calc(m1); perform pg_temp.p6r_lock(a, m1, 'paid');
  n := (pg_temp.p6r_c(a, m1)).amount_base_czk;                  -- 0, umořeno 10 (konečně)
  perform pg_temp.p6r_refund(p, 0);                             -- refundace selhala
  st := pg_temp.p6r_state(a);
  n2 := (pg_temp.p6r_c(a, m1)).amount_base_czk;                  -- vyplacená provize se nemění
  perform pg_temp.p6r_pay(cu, 100, m2); perform pg_temp.p6r_calc(m2); cm := pg_temp.p6r_c(a, m2);
  r := array_append(r, case when n = 0 and n2 = 0 and (st->>'pending_credit_czk')::numeric = 10
                              and cm.gross_amount_base_czk = 5 and cm.recovery_credit_czk = 10 and cm.amount_base_czk = 15
                              and pg_temp.p6r_alloc(cm.id, p, 'release') = 10
                         then 'PASS' else 'FAIL' end
                      || ' V14 selhání po umoření 10: nárok 10 vrácen do další provize 5 → k výplatě 15');
  perform pg_temp.p6r_lock(a, m2, 'paid');
  st := pg_temp.p6r_state(a);
  r := array_append(r, case when (st->>'pending_credit_czk')::numeric = 0 and (st->>'open_recovery_czk')::numeric = 0
                         then 'PASS' else 'FAIL' end
                      || ' V14b po vyplacení nároku: nic otevřeného, nic dlužného');

  -- ===========================================================================
  -- V16 plátce DPH: umoření v základu, DPH ze zbytku
  -- ===========================================================================
  a := pg_temp.p6r_aff(true); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'paid'); perform pg_temp.p6r_refund(p, 100);
  perform pg_temp.p6r_pay(cu, 300, m1); perform pg_temp.p6r_calc(m1); cm := pg_temp.p6r_c(a, m1);
  r := array_append(r, case when cm.amount_base_czk = 10 and cm.amount_total_czk = 12.10 and cm.recovery_offset_czk = 5 then 'PASS' else 'FAIL' end
                      || ' V16 plátce DPH: hrubá 15 − umořeno 5 = 10 + 21 % = 12,10');

  -- ===========================================================================
  -- D: souběh REFUNDACE × VYSTAVENÍ VÝPLATNÍHO DOKLADU (obě pořadí, deterministicky)
  -- ===========================================================================
  -- D1 doklad vyhraje: prepare (snapshot 15) → refundace 100 → finalize
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'approved');
  cm := pg_temp.p6r_c(a, m0);
  res := public.prepare_affiliate_payout_document(cm.id);
  perform pg_temp.p6r_refund(p, 100);
  cm2 := pg_temp.p6r_c(a, m0);
  st := public.finalize_affiliate_payout_document(cm.id, res->>'document_number', 'test/' || cm.id || '.pdf', repeat('a', 64), 's', 'b', 's', 'b');
  select amount_base_czk, amount_total_czk into n, n2 from public.affiliate_payout_documents where commission_id = cm.id;
  r := array_append(r, case when (res->>'amount_base_czk')::numeric = 15 and cm2.amount_base_czk = 15 and cm2.status = 'approved'
                              and pg_temp.p6r_rec(p) = 5 and (st->>'success')::boolean
                              and n = 15 and n2 = 15 and (pg_temp.p6r_c(a, m0)).amount_base_czk = 15
                              and (pg_temp.p6r_c(a, m0)).status = 'ready_to_pay'
                         then 'PASS' else 'FAIL' end
                      || ' D1 doklad vyhrál: snapshot 15 → refundace 100 = recovery 5, provize 15, doklad 15, ready_to_pay (' || coalesce(st->>'status', '?') || ')');

  -- D2 refundace vyhraje: refundace 100 → prepare (10) → finalize
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'approved');
  cm := pg_temp.p6r_c(a, m0);
  perform pg_temp.p6r_refund(p, 100);
  res := public.prepare_affiliate_payout_document(cm.id);
  st := public.finalize_affiliate_payout_document(cm.id, res->>'document_number', 'test/' || cm.id || '.pdf', repeat('b', 64), 's', 'b', 's', 'b');
  select amount_base_czk into n from public.affiliate_payout_documents where commission_id = cm.id;
  r := array_append(r, case when (res->>'amount_base_czk')::numeric = 10 and n = 10 and (pg_temp.p6r_c(a, m0)).amount_base_czk = 10
                              and pg_temp.p6r_rec(p) is null and (st->>'success')::boolean
                         then 'PASS' else 'FAIL' end
                      || ' D2 refundace vyhrála: provize 10 → doklad 10, recovery žádná');

  -- D3 opakované prepare vrátí týž snapshot; D4 částku uzamčené provize nejde změnit;
  -- D5 finalize s jiným číslem dokladu nic nezapíše
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'approved');
  cm := pg_temp.p6r_c(a, m0);
  res := public.prepare_affiliate_payout_document(cm.id);
  st := public.prepare_affiliate_payout_document(cm.id);
  r := array_append(r, case when res->>'document_number' = st->>'document_number' and (st->>'snapshot_reused')::boolean
                              and res->>'amount_total_czk' = st->>'amount_total_czk'
                              and (select count(*) from public.affiliate_payout_document_snapshots where commission_id = cm.id) = 1
                         then 'PASS' else 'FAIL' end
                      || ' D3 opakované prepare → stejné číslo dokladu i částka, jeden snapshot');
  c := 0;
  begin
    update public.affiliate_commissions set amount_base_czk = 1, amount_total_czk = 1 where id = cm.id;
  exception when others then
    c := case when sqlerrm = 'affiliate_commission_amount_frozen' then 1 else 0 end;
  end;
  c2 := 0;
  begin
    update public.affiliate_payout_document_snapshots set amount_total_czk = 1 where commission_id = cm.id;
  exception when others then
    c2 := case when sqlerrm = 'affiliate_payout_snapshot_immutable' then 1 else 0 end;
  end;
  r := array_append(r, case when c = 1 and c2 = 1 and (pg_temp.p6r_c(a, m0)).amount_base_czk = 15 then 'PASS' else 'FAIL' end
                      || ' D4 uzamčená provize i snapshot jsou neměnné (DB pojistka)');
  st := public.finalize_affiliate_payout_document(cm.id, 'APD-2099-999999', 'test/x.pdf', repeat('c', 64), 's', 'b', 's', 'b');
  r := array_append(r, case when st->>'status' = 'payout_snapshot_mismatch'
                              and not exists (select 1 from public.affiliate_payout_documents where commission_id = cm.id)
                              and (pg_temp.p6r_c(a, m0)).status = 'approved'
                         then 'PASS' else 'FAIL' end
                      || ' D5 finalize s jiným číslem než snapshot → nic nevznikne (' || (st->>'status') || ')');

  -- D6 selhání refundace, doklad vyhrál: snapshot 15 → refundace (recovery 5) → selhání → recovery 0 → doklad 15
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'approved');
  cm := pg_temp.p6r_c(a, m0);
  res := public.prepare_affiliate_payout_document(cm.id);
  perform pg_temp.p6r_refund(p, 100); n := pg_temp.p6r_rec(p);
  perform pg_temp.p6r_refund(p, 0);
  st := public.finalize_affiliate_payout_document(cm.id, res->>'document_number', 'test/' || cm.id || '.pdf', repeat('d', 64), 's', 'b', 's', 'b');
  r := array_append(r, case when n = 5 and pg_temp.p6r_rec(p) = 0 and (st->>'success')::boolean
                              and (select amount_base_czk from public.affiliate_payout_documents where commission_id = cm.id) = 15
                              and (pg_temp.p6r_state(a)->>'open_recovery_czk')::numeric = 0
                              and (pg_temp.p6r_state(a)->>'pending_credit_czk')::numeric = 0
                         then 'PASS' else 'FAIL' end
                      || ' D6 selhání po snapshotu: recovery 5 → 0, doklad 15, nic otevřeného');

  -- D7 selhání refundace, refundace vyhrála: provize 10 → snapshot 10 → selhání → nárok 5, doklad 10
  a := pg_temp.p6r_aff(); cu := pg_temp.p6r_cust(a); p := pg_temp.p6r_pay(cu, 300, m0);
  perform pg_temp.p6r_calc(m0); perform pg_temp.p6r_lock(a, m0, 'approved');
  cm := pg_temp.p6r_c(a, m0);
  perform pg_temp.p6r_refund(p, 100);
  res := public.prepare_affiliate_payout_document(cm.id);
  perform pg_temp.p6r_refund(p, 0);
  st := public.finalize_affiliate_payout_document(cm.id, res->>'document_number', 'test/' || cm.id || '.pdf', repeat('e', 64), 's', 'b', 's', 'b');
  r := array_append(r, case when (res->>'amount_base_czk')::numeric = 10 and pg_temp.p6r_rec(p) = -5
                              and (select amount_base_czk from public.affiliate_payout_documents where commission_id = cm.id) = 10
                              and (pg_temp.p6r_c(a, m0)).amount_base_czk = 10
                              and (pg_temp.p6r_state(a)->>'pending_credit_czk')::numeric = 5
                         then 'PASS' else 'FAIL' end
                      || ' D7 selhání po snížení a snapshotu: doklad 10 = provize 10, affiliate nárok 5 do další provize');

  -- D8 každý doklad = jeho snapshot = částka provize
  select count(*) into c
  from public.affiliate_payout_documents d
  join public.affiliate_payout_document_snapshots s on s.commission_id = d.commission_id
  join public.affiliate_commissions c0 on c0.id = d.commission_id
  where d.amount_base_czk <> s.amount_base_czk or d.amount_total_czk <> s.amount_total_czk
     or d.vat_rate <> s.vat_rate or d.document_number <> s.document_number
     or c0.amount_base_czk <> d.amount_base_czk or c0.amount_total_czk <> d.amount_total_czk;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' D8 doklad = snapshot = provize u všech dokladů (rozdílů: ' || c || ')');

  -- ===========================================================================
  -- K konzistence
  -- ===========================================================================
  select count(*) into c from public.affiliate_commissions where amount_base_czk < 0 or amount_total_czk < 0;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' K1 žádná záporná provize: ' || c);
  select count(*) into c from public.affiliate_commissions
  where gross_amount_base_czk is not null
    and amount_base_czk <> gross_amount_base_czk - recovery_offset_czk + recovery_credit_czk;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' K2 k výplatě = hrubá − umořeno + vrácený nárok u všech provizí');
  select count(*) into c from public.affiliate_commission_recovery_allocations al
  join public.affiliate_commissions c0 on c0.id = al.commission_id
  where al.released_at is null and al.affiliate_id <> c0.affiliate_id;
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' K3 žádná alokace přes cizího affiliate');
  select count(*) into c from public.wallet_lot_consistency_issues();
  r := array_append(r, case when c = 0 then 'PASS' else 'FAIL' end || ' K4 MIO sady konzistentní: ' || c);
  r := array_append(r, case when not has_function_privilege('anon', 'public._affiliate_recovery_reallocate(uuid)', 'execute')
                              and not has_function_privilege('authenticated', 'public._affiliate_recovery_reallocate(uuid)', 'execute')
                              and not has_table_privilege('authenticated', 'public.affiliate_commission_recoveries', 'insert')
                              and not has_table_privilege('authenticated', 'public.affiliate_commission_recovery_allocations', 'update')
                         then 'PASS' else 'FAIL' end || ' K5 recovery funkce a tabulky bez klientského zápisu');

  select count(*) into fails from unnest(r) x where x like 'FAIL%';
  raise exception 'RESULTS: % fail(s) / % checks%', fails, array_length(r, 1), E'\n' || array_to_string(r, E'\n');
end $$;
