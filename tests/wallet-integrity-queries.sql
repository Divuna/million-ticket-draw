-- =============================================================================
-- OneMil — Wallet Integrity Verification Queries
-- Run these in the Supabase SQL Editor against the production database.
-- All queries are SELECT-only — safe to run at any time.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Basic wallet sanity
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Wallet balance summary
SELECT
  COUNT(*)                        AS total_wallets,
  COUNT(*) FILTER (WHERE balance_coins < 0)  AS negative_balances,   -- must be 0
  COUNT(*) FILTER (WHERE balance_coins = 0)  AS zero_balances,
  MIN(balance_coins)              AS min_balance,
  MAX(balance_coins)              AS max_balance,
  AVG(balance_coins)::numeric(12,2) AS avg_balance
FROM public.wallets;

-- 1b. List any wallets with negative balance (must return 0 rows)
SELECT user_id, balance_coins
FROM public.wallets
WHERE balance_coins < 0
ORDER BY balance_coins ASC;

-- 1c. Wallets without a corresponding auth user (orphan wallets)
SELECT w.user_id, w.balance_coins
FROM public.wallets w
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u WHERE u.id = w.user_id
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — Payment idempotency
-- ─────────────────────────────────────────────────────────────────────────────

-- 2a. Duplicate stripe_session_id (must return 0 rows — idempotency guard)
SELECT stripe_session_id, COUNT(*) AS cnt
FROM public.payments
WHERE stripe_session_id IS NOT NULL
GROUP BY stripe_session_id
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- 2b. Payments without a wallet (should not exist for completed payments)
SELECT p.id, p.user_id, p.amount, p.status
FROM public.payments p
WHERE p.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM public.wallets w WHERE w.user_id = p.user_id
  );

-- 2c. Payment status breakdown
SELECT status, COUNT(*) AS cnt, SUM(amount) AS total_amount
FROM public.payments
GROUP BY status
ORDER BY cnt DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Wallet balance consistency
-- Note: wallets can be credited by multiple sources:
--   (a) Stripe payments   → via trg_update_wallet_after_payment trigger
--   (b) Voucher redemption → via redeem_voucher / redeem_miocoin functions
--   (c) Referral bonuses  → via create_referral_reward_from_payment trigger
--   (d) Direct admin credits
-- The balance ≠ SUM(payments.amount) and that is expected.
-- The critical invariant is: balance_coins >= 0 at all times.
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Wallet balance vs total credited payments (informational only)
-- Significant difference expected due to vouchers, referrals, ticket deductions
SELECT
  w.user_id,
  w.balance_coins                                              AS current_balance,
  COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) AS total_payments_credited,
  w.balance_coins - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0) AS diff
FROM public.wallets w
LEFT JOIN public.payments p ON p.user_id = w.user_id
GROUP BY w.user_id, w.balance_coins
ORDER BY ABS(w.balance_coins - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'completed'), 0)) DESC
LIMIT 20;

-- 3b. Wallet vs ticket spend consistency
-- Each ticket purchase deducts ticket_price from wallet.
-- Balance should equal: credits_in - tickets_spent - refunds_deducted
-- This query shows ticket spend per user per contest.
SELECT
  w.user_id,
  w.balance_coins,
  COUNT(t.id)                 AS tickets_purchased,
  SUM(c.ticket_price)         AS total_ticket_spend,
  w.balance_coins + SUM(c.ticket_price) AS implied_pre_spend_balance
FROM public.wallets w
JOIN public.tickets t  ON t.user_id = w.user_id
JOIN public.contests c ON c.id = t.contest_id
GROUP BY w.user_id, w.balance_coins
ORDER BY total_ticket_spend DESC
LIMIT 20;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — Ticket integrity
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. Duplicate ticket numbers per contest (must return 0 rows)
SELECT contest_id, number, COUNT(*) AS cnt
FROM public.tickets
GROUP BY contest_id, number
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- 4b. Tickets for closed contests (should all be <= ticket_count)
SELECT
  c.id,
  c.title,
  c.ticket_count,
  COUNT(t.id)   AS tickets_sold,
  MAX(t.number) AS max_ticket_number,
  CASE WHEN MAX(t.number) > c.ticket_count THEN 'OVERFLOW ✗' ELSE 'OK ✓' END AS status
FROM public.contests c
LEFT JOIN public.tickets t ON t.contest_id = c.id
WHERE c.status = 'closed'
GROUP BY c.id, c.title, c.ticket_count
ORDER BY c.created_at DESC;

-- 4c. Tickets pointing to non-existent contests
SELECT t.id, t.contest_id, t.number
FROM public.tickets t
WHERE NOT EXISTS (
  SELECT 1 FROM public.contests c WHERE c.id = t.contest_id
)
LIMIT 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — Winner integrity
-- ─────────────────────────────────────────────────────────────────────────────

-- 5a. Multiple main winners per contest (must return 0 rows)
SELECT contest_id, COUNT(*) AS cnt
FROM public.winners
WHERE type = 'main'
GROUP BY contest_id
HAVING COUNT(*) > 1;

-- 5b. Multiple winners per bonus prize (must return 0 rows)
SELECT prize_id, COUNT(*) AS cnt
FROM public.winners
WHERE type = 'bonus' AND prize_id IS NOT NULL
GROUP BY prize_id
HAVING COUNT(*) > 1;

-- 5c. Winners with missing ticket reference (main winners should have ticket_id)
SELECT w.id, w.contest_id, w.user_id, w.type, w.ticket_id
FROM public.winners w
WHERE w.type = 'main'
  AND w.ticket_id IS NULL;

-- 5d. Orphan winners.ticket_id (ticket was deleted after winner was recorded)
SELECT w.id, w.contest_id, w.user_id, w.ticket_id
FROM public.winners w
WHERE w.ticket_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.tickets t WHERE t.id = w.ticket_id
  );

-- 5e. Winners for active contests (no main winner should exist on active contests
--     unless triggered by buy_ticket_atomic filling the last slot)
SELECT w.contest_id, w.type, c.status, COUNT(*) AS cnt
FROM public.winners w
JOIN public.contests c ON c.id = w.contest_id
WHERE c.status = 'active' AND w.type = 'main'
GROUP BY w.contest_id, w.type, c.status;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — Bonus prize integrity
-- ─────────────────────────────────────────────────────────────────────────────

-- 6a. Duplicate bonus positions per contest (must return 0 rows)
SELECT contest_id, ticket_position, COUNT(*) AS cnt
FROM public.bonus_prizes
GROUP BY contest_id, ticket_position
HAVING COUNT(*) > 1;

-- 6b. Bonus prizes out of range (position > ticket_count)
SELECT bp.id, bp.contest_id, bp.ticket_position, c.ticket_count
FROM public.bonus_prizes bp
JOIN public.contests c ON c.id = bp.contest_id
WHERE bp.ticket_position > c.ticket_count
   OR bp.ticket_position < 1;

-- 6c. Bonus prizes at position 0 (invalid)
SELECT * FROM public.bonus_prizes WHERE ticket_position <= 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — Full system health summary
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'negative_wallets'           AS check_name,
  COUNT(*) FILTER (WHERE balance_coins < 0) AS violations
FROM public.wallets

UNION ALL

SELECT
  'duplicate_ticket_numbers',
  COUNT(*) FROM (
    SELECT contest_id, number FROM public.tickets
    GROUP BY contest_id, number HAVING COUNT(*) > 1
  ) s

UNION ALL

SELECT
  'duplicate_main_winners',
  COUNT(*) FROM (
    SELECT contest_id FROM public.winners WHERE type='main'
    GROUP BY contest_id HAVING COUNT(*) > 1
  ) s

UNION ALL

SELECT
  'duplicate_bonus_winners',
  COUNT(*) FROM (
    SELECT prize_id FROM public.winners WHERE type='bonus' AND prize_id IS NOT NULL
    GROUP BY prize_id HAVING COUNT(*) > 1
  ) s

UNION ALL

SELECT
  'duplicate_bonus_positions',
  COUNT(*) FROM (
    SELECT contest_id, ticket_position FROM public.bonus_prizes
    GROUP BY contest_id, ticket_position HAVING COUNT(*) > 1
  ) s

UNION ALL

SELECT
  'orphan_winner_ticket_id',
  COUNT(*) FROM public.winners w
  WHERE w.ticket_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = w.ticket_id)

UNION ALL

SELECT
  'duplicate_stripe_sessions',
  COUNT(*) FROM (
    SELECT stripe_session_id FROM public.payments
    WHERE stripe_session_id IS NOT NULL
    GROUP BY stripe_session_id HAVING COUNT(*) > 1
  ) s

ORDER BY check_name;
-- Expected output: every row should have violations = 0
