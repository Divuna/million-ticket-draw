-- Migration proposal: record_affiliate_merchant_referral RPC
-- Purpose:
--   Add authenticated RPC to record first-touch affiliate attribution for a
--   merchant/company partner when they register with ?aff=KOD.
--
-- Scope:
--   - Adds RPC only.
--   - Does NOT connect frontend partner/register yet.
--   - Does NOT create merchant/company bonuses.
--   - Does NOT connect payments, wallet, commission calculations,
--     Partner Offers, customer referrals, B2B partner program,
--     or existing influencer system.
--   - First merchant referral wins; existing referral is never overwritten.

CREATE OR REPLACE FUNCTION public.record_affiliate_merchant_referral(
  p_merchant_partner_id uuid,
  p_affiliate_code text,
  p_source text DEFAULT 'partner_register',
  p_landing_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_affiliate_code, '')));
  v_source text := lower(trim(coalesce(p_source, 'partner_register')));
  v_landing_url text := NULLIF(trim(coalesce(p_landing_url, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_referral_metadata jsonb;
  v_existing_id uuid;
  v_affiliate_code_id uuid;
  v_affiliate_partner_id uuid;
  v_code_status text;
  v_partner_status text;
  v_referral_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
  END IF;

  IF p_merchant_partner_id IS NULL THEN
    RAISE EXCEPTION 'merchant_partner_id_required' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.partners
    WHERE id = p_merchant_partner_id
      AND auth_user_id = v_actor
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.partners
      WHERE id = p_merchant_partner_id
    ) THEN
      RAISE EXCEPTION 'merchant_partner_not_owned' USING ERRCODE = 'P0001';
    END IF;

    RAISE EXCEPTION 'merchant_partner_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'affiliate_code_required' USING ERRCODE = 'P0001';
  END IF;

  IF v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' THEN
    RAISE EXCEPTION 'affiliate_code_invalid_format' USING ERRCODE = 'P0001';
  END IF;

  IF v_source = '' THEN
    RAISE EXCEPTION 'source_required' USING ERRCODE = 'P0001';
  END IF;

  IF v_source NOT IN ('partner_register', 'direct_link', 'merchant_email', 'other') THEN
    RAISE EXCEPTION 'source_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata_must_be_object' USING ERRCODE = 'P0001';
  END IF;

  SELECT id
  INTO v_existing_id
  FROM public.merchant_affiliate_referrals
  WHERE merchant_partner_id = p_merchant_partner_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'existing_merchant_referral_preserved',
      'merchant_affiliate_referral_id', v_existing_id
    );
  END IF;

  SELECT
    ac.id,
    ac.affiliate_partner_id,
    ac.status,
    ap.status
  INTO
    v_affiliate_code_id,
    v_affiliate_partner_id,
    v_code_status,
    v_partner_status
  FROM public.affiliate_codes ac
  JOIN public.affiliate_partners ap ON ap.id = ac.affiliate_partner_id
  WHERE ac.code = v_code
  FOR UPDATE OF ac, ap;

  IF v_affiliate_code_id IS NULL THEN
    RAISE EXCEPTION 'affiliate_code_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_code_status <> 'active' THEN
    RAISE EXCEPTION 'affiliate_code_not_active' USING ERRCODE = 'P0001';
  END IF;

  IF v_partner_status <> 'active' THEN
    RAISE EXCEPTION 'affiliate_partner_not_active' USING ERRCODE = 'P0001';
  END IF;

  v_referral_metadata := jsonb_build_object(
    'source', v_source,
    'landing_url', v_landing_url,
    'client_metadata', v_metadata
  );

  INSERT INTO public.merchant_affiliate_referrals (
    merchant_partner_id,
    affiliate_partner_id,
    affiliate_code_id,
    status,
    registered_at,
    created_by,
    metadata
  )
  VALUES (
    p_merchant_partner_id,
    v_affiliate_partner_id,
    v_affiliate_code_id,
    'registered',
    now(),
    v_actor,
    v_referral_metadata
  )
  ON CONFLICT (merchant_partner_id) DO NOTHING
  RETURNING id INTO v_referral_id;

  IF v_referral_id IS NULL THEN
    SELECT id
    INTO v_existing_id
    FROM public.merchant_affiliate_referrals
    WHERE merchant_partner_id = p_merchant_partner_id
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'existing_merchant_referral_preserved',
      'merchant_affiliate_referral_id', v_existing_id
    );
  END IF;

  INSERT INTO public.affiliate_audit_logs (
    actor_user_id,
    action,
    entity_table,
    entity_id,
    old_data,
    new_data,
    reason,
    metadata
  )
  VALUES (
    v_actor,
    'affiliate_merchant_referral_recorded',
    'merchant_affiliate_referrals',
    v_referral_id,
    NULL,
    jsonb_build_object(
      'merchant_partner_id', p_merchant_partner_id,
      'affiliate_partner_id', v_affiliate_partner_id,
      'affiliate_code_id', v_affiliate_code_id,
      'code', v_code,
      'status', 'registered',
      'metadata', v_referral_metadata
    ),
    'Merchant affiliate referral recorded',
    jsonb_build_object(
      'rpc', 'record_affiliate_merchant_referral'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'created', true,
    'merchant_affiliate_referral_id', v_referral_id,
    'merchant_partner_id', p_merchant_partner_id,
    'affiliate_partner_id', v_affiliate_partner_id,
    'affiliate_code_id', v_affiliate_code_id,
    'code', v_code,
    'source', v_source,
    'status', 'registered'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_merchant_referral(
  uuid, text, text, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_affiliate_merchant_referral(
  uuid, text, text, text, jsonb
) TO authenticated;
