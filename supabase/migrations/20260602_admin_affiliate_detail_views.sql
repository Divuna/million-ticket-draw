-- Migration proposal: admin affiliate detail read-only views
-- Purpose:
--   Add detail views for future read-only tabs on /admin/affiliate.
--
-- Scope:
--   - Adds views only.
--   - Grants SELECT to authenticated.
--   - Does NOT add RPCs.
--   - Does NOT add triggers.
--   - Does NOT add policies.
--   - Does NOT modify registration, Stripe, payments flow, wallet,
--     automatic commissions, payouts, or the legacy influencer system.

CREATE OR REPLACE VIEW public.v_admin_affiliate_customer_attributions
WITH (security_invoker = true)
AS
SELECT
  uaa.id AS attribution_id,
  uaa.user_id,
  u.email AS user_email,
  COALESCE(p.full_name, u.name) AS user_display_name,
  uaa.affiliate_partner_id,
  ap.display_name AS affiliate_display_name,
  ap.affiliate_type,
  ap.status AS affiliate_status,
  uaa.affiliate_code_id,
  ac.code AS affiliate_code,
  ac.status AS affiliate_code_status,
  uaa.source,
  uaa.source_merchant_partner_id,
  source_partner.name AS source_merchant_name,
  source_partner.company_name AS source_merchant_company_name,
  uaa.attributed_at,
  uaa.locked,
  uaa.created_by,
  uaa.metadata
FROM public.user_affiliate_attributions uaa
JOIN public.affiliate_partners ap
  ON ap.id = uaa.affiliate_partner_id
LEFT JOIN public.affiliate_codes ac
  ON ac.id = uaa.affiliate_code_id
LEFT JOIN public.users u
  ON u.id = uaa.user_id
LEFT JOIN public.profiles p
  ON p.id = uaa.user_id
LEFT JOIN public.partners source_partner
  ON source_partner.id = uaa.source_merchant_partner_id;

CREATE OR REPLACE VIEW public.v_admin_affiliate_merchant_referrals
WITH (security_invoker = true)
AS
SELECT
  mar.id AS merchant_referral_id,
  mar.merchant_partner_id,
  merchant.name AS merchant_name,
  merchant.company_name AS merchant_company_name,
  merchant.contact_email AS merchant_contact_email,
  merchant.status AS merchant_status,
  merchant.auth_user_id AS merchant_auth_user_id,
  mar.affiliate_partner_id,
  ap.display_name AS affiliate_display_name,
  ap.affiliate_type,
  ap.status AS affiliate_status,
  mar.affiliate_code_id,
  ac.code AS affiliate_code,
  ac.status AS affiliate_code_status,
  mar.status,
  mar.registered_at,
  mar.approved_at,
  mar.activated_at,
  mar.bonus_eligible_at,
  mar.created_by,
  mar.metadata
FROM public.merchant_affiliate_referrals mar
JOIN public.affiliate_partners ap
  ON ap.id = mar.affiliate_partner_id
LEFT JOIN public.affiliate_codes ac
  ON ac.id = mar.affiliate_code_id
JOIN public.partners merchant
  ON merchant.id = mar.merchant_partner_id;

CREATE OR REPLACE VIEW public.v_admin_affiliate_commission_events
WITH (security_invoker = true)
AS
SELECT
  ace.id AS commission_event_id,
  ace.affiliate_partner_id,
  ap.display_name AS affiliate_display_name,
  ap.affiliate_type,
  ap.status AS affiliate_status,
  ace.user_id,
  u.email AS user_email,
  COALESCE(p.full_name, u.name) AS user_display_name,
  ace.payment_id,
  pay.amount AS payments_amount_miocoins,
  pay.method AS payment_method,
  pay.status AS payment_status,
  pay.stripe_session_id,
  pay.created_at AS payment_created_at,
  ace.payment_amount_snapshot,
  ace.payment_amount_source,
  ace.commission_rate_snapshot,
  ace.commission_amount_czk,
  ace.status,
  ace.calculated_at,
  ace.approved_at,
  ace.paid_at,
  ace.reversed_at,
  ace.reverse_reason,
  ace.metadata
FROM public.affiliate_commission_events ace
JOIN public.affiliate_partners ap
  ON ap.id = ace.affiliate_partner_id
LEFT JOIN public.users u
  ON u.id = ace.user_id
LEFT JOIN public.profiles p
  ON p.id = ace.user_id
JOIN public.payments pay
  ON pay.id = ace.payment_id;

GRANT SELECT ON
  public.v_admin_affiliate_customer_attributions,
  public.v_admin_affiliate_merchant_referrals,
  public.v_admin_affiliate_commission_events
TO authenticated;
