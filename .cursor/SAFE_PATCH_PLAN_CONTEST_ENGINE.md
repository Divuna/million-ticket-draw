# Safe patch plan – OneMil contest engine database safety

**Rules followed:** No changes applied; no code modified; no migrations created. Plan only.

**Scope:** Fixes for the seven problems identified in the database safety audit.

---

## 1. List of required database constraints

| # | Constraint | Table(s) | Type | Purpose |
|---|------------|----------|------|---------|
| C1 | Ticket number unique per contest | `tickets` | UNIQUE(contest_id, number) | One ticket number per contest. |
| C2 | One main winner per contest | `winners` | Partial unique index on (contest_id) WHERE type = 'main' | At most one main winner per contest. |
| C3 | One winner per bonus prize | `winners` | Partial unique index on (prize_id) WHERE type = 'bonus' AND prize_id IS NOT NULL | At most one winner row per bonus_prizes.id. |
| C4 | Bonus position unique per contest | `bonus_prizes` | UNIQUE(contest_id, ticket_position) | One bonus slot per (contest, position). |
| C5 | Winner ticket reference valid | `winners` | FK winners.ticket_id → tickets.id (nullable, optional ON DELETE) | Non-null ticket_id must reference existing ticket. |
| C6 | Wallet balance non-negative | `wallets` | CHECK (balance_coins >= 0) | Already exists as NOT VALID; must be validated. |

**Note:** C6 is already present; the plan only validates it after data cleanup.

---

## 2. SQL migrations required to safely introduce constraints

Each item below is a **separate migration** (or a clearly ordered section within a single migration) to be written when implementing. Order matters; see Section 5.

### Migration A – Data cleanup (prerequisite)

- **A1 – Duplicate tickets**  
  Identify and resolve duplicate (contest_id, number) in `tickets` (e.g. report, then delete or merge keeping one per (contest_id, number) by defined policy).  
  No constraint yet; cleanup only so that Migration B1 can succeed.

- **A2 – Duplicate main winners**  
  For each contest_id, keep one main winner (e.g. smallest id or created_at) and remove the rest:  
  `DELETE FROM winners a USING winners b WHERE a.contest_id = b.contest_id AND a.type = 'main' AND b.type = 'main' AND a.id > b.id;`  
  (Adjust predicate if policy is “keep latest” etc.)

- **A3 – Duplicate bonus winners**  
  For each prize_id (bonus), keep one winner row and remove the rest (same pattern as A2, for type = 'bonus' and prize_id IS NOT NULL).

- **A4 – Duplicate bonus_prizes positions**  
  Resolve duplicate (contest_id, ticket_position) in `bonus_prizes` (e.g. keep one per (contest_id, ticket_position), merge or delete by policy).  
  No constraint yet; cleanup only so that Migration B4 can succeed.

- **A5 – Orphan winners.ticket_id**  
  Set to NULL where ticket no longer exists:  
  `UPDATE winners SET ticket_id = NULL WHERE ticket_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.id = winners.ticket_id);`

- **A6 – Negative wallet balances**  
  Bring balances to zero so CHECK can be validated:  
  `UPDATE wallets SET balance_coins = 0 WHERE balance_coins < 0;`

### Migration B – Add constraints (after cleanup)

- **B1 – tickets**  
  `CREATE UNIQUE INDEX idx_tickets_contest_number_unique ON public.tickets (contest_id, number);`

- **B2 – winners (main)**  
  `CREATE UNIQUE INDEX idx_winners_one_main_per_contest ON public.winners (contest_id) WHERE type = 'main';`

- **B3 – winners (bonus)**  
  `CREATE UNIQUE INDEX idx_winners_one_per_bonus_prize ON public.winners (prize_id) WHERE type = 'bonus' AND prize_id IS NOT NULL;`

- **B4 – bonus_prizes**  
  `CREATE UNIQUE INDEX idx_bonus_prizes_contest_position_unique ON public.bonus_prizes (contest_id, ticket_position);`

- **B5 – winners.ticket_id FK**  
  Ensure column exists (add if missing):  
  `ALTER TABLE public.winners ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL;`  
  If column already exists:  
  `ALTER TABLE public.winners ADD CONSTRAINT fk_winners_ticket_id FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;`  
  (Use SET NULL so deleting a ticket does not delete the winner.)

- **B6 – wallets CHECK**  
  `ALTER TABLE public.wallets VALIDATE CONSTRAINT wallets_balance_coins_non_negative;`  
  (If constraint name differs, use actual name.)

### Migration C – Function updates (after constraints)

- **C1 – close_contest**  
  Replace function body so that:  
  - Status is read **under** `SELECT ... FOR UPDATE` on the contest row.  
  - After acquiring the lock: if status = 'closed', return; if `EXISTS (SELECT 1 FROM winners WHERE contest_id = p_contest_id AND type = 'main')`, set contest to closed and return; otherwise proceed to pick random ticket and insert main winner (with ticket_id set).  
  - Ensures no second main winner and no race.

- **C2 – buy_ticket_atomic (optional but recommended)**  
  When inserting the main winner (last ticket sold), set `ticket_id` to the id of the ticket just inserted (same transaction), so main winners consistently reference a ticket where possible.  
  (Required only if product rule is “main winner must have ticket_id”; for FK safety, nullable ticket_id is enough.)

---

## 3. Data cleanup steps required before constraints

| Step | Action | When | Validation before next step |
|------|--------|------|-----------------------------|
| 1 | **Audit** `tickets`: list duplicate (contest_id, number). | Before A1 | Query: `SELECT contest_id, number, COUNT(*) FROM tickets GROUP BY contest_id, number HAVING COUNT(*) > 1`. |
| 2 | **Resolve** duplicate tickets (keep one per (contest_id, number) by policy; fix or remove the rest). | Migration A1 | Re-run query; result empty. |
| 3 | **Audit** main winners: list contests with more than one main winner. | Before A2 | `SELECT contest_id, COUNT(*) FROM winners WHERE type = 'main' GROUP BY contest_id HAVING COUNT(*) > 1`. |
| 4 | **Delete** duplicate main winners (keep one per contest). | Migration A2 | No contest has more than one main winner. |
| 5 | **Audit** bonus winners: list prize_id with more than one winner. | Before A3 | `SELECT prize_id, COUNT(*) FROM winners WHERE type = 'bonus' AND prize_id IS NOT NULL GROUP BY prize_id HAVING COUNT(*) > 1`. |
| 6 | **Delete** duplicate bonus winners (keep one per prize_id). | Migration A3 | No prize_id has more than one bonus winner. |
| 7 | **Audit** bonus_prizes: list duplicate (contest_id, ticket_position). | Before A4 | `SELECT contest_id, ticket_position, COUNT(*) FROM bonus_prizes GROUP BY contest_id, ticket_position HAVING COUNT(*) > 1`. |
| 8 | **Resolve** duplicate positions (keep one per (contest_id, ticket_position)). | Migration A4 | No duplicate positions. |
| 9 | **Fix** orphan winners.ticket_id (set to NULL where ticket missing). | Migration A5 | `SELECT COUNT(*) FROM winners w WHERE w.ticket_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.id = w.ticket_id);` → 0. |
| 10 | **Fix** negative balances: set to 0. | Migration A6 | `SELECT COUNT(*) FROM wallets WHERE balance_coins < 0;` → 0. |
| 11 | **Validate** wallet CHECK. | Migration B6 | `ALTER TABLE ... VALIDATE CONSTRAINT ...` succeeds. |

**Important:** Run cleanup in a maintenance window or with app traffic minimized. Prefer running cleanup and validation queries in a transaction or with backups. Document the “keep one” policy (e.g. keep min(id)) for duplicates.

---

## 4. Changes required in Supabase functions

### 4.1 close_contest

- **Current issue:** Reads contest status before lock; does not re-check status or “main winner exists” after lock; can insert a second main winner under concurrency.
- **Required change (logic only; do not apply here):**
  - Acquire lock first: `SELECT status INTO v_status FROM contests WHERE id = p_contest_id FOR UPDATE;`
  - If no row found, return.
  - If `v_status = 'closed'`, return.
  - If `EXISTS (SELECT 1 FROM winners WHERE contest_id = p_contest_id AND type = 'main')`, update contest to closed and return (do not insert).
  - Else: pick random ticket, insert one main winner with ticket_id set, set contest to closed.
- **Deploy:** After constraints B2 (and ideally B5) are in place; same migration as C1 is acceptable.

### 4.2 buy_ticket_atomic

- **Current behavior:** Inserts main winner with (contest_id, user_id, type, notes) only; does not set ticket_id.
- **Required change (logic only; do not apply here):**
  - When inserting the main winner (last ticket sold), set `ticket_id` to the id of the ticket just inserted in the same transaction (e.g. use INSERT ... RETURNING id into a variable, then use it in the winners INSERT).
  - Ensures main winners created by this path have a valid ticket reference and satisfy the FK; no schema change to winners required for this.
- **Deploy:** Can be in the same migration as C2; no constraint depends on it, but it improves consistency with C5.

---

## 5. Migration order (safe deployment sequence)

Execute in this order so existing data does not break constraint creation:

| Phase | Step | Description |
|-------|------|-------------|
| **1. Audit** | Run all audit queries (Section 3) | Confirm presence and scope of duplicates, orphans, negative balances. |
| **2. Cleanup** | Migration A (A1 → A6) | Resolve duplicates and invalid data; fix negatives; null out orphan ticket_id. |
| **3. Constraints** | Migration B (B1 → B6) | Add unique indexes and FK; validate wallet CHECK. Order within B: B1, B4, B2, B3, B5, B6 (tickets and bonus_prizes first; then winners; then FK; then validate). |
| **4. Functions** | Migration C (C1, C2) | Replace close_contest (C1); update buy_ticket_atomic to set ticket_id for main winner (C2). |

**Recommended migration file sequence when implementing:**

1. `YYYYMMDDHHMMSS_contest_engine_cleanup.sql` – A1–A6 (with audit comments and optional verification SELECTs).
2. `YYYYMMDDHHMMSS_contest_engine_constraints.sql` – B1–B6.
3. `YYYYMMDDHHMMSS_contest_engine_functions.sql` – C1, C2.

**Rollback considerations:**  
- Unique indexes: drop index to roll back; restore duplicate data only if business requires.  
- FK: drop constraint to roll back.  
- Validated CHECK: no rollback of validation; fix data again if needed.  
- Functions: keep previous version in version control; redeploy old function to roll back.

---

## 6. Summary

- **Constraints:** C1–C6 as above; C6 is validate-only.
- **Migrations:** Cleanup (A) → Constraints (B) → Functions (C).
- **Cleanup:** Deduplicate tickets, main winners, bonus winners, bonus_prizes positions; fix orphan ticket_id; fix negative balances; then validate CHECK.
- **Functions:** close_contest re-check under lock; buy_ticket_atomic set ticket_id for main winner.
- **Order:** Audit → Cleanup → Constraints → Functions; within constraints, tickets and bonus_prizes first, then winners, then FK, then wallet validation.

No changes have been applied; this document is the patch plan only.
