# Contest engine logic – audit report (problems only)

**Scope:** Tickets creation, winner selection, prizes assignment, duplicate-winner prevention, wallet/MioCoin consistency.  
**No code was modified.**

---

## 1. Duplicate main winners (close_contest race)

**Location:** `close_contest` in `supabase/migrations/20260315140000_audit_improvements_close_wallet.sql`.

**Problem:** Status is read **before** acquiring the contest lock. Two concurrent calls can both see `status <> 'closed'`, then one acquires the lock, inserts a main winner, and sets `status = 'closed'`. The other then acquires the lock but **never re-checks status** and proceeds to pick a random ticket and insert a second main winner. Result: **two main winners for the same contest**.

**Relevant code:**  
- `select status into v_status from contests where id = p_contest_id` (no lock).  
- `if v_status = 'closed' then return;`  
- `perform 1 from contests where id = p_contest_id for update;`  
- Then `select * into v_ticket from tickets ... order by random() limit 1` and `insert into winners ...`.

There is no re-read of `status` after `for update` and no check for an existing main winner (e.g. `EXISTS (SELECT 1 FROM winners WHERE contest_id = p_contest_id AND type = 'main')`).

---

## 2. No DB-level prevention of duplicate main winners

**Location:** `winners` table and `close_contest` / `buy_ticket_atomic`.

**Problem:** There is no unique constraint (or equivalent) enforcing “at most one main winner per contest” (e.g. `UNIQUE (contest_id) WHERE type = 'main'` or a partial unique index). Duplicate main winners are only prevented by correct, serialized use of `close_contest` and by `buy_ticket_atomic` closing the contest when the last ticket is sold. Given the race in §1, duplicates are possible and are not rejected by the database.

---

## 3. redeem_miocoin does not credit the wallet

**Location:** `redeem_miocoin` in `supabase/migrations/20260315130000_security_fix_buy_and_redeem.sql`.

**Problem:** The function only updates `bonus_prizes.status` to `'won'`. It does **not** add `bonus_prizes.amount` (or any MioCoin) to `wallets.balance_coins` for the winner. So “redeem” does not increase the user’s MioCoin balance. If the product intent is that redeeming a MioCoin bonus should credit the wallet, that behavior is missing and wallet/MioCoin consistency is broken for this path.

---

## 4. Wallet CHECK constraint not validated

**Location:** `wallets.balance_coins` and migration `20260315140000_audit_improvements_close_wallet.sql`.

**Problem:** The constraint `wallets_balance_coins_non_negative` is added with `NOT VALID`, so existing negative balances are not checked. Until `ALTER TABLE public.wallets VALIDATE CONSTRAINT wallets_balance_coins_non_negative` is run (after fixing any negative balances), the DB does not enforce non-negative balances on existing rows, and legacy or bug-induced negatives can remain.

---

## 5. close_contest with zero tickets

**Location:** `close_contest` (same migration as §1).

**Problem:** If the contest has no tickets, the function sets the contest to `closed` and returns without inserting any winner. That is consistent but means “main winner” is missing. The edge function / UI may assume there is always a main winner when status is closed; callers should handle “closed with no tickets” (no main winner row).

---

## Summary table

| # | Area                     | Problem                                                                 |
|---|--------------------------|-------------------------------------------------------------------------|
| 1 | Winner selection         | close_contest race can create two main winners (no re-check after lock) |
| 2 | Duplicate winners        | No DB constraint limiting one main winner per contest                  |
| 3 | Prizes / wallet          | redeem_miocoin does not credit balance_coins for the bonus amount      |
| 4 | Wallet consistency       | CHECK balance_coins >= 0 is NOT VALID; not yet validated                |
| 5 | Edge case                | close_contest with 0 tickets leaves no main winner (callers must handle)|

**What was not reported as problems (for clarity):**  
- Ticket creation in `buy_ticket_atomic` is serialized by contest lock; next ticket number is derived under that lock.  
- Bonus assignment in `buy_ticket_atomic` is per ticket number under the same lock; no duplicate bonus assignment observed.  
- Wallet deduction in `buy_ticket_atomic` uses row lock (`FOR UPDATE` on wallet); no double-spend from that path.  
- Auth checks (`p_user_id = auth.uid()`) are in place for `buy_ticket_atomic`, `buy_voucher_atomic`, and `redeem_miocoin`.
