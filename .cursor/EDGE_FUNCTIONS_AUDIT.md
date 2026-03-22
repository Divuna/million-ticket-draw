# OneMil — Edge Functions Security Audit
**Date:** 2026-03-15  
**Scope:** All 42 functions in `supabase/functions/`  
**Method:** Static code analysis + live schema inspection

---

## Summary

| Category | Count |
|---|---|
| Fully secure (no issues) | 28 |
| Minor issues / hardening recommended | 9 |
| Requires fix before production | 5 |

---

## CRITICAL — Requires Fix Before Production Launch

### 1. `sofinity-player-sync` — JWT decoded without signature verification
**File:** `supabase/functions/sofinity-player-sync/index.ts`  
**Risk:** HIGH — Authentication bypass

The function manually decodes the JWT payload (splits on `.`, base64-decodes part 2) to extract `sub` and `email` claims, but **never verifies the signature**. Any caller can forge a token with an arbitrary `user_id` and take over another user's OneSignal player ID.

```typescript
// CURRENT — dangerous: no signature check
const parts = token.split('.');
const decodedPayload = JSON.parse(new TextDecoder().decode(decode(parts[1])));
userId = decodedPayload.sub;   // trusts unverified claim
```

**Fix:** Replace manual decode with a verified call:
```typescript
const { data: { user }, error } = await supabase.auth.getUser(token);
if (error || !user) return new Response('Unauthorized', { status: 401 });
userId = user.id;
userEmail = user.email;
```

---

### 2. `admin-create-test-user` — No authentication guard
**File:** `supabase/functions/admin-create-test-user/index.ts`  
**Risk:** HIGH — Unauthorized wallet creation / data manipulation

The function has **zero authentication check**. Any unauthenticated caller can invoke it. It uses the service role to create wallets and test data. The hardcoded email (`divispavel2@gmail.com`) leaks an internal admin account.

**Fix:** Add JWT + admin role guard at the top, identical to `close-contest`. Alternatively, disable/delete this function before production — it is purely a development utility.

---

### 3. `send_event_to_sofinity` — Broken retry_count update
**File:** `supabase/functions/send_event_to_sofinity/index.ts`  
**Risk:** MEDIUM — Unhandled promise assigned to column value; corrupts event_queue row on failure

In the error handler:
```typescript
retry_count: supabase.from('event_queue')
               .select('retry_count')
               .eq('id', queue_id)
               .single()
               .then(d => (d.data?.retry_count || 0) + 1)  // ← Promise, not value
```
A Promise object is assigned to the `retry_count` column. Supabase/PostgREST will receive `[object Promise]` or coerce it to `null`, corrupting the retry counter and potentially locking the queue item.

**Fix:**
```typescript
const { data: qData } = await supabase.from('event_queue')
  .select('retry_count').eq('id', queue_id).maybeSingle();
const newRetryCount = (qData?.retry_count ?? 0) + 1;
// then use newRetryCount in the UPDATE
```

---

### 4. `stripe-webhook` — No transaction isolation on idempotency check
**File:** `supabase/functions/stripe-webhook/index.ts`  
**Risk:** MEDIUM — Rare but possible duplicate payment on concurrent webhook delivery

The idempotency check is a read-then-write without a database transaction:
```typescript
const { data: existingPayment } = await supabase.from('payments')
  .select('id').eq('stripe_session_id', session.id).maybeSingle()
// ← gap: second concurrent call reads here before first inserts
if (existingPayment) return ...  // skip
await supabase.from('payments').insert({ stripe_session_id: session.id, ... })
```
Stripe's delivery guarantee is at-least-once. Two simultaneous retries can both pass the `existingPayment` check and insert two payment rows, crediting the wallet twice.

**Fix:** Use an `INSERT ... ON CONFLICT (stripe_session_id) DO NOTHING` pattern:
```typescript
const { error } = await supabase.from('payments').insert({
  stripe_session_id: session.id, ...
});
// if error.code === '23505' → duplicate, return success immediately
```
This relies on the `UNIQUE` constraint on `stripe_session_id` for true idempotency.

---

### 5. `update_wallet_after_payment` trigger — Credits both `balance_coins` AND `balance_vouchers`
**File:** Database trigger function `update_wallet_after_payment`  
**Risk:** MEDIUM — Stripe payment may double-credit wallets if `balance_vouchers` is also a spendable balance

The trigger runs on `payments INSERT`:
```sql
ON CONFLICT (user_id) DO UPDATE
  SET balance_coins    = wallets.balance_coins    + new.amount,
      balance_vouchers = wallets.balance_vouchers + new.amount;
```
If `balance_vouchers` is a separate spendable balance (not just a tracking column), every Stripe payment effectively credits the user twice — once in each balance. Verify the intended semantics and remove the `balance_vouchers` update if it is not a separate currency.

---

## MINOR — Hardening Recommended

### 6. `distribute-bonus-prizes` — Application-side race on position generation
The function reads existing bonus positions, generates new positions in application memory, then inserts them in batches. If called twice concurrently (double-click, retry), the two calls may generate overlapping positions. The `idx_bonus_prizes_contest_position_unique` constraint will reject duplicates at the DB layer, but `failedBatches` will silently increase with retry logic masking the error.  
**Recommendation:** Log a warning with the specific conflicting positions; do not silently retry position conflicts.

### 7. `close-contest` — Status check outside RPC
The edge function reads `contest.status` before calling `rpc('close_contest')`. This pre-check is redundant and introduces a TOCTOU window. The `close_contest` DB function already handles idempotency safely with `FOR UPDATE`.  
**Recommendation:** Remove the application-layer status check and rely entirely on the DB function's return value.

### 8. `sofinity-forwarder` — Internal token compared with `===`
The `INTERNAL_FUNCTION_TOKEN` comparison is constant-time by accident (short-circuit string comparison). For production, use a timing-safe comparison to prevent timing attacks on the token.

### 9. All functions — CORS `Access-Control-Allow-Origin: *`
All functions use wildcard CORS. For admin functions (`close-contest`, `distribute-bonus-prizes`, `stripe-refund`, `approve-partner-registration`), restrict to the app origin.

### 10. `send_event_to_sofinity` — event_queue failure leaves status `processing`
If the function crashes between marking `status = 'processing'` and marking `status = 'completed'` or `'failed'`, the queue item stays in `processing` forever. A dead-letter / timeout mechanism is needed to recover stuck items.

### 11. `sofinity-player-sync` — Logs `sofinityApiKey.substring(0, 10)` to console
Partial key in logs can aid key reconstruction. Use a fixed mask (`****`) instead of a substring.

### 12. `distribute-bonus-prizes` — `processBonusBatchWithRetry` uses anon-scoped client
Batch inserts are done via the user-scoped (anon) client, not the admin client. This means RLS applies and an unprivileged insert could silently fail if the user's RLS policy restricts `bonus_prizes` inserts. Switch to `supabaseAdmin`.

### 13. `approve-partner-registration` — Rejection leaves orphan auth user
On `action = 'reject'`, the auth user created during registration is not deleted. Over time, this accumulates rejected applicants with valid (but unusable) auth accounts. Add `supabaseAdmin.auth.admin.deleteUser(auth_user_id)` on rejection.

### 14. `admin-generate-partner-api-key` / `partner-rotate-api-key` / `rotate-partner-api-key`
Three separate functions handle API key rotation. Verify they are not duplicates and that only one path is active; deprecated functions should be removed to shrink the attack surface.

---

## SAFE — No Issues Found

The following functions passed all security checks:

| Function | Auth Method | Notes |
|---|---|---|
| `purchase-ticket` | JWT verified via `auth.getUser()` | Correct; delegates to `buy_ticket_atomic` |
| `close-contest` | JWT + admin role check | Correct double guard |
| `stripe-webhook` | Stripe signature `constructEventAsync` | Signature verified before processing |
| `stripe-refund` | JWT + admin role (user_roles table) | Properly gated |
| `add-bonus-prize` | JWT + admin role (users.role) | Checks for existing position before insert |
| `create-stripe-checkout` | JWT verified | User can only create checkout for themselves |
| `generate-audit-report` | JWT + admin role | Admin only |
| `run-audit` | JWT + admin role | Admin only |
| `check-guardian-notifications` | JWT | User-scoped |
| `process-email-queue` | JWT | Event queue processor |
| `send-test-notification` | JWT | No destructive operations |
| `send-support-email` | JWT | Rate-limit recommended but not security critical |
| `upload-ticket-share` | JWT | Scoped to user's own content |
| `generate-contest-banner` | JWT + admin | OpenAI call, admin gated |
| `generate-contest-description` | JWT + admin | OpenAI call, admin gated |
| `generate-contest-description-openai` | JWT + admin | OpenAI call, admin gated |
| `generate-poster` | JWT + admin | Admin gated |
| `generate-isdoc` | JWT | Finance document, user-scoped |
| `generate-partner-invoice-pdf` | JWT | Partner-scoped |
| `transform-prize-image` | JWT + admin | Admin gated |
| `vertex-generate-image` | JWT + admin | Admin gated |
| `vertex-style-image` | JWT + admin | Admin gated |
| `test-connection` | — | Dev utility, no data access |
| `test-voucher-trigger` | JWT | Dev utility |
| `sofinity-integration-test` | JWT | Dev utility |
| `repair-missing-events` | JWT + admin | Admin gated |
| `daily-onboarding-reminder` | Service role (scheduled) | No inbound auth needed |
| `send-onboarding-reminder` | Service role | Cron-triggered |

---

## Pre-Production Checklist

- [ ] Fix `sofinity-player-sync` JWT verification (CRITICAL)
- [ ] Add auth guard or delete `admin-create-test-user` (CRITICAL)
- [ ] Fix `retry_count` Promise bug in `send_event_to_sofinity` (CRITICAL)
- [ ] Add `ON CONFLICT DO NOTHING` to `stripe-webhook` payment insert (CRITICAL)
- [ ] Clarify `update_wallet_after_payment` double-credit semantics (CRITICAL)
- [ ] Restrict CORS origins on admin functions
- [ ] Delete duplicate key-rotation functions
- [ ] Add dead-letter/timeout recovery for stuck `event_queue` items
- [ ] Delete/disable `admin-create-test-user` before production
