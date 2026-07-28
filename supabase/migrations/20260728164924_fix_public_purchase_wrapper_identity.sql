-- Public purchase wrappers must derive customer identity from auth.uid() and
-- pass arguments to internal atomic functions by name. This preserves the
-- public signatures while making argument order explicit and non-spoofable.

CREATE OR REPLACE FUNCTION public.buy_ticket_public(
  p_contest_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
  v_ticket_id uuid;
  v_bonus_prize_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;
  IF p_user_id IS NOT NULL AND p_user_id <> v_user THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  v_result := public.buy_ticket_atomic(
    p_user_id => v_user,
    p_contest_id => p_contest_id
  );

  IF COALESCE((v_result->>'success')::boolean, false) THEN
    v_ticket_id := NULLIF(v_result->>'ticket_row_id', '')::uuid;
    SELECT w.prize_id
    INTO v_bonus_prize_id
    FROM public.winners w
    WHERE w.ticket_id = v_ticket_id
      AND w.user_id = v_user
      AND w.type = 'bonus'
    LIMIT 1;
  END IF;

  RETURN (v_result
    - 'ticket_number'
    - 'next_bonus_position'
    - 'distance_to_next_bonus'
    - 'remaining_tickets')
    || jsonb_build_object('bonus_prize_id', v_bonus_prize_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.purchase_guaranteed_benefit_bundle_public(
  p_user_id uuid,
  p_contest_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_result jsonb;
  v_ticket_id uuid;
  v_bonus_prize_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthorized');
  END IF;
  IF p_user_id IS NOT NULL AND p_user_id <> v_user THEN
    RETURN jsonb_build_object('success', false, 'error', 'forbidden');
  END IF;

  v_result := public.purchase_guaranteed_benefit_bundle_atomic(
    p_user_id => v_user,
    p_contest_id => p_contest_id,
    p_idempotency_key => p_idempotency_key
  );

  IF COALESCE((v_result->>'success')::boolean, false) THEN
    v_ticket_id := NULLIF(v_result->>'ticket_row_id', '')::uuid;
    SELECT w.prize_id
    INTO v_bonus_prize_id
    FROM public.winners w
    WHERE w.ticket_id = v_ticket_id
      AND w.user_id = v_user
      AND w.type = 'bonus'
    LIMIT 1;
  END IF;

  RETURN (v_result
    - 'ticket_number'
    - 'next_bonus_position'
    - 'distance_to_next_bonus'
    - 'remaining_tickets')
    || jsonb_build_object('bonus_prize_id', v_bonus_prize_id);
END;
$function$;

DO $permissions$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.buy_ticket_atomic(uuid, uuid) TO service_role';
  EXECUTE 'REVOKE ALL ON FUNCTION public.buy_ticket_public(uuid, uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.buy_ticket_public(uuid, uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.buy_ticket_public(uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.buy_ticket_public(uuid, uuid) TO service_role';

  EXECUTE 'REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) TO service_role';
  EXECUTE 'REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_public(uuid, uuid, uuid) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_public(uuid, uuid, uuid) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.purchase_guaranteed_benefit_bundle_public(uuid, uuid, uuid) TO authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.purchase_guaranteed_benefit_bundle_public(uuid, uuid, uuid) TO service_role';
END;
$permissions$;
