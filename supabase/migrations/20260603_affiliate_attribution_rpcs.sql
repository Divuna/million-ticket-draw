-- ============================================================================
-- OneMil Affiliate program — attribution RPCs (second safe step)
-- ============================================================================
-- Two SECURITY DEFINER functions that record first-touch attribution into the
-- standalone affiliate model created in 20260603_affiliate_accounts_foundation.
--
-- Isolation guarantees:
--   - No change to customer accounts, Partner portal, payments, tickets,
--     contests, wallet, or buy_ticket_atomic.
--   - Only writes to affiliate_customer_refs / affiliate_company_refs and the
--     nullable partners.referred_by_affiliate_id mirror column.
--   - First-touch is permanent: existing attribution is NEVER overwritten.
--
-- Both functions:
--   - SECURITY DEFINER, SET search_path = '' (all refs schema-qualified)
--   - Return a safe jsonb status object (no raw errors leaked)
--   - Treat invalid / unknown codes gracefully
--
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) record_affiliate_customer_ref(p_ref_code)
--    Called by the logged-in customer (uses auth.uid()).
--    Records the customer under an approved INFLUENCER affiliate, first-touch.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_affiliate_customer_ref(p_ref_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_aff       public.affiliate_accounts%ROWTYPE;
  v_existing  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;

  IF p_ref_code IS NULL OR length(btrim(p_ref_code)) = 0 THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;

  SELECT * INTO v_aff
  FROM public.affiliate_accounts
  WHERE ref_code = btrim(p_ref_code)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;

  IF v_aff.status <> 'approved' THEN
    RETURN jsonb_build_object('status', 'not_eligible', 'reason', 'not_approved');
  END IF;

  IF NOT ('influencer' = ANY (v_aff.modes)) THEN
    RETURN jsonb_build_object('status', 'not_eligible', 'reason', 'not_influencer');
  END IF;

  -- An affiliate cannot refer themselves as a customer.
  IF v_aff.auth_user_id = v_uid THEN
    RETURN jsonb_build_object('status', 'self_referral');
  END IF;

  -- First-touch: if the customer already has any attribution, keep it.
  SELECT affiliate_id INTO v_existing
  FROM public.affiliate_customer_refs
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_attributed');
  END IF;

  INSERT INTO public.affiliate_customer_refs (affiliate_id, user_id, source)
  VALUES (v_aff.id, v_uid, 'direct_link')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('status', 'recorded', 'affiliate_id', v_aff.id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_customer_ref(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_affiliate_customer_ref(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) record_affiliate_company_ref(p_via_code, p_partner_id)
--    Admin-only (partner records are created/approved by admin). Records the
--    company under an approved SALES_REP affiliate, first-touch, and mirrors
--    the link onto partners.referred_by_affiliate_id (only if currently null).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_affiliate_company_ref(p_via_code text, p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_aff       public.affiliate_accounts%ROWTYPE;
  v_exists    boolean;
  v_existing  uuid;
BEGIN
  -- Privileged write (affects lifetime commission attribution) -> admin only.
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  IF p_via_code IS NULL OR length(btrim(p_via_code)) = 0 THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;

  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_partner');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.partners WHERE id = p_partner_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('status', 'invalid_partner');
  END IF;

  SELECT * INTO v_aff
  FROM public.affiliate_accounts
  WHERE ref_code = btrim(p_via_code)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;

  IF v_aff.status <> 'approved' THEN
    RETURN jsonb_build_object('status', 'not_eligible', 'reason', 'not_approved');
  END IF;

  IF NOT ('sales_rep' = ANY (v_aff.modes)) THEN
    RETURN jsonb_build_object('status', 'not_eligible', 'reason', 'not_sales_rep');
  END IF;

  -- First-touch: if the company already has any attribution, keep it.
  SELECT affiliate_id INTO v_existing
  FROM public.affiliate_company_refs
  WHERE partner_id = p_partner_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_attributed');
  END IF;

  INSERT INTO public.affiliate_company_refs (affiliate_id, partner_id, source)
  VALUES (v_aff.id, p_partner_id, 'via_link')
  ON CONFLICT (partner_id) DO NOTHING;

  -- Mirror onto partners only when currently null (first-touch, no overwrite).
  UPDATE public.partners
  SET referred_by_affiliate_id = v_aff.id
  WHERE id = p_partner_id
    AND referred_by_affiliate_id IS NULL;

  RETURN jsonb_build_object('status', 'recorded', 'affiliate_id', v_aff.id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_affiliate_company_ref(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_affiliate_company_ref(text, uuid) TO authenticated;
