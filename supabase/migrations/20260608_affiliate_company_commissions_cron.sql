-- Migration: affiliate_company_commissions_cron
-- Adds a monthly pg_cron job to automatically calculate B2B company affiliate commissions.
--
-- Context:
--   calculate_affiliate_commissions_for_month() computes commission_type='company_invoice'
--   rows in affiliate_commissions from paid partner_invoices via partners.referred_by_affiliate_id.
--   Without this job, B2B company commissions must be triggered manually each month.
--
-- Timing: 2nd of each month at 03:00 UTC
--   - After weekly_partner_invoices (Sundays 02:00, job 17)
--   - After influencer_commissions_monthly (1st of month 02:00, job 20)
--
-- Idempotent: only schedules if job does not already exist. Does not drop/replace.
-- Rollback: SELECT cron.unschedule('affiliate_company_commissions_monthly');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'affiliate_company_commissions_monthly'
  ) THEN
    PERFORM cron.schedule(
      'affiliate_company_commissions_monthly',
      '0 3 2 * *',
      $cmd$
        SELECT public.calculate_affiliate_commissions_for_month(
          date_trunc('month', current_date - interval '1 month')::date
        );
      $cmd$
    );
  END IF;
END;
$$;
