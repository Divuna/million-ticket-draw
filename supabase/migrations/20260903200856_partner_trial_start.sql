-- ============================================================================
-- FÁZE 2 — 30denní zahajovací akce partnera (Partner Trial)
--
-- ⚠️ TENTO SOUBOR JE ZPĚTNÝ ZÁZNAM JIŽ APLIKOVANÉ PRODUKČNÍ MIGRACE.
--    Verze `20260903200856` (`partner_trial_start`) je na produkci
--    `xkzhjldrojjlrkezorey` aplikovaná od 03. 09. 2026. SQL níže je doslovný
--    přepis `supabase_migrations.schema_migrations.statements` pro tuto verzi
--    (read-only export, 05. 09. 2026) — nic se jím znovu nenasazuje.
--
-- Pravidlo (Pavel, 03. 09. 2026):
--   Zahajovací akce partnera začíná okamžikem PRVNÍHO skutečného vydání
--   MioCoin odměny zákazníkovi (přechod reward kódu do stavu `issued`),
--   ne registrací ani schválením partnera. Trvá 30 dní.
--
-- ZÁVAZNÉ INVARIANTY:
--   * `trial_started_at` / `trial_ends_at` nastavuje VÝHRADNĚ trigger
--     `trg_start_partner_trial`. Partner ani běžný uživatel je nesmí měnit —
--     hlídá `trg_protect_partner_trial` (`42501`).
--   * Trigger si povolení uděluje transakčně lokálním `set_config
--     ('onemil.trial_internal','on',true)`; jiná cesta k zápisu neexistuje.
--   * Jednou nastartovaný trial nelze POSUNOUT ani adminem — přepsání
--     nenulového `trial_started_at` na jinou nenulovou hodnotu skončí `42501`.
--     Admin smí pouze doplnit chybějící hodnotu.
--   * Souběh je ošetřen `pg_advisory_xact_lock` na `partner_trial:<partner_id>`
--     plus podmínkou `WHERE trial_started_at IS NULL` — trial startuje právě
--     jednou i při paralelním vydání více odměn.
--
-- STAV K 05. 09. 2026: produkce má 0 partnerů s vyplněným `trial_started_at`
--   — logika je nasazená, ale zatím ji nic nespustilo.
--
-- ROLLBACK: viz docs/rollback/phase2_partner_trial_rollback.sql
-- ============================================================================

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at    timestamptz;

COMMENT ON COLUMN public.partners.trial_started_at IS
  'Okamžik prvního skutečného vydání MioCoin odměny zákazníkovi. Spouští 30denní zahajovací akci. Nastavuje výhradně trigger trg_start_partner_trial; partner ani běžný uživatel nesmí měnit (trg_protect_partner_trial).';
COMMENT ON COLUMN public.partners.trial_ends_at IS
  'trial_started_at + 30 dní. Nastavuje se spolu se startem, nikdy samostatně.';

CREATE OR REPLACE FUNCTION public.protect_partner_trial_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_internal boolean := coalesce(current_setting('onemil.trial_internal', true), '') = 'on';
  v_admin    boolean := coalesce(public.is_admin(), false)
                        OR coalesce(public.is_superadmin(), false);
BEGIN
  IF NEW.trial_started_at IS NOT DISTINCT FROM OLD.trial_started_at
     AND NEW.trial_ends_at IS NOT DISTINCT FROM OLD.trial_ends_at THEN
    RETURN NEW;
  END IF;

  IF v_internal THEN
    RETURN NEW;
  END IF;

  IF NOT v_admin THEN
    RAISE EXCEPTION
      'partner trial columns are not user-modifiable (partner_id=%)', OLD.id
      USING ERRCODE = '42501';
  END IF;

  IF OLD.trial_started_at IS NOT NULL
     AND NEW.trial_started_at IS NOT NULL
     AND NEW.trial_started_at IS DISTINCT FROM OLD.trial_started_at THEN
    RAISE EXCEPTION
      'partner trial already started and cannot be shifted (partner_id=%)', OLD.id
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_partner_trial ON public.partners;
CREATE TRIGGER trg_protect_partner_trial
BEFORE UPDATE OF trial_started_at, trial_ends_at ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.protect_partner_trial_columns();

CREATE OR REPLACE FUNCTION public.start_partner_trial_on_first_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF NEW.status = 'issued'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'issued')
  THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('partner_trial:' || NEW.partner_id::text, 0));

    PERFORM set_config('onemil.trial_internal', 'on', true);

    UPDATE public.partners
       SET trial_started_at = v_now,
           trial_ends_at    = v_now + interval '30 days'
     WHERE id = NEW.partner_id
       AND trial_started_at IS NULL;

    PERFORM set_config('onemil.trial_internal', 'off', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_start_partner_trial ON public.partner_reward_codes;
CREATE TRIGGER trg_start_partner_trial
AFTER INSERT OR UPDATE OF status ON public.partner_reward_codes
FOR EACH ROW
EXECUTE FUNCTION public.start_partner_trial_on_first_issue();
