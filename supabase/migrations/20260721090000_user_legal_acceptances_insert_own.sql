-- ====================================================================
-- user_legal_acceptances — INSERT policy pro vlastní souhlasy
--
-- PROČ:
--   Klientský zápis do public.user_legal_acceptances je na živé databázi
--   odmítán s chybou:
--     42501 "new row violates row-level security policy for
--            table user_legal_acceptances"
--   a to i když uživatel zapisuje VLASTNÍ řádek (user_id = auth.uid()).
--   Migrace 20251228122342 sice policy "Users can insert own acceptances"
--   deklaruje, ale v živém schématu chybí (drift mezi gitem a DB).
--
--   Důsledek (pre-existing chyba, kterou to odhalilo): veškeré klientské
--   zápisy souhlasů selhávají tiše — tj. i VOP / GDPR / terms zapisované
--   v useAuth.signUp. Funguje jen výchozí 'marketing' řádek, protože ten
--   vkládá SECURITY DEFINER trigger insert_default_marketing_consent.
--
--   Nově je na tomto zápisu závislé i potvrzení věku 18+
--   (document_slug = 'adult-confirmation').
--
-- CO DĚLÁ:
--   Přidává JEDINOU chybějící INSERT policy — uživatel smí vložit pouze
--   souhlas sám za sebe. Nic jiného se nemění.
--
-- CO ZÁMĚRNĚ NEDĚLÁ:
--   - NEPŘIDÁVÁ žádnou UPDATE ani DELETE policy → souhlasy zůstávají
--     nepřepsatelné a nesmazatelné (ani vlastní, ani cizí). To je záměr:
--     souhlas je auditní záznam.
--   - Nemění SELECT policy (vlastní řádky + admin read-all).
--   - Nemění žádnou jinou tabulku, funkci ani data.
--
-- BEZPEČNOST:
--   WITH CHECK (auth.uid() = user_id) → zápis je vždy svázaný s konkrétním
--   přihlášeným uživatelem; nikdo nemůže vytvořit souhlas za někoho jiného.
--
-- STAV: ⛔ NEAPLIKOVÁNO. Připraveno v Draft PR.
--   Aplikovat nejdřív na staging (dxmowysntemfqfnanxua) a teprve po ověření
--   a výslovném schválení Pavla na produkci (xkzhjldrojjlrkezorey).
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS user_legal_acceptances_insert_own
--     ON public.user_legal_acceptances;
-- ====================================================================

DROP POLICY IF EXISTS user_legal_acceptances_insert_own
  ON public.user_legal_acceptances;

CREATE POLICY user_legal_acceptances_insert_own
  ON public.user_legal_acceptances
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
