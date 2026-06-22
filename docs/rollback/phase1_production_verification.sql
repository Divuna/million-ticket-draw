-- ============================================================================
-- Phase 1 production verification SQL
-- ============================================================================
-- Read-only verification. Run after each stop point and after full rollout.
-- Expected high-level results:
--   - superadmin allowed
--   - admin/subadmin blocked
--   - normal user blocked
--   - anon blocked
--   - affiliate own commission visibility preserved
--   - Edge Functions already superadmin-gated; no deploy needed
-- ============================================================================

-- 1. Helper existence / ACL.
SELECT
  'helper' AS check_group,
  p.oid IS NOT NULL AS exists_live,
  p.prosecdef AS security_definer,
  pg_get_userbyid(p.proowner) AS owner,
  p.proacl::text AS acl,
  md5(pg_get_functiondef(p.oid)) AS definition_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_superadmin'
  AND pg_get_function_identity_arguments(p.oid) = 'check_user_id uuid';

-- 2. Policy summary with STRING_AGG. Every sensitive admin policy should mention
-- public.is_superadmin or is_superadmin after apply. Own-row/public policies are
-- included so reviewers can confirm they were preserved.
WITH target AS (
  SELECT *
  FROM (VALUES
    ('payments','admin_payments_read_all','superadmin'),
    ('payments','payments_select_own','preserve-own'),
    ('payments','payments_user_read','preserve-own'),
    ('influencer_commissions','influencer_commissions_read','superadmin'),
    ('affiliate_payout_documents','apd_admin_all','superadmin'),
    ('affiliate_payout_batch_items','apbi_admin_all','superadmin'),
    ('affiliate_payout_batches','apb_admin_all','superadmin'),
    ('affiliate_commissions','aff_commissions_admin_write','superadmin'),
    ('affiliate_commissions','aff_commissions_select','superadmin-plus-affiliate-own'),
    ('partner_invoice_exports','partner_invoice_exports_admin_select','superadmin'),
    ('partner_invoice_exports','partner_invoice_exports_partner_select','preserve-partner-own'),
    ('partner_invoice_lines','partner_invoice_lines_admin_select','superadmin'),
    ('partner_invoice_lines','partner_invoice_lines_partner_select','preserve-partner-own'),
    ('partner_invoices','partner_invoices_admin_select','superadmin'),
    ('partner_invoices','partner_invoices_admin_update','superadmin'),
    ('partner_invoices','partner_invoices_partner_select','preserve-partner-own'),
    ('contest_economy','contest_economy_admin_all','superadmin'),
    ('tickets','tickets_admin_select_all','superadmin'),
    ('tickets','tickets_select_own','preserve-own'),
    ('tickets','tickets_user_read','preserve-own'),
    ('winner_status_history','Admins can insert winner status history','superadmin'),
    ('winner_status_history','Admins can view winner status history','superadmin'),
    ('winners','admin_manage_winners_secure','superadmin'),
    ('winners','winners_admin_full','superadmin'),
    ('winners','Allow read winners','preserve-public-read'),
    ('winners','winners_public_read','preserve-public-read'),
    ('winners','winners_select_authenticated','preserve-public-read'),
    ('winners','user_can_view_own_wins','preserve-own'),
    ('winners','winners_select_own','preserve-own'),
    ('referral_rewards','referral_rewards_select_admin','superadmin'),
    ('referral_rewards','referral_rewards_select_own','preserve-own'),
    ('settings','Only admins can modify settings','superadmin'),
    ('event_logs','Admin access to event logs','superadmin')
  ) AS t(tablename, policyname, expected)
)
SELECT
  expected,
  string_agg(
    tablename || '.' || policyname || ' => cmd=' || coalesce(p.cmd, '<missing>')
    || ', roles=' || coalesce(array_to_string(p.roles, ','), '<missing>')
    || ', using=' || coalesce(p.qual, '<null>')
    || ', check=' || coalesce(p.with_check, '<null>'),
    E'\n' ORDER BY tablename, policyname
  ) AS policy_details
FROM target t
LEFT JOIN pg_policies p
  ON p.schemaname = 'public'
 AND p.tablename = t.tablename
 AND p.policyname = t.policyname
GROUP BY expected
ORDER BY expected;

-- 3. Policy pass/fail flags.
WITH target AS (
  SELECT *
  FROM (VALUES
    ('payments','admin_payments_read_all','superadmin'),
    ('influencer_commissions','influencer_commissions_read','superadmin'),
    ('affiliate_payout_documents','apd_admin_all','superadmin'),
    ('affiliate_payout_batch_items','apbi_admin_all','superadmin'),
    ('affiliate_payout_batches','apb_admin_all','superadmin'),
    ('affiliate_commissions','aff_commissions_admin_write','superadmin'),
    ('affiliate_commissions','aff_commissions_select','superadmin-plus-affiliate-own'),
    ('partner_invoice_exports','partner_invoice_exports_admin_select','superadmin'),
    ('partner_invoice_lines','partner_invoice_lines_admin_select','superadmin'),
    ('partner_invoices','partner_invoices_admin_select','superadmin'),
    ('partner_invoices','partner_invoices_admin_update','superadmin'),
    ('contest_economy','contest_economy_admin_all','superadmin'),
    ('tickets','tickets_admin_select_all','superadmin'),
    ('winner_status_history','Admins can insert winner status history','superadmin'),
    ('winner_status_history','Admins can view winner status history','superadmin'),
    ('winners','admin_manage_winners_secure','superadmin'),
    ('winners','winners_admin_full','superadmin'),
    ('referral_rewards','referral_rewards_select_admin','superadmin'),
    ('settings','Only admins can modify settings','superadmin'),
    ('event_logs','Admin access to event logs','superadmin')
  ) AS t(tablename, policyname, expected)
)
SELECT
  string_agg(
    tablename || '.' || policyname || '=' ||
    CASE
      WHEN p.policyname IS NULL THEN 'MISSING'
      WHEN coalesce(p.qual,'') || ' ' || coalesce(p.with_check,'') ILIKE '%is_superadmin%' THEN 'OK'
      ELSE 'FAIL'
    END,
    ', ' ORDER BY tablename, policyname
  ) AS sensitive_policy_status
FROM target t
LEFT JOIN pg_policies p
  ON p.schemaname = 'public'
 AND p.tablename = t.tablename
 AND p.policyname = t.policyname;

-- 4. RPC gate definitions with STRING_AGG.
WITH target_functions AS (
  SELECT *
  FROM (VALUES
    ('admin_manage_contest'),
    ('admin_manage_bonus_prize'),
    ('update_bonus_prize_delivery_status'),
    ('admin_begin_miocoin_save'),
    ('admin_append_miocoin_chunk'),
    ('admin_finalize_miocoin_save'),
    ('get_admin_top_bar_stats'),
    ('admin_set_affiliate_commission_status'),
    ('create_affiliate_payout_batch'),
    ('mark_affiliate_payout_batch_paid'),
    ('update_affiliate_payout_batch_meta')
  ) AS t(function_name)
)
SELECT
  string_agg(
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    || ' secdef=' || p.prosecdef
    || ' owner=' || pg_get_userbyid(p.proowner)
    || ' gate=' ||
      CASE
        WHEN pg_get_functiondef(p.oid) ILIKE '%is_superadmin%' THEN 'is_superadmin'
        WHEN pg_get_functiondef(p.oid) ILIKE '%role = ''superadmin''%' THEN 'role=superadmin'
        ELSE 'FAIL'
      END,
    E'\n' ORDER BY p.proname, pg_get_function_identity_arguments(p.oid)
  ) AS rpc_gate_summary
FROM target_functions t
JOIN pg_proc p ON p.proname = t.function_name
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public';

-- 5. Own-row / public-read preservation checks.
SELECT
  'preserved_access' AS check_group,
  string_agg(
    tablename || '.' || policyname || ' => ' || coalesce(qual, '<null>'),
    E'\n' ORDER BY tablename, policyname
  ) AS preserved_policy_details
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    (tablename = 'affiliate_commissions' AND policyname = 'aff_commissions_select')
    OR (tablename = 'payments' AND policyname IN ('payments_select_own','payments_user_read'))
    OR (tablename = 'tickets' AND policyname IN ('tickets_select_own','tickets_user_read'))
    OR (tablename IN ('partner_invoices','partner_invoice_lines','partner_invoice_exports') AND policyname LIKE '%partner_select')
    OR (tablename = 'referral_rewards' AND policyname = 'referral_rewards_select_own')
    OR (tablename = 'winners' AND policyname IN ('Allow read winners','winners_public_read','winners_select_authenticated','user_can_view_own_wins','winners_select_own'))
  );

-- 6. Role boundary data check. Expected:
--    exactly one production superadmin: divispavel2@gmail.com
--    admin/subadmin users remain role='admin' and should be blocked by the gates.
SELECT
  'role_inventory' AS check_group,
  string_agg(role::text || ':' || count::text, ', ' ORDER BY role::text) AS role_counts
FROM (
  SELECT role, count(*) AS count
  FROM public.user_roles
  GROUP BY role
) r;

SELECT
  'superadmin_identity' AS check_group,
  string_agg(coalesce(au.email, ur.user_id::text), ', ' ORDER BY coalesce(au.email, ur.user_id::text)) AS superadmins
FROM public.user_roles ur
LEFT JOIN auth.users au ON au.id = ur.user_id
WHERE ur.role = 'superadmin';

-- 7. Edge Function verification is not SQL. Verify via Supabase function metadata/source:
--    - create-affiliate-payout-document
--    - generate-affiliate-bank-export
--    - generate-partner-invoice-pdf
--    - send-partner-invoice-email
-- Expected: JWT path requires role='superadmin'; internal token / service-role
-- automation paths remain unchanged for partner invoice functions. No deploy needed.
