-- ============================================================================
-- OneMil Affiliate v2 — update_affiliate_own_profile: add social/registration fields
-- ============================================================================
-- Extends the self-service profile RPC so an affiliate can edit (not only view)
-- their public/social registration fields from /affiliate/dashboard → Profil.
--
-- Adds 6 params: instagram_url, tiktok_url, youtube_url, facebook_url,
-- audience_size, content_categories. These columns already exist on
-- affiliate_accounts (migration 20260603_affiliate_registration_profile_fields).
--
-- The 6 new params are NULL-preserving: passing NULL leaves the existing value
-- untouched; passing '' explicitly clears it. The 13 pre-existing params keep
-- their original overwrite behaviour unchanged.
--
-- The old 13-arg signature is dropped to avoid PostgREST overload ambiguity.
-- The frontend always sends all 19 params.
--
-- Security: SECURITY DEFINER, auth.uid() check. Affiliate can still NOT change
-- ref_code, modes, status, commission_rate_*, approved_at, rejected_at.
--
-- No customer accounts, Partner portal, payments, tickets, contests, wallet,
-- buy_ticket_atomic, commission calculations, or legacy influencer tables.
--
-- Apply to STAGING first. Production requires explicit approval.
-- ============================================================================

DROP FUNCTION IF EXISTS public.update_affiliate_own_profile(
  text, text, text, text, text, boolean, text, text, text, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.update_affiliate_own_profile(
  p_name               text,
  p_email              text,
  p_phone              text,
  p_vat_id             text,
  p_ico                text,
  p_is_vat_payer       boolean,
  p_payout_account     text,
  p_payout_bank        text,
  p_billing_street     text,
  p_billing_city       text,
  p_billing_zip        text,
  p_billing_country    text,
  p_website_url        text,
  p_instagram_url      text DEFAULT NULL,
  p_tiktok_url         text DEFAULT NULL,
  p_youtube_url        text DEFAULT NULL,
  p_facebook_url       text DEFAULT NULL,
  p_audience_size      text DEFAULT NULL,
  p_content_categories text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('status', 'unauthenticated'); END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN RETURN jsonb_build_object('status', 'invalid_input', 'field', 'name'); END IF;
  IF p_email IS NULL OR length(btrim(p_email)) = 0 THEN RETURN jsonb_build_object('status', 'invalid_input', 'field', 'email'); END IF;

  SELECT id INTO v_id FROM public.affiliate_accounts WHERE auth_user_id = v_uid LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;

  UPDATE public.affiliate_accounts SET
    name            = btrim(p_name),
    email           = btrim(p_email),
    phone           = NULLIF(btrim(COALESCE(p_phone, '')), ''),
    vat_id          = NULLIF(btrim(COALESCE(p_vat_id, '')), ''),
    ico             = NULLIF(btrim(COALESCE(p_ico, '')), ''),
    is_vat_payer    = COALESCE(p_is_vat_payer, false),
    payout_account  = NULLIF(btrim(COALESCE(p_payout_account, '')), ''),
    payout_bank     = NULLIF(btrim(COALESCE(p_payout_bank, '')), ''),
    billing_street  = NULLIF(btrim(COALESCE(p_billing_street, '')), ''),
    billing_city    = NULLIF(btrim(COALESCE(p_billing_city, '')), ''),
    billing_zip     = NULLIF(btrim(COALESCE(p_billing_zip, '')), ''),
    billing_country = COALESCE(NULLIF(btrim(COALESCE(p_billing_country, '')), ''), 'CZ'),
    website_url     = NULLIF(btrim(COALESCE(p_website_url, '')), ''),
    -- NULL-preserving social/registration fields: NULL = keep existing, '' = clear
    instagram_url      = CASE WHEN p_instagram_url      IS NULL THEN instagram_url      ELSE NULLIF(btrim(p_instagram_url), '')      END,
    tiktok_url         = CASE WHEN p_tiktok_url         IS NULL THEN tiktok_url         ELSE NULLIF(btrim(p_tiktok_url), '')         END,
    youtube_url        = CASE WHEN p_youtube_url        IS NULL THEN youtube_url        ELSE NULLIF(btrim(p_youtube_url), '')        END,
    facebook_url       = CASE WHEN p_facebook_url       IS NULL THEN facebook_url       ELSE NULLIF(btrim(p_facebook_url), '')       END,
    audience_size      = CASE WHEN p_audience_size      IS NULL THEN audience_size      ELSE NULLIF(btrim(p_audience_size), '')      END,
    content_categories = CASE WHEN p_content_categories IS NULL THEN content_categories ELSE NULLIF(btrim(p_content_categories), '') END,
    updated_at      = now()
  WHERE id = v_id;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.update_affiliate_own_profile(
  text, text, text, text, text, boolean, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_affiliate_own_profile(
  text, text, text, text, text, boolean, text, text, text, text, text, text, text,
  text, text, text, text, text, text
) TO authenticated;
