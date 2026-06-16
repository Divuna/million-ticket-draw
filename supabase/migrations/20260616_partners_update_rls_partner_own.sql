-- P04 fix — partners UPDATE RLS
--
-- Příčina: tabulka public.partners měla jedinou policy "Public read partners" (SELECT)
-- a ŽÁDNOU UPDATE policy. Schválený partner proto nemohl uložit konverzní nastavení
-- MioCoinů (reward_base_czk / reward_mc) — UPDATE vlastního řádku vrátil 0 řádků + null
-- error, a frontend zobrazil falešný success.
--
-- Tato migrace přidává:
--   1) partner-own UPDATE policy: partner smí aktualizovat POUZE vlastní řádek
--      (auth_user_id = auth.uid()); WITH CHECK brání přepsání auth_user_id na cizí.
--   2) admin/superadmin full-manage UPDATE policy (is_admin()) — admin správa zachována.
--
-- RLS na partners je již zapnuté. "Public read partners" (SELECT) zůstává nedotčen.
-- Aplikováno POUZE na staging dxmowysntemfqfnanxua. Produkce vyžaduje samostatné schválení.

DROP POLICY IF EXISTS "partners_update_own" ON public.partners;
CREATE POLICY "partners_update_own"
  ON public.partners
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "partners_update_admin" ON public.partners;
CREATE POLICY "partners_update_admin"
  ON public.partners
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
