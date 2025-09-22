-- Fix setup_crud_test_data without using session_replication_role

CREATE OR REPLACE FUNCTION public.setup_crud_test_data(p_user_email text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_contest_id uuid;
    v_test_records json;
    v_cleanup_count integer := 0;
BEGIN
    -- Use provided email or find first available user
    IF p_user_email IS NOT NULL THEN
        SELECT id INTO v_user_id 
        FROM public.users 
        WHERE email = p_user_email;
        
        IF v_user_id IS NULL THEN
            RETURN json_build_object(
                'success', false,
                'message', 'User with email ' || p_user_email || ' not found'
            );
        END IF;
    ELSE
        -- Use first available admin user for testing
        SELECT id INTO v_user_id 
        FROM public.users 
        WHERE role IN ('admin', 'superadmin')
        LIMIT 1;
        
        IF v_user_id IS NULL THEN
            RETURN json_build_object(
                'success', false,
                'message', 'No admin users found for testing'
            );
        END IF;
    END IF;

    -- Clean up any existing test data for this user
    DELETE FROM public.notifications WHERE user_id = v_user_id AND title LIKE '%CRUD Test%';
    GET DIAGNOSTICS v_cleanup_count = ROW_COUNT;
    
    DELETE FROM public.payments WHERE user_id = v_user_id AND amount = 999.99;
    DELETE FROM public.tickets WHERE user_id = v_user_id AND number = 77777;
    DELETE FROM public.vouchers WHERE user_id = v_user_id AND code LIKE 'CRUD-TEST-%';
    
    -- Get an existing contest for ticket creation
    SELECT id INTO v_contest_id 
    FROM public.contests 
    WHERE status IN ('active', 'draft')
    LIMIT 1;

    -- Create or update wallet with test balances
    INSERT INTO public.wallets (user_id, balance_coins, balance_vouchers, created_at)
    VALUES (v_user_id, 500, 200, now())
    ON CONFLICT (user_id) DO UPDATE SET
        balance_coins = wallets.balance_coins + 500,
        balance_vouchers = wallets.balance_vouchers + 200;

    -- Create test notification with special marker to avoid HTTP triggers
    INSERT INTO public.notifications (
        user_id, type, title, message, status, created_at, sent_at
    ) VALUES (
        v_user_id, 'info', 'CRUD Test Notification [TEST_DATA]', 
        'Testovací oznámení pro CRUD operace - vytvořeno ' || now()::text, 
        'sent', now(), now()
    );

    -- Create test payment with special marker
    INSERT INTO public.payments (
        user_id, amount, method, status, created_at
    ) VALUES (
        v_user_id, 999.99, 'test_crud', 'completed', now()
    );

    -- Create test ticket if contest exists
    IF v_contest_id IS NOT NULL THEN
        INSERT INTO public.tickets (
            user_id, contest_id, number, created_at
        ) VALUES (
            v_user_id, v_contest_id, 77777, now()
        );
    END IF;

    -- Create test voucher with special marker
    INSERT INTO public.vouchers (
        user_id, code, value, redeemed, created_at
    ) VALUES (
        v_user_id, 'CRUD-TEST-' || extract(epoch from now())::bigint, 
        250.00, false, now()
    );

    -- Log the test setup directly without triggers
    INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
    VALUES (
        'crud_test_setup',
        v_user_id,
        json_build_object(
            'test_type', 'crud_validation',
            'setup_timestamp', now(),
            'contest_used', v_contest_id,
            'cleanup_count', v_cleanup_count,
            'is_test_data', true
        ),
        now()
    );

    -- Build response with created records
    SELECT json_build_object(
        'success', true,
        'message', 'CRUD test data created successfully',
        'user_id', v_user_id,
        'user_email', (SELECT email FROM public.users WHERE id = v_user_id),
        'test_records', json_build_object(
            'wallet_updated', true,
            'notification_created', true,
            'payment_created', true,
            'ticket_created', v_contest_id IS NOT NULL,
            'voucher_created', true,
            'contest_id_used', v_contest_id
        ),
        'cleanup_performed', v_cleanup_count || ' old test records removed'
    ) INTO v_test_records;

    RETURN v_test_records;

EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'message', 'Error setting up test data: ' || SQLERRM
        );
END;
$function$;

-- Update triggers to avoid HTTP calls for test data
CREATE OR REPLACE FUNCTION public.trigger_user_registered()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
begin
  -- Skip HTTP calls for test data
  IF NEW.email LIKE '%test%' OR NEW.email = 'divispavel2@gmail.com' THEN
    RETURN NEW;
  END IF;
  
  perform notify_sofinity_event(
    'user_registered',
    new.id,
    null,
    jsonb_build_object(
      'email', new.email,
      'role', new.role
    )
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_voucher_purchased()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
begin
  -- Skip HTTP calls for test data
  IF NEW.code LIKE 'CRUD-TEST-%' THEN
    RETURN NEW;
  END IF;
  
  perform notify_sofinity_event(
    'voucher_purchased',
    new.user_id,
    null,
    jsonb_build_object(
      'voucher_id', new.id,
      'code', new.code,
      'value', new.value
    )
  );
  return new;
end;
$function$;