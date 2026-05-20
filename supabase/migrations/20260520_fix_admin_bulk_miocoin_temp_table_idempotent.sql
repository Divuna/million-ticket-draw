-- Fix temp-table idempotency in admin_bulk_insert_miocoin_bonuses.
--
-- Problem:
--   CREATE TEMP TABLE tmp_miocoin_bonuses (...) ON COMMIT DROP is session-local
--   and only dropped at transaction end. If the function is called more than
--   once inside the same SQL transaction, the second call can fail because the
--   temp table still exists.
--
-- Fix:
--   Drop the temp table explicitly before recreating it.
--
-- Safety invariants:
--   • Function signature unchanged.
--   • Validation rules unchanged.
--   • JSON responses unchanged.
--   • No frontend, workflow, or schema changes outside this function replace.

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
      'message', 'Pouze administratori mohou spravovat bonusove vyhry'
    );
  END IF;

  -- ── Scalar input validation ─────────────────────────────────────────────────
  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null');
  END IF;

  IF p_bonuses IS NULL OR jsonb_typeof(p_bonuses) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_bonuses musi byt JSON pole');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje');
  END IF;

  -- ── Materialize payload once — all subsequent queries read the temp table ───
  -- jsonb_array_elements is called exactly ONE time from this point forward.
  -- The temp table lives only for the duration of this transaction (ON COMMIT DROP).
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

  -- Index on ticket_position: makes duplicate check and collision JOIN O(N log N)
  -- instead of O(N^2) for large payloads.
  CREATE INDEX ON tmp_miocoin_bonuses (ticket_position);

  -- ── Set-based validation — all against tmp table, no JSON re-parsing ────────

  -- 1. Missing / invalid fields: NULL ticket_position, NULL amount, or amount <= 0.
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

  -- 2. Duplicate positions within the payload.
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

  -- 3. Collision with existing physical-prize rows (amount IS NULL OR amount = 0).
  --    One indexed JOIN — no per-row queries.
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

  -- ── Delete existing MioCoin rows for this contest ───────────────────────────
  -- (amount > 0 distinguishes MioCoin rows from physical prize rows)
  DELETE FROM public.bonus_prizes
  WHERE contest_id = p_contest_id
    AND amount > 0;

  -- ── Bulk insert from tmp table — single sequential scan, no JSON ─────────────
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

  -- ── Aggregate total from tmp table ──────────────────────────────────────────
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_amount
  FROM tmp_miocoin_bonuses;

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
$$;
