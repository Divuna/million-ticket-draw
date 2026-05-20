-- ─────────────────────────────────────────────────────────────────────────────
-- Final consolidated definition of public.admin_bulk_insert_miocoin_bonuses.
--
-- Problem (issue #71):
--   Production still throws:
--     "canceling statement due to statement timeout"
--   when an admin saves a very large MioCoin bonus set (~95 000 positions).
--
--   Production introspection shows the deployed function on production is
--   missing the PR #68 idempotency fix:
--     contains_tmp_table       = true   (PRs #65/#66 applied)
--     contains_drop_tmp        = false  (PR #68 NOT applied)
--     contains_jsonb_each_loop = true   (older JSON iteration still present)
--     contains_total_sync      = true   (PR #63 applied)
--
--   In other words: the canonical function from
--   20260520_fix_admin_bulk_miocoin_temp_table_idempotent.sql never reached
--   production, and even with that canonical body the function can still hit
--   the per-statement timeout when the temp table INSERT/DELETE/INSERT chain
--   is wider than the default API statement_timeout window.
--
-- Fix:
--   1. Replace the function with the canonical PR #68 body
--      (DROP TABLE IF EXISTS + idempotent CREATE TEMP TABLE, set-based
--       validation, single INSERT … SELECT, total_miocoin_bonus sync).
--   2. At the very top of the function body, raise statement_timeout for the
--      current transaction only:
--          PERFORM set_config('statement_timeout', '300000', true);
--      (300 000 ms = 5 minutes). The `true` argument makes the change LOCAL
--      to the current transaction — it resets automatically at commit/rollback
--      and never leaks to other sessions or other RPCs.
--   3. Ensure the supporting index on bonus_prizes(contest_id, ticket_position)
--      exists for the collision JOIN (idempotent CREATE INDEX IF NOT EXISTS).
--
-- Safety invariants:
--   • Function signature unchanged: (uuid, jsonb) RETURNS jsonb.
--   • Validation rules unchanged (role, nulls, amount > 0, duplicates,
--     collisions with physical prizes).
--   • JSON response shape unchanged.
--   • statement_timeout override is transaction-local (true flag) — it cannot
--     leak to ticket purchase, winners, wallets, payments, Partner Offers,
--     Stripe webhooks, Sofinity events, or any other RPC.
--   • Does NOT touch buy_ticket_atomic, tickets, winners, wallets, payments,
--     Partner Offers, or any other table/function.
--   • Temp table is session-local and dropped both explicitly (DROP TABLE
--     IF EXISTS) and at transaction end (ON COMMIT DROP).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Supporting index on the real table for the collision JOIN ─────────────
CREATE INDEX IF NOT EXISTS idx_bonus_prizes_contest_position
  ON public.bonus_prizes (contest_id, ticket_position);

-- ── 2. Replace function with final canonical body ────────────────────────────
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
  -- ── Transaction-local statement_timeout extension ───────────────────────────
  -- Raise per-statement timeout to 5 minutes for the duration of THIS
  -- transaction only. Without this the default API statement_timeout (typically
  -- 30–60 seconds) can cancel the INSERT/DELETE chain on very large payloads.
  -- The `true` flag scopes the change to the current transaction — it cannot
  -- leak to any other RPC, session, or worker.
  PERFORM set_config('statement_timeout', '300000', true);

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
  -- DROP TABLE IF EXISTS makes the temp-table creation idempotent across
  -- multiple calls inside the same transaction (PR #68 fix).
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
