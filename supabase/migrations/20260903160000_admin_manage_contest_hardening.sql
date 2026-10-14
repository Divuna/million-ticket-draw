-- Zpevnění admin_manage_contest + zámek velikosti soutěže po prvním prodaném tiketu
-- ---------------------------------------------------------------------------
-- Kontext: kontrola `admin_manage_contest` proti origin/main. Efektivní definice
-- funkce pochází z 20260408110249_2454ac46-eb87-405c-aebc-5333f479f6f0.sql.
--
-- POTVRZENÉ PROBLÉMY
--
-- 1) LEGACY ROLE. Guard četl `public.users.role`, ne kanonickou `public.user_roles`.
--    Produkce má doložený drift (účet s user_roles.role='admin' a users.role='user'),
--    takže legitimní admin mohl být odmítnut a naopak zastaralý `users.role`
--    mohl pustit dál někoho, kdo už admin není.
--
-- 2) NEBEZPEČNÉ NON-NULL DEFAULTY — hlavní příčina. Parametry měly defaulty
--    `p_ticket_count = 1000000`, `p_ticket_price = 1`, `p_status = 'draft'`.
--    PostgREST posílá jen klíče přítomné v těle requestu; vynechaný parametr
--    proto nabral DEFAULT, ne NULL, a `COALESCE(p_x, x)` ho zapsal jako
--    skutečnou změnu. Volání, které chtělo změnit jen poznámku nebo jen status,
--    tak soutěži přepsalo velikost na 1 000 000, cenu na 1 a (u volání bez
--    p_status) status na 'draft'. Postižené živé cesty:
--      - ContestDetailAdmin.saveNotes        (bez p_status/p_ticket_count/p_ticket_price)
--      - ContestDetailAdmin.handleStatusChange   (bez p_ticket_count/p_ticket_price)
--      - AdminContestManagement.handleStatusChange (bez p_ticket_count/p_ticket_price)
--    Cesta „hromadně do konceptu“ už defenzivně posílala explicitní NULL — tedy
--    problém byl v projektu částečně známý, ale neopravený u zdroje.
--
-- 3) VELIKOST SOUTĚŽE = POZICE HLAVNÍ VÝHRY. `buy_ticket_atomic` uděluje hlavní
--    výhru testem rovnosti `v_next_ticket = v_ticket_count` a tímtéž krokem
--    soutěž uzavírá. `contests.ticket_count` tedy JE pozice hlavní výhry
--    (samostatný sloupec `main_prize_position` v projektu neexistuje).
--    Změna `ticket_count` u soutěže s prodanými tikety proto znamená:
--      - snížení pod počet vydaných tiketů → `v_next_ticket > v_ticket_count`,
--        každý další nákup vrací 'Contest full', rovnosti už nelze dosáhnout,
--        takže hlavní výhra NIKDY nevznikne a soutěž se nikdy sama neuzavře;
--      - snížení přesně na aktuální `next_ticket_number` → hlavní výhru okamžitě
--        dostane nejbližší kupující (načasované zmanipulování výhry);
--      - zvýšení → tiše se mění šance všem, kdo už tiket koupili.
--    Již vydané tikety se nikdy nepřečíslují ani nemažou.
--
-- 4) `closed` NENÍ KONEČNÝ. `status = COALESCE(p_status, status)` bez kontroly,
--    takže uzavřenou soutěž šlo přes tuto RPC vrátit na 'active' a obejít tím
--    zámek doplněný do pause_contest/resume_contest migrací 20260902120000.
--
-- 5) GRANTY. Funkce nikdy nedostala explicitní GRANT/REVOKE, držela si tedy
--    výchozí `EXECUTE TO PUBLIC`. Anonym se do těla dostal (guard ho odmítl),
--    ale je to zbytečně široké právo u SECURITY DEFINER funkce.
--
-- 6) OBCHÁZKA MIMO RPC. Politika `contests_admin_update` dovoluje adminovi
--    přímý `UPDATE public.contests` přes PostgREST. Oprava jen uvnitř RPC by
--    tedy velikost soutěže neuzamkla. Proto je invariant vynucen i triggerem,
--    který platí pro každou cestu zápisu.
--
-- ROZSAH: dvě funkce + jeden trigger + granty. Migrace NEMĚNÍ žádná data,
-- žádné RLS politiky, žádné constrainty a nedotýká se buy_ticket_atomic,
-- close_contest, winners, bonus_prizes, wallets ani payments.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_contests_guard_ticket_count ON public.contests;
--   DROP FUNCTION IF EXISTS public.contests_guard_ticket_count();
--   a obnovit admin_manage_contest z
--   20260408110249_2454ac46-eb87-405c-aebc-5333f479f6f0.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Invariant vynucený na tabulce: velikost soutěže je po prvním tiketu pevná
-- ─────────────────────────────────────────────────────────────────────────────
-- Platí pro KAŽDOU cestu zápisu — RPC, přímý UPDATE z PostgREST i ruční SQL —
-- takže ho nelze obejít politikou `contests_admin_update`.
CREATE OR REPLACE FUNCTION public.contests_guard_ticket_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_issued integer;
BEGIN
  -- Beze změny hodnoty se nic neřeší (typicky přepis stejné hodnoty z formuláře).
  IF NEW.ticket_count IS NOT DISTINCT FROM OLD.ticket_count THEN
    RETURN NEW;
  END IF;

  v_issued := GREATEST(COALESCE(OLD.next_ticket_number, 1) - 1, 0);

  -- Čítač i skutečné řádky — čítač je levný, EXISTS je kryté unikátním
  -- indexem tickets_contest_id_number_key, takže ani u milionu tiketů nejde
  -- o plný sken.
  IF v_issued > 0
     OR EXISTS (SELECT 1 FROM public.tickets WHERE contest_id = OLD.id)
  THEN
    RAISE EXCEPTION
      'Počet tiketů nelze změnit: soutěž má již vydané tikety (%). Počet tiketů určuje pozici hlavní výhry.',
      v_issued
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contests_guard_ticket_count ON public.contests;

-- `UPDATE OF ticket_count` = trigger se vůbec nespustí u zápisů, které tento
-- sloupec neuvádějí. buy_ticket_atomic (next_ticket_number, status) i
-- close_contest tedy zůstávají nedotčené.
CREATE TRIGGER trg_contests_guard_ticket_count
  BEFORE UPDATE OF ticket_count ON public.contests
  FOR EACH ROW
  EXECUTE FUNCTION public.contests_guard_ticket_count();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) admin_manage_contest — kanonická role, bezpečné defaulty, zámky, audit
-- ─────────────────────────────────────────────────────────────────────────────
-- Signatura zůstává shodná (defaulty nejsou součástí identity funkce), takže
-- všichni stávající volající fungují dál. Mění se pouze hodnoty defaultů:
-- vynechaný parametr nově znamená „neměnit“, ne „přepsat konstantou“.
CREATE OR REPLACE FUNCTION public.admin_manage_contest(
  p_contest_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_main_prize text DEFAULT NULL,
  p_main_image text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_ticket_count integer DEFAULT NULL,
  p_ticket_price numeric DEFAULT NULL,
  p_operation text DEFAULT 'create',
  p_fast_game boolean DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id      uuid := auth.uid();
  v_contest_id    uuid;
  v_old_record    contests%rowtype;
  v_new_record    contests%rowtype;
  v_bonus_summary text;
  v_payload       jsonb;
  v_issued        integer;
BEGIN
  -- Admin guard nad kanonickou public.user_roles přes public.has_role().
  -- NIKDY legacy public.users.role — produkce má doložený drift.
  IF NOT (
    public.has_role(v_admin_id, 'admin'::public.app_role)
    OR public.has_role(v_admin_id, 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat soutěže';
  END IF;

  IF p_operation NOT IN ('create', 'update') THEN
    RAISE EXCEPTION 'Neplatná operace: %', COALESCE(p_operation, '(null)');
  END IF;

  IF p_operation = 'update' AND p_contest_id IS NOT NULL THEN
    -- Zámek řádku: velikost i status se vyhodnocují proti stavu, který po dobu
    -- transakce nikdo jiný nezmění.
    SELECT * INTO v_old_record
    FROM contests
    WHERE id = p_contest_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Soutěž nebyla nalezena';
    END IF;

    -- `closed` je konečný stav (CLAUDE.md, „Contest admin – uzamčená pravidla“).
    -- Bez této kontroly šlo přes tuto RPC obejít zámek z 20260902120000.
    IF v_old_record.status = 'closed'
       AND p_status IS NOT NULL
       AND p_status <> 'closed'
    THEN
      RAISE EXCEPTION 'Uzavřenou soutěž nelze vrátit do stavu %.', p_status;
    END IF;

    -- Velikost soutěže = pozice hlavní výhry. Jakmile existuje vydaný tiket,
    -- nelze ji změnit ani nahoru, ani dolů. Shodná hodnota projde, aby
    -- formulář, který ticket_count posílá vždy, mohl dál ukládat ostatní pole.
    IF p_ticket_count IS NOT NULL
       AND p_ticket_count IS DISTINCT FROM v_old_record.ticket_count
    THEN
      v_issued := GREATEST(COALESCE(v_old_record.next_ticket_number, 1) - 1, 0);

      IF v_issued > 0
         OR EXISTS (SELECT 1 FROM public.tickets WHERE contest_id = p_contest_id)
      THEN
        RAISE EXCEPTION
          'Počet tiketů nelze změnit: soutěž má již vydané tikety (%). Počet tiketů určuje pozici hlavní výhry.',
          v_issued
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    UPDATE contests
    SET
      title        = COALESCE(p_title, title),
      description  = COALESCE(p_description, description),
      main_prize   = COALESCE(p_main_prize, main_prize),
      main_image   = COALESCE(p_main_image, main_image),
      status       = COALESCE(p_status, status),
      ticket_count = COALESCE(p_ticket_count, ticket_count),
      ticket_price = COALESCE(p_ticket_price, ticket_price),
      fast_game    = COALESCE(p_fast_game, fast_game),
      updated_at   = now()
    WHERE id = p_contest_id
    RETURNING * INTO v_new_record;

    v_contest_id := p_contest_id;

  ELSE
    IF p_title IS NULL OR p_main_prize IS NULL THEN
      RAISE EXCEPTION 'Název soutěže a hlavní cena jsou povinné';
    END IF;

    -- Původní defaulty parametrů se pro CREATE zachovávají zde, aby se
    -- chování zakládání soutěže nezměnilo.
    INSERT INTO contests (
      title, description, main_prize, main_image,
      status, ticket_count, ticket_price, fast_game
    ) VALUES (
      p_title,
      p_description,
      p_main_prize,
      p_main_image,
      COALESCE(p_status, 'draft'),
      COALESCE(p_ticket_count, 1000000),
      COALESCE(p_ticket_price, 1),
      COALESCE(p_fast_game, false)
    ) RETURNING * INTO v_new_record;

    v_contest_id := v_new_record.id;
  END IF;

  SELECT STRING_AGG(
    CONCAT(bp.ticket_position, ':', bp.description,
           CASE WHEN bp.amount IS NOT NULL AND bp.amount > 0
                THEN CONCAT('(', bp.amount, ' MioCoins)')
                ELSE '(Fyzická výhra)' END),
    ', ' ORDER BY bp.ticket_position
  ) INTO v_bonus_summary
  FROM bonus_prizes bp
  WHERE bp.contest_id = v_contest_id;

  -- Audit zůstává beze změny tvaru (stejné action_type, target a metadata).
  INSERT INTO admin_actions (
    admin_id, action_type, target_table, target_id, notes, metadata
  ) VALUES (
    v_admin_id,
    CONCAT('contest_', p_operation),
    'contests',
    v_contest_id,
    CONCAT('Soutěž ', p_operation, ': ', v_new_record.title),
    jsonb_build_object(
      'old_data', CASE WHEN p_operation = 'update' THEN to_jsonb(v_old_record) ELSE NULL END,
      'new_data', to_jsonb(v_new_record),
      'bonus_summary', COALESCE(v_bonus_summary, 'Žádné bonusové výhry'),
      'operation', p_operation
    )
  );

  v_payload := jsonb_build_object(
    'event_name', CONCAT('contest_', p_operation),
    'contest_id', v_contest_id,
    'title', v_new_record.title,
    'main_prize', v_new_record.main_prize,
    'status', v_new_record.status,
    'ticket_count', v_new_record.ticket_count,
    'ticket_price', v_new_record.ticket_price,
    'bonus_summary', COALESCE(v_bonus_summary, 'Žádné bonusové výhry'),
    'admin_id', v_admin_id,
    'timestamp', now()
  );

  PERFORM notify_sofinity_event(
    CONCAT('contest_', p_operation),
    v_admin_id,
    v_contest_id,
    v_payload
  );

  RETURN json_build_object(
    'success', true,
    'message', CASE
      WHEN p_operation = 'create' THEN 'Soutěž byla úspěšně vytvořena'
      ELSE 'Soutěž byla úspěšně aktualizována'
    END,
    'contest_id', v_contest_id,
    'contest_data', row_to_json(v_new_record)
  );
END;
$$;

-- Původní tělo končilo blokem `EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION
-- 'Chyba při správě soutěže: %'`. Ten nic neodchytával navíc, jen zahodil
-- SQLSTATE a kontext a slepil všechny chyby do jedné obecné hlášky. Odstraněn,
-- aby se guardy výše dostaly k adminovi i do testů v původním znění.

REVOKE ALL ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.contests_guard_ticket_count() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contests_guard_ticket_count() FROM anon;
