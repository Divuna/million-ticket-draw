-- ROLLBACK Fáze 5 (migrace 20260925100000_phase5_player_referral_rewards.sql)
-- Vrací funkce PŘESNĚ do produkční podoby zachycené read-only z xkzhjldrojjlrkezorey
-- (2026-09-23T20:38:19.415Z) před nasazením Fáze 5. Spouštět jen po rozhodnutí Pavla.
--
-- Co zůstane: již připsané referral MIO v sadách doporučujících (legitimní MIO,
-- neodebírají se), nové sloupce referral_rewards, rozšířené CHECK seznamy sad
-- a pohybů, index (payment_id, reward_type) a index jednoho bonusu na doporučeného.
-- Po rollbacku se nové odměny opět jen evidují a nepřipisují (stav před Fází 5).

begin;

-- 1) Stará funkce vkládá s ON CONFLICT (payment_id) → potřebuje unikátní index
--    jen na payment_id. Řádky bonusu 15 MIO sdílejí payment_id s 5% odměnou,
--    proto se u nich payment_id vynuluje (vazba zůstává v payment_stripe_session_id).
update public.referral_rewards set payment_id = null where reward_type = 'first_topup_bonus' and payment_id is not null;
create unique index if not exists uq_referral_rewards_payment on public.referral_rewards using btree (payment_id);

-- 2) Původní definice funkcí (5).

-- create_referral_reward_from_payment()   md5 095738c5aca6895eb9ce568971cb539e   ACL: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.create_referral_reward_from_payment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_referrer uuid;
  v_rate numeric := 0.05;
  v_reward numeric;
  v_min_topup numeric := COALESCE(
    current_setting('app.referral.min_topup_mc', true)::numeric,
    0
  );
BEGIN
  -- only completed payments
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- minimum topup check (SAFE)
  IF NEW.amount < v_min_topup THEN
    RETURN NEW;
  END IF;

  -- find referrer
  SELECT referrer_user_id
  INTO v_referrer
  FROM referrals
  WHERE referred_user_id = NEW.user_id
    AND status = 'active';

  IF v_referrer IS NULL THEN
    RETURN NEW;
  END IF;

  -- calculate reward
  v_reward := ROUND(NEW.amount * v_rate, 2);

  INSERT INTO referral_rewards (
    referrer_user_id,
    referred_user_id,
    payment_id,
    payment_stripe_session_id,
    paid_amount_mc,
    commission_rate,
    reward_mc,
    status,
    created_at
  )
  VALUES (
    v_referrer,
    NEW.user_id,
    NEW.id,
    NEW.stripe_session_id,
    NEW.amount,
    v_rate,
    v_reward,
    'earned',
    now()
  )
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- reverse_referral_reward_on_payment_status_change()   md5 a0290dd0d94e0bee44fff95e3151f8a1   ACL: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_referral_reward_on_payment_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_reward_id uuid;
  v_referrer uuid;
  v_reward numeric;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed' THEN
    -- Reverse if reward exists and not reversed yet
    SELECT rr.id, rr.referrer_user_id, rr.reward_mc
    INTO v_reward_id, v_referrer, v_reward
    FROM public.referral_rewards rr
    WHERE rr.payment_id = NEW.id
      AND rr.status = 'earned'
    LIMIT 1;

    IF v_reward_id IS NOT NULL THEN
      UPDATE public.referral_rewards
      SET status = 'reversed',
          reversed_at = now(),
          reverse_reason = 'payment_status_changed:' || COALESCE(NEW.status, 'null')
      WHERE id = v_reward_id;

      -- Attempt to debit wallet (safe dynamic): credit negative amount.
      -- Pojmenované argumenty jsou nutné: poziční volání je mezi overloady
      -- `(uuid, numeric)` a `(uuid, numeric, text DEFAULT ...)` nejednoznačné.
      PERFORM public.try_credit_wallet_mc(p_user_id => v_referrer, p_amount_mc => (0 - v_reward));
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- admin_update_referral_reward(p_reward_id uuid, p_new_status text)   md5 181d569463c1141b46047d5ddad9f0ac   ACL: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.admin_update_referral_reward(p_reward_id uuid, p_new_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
BEGIN
  -- Check caller is admin or superadmin
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Validate status
  IF p_new_status NOT IN ('earned', 'reversed', 'blocked') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  UPDATE public.referral_rewards
  SET status = p_new_status
  WHERE id = p_reward_id;
END;
$function$;

-- prepare_stripe_refund(p_payment_id uuid)   md5 33067f3b870b769b07f96615cfca5081   ACL: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.prepare_stripe_refund(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payment     public.payments%rowtype;
  v_wallet_id   uuid;
  v_balance     numeric;
  v_new_balance numeric;
  v_already     boolean := false;
  v_paid_lot    public.wallet_lots%rowtype;
  v_bonus_lot   public.wallet_lots%rowtype;
  v_paid_rem    numeric := 0;
  v_bonus_rem   numeric := 0;
  v_total       numeric;
  v_refund_czk  numeric(12,2);
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Chybí ID platby.');
  end if;

  -- Zámek platby pro celou dobu transakce.
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Platba nebyla nalezena.');
  end if;

  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', false, 'code', 'already_refunded', 'message', 'Platba už byla refundována.');
  end if;

  -- Neúspěšná Stripe refundace se NIKDY nespouští znovu automaticky.
  if v_payment.stripe_refund_id is not null
     and v_payment.stripe_refund_status in ('failed', 'canceled') then
    return jsonb_build_object(
      'ok', false,
      'code', 'refund_failed_needs_manual_review',
      'message', 'Předchozí refundace u Stripe selhala. Je nutná ruční kontrola, automatické opakování není povolené.'
    );
  end if;

  if v_payment.status not in ('completed', 'refund_pending') then
    return jsonb_build_object('ok', false, 'code', 'invalid_status', 'message', 'Refundovat lze jen dokončenou platbu.');
  end if;

  if v_payment.stripe_session_id is null then
    return jsonb_build_object('ok', false, 'code', 'missing_stripe_session',
      'message', 'K této platbě chybí Stripe session, refundaci nelze provést.');
  end if;

  if v_payment.amount is null or v_payment.amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount', 'message', 'Platba nemá kladnou částku.');
  end if;

  -- Už jednou připraveno? Pak se nic nesmí odečíst podruhé.
  select true into v_already
  from public.wallet_transactions
  where reference_id = p_payment_id
    and type = 'refund_debit'
  limit 1;
  v_already := coalesce(v_already, false);

  if not v_already then
    -- Refundace v2 potřebuje skutečně zaplacené Kč a placenou sadu této platby.
    if v_payment.paid_amount_czk is null or v_payment.base_mio is null then
      return jsonb_build_object(
        'ok', false,
        'code', 'legacy_payment_not_supported',
        'message', 'Platba nemá evidovanou zaplacenou částku v Kč ani vlastní sadu MIO (starší testovací záznam). Automatická refundace není možná.'
      );
    end if;

    -- Pořadí zámků: platba → peněženka → sady (stejně jako čerpání).
    select id, balance_coins into v_wallet_id, v_balance
    from public.wallets
    where user_id = v_payment.user_id
    for update;

    if v_wallet_id is null then
      return jsonb_build_object('ok', false, 'code', 'wallet_not_found', 'message', 'Peněženka nebyla nalezena.');
    end if;

    -- Expirovaná placená MIO se refundací nevrací.
    perform public._wallet_lots_expire_user(v_payment.user_id, v_wallet_id);

    select * into v_paid_lot from public.wallet_lots
    where payment_id = p_payment_id and source = 'payment_paid'
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'legacy_payment_not_supported',
        'message', 'K platbě neexistuje placená sada MIO. Automatická refundace není možná.');
    end if;

    select * into v_bonus_lot from public.wallet_lots
    where payment_id = p_payment_id and source = 'payment_bonus'
    for update;

    if v_paid_lot.status = 'active' and v_paid_lot.expires_at > now() then
      v_paid_rem := v_paid_lot.remaining_amount;
    end if;
    if v_bonus_lot.id is not null and v_bonus_lot.status = 'active' and v_bonus_lot.expires_at > now() then
      v_bonus_rem := v_bonus_lot.remaining_amount;
    end if;

    if v_paid_rem <= 0 then
      return jsonb_build_object(
        'ok', false,
        'code', 'nothing_to_refund',
        'message', 'Placená MIO z této platby už byla vyčerpána nebo expirovala. Není co refundovat.'
      );
    end if;

    -- Kč poměrně ke skutečně zaplacené částce, nikdy víc než bylo zaplaceno.
    v_refund_czk := least(v_payment.paid_amount_czk,
                          round(v_payment.paid_amount_czk * v_paid_rem / v_payment.base_mio, 2));
    v_total := v_paid_rem + v_bonus_rem;

    select balance_coins into v_balance from public.wallets where id = v_wallet_id;
    if v_balance < v_total then
      return jsonb_build_object('ok', false, 'code', 'wallet_lot_inconsistent',
        'message', 'Zůstatek peněženky neodpovídá sadám MIO. Refundace se nespustí, je nutná kontrola.');
    end if;

    -- Odečet VÝHRADNĚ ze sad této platby.
    update public.wallet_lots
    set remaining_amount = 0, status = 'refund_pending', updated_at = now()
    where id = v_paid_lot.id;
    insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id, metadata)
    values (v_paid_lot.id, v_payment.user_id, 'refund_debit', -v_paid_rem, 'stripe_refund', p_payment_id,
            jsonb_build_object('refund_amount_czk', v_refund_czk));

    if v_bonus_rem > 0 then
      update public.wallet_lots
      set remaining_amount = 0, status = 'refund_pending', updated_at = now()
      where id = v_bonus_lot.id;
      insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id)
      values (v_bonus_lot.id, v_payment.user_id, 'bonus_cancel', -v_bonus_rem, 'stripe_refund', p_payment_id);
    end if;

    perform public._wallet_set_managed(true);
    update public.wallets
    set balance_coins = balance_coins - v_total
    where id = v_wallet_id
    returning balance_coins into v_new_balance;
    perform public._wallet_set_managed(false);

    insert into public.wallet_transactions (
      user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
    ) values (
      v_payment.user_id,
      v_wallet_id,
      -v_total,
      v_new_balance,
      'refund_debit',
      'prepare_stripe_refund',
      p_payment_id,
      jsonb_build_object(
        'payment_status_before', v_payment.status,
        'debited',               v_total,
        'refund_paid_mio',       v_paid_rem,
        'refund_bonus_mio',      v_bonus_rem,
        'refund_amount_czk',     v_refund_czk,
        'paid_lot_id',           v_paid_lot.id,
        'bonus_lot_id',          v_bonus_lot.id
      )
    );

    update public.payments
    set refund_amount_czk = v_refund_czk,
        refund_paid_mio   = v_paid_rem,
        refund_bonus_mio  = v_bonus_rem
    where id = p_payment_id;

    v_payment.refund_amount_czk := v_refund_czk;
    v_payment.refund_paid_mio   := v_paid_rem;
    v_payment.refund_bonus_mio  := v_bonus_rem;
  end if;

  -- Stav se posouvá jen z `completed`; opakování na `refund_pending` nechává beze změny.
  if v_payment.status = 'completed' then
    update public.payments
    set status = 'refund_pending',
        refund_updated_at = now()
    where id = p_payment_id;
  end if;

  return jsonb_build_object(
    'ok',                 true,
    'already_prepared',   v_already,
    'payment_id',         p_payment_id,
    'user_id',            v_payment.user_id,
    'amount',             v_payment.amount,
    'refund_amount_czk',  v_payment.refund_amount_czk,
    'refund_amount_haler', case when v_payment.refund_amount_czk is null then null
                                else round(v_payment.refund_amount_czk * 100)::bigint end,
    'full_refund',        v_payment.refund_amount_czk is not null
                          and v_payment.refund_amount_czk = v_payment.paid_amount_czk,
    'refund_paid_mio',    v_payment.refund_paid_mio,
    'refund_bonus_mio',   v_payment.refund_bonus_mio,
    'stripe_session_id',  v_payment.stripe_session_id,
    'stripe_refund_id',   v_payment.stripe_refund_id,
    'status',             'refund_pending'
  );
end;
$function$;

-- reverse_failed_stripe_refund(p_payment_id uuid, p_stripe_status text)   md5 1136b11d591f02ba73a6c5aaac86cb4f   ACL: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_failed_stripe_refund(p_payment_id uuid, p_stripe_status text DEFAULT 'failed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payment         public.payments%rowtype;
  v_debited         numeric;
  v_wallet_id       uuid;
  v_new_balance     numeric;
  v_already         boolean := false;
  v_reward_id       uuid;
  v_referrer        uuid;
  v_reward_mc       numeric;
  v_credit_ok       boolean;
  v_reward_restored boolean := false;
  v_restored        numeric := 0;
  v_has_lot_moves   boolean := false;
  r                 record;
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  -- Přijímají se výhradně skutečné neúspěšné Stripe stavy.
  if p_stripe_status is null or p_stripe_status not in ('failed', 'canceled') then
    return jsonb_build_object('ok', false, 'code', 'invalid_stripe_status', 'stripe_refund_status', p_stripe_status);
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Dokončenou refundaci nelze vzít zpět.
  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', false, 'code', 'already_refunded');
  end if;

  -- Opakovaná událost po už provedené reverzi: žádná další změna peněženky
  -- ani doporučovací odměny. Platba ale nesmí zůstat viset v `refund_pending`.
  select true into v_already
  from public.wallet_transactions
  where reference_id = p_payment_id
    and type = 'refund_reversal'
  limit 1;

  if coalesce(v_already, false) then
    if v_payment.status <> 'completed' then
      update public.payments
      set status               = 'completed',
          stripe_refund_status = case
                                   when v_payment.stripe_refund_status in ('failed', 'canceled')
                                     then v_payment.stripe_refund_status
                                   else p_stripe_status
                                 end,
          refund_updated_at    = now()
      where id = p_payment_id
      returning status, stripe_refund_status into v_payment.status, v_payment.stripe_refund_status;
    end if;

    return jsonb_build_object(
      'ok',                 true,
      'already_reversed',   true,
      'status',             v_payment.status,
      'stripe_refund_status', v_payment.stripe_refund_status
    );
  end if;

  -- První reverze smí proběhnout jen z rozpracované refundace.
  if v_payment.status <> 'refund_pending' then
    return jsonb_build_object('ok', false, 'code', 'invalid_status', 'status', v_payment.status);
  end if;

  -- Vrací se jen to, co bylo skutečně odečteno.
  select abs(amount) into v_debited
  from public.wallet_transactions
  where reference_id = p_payment_id
    and type = 'refund_debit'
  limit 1;

  if v_debited is null then
    return jsonb_build_object('ok', false, 'code', 'nothing_to_reverse');
  end if;

  select id into v_wallet_id
  from public.wallets
  where user_id = v_payment.user_id
  for update;

  -- 1a) Refundace v2: vrátit přesně pohyby této refundace do jejich sad.
  for r in
    select m.lot_id, m.amount
    from public.wallet_lot_movements m
    where m.reference_id = p_payment_id
      and m.movement_type in ('refund_debit', 'bonus_cancel')
  loop
    v_has_lot_moves := true;
    update public.wallet_lots
    set remaining_amount = remaining_amount + abs(r.amount),
        status = 'active',
        updated_at = now()
    where id = r.lot_id;

    insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id, metadata)
    values (r.lot_id, v_payment.user_id, 'refund_reversal', abs(r.amount), 'stripe_refund_failed', p_payment_id,
            jsonb_build_object('stripe_refund_status', p_stripe_status));

    v_restored := v_restored + abs(r.amount);
  end loop;

  if v_has_lot_moves then
    if v_restored <> v_debited then
      raise exception 'Reverze refundace % nesouhlasí: sady % vs. odečet %', p_payment_id, v_restored, v_debited;
    end if;

    perform public._wallet_set_managed(true);
    update public.wallets
    set balance_coins = balance_coins + v_restored
    where id = v_wallet_id
    returning balance_coins into v_new_balance;
    perform public._wallet_set_managed(false);
  else
    -- 1b) Refundace připravená starou verzí (bez sad): vrátit odečtenou částku
    --     jako novou sadu.
    v_new_balance := (public.wallet_credit_lot(
      v_payment.user_id, v_debited, 'refund_restore_legacy', p_payment_id, null, null, null, 0, 0, null,
      'stripe_refund_failed', jsonb_build_object('stripe_refund_status', p_stripe_status))->>'new_balance')::numeric;
    select id into v_wallet_id from public.wallets where user_id = v_payment.user_id;
    v_restored := v_debited;
  end if;

  insert into public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) values (
    v_payment.user_id,
    v_wallet_id,
    v_restored,
    v_new_balance,
    'refund_reversal',
    'reverse_failed_stripe_refund',
    p_payment_id,
    jsonb_build_object(
      'stripe_refund_status', p_stripe_status,
      'restored',             v_restored
    )
  );

  -- 2) Obnova doporučovací odměny, kterou při `completed -> refund_pending`
  --    stornoval trigger `trg_payments_referral_reverse` (beze změny).
  select id, referrer_user_id, reward_mc
  into v_reward_id, v_referrer, v_reward_mc
  from public.referral_rewards
  where payment_id = p_payment_id
    and status = 'reversed'
    and reverse_reason = 'payment_status_changed:refund_pending'
  limit 1
  for update;

  if v_reward_id is not null then
    update public.referral_rewards
    set status         = 'earned',
        reversed_at    = null,
        reverse_reason = null
    where id = v_reward_id;

    select public.try_credit_wallet_mc(p_user_id => v_referrer, p_amount_mc => v_reward_mc)
    into v_credit_ok;

    if coalesce(v_credit_ok, false) is not true then
      raise exception
        'Nepodařilo se vrátit doporučovací odměnu pro platbu %; reverze refundace byla zrušena.',
        p_payment_id;
    end if;

    v_reward_restored := true;
  end if;

  -- 3) Platba se vrací mezi dokončené — peníze zákazníkovi vráceny NEBYLY.
  update public.payments
  set status               = 'completed',
      stripe_refund_status = p_stripe_status,
      refund_updated_at    = now(),
      refund_amount_czk    = null,
      refund_paid_mio      = null,
      refund_bonus_mio     = null
  where id = p_payment_id;

  return jsonb_build_object(
    'ok',                       true,
    'already_reversed',         false,
    'restored',                 v_restored,
    'referral_reward_restored', v_reward_restored,
    'status',                   'completed',
    'stripe_refund_status',     p_stripe_status
  );
end;
$function$;

-- 3) Nové objekty Fáze 5 (po obnově výše už je nic nevolá).
drop function if exists public.referral_award_for_payment(uuid);
drop function if exists public._referral_credit_reward(uuid);
drop function if exists public._referral_reverse_for_payment(uuid, numeric, text);
drop function if exists public._referral_restore_for_payment(uuid);

commit;

-- Frontend: vrátit popisky v ReferralSection/Admin* a miocoinHistory na stav z main před Fází 5
-- (nejsou nutné — neznámý stav/typ se jen zobrazí obecně).
