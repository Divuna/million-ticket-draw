# Native App MioCoin Hiding Strategy
## Design Document (No Code Changes Yet)

**Status:** Design & Security Review Only  
**Created:** 2026-06-27  
**Purpose:** Blueprint for removing MioCoin top-up from iOS/Android native wrappers to comply with Apple 3.1.3(b) anti-steering rule + avoid 30% fee  
**Owner:** Pavel Diviš  
**Safety Level:** Read-only document – **ZERO code changes executed**

---

## 1. Executive Summary

OneMil currently:
- ✅ Web/PWA at `onemil.cz` – full Stripe MioCoin top-up enabled
- 🟡 Planned native wrappers (iOS/Android) – need to hide top-up to pass App Store review

**Goal:** Detect when OneMil runs as native app (not web) → hide MioCoin purchase UI completely.

**Result:** Users can still use MioCoins they bought on web, but cannot buy inside app (complies with Apple 3.1.3(b)).

---

## 2. Platform Detection Strategy

### 2.1 What Tells Us It's a Native App?

When native wrapper (Capacitor/TWA) runs the web app, it injects a custom flag/header to distinguish from browser.

**Option A – Recommended: Custom User-Agent in Wrapper**
```
iOS Capacitor: 
  Regular browser: Mozilla/5.0 ... Safari
  Native wrapper: Mozilla/5.0 ... Safari OneMilNative/1.0

Android TWA/Capacitor:
  Regular browser: Mozilla/5.0 ... Chrome
  Native wrapper: Mozilla/5.0 ... Chrome OneMilNative/1.0
```

**Option B – URL Query Parameter**
```
Native app opens: https://onemil.cz/?platform=ios-app
Web opens:        https://onemil.cz/
```

**Option C – Window Flag (if Capacitor available)**
```
if (window.capacitor && window.capacitor.isNative) {
  // Native app
}
```

**Chosen approach:** Option A (User-Agent) is most reliable + hardest to spoof. Wrapper sets it during initialization.

---

## 3. Frontend Implementation Blueprint

### 3.1 New Hook: `useIsNativeApp()`

Location: `src/hooks/useIsNativeApp.ts`

**Purpose:** Single source of truth for platform detection.

**Logic:**
```
1. Check if running in Capacitor environment
2. Parse user-agent for "OneMilNative" marker
3. Cache result (doesn't change during session)
4. Return boolean: isNativeApp
```

**Used by:** Every component/page that renders MioCoin buying UI.

### 3.2 Components Affected by Hiding

**High confidence (directly call Stripe):**
- `src/pages/Profile.tsx` – MioCoin top-up section (COIN_PACKAGES, checkout modal)
- Bob AI chat (`ai-chat` Edge Function) – any prompt suggesting "dobij MioCoiny" must be blocked

**Medium confidence (may reference top-up):**
- `src/components/Header.tsx` – if there's a "Dobít" CTA button
- `/games` page – if empty-state hints at buying tickets instead of using existing MioCoins
- Any toast/error message saying "Kup MioCoiny"

**Low confidence (unlikely to affect, but audit):**
- `src/pages/ContestDetail.tsx` – when user clicks ticket but has 0 coins → might hint at top-up
- `src/pages/Wins.tsx` – reward display pages (should be safe)

### 3.3 Implementation Pattern

**In Profile.tsx (top-up section):**
```typescript
const { isNativeApp } = useIsNativeApp();

return (
  <>
    {/* Wallet balance display – ALWAYS visible */}
    <WalletBalanceSection />
    
    {/* Top-up section – HIDDEN on native */}
    {!isNativeApp && (
      <MioCoinTopUpSection coins={COIN_PACKAGES} />
    )}
    
    {/* Redeem code section – ALWAYS visible */}
    <RedeemMioCoinCard />
  </>
);
```

**Result on native app:**
- User sees: wallet balance + redeem code card + profile settings
- User does NOT see: top-up buttons, Stripe modal, or prices

### 3.4 Bob AI Guard

In `src/supabase/functions/ai-chat/index.ts` (Edge Function):

**Add platform detection header check:**
```typescript
const isNativeApp = req.headers.get('x-is-native-app') === 'true';

if (isNativeApp) {
  // Constraint: never suggest "dobij MioCoiny" or link to top-up
  SYSTEM_PROMPT += "\n\nIMPORTANT: You are running in a mobile app. Never mention buying MioCoins, prices, or payment. Only discuss using existing MioCoins, redeeming codes, and playing games.";
}
```

**Mobile wrapper will add header when calling EF:**
```javascript
const response = await fetch('.../ai-chat', {
  headers: {
    'x-is-native-app': 'true'
  },
  // ...
});
```

---

## 4. Data Flow & Safety

### 4.1 No User Account Changes
- RLS/auth: unchanged
- Wallet DB: unchanged
- MioCoin balance: unchanged
- Stripe integration: unchanged (web still works)
- All payments flow: unchanged

### 4.2 Frontend-Only Hide
- No backend flag changes
- No RPC modifications
- No new database columns
- No migration needed

### 4.3 User Data Integrity
- Users see accurate balance in all contexts
- Redeem code flow works identically
- Ticket purchase (`buy_ticket_atomic`) unaffected
- Winner logic unchanged

---

## 5. Security Audit

### 5.1 Risk: User Discovers Native App Can't Buy

**Scenario:** iOS user opens app, can't find top-up, gets frustrated.

**Mitigation:**
1. In-app message (one-time, non-intrusive): "💡 MioCoiny je možné dobít na webové verzi. [Otevřít web]" → opens `https://onemil.cz` in external browser.
2. App Store listing mentions: "Dobíjení MioCoinů přes webovou verzi."

**No breach of Apple 3.1.3(b)** – we're not forcing/steering users to web, just stating fact.

### 5.2 Risk: User-Agent Spoofing

**Scenario:** User modifies browser user-agent to access top-up from normal browser.

**Reality:** Doesn't matter. Top-up appears, Stripe checkout runs, user pays. We don't lose revenue.
- If they spoof from iPhone, that's their problem (not our App Store violation).
- If they spoof iOS user-agent on desktop browser, Stripe works fine.

**Mitigation:** Not needed. This is not a security breach.

### 5.3 Risk: Accidental Hiding on Web

**Scenario:** User-agent detection breaks; web users see no top-up.

**Test:** Every build, verify:
1. Desktop Chrome: top-up visible ✅
2. Mobile Safari (real): top-up visible ✅
3. Native iOS simulator: top-up hidden ✅
4. Native Android simulator: top-up hidden ✅

### 5.4 Risk: Bob Suggests Buying in Native App

**Scenario:** User in iOS app chats with Bob, Bob says "Kup MioCoiny za 50 Kč", violating 3.1.3(b).

**Mitigation:** Bob system prompt includes constraint if `x-is-native-app=true`.

**Test:** In CI, mock native app header, verify Bob doesn't mention prices/buying.

---

## 6. Testing Strategy

### 6.1 Unit Tests

**Test: `useIsNativeApp()` detection**
```
✓ Desktop browser → false
✓ Mobile Safari → false
✓ Capacitor environment → true
✓ User-agent with "OneMilNative" → true
✓ Spoofed user-agent → true (expected)
```

**Test: Component rendering**
```
✓ Profile (isNativeApp=false): top-up visible
✓ Profile (isNativeApp=true): top-up hidden, balance visible
✓ ContestDetail (both): ticket purchase unchanged
```

### 6.2 Integration Tests (E2E)

**Staging scenario:**
1. Web user: login → Profile → see MioCoin top-up ✅
2. Native simulator: login → Profile → no MioCoin top-up, but balance shows ✅
3. Native simulator: use existing coins, buy ticket → works ✅
4. Native simulator: Bob chat → no top-up mention ✅

### 6.3 Regression Risk

**What we're NOT touching:**
- `buy_ticket_atomic` RPC (100% safe)
- `create-stripe-checkout` EF (100% safe)
- Wallet balance (100% safe)
- Redeem code flow (100% safe)
- Admin (100% safe)
- Contests, winners, vouchers (100% safe)

**Risk of breaking web:** <1% (only if user-agent detection malfunctions)

---

## 7. Implementation Checklist

### Phase 1: Design & Review (THIS DOCUMENT)
- [ ] Pavel approves approach
- [ ] Legal confirms Apple 3.1.3(b) compliance
- [ ] Security team reviews data flow (none changed ✅)

### Phase 2: Development (NOT STARTED YET)
- [ ] Create `useIsNativeApp()` hook
- [ ] Update Profile.tsx (hide top-up on native)
- [ ] Update Bob AI prompt (x-is-native-app header handling)
- [ ] Add one-time info banner if native
- [ ] Unit tests ✓

### Phase 3: Testing (NOT STARTED YET)
- [ ] Desktop web: full Stripe flow ✓
- [ ] iOS native simulator: top-up hidden ✓
- [ ] Android native simulator: top-up hidden ✓
- [ ] Bob EF: no top-up mention in native ✓
- [ ] Ticket purchase: works same on all ✓
- [ ] Staging E2E: 27+ tests pass ✓

### Phase 4: Wrapper Integration (NOT STARTED YET)
- [ ] Capacitor config: set "OneMilNative" in user-agent (iOS)
- [ ] TWA config: set "OneMilNative" in user-agent (Android)
- [ ] App Store listing: mention web top-up

### Phase 5: Production Build & Deploy (NOT STARTED YET)
- [ ] Build native wrappers
- [ ] Submit to App Store (iOS)
- [ ] Submit to Google Play (Android)

---

## 8. What This Does NOT Solve

### 8.1 Still Needed: Legal Review

This design removes the **technical Apple steering violation**, but you still need:

1. **Czech law compliance:** Is OneMil a "spotřebitelská soutěž" (consumer contest) or "loterie" (gambling)? 
   - Requires: Advokát (consumer/gaming law specialist)
   - Timeframe: 2–3 weeks
   - Cost: ~5–10k CZK

2. **Apple & Google contests policy:** Proof that you're not operating a gambling service.
   - Usually addressed via privacy form + legal docs + review communication
   - Depends on Step 1 above

### 8.2 Still Needed: Developer Accounts & Compliance

- Apple Developer: $99/year + D-U-N-S number (1–2 weeks to get)
- Google Play: $25 one-time + identity verification
- Privacy labels / data safety forms
- Age rating (18+)

### 8.3 Still Needed: Native Wrapper Build

- iOS: Capacitor + XCode + provisioning profile
- Android: Capacitor + Android Studio + signing key
- This is separate work (not part of this design)

---

## 9. Summary of Changes

| Area | Change | Risk | Impact |
|------|--------|------|--------|
| Frontend | Add `useIsNativeApp()` hook | None | +1 file |
| Frontend | Hide top-up in Profile if native | Low | UX only |
| Frontend | Update ContestDetail empty-state CTA | Very low | UX text |
| Bob EF | Add `x-is-native-app` prompt constraint | None | Safety improvement |
| Backend | NONE | 0% | Zero DB/RPC changes |
| Compliance | NONE (legal review is separate) | N/A | Not included here |

---

## 10. Sign-Off Template

When approved, fill this:

```
APPROVED BY: Pavel Diviš
DATE: [date]
LEGAL REVIEW PENDING: [Y/N] – required before store submission
NOTES: [any concerns or modifications]
```

---

## Appendix A: Apple 3.1.3(b) Full Text

> "Apps that unlock features or functionality with mechanisms other than an App Store in-app purchase will be rejected. Specifically: (b) Purchasing digital content in an app… your app must use the In-App Purchase API for all digital goods and services purchased within the app, including all unlocking of features or digital content."

**Exception 3.1.3(e):** Physical goods are exempt. OneMil contests include physical prizes → potential gray zone.

**Our strategy:** Hide purchase UI entirely on native app; let user purchase on web (not in-app). This is the "reader app" pattern used by Netflix, Spotify, Kindle.

---

## Appendix B: User-Agent Examples

**Current (no marker):**
```
iPhone Safari:
Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1

Android Chrome:
Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36
```

**With native marker (proposed):**
```
iPhone Capacitor:
Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1 OneMilNative/1.0

Android TWA:
Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 OneMilNative/1.0
```

---

**END OF DOCUMENT**

*This is a design document only. No code has been written. No production changes made. Subject to Pavel's approval before any implementation.*
