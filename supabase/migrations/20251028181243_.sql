-- Fix search_path security warning for test_sofinity_player_sync function
-- Set search_path to prevent potential SQL injection

DROP FUNCTION IF EXISTS test_sofinity_player_sync();

CREATE OR REPLACE FUNCTION test_sofinity_player_sync()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_pg_http boolean;
  has_pg_net boolean;
  service_key text;
  response jsonb;
  http_response record;
  request_id bigint;
BEGIN
  -- Check which HTTP extension is available
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'http_post' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) INTO has_pg_http;
  
  SELECT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'http_post' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'net')
  ) INTO has_pg_net;

  -- Get service role key from settings or environment
  service_key := current_setting('app.settings.service_role_key', true);
  
  -- If not in settings, try to get from a settings table
  IF service_key IS NULL THEN
    SELECT value INTO service_key FROM public.settings WHERE key = 'service_role_key' LIMIT 1;
  END IF;

  -- Prepare test payload
  DECLARE
    test_payload jsonb := jsonb_build_object(
      'email', 'veru.enge@gmail.com',
      'player_id', '033c7a06-bba8-47b7-b214-0699b434a6b8',
      'device_type', 'web',
      'timestamp', now()
    );
    endpoint text := 'https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/player-sync-receiver';
  BEGIN
    
    -- Use pg_http (http_post)
    IF has_pg_http THEN
      SELECT * INTO http_response FROM http_post(
        endpoint,
        test_payload::text,
        'application/json'::text,
        jsonb_build_object(
          'Authorization', 'Bearer ' || COALESCE(service_key, 'MISSING_SERVICE_KEY')
        )
      );
      
      response := jsonb_build_object(
        'extension_used', 'pg_http',
        'status_code', http_response.status,
        'response_body', http_response.content::jsonb,
        'headers', http_response.headers,
        'test_payload', test_payload,
        'endpoint', endpoint,
        'service_key_configured', service_key IS NOT NULL
      );
      
    -- Use pg_net (net.http_post)
    ELSIF has_pg_net THEN
      SELECT net.http_post(
        url := endpoint,
        body := test_payload,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(service_key, 'MISSING_SERVICE_KEY')
        )
      ) INTO request_id;
      
      -- Wait briefly for response (pg_net is async)
      PERFORM pg_sleep(2);
      
      -- Fetch response from net._http_response
      SELECT 
        jsonb_build_object(
          'extension_used', 'pg_net',
          'request_id', request_id,
          'status_code', status_code,
          'response_body', content::jsonb,
          'test_payload', test_payload,
          'endpoint', endpoint,
          'service_key_configured', service_key IS NOT NULL,
          'note', 'pg_net is async - check net._http_response for full details'
        )
      INTO response
      FROM net._http_response
      WHERE id = request_id;
      
    ELSE
      response := jsonb_build_object(
        'error', 'No HTTP extension found',
        'message', 'Neither pg_http nor pg_net extension is available',
        'has_pg_http', has_pg_http,
        'has_pg_net', has_pg_net,
        'recommendation', 'Install pg_http or pg_net extension'
      );
    END IF;
    
  END;

  RETURN response;
END;
$$;

COMMENT ON FUNCTION test_sofinity_player_sync() IS 
'Diagnostic function to test Sofinity player sync endpoint. Auto-detects available HTTP extension (pg_http or pg_net) and sends test request with proper authentication.';
;
