-- Set auth context and test buy_voucher_atomic
DO $$
DECLARE v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', 'a1000001-e2e0-4000-8000-000000000001')::text, true);
  v_result := public.buy_voucher_atomic(
    'a1000001-e2e0-4000-8000-000000000001'::uuid,
    '313c4003-5945-4550-9403-423b159daa61'::uuid
  );
  RAISE NOTICE 'Result: %', v_result;
END;
$$;
