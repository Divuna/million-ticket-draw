# Database safety audit – OneMil contest engine

**Scope:** Supabase schema, migrations, triggers, and constraints for contests, tickets, bonus_prizes, winners, wallets, payments.  
**No code or SQL was modified.**

---

## 1. Database constraints protecting the system

| Constraint / mechanism | Location | What it protects |
|------------------------|----------|-------------------|
| **contests_status_check** | `20250924065345` | `contests.status` restricted to `'pending'`, `'active'`, `'closed'`. |
| **idx_payments_stripe_session_id_unique** | `20250914180416`, `20250914180023`, `20250914180230` | Partial unique index on `payments(stripe_session_id)` WHERE `stripe_session_id IS NOT NULL`. Prevents duplicate payment rows per Stripe session and thus duplicate wallet credit from the same webhook. |
| **wallets: ON CONFLICT (user_id)** | Used in `update_wallet_after_payment` and `handle_new_auth_user` | One row per user in `wallets` (unique on `user_id`). |
| **wallets_balance_coins_non_negative** | `20260315140000` | CHECK `(balance_coins >= 0)` added with **NOT VALID**; not enforced on existing rows until validated. |
| **trg_update_wallet_after_payment** | `20250914163051` | AFTER INSERT on `payments`; runs `update_wallet_after_payment()`. Credits wallet only when `new.status = 'completed'`. |
| **Winner_status_history FK** | `20251217143928` | `winner_status_history.winner_id` REFERENCES `winners(id)` ON DELETE CASCADE. |
| **user_contest_favorites UNIQUE(user_id, contest_id)** | `20251126192849` | One favorite per user per contest (reference only). |
| **buy_ticket_atomic locking** | `20260315130000` | Contest row locked with `FOR UPDATE` before reading ticket count and next number; wallet row locked with `FOR UPDATE` before deducting. Serializes ticket creation and balance deduction per contest and per user. |
| **Stripe webhook idempotency** | `stripe-webhook/index.ts` | Application checks for existing payment by `stripe_session_id` before insert; DB unique index prevents a second insert if the check is skipped or raced. |

---

## 2. Missing constraints

| Missing constraint | Table(s) | Risk |
|--------------------|----------|------|
| **Ticket number uniqueness per contest** | `tickets` | No `UNIQUE(contest_id, number)` (or equivalent) in migrations. Uniqueness is enforced only by `buy_ticket_atomic` (contest lock + `COALESCE(MAX(number),0)+1`). Direct inserts or a bug could create duplicate `(contest_id, number)`. |
| **One main winner per contest** | `winners` | No partial unique index or constraint enforcing at most one row with `type = 'main'` per `contest_id`. Duplicate main winners are possible under the `close_contest` race (see below). |
| **One winner per bonus prize** | `winners` | No unique constraint on `prize_id` for bonus winners (e.g. `UNIQUE(prize_id)` WHERE `type = 'bonus'` and `prize_id IS NOT NULL`). Logic in `buy_ticket_atomic` assigns each bonus at most once; no DB-level guarantee. |
| **Bonus position uniqueness per contest** | `bonus_prizes` | No `UNIQUE(contest_id, ticket_position)`. Admin logic in `insert_or_update_bonus_prize` checks by `EXISTS` before insert; direct inserts could create duplicate positions. |
| **Winner must reference valid ticket (for main)** | `winners` | `close_contest` inserts `ticket_id` into `winners`; `buy_ticket_atomic` inserts main winner without `ticket_id`. No FK from `winners.ticket_id` to `tickets.id` found in migrations; winner rows can reference deleted or invalid tickets, or main winners may have no ticket reference. |
| **Wallet CHECK validated** | `wallets` | `wallets_balance_coins_non_negative` is NOT VALID; existing rows are not enforced. Negative balances can remain until `VALIDATE CONSTRAINT` is run (and any negatives fixed). |

---

## 3. Guarantee verification

| Guarantee | Status | Notes |
|-----------|--------|--------|
| **1. Ticket numbers unique within each contest** | **Not enforced by DB** | Only by application: `buy_ticket_atomic` uses contest lock and `MAX(number)+1`. No `UNIQUE(contest_id, number)`. |
| **2. Each prize has only one winner** | **Not enforced by DB** | Main: no constraint (one main per contest). Bonus: one row per `bonus_prizes.id` in `winners` by logic only; no unique on `prize_id` or `(contest_id, type)` for main. |
| **3. Winner cannot exist without a valid ticket** | **Not enforced** | Main winner can be created with `ticket_id` (close_contest) or without (buy_ticket_atomic last-ticket path). No FK `winners.ticket_id` → `tickets.id`; ticket can be missing or invalid. |
| **4. Wallet balances cannot become inconsistent** | **Partially protected** | Deduction path: `buy_ticket_atomic` locks wallet and updates in one transaction. Credit path: one payment row per session (unique index), trigger credits once per insert. CHECK `balance_coins >= 0` exists but is NOT VALID; refund path uses `GREATEST(0, ...)` in `deduct_wallet_for_refund`. No DB guarantee that balance equals sum of movements. |
| **5. Contest cannot generate tickets after closed** | **Enforced by application only** | `buy_ticket_atomic` checks `status = 'active'` under contest lock. No DB trigger or constraint prevents inserting a ticket for a contest with `status = 'closed'`. |
| **6. Duplicate payment callbacks cannot create duplicate tickets** | **N/A (payments do not create tickets)** | Tickets are created only by `buy_ticket_atomic` (user spends MioCoin). Payment webhook only inserts into `payments`; trigger credits wallet. Duplicate webhook for same session cannot insert a second payment row (unique on `stripe_session_id`), so wallet is not double-credited. |

---

## 4. Potential race conditions

| Location | Description |
|----------|-------------|
| **close_contest** | Status is read **before** `FOR UPDATE`. Two concurrent callers can both see `status <> 'closed'`. One acquires lock, inserts main winner, sets `status = 'closed'`. The other then acquires the lock but **does not re-read status or check for an existing main winner** and can insert a second main winner. Documented in `.cursor/CONTEST_ENGINE_AUDIT.md`. |
| **update_wallet_after_payment** | Trigger runs once per INSERT. Duplicate INSERT for the same Stripe session is prevented by unique index on `stripe_session_id`, so no double-credit race from duplicate payments. |
| **buy_ticket_atomic** | Contest and wallet are locked; ticket number is derived under contest lock. No race for duplicate ticket numbers or double deduction from this function; races only if other code inserts tickets or updates wallets without the same locking. |

---

## 5. Potential duplicate winner scenarios

| Scenario | Cause | DB prevention |
|----------|--------|----------------|
| **Two main winners for one contest** | Concurrent `close_contest` calls: both pass the pre-lock status check, then one inserts main winner and closes; the other, after acquiring the lock, does not re-check and inserts again. | None. No unique constraint on “one main winner per contest”. |
| **Main winner from close_contest and from buy_ticket_atomic** | Contest closes when last ticket is sold in `buy_ticket_atomic` (it inserts main winner and sets status). If `close_contest` is also invoked (e.g. manual close) and wins the race or runs after a bug, two main winners. | None. |
| **Two bonus winners for same bonus_prize** | Only if application logic is bypassed or bugged; `buy_ticket_atomic` assigns each bonus at most once per ticket number and sets `bonus_prizes.status = 'won'`. | No unique on `winners(prize_id)` for bonus type. |
| **Main winner with no ticket** | `buy_ticket_atomic` inserts main winner with only `contest_id`, `user_id`, `type`, `notes` (no `ticket_id`). Allowed by current schema. | Not a duplicate; semantic gap (winner without ticket reference). |

---

## 6. Summary

- **Protected today:** Contest status enum; one payment per Stripe session; one wallet per user; trigger-based wallet credit on completed payment; non-negative balance CHECK (not yet validated); serialized ticket purchase and wallet deduction in `buy_ticket_atomic`.
- **Gaps:** No DB-level uniqueness for ticket numbers per contest; no “one main winner per contest”; no “one winner per bonus prize”; no uniqueness for bonus positions per contest; no FK or rule tying main winners to a valid ticket; wallet CHECK not validated; no DB-level block on tickets for closed contests.
- **Races:** `close_contest` can produce duplicate main winners; no other critical races identified for payments or ticket creation when using the defined functions.
- **Duplicate winner mitigation:** Add partial unique index on `winners(contest_id)` WHERE `type = 'main'` and fix `close_contest` to re-check status and existing main winner after lock (see `.cursor/CONTEST_ENGINE_AUDIT_FIXES_PATCHES.md`).
