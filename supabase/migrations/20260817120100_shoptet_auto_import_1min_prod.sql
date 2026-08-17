-- Shoptet automatic import: 15 minutes → 1 minute (PRODUCTION xkzhjldrojjlrkezorey).
--
-- ⛔ NOT APPLIED. Requires Pavel's explicit approval.
--
-- Production counterpart of 20260817120000_shoptet_auto_import_1min.sql (staging).
-- The logic is identical — the production orchestrator run_shoptet_cron_imports()
-- already points at the production functions URL, so nothing environment-specific
-- appears here.
--
-- ── Ordering requirement (do not reorder) ────────────────────────────────────
-- Deploy the Edge Function FIRST, this migration SECOND. The 1-minute schedule is
-- only safe once import-shoptet-orders sends `updateTimeFrom`; applying this
-- against the old function would re-download every partner's full export once a
-- minute.
--
-- ── Pre-apply checks ─────────────────────────────────────────────────────────
--   * import-shoptet-orders deployed and ACTIVE, built from delta.ts.
--   * One live cron cycle observed with status='ok' and a non-null delta window.
--   * Shoptet's server-side interpretation of updateTimeFrom confirmed against a
--     REAL export (staging could not verify this — its export URL returns 404).
--     Specifically: confirm the returned row count actually shrinks, i.e. the
--     parameter is honoured rather than silently ignored.
--
-- Rollback:
--   select cron.unschedule('shoptet_auto_import_1min');
--   select cron.schedule('shoptet_auto_import_15min', '*/15 * * * *',
--                        $$ select public.run_shoptet_cron_imports(); $$);
--   (and redeploy the previous import-shoptet-orders version)

do $$
begin
  if exists (select 1 from cron.job where jobname = 'shoptet_auto_import_15min') then
    perform cron.unschedule('shoptet_auto_import_15min');
  end if;

  if not exists (select 1 from cron.job where jobname = 'shoptet_auto_import_1min') then
    perform cron.schedule(
      'shoptet_auto_import_1min',
      '* * * * *',
      $cron$ select public.run_shoptet_cron_imports(); $cron$
    );
  else
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'shoptet_auto_import_1min'),
      schedule := '* * * * *'
    );
  end if;
end $$;
