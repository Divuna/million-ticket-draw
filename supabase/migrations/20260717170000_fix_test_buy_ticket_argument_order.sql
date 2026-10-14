CREATE OR REPLACE FUNCTION public._test_buy_ticket(
  p_contest_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text)::text,
    true
  );

  RETURN public.buy_ticket_atomic(p_user_id, p_contest_id);
END;
$function$;

REVOKE ALL ON FUNCTION public._test_buy_ticket(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._test_buy_ticket(uuid, uuid) TO service_role;
