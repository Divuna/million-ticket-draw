-- ============================================================================
-- Shoptet Phase 1A production reconciliation package
-- ============================================================================
-- Target project: xkzhjldrojjlrkezorey (PRODUCTION)
--
-- Purpose:
--   Reconcile a partial Phase 1A production state by adding/verifying only the
--   missing DB foundation from:
--     supabase/migrations/20260624160000_shoptet_import_phase1a.sql
--
-- Observed precheck state before preparing this package:
--   * public.shoptet_import_runs exists and is empty.
--   * public.shoptet_import_row_log exists and is empty.
--   * public.partners Shoptet columns are missing.
--   * public.set_shoptet_export_secret(uuid, text) is missing.
--   * public.get_shoptet_export_url(uuid) is missing.
--   * Shoptet Edge Functions are already deployed; this SQL does not deploy.
--   * email_queue has 3 pending invoice emails; this SQL does not touch them.
--
-- This script is idempotent and conservative.
--
-- It DOES:
--   * add missing Shoptet columns to public.partners with safe defaults;
--   * add the Shoptet delivery check constraint if absent;
--   * create/verify Shoptet monitoring tables;
--   * enable RLS on the monitoring tables;
--   * create/replace intended admin/superadmin read policies;
--   * create/replace two Vault-backed RPCs;
--   * revoke RPC execute from public/anon/authenticated;
--   * grant RPC execute to service_role only.
--
-- It DOES NOT:
--   * enable BOHEMIA import;
--   * store, update, print, or delete Vault secrets;
--   * touch public.email_queue;
--   * touch public.partner_reward_codes;
--   * create reward codes;
--   * send emails;
--   * deploy Edge Functions;
--   * run a Shoptet dry-run.
--
-- Before execution:
--   1. Confirm target project is exactly xkzhjldrojjlrkezorey.
--   2. Confirm fresh production backup exists and restore-list check passed.
--   3. Confirm Pavel approved this exact reconciliation package.
--   4. Confirm the 3 pending invoice emails remain an owner-decision item and
--      are not processed by this reconciliation.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Per-partner Shoptet config columns.
-- ---------------------------------------------------------------------------
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS shoptet_import_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS shoptet_export_secret_name text;

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS shoptet_customer_delivery text NOT NULL DEFAULT 'partner';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'partners_shoptet_customer_delivery_check'
      AND conrelid = 'public.partners'::regclass
  ) THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_shoptet_customer_delivery_check
      CHECK (shoptet_customer_delivery IN ('partner','onemil','both'));
  END IF;
END $$;

-- This reconciliation intentionally does not enable or disable any partner
-- import flags. Newly added columns default to disabled. Any later BOHEMIA
-- enablement must be a separate approved step.

-- ---------------------------------------------------------------------------
-- 2. Import run monitoring tables.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shoptet_import_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id               uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  trigger                  text NOT NULL DEFAULT 'admin'   CHECK (trigger IN ('admin','cron')),
  mode                     text NOT NULL DEFAULT 'dry_run' CHECK (mode IN ('dry_run','live')),
  status                   text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','partial','failed')),
  rows_total               integer NOT NULL DEFAULT 0,
  rows_valid               integer NOT NULL DEFAULT 0,
  rows_invalid             integer NOT NULL DEFAULT 0,
  rows_would_create        integer NOT NULL DEFAULT 0,
  rows_would_status_update integer NOT NULL DEFAULT 0,
  rows_skipped_dup         integer NOT NULL DEFAULT 0,
  rows_created             integer NOT NULL DEFAULT 0,
  rows_status_updated      integer NOT NULL DEFAULT 0,
  rows_failed              integer NOT NULL DEFAULT 0,
  error_summary            text,
  started_at               timestamptz NOT NULL DEFAULT now(),
  finished_at              timestamptz
);

ALTER TABLE public.shoptet_import_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.shoptet_import_row_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES public.shoptet_import_runs(id) ON DELETE CASCADE,
  external_order_id text,
  action            text NOT NULL CHECK (action IN
                      ('would_create','would_status_update','skip_dup','invalid','error','create','status_update')),
  result            text,
  message           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shoptet_import_row_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_shoptet_import_runs_partner
  ON public.shoptet_import_runs (partner_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_shoptet_import_row_log_run
  ON public.shoptet_import_row_log (run_id);

-- Admin/superadmin read only. Writes are intentionally not granted through RLS;
-- service_role bypass is used by the importer.
DROP POLICY IF EXISTS shoptet_import_runs_admin_read ON public.shoptet_import_runs;
CREATE POLICY shoptet_import_runs_admin_read ON public.shoptet_import_runs
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_superadmin());

DROP POLICY IF EXISTS shoptet_import_row_log_admin_read ON public.shoptet_import_row_log;
CREATE POLICY shoptet_import_row_log_admin_read ON public.shoptet_import_row_log
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_superadmin());

-- ---------------------------------------------------------------------------
-- 3. Vault-backed RPCs. Service-role only.
-- ---------------------------------------------------------------------------
-- Stores the Shoptet export URL in Vault. The URL itself is never returned by
-- this function; only the secret name is returned.
CREATE OR REPLACE FUNCTION public.set_shoptet_export_secret(p_partner_id uuid, p_url text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_name text;
  v_existing uuid;
BEGIN
  IF p_partner_id IS NULL OR nullif(trim(coalesce(p_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'partner_id and url are required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = p_partner_id) THEN
    RAISE EXCEPTION 'partner not found';
  END IF;

  v_name := 'shoptet_export_url_' || replace(p_partner_id::text, '-', '');

  SELECT id INTO v_existing
    FROM vault.secrets
   WHERE name = v_name;

  IF v_existing IS NULL THEN
    PERFORM vault.create_secret(p_url, v_name, 'Shoptet CSV export URL');
  ELSE
    PERFORM vault.update_secret(v_existing, p_url, v_name, 'Shoptet CSV export URL');
  END IF;

  UPDATE public.partners
     SET shoptet_export_secret_name = v_name,
         updated_at = now()
   WHERE id = p_partner_id;

  RETURN v_name;
END $$;

REVOKE ALL ON FUNCTION public.set_shoptet_export_secret(uuid, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_shoptet_export_secret(uuid, text)
  TO service_role;

-- Server-side read of the decrypted URL for importer Edge Function use.
-- This function must remain service-role only.
CREATE OR REPLACE FUNCTION public.get_shoptet_export_url(p_partner_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_name text;
  v_url text;
BEGIN
  SELECT shoptet_export_secret_name INTO v_name
    FROM public.partners
   WHERE id = p_partner_id;

  IF v_name IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
   WHERE name = v_name;

  RETURN v_url;
END $$;

REVOKE ALL ON FUNCTION public.get_shoptet_export_url(uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shoptet_export_url(uuid)
  TO service_role;

COMMIT;

-- ============================================================================
-- Post-apply verification queries for later approved execution.
-- Run separately and report only booleans/counts. Do not print secrets, URLs,
-- reward codes, hashes, tokens, or customer emails.
-- ============================================================================
-- 1. Partner columns exist:
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'partners'
--   AND column_name IN (
--     'shoptet_import_enabled',
--     'shoptet_export_secret_name',
--     'shoptet_customer_delivery'
--   )
-- ORDER BY column_name;
--
-- 2. BOHEMIA import remains disabled:
-- SELECT count(*) AS enabled_imports
-- FROM public.partners
-- WHERE shoptet_import_enabled IS TRUE;
--
-- 3. Monitoring tables exist and have RLS enabled:
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE oid IN (
--   'public.shoptet_import_runs'::regclass,
--   'public.shoptet_import_row_log'::regclass
-- );
--
-- 4. RPC execute grants are service_role only:
-- SELECT routine_name, grantee, privilege_type
-- FROM information_schema.routine_privileges
-- WHERE specific_schema = 'public'
--   AND routine_name IN ('set_shoptet_export_secret', 'get_shoptet_export_url')
-- ORDER BY routine_name, grantee;
--
-- 5. Email queue and reward codes untouched by this package:
-- SELECT status, count(*) FROM public.email_queue GROUP BY status ORDER BY status;
-- SELECT count(*) FROM public.partner_reward_codes;
-- ============================================================================
