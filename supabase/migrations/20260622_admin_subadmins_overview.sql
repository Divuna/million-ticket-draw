-- ─────────────────────────────────────────────────────────────────────────────
-- get_admin_subadmins_overview — admin/subadmin status overview for /admin/admins
--
-- Returns, for every admin-level account (role admin or superadmin), a safe
-- read-only projection so the superadmin can see invite + activity status:
--   • invite email status (from public.email_queue — invite is created via
--     admin.createUser, so auth.users.invited_at is NULL and must NOT be used)
--   • account active / password set  (auth.users.last_sign_in_at IS NOT NULL)
--   • last sign-in, last online (public.users.last_seen_at)
--
-- Security:
--   • SECURITY DEFINER, owner postgres — same proven pattern as
--     get_admin_online_users / redeem_miocoin_code (already read auth.users).
--   • SET search_path = public; auth.users is schema-qualified.
--   • Internal gate: caller must be admin or superadmin (via public.user_roles).
--     Non-admins receive zero rows.
--   • Returns ONLY the safe projection below. Never exposes tokens, password
--     hashes, raw user metadata, recovery links, or email bodies.
--
-- Does NOT change RLS, auth settings, invite-subadmin, or any economic flow.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_subadmins_overview()
RETURNS TABLE (
  user_id                uuid,
  email                  text,
  role                   text,
  created_at             timestamptz,
  email_confirmed_at     timestamptz,
  last_sign_in_at        timestamptz,
  full_name              text,
  profile_email          text,
  last_seen_at           timestamptz,
  latest_invite_status   text,
  latest_invite_sent_at  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin / superadmin gate. Non-admins get zero rows (no data leak).
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'superadmin')
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ur.user_id,
    au.email::text                              AS email,
    ur.role::text                               AS role,
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    COALESCE(p.full_name, '')                   AS full_name,
    p.email                                     AS profile_email,
    pu.last_seen_at,
    eq.status                                   AS latest_invite_status,
    eq.sent_at                                  AS latest_invite_sent_at
  FROM public.user_roles ur
  JOIN auth.users au           ON au.id = ur.user_id
  LEFT JOIN public.profiles p  ON p.id  = ur.user_id
  LEFT JOIN public.users pu    ON pu.id = ur.user_id
  LEFT JOIN LATERAL (
    -- Latest subadmin-invite email for this address. Matched by email + the
    -- admin-invite subject. Only status + sent_at are returned (never the body).
    SELECT e.status, e.sent_at
    FROM public.email_queue e
    WHERE e.email = au.email
      AND e.subject ILIKE '%administrace OneMil%'
    ORDER BY COALESCE(e.sent_at, e.created_at) DESC
    LIMIT 1
  ) eq ON true
  WHERE ur.role IN ('admin', 'superadmin')
  ORDER BY
    CASE WHEN ur.role = 'superadmin' THEN 0 ELSE 1 END,
    COALESCE(p.full_name, au.email);
END;
$$;

-- Function-level ACL: authenticated only (internal gate restricts to admins).
REVOKE EXECUTE ON FUNCTION public.get_admin_subadmins_overview() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_admin_subadmins_overview() TO authenticated;
