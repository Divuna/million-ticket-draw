# OneMil — Performance Limits & Scaling Analysis
**Date:** 2026-03-15

---

## Current Architecture Throughput Estimate

Based on the locking and index strategy, estimated peak throughput for a 1M-ticket contest:

| Operation | Estimated Throughput | Bottleneck |
|-----------|---------------------|-----------|
| Ticket purchase | ~80–120 req/sec | Contest row FOR UPDATE |
| Wallet credit (Stripe webhook) | ~50–80 req/sec | Wallets table upsert |
| Bonus prize check | ~80–120 req/sec | Same as ticket purchase |
| Contest close | Single execution | Serialized by FOR UPDATE |
| Event forwarding | ~20–40 req/sec | Net HTTP calls in trigger |

---

## Bottleneck 1: `check_ticket_limit` Trigger — COUNT(*) on Every Purchase

**Impact: HIGH — removes ~30-40% of ticket purchase throughput**

Every ticket INSERT fires this BEFORE trigger:
```sql
SELECT COUNT(*) FROM tickets WHERE contest_id = new.contest_id;
```

With 500,000 tickets already sold in a 1M-ticket contest:
- PostgreSQL must count all 500,000 rows via the `idx_tickets_contest` index
- Estimated execution time: **15–40ms per purchase** just for this count
- At 100 concurrent purchases, this creates 100 simultaneous COUNT(*) queries

This is the single largest performance regression in the system. After adding `next_ticket_number` (migration 20260315220000), this trigger is 100% redundant.

**Fix:** `DROP TRIGGER enforce_ticket_limit ON public.tickets;`  
**Expected improvement:** +30-40% throughput

---

## Bottleneck 2: Ticket Table Write Amplification (7+ Triggers on INSERT)

Every `INSERT INTO tickets` fires these triggers:
1. `enforce_ticket_limit` (BEFORE) — COUNT(*) — expensive
2. `audit_tickets_trigger` (AFTER) — writes to `audit_logs`
3. `on_coin_redeemed` (AFTER) — writes to `event_logs`
4. `trg_check_bonus_prize_on_ticket` (AFTER) — reads bonus_prizes, may write to winners + bonus_prizes
5. `trg_close_contest_on_million_ticket` (AFTER) — conditional: updates contests + audit_logs + HTTP call
6. `trg_ticket_insert` (AFTER) — calls `fn_send_event_to_sofinity` — HTTP call to edge fn
7. `buy_ticket_atomic` itself — writes wallet, wallet_transactions, ticket, may write to winners

**Total writes per ticket purchase:** up to **6 table writes + 2 HTTP calls**  
HTTP calls in triggers are async (via `net.http_post`), but they still add overhead.

**Fix:** Remove redundant trigger #1. Audit triggers #3 and #6 for necessity.

---

## Bottleneck 3: Winners Table Write Amplification (9+ UNIQUE Indexes)

Every `INSERT INTO winners` must maintain these UNIQUE indexes:
1. `idx_winners_one_main_per_contest` (partial on type='main')
2. `ux_one_main_winner_per_contest` (identical to #1 — fully redundant)
3. `winners_unique_main` (partial on type='main' — near-duplicate)
4. `uniq_main_winner_per_contest` (partial on prize_id IS NULL)
5. `uniq_winner_main` (partial on type='main' AND prize_id IS NULL)
6. `idx_winners_one_per_bonus_prize` (partial, prize_id)
7. `uniq_winner_bonus` (partial, contest_id+prize_id)
8. `uniq_winner_per_prize` (partial, contest_id+prize_id WHERE prize_id NOT NULL)
9. `unique_contest_prize` (full, contest_id+prize_id)

For each winners INSERT, PostgreSQL must update **9 index trees**. Need only 2 (one for main, one for bonus).

**Fix:** Drop 7 redundant indexes. Keep only `idx_winners_one_main_per_contest` and `uniq_winner_bonus`.  
**Expected improvement:** ~50% faster winners INSERT

---

## Bottleneck 4: Event Pipeline — Synchronous HTTP Calls in Triggers

Multiple triggers call `net.http_post()` synchronously within the transaction:
- `forward_to_sofinity_trigger` on `event_logs` INSERT
- `trg_ticket_insert` on `tickets` INSERT  
- `trg_close_contest_on_million_ticket` on `tickets` INSERT
- `on_event_insert` on `event_forward_log` INSERT

`net.http_post()` in Supabase is fire-and-forget (non-blocking, using `pg_net`), so it does NOT block the transaction. However, each call still adds overhead for queueing the HTTP request, and errors are silently swallowed.

**Verified safe:** `pg_net` enqueues asynchronously. Transaction does not wait for HTTP response.

---

## Bottleneck 5: `wallet_transactions` Growing Unbounded

At launch with 1M ticket purchases, the `wallet_transactions` table will accumulate:
- 1M rows from ticket purchases
- Additional rows from payments, refunds, bonuses, vouchers

Without partitioning or archival, this table will exceed 10M+ rows after multiple contests. Queries joining `wallet_transactions` to `wallets` will degrade.

**Recommended:** Add BRIN index on `wallet_transactions.created_at` for time-range queries, and plan for quarterly archival after ~5M rows.

---

## Index Gap Analysis

### Tables Missing Useful Indexes

| Table | Column | Query Pattern | Recommendation |
|-------|--------|---------------|----------------|
| `winners` | `ticket_id` | FK ON DELETE SET NULL | Add `idx_winners_ticket_id WHERE ticket_id IS NOT NULL` |
| `winners` | `delivered` | Admin prize delivery workflow | Add `idx_winners_undelivered WHERE delivered=false` |
| `payments` | `status` | Admin dashboard filters | Add `idx_payments_status` |
| `notifications` | `status` | Push delivery queue | Add `idx_notifications_status_created` |
| `event_logs` | `user_id` | User event history | Add `idx_event_logs_user_id` |
| `event_logs` | `event_name` | Analytics queries | Add `idx_event_logs_event_name` |
| `bonus_prizes` | `status` | `buy_ticket_atomic` WHERE status='pending' | Already covered by (contest_id, ticket_position) unique index |

---

## Scaling Projections

### Ticket Table

| Tickets Sold | Table Size (est.) | `check_ticket_limit` COUNT time | Notes |
|-------------|-------------------|--------------------------------|-------|
| 100,000 | ~8 MB | ~2ms | Fast |
| 500,000 | ~40 MB | ~15ms | Noticeable |
| 1,000,000 | ~80 MB | ~40ms | Unacceptable |

**Conclusion:** Remove `check_ticket_limit` trigger immediately. At 1M tickets (the design goal), it adds 40ms to every purchase.

### Wallet Transactions Table

| Purchases | Rows | Table Size | `SUM(amount)` scan time |
|-----------|------|-----------|------------------------|
| 100K | ~150K | ~15 MB | ~20ms |
| 1M | ~1.5M | ~150 MB | ~200ms |
| 5M | ~7.5M | ~750 MB | ~1s+ |

Plan: Add `balance_after` (already present) for O(1) balance lookups; don't use SUM.

---

## Lock Contention Analysis

`buy_ticket_atomic` holds `FOR UPDATE` lock on the contest row for the duration of:
1. Wallet balance check and deduction
2. Ticket number increment
3. Ticket INSERT (and all 7 triggers)
4. Ledger write
5. Bonus prize check and winner creation
6. Potential contest close

**Lock hold time estimate:** 5–25ms per purchase (depending on trigger overhead)  
**Max throughput at this lock hold time:** 40–200 purchases/sec per contest

This is the fundamental serialization limit. With current trigger overhead (especially `check_ticket_limit`), effective throughput is closer to 40–80/sec.

**After removing `check_ticket_limit`:** Should approach 120–200/sec.

For true high concurrency (thousands/sec), a queue-based architecture would be needed.
