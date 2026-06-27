-- ============================================================================
-- Shoptet Phase 1A rollback package
-- ============================================================================
-- Target project: xkzhjldrojjlrkezorey (PRODUCTION)
--
-- Reverses ONLY the additive DB foundation from:
--   supabase/migrations/20260624160000_shoptet_import_phase1a.sql
--
-- Phase 1A created:
--   * public.partners.shoptet_import_enabled
--   * public.partners.shoptet_export_secret_name
--   * public.partners.shoptet_customer_delivery
--   * constraint partners_shoptet_customer_delivery_check
--   * public.shoptet_import_runs
--   * public.shoptet_import_row_log
--   * public.set_shoptet_export_secret(uuid, text)
--   * public.get_shoptet_export_url(uuid)
--
-- Safety posture:
--   * Disable Shoptet import before removing anything.
--   * Never delete Vault secrets from this rollback.
--   * Drop monitoring tables only when they are empty.
--   * Drop partner columns only when no Shoptet config/secret reference remains.
--   * Leave evidence/config in place with NOTICEs if rollback is not safe.
--
-- MUST NOT touch:
--   * public.partner_reward_codes
--   * public.partner_coin_activations
--   * public.email_queue
--   * public.partners rows unrelated to the three Shoptet columns
--   * Vault secret rows / decrypted secret values
--   * Edge Functions, deployments, emails, reward issuance, or redeem flow
--
-- Before production use:
--   1. Confirm target project is exactly xkzhjldrojjlrkezorey.
--   2. Confirm a fresh production backup exists and restore-list check passes.
--   3. Review any existing shoptet_import_runs / shoptet_import_row_log rows.
--   4. Review any partners.shoptet_export_secret_name values without printing
--      the underlying Shoptet URL or Vault secret payload.
--
-- Idempotent: safe to run again. It may intentionally leave non-empty
-- monitoring tables or configured partner columns in place.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Freeze Shoptet import use first.
-- ---------------------------------------------------------------------------
-- This disables every configured Shoptet import flag, including BOHEMIA if it
-- is enabled. It does not alter partner identity, API keys, reward codes,
-- email queue rows, or Vault secret payloads.
DO $$
BEGIN
  IF to_regclass('public.partners') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'partners'
         AND column_name = 'shoptet_import_enabled'
     )
  THEN
    UPDATE public.partners
       SET shoptet_import_enabled = false,
           updated_at = now()
     WHERE shoptet_import_enabled IS TRUE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Remove service-role-only Shoptet Vault RPC surface.
-- ---------------------------------------------------------------------------
-- Revoke first for defense-in-depth. Dropping these functions does NOT delete
-- Vault secrets and does NOT print decrypted Shoptet URLs. The to_regprocedure
-- guards keep this rollback idempotent if the functions are already gone.
DO $$
BEGIN
  IF to_regprocedure('public.set_shoptet_export_secret(uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.set_shoptet_export_secret(uuid, text)
      FROM public, anon, authenticated, service_role;
  END IF;

  IF to_regprocedure('public.get_shoptet_export_url(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_shoptet_export_url(uuid)
      FROM public, anon, authenticated, service_role;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.set_shoptet_export_secret(uuid, text);
DROP FUNCTION IF EXISTS public.get_shoptet_export_url(uuid);

-- ---------------------------------------------------------------------------
-- 3. Drop Shoptet monitoring tables only when safe.
-- ---------------------------------------------------------------------------
-- Keep tables if they contain production run evidence. Operators can review and
-- archive those rows separately, then rerun this rollback if table removal is
-- still desired.
DO $$
DECLARE
  v_runs_count bigint := 0;
  v_row_log_count bigint := 0;
BEGIN
  IF to_regclass('public.shoptet_import_row_log') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.shoptet_import_row_log' INTO v_row_log_count;
  END IF;

  IF to_regclass('public.shoptet_import_runs') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.shoptet_import_runs' INTO v_runs_count;
  END IF;

  IF v_row_log_count = 0 AND v_runs_count = 0 THEN
    DROP TABLE IF EXISTS public.shoptet_import_row_log;
    DROP TABLE IF EXISTS public.shoptet_import_runs;
  ELSE
    RAISE NOTICE 'Keeping Shoptet monitoring tables: shoptet_import_runs rows=%, shoptet_import_row_log rows=%',
      v_runs_count, v_row_log_count;

    -- Remove admin read policies/grants from retained tables so they become
    -- inert evidence tables unless explicitly re-enabled later.
    IF to_regclass('public.shoptet_import_row_log') IS NOT NULL THEN
      DROP POLICY IF EXISTS shoptet_import_row_log_admin_read ON public.shoptet_import_row_log;
    END IF;

    IF to_regclass('public.shoptet_import_runs') IS NOT NULL THEN
      DROP POLICY IF EXISTS shoptet_import_runs_admin_read ON public.shoptet_import_runs;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Remove partner Shoptet columns only when safe.
-- ---------------------------------------------------------------------------
-- Columns are dropped only if there is no enabled import, no Vault secret-name
-- reference, and no non-default delivery mode. This avoids losing production
-- configuration or orphaning an unexplained Vault reference during rollback.
DO $$
DECLARE
  v_has_columns boolean := false;
  v_configured_count bigint := 0;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'partners'
      AND column_name IN (
        'shoptet_import_enabled',
        'shoptet_export_secret_name',
        'shoptet_customer_delivery'
      )
  )
  INTO v_has_columns;

  IF NOT v_has_columns THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    SELECT count(*)
    FROM public.partners
    WHERE coalesce(shoptet_import_enabled, false) IS TRUE
       OR shoptet_export_secret_name IS NOT NULL
       OR coalesce(shoptet_customer_delivery, 'partner') <> 'partner'
  $sql$
  INTO v_configured_count;

  IF v_configured_count = 0 THEN
    ALTER TABLE public.partners
      DROP CONSTRAINT IF EXISTS partners_shoptet_customer_delivery_check;

    ALTER TABLE public.partners
      DROP COLUMN IF EXISTS shoptet_import_enabled,
      DROP COLUMN IF EXISTS shoptet_export_secret_name,
      DROP COLUMN IF EXISTS shoptet_customer_delivery;
  ELSE
    RAISE NOTICE 'Keeping Shoptet partner columns because % partner row(s) still contain Shoptet config or Vault secret-name references',
      v_configured_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Manual post-rollback review (run separately; do not print secrets)
-- ============================================================================
-- Expected if rollback could fully remove Phase 1A:
--   * public.set_shoptet_export_secret(uuid, text) does NOT exist
--   * public.get_shoptet_export_url(uuid) does NOT exist
--   * public.shoptet_import_runs does NOT exist, OR exists only if non-empty
--   * public.shoptet_import_row_log does NOT exist, OR exists only if non-empty
--   * public.partners Shoptet columns do NOT exist, OR remain because config
--     / secret-name references were intentionally preserved
--   * No rows in public.partner_reward_codes were changed
--   * No rows in public.email_queue were changed
--
-- If partner columns remain, import must stay disabled:
--   SELECT count(*) AS enabled_imports
--   FROM public.partners
--   WHERE shoptet_import_enabled IS TRUE;
--
-- If monitoring tables remain, review counts only unless owner explicitly
-- approves exporting detailed row evidence:
--   SELECT count(*) FROM public.shoptet_import_runs;
--   SELECT count(*) FROM public.shoptet_import_row_log;
-- ============================================================================
