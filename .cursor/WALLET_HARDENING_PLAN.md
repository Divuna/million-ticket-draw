# OneMil — Wallet Hardening Plan
**Date:** 2026-03-15  
**Status:** PLAN ONLY — migration SQL prepared, not applied  
**Migration file:** `supabase/migrations/20260315200000_wallet_hardening.sql`

---

## Current Risks

### Risk 1 — CRITICAL: Double credit on every Stripe payment

**Trigger:** `update_wallet_after_payment`  
**Also in:** `admin_manage_payment` (refund operation)

```sql
-- CURRENT (buggy):
ON CONFLICT (user_id) DO UPDATE
  SET balance_coins    = wallets.balance_coins    + new.amount,
      balance_vouchers = wallets.balance_vouchers + new.amount;  -- ← BOTH get credited
```

Every Stripe payment of N MioCoins credits the user with:
- `+N` to `balance_coins` (used to buy tickets)
- `+N` to `balance_vouchers` (used to redeem physical vouchers)

`balance_vouchers` is a separate, independently spendable currency (`redeem_voucher` debits it, `buy_voucher_atomic` checks it). **Every Stripe payment effectively grants double value.** `admin_manage_payment` has the same pattern in its refund path.

---

### Risk 2 — HIGH: Stripe webhook SELECT-before-INSERT race condition

**File:** `supabase/functions/stripe-webhook/index.ts`

```typescript
// CURRENT — TOCTOU pattern:
const { data: existingPayment } = await supabase.from('payments')
  .select('id').eq('stripe_session_id', session.id).maybeSingle()

if (existingPayment) return  // ← two concurrent calls can both reach here as null
await supabase.from('payments').insert({ stripe_session_id: session.id, ... })
```

Under concurrent Stripe webhook delivery (Stripe retries after any non-2xx), two calls can both pass the `SELECT` check with `null`, then both attempt `INSERT`. The second insert will throw a unique constraint violation (PostgreSQL error `23505`), causing a 500 return which causes Stripe to retry indefinitely — creating a retry storm.

A `UNIQUE` constraint on `stripe_session_id` exists: `payments_stripe_session_id_key`. The application is not exploiting it.

---

### Risk 3 — MEDIUM: No wallet_transactions ledger

`wallet_transactions` table does not exist. The wallet balance is a running total with no append-only history. This means:
- No independent audit trail
- Balance discrepancies cannot be traced to a root cause
- Regulatory compliance (any financial audit) cannot be supported
- Debugging wallet bugs requires reading multiple tables across multiple functions

---

### Risk 4 — MEDIUM: `deduct_wallet_for_refund` silently truncates

```sql
UPDATE wallets
SET balance_coins = GREATEST(0, balance_coins - p_amount)  -- silent floor at 0
WHERE user_id = p_user_id
```

If a user has 5 coins and the refund deduction is 100, the balance becomes 0 instead of -95. The Stripe refund has already been issued, but the wallet tracks only the clamped value. This creates an unrecorded discrepancy that is invisible without a ledger.

---

### Risk 5 — LOW: Two duplicate `transfer_bonus_to_main` functions

- `transfer_bonus_to_main` — writes to `bonus_transfer_history`
- `transfer_all_bonus_to_main_wallet` — does NOT write history

Inconsistent audit behavior. `transfer_all_bonus_to_main_wallet` is the newer version (no deprecated marker) but is less auditable.

---

### Risk 6 — LOW: `try_credit_wallet_mc` (2-arg) uses dynamic SQL

The 2-argument variant uses `EXECUTE format(...)` with schema introspection at call time. This is:
- Slower than a direct statement
- Does not trigger referral rewards (unlike the 3-arg version)
- No clear delineation of which callers use which version

---

## Complete Wallet Change Inventory

| Function / Trigger | Direction | Column(s) | Context | Bug? |
|---|---|---|---|---|
| `update_wallet_after_payment` (trigger) | Credit | `balance_coins`, `balance_vouchers` | Stripe payment | **Double credit** |
| `admin_manage_payment` (refund path) | Credit | `balance_coins`, `balance_vouchers` | Admin refund | **Double credit** |
| `buy_ticket_atomic` | Debit | `balance_coins` | Ticket purchase | OK |
| `buy_voucher_atomic` | Debit | `balance_coins` | Voucher purchase | OK |
| `deduct_wallet_for_refund` | Debit | `balance_coins` | Stripe refund | Silent truncation |
| `claim_miocoin_bonus` | Credit | `balance_coins` | Bonus MioCoin claim | OK |
| `on_bonus_winner_add_to_bonus_wallet` (trigger) | Credit | `bonus_balance_coins` | Bonus win | OK |
| `redeem_voucher` | Debit | `balance_vouchers` | Voucher redemption | OK |
| `try_credit_wallet_mc` (3-arg) | Credit | `balance_coins` | Partner / admin credit | OK |
| `try_credit_wallet_mc` (2-arg) | Credit | `balance_coins` | Legacy path | No referral trigger |
| `transfer_bonus_to_main` | Transfer | `bonus→coins` | User action | OK, writes history |
| `transfer_all_bonus_to_main_wallet` | Transfer | `bonus→coins` | User action | **No history written** |

---

## Required Schema Changes

### 1. Create `wallet_transactions` table

Append-only ledger. Rows are never updated or deleted.

```
wallet_transactions
├── id             uuid PK
├── user_id        uuid FK → auth.users (indexed)
├── wallet_id      uuid FK → wallets.id (indexed)
├── amount         numeric  (positive = credit, negative = debit)
├── balance_after  numeric  (wallet balance immediately after this transaction)
├── type           text     (see enum below)
├── source         text     (which function/trigger created this row)
├── reference_id   uuid     (payments.id, tickets.id, bonus_prizes.id, etc.)
├── metadata       jsonb    (any extra context — idempotency key, stripe_session_id, etc.)
└── created_at     timestamptz DEFAULT now()
```

**Type enum values:**

| type | Direction | Description |
|---|---|---|
| `payment_credit` | + | Stripe payment credited to wallet |
| `voucher_credit` | + | Voucher balance credited (balance_vouchers) |
| `ticket_purchase` | − | Ticket bought with MioCoins |
| `voucher_purchase` | − | Voucher bought with MioCoins |
| `bonus_claim` | + | MioCoin bonus prize claimed |
| `bonus_stage` | + | Bonus won → staged to bonus_balance_coins |
| `bonus_transfer` | + | bonus_balance_coins transferred to balance_coins |
| `refund_debit` | − | MioCoins deducted after Stripe refund |
| `admin_refund_credit` | + | Admin-issued refund credit |
| `admin_credit` | + | Direct admin wallet credit |
| `partner_credit` | + | Partner API MioCoin issuance |
| `voucher_redeem_debit` | − | balance_vouchers spent on voucher redemption |

### 2. Fix `update_wallet_after_payment` trigger

- Stop crediting `balance_vouchers` from Stripe payments (coins and vouchers are different currencies)
- Write a ledger entry on every credit

### 3. Fix `admin_manage_payment` refund path

- Stop crediting `balance_vouchers` from admin refunds
- Write a ledger entry

### 4. Fix Stripe webhook to use atomic `INSERT ON CONFLICT`

Edge function change (not SQL). Replace the SELECT-then-INSERT pattern:

```typescript
// PROPOSED — safe, atomic, idempotent:
const { error, count } = await supabase.from('payments').insert({
  user_id: userId,
  amount: coinsToCredit,
  method: 'stripe',
  status: 'completed',
  stripe_session_id: session.id,
}, { count: 'exact' })

if (error?.code === '23505') {
  // Already processed — safe to return 200
  return new Response(JSON.stringify({ received: true, message: 'Already processed' }), { status: 200 })
}
if (error) throw error
```

### 5. Add catch-all ledger trigger on `wallets`

As a safety net, a trigger fires on any `UPDATE` to the `wallets` table that modifies a balance column. This captures any direct updates that bypass function logic and ensures no wallet change is ever unlogged.

---

## Migration SQL (DO NOT APPLY YET)

**File:** `supabase/migrations/20260315200000_wallet_hardening.sql`

See the SQL file at the path above for the complete migration.

---

## Migration Deployment Order

This migration is a single file designed to deploy atomically in one transaction.

1. **Run `20260315200000_wallet_hardening.sql`** — creates table, fixes functions, adds trigger
2. **Deploy updated `stripe-webhook` edge function** — replace SELECT-before-INSERT
3. **Verify with `wallet-integrity-queries.sql` Section 1 and 2**
4. **Spot-check 5 recent payments** to confirm ledger entries were created

---

## What This Migration Does NOT Change

- No table renames, no column renames
- No RLS policy modifications
- No changes to `tickets`, `winners`, `bonus_prizes`, `contests`
- No changes to `buy_ticket_atomic` or `close_contest` (already hardened)
- No `balance_vouchers` column removal (kept as-is, just not credited from payments)
