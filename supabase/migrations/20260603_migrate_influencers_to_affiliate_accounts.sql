-- ============================================================================
-- OneMil Affiliate program — data migration: legacy influencers -> affiliate_accounts
-- ============================================================================
-- Copies existing influencer partners (partners.notes ILIKE '%influencer%') into
-- the standalone affiliate_accounts table. STAGING ONLY.
--
-- Safety / isolation:
--   - The legacy influencer system (partners + influencer_referrals/commissions/
--     campaigns) is LEFT INTACT and keeps running in parallel. Nothing is dropped.
--   - No change to customer accounts, Partner portal, payments, tickets, contests,
--     wallet, or buy_ticket_atomic.
--   - Additive INSERT only into affiliate_accounts.
--
-- Rules:
--   - modes = '{influencer}'
--   - commission_rate_customer = 5.00, commission_rate_company = 5.00
--   - status mapped 1:1 from partners.status (same allowed values)
--   - ref_code generated deterministically: up to 8 alnum chars from name
--     (diacritics/symbols stripped, uppercased) + 4 hex chars from partner id.
--     Fallback 'AFF' when name yields no alnum chars.
--   - Idempotent: skips partners whose auth_user_id already has an affiliate_accounts
--     row (re-run safe). Only migrates rows with non-null auth_user_id and email.
--   - notes stores provenance: 'migrated_from_partners:<partner_id>'.
-- ============================================================================

INSERT INTO public.affiliate_accounts
  (auth_user_id, name, email, phone, ref_code, modes, status,
   commission_rate_customer, commission_rate_company, payout_account, payout_bank, notes)
SELECT
  p.auth_user_id,
  p.name,
  p.contact_email,
  p.contact_phone,
  COALESCE(NULLIF(upper(left(regexp_replace(p.name, '[^a-zA-Z0-9]', '', 'g'), 8)), ''), 'AFF')
    || upper(substr(replace(p.id::text, '-', ''), 1, 4)) AS ref_code,
  ARRAY['influencer']::text[],
  CASE WHEN p.status::text IN ('pending','approved','suspended','rejected')
       THEN p.status::text ELSE 'pending' END,
  5.00,
  5.00,
  p.payout_account,
  p.payout_bank,
  'migrated_from_partners:' || p.id::text
FROM public.partners p
WHERE p.notes ILIKE '%influencer%'
  AND p.auth_user_id IS NOT NULL
  AND p.contact_email IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.affiliate_accounts a WHERE a.auth_user_id = p.auth_user_id
  );
