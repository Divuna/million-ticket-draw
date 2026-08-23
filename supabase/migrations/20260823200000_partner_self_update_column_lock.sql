-- F2: a partner must not be able to rewrite OneMil's internal commercial terms.
--
-- Cause: `partners_update_own` scopes the ROW (auth_user_id = auth.uid()) but
-- Postgres RLS cannot scope COLUMNS, and `authenticated` held UPDATE on all 41
-- columns of public.partners. The PartnerDashboard only ever sends a handful of
-- fields, but the policy is the security boundary, not the frontend: a partner
-- holding their own JWT (the anon key is public) could
--     PATCH /rest/v1/partners?id=eq.<their own id>  {"price_per_coin": 0}
-- and switch off their own billing. Verified on staging: price_per_coin = 0 and
-- vat_rate = 0 both wrote successfully under a real partner session.
--
-- Fix: keep the row scoping, add COLUMN scoping. Postgres checks column
-- privileges against the columns named in the UPDATE, so a partner naming a
-- non-granted column is rejected by the engine with
--     42501 permission denied for column price_per_coin
-- before any policy or trigger runs. There is no way to bypass it from the API,
-- and no frontend change is required: every column the partner UI actually
-- writes stays granted.
--
-- The allow-list below is the exact union of every UPDATE the partner-facing
-- frontend performs on public.partners (checked against origin/main a037d77b):
--   src/pages/PartnerDashboard.tsx        logo_url, logo_status
--                                         reward_mode, product_badge_enabled
--                                         reward_base_czk, reward_mc
--   src/components/PartnerBillingForm.tsx company_name, ico, dic, contact_email,
--                                         billing_street/city/zip/country
--   src/components/InfluencerProfileSection.tsx
--                                         name, contact_email, contact_phone,
--                                         website_url, billing_*, currency,
--                                         payout_account, payout_bank,
--                                         payout_ready, payout_updated_at,
--                                         logo_url
--   src/components/InfluencerTermsSection.tsx
--                                         terms_accepted_at
--
-- Withheld (18): id, created_at, updated_at, status, approved_at, suspended_at,
-- rejected_at, price_per_coin, vat_rate, notes, auth_user_id, mc_per_99_czk,
-- payout_currency, referred_by_affiliate_id, shoptet_import_enabled,
-- shoptet_export_secret_name, shoptet_customer_delivery, reward_trigger_status.
--
-- `updated_at` is deliberately withheld: the BEFORE UPDATE triggers
-- (set_updated_at / update_updated_at_column) assign it on NEW, and column
-- privileges are checked against the columns the STATEMENT names, not the ones a
-- trigger sets — so the timestamp keeps working without being partner-writable.
--
-- Admin/superadmin: no admin UI updates public.partners over PostgREST (all 6
-- frontend UPDATEs are partner/influencer-facing; admin approval runs through
-- service_role Edge Functions, which bypass both RLS and column privileges).
-- The revoke therefore removes nothing an admin uses today, but it would also
-- narrow `partners_update_admin`, so the commercial fields an admin genuinely
-- has to set get an explicit admin-only RPC below.
--
-- Not changed: partners_update_own / partners_update_admin / partners_select_own_admin
-- stay exactly as they are, no data is read or written, SELECT/INSERT/DELETE
-- privileges are untouched, service_role is untouched.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Replace the blanket UPDATE grant with an explicit column allow-list.
--    `anon` never had an UPDATE policy so it could not update anyway; dropping
--    its grant removes a privilege that only ever looked like an opening.
-- ---------------------------------------------------------------------------
REVOKE UPDATE ON public.partners FROM anon, authenticated;

GRANT UPDATE (
  -- identity / presentation
  name,
  logo_url,
  logo_status,
  website_url,
  company_name,
  -- contact
  contact_email,
  contact_phone,
  -- billing identity of the PARTNER (not OneMil's terms)
  ico,
  dic,
  billing_street,
  billing_city,
  billing_zip,
  billing_country,
  currency,
  -- influencer payout details
  payout_account,
  payout_bank,
  payout_ready,
  payout_updated_at,
  -- legal
  terms_accepted_at,
  -- the partner's own MioCoin reward configuration
  reward_base_czk,
  reward_mc,
  reward_mode,
  product_badge_enabled
) ON public.partners TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Admin path for the commercial terms the revoke takes away.
--    price_per_coin is what OneMil charges the partner per activated MioCoin and
--    vat_rate is the rate on the partner invoice — both are OneMil's side of the
--    contract and must never be partner-writable. SECURITY DEFINER so the admin
--    is not subject to the column grant, with an internal is_admin() gate.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_partner_commercial_terms(
  p_partner_id     uuid,
  p_price_per_coin numeric DEFAULT NULL,
  p_vat_rate       numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_price numeric;
  v_vat   numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_partner');
  END IF;

  -- NULL means "leave unchanged", so a caller can set one field on its own.
  IF p_price_per_coin IS NOT NULL AND p_price_per_coin < 0 THEN
    RETURN jsonb_build_object('status', 'invalid_price_per_coin');
  END IF;

  -- vat_rate is a FRACTION (0.21 = 21 %), never a percent -- see 20260629180000.
  IF p_vat_rate IS NOT NULL AND (p_vat_rate < 0 OR p_vat_rate > 1) THEN
    RETURN jsonb_build_object('status', 'invalid_vat_rate');
  END IF;

  UPDATE public.partners
     SET price_per_coin = COALESCE(p_price_per_coin, price_per_coin),
         vat_rate       = COALESCE(p_vat_rate, vat_rate)
   WHERE id = p_partner_id
  RETURNING price_per_coin, vat_rate INTO v_price, v_vat;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  RETURN jsonb_build_object(
    'status', 'updated',
    'partner_id', p_partner_id,
    'price_per_coin', v_price,
    'vat_rate', v_vat
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_partner_commercial_terms(uuid, numeric, numeric)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_commercial_terms(uuid, numeric, numeric)
TO authenticated, service_role;

COMMIT;
