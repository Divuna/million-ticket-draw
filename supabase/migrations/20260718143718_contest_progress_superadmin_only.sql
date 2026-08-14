-- Keep exact contest sales progress out of public clients.
-- Public pages must use non-sensitive contest fields only; this RPC exposes the
-- existing aggregate view solely to verified superadmins. Service-role/server
-- jobs can still read the view directly.

CREATE OR REPLACE FUNCTION public.get_contest_progress_admin(p_contest_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  contest_id uuid,
  tickets_total integer,
  tickets_sold bigint,
  tickets_remaining bigint,
  sold_percent numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'access_denied'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cp.contest_id,
    cp.tickets_total,
    cp.tickets_sold,
    cp.tickets_remaining,
    cp.sold_percent
  FROM public.contest_progress cp
  WHERE p_contest_ids IS NULL
     OR cp.contest_id = ANY(p_contest_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.get_contest_progress_admin(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contest_progress_admin(uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_contest_progress_admin(uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contest_progress_admin(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contest_progress_admin(uuid[]) TO service_role;

REVOKE SELECT ON TABLE public.contest_progress FROM anon;
REVOKE SELECT ON TABLE public.contest_progress FROM authenticated;
GRANT SELECT ON TABLE public.contest_progress TO service_role;

-- Legacy management RPC also exposes exact tickets_sold/progress_percentage.
-- It is not used by the current frontend; keep it callable only by trusted
-- server-role jobs so revoking the view cannot be bypassed by anon/auth users.
REVOKE ALL ON FUNCTION public.get_contest_management_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contest_management_data(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_contest_management_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_contest_management_data(uuid) TO service_role;

COMMENT ON FUNCTION public.get_contest_progress_admin(uuid[])
IS 'Superadmin-only access to exact contest ticket progress after public contest_progress grants are revoked.';
