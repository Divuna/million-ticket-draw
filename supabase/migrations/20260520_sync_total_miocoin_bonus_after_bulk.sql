-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: sync contests.total_miocoin_bonus after bulk MioCoin save
--
-- Problem: admin_bulk_insert_miocoin_bonuses (PR #61) inserts rows into
-- bonus_prizes correctly but does not update contests.total_miocoin_bonus.
-- The trigger function sync_total_miocoin_bonus does not exist on production,
-- so the column stays at 0 forever and the admin list shows "Bonusové MioCoiny = 0"
-- for every contest regardless of actual bonus_prizes content.
--
-- Fix:
--   1. CREATE OR REPLACE admin_bulk_insert_miocoin_bonuses — identical to the
--      PR #61 version except one UPDATE statement is added after the bulk INSERT
--      that recomputes total_miocoin_bonus from bonus_prizes for this contest.
--
--   2. Backfill: set total_miocoin_bonus on all existing contests that have
--      bonus_prizes rows (amount > 0).
--
--   3. Zero-fill: set total_miocoin_bonus = 0 on all contests that have no
--      MioCoin bonus rows (makes the column consistent across the board).
--
-- Safety invariants:
--   • Does NOT touch buy_ticket_atomic, tickets, winners, wallets, payments.
--   • Does NOT touch the physical prize save path.
--   • Does NOT alter the function signature.
--   • Backfill + zero-fill are idempotent plain UPDATEs — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Replace function — adds UPDATE contests after bulk INSERT ──────────────
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
  v_item            jsonb;
  v_pos             integer;
  v_amt             numeric;
  v_inserted_count  integer;
  v_total_amount    numeric;
  v_seen_positions  integer[] := '{}';
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

  -- ── Input validation ────────────────────────────────────────────────────────
  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmí být null');
  END IF;

  IF p_bonuses IS NULL OR jsonb_typeof(p_bonuses) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_bonuses musí být JSON pole');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutěž s daným ID neexistuje');
  END IF;

  -- ── Per-item validation: position, amount, uniqueness ───────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_bonuses)
  LOOP
    -- ticket_position must be present and integer
    IF v_item->>'ticket_position' IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Každý bonus musí mít ticket_position');
    END IF;
    v_pos := (v_item->>'ticket_position')::integer;

    -- amount must be present and > 0
    IF v_item->>'amount' IS NULL THEN
      RETURN jsonb_build_object('success', false, 'message', 'Každý bonus musí mít amount');
    END IF;
    v_amt := (v_item->>'amount')::numeric;
    IF v_amt <= 0 THEN
      RETURN jsonb_build_object('success', false, 'message', 'amount musí být větší než 0');
    END IF;

    -- No duplicates within payload
    IF v_pos = ANY(v_seen_positions) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', format('Duplicitní pozice %s v payloadu', v_pos)
      );
    END IF;
    v_seen_positions := array_append(v_seen_positions, v_pos);

    -- No collision with existing physical prizes for this contest
    IF EXISTS (
      SELECT 1 FROM public.bonus_prizes
      WHERE contest_id     = p_contest_id
        AND ticket_position = v_pos
        AND (amount IS NULL OR amount = 0)
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', format('Pozice %s je obsazena věcnou výhrou', v_pos)
      );
    END IF;
  END LOOP;

  -- ── Delete existing MioCoin rows for this contest ───────────────────────────
  -- (amount > 0 distinguishes MioCoin rows from physical prize rows)
  DELETE FROM public.bonus_prizes
  WHERE contest_id = p_contest_id
    AND amount > 0;

  -- ── Bulk insert all new MioCoin rows ────────────────────────────────────────
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
  -- The trigger function sync_total_miocoin_bonus does not exist on production,
  -- so we maintain the column explicitly here after every bulk save.
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
    'success',         true,
    'inserted_count',  v_inserted_count,
    'total_amount',    v_total_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$$;

-- ── 2. Backfill: contests that have MioCoin bonus rows ───────────────────────
-- Sets total_miocoin_bonus to the real SUM(amount) from bonus_prizes.
UPDATE public.contests c
SET total_miocoin_bonus = x.total_amount
FROM (
  SELECT contest_id, SUM(amount) AS total_amount
  FROM public.bonus_prizes
  WHERE amount > 0
  GROUP BY contest_id
) x
WHERE c.id = x.contest_id;

-- ── 3. Zero-fill: contests with no MioCoin rows ──────────────────────────────
-- Ensures the column is exactly 0 (not NULL) for contests without MioCoin bonuses.
UPDATE public.contests c
SET total_miocoin_bonus = 0
WHERE NOT EXISTS (
  SELECT 1
  FROM public.bonus_prizes bp
  WHERE bp.contest_id = c.id
    AND bp.amount > 0
);
