-- ============================================================================
-- ROLLBACK — FÁZE 2: start 30denní zahajovací akce + ochrana
--   migrace: supabase/migrations/20260903200856_partner_trial_start.sql
--
-- Vratí i opravu FÁZE 1 (20260903200843) na verzi auto_v1, pokud je potřeba
-- vrátit obě fáze najednou — viz sekce B (jinak sekci B přeskoč).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- A. FÁZE 2
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_start_partner_trial   ON public.partner_reward_codes;
DROP TRIGGER IF EXISTS trg_protect_partner_trial ON public.partners;
DROP FUNCTION IF EXISTS public.start_partner_trial_on_first_issue();
DROP FUNCTION IF EXISTS public.protect_partner_trial_columns();

-- Sloupce jsou aditivní a nikde se nečtou (FÁZE 2 nemění fakturaci),
-- takže jejich odstranění vrací přesně původní chování.
ALTER TABLE public.partners
  DROP COLUMN IF EXISTS trial_ends_at,
  DROP COLUMN IF EXISTS trial_started_at;

-- ---------------------------------------------------------------------------
-- B. Návrat opravy FÁZE 1 (jen pokud se vrací i 20260903200843)
--    Obnoví počítání expirace z issued_at (verze auto_v1).
-- ---------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.set_partner_reward_expiry()
-- RETURNS trigger LANGUAGE plpgsql SET search_path = 'public' AS $$
-- BEGIN
--   IF NEW.status = 'issued'
--      AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'issued')
--      AND NEW.expired_at IS NULL
--   THEN
--     NEW.expired_at := NEW.issued_at
--                       + make_interval(days => public.partner_reward_validity_days());
--     NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
--                     || jsonb_build_object('expiry_source','auto_v1',
--                                           'expiry_days', public.partner_reward_validity_days());
--   END IF;
--   RETURN NEW;
-- END; $$;
--
-- ALTER TABLE public.partner_reward_codes DROP COLUMN IF EXISTS issued_to_customer_at;
-- UPDATE public.partner_reward_codes
--    SET expired_at = NULL, metadata = metadata - 'expiry_source' - 'expiry_days' - 'expiry_from'
--  WHERE metadata->>'expiry_source' = 'auto_v2';

COMMIT;

-- ---------------------------------------------------------------------------
-- POSTCHECK (očekáváno: samé 0)
-- ---------------------------------------------------------------------------
-- SELECT
--   (SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
--      AND table_name='partners' AND column_name IN ('trial_started_at','trial_ends_at')) AS trial_cols_left,
--   (SELECT count(*) FROM pg_trigger WHERE tgname IN
--      ('trg_start_partner_trial','trg_protect_partner_trial'))                           AS triggers_left,
--   (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--      WHERE n.nspname='public' AND p.proname IN
--      ('start_partner_trial_on_first_issue','protect_partner_trial_columns'))            AS fns_left;
