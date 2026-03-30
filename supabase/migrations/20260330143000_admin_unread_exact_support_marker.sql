-- Align with AdminMessages: marker row is content = 'SUPPORT REQUEST' exactly (no LIKE / multiline).

CREATE OR REPLACE FUNCTION public.admin_unread_support_user_messages_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN
    RETURN 0;
  END IF;

  WITH latest_sr AS (
    SELECT user_id, MAX(created_at) AS r
    FROM public.messages
    WHERE sender = 'admin'
      AND content = 'SUPPORT REQUEST'
    GROUP BY user_id
  ),
  latest_admin_after_r AS (
    SELECT m.user_id, MAX(m.created_at) AS a
    FROM public.messages m
    INNER JOIN latest_sr sr ON sr.user_id = m.user_id
    WHERE m.sender = 'admin'
      AND m.content IS DISTINCT FROM 'SUPPORT REQUEST'
      AND m.created_at > sr.r
    GROUP BY m.user_id
  ),
  open_support_users AS (
    SELECT sr.user_id
    FROM latest_sr sr
    LEFT JOIN latest_admin_after_r ara ON ara.user_id = sr.user_id
    WHERE ara.a IS NULL
  )
  SELECT COUNT(*)::integer INTO v_count
  FROM public.messages um
  WHERE um.sender = 'user'
    AND um.read = false
    AND um.user_id IN (SELECT user_id FROM open_support_users);

  RETURN COALESCE(v_count, 0);
END;
$$;

COMMENT ON FUNCTION public.admin_unread_support_user_messages_count() IS
  'Unread user rows only for users whose latest exact SUPPORT REQUEST admin row has no later admin message with content other than SUPPORT REQUEST.';
