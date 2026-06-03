-- ============================================================================
-- OneMil Affiliate program — self-service registration RPC (staging)
-- ============================================================================
-- Public-facing affiliate signup: a logged-in auth user creates their own
-- pending affiliate_accounts row. SECURITY DEFINER because RLS on
-- affiliate_accounts only allows admin writes.
--
-- Isolation: writes ONLY to affiliate_accounts. No change to customer accounts,
-- Partner portal, payments, tickets, contests, wallet, or buy_ticket_atomic.
--
-- Binds to auth.uid() (cannot create an account for someone else).
-- modes subset of {influencer, sales_rep}, >= 1. status = 'pending'.
-- Rates default 5.00 / 5.00. ref_code normalized + made unique.
-- Idempotent per user: if the user already has an affiliate account, returns it.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.register_affiliate_account(
  p_name    text,
  p_email   text,
  p_phone   text,
  p_modes   text[],
  p_ref_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_existing  public.affiliate_accounts%ROWTYPE;
  v_base      text;
  v_code      text;
  v_try       int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;

  IF p_name IS NULL OR length(btrim(p_name)) = 0
     OR p_email IS NULL OR length(btrim(p_email)) = 0 THEN
    RETURN jsonb_build_object('status', 'invalid_input');
  END IF;

  -- modes must be a non-empty subset of the allowed set
  IF p_modes IS NULL
     OR array_length(p_modes, 1) IS NULL
     OR NOT (p_modes <@ ARRAY['influencer','sales_rep']::text[]) THEN
    RETURN jsonb_build_object('status', 'invalid_modes');
  END IF;

  -- Idempotent per user: return existing account instead of erroring.
  SELECT * INTO v_existing FROM public.affiliate_accounts WHERE auth_user_id = v_uid LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_exists',
                              'id', v_existing.id, 'ref_code', v_existing.ref_code);
  END IF;

  -- Build a normalized base code from the requested code or the name.
  v_base := upper(regexp_replace(COALESCE(NULLIF(btrim(p_ref_code), ''), p_name), '[^a-zA-Z0-9]', '', 'g'));
  v_base := left(v_base, 12);
  IF v_base IS NULL OR length(v_base) = 0 THEN
    v_base := 'AFF';
  END IF;

  -- Ensure uniqueness; append hex from uid on collision.
  v_code := v_base;
  WHILE EXISTS (SELECT 1 FROM public.affiliate_accounts WHERE ref_code = v_code) LOOP
    v_try := v_try + 1;
    v_code := left(v_base, 8) || upper(substr(replace(v_uid::text, '-', ''), 1 + (v_try-1)*4, 4));
    IF v_try >= 6 THEN
      v_code := left(v_base, 6) || upper(substr(md5(v_uid::text || clock_timestamp()::text), 1, 6));
      EXIT;
    END IF;
  END LOOP;

  INSERT INTO public.affiliate_accounts
    (auth_user_id, name, email, phone, ref_code, modes, status,
     commission_rate_customer, commission_rate_company)
  VALUES
    (v_uid, btrim(p_name), btrim(p_email), NULLIF(btrim(p_phone), ''), v_code, p_modes, 'pending',
     5.00, 5.00);

  RETURN jsonb_build_object('status', 'registered', 'ref_code', v_code);
END;
$$;

REVOKE ALL ON FUNCTION public.register_affiliate_account(text, text, text, text[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_affiliate_account(text, text, text, text[], text) TO authenticated;
