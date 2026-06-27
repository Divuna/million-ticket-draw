# Apple App Store & Google Play Requirements Checklist
## What You Need Before Submission (Not Code)

**Status:** Requirements mapping only  
**Created:** 2026-06-27  
**Owner:** Pavel Diviš  
**Next Step:** Legal review (separate from this checklist)

---

## PART A: Both Stores (Universal)

### A1. Account & Legal Setup

- [ ] **Company D-U-N-S Number** (Dun & Bradstreet)
  - What: 9-digit identifier for your legal entity (iCONIC POINT s.r.o.)
  - Needed for: Apple Developer, Google Play business verification
  - How: Request at https://www.dnb.com/ (free)
  - Timeline: 3–14 days
  - Note: Google now requires this for ALL apps (2023+)

- [ ] **Apple Developer Account** ($99/year)
  - Needs: D-U-N-S + company legal name + federal tax ID (DIČ: CZ17795851)
  - Setup: https://developer.apple.com/
  - Timeline: 1–3 days after approval

- [ ] **Google Play Developer Account** ($25 one-time)
  - Needs: Google account + business identity verification (D-U-N-S + doc scan)
  - Setup: https://play.google.com/console/
  - Timeline: 1–7 days for verification

### A2. Privacy & Legal Documents (In-App & Docs)

- [ ] **Privacy Policy** (must be in-app accessible + online)
  - Czech + English (at minimum)
  - Must disclose: Supabase Auth (data storage), OneSignal (push), GA4, Stripe (payments), Meta Pixel
  - Location: `/gdpr` route (already exists)
  - Check: All integrations listed truthfully
  
- [ ] **Terms of Service / Obchodní podmínky**
  - Location: `/vop` route (already exists)
  - Must mention: 18+ age requirement, contest rules, MioCoin non-refundable, account deletion right

- [ ] **Cookie Policy / Politika cookies**
  - Location: `/legal/cookies` route (already exists)
  - Must be honest about localStorage, IndexedDB, analytics cookies

- [ ] **Soutěž vs. Hazard Legal Opinion** (Czech law)
  - What: Written statement from lawyer that OneMil is "spotřebitelská soutěž" NOT "loterie/hazard"
  - Why: Required to prove compliance with Czech consumer protection law
  - Who: Czech advokát specializing in consumer/gaming law
  - Needed for: Google Play "Games & Contests" category + Apple 5.3 "Games of Chance"
  - Cost: ~5–10k CZK
  - **CRITICAL:** Without this, both stores can reject you + legal risk in ČR

### A3. App Metadata & Screenshots

- [ ] **App Icon** (required, already have)
  - 1024×1024 PNG, rounded corners
  - Must not have app badges or prices

- [ ] **App Splash Screen / Launch Image**
  - Recommended: 1080×1920 (Android), 1284×2778 (iPhone 15)
  - Should not contain prices, buttons, or changing content

- [ ] **5–10 Store Screenshots** (per app store language)
  - English: 5–10 screenshots
  - Czech: 5–10 screenshots (separate set)
  - Size: 1080×1920 (landscape) or 1080×2160 (portrait)
  - Must show: main UI, contests, wallet balance (but NOT top-up button in native)
  - Cannot show: prices, "Buy MioCoins" prompts

- [ ] **App Description & Subtitle**
  - English: "OneMil – Premium Contest & Reward Platform. Enter contests for physical prizes using tickets and MioCoins. Earn rewards through partner offers."
  - Czech: "OneMil – Prémiová soutěžní a odměnová platforma. Vstupujte do soutěží o věcné výhry pomocí tiketů a MioCoinů. Získávejte odměny přes partnerské nabídky."
  - Note: NO mention of "gambling", "betting", "lottery", "jackpot", "hazard", "sázení"
  - Note: NO mention of casino, chips, roulette, slots

- [ ] **Age Rating & Content Descriptors**
  - Age: 18+ (set to highest restriction)
  - Reason: Contest mechanics, real-world prizes, financial transaction element
  - Content warnings: None if no violence/sexual content

- [ ] **Category Selection**
  - Apple: "Games → Games of Chance" or "Lifestyle"
  - Google: "Games → Casual" or "Lifestyle"
  - **Avoid:** "Games → Gambling" (will auto-reject)

### A4. Data Safety Form (Google Play MANDATORY, Apple RECOMMENDED)

**Google Play: REQUIRED**
- What: Comprehensive data collection disclosure
- Location: Google Play Console → Your app → "Data Safety" tab
- Must declare:
  - ✅ Personal info collected: email, name, age, phone, address (profiles)
  - ✅ Financial info: credit card (Stripe, NOT stored by you)
  - ✅ Cookies/tracking: OneSignal device ID, GA4, Meta Pixel
  - ✅ How data shared: Supabase (you own), OneSignal (push), Sofinity (analytics)
  - ✅ No selling to third parties
  - ✅ Data retention: until account deleted
  - ❌ No encryption? → MARK: "Data encrypted in transit"

**Apple: Not strictly required, but SHOW IT in App Store listing**
- Apple uses "Privacy Nutrition Labels" (similar format)
- Shows users what you collect before download

### A5. Account Deletion (MANDATORY – Both Stores)

- [ ] **In-App Account Deletion Button**
  - Must be accessible within app (not "email support"
  - Your app has: `/delete-account` page (info only, needs functional button)
  - Action: Must trigger `delete_user` RPC or auth deletion
  - Timeline: Must complete within 30 days after request
  - Test: Apple/Google testers will try to delete account and verify it works

- [ ] **Deletion Confirmation Email**
  - After deletion: send email confirming account + data removed
  - Keep logs: deletion timestamp, what was deleted
  - GDPR compliance: document that you complied with deletion request

---

## PART B: Apple App Store Only

### B1. App Review Preparation

- [ ] **Test Account for Reviewers**
  - Provide: email + password (pre-created)
  - What they can access: Full app, some contests, but no production payment
  - Warning: They will try to buy MioCoins → if you haven't hidden it, REJECTION

- [ ] **Review Notes in App Store Connect**
  - Tell Apple: "This app allows purchasing MioCoins on our website (web version). The native app displays user's existing MioCoin balance and allows using coins to play contests. No in-app purchase of MioCoins – compliant with 3.1.3(b)."
  - Attach: Screenshot showing web purchase flow
  - Reference: Apple guidelines 3.1.3(b) + 3.1.3(e) (physical goods)

### B2. Compliance with Guideline 5.3 (Games of Chance)

- [ ] **Contest Rules & Transparency**
  - Per-contest rules: Must be in-app (accessible PDF)
  - How to win: "Last ticket holder receives main prize" (clearly stated)
  - Odds: If you post estimated odds (e.g., "1:10 chance to win bonus"), must be accurate
  - No "random algorithm" claims without verifying it's truly random

- [ ] **No Misleading Language**
  - ❌ "Instant millionaire!" – too casino-like
  - ❌ "Guaranteed return on investment" – false
  - ✅ "Enter a contest for a chance to win a physical prize"
  - ✅ "Play with MioCoins; prizes determined by ticket position"

- [ ] **Physical Prize Verification**
  - Every contest must have real, tangible main prize
  - NOT: "Digital reward", "app currency", "virtual trophy"
  - Your app has this ✅ (motorcycles, laptops, etc.)

### B3. Financial & Developer Info

- [ ] **Tax ID (DIČ: CZ17795851)**
  - Provided during account setup
  - Apple will verify against EU tax database

- [ ] **Banking Info for Payouts**
  - If you earn revenue from App Store: define payout account
  - OneMil: revenue from?? (MioCoins bought on web = NOT App Store revenue, so may be $0)

### B4. Privacy Policies in iOS App

- [ ] **Privacy Link in Settings.app**
  - Must be present and functional
  - Your app should have: `/gdpr` + `/legal/cookies`
  - Test: Can reviewer access from Settings → OneMil → Privacy?

### B5. No External Links to Payment (Anti-Steering)

- [ ] **NO "Buy MioCoins" button in iOS app**
  - ❌ Visible purchase CTA
  - ❌ Link to Stripe checkout
  - ❌ Price display (e.g., "50 MC for $50")
  - ✅ Info banner: "MioCoins can be loaded on our website at onemil.cz"
  - Note: "Onemil.cz" link to web is allowed; "buy here" link is not

---

## PART C: Google Play Only

### C1. Content Rating Questionnaire (Google Play)

- [ ] **IARC Rating Form** (required before launch)
  - What: Online form about game content (violence, language, ads, etc.)
  - Your answers:
    - Violence: None
    - Language: None
    - Sexual content: None
    - Ads: Yes (GA4, Meta, OneSignal)
    - Contest/gambling: Yes (contests, but not gambling by your definition)
  - Google assigns: PEGI 12 / USK 12 / GRAC 12 (age rating)
  - Result: Rating displayed in Play Store

- [ ] **Category Selection**
  - "Games" → "Casual" (not "Gambling")
  - Avoid: "Games → Gambling, Simulated Gambling"

### C2. Sensitive Permissions Justification

- [ ] **If App Requests Permissions, Declare Use**
  - Camera (if avatar upload): "Allow users to upload profile photo"
  - Location: "NO" (don't request if not needed)
  - Contacts: "NO"
  - Calendar: "NO"
  - Photos: "YES" (for avatar upload – declare in App Store listing)

### C3. Advertising & Analytics Disclosure

- [ ] **GA4 / Meta Pixel Declaration**
  - "This app contains analytics and advertising cookies."
  - Google Play listing → Data Safety tab: mark all tracking

### C4. Contest & Lottery Compliance

- [ ] **If Category = "Games" + "Contests"**
  - Google requires: Clear terms, no "pay to play" guarantee, entry is voluntary
  - Your model: Player buys MioCoins (on web, not in-app) → uses them to enter contest
  - Acceptable by Google: ✅ (similar to "Fortnite V-Bucks" model – buy on web, use in-app)

---

## PART D: Execution Checklist (In Order)

### Weeks 1–2: Legal & Setup

- [ ] Obtain D-U-N-S number (apply at DNB.com, might take 2 weeks)
- [ ] Commission legal opinion: "OneMil = spotřebitelská soutěž" (Czech lawyer)
- [ ] Create/review privacy policy, terms, cookie policy

### Weeks 2–3: Accounts & Verification

- [ ] Register Apple Developer account ($99)
- [ ] Register Google Play Developer account ($25)
- [ ] Submit identity verification docs to Google (D-U-N-S + company scan)

### Weeks 3–4: Build & Test

- [ ] Build native wrapper (Capacitor iOS + Android)
- [ ] Implement `useIsNativeApp()` hook + hide top-up
- [ ] Create 10 screenshots per language (Czech + English)
- [ ] Test on real iOS device + Android device
- [ ] Full E2E test: login → wallet → ticket → contest → win

### Weeks 5–6: Store Listing & Submission

- [ ] Fill App Store Connect (iOS)
  - App name, subtitle, description, keywords, category, age rating
  - Upload icon, splash, screenshots (English + Czech)
  - Paste test account credentials
  - Write review notes (reference 3.1.3(b) anti-steering strategy)

- [ ] Fill Google Play Console (Android)
  - App name, short description, full description, category
  - Upload icon, splash, screenshots (English + Czech)
  - Complete IARC rating questionnaire
  - Fill Data Safety form
  - Set up testing account

### Weeks 6–8: Review & Resubmission (Likely)

- [ ] Apple review: Usually 2–5 days
  - Expected outcome: "Needs more info about MioCoin purchase model"
  - Response: Send legal opinion + explain 3.1.3(b) strategy
  - Resubmit: 24 hours

- [ ] Google review: Usually 2–4 hours
  - Expected outcome: Approved (Google less strict on contests)
  - If rejected: Address specific guideline reference

### Week 8+: Live

- [ ] iOS app live in App Store
- [ ] Android app live in Google Play
- [ ] Update website with app store badges
- [ ] Notify users: "OneMil is now available as iOS/Android app"

---

## PART E: Risk Factors & Mitigation

### Risk 1: Apple Rejects for "Unlawful Content" (5.3 Games of Chance)

**Trigger:** Apple review team thinks OneMil = illegal lottery

**Mitigation:**
1. Include Czech lawyer's opinion in "Review Notes"
2. Explain: "Spotřebitelská soutěž dle zákona č. 89/2012 Sb." (Consumer Contest Act, not gambling)
3. Provide link to contest rules (PDF in-app)
4. Emphasize: Physical prizes only, no cash, transparent odds

**Likelihood:** Medium (depends on Apple's interpretation of "Czech law")

---

### Risk 2: Google Flags for Data Collection Overreach

**Trigger:** Google audit finds unannounced tracking (GA4, Meta, OneSignal)

**Mitigation:**
1. **Disclose completely in Data Safety form:**
   - Google Analytics 4
   - Meta Pixel
   - OneSignal device ID
   - Stripe (payment processor, not data stored by you)
2. **Privacy policy must mention all three by name**
3. **Explain purpose:** "Analytics to improve user experience"

**Likelihood:** Low (if properly disclosed)

---

### Risk 3: "No Steering to Web Purchase" – Apple Catches Top-Up Still Visible

**Trigger:** Apple reviewer finds MioCoin top-up button in iOS app

**Mitigation:**
1. Implement `useIsNativeApp()` hook ✅ (see design doc)
2. Test thoroughly on iOS simulator before submission
3. In review notes: "Native app intentionally hides MioCoin purchase. Web version (onemil.cz) available for top-up."

**Likelihood:** Zero (if implementation correct)

---

### Risk 4: Czech Regulator Questions Legality

**Trigger:** Ministry of Finance or Chamber of Bets questions OneMil classification

**Mitigation:**
1. Have legal opinion ready from day 1
2. Do NOT operate as "lottery" (no random draw, fixed positions)
3. Be able to explain: "User buys ticket position N; main prize goes to position N = last ticket." (Deterministic, not random)
4. Keep contest rules accessible + transparent

**Likelihood:** Low (OneMil is clearly not traditional lottery)

---

## PART F: Success Metrics

When you can check ✅ all boxes below, you're ready to submit:

- [ ] D-U-N-S obtained
- [ ] Legal opinion (Czech law) obtained & filed
- [ ] Privacy policy + terms updated (mention all integrations)
- [ ] Apple Developer account created
- [ ] Google Play account created + identity verified
- [ ] Native wrapper built (Capacitor iOS + Android)
- [ ] MioCoin top-up hidden on native (verified via simulator)
- [ ] 10 screenshots created + no prices/buy CTAs visible
- [ ] Test account created (credentials ready for reviewers)
- [ ] Full E2E test passed on real device
- [ ] App Store Connect listing filled out
- [ ] Google Play listing filled out + IARC form completed
- [ ] Data Safety form filled out
- [ ] Review notes written (Apple only)

---

## Summary Table

| Item | Apple | Google | Timeline | Owner |
|------|-------|--------|----------|-------|
| D-U-N-S Number | ✅ | ✅ | Week 1 | Pavel |
| Legal Opinion | ✅ | ✅ | Week 1 | Pavel + Lawyer |
| Developer Account | ✅ | ✅ | Week 2 | Pavel |
| Native Build | ✅ | ✅ | Week 4 | Dev (Claude) |
| MioCoin Hide | ✅ | ✅ | Week 4 | Dev (Claude) |
| Screenshots | ✅ | ✅ | Week 4 | Marketing |
| Test Account | ✅ | ⚠️ (optional) | Week 5 | Pavel |
| Review Notes | ✅ | ⚠️ (optional) | Week 5 | Pavel |
| Data Safety Form | ⚠️ (recommended) | ✅ | Week 5 | Pavel |
| Submit | ✅ | ✅ | Week 6 | Pavel |

---

**END OF CHECKLIST**

*Do not proceed with submission until legal opinion is obtained. This checklist is advisory; official requirements may change.*
