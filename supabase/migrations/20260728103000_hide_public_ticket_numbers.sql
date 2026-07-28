-- Ticket numbers and positions are strictly internal. Public winner feeds and
-- customer notifications must not expose them, while admin tables, audit data,
-- and contest-engine logic remain unchanged.

DROP FUNCTION IF EXISTS public.get_latest_winners_public(integer);

CREATE FUNCTION public.get_latest_winners_public(winners_limit integer DEFAULT 50)
RETURNS TABLE(
  public_id text,
  type text,
  created_at timestamptz,
  user_name text,
  user_nickname text,
  prize_name text,
  prize_image_url text,
  contest_title text,
  user_avatar_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    md5(w.id::text) AS public_id,
    w.type,
    w.created_at,
    COALESCE(
      NULLIF(u.nickname, ''),
      CASE
        WHEN NULLIF(u.first_name, '') IS NOT NULL AND NULLIF(u.last_name, '') IS NOT NULL
          THEN u.first_name || ' ' || left(u.last_name, 1) || '.'
        WHEN NULLIF(u.first_name, '') IS NOT NULL THEN u.first_name
        WHEN NULLIF(u.name, '') IS NOT NULL THEN u.name
        ELSE 'Výherce'
      END
    ) AS user_name,
    NULLIF(u.nickname, '') AS user_nickname,
    CASE
      WHEN w.type = 'main' THEN COALESCE(c.main_prize, 'Hlavní výhra')
      WHEN w.type = 'bonus' THEN
        CASE WHEN bp.amount IS NOT NULL THEN bp.amount || ' MioCoins' ELSE COALESCE(bp.description, 'Bonus') END
      ELSE 'Výhra'
    END AS prize_name,
    CASE WHEN w.type = 'main' THEN c.main_image WHEN w.type = 'bonus' THEN bp.image_url ELSE NULL END AS prize_image_url,
    COALESCE(c.title, 'Soutěž') AS contest_title,
    p.avatar_url AS user_avatar_url
  FROM public.winners w
  LEFT JOIN public.users u ON u.id = w.user_id
  LEFT JOIN public.profiles p ON p.id = w.user_id
  LEFT JOIN public.contests c ON c.id = w.contest_id
  LEFT JOIN public.bonus_prizes bp ON bp.id = w.prize_id AND w.type = 'bonus'
  ORDER BY w.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(winners_limit, 50), 1), 100);
$function$;

REVOKE ALL ON FUNCTION public.get_latest_winners_public(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_latest_winners_public(integer) TO anon;
GRANT EXECUTE ON FUNCTION public.get_latest_winners_public(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_winners_public(integer) TO service_role;

DROP POLICY IF EXISTS "Public can view bonus prizes" ON public.bonus_prizes;

CREATE OR REPLACE VIEW public.public_bonus_prizes AS
SELECT
  id,
  contest_id,
  title,
  description,
  detailed_description,
  image_url,
  amount,
  status,
  guardian_required
FROM public.bonus_prizes;

REVOKE ALL ON TABLE public.public_bonus_prizes FROM PUBLIC;
GRANT SELECT ON TABLE public.public_bonus_prizes TO anon;
GRANT SELECT ON TABLE public.public_bonus_prizes TO authenticated;
GRANT SELECT ON TABLE public.public_bonus_prizes TO service_role;

-- Customers receive only opaque ticket row IDs and display metadata. Direct
-- SELECT stays available through existing admin policies, never through an
-- own-row customer policy that would also expose tickets.number.
DROP POLICY IF EXISTS tickets_select_own ON public.tickets;

CREATE OR REPLACE FUNCTION public.get_my_tickets_public(
  p_contest_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  contest_id uuid,
  contest_title text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    t.id,
    t.created_at,
    t.contest_id,
    COALESCE(c.title, 'Soutěž') AS contest_title
  FROM public.tickets t
  LEFT JOIN public.contests c ON c.id = t.contest_id
  WHERE t.user_id = auth.uid()
    AND (p_contest_id IS NULL OR t.contest_id = p_contest_id)
  ORDER BY t.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.get_my_tickets_public(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_tickets_public(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_tickets_public(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tickets_public(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.buy_ticket_public(
  p_contest_id uuid,
  p_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_ticket_id uuid;
  v_bonus_prize_id uuid;
BEGIN
  v_result := public.buy_ticket_atomic(p_contest_id, p_user_id);

  IF COALESCE((v_result->>'success')::boolean, false) THEN
    v_ticket_id := NULLIF(v_result->>'ticket_row_id', '')::uuid;
    SELECT w.prize_id
    INTO v_bonus_prize_id
    FROM public.winners w
    WHERE w.ticket_id = v_ticket_id
      AND w.user_id = auth.uid()
      AND w.type = 'bonus'
    LIMIT 1;
  END IF;

  RETURN (v_result
    - 'ticket_number'
    - 'next_bonus_position'
    - 'distance_to_next_bonus'
    - 'remaining_tickets')
    || jsonb_build_object('bonus_prize_id', v_bonus_prize_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.buy_ticket_atomic(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.buy_ticket_atomic(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.buy_ticket_public(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buy_ticket_public(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.buy_ticket_public(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buy_ticket_public(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.purchase_guaranteed_benefit_bundle_public(
  p_user_id uuid,
  p_contest_id uuid,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_ticket_id uuid;
  v_bonus_prize_id uuid;
BEGIN
  v_result := public.purchase_guaranteed_benefit_bundle_atomic(
    p_user_id,
    p_contest_id,
    p_idempotency_key
  );

  IF COALESCE((v_result->>'success')::boolean, false) THEN
    v_ticket_id := NULLIF(v_result->>'ticket_row_id', '')::uuid;
    SELECT w.prize_id
    INTO v_bonus_prize_id
    FROM public.winners w
    WHERE w.ticket_id = v_ticket_id
      AND w.user_id = auth.uid()
      AND w.type = 'bonus'
    LIMIT 1;
  END IF;

  RETURN (v_result
    - 'ticket_number'
    - 'next_bonus_position'
    - 'distance_to_next_bonus'
    - 'remaining_tickets')
    || jsonb_build_object('bonus_prize_id', v_bonus_prize_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_public(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purchase_guaranteed_benefit_bundle_public(uuid, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.purchase_guaranteed_benefit_bundle_public(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_guaranteed_benefit_bundle_public(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_notifications_from_event_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_meta jsonb := COALESCE(NEW.metadata, '{}'::jsonb);
  v_type text;
  v_title text;
  v_message text;
BEGIN
  IF NEW.user_id IS NULL OR NEW.event_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.event_name = 'prize_won' THEN
    v_type := 'success';
    v_title := 'Výhra';
    v_message := 'Vyhrál(a) jsi na OneMil! Výhru najdeš v sekci Moje výhry.';
  ELSIF NEW.event_name = 'coin_redeemed' THEN
    v_type := 'success';
    v_title := 'MioCoin uplatněn';
    v_message := 'MioCoin byl úspěšně uplatněn.';
  ELSIF NEW.event_name = 'contest_closed' THEN
    v_type := 'info';
    v_title := 'Soutěž uzavřena';
    v_message := COALESCE(v_meta->>'title', 'Soutěž je uzavřena. Výsledky jsou k dispozici.');
  ELSE
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = NEW.user_id
      AND n.type = v_type
      AND n.title IS NOT DISTINCT FROM v_title
      AND n.message = v_message
      AND n.created_at >= now() - interval '1 day'
  ) THEN
    INSERT INTO public.notifications (user_id, type, title, message, status)
    VALUES (NEW.user_id, v_type, v_title, v_message, 'queued');
  END IF;

  RETURN NEW;
END;
$function$;
