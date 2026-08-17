-- Shoptet automatic import: 15 minutes → 1 minute (STAGING dxmowysntemfqfnanxua).
--
-- Safe ONLY together with the delta-fetch change in the Edge Function
-- (supabase/functions/import-shoptet-orders/delta.ts). Without it every run would
-- re-download the partner's entire order export, once a minute.
--
-- Shoptet's own documentation makes this the supported path:
--   "Pokud stahujete objednávky více než jednou za 15 minut, lze využít pouze
--    tento způsob stažení objednávek."  (podpora.shoptet.cz/export-objednavek/)
-- i.e. sub-15-minute polling REQUIRES the updateTimeFrom delta parameter, which
-- the Edge Function now sends.
--
-- What this migration changes: the cron schedule and the job name. Nothing else.
--   * run_shoptet_cron_imports() is NOT modified — its overlap guard (skip any
--     partner with a 'running' import younger than 30 min) is unchanged and is
--     what prevents parallel double processing at the higher cadence.
--   * verify_shoptet_cron_token(), the Vault secret, partner config, the reward
--     engine and customer e-mail delivery are all untouched.
--
-- The job is renamed because 'shoptet_auto_import_15min' would be actively
-- misleading at a 1-minute cadence.
--
-- Rollback:
--   select cron.unschedule('shoptet_auto_import_1min');
--   select cron.schedule('shoptet_auto_import_15min', '*/15 * * * *',
--                        $$ select public.run_shoptet_cron_imports(); $$);
--   (and redeploy the previous import-shoptet-orders version)

do $$
begin
  -- Idempotent: drop the old job only if this migration has not already run.
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
    -- Already present: make sure the schedule is the intended one.
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'shoptet_auto_import_1min'),
      schedule := '* * * * *'
    );
  end if;
end $$;
