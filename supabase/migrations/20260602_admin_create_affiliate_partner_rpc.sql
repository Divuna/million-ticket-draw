-- Migration proposal: admin_create_affiliate_partner RPC
-- Purpose:
--   Add admin-only SECURITY DEFINER RPC to create an affiliate partner,
--   human affiliate code, initial commission rate, and audit log entry.
--
-- Scope:
--   - Adds RPC only.
--   - Does NOT add direct INSERT/UPDATE/DELETE RLS policies.
--   - Does NOT connect registration, partner/register, payments, wallet,
--     buy_ticket_atomic, Partner Offers, customer referrals, B2B partner program,
--     or existing influencer system.

CREATE OR REPLACE FUNCTION public.admin_create_affiliate_partner(
  p_display_name text,
  p_code text,
  p_affiliate_type text DEFAULT 'other',
  p_contact_email text DEFAULT NULL,
  p_legal_name text DEFAULT NULL,
  p_commission_rate numeric DEFAULT 0.02,
  p_contract_starts_at timestamptz DEFAULT now(),
  p_reason text DEFAULT 'Initial affiliate partner creation',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_display_name text := trim(coalesce(p_display_name, ''));
  v_affiliate_type text := lower(trim(coalesce(p_affiliate_type, 'other')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_partner_id uuid;
  v_code_id uuid;
  v_rate_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'P0001';
  END IF;

  IF v_display_name = '' THEN
    RAISE EXCEPTION 'display_name_required' USING ERRCODE = 'P0001';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'affiliate_code_required' USING ERRCODE = 'P0001';
  END IF;

  IF v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}$' THEN
    RAISE EXCEPTION 'affiliate_code_invalid_format' USING ERRCODE = 'P0001';
  END IF;

  IF v_affiliate_type NOT IN ('influencer', 'sales_partner', 'agency', 'individual', 'other') THEN
    RAISE EXCEPTION 'affiliate_type_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF p_commission_rate IS NULL OR p_commission_rate < 0 OR p_commission_rate > 1 THEN
    RAISE EXCEPTION 'commission_rate_invalid' USING ERRCODE = 'P0001';
  END IF;

  IF p_contract_starts_at IS NULL THEN
    RAISE EXCEPTION 'contract_starts_at_required' USING ERRCODE = 'P0001';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'reason_required' USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.affiliate_codes
    WHERE code = v_code
  ) THEN
    RAISE EXCEPTION 'affiliate_code_already_exists' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.affiliate_partners (
    display_name,
    legal_name,
    contact_email,
    affiliate_type,
    status,
    contract_starts_at,
    notes,
    created_by
  )
  VALUES (
    v_display_name,
    NULLIF(trim(coalesce(p_legal_name, '')), ''),
    NULLIF(trim(coalesce(p_contact_email, '')), ''),
    v_affiliate_type,
    'pending',
    p_contract_starts_at,
    p_notes,
    v_actor
  )
  RETURNING id INTO v_partner_id;

  BEGIN
    INSERT INTO public.affiliate_codes (
      affiliate_partner_id,
      code,
      status,
      created_by
    )
    VALUES (
      v_partner_id,
      v_code,
      'active',
      v_actor
    )
    RETURNING id INTO v_code_id;
  EXCEPTION
    WHEN unique_violation THEN
      RAISE EXCEPTION 'affiliate_code_already_exists' USING ERRCODE = 'P0001';
  END;

  INSERT INTO public.affiliate_commission_rate_history (
    affiliate_partner_id,
    commission_rate,
    valid_from,
    valid_to,
    created_by,
    reason
  )
  VALUES (
    v_partner_id,
    p_commission_rate,
    p_contract_starts_at,
    NULL,
    v_actor,
    v_reason
  )
  RETURNING id INTO v_rate_id;

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
    'affiliate_partner_created',
    'affiliate_partners',
    v_partner_id,
    NULL,
    jsonb_build_object(
      'affiliate_partner_id', v_partner_id,
      'affiliate_code_id', v_code_id,
      'commission_rate_history_id', v_rate_id,
      'display_name', v_display_name,
      'code', v_code,
      'affiliate_type', v_affiliate_type,
      'commission_rate', p_commission_rate,
      'status', 'pending',
      'code_status', 'active',
      'rate_valid_from', p_contract_starts_at,
      'rate_valid_to', NULL
    ),
    v_reason,
    jsonb_build_object(
      'rpc', 'admin_create_affiliate_partner'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'affiliate_partner_id', v_partner_id,
    'affiliate_code_id', v_code_id,
    'commission_rate_history_id', v_rate_id,
    'display_name', v_display_name,
    'affiliate_type', v_affiliate_type,
    'commission_rate', p_commission_rate,
    'code', v_code,
    'status', 'pending',
    'code_status', 'active'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_affiliate_partner(
  text, text, text, text, text, numeric, timestamptz, text, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_create_affiliate_partner(
  text, text, text, text, text, numeric, timestamptz, text, text
) TO authenticated;
