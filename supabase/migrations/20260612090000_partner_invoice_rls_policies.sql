-- ====================================================================
-- Partner Invoice RLS policies — visibility + admin status update
-- Fix krok 1 (audit 12. 06. 2026):
--   * partner dosud NEVIDĚL vlastní faktury (partner_invoices měla pouze
--     policy partner_invoices_admin_select), /partner/invoices byl vždy prázdný
--   * partner_invoice_exports a partner_invoice_lines neměly žádné policy
--     (deny-all) -> prázdný admin drawer položek i chybějící PDF odkazy
--   * admin neměl UPDATE policy -> změna stavu draft/issued/paid z UI selhávala
--
-- Pouze rozšíření čtení + admin UPDATE. Žádné INSERT/DELETE policy pro
-- klienty — zápis faktur zůstává výhradně na SECURITY DEFINER funkcích
-- a service_role. Idempotentní (DROP POLICY IF EXISTS + CREATE).
--
-- NEAPLIKOVÁNO — čeká na výslovné schválení Pavla (staging first).
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. partner_invoices
-- --------------------------------------------------------------------

-- Partner vidí pouze své faktury (vazba přes partners.auth_user_id)
DROP POLICY IF EXISTS partner_invoices_partner_select ON public.partner_invoices;
CREATE POLICY partner_invoices_partner_select
  ON public.partner_invoices
  FOR SELECT
  TO authenticated
  USING (
    partner_id IN (
      SELECT p.id
      FROM public.partners p
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- Admin/superadmin může aktualizovat fakturu (stav draft -> issued -> paid)
DROP POLICY IF EXISTS partner_invoices_admin_update ON public.partner_invoices;
CREATE POLICY partner_invoices_admin_update
  ON public.partner_invoices
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Pozn.: existující policy partner_invoices_admin_select (is_admin())
-- zůstává beze změny — admin čtení je už pokryté.

-- --------------------------------------------------------------------
-- 2. partner_invoice_exports
-- --------------------------------------------------------------------

-- Partner vidí pouze exporty (PDF) navázané na vlastní faktury
DROP POLICY IF EXISTS partner_invoice_exports_partner_select ON public.partner_invoice_exports;
CREATE POLICY partner_invoice_exports_partner_select
  ON public.partner_invoice_exports
  FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT i.id
      FROM public.partner_invoices i
      JOIN public.partners p ON p.id = i.partner_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- Admin/superadmin vidí všechny exporty
DROP POLICY IF EXISTS partner_invoice_exports_admin_select ON public.partner_invoice_exports;
CREATE POLICY partner_invoice_exports_admin_select
  ON public.partner_invoice_exports
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- --------------------------------------------------------------------
-- 3. partner_invoice_lines
-- --------------------------------------------------------------------

-- Partner vidí pouze položky vlastních faktur
DROP POLICY IF EXISTS partner_invoice_lines_partner_select ON public.partner_invoice_lines;
CREATE POLICY partner_invoice_lines_partner_select
  ON public.partner_invoice_lines
  FOR SELECT
  TO authenticated
  USING (
    invoice_id IN (
      SELECT i.id
      FROM public.partner_invoices i
      JOIN public.partners p ON p.id = i.partner_id
      WHERE p.auth_user_id = auth.uid()
    )
  );

-- Admin/superadmin vidí všechny položky faktur
DROP POLICY IF EXISTS partner_invoice_lines_admin_select ON public.partner_invoice_lines;
CREATE POLICY partner_invoice_lines_admin_select
  ON public.partner_invoice_lines
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ====================================================================
-- Postcheck (spustit ručně po aplikaci):
--   SELECT tablename, policyname, cmd, roles::text
--   FROM pg_policies
--   WHERE tablename IN ('partner_invoices','partner_invoice_exports','partner_invoice_lines')
--   ORDER BY tablename, policyname;
-- Očekáváno: 6 nových policy + původní partner_invoices_admin_select.
-- ====================================================================
