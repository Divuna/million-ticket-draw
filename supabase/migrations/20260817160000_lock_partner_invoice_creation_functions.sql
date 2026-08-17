-- Partner invoice creation is an internal financial operation: service_role only.
--
-- WHY THIS EXISTS ALONGSIDE 20260718090000
--   20260718090000_lock_partner_invoice_weekly_function.sql locked exactly ONE
--   function, create_partner_invoices_for_last_week(). The other invoice creators
--   were never locked. Verified read-only on production xkzhjldrojjlrkezorey
--   (17. 08. 2026):
--
--     create_partner_invoices_for_last_week()          anon NO  · authenticated NO  · service_role YES
--     create_partner_invoices_for_period(date,date)    anon YES · authenticated YES · service_role YES
--     generate_partner_invoice(uuid,date,date)         anon YES · authenticated YES · service_role YES
--     run_monthly_partner_invoicing(date,date)         anon YES · authenticated YES · service_role YES
--
--   On staging all four were open to anon and authenticated, because
--   20260718090000 was never applied there either.
--
--   These functions create partner_invoices rows, allocate invoice numbers and
--   flip partner_coin_activations.invoiced — i.e. they bill a partner. Anyone
--   holding the public anon key could call them directly over PostgREST.
--
-- CALLER AUDIT (repo + database, 17. 08. 2026) — no browser/user caller exists
--   create_partner_invoices_for_last_week()
--     cron job 17 weekly_partner_invoices
--       -> run_partner_invoice_weekly_automation()  (SECURITY DEFINER, owner postgres,
--          reads the Vault internal token)
--       -> Edge Function partner-invoice-auto-send  (SUPABASE_SERVICE_ROLE_KEY client)
--       -> this function
--   create_partner_invoices_for_period(date, date)
--     only tests/e2e/43-partner-invoices.spec.ts, via E2E_SUPABASE_SERVICE_ROLE_KEY
--   generate_partner_invoice(uuid, date, date)
--     only run_monthly_partner_invoicing(date, date)
--   run_monthly_partner_invoicing(date, date)
--     no caller at all (src/ mentions it only in the generated
--     src/integrations/supabase/types.ts)
--
--   Nothing in src/ calls any of them — the frontend, admin UI and partner portal
--   read invoices from tables, they never create them.
--
--   run_monthly_partner_invoicing is included because it is SECURITY INVOKER and
--   does nothing but loop generate_partner_invoice. Leaving it open while locking
--   the inner function would only turn a hole into a confusing runtime error, so
--   it is locked at the same level as what it wraps.
--
-- SCOPE
--   Privileges only. No function body, no calculation, no invoice data, no RLS,
--   no status logic and no invoice numbering is touched. No UPDATE, no DELETE,
--   no backfill.
--
--   REVOKE/GRANT are idempotent, and each statement is guarded by
--   to_regprocedure so the migration is safe on a database where
--   create_partner_invoices_for_last_week() is already locked.
--
-- Rollback (restores the pre-migration, deliberately less safe state):
--   GRANT EXECUTE ON FUNCTION public.create_partner_invoices_for_period(date, date) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.generate_partner_invoice(uuid, date, date)     TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.run_monthly_partner_invoicing(date, date)      TO anon, authenticated;

begin;

DO $$
DECLARE
  v_sig text;
  v_signatures text[] := ARRAY[
    'public.create_partner_invoices_for_last_week()',
    'public.create_partner_invoices_for_period(date, date)',
    'public.generate_partner_invoice(uuid, date, date)',
    'public.run_monthly_partner_invoicing(date, date)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_signatures LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE NOTICE 'Skipping %, function not present on this database', v_sig;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

COMMENT ON FUNCTION public.create_partner_invoices_for_period(date, date) IS
  'Internal partner invoicing. service_role only; not callable by anon or authenticated. CZK amounts are stored rounded to 2 decimals and amount_gross is derived from the rounded net + rounded VAT, never from its own formula.';
COMMENT ON FUNCTION public.generate_partner_invoice(uuid, date, date) IS
  'Internal partner invoicing. service_role only; not callable by anon or authenticated. Single-partner coin invoice for a max 7-day period; amount_gross = amount_net + vat_amount.';
COMMENT ON FUNCTION public.run_monthly_partner_invoicing(date, date) IS
  'Internal partner invoicing. service_role only; not callable by anon or authenticated. Loops generate_partner_invoice over every partner with uninvoiced activations in the period.';

commit;
