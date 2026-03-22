# OneMil — Audit Status Report

**Date:** 2025-03-15  
**Scope:** Verify which audits have already been completed (from existing logs, migrations, tests, reports).  
**No new tests run.**

---

## 1. Admin Security Audit

| Sub-area | Status | Evidence |
|----------|--------|---------|
| **Contest edit permissions** | PARTIAL | `FULL_SYSTEM_AUDIT_PRE_PRODUCTION.md` — RPCs secured; `admin_manage_contest` exists. No dedicated audit that explicitly tests contest edit permissions. |
| **Winners edit permissions** | PARTIAL | RLS policies "Admins can view winner status history" (migration 20251217143928). AdminWinners UI. No dedicated audit. |
| **Payments admin intervention** | PARTIAL | `AdminPayments.tsx` — direct status change blocked ("Stav platby nelze měnit přímo"). `stripe-refund` edge function for refunds. `FULL_SYSTEM_AUDIT` notes stripe-refund role check. No dedicated audit. |
| **Role management (Admin vs SuperAdmin)** | AUDITED | `FULL_SYSTEM_AUDIT_PRE_PRODUCTION.md`, `ADMIN_ACCESS_FIX.md` — useUserRole `isAdmin = role === 'admin' \|\| role === 'superadmin'`; AdminUsers: "Pouze SuperAdmin může měnit role"; edge functions check `['admin','superadmin']`. event_queue RLS fix documented for superadmin. |

**Overall:** No single "Admin security audit" document. Security is covered across `FULL_SYSTEM_AUDIT_PRE_PRODUCTION.md`, `EDGE_FUNCTIONS_AUDIT.md`, `ADMIN_ACCESS_FIX.md` — but there is no explicit PASS/FAIL checklist for contest edit, winners edit, payments intervention.

---

## 2. Data Integrity Audit

| Sub-area | Status | Evidence |
|----------|--------|---------|
| **Orphan tickets check** | SCRIPT EXISTS | `scripts/apply-e2e-fixes.mjs` Step 4b — `orphan_ticket_check` (tickets with contest_id not in contests). Outputs PASS/FAIL when run. |
| **Orphan winners check** | SCRIPT EXISTS | `scripts/apply-e2e-fixes.mjs` Step 4c — `orphan_winner_check` (winners with ticket_id not in tickets). Outputs PASS/FAIL when run. |

**Additional:** `tests/wallet-integrity-queries.sql` Section 5d — query for orphan `winners.ticket_id` (manual run).  
`AdminTestSuite.tsx` — data integrity checks for bonus_prizes→contests, vouchers→users, payments→users, audit_log, event_log — but **not** orphan tickets or orphan winners.

**Overall:** Orphan checks exist in `apply-e2e-fixes.mjs` but are not in TEST_REGISTRY. No stored report with last-run PASS/FAIL for orphan tickets or orphan winners. **NOT TESTED** in the sense of a recorded, verified result.

---

## 3. Stripe Stability Tests

| Sub-area | Status | Evidence |
|----------|--------|---------|
| **Stripe webhook idempotence** | REVIEWED, PATCH NOT APPLIED | `STRIPE_WEBHOOK_IDEMPOTENCY_PATCH.md` — "PLAN ONLY — not applied". `DATABASE_SAFETY_AUDIT_CONTEST_ENGINE.md` — UNIQUE on `payments.stripe_session_id` prevents double-credit. `EDGE_FUNCTIONS_AUDIT.md` — "Rare but possible duplicate payment on concurrent webhook delivery" (SELECT-before-INSERT race). `PRODUCTION_READINESS_REPORT.md` — "Wallet credits | ✅ SAFE | Stripe webhook idempotent, trigger correct". Code still uses SELECT-before-INSERT; atomic `INSERT ON CONFLICT` patch not applied. |
| **stripe_webhook_flow** | PASS (per registry) | `TEST_REGISTRY.md` — `stripe_webhook_flow | completed | pass`. No separate report file found. |
| **Parallel voucher purchase / recharge test** | NOT TESTED | No test or report found. `TEST_REGISTRY` has `parallel_ticket_purchase | completed | pass` (see `CONCURRENCY_TEST_REPORT.md`) but no parallel voucher or recharge test. |

**Overall:** Webhook idempotence was reviewed; atomic fix is documented but not applied. No evidence of a parallel voucher/recharge test.

---

## 4. Cron + Event Pipeline Verification

| Sub-area | Status | Evidence |
|----------|--------|---------|
| **Email queue processing** | NOT TESTED | `process-email-queue` edge function exists. `EDGE_FUNCTIONS_AUDIT.md` lists it. No test report or verification log. |
| **Sofinity event queue forwarding** | PASS | `E2E_SIMULATION_REPORT.md` Phase 6 — "event_queue — prize_won, contest_closed, coin_redeemed | PASS"; "event_forward_log — winner_created | PASS"; "Event pipeline to Sofinity is fully functional." `TEST_REGISTRY.md` — `event_pipeline_sofinity | completed | pass`. |
| **Invoice cron** | NOT TESTED | `create_partner_invoices_for_last_week` exists (migration 20260208180630). Idempotence logic in migration. No test report or verification log. |
| **Timezone handling** | NOT TESTED | No dedicated test or report found. |

**Overall:** Sofinity event pipeline is verified. Email queue, invoice cron, and timezone handling have no recorded test results.

---

## Summary Table

| Area | Sub-item | Result | Where Stored |
|------|----------|--------|--------------|
| **1. Admin security** | Contest edit | PARTIAL (no dedicated audit) | FULL_SYSTEM_AUDIT, migrations |
| | Winners edit | PARTIAL (no dedicated audit) | RLS migrations, AdminWinners |
| | Payments admin | PARTIAL (no dedicated audit) | AdminPayments, FULL_SYSTEM_AUDIT |
| | Role management | AUDITED | FULL_SYSTEM_AUDIT, ADMIN_ACCESS_FIX |
| **2. Data integrity** | Orphan tickets | SCRIPT EXISTS (no stored result) | scripts/apply-e2e-fixes.mjs |
| | Orphan winners | SCRIPT EXISTS (no stored result) | scripts/apply-e2e-fixes.mjs |
| **3. Stripe stability** | Webhook idempotence | REVIEWED (patch not applied) | STRIPE_WEBHOOK_IDEMPOTENCY_PATCH, EDGE_FUNCTIONS_AUDIT |
| | stripe_webhook_flow | PASS | TEST_REGISTRY.md |
| | Parallel voucher/recharge | NOT TESTED | — |
| **4. Cron + event** | Email queue | NOT TESTED | — |
| | Sofinity event queue | PASS | E2E_SIMULATION_REPORT.md, TEST_REGISTRY |
| | Invoice cron | NOT TESTED | — |
| | Timezone handling | NOT TESTED | — |

---

## NOT TESTED (Explicit)

- Orphan tickets / orphan winners — script exists, no recorded run result
- Parallel voucher purchase / recharge test
- Email queue processing
- Invoice cron
- Timezone handling
