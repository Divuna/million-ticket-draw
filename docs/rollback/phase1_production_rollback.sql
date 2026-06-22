-- ============================================================================
-- Phase 1 production rollback package - sensitive admin lock
-- ============================================================================
-- Source: docs/rollback/phase1_baseline.sql captured from live production.
-- Run only if Phase 1 production rollout must be reverted.
-- This restores original admin/admin+superadmin DB/RLS/RPC gates and then drops
-- public.is_superadmin(uuid) after dependencies are removed.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Restore RLS policies from baseline.
-- ============================================================================

DROP POLICY IF EXISTS admin_payments_read_all ON public.payments;
CREATE POLICY admin_payments_read_all ON public.payments
AS PERMISSIVE FOR SELECT TO authenticated
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

DROP POLICY IF EXISTS influencer_commissions_read ON public.influencer_commissions;
CREATE POLICY influencer_commissions_read ON public.influencer_commissions
AS PERMISSIVE FOR SELECT TO public
USING (true);

DROP POLICY IF EXISTS apd_admin_all ON public.affiliate_payout_documents;
CREATE POLICY apd_admin_all ON public.affiliate_payout_documents
AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS apbi_admin_all ON public.affiliate_payout_batch_items;
CREATE POLICY apbi_admin_all ON public.affiliate_payout_batch_items
AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS apb_admin_all ON public.affiliate_payout_batches;
CREATE POLICY apb_admin_all ON public.affiliate_payout_batches
AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS aff_commissions_admin_write ON public.affiliate_commissions;
CREATE POLICY aff_commissions_admin_write ON public.affiliate_commissions
AS PERMISSIVE FOR ALL TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS aff_commissions_select ON public.affiliate_commissions;
CREATE POLICY aff_commissions_select ON public.affiliate_commissions
AS PERMISSIVE FOR SELECT TO authenticated
USING (
  (
    affiliate_id IN (
      SELECT affiliate_accounts.id
      FROM public.affiliate_accounts
      WHERE affiliate_accounts.auth_user_id = auth.uid()
    )
  )
  OR is_admin()
);

DROP POLICY IF EXISTS partner_invoice_exports_admin_select ON public.partner_invoice_exports;
CREATE POLICY partner_invoice_exports_admin_select ON public.partner_invoice_exports
AS PERMISSIVE FOR SELECT TO authenticated
USING (is_admin());

DROP POLICY IF EXISTS partner_invoice_lines_admin_select ON public.partner_invoice_lines;
CREATE POLICY partner_invoice_lines_admin_select ON public.partner_invoice_lines
AS PERMISSIVE FOR SELECT TO authenticated
USING (is_admin());

DROP POLICY IF EXISTS partner_invoices_admin_select ON public.partner_invoices;
CREATE POLICY partner_invoices_admin_select ON public.partner_invoices
AS PERMISSIVE FOR SELECT TO authenticated
USING (is_admin());

DROP POLICY IF EXISTS partner_invoices_admin_update ON public.partner_invoices;
CREATE POLICY partner_invoices_admin_update ON public.partner_invoices
AS PERMISSIVE FOR UPDATE TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

DROP POLICY IF EXISTS contest_economy_admin_all ON public.contest_economy;
CREATE POLICY contest_economy_admin_all ON public.contest_economy
AS PERMISSIVE FOR ALL TO authenticated
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)))
WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

DROP POLICY IF EXISTS tickets_admin_select_all ON public.tickets;
CREATE POLICY tickets_admin_select_all ON public.tickets
AS PERMISSIVE FOR SELECT TO authenticated
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

DROP POLICY IF EXISTS "Admins can insert winner status history" ON public.winner_status_history;
CREATE POLICY "Admins can insert winner status history" ON public.winner_status_history
AS PERMISSIVE FOR INSERT TO authenticated
WITH CHECK (((winner_id IS NOT NULL) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))));

DROP POLICY IF EXISTS "Admins can view winner status history" ON public.winner_status_history;
CREATE POLICY "Admins can view winner status history" ON public.winner_status_history
AS PERMISSIVE FOR SELECT TO authenticated
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

DROP POLICY IF EXISTS admin_manage_winners_secure ON public.winners;
CREATE POLICY admin_manage_winners_secure ON public.winners
AS PERMISSIVE FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role])
  )
);

DROP POLICY IF EXISTS winners_admin_full ON public.winners;
CREATE POLICY winners_admin_full ON public.winners
AS PERMISSIVE FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role])
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role])
  )
);

DROP POLICY IF EXISTS referral_rewards_select_admin ON public.referral_rewards;
CREATE POLICY referral_rewards_select_admin ON public.referral_rewards
AS PERMISSIVE FOR SELECT TO authenticated
USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)));

DROP POLICY IF EXISTS "Only admins can modify settings" ON public.settings;
CREATE POLICY "Only admins can modify settings" ON public.settings
AS PERMISSIVE FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role])
  )
);

DROP POLICY IF EXISTS "Admin access to event logs" ON public.event_logs;
CREATE POLICY "Admin access to event logs" ON public.event_logs
AS PERMISSIVE FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role])
  )
);

-- ============================================================================
-- 2. Restore RPC gate snippets from baseline patterns.
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
    v_new := replace(v_def, 'role = ''superadmin''', 'role IN (''admin'', ''superadmin'')');

    IF v_new = v_def THEN
      RAISE EXCEPTION 'Phase 1 rollback refused: expected superadmin-only gate not found in %.%', r.proname, r.args;
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
    v_new := replace(v_def, 'public.is_superadmin()', 'public.is_admin()');

    IF v_new = v_def THEN
      RAISE EXCEPTION 'Phase 1 rollback refused: expected public.is_superadmin() gate not found in %.%', r.proname, r.args;
    END IF;

    EXECUTE v_new;
  END LOOP;
END $$;

-- Drop helper after dependent policies/functions are restored.
DROP FUNCTION IF EXISTS public.is_superadmin(uuid);

COMMIT;
