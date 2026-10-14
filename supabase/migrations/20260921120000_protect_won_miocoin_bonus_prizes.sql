-- ============================================================================
-- Protect already-won MioCoin bonus_prizes rows from the resave wipe.
-- ============================================================================
-- Applied to STAGING (dxmowysntemfqfnanxua) only. Production
-- (xkzhjldrojjlrkezorey) is untouched and requires a separate explicit
-- approval and apply step; this migration file is committed for that
-- future review.
--
-- Root cause (confirmed by direct inspection, not guessed):
--   Two functions unconditionally delete a contest's MioCoin bonus_prizes
--   rows (`WHERE contest_id = ... AND amount > 0`) every time an admin
--   re-saves/regenerates MioCoin bonus positions:
--     - admin_begin_miocoin_save (the currently active chunked-save path,
--       called from AdminContestManagement.tsx's handleSave)
--     - admin_bulk_insert_miocoin_bonuses (an older, one-shot equivalent -
--       no longer called by the frontend, per its own in-repo comment, but
--       still present and callable by any superadmin via RPC)
--   Neither checks whether a bonus_prizes row already has a real winner
--   (a `winners` row referencing it via prize_id) before deleting it. A
--   frontend toast nudges the admin about "immutable" MioCoin positions,
--   but it only fires in specific UI states and is not a database-level
--   guarantee - a deliberate re-edit of MioCoin positions on a contest that
--   already has real winners is a normal, reachable admin action, and nothing
--   in the database stopped it from silently orphaning winners.prize_id.
--   Confirmed directly on staging: 360 of 365 bonus-type winners with a
--   prize_id point to a bonus_prizes row that no longer exists, with the
--   newest occurrence from earlier today - this is live, ongoing behavior,
--   not old history.
--
-- Fix (four functions, same principle applied consistently everywhere the
-- root cause exists):
--   1. admin_begin_miocoin_save: the wipe DELETE now excludes any
--      bonus_prizes row referenced by an existing winners.prize_id ("won"
--      rows survive; still-pending, never-won future positions are deleted
--      and regenerated exactly as before - unchanged for that case).
--   2. admin_append_miocoin_chunk: before inserting a chunk, reject (loudly,
--      via the same success:false contract every caller already handles) any
--      incoming ticket_position that collides with a surviving won MioCoin
--      row, instead of silently creating a second bonus_prizes row at the
--      same position. This mirrors the existing collision guard pattern
--      already used against physical prize positions in
--      admin_bulk_insert_miocoin_bonuses.
--   3. admin_finalize_miocoin_save: the "row count must equal what the
--      frontend expected" check now compares against NEWLY inserted rows
--      only (total minus surviving won rows), since a surviving won row is
--      no longer wiped-then-recreated by this flow and must not count
--      against the new payload's expected size. contests.total_miocoin_bonus
--      keeps summing every amount > 0 row (won + new), which is what it
--      always conceptually meant - the total bonus pool for the contest,
--      not just the newest edit's rows. As a direct, necessary consequence
--      this also fixes total_miocoin_bonus previously undercounting after a
--      resave that had wiped already-won rows; this is a display-only
--      column, read by nothing that moves money or determines a winner.
--   4. admin_bulk_insert_miocoin_bonuses: identical DELETE guard and an
--      identical collision guard (added next to its existing physical-prize
--      collision check), so the same protection applies even though the
--      frontend no longer calls this function.
--
-- Explicitly unchanged by this migration:
--   - trg_bonus_to_wallet, wallet_transactions, wallets.balance_coins,
--     wallets.bonus_balance_coins - no trigger or wallet code touched.
--   - assign_contest_ticket_atomic / buy_ticket_atomic - the mechanism that
--     decides which ticket wins which position is untouched.
--   - admin_manage_bonus_prize (single physical-prize create/update) - it
--     never bulk-deletes and was already safe.
--   - No existing winners or bonus_prizes row is modified, deleted, or
--     backfilled by this migration. The 360 pre-existing orphaned rows on
--     staging are left exactly as they are - out of scope here, to be
--     handled by the separately-approved pre-launch reset.
--   - No FK added on winners.prize_id -> bonus_prizes.id. This fix closes
--     the gap for FUTURE saves, but the 360 pre-existing orphans (left
--     untouched per the above) still make a hard FK unsafe to add today -
--     same blocker as before, now for an explicitly smaller and
--     non-growing set of rows once this fix is live.
-- ============================================================================

create or replace function public.admin_begin_miocoin_save(p_contest_id uuid, p_expected_count integer)
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

  -- Only wipe MioCoin positions that were never actually won. A row already
  -- referenced by a real winners.prize_id survives - deleting it would
  -- orphan that already-existing win.
  DELETE FROM public.bonus_prizes bp
  WHERE bp.contest_id = p_contest_id
    AND bp.amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.winners w WHERE w.prize_id = bp.id
    );

  UPDATE public.contests
  SET total_miocoin_bonus = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.bonus_prizes
    WHERE contest_id = p_contest_id
      AND amount > 0
  )
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

create or replace function public.admin_append_miocoin_chunk(p_contest_id uuid, p_bonuses jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id            uuid;
  v_invalid_count       integer;
  v_protected_collision integer;
  v_inserted_count      integer;
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

  -- After admin_begin_miocoin_save, any remaining amount > 0 row for this
  -- contest is necessarily a protected, already-won position (everything
  -- unwon was deleted at begin). Reject a chunk that would collide with one
  -- instead of silently creating a second row at the same ticket_position -
  -- there is no unique constraint on (contest_id, ticket_position) to catch
  -- this otherwise.
  SELECT bp.ticket_position
  INTO v_protected_collision
  FROM jsonb_array_elements(p_bonuses) AS elem
  JOIN public.bonus_prizes bp
    ON bp.contest_id      = p_contest_id
   AND bp.ticket_position = NULLIF(elem->>'ticket_position', '')::integer
   AND bp.amount > 0
  LIMIT 1;

  IF v_protected_collision IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format(
        'Pozice %s uz patri drive vyhrane MioCoin vyhre a nelze ji prepsat novym rozlozenim',
        v_protected_collision
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

create or replace function public.admin_finalize_miocoin_save(p_contest_id uuid, p_expected_count integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id       uuid;
  v_real_count     integer;
  v_protected_count integer;
  v_new_count      integer;
  v_total_amount   numeric;
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

  -- Rows already won survive admin_begin_miocoin_save's wipe (see that
  -- function) and are never part of what THIS save session inserted, so
  -- they must not count against p_expected_count (the new payload's own
  -- size). total_miocoin_bonus below still sums won + new together, which
  -- is the correct total bonus pool for the contest.
  SELECT COUNT(*)
  INTO v_protected_count
  FROM public.bonus_prizes bp
  WHERE bp.contest_id = p_contest_id
    AND bp.amount > 0
    AND EXISTS (SELECT 1 FROM public.winners w WHERE w.prize_id = bp.id);

  v_new_count := v_real_count - v_protected_count;

  IF v_new_count <> p_expected_count THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format(
        'Pocet ulozenych MioCoin pozic (%s) neodpovida ocekavanemu (%s). Save nebyl dokoncen.',
        v_new_count, p_expected_count
      ),
      'real_count',     v_new_count,
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
    format('Chunked MioCoin save: %s novych pozic (+ %s jiz vyhranych zachovano), celkem %s MioCoin', v_new_count, v_protected_count, v_total_amount),
    jsonb_build_object(
      'contest_id',      p_contest_id,
      'inserted_count',  v_new_count,
      'protected_count', v_protected_count,
      'total_amount',    v_total_amount,
      'chunked',         true
    )
  );

  RETURN jsonb_build_object(
    'success',        true,
    'inserted_count', v_new_count,
    'total_amount',   v_total_amount
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$function$;

create or replace function public.admin_bulk_insert_miocoin_bonuses(p_contest_id uuid, p_bonuses jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id            uuid;
  v_invalid_count       integer;
  v_dup_pos             integer;
  v_collision_pos       integer;
  v_protected_collision integer;
  v_inserted_count      integer;
  v_total_amount        numeric;
BEGIN
  PERFORM set_config('statement_timeout', '300000', true);

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

  -- Same protection as admin_append_miocoin_chunk: a MioCoin position that
  -- already has a real winner must not be silently duplicated by a new
  -- payload reusing the same ticket_position.
  SELECT bp.ticket_position
  INTO v_protected_collision
  FROM tmp_miocoin_bonuses t
  JOIN public.bonus_prizes bp
    ON bp.contest_id      = p_contest_id
   AND bp.ticket_position = t.ticket_position
   AND bp.amount > 0
   AND EXISTS (SELECT 1 FROM public.winners w WHERE w.prize_id = bp.id)
  LIMIT 1;

  IF v_protected_collision IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', format(
        'Pozice %s uz patri drive vyhrane MioCoin vyhre a nelze ji prepsat novym rozlozenim',
        v_protected_collision
      )
    );
  END IF;

  -- Only wipe MioCoin positions that were never actually won - see
  -- admin_begin_miocoin_save for the same principle and rationale.
  DELETE FROM public.bonus_prizes bp
  WHERE bp.contest_id = p_contest_id
    AND bp.amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.winners w WHERE w.prize_id = bp.id
    );

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

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_amount
  FROM tmp_miocoin_bonuses;

  UPDATE public.contests
  SET total_miocoin_bonus = (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.bonus_prizes
    WHERE contest_id = p_contest_id
      AND amount > 0
  )
  WHERE id = p_contest_id;

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
