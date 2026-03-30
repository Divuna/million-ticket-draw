-- Optional RPC aligned with useUnreadMessagesCount (admin badge): unread marker rows only.
-- Client uses direct SELECT with same filters; this exists for tooling / future use.

CREATE OR REPLACE FUNCTION public.admin_unread_support_user_messages_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) THEN
    RETURN 0;
  END IF;

  RETURN (
    SELECT COUNT(*)::integer
    FROM public.messages
    WHERE sender = 'admin'
      AND content = 'SUPPORT REQUEST'
      AND read = false
  );
END;
$$;

COMMENT ON FUNCTION public.admin_unread_support_user_messages_count() IS
  'Admin badge: count of unread rows where sender=admin and content is exactly SUPPORT REQUEST.';
