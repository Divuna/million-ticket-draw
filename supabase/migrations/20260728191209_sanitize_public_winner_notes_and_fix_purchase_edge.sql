-- Keep historical winner notes intact for audit, but expose only a sanitized
-- projection to customers. Also provide a service-role bridge for the
-- purchase-ticket Edge Function without weakening buy_ticket_atomic itself.

CREATE OR REPLACE FUNCTION public.sanitize_winner_note_public(p_note text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
DECLARE
  v_clean text := p_note;
BEGIN
  -- Explicit database/API field names and labelled ticket sequence values.
  v_clean := regexp_replace(
    v_clean,
    '(ticket_number|ticket_position|ticket[ _-]*(number|position)|číslo[[:space:]]+tiketu|cislo[[:space:]]+tiketu|pořadí[[:space:]]+tiketu|poradi[[:space:]]+tiketu|pozice[[:space:]]+tiketu)[^[:digit:]]{0,24}[0-9]+',
    '',
    'gi'
  );

  -- Natural-language forms: "tiket 34", "ticket no. 34", and variants with
  -- a short phrase between the ticket word and its number.
  v_clean := regexp_replace(
    v_clean,
    '(tiket|ticket)[^[:digit:]]{0,24}[0-9]+',
    '',
    'gi'
  );

  -- Reversed forms such as "34. tiket" or "34th ticket".
  v_clean := regexp_replace(
    v_clean,
    '[0-9]+(st|nd|rd|th)?[[:space:].-]{0,4}(tiket|ticket)(u|ů|y|s)?',
    '',
    'gi'
  );

  -- Standalone ordering labels and hash-number notation.
  v_clean := regexp_replace(
    v_clean,
    '(pořadí|poradi|pozice)[^[:digit:]]{0,24}[0-9]+',
    '',
    'gi'
  );
  v_clean := regexp_replace(v_clean, '#[[:space:]]*[0-9]+', '', 'g');

  -- Never echo raw internal field names, even if a malformed historical note
  -- omitted their value.
  v_clean := regexp_replace(v_clean, 'ticket_(number|position)', '', 'gi');

  -- Clean punctuation and whitespace left by the redactions.
  v_clean := regexp_replace(v_clean, '[{}"]', '', 'g');
  v_clean := regexp_replace(v_clean, '[[:space:]]+', ' ', 'g');
  v_clean := regexp_replace(v_clean, '^[[:space:],;:|/–—-]+|[[:space:],;:|/–—-]+$', '', 'g');
  v_clean := btrim(v_clean);

  -- Fail closed if an unrecognised ticket-sequence variant survived.
  IF v_clean ~* (
    '#[[:space:]]*[0-9]+|'
    '(ticket|tiket)[^[:digit:]]{0,24}[0-9]+|'
    '[0-9]+(st|nd|rd|th)?[[:space:].-]{0,4}(ticket|tiket)|'
    '(číslo[[:space:]]+tiketu|cislo[[:space:]]+tiketu|'
    'pořadí[[:space:]]+tiketu|poradi[[:space:]]+tiketu|'
    'ticket_number|ticket_position)'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN NULLIF(v_clean, '');
END;
$function$;

REVOKE ALL ON FUNCTION public.sanitize_winner_note_public(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sanitize_winner_note_public(text) FROM anon;
REVOKE ALL ON FUNCTION public.sanitize_winner_note_public(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_winner_note_public(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_wins_public()
RETURNS TABLE(
  id uuid,
  type text,
  status text,
  delivered boolean,
  public_notes text,
  created_at timestamptz,
  contest_id uuid,
  prize_id uuid,
  user_seen boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT
    w.id,
    w.type,
    w.status,
    w.delivered,
    public.sanitize_winner_note_public(w.notes) AS public_notes,
    w.created_at,
    w.contest_id,
    w.prize_id,
    w.user_seen
  FROM public.winners w
  WHERE w.user_id = auth.uid()
  ORDER BY w.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_my_wins_public() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_wins_public() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_wins_public() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_wins_public() TO service_role;

-- The raw note is no longer selectable by a customer, even through a direct
-- PostgREST projection. Existing writes and service-role access are unchanged.
REVOKE SELECT ON TABLE public.winners FROM authenticated;
REVOKE SELECT ON TABLE public.winners FROM anon;
REVOKE SELECT ON TABLE public.winners FROM PUBLIC;
REVOKE SELECT (notes) ON TABLE public.winners FROM authenticated;
REVOKE SELECT (notes) ON TABLE public.winners FROM anon;
REVOKE SELECT (notes) ON TABLE public.winners FROM PUBLIC;
GRANT SELECT (
  id,
  contest_id,
  prize_id,
  user_id,
  ticket_id,
  type,
  status,
  delivered,
  created_at,
  user_seen
) ON TABLE public.winners TO authenticated;

DROP POLICY IF EXISTS winners_select_own ON public.winners;
CREATE POLICY winners_select_own
ON public.winners
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_superadmin(auth.uid())
);

-- Superadmins can deliberately retrieve the untouched audit note through a
-- guarded internal endpoint. Ordinary authenticated users always receive
-- SQLSTATE 42501.
CREATE OR REPLACE FUNCTION public.get_winner_internal_notes_superadmin(
  p_winner_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  notes text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Superadmin required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT w.id, w.notes
  FROM public.winners w
  WHERE p_winner_ids IS NULL OR w.id = ANY(p_winner_ids);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_winner_internal_notes_superadmin(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_winner_internal_notes_superadmin(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_winner_internal_notes_superadmin(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_winner_internal_notes_superadmin(uuid[]) TO service_role;

-- buy_ticket_atomic intentionally remains non-executable by customers and
-- continues to derive its effective identity from auth.uid(). This bridge can
-- be invoked only with a service-role JWT. It temporarily supplies the already
-- verified Edge identity to the unchanged atomic purchase function, then
-- restores the request claims before returning.
CREATE OR REPLACE FUNCTION public."buy_ticket_atomic_service"(
  p_user_id uuid,
  p_contest_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_previous_sub text := current_setting('request.jwt.claim.sub', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_claims jsonb := COALESCE(NULLIF(v_previous_claims, '')::jsonb, '{}'::jsonb);
  v_role text := COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    v_claims->>'role'
  );
  v_result jsonb;
BEGIN
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Verified user id required' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_set(v_claims, '{sub}', to_jsonb(p_user_id::text), true)::text,
    true
  );

  BEGIN
    v_result := public."buy_ticket_atomic"(
      p_user_id => p_user_id,
      p_contest_id => p_contest_id
    );
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
      PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
      RAISE;
  END;

  PERFORM set_config('request.jwt.claim.sub', COALESCE(v_previous_sub, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public."buy_ticket_atomic_service"(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public."buy_ticket_atomic_service"(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public."buy_ticket_atomic_service"(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public."buy_ticket_atomic_service"(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.sanitize_winner_note_public(text) IS
  'Redacts historical ticket numbers and positions without modifying winners.notes.';
COMMENT ON FUNCTION public.get_my_wins_public() IS
  'Customer win projection with sanitized public_notes and no raw internal note.';
COMMENT ON FUNCTION public.get_winner_internal_notes_superadmin(uuid[]) IS
  'Guarded superadmin-only access to untouched historical winner notes.';
COMMENT ON FUNCTION public."buy_ticket_atomic_service"(uuid, uuid) IS
  'Service-role-only bridge used after an Edge Function independently verifies the customer JWT.';
