-- Admin user list with the authoritative login e-mail.
--
-- profiles.email is not guaranteed to be populated or kept in sync with Auth.
-- The admin UI therefore reads a minimal projection from auth.users through this
-- guarded function. No password hashes, tokens, metadata or other Auth secrets
-- are returned.
--
-- Security:
--   - caller must have the admin or superadmin application role;
--   - anon/PUBLIC cannot execute the function;
--   - only the fields required by Administrace -> Uživatelé are exposed.

CREATE OR REPLACE FUNCTION public.get_admin_users_overview()
RETURNS TABLE (
  user_id             uuid,
  email               text,
  full_name           text,
  first_name          text,
  last_name           text,
  role                text,
  created_at          timestamptz,
  is_partner_account  boolean,
  has_user_role       boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.user_roles caller_role
    WHERE caller_role.user_id = auth.uid()
      AND caller_role.role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Admin access required.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    auth_user.id                                             AS user_id,
    auth_user.email::text                                    AS email,
    NULLIF(BTRIM(profile.full_name), '')                      AS full_name,
    NULLIF(BTRIM(profile.first_name), '')                     AS first_name,
    NULLIF(BTRIM(profile.last_name), '')                      AS last_name,
    COALESCE(target_role.role::text, 'user')                  AS role,
    auth_user.created_at                                     AS created_at,
    EXISTS (
      SELECT 1
      FROM public.partners partner
      WHERE partner.auth_user_id = auth_user.id
    )                                                        AS is_partner_account,
    (target_role.role IS NOT NULL)                            AS has_user_role
  FROM auth.users auth_user
  LEFT JOIN public.profiles profile
    ON profile.id = auth_user.id
  LEFT JOIN LATERAL (
    SELECT user_role.role
    FROM public.user_roles user_role
    WHERE user_role.user_id = auth_user.id
    ORDER BY CASE user_role.role
      WHEN 'superadmin' THEN 0
      WHEN 'admin' THEN 1
      ELSE 2
    END
    LIMIT 1
  ) target_role ON true
  WHERE auth_user.deleted_at IS NULL
    AND auth_user.email IS NOT NULL
  ORDER BY
    COALESCE(
      NULLIF(BTRIM(profile.full_name), ''),
      NULLIF(BTRIM(CONCAT_WS(' ', profile.first_name, profile.last_name)), ''),
      auth_user.email
    ),
    auth_user.id;
END;
$$;

COMMENT ON FUNCTION public.get_admin_users_overview() IS
  'Minimal admin-only user list with authoritative e-mail from auth.users.';

REVOKE ALL ON FUNCTION public.get_admin_users_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_users_overview() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_admin_users_overview() TO authenticated;
