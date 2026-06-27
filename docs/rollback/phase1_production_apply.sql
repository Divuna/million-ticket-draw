-- ============================================================================
-- Phase 1 production apply package - sensitive admin lock
-- ============================================================================
-- DO NOT RUN until:
--   1. Pavel explicitly approves production rollout.
--   2. A manual pg_dump has been taken because PITR is off.
--   3. docs/rollback/phase1_production_rollback.sql is present.
--   4. The target is confirmed as production xkzhjldrojjlrkezorey.
--
-- Edge Functions are intentionally NOT deployed by this SQL package. Read-only
-- inspection found production target EFs already contain role='superadmin' JWT
-- checks; verify them separately.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Helper: public.is_superadmin()
-- Stop point after this section: verify helper existence, owner, ACL.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_superadmin(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = check_user_id
      AND ur.role = 'superadmin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_superadmin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(uuid) TO authenticated;

-- ============================================================================
-- 2. RLS policies
-- Stop point after this section: run the policy verification block.
-- ============================================================================

-- payments: preserve own-row read policies.
DROP POLICY IF EXISTS admin_payments_read_all ON public.payments;
CREATE POLICY admin_payments_read_all ON public.payments
AS PERMISSIVE FOR SELECT TO authenticated
USING (public.is_superadmin());

-- influencer_commissions: remove public read of all commission rows.
DROP POLICY IF EXISTS influencer_commissions_read ON public.influencer_commissions;
CREATE POLICY influencer_commissions_read ON public.influencer_commissions
AS PERMISSIVE FOR SELECT TO authenticated
USING (public.is_superadmin());

-- affiliate finance RLS: preserve affiliate own-row SELECT branch.
DROP POLICY IF EXISTS apd_admin_all ON public.affiliate_payout_documents;
CREATE POLICY apd_admin_all ON public.affiliate_payout_documents
AS PERMISSIVE FOR ALL TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS apbi_admin_all ON public.affiliate_payout_batch_items;
CREATE POLICY apbi_admin_all ON public.affiliate_payout_batch_items
AS PERMISSIVE FOR ALL TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS apb_admin_all ON public.affiliate_payout_batches;
CREATE POLICY apb_admin_all ON public.affiliate_payout_batches
AS PERMISSIVE FOR ALL TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS aff_commissions_admin_write ON public.affiliate_commissions;
CREATE POLICY aff_commissions_admin_write ON public.affiliate_commissions
AS PERMISSIVE FOR ALL TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS aff_commissions_select ON public.affiliate_commissions;
CREATE POLICY aff_commissions_select ON public.affiliate_commissions
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  affiliate_id IN (
    SELECT aa.id
    FROM public.affiliate_accounts aa
    WHERE aa.auth_user_id = auth.uid()
  )
  OR public.is_superadmin()
);

-- partner invoices / lines / exports: preserve partner-own SELECT policies.
DROP POLICY IF EXISTS partner_invoice_exports_admin_select ON public.partner_invoice_exports;
CREATE POLICY partner_invoice_exports_admin_select ON public.partner_invoice_exports
AS PERMISSIVE FOR SELECT TO authenticated
USING (public.is_superadmin());

DROP POLICY IF EXISTS partner_invoice_lines_admin_select ON public.partner_invoice_lines;
CREATE POLICY partner_invoice_lines_admin_select ON public.partner_invoice_lines
AS PERMISSIVE FOR SELECT TO authenticated
USING (public.is_superadmin());

DROP POLICY IF EXISTS partner_invoices_admin_select ON public.partner_invoices;
CREATE POLICY partner_invoices_admin_select ON public.partner_invoices
AS PERMISSIVE FOR SELECT TO authenticated
USING (public.is_superadmin());

DROP POLICY IF EXISTS partner_invoices_admin_update ON public.partner_invoices;
CREATE POLICY partner_invoices_admin_update ON public.partner_invoices
AS PERMISSIVE FOR UPDATE TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- contest economy.
DROP POLICY IF EXISTS contest_economy_admin_all ON public.contest_economy;
CREATE POLICY contest_economy_admin_all ON public.contest_economy
AS PERMISSIVE FOR ALL TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- tickets admin read: preserve own-row read policies.
DROP POLICY IF EXISTS tickets_admin_select_all ON public.tickets;
CREATE POLICY tickets_admin_select_all ON public.tickets
AS PERMISSIVE FOR SELECT TO authenticated
USING (public.is_superadmin());

-- winners write/status history: public-read winners policies intentionally remain.
DROP POLICY IF EXISTS "Admins can insert winner status history" ON public.winner_status_history;
CREATE POLICY "Admins can insert winner status history" ON public.winner_status_history
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK ((winner_id IS NOT NULL) AND public.is_superadmin());

DROP POLICY IF EXISTS "Admins can view winner status history" ON public.winner_status_history;
CREATE POLICY "Admins can view winner status history" ON public.winner_status_history
AS PERMISSIVE FOR SELECT TO authenticated
USING (public.is_superadmin());

DROP POLICY IF EXISTS admin_manage_winners_secure ON public.winners;
CREATE POLICY admin_manage_winners_secure ON public.winners
AS PERMISSIVE FOR ALL TO authenticated
USING (public.is_superadmin());

DROP POLICY IF EXISTS winners_admin_full ON public.winners;
CREATE POLICY winners_admin_full ON public.winners
AS PERMISSIVE FOR ALL TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- referral rewards: preserve own-row SELECT.
DROP POLICY IF EXISTS referral_rewards_select_admin ON public.referral_rewards;
CREATE POLICY referral_rewards_select_admin ON public.referral_rewards
AS PERMISSIVE FOR SELECT TO authenticated
USING (public.is_superadmin());

-- settings.
DROP POLICY IF EXISTS "Only admins can modify settings" ON public.settings;
CREATE POLICY "Only admins can modify settings" ON public.settings
AS PERMISSIVE FOR ALL TO authenticated
USING (public.is_superadmin());

-- event_logs.
DROP POLICY IF EXISTS "Admin access to event logs" ON public.event_logs;
CREATE POLICY "Admin access to event logs" ON public.event_logs
AS PERMISSIVE FOR ALL TO authenticated
USING (public.is_superadmin());

-- ============================================================================
-- 3. RPC gates
-- Stop point after this section: run RPC definition verification.
--
-- These DO blocks intentionally guard for the expected pre-rollout gate snippets.
-- If a target function has drifted, the block raises and the transaction aborts.
-- ============================================================================

DO $$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_manage_contest',
        'admin_manage_bonus_prize',
        'update_bonus_prize_delivery_status',
        'admin_begin_miocoin_save',
        'admin_append_miocoin_chunk',
        'admin_finalize_miocoin_save',
        'get_admin_top_bar_stats'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;

    v_new := replace(v_new, 'role IN (''admin'', ''superadmin'')', 'role = ''superadmin''');
    v_new := replace(v_new, 'role in (''admin'',''superadmin'')', 'role = ''superadmin''');
    v_new := replace(v_new, 'role IN (''admin'',''superadmin'')', 'role = ''superadmin''');

    IF v_new = v_def THEN
      RAISE EXCEPTION 'Phase 1 apply refused: expected admin/superadmin gate not found in %.%', r.proname, r.args;
    END IF;

    EXECUTE v_new;
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_set_affiliate_commission_status',
        'create_affiliate_payout_batch',
        'mark_affiliate_payout_batch_paid',
        'update_affiliate_payout_batch_meta'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, 'public.is_admin()', 'public.is_superadmin()');

    IF v_new = v_def THEN
      RAISE EXCEPTION 'Phase 1 apply refused: expected public.is_admin() gate not found in %.%', r.proname, r.args;
    END IF;

    EXECUTE v_new;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- After commit:
--   1. Run docs/rollback/phase1_production_verification.sql.
--   2. Verify Edge Functions only; do not deploy.
-- ============================================================================
