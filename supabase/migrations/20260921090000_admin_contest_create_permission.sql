-- Rozšíření Phase 2 admin_permissions o klíč `contests.create`
-- ---------------------------------------------------------------------------
-- CÍL: superadmin může konkrétnímu adminovi (role='admin') jednotlivě udělit
-- nebo odebrat oprávnění vytvářet a připravovat soutěže (draft/pending) PŘED
-- spuštěním. Admin s tímto oprávněním nikdy nesmí:
--   - publikovat soutěž (přechod na status='active'),
--   - pozastavit/znovuaktivovat/uzavřít soutěž,
--   - upravit soutěž, která už opustila draft/pending (active/paused/closed),
--   - spravovat bonusové výhry / MioCoin bonusy (bonus_prizes zůstává
--     výhradně superadmin — viz 20260908110000_bonus_prizes_canonical_superadmin_rls.sql,
--     tato migrace se toho vědomě nedotýká).
-- Bez tohoto oprávnění nesmí plain admin založit ani upravit ŽÁDNOU soutěž.
--
-- POTVRZENÝ STAV PŘED TOUTO MIGRACÍ (read-only audit repozitáře, 21. 09. 2026)
--
-- 1) `admin_manage_contest` (RPC, SECURITY DEFINER) guardovala pouze na
--    `has_role(admin) OR has_role(superadmin)` — JAKÝKOLI plain admin už mohl
--    zavolat tuto RPC a nastavit libovolný status (včetně 'active') u
--    libovolné soutěže. Frontend byl jediná bariéra (superadmin-only routy).
--
-- 2) `public.contests` mělo navíc legacy policy "Allow admin full access to
--    contests" (FOR ALL, `public.users.role IN ('admin','superadmin')` —
--    STARÝ sloupec, ne kanonická `user_roles`). Tato policy dávala JAKÉMUKOLI
--    adminovi neomezený přímý INSERT/UPDATE/DELETE nad `contests` přes
--    PostgREST, zcela mimo `admin_manage_contest` a mimo jeho guardy. Navíc
--    ji používá i Edge Function `create-contest` (user-scoped klient →
--    skutečný zápis jde přes RLS, ne přes service-role bypass), takže ji
--    NELZE jen smazat bez náhrady — musí se nahradit precizními policy.
--
-- 3) `contests_admin_update` (FOR UPDATE, `has_role(admin) OR
--    has_role(superadmin)`) měla stejnou vlastnost — žádné omezení na status
--    ani na aktuální stav řádku. Přímý klientský `.update()` na `contests`
--    (AdminContestManagement.tsx — ukládání rules/rules_pdf_url/obrázků)
--    touto policy prochází i dnes; nová verze ji zpřísňuje, ne odstraňuje.
--
-- ŘEŠENÍ (v tomto pořadí, aby žádné okno nezůstalo šířeji otevřené než dřív)
--
-- A) `admin_manage_contest`: nový permission-aware guard.
--    - superadmin: BEZE ZMĚNY, plně neomezený (create/update, libovolný
--      status, libovolná existující soutěž) — přesně jako dnes.
--    - plain admin BEZ `contests.create`: guard ho odmítne úplně stejně,
--      jako by nebyl admin (`forbidden`, 42501) — dřívější default
--      "jakýkoli admin projde" mizí.
--    - plain admin S `contests.create`:
--        * `p_status` smí být jen NULL / 'draft' / 'pending' — nikdy 'active',
--          'paused' ani 'closed' (publikace/pozastavení/uzavření zůstává
--          superadmin-only).
--        * při `p_operation='update'` smí sáhnout jen na řádek, jehož
--          AKTUÁLNÍ status je 'draft' nebo 'pending' — jakmile soutěž
--          opustí přípravnou fázi, tento admin ji už nikdy nenačte k zápisu
--          (ani touto RPC, viz níže i přes RLS).
--    Zbytek těla (zámek ticket_count, closed-je-finální, audit_actions,
--    notify_sofinity_event, návratový tvar) je BYTE-IDENTICKÝ s
--    20260903160000_admin_manage_contest_hardening.sql — mění se jen guard.
--
-- B) `public.contests` RLS — nahrazuje legacy ALL policy třemi precizními
--    policy (INSERT / UPDATE / DELETE), symetrickými s guardem výše:
--    - superadmin: neomezeno (USING/WITH CHECK vždy true pro něj).
--    - plain admin s `contests.create`: jen když (existující i nový) status
--      je 'draft'/'pending'.
--    - plain admin bez `contests.create`: 0 policy match → RLS default deny.
--    Řádek, který dřív obcházel `admin_manage_contest` (přímý PostgREST
--    UPDATE/DELETE i `create-contest` EF INSERT), je tím poprvé skutečně
--    vynucen na DB vrstvě, ne jen ve frontendové routě — přesně požadavek
--    "nelze obejít přímým požadavkem".
--    SELECT policy (`contests_admin_select_all`, `contests_winner_select_own`,
--    veřejná active/pending/paused) se NEMĚNÍ.
--
-- ROZSAH: tato migrace se NEDOTÝKÁ `bonus_prizes`, `winners`, `wallets`,
-- `payments`, `tickets`, `buy_ticket_atomic`, `close-contest` Edge Function
-- ani `admin_permissions`/`has_admin_permission()` (Phase 2 základ z
-- 20260623_admin_permissions.sql, beze změny). Nemaže a nepřejmenovává žádná
-- data.
--
-- ROLLBACK:
--   -- 1) vrátit admin_manage_contest na definici z
--   --    20260903160000_admin_manage_contest_hardening.sql
--   -- 2) DROP POLICY "contests_admin_insert" ON public.contests;
--   --    DROP POLICY "contests_admin_delete" ON public.contests;
--   --    DROP POLICY IF EXISTS "contests_admin_update" ON public.contests;
--   --    CREATE POLICY "contests_admin_update" ON public.contests FOR UPDATE
--   --      TO authenticated
--   --      USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superadmin'::app_role))
--   --      WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superadmin'::app_role));
--   --    CREATE POLICY "Allow admin full access to contests" ON public.contests
--   --      FOR ALL USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role IN ('admin','superadmin')));

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- A) admin_manage_contest — permission-aware guard, jinak beze změny
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_admin_id       uuid := auth.uid();
  v_is_superadmin  boolean;
  v_is_admin       boolean;
  v_can_prepare    boolean;
  v_contest_id     uuid;
  v_old_record     contests%rowtype;
  v_new_record     contests%rowtype;
  v_bonus_summary  text;
  v_payload        jsonb;
  v_issued         integer;
BEGIN
  v_is_superadmin := public.has_role(v_admin_id, 'superadmin'::public.app_role);
  v_is_admin       := public.has_role(v_admin_id, 'admin'::public.app_role);
  v_can_prepare    := public.has_admin_permission('contests.create', v_admin_id);

  -- Admin guard nad kanonickou public.user_roles přes public.has_role().
  -- NIKDY legacy public.users.role — produkce má doložený drift.
  -- Superadmin zůstává plně neomezený. Plain admin smí projít jen s
  -- výslovně uděleným Phase 2 oprávněním `contests.create` — role 'admin'
  -- sama o sobě už NESTAČÍ (dřívější chování, které tato migrace opravuje).
  IF NOT (v_is_superadmin OR (v_is_admin AND v_can_prepare)) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat soutěže' USING ERRCODE = '42501';
  END IF;

  IF p_operation NOT IN ('create', 'update') THEN
    RAISE EXCEPTION 'Neplatná operace: %', COALESCE(p_operation, '(null)');
  END IF;

  -- Nesuperadmin s `contests.create` smí jen vytvářet a připravovat
  -- (draft/pending) — publikace, pozastavení a uzavření zůstávají
  -- výhradně superadmin. Vynecháný p_status (NULL) je v UPDATE "neměnit",
  -- takže tady nic neomezuje — kontroluje se jen výslovně požadovaná změna.
  IF NOT v_is_superadmin THEN
    IF p_status IS NOT NULL AND p_status NOT IN ('draft', 'pending') THEN
      RAISE EXCEPTION 'Toto oprávnění dovoluje jen vytvořit nebo připravit soutěž (Archiv test / Čeká na start). Spuštění, pozastavení a uzavření provádí superadmin.'
        USING ERRCODE = '42501';
    END IF;
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

    -- Nesuperadmin s `contests.create` smí upravovat jen soutěž, která je
    -- ještě v přípravné fázi. Jakmile opustí draft/pending (active/paused/
    -- closed), je pro tohoto admina nedotknutelná — i kdyby požadovaná
    -- změna sama o sobě byla "neškodná" (např. jen popis).
    IF NOT v_is_superadmin AND v_old_record.status NOT IN ('draft', 'pending') THEN
      RAISE EXCEPTION 'Bez oprávnění superadmina lze upravovat jen soutěže ve stavu Archiv test nebo Čeká na start.'
        USING ERRCODE = '42501';
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

REVOKE ALL ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_contest(uuid, text, text, text, text, text, integer, numeric, text, boolean) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) public.contests RLS — legacy plošná ALL policy nahrazena precizními
--    INSERT/UPDATE/DELETE policy symetrickými s guardem výše.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow admin full access to contests" ON public.contests;

DROP POLICY IF EXISTS "contests_admin_update" ON public.contests;
CREATE POLICY "contests_admin_update"
ON public.contests
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'superadmin'::app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.has_admin_permission('contests.create')
    AND status IN ('draft', 'pending')
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'superadmin'::app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.has_admin_permission('contests.create')
    AND status IN ('draft', 'pending')
  )
);

DROP POLICY IF EXISTS "contests_admin_insert" ON public.contests;
CREATE POLICY "contests_admin_insert"
ON public.contests
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'superadmin'::app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.has_admin_permission('contests.create')
    AND status IN ('draft', 'pending')
  )
);

DROP POLICY IF EXISTS "contests_admin_delete" ON public.contests;
CREATE POLICY "contests_admin_delete"
ON public.contests
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'superadmin'::app_role)
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND public.has_admin_permission('contests.create')
    AND status IN ('draft', 'pending')
  )
);

COMMIT;
