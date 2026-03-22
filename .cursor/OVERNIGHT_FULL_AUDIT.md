# OneMil — Overnight Full Technical Audit
**Date:** 2026-03-15 | **Scope:** Full backend, database, edge functions, triggers, indexes

---

## 1. What Was Inspected

- 57 public tables (schema, columns, constraints, indexes)
- 44 edge functions (authentication, logic, error handling)
- 62 database triggers across all tables
- All PL/pgSQL stored functions (buy_ticket_atomic, close_contest, wallet functions, event handlers)
- All migration files (20260315120000 through 20260315230000)
- Frontend hooks and components touching wallet/ticket/payment flows
- RLS policies on critical tables
- Index inventory for duplicates and gaps

---

## 2. CRITICAL BUGS

### BUG-01 — Dual Bonus Prize Handling: Response Always Incorrect

**Severity:** CRITICAL  
**Affected:** `buy_ticket_atomic` + `fn_check_bonus_prize` trigger on `tickets`

**What happens:**
When a user buys a ticket that lands on a bonus prize position, BOTH paths execute:

1. `buy_ticket_atomic` executes `INSERT INTO tickets` (step 1)
2. AFTER INSERT trigger `fn_check_bonus_prize` fires **immediately and synchronously**:
   - Finds the `bonus_prizes` row with `status = 'pending'`
   - Inserts the `winners` row with `type='bonus'`
   - Updates `bonus_prizes.status = 'won'`
3. `buy_ticket_atomic` resumes, queries `bonus_prizes WHERE status = 'pending'` — finds **NOTHING** (already set to 'won' by trigger)
4. Function returns `won_prize: null` — **wrong response**

**Result:** The user wins a bonus prize but the UI is never told. The `TicketResultModal` never shows the bonus win. The UNIQUE constraint on `winners` prevents a duplicate row, but the **business response is incorrect on every single bonus win**.

The `on_bonus_winner_add_to_bonus_wallet` trigger fires correctly (triggered by the winners INSERT), so the wallet credit IS written — but silently. The response to the user is wrong.

---

### BUG-02 — `purchase-ticket` Edge Function Broken (Service Role + auth.uid() Mismatch)

**Severity:** CRITICAL  
**Affected:** `supabase/functions/purchase-ticket/index.ts`

**What happens:**
```typescript
const supabase = createClient(url, SUPABASE_SERVICE_ROLE_KEY);  // service role
// ...
supabase.rpc("buy_ticket_atomic", { p_contest_id, p_user_id });  // service role JWT
```

`buy_ticket_atomic` contains:
```sql
IF p_user_id IS DISTINCT FROM auth.uid() THEN
  RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
END IF;
```

When called via service role, `auth.uid()` = `NULL` (service role JWT has no `sub` claim).  
`p_user_id IS DISTINCT FROM NULL` → **always TRUE** → always returns `"Unauthorized"`.

**Result:** This edge function CANNOT successfully purchase any ticket. It is effectively dead code. The frontend is likely calling `buy_ticket_atomic` directly via the anon client (user JWT), bypassing this function entirely.

**Risk:** If any client routes through this edge function expecting it to work, purchases silently fail.

---

### BUG-03 — Hardcoded Sofinity API Bearer Token in pg_proc

**Severity:** CRITICAL (Security)  
**Affected:** `forward_event_to_sofinity(jsonb)` function in `pg_proc`

```sql
'Authorization','Bearer DPmjiD06Fnxp20nB76SRQW3get7o0nFKhFSK02SBSsz33XmTi83XfkqRh8m4xfw0'
```

This token is stored in plaintext in a database function visible to anyone with access to `pg_proc` (all Supabase dashboard users, any admin). The token should be stored in Supabase Vault or as a `pg_settings` variable (`current_setting`), not hardcoded.

---

## 3. HIGH SEVERITY ISSUES

### H-01 — Triple Voucher Trigger Firing (Event Flood)

**Severity:** HIGH  
**Affected:** `vouchers` table

Three separate triggers call `trg_voucher_purchased()` on `AFTER INSERT`:
- `after_voucher_insert`
- `trg_voucher_purchased`
- `trg_voucher_purchased_insert`

Two separate triggers call it on `AFTER UPDATE`:
- `trigger_voucher_purchased`
- `trg_voucher_purchased_update_user`

**Result:** Every voucher creation sends **3 Sofinity events**. Every voucher update sends **2 Sofinity events**. This pollutes analytics and may cause rate limiting.

---

### H-02 — Duplicate auth.users Trigger (Double User Bootstrap)

**Severity:** HIGH  
**Affected:** `auth.users` table

Two triggers both call `handle_new_auth_user` on `AFTER INSERT`:
- `on_auth_user_created`
- `trigger_handle_new_auth_user`

`handle_new_auth_user` creates a `profiles` row and a `wallets` row. Both use `ON CONFLICT DO NOTHING`, so data integrity is preserved — but the function executes twice per signup. Additionally, two more triggers insert into `user_roles`:
- `on_auth_user_created_role` → `handle_new_user_role` 
- `trg_handle_new_user_roles` → `handle_new_user_roles`

This means 5 triggers fire on every signup, with 2 duplicate executions.

---

### H-03 — `close_contest_on_million_ticket` Trigger Is Incomplete

**Severity:** HIGH  
**Affected:** `tickets` table trigger, contest closing flow

The trigger fires when `new.number = 1000000` and sets `contests.status = 'closed'`, but does **NOT create a main winner**. The main winner is created by `buy_ticket_atomic` separately. This split logic means:

- If `buy_ticket_atomic` creates ticket #1,000,000, the trigger fires, sets status='closed', then `buy_ticket_atomic` continues and creates the winner. **This is correct.**
- If ticket #1,000,000 is ever inserted by any other path (admin direct insert, migration), the contest status is set to 'closed' but **NO main winner is created**.
- The trigger hardcodes `1000000`. If `ticket_count` is ever changed, the trigger no longer fires at the correct moment.

---

## 4. MEDIUM SEVERITY ISSUES

### M-01 — Redundant `check_ticket_limit` Trigger (Performance)

**Affected:** `tickets` table BEFORE INSERT  
`check_ticket_limit` performs `SELECT COUNT(*) FROM tickets WHERE contest_id = new.contest_id` on every ticket purchase. With 1M tickets per contest, this becomes an expensive full COUNT on a large table. `buy_ticket_atomic` already enforces capacity via `next_ticket_number > ticket_count`. This trigger is redundant and adds significant latency.

---

### M-02 — Massive Index Redundancy on `winners`

At least **9 UNIQUE indexes** on the `winners` table, with heavy overlaps:

For main winner constraint, these overlap:
- `idx_winners_one_main_per_contest`: `UNIQUE (contest_id) WHERE type='main'`
- `ux_one_main_winner_per_contest`: `UNIQUE (contest_id) WHERE type='main'` ← **exact duplicate**
- `winners_unique_main`: `UNIQUE (contest_id, type) WHERE type='main'` ← near-duplicate
- `uniq_main_winner_per_contest`: `UNIQUE (contest_id) WHERE prize_id IS NULL` ← different semantics
- `uniq_winner_main`: `UNIQUE (contest_id) WHERE type='main' AND prize_id IS NULL` ← overlaps above

For bonus winner constraint:
- `idx_winners_one_per_bonus_prize`: `UNIQUE (prize_id) WHERE type='bonus' AND prize_id IS NOT NULL`
- `uniq_winner_bonus`: `UNIQUE (contest_id, prize_id) WHERE type='bonus' AND prize_id IS NOT NULL`
- `uniq_winner_per_prize`: `UNIQUE (contest_id, prize_id) WHERE prize_id IS NOT NULL`
- `unique_contest_prize`: `UNIQUE (contest_id, prize_id)` ← no WHERE clause

**Impact:** Every `INSERT INTO winners` must maintain all 9+ indexes. Write amplification ≈ 4-5x necessary.

---

### M-03 — Redundant UNIQUE Indexes on `bonus_prizes`

Three UNIQUE indexes for (contest_id, ticket_position):
- `bonus_prizes_unique_position`
- `idx_bonus_prizes_contest_position_unique` ← exact duplicate
- `bonus_prizes_unique_miocoin_pos` ← partial: `WHERE amount > 0` (different semantics but subset)

---

### M-04 — `user_roles` UNIQUE(user_id) Prevents Multiple Roles

Index `user_roles_user_id_unique` enforces `UNIQUE (user_id)`, meaning a user can only have ONE role. The table structure implies multi-role support (separate `user_id, role` rows with `UNIQUE (user_id, role)`), but this constraint contradicts it. If you ever need admin+partner for the same user, this breaks.

---

### M-05 — Missing Index on `bonus_prizes.status`

`buy_ticket_atomic` queries:
```sql
SELECT * FROM bonus_prizes WHERE contest_id = ? AND ticket_position = ? AND status = 'pending'
```
There is a `btree(contest_id)` index but no compound index on `(contest_id, ticket_position)` or `(contest_id, ticket_position, status)`. This scan becomes expensive if a contest has thousands of bonus prizes.

Actually `bonus_prizes_unique_position` covers `(contest_id, ticket_position)` as a unique index, which PostgreSQL can use for this query. But adding `status` to the index predicate would make it more efficient as a partial index. **Lower priority.**

---

### M-06 — `next_ticket_number` Has No Upper Bound Constraint

`contests.next_ticket_number` has `CHECK (next_ticket_number >= 1)` but no `CHECK (next_ticket_number <= ticket_count + 1)`. If `buy_ticket_atomic` has a logic error, the counter could exceed `ticket_count` indefinitely. The constraint enforcement relies entirely on the function logic.

---

### M-07 — `fn_send_event_to_sofinity` Contains Empty/Comment Logic

```sql
-- logika podle tabulek (tickets, prizes, contests) ...
-- ...
IF v_event_name IS NOT NULL THEN
  PERFORM net.http_post(...)
END IF;
```

`v_event_name` is never assigned (the assignment logic is commented out). This means the function **always sends NULL** and the HTTP call is never made. Tickets, prizes, and contest events via this path are silently swallowed.

---

## 5. LOW SEVERITY ISSUES

### L-01 — Duplicate Indexes on `influencer_referrals.user_id`
- `influencer_referrals_user_id_key` and `influencer_referrals_user_id_uniq` are identical UNIQUE indexes on `user_id`.

### L-02 — Duplicate Indexes on `payments.stripe_session_id`
- `payments_stripe_session_id_key`: UNIQUE (stripe_session_id) — all rows
- `idx_payments_stripe_session_id_unique`: UNIQUE (stripe_session_id) WHERE NOT NULL — partial
Both enforce effectively the same constraint (PostgreSQL's UNIQUE allows multiple NULLs anyway).

### L-03 — Duplicate user_id Index on `payments`
- `idx_payments_user` and `idx_payments_user_id` are identical indexes on `payments(user_id)`.

### L-04 — `create-contest` Hardcodes Admin Email
`close-contest/index.ts` checks `users.role IN ('admin','superadmin')` correctly, but `create-contest/index.ts` checks against hardcoded email `divispavel2@gmail.com`. Inconsistent and fragile.

### L-05 — Disabled Event Queue Triggers (Dead Code)
Three triggers on `event_queue` are **DISABLED** (`tgenabled='D'`):
- `onemil_messages_forward_to_sofinity`
- `process_event_queue_message_trigger`
- `trigger_debug_event_log`

These represent abandoned code paths. Should be removed to avoid confusion.

### L-06 — `contests.ticket_count` Hardcoded to 1,000,000
`CHECK (ticket_count = 1000000)` prevents creating test contests with smaller ticket counts. Limits flexibility for future contest types.

### L-07 — Missing `winners.ticket_id` Index
`winners.ticket_id` is a FK to `tickets.id` with `ON DELETE SET NULL` but has no B-tree index. FK lookups and queries joining winners to tickets will full-scan the winners table.

### L-08 — `profiles` Has Both `id` and `user_id` Columns
`profiles.id` is the PK (mapped from auth.users.id), and `profiles.user_id` is a separate nullable FK. This creates two paths to the same user and potential confusion. The `profiles_user_id_idx` unique index exists on `user_id`, but `user_id` is nullable — so rows with `user_id = NULL` are also valid.

### L-09 — `_messages_policies_backup` Leftover Table
The table `_messages_policies_backup` appears to be a temporary backup from an RLS migration. It has no purpose in production and should be dropped.

### L-10 — `deno.land/std@0.168.0` Pinned Old Version
All edge functions import from `deno.land/std@0.168.0/http/server.ts`. Current Deno std is ≥0.220. Outdated import, though functional.

---

## 6. Safe Parts Confirmed

- `buy_ticket_atomic`: Contest row locking (FOR UPDATE), capacity enforcement, atomic counter increment, wallet deduction, ticket insert, ledger write — all correct.
- `close_contest`: Row-level lock, idempotency check for existing winner — correct.
- `wallet_transactions` ledger: Immutable (UPDATE/DELETE blocked by triggers), correct RLS.
- Stripe webhook idempotency: UNIQUE on `payments.stripe_session_id` prevents double-credit.
- `wallets.balance_coins >= 0`: CHECK constraint validated.
- `tickets(contest_id, number)`: Single canonical UNIQUE constraint `tickets_contest_id_number_key` in place.
- UNIQUE bonus prize positions: `bonus_prizes_unique_position` enforced.
- UNIQUE main winner per contest: `idx_winners_one_main_per_contest` enforced.

---

## 7. Summary Table

| ID | Severity | Issue | Impact |
|----|----------|-------|--------|
| BUG-01 | CRITICAL | Dual bonus prize handling — wrong response | UI never shows bonus win |
| BUG-02 | CRITICAL | purchase-ticket edge function broken (service role) | Edge function is dead code |
| BUG-03 | CRITICAL | Hardcoded Sofinity token in pg_proc | Security: token exposed |
| H-01 | HIGH | Triple voucher trigger | 3x Sofinity event flood |
| H-02 | HIGH | Duplicate auth.users triggers | 2x user bootstrap on signup |
| H-03 | HIGH | Incomplete close trigger (no winner) | Missing winner on non-function path |
| M-01 | MEDIUM | Redundant check_ticket_limit trigger | COUNT(*) on every purchase |
| M-02 | MEDIUM | 9+ redundant UNIQUE indexes on winners | 4-5x write amplification |
| M-03 | MEDIUM | Redundant indexes on bonus_prizes | Write amplification |
| M-04 | MEDIUM | UNIQUE(user_id) on user_roles | Multi-role impossible |
| M-05 | MEDIUM | No compound index on bonus_prizes status | Slow queries at scale |
| M-06 | MEDIUM | next_ticket_number has no upper bound | Counter overflow possible |
| M-07 | MEDIUM | fn_send_event_to_sofinity logic commented out | Events silently dropped |
| L-01..L-10 | LOW | Various duplicate indexes and dead code | Performance and maintenance |
