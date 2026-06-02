-- Migration proposal: record_affiliate_customer_attribution RPC
-- Purpose:
--   Add authenticated RPC to record first-touch affiliate attribution for a
--   customer when they arrive with ?aff=KOD.
--
-- Scope:
--   - Adds RPC only.
--   - Does NOT connect frontend registration yet.
--   - Does NOT connect payments, wallet, commission calculations,
--     Partner Offers, customer referrals, B2B partner program,
--     or existing influencer system.
--   - First attribution wins; existing attribution is never overwritten.

CREATE OR REPLACE FUNCTION public.record_affiliate_customer_attribution(
  p_affiliate_code text,
  p_source text DEFAULT 'direct_link',
  p_landing_url text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_affiliate_code, '')));
  v_source text := lower(trim(coalesce(p_source, 'direct_link')));
  v_landing_url text := NULLIF(trim(coalesce(p_landing_url, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_attribution_metadata jsonb;
  v_existing_id uuid;
  v_affiliate_code_id uuid;
  v_affiliate_partner_id uuid;
  v_code_status text;
  v_partner_status text;
  v_attribution_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'P0001';
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

  IF v_source NOT IN ('direct_link', 'merchant_email', 'other') THEN
    RAISE EXCEPTION 'source_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object' THEN
    RAISE EXCEPTION 'metadata_must_be_object' USING ERRCODE = 'P0001';
  END IF;

  SELECT id
  INTO v_existing_id
  FROM public.user_affiliate_attributions
  WHERE user_id = v_user_id
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'existing_attribution_preserved',
      'user_affiliate_attribution_id', v_existing_id
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

  v_attribution_metadata := jsonb_build_object(
    'landing_url', v_landing_url,
    'client_metadata', v_metadata
  );

  INSERT INTO public.user_affiliate_attributions (
    user_id,
    affiliate_partner_id,
    affiliate_code_id,
    source,
    attributed_at,
    locked,
    created_by,
    metadata
  )
  VALUES (
    v_user_id,
    v_affiliate_partner_id,
    v_affiliate_code_id,
    v_source,
    now(),
    true,
    v_user_id,
    v_attribution_metadata
  )
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_attribution_id;

  IF v_attribution_id IS NULL THEN
    SELECT id
    INTO v_existing_id
    FROM public.user_affiliate_attributions
    WHERE user_id = v_user_id
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'existing_attribution_preserved',
      'user_affiliate_attribution_id', v_existing_id
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
    v_user_id,
    'affiliate_customer_attribution_recorded',
    'user_affiliate_attributions',
    v_attribution_id,
    NULL,
    jsonb_build_object(
      'user_id', v_user_id,
      'affiliate_partner_id', v_affiliate_partner_id,
      'affiliate_code_id', v_affiliate_code_id,
      'code', v_code,
      'source', v_source,
      'metadata', v_attribution_metadata
    ),
    'Customer affiliate attribution recorded',
    jsonb_build_object(
      'rpc', 'record_affiliate_customer_attribution'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'created', true,
    'user_affiliate_attribution_id', v_attribution_id,
    'affiliate_partner_id', v_affiliate_partner_id,
    'affiliate_code_id', v_affiliate_code_id,
    'code', v_code,
    'source', v_source
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_customer_attribution(
  text, text, text, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_affiliate_customer_attribution(
  text, text, text, jsonb
) TO authenticated;
