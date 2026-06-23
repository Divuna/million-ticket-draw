# Phase 2 — `admin_permissions` Production Apply Plan

**Target production project:** `xkzhjldrojjlrkezorey`
**Status:** ⛔ NOT APPROVED — package prepared only. Nothing applied to production.
**Prepared:** 2026-06-23

This package promotes the **additive** Phase 2 `admin_permissions` DB foundation
from staging (`dxmowysntemfqfnanxua`, validated by E2E run `28043183824`) to
production. It is the granular-subadmin-permissions foundation **only** — no
sensitive area is represented and nothing in the live app reads it until the
Phase 2 frontend is published.

---

## 1. Scope

**In scope (exactly these objects):**
- `public.admin_permissions` — table, `UNIQUE(user_id, permission_key)`, index `idx_admin_permissions_user_id`, RLS enabled
- `public.has_admin_permission(check_key text, check_user_id uuid default auth.uid())` — SECURITY DEFINER helper
- RLS policies `admin_permissions_select` (own rows / superadmin) and `admin_permissions_superadmin_write` (superadmin only)
- Helper grants: `EXECUTE` to `authenticated` only; revoked from `PUBLIC` / `anon`

**Allowed permission keys (data, frontend-enforced):**
`vouchers.manage`, `content.manage`, `banners.manage`, `notifications.manage`

**Explicitly OUT of scope (NOT in this package):**
contest internals · tickets · revenue/statistics · payments · invoices ·
commissions · payouts · winners · prize delivery · audit/system/settings ·
admin role management.

**Dependency:** `public.is_superadmin(uuid)` must already exist in production
(applied in Phase 1). The apply script has a pre-apply guard that aborts if it
is missing.

---

## 2. Package files

| File | Purpose |
|------|---------|
| `phase2_admin_permissions_apply.sql` | Idempotent, transactional apply (guard → table → helper → RLS → grants) |
| `phase2_admin_permissions_rollback.sql` | Drops ONLY Phase 2 objects; never touches `is_superadmin` / `user_roles` / Phase 1 |
| `phase2_admin_permissions_verification.sql` | Read-only post-apply checks (STRING_AGG folded) |
| `phase2_admin_permissions_production_plan.md` | This document |

---

## 3. Pre-apply checklist (ALL required before running anything)

- [ ] **Explicit written approval from Pavel** for the production apply.
- [ ] **Manual `pg_dump` backup taken** of production `xkzhjldrojjlrkezorey` and stored safely. PITR is **OFF** on this project — the manual dump is the only restore point.
- [ ] Confirm production is currently untouched by this work (no `admin_permissions` object exists yet):
  ```sql
  SELECT to_regclass('public.admin_permissions') AS table_exists,  -- expect NULL
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='has_admin_permission') AS helper_exists; -- expect false
  ```
- [ ] Confirm Phase 1 dependency present:
  ```sql
  SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='is_superadmin') AS is_superadmin_exists; -- expect true
  ```
- [ ] Record baseline `SELECT COUNT(*) FROM public.user_roles;` to compare after apply (must be unchanged).
- [ ] **Deploy-order acknowledgement:** the **Phase 2 frontend must NOT be published** to production until this DB apply succeeds. Publishing the frontend first would gate non-superadmins on `admin_permissions` rows that do not exist yet → they lose nav/route access. Order is **DB apply → verify → (later, separately) frontend publish**.

---

## 4. Apply procedure

1. Complete the pre-apply checklist above.
2. Run `phase2_admin_permissions_apply.sql` in the production SQL editor (single transaction; the pre-apply guard aborts if `is_superadmin()` is missing).
3. Run `phase2_admin_permissions_verification.sql` and confirm every block matches its `expect` comment.
4. Confirm `user_roles` row count equals the recorded baseline.
5. Do **not** publish the Phase 2 frontend in the same step — that is a separate, separately-approved action.

---

## 5. What the apply will do

- Create an empty `public.admin_permissions` table with RLS on, a unique key on `(user_id, permission_key)`, and a user_id index.
- Create the `has_admin_permission()` SECURITY DEFINER helper (authenticated-only execute).
- Install two RLS policies: own-row/superadmin read, superadmin-only write.
- **Change nothing else.** No existing table, policy, RPC, Edge Function, or behavior is modified. Because nothing in the live frontend reads it yet, the live app behavior is unchanged until frontend publish.

---

## 6. Rollback scope

`phase2_admin_permissions_rollback.sql` drops **only**:
- policies `admin_permissions_superadmin_write`, `admin_permissions_select`
- function `has_admin_permission(text, uuid)`
- table `public.admin_permissions` (cascades its own index + unique constraint)

It **must not** touch `public.is_superadmin()`, `public.user_roles`, or any
Phase 1 / sensitive object. Dropping the table removes any granted subadmin
permission rows; superadmin access is unaffected (implicit-all via
`is_superadmin()`). If permissions were already in use and the frontend was
published, rolling back the DB without un-publishing the frontend would gate
non-superadmins out of the four safe areas — so roll back frontend first if it
was live.

---

## 7. Verification checks (summary)

`phase2_admin_permissions_verification.sql` confirms:
1. `is_superadmin()` dependency present.
2. Table exists + RLS enabled.
3. Column set correct.
4. Unique constraint `(user_id, permission_key)` + index present.
5. Both RLS policies present with correct commands.
6. Helper signature `(check_key text, check_user_id uuid)`, SECURITY DEFINER, owner postgres.
7. Helper EXECUTE granted to `authenticated` only.
8. `anon` cannot execute the helper.
9. No unexpected permission keys (only the four allowed; empty right after apply).
10. `user_roles` still present and row count matches baseline.

---

## 8. Post-apply documentation

After a real production apply (future, approved), update `CLAUDE.md`,
`onemil_state.md`, `onemil_history.md` to record the apply with the verification
results and confirm production state.
