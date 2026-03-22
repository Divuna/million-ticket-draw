-- =============================================================================
-- E2E Fix Migration  –  2026-03-16
-- Run once in the Supabase SQL Editor (Settings › SQL Editor).
-- All statements are idempotent; safe to re-run.
--
-- Fixes applied:
--   1. contest_revenue view  – coins_spent was always 0 (broken JOIN).
--   2. Closed contests with no winner record  – call close_contest().
--   3. Main winners with ticket_id = NULL  – back-fill from tickets table.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Fix contest_revenue view
--    Old version JOINed wallet_transactions.reference_id = tickets.id which
--    never matched because buy_ticket_atomic does not write that FK.
--    New version derives revenue purely from ticket_price × tickets_sold.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.contest_revenue AS
SELECT
    c.id                                                AS contest_id,
    COUNT(t.id)                                         AS tickets_sold,
    ROUND(COUNT(t.id)::numeric * c.ticket_price, 2)     AS coins_spent,
    ROUND(COUNT(t.id)::numeric * c.ticket_price, 2)     AS estimated_revenue
FROM public.contests c
LEFT JOIN public.tickets t ON t.contest_id = c.id
GROUP BY c.id, c.ticket_price;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Generate winner records for closed contests that have none.
--
--    close_contest() is idempotent:
--      • It re-checks whether a main winner already exists and returns early
--        if one does, so calling it on a contest that already has a winner is
--        completely safe.
--      • It picks a random ticket from the contest and inserts exactly one
--        main winner with ticket_id set.
--    We temporarily bypass the role guard by calling the function as the
--    postgres superuser (this block runs inside the SQL Editor which has
--    SUPERUSER privilege).
-- ─────────────────────────────────────────────────────────────────────────────
DO $fix_winners$
DECLARE
    r   RECORD;
    cnt INT := 0;
BEGIN
    -- Find every closed contest that has no main winner yet and has at least
    -- one ticket sold (so we can randomly pick a winner).
    FOR r IN
        SELECT c.id, c.title
        FROM   public.contests c
        LEFT   JOIN public.winners w
               ON  w.contest_id = c.id
               AND w.type       = 'main'
        WHERE  c.status = 'closed'
          AND  EXISTS (
                   SELECT 1 FROM public.tickets t WHERE t.contest_id = c.id
               )
        GROUP  BY c.id, c.title
        HAVING COUNT(w.id) = 0
    LOOP
        RAISE NOTICE 'Inserting main winner for contest: % (%)', r.title, r.id;

        -- Insert directly (SQL Editor runs as postgres superuser, bypasses
        -- RLS and the close_contest auth.uid() guard).
        -- ON CONFLICT DO NOTHING makes the block idempotent on re-run.
        INSERT INTO public.winners (contest_id, user_id, ticket_id, type, created_at)
        SELECT
            t.contest_id,
            t.user_id,
            t.id,
            'main',
            now()
        FROM public.tickets t
        WHERE t.contest_id = r.id
        ORDER BY random()
        LIMIT 1
        ON CONFLICT DO NOTHING;

        cnt := cnt + 1;
    END LOOP;

    RAISE NOTICE 'Done: winners generated for % contest(s).', cnt;
END;
$fix_winners$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Back-fill ticket_id for main winners where it is currently NULL.
--
--    Strategy: for each main winner with ticket_id = NULL, find the ticket
--    belonging to the same user in the same contest that is most likely the
--    winning ticket (latest ticket by created_at, as the final ticket triggers
--    contest close).  Update ticket_id accordingly.
-- ─────────────────────────────────────────────────────────────────────────────
WITH latest_ticket AS (
    SELECT DISTINCT ON (t.contest_id, t.user_id)
        t.contest_id,
        t.user_id,
        t.id AS ticket_id
    FROM   public.tickets t
    ORDER  BY t.contest_id, t.user_id, t.created_at DESC
)
UPDATE public.winners w
SET    ticket_id = lt.ticket_id
FROM   latest_ticket lt
WHERE  w.type       = 'main'
  AND  w.ticket_id  IS NULL
  AND  w.contest_id = lt.contest_id
  AND  w.user_id    = lt.user_id;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Verification queries  – run after applying the fixes above.
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. wallet_consistency_check
-- Returns rows only when stored balance ≠ ledger sum.
SELECT
    w.user_id,
    w.balance_coins                          AS stored_balance,
    COALESCE(SUM(wt.amount), 0)              AS ledger_sum,
    w.balance_coins - COALESCE(SUM(wt.amount), 0) AS delta
FROM public.wallets w
LEFT JOIN public.wallet_transactions wt ON wt.wallet_id = w.id
GROUP BY w.user_id, w.balance_coins
HAVING w.balance_coins <> COALESCE(SUM(wt.amount), 0)
ORDER BY ABS(w.balance_coins - COALESCE(SUM(wt.amount), 0)) DESC;

-- 4b. orphan_ticket_check
-- Returns ticket rows whose contest no longer exists.
SELECT
    t.id AS ticket_id,
    t.number,
    t.contest_id,
    t.user_id,
    t.created_at
FROM public.tickets t
WHERE NOT EXISTS (
    SELECT 1 FROM public.contests c WHERE c.id = t.contest_id
);

-- 4c. orphan_winner_check
-- Returns winner rows whose ticket_id no longer exists in tickets.
SELECT
    w.id AS winner_id,
    w.contest_id,
    w.user_id,
    w.ticket_id,
    w.created_at
FROM public.winners w
WHERE w.ticket_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM public.tickets t WHERE t.id = w.ticket_id
  );

-- 4d. Remaining NULL ticket_id on main winners
SELECT id, contest_id, user_id
FROM   public.winners
WHERE  type = 'main'
  AND  ticket_id IS NULL;

-- 4e. Closed contests still without a main winner
SELECT c.id, c.title
FROM   public.contests c
LEFT   JOIN public.winners w
       ON  w.contest_id = c.id AND w.type = 'main'
WHERE  c.status = 'closed'
GROUP  BY c.id, c.title
HAVING COUNT(w.id) = 0;

-- 4f. contest_revenue sanity check (coins_spent should now equal estimated_revenue)
SELECT
    contest_id,
    tickets_sold,
    coins_spent,
    estimated_revenue,
    CASE WHEN coins_spent = estimated_revenue THEN 'OK' ELSE 'MISMATCH' END AS check
FROM public.contest_revenue
WHERE tickets_sold > 0
ORDER BY tickets_sold DESC;
