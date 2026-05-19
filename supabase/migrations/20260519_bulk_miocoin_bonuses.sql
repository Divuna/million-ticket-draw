-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: bulk MioCoin bonus save
--
-- Problem: AdminContestManagement saved each MioCoin bonus with one sequential
-- HTTP RPC call. For 95 000 positions that is 95 000 round-trips (~11 hours at
-- observed ~430 ms/call) and always failed mid-way, leaving partial rows.
--
-- Fix:
--   1. New SECURITY DEFINER function admin_bulk_insert_miocoin_bonuses that
--      deletes existing MioCoin rows and inserts all new rows in one SQL
--      statement (one HTTP call from the browser).
--
--   2. Idempotent CREATE POLICY for admin write access on bonus_prizes.
--      The policy was present in early migrations and was applied manually on
--      staging but was never applied to production. Without it the client-side
--      DELETE before the physical prize loop silently deletes nothing (RLS deny-
--      by-default), causing stale physical rows to accumulate on re-saves.
--
-- Safety invariants:
--   • Does NOT touch buy_ticket_atomic, tickets, winners, wallets, payments.
--   • Does NOT touch the physical prize save path.
--   • Does NOT alter any existing function signature.
--   • The new function is admin-only (SECURITY DEFINER + role check).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Idempotent admin write policy on bonus_prizes ─────────────────────────
-- Uses DO block because CREATE POLICY IF NOT EXISTS is not valid Postgres syntax.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'bonus_prizes'
      AND policyname = 'Allow admin full access to bonus prizes'
  ) THEN
    CREATE POLICY "Allow admin full access to bonus prizes"
      ON public.bonus_prizes
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid()
            AND u.role IN ('admin', 'superadmin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.id = auth.uid()
            AND u.role IN ('admin', 'superadmin')
        )
      );
  END IF;
END
$$;

-- ── 2. Bulk MioCoin insert function ──────────────────────────────────────────
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
