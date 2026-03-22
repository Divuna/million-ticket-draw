-- Phase 3b: Voucher redemption (convert balance_vouchers → product/credit)
-- User2 redeems a voucher using their balance_vouchers balance
-- Sets auth context so auth.uid() resolves correctly inside redeem_voucher
DO $$
DECLARE
  v_result json;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', '__U2__')::text, true);

  v_result := public.redeem_voucher('__VID__'::uuid);

  IF (v_result->>'success')::boolean THEN
    RAISE NOTICE 'redeem_voucher: SUCCESS result=%', v_result;
  ELSE
    RAISE EXCEPTION 'redeem_voucher FAILED: %', v_result->>'message';
  END IF;
END;
$$;
