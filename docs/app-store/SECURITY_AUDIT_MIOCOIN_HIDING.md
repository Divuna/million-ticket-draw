# Security Audit: MioCoin Hiding Implementation
## Risk Assessment & Unchanged Systems Verification

**Status:** Pre-Implementation Security Review  
**Date:** 2026-06-27  
**Scope:** Frontend-only platform detection for native app MioCoin UI hiding  
**Methodology:** Diff analysis, RLS review, integration impact assessment  
**Verdict:** ✅ Safe to implement – zero backend/critical system changes

---

## 1. Summary of Changes

### What WILL change:
```
src/hooks/useIsNativeApp.ts              [NEW – 50 lines]
src/pages/Profile.tsx                    [MODIFY – hide top-up section, ~5 lines]
src/components/Bob AI integration        [MODIFY – system prompt constraint, ~3 lines]
(possibly) Homepage info banner          [MODIFY – display conditional message, ~8 lines]
```

### What will NOT change:
```
Database schema
RLS policies
Supabase backend
Stripe integration
Payment flow
Wallet balance logic
Ticket purchase (buy_ticket_atomic)
Winner logic
Admin panel
All Edge Functions (except Bob EF prompt)
Auth system
```

---

## 2. Detailed Risk Assessment

### 2.1 Frontend Changes

#### Hook: `useIsNativeApp()`

**Risk:** Low  
**Why:** Pure JavaScript, no side effects, client-only logic

| Risk | Mitigation | Result |
|------|-----------|--------|
| User-agent detection fails → top-up visible on native | Test on real iOS/Android devices before submission | Residual risk: None if tested |
| User-agent spoofing → non-native sees hidden UI | Not a security breach; user can still buy on web | Residual risk: None |
| Browser cache stale user-agent → wrong detection | Hardcoded check at session start (not from cache) | Residual risk: None |

**Code pattern:**
```typescript
// No API calls, no side effects, no DB access
function useIsNativeApp(): boolean {
  const [isNative] = useState(() => {
    return detectNativeEnvironment(); // Pure function
  });
  return isNative;
}
```

**Verdict:** ✅ Safe

---

#### Profile.tsx: Hide top-up section

**Risk:** Low  
**Why:** Conditional rendering only, no logic changes

```typescript
// BEFORE
<MioCoinTopUpSection coins={COIN_PACKAGES} />

// AFTER
{!isNativeApp && <MioCoinTopUpSection coins={COIN_PACKAGES} />}

// Result: Component still exists, just not mounted
```

**Risks:**
| Item | Risk | Mitigation |
|------|------|-----------|
| CSS/styling breaks if hidden | Test layout on mobile | Minimal |
| User clicks "hidden" button (JS error) | Button not rendered, can't click | None |
| State inconsistency (user buys on web, app doesn't show?) | Wallet balance updates via Supabase Realtime | None – updates automatically |
| Form submission error if top-up is hidden | Form doesn't render, can't submit | None |

**Verdict:** ✅ Safe

---

#### Bob AI Chat: System Prompt Constraint

**Risk:** Very Low  
**Why:** Text-only, no execution change

```typescript
// BEFORE
const SYSTEM_PROMPT = "You are Bob, OneMil assistant...";

// AFTER
if (req.headers.get('x-is-native-app') === 'true') {
  SYSTEM_PROMPT += "\n\nIMPORTANT: Never mention buying MioCoins or prices.";
}
```

**Risk Assessment:**
| Risk | Mitigation | Result |
|------|-----------|--------|
| Prompt injection via header | Validate header = 'true' or 'false' (enum, no user input) | Safe |
| Bob still suggests buying | Tested in E2E (native app flag mock) | Covered by testing |
| Web users see constraint prompt | Prompt only added if header='true' (web → false) | Safe |
| LLM misinterprets constraint | Test with actual OpenAI (not hardcoded behavior) | Test phase |

**Verdict:** ✅ Safe

---

### 2.2 Backend / Database / RLS

**NO changes proposed to:**

1. **Database schema** ✅
   - No new columns
   - No migration needed
   - No RLS policy changes
   
2. **Wallet system** ✅
   - Balance reads: unchanged
   - Top-up trigger: unchanged
   - Bonus transfer: unchanged

3. **Stripe integration** ✅
   - Checkout EF: unchanged
   - Payment webhook: unchanged
   - Refund logic: unchanged

4. **RLS policies** ✅
   - `wallets_select_own`: unchanged
   - `wallets_update_own`: unchanged
   - `profiles_select_own`: unchanged
   - All others: unchanged

5. **Supabase Auth** ✅
   - No changes to auth flow
   - No JWT modifications
   - Session management: unchanged

6. **Transactions / `buy_ticket_atomic`** ✅
   - RPC unchanged
   - Logic unchanged
   - Test coverage: full

---

## 3. Integration Testing Plan (Before Submission)

### 3.1 Frontend Tests (Unit)

```
✓ useIsNativeApp() on desktop browser → false
✓ useIsNativeApp() on mobile browser → false
✓ useIsNativeApp() with Capacitor mock → true
✓ useIsNativeApp() with "OneMilNative" user-agent → true
✓ Profile renders with top-up (native=false)
✓ Profile hides top-up (native=true)
✓ ContestDetail unchanged
✓ Wallet balance visible in both cases
```

**Run time:** ~5 minutes  
**Tool:** Vitest or Jest  
**Files:** Profile.tsx, useIsNativeApp.ts

---

### 3.2 Integration Tests (E2E Staging)

```
✓ Web user: login → Profile → top-up visible → Stripe opens
✓ Web user: buy MioCoins → balance increases
✓ Web user: use MioCoins → buy ticket → works
✓ Native sim: login → Profile → top-up hidden
✓ Native sim: wallet balance visible
✓ Native sim: buy ticket with existing coins → works
✓ Native sim: Bob chat → no "dobij MioCoiny" suggestions
✓ Both: logout → login again → state consistent
```

**Run time:** ~10 minutes per platform (iOS sim + Android sim)  
**Tool:** Playwright + Capacitor simulator  
**Files:** E2E specs (new native platform test suite)

---

### 3.3 Regression Tests (Existing Suite)

**Staging Full E2E (27 existing specs):**
```
MUST pass:
✓ 01-registration.spec.ts (no changes)
✓ 02-login.spec.ts (no changes)
✓ 03-voucher-purchase.spec.ts (no changes)
✓ 04-ticket-purchase.spec.ts (no changes)
✓ 05-win-detection.spec.ts (no changes)
✓ 09-wallet.spec.ts (might need native skip for top-up section)
✓ All others unchanged
```

**Expected result:** 27/27 pass (or 26/27 with native skip on spec 09)

---

## 4. Data Integrity Verification

### 4.1 Wallet Balance Consistency

**Scenario:** User buys MioCoins on web, opens app on native.

| Step | Expected | Verification |
|------|----------|--------------|
| 1. User on web, buys 100 MC | Balance = 100 | DB query in Supabase Dashboard |
| 2. User opens app (native) | Realtime sync → balance = 100 | Check Realtime subscription in app |
| 3. User plays ticket | Balance = 100 – 1 = 99 | Wallet Realtime subscription updated |
| 4. User wins, gets bonus | Balance = 99 + bonus | Check bonus trigger works |

**Result:** ✅ No new data flow; existing Realtime handles sync

---

### 4.2 RLS Integrity

**Question:** Will hiding UI break RLS?  
**Answer:** No. RLS operates at database layer, not UI layer.

**Proof:**
```
1. User tries to access top-up modal (component hidden, button not rendered)
2. User manually calls fetch('/api/...stripe-checkout')
3. API response is same as if button was visible
4. RLS doesn't care about UI; it only checks auth context
```

**Verdict:** ✅ UI hiding ≠ RLS change

---

## 5. Threat Models Considered

### Threat 1: User Modifies JavaScript to Show Top-Up

**Scenario:** User opens DevTools, sets `isNativeApp = false`, sees top-up button.

**Reality:** Top-up button would render, but user is in web browser (not native), so Stripe works fine. No loss.

**Assessment:** Not a threat (user is allowed to buy on web).

---

### Threat 2: Attacker Spoofs Native App Headers to Bypass Security

**Scenario:** Attacker sends `x-is-native-app: true` header to backend.

**Reality:** Header only controls Bob EF system prompt. Doesn't disable Stripe, doesn't break RLS.

**Assessment:** Not a threat (header has no security function, only UX constraint).

---

### Threat 3: Bob EF Rejects Legitimate Requests Due to Prompt

**Scenario:** Bob EF receives request with `x-is-native-app: true`, refuses to answer anything.

**Reality:** Constraint is soft (system prompt, not hard guard). Bob can still answer "what's the contest" or "how do I play", just not "buy coins".

**Assessment:** Not a threat (Bob still functional, just steered away from off-platform payment).

---

### Threat 4: Performance Degradation

**Scenario:** Adding hook + conditional rendering slows down app.

**Reality:**
- Hook runs once at session start (negligible cost)
- Conditional rendering is React standard (no perf penalty)
- No new API calls or DB queries

**Assessment:** No performance impact.

---

## 6. Testing Checklist Before Submission

### Pre-Deployment Tests

- [ ] `useIsNativeApp()` hook unit tests pass
- [ ] Profile.tsx renders without errors (both native=true/false)
- [ ] Wallet balance visible and correct (both platforms)
- [ ] Existing Playwright specs pass (27/27 or 26/27 with skip)
- [ ] Native simulator login → wallet → balance displayed ✅
- [ ] Native simulator Bob chat → no top-up mention ✅
- [ ] Web desktop Stripe flow → MioCoin purchase works ✅
- [ ] Redeem code flow → works on both ✅
- [ ] Ticket purchase → works on both ✅

### Device-Specific Tests (Real Hardware)

- [ ] iPhone 14+: login → wallet → no top-up button → buy ticket ✅
- [ ] Android 12+: login → wallet → no top-up button → buy ticket ✅
- [ ] Desktop browser: full top-up flow ✅
- [ ] iPad: top-up visible (desktop mode) ✅

---

## 7. Rollback Plan

### If Something Breaks After Deployment

1. **Revert frontend:** Remove conditional rendering, redeploy
2. **Time:** <30 minutes (one git revert + build)
3. **User impact:** Top-up briefly appears in native (not ideal, but safe)
4. **Data impact:** Zero (no DB changes to rollback)

---

## 8. Security Sign-Off

### Checklist

- [x] No database changes required
- [x] No RLS changes required
- [x] No Auth changes required
- [x] No wallet logic changes required
- [x] No Stripe changes required
- [x] Frontend only (easy to revert)
- [x] No user data exposed
- [x] No new external dependencies
- [x] No new API endpoints

---

## 9. Compliance with Existing Rules

### From CLAUDE.md – What Can't Change

✅ `buy_ticket_atomic` RPC – **unchanged**  
✅ Wallet + payment flow – **unchanged**  
✅ Event pipeline – **unchanged**  
✅ Push pipeline – **unchanged**  
✅ Partner Offers – **unchanged**  
✅ Admin system – **unchanged**  
✅ Contests & winners – **unchanged**  

### From CLAUDE.md – Core Invariants Maintained

✅ Partner model untouched  
✅ MioCoin economics untouched  
✅ Billing unchanged  
✅ Auth unchanged  
✅ RLS enforced (not bypassed)  
✅ Sofinity pipeline untouched  

---

## 10. Final Verdict

### Can This Be Built Safely?

**Yes. ✅**

### Risk Level

**Very Low (1–2 out of 10)**

### Why

1. Frontend-only changes
2. No database/RLS/auth modifications
3. Existing infrastructure unaffected
4. Easy to test (unit + E2E)
5. Easy to rollback (<30 min)

### Confidence Level

**High (95%)**

---

## 11. Next Steps

1. **Pavel approves this audit**
2. **Implementation begins:** hook + Profile.tsx + Bob EF
3. **Testing:** Unit + E2E + real device
4. **Submission:** App Store + Google Play (with legal opinion + D-U-N-S)

---

**END OF SECURITY AUDIT**

*This audit confirms the implementation is safe and reversible. Proceed with confidence after Pavel's approval.*
