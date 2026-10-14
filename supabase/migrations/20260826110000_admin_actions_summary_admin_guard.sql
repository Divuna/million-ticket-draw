-- F3 (critical) — public.get_admin_actions_summary(...) was SECURITY DEFINER with
-- no admin guard and EXECUTE granted to anon.
--
-- Reproduced on staging as role anon (transaction rolled back). The function
-- joins admin_actions to users and STRING_AGGs u.email into its output, so an
-- unauthenticated caller received real admin identities plus what they did and
-- when:
--
--   total_actions   5
--   unique_admins   1
--   recent_actions  "superadmin-e2e@onemil.cz: contest_create on contests at
--                    2026-08-26 | superadmin-e2e@onemil.cz: miocoin_bulk_create
--                    on bonus_prizes at 2026-08-26 | ..."
--
-- Staging and production carried a byte-identical definition (md5 2de4e8ea...),
-- so this was not environment drift.
--
-- Fix — the function body is preserved verbatim; only a guard is prepended and
-- the grants are tightened. The shape deliberately mirrors its closest sibling,
-- public.get_admin_activation_summary(): SECURITY DEFINER, search_path = public,
-- an is_admin() guard inside, no anon EXECUTE.
--
-- Why public.is_admin(): it is the canonical guard for generic admin RPCs in this
-- project (admin_mark_partner_invoice_paid, admin_set_partner_commercial_terms,
-- create_partner_api_key, get_admin_activation_summary, ... 8 functions), it
-- resolves admin OR superadmin through the canonical public.user_roles, and it
-- therefore keeps working for the production drift account that has
-- user_roles.role = 'admin' while users.role = 'user'. has_admin_permission() is
-- not used because it is the sales-leads module pattern and needs a permission
-- key; is_superadmin() would be too narrow and would lock out plain admins.
--
-- A service_role call is rejected by the guard, because service_role carries no
-- auth.uid(). That is intentional and breaks nothing: the function has ZERO
-- callers — no .rpc() in src/, no Edge Function, no other database function, no
-- view. The admin audit UI (/admin/audit-logs) reads event_logs and users
-- directly and never touched this RPC. The EXECUTE grant service_role already
-- held is left in place rather than revoked, so nothing silently changes for
-- future internal tooling; such a caller would simply need its own path.
--
-- Also fixed here: public.get_admin_summary_dashboard(). It is the same class of
-- hole found while checking requirement "no leak of e-mails or admin actions
-- through another related RPC" — SECURITY DEFINER, anon-executable, no guard,
-- and its body reads payments joined to users.email, notifications joined to
-- users.email, and admin_actions. It does NOT leak today only because it is
-- broken: every call, including anon, dies on 42803 "aggregate function calls
-- cannot be nested". That bug is the only thing standing between anon and the
-- data, so the door is closed now rather than left to be reopened by whoever
-- repairs the SQL. Its single caller is src/tests/AdminValidationWorkflows.tsx,
-- an admin-only test page, which is already failing on that same 42803. The SQL
-- bug itself is deliberately NOT repaired here — that is a behaviour change, not
-- a security fix.
--
-- Deliberately NOT touched (recorded, not fixed — outside this finding):
--   * test_admin_security_rls() and test_audit_logging() are anon-executable and
--     read admin_actions, but disclose only counts ("Nalezeno 27 admin akcí"),
--     no e-mails and no action detail.
--   * get_due_offer_reminder_rows() is anon-executable and touches e-mail, but it
--     belongs to the offer-reminder cron path (send-offer-reminders Edge
--     Function), not to admin audit.
--
-- No data is changed, no audit row is written, no audit logic is altered.

BEGIN;

-- 1. get_admin_actions_summary: guard + lock down grants.
--    Body below is the live definition verbatim; only the guard block is new.
CREATE OR REPLACE FUNCTION public.get_admin_actions_summary(
  p_limit integer DEFAULT 50,
  p_action_type text DEFAULT NULL::text,
  p_target_table text DEFAULT NULL::text,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(summary_line text, total_actions bigint, unique_admins bigint, recent_actions text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH filtered_actions AS (
    SELECT 
      aa.*,
      u.email as admin_email,
      u.name as admin_name
    FROM admin_actions aa
    LEFT JOIN users u ON aa.admin_id = u.id
    WHERE 
      (p_action_type IS NULL OR aa.action_type = p_action_type)
      AND (p_target_table IS NULL OR aa.target_table = p_target_table)
      AND (p_date_from IS NULL OR aa.timestamp >= p_date_from)
      AND (p_date_to IS NULL OR aa.timestamp <= p_date_to)
    ORDER BY aa.timestamp DESC
    LIMIT p_limit
  ),
  aggregated_data AS (
    SELECT
      COUNT(*) as total_count,
      COUNT(DISTINCT admin_id) as unique_admin_count,
      STRING_AGG(
        CONCAT(
          admin_email, ': ', action_type, ' on ', target_table, 
          ' at ', timestamp::date
        ),
        ' | '
        ORDER BY timestamp DESC
      ) as actions_summary
    FROM filtered_actions
  )
  SELECT 
    CONCAT('Total: ', total_count, ' actions by ', unique_admin_count, ' admins'),
    total_count,
    unique_admin_count,
    actions_summary
  FROM aggregated_data;
END;
$function$;

-- Supabase adds implicit grants, so revoke explicitly.
REVOKE ALL ON FUNCTION public.get_admin_actions_summary(integer, text, text, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_actions_summary(integer, text, text, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_actions_summary(integer, text, text, timestamptz, timestamptz) TO authenticated;

-- 2. get_admin_summary_dashboard: same guard, same grants.
--    Revoking anon alone would not be enough — an authenticated non-admin would
--    still get the payments/e-mails/admin_actions payload the moment somebody
--    repairs the 42803 bug. The guard is injected into the function's own live
--    definition so the (buggy) body stays byte-identical apart from the guard,
--    and so the staging/production formatting drift is preserved. The DO block
--    refuses to run if the expected marker is missing, and is a no-op if a guard
--    is already there.
DO $do$
DECLARE
  v_def   text;
  v_new   text;
  v_guard text := 'BEGIN' || chr(10) ||
                  '  IF NOT public.is_admin() THEN' || chr(10) ||
                  '    RAISE EXCEPTION ''forbidden'' USING ERRCODE = ''42501'';' || chr(10) ||
                  '  END IF;' || chr(10) || chr(10) ||
                  '  RETURN QUERY';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_admin_summary_dashboard'
    AND p.pronargs = 0;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'get_admin_summary_dashboard() not found';
  END IF;

  IF v_def LIKE '%public.is_admin()%' THEN
    RAISE NOTICE 'get_admin_summary_dashboard() already guarded — skipping';
    RETURN;
  END IF;

  v_new := regexp_replace(v_def, 'BEGIN\r?\n  RETURN QUERY', v_guard);

  IF v_new = v_def THEN
    RAISE EXCEPTION 'expected BEGIN/RETURN QUERY marker not found in get_admin_summary_dashboard()';
  END IF;

  EXECUTE v_new;
END
$do$;

REVOKE ALL ON FUNCTION public.get_admin_summary_dashboard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_summary_dashboard() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_summary_dashboard() TO authenticated;

COMMIT;
