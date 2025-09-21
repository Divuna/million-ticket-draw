-- OneMil Admin Automated Test and Validation Functions
-- Comprehensive backend testing for CRUD, Security, Audit, and Sofinity Integration

-- ============================================================================
-- TEST RESULT STRUCTURES AND UTILITIES
-- ============================================================================

-- Function to create standardized test results
CREATE OR REPLACE FUNCTION public.create_test_result(
  p_test_name text,
  p_status text, -- 'passed', 'failed', 'running', 'pending'
  p_message text DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_execution_time_ms integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN jsonb_build_object(
    'test_name', p_test_name,
    'status', p_status,
    'message', COALESCE(p_message, 
      CASE 
        WHEN p_status = 'passed' THEN 'Test prošel úspěšně'
        WHEN p_status = 'failed' THEN 'Test selhal'
        WHEN p_status = 'running' THEN 'Test probíhá'
        ELSE 'Test čeká na spuštění'
      END
    ),
    'details', COALESCE(p_details, '{}'::jsonb),
    'execution_time_ms', p_execution_time_ms,
    'timestamp', now()
  );
END;
$$;

-- ============================================================================
-- CRUD TEST SUITE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.test_admin_crud_operations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_start_time timestamp;
  v_execution_time integer;
  v_test_results jsonb[] := '{}';
  v_result jsonb;
  v_contest_result jsonb;
  v_voucher_result jsonb;
  v_payment_result jsonb;
  v_notification_result jsonb;
  v_test_user_email text := 'test@onemil.cz';
  v_test_user_id uuid;
  v_test_contest_id uuid;
  v_test_payment_id uuid;
  v_admin_count integer;
BEGIN
  v_start_time := clock_timestamp();

  -- Check if admin user exists
  SELECT COUNT(*) INTO v_admin_count
  FROM users 
  WHERE role IN ('admin', 'superadmin');

  IF v_admin_count = 0 THEN
    RETURN create_test_result(
      'CRUD Test Suite',
      'failed',
      'Žádný admin uživatel nenalezen pro testování',
      jsonb_build_object('admin_count', v_admin_count)
    );
  END IF;

  -- Create test user if doesn't exist
  INSERT INTO users (email, name, role)
  VALUES (v_test_user_email, 'Test User', 'user')
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_test_user_id;

  IF v_test_user_id IS NULL THEN
    SELECT id INTO v_test_user_id
    FROM users
    WHERE email = v_test_user_email;
  END IF;

  -- Test Contest Management
  BEGIN
    v_result := admin_manage_contest(
      p_title => 'Test Soutěž CRUD',
      p_description => 'Testovací soutěž pro automatické testy',
      p_main_prize => 'Test Hlavní Cena',
      p_status => 'draft',
      p_operation => 'create'
    );

    IF (v_result->>'success')::boolean THEN
      v_test_contest_id := (v_result->'contest_id')::uuid;
      v_test_results := v_test_results || create_test_result(
        'Contest Create',
        'passed',
        'Soutěž úspěšně vytvořena: ' || (v_result->>'message'),
        jsonb_build_object('contest_id', v_test_contest_id)
      );
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Contest Create',
        'failed',
        'Vytvoření soutěže selhalo: ' || COALESCE(v_result->>'message', 'Neznámá chyba')
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Contest Create',
        'failed',
        'Výjimka při vytváření soutěže: ' || SQLERRM
      );
  END;

  -- Test Voucher Management  
  BEGIN
    v_result := admin_manage_voucher(
      p_user_email => v_test_user_email,
      p_value => 100,
      p_operation => 'create'
    );

    IF (v_result->>'success')::boolean THEN
      v_test_results := v_test_results || create_test_result(
        'Voucher Create',
        'passed',
        'Voucher úspěšně vytvořen: ' || (v_result->>'message'),
        jsonb_build_object('voucher_id', v_result->'voucher_id')
      );
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Voucher Create',
        'failed',
        'Vytvoření voucheru selhalo: ' || COALESCE(v_result->>'message', 'Neznámá chyba')
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Voucher Create',
        'failed',
        'Výjimka při vytváření voucheru: ' || SQLERRM
      );
  END;

  -- Test Notification Management
  BEGIN
    v_result := admin_manage_notification(
      p_user_email => v_test_user_email,
      p_type => 'info',
      p_title => 'Test Oznámení',
      p_message => 'Testovací zpráva pro CRUD testy',
      p_operation => 'create'
    );

    IF (v_result->>'success')::boolean THEN
      v_test_results := v_test_results || create_test_result(
        'Notification Create',
        'passed',
        'Oznámení úspěšně odesláno: ' || (v_result->>'message'),
        jsonb_build_object('notification_id', v_result->'notification_id')
      );
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Notification Create',
        'failed',
        'Odeslání oznámení selhalo: ' || COALESCE(v_result->>'message', 'Neznámá chyba')
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Notification Create',
        'failed',
        'Výjimka při odesílání oznámení: ' || SQLERRM
      );
  END;

  -- Test Bulk Notifications
  BEGIN
    v_result := admin_manage_notification(
      p_type => 'announcement',
      p_title => 'Hromadné Test Oznámení',
      p_message => 'Testovací hromadná zpráva',
      p_operation => 'bulk_create'
    );

    IF (v_result->>'success')::boolean THEN
      v_test_results := v_test_results || create_test_result(
        'Bulk Notification',
        'passed',
        'Hromadné oznámení úspěšně odesláno: ' || (v_result->>'message'),
        jsonb_build_object('notification_count', v_result->'notification_count')
      );
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Bulk Notification',
        'failed',
        'Hromadné oznámení selhalo: ' || COALESCE(v_result->>'message', 'Neznámá chyba')
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Bulk Notification',
        'failed',
        'Výjimka při hromadném oznámení: ' || SQLERRM
      );
  END;

  v_execution_time := EXTRACT(epoch FROM (clock_timestamp() - v_start_time)) * 1000;

  RETURN jsonb_build_object(
    'suite_name', 'CRUD Test Suite',
    'total_tests', array_length(v_test_results, 1),
    'passed_tests', (
      SELECT COUNT(*) 
      FROM unnest(v_test_results) AS t(result)
      WHERE t.result->>'status' = 'passed'
    ),
    'failed_tests', (
      SELECT COUNT(*) 
      FROM unnest(v_test_results) AS t(result)
      WHERE t.result->>'status' = 'failed'
    ),
    'execution_time_ms', v_execution_time,
    'timestamp', now(),
    'test_results', to_jsonb(v_test_results)
  );
END;
$$;

-- ============================================================================
-- SECURITY AND RLS VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.test_admin_security_rls()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_start_time timestamp;
  v_execution_time integer;
  v_test_results jsonb[] := '{}';
  v_current_role text;
  v_admin_count integer;
  v_rls_enabled boolean;
  v_policy_count integer;
BEGIN
  v_start_time := clock_timestamp();

  -- Test get_current_user_role function
  BEGIN
    v_current_role := get_current_user_role();
    
    IF v_current_role IN ('admin', 'superadmin') THEN
      v_test_results := v_test_results || create_test_result(
        'Current User Role',
        'passed',
        'Aktuální uživatel má admin roli: ' || v_current_role,
        jsonb_build_object('role', v_current_role)
      );
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Current User Role',
        'failed',
        'Aktuální uživatel nemá admin roli: ' || COALESCE(v_current_role, 'NULL'),
        jsonb_build_object('role', v_current_role)
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Current User Role',
        'failed',
        'Chyba při získávání role: ' || SQLERRM
      );
  END;

  -- Check RLS is enabled on critical tables
  SELECT COUNT(*) INTO v_admin_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname IN ('contests', 'bonus_prizes', 'vouchers', 'payments', 'notifications', 'admin_actions')
    AND n.nspname = 'public'
    AND c.relrowsecurity = true;

  v_test_results := v_test_results || create_test_result(
    'RLS Enabled Check',
    CASE WHEN v_admin_count >= 6 THEN 'passed' ELSE 'failed' END,
    'RLS povoleno na ' || v_admin_count || ' z 6 kritických tabulek',
    jsonb_build_object('enabled_tables', v_admin_count, 'required_tables', 6)
  );

  -- Check admin policies exist
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('contests', 'bonus_prizes', 'vouchers', 'payments', 'notifications', 'admin_actions')
    AND (policyname ILIKE '%admin%' OR qual ILIKE '%admin%' OR qual ILIKE '%superadmin%');

  v_test_results := v_test_results || create_test_result(
    'Admin Policies Check',
    CASE WHEN v_policy_count >= 6 THEN 'passed' ELSE 'failed' END,
    'Nalezeno ' || v_policy_count || ' admin politik pro kritické tabulky',
    jsonb_build_object('admin_policies', v_policy_count)
  );

  -- Test admin table access
  BEGIN
    SELECT COUNT(*) INTO v_admin_count FROM contests WHERE id IS NOT NULL;
    v_test_results := v_test_results || create_test_result(
      'Contests Table Access',
      'passed',
      'Přístup k tabulce contests: ' || v_admin_count || ' záznamů',
      jsonb_build_object('record_count', v_admin_count)
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Contests Table Access',
        'failed',
        'Chyba při přístupu k tabulce contests: ' || SQLERRM
      );
  END;

  BEGIN
    SELECT COUNT(*) INTO v_admin_count FROM admin_actions WHERE id IS NOT NULL;
    v_test_results := v_test_results || create_test_result(
      'Admin Actions Table Access',
      'passed',
      'Přístup k tabulce admin_actions: ' || v_admin_count || ' záznamů',
      jsonb_build_object('record_count', v_admin_count)
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Admin Actions Table Access',
        'failed',
        'Chyba při přístupu k tabulce admin_actions: ' || SQLERRM
      );
  END;

  v_execution_time := EXTRACT(epoch FROM (clock_timestamp() - v_start_time)) * 1000;

  RETURN jsonb_build_object(
    'suite_name', 'Security & RLS Validation',
    'total_tests', array_length(v_test_results, 1),
    'passed_tests', (
      SELECT COUNT(*) 
      FROM unnest(v_test_results) AS t(result)
      WHERE t.result->>'status' = 'passed'
    ),
    'failed_tests', (
      SELECT COUNT(*) 
      FROM unnest(v_test_results) AS t(result)
      WHERE t.result->>'status' = 'failed'
    ),
    'execution_time_ms', v_execution_time,
    'timestamp', now(),
    'test_results', to_jsonb(v_test_results)
  );
END;
$$;

-- ============================================================================
-- AUDIT LOGGING VERIFICATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.test_audit_logging()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_start_time timestamp;
  v_execution_time integer;
  v_test_results jsonb[] := '{}';
  v_initial_count integer;
  v_final_count integer;
  v_latest_action admin_actions%rowtype;
  v_test_result jsonb;
BEGIN
  v_start_time := clock_timestamp();

  -- Get initial admin_actions count
  SELECT COUNT(*) INTO v_initial_count FROM admin_actions;

  -- Perform a test operation that should log
  BEGIN
    v_test_result := admin_manage_voucher(
      p_user_email => 'test@onemil.cz',
      p_value => 50,
      p_operation => 'create'
    );

    -- Check if admin_actions count increased
    SELECT COUNT(*) INTO v_final_count FROM admin_actions;

    IF v_final_count > v_initial_count THEN
      v_test_results := v_test_results || create_test_result(
        'Audit Logging - Count Increase',
        'passed',
        'Admin akce byla zaznamenána (počet vzrostl z ' || v_initial_count || ' na ' || v_final_count || ')',
        jsonb_build_object('initial_count', v_initial_count, 'final_count', v_final_count)
      );
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Audit Logging - Count Increase',
        'failed',
        'Admin akce nebyla zaznamenána (počet se nezměnil: ' || v_initial_count || ')',
        jsonb_build_object('initial_count', v_initial_count, 'final_count', v_final_count)
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Audit Logging - Count Increase',
        'failed',
        'Chyba při testování audit loggingu: ' || SQLERRM
      );
  END;

  -- Check latest audit entry structure
  BEGIN
    SELECT * INTO v_latest_action
    FROM admin_actions
    ORDER BY timestamp DESC
    LIMIT 1;

    IF v_latest_action.id IS NOT NULL THEN
      -- Check required fields
      IF v_latest_action.admin_id IS NOT NULL 
         AND v_latest_action.action_type IS NOT NULL
         AND v_latest_action.target_table IS NOT NULL
         AND v_latest_action.notes IS NOT NULL
         AND v_latest_action.metadata IS NOT NULL THEN
        
        v_test_results := v_test_results || create_test_result(
          'Audit Entry Structure',
          'passed',
          'Audit záznam má všechny povinné pole: ' || v_latest_action.action_type,
          jsonb_build_object(
            'action_type', v_latest_action.action_type,
            'target_table', v_latest_action.target_table,
            'has_metadata', v_latest_action.metadata IS NOT NULL
          )
        );
      ELSE
        v_test_results := v_test_results || create_test_result(
          'Audit Entry Structure',
          'failed',
          'Audit záznam má chybějící povinná pole',
          jsonb_build_object('latest_action', row_to_json(v_latest_action))
        );
      END IF;
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Audit Entry Structure',
        'failed',
        'Žádný audit záznam nebyl nalezen'
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Audit Entry Structure',
        'failed',
        'Chyba při kontrole struktury audit záznamu: ' || SQLERRM
      );
  END;

  -- Check metadata content
  IF v_latest_action.metadata IS NOT NULL AND jsonb_typeof(v_latest_action.metadata) = 'object' THEN
    IF v_latest_action.metadata ? 'operation' AND v_latest_action.metadata ? 'new_data' THEN
      v_test_results := v_test_results || create_test_result(
        'Audit Metadata Quality',
        'passed',
        'Metadata obsahuje očekávané klíče (operation, new_data)',
        jsonb_build_object('metadata_keys', jsonb_object_keys(v_latest_action.metadata))
      );
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Audit Metadata Quality',
        'failed',
        'Metadata neobsahuje očekávané klíče',
        jsonb_build_object('metadata', v_latest_action.metadata)
      );
    END IF;
  END IF;

  v_execution_time := EXTRACT(epoch FROM (clock_timestamp() - v_start_time)) * 1000;

  RETURN jsonb_build_object(
    'suite_name', 'Audit Logging Verification',
    'total_tests', array_length(v_test_results, 1),
    'passed_tests', (
      SELECT COUNT(*) 
      FROM unnest(v_test_results) AS t(result)
      WHERE t.result->>'status' = 'passed'
    ),
    'failed_tests', (
      SELECT COUNT(*) 
      FROM unnest(v_test_results) AS t(result)
      WHERE t.result->>'status' = 'failed'
    ),
    'execution_time_ms', v_execution_time,
    'timestamp', now(),
    'test_results', to_jsonb(v_test_results)
  );
END;
$$;

-- ============================================================================
-- SOFINITY INTEGRATION CHECKS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.test_sofinity_integration()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER  
SET search_path = 'public'
AS $$
DECLARE
  v_start_time timestamp;
  v_execution_time integer;
  v_test_results jsonb[] := '{}';
  v_initial_event_count integer;
  v_final_event_count integer;
  v_latest_event event_logs%rowtype;
  v_test_result jsonb;
BEGIN
  v_start_time := clock_timestamp();

  -- Get initial event_logs count
  SELECT COUNT(*) INTO v_initial_event_count FROM event_logs;

  -- Test event creation through admin operation
  BEGIN
    v_test_result := admin_manage_voucher(
      p_user_email => 'test@onemil.cz',
      p_value => 25,
      p_operation => 'create'
    );

    -- Check if event_logs count increased
    SELECT COUNT(*) INTO v_final_event_count FROM event_logs;

    IF v_final_event_count > v_initial_event_count THEN
      v_test_results := v_test_results || create_test_result(
        'Event Logging - Count Increase',
        'passed',
        'Sofinity event byl zaznamenán (počet vzrostl z ' || v_initial_event_count || ' na ' || v_final_event_count || ')',
        jsonb_build_object('initial_count', v_initial_event_count, 'final_count', v_final_event_count)
      );
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Event Logging - Count Increase',
        'failed',
        'Sofinity event nebyl zaznamenán (počet se nezměnil: ' || v_initial_event_count || ')',
        jsonb_build_object('initial_count', v_initial_event_count, 'final_count', v_final_event_count)
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Event Logging - Count Increase',
        'failed',
        'Chyba při testování Sofinity event loggingu: ' || SQLERRM
      );
  END;

  -- Check latest event structure
  BEGIN
    SELECT * INTO v_latest_event
    FROM event_logs
    ORDER BY timestamp DESC
    LIMIT 1;

    IF v_latest_event.id IS NOT NULL THEN
      -- Check required fields
      IF v_latest_event.event_name IS NOT NULL 
         AND v_latest_event.timestamp IS NOT NULL
         AND v_latest_event.metadata IS NOT NULL THEN
        
        v_test_results := v_test_results || create_test_result(
          'Event Entry Structure',
          'passed',
          'Event záznam má všechny povinné pole: ' || v_latest_event.event_name,
          jsonb_build_object(
            'event_name', v_latest_event.event_name,
            'has_timestamp', v_latest_event.timestamp IS NOT NULL,
            'has_metadata', v_latest_event.metadata IS NOT NULL
          )
        );
      ELSE
        v_test_results := v_test_results || create_test_result(
          'Event Entry Structure',
          'failed',
          'Event záznam má chybějící povinná pole',
          jsonb_build_object('latest_event', row_to_json(v_latest_event))
        );
      END IF;
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Event Entry Structure',
        'failed',
        'Žádný event záznam nebyl nalezen'
      );
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Event Entry Structure',
        'failed',
        'Chyba při kontrole struktury event záznamu: ' || SQLERRM
      );
  END;

  -- Test validation function
  BEGIN
    SELECT * FROM validate_sofinity_events(1) LIMIT 1;
    v_test_results := v_test_results || create_test_result(
      'Event Validation Function',
      'passed',
      'Funkce validate_sofinity_events() funguje správně',
      jsonb_build_object('validation_available', true)
    );
  EXCEPTION
    WHEN OTHERS THEN
      v_test_results := v_test_results || create_test_result(
        'Event Validation Function',
        'failed',
        'Chyba při testování validate_sofinity_events(): ' || SQLERRM
      );
  END;

  -- Check event metadata quality
  IF v_latest_event.metadata IS NOT NULL AND jsonb_typeof(v_latest_event.metadata) = 'object' THEN
    IF v_latest_event.metadata ? 'admin_id' AND v_latest_event.metadata ? 'timestamp' THEN
      v_test_results := v_test_results || create_test_result(
        'Event Metadata Quality',
        'passed',
        'Event metadata obsahuje očekávané klíče (admin_id, timestamp)',
        jsonb_build_object('metadata_keys', jsonb_object_keys(v_latest_event.metadata))
      );
    ELSE
      v_test_results := v_test_results || create_test_result(
        'Event Metadata Quality',
        'failed',
        'Event metadata neobsahuje očekávané klíče',
        jsonb_build_object('metadata', v_latest_event.metadata)
      );
    END IF;
  END IF;

  v_execution_time := EXTRACT(epoch FROM (clock_timestamp() - v_start_time)) * 1000;

  RETURN jsonb_build_object(
    'suite_name', 'Sofinity Integration Checks',
    'total_tests', array_length(v_test_results, 1),
    'passed_tests', (
      SELECT COUNT(*) 
      FROM unnest(v_test_results) AS t(result)
      WHERE t.result->>'status' = 'passed'
    ),
    'failed_tests', (
      SELECT COUNT(*) 
      FROM unnest(v_test_results) AS t(result)
      WHERE t.result->>'status' = 'failed'
    ),
    'execution_time_ms', v_execution_time,
    'timestamp', now(),
    'test_results', to_jsonb(v_test_results)
  );
END;
$$;

-- ============================================================================
-- COMPREHENSIVE TEST RUNNER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.run_complete_admin_test_suite()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_start_time timestamp;
  v_total_execution_time integer;
  v_crud_results jsonb;
  v_security_results jsonb;
  v_audit_results jsonb;
  v_sofinity_results jsonb;
  v_all_results jsonb[] := '{}';
  v_total_tests integer := 0;
  v_total_passed integer := 0;
  v_total_failed integer := 0;
BEGIN
  v_start_time := clock_timestamp();

  -- Run all test suites
  v_crud_results := test_admin_crud_operations();
  v_security_results := test_admin_security_rls();
  v_audit_results := test_audit_logging();
  v_sofinity_results := test_sofinity_integration();

  v_all_results := ARRAY[v_crud_results, v_security_results, v_audit_results, v_sofinity_results];

  -- Calculate totals
  SELECT 
    COALESCE(SUM((result->>'total_tests')::integer), 0),
    COALESCE(SUM((result->>'passed_tests')::integer), 0),
    COALESCE(SUM((result->>'failed_tests')::integer), 0)
  INTO v_total_tests, v_total_passed, v_total_failed
  FROM unnest(v_all_results) AS t(result);

  v_total_execution_time := EXTRACT(epoch FROM (clock_timestamp() - v_start_time)) * 1000;

  RETURN jsonb_build_object(
    'suite_name', 'OneMil Admin Complete Test Suite',
    'overall_status', CASE 
      WHEN v_total_failed = 0 THEN 'all_passed'
      WHEN v_total_passed > v_total_failed THEN 'mostly_passed' 
      ELSE 'failed'
    END,
    'summary', jsonb_build_object(
      'total_tests', v_total_tests,
      'passed_tests', v_total_passed,
      'failed_tests', v_total_failed,
      'success_rate', CASE 
        WHEN v_total_tests > 0 THEN ROUND((v_total_passed::numeric / v_total_tests::numeric) * 100, 2)
        ELSE 0
      END
    ),
    'execution_time_ms', v_total_execution_time,
    'timestamp', now(),
    'test_suites', jsonb_build_object(
      'crud_tests', v_crud_results,
      'security_tests', v_security_results,
      'audit_tests', v_audit_results,
      'sofinity_tests', v_sofinity_results
    )
  );
END;
$$;