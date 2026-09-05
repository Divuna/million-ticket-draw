-- ============================================================================
-- ROLLBACK — FÁZE 1: 90denní platnost partnerské odměny
--   migrace: supabase/migrations/20260903200832_partner_reward_90day_expiry.sql
--            + supabase/migrations/20260903201001_partner_reward_expiry_cron.sql
--
-- Spouštět jako jeden transakční blok. Markery v metadata zajišťují, že se
-- nesáhne na řádky, které tato migrace nevytvořila (např. staging kódy
-- HEYGEN-TEST-100 / HEYGEN-TEST-250, které měly expiraci už předtím).
-- ============================================================================

BEGIN;

-- 1. Zrušit cron (pokud byl naplánován)
SELECT cron.unschedule('expire_partner_reward_codes_daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire_partner_reward_codes_daily');

-- 2. Trigger + funkce
DROP TRIGGER IF EXISTS trg_set_partner_reward_expiry ON public.partner_reward_codes;
DROP FUNCTION IF EXISTS public.set_partner_reward_expiry();
DROP FUNCTION IF EXISTS public.expire_partner_reward_codes();

-- 3. Vrátit stavy, které překlopil NÁŠ cron (jen ty s markerem)
UPDATE public.partner_reward_codes
   SET status   = 'issued',
       metadata = metadata - 'expired_by' - 'expired_run_at'
 WHERE status = 'expired'
   AND metadata->>'expired_by' = 'cron';

-- 4. Zrušit expirace, které nastavil NÁŠ trigger (jen ty s markerem)
UPDATE public.partner_reward_codes
   SET expired_at = NULL,
       metadata   = metadata - 'expiry_source' - 'expiry_days'
 WHERE metadata->>'expiry_source' = 'auto_v1';

-- 5. Nastavení a helper
DROP FUNCTION IF EXISTS public.partner_reward_validity_days();
DELETE FROM public.settings WHERE key = 'partner_reward_validity_days';

COMMIT;

-- ----------------------------------------------------------------------------
-- POSTCHECK po rollbacku (očekáváno: samé 0 / false)
-- ----------------------------------------------------------------------------
-- SELECT
--   (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
--     WHERE t.tgname='trg_set_partner_reward_expiry')                     AS trigger_left,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public'
--       AND p.proname IN ('set_partner_reward_expiry','expire_partner_reward_codes',
--                         'partner_reward_validity_days'))                AS functions_left,
--   (SELECT count(*) FROM public.partner_reward_codes
--     WHERE metadata->>'expiry_source'='auto_v1')                         AS marked_rows_left,
--   (SELECT count(*) FROM public.partner_reward_codes
--     WHERE status='expired' AND metadata->>'expired_by'='cron')          AS cron_expired_left,
--   (SELECT count(*) FROM cron.job
--     WHERE jobname='expire_partner_reward_codes_daily')                  AS cron_left,
--   (SELECT count(*) FROM public.settings
--     WHERE key='partner_reward_validity_days')                           AS setting_left;
