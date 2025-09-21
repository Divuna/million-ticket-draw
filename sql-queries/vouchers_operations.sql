-- =====================================================
-- VOUCHERS CREATE OPERATION
-- =====================================================

-- Create single voucher with logging
DO $$
DECLARE
    v_user_id uuid := 'PUT_USER_ID_HERE'; -- Replace with actual user ID
    v_code text := 'VOUCHER_CODE_HERE'; -- Replace with actual voucher code
    v_value numeric := 100; -- Replace with actual value
    v_new_voucher_id uuid;
    v_new_data jsonb;
BEGIN
    -- Insert the new voucher
    INSERT INTO vouchers (user_id, code, value)
    VALUES (v_user_id, v_code, v_value)
    RETURNING id INTO v_new_voucher_id;
    
    -- Capture new data after creation
    SELECT to_jsonb(v.*) INTO v_new_data
    FROM vouchers v
    WHERE v.id = v_new_voucher_id;
    
    -- Log the admin action
    PERFORM log_admin_action(
        'voucher_created',
        'vouchers',
        v_new_voucher_id,
        NULL,
        v_new_data
    );
    
    -- Prepare JSON payload for future Sofinity integration (not sent)
    RAISE NOTICE 'Sofinity payload: %', jsonb_build_object(
        'event_name', 'voucher_created',
        'entity_type', 'vouchers',
        'entity_id', v_new_voucher_id,
        'new_data', v_new_data,
        'timestamp', now()
    );
END $$;

-- =====================================================
-- VOUCHERS UPDATE OPERATION
-- =====================================================

-- Update voucher with logging
DO $$
DECLARE
    v_voucher_id uuid := 'PUT_ACTUAL_UUID_HERE'; -- Replace with actual voucher ID
    v_old_data jsonb;
    v_new_data jsonb;
BEGIN
    -- Capture old data before update
    SELECT to_jsonb(v.*) INTO v_old_data
    FROM vouchers v
    WHERE v.id = v_voucher_id;
    
    -- Perform the update
    UPDATE vouchers 
    SET 
        code = 'UPDATED_CODE', -- Replace with actual values
        value = 200, -- Replace with actual value
        redeemed = true, -- Replace with actual status
        redeemed_at = CASE WHEN redeemed = false AND 'true'::boolean = true THEN now() ELSE redeemed_at END
    WHERE id = v_voucher_id;
    
    -- Capture new data after update
    SELECT to_jsonb(v.*) INTO v_new_data
    FROM vouchers v
    WHERE v.id = v_voucher_id;
    
    -- Log the admin action
    PERFORM log_admin_action(
        'voucher_updated',
        'vouchers',
        v_voucher_id,
        v_old_data,
        v_new_data
    );
    
    -- Prepare JSON payload for future Sofinity integration (not sent)
    RAISE NOTICE 'Sofinity payload: %', jsonb_build_object(
        'event_name', 'voucher_updated',
        'entity_type', 'vouchers',
        'entity_id', v_voucher_id,
        'old_data', v_old_data,
        'new_data', v_new_data,
        'timestamp', now()
    );
END $$;

-- =====================================================
-- VOUCHERS DELETE OPERATION
-- =====================================================

-- Delete voucher with logging
DO $$
DECLARE
    v_voucher_id uuid := 'VOUCHER_ID_HERE'; -- Replace with actual voucher ID
    v_old_data jsonb;
    v_user_email text;
BEGIN
    -- Capture data before deletion
    SELECT to_jsonb(v.*) INTO v_old_data
    FROM vouchers v
    WHERE v.id = v_voucher_id;
    
    -- Get user email for context
    SELECT u.email INTO v_user_email
    FROM vouchers v
    JOIN users u ON u.id = v.user_id
    WHERE v.id = v_voucher_id;
    
    -- Perform the deletion
    DELETE FROM vouchers 
    WHERE id = v_voucher_id;
    
    -- Log the admin action
    PERFORM log_admin_action(
        'voucher_deleted',
        'vouchers',
        v_voucher_id,
        v_old_data,
        NULL
    );
    
    -- Prepare JSON payload for future Sofinity integration (not sent)
    RAISE NOTICE 'Sofinity payload: %', jsonb_build_object(
        'event_name', 'voucher_deleted',
        'entity_type', 'vouchers',
        'entity_id', v_voucher_id,
        'old_data', v_old_data,
        'user_email', v_user_email,
        'timestamp', now()
    );
END $$;

-- =====================================================
-- SELECT QUERIES WITH STRING_AGG FOR COPY-PASTE
-- =====================================================

-- Get all vouchers with STRING_AGG formatting for easy copy
SELECT STRING_AGG(
    format(
        'ID: %s | User: %s | Code: %s | Value: %s | Redeemed: %s | Created: %s | Redeemed At: %s',
        v.id,
        COALESCE(u.email, 'Unknown'),
        v.code,
        v.value,
        CASE WHEN v.redeemed THEN 'Yes' ELSE 'No' END,
        v.created_at::date,
        COALESCE(v.redeemed_at::text, 'Not redeemed')
    ),
    E'\n' ORDER BY v.created_at DESC
) as vouchers_summary
FROM vouchers v
LEFT JOIN users u ON u.id = v.user_id;

-- Get vouchers by user with STRING_AGG
SELECT 
    COALESCE(u.email, 'Unknown User') as user_email,
    COUNT(v.id) as total_vouchers,
    SUM(v.value) as total_value,
    COUNT(CASE WHEN v.redeemed THEN 1 END) as redeemed_count,
    STRING_AGG(
        format(
            'ID: %s | Code: %s | Value: %s | Status: %s',
            v.id,
            v.code,
            v.value,
            CASE WHEN v.redeemed THEN 'Redeemed' ELSE 'Active' END
        ),
        ' | ' ORDER BY v.created_at DESC
    ) as vouchers_list
FROM vouchers v
LEFT JOIN users u ON u.id = v.user_id
GROUP BY u.id, u.email
ORDER BY total_value DESC;

-- Get vouchers by status with STRING_AGG
SELECT 
    CASE WHEN v.redeemed THEN 'Redeemed' ELSE 'Active' END as status,
    COUNT(*) as count,
    SUM(v.value) as total_value,
    STRING_AGG(
        format('%s (Code: %s, Value: %s)', v.id, v.code, v.value),
        ', ' ORDER BY v.created_at DESC
    ) as voucher_ids_and_codes
FROM vouchers v
GROUP BY v.redeemed
ORDER BY status;

-- Get vouchers by value range with STRING_AGG
SELECT 
    CASE 
        WHEN v.value < 50 THEN 'Low Value (< 50)'
        WHEN v.value BETWEEN 50 AND 200 THEN 'Medium Value (50-200)'
        ELSE 'High Value (> 200)'
    END as value_range,
    COUNT(*) as count,
    AVG(v.value) as avg_value,
    STRING_AGG(
        format('ID: %s | Code: %s | Value: %s | User: %s', 
               v.id, v.code, v.value, COALESCE(u.email, 'Unknown')),
        ' | ' ORDER BY v.value DESC
    ) as vouchers_in_range
FROM vouchers v
LEFT JOIN users u ON u.id = v.user_id
GROUP BY 
    CASE 
        WHEN v.value < 50 THEN 'Low Value (< 50)'
        WHEN v.value BETWEEN 50 AND 200 THEN 'Medium Value (50-200)'
        ELSE 'High Value (> 200)'
    END
ORDER BY avg_value;

-- =====================================================
-- BULK OPERATIONS EXAMPLES
-- =====================================================

-- Bulk create vouchers with logging
DO $$
DECLARE
    v_user_id uuid := 'PUT_USER_ID_HERE'; -- Replace with actual user ID
    v_base_code text := 'BULK2025'; -- Replace with actual base code
    v_value numeric := 50; -- Replace with actual value
    v_quantity integer := 10; -- Replace with desired quantity
    v_new_voucher_id uuid;
    v_new_data jsonb;
    i integer;
BEGIN
    FOR i IN 1..v_quantity LOOP
        -- Insert voucher with incremental code
        INSERT INTO vouchers (user_id, code, value)
        VALUES (v_user_id, v_base_code || '_' || LPAD(i::text, 3, '0'), v_value)
        RETURNING id INTO v_new_voucher_id;
        
        -- Capture new data
        SELECT to_jsonb(v.*) INTO v_new_data
        FROM vouchers v
        WHERE v.id = v_new_voucher_id;
        
        -- Log each creation
        PERFORM log_admin_action(
            'voucher_bulk_created',
            'vouchers',
            v_new_voucher_id,
            NULL,
            v_new_data
        );
    END LOOP;
    
    RAISE NOTICE 'Created % vouchers with base code %', v_quantity, v_base_code;
END $$;

-- Bulk update vouchers status with logging
DO $$
DECLARE
    v_voucher_record RECORD;
    v_old_data jsonb;
    v_new_data jsonb;
BEGIN
    FOR v_voucher_record IN 
        SELECT * FROM vouchers 
        WHERE user_id = 'PUT_USER_ID_HERE' 
        AND redeemed = false
        AND created_at < now() - interval '30 days'
    LOOP
        -- Capture old data
        v_old_data := to_jsonb(v_voucher_record);
        
        -- Update voucher (example: mark as expired or change value)
        UPDATE vouchers 
        SET value = value * 0.9  -- 10% discount for old vouchers
        WHERE id = v_voucher_record.id;
        
        -- Capture new data
        SELECT to_jsonb(v.*) INTO v_new_data
        FROM vouchers v
        WHERE v.id = v_voucher_record.id;
        
        -- Log each update
        PERFORM log_admin_action(
            'voucher_bulk_updated',
            'vouchers',
            v_voucher_record.id,
            v_old_data,
            v_new_data
        );
    END LOOP;
END $$;

-- Bulk delete expired vouchers with logging
DO $$
DECLARE
    v_voucher_record RECORD;
    v_old_data jsonb;
BEGIN
    FOR v_voucher_record IN 
        SELECT * FROM vouchers 
        WHERE redeemed = false
        AND created_at < now() - interval '1 year'
    LOOP
        -- Capture data before deletion
        v_old_data := to_jsonb(v_voucher_record);
        
        -- Delete the voucher
        DELETE FROM vouchers WHERE id = v_voucher_record.id;
        
        -- Log the deletion
        PERFORM log_admin_action(
            'voucher_bulk_deleted',
            'vouchers',
            v_voucher_record.id,
            v_old_data,
            NULL
        );
    END LOOP;
END $$;

-- =====================================================
-- UTILITY QUERIES FOR VOUCHER MANAGEMENT
-- =====================================================

-- Generate random voucher codes (helper function)
CREATE OR REPLACE FUNCTION generate_voucher_code(length integer DEFAULT 8)
RETURNS text AS $$
DECLARE
    chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    result text := '';
    i integer;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Bulk create vouchers with random codes
DO $$
DECLARE
    v_user_emails text[] := ARRAY['user1@example.com', 'user2@example.com']; -- Replace with actual emails
    v_value numeric := 100;
    v_quantity_per_user integer := 5;
    v_user_id uuid;
    v_email text;
    v_new_voucher_id uuid;
    v_code text;
    i integer;
BEGIN
    FOREACH v_email IN ARRAY v_user_emails LOOP
        -- Get user ID from email
        SELECT id INTO v_user_id FROM users WHERE email = v_email;
        
        IF v_user_id IS NOT NULL THEN
            FOR i IN 1..v_quantity_per_user LOOP
                -- Generate unique code
                v_code := generate_voucher_code(10);
                
                -- Ensure code is unique
                WHILE EXISTS(SELECT 1 FROM vouchers WHERE code = v_code) LOOP
                    v_code := generate_voucher_code(10);
                END LOOP;
                
                -- Insert voucher
                INSERT INTO vouchers (user_id, code, value)
                VALUES (v_user_id, v_code, v_value)
                RETURNING id INTO v_new_voucher_id;
                
                -- Log the creation
                PERFORM log_admin_action(
                    'voucher_auto_generated',
                    'vouchers',
                    v_new_voucher_id,
                    NULL,
                    jsonb_build_object('user_email', v_email, 'code', v_code, 'value', v_value)
                );
            END LOOP;
        END IF;
    END LOOP;
END $$;