# Shoptet Phase 2 — Production Rollout Plan

**Status:** Staging E2E passed ✅ · Production rollout pending approval · Migration files audited ✅  
**Date:** 28. 06. 2026 14:30 UTC · Corrected 28. 06. 2026 after migration audit  
**Staging Project:** `dxmowysntemfqfnanxua`  
**Production Project:** `xkzhjldrojjlrkezorey`

---

## Prerequisites for Production Rollout

1. **Pavel's explicit written approval:** "Schvaluji produkční rollout Shoptet Phase 2: `submit-shoptet-connection`, `approve-shoptet-connection`, `import-shoptet-orders` v5."
2. **Production database backup BEFORE any changes** (manuální `pg_dump`, PITR je OFF).
3. **No concurrent production changes** during rollout.
4. **BOHEMIA partner unchanged** — verify `shoptet_customer_delivery='partner'` remains untouched.

---

## Step-by-Step Production Rollout

### Step 1: Create Production Backup (Required)

```bash
# Manual backup via Supabase UI or CLI
pg_dump --host=prod.supabase.co \
  --username=postgres \
  --dbname=postgres \
  --format=custom > backups/onemil-production-pre-shoptet-phase2-$(date +%Y%m%d-%H%M%S).dump
```

- **Backup location:** `backups/` (gitignored)
- **Verify:** `pg_restore -l backup.dump | wc -l` (should show ~2200+ TOC entries)
- **Document filename in this plan**

### Step 2: Production Database Migrations

**Prerequisites:**
- Staging migration was applied to `dxmowysntemfqfnanxua` and tested (commit `8bef720a`)
- Migration file exists in `supabase/migrations/`

**⚠️ CORRECTED — ONE migration file, not three:**

The earlier rollout plan incorrectly listed three fictional files. The actual migration applied to staging is:

**`supabase/migrations/20260628120000_shoptet_connection_requests.sql`**

This single file covers everything in one atomic transaction:
- `partners.reward_trigger_status` column (default `'paid'`, CHECK paid/shipped/completed)
- `shoptet_connection_requests` table (15 columns, RLS enabled, 4 policies, unique partial index, updated_at trigger)
- Vault helper RPCs: `store_shoptet_pending_url`, `promote_shoptet_pending_url`, `delete_shoptet_pending_url` (service_role only execute)

**Application method:**
- Via Supabase SQL Editor only (never `supabase db push` on production)
- Single transaction — entire file is wrapped in `begin; … commit;`
- Verify with `COMMIT` message in SQL Editor output

**Note:** Phase 1A migration `20260624160000_shoptet_import_phase1a.sql` is already on production (it added `shoptet_import_enabled`, `shoptet_export_secret_name`, `shoptet_customer_delivery`, `shoptet_import_runs` table). Phase 2 migration adds only what is missing: `shoptet_connection_requests` table + `reward_trigger_status` column + Vault RPCs.

### Step 3: Production Edge Function Deployments

**Prerequisites:**
- All three EF source files are committed to `main`
- Staging versions are running and verified (`v5` for each)

**Functions to deploy (in this order):**

1. **`submit-shoptet-connection` (latest version)**
   ```bash
   supabase functions deploy submit-shoptet-connection \
     --project-ref xkzhjldrojjlrkezorey
   ```
   - Auth: Partner JWT or service-role (verify in `index.ts` guard)
   - Stores URL in Vault via `store_shoptet_pending_url` RPC
   - Updates `shoptet_connection_requests` status to 'submitted'

2. **`approve-shoptet-connection` (latest version)**
   ```bash
   supabase functions deploy approve-shoptet-connection \
     --project-ref xkzhjldrojjlrkezorey
   ```
   - Auth: Admin/superadmin JWT via `verify_jwt=true`
   - Promotes Vault URL (pending → final) via `promote_shoptet_pending_url` RPC
   - Updates `partners.shoptet_customer_delivery='onemil'`, copies `reward_trigger_status`
   - Sets `shoptet_import_enabled=true`

3. **`import-shoptet-orders` v5 (replace existing)**
   ```bash
   supabase functions deploy import-shoptet-orders \
     --project-ref xkzhjldrojjlrkezorey
   ```
   - Auth: superadmin JWT or `x-internal-token`
   - Respects `partners.reward_trigger_status` for reward issuance threshold
   - 5-bucket Shoptet status taxonomy: paid / shipped / completed / cancelled / pending

**Verify deployments:**
```bash
supabase functions list --project-ref xkzhjldrojjlrkezorey
```
All three should show as ACTIVE.

### Step 4: Frontend Publish (Lovable)

**Prerequisites:**
- All UI changes (PartnerDashboard Step 5, AdminPartners Step 6) committed to `main`
- Build passes: `npm run build`

**Action:** Pavel publishes via Lovable UI
- Single Publish to production
- No special flags needed
- Live bundle reflects updated partner + admin UI

### Step 5: Production Postcheck (Read-Only)

After all steps are complete, verify:

```sql
-- Verify DB objects exist
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='shoptet_connection_requests') AS table_exists;
SELECT COUNT(*) AS rls_policy_count FROM pg_policies WHERE tablename='shoptet_connection_requests';

-- Verify partner table has new columns
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partners' AND column_name='shoptet_export_secret_name') AS secret_name_exists;
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='partners' AND column_name='shoptet_customer_delivery') AS delivery_exists;

-- Verify BOHEMIA unchanged (critical safety check)
SELECT id, shoptet_customer_delivery, shoptet_import_enabled, status 
FROM partners 
WHERE id='61c23960-7271-4c75-a1a4-dcb6e81b41ce';
-- Expected: shoptet_customer_delivery='partner', status='approved'

-- Verify no test data leaked
SELECT COUNT(*) AS test_requests
FROM shoptet_connection_requests
WHERE shop_name LIKE '%e2e%' OR shop_name LIKE '%test%';
-- Expected: 0
```

### Step 6: Browser Smoke Test (Optional but Recommended)

On production:

1. **Partner login:** `https://onemil.cz/partner/login`
2. **Navigate to `/partner/dashboard`**
3. **Create Shoptet draft:** fill shop_name, reward_czk/mc, trigger_status, save draft
4. **Verify draft persists** (reload page, data still there)
5. **Do NOT submit** real Shoptet URL yet (avoids Vault pollution)
6. **Admin login:** `https://onemil.cz/admin/partners`
7. **Check "Shoptet žádosti" tab:** badge should show 0 (no real requests approved yet)

### Step 7: Rollback Procedure (if needed)

**Rollback is only safe if Step 1 (backup) was completed successfully.**

**Rollback steps:**
1. Restore from backup: `pg_restore -d postgres --clean --if-exists backup.dump`
2. Redeploy previous EF versions (documented in git tags)
3. Refresh Lovable bundle to last known good version

**Rollback testing:**
- Must be tested on staging first (never untested on production)
- Estimated time: 30-45 minutes
- Verify BOHEMIA data integrity post-restore

---

## Safety Checklist

Before rolling out to production, verify:

- [ ] Backup created and verified
- [ ] Staging E2E test passed (documented in CLAUDE.md)
- [ ] No concurrent production changes scheduled
- [ ] Pavel approval documented in text
- [ ] All three migration files reviewed (no breaking changes)
- [ ] All three EF source files reviewed (no secrets exposed)
- [ ] Frontend build passes: `npm run build`
- [ ] BOHEMIA partner record reviewed (should not appear in any request flow)
- [ ] Rollback plan understood and tested on staging

---

## What Does NOT Happen During This Rollout

- ❌ No customer emails sent
- ❌ No reward codes created
- ❌ No Shoptet URLs exposed in logs
- ❌ No BOHEMIA data modified
- ❌ No production customer data modified
- ❌ No existing import runs affected

---

## What Happens After Rollout

1. **Partner can submit real Shoptet URLs** via `/partner/dashboard`
2. **URLs stored securely in Vault** (never in DB)
3. **Admin approves via `/admin/partners`** (triggers EF)
4. **Import runs respecting `reward_trigger_status`** (pay/ship/complete threshold)
5. **Customers receive emails** (default `shoptet_customer_delivery='onemil'`)
6. **BOHEMIA unaffected** (`shoptet_customer_delivery='partner'` remains)

---

## Approval Text for Pavel

**When Pavel is ready to approve, he should send:**

> Schvaluji produkční rollout Shoptet Phase 2: aplikovat migraci `20260628120000_shoptet_connection_requests.sql`, nasadit EF `submit-shoptet-connection`, `approve-shoptet-connection`, `import-shoptet-orders` v5, publikovat frontend. Rozumím rizikům a potvrzuji zálohu.

---

## Contact

For questions or issues:
- Technical: Check staging test artifacts in conversation context
- Safety: Review BOHEMIA verification in postcheck step 5
- Rollback: Use documented procedure; do not attempt without backup
