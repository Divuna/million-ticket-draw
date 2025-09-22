-- Create test user and dependent records for CRUD testing (simplified approach)
-- Using database-generated UUIDs to avoid constraint issues

-- First, let's create the test user with auto-generated UUID
DO $$
DECLARE
    test_user_id uuid;
    existing_contest_id uuid;
BEGIN
    -- Insert test user and capture the generated ID
    INSERT INTO public.users (
        email,
        name,
        role,
        created_at
    ) VALUES (
        'crud_test_user@onemil.test',
        'CRUD Test User',
        'user',
        now()
    ) 
    ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role
    RETURNING id INTO test_user_id;

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
    ) ON CONFLICT (user_id) DO UPDATE SET
        balance_coins = 100,
        balance_vouchers = 50;

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

    -- Output confirmation message
    RAISE NOTICE 'Test user created successfully with ID: %', test_user_id;
    RAISE NOTICE 'Contest ID used for ticket: %', COALESCE(existing_contest_id::text, 'No contest available');

END $$;

-- Verification query to show created records
SELECT 
    'Test User' as record_type,
    u.id as record_id,
    u.email,
    u.name,
    u.role
FROM users u 
WHERE u.email = 'crud_test_user@onemil.test'

UNION ALL

SELECT 
    'Wallet' as record_type,
    w.id as record_id,
    w.balance_coins::text || ' coins, ' || w.balance_vouchers::text || ' vouchers' as email,
    NULL as name,
    NULL as role
FROM wallets w
JOIN users u ON w.user_id = u.id
WHERE u.email = 'crud_test_user@onemil.test'

UNION ALL

SELECT 
    'Notification' as record_type,
    n.id as record_id,
    n.title as email,
    n.message as name,
    n.status as role
FROM notifications n
JOIN users u ON n.user_id = u.id
WHERE u.email = 'crud_test_user@onemil.test'

UNION ALL

SELECT 
    'Payment' as record_type,
    p.id as record_id,
    p.amount::text || ' CZK' as email,
    p.method as name,
    p.status as role
FROM payments p
JOIN users u ON p.user_id = u.id
WHERE u.email = 'crud_test_user@onemil.test'

UNION ALL

SELECT 
    'Ticket' as record_type,
    t.id as record_id,
    'Number: ' || t.number::text as email,
    c.title as name,
    NULL as role
FROM tickets t
JOIN users u ON t.user_id = u.id
JOIN contests c ON t.contest_id = c.id
WHERE u.email = 'crud_test_user@onemil.test'

UNION ALL

SELECT 
    'Voucher' as record_type,
    v.id as record_id,
    v.code as email,
    v.value::text || ' CZK' as name,
    CASE WHEN v.redeemed THEN 'redeemed' ELSE 'available' END as role
FROM vouchers v
JOIN users u ON v.user_id = u.id
WHERE u.email = 'crud_test_user@onemil.test';