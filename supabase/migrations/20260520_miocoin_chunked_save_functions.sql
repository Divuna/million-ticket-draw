-- ─────────────────────────────────────────────────────────────────────────────
-- Chunked MioCoin bonus save — three SECURITY DEFINER functions
--
-- Issue #71: Large explicit MioCoin saves (~95 000 positions) cannot run as one
-- synchronous RPC call. PR #76 attempted to extend statement_timeout from
-- inside the function, but:
--   • PL/pgSQL `set_config('statement_timeout', ..., true)` does not extend
--     the timeout of the outer PostgREST RPC statement (the timeout is locked
--     in when the function call begins).
--   • The Supabase API gateway (Kong / PostgREST) has an independent HTTP
--     request timeout (~60 s) that no SQL setting can lift.
--   • Production test22 confirmed full rollback before any bulk insert ran
--     and before the `miocoin_bulk_create` admin_actions row was written.
--
-- Fix: split the save into three small RPCs that each finish well under the
-- gateway timeout. The frontend orchestrates:
--   1. admin_begin_miocoin_save     — wipe stale rows, reset total
--   2. admin_append_miocoin_chunk   — insert one chunk (~5 000 positions)
--   3. admin_finalize_miocoin_save  — verify count, sync total, write log
--
-- Safety invariants:
--   • Existing `admin_bulk_insert_miocoin_bonuses` is left in place untouched.
--   • Validation rules and admin_actions semantics preserved.
--   • Does NOT touch buy_ticket_atomic, tickets, winners, wallets, payments,
--     Partner Offers, Stripe webhooks, Sofinity events, or OneSignal.
--   • Does NOT change RLS policies. All three functions are SECURITY DEFINER
--     and enforce the admin/superadmin role check internally.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. admin_begin_miocoin_save ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_begin_miocoin_save(
  p_contest_id     uuid,
  p_expected_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
BEGIN
  -- Role check
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

  -- Input validation
  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null');
  END IF;

  IF p_expected_count IS NULL OR p_expected_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_expected_count musi byt vetsi nez 0');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje');
  END IF;

  -- Delete stale MioCoin rows for this contest (amount > 0 distinguishes
  -- MioCoin rows from physical-prize rows, which have amount IS NULL or 0).
  DELETE FROM public.bonus_prizes
  WHERE contest_id = p_contest_id
    AND amount > 0;

  -- Reset denormalized total
  UPDATE public.contests
  SET total_miocoin_bonus = 0
  WHERE id = p_contest_id;

  -- Audit row: chunked save started
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
$$;

-- ── 2. admin_append_miocoin_chunk ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_append_miocoin_chunk(
  p_contest_id uuid,
  p_bonuses    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id       uuid;
  v_invalid_count  integer;
  v_inserted_count integer;
BEGIN
  -- Role check
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

  -- Input validation
  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null');
  END IF;

  IF p_bonuses IS NULL OR jsonb_typeof(p_bonuses) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_bonuses musi byt JSON pole');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje');
  END IF;

  -- Chunk-level validation: every element must have valid ticket_position and amount > 0.
  -- Set-based, single pass over the JSON array. No PL/pgSQL loop.
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

  -- Set-based bulk insert. No DELETE — admin_begin_miocoin_save did the wipe.
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
$$;

-- ── 3. admin_finalize_miocoin_save ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_finalize_miocoin_save(
  p_contest_id     uuid,
  p_expected_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id     uuid;
  v_real_count   integer;
  v_total_amount numeric;
BEGIN
  -- Role check
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

  -- Input validation
  IF p_contest_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_contest_id nesmi byt null');
  END IF;

  IF p_expected_count IS NULL OR p_expected_count <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'p_expected_count musi byt vetsi nez 0');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contests WHERE id = p_contest_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Soutez s danym ID neexistuje');
  END IF;

  -- Count + sum from the source of truth in one indexed pass.
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

  -- Sync denormalized total
  UPDATE public.contests
  SET total_miocoin_bonus = v_total_amount
  WHERE id = p_contest_id;

  -- Final audit row matches the legacy bulk path so existing dashboards keep working.
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
$$;
