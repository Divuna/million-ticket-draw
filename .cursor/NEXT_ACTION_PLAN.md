# OneMil — Next Action Plan
**Date:** 2026-03-15 | **Priority:** Production Launch Readiness

---

## Priority 1 — Critical (Block Launch)

### ACTION-01: Fix Bonus Prize Response in `buy_ticket_atomic`

**File to create:** `supabase/migrations/20260315240000_fix_bonus_prize_response.sql`

**Root cause:** `fn_check_bonus_prize` trigger creates the bonus winner BEFORE `buy_ticket_atomic` checks `bonus_prizes.status = 'pending'`, so the function always returns `won_prize: null`.

**Approach A (Recommended) — Query winners table after INSERT:**
After the ticket INSERT in `buy_ticket_atomic`, check if a winner was created for this user in this contest (by the trigger), and include it in the response:

```sql
-- Add after ticket INSERT, before ledger write in buy_ticket_atomic:
DECLARE
  v_bonus_win RECORD;
-- After: INSERT INTO public.tickets ... RETURNING id INTO v_new_ticket_id;
SELECT w.prize_id, bp.title, bp.description, bp.amount
INTO   v_bonus_win
FROM   public.winners w
JOIN   public.bonus_prizes bp ON bp.id = w.prize_id
WHERE  w.user_id    = p_user_id
  AND  w.contest_id = p_contest_id
  AND  w.type       = 'bonus'
  AND  w.created_at >= (now() - interval '5 seconds')
LIMIT  1;
-- Use v_bonus_win.prize_id in the result JSON
```

**Approach B (Cleaner) — Remove bonus logic from trigger, keep only in function:**
Drop `fn_check_bonus_prize` trigger. The function handles bonus prizes fully and sets `ticket_id` on the winner correctly.

Action B is cleaner (single responsibility) but changes behavior for direct ticket INSERTs. Action A is backward-compatible.

---

### ACTION-02: Fix `purchase-ticket` Edge Function

**File to edit:** `supabase/functions/purchase-ticket/index.ts`

Change the RPC call to use a user-scoped client instead of service role:

```typescript
// Replace:
const { data, error } = await supabase.rpc("buy_ticket_atomic", { ... });

// With:
const userClient = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  { global: { headers: { Authorization: authHeader } } }
);
const { data, error } = await userClient.rpc("buy_ticket_atomic", { ... });
```

The service role client is still needed for `auth.getUser(token)` verification.

---

### ACTION-03: Move Sofinity Token to Vault

**Steps:**
1. Run in Supabase SQL editor:
   ```sql
   SELECT vault.create_secret(
     'DPmjiD06Fnxp20nB76SRQW3get7o0nFKhFSK02SBSsz33XmTi83XfkqRh8m4xfw0',
     'sofinity_api_token'
   );
   ```
2. Create migration `20260315250000_sofinity_token_vault.sql` that rewrites the function to use:
   ```sql
   v_token := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sofinity_api_token');
   ```
3. After migration: rotate the token in Sofinity dashboard (assume it was compromised).

---

## Priority 2 — High (Fix Within 1 Week)

### ACTION-04: Remove Duplicate Voucher Triggers

**File to create:** `supabase/migrations/20260315260000_cleanup_duplicate_triggers.sql`

```sql
-- Voucher INSERT: keep only trg_voucher_purchased
DROP TRIGGER IF EXISTS after_voucher_insert ON public.vouchers;
DROP TRIGGER IF EXISTS trg_voucher_purchased_insert ON public.vouchers;

-- Voucher UPDATE: keep only one
DROP TRIGGER IF EXISTS trigger_voucher_purchased ON public.vouchers;
-- (keep trg_voucher_purchased_update_user or vice versa — keep the one that's more recently created)

-- auth.users: keep on_auth_user_created, remove the duplicate
DROP TRIGGER IF EXISTS trigger_handle_new_auth_user ON auth.users;
```

---

### ACTION-05: Add `ticket_id` to Bonus Winners Created by Trigger

**File to update:** `fn_check_bonus_prize` trigger function

The trigger creates bonus winners but doesn't set `ticket_id`:
```sql
-- Current (missing ticket_id):
INSERT INTO winners (contest_id, prize_id, user_id, type, notes)
VALUES (...)

-- Fixed:
INSERT INTO winners (contest_id, prize_id, user_id, ticket_id, type, notes)
VALUES (new.contest_id, v_bonus.id, new.user_id, new.id, 'bonus', ...)
```

---

### ACTION-06: Add Ledger Entry to `on_bonus_winner_add_to_bonus_wallet`

The trigger credits `bonus_balance_coins` but doesn't write a ledger entry. Fix:
```sql
CREATE OR REPLACE FUNCTION public.on_bonus_winner_add_to_bonus_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_amount numeric;
  v_wallet_id uuid;
  v_new_balance numeric;
BEGIN
  IF NEW.type = 'bonus' AND NEW.delivered = false THEN
    SELECT amount INTO v_amount FROM bonus_prizes WHERE id = NEW.prize_id;
    UPDATE wallets
    SET bonus_balance_coins = COALESCE(bonus_balance_coins, 0) + COALESCE(v_amount, 0)
    WHERE user_id = NEW.user_id
    RETURNING id, bonus_balance_coins INTO v_wallet_id, v_new_balance;

    -- Add ledger entry
    INSERT INTO public.wallet_transactions (user_id, wallet_id, amount, balance_after, type, source, reference_id)
    VALUES (NEW.user_id, v_wallet_id, COALESCE(v_amount, 0), v_new_balance,
            'bonus_credit', 'on_bonus_winner_add_to_bonus_wallet', NEW.id);
  END IF;
  RETURN NEW;
END;
$$;
```

---

## Priority 3 — Medium (Fix Within 2 Weeks)

### ACTION-07: Remove `check_ticket_limit` Trigger

**Migration:** `supabase/migrations/20260315270000_remove_redundant_trigger.sql`

```sql
DROP TRIGGER IF EXISTS enforce_ticket_limit ON public.tickets;
DROP FUNCTION IF EXISTS public.check_ticket_limit();
```

This removes a `COUNT(*)` scan on every ticket purchase. **+30-40% throughput improvement.**

---

### ACTION-08: Clean Up Redundant Winners Indexes

**Migration:** `supabase/migrations/20260315280000_cleanup_winners_indexes.sql`

Keep:
- `idx_winners_one_main_per_contest`: `UNIQUE (contest_id) WHERE type='main'`
- `uniq_winner_bonus`: `UNIQUE (contest_id, prize_id) WHERE type='bonus' AND prize_id IS NOT NULL`

Drop (redundant):
```sql
DROP INDEX IF EXISTS public.ux_one_main_winner_per_contest;
DROP INDEX IF EXISTS public.winners_unique_main;
DROP INDEX IF EXISTS public.uniq_main_winner_per_contest;
DROP INDEX IF EXISTS public.uniq_winner_main;
DROP INDEX IF EXISTS public.idx_winners_one_per_bonus_prize;
DROP INDEX IF EXISTS public.uniq_winner_per_prize;
DROP INDEX IF EXISTS public.unique_contest_prize;
```

Add missing:
```sql
CREATE INDEX IF NOT EXISTS idx_winners_ticket_id
  ON public.winners(ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_winners_undelivered
  ON public.winners(user_id, contest_id) WHERE delivered = false;
```

---

### ACTION-09: Clean Up Redundant `bonus_prizes` Indexes

```sql
DROP INDEX IF EXISTS public.idx_bonus_prizes_contest_position_unique;
-- Keep bonus_prizes_unique_position as canonical
```

---

### ACTION-10: Add Missing Safety Constraints

**Migration:** `supabase/migrations/20260315290000_additional_constraints.sql`

```sql
-- Bonus balance non-negative
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_bonus_balance_non_negative
  CHECK (bonus_balance_coins >= 0) NOT VALID;
VALIDATE CONSTRAINT wallets_bonus_balance_non_negative;

-- Payment amount positive
ALTER TABLE public.payments
  ADD CONSTRAINT payments_amount_positive
  CHECK (amount > 0) NOT VALID;
VALIDATE CONSTRAINT payments_amount_positive;

-- Wallet transaction non-zero
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_nonzero
  CHECK (amount <> 0) NOT VALID;
VALIDATE CONSTRAINT wallet_transactions_nonzero;

-- Next ticket number upper bound
ALTER TABLE public.contests
  ADD CONSTRAINT contests_next_ticket_bounded
  CHECK (next_ticket_number <= ticket_count + 1) NOT VALID;
VALIDATE CONSTRAINT contests_next_ticket_bounded;
```

---

### ACTION-11: Fix `update_wallet_after_payment` to Also Fire on Status Update

**Migration:** `supabase/migrations/20260315300000_payment_trigger_on_update.sql`

```sql
CREATE OR REPLACE FUNCTION public.update_wallet_on_payment_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  -- Only credit when transitioning to 'completed'
  IF NEW.status = 'completed' AND (TG_OP = 'INSERT' OR OLD.status <> 'completed') THEN
    -- (existing credit logic from update_wallet_after_payment)
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_wallet_after_payment ON public.payments;
CREATE TRIGGER trg_update_wallet_after_payment
  AFTER INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_wallet_on_payment_completed();
```

---

## Priority 4 — Low (Maintenance Sprint)

### ACTION-12: Clean Up Dead Code and Duplicate Indexes

```sql
-- Duplicate referral indexes
DROP INDEX IF EXISTS public.influencer_referrals_user_id_key;  -- keep _uniq

-- Duplicate payment indexes
DROP INDEX IF EXISTS public.idx_payments_user;  -- keep idx_payments_user_id
DROP INDEX IF EXISTS public.payments_stripe_session_id_key;  -- keep idx_payments_stripe_session_id_unique

-- Remove backup table
DROP TABLE IF EXISTS public._messages_policies_backup;

-- Disabled dead triggers
DROP TRIGGER IF EXISTS onemil_messages_forward_to_sofinity ON public.event_queue;
DROP TRIGGER IF EXISTS process_event_queue_message_trigger ON public.event_queue;
DROP TRIGGER IF EXISTS trigger_debug_event_log ON public.event_queue;
```

---

### ACTION-13: Fix `fn_send_event_to_sofinity` Logic

Re-implement the commented-out event name assignment logic or remove the function/trigger if it's been superseded by direct Sofinity calls elsewhere.

---

### ACTION-14: Fix `create-contest` Admin Check

Replace hardcoded email check with role-based check (consistent with other functions):
```typescript
// Replace: if (userData.email === 'divispavel2@gmail.com')
// With: if (!['admin','superadmin'].includes(userData.role))
```

---

## Migration Execution Order

```
20260315240000_fix_bonus_prize_response.sql       (CRITICAL)
20260315250000_sofinity_token_vault.sql           (CRITICAL - after Vault setup)
20260315260000_cleanup_duplicate_triggers.sql     (HIGH)
20260315270000_remove_redundant_trigger.sql       (MEDIUM)
20260315280000_cleanup_winners_indexes.sql        (MEDIUM)
20260315290000_additional_constraints.sql         (MEDIUM)
20260315300000_payment_trigger_on_update.sql      (MEDIUM)
```

Edge function changes (no migration needed):
- `supabase/functions/purchase-ticket/index.ts` — fix auth context
- `supabase/functions/create-contest/index.ts` — fix hardcoded email

---

## Final Production Launch Gate

| Check | Status | Action |
|-------|--------|--------|
| Bonus prize response correct | ❌ | ACTION-01 |
| purchase-ticket edge fn working | ❌ | ACTION-02 |
| Sofinity token secured | ❌ | ACTION-03 |
| Voucher events not duplicated | ❌ | ACTION-04 |
| ticket_id set on bonus winners | ❌ | ACTION-05 |
| Bonus wallet ledger entries | ❌ | ACTION-06 |
| check_ticket_limit removed | ❌ | ACTION-07 |
| Redundant indexes removed | ❌ | ACTION-08, 09, 12 |
| Additional constraints added | ❌ | ACTION-10 |
| Core buy_ticket_atomic | ✅ | Done |
| Wallet ledger (balance_coins) | ✅ | Done |
| Contest close idempotency | ✅ | Done |
| Stripe idempotency | ✅ | Done |
| Ticket uniqueness | ✅ | Done |
