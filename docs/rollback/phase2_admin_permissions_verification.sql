-- ============================================================================
-- PHASE 2 PRODUCTION VERIFICATION — admin_permissions DB foundation
-- ============================================================================
-- Target project: xkzhjldrojjlrkezorey (PRODUCTION)
--
-- Read-only. Run AFTER phase2_admin_permissions_apply.sql.
-- Each block prints a single labeled row; STRING_AGG is used to fold
-- multi-row facts (policies, grants, columns) into one readable cell.
-- ============================================================================

-- ── 1. Dependency present (Phase 1 helper) ───────────────────────────────────
SELECT 'dep_is_superadmin' AS check,
       EXISTS (
         SELECT 1 FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'is_superadmin'
       ) AS pass;  -- expect: true

-- ── 2. Table exists + RLS enabled ────────────────────────────────────────────
SELECT 'table_admin_permissions' AS check,
       (c.relname IS NOT NULL)   AS exists,
       c.relrowsecurity          AS rls_enabled  -- expect: true / true
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'admin_permissions';

-- ── 3. Columns (folded) ──────────────────────────────────────────────────────
SELECT 'columns' AS check,
       STRING_AGG(column_name || ':' || data_type, ', ' ORDER BY ordinal_position) AS cols
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'admin_permissions';
-- expect: id:uuid, user_id:uuid, permission_key:text, granted_by:uuid,
--         created_at:timestamp with time zone

-- ── 4. Unique constraint + index ─────────────────────────────────────────────
SELECT 'constraints_indexes' AS check,
       STRING_AGG(DISTINCT conname, ', ') FILTER (WHERE conname IS NOT NULL) AS unique_constraints,
       (SELECT STRING_AGG(indexname, ', ')
          FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'admin_permissions') AS indexes
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'admin_permissions' AND con.contype = 'u';
-- expect: unique on (user_id, permission_key); indexes include idx_admin_permissions_user_id + pkey

-- ── 5. RLS policies (folded) ─────────────────────────────────────────────────
SELECT 'policies' AS check,
       STRING_AGG(policyname || '[' || cmd || ']', ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'admin_permissions';
-- expect: admin_permissions_select[SELECT], admin_permissions_superadmin_write[ALL]

-- ── 6. Helper signature + security ───────────────────────────────────────────
SELECT 'helper_has_admin_permission' AS check,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,         -- expect: true
       r.rolname  AS owner                       -- expect: postgres
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public' AND p.proname = 'has_admin_permission';
-- expect args: check_key text, check_user_id uuid

-- ── 7. Helper execute grants (folded) — must be authenticated only ───────────
SELECT 'helper_grants' AS check,
       STRING_AGG(DISTINCT grantee, ', ' ORDER BY grantee) AS grantees
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'has_admin_permission'
  AND privilege_type = 'EXECUTE';
-- expect: authenticated (NOT anon, NOT PUBLIC)

-- ── 8. Anon must NOT be able to execute the helper ───────────────────────────
SELECT 'anon_helper_execute' AS check,
       has_function_privilege('anon',
         'public.has_admin_permission(text, uuid)', 'EXECUTE') AS anon_can_execute; -- expect: false

-- ── 9. Data sanity — no unexpected permission keys present ────────────────────
-- (Empty immediately after apply. If non-empty later, every key must be one of
--  the four allowed safe keys.)
SELECT 'permission_keys_present' AS check,
       COALESCE(STRING_AGG(DISTINCT permission_key, ', ' ORDER BY permission_key), '(none)') AS keys,
       COUNT(*) AS total_rows,
       COUNT(*) FILTER (
         WHERE permission_key NOT IN
           ('vouchers.manage','content.manage','banners.manage','notifications.manage')
       ) AS unexpected_keys  -- expect: 0
FROM public.admin_permissions;

-- ── 10. Untouched-confirmation — user_roles unchanged & present ───────────────
SELECT 'user_roles_present' AS check,
       EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'user_roles'
       ) AS exists,  -- expect: true
       (SELECT COUNT(*) FROM public.user_roles) AS row_count; -- compare to pre-apply baseline
