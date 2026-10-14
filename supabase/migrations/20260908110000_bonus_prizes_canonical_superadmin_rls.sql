-- bonus_prizes: sjednocení write autorizace na canonical superadmin
-- (public.is_superadmin()) a odstranění legacy public.users.role závislosti.
--
-- POTVRZENÝ PROBLÉM (read-only audit)
-- `bonus_prizes` write RLS ("Allow admin full access to bonus prizes", ALL)
-- i pět aktivních SECURITY DEFINER RPC používaly starou
-- `public.users.role IN ('admin','superadmin')` / `= 'superadmin'` kontrolu.
-- Citlivá správa soutěží a bonusových výher je dnes SUPERADMIN-ONLY na úrovni
-- frontendu (`/admin` → RequireSuperadminOrRedirect, `/admin/contest/:id` →
-- RequireSuperadmin + interní isSuperAdmin guard). Canonical superadmin bez
-- odpovídající staré `users.role` by prošel routou, ale zápis by DB tiše/
-- chybně zamítla — stejný vzor jako dřív u `banner-images` (PR #410) a
-- `voucher-images` (PR #411).
--
-- ŘEŠENÍ
-- 1) Nahradit jedinou legacy ALL policy třemi canonical write policies
--    (INSERT/UPDATE/DELETE), guard `(SELECT public.is_superadmin())`.
--    SELECT policies (`bonus_prizes_select_admin`, `bonus_prizes_select_resolved`)
--    zůstávají beze změny.
-- 2) V pěti aktivních RPC nahradit pouze auth guard (`EXISTS (SELECT 1 FROM
--    users/public.users WHERE id=v_admin_id AND role...)`) za
--    `public.is_superadmin(v_admin_id)`. Business logika, parametry, návratové
--    hodnoty, audit (`admin_actions`), Sofinity eventy a SECURITY DEFINER
--    vlastnosti beze změny — těla jsou byte-identická až na guard.
--
-- MIMO ROZSAH TÉTO MIGRACE (vědomě nedotčeno):
-- - 7-arg vs 9-arg overload ambiguity `admin_manage_bonus_prize` volaného z
--   `ContestDetailAdmin.tsx` (pre-existing bug, nesouvisí s autorizací) —
--   obě signatury zůstávají zachovány beze změny parametrů/názvů.
-- - `ContestDetailAdmin.tsx` a `AdminContestManagement.tsx` frontend kód
--   (false-success DELETE/UPDATE) — samostatná budoucí oprava.
-- - Edge Functions `add-bonus-prize` a `distribute-bonus-prizes` — jejich
--   vlastní auth guard je už canonical (`user_roles`), nemění se.
-- - `assign_contest_ticket_atomic` / `buy_ticket_atomic` (zákaznický nákup
--   tiketu, pending→won, winners, MioCoin bonus) — SECURITY DEFINER vlastněné
--   `postgres` (rolbypassrls=true, bonus_prizes.relforcerowsecurity=false),
--   RLS na `bonus_prizes` tuto cestu vůbec nekonzultuje a touto migrací není
--   a nemůže být dotčena.
-- - `admin_bulk_insert_miocoin_bonuses` nemá dnes žádného live frontend
--   volajícího (legacy, ponecháno v repu jako komentář v
--   AdminContestManagement.tsx dokládá). Funkce se neodstraňuje; pouze se
--   jí sjednocuje guard na `is_superadmin()` (dřív umožňovala i 'admin', ne
--   jen 'superadmin' — bez live volajícího toto zúžení nic neláme).
-- - Žádná změna tabulkové struktury, žádná data, žádné DROP FUNCTION.

BEGIN;

-- ── TABLE RLS ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow admin full access to bonus prizes" ON public.bonus_prizes;

CREATE POLICY "bonus_prizes_admin_insert" ON public.bonus_prizes
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_superadmin())
  );

CREATE POLICY "bonus_prizes_admin_update" ON public.bonus_prizes
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_superadmin())
  )
  WITH CHECK (
    (SELECT public.is_superadmin())
  );

CREATE POLICY "bonus_prizes_admin_delete" ON public.bonus_prizes
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (
    (SELECT public.is_superadmin())
  );

-- bonus_prizes_select_admin a bonus_prizes_select_resolved (SELECT) beze změny.

-- ── RPC: admin_manage_bonus_prize (7-arg) ──────────────────────────────
-- Signatura, parametry, návratová hodnota a zbytek těla beze změny — jen
-- auth guard.
CREATE OR REPLACE FUNCTION public.admin_manage_bonus_prize(p_prize_id uuid DEFAULT NULL::uuid, p_contest_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_ticket_position integer DEFAULT NULL::integer, p_amount numeric DEFAULT NULL::numeric, p_status text DEFAULT 'pending'::text, p_operation text DEFAULT 'create'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_prize_id uuid;
  v_old_record bonus_prizes%rowtype;
  v_new_record bonus_prizes%rowtype;
  v_contest_title text;
  v_payload jsonb;
BEGIN
  -- Get current admin user
  v_admin_id := auth.uid();

  -- Check if user is admin
  IF NOT public.is_superadmin(v_admin_id) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat bonusové výhry';
  END IF;

  -- Handle UPDATE operation
  IF p_operation = 'update' AND p_prize_id IS NOT NULL THEN
    -- Get old record for logging
    SELECT * INTO v_old_record
    FROM bonus_prizes
    WHERE id = p_prize_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bonusová výhra nebyla nalezena';
    END IF;

    -- Update bonus prize
    UPDATE bonus_prizes
    SET
      description = COALESCE(p_description, description),
      ticket_position = COALESCE(p_ticket_position, ticket_position),
      amount = COALESCE(p_amount, amount),
      status = COALESCE(p_status, status)
    WHERE id = p_prize_id
    RETURNING * INTO v_new_record;

    v_prize_id := p_prize_id;
    p_contest_id := v_new_record.contest_id;

  -- Handle CREATE operation
  ELSE
    -- Validate required fields for creation
    IF p_contest_id IS NULL OR p_description IS NULL OR p_ticket_position IS NULL THEN
      RAISE EXCEPTION 'ID soutěže, popis a pozice tiketu jsou povinné';
    END IF;

    -- Check if contest exists
    IF NOT EXISTS (SELECT 1 FROM contests WHERE id = p_contest_id) THEN
      RAISE EXCEPTION 'Soutěž s daným ID neexistuje';
    END IF;

    -- Check if ticket position is already taken
    IF EXISTS (
      SELECT 1 FROM bonus_prizes
      WHERE contest_id = p_contest_id AND ticket_position = p_ticket_position
    ) THEN
      RAISE EXCEPTION 'Pozice tiketu % je již obsazena v této soutěži', p_ticket_position;
    END IF;

    -- Create new bonus prize
    INSERT INTO bonus_prizes (
      contest_id, description, ticket_position, amount, status
    ) VALUES (
      p_contest_id, p_description, p_ticket_position, p_amount, p_status
    ) RETURNING * INTO v_new_record;

    v_prize_id := v_new_record.id;
  END IF;

  -- Get contest title for logging
  SELECT title INTO v_contest_title
  FROM contests
  WHERE id = p_contest_id;

  -- Log admin action
  INSERT INTO admin_actions (
    admin_id,
    action_type,
    target_table,
    target_id,
    notes,
    metadata
  ) VALUES (
    v_admin_id,
    CONCAT('bonus_prize_', p_operation),
    'bonus_prizes',
    v_prize_id,
    CONCAT('Bonusová výhra ', p_operation, ': ', v_new_record.description,
           ' (pozice ', v_new_record.ticket_position, ')'),
    jsonb_build_object(
      'old_data', CASE WHEN p_operation = 'update' THEN to_jsonb(v_old_record) ELSE NULL END,
      'new_data', to_jsonb(v_new_record),
      'contest_title', v_contest_title,
      'operation', p_operation
    )
  );

  -- Prepare Sofinity payload
  v_payload := jsonb_build_object(
    'event_name', CONCAT('bonus_prize_', p_operation),
    'contest_id', p_contest_id,
    'prize_id', v_prize_id,
    'description', v_new_record.description,
    'ticket_position', v_new_record.ticket_position,
    'amount', v_new_record.amount,
    'status', v_new_record.status,
    'contest_title', v_contest_title,
    'admin_id', v_admin_id,
    'timestamp', now()
  );

  -- Send event to Sofinity
  PERFORM notify_sofinity_event(
    CONCAT('bonus_prize_', p_operation),
    v_admin_id,
    p_contest_id,
    v_payload
  );

  -- Return success response
  RETURN json_build_object(
    'success', true,
    'message', CASE
      WHEN p_operation = 'create' THEN 'Bonusová výhra byla úspěšně vytvořena'
      ELSE 'Bonusová výhra byla úspěšně aktualizována'
    END,
    'prize_id', v_prize_id,
    'prize_data', row_to_json(v_new_record)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba při správě bonusové výhry: %', SQLERRM;
END;
$function$;

-- ── RPC: admin_manage_bonus_prize (9-arg) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_manage_bonus_prize(p_prize_id uuid DEFAULT NULL::uuid, p_contest_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_ticket_position integer DEFAULT NULL::integer, p_amount numeric DEFAULT NULL::numeric, p_status text DEFAULT 'pending'::text, p_operation text DEFAULT 'create'::text, p_image_url text DEFAULT NULL::text, p_detailed_description text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id      uuid;
  v_prize_id      uuid;
  v_old_record    bonus_prizes%rowtype;
  v_new_record    bonus_prizes%rowtype;
  v_contest_title text;
  v_payload       jsonb;
BEGIN
  v_admin_id := auth.uid();

  IF NOT public.is_superadmin(v_admin_id) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat bonusové výhry';
  END IF;

  IF p_operation = 'update' AND p_prize_id IS NOT NULL THEN

    SELECT * INTO v_old_record
    FROM bonus_prizes
    WHERE id = p_prize_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bonusová výhra nebyla nalezena';
    END IF;

    UPDATE bonus_prizes
    SET
      description          = COALESCE(p_description,          description),
      ticket_position      = COALESCE(p_ticket_position,      ticket_position),
      amount               = COALESCE(p_amount,               amount),
      status               = COALESCE(p_status,               status),
      image_url            = COALESCE(p_image_url,            image_url),
      detailed_description = COALESCE(p_detailed_description, detailed_description)
    WHERE id = p_prize_id
    RETURNING * INTO v_new_record;

    v_prize_id   := p_prize_id;
    p_contest_id := v_new_record.contest_id;

  ELSE

    IF p_contest_id IS NULL OR p_description IS NULL OR p_ticket_position IS NULL THEN
      RAISE EXCEPTION 'ID soutěže, popis a pozice tiketu jsou povinné';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM contests WHERE id = p_contest_id) THEN
      RAISE EXCEPTION 'Soutěž s daným ID neexistuje';
    END IF;

    IF EXISTS (
      SELECT 1 FROM bonus_prizes
      WHERE contest_id = p_contest_id AND ticket_position = p_ticket_position
    ) THEN
      RAISE EXCEPTION 'Pozice tiketu % je již obsazena v této soutěži', p_ticket_position;
    END IF;

    INSERT INTO bonus_prizes (
      contest_id, description, ticket_position, amount, status,
      image_url, detailed_description
    ) VALUES (
      p_contest_id, p_description, p_ticket_position, p_amount, p_status,
      p_image_url, p_detailed_description
    ) RETURNING * INTO v_new_record;

    v_prize_id := v_new_record.id;
  END IF;

  SELECT title INTO v_contest_title
  FROM contests
  WHERE id = p_contest_id;

  INSERT INTO admin_actions (
    admin_id, action_type, target_table, target_id, notes, metadata
  ) VALUES (
    v_admin_id,
    CONCAT('bonus_prize_', p_operation),
    'bonus_prizes',
    v_prize_id,
    CONCAT('Bonusová výhra ', p_operation, ': ', v_new_record.description,
           ' (pozice ', v_new_record.ticket_position, ')'),
    jsonb_build_object(
      'old_data',      CASE WHEN p_operation = 'update' THEN to_jsonb(v_old_record) ELSE NULL END,
      'new_data',      to_jsonb(v_new_record),
      'contest_title', v_contest_title,
      'operation',     p_operation
    )
  );

  v_payload := jsonb_build_object(
    'event_name',     CONCAT('bonus_prize_', p_operation),
    'contest_id',     p_contest_id,
    'prize_id',       v_prize_id,
    'description',    v_new_record.description,
    'ticket_position',v_new_record.ticket_position,
    'amount',         v_new_record.amount,
    'status',         v_new_record.status,
    'contest_title',  v_contest_title,
    'admin_id',       v_admin_id,
    'timestamp',      now()
  );

  PERFORM notify_sofinity_event(
    CONCAT('bonus_prize_', p_operation),
    v_admin_id,
    p_contest_id,
    v_payload
  );

  RETURN json_build_object(
    'success', true,
    'message', CASE
      WHEN p_operation = 'create' THEN 'Bonusová výhra byla úspěšně vytvořena'
      ELSE 'Bonusová výhra byla úspěšně aktualizována'
    END,
    'prize_id', v_prize_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$function$;

-- ── RPC: admin_begin_miocoin_save ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_begin_miocoin_save(p_contest_id uuid, p_expected_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();

  IF NOT public.is_superadmin(v_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pouze administratori mohou spravovat bonusove vyhry'
    );
  END IF;

  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null');
  END IF;

  IF p_expected_count IS NULL OR p_expected_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_expected_count musi byt vetsi nez 0');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje');
  END IF;

  DELETE FROM public.bonus_prizes
  WHERE contest_id = p_contest_id
    AND amount > 0;

  UPDATE public.contests
  SET total_miocoin_bonus = 0
  WHERE id = p_contest_id;

  INSERT INTO public.admin_actions (
    admin_id, action_type, target_table, target_id, notes, metadata
  ) VALUES (
    v_admin_id,
    'miocoin_save_begin',
    'bonus_prizes',
    p_contest_id,
    format('Chunked MioCoin save: begin (expected %s pozic)', p_expected_count),
    jsonb_build_object('contest_id', p_contest_id, 'expected_count', p_expected_count)
  );

  RETURN jsonb_build_object('success', true);

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- ── RPC: admin_append_miocoin_chunk ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_append_miocoin_chunk(p_contest_id uuid, p_bonuses jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id       uuid;
  v_invalid_count  integer;
  v_inserted_count integer;
BEGIN
  v_admin_id := auth.uid();

  IF NOT public.is_superadmin(v_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pouze administratori mohou spravovat bonusove vyhry'
    );
  END IF;

  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null');
  END IF;

  IF p_bonuses IS NULL OR jsonb_typeof(p_bonuses) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_bonuses musi byt JSON pole');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje');
  END IF;

  SELECT COUNT(*)
  INTO v_invalid_count
  FROM jsonb_array_elements(p_bonuses) AS elem
  WHERE NULLIF(elem->>'ticket_position', '')::integer IS NULL
     OR NULLIF(elem->>'amount',          '')::numeric IS NULL
     OR (elem->>'amount')::numeric <= 0;

  IF v_invalid_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format(
        '%s polozek v chunku ma chybejici nebo neplatne ticket_position / amount',
        v_invalid_count
      )
    );
  END IF;

  INSERT INTO public.bonus_prizes (
    contest_id,
    description,
    ticket_position,
    amount,
    status
  )
  SELECT
    p_contest_id,
    (elem->>'amount') || ' MioCoin',
    (elem->>'ticket_position')::integer,
    (elem->>'amount')::numeric,
    'pending'
  FROM jsonb_array_elements(p_bonuses) AS elem;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success',        true,
    'inserted_count', v_inserted_count
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- ── RPC: admin_finalize_miocoin_save ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_finalize_miocoin_save(p_contest_id uuid, p_expected_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id     uuid;
  v_real_count   integer;
  v_total_amount numeric;
BEGIN
  v_admin_id := auth.uid();

  IF NOT public.is_superadmin(v_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pouze administratori mohou spravovat bonusove vyhry'
    );
  END IF;

  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null');
  END IF;

  IF p_expected_count IS NULL OR p_expected_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_expected_count musi byt vetsi nez 0');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje');
  END IF;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
  INTO v_real_count, v_total_amount
  FROM public.bonus_prizes
  WHERE contest_id = p_contest_id
    AND amount > 0;

  IF v_real_count <> p_expected_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format(
        'Pocet ulozenych MioCoin pozic (%s) neodpovida ocekavanemu (%s). Save nebyl dokoncen.',
        v_real_count, p_expected_count
      ),
      'real_count',     v_real_count,
      'expected_count', p_expected_count
    );
  END IF;

  UPDATE public.contests
  SET total_miocoin_bonus = v_total_amount
  WHERE id = p_contest_id;

  INSERT INTO public.admin_actions (
    admin_id, action_type, target_table, target_id, notes, metadata
  ) VALUES (
    v_admin_id,
    'miocoin_bulk_create',
    'bonus_prizes',
    p_contest_id,
    format('Chunked MioCoin save: %s pozic, celkem %s MioCoin', v_real_count, v_total_amount),
    jsonb_build_object(
      'contest_id',     p_contest_id,
      'inserted_count', v_real_count,
      'total_amount',   v_total_amount,
      'chunked',        true
    )
  );

  RETURN jsonb_build_object(
    'success',        true,
    'inserted_count', v_real_count,
    'total_amount',   v_total_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

-- ── RPC: admin_bulk_insert_miocoin_bonuses (legacy, no live frontend caller) ──
-- Guard sjednocen na is_superadmin() (dřív dovolovala i plain 'admin', ne jen
-- 'superadmin') pro konzistenci s ostatními write cestami bonus_prizes.
-- Zbytek těla (statement_timeout extension, temp table materializace,
-- validace, DELETE+INSERT, audit log) beze změny.
CREATE OR REPLACE FUNCTION public.admin_bulk_insert_miocoin_bonuses(p_contest_id uuid, p_bonuses jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id        uuid;
  v_invalid_count   integer;
  v_dup_pos         integer;
  v_collision_pos   integer;
  v_inserted_count  integer;
  v_total_amount    numeric;
BEGIN
  -- Transaction-local statement_timeout extension (5 minutes).
  PERFORM set_config('statement_timeout', '300000', true);

  -- Role check
  v_admin_id := auth.uid();

  IF NOT public.is_superadmin(v_admin_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pouze administratori mohou spravovat bonusove vyhry'
    );
  END IF;

  -- Scalar input validation
  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null');
  END IF;

  IF p_bonuses IS NULL OR jsonb_typeof(p_bonuses) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_bonuses musi byt JSON pole');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje');
  END IF;

  -- Materialize payload once into temp table (idempotent: DROP IF EXISTS)
  DROP TABLE IF EXISTS tmp_miocoin_bonuses;
  CREATE TEMP TABLE tmp_miocoin_bonuses (
    ticket_position integer,
    amount          numeric
  ) ON COMMIT DROP;

  INSERT INTO tmp_miocoin_bonuses (ticket_position, amount)
  SELECT
    NULLIF(elem->>'ticket_position', '')::integer,
    NULLIF(elem->>'amount',          '')::numeric
  FROM jsonb_array_elements(p_bonuses) AS elem;

  CREATE INDEX ON tmp_miocoin_bonuses (ticket_position);

  -- 1. Missing / invalid fields
  SELECT COUNT(*)
  INTO v_invalid_count
  FROM tmp_miocoin_bonuses
  WHERE ticket_position IS NULL
     OR amount IS NULL
     OR amount <= 0;

  IF v_invalid_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format(
        '%s polozek ma chybejici nebo neplatne ticket_position / amount',
        v_invalid_count
      )
    );
  END IF;

  -- 2. Duplicate positions within payload
  SELECT ticket_position
  INTO v_dup_pos
  FROM tmp_miocoin_bonuses
  GROUP BY ticket_position
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF v_dup_pos IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Duplicitni pozice %s v payloadu', v_dup_pos)
    );
  END IF;

  -- 3. Collision with existing physical-prize rows
  SELECT bp.ticket_position
  INTO v_collision_pos
  FROM tmp_miocoin_bonuses t
  JOIN public.bonus_prizes bp
    ON bp.contest_id      = p_contest_id
   AND bp.ticket_position = t.ticket_position
   AND (bp.amount IS NULL OR bp.amount = 0)
  LIMIT 1;

  IF v_collision_pos IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Pozice %s je obsazena vecnou vyhrou', v_collision_pos)
    );
  END IF;

  -- Delete existing MioCoin rows for this contest
  DELETE FROM public.bonus_prizes
  WHERE contest_id = p_contest_id
    AND amount > 0;

  -- Bulk insert from tmp table
  INSERT INTO public.bonus_prizes (
    contest_id,
    description,
    ticket_position,
    amount,
    status
  )
  SELECT
    p_contest_id,
    amount::text || ' MioCoin',
    ticket_position,
    amount,
    'pending'
  FROM tmp_miocoin_bonuses;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  -- Aggregate total
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_amount
  FROM tmp_miocoin_bonuses;

  -- Sync denormalized total
  UPDATE public.contests
  SET total_miocoin_bonus = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.bonus_prizes
    WHERE contest_id = p_contest_id
      AND amount > 0
  )
  WHERE id = p_contest_id;

  -- Admin log entry
  INSERT INTO public.admin_actions (
    admin_id,
    action_type,
    target_table,
    target_id,
    notes,
    metadata
  ) VALUES (
    v_admin_id,
    'miocoin_bulk_create',
    'bonus_prizes',
    p_contest_id,
    format('Bulk MioCoin insert: %s pozic, celkem %s MioCoin', v_inserted_count, v_total_amount),
    jsonb_build_object(
      'contest_id',     p_contest_id,
      'inserted_count', v_inserted_count,
      'total_amount',   v_total_amount
    )
  );

  RETURN jsonb_build_object(
    'success',        true,
    'inserted_count', v_inserted_count,
    'total_amount',   v_total_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$function$;

COMMIT;
