-- Create unlock_ticket RPC function
CREATE OR REPLACE FUNCTION public.unlock_ticket(contest_id uuid, user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
    v_contest contests%rowtype;
    v_wallet wallets%rowtype;
    v_ticket_number integer;
    v_next_bonus_position integer;
    v_distance_to_next_bonus integer;
    v_remaining_tickets integer;
    v_bonus_prize bonus_prizes%rowtype;
    v_won_prize text := null;
BEGIN
    -- Get contest details
    SELECT * INTO v_contest
    FROM contests c
    WHERE c.id = contest_id AND c.status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Contest not found or not active';
    END IF;
    
    -- Get user wallet
    SELECT * INTO v_wallet
    FROM wallets w
    WHERE w.user_id = unlock_ticket.user_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'User wallet not found';
    END IF;
    
    -- Check if user has enough coins
    IF v_wallet.balance_coins < v_contest.ticket_price THEN
        RAISE EXCEPTION 'Insufficient coins for ticket purchase';
    END IF;
    
    -- Get current ticket count for this contest
    SELECT COALESCE(MAX(number), 0) + 1 INTO v_ticket_number
    FROM tickets t
    WHERE t.contest_id = unlock_ticket.contest_id;
    
    -- Check if contest is full
    IF v_ticket_number > v_contest.ticket_count THEN
        RAISE EXCEPTION 'Contest is full';
    END IF;
    
    -- Deduct coins from wallet
    UPDATE wallets 
    SET balance_coins = balance_coins - v_contest.ticket_price
    WHERE wallets.user_id = unlock_ticket.user_id;
    
    -- Insert ticket
    INSERT INTO tickets (contest_id, user_id, number)
    VALUES (unlock_ticket.contest_id, unlock_ticket.user_id, v_ticket_number);
    
    -- Calculate remaining tickets
    v_remaining_tickets := v_contest.ticket_count - v_ticket_number;
    
    -- Check for bonus prize at this position
    SELECT * INTO v_bonus_prize
    FROM bonus_prizes bp
    WHERE bp.contest_id = unlock_ticket.contest_id 
      AND bp.ticket_position = v_ticket_number
      AND bp.status = 'pending';
    
    IF FOUND THEN
        -- User won a bonus prize
        v_won_prize := v_bonus_prize.description;
        
        -- Update bonus prize status
        UPDATE bonus_prizes 
        SET status = 'won'
        WHERE id = v_bonus_prize.id;
        
        -- Record winner
        INSERT INTO winners (contest_id, prize_id, user_id, type, notes)
        VALUES (unlock_ticket.contest_id, v_bonus_prize.id, unlock_ticket.user_id, 'bonus', 
                format('Bonus prize for ticket #%s', v_ticket_number));
    END IF;
    
    -- Find next bonus position
    SELECT MIN(bp.ticket_position) INTO v_next_bonus_position
    FROM bonus_prizes bp
    WHERE bp.contest_id = unlock_ticket.contest_id 
      AND bp.ticket_position > v_ticket_number
      AND bp.status = 'pending';
    
    -- Calculate distance to next bonus
    IF v_next_bonus_position IS NOT NULL THEN
        v_distance_to_next_bonus := v_next_bonus_position - v_ticket_number;
    ELSE
        v_distance_to_next_bonus := null;
    END IF;
    
    -- Check if contest is now full and handle main prize
    IF v_ticket_number = v_contest.ticket_count THEN
        -- Contest is complete, award main prize
        INSERT INTO winners (contest_id, user_id, type, notes)
        VALUES (unlock_ticket.contest_id, unlock_ticket.user_id, 'main',
                format('Main prize winner with ticket #%s', v_ticket_number));
        
        -- Close the contest
        UPDATE contests SET status = 'closed' WHERE id = unlock_ticket.contest_id;
        
        IF v_won_prize IS NULL THEN
            v_won_prize := v_contest.main_prize;
        END IF;
    END IF;
    
    -- Return result as JSON
    RETURN json_build_object(
        'ticket_number', v_ticket_number,
        'ticket_price', v_contest.ticket_price,
        'next_bonus_position', v_next_bonus_position,
        'distance_to_next_bonus', v_distance_to_next_bonus,
        'remaining_tickets', v_remaining_tickets,
        'won_prize', v_won_prize
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION '%', SQLERRM;
END;
$$;