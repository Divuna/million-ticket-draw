# OneMil — System Stability Report
**Date:** 2026-03-15  
**Status:** Pre-production hardening in progress  
**Analyst:** Cursor AI  

---

## TASK 1 — Load Test: Concurrent Ticket Purchases

### Test Script
**File:** `tests/load-test-ticket-purchase.js`  
**Framework:** Node.js 18+ (native fetch + `@supabase/supabase-js`)  
**Target contest:** BMW S 1000 RR (`4d762bfa-3202-4dda-8c66-247f2558d44f`)  
**Default concurrency:** 50 (configurable up to 500 in `CONFIG.concurrency`)

### Test Strategy
1. **Create N test users** via Supabase Admin API with fresh wallets (200 coins each, ticket_price = 1)
2. **Authenticate all** concurrently to obtain JWTs
3. **Fire all purchase requests simultaneously** via `Promise.allSettled` against the `purchase-ticket` edge function
4. **Verify DB integrity** after the run using direct SQL queries
5. **Clean up** all test data automatically

### What Is Measured

| Metric | How |
|---|---|
| Total tickets created | SQL `COUNT` scoped to test user IDs |
| Duplicate ticket numbers (client) | `Set` dedup of `ticket_number` in responses |
| Duplicate ticket rows (DB) | `GROUP BY contest_id, number HAVING COUNT > 1` |
| Duplicate main winners | `GROUP BY contest_id WHERE type='main' HAVING COUNT > 1` |
| Negative wallet balances | `WHERE balance_coins < 0` |
| Wallet/ticket mismatch | Expected balance = 200 − tickets_purchased |
| Latency statistics | p50 / p95 / p99 / avg per request |

### How to Run

```bash
# Set service role key (required for user creation)
$env:SUPABASE_SERVICE_ROLE_KEY = "<your-service-role-key>"

# Install dependencies (if not installed)
npm install

# Run the test
node tests/load-test-ticket-purchase.js
```

### Expected Results Under Correct DB Locking

| Check | Expected |
|---|---|
| Duplicate ticket numbers | 0 |
| Duplicate main winners | 0 |
| Negative wallets | 0 |
| Wallet/ticket mismatch | 0 |
| `Contest full` errors | Accepted — contest capacity enforced |
| `Insufficient coins` errors | Accepted — wallet constraint enforced |

### Why the Test Is Safe
- All requests target a 1,000,000-ticket contest — no risk of filling it during tests
- Test users are isolated by email prefix (`loadtest-@onemil-loadtest.invalid`)
- Full cleanup is automatic (tickets, winners, wallets, auth users)
- Read-only verification queries — no schema changes

---

## TASK 2 — Edge Functions Audit

**Full report:** `.cursor/EDGE_FUNCTIONS_AUDIT.md`

### Critical Findings (5 issues, fix before launch)

| # | Function | Issue | Risk |
|---|---|---|---|
| 1 | `sofinity-player-sync` | JWT decoded manually without signature verification — auth bypass possible | HIGH |
| 2 | `admin-create-test-user` | No authentication check — any caller can create wallets and data | HIGH |
| 3 | `send_event_to_sofinity` | `retry_count` assigned a Promise (not value) — corrupts event_queue on failure | MEDIUM |
| 4 | `stripe-webhook` | Idempotency check is read-then-write without DB transaction — double payment possible | MEDIUM |
| 5 | DB trigger `update_wallet_after_payment` | Credits both `balance_coins` AND `balance_vouchers` — possible double-credit | MEDIUM |

### Safe Functions (no changes needed)
`purchase-ticket`, `close-contest`, `stripe-refund`, `add-bonus-prize`, `create-stripe-checkout`, all admin-gated functions, all scheduled functions. Full list in `.cursor/EDGE_FUNCTIONS_AUDIT.md`.

---

## TASK 3 — Wallet Integrity Audit

**SQL queries:** `tests/wallet-integrity-queries.sql` (7 sections, 18 queries)

### Live Database State (as of 2026-03-15)

| Check | Result |
|---|---|
| Total wallets | 25 |
| Negative balance wallets | **0 ✓** |
| Min balance | 0.00 |
| Max balance | 11,766.00 |
| Duplicate Stripe sessions | **0 ✓** |

### Schema Findings

**Wallet credit sources (multiple paths):**

| Source | Mechanism | Auditable? |
|---|---|---|
| Stripe payment | `trg_update_wallet_after_payment` trigger on `payments INSERT` | Yes — payments table |
| Voucher redemption | `redeem_voucher` / `redeem_miocoin` stored functions | Partial — no dedicated log |
| Referral bonus | `create_referral_reward_from_payment` trigger | Depends on referrals table |
| Admin credit | Direct wallet update | Audit_logs only |

**Wallet debit sources:**

| Source | Mechanism | Auditable? |
|---|---|---|
| Ticket purchase | `buy_ticket_atomic` — `UPDATE wallets SET balance_coins = balance_coins - ticket_price` | Yes — tickets table |
| Stripe refund | `deduct_wallet_for_refund` stored function | Yes — payments.status = 'refunded' |

**Critical gap — no transactions journal:**  
There is no `wallet_transactions` table recording every individual debit and credit with timestamps, amounts, and sources. This means:
- Wallet balance cannot be independently reconstructed from transaction history
- Audit trails for regulatory compliance may be incomplete  
- Balance discrepancies between `balance_coins` and expected value cannot be automatically traced

**Recommendation:** Add a `wallet_transactions` table:
```sql
CREATE TABLE public.wallet_transactions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  amount      numeric NOT NULL,        -- positive = credit, negative = debit
  source      text NOT NULL,           -- 'payment', 'ticket_purchase', 'voucher', 'refund', 'admin'
  reference_id uuid,                   -- payment.id / ticket.id / etc.
  balance_after numeric NOT NULL,
  created_at  timestamptz DEFAULT now()
);
```

### `update_wallet_after_payment` Trigger Behaviour
The trigger credits **both** `balance_coins` and `balance_vouchers` from a Stripe payment. Observed in source:
```sql
SET balance_coins    = wallets.balance_coins    + new.amount,
    balance_vouchers = wallets.balance_vouchers + new.amount;
```
If `balance_vouchers` is a separate spendable balance, every payment credits the user twice. This should be verified against the intended business logic before launch.

---

## TASK 4 — Contest Engine Flow Verification

### Full Purchase Flow

```
User action
    │
    ▼
purchase-ticket (edge function)
    │  JWT → auth.getUser()             [auth guard]
    │  contest_id from body             [input validation]
    │
    ▼
buy_ticket_atomic(p_contest_id, p_user_id)  [SECURITY DEFINER, plpgsql]
    │
    ├─ CHECK auth.uid() = p_user_id     [identity guard]
    │
    ├─ SELECT contests FOR UPDATE       [row lock — serializes concurrent purchases for same contest]
    │   └─ status must be 'active'      [closed contest guard]
    │
    ├─ SELECT wallets FOR UPDATE        [row lock — serializes concurrent wallet changes for same user]
    │   └─ balance_coins >= ticket_price [insufficient funds guard]
    │
    ├─ SELECT MAX(number) FROM tickets  [safe under contest lock]
    │
    ├─ v_next_ticket := last + 1        [sequential, no gap]
    │   └─ v_next_ticket <= ticket_count [overflow guard]
    │
    ├─ UPDATE wallets SET balance_coins = balance - price   [atomic deduction]
    │
    ├─ INSERT INTO tickets (RETURNING id → v_new_ticket_id) [unique constraint prevents duplicate]
    │
    ├─ IF bonus position matches:
    │   ├─ INSERT INTO winners (type='bonus', prize_id)     [unique partial index prevents double-win]
    │   └─ UPDATE bonus_prizes SET status='won'
    │
    └─ IF v_next_ticket = ticket_count (last ticket):
        ├─ UPDATE contests SET status='closed'
        └─ INSERT INTO winners (type='main', ticket_id)     [unique partial index prevents double-winner]
```

### Forced Contest Close Flow (admin)

```
Admin action
    │
    ▼
close-contest (edge function)
    │  JWT + admin role check           [double auth guard]
    │
    ▼
close_contest(p_contest_id)  [SECURITY DEFINER, plpgsql]
    │
    ├─ SELECT contests WHERE id = p_contest_id FOR UPDATE   [lock FIRST]
    │
    ├─ IF status = 'closed' THEN RETURN  [idempotent — safe to call multiple times]
    │
    ├─ IF main winner already exists THEN
    │   UPDATE status='closed'; RETURN   [prevents duplicate winner race]
    │
    ├─ SELECT random ticket              [random draw]
    │   └─ IF no tickets → close with no winner
    │
    └─ INSERT INTO winners (type='main', ticket_id)
       UPDATE contests SET status='closed'
```

### Concurrency Safety Guarantees

| Guarantee | Mechanism | Verified |
|---|---|---|
| Only one ticket per number per contest | `FOR UPDATE` on contest row + UNIQUE INDEX `(contest_id, number)` | ✓ |
| Wallet never goes negative | `FOR UPDATE` on wallet row + CHECK `balance_coins >= 0` (validated) | ✓ |
| Only one main winner per contest | `FOR UPDATE` + re-check in `close_contest` + UNIQUE PARTIAL INDEX `WHERE type='main'` | ✓ |
| Only one winner per bonus prize | UNIQUE PARTIAL INDEX `(prize_id) WHERE type='bonus'` | ✓ |
| No bonus prizes at same position | UNIQUE INDEX `(contest_id, ticket_position)` | ✓ |
| Stripe payment processed once | `SELECT before INSERT` check + `UNIQUE(stripe_session_id)` | Partial — see Issue #4 |
| Ticket winner is traceable | `winners.ticket_id FK → tickets.id` | ✓ |

### Identified Concurrency Gaps

1. **Stripe webhook race** — the `SELECT/INSERT` idempotency pattern is not atomic. Fix: use `INSERT ON CONFLICT DO NOTHING` with unique constraint.
2. **`buy_ticket_atomic` vs `close_contest` overlap** — if the last ticket is purchased via `buy_ticket_atomic` and `close_contest` is called simultaneously, one will find an existing main winner and return gracefully. The `FOR UPDATE` lock on the contest row and the partial unique index on `winners (contest_id) WHERE type='main'` prevent any double-winner scenario. **This is correctly handled.**
3. **`distribute-bonus-prizes` TOCTOU** — application-side position generation has a race window. Protected at DB level by the unique index; silent retry masks the error.

---

## Final System Stability Score

| Area | Score | Status |
|---|---|---|
| Database constraints | 10 / 10 | All constraints active and verified |
| Contest engine atomicity | 9 / 10 | Correct locking; minor edge on distribute-bonus-prizes |
| Wallet integrity | 7 / 10 | No negative balances; missing transactions journal; `balance_vouchers` double-credit risk |
| Edge function security | 6 / 10 | 5 critical issues require fixing |
| Stripe payment safety | 7 / 10 | Signature verified; idempotency check not fully atomic |
| Data audit trails | 5 / 10 | audit_logs and event_queue exist; no wallet_transactions table |
| **Overall** | **7.3 / 10** | **Not yet production-ready — 5 critical fixes required** |

---

## Pre-Production Action Items

### MUST FIX (block launch)

| # | Task | File |
|---|---|---|
| 1 | Add `auth.getUser()` verification to `sofinity-player-sync` instead of manual JWT decode | `supabase/functions/sofinity-player-sync/index.ts` |
| 2 | Add auth guard or delete `admin-create-test-user` | `supabase/functions/admin-create-test-user/index.ts` |
| 3 | Fix Promise assignment in `send_event_to_sofinity` error handler | `supabase/functions/send_event_to_sofinity/index.ts` |
| 4 | Replace `stripe-webhook` `SELECT/INSERT` with `INSERT ON CONFLICT DO NOTHING` | `supabase/functions/stripe-webhook/index.ts` |
| 5 | Verify `update_wallet_after_payment` trigger intent regarding `balance_vouchers` | Database trigger |

### SHOULD FIX (before launch)

| # | Task |
|---|---|
| 6 | Add `wallet_transactions` audit table for full balance traceability |
| 7 | Restrict CORS origins on all admin edge functions |
| 8 | Add dead-letter recovery for stuck `event_queue` items |
| 9 | Delete redundant key-rotation functions |
| 10 | Add auth rejection flow to clean up orphan auth users in `approve-partner-registration` |

### NICE TO HAVE (post-launch)

| # | Task |
|---|---|
| 11 | Rate-limit `purchase-ticket` per user (prevent rapid-fire purchases) |
| 12 | Add structured logging / monitoring to all edge functions |
| 13 | Create an automated scheduled job to run `tests/wallet-integrity-queries.sql` and alert on violations |

---

*Generated by Cursor AI — OneMil production hardening session 2026-03-15*
