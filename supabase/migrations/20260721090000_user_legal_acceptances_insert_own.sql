-- ====================================================================
-- user_legal_acceptances — doplnění chybějících own-row RLS policies
--
-- ZJIŠTĚNÝ STAV (ověřeno dotazem na pg_policy):
--   PRODUKCE xkzhjldrojjlrkezorey — policies EXISTUJÍ (pod jinými názvy,
--     než uvádí migrace 20251228122342):
--       "user can insert own legal acceptance"  INSERT  WITH CHECK (auth.uid() = user_id)
--       "user can read own legal acceptance"    SELECT
--       žádná UPDATE ani DELETE policy
--   STAGING dxmowysntemfqfnanxua — RLS je zapnuté, ale tabulka má
--     NULA policies → deny-all. Klientský INSERT proto selže chybou
--       42501 "new row violates row-level security policy"
--     a to i pro VLASTNÍ řádek; vlastní souhlasy navíc nelze ani číst.
--
--   Jde tedy o DRIFT na stagingu, nikoli o chybu produkce.
--   Dopad na stagingu: tiše selhávají klientské zápisy souhlasů
--   (VOP / GDPR / terms v useAuth.signUp) i nové potvrzení věku 18+
--   (document_slug = 'adult-confirmation'). Výchozí 'marketing' řádek
--   vzniká i tak, protože ho vkládá SECURITY DEFINER trigger.
--
-- CO DĚLÁ:
--   Idempotentně doplní own-row INSERT a own-row SELECT policy — ale
--   POUZE pokud pro daný příkaz na tabulce žádná policy neexistuje.
--   Na produkci je proto no-op (policies tam už jsou) a nevzniká
--   duplicitní permissive policy.
--
-- CO ZÁMĚRNĚ NEDĚLÁ:
--   - NEPŘIDÁVÁ UPDATE ani DELETE policy → souhlas zůstává auditní
--     záznam, který nelze přepsat ani smazat (ani vlastní, ani cizí).
--   - Nepřidává admin read-all (produkce ho také nemá) — nemění
--     stávající produkční chování.
--   - Nemění žádnou jinou tabulku, funkci ani data.
--
-- BEZPEČNOST:
--   WITH CHECK / USING (auth.uid() = user_id) → přístup je vždy svázaný
--   s konkrétním přihlášeným uživatelem; nikdo nemůže vytvořit ani číst
--   souhlas jiného uživatele.
--
-- STAV: aplikováno POUZE na staging dxmowysntemfqfnanxua.
--   Produkce xkzhjldrojjlrkezorey NEDOTČENA (a je i bez toho v pořádku).
--
-- ROLLBACK (staging):
--   DROP POLICY IF EXISTS user_legal_acceptances_insert_own ON public.user_legal_acceptances;
--   DROP POLICY IF EXISTS user_legal_acceptances_select_own ON public.user_legal_acceptances;
-- ====================================================================

DO $$
BEGIN
  -- INSERT: jen pokud na tabulce žádná INSERT policy není
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.user_legal_acceptances'::regclass
      AND polcmd = 'a'
  ) THEN
    CREATE POLICY user_legal_acceptances_insert_own
      ON public.user_legal_acceptances
      FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- SELECT: jen pokud na tabulce žádná SELECT policy není
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.user_legal_acceptances'::regclass
      AND polcmd = 'r'
  ) THEN
    CREATE POLICY user_legal_acceptances_select_own
      ON public.user_legal_acceptances
      FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END
$$;
