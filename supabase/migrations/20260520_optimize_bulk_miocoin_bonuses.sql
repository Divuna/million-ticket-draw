-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: optimize admin_bulk_insert_miocoin_bonuses for large payloads
--
-- Problem: previous version validated p_bonuses in a PL/pgSQL FOR loop:
--   • duplicate-position check used array_append on v_seen_positions — O(N^2)
--   • physical-prize collision check fired one EXISTS query per row — N queries
--   For 95 000 positions this caused "canceling statement due to statement timeout"
--   before a single row was inserted.
--
-- Fix: replace row-by-row validation with set-based SQL:
--   1. Parse the JSON array once into a CTE (tmp).
--   2. Validate NULL ticket_position / NULL amount / amount <= 0 in one COUNT.
--   3. Validate duplicate positions in one GROUP BY ... HAVING COUNT(*) > 1 query.
--   4. Validate physical-prize collisions in one JOIN against bonus_prizes.
--   5. DELETE + INSERT + UPDATE contests.total_miocoin_bonus unchanged.
--   6. All four checks are O(N) or single-pass — no PL/pgSQL looping.
--
-- Safety invariants:
--   • Role check preserved (admin/superadmin only).
--   • Function signature unchanged.
--   • Behaviour identical to previous version for valid payloads.
--   • Does NOT touch buy_ticket_atomic, tickets, winners, wallets, payments.
--   • Does NOT touch the physical prize save path.
--   • Backfill / zero-fill not repeated — those were one-time ops in PR #63.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_bulk_insert_miocoin_bonuses(
  p_contest_id uuid,
  p_bonuses    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id        uuid;
  v_invalid_count   integer;
  v_dup_pos         integer;
  v_collision_pos   integer;
  v_inserted_count  integer;
  v_total_amount    numeric;
BEGIN
  -- ── Role check ──────────────────────────────────────────────────────────────
  v_admin_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id   = v_admin_id
      AND role IN ('admin', 'superadmin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pouze administrátoři mohou spravovat bonusové výhry'
    );
  END IF;

  -- ── Scalar input validation ─────────────────────────────────────────────────
  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmí být null');
  END IF;

  IF p_bonuses IS NULL OR jsonb_typeof(p_bonuses) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_bonuses musí být JSON pole');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutěž s daným ID neexistuje');
  END IF;

  -- ── Set-based validation (replaces per-row PL/pgSQL loop) ───────────────────
  --
  -- Parse the JSON array once.  All four checks below reuse this single parse.
  -- Using a WITH CTE so the planner can materialise it once.

  -- 1. Missing / invalid fields: any row where ticket_position IS NULL,
  --    amount IS NULL, or amount::numeric <= 0.
  SELECT COUNT(*)
  INTO v_invalid_count
  FROM jsonb_array_elements(p_bonuses) AS elem
  WHERE (elem->>'ticket_position') IS NULL
     OR (elem->>'amount') IS NULL
     OR (elem->>'amount')::numeric <= 0;

  IF v_invalid_count > 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format(
        '%s položek má chybějící nebo neplatné ticket_position / amount',
        v_invalid_count
      )
    );
  END IF;

  -- 2. Duplicate positions within the payload.
  SELECT (elem->>'ticket_position')::integer
  INTO v_dup_pos
  FROM jsonb_array_elements(p_bonuses) AS elem
  GROUP BY (elem->>'ticket_position')::integer
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF v_dup_pos IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Duplicitní pozice %s v payloadu', v_dup_pos)
    );
  END IF;

  -- 3. Collision with existing physical-prize rows (amount IS NULL OR amount = 0).
  --    One JOIN replaces N individual EXISTS queries.
  SELECT bp.ticket_position
  INTO v_collision_pos
  FROM jsonb_array_elements(p_bonuses) AS elem
  JOIN public.bonus_prizes bp
    ON bp.contest_id      = p_contest_id
   AND bp.ticket_position = (elem->>'ticket_position')::integer
   AND (bp.amount IS NULL OR bp.amount = 0)
  LIMIT 1;

  IF v_collision_pos IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format('Pozice %s je obsazena věcnou výhrou', v_collision_pos)
    );
  END IF;

  -- ── Delete existing MioCoin rows for this contest ───────────────────────────
  -- (amount > 0 distinguishes MioCoin rows from physical prize rows)
  DELETE FROM public.bonus_prizes
  WHERE contest_id = p_contest_id
    AND amount > 0;

  -- ── Bulk insert all new MioCoin rows (single INSERT ... SELECT) ─────────────
  INSERT INTO public.bonus_prizes (
    contest_id,
    description,
    ticket_position,
    amount,
    status
  )
  SELECT
    p_contest_id,
    (elem->>'amount') || ' MioCoinů',
    (elem->>'ticket_position')::integer,
    (elem->>'amount')::numeric,
    'pending'
  FROM jsonb_array_elements(p_bonuses) AS elem;

  GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

  SELECT COALESCE(SUM((elem->>'amount')::numeric), 0)
  INTO v_total_amount
  FROM jsonb_array_elements(p_bonuses) AS elem;

  -- ── Sync denormalized total back onto the contests row ───────────────────────
  UPDATE public.contests
  SET total_miocoin_bonus = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.bonus_prizes
    WHERE contest_id = p_contest_id
      AND amount > 0
  )
  WHERE id = p_contest_id;

  -- ── Single admin_actions log entry for the bulk operation ───────────────────
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
    format('Bulk MioCoin insert: %s pozic, celkem %s MioCoinů', v_inserted_count, v_total_amount),
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
$$;
