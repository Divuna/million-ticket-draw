# Phase 1 Backup & Rollback Checklist — OneMil subadmin permission gating

**Status:** ⛔ Phase 1 (superadmin-only re-gating) MUST NOT START until every box below is confirmed.
**Captured:** 2026-06-22 (read-only).
**Project:** `onemil` / Supabase ref `xkzhjldrojjlrkezorey` (eu-north-1, Postgres 17.6, DB ~2.28 GB).

---

## 1. What was confirmed (via available tools)
- Project is **ACTIVE_HEALTHY**, Postgres **17.6**, DB size **~2.28 GB**.
- Migration history exists (`supabase_migrations.schema_migrations`, ~300 rows; latest tracked = `20260616 partners_update_rls_partner_own`).
- **Live definitions captured** into [`phase1_baseline.sql`](./phase1_baseline.sql) for all Phase 1 RLS policies + RPCs (read-only `pg_policies` + `pg_get_functiondef`).
- **Current gate confirmed:** every sensitive RLS policy / RPC admits a subadmin (`role='admin'`) — they use `is_admin()`, `has_role(...,'admin') OR has_role(...,'superadmin')`, or `role IN ('admin','superadmin')`. This is exactly what Phase 1 must tighten.

## 2. Backup status — CONFIRMED in Dashboard (22 Jun 2026)
- ✅ **Scheduled daily database backups exist** (Dashboard → Database → Backups).
- ✅ **Latest visible backup: 22 Jun 2026 02:16:36 UTC.**
- ✅ Older daily backups visible for **21, 20, 19, 18, 17, 16, 15 Jun 2026** (rolling ~7-day window).
- ⚠️ **Point-In-Time Recovery (PITR) is NOT enabled** — the dashboard shows it as a **Pro Plan add-on**. Recovery granularity is therefore limited to the daily backup points above, not arbitrary timestamps.
- ⚠️ **Storage objects are NOT included** in database backups (buckets / uploaded files must be backed up separately if needed).
- **⚠️ Migration-history drift:** several live objects (e.g. `public.get_admin_subadmins_overview`, recent SEC01/RLS tweaks) are **not** represented as tracked migration files — they were applied via the SQL editor. **The git migration files are NOT a reliable reverse source.** `phase1_baseline.sql` (live capture) is the authoritative rollback artifact.

## 3. Exact manual steps Pavel must check in Supabase Dashboard
1. Open **Dashboard → Database → Backups**.
2. Confirm whether **Point-In-Time Recovery** is enabled (paid add-on) and note the retention window.
3. Note the **timestamp of the latest available backup**.
4. If PITR is **not** enabled, treat daily logical backups (if any) as the only safety net and rely on the manual snapshot in step 4 below.
5. Record these findings back into this file (or a comment) before Phase 1 starts.

## 4. Manual snapshot (recommended — do immediately before Phase 1)
Take an explicit snapshot regardless of PITR status (DB is only ~2.3 GB → fast):
- **Option A — Dashboard:** Database → Backups → download a backup.
- **Option B — pg_dump** (replace connection string with the production pooler/direct URL from Dashboard → Settings → Database):
  ```sh
  pg_dump "postgresql://postgres:[PASSWORD]@db.xkzhjldrojjlrkezorey.supabase.co:5432/postgres" \
    --no-owner --no-privileges -Fc -f onemil_prod_prePhase1_2026-06-22.dump
  ```
- Store the dump file off-machine. This is the belt-and-suspenders backstop; Phase 1 changes only policy/function definitions (no table data), so a definition-level revert is normally sufficient.

## 5. Live rollback baseline
- ✅ Captured: [`phase1_baseline.sql`](./phase1_baseline.sql) — current production RLS policies + RPC bodies for every Phase 1 object.
- **Re-verify the live definition again right before each Phase 1 change** in case production drifts further between now and execution.

## 6. Rollback strategy
- **RLS policies:** no built-in version history → to revert, `DROP POLICY <name> ON <table>;` then re-run the matching block from `phase1_baseline.sql`.
- **RPCs:** `CREATE OR REPLACE` overwrites irreversibly → re-apply the captured definition block (do **not** trust old migration files due to drift).
- **Edge Functions** (admin-JWT auth path: `generate-partner-invoice-pdf`, `send-partner-invoice-email`, `create-affiliate-payout-document`, `generate-affiliate-bank-export`): Supabase retains versions + source is in git → record current versions before changing; rollback = redeploy prior source.
- **Reverse order** (mirror of forward): system → winners → contest → financial reads → financial writes.
- **Data safety:** only definitions change, not table rows; the `pg_dump` is the last-resort full restore.

## 7. Pre-change checklist (all required before Phase 1)
- [x] Dashboard: PITR status confirmed — **NOT enabled** (Pro Plan add-on); daily backups present (22 Jun 2026 02:16:36 UTC latest, 7-day rolling window).
- [x] Dashboard: latest backup timestamp noted (22 Jun 2026 02:16:36 UTC).
- [ ] Manual `pg_dump` / backup download taken and stored off-machine (recommended immediately before Phase 1, since PITR is off → only daily restore points).
- [ ] `phase1_baseline.sql` present in repo (✅) and re-verified against live just before changes.
- [ ] Current versions of the 4 affected Edge Functions recorded.
- [ ] Staging (`dxmowysntemfqfnanxua`) used first for every sub-step; full superadmin admin smoke + targeted page test green.
- [ ] Production applied **one small sub-area per migration**, each shipping a tested reverse script derived from `phase1_baseline.sql`.
- [ ] After each prod step: verified the sole superadmin **divispavel2@gmail.com** still has full access to the affected page.

## 8. ⛔ Hard rule
**No permission, RLS, or RPC gating change may begin until sections 3, 4, and 7 above are confirmed.** Because of migration-history drift, the live capture (`phase1_baseline.sql`) — not the git migration files — is the rollback safety net. If backups are unconfirmed and no manual snapshot exists, a botched re-gate could be effectively irreversible.

---
*This file and `phase1_baseline.sql` are documentation/rollback references only. Creating them changed nothing in the database, RLS, functions, Edge Functions, frontend, or production behavior.*
