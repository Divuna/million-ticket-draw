-- ============================================================================
-- FÁZE 1 — 90denní platnost neaktivované partnerské odměny
--
-- ⚠️ TENTO SOUBOR JE ZPĚTNÝ ZÁZNAM JIŽ APLIKOVANÉ PRODUKČNÍ MIGRACE.
--    Verze `20260903200832` (`partner_reward_90day_expiry`) je na produkci
--    `xkzhjldrojjlrkezorey` aplikovaná od 03. 09. 2026. SQL níže je doslovný
--    přepis `supabase_migrations.schema_migrations.statements` pro tuto verzi
--    (read-only export, 05. 09. 2026) — nic se jím znovu nenasazuje.
--
-- Schválené business pravidlo (Pavel, 03. 09. 2026):
--   Každá NOVÁ MioCoin odměna vydaná partnerem/e-shopem za nákup má před
--   aktivací platnost 90 dní. Po jejím uplynutí ji zákazník nemůže aktivovat,
--   partner za ni nic neplatí a stav zůstává auditovatelný.
--
--   NEEXPIRUJÍ MioCoiny, které si zákazník už aktivoval do peněženky.
--   Expiruje výhradně neaktivovaný partnerský reward kód z nákupu.
--   Pravidlo je GLOBÁLNÍ — partner si ho nemůže nastavit ani změnit
--   (settings má superadmin-only RLS policy "Only admins can modify settings").
--
-- CO SE VĚDOMĚ NEMĚNÍ:
--   * redeem_miocoin_code() — už dnes kontroluje `expired_at < now()` a vrací
--     {success:false, error:'expired'}. Netknuto.
--   * create_partner_order_reward / update_partner_order_reward_status —
--     netknuto; expiraci nastavuje trigger, aby byly pokryté i cesty mimo
--     Partner API (Shoptet import, admin, přímý insert).
--   * fakturace — expirovaný kód se nikdy neaktivuje → nevznikne
--     partner_coin_activations → partnerovi se automaticky nic neúčtuje.
--   * trg_log_partner_coin_activation_reward (AFTER UPDATE) — jiné časování
--     než tento BEFORE trigger, nekoliduje.
--
-- HISTORICKÁ DATA: žádný backfill. Kódy vydané před nasazením zůstávají
--   s expired_at IS NULL, tedy bez expirace (rozhodnutí Pavla).
--
-- NÁVAZNOSTI:
--   * `set_partner_reward_expiry` z tohoto souboru (`expiry_source='auto_v1'`,
--     počítáno z `issued_at`) je VZÁPĚTÍ nahrazena migrací
--     `20260903200843_partner_reward_expiry_from_issuance_moment.sql`
--     (`auto_v2`, počítáno z `issued_to_customer_at`). Živý produkční stav
--     je `auto_v2` — tento soubor je jen historický mezikrok.
--   * Denní cron `expire_partner_reward_codes_daily` NEVZNIKL zde, ale až
--     samostatnou migrací `20260903201001_partner_reward_expiry_cron.sql`.
--
-- ROLLBACK: viz docs/rollback/phase1_partner_reward_expiry_rollback.sql
-- ============================================================================

INSERT INTO public.settings (key, value)
VALUES ('partner_reward_validity_days', '90')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.partner_reward_validity_days()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    NULLIF(regexp_replace(
      (SELECT s.value FROM public.settings s WHERE s.key = 'partner_reward_validity_days'),
      '\D', '', 'g'), '')::integer,
    90);
$$;

REVOKE ALL ON FUNCTION public.partner_reward_validity_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_reward_validity_days() TO authenticated, service_role;

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
    NEW.expired_at := NEW.issued_at
                      + make_interval(days => public.partner_reward_validity_days());

    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'expiry_source', 'auto_v1',
                         'expiry_days', public.partner_reward_validity_days()
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

CREATE OR REPLACE FUNCTION public.expire_partner_reward_codes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.partner_reward_codes
     SET status   = 'expired',
         metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object(
                         'expired_by', 'cron',
                         'expired_run_at', now()
                       )
   WHERE status = 'issued'
     AND expired_at IS NOT NULL
     AND expired_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_partner_reward_codes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_partner_reward_codes() TO service_role;
