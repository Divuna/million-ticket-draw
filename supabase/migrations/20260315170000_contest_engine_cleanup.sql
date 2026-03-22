-- =============================================================================
-- Contest engine safety: step 1 of 3 – data cleanup.
-- Removes data integrity violations that would block constraint creation in step 2.
-- Keep policy: always keep the row with the smallest id (earliest created).
-- All deletes use self-join via USING so only true duplicates are removed.
-- Run manually in Supabase SQL Editor. Do not run via CLI.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Duplicate tickets by (contest_id, number) – keep smallest id
--    Cascades to nothing (no FK points to tickets.id yet).
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM public.tickets t1
USING       public.tickets t2
WHERE  t1.contest_id = t2.contest_id
  AND  t1.number     = t2.number
  AND  t1.id         > t2.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Duplicate main winners per contest – keep smallest id
--    winner_status_history references winners(id) ON DELETE CASCADE,
--    so duplicate history rows are automatically removed.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM public.winners a
USING       public.winners b
WHERE  a.contest_id = b.contest_id
  AND  a.type       = 'main'
  AND  b.type       = 'main'
  AND  a.id         > b.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Duplicate bonus winners per prize_id – keep smallest id
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM public.winners a
USING       public.winners b
WHERE  a.prize_id IS NOT NULL
  AND  a.prize_id = b.prize_id
  AND  a.type     = 'bonus'
  AND  b.type     = 'bonus'
  AND  a.id       > b.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Duplicate bonus_prizes by (contest_id, ticket_position) – keep smallest id
--
--    Step 4a: re-point any winner rows whose prize_id references the soon-to-be-
--             deleted duplicate bonus_prizes rows → redirect them to the kept row
--             so winners.prize_id stays valid after the delete.
--    Step 4b: delete the duplicate bonus_prizes rows.
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a: redirect winners.prize_id from duplicate bonus rows to the kept row
-- MIN(id::text) used because min() over uuid is not available in all environments
WITH kept_bonus AS (
  SELECT
    contest_id,
    ticket_position,
    MIN(id::text)::uuid AS keep_id
  FROM   public.bonus_prizes
  GROUP  BY contest_id, ticket_position
  HAVING COUNT(*) > 1
)
UPDATE public.winners w
SET    prize_id = kb.keep_id
FROM   public.bonus_prizes bp
JOIN   kept_bonus kb
       ON  bp.contest_id      = kb.contest_id
       AND bp.ticket_position = kb.ticket_position
       AND bp.id             <> kb.keep_id
WHERE  w.prize_id = bp.id
  AND  w.type     = 'bonus';

-- 4b: delete duplicate bonus_prizes (keep smallest id per contest+position)
DELETE FROM public.bonus_prizes a
USING       public.bonus_prizes b
WHERE  a.contest_id      = b.contest_id
  AND  a.ticket_position = b.ticket_position
  AND  a.id              > b.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Negative wallet balances – floor at zero
--    Required before validating the wallets_balance_coins_non_negative CHECK.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.wallets
SET    balance_coins = 0
WHERE  balance_coins < 0;
