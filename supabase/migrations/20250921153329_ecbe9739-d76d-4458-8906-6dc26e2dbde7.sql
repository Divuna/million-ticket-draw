-- OneMil Admin Backend Functions with CRUD, Security, Audit Logging, and Sofinity Integration

-- ============================================================================
-- VOUCHER MANAGEMENT FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_manage_voucher(
  p_voucher_id uuid DEFAULT NULL,
  p_user_email text DEFAULT NULL,
  p_code text DEFAULT NULL,
  p_value numeric DEFAULT NULL,
  p_operation text DEFAULT 'create'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_voucher_id uuid;
  v_user_id uuid;
  v_old_record vouchers%rowtype;
  v_new_record vouchers%rowtype;
  v_user_name text;
  v_payload jsonb;
BEGIN
  -- Get current admin user
  v_admin_id := auth.uid();
  
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = v_admin_id 
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat vouchery';
  END IF;

  -- Handle UPDATE operation
  IF p_operation = 'update' AND p_voucher_id IS NOT NULL THEN
    -- Get old record for logging
    SELECT * INTO v_old_record
    FROM vouchers
    WHERE id = p_voucher_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Voucher nebyl nalezen';
    END IF;

    -- Update voucher
    UPDATE vouchers 
    SET 
      code = COALESCE(p_code, code),
      value = COALESCE(p_value, value)
    WHERE id = p_voucher_id
    RETURNING * INTO v_new_record;

    v_voucher_id := p_voucher_id;

  -- Handle DELETE operation
  ELSIF p_operation = 'delete' AND p_voucher_id IS NOT NULL THEN
    -- Get old record for logging
    SELECT * INTO v_old_record
    FROM vouchers
    WHERE id = p_voucher_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Voucher nebyl nalezen';
    END IF;

    -- Delete voucher
    DELETE FROM vouchers WHERE id = p_voucher_id;
    v_voucher_id := p_voucher_id;

  -- Handle CREATE operation
  ELSE
    -- Validate required fields for creation
    IF p_user_email IS NULL OR p_value IS NULL THEN
      RAISE EXCEPTION 'Email uživatele a hodnota voucheru jsou povinné';
    END IF;

    -- Find user by email
    SELECT id, name INTO v_user_id, v_user_name
    FROM users
    WHERE email = p_user_email;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uživatel s emailem % nebyl nalezen', p_user_email;
    END IF;

    -- Generate code if not provided
    IF p_code IS NULL THEN
      p_code := upper(substr(md5(random()::text), 1, 8));
    END IF;

    -- Create new voucher
    INSERT INTO vouchers (user_id, code, value)
    VALUES (v_user_id, p_code, p_value)
    RETURNING * INTO v_new_record;

    v_voucher_id := v_new_record.id;
  END IF;

  -- Log admin action
  INSERT INTO admin_actions (
    admin_id,
    action_type,
    target_table,
    target_id,
    notes,
    metadata
  ) VALUES (
    v_admin_id,
    CONCAT('voucher_', p_operation),
    'vouchers',
    v_voucher_id,
    CASE 
      WHEN p_operation = 'create' THEN CONCAT('Vytvořen voucher: ', COALESCE(v_new_record.code, p_code), ' (', COALESCE(v_new_record.value, p_value), ' Kč)')
      WHEN p_operation = 'update' THEN CONCAT('Aktualizován voucher: ', COALESCE(v_new_record.code, v_old_record.code))
      WHEN p_operation = 'delete' THEN CONCAT('Smazán voucher: ', v_old_record.code, ' (', v_old_record.value, ' Kč)')
      ELSE CONCAT('Voucher operace: ', p_operation)
    END,
    jsonb_build_object(
      'old_data', CASE WHEN p_operation IN ('update', 'delete') THEN to_jsonb(v_old_record) ELSE NULL END,
      'new_data', CASE WHEN p_operation IN ('create', 'update') THEN to_jsonb(v_new_record) ELSE NULL END,
      'user_email', p_user_email,
      'operation', p_operation
    )
  );

  -- Prepare Sofinity payload
  v_payload := jsonb_build_object(
    'event_name', CONCAT('voucher_', p_operation),
    'voucher_id', v_voucher_id,
    'code', COALESCE(v_new_record.code, v_old_record.code, p_code),
    'value', COALESCE(v_new_record.value, v_old_record.value, p_value),
    'user_email', p_user_email,
    'admin_id', v_admin_id,
    'timestamp', now()
  );

  -- Send event to Sofinity
  PERFORM notify_sofinity_event(
    CONCAT('voucher_', p_operation),
    v_admin_id,
    NULL,
    v_payload
  );

  -- Return success response
  RETURN json_build_object(
    'success', true,
    'message', CASE 
      WHEN p_operation = 'create' THEN 'Voucher byl úspěšně vytvořen'
      WHEN p_operation = 'update' THEN 'Voucher byl úspěšně aktualizován'
      WHEN p_operation = 'delete' THEN 'Voucher byl úspěšně smazán'
      ELSE 'Operace byla úspěšně dokončena'
    END,
    'voucher_id', v_voucher_id,
    'voucher_data', CASE WHEN p_operation != 'delete' THEN row_to_json(v_new_record) ELSE NULL END
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba při správě voucheru: %', SQLERRM;
END;
$$;

-- ============================================================================
-- PAYMENT MANAGEMENT FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_manage_payment(
  p_payment_id uuid DEFAULT NULL,
  p_new_status text DEFAULT NULL,
  p_operation text DEFAULT 'update_status'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_old_record payments%rowtype;
  v_new_record payments%rowtype;
  v_user_email text;
  v_wallet_record wallets%rowtype;
  v_payload jsonb;
BEGIN
  -- Get current admin user
  v_admin_id := auth.uid();
  
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = v_admin_id 
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat platby';
  END IF;

  -- Validate required parameters
  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'ID platby je povinné';
  END IF;

  -- Get old record for logging
  SELECT p.*, u.email INTO v_old_record, v_user_email
  FROM payments p
  LEFT JOIN users u ON p.user_id = u.id
  WHERE p.id = p_payment_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platba nebyla nalezena';
  END IF;

  -- Handle REFUND operation
  IF p_operation = 'refund' AND v_old_record.status = 'completed' THEN
    -- Update payment status to refunded
    UPDATE payments 
    SET status = 'refunded'
    WHERE id = p_payment_id
    RETURNING * INTO v_new_record;

    -- Update user wallet - add refund amount
    SELECT * INTO v_wallet_record
    FROM wallets
    WHERE user_id = v_old_record.user_id;

    IF FOUND THEN
      UPDATE wallets
      SET 
        balance_coins = balance_coins + v_old_record.amount,
        balance_vouchers = balance_vouchers + v_old_record.amount
      WHERE user_id = v_old_record.user_id;
    ELSE
      -- Create wallet if it doesn't exist
      INSERT INTO wallets (user_id, balance_coins, balance_vouchers)
      VALUES (v_old_record.user_id, v_old_record.amount, v_old_record.amount);
    END IF;

  -- Handle STATUS UPDATE operation
  ELSIF p_operation = 'update_status' AND p_new_status IS NOT NULL THEN
    -- Update payment status
    UPDATE payments 
    SET status = p_new_status
    WHERE id = p_payment_id
    RETURNING * INTO v_new_record;

  ELSE
    RAISE EXCEPTION 'Neplatná operace nebo stav platby';
  END IF;

  -- Log admin action
  INSERT INTO admin_actions (
    admin_id,
    action_type,
    target_table,
    target_id,
    notes,
    metadata
  ) VALUES (
    v_admin_id,
    CONCAT('payment_', p_operation),
    'payments',
    p_payment_id,
    CASE 
      WHEN p_operation = 'refund' THEN CONCAT('Refundována platba: ', v_old_record.amount, ' Kč pro ', v_user_email)
      ELSE CONCAT('Změna stavu platby na: ', p_new_status, ' pro ', v_user_email)
    END,
    jsonb_build_object(
      'old_data', to_jsonb(v_old_record),
      'new_data', to_jsonb(v_new_record),
      'user_email', v_user_email,
      'operation', p_operation,
      'refund_amount', CASE WHEN p_operation = 'refund' THEN v_old_record.amount ELSE NULL END
    )
  );

  -- Prepare Sofinity payload
  v_payload := jsonb_build_object(
    'event_name', CONCAT('payment_', p_operation),
    'payment_id', p_payment_id,
    'old_status', v_old_record.status,
    'new_status', v_new_record.status,
    'amount', v_old_record.amount,
    'user_email', v_user_email,
    'admin_id', v_admin_id,
    'timestamp', now()
  );

  -- Send event to Sofinity
  PERFORM notify_sofinity_event(
    CONCAT('payment_', p_operation),
    v_admin_id,
    NULL,
    v_payload
  );

  -- Return success response
  RETURN json_build_object(
    'success', true,
    'message', CASE 
      WHEN p_operation = 'refund' THEN 'Platba byla úspěšně refundována'
      ELSE 'Stav platby byl úspěšně změněn'
    END,
    'payment_id', p_payment_id,
    'payment_data', row_to_json(v_new_record)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba při správě platby: %', SQLERRM;
END;
$$;

-- ============================================================================
-- NOTIFICATION MANAGEMENT FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_manage_notification(
  p_notification_id uuid DEFAULT NULL,
  p_user_email text DEFAULT NULL,
  p_type text DEFAULT 'info',
  p_title text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_operation text DEFAULT 'create'
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_notification_id uuid;
  v_user_id uuid;
  v_old_record notifications%rowtype;
  v_new_record notifications%rowtype;
  v_user_name text;
  v_payload jsonb;
  v_notification_count integer := 0;
BEGIN
  -- Get current admin user
  v_admin_id := auth.uid();
  
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = v_admin_id 
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat oznámení';
  END IF;

  -- Handle BULK CREATE operation
  IF p_operation = 'bulk_create' THEN
    -- Validate required fields for bulk creation
    IF p_type IS NULL OR p_title IS NULL OR p_message IS NULL THEN
      RAISE EXCEPTION 'Typ, titul a zpráva jsou povinné pro hromadné vytvoření';
    END IF;

    -- Create notifications for all users
    INSERT INTO notifications (user_id, type, title, message, status)
    SELECT u.id, p_type, p_title, p_message, 'sent'
    FROM users u;

    GET DIAGNOSTICS v_notification_count = ROW_COUNT;

    -- Log admin action for bulk operation
    INSERT INTO admin_actions (
      admin_id,
      action_type,
      target_table,
      target_id,
      notes,
      metadata
    ) VALUES (
      v_admin_id,
      'notification_bulk_create',
      'notifications',
      NULL,
      CONCAT('Hromadně odesláno ', v_notification_count, ' oznámení: ', p_title),
      jsonb_build_object(
        'type', p_type,
        'title', p_title,
        'message', p_message,
        'count', v_notification_count,
        'operation', p_operation
      )
    );

    -- Prepare Sofinity payload for bulk
    v_payload := jsonb_build_object(
      'event_name', 'notification_bulk_sent',
      'type', p_type,
      'title', p_title,
      'message', p_message,
      'recipient_count', v_notification_count,
      'admin_id', v_admin_id,
      'timestamp', now()
    );

    -- Send event to Sofinity
    PERFORM notify_sofinity_event(
      'notification_bulk_sent',
      v_admin_id,
      NULL,
      v_payload
    );

    RETURN json_build_object(
      'success', true,
      'message', CONCAT('Úspěšně odesláno ', v_notification_count, ' oznámení'),
      'notification_count', v_notification_count
    );

  -- Handle DELETE operation
  ELSIF p_operation = 'delete' AND p_notification_id IS NOT NULL THEN
    -- Get old record for logging
    SELECT * INTO v_old_record
    FROM notifications
    WHERE id = p_notification_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Oznámení nebylo nalezeno';
    END IF;

    -- Delete notification
    DELETE FROM notifications WHERE id = p_notification_id;
    v_notification_id := p_notification_id;

  -- Handle CREATE operation
  ELSE
    -- Validate required fields for single creation
    IF p_user_email IS NULL OR p_type IS NULL OR p_title IS NULL OR p_message IS NULL THEN
      RAISE EXCEPTION 'Email uživatele, typ, titul a zpráva jsou povinné';
    END IF;

    -- Find user by email
    SELECT id, name INTO v_user_id, v_user_name
    FROM users
    WHERE email = p_user_email;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Uživatel s emailem % nebyl nalezen', p_user_email;
    END IF;

    -- Create new notification
    INSERT INTO notifications (user_id, type, title, message, status)
    VALUES (v_user_id, p_type, p_title, p_message, 'sent')
    RETURNING * INTO v_new_record;

    v_notification_id := v_new_record.id;
  END IF;

  -- Log admin action (for non-bulk operations)
  IF p_operation != 'bulk_create' THEN
    INSERT INTO admin_actions (
      admin_id,
      action_type,
      target_table,
      target_id,
      notes,
      metadata
    ) VALUES (
      v_admin_id,
      CONCAT('notification_', p_operation),
      'notifications',
      v_notification_id,
      CASE 
        WHEN p_operation = 'create' THEN CONCAT('Odesláno oznámení: ', p_title, ' pro ', p_user_email)
        WHEN p_operation = 'delete' THEN CONCAT('Smazáno oznámení: ', v_old_record.title)
        ELSE CONCAT('Oznámení operace: ', p_operation)
      END,
      jsonb_build_object(
        'old_data', CASE WHEN p_operation = 'delete' THEN to_jsonb(v_old_record) ELSE NULL END,
        'new_data', CASE WHEN p_operation = 'create' THEN to_jsonb(v_new_record) ELSE NULL END,
        'user_email', p_user_email,
        'operation', p_operation
      )
    );

    -- Prepare Sofinity payload
    v_payload := jsonb_build_object(
      'event_name', CONCAT('notification_', p_operation),
      'notification_id', v_notification_id,
      'type', COALESCE(v_new_record.type, v_old_record.type, p_type),
      'title', COALESCE(v_new_record.title, v_old_record.title, p_title),
      'user_email', p_user_email,
      'admin_id', v_admin_id,
      'timestamp', now()
    );

    -- Send event to Sofinity
    PERFORM notify_sofinity_event(
      CONCAT('notification_', p_operation),
      v_admin_id,
      NULL,
      v_payload
    );
  END IF;

  -- Return success response
  RETURN json_build_object(
    'success', true,
    'message', CASE 
      WHEN p_operation = 'create' THEN 'Oznámení bylo úspěšně odesláno'
      WHEN p_operation = 'delete' THEN 'Oznámení bylo úspěšně smazáno'
      ELSE 'Operace byla úspěšně dokončena'
    END,
    'notification_id', v_notification_id,
    'notification_data', CASE WHEN p_operation != 'delete' THEN row_to_json(v_new_record) ELSE NULL END
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba při správě oznámení: %', SQLERRM;
END;
$$;

-- ============================================================================
-- ENHANCED SUMMARY AND REPORTING FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_summary_dashboard()
RETURNS TABLE(
  contests_summary text,
  bonus_prizes_summary text,
  vouchers_summary text,
  payments_summary text,
  notifications_summary text,
  recent_actions text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH contest_data AS (
    SELECT STRING_AGG(
      CONCAT(c.title, ' (', c.status, ') - ', 
             COALESCE(ticket_counts.count, 0), '/', c.ticket_count, ' tiketů'),
      ', ' ORDER BY c.created_at DESC
    ) as contests_text
    FROM contests c
    LEFT JOIN (
      SELECT contest_id, COUNT(*) as count
      FROM tickets
      GROUP BY contest_id
    ) ticket_counts ON c.id = ticket_counts.contest_id
  ),
  bonus_data AS (
    SELECT STRING_AGG(
      CONCAT('Soutěž ', SUBSTRING(c.title, 1, 20), ': ', 
             COUNT(bp.id), ' bonusů (', 
             COUNT(CASE WHEN bp.status = 'won' THEN 1 END), ' vyhráno)'),
      ', ' ORDER BY c.title
    ) as bonus_text
    FROM contests c
    LEFT JOIN bonus_prizes bp ON c.id = bp.contest_id
    GROUP BY c.id, c.title
  ),
  voucher_data AS (
    SELECT STRING_AGG(
      CONCAT(v.code, ': ', v.value, ' Kč (', 
             CASE WHEN v.redeemed THEN 'uplatněno' ELSE 'aktivní' END, ')'),
      ', ' ORDER BY v.created_at DESC
    ) as voucher_text
    FROM vouchers v
    ORDER BY v.created_at DESC
    LIMIT 10
  ),
  payment_data AS (
    SELECT STRING_AGG(
      CONCAT(p.amount, ' Kč (', p.status, ') - ', u.email),
      ', ' ORDER BY p.created_at DESC
    ) as payment_text
    FROM payments p
    LEFT JOIN users u ON p.user_id = u.id
    ORDER BY p.created_at DESC
    LIMIT 10
  ),
  notification_data AS (
    SELECT STRING_AGG(
      CONCAT(n.title, ' (', n.type, ') pro ', u.email),
      ', ' ORDER BY n.created_at DESC
    ) as notification_text
    FROM notifications n
    LEFT JOIN users u ON n.user_id = u.id
    ORDER BY n.created_at DESC
    LIMIT 5
  ),
  action_data AS (
    SELECT STRING_AGG(
      CONCAT(aa.action_type, ': ', 
             SUBSTRING(aa.notes, 1, 50),
             CASE WHEN LENGTH(aa.notes) > 50 THEN '...' ELSE '' END,
             ' (', aa.timestamp::date, ')'),
      ', ' ORDER BY aa.timestamp DESC
    ) as action_text
    FROM admin_actions aa
    ORDER BY aa.timestamp DESC
    LIMIT 10
  )
  SELECT 
    COALESCE(cd.contests_text, 'Žádné soutěže'),
    COALESCE(bd.bonus_text, 'Žádné bonusové výhry'),
    COALESCE(vd.voucher_text, 'Žádné vouchery'),
    COALESCE(pd.payment_text, 'Žádné platby'),
    COALESCE(nd.notification_text, 'Žádná oznámení'),
    COALESCE(ad.action_text, 'Žádné admin akce')
  FROM contest_data cd
  CROSS JOIN bonus_data bd
  CROSS JOIN voucher_data vd
  CROSS JOIN payment_data pd
  CROSS JOIN notification_data nd
  CROSS JOIN action_data ad;
END;
$$;

-- ============================================================================
-- SOFINITY EVENT VALIDATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_sofinity_events(
  p_hours_back integer DEFAULT 24
) RETURNS TABLE(
  event_name text,
  count bigint,
  latest_timestamp timestamp with time zone,
  sample_metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    el.event_name,
    COUNT(*) as count,
    MAX(el.timestamp) as latest_timestamp,
    (array_agg(el.metadata ORDER BY el.timestamp DESC))[1] as sample_metadata
  FROM event_logs el
  WHERE el.timestamp >= (now() - (p_hours_back || ' hours')::interval)
  GROUP BY el.event_name
  ORDER BY count DESC, latest_timestamp DESC;
END;
$$;