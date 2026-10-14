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
-- POTVRZENÝ STAV PŘED TOUTO MIGRACÍ — ověřeno READ-ONLY přímo na produkci
-- (xkzhjldrojjlrkezorey) a stagingu (dxmowysntemfqfnanxua), 21. 09. 2026.
-- ⚠️ Toto nahrazuje dřívější verzi popisu založenou jen na grepu přes soubory
-- v `supabase/migrations/` — produkce má oproti repu drift (viz bod 2).
--
-- 1) `admin_manage_contest` (RPC, SECURITY DEFINER) guardovala pouze na
--    `has_role(admin) OR has_role(superadmin)` — JAKÝKOLI plain admin už mohl
--    zavolat tuto RPC a nastavit libovolný status (včetně 'active') u
--    libovolné soutěže. Živá definice na produkci ověřena a je byte-identická
--    s `20260903160000_admin_manage_contest_hardening.sql` — žádný novější
--    neaplikovaný zásah.
--
-- 2) `public.contests` RLS na produkci/stagingu má DNES přesně 5 policy a
--    legacy "Allow admin full access to contests" (FOR ALL,
--    `public.users.role`) mezi nimi NENÍ — byla odstraněna dřív mimo
--    zachycené migrační soubory (produkční drift, běžný jev v tomto
--    projektu). Skutečný živý stav:
--      - "Public can see only visible contests" (SELECT, anon+authenticated,
--        status IN active/pending/paused) — beze změny.
--      - contests_admin_select_all (SELECT, admin/superadmin) — beze změny.
--      - contests_winner_select_own (SELECT, vlastní výherní řádek) — beze změny.
--      - contests_admin_update (UPDATE, `has_role(admin) OR has_role(superadmin)`,
--        BEZ omezení na status) — JAKÝKOLI admin mohl přímým PostgREST
--        `.update()` (i mimo `admin_manage_contest`) přepsat libovolnou
--        soutěž do libovolného stavu. Toto reálně používá i
--        `AdminContestManagement.tsx` (ukládání rules/rules_pdf_url/obrázků)
--        — nová verze ji zpřísňuje, ne odstraňuje.
--      - contests_admin_delete (DELETE, `has_role(admin) OR has_role(superadmin)`,
--        BEZ omezení na status) — JAKÝKOLI admin mohl smazat libovolnou
--        soutěž přímo přes PostgREST. Tato policy v repu vůbec nebyla
--        zachycena žádným migračním souborem (čistý produkční drift).
--      - INSERT policy na `contests` DNES NEEXISTUJE VŮBEC. To mimo jiné
--        znamená, že Edge Function `create-contest` (v366 ACTIVE; INSERT jde
--        přes user-scoped klienta, tedy přes RLS, ne přes service-role
--        bypass) má dnes svůj `.insert()` krok fakticky nefunkční pro
--        KAŽDÉHO volajícího včetně superadmina (RLS s nulou INSERT policy
--        znamená deny-by-default). Tato migrace INSERT policy poprvé
--        přidává — pro superadmina to `create-contest` opravuje, pro
--        `contests.create` admina ho zároveň správně omezuje na draft/pending
--        (EF sama status='active' už odmítá vlastní validací, ale 'closed'
--        v jejím `validStatuses` bez DB vrstvy odmítnuté nebylo).
--
-- 3) `pause_contest(contest_id)`, `resume_contest(contest_id)` a
--    `close_contest(p_contest_id)` (všechny SECURITY DEFINER, `authenticated`
--    EXECUTE) mají VŠECHNY stejný guard `has_role(admin) OR
--    has_role(superadmin)` — tedy JAKÝKOLI plain admin je mohl (a stále může,
--    dokud tato migrace neproběhne) zavolat přímo přes `supabase.rpc(...)`
--    ve VLASTNÍ přihlášené session (kde `auth.uid()` správně ukazuje na
--    jeho účet) a pozastavit/znovuaktivovat (`resume_contest` nastavuje
--    `status='active'` — publikace!) nebo uzavřít libovolnou soutěž. Tohle
--    je NEZÁVISLÉ na `admin_manage_contest` i na `contests` RLS výše — je to
--    samostatná, dosud nedokumentovaná cesta, kterou by `contests.create`
--    admin (má roli 'admin') mohl použít k obejití přesně toho, co má tato
--    permission zakazovat. Frontend tyto tři akce dnes zobrazuje jen
--    superadminovi (`/admin` a `/admin/contest/:id` jsou superadmin-only
--    routy) — žádný legitimní volající není plain admin, takže zúžení na
--    superadmin-only nic nerozbíjí. `fn_close_contest` má EXECUTE jen pro
--    `postgres` (orphan, neřešeno), `close_contest_on_million_ticket` je
--    trigger function bez smysluplné přímé volatelnosti (neřešeno).
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
--    notify_sofinity_event, návratový tvar) je BYTE-IDENTICKÝ s živou
--    produkční definicí — mění se jen guard.
--
-- B) `public.contests` RLS — nahrazuje `contests_admin_update`/
--    `contests_admin_delete` (širokou `admin OR superadmin` verzi) a poprvé
--    přidává `contests_admin_insert`, vše symetricky s guardem výše:
--    - superadmin: neomezeno (USING/WITH CHECK vždy true pro něj).
--    - plain admin s `contests.create`: jen když (existující i nový) status
--      je 'draft'/'pending'.
--    - plain admin bez `contests.create`: 0 policy match → RLS default deny.
--    Tím se poprvé skutečně vynucuje na DB vrstvě i cesta mimo
--    `admin_manage_contest` (přímý PostgREST UPDATE/DELETE i `create-contest`
--    EF INSERT) — přesně požadavek "nelze obejít přímým požadavkem".
--    SELECT policy (`contests_admin_select_all`, `contests_winner_select_own`,
--    veřejná active/pending/paused) se NEMĚNÍ.
--
-- C) `pause_contest` / `resume_contest` / `close_contest`: guard zúžen z
--    `has_role(admin) OR has_role(superadmin)` na `has_role(superadmin)`.
--    Business logika (audit_logs, výběr/zápis výherce, event_logs, Sofinity)
--    beze změny — mění se jen guard a jeho chybová hláška.
--
-- ROZSAH: tato migrace se NEDOTÝKÁ `bonus_prizes`, `winners`, `wallets`,
-- `payments`, `tickets`, `buy_ticket_atomic`, `assign_contest_ticket_atomic`,
-- `close-contest`/`create-contest` Edge Functions (zdrojový kód), ani
-- `admin_permissions`/`has_admin_permission()` (Phase 2 základ z
-- 20260623_admin_permissions.sql, beze změny). Nemaže a nepřejmenovává žádná
-- data.
--
-- ROLLBACK (odpovídá skutečnému stavu PŘED touto migrací, ověřenému výše —
-- NE staršímu repo-based předpokladu s legacy "Allow admin full access"):
--   DROP POLICY IF EXISTS "contests_admin_insert" ON public.contests;
--   DROP POLICY IF EXISTS "contests_admin_update" ON public.contests;
--   CREATE POLICY "contests_admin_update" ON public.contests FOR UPDATE
--     TO authenticated
--     USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superadmin'::app_role))
--     WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superadmin'::app_role));
--   DROP POLICY IF EXISTS "contests_admin_delete" ON public.contests;
--   CREATE POLICY "contests_admin_delete" ON public.contests FOR DELETE
--     TO authenticated
--     USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid()
--       AND user_roles.role = ANY (ARRAY['admin'::app_role, 'superadmin'::app_role])));
--   -- a vrátit admin_manage_contest / pause_contest / resume_contest / close_contest
--   -- na definice zachycené v tomto souboru jako "PŘED touto migrací" (bod 1 a 3 výše).

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
-- B) public.contests RLS — contests_admin_update/contests_admin_delete
--    zpřesněny, contests_admin_insert nově přidána (dřív žádná neexistovala).
-- ─────────────────────────────────────────────────────────────────────────────
-- Defenzivní no-op na produkci/stagingu (tam už tato policy neexistuje — viz
-- bod 2 výše), ale repo migrace ji v pořadí ještě vytváří (20250921124919…),
-- takže na čerstvém `supabase db reset` je potřeba ji i tady odstranit.
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

-- ─────────────────────────────────────────────────────────────────────────────
-- C) pause_contest / resume_contest / close_contest — zúženo na superadmin-only
--    (dřív: has_role(admin) OR has_role(superadmin) — nezávislá cesta, kterou
--    by mohl zavolat přímo i `contests.create` admin, protože MÁ roli 'admin').
--    Business logika beze změny.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pause_contest(contest_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'Superadmin access required';
  END IF;

  SELECT status INTO v_status
  FROM public.contests
  WHERE id = contest_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Uzavřenou soutěž nelze pozastavit.';
  END IF;

  UPDATE public.contests
  SET status = 'paused'
  WHERE id = contest_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resume_contest(contest_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'superadmin'::public.app_role) THEN
    RAISE EXCEPTION 'Superadmin access required';
  END IF;

  SELECT status INTO v_status
  FROM public.contests
  WHERE id = contest_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'Uzavřenou soutěž nelze znovu aktivovat.';
  END IF;

  UPDATE public.contests
  SET status = 'active'
  WHERE id = contest_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_contest(p_contest_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ticket record;
  v_status text;
  v_main_winner_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'superadmin'::app_role) THEN
    RAISE EXCEPTION 'Superadmin access required';
  END IF;

  -- AUDIT: admin_action
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'admin_action',
    'admin_action',
    auth.uid(),
    p_contest_id,
    jsonb_build_object(
      'reference_id',  p_contest_id,
      'action',        'close_contest',
      'admin_action',  true
    ),
    now()
  );

  SELECT status INTO v_status
  FROM   public.contests
  WHERE  id = p_contest_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;
  IF v_status = 'closed' THEN RETURN; END IF;

  -- Main winner already exists: sync status only
  IF EXISTS (
    SELECT 1 FROM public.winners
    WHERE  contest_id = p_contest_id AND type = 'main'
  ) THEN
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

    INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
    VALUES (
      'contest_closed',
      'contest_closed',
      auth.uid(),
      p_contest_id,
      jsonb_build_object(
        'reference_id', p_contest_id,
        'source',       'close_contest_sync',
        'admin_action', true
      ),
      now()
    );

    SELECT w.user_id INTO v_main_winner_id
    FROM   public.winners w
    WHERE  w.contest_id = p_contest_id AND w.type = 'main'
    LIMIT  1;

    IF v_main_winner_id IS NOT NULL THEN
      INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
      VALUES (
        'contest_closed',
        v_main_winner_id,
        p_contest_id,
        jsonb_build_object('source', 'close_contest_sync'),
        'onemil'
      );
    END IF;

    RETURN;
  END IF;

  -- Pick a random winning ticket
  SELECT * INTO v_ticket
  FROM   public.tickets
  WHERE  contest_id = p_contest_id
  ORDER  BY random()
  LIMIT  1;

  -- No tickets sold: close with no winner
  IF v_ticket IS NULL THEN
    UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

    INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
    VALUES (
      'contest_closed',
      'contest_closed',
      auth.uid(),
      p_contest_id,
      jsonb_build_object(
        'reference_id', p_contest_id,
        'source',       'close_contest_no_tickets',
        'admin_action', true
      ),
      now()
    );

    INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
    VALUES (
      'contest_closed',
      auth.uid(),
      p_contest_id,
      jsonb_build_object('source', 'close_contest_no_tickets'),
      'onemil'
    );

    RETURN;
  END IF;

  -- Insert main winner
  INSERT INTO public.winners (contest_id, user_id, ticket_id, type, created_at)
  VALUES (p_contest_id, v_ticket.user_id, v_ticket.id, 'main', now());

  -- AUDIT: winner_created — reference_id stays NULL; ticket_row_id is BIGINT in metadata
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'winner_created',
    'winner_created',
    v_ticket.user_id,
    NULL,
    jsonb_build_object(
      'ticket_row_id', v_ticket.id,
      'contest_id',    p_contest_id,
      'ticket_number', v_ticket.number,
      'type',          'main',
      'admin_action',  true
    ),
    now()
  );

  INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
  VALUES (
    'prize_won',
    v_ticket.user_id,
    p_contest_id,
    jsonb_build_object(
      'notes',         'Hlavni vyhra',
      'type',          'main',
      'ticket_number', v_ticket.number,
      'ticket_row_id', v_ticket.id,
      'source',        'close_contest'
    ),
    'onemil'
  );

  UPDATE public.contests SET status = 'closed' WHERE id = p_contest_id;

  -- AUDIT: contest_closed
  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  VALUES (
    'contest_closed',
    'contest_closed',
    auth.uid(),
    p_contest_id,
    jsonb_build_object(
      'reference_id',      p_contest_id,
      'winner_user_id',    v_ticket.user_id,
      'winner_ticket_id',  v_ticket.id,
      'source',            'close_contest',
      'admin_action',      true
    ),
    now()
  );

  INSERT INTO public.event_logs (event_name, user_id, contest_id, metadata, source_system)
  VALUES (
    'contest_closed',
    v_ticket.user_id,
    p_contest_id,
    jsonb_build_object(
      'source',            'close_contest',
      'winner_ticket_id',  v_ticket.id
    ),
    'onemil'
  );
END;
$function$;

COMMIT;
