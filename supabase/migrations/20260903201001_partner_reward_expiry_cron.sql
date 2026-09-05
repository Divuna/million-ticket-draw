-- ============================================================================
-- FÁZE 1 (dokončení) — denní cron pro expiraci partnerských odměn
--
-- ⚠️ TENTO SOUBOR JE ZPĚTNÝ ZÁZNAM JIŽ APLIKOVANÉ PRODUKČNÍ MIGRACE.
--    Verze `20260903201001` (`partner_reward_expiry_cron`) je na produkci
--    `xkzhjldrojjlrkezorey` aplikovaná od 03. 09. 2026. SQL níže je doslovný
--    přepis `supabase_migrations.schema_migrations.statements` pro tuto verzi
--    (read-only export, 05. 09. 2026) — nic se jím znovu nenasazuje.
--
-- Ověřený živý stav cronu k 05. 09. 2026 (read-only `cron.job`):
--     jobid    = 33
--     jobname  = expire_partner_reward_codes_daily
--     schedule = 30 3 * * *
--     command  = SELECT public.expire_partner_reward_codes();
--     active   = true
--     database = postgres   username = postgres   nodename = localhost
--
-- Cron volá `public.expire_partner_reward_codes()`, kterou vytvořila migrace
-- `20260903200832_partner_reward_90day_expiry.sql`. Funkce je idempotentní
-- (`WHERE status='issued' AND expired_at < now()`), nedotýká se stavů
-- 'activated' ani 'cancelled' a označuje řádky markerem
-- `metadata.expired_by='cron'`.
--
-- ⚠️ Tato migrace používá holé `cron.schedule(...)`, ne idempotentní obal.
--    Opakované spuštění by stejný job jen přeplánovalo na tytéž hodnoty;
--    přesto se soubor NEMÁ znovu aplikovat — job na produkci už existuje.
--
-- ROLLBACK: SELECT cron.unschedule('expire_partner_reward_codes_daily');
--           (viz docs/rollback/phase1_partner_reward_expiry_rollback.sql)
-- ============================================================================

SELECT cron.schedule(
  'expire_partner_reward_codes_daily',
  '30 3 * * *',
  $$SELECT public.expire_partner_reward_codes();$$
);
