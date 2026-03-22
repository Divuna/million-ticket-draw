-- Fix BUG-2: forward_event_to_sofinity(jsonb) type mismatch + missing exception handler
--
-- PROBLEM 1: v_resp was declared as jsonb, but net.http_post() returns bigint.
--   The SELECT ... INTO v_resp caused a type cast error that propagated up through
--   the after_user_created_forward trigger, breaking every user registration.
--
-- PROBLEM 2: No EXCEPTION handler. Any failure in this function (network error,
--   wrong URL, auth failure) would abort the calling transaction, taking down
--   user registration, voucher purchases, or any other operation that inserts
--   into public.users.
--
-- FIX: Change v_resp to bigint (correct return type of net.http_post).
--      Wrap the body in EXCEPTION WHEN OTHERS so Sofinity event failures
--      are always logged and never propagate.

CREATE OR REPLACE FUNCTION public.forward_event_to_sofinity(v_payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url  text   := 'https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/sofinity-event';
  v_resp bigint;
BEGIN
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer DPmjiD06Fnxp20nB76SRQW3get7o0nFKhFSK02SBSsz33XmTi83XfkqRh8m4xfw0'
    ),
    body := v_payload
  )
  INTO v_resp;

  RAISE LOG 'forward_event_to_sofinity: queued request_id=%', v_resp;

EXCEPTION WHEN OTHERS THEN
  -- Log the failure but never abort the calling transaction.
  -- Sofinity delivery failures must not break user registration or any other flow.
  RAISE LOG 'forward_event_to_sofinity error (payload=%): %', v_payload, SQLERRM;
END;
$$;
