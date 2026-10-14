-- ============================================================================
-- FÁZE 1 (oprava) — 90 dní se počítá od SKUTEČNÉHO vydání zákazníkovi
--
-- ⚠️ TENTO SOUBOR JE ZPĚTNÝ ZÁZNAM JIŽ APLIKOVANÉ PRODUKČNÍ MIGRACE.
--    Verze `20260903200843` (`partner_reward_expiry_from_issuance_moment`) je
--    na produkci `xkzhjldrojjlrkezorey` aplikovaná od 03. 09. 2026. SQL níže je
--    doslovný přepis `supabase_migrations.schema_migrations.statements` pro tuto
--    verzi (read-only export, 05. 09. 2026) — nic se jím znovu nenasazuje.
--
-- ŘEŠENÝ PROBLÉM:
--   Migrace `20260903200832` počítala expiraci z `partner_reward_codes.issued_at`.
--   To je ale čas VZNIKU ŘÁDKU — u Partner API čas objednávky, kdy je kód ještě
--   `pending` a zákazník ho nemůže uplatnit. U objednávky zaplacené se zpožděním
--   by tak zákazníkovi ubyla část 90denní lhůty ještě dřív, než odměnu vůbec
--   dostal.
--
-- ŘEŠENÍ:
--   Nový sloupec `issued_to_customer_at` zaznamená okamžik PRVNÍHO přechodu do
--   stavu `issued`. Od něj se počítá `expired_at`. Trigger je přepsaný na
--   `expiry_source='auto_v2'` s `expiry_from='issued_to_customer_at'`, takže je
--   z metadat vždy poznat, kterou logikou byl řádek nastaven.
--
-- ⚠️ ŽIVÝ PRODUKČNÍ STAV: `auto_v2` z tohoto souboru. Verze `auto_v1`
--    z migrace `20260903200832` je jen historický mezikrok — nevracet ji.
--
-- HISTORICKÁ DATA: žádný backfill; sloupec je nullable a starým řádkům zůstává
--   NULL. K 05. 09. 2026 má produkce 0 řádků s vyplněným `issued_to_customer_at`
--   i 0 řádků s `expired_at` — logika zatím reálně nic neoznačila.
--
-- ROLLBACK: viz docs/rollback/phase1_partner_reward_expiry_rollback.sql
-- ============================================================================

ALTER TABLE public.partner_reward_codes
  ADD COLUMN IF NOT EXISTS issued_to_customer_at timestamptz;

COMMENT ON COLUMN public.partner_reward_codes.issued_to_customer_at IS
  'Okamžik prvního přechodu kódu do stavu issued = skutečné vydání odměny zákazníkovi. Od tohoto času běží 90denní platnost (expired_at). Nezaměňovat s issued_at, což je čas vzniku řádku (u Partner API čas objednávky).';

CREATE OR REPLACE FUNCTION public.set_partner_reward_expiry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.status = 'issued'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'issued')
     AND NEW.expired_at IS NULL
  THEN
    NEW.issued_to_customer_at := COALESCE(NEW.issued_to_customer_at, now());

    NEW.expired_at := NEW.issued_to_customer_at
                      + make_interval(days => public.partner_reward_validity_days());

    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'expiry_source', 'auto_v2',
                         'expiry_days', public.partner_reward_validity_days(),
                         'expiry_from', 'issued_to_customer_at'
                       );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_partner_reward_expiry ON public.partner_reward_codes;
CREATE TRIGGER trg_set_partner_reward_expiry
BEFORE INSERT OR UPDATE OF status ON public.partner_reward_codes
FOR EACH ROW
EXECUTE FUNCTION public.set_partner_reward_expiry();
