-- ============================================================================
-- OneMil Affiliate v2 — registration profile fields
-- ============================================================================
-- Additive only. Stores the public/social registration fields filled in
-- /affiliate/register so the affiliate can review them in /affiliate/dashboard
-- and admins can assess the account in /admin/affiliate-accounts.
--
-- No customer accounts, Partner portal, payments, tickets, contests, wallet,
-- buy_ticket_atomic, commission calculations, or legacy influencer tables.
--
-- Safe to apply to staging first. Production requires explicit approval.
-- ============================================================================

ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS instagram_url      text;
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS tiktok_url         text;
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS youtube_url        text;
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS facebook_url       text;
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS audience_size      text;
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS content_categories text;

CREATE OR REPLACE FUNCTION public.register_affiliate_account(
  p_name               text,
  p_email              text,
  p_phone              text,
  p_modes              text[],
  p_ref_code           text,
  p_website_url        text,
  p_instagram_url      text,
  p_tiktok_url         text,
  p_youtube_url        text,
  p_facebook_url       text,
  p_audience_size      text,
  p_content_categories text
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

  IF p_modes IS NULL
     OR array_length(p_modes, 1) IS NULL
     OR NOT (p_modes <@ ARRAY['influencer','sales_rep']::text[]) THEN
    RETURN jsonb_build_object('status', 'invalid_modes');
  END IF;

  SELECT * INTO v_existing
  FROM public.affiliate_accounts
  WHERE auth_user_id = v_uid
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('status', 'already_exists',
                              'id', v_existing.id,
                              'ref_code', v_existing.ref_code);
  END IF;

  v_base := upper(regexp_replace(COALESCE(NULLIF(btrim(p_ref_code), ''), p_name), '[^a-zA-Z0-9]', '', 'g'));
  v_base := left(v_base, 12);
  IF v_base IS NULL OR length(v_base) = 0 THEN
    v_base := 'AFF';
  END IF;

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
     commission_rate_customer, commission_rate_company, website_url,
     instagram_url, tiktok_url, youtube_url, facebook_url, audience_size,
     content_categories)
  VALUES
    (v_uid, btrim(p_name), btrim(p_email), NULLIF(btrim(COALESCE(p_phone, '')), ''),
     v_code, p_modes, 'pending', 5.00, 5.00,
     NULLIF(btrim(COALESCE(p_website_url, '')), ''),
     NULLIF(btrim(COALESCE(p_instagram_url, '')), ''),
     NULLIF(btrim(COALESCE(p_tiktok_url, '')), ''),
     NULLIF(btrim(COALESCE(p_youtube_url, '')), ''),
     NULLIF(btrim(COALESCE(p_facebook_url, '')), ''),
     NULLIF(btrim(COALESCE(p_audience_size, '')), ''),
     NULLIF(btrim(COALESCE(p_content_categories, '')), ''));

  RETURN jsonb_build_object('status', 'registered', 'ref_code', v_code);
END;
$$;

REVOKE ALL ON FUNCTION public.register_affiliate_account(text, text, text, text[], text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_affiliate_account(text, text, text, text[], text, text, text, text, text, text, text, text) TO authenticated;
