-- Výherce musí vidět název soutěže, ve které vyhrál, i po jejím uzavření.
--
-- Problém: `contests` má public SELECT policy jen pro
-- status IN ('active','pending','paused'). Jakmile se soutěž uzavře
-- (status='closed'), zákazník už řádek nepřečte a stránka Výhry zobrazí
-- místo názvu soutěže obecné "Soutěž" — včetně výherce hlavní ceny.
--
-- Minimální bezpečný zásah: samostatná SELECT policy, která pustí přihlášeného
-- uživatele k řádku soutěže POUZE tehdy, když v ní má vlastní winner záznam.
-- Žádný broad public access na status='closed' nevzniká: kdo v soutěži
-- nevyhrál, uzavřenou soutěž přes tuto výjimku neuvidí.
--
-- Záměrně bez podmínky na status: pravidlo je "vidím soutěž, ve které mám
-- vlastní výhru". Kdyby byla vázaná jen na 'closed', stejný výpadek by se
-- vrátil, jakmile se soutěž přesune do archivu (status='draft').
--
-- Bez rizika rekurze: `winners` má policy `winners_select_own`
-- (user_id = auth.uid()), která nereferencuje `contests`.
--
-- Nedotčeno: public policy pro active/pending/paused, admin/superadmin policy
-- `contests_admin_select_all`, veškeré INSERT/UPDATE/DELETE policy.

DROP POLICY IF EXISTS contests_winner_select_own ON public.contests;

CREATE POLICY contests_winner_select_own
  ON public.contests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.winners w
      WHERE w.contest_id = contests.id
        AND w.user_id = auth.uid()
    )
  );
