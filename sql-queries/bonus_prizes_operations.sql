-- =====================================================
-- BONUS PRIZES UPDATE OPERATION
-- =====================================================

-- Update bonus prize with logging
DO $$
DECLARE
    v_bonus_id uuid := 'PUT_ACTUAL_UUID_HERE'; -- Replace with actual bonus prize ID
    v_old_data jsonb;
    v_new_data jsonb;
    v_contest_name text;
BEGIN
    -- Capture old data before update
    SELECT to_jsonb(bp.*) INTO v_old_data
    FROM bonus_prizes bp
    WHERE bp.id = v_bonus_id;
    
    -- Perform the update
    UPDATE bonus_prizes 
    SET 
        description = 'Updated bonus description', -- Replace with actual values
        amount = 100, -- Replace with actual amount
        status = 'pending' -- Replace with actual status
    WHERE id = v_bonus_id;
    
    -- Capture new data after update
    SELECT to_jsonb(bp.*) INTO v_new_data
    FROM bonus_prizes bp
    WHERE bp.id = v_bonus_id;
    
    -- Log the admin action
    PERFORM log_admin_action(
        'bonus_prize_updated',
        'bonus_prizes',
        v_bonus_id,
        v_old_data,
        v_new_data
    );
    
    -- Prepare JSON payload for future Sofinity integration (not sent)
    RAISE NOTICE 'Sofinity payload: %', jsonb_build_object(
        'event_name', 'bonus_prize_updated',
        'entity_type', 'bonus_prizes',
        'entity_id', v_bonus_id,
        'old_data', v_old_data,
        'new_data', v_new_data,
        'timestamp', now()
    );
END $$;

-- =====================================================
-- BONUS PRIZES DELETE OPERATION
-- =====================================================

-- Delete bonus prize with logging
DO $$
DECLARE
    v_bonus_id uuid := 'BONUS_ID_HERE'; -- Replace with actual bonus prize ID
    v_old_data jsonb;
    v_contest_name text;
BEGIN
    -- Capture data before deletion
    SELECT to_jsonb(bp.*) INTO v_old_data
    FROM bonus_prizes bp
    WHERE bp.id = v_bonus_id;
    
    -- Get contest name for context
    SELECT c.title INTO v_contest_name
    FROM bonus_prizes bp
    JOIN contests c ON c.id = bp.contest_id
    WHERE bp.id = v_bonus_id;
    
    -- Perform the deletion
    DELETE FROM bonus_prizes 
    WHERE id = v_bonus_id;
    
    -- Log the admin action
    PERFORM log_admin_action(
        'bonus_prize_deleted',
        'bonus_prizes',
        v_bonus_id,
        v_old_data,
        NULL
    );
    
    -- Prepare JSON payload for future Sofinity integration (not sent)
    RAISE NOTICE 'Sofinity payload: %', jsonb_build_object(
        'event_name', 'bonus_prize_deleted',
        'entity_type', 'bonus_prizes',
        'entity_id', v_bonus_id,
        'old_data', v_old_data,
        'contest_name', v_contest_name,
        'timestamp', now()
    );
END $$;

-- =====================================================
-- SELECT QUERIES WITH STRING_AGG FOR COPY-PASTE
-- =====================================================

-- Get all bonus prizes with STRING_AGG formatting for easy copy
SELECT STRING_AGG(
    format(
        'ID: %s | Contest: %s | Position: %s | Amount: %s | Status: %s | Description: %s',
        bp.id,
        c.title,
        bp.ticket_position,
        COALESCE(bp.amount::text, 'NULL'),
        bp.status,
        bp.description
    ),
    E'\n' ORDER BY bp.created_at DESC
) as bonus_prizes_summary
FROM bonus_prizes bp
JOIN contests c ON c.id = bp.contest_id;

-- Get bonus prizes by contest with STRING_AGG
SELECT 
    c.title as contest_name,
    STRING_AGG(
        format(
            'ID: %s | Pos: %s | Amount: %s | Status: %s | Desc: %s',
            bp.id,
            bp.ticket_position,
            COALESCE(bp.amount::text, '0'),
            bp.status,
            bp.description
        ),
        ' | ' ORDER BY bp.ticket_position
    ) as bonuses_list
FROM bonus_prizes bp
JOIN contests c ON c.id = bp.contest_id
GROUP BY c.id, c.title
ORDER BY c.created_at DESC;

-- Get bonus prizes by status with STRING_AGG
SELECT 
    bp.status,
    COUNT(*) as count,
    STRING_AGG(
        format('%s (Pos: %s)', bp.id, bp.ticket_position),
        ', ' ORDER BY bp.ticket_position
    ) as bonus_ids_and_positions
FROM bonus_prizes bp
GROUP BY bp.status
ORDER BY bp.status;

-- =====================================================
-- BULK OPERATIONS EXAMPLES
-- =====================================================

-- Bulk update bonus prizes status with logging
DO $$
DECLARE
    v_bonus_record RECORD;
    v_old_data jsonb;
    v_new_data jsonb;
BEGIN
    FOR v_bonus_record IN 
        SELECT id FROM bonus_prizes 
        WHERE contest_id = 'PUT_CONTEST_ID_HERE' 
        AND status = 'pending'
    LOOP
        -- Capture old data
        SELECT to_jsonb(bp.*) INTO v_old_data
        FROM bonus_prizes bp
        WHERE bp.id = v_bonus_record.id;
        
        -- Update status
        UPDATE bonus_prizes 
        SET status = 'won'
        WHERE id = v_bonus_record.id;
        
        -- Capture new data
        SELECT to_jsonb(bp.*) INTO v_new_data
        FROM bonus_prizes bp
        WHERE bp.id = v_bonus_record.id;
        
        -- Log each update
        PERFORM log_admin_action(
            'bonus_prize_bulk_updated',
            'bonus_prizes',
            v_bonus_record.id,
            v_old_data,
            v_new_data
        );
    END LOOP;
END $$;

-- Bulk delete bonus prizes with logging
DO $$
DECLARE
    v_bonus_record RECORD;
    v_old_data jsonb;
BEGIN
    FOR v_bonus_record IN 
        SELECT * FROM bonus_prizes 
        WHERE contest_id = 'PUT_CONTEST_ID_HERE' 
        AND status = 'cancelled'
    LOOP
        -- Capture data before deletion
        v_old_data := to_jsonb(v_bonus_record);
        
        -- Delete the bonus prize
        DELETE FROM bonus_prizes WHERE id = v_bonus_record.id;
        
        -- Log the deletion
        PERFORM log_admin_action(
            'bonus_prize_bulk_deleted',
            'bonus_prizes',
            v_bonus_record.id,
            v_old_data,
            NULL
        );
    END LOOP;
END $$;