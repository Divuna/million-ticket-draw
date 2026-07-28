-- Contest sequencing is strictly internal. Public clients use an explicit,
-- stable projection while superadmin/service callers have a guarded RPC for
-- operational inspection. Ticket values and contest-engine logic are untouched.

CREATE OR REPLACE VIEW public.public_contests
WITH (security_invoker = true) AS
SELECT
  id,
  banner_image,
  created_at,
  description,
  fast_game,
  generated_poster_url,
  main_image,
  main_prize,
  main_prize_secondary_image,
  name,
  rules,
  rules_pdf_url,
  status,
  ticket_count,
  ticket_price,
  title,
  total_miocoin_bonus,
  updated_at
FROM public.contests;

REVOKE ALL ON TABLE public.public_contests FROM PUBLIC;
GRANT SELECT ON TABLE public.public_contests TO anon;
GRANT SELECT ON TABLE public.public_contests TO authenticated;
GRANT SELECT ON TABLE public.public_contests TO service_role;

-- Remove the historical table-level grants, which allowed arbitrary PostgREST
-- projections such as ?select=next_ticket_number. Authenticated admin screens
-- retain only the non-sensitive columns they already query directly. The
-- security-invoker view therefore has exactly the same safe source privileges.
REVOKE SELECT ON TABLE public.contests FROM PUBLIC;
REVOKE SELECT ON TABLE public.contests FROM anon;
REVOKE SELECT ON TABLE public.contests FROM authenticated;
REVOKE SELECT (next_ticket_number) ON public.contests FROM PUBLIC;
REVOKE SELECT (next_ticket_number) ON public.contests FROM anon;
REVOKE SELECT (next_ticket_number) ON public.contests FROM authenticated;

GRANT SELECT (
  id,
  banner_image,
  created_at,
  description,
  fast_game,
  generated_poster_url,
  main_image,
  main_prize,
  main_prize_secondary_image,
  name,
  rules,
  rules_pdf_url,
  status,
  ticket_count,
  ticket_price,
  title,
  total_miocoin_bonus,
  updated_at
) ON public.contests TO anon, authenticated;

GRANT SELECT ON TABLE public.contests TO service_role;

CREATE OR REPLACE FUNCTION public.get_contest_ticket_state_internal(
  p_contest_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  contest_id uuid,
  next_ticket_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (
       auth.uid() IS NULL
       OR NOT public.is_superadmin(auth.uid())
     )
  THEN
    RAISE EXCEPTION 'Superadmin or service role required'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT c.id, c.next_ticket_number
  FROM public.contests c
  WHERE p_contest_ids IS NULL OR c.id = ANY(p_contest_ids)
  ORDER BY c.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_contest_ticket_state_internal(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contest_ticket_state_internal(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_contest_ticket_state_internal(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_contest_ticket_state_internal(uuid[]) TO service_role;
