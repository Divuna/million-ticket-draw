-- Fix buy_ticket_atomic to use NUMERIC instead of INT for fractional MioCoin support
CREATE OR REPLACE FUNCTION public.buy_ticket_atomic(p_contest_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
    v_ticket_price NUMERIC;  -- Changed from int to NUMERIC
    v_ticket_count int;
    v_contest_status text;
    v_balance NUMERIC;       -- Changed from int to NUMERIC
    v_last_ticket int;
    v_next_ticket int;
    v_bonus record;
    v_next_bonus_position int;
    v_result jsonb;
begin
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

    -- DIAGNOSTIC LOG: Before deduction
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

    -- Deduct coins (using NUMERIC subtraction - no rounding)
    update wallets
    set balance_coins = v_balance - v_ticket_price
    where user_id = p_user_id;

    -- DIAGNOSTIC LOG: After deduction
    RAISE LOG 'buy_ticket_atomic: user=%, balance_after=%, deducted=%', 
        p_user_id, (v_balance - v_ticket_price), v_ticket_price;

    -- Insert ticket
    insert into tickets (contest_id, user_id, number)
    values (p_contest_id, p_user_id, v_next_ticket);

    -- Get next bonus position
    select ticket_position
    into v_next_bonus_position
    from bonus_prizes
    where contest_id = p_contest_id
      and ticket_position > v_next_ticket
      and status = 'pending'
    order by ticket_position asc
    limit 1;

    -- Check bonus prize
    select *
    into v_bonus
    from bonus_prizes
    where contest_id = p_contest_id
      and ticket_position = v_next_ticket
      and status = 'pending'
    limit 1;

    if v_bonus.id is not null then
        -- Record bonus winner
        insert into winners (contest_id, user_id, prize_id, type, notes)
        values (p_contest_id, p_user_id, v_bonus.id, 'bonus',
                'Bonusová výhra s tiketem #' || v_next_ticket);

        update bonus_prizes
        set status = 'won'
        where id = v_bonus.id;
    end if;

    -- Close contest if last ticket
    if v_next_ticket = v_ticket_count then
        update contests
        set status = 'closed'
        where id = p_contest_id;

        insert into winners (contest_id, user_id, type, notes)
        values (p_contest_id, p_user_id, 'main',
                'Hlavní výhra s tiketem #' || v_next_ticket);
    end if;

    -- Return success result JSON
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
$$;;
