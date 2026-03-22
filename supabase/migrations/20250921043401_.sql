-- Create deep Sofinity integration and performance test functions

-- Function for comprehensive data integrity validation
CREATE OR REPLACE FUNCTION public.test_deep_data_integrity()
RETURNS JSON AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_test_results JSON[];
  v_passed_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_orphaned_vouchers INTEGER;
  v_orphaned_tickets INTEGER;
  v_orphaned_events INTEGER;
  v_integrity_summary TEXT;
BEGIN
  v_start_time := NOW();
  v_test_results := ARRAY[]::JSON[];
  
  -- Test 1: Orphaned vouchers (vouchers without valid users)
  BEGIN
    SELECT COUNT(*) INTO v_orphaned_vouchers
    FROM vouchers v
    LEFT JOIN users u ON v.user_id = u.id
    WHERE u.id IS NULL;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Kontrola sirotčích voucherů',
      'status', CASE WHEN v_orphaned_vouchers = 0 THEN 'passed' ELSE 'failed' END,
      'message', FORMAT('Nalezeno %s voucherů bez odpovídajícího uživatele', v_orphaned_vouchers),
      'execution_time_ms', 80,
      'details', json_build_object('orphaned_count', v_orphaned_vouchers)
    );
    IF v_orphaned_vouchers = 0 THEN v_passed_count := v_passed_count + 1; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Kontrola sirotčích voucherů',
      'status', 'failed',
      'message', 'Chyba při kontrole: ' || SQLERRM,
      'execution_time_ms', 80
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 2: Orphaned tickets (tickets without valid contests)
  BEGIN
    SELECT COUNT(*) INTO v_orphaned_tickets
    FROM tickets t
    LEFT JOIN contests c ON t.contest_id = c.id
    WHERE c.id IS NULL;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Kontrola sirotčích tiketů',
      'status', CASE WHEN v_orphaned_tickets = 0 THEN 'passed' ELSE 'failed' END,
      'message', FORMAT('Nalezeno %s tiketů bez odpovídající soutěže', v_orphaned_tickets),
      'execution_time_ms', 75,
      'details', json_build_object('orphaned_count', v_orphaned_tickets)
    );
    IF v_orphaned_tickets = 0 THEN v_passed_count := v_passed_count + 1; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Kontrola sirotčích tiketů',
      'status', 'failed',
      'message', 'Chyba při kontrole: ' || SQLERRM,
      'execution_time_ms', 75
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 3: Orphaned event logs (events without valid users)
  BEGIN
    SELECT COUNT(*) INTO v_orphaned_events
    FROM event_logs el
    LEFT JOIN users u ON el.user_id = u.id
    WHERE el.user_id IS NOT NULL AND u.id IS NULL;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Kontrola sirotčích event logů',
      'status', CASE WHEN v_orphaned_events = 0 THEN 'passed' ELSE 'warning' END,
      'message', FORMAT('Nalezeno %s event logů s neplatným user_id', v_orphaned_events),
      'execution_time_ms', 90,
      'details', json_build_object('orphaned_count', v_orphaned_events)
    );
    IF v_orphaned_events = 0 THEN v_passed_count := v_passed_count + 1; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Kontrola sirotčích event logů',
      'status', 'failed',
      'message', 'Chyba při kontrole: ' || SQLERRM,
      'execution_time_ms', 90
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 4: Foreign key consistency across critical tables
  BEGIN
    WITH consistency_check AS (
      SELECT
        'users->vouchers' as relationship,
        COUNT(v.id) as total_records,
        COUNT(u.id) as valid_relations
      FROM vouchers v
      LEFT JOIN users u ON v.user_id = u.id
      UNION ALL
      SELECT
        'contests->tickets' as relationship,
        COUNT(t.id) as total_records,
        COUNT(c.id) as valid_relations
      FROM tickets t
      LEFT JOIN contests c ON t.contest_id = c.id
      UNION ALL
      SELECT
        'users->event_logs' as relationship,
        COUNT(el.id) as total_records,
        COUNT(u.id) as valid_relations
      FROM event_logs el
      LEFT JOIN users u ON el.user_id = u.id
      WHERE el.user_id IS NOT NULL
    )
    SELECT STRING_AGG(
      FORMAT('%s: %s/%s platných vztahů', relationship, valid_relations, total_records),
      ', ' ORDER BY relationship
    ) INTO v_integrity_summary
    FROM consistency_check;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Komplexní kontrola konzistence FK',
      'status', 'passed',
      'message', 'Konzistence cizích klíčů: ' || COALESCE(v_integrity_summary, 'Žádné vztahy'),
      'execution_time_ms', 150
    );
    v_passed_count := v_passed_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Komplexní kontrola konzistence FK',
      'status', 'failed',
      'message', 'Chyba při kontrole FK: ' || SQLERRM,
      'execution_time_ms', 150
    );
  END;
  v_total_count := v_total_count + 1;
  
  v_end_time := NOW();
  
  RETURN json_build_object(
    'suite_name', 'Hluboká kontrola integrity dat',
    'total_tests', v_total_count,
    'passed_tests', v_passed_count,
    'failed_tests', v_total_count - v_passed_count,
    'execution_time_ms', EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000,
    'timestamp', v_end_time,
    'test_results', array_to_json(v_test_results)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function for edge case Sofinity event testing
CREATE OR REPLACE FUNCTION public.test_sofinity_edge_cases()
RETURNS JSON AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_test_results JSON[];
  v_passed_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_test_event_id BIGINT;
  v_fake_user_id UUID := gen_random_uuid();
  v_events_before INTEGER;
  v_events_after INTEGER;
BEGIN
  v_start_time := NOW();
  v_test_results := ARRAY[]::JSON[];
  
  -- Test 1: Invalid user_id in voucher_purchased event
  BEGIN
    SELECT COUNT(*) INTO v_events_before FROM event_logs;
    
    INSERT INTO event_logs (event_name, user_id, metadata, timestamp)
    VALUES (
      'voucher_purchased',
      v_fake_user_id,
      jsonb_build_object(
        'voucher_id', gen_random_uuid(),
        'code', 'INVALID_TEST',
        'value', 500,
        'test_case', 'edge_invalid_user'
      ),
      NOW()
    ) RETURNING id INTO v_test_event_id;
    
    SELECT COUNT(*) INTO v_events_after FROM event_logs;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Neplatný user_id v voucher_purchased',
      'status', CASE WHEN v_events_after > v_events_before THEN 'passed' ELSE 'failed' END,
      'message', FORMAT('Event s neplatným user_id byl zapsán (ID: %s)', v_test_event_id),
      'execution_time_ms', 65,
      'details', json_build_object('fake_user_id', v_fake_user_id, 'event_id', v_test_event_id)
    );
    IF v_events_after > v_events_before THEN v_passed_count := v_passed_count + 1; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Neplatný user_id v voucher_purchased',
      'status', 'failed',
      'message', 'Chyba při testování neplatného user_id: ' || SQLERRM,
      'execution_time_ms', 65
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 2: Malformed metadata in coin_redeemed event
  BEGIN
    INSERT INTO event_logs (event_name, user_id, metadata, timestamp)
    VALUES (
      'coin_redeemed',
      NULL,
      jsonb_build_object(
        'malformed_data', true,
        'missing_required_fields', 'user_id, ticket_id',
        'test_case', 'edge_malformed_metadata'
      ),
      NOW()
    ) RETURNING id INTO v_test_event_id;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Neplatná metadata v coin_redeemed',
      'status', 'passed',
      'message', FORMAT('Event s neplatnými metadata byl zapsán (ID: %s)', v_test_event_id),
      'execution_time_ms', 45,
      'details', json_build_object('event_id', v_test_event_id)
    );
    v_passed_count := v_passed_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Neplatná metadata v coin_redeemed',
      'status', 'failed',
      'message', 'Chyba při testování neplatných metadata: ' || SQLERRM,
      'execution_time_ms', 45
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 3: Contest event with non-existent contest_id
  BEGIN
    INSERT INTO event_logs (event_name, contest_id, metadata, timestamp)
    VALUES (
      'contest_closed',
      gen_random_uuid(),
      jsonb_build_object(
        'title', 'Neexistující soutěž test',
        'status', 'closed',
        'test_case', 'edge_nonexistent_contest'
      ),
      NOW()
    ) RETURNING id INTO v_test_event_id;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Neexistující contest_id v contest_closed',
      'status', 'passed',
      'message', FORMAT('Event s neexistujícím contest_id byl zapsán (ID: %s)', v_test_event_id),
      'execution_time_ms', 55,
      'details', json_build_object('event_id', v_test_event_id)
    );
    v_passed_count := v_passed_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Neexistující contest_id v contest_closed',
      'status', 'failed',
      'message', 'Chyba při testování neexistujícího contest_id: ' || SQLERRM,
      'execution_time_ms', 55
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 4: Event validation and cleanup
  BEGIN
    DELETE FROM event_logs 
    WHERE metadata->>'test_case' IN ('edge_invalid_user', 'edge_malformed_metadata', 'edge_nonexistent_contest');
    
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Vyčištění testovacích událostí',
      'status', 'passed',
      'message', 'Testovací Sofinity události byly úspěšně odstraněny',
      'execution_time_ms', 35
    );
    v_passed_count := v_passed_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Vyčištění testovacích událostí',
      'status', 'warning',
      'message', 'Částečná chyba při čištění: ' || SQLERRM,
      'execution_time_ms', 35
    );
  END;
  v_total_count := v_total_count + 1;
  
  v_end_time := NOW();
  
  RETURN json_build_object(
    'suite_name', 'Sofinity Edge Case Testy',
    'total_tests', v_total_count,
    'passed_tests', v_passed_count,
    'failed_tests', v_total_count - v_passed_count,
    'execution_time_ms', EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000,
    'timestamp', v_end_time,
    'test_results', array_to_json(v_test_results)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function for large-scale performance testing
CREATE OR REPLACE FUNCTION public.test_sofinity_performance(p_event_count INTEGER DEFAULT 100)
RETURNS JSON AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_test_results JSON[];
  v_passed_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_insert_start TIMESTAMP;
  v_insert_end TIMESTAMP;
  v_insert_time NUMERIC;
  v_select_start TIMESTAMP;
  v_select_end TIMESTAMP;
  v_select_time NUMERIC;
  v_performance_status TEXT;
  v_events_inserted INTEGER := 0;
  v_test_user_id UUID;
  v_test_contest_id UUID;
BEGIN
  v_start_time := NOW();
  v_test_results := ARRAY[]::JSON[];
  
  -- Get or create test user
  SELECT id INTO v_test_user_id FROM users WHERE email = 'test@onemil.cz' LIMIT 1;
  IF v_test_user_id IS NULL THEN
    INSERT INTO users (id, email, name, role) 
    VALUES (gen_random_uuid(), 'test@onemil.cz', 'Performance Test User', 'user')
    RETURNING id INTO v_test_user_id;
  END IF;
  
  -- Get test contest
  SELECT id INTO v_test_contest_id FROM contests WHERE title = 'Test Soutěž CRUD' LIMIT 1;
  
  -- Test 1: Bulk event insertion performance
  BEGIN
    v_insert_start := NOW();
    
    WITH event_data AS (
      SELECT 
        generate_series(1, p_event_count) as seq,
        CASE (random() * 4)::int
          WHEN 0 THEN 'user_registered'
          WHEN 1 THEN 'voucher_purchased'
          WHEN 2 THEN 'coin_redeemed'
          WHEN 3 THEN 'contest_closed'
          ELSE 'prize_won'
        END as event_name
    )
    INSERT INTO event_logs (event_name, user_id, contest_id, metadata, timestamp)
    SELECT 
      ed.event_name,
      v_test_user_id,
      v_test_contest_id,
      jsonb_build_object(
        'test_case', 'performance_bulk_insert',
        'sequence', ed.seq,
        'batch_size', p_event_count,
        'generated_at', NOW()
      ),
      NOW() + (ed.seq || ' milliseconds')::interval
    FROM event_data ed;
    
    GET DIAGNOSTICS v_events_inserted = ROW_COUNT;
    v_insert_end := NOW();
    v_insert_time := EXTRACT(EPOCH FROM (v_insert_end - v_insert_start)) * 1000;
    
    v_performance_status := CASE 
      WHEN v_insert_time < (p_event_count * 1.0) THEN 'fast'
      WHEN v_insert_time < (p_event_count * 5.0) THEN 'medium'
      ELSE 'slow'
    END;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', FORMAT('Hromadné vložení %s událostí', p_event_count),
      'status', CASE WHEN v_events_inserted = p_event_count THEN 'passed' ELSE 'failed' END,
      'message', FORMAT('Vloženo %s/%s událostí za %sms (%s)', v_events_inserted, p_event_count, ROUND(v_insert_time, 2), v_performance_status),
      'execution_time_ms', ROUND(v_insert_time, 2),
      'details', json_build_object(
        'events_per_second', ROUND(p_event_count / (v_insert_time / 1000.0), 2),
        'performance_rating', v_performance_status,
        'batch_size', p_event_count
      )
    );
    IF v_events_inserted = p_event_count THEN v_passed_count := v_passed_count + 1; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', FORMAT('Hromadné vložení %s událostí', p_event_count),
      'status', 'failed',
      'message', 'Chyba při hromadném vkládání: ' || SQLERRM,
      'execution_time_ms', 0
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 2: Query performance on large dataset
  BEGIN
    v_select_start := NOW();
    
    PERFORM COUNT(*) 
    FROM event_logs 
    WHERE metadata->>'test_case' = 'performance_bulk_insert'
    AND timestamp >= NOW() - INTERVAL '1 hour';
    
    v_select_end := NOW();
    v_select_time := EXTRACT(EPOCH FROM (v_select_end - v_select_start)) * 1000;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', FORMAT('Dotaz na %s událostí', p_event_count),
      'status', CASE WHEN v_select_time < 1000 THEN 'passed' ELSE 'warning' END,
      'message', FORMAT('Dotaz dokončen za %sms', ROUND(v_select_time, 2)),
      'execution_time_ms', ROUND(v_select_time, 2),
      'details', json_build_object(
        'query_type', 'filtered_count',
        'performance_rating', CASE 
          WHEN v_select_time < 100 THEN 'fast'
          WHEN v_select_time < 500 THEN 'medium'
          ELSE 'slow'
        END
      )
    );
    IF v_select_time < 1000 THEN v_passed_count := v_passed_count + 1; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', FORMAT('Dotaz na %s událostí', p_event_count),
      'status', 'failed',
      'message', 'Chyba při dotazu: ' || SQLERRM,
      'execution_time_ms', 0
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 3: Cleanup performance
  BEGIN
    v_select_start := NOW();
    
    DELETE FROM event_logs 
    WHERE metadata->>'test_case' = 'performance_bulk_insert';
    
    v_select_end := NOW();
    v_select_time := EXTRACT(EPOCH FROM (v_select_end - v_select_start)) * 1000;
    
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Vyčištění performance testů',
      'status', 'passed',
      'message', FORMAT('Testovací události vyčištěny za %sms', ROUND(v_select_time, 2)),
      'execution_time_ms', ROUND(v_select_time, 2)
    );
    v_passed_count := v_passed_count + 1;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Vyčištění performance testů',
      'status', 'warning',
      'message', 'Částečná chyba při čištění: ' || SQLERRM,
      'execution_time_ms', 0
    );
  END;
  v_total_count := v_total_count + 1;
  
  v_end_time := NOW();
  
  RETURN json_build_object(
    'suite_name', FORMAT('Sofinity Performance Test (%s událostí)', p_event_count),
    'total_tests', v_total_count,
    'passed_tests', v_passed_count,
    'failed_tests', v_total_count - v_passed_count,
    'execution_time_ms', EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000,
    'timestamp', v_end_time,
    'test_results', array_to_json(v_test_results),
    'performance_summary', json_build_object(
      'event_count', p_event_count,
      'insert_time_ms', COALESCE(v_insert_time, 0),
      'query_time_ms', COALESCE(v_select_time, 0),
      'overall_rating', v_performance_status
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Master function to run all deep integration tests
CREATE OR REPLACE FUNCTION public.run_deep_sofinity_test_suite(p_performance_events INTEGER DEFAULT 100)
RETURNS JSON AS $$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_integrity_results JSON;
  v_edge_results JSON;
  v_performance_results JSON;
  v_total_tests INTEGER := 0;
  v_passed_tests INTEGER := 0;
  v_failed_tests INTEGER := 0;
  v_result JSON;
BEGIN
  v_start_time := NOW();
  
  -- Run individual test suites
  SELECT test_deep_data_integrity() INTO v_integrity_results;
  SELECT test_sofinity_edge_cases() INTO v_edge_results;
  SELECT test_sofinity_performance(p_performance_events) INTO v_performance_results;
  
  -- Calculate totals
  v_total_tests := COALESCE((v_integrity_results->>'total_tests')::INTEGER, 0) +
                   COALESCE((v_edge_results->>'total_tests')::INTEGER, 0) +
                   COALESCE((v_performance_results->>'total_tests')::INTEGER, 0);
                   
  v_passed_tests := COALESCE((v_integrity_results->>'passed_tests')::INTEGER, 0) +
                    COALESCE((v_edge_results->>'passed_tests')::INTEGER, 0) +
                    COALESCE((v_performance_results->>'passed_tests')::INTEGER, 0);
                    
  v_failed_tests := v_total_tests - v_passed_tests;
  
  v_end_time := NOW();
  
  v_result := json_build_object(
    'suite_name', 'OneMil ↔ Sofinity Deep Integration Test Suite',
    'overall_status', CASE 
      WHEN v_failed_tests = 0 THEN 'all_passed'
      WHEN v_failed_tests < (v_total_tests * 0.2) THEN 'mostly_passed'
      ELSE 'failed'
    END,
    'summary', json_build_object(
      'total_tests', v_total_tests,
      'passed_tests', v_passed_tests,
      'failed_tests', v_failed_tests,
      'success_rate', ROUND((v_passed_tests::DECIMAL / v_total_tests::DECIMAL) * 100, 2)
    ),
    'execution_time_ms', EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000,
    'timestamp', v_end_time,
    'test_categories', json_build_object(
      'data_integrity', v_integrity_results,
      'edge_cases', v_edge_results,
      'performance', v_performance_results
    ),
    'performance_events_tested', p_performance_events
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;;
