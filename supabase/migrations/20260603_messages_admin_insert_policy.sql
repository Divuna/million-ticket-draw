-- ============================================================================
-- OneMil — restore admin/superadmin INSERT policy on public.messages
-- ============================================================================
-- Root cause of "Zprávu nelze odeslat": the messages INSERT policy set was
-- consolidated to only:
--   messages_insert        (authenticated)  WITH CHECK (auth.uid() = user_id)
--   messages_insert_system (service_role)   WITH CHECK (true)
-- There was NO policy letting an admin (authenticated) insert a reply where
-- user_id <> auth.uid(). So every admin reply to any user — including affiliate
-- partners — was denied by RLS and surfaced as "Zprávu nelze odeslat".
--
-- This restores the admin reply capability via the canonical user_roles check,
-- mirroring the existing messages_select_admin / messages_update policies.
--
-- INSERT-only, additive. No data mutation. No customer/partner/affiliate row
-- changes. Does not touch payments, tickets, contests, wallet, buy_ticket_atomic.
--
-- Apply to STAGING first. Production requires explicit approval.
-- ============================================================================

DROP POLICY IF EXISTS messages_insert_admin ON public.messages;

CREATE POLICY messages_insert_admin ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role])
    )
  );
