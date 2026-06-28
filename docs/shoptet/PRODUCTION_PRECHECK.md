# Production Precheck for Shoptet Phase 2 Rollout

**Status:** Ready for execution  
**Executor:** Pavel or designated DevOps team member with production DB access  
**Date:** 28. 06. 2026  
**Project:** `xkzhjldrojjlrkezorey`  
**Read-only only** — no changes, no deployments, no emails, no code changes

---

## Precheck Checklist

### 1. Git Status ✅

**Action:** Run in local repo
```bash
cd /path/to/million-ticket-draw
git log --oneline -1
git status
```

**Expected:**
- Latest commit is `67955bfa` (docs: Shoptet Phase 2 E2E staging test passed...)
- Branch is `main`
- Working tree is clean (only `.claude/worktrees/` may show modified)

**Go/No-Go:** ✅ PASS if commit `67955bfa` is latest and `main` is clean

---

### 2. Backup Verification

**Action:** Check if production backup exists and is valid

**Current Status:**
- No backups directory found in repo (gitignored — expected)
- Must create manual backup BEFORE rollout

**Exact Command** (run via Supabase CLI or manuually):
```bash
pg_dump --host=xkzhjldrojjlrkezorey.supabase.co \
  --username=postgres \
  --dbname=postgres \
  --format=custom > backups/onemil-production-pre-shoptet-phase2-$(date +%Y%m%d-%H%M%S).dump
```

**Verify Backup:**
```bash
pg_restore -l backups/onemil-production-pre-shoptet-phase2-*.dump | wc -l
# Expected: 2200+ TOC entries
```

**Go/No-Go:** ✅ PASS only if backup file exists and `pg_restore -l` succeeds

---

### 3. Production Database State

**Executor:** Run these queries in **Supabase SQL Editor** on production `xkzhjldrojjlrkezorey`

#### 3.1 Check for `shoptet_connection_requests` table

```sql
-- Should return 0 rows (table does not exist yet)
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_catalog='postgres' 
    AND table_schema='public' 
    AND table_name='shoptet_connection_requests'
) AS table_exists;
```

**Expected:** `table_exists = false`  
**Go/No-Go:** ✅ PASS if false (means table needs to be created by migration)

---

#### 3.2 Check for `partners.reward_trigger_status` column

```sql
-- Should return 0 rows (column does not exist yet)
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name='partners' AND column_name='reward_trigger_status'
) AS column_exists;
```

**Expected:** `column_exists = false`  
**Go/No-Go:** ✅ PASS if false (means column needs to be added by migration)

---

#### 3.3 BOHEMIA Partner Current State (CRITICAL SAFETY CHECK)

```sql
-- Should show BOHEMIA with delivery='partner' unchanged
SELECT 
  id,
  name,
  shoptet_customer_delivery,
  shoptet_import_enabled,
  status
FROM partners
WHERE id = '61c23960-7271-4c75-a1a4-dcb6e81b41ce';
```

**Expected Result:**
```
id                                   | name     | shoptet_customer_delivery | shoptet_import_enabled | status
61c23960-7271-4c75-a1a4-dcb6e81b41ce | BOHEMIA  | partner                  | true                   | approved
```

**Go/No-Go:** ⚠️ WARNING if `shoptet_customer_delivery` is not `'partner'`  
**Go/No-Go:** ❌ FAIL if `shoptet_customer_delivery` is `'onemil'` or `'both'`

---

#### 3.4 BOHEMIA Reward Codes with external_order_id

```sql
-- Should show 2 codes from Phase 1 live issuance
SELECT COUNT(*) as code_count
FROM partner_reward_codes
WHERE partner_id = '61c23960-7271-4c75-a1a4-dcb6e81b41ce'
  AND external_order_id IS NOT NULL;
```

**Expected:** `code_count = 2`  
**Context:** Codes from Phase 1 live run (`2026000001`, `2026000002`)

**Go/No-Go:** ✅ PASS if count is 2

---

#### 3.5 Email Queue Pending Count

```sql
-- Should be 0 (BOHEMIA uses partner delivery mode)
SELECT COUNT(*) as pending_count
FROM email_queue
WHERE status = 'pending';
```

**Expected:** `pending_count = 0`  
**Context:** BOHEMIA partner mode does not send emails from OneMil

**Go/No-Go:** ✅ PASS if count is 0

---

#### 3.6 Latest Shoptet Import Run Status

```sql
-- Should show Phase 1 live run with status='ok'
SELECT 
  id,
  partner_id,
  trigger,
  mode,
  status,
  rows_valid,
  rows_created,
  finished_at
FROM shoptet_import_runs
ORDER BY created_at DESC
LIMIT 1;
```

**Expected Status:** `status = 'ok'`  
**Expected Mode:** `mode = 'live'`  
**Expected Rows:** `rows_valid = 2, rows_created = 2`

**Go/No-Go:** ✅ PASS if latest run status is `'ok'`

---

### 4. Edge Functions Status

**Executor:** Check production via Supabase UI or CLI

**Action:** Run via Supabase CLI
```bash
supabase functions list --project-ref xkzhjldrojjlrkezorey
```

**Expected:** These functions should NOT exist yet (will be deployed during rollout)
- `submit-shoptet-connection` — will deploy v1
- `approve-shoptet-connection` — will deploy v1
- `import-shoptet-orders` — will deploy v5 (replaces existing version)

**Go/No-Go:** ✅ PASS if first two don't exist and third can be replaced

---

## Precheck Summary Template

After running all checks above, fill in this summary:

```
PRODUCTION PRECHECK SUMMARY
Date: _______________
Executor: _______________

Git status:                  ✅ PASS / ❌ FAIL
Backup verified:            ✅ PASS / ❌ FAIL (file: _______________)
shoptet_connection_requests exists:     ✅ PASS / ❌ FAIL (should be NO)
reward_trigger_status exists:           ✅ PASS / ❌ FAIL (should be NO)
BOHEMIA delivery='partner':             ✅ PASS / ❌ FAIL (critical!)
BOHEMIA import_enabled=true:            ✅ PASS / ❌ FAIL
BOHEMIA reward codes count=2:           ✅ PASS / ❌ FAIL
Email queue pending=0:                  ✅ PASS / ❌ FAIL
Latest import run status='ok':          ✅ PASS / ❌ FAIL
EF deployment possible:                 ✅ PASS / ❌ FAIL

OVERALL PRECHECK:           ✅ GO / ❌ NO-GO

Blockers (if any):
- _________________________________
- _________________________________

Notes:
- _________________________________
```

---

## Go/No-Go Decision Criteria

**PRECHECK PASSES if:**
- ✅ Git is on commit `67955bfa` and clean
- ✅ Backup exists and `pg_restore -l` works
- ✅ `shoptet_connection_requests` table does NOT exist (will be created)
- ✅ `partners.reward_trigger_status` column does NOT exist (will be added)
- ✅ BOHEMIA `shoptet_customer_delivery = 'partner'` (unchanged)
- ✅ BOHEMIA `shoptet_import_enabled = true`
- ✅ BOHEMIA has 2 reward codes with `external_order_id`
- ✅ Email queue has 0 pending emails
- ✅ Latest import run status is `'ok'`

**PRECHECK FAILS if:**
- ❌ Git is not at `67955bfa` or working tree is dirty
- ❌ Backup does not exist or cannot be validated
- ❌ BOHEMIA `shoptet_customer_delivery` is anything other than `'partner'`
- ❌ BOHEMIA has been modified since Phase 1

---

## After Precheck Passes

**Exact Next Safe Steps:**
1. **Do NOT proceed** until all precheck items are green
2. Create production backup (if not already done in step 2)
3. Send approval text to Claude Code:
   ```
   Schvaluji produkční rollout Shoptet Phase 2: aplikovat migrace, nasadit EF 
   `submit-shoptet-connection`, `approve-shoptet-connection`, `import-shoptet-orders` v5, 
   publikovat frontend. Rozumím rizikům a potvrzuji zálohu.
   ```
4. Execute production rollout per `PRODUCTION_ROLLOUT_PLAN.md`

---

## Safety Reminders

- 🔒 **Read-only only** — no changes to production during precheck
- 🔒 **No emails sent** during precheck
- 🔒 **No codes created** during precheck
- 🔒 **BOHEMIA must not be modified** before rollout approval
- 🔒 **Backup is mandatory** before any rollout steps
- 🔒 **All precheck items must pass** before proceeding to rollout

---

## Rollback if Needed

If precheck FAILS:
1. **Do NOT proceed with rollout**
2. Investigate why expectations are not met
3. Confirm BOHEMIA is unchanged
4. Get clarification from team lead
5. Run precheck again only after issues are resolved

