-- OneMil: Payment Refund Operations SQL File
-- This file contains all SQL operations for payment refunds including:
-- 1. Single payment refunds with wallet adjustments and admin logging
-- 2. Bulk refund operations with criteria-based selection
-- 3. Utility queries for reporting and STRING_AGG outputs

-- ============================================================================
-- 1. SINGLE PAYMENT REFUND QUERY
-- ============================================================================

-- OneMil: Single payment refund with wallet adjustment and logging
DO $$
DECLARE
    v_payment_id uuid := 'PUT_PAYMENT_ID_HERE';
    v_payment_record RECORD;
    v_old_payment_data jsonb;
    v_new_payment_data jsonb;
    v_wallet_old_data jsonb;
    v_wallet_new_data jsonb;
    v_sofinity_payload jsonb;
BEGIN
    -- Get payment details
    SELECT * INTO v_payment_record
    FROM payments
    WHERE id = v_payment_id AND status = 'completed';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found or not completed: %', v_payment_id;
    END IF;

    -- Store old payment data for logging
    v_old_payment_data := to_jsonb(v_payment_record);

    -- Get old wallet data
    SELECT to_jsonb(w.*) INTO v_wallet_old_data
    FROM wallets w
    WHERE w.user_id = v_payment_record.user_id;

    -- Update payment status to refunded
    UPDATE payments 
    SET status = 'refunded'
    WHERE id = v_payment_id;

    -- Adjust wallet balance (subtract refunded amount)
    UPDATE wallets
    SET balance_coins = balance_coins - v_payment_record.amount,
        balance_vouchers = balance_vouchers - v_payment_record.amount
    WHERE user_id = v_payment_record.user_id;

    -- Get new payment data
    SELECT to_jsonb(p.*) INTO v_new_payment_data
    FROM payments p
    WHERE p.id = v_payment_id;

    -- Get new wallet data
    SELECT to_jsonb(w.*) INTO v_wallet_new_data
    FROM wallets w
    WHERE w.user_id = v_payment_record.user_id;

    -- Log the refund action
    PERFORM log_admin_action(
        'payment_refunded',
        'payments',
        v_payment_id,
        v_old_payment_data,
        v_new_payment_data
    );

    -- Log wallet adjustment
    PERFORM log_admin_action(
        'wallet_refund_adjustment',
        'wallets',
        (SELECT id FROM wallets WHERE user_id = v_payment_record.user_id),
        v_wallet_old_data,
        v_wallet_new_data
    );

    -- Prepare Sofinity payload (ready for future integration)
    v_sofinity_payload := jsonb_build_object(
        'event_name', 'payment_refunded',
        'user_id', v_payment_record.user_id,
        'payment_id', v_payment_id,
        'amount', v_payment_record.amount,
        'original_status', 'completed',
        'new_status', 'refunded',
        'refund_timestamp', now(),
        'metadata', jsonb_build_object(
            'stripe_session_id', v_payment_record.stripe_session_id,
            'payment_method', v_payment_record.method,
            'refund_reason', 'admin_initiated'
        )
    );

    RAISE NOTICE 'Single refund completed for payment: % | Amount: % | Sofinity payload ready', 
                 v_payment_id, v_payment_record.amount;
    RAISE NOTICE 'Sofinity payload: %', v_sofinity_payload;
END $$;

-- ============================================================================
-- 2. BULK REFUND OPERATIONS
-- ============================================================================

-- OneMil: Bulk refund by date range with logging
DO $$
DECLARE
    v_start_date timestamp := 'PUT_START_DATE_HERE'::timestamp;
    v_end_date timestamp := 'PUT_END_DATE_HERE'::timestamp;
    v_payment_record RECORD;
    v_old_payment_data jsonb;
    v_new_payment_data jsonb;
    v_wallet_old_data jsonb;
    v_wallet_new_data jsonb;
    v_sofinity_payload jsonb;
    v_refund_count integer := 0;
    v_total_refunded numeric := 0;
BEGIN
    FOR v_payment_record IN 
        SELECT * FROM payments 
        WHERE status = 'completed'
        AND created_at BETWEEN v_start_date AND v_end_date
        ORDER BY created_at DESC
    LOOP
        v_old_payment_data := to_jsonb(v_payment_record);

        -- Get old wallet data
        SELECT to_jsonb(w.*) INTO v_wallet_old_data
        FROM wallets w
        WHERE w.user_id = v_payment_record.user_id;

        -- Update payment status
        UPDATE payments 
        SET status = 'refunded'
        WHERE id = v_payment_record.id;

        -- Adjust wallet balance
        UPDATE wallets
        SET balance_coins = balance_coins - v_payment_record.amount,
            balance_vouchers = balance_vouchers - v_payment_record.amount
        WHERE user_id = v_payment_record.user_id;

        -- Get new data for logging
        SELECT to_jsonb(p.*) INTO v_new_payment_data
        FROM payments p
        WHERE p.id = v_payment_record.id;

        SELECT to_jsonb(w.*) INTO v_wallet_new_data
        FROM wallets w
        WHERE w.user_id = v_payment_record.user_id;

        -- Log refund action
        PERFORM log_admin_action(
            'payment_bulk_refunded',
            'payments',
            v_payment_record.id,
            v_old_payment_data,
            v_new_payment_data
        );

        -- Log wallet adjustment
        PERFORM log_admin_action(
            'wallet_bulk_refund_adjustment',
            'wallets',
            (SELECT id FROM wallets WHERE user_id = v_payment_record.user_id),
            v_wallet_old_data,
            v_wallet_new_data
        );

        -- Prepare Sofinity payload for each refund
        v_sofinity_payload := jsonb_build_object(
            'event_name', 'payment_bulk_refunded',
            'user_id', v_payment_record.user_id,
            'payment_id', v_payment_record.id,
            'amount', v_payment_record.amount,
            'refund_batch_id', extract(epoch from now())::text,
            'refund_timestamp', now(),
            'metadata', jsonb_build_object(
                'stripe_session_id', v_payment_record.stripe_session_id,
                'payment_method', v_payment_record.method,
                'refund_reason', 'bulk_admin_refund',
                'date_range', jsonb_build_object(
                    'start_date', v_start_date,
                    'end_date', v_end_date
                )
            )
        );

        v_refund_count := v_refund_count + 1;
        v_total_refunded := v_total_refunded + v_payment_record.amount;

        RAISE NOTICE 'Bulk refund % of %: Payment % | Amount % | User %', 
                     v_refund_count, 
                     (SELECT COUNT(*) FROM payments WHERE status = 'completed' AND created_at BETWEEN v_start_date AND v_end_date),
                     v_payment_record.id, 
                     v_payment_record.amount,
                     v_payment_record.user_id;
    END LOOP;

    RAISE NOTICE 'Bulk refund completed: % payments | Total amount: %', v_refund_count, v_total_refunded;
END $$;

-- OneMil: Bulk refund by user ID with logging
DO $$
DECLARE
    v_target_user_id uuid := 'PUT_USER_ID_HERE';
    v_payment_record RECORD;
    v_old_payment_data jsonb;
    v_new_payment_data jsonb;
    v_wallet_old_data jsonb;
    v_wallet_new_data jsonb;
    v_sofinity_payload jsonb;
    v_refund_count integer := 0;
    v_total_refunded numeric := 0;
BEGIN
    FOR v_payment_record IN 
        SELECT * FROM payments 
        WHERE status = 'completed'
        AND user_id = v_target_user_id
        ORDER BY created_at DESC
    LOOP
        v_old_payment_data := to_jsonb(v_payment_record);

        -- Get old wallet data
        SELECT to_jsonb(w.*) INTO v_wallet_old_data
        FROM wallets w
        WHERE w.user_id = v_payment_record.user_id;

        -- Update payment status
        UPDATE payments 
        SET status = 'refunded'
        WHERE id = v_payment_record.id;

        -- Adjust wallet balance
        UPDATE wallets
        SET balance_coins = balance_coins - v_payment_record.amount,
            balance_vouchers = balance_vouchers - v_payment_record.amount
        WHERE user_id = v_payment_record.user_id;

        -- Get new data
        SELECT to_jsonb(p.*) INTO v_new_payment_data
        FROM payments p
        WHERE p.id = v_payment_record.id;

        SELECT to_jsonb(w.*) INTO v_wallet_new_data
        FROM wallets w
        WHERE w.user_id = v_payment_record.user_id;

        -- Log actions
        PERFORM log_admin_action(
            'payment_user_bulk_refunded',
            'payments',
            v_payment_record.id,
            v_old_payment_data,
            v_new_payment_data
        );

        PERFORM log_admin_action(
            'wallet_user_bulk_refund_adjustment',
            'wallets',
            (SELECT id FROM wallets WHERE user_id = v_payment_record.user_id),
            v_wallet_old_data,
            v_wallet_new_data
        );

        -- Prepare Sofinity payload
        v_sofinity_payload := jsonb_build_object(
            'event_name', 'payment_user_bulk_refunded',
            'user_id', v_payment_record.user_id,
            'payment_id', v_payment_record.id,
            'amount', v_payment_record.amount,
            'refund_batch_id', extract(epoch from now())::text,
            'refund_timestamp', now(),
            'metadata', jsonb_build_object(
                'stripe_session_id', v_payment_record.stripe_session_id,
                'payment_method', v_payment_record.method,
                'refund_reason', 'user_bulk_admin_refund',
                'target_user_id', v_target_user_id
            )
        );

        v_refund_count := v_refund_count + 1;
        v_total_refunded := v_total_refunded + v_payment_record.amount;
    END LOOP;

    RAISE NOTICE 'User bulk refund completed for user %: % payments | Total amount: %', 
                 v_target_user_id, v_refund_count, v_total_refunded;
END $$;

-- ============================================================================
-- 3. UTILITY QUERIES AND REPORTS
-- ============================================================================

-- OneMil: All payments with STRING_AGG for easy copy-paste
SELECT 
    STRING_AGG(
        format('ID: %s | User: %s | Amount: %s | Status: %s | Method: %s | Date: %s | Stripe: %s',
            p.id, 
            COALESCE(u.email, 'Unknown'), 
            p.amount, 
            p.status, 
            p.method, 
            p.created_at::date,
            COALESCE(p.stripe_session_id, 'N/A')
        ),
        E'\n'
    ) AS payments_summary
FROM payments p
LEFT JOIN users u ON u.id = p.user_id
ORDER BY p.created_at DESC;

-- OneMil: Refunded payments summary with STRING_AGG
SELECT 
    'REFUNDED PAYMENTS SUMMARY' AS report_type,
    COUNT(*) AS total_refunded_payments,
    SUM(amount) AS total_refunded_amount,
    STRING_AGG(
        format('[%s] %s | User: %s | Amount: %s | Date: %s',
            p.id::text, 
            p.method,
            COALESCE(u.email, 'Unknown'), 
            p.amount, 
            p.created_at::date
        ),
        E'\n'
        ORDER BY p.created_at DESC
    ) AS refunded_payments_details
FROM payments p
LEFT JOIN users u ON u.id = p.user_id
WHERE p.status = 'refunded';

-- OneMil: Non-refunded (completed) payments summary
SELECT 
    'COMPLETED (NON-REFUNDED) PAYMENTS SUMMARY' AS report_type,
    COUNT(*) AS total_completed_payments,
    SUM(amount) AS total_completed_amount,
    STRING_AGG(
        format('[%s] %s | User: %s | Amount: %s | Date: %s',
            p.id::text, 
            p.method,
            COALESCE(u.email, 'Unknown'), 
            p.amount, 
            p.created_at::date
        ),
        E'\n'
        ORDER BY p.created_at DESC
    ) AS completed_payments_details
FROM payments p
LEFT JOIN users u ON u.id = p.user_id
WHERE p.status = 'completed';

-- OneMil: Payments grouped by user with refund status
SELECT 
    u.email,
    u.id as user_id,
    COUNT(CASE WHEN p.status = 'completed' THEN 1 END) as completed_payments,
    COUNT(CASE WHEN p.status = 'refunded' THEN 1 END) as refunded_payments,
    SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END) as completed_amount,
    SUM(CASE WHEN p.status = 'refunded' THEN p.amount ELSE 0 END) as refunded_amount,
    STRING_AGG(
        CASE WHEN p.status = 'refunded' THEN
            format('REFUNDED: %s | %s | %s', p.id, p.amount, p.created_at::date)
        END,
        ', '
    ) as refunded_payments_list
FROM users u
LEFT JOIN payments p ON p.user_id = u.id
WHERE p.id IS NOT NULL
GROUP BY u.id, u.email
ORDER BY refunded_amount DESC NULLS LAST;

-- OneMil: Monthly refund report with STRING_AGG
SELECT 
    date_trunc('month', p.created_at) as refund_month,
    COUNT(*) as refunds_count,
    SUM(p.amount) as total_refunded,
    STRING_AGG(
        format('%s (%s) - %s', u.email, p.amount, p.created_at::date),
        E'\n'
        ORDER BY p.created_at
    ) as monthly_refunds_details
FROM payments p
LEFT JOIN users u ON u.id = p.user_id
WHERE p.status = 'refunded'
GROUP BY date_trunc('month', p.created_at)
ORDER BY refund_month DESC;

-- OneMil: Payment method refund analysis
SELECT 
    p.method,
    COUNT(*) as refunds_count,
    SUM(p.amount) as total_refunded,
    AVG(p.amount) as avg_refund_amount,
    STRING_AGG(
        format('User: %s | Amount: %s | Date: %s | Stripe: %s',
            COALESCE(u.email, 'Unknown'),
            p.amount,
            p.created_at::date,
            COALESCE(p.stripe_session_id, 'N/A')
        ),
        E'\n'
        ORDER BY p.amount DESC
    ) as method_refunds_details
FROM payments p
LEFT JOIN users u ON u.id = p.user_id
WHERE p.status = 'refunded'
GROUP BY p.method
ORDER BY total_refunded DESC;

-- OneMil: Recent refund activity (last 30 days)
SELECT 
    'RECENT REFUND ACTIVITY (30 DAYS)' AS report_type,
    COUNT(*) as recent_refunds_count,
    SUM(amount) as recent_refunds_total,
    STRING_AGG(
        format('[%s] %s | User: %s | Amount: %s | Date: %s | Days ago: %s',
            p.id::text,
            p.method,
            COALESCE(u.email, 'Unknown'),
            p.amount,
            p.created_at::date,
            extract(days from now() - p.created_at)::integer
        ),
        E'\n'
        ORDER BY p.created_at DESC
    ) as recent_refunds_details
FROM payments p
LEFT JOIN users u ON u.id = p.user_id
WHERE p.status = 'refunded'
AND p.created_at >= now() - interval '30 days';

-- OneMil: Wallet balance impact from refunds per user
SELECT 
    u.email,
    u.id as user_id,
    w.balance_coins as current_balance_coins,
    w.balance_vouchers as current_balance_vouchers,
    COALESCE(SUM(p.amount), 0) as total_refunded_amount,
    STRING_AGG(
        format('Refund: %s (%s) on %s', p.id, p.amount, p.created_at::date),
        E'\n'
        ORDER BY p.created_at DESC
    ) as user_refunds_history
FROM users u
LEFT JOIN wallets w ON w.user_id = u.id
LEFT JOIN payments p ON p.user_id = u.id AND p.status = 'refunded'
WHERE w.id IS NOT NULL
GROUP BY u.id, u.email, w.balance_coins, w.balance_vouchers
HAVING COUNT(p.id) > 0
ORDER BY total_refunded_amount DESC;