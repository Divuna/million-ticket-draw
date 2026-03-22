# OneMil — Production Readiness Report
**Date:** 2026-03-15

---

## Overall Verdict: NOT READY (3 Critical Blockers)

The core contest and wallet engines are structurally sound after the recent hardening migrations. However, three critical bugs must be resolved before production launch. Several high-severity issues cause data quality degradation (event floods, silent wins) that would affect user trust immediately after launch.

---

## Readiness by Component

| Component | Status | Notes |
|-----------|--------|-------|
| Ticket purchase (DB path) | ✅ SAFE | `buy_ticket_atomic` is correct and concurrent-safe |
| Ticket purchase (edge fn) | ❌ BROKEN | `purchase-ticket` cannot succeed — service role auth mismatch |
| Wallet credits | ✅ SAFE | Stripe webhook idempotent, trigger correct |
| Wallet ledger | ✅ SAFE | `wallet_transactions` append-only with immutable triggers |
| Contest closing | ✅ SAFE | `close_contest` serialized, idempotent |
| Bonus prize data | ✅ SAFE | Winners correctly created (by trigger) |
| Bonus prize response | ❌ BROKEN | Function response always says "no win" for bonus |
| Sofinity token | ❌ INSECURE | Hardcoded token in pg_proc |
| Voucher events | ⚠️ DEGRADED | Triple-firing triggers flood Sofinity |
| User signup | ⚠️ DEGRADED | Double-firing triggers (harmless but wasteful) |
| Event pipeline | ⚠️ DEGRADED | 3 event_queue triggers disabled |
| Performance at scale | ⚠️ WARNING | check_ticket_limit COUNT(*) per purchase |
| Index hygiene | ⚠️ WARNING | 15+ redundant indexes across 5 tables |

---

## Critical Blockers (Must Fix Before Launch)

### Blocker 1: Bonus Prize Win Not Reported to User

Users who win a bonus prize at time of ticket purchase receive a response with `won_prize: null`. The win IS stored in the database (triggers handle it), but the real-time notification to the user is lost. They must manually discover the win later by checking their profile.

**Fix:** In `buy_ticket_atomic`, after the ticket INSERT, query `winners` (not `bonus_prizes`) to check if a bonus winner row was created for this ticket:

```sql
-- After ticket INSERT, check if a bonus winner exists for this ticket
SELECT w.prize_id, bp.title, bp.description, bp.amount
INTO   v_bonus_win
FROM   winners w
JOIN   bonus_prizes bp ON bp.id = w.prize_id
WHERE  w.user_id    = p_user_id
  AND  w.contest_id = p_contest_id
  AND  w.type       = 'bonus'
  AND  w.ticket_id IS NULL  -- set ticket_id here too for completeness
ORDER BY w.created_at DESC
LIMIT 1;
```

Or alternatively: remove the bonus logic from `fn_check_bonus_prize` trigger and keep it only in `buy_ticket_atomic` (cleaner, single responsibility).

---

### Blocker 2: `purchase-ticket` Edge Function Uses Wrong Auth Context

The edge function creates a service role client and calls `buy_ticket_atomic`. Since service role JWT has no `sub` claim, `auth.uid()` = NULL inside the function, and the auth check fails.

**Fix (Option A - recommended):** Create a separate user-scoped client for the RPC call:
```typescript
const userClient = createClient(url, anonKey, {
  global: { headers: { Authorization: `Bearer ${token}` } }
});
const { data, error } = await userClient.rpc("buy_ticket_atomic", { ... });
```

**Fix (Option B):** Set the JWT claims via `set_config` before calling the function (not possible from client-side JS in standard Supabase flow).

**Fix (Option C - most robust):** Remove the `auth.uid()` check from `buy_ticket_atomic` since the edge function already verifies the token via `auth.getUser()`, and trust the `p_user_id` parameter when called from a trusted source (service role implies trust). Add a `p_source` parameter check instead.

---

### Blocker 3: Sofinity API Key in Database

**Fix:** 
1. Store the token in Supabase Vault: `SELECT vault.create_secret('DPm...', 'sofinity_token')`
2. Update the function to use: `SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'sofinity_token'`
3. Remove the hardcoded string from `forward_event_to_sofinity(jsonb)` function

---

## High Priority Pre-Launch Fixes

### Fix 4: Triple Voucher Trigger
Remove 4 of the 5 voucher triggers (keep only one per INSERT and one per UPDATE):
```sql
DROP TRIGGER IF EXISTS after_voucher_insert ON public.vouchers;
DROP TRIGGER IF EXISTS trg_voucher_purchased_insert ON public.vouchers;
DROP TRIGGER IF EXISTS trigger_voucher_purchased ON public.vouchers;
DROP TRIGGER IF EXISTS trg_voucher_purchased_update_user ON public.vouchers;
-- Keep: trg_voucher_purchased (INSERT) and one for UPDATE only
```

### Fix 5: Duplicate auth.users Triggers
Remove `trigger_handle_new_auth_user` (duplicate of `on_auth_user_created`):
```sql
DROP TRIGGER IF EXISTS trigger_handle_new_auth_user ON auth.users;
```
Verify `on_auth_user_created` (or `trg_handle_new_user_roles`) handles all necessary setup.

### Fix 6: Remove `check_ticket_limit` Trigger
This trigger does a `COUNT(*)` on every ticket purchase, which is expensive and redundant. `buy_ticket_atomic` already enforces limits via `next_ticket_number`. Remove it:
```sql
DROP TRIGGER IF EXISTS enforce_ticket_limit ON public.tickets;
DROP FUNCTION IF EXISTS public.check_ticket_limit();
```

---

## Recommended Pre-Launch Checklist

- [ ] Fix BUG-01: Bonus prize response (critical UX)
- [ ] Fix BUG-02: purchase-ticket edge function auth
- [ ] Fix BUG-03: Move Sofinity token to Vault
- [ ] Fix H-01: Remove duplicate voucher triggers
- [ ] Fix H-02: Remove duplicate auth.users trigger
- [ ] Fix H-03: Consider making close_contest the single source of truth for winners
- [ ] Fix M-01: Remove check_ticket_limit trigger
- [ ] Fix M-02/M-03: Clean up redundant indexes
- [ ] Verify CORS policy (currently `*`) matches actual client origins
- [ ] Verify `fn_send_event_to_sofinity` event name logic is not commented out
- [ ] Add monitoring/alerting on `wallet_transactions` ledger vs wallet balance consistency
- [ ] Load test with 500+ concurrent purchases against a staging contest

---

## Post-Launch Monitoring Recommendations

1. Alert when `SELECT COUNT(*) FROM winners WHERE type='main' AND contest_id = ?` > 1
2. Alert when wallet balance diverges from `SUM(wallet_transactions.amount)` by more than 0
3. Monitor `event_forward_log.retry_count` for Sofinity delivery failures
4. Monitor `payments` table for status=pending rows older than 1 hour (uncredited payments)
5. Monitor `push_retry` table for retries growing unbounded
