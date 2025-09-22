-- Create test user with explicit UUID (compatible with auth system)
-- This approach avoids the default value issue

DO $$
DECLARE
    test_user_id uuid := 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid;
    existing_contest_id uuid;
BEGIN
    -- Delete existing test user if it exists (for clean testing)
    DELETE FROM public.wallets WHERE user_id = test_user_id;
    DELETE FROM public.notifications WHERE user_id = test_user_id;
    DELETE FROM public.payments WHERE user_id = test_user_id;
    DELETE FROM public.tickets WHERE user_id = test_user_id;
    DELETE FROM public.vouchers WHERE user_id = test_user_id;
    DELETE FROM public.audit_logs WHERE user_id = test_user_id;
    DELETE FROM public.event_logs WHERE user_id = test_user_id;
    DELETE FROM public.users WHERE id = test_user_id;

    -- Insert test user with explicit UUID
    INSERT INTO public.users (
        id,
        email,
        name,
        role,
        created_at
    ) VALUES (
        test_user_id,
        'crud_test_user@onemil.test',
        'CRUD Test User',
        'user',
        now()
    );

    -- Get an existing contest ID for ticket creation
    SELECT id INTO existing_contest_id 
    FROM contests 
    WHERE status IN ('active', 'draft') 
    LIMIT 1;

    -- Create wallet for test user
    INSERT INTO public.wallets (
        user_id,
        balance_coins,
        balance_vouchers,
        created_at
    ) VALUES (
        test_user_id,
        100,
        50,
        now()
    );

    -- Create test notification
    INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        status,
        created_at,
        sent_at
    ) VALUES (
        test_user_id,
        'info',
        'Test oznámení CRUD',
        'Toto je testovací oznámení pro CRUD operace v OneMil aplikaci.',
        'sent',
        now(),
        now()
    );

    -- Create test payment record
    INSERT INTO public.payments (
        user_id,
        amount,
        method,
        status,
        created_at
    ) VALUES (
        test_user_id,
        150.00,
        'card',
        'completed',
        now()
    );

    -- Create test ticket (only if we found a contest)
    IF existing_contest_id IS NOT NULL THEN
        INSERT INTO public.tickets (
            user_id,
            contest_id,
            number,
            created_at
        ) VALUES (
            test_user_id,
            existing_contest_id,
            99999,
            now()
        );
    END IF;

    -- Create test voucher
    INSERT INTO public.vouchers (
        user_id,
        code,
        value,
        redeemed,
        created_at
    ) VALUES (
        test_user_id,
        'CRUD-TEST-2025',
        100.00,
        false,
        now()
    );

    -- Create audit log entry
    INSERT INTO public.audit_logs (
        event,
        user_id,
        metadata,
        created_at
    ) VALUES (
        'test_user_created',
        test_user_id,
        jsonb_build_object(
            'test_type', 'crud_testing',
            'user_email', 'crud_test_user@onemil.test',
            'created_by', 'automated_test_suite'
        ),
        now()
    );

    -- Create event log entry
    INSERT INTO public.event_logs (
        event_name,
        user_id,
        metadata,
        timestamp
    ) VALUES (
        'test_user_setup_complete',
        test_user_id,
        jsonb_build_object(
            'test_records_created', jsonb_build_array(
                'user', 'wallet', 'notification', 'payment', 'ticket', 'voucher'
            ),
            'test_purpose', 'crud_operations_validation'
        ),
        now()
    );

    RAISE NOTICE 'SUCCESS: Test user created with ID: %', test_user_id;
    RAISE NOTICE 'Contest used for ticket: %', COALESCE(existing_contest_id::text, 'No active contest found');

END $$;

-- Final verification - count all test records created
SELECT 
    'CRUD Test Records Created:' as summary,
    '' as details
UNION ALL
SELECT 
    '✓ Test User' as summary,
    u.email || ' (ID: ' || u.id::text || ')' as details
FROM users u 
WHERE u.email = 'crud_test_user@onemil.test'
UNION ALL
SELECT 
    '✓ Wallet' as summary,
    w.balance_coins::text || ' coins, ' || w.balance_vouchers::text || ' vouchers' as details
FROM wallets w
JOIN users u ON w.user_id = u.id
WHERE u.email = 'crud_test_user@onemil.test'
UNION ALL
SELECT 
    '✓ Notification' as summary,
    n.title as details
FROM notifications n
JOIN users u ON n.user_id = u.id
WHERE u.email = 'crud_test_user@onemil.test'
UNION ALL
SELECT 
    '✓ Payment' as summary,
    p.amount::text || ' CZK (' || p.status || ')' as details
FROM payments p
JOIN users u ON p.user_id = u.id
WHERE u.email = 'crud_test_user@onemil.test'
UNION ALL
SELECT 
    '✓ Ticket' as summary,
    'Number: ' || t.number::text || ' for ' || c.title as details
FROM tickets t
JOIN users u ON t.user_id = u.id
JOIN contests c ON t.contest_id = c.id
WHERE u.email = 'crud_test_user@onemil.test'
UNION ALL
SELECT 
    '✓ Voucher' as summary,
    v.code || ' (' || v.value::text || ' CZK)' as details
FROM vouchers v
JOIN users u ON v.user_id = u.id
WHERE u.email = 'crud_test_user@onemil.test';