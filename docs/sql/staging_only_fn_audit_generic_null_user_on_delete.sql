-- ============================================================================
-- STAGING ONLY (dxmowysntemfqfnanxua) — aplikováno 16. 10. 2026
-- NEAPLIKOVAT NA PRODUKCI (xkzhjldrojjlrkezorey) bez výslovného schválení Pavla.
-- Soubor je záměrně mimo supabase/migrations, aby se omylem nespustil na produkci.
-- ============================================================================
--
-- Proč:
--   fn_audit_generic (trigger audit_payments_trigger / audit_tickets_trigger /
--   audit_vouchers_trigger) při DELETE zapisuje do audit_logs.user_id ID uživatele,
--   jehož řádek se právě maže. Při smazání účtu (kaskáda auth.users → users →
--   payments/tickets) proto zápis auditu narazí na audit_logs_user_id_fkey a celé
--   smazání účtu spadne. Na stagingu se tak nedají uklízet staré testovací účty.
--
-- Co mění:
--   Jen větev DELETE: pokud uživatel v public.users už neexistuje, zapíše se
--   user_id = NULL a původní ID zůstane v metadata (old.user_id + audited_user_id).
--   INSERT/UPDATE beze změny. Auditní stopa se neztrácí.
--
-- Proč ne na produkci (zatím):
--   Produkce má po resetu 12. 10. 2026 jen 2 účty, nic se tam nemaže a změna
--   auditní funkce je produkční změna vyžadující schválení. Před ostrým spuštěním
--   (mazání účtů zákazníků / GDPR) je to OPEN ISSUE — viz onemil_state.md.
--   Pozn.: produkční definice má jiné formátování (md5 2b726711…) než staging
--   (md5 46a0d3cb…), logika je stejná.
--
-- Rollback (staging): vrátit původní definici níže v sekci ROLLBACK.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_audit_generic()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  audit_user_id uuid;
  original_user_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    original_user_id := (to_jsonb(OLD) ->> 'user_id')::uuid;
    -- Při kaskádním mazání účtu už řádek uživatele neexistuje → NULL (FK by selhal).
    IF original_user_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.users u WHERE u.id = original_user_id) THEN
      audit_user_id := original_user_id;
    ELSE
      audit_user_id := NULL;
    END IF;
  ELSE
    audit_user_id := (to_jsonb(NEW) ->> 'user_id')::uuid;
  END IF;

  INSERT INTO audit_logs(event, event_type, user_id, metadata, created_at)
  VALUES (TG_OP, TG_OP, audit_user_id,
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
      'audited_user_id', CASE WHEN TG_OP = 'DELETE' THEN original_user_id ELSE NULL END
    ), now());

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$function$;

-- ============================================================================
-- ROLLBACK (původní staging definice, md5 46a0d3cb04eb4435feb20879d03a1baa)
-- ============================================================================
-- CREATE OR REPLACE FUNCTION public.fn_audit_generic()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- DECLARE
--   audit_user_id uuid;
-- BEGIN
--   IF TG_OP = 'DELETE' THEN audit_user_id := (to_jsonb(OLD) ->> 'user_id')::uuid;
--   ELSE audit_user_id := (to_jsonb(NEW) ->> 'user_id')::uuid; END IF;
--   INSERT INTO audit_logs(event, event_type, user_id, metadata, created_at)
--   VALUES (TG_OP, TG_OP, audit_user_id,
--     jsonb_build_object('table', TG_TABLE_NAME, 'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END, 'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END), now());
--   IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
-- END;
-- $function$;
