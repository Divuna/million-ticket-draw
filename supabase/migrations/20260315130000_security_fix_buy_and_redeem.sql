-- =============================================================================
-- Security fixes: enforce auth.uid() in buy_ticket_atomic, buy_voucher_atomic,
-- and fix redeem_miocoin (remove invalid bonus_prizes.user_id reference).
-- Run manually in Supabase SQL Editor. Do not run via CLI.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) buy_ticket_atomic: require p_user_id = auth.uid()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buy_ticket_atomic(p_contest_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_ticket_price NUMERIC;
    v_ticket_count int;
    v_contest_status text;
    v_balance NUMERIC;
    v_last_ticket int;
    v_next_ticket int;
    v_bonus record;
    v_next_bonus_position int;
    v_result jsonb;
begin
    -- Security: caller may only act on their own behalf
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- Lock contest to prevent race conditions
    select ticket_price, ticket_count, status
    into v_ticket_price, v_ticket_count, v_contest_status
    from contests
    where id = p_contest_id
    for update;

    if v_ticket_price is null then
        return jsonb_build_object('success', false, 'error', 'Contest not found');
    end if;

    if v_contest_status != 'active' then
        return jsonb_build_object('success', false, 'error', 'Contest is closed');
    end if;

    -- Lock wallet
    select balance_coins
    into v_balance
    from wallets
    where user_id = p_user_id
    for update;

    if v_balance is null then
        return jsonb_build_object('success', false, 'error', 'Wallet not found');
    end if;

    RAISE LOG 'buy_ticket_atomic: user=%, contest=%, ticket_price=%, balance_before=%',
        p_user_id, p_contest_id, v_ticket_price, v_balance;

    if v_balance < v_ticket_price then
        return jsonb_build_object('success', false, 'error', 'Nedostatek miocoinů');
    end if;

    -- Get next ticket number safely
    select number
    into v_last_ticket
    from tickets
    where contest_id = p_contest_id
    order by number desc
    limit 1;

    v_next_ticket := coalesce(v_last_ticket, 0) + 1;

    if v_next_ticket > v_ticket_count then
        return jsonb_build_object('success', false, 'error', 'Contest full');
    end if;

    update wallets
    set balance_coins = v_balance - v_ticket_price
    where user_id = p_user_id;

    RAISE LOG 'buy_ticket_atomic: user=%, balance_after=%, deducted=%',
        p_user_id, (v_balance - v_ticket_price), v_ticket_price;

    insert into tickets (contest_id, user_id, number)
    values (p_contest_id, p_user_id, v_next_ticket);

    select ticket_position
    into v_next_bonus_position
    from bonus_prizes
    where contest_id = p_contest_id
      and ticket_position > v_next_ticket
      and status = 'pending'
    order by ticket_position asc
    limit 1;

    select *
    into v_bonus
    from bonus_prizes
    where contest_id = p_contest_id
      and ticket_position = v_next_ticket
      and status = 'pending'
    limit 1;

    if v_bonus.id is not null then
        insert into winners (contest_id, user_id, prize_id, type, notes)
        values (p_contest_id, p_user_id, v_bonus.id, 'bonus',
                'Bonusová výhra s tiketem #' || v_next_ticket);

        update bonus_prizes
        set status = 'won'
        where id = v_bonus.id;
    end if;

    if v_next_ticket = v_ticket_count then
        update contests
        set status = 'closed'
        where id = p_contest_id;

        insert into winners (contest_id, user_id, type, notes)
        values (p_contest_id, p_user_id, 'main',
                'Hlavní výhra s tiketem #' || v_next_ticket);
    end if;

    v_result := jsonb_build_object(
        'success', true,
        'ticket_number', v_next_ticket,
        'ticket_price', v_ticket_price,
        'won_prize', case when v_bonus.id is not null then v_bonus.description
                          when v_next_ticket = v_ticket_count then 'Hlavní výhra'
                          else null end,
        'won_type', case when v_bonus.id is not null then 'bonus'
                         when v_next_ticket = v_ticket_count then 'main'
                         else null end,
        'bonus_prize_id', v_bonus.id,
        'remaining_tickets', v_ticket_count - v_next_ticket,
        'next_bonus_position', v_next_bonus_position,
        'distance_to_next_bonus', case when v_next_bonus_position is not null
                                       then v_next_bonus_position - v_next_ticket
                                       else null end
    );

    return v_result;
end;
$function$;

-- -----------------------------------------------------------------------------
-- 2) buy_voucher_atomic: require p_user_id = auth.uid()
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.buy_voucher_atomic(p_user_id uuid, p_voucher_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet_balance numeric;
  v_price numeric := 5;
  v_existing_favorite uuid;
  v_existing_purchased boolean;
  v_voucher_available boolean;
BEGIN
  -- Security: caller may only act on their own behalf
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  SELECT balance_coins INTO v_wallet_balance
  FROM wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_balance IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Peněženka nenalezena');
  END IF;

  IF v_wallet_balance < v_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Nedostatek MioCoinů');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM user_vouchers
    WHERE user_id = p_user_id AND voucher_id = p_voucher_id AND redeemed = true
  ) INTO v_existing_purchased;

  IF v_existing_purchased THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher již zakoupen');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM vouchers v
    WHERE v.id = p_voucher_id
      AND (v.start_date IS NULL OR v.start_date <= now())
      AND (v.end_date IS NULL OR v.end_date >= now())
      AND (v.max_quantity IS NULL OR v.redeemed_count < v.max_quantity)
  ) INTO v_voucher_available;

  IF NOT v_voucher_available THEN
    RETURN jsonb_build_object('success', false, 'error', 'Voucher není dostupný');
  END IF;

  SELECT id INTO v_existing_favorite
  FROM user_vouchers
  WHERE user_id = p_user_id AND voucher_id = p_voucher_id AND redeemed = false;

  IF v_existing_favorite IS NOT NULL THEN
    UPDATE user_vouchers
    SET redeemed = true, updated_at = now()
    WHERE id = v_existing_favorite;
  ELSE
    INSERT INTO user_vouchers (user_id, voucher_id, redeemed)
    VALUES (p_user_id, p_voucher_id, true);
  END IF;

  UPDATE wallets
  SET balance_coins = balance_coins - v_price
  WHERE user_id = p_user_id;

  UPDATE vouchers
  SET redeemed_count = redeemed_count + 1
  WHERE id = p_voucher_id;

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- -----------------------------------------------------------------------------
-- 3) redeem_miocoin: remove bonus_prizes.user_id (column does not exist).
--    Identify bonus by contest_id + ticket_position; verify caller won it via
--    winners table; then allow redeem by status.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_miocoin(p_user_id uuid, p_contest_id uuid, p_ticket_position integer)
 RETURNS TABLE(success boolean, message text, new_status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_bonus_id uuid;
    current_status text;
    v_winner_user_id uuid;
BEGIN
    -- Security: caller may only redeem for themselves
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
        success := false;
        message := 'Unauthorized';
        new_status := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Find bonus prize by contest and position (bonus_prizes has no user_id)
    SELECT id, status INTO v_bonus_id, current_status
    FROM bonus_prizes
    WHERE contest_id = p_contest_id
      AND ticket_position = p_ticket_position
    LIMIT 1;

    IF v_bonus_id IS NULL THEN
        success := false;
        message := 'Bonus nebyl nalezen';
        new_status := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- Verify the caller won this bonus (winners holds prize_id -> bonus_prizes.id)
    SELECT user_id INTO v_winner_user_id
    FROM winners
    WHERE contest_id = p_contest_id
      AND prize_id = v_bonus_id
      AND type = 'bonus'
    LIMIT 1;

    IF v_winner_user_id IS NULL OR v_winner_user_id <> p_user_id THEN
        success := false;
        message := 'Tento bonus vám nepatří';
        new_status := current_status;
        RETURN NEXT;
        RETURN;
    END IF;

    IF current_status = 'pending' OR current_status = 'won' OR current_status = 'delivered' THEN
        UPDATE bonus_prizes
        SET status = 'won'
        WHERE id = v_bonus_id;

        success := true;
        message := 'Miocoin byl úspěšně uplatněn';
        new_status := 'won';
        RETURN NEXT;
    ELSE
        success := false;
        message := 'Nelze uplatnit bonus s tímto statusem';
        new_status := current_status;
        RETURN NEXT;
    END IF;
END;
$function$;
