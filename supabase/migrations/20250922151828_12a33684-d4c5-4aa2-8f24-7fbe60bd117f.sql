-- Update CRUD test functions to use existing admin user

CREATE OR REPLACE FUNCTION public.test_admin_crud_operations()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_start_time TIMESTAMP;
  v_end_time TIMESTAMP;
  v_test_results JSON[];
  v_passed_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_test_user_id uuid;
  v_test_email text := 'divispavel2@gmail.com';
  v_setup_result json;
  v_validation_result json;
BEGIN
  v_start_time := NOW();
  v_test_results := ARRAY[]::JSON[];
  
  -- Test 1: Find existing admin user
  BEGIN
    SELECT id INTO v_test_user_id
    FROM users 
    WHERE email = v_test_email
    AND role IN ('admin', 'superadmin');
    
    IF v_test_user_id IS NULL THEN
      v_test_results := v_test_results || json_build_object(
        'test_name', 'Kontrola admin test uživatele',
        'status', 'failed',
        'message', 'Admin uživatel ' || v_test_email || ' nebyl nalezen',
        'execution_time_ms', 10
      );
    ELSE
      v_test_results := v_test_results || json_build_object(
        'test_name', 'Kontrola admin test uživatele',
        'status', 'passed',
        'message', 'Admin uživatel ' || v_test_email || ' nalezen',
        'execution_time_ms', 10
      );
      v_passed_count := v_passed_count + 1;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Kontrola admin test uživatele',
      'status', 'failed',
      'message', 'Chyba při hledání uživatele: ' || SQLERRM,
      'execution_time_ms', 10
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 2: Setup test data
  BEGIN
    SELECT setup_crud_test_data(v_test_email) INTO v_setup_result;
    
    IF (v_setup_result->>'success')::boolean THEN
      v_test_results := v_test_results || json_build_object(
        'test_name', 'Vytvoření CRUD test dat',
        'status', 'passed',
        'message', v_setup_result->>'message',
        'execution_time_ms', 120
      );
      v_passed_count := v_passed_count + 1;
    ELSE
      v_test_results := v_test_results || json_build_object(
        'test_name', 'Vytvoření CRUD test dat',
        'status', 'failed',
        'message', v_setup_result->>'message',
        'execution_time_ms', 120
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Vytvoření CRUD test dat',
      'status', 'failed',
      'message', 'Chyba při vytváření test dat: ' || SQLERRM,
      'execution_time_ms', 120
    );
  END;
  v_total_count := v_total_count + 1;
  
  -- Test 3: Validate created data
  BEGIN
    SELECT validate_crud_test_data(v_test_email) INTO v_validation_result;
    
    IF (v_validation_result->>'success')::boolean THEN
      v_test_results := v_test_results || json_build_object(
        'test_name', 'Validace CRUD test dat',
        'status', 'passed',
        'message', 'Všechna test data byla úspěšně vytvořena a validována',
        'execution_time_ms', 80,
        'details', v_validation_result->'test_data_validation'
      );
      v_passed_count := v_passed_count + 1;
    ELSE
      v_test_results := v_test_results || json_build_object(
        'test_name', 'Validace CRUD test dat',
        'status', 'failed',
        'message', v_validation_result->>'message',
        'execution_time_ms', 80
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_test_results := v_test_results || json_build_object(
      'test_name', 'Validace CRUD test dat',
      'status', 'failed',
      'message', 'Chyba při validaci dat: ' || SQLERRM,
      'execution_time_ms', 80
    );
  END;
  v_total_count := v_total_count + 1;
  
  v_end_time := NOW();
  
  RETURN json_build_object(
    'suite_name', 'CRUD Operations Testy',
    'total_tests', v_total_count,
    'passed_tests', v_passed_count,
    'failed_tests', v_total_count - v_passed_count,
    'execution_time_ms', EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000,
    'timestamp', v_end_time,
    'test_results', array_to_json(v_test_results)
  );
END;
$function$;