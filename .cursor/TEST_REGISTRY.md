# OneMil Test Registry

## Backend Lifecycle Tests

| Test | Status | Result |
|-----|------|------|
| user_registration | completed | pass |
| wallet_creation | completed | pass |
| voucher_purchase | completed | pass |
| voucher_redeem | completed | pass |
| ticket_purchase | completed | pass |
| bonus_prize_trigger | completed | pass |
| contest_close | completed | pass |
| winner_generation | completed | pass |
| wallet_ledger_consistency | completed | pass |
| event_pipeline_sofinity | completed | pass |

---

## Stability Tests

| Test | Status | Result |
|-----|------|------|
| parallel_ticket_purchase | completed | pass |
| last_ticket_behavior | completed | pass |
| event_pipeline_delivery | completed | pass |

---

## Production Readiness

| Test | Status | Result |
|-----|------|------|
| load_test_100_users | completed | pass |
| stripe_webhook_flow | completed | pass |
| rls_security_check | completed | issues |
| rate_limit_test | completed | issues |
| admin_panel_integration | completed | issues |

---

## E2E Verification Fixes

| Fix | Status | Notes |
|-----|------|------|
| contest_revenue view | pending_sql | SQL ready: `supabase/migrations/20260316000000_e2e_fixes.sql` — run in SQL Editor |
| closed_contests_no_winner | pending_sql | 6 contests need winner record — same migration |
| main_winner_null_ticket_id | pending_sql | 1 winner needs ticket_id backfill — same migration |
| e2e_ticket_count_constraint | ready | Run `scripts/run-e2e-migration.sql` in SQL Editor before E2E test |

---

## E2E Contest Test

**Command:** `SUPABASE_SERVICE_ROLE_KEY=<key> npm run e2e:contest`

**Prerequisite:** Migration applied (see `scripts/apply-e2e-migration.mjs` or `scripts/run-e2e-migration.sql` in SQL Editor).

**Flow:** Create contest (1000 tickets) → Create user → Purchase 100 CZK voucher → Buy 10 tickets → Buy until ticket 50 (bonus) → Buy until ticket 1000 (main prize) → Validate tables.

**Report:** `.cursor/E2E_CONTEST_REPORT.md`