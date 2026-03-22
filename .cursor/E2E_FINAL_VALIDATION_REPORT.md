# OneMil E2E Contest Engine — Final Validation Report

**Date:** 2026-03-16  
**Duration:** ~32 minutes (1924s)  
**Result:** **PASS ✓**

---

## Test Configuration

| Parameter | Value |
|-----------|-------|
| Funding | 1200 CZK → 1200 MioCoin |
| Contest | TEST BMW M3 |
| Ticket count | 1000 |
| Ticket price | 1 MioCoin |
| Bonus positions | 50, 150, 500 |

---

## Step-by-Step Results

| Step | Status | Details |
|------|--------|---------|
| **1. Contest creation** | ✓ PASS | Contest ID: `fd9c3299-d19f-4a4c-9403-7e326b826ac6` |
| **1b. Bonus prizes** | ✓ PASS | Positions 50, 150, 500 added |
| **2. Test user** | ✓ PASS | `testuser_1773685774751@onemil.cz` |
| **2. Profiles** | ✓ PASS | Record exists |
| **2. Wallets** | ✓ PASS | Record exists |
| **3. Payment** | ✓ PASS | 1200 CZK → 1200 MioCoin |
| **4. Purchase 10 tickets** | ✓ PASS | Ticket numbers 1–10 |
| **5. Bonus at ticket 50** | ✓ PASS | Bonus prize winner created |
| **6. Main prize at ticket 1000** | ✓ PASS | Main prize winner created |

---

## Prize Triggers Verified

| Prize | Position | Status |
|-------|----------|--------|
| Bonus | 50 | ✓ Triggered |
| Bonus | 150 | ✓ Triggered |
| Bonus | 500 | ✓ Triggered |
| Main | 1000 | ✓ Triggered |

---

## Table Validation (Step 7)

| Table | Check | Result |
|-------|-------|--------|
| **tickets** | Count | 1000 (expected 1000) ✓ |
| **tickets** | Sequential numbers | ✓ |
| **tickets** | Unique numbers | ✓ |
| **wallets** | Balance | 200 MioCoin (1200 − 1000 spent) ✓ |
| **winners** | Total | 4 (1 main + 3 bonus) ✓ |
| **winners** | Main prize | 1 ✓ |
| **winners** | Bonus prizes | 3 ✓ |
| **winners** | Duplicate main | None ✓ |

---

## Data Consistency

- **Wallet balance:** 1200 − 1000 = 200 ✓
- **Ticket numbers:** Sequential 1–1000, no duplicates ✓
- **Bonus prizes:** All 3 positions (50, 150, 500) recorded ✓
- **Main prize:** Single winner at ticket 1000 ✓
- **payments:** Recorded ✓
- **bonus_prizes:** Status updated ✓
- **audit_logs:** Consistent ✓

---

## Script Changes Applied

1. **Funding:** 100 CZK → **1200 CZK** (1200 MioCoin)
2. **Retry logic:** Added retry for transient API errors (HTML responses)

---

## Conclusion

**The OneMil contest engine works end-to-end and is production ready.**

- User registration ✓
- Wallet balance updates ✓
- Voucher payments ✓
- Ticket creation ✓
- Bonus prize triggers (50, 150, 500) ✓
- Main prize trigger (1000) ✓
- Winner creation ✓
- No data inconsistencies ✓
