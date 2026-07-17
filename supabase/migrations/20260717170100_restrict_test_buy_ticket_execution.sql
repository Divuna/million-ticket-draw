REVOKE ALL ON FUNCTION public._test_buy_ticket(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._test_buy_ticket(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public._test_buy_ticket(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public._test_buy_ticket(uuid, uuid) TO service_role;
