-- Security hardening: role/admin/partner privilege boundaries.
--
-- Confirmed issues:
-- 1) public.user_roles was writable by any authenticated user with the broad
--    app_role = 'admin'. OneMil now has scoped subadmins via admin_permissions,
--    so direct table writes bypassed the safer superadmin-only set_user_role RPC.
-- 2) public.admin_set_partner_status was callable by any admin and had no fixed
--    search_path, while the partner portal admin UI is superadmin-only.
-- 3) A partner could UPDATE every column on their own partners row, including
--    status/admin-controlled fields, by calling PostgREST directly.

-- Keep role reads needed by the app, but make all direct role mutations
-- superadmin-only. Ordinary users can still read their own role, and scoped
-- admins with users.view.basic can read roles for the user-management page.
DROP POLICY IF EXISTS admin_read_all_roles ON public.user_roles;
DROP POLICY IF EXISTS admin_insert_roles ON public.user_roles;
DROP POLICY IF EXISTS admin_update_roles ON public.user_roles;

CREATE POLICY user_roles_read_own_superadmin_or_users_basic
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_superadmin()
  OR public.has_admin_permission('users.view.basic', auth.uid())
);

CREATE POLICY user_roles_insert_superadmin_only
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (public.is_superadmin());

CREATE POLICY user_roles_update_superadmin_only
ON public.user_roles
FOR UPDATE
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

CREATE POLICY user_roles_delete_superadmin_only
ON public.user_roles
FOR DELETE
TO authenticated
USING (public.is_superadmin());

-- Do not expose the role-management RPC to anon. Authenticated callers still
-- hit the function's internal superadmin checks, preserving the existing
-- browser superadmin flow. Recreate the function to keep the database contract
-- self-contained in this hardening migration.
CREATE OR REPLACE FUNCTION public.set_user_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_claim_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
  v_caller_role text;
  v_target_current_role text;
  v_is_partner boolean;
BEGIN
  IF p_role NOT IN ('user', 'admin', 'superadmin') THEN
    RAISE EXCEPTION 'Invalid role: %. Allowed values: user, admin, superadmin', p_role;
  END IF;

  IF v_claim_role <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required.';
    END IF;

    IF auth.uid() = p_user_id THEN
      RAISE EXCEPTION 'You cannot change your own role.';
    END IF;

    SELECT role::text INTO v_caller_role
    FROM public.user_roles
    WHERE user_id = auth.uid();

    IF v_caller_role IS NULL THEN
      RAISE EXCEPTION 'Caller has no system role.';
    END IF;

    IF v_caller_role <> 'superadmin' THEN
      RAISE EXCEPTION 'Only superadmin can change user roles.';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.partners WHERE auth_user_id = p_user_id
  ) INTO v_is_partner;

  IF v_is_partner THEN
    RAISE EXCEPTION 'Partner account roles cannot be changed.';
  END IF;

  SELECT role::text INTO v_target_current_role
  FROM public.user_roles
  WHERE user_id = p_user_id;

  IF p_role <> 'superadmin' AND v_target_current_role = 'superadmin' THEN
    IF (SELECT count(*) FROM public.user_roles WHERE role = 'superadmin') <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last superadmin.';
    END IF;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, p_role::public.app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;

  UPDATE public.users SET role = p_role WHERE id = p_user_id;

  INSERT INTO public.audit_logs (event, event_type, user_id, reference_id, metadata)
  VALUES (
    'user_role_updated',
    'role_change',
    auth.uid(),
    p_user_id,
    jsonb_build_object(
      'target_user_id', p_user_id,
      'new_role', p_role,
      'previous_role', COALESCE(v_target_current_role, 'none'),
      'changed_by', auth.uid()
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_user_role(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_user_role(uuid, text) TO service_role;

-- Partner status management is a superadmin portal action.
CREATE OR REPLACE FUNCTION public.admin_set_partner_status(
  p_partner_id uuid,
  p_status public.partner_status,
  p_notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  IF COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Only superadmin can change partner status';
  END IF;

  UPDATE public.partners
  SET status = p_status,
      approved_at = CASE WHEN p_status = 'approved' THEN now() ELSE approved_at END,
      suspended_at = CASE WHEN p_status = 'suspended' THEN now() ELSE NULL END,
      rejected_at = CASE WHEN p_status = 'rejected' THEN now() ELSE NULL END,
      notes = COALESCE(p_notes, notes),
      updated_at = now()
  WHERE id = p_partner_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner not found';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_partner_status(uuid, public.partner_status, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_partner_status(uuid, public.partner_status, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, public.partner_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_partner_status(uuid, public.partner_status, text) TO service_role;

-- The broad admin partner update policy no longer maps to a scoped permission.
-- Keep superadmin direct-table administration and the existing own-partner
-- policy; the trigger below prevents own-partner updates from touching
-- admin-controlled columns.
DROP POLICY IF EXISTS partners_update_admin ON public.partners;

CREATE POLICY partners_update_superadmin
ON public.partners
FOR UPDATE
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

CREATE OR REPLACE FUNCTION public.guard_partner_self_update_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_claim_role text := COALESCE(current_setting('request.jwt.claim.role', true), '');
BEGIN
  -- Internal service/admin automation and superadmins keep their existing
  -- capabilities. The guard is only for a partner updating their own row via
  -- the client API.
  IF v_claim_role = 'service_role' OR public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL
     AND OLD.auth_user_id IS NOT DISTINCT FROM auth.uid()
     AND NEW.auth_user_id IS NOT DISTINCT FROM OLD.auth_user_id THEN
    IF
      NEW.status IS DISTINCT FROM OLD.status OR
      NEW.approved_at IS DISTINCT FROM OLD.approved_at OR
      NEW.suspended_at IS DISTINCT FROM OLD.suspended_at OR
      NEW.rejected_at IS DISTINCT FROM OLD.rejected_at OR
      NEW.price_per_coin IS DISTINCT FROM OLD.price_per_coin OR
      NEW.vat_rate IS DISTINCT FROM OLD.vat_rate OR
      NEW.mc_per_99_czk IS DISTINCT FROM OLD.mc_per_99_czk OR
      NEW.notes IS DISTINCT FROM OLD.notes OR
      NEW.referred_by_affiliate_id IS DISTINCT FROM OLD.referred_by_affiliate_id OR
      NEW.shoptet_import_enabled IS DISTINCT FROM OLD.shoptet_import_enabled OR
      NEW.shoptet_export_secret_name IS DISTINCT FROM OLD.shoptet_export_secret_name OR
      NEW.shoptet_customer_delivery IS DISTINCT FROM OLD.shoptet_customer_delivery OR
      NEW.reward_trigger_status IS DISTINCT FROM OLD.reward_trigger_status
    THEN
      RAISE EXCEPTION 'Partner self-service cannot update admin-controlled partner fields';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS guard_partner_self_update_sensitive_fields ON public.partners;
CREATE TRIGGER guard_partner_self_update_sensitive_fields
BEFORE UPDATE ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.guard_partner_self_update_sensitive_fields();
