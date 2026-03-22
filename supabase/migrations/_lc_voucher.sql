-- Phase 3a: Voucher purchase
-- User1 buys a voucher (costs 5 MioCoin from balance_coins)
-- Sets auth context so auth.uid() resolves correctly inside buy_voucher_atomic
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '__U1__')::text, true);

  v_result := public.buy_voucher_atomic('__U1__'::uuid, '__VID__'::uuid);

  IF (v_result->>'success')::boolean THEN
    RAISE NOTICE 'buy_voucher_atomic: SUCCESS result=%', v_result;
  ELSE
    RAISE EXCEPTION 'buy_voucher_atomic FAILED: %', v_result->>'error';
  END IF;
END;
$$;
