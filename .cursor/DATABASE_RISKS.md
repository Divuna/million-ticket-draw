# OneMil — Database Risk Register
**Date:** 2026-03-15

---

## RISK-01: Bonus Prize Winner Created by Trigger, Not Caught by Function (CRITICAL)

**Tables:** `tickets`, `bonus_prizes`, `winners`  
**Risk:** Data correct; response incorrect.

**Flow:**
1. `buy_ticket_atomic` inserts ticket
2. `fn_check_bonus_prize` trigger fires → creates `winners` row, sets `bonus_prizes.status = 'won'`
3. `buy_ticket_atomic` SELECTs `bonus_prizes WHERE status = 'pending'` → empty
4. Function returns `won_prize: null`

The user won a bonus prize but is never told in the real-time response. The `TicketResultModal` shows no bonus win. The user must manually discover it.

**Detection Query:**
```sql
SELECT w.user_id, w.contest_id, w.created_at, bp.title, bp.amount
FROM winners w
JOIN bonus_prizes bp ON bp.id = w.prize_id
WHERE w.type = 'bonus'
  AND w.ticket_id IS NULL  -- ticket_id not set by fn_check_bonus_prize trigger
ORDER BY w.created_at DESC
LIMIT 20;
```

---

## RISK-02: `close_contest_on_million_ticket` Does Not Create Main Winner (HIGH)

**Tables:** `tickets`, `contests`, `winners`

The trigger fires when ticket #1,000,000 is inserted and only sets `contests.status = 'closed'`. It does NOT create the main winner. The main winner is created by `buy_ticket_atomic`.

**Race path:** If someone calls `INSERT INTO tickets` directly (admin, migration, repair script), the contest closes but no winner exists. `close_contest` would need to be called separately.

**Missing:** `fn_check_bonus_prize` does NOT set `ticket_id` on the winner it creates:
```sql
INSERT INTO winners (contest_id, prize_id, user_id, type, notes)
VALUES (...)  -- ticket_id NOT included!
```
This means all bonus winners created by the trigger have `ticket_id = NULL`, making the FK link to the actual winning ticket incomplete.

**Detection Query:**
```sql
SELECT w.id, w.type, w.ticket_id, w.contest_id, w.user_id
FROM winners w
WHERE w.ticket_id IS NULL AND w.type = 'bonus'
LIMIT 50;
```

---

## RISK-03: Multiple Redundant Constraints Allow Contradictory States

**Tables:** `winners`

`uniq_main_winner_per_contest` enforces `UNIQUE (contest_id) WHERE prize_id IS NULL`.  
`idx_winners_one_main_per_contest` enforces `UNIQUE (contest_id) WHERE type = 'main'`.

A row with `type='main'` but `prize_id IS NOT NULL` would:
- Not be blocked by `uniq_main_winner_per_contest` (because `prize_id IS NOT NULL`)
- Be blocked by `idx_winners_one_main_per_contest` (correct)

But if someone inserts a second main winner with `prize_id = some_value`, `uniq_main_winner_per_contest` would allow it (its WHERE clause excludes it). The overlapping partial indexes don't fully agree on what constitutes a "main winner".

**Detection Query:**
```sql
SELECT contest_id, COUNT(*) as winners
FROM winners
WHERE type = 'main'
GROUP BY contest_id
HAVING COUNT(*) > 1;
```

---

## RISK-04: `fn_send_event_to_sofinity` Trigger Has Commented-Out Logic

**Tables:** `tickets`, `prizes`

The function body contains:
```sql
-- logika podle tabulek (tickets, prizes, contests) ...
-- ...
IF v_event_name IS NOT NULL THEN
  PERFORM net.http_post(...)
END IF;
```

`v_event_name` is never assigned. All ticket and prize events flowing through this trigger are silently dropped. Sofinity analytics for ticket purchases via this path receives nothing.

---

## RISK-05: `on_bonus_winner_add_to_bonus_wallet` Trigger Has No Ledger Entry

**Tables:** `winners`, `wallets`

This trigger credits `wallets.bonus_balance_coins` when a bonus winner is inserted:
```sql
UPDATE wallets SET bonus_balance_coins = bonus_balance_coins + amount
WHERE user_id = NEW.user_id;
```

This write does **NOT insert a `wallet_transactions` ledger entry**. The wallet hardening migration (20260315201000) added ledger entries to `buy_ticket_atomic`, `claim_miocoin_bonus`, etc., but this trigger was missed.

**Impact:** `bonus_balance_coins` changes are not auditable via `wallet_transactions`. The ledger and wallet balance can diverge.

**Detection Query:**
```sql
-- Finds wallets where bonus_balance_coins doesn't match ledger sum for bonus credits
SELECT w.user_id, w.bonus_balance_coins,
       COALESCE(SUM(wt.amount) FILTER (WHERE wt.type = 'bonus_claim'), 0) AS ledger_bonus
FROM wallets w
LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.id
GROUP BY w.user_id, w.bonus_balance_coins
HAVING w.bonus_balance_coins <> COALESCE(SUM(wt.amount) FILTER (WHERE wt.type = 'bonus_claim'), 0)
LIMIT 20;
```

---

## RISK-06: `transfer_all_bonus_to_main_wallet` — Race Condition

**Function:** `transfer_all_bonus_to_main_wallet`

If called concurrently for the same user, both calls read the same `bonus_balance_coins` before either updates it, causing double transfer (moving the same bonus amount twice).

**Fix:** Add `FOR UPDATE` lock on the wallet row at the start of this function.

---

## RISK-07: `update_wallet_after_payment` — AFTER INSERT Only

**Table:** `payments`  
**Trigger:** `trg_update_wallet_after_payment`

The trigger only fires on `AFTER INSERT`. If a payment is somehow inserted with `status='pending'` and then updated to `status='completed'`, the wallet is **never credited**. The only path that credits wallets is a direct INSERT with `status='completed'`.

The Stripe webhook always inserts with `status='completed'`, so the current path works. But if any admin or repair tool inserts a payment as 'pending' and later updates it, the wallet update is missed.

**Recommended Fix:** Also trigger on `AFTER UPDATE WHEN (OLD.status <> 'completed' AND NEW.status = 'completed')`.

---

## RISK-08: `winners.ticket_id` FK Has No Index

```sql
ALTER TABLE winners ADD COLUMN ticket_id uuid REFERENCES tickets(id) ON DELETE SET NULL;
```

No B-tree index exists on `winners.ticket_id`. FK validation on `DELETE FROM tickets` (which would fire the ON DELETE SET NULL) requires a sequential scan of `winners`. With many winners, this is slow.

**Fix:**
```sql
CREATE INDEX idx_winners_ticket_id ON public.winners(ticket_id) WHERE ticket_id IS NOT NULL;
```

---

## RISK-09: `wallets.bonus_balance_coins` Has No Non-Negative Constraint

`wallets.balance_coins` has `CHECK (balance_coins >= 0)` (validated). But `wallets.bonus_balance_coins` has NO such constraint. Concurrent refund operations or bugs could reduce it below zero.

**Fix:**
```sql
ALTER TABLE public.wallets ADD CONSTRAINT wallets_bonus_balance_non_negative
  CHECK (bonus_balance_coins >= 0) NOT VALID;
VALIDATE CONSTRAINT wallets_bonus_balance_non_negative;
```

---

## RISK-10: `payments.amount` Has No Positive Value Constraint

`payments.amount NUMERIC NOT NULL` but no `CHECK (amount > 0)`. A refund or data entry error could insert a zero or negative payment which would credit the wallet with a negative/zero amount.

**Fix:**
```sql
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_positive
  CHECK (amount > 0) NOT VALID;
```

---

## Constraint Coverage Summary

| Table | Missing Constraints |
|-------|---------------------|
| `wallets` | `bonus_balance_coins >= 0` |
| `payments` | `amount > 0` |
| `winners` | `ticket_id` index missing |
| `bonus_prizes` | 2 of 3 UNIQUE indexes are redundant |
| `contests` | `next_ticket_number <= ticket_count + 1` |
| `wallet_transactions` | `amount <> 0` (zero-amount ledger entries) |
