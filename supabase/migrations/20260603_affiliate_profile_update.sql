-- ============================================================================
-- Affiliate v2 — profil a výplatní údaje (APLIKOVAT RUČNĚ)
-- ============================================================================
-- Přidá chybějící sloupce pro affiliate profil (adresa, IČO, web, země)
-- a SECURITY DEFINER RPC pro aktualizaci vlastního profilu affiliatem.
--
-- Nutné pro:
--   - Editovatelný profil v /affiliate/dashboard
--   - Uložení IČO, DIČ, bankovního účtu, fakturační adresy
--   - Podpora CZ i SK (country field)
--
-- BEZPEČNOST:
--   - RPC ověřuje auth.uid() = affiliate_accounts.auth_user_id
--   - Affiliate nemůže měnit: ref_code, modes, status, commission_rate_*, approved_at, rejected_at
--   - Vše ostatní (kontakt, adresa, výplatní údaje) může měnit sám
--
-- Idempotent: bezpečné pro opakované spuštění.
-- ============================================================================

-- Nové sloupce pro affiliate profil
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS ico          text;
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS billing_street  text;
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS billing_city    text;
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS billing_zip     text;
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS billing_country text DEFAULT 'CZ';
ALTER TABLE public.affiliate_accounts ADD COLUMN IF NOT EXISTS website_url     text;

-- SECURITY DEFINER RPC: affiliate aktualizuje vlastní profil
CREATE OR REPLACE FUNCTION public.update_affiliate_own_profile(
  p_name             text,
  p_email            text,
  p_phone            text,
  p_vat_id           text,
  p_ico              text,
  p_is_vat_payer     boolean,
  p_payout_account   text,
  p_payout_bank      text,
  p_billing_street   text,
  p_billing_city     text,
  p_billing_zip      text,
  p_billing_country  text,
  p_website_url      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;

  -- Validate required fields
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RETURN jsonb_build_object('status', 'invalid_input', 'field', 'name');
  END IF;
  IF p_email IS NULL OR length(btrim(p_email)) = 0 THEN
    RETURN jsonb_build_object('status', 'invalid_input', 'field', 'email');
  END IF;

  -- Find own account
  SELECT id INTO v_id
  FROM public.affiliate_accounts
  WHERE auth_user_id = v_uid
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Update only safe fields (cannot change ref_code, modes, status, commission rates)
  UPDATE public.affiliate_accounts SET
    name             = btrim(p_name),
    email            = btrim(p_email),
    phone            = NULLIF(btrim(COALESCE(p_phone, '')), ''),
    vat_id           = NULLIF(btrim(COALESCE(p_vat_id, '')), ''),
    ico              = NULLIF(btrim(COALESCE(p_ico, '')), ''),
    is_vat_payer     = COALESCE(p_is_vat_payer, false),
    payout_account   = NULLIF(btrim(COALESCE(p_payout_account, '')), ''),
    payout_bank      = NULLIF(btrim(COALESCE(p_payout_bank, '')), ''),
    billing_street   = NULLIF(btrim(COALESCE(p_billing_street, '')), ''),
    billing_city     = NULLIF(btrim(COALESCE(p_billing_city, '')), ''),
    billing_zip      = NULLIF(btrim(COALESCE(p_billing_zip, '')), ''),
    billing_country  = COALESCE(NULLIF(btrim(COALESCE(p_billing_country, '')), ''), 'CZ'),
    website_url      = NULLIF(btrim(COALESCE(p_website_url, '')), ''),
    updated_at       = now()
  WHERE id = v_id;

  RETURN jsonb_build_object('status', 'ok');
END;
$$;

REVOKE ALL ON FUNCTION public.update_affiliate_own_profile(text,text,text,text,text,boolean,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_affiliate_own_profile(text,text,text,text,text,boolean,text,text,text,text,text,text,text) TO authenticated;
