-- Fail closed for every remaining public text and timing surface that could
-- disclose ticket ordering. Stored contest, prize, and winner data is untouched.

CREATE OR REPLACE FUNCTION public.contains_private_ticket_sequence(p_text text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT
    p_text ~* '(ticket[_[:space:]-]*(number|position)|ticket_number|ticket_position|next_ticket_number)'
    OR p_text ~* '#[[:space:]]*([[:digit:]]+|[ivxlcdm]+)\M'
    OR (
      p_text ~* '\m(tiket[[:alpha:]]*|ticket[[:alpha:]]*|pozic[[:alpha:]]*|position[[:alpha:]]*|spot|rank[[:alpha:]]*|place|slot|pořad[[:alpha:]]*|porad[[:alpha:]]*|order|číslo|cislo|number)\M'
      AND p_text ~* (
        '[[:digit:]]|'
        '\m[ivxlcdm]+\M|'
        '\m(nul[[:alpha:]]*|nult[[:alpha:]]*|jeden|jedna|jedno|prvn[[:alpha:]]*|'
        'dva|dvě|dve|druh[[:alpha:]]*|tři|tri|třet[[:alpha:]]*|tret[[:alpha:]]*|'
        'čtyři|ctyri|čtvrt[[:alpha:]]*|ctvrt[[:alpha:]]*|pět|pet|pát[[:alpha:]]*|pat[[:alpha:]]*|'
        'šest[[:alpha:]]*|sest[[:alpha:]]*|sedm[[:alpha:]]*|osm[[:alpha:]]*|'
        'devět|devet|devát[[:alpha:]]*|devat[[:alpha:]]*|deset|desát[[:alpha:]]*|desat[[:alpha:]]*|'
        'jedenáct[[:alpha:]]*|jedenact[[:alpha:]]*|dvanáct[[:alpha:]]*|dvanact[[:alpha:]]*|'
        'třináct[[:alpha:]]*|trinact[[:alpha:]]*|čtrnáct[[:alpha:]]*|ctrnact[[:alpha:]]*|'
        'patnáct[[:alpha:]]*|patnact[[:alpha:]]*|šestnáct[[:alpha:]]*|sestnact[[:alpha:]]*|'
        'sedmnáct[[:alpha:]]*|sedmnact[[:alpha:]]*|osmnáct[[:alpha:]]*|osmnact[[:alpha:]]*|'
        'devatenáct[[:alpha:]]*|devatenact[[:alpha:]]*|dvacet|dvacát[[:alpha:]]*|dvacat[[:alpha:]]*|'
        'třicet|tricet|třicát[[:alpha:]]*|tricat[[:alpha:]]*|čtyřicet|ctyricet|'
        'čtyřicát[[:alpha:]]*|ctyricat[[:alpha:]]*|padesát[[:alpha:]]*|padesat[[:alpha:]]*|'
        'šedesát[[:alpha:]]*|sedesat[[:alpha:]]*|sedmdesát[[:alpha:]]*|sedmdesat[[:alpha:]]*|'
        'osmdesát[[:alpha:]]*|osmdesat[[:alpha:]]*|devadesát[[:alpha:]]*|devadesat[[:alpha:]]*|'
        'sto|stý|sty|sté|ste|tisíc[[:alpha:]]*|tisic[[:alpha:]]*|'
        'zero|zeroth|one|first|two|second|three|third|four|fourth|five|fifth|'
        'six|sixth|seven|seventh|eight|eighth|nine|ninth|ten|tenth|eleven|eleventh|'
        'twelve|twelfth|thirteen|thirteenth|fourteen|fourteenth|fifteen|fifteenth|'
        'sixteen|sixteenth|seventeen|seventeenth|eighteen|eighteenth|nineteen|nineteenth|'
        'twenty|twentieth|thirty|thirtieth|forty|fortieth|fifty|fiftieth|sixty|sixtieth|'
        'seventy|seventieth|eighty|eightieth|ninety|ninetieth|hundred|hundredth|'
        'thousand|thousandth)\M'
      )
    );
$function$;

CREATE OR REPLACE FUNCTION public.sanitize_public_display_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT CASE
    WHEN public.contains_private_ticket_sequence(p_text) THEN NULL
    ELSE p_text
  END;
$function$;

REVOKE ALL ON FUNCTION public.contains_private_ticket_sequence(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sanitize_public_display_text(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contains_private_ticket_sequence(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sanitize_public_display_text(text) TO service_role;

-- Historical winners.notes is an internal audit field with open-ended prose.
-- No finite redaction grammar can prove arbitrary free text safe. The public
-- contract therefore returns no note, while the guarded superadmin RPC keeps
-- exposing the original stored value unchanged.
CREATE OR REPLACE FUNCTION public.sanitize_winner_note_public(p_note text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT NULL::text;
$function$;

REVOKE ALL ON FUNCTION public.sanitize_winner_note_public(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_winner_note_public(text) TO service_role;

COMMENT ON FUNCTION public.sanitize_winner_note_public(text) IS
  'Fail-closed public projection: raw winner notes remain internal and unchanged.';

-- The former security-invoker view required grants on raw free-text and
-- updated_at columns. Rebuild it as a safe projection owned by the migration
-- role, then remove all customer access to the base table.
DROP VIEW IF EXISTS public.public_contests;

CREATE VIEW public.public_contests
WITH (security_barrier = true) AS
SELECT
  c.id,
  c.banner_image,
  c.created_at,
  public.sanitize_public_display_text(c.description) AS description,
  c.fast_game,
  c.main_image,
  COALESCE(public.sanitize_public_display_text(c.main_prize), 'Hlavní výhra') AS main_prize,
  c.main_prize_secondary_image,
  COALESCE(
    public.sanitize_public_display_text(c.name),
    public.sanitize_public_display_text(c.title),
    'Soutěž'
  ) AS name,
  c.status,
  c.ticket_count,
  c.ticket_price,
  COALESCE(public.sanitize_public_display_text(c.title), 'Soutěž') AS title,
  c.total_miocoin_bonus
FROM public.contests AS c
WHERE c.status IN ('active', 'pending', 'paused', 'closed');

REVOKE SELECT ON TABLE public.contests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.public_contests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_contests TO anon, authenticated, service_role;

COMMENT ON VIEW public.public_contests IS
  'Sanitized published contest presentation only; no drafts, counters, rules, PDFs, update timing, or raw free text.';

-- Rules PDFs were historically stored under a predictable contest UUID in a
-- public bucket. Keep every object intact, but make reads admin/service-only.
DROP POLICY IF EXISTS "Public can read contest rules PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Admins can read contest rules PDFs" ON storage.objects;

INSERT INTO storage.buckets (id, name, public)
VALUES ('contest-rules', 'contest-rules', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

CREATE OR REPLACE FUNCTION public.can_manage_internal_contest_assets()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin'::public.app_role, 'superadmin'::public.app_role)
  );
$function$;

REVOKE ALL ON FUNCTION public.can_manage_internal_contest_assets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_internal_contest_assets() TO authenticated, service_role;

CREATE POLICY "Admins can read contest rules PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contest-rules'
  AND public.can_manage_internal_contest_assets()
);

-- Apply the same fail-closed text and filename rule to the immutable public
-- bonus catalogue. Internal status and ticket_position remain absent.
DROP VIEW IF EXISTS public.public_bonus_prizes;

DO $view$
DECLARE
  v_detailed_description text :=
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bonus_prizes'
        AND column_name = 'detailed_description'
    ) THEN 'public.sanitize_public_display_text(bp.detailed_description)'
      ELSE 'NULL::text' END;
  v_image_url text :=
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bonus_prizes'
        AND column_name = 'image_url'
    ) THEN 'public.sanitize_public_display_text(bp.image_url)'
      ELSE 'NULL::text' END;
  v_guardian_required text :=
    CASE WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bonus_prizes'
        AND column_name = 'guardian_required'
    ) THEN 'bp.guardian_required' ELSE 'false::boolean' END;
BEGIN
  EXECUTE format(
    'CREATE VIEW public.public_bonus_prizes
       WITH (security_barrier = true)
     AS
     SELECT
       bp.id,
       bp.contest_id,
       public.sanitize_public_display_text(bp.title) AS title,
       COALESCE(
         public.sanitize_public_display_text(bp.description),
         ''Bonusová výhra''
       ) AS description,
       %s AS detailed_description,
       %s AS image_url,
       bp.amount,
       %s AS guardian_required
     FROM public.bonus_prizes AS bp',
    v_detailed_description,
    v_image_url,
    v_guardian_required
  );
END;
$view$;

REVOKE ALL ON TABLE public.public_bonus_prizes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_bonus_prizes TO anon, authenticated, service_role;

-- Public winner rows use only sanitized structured presentation fields.
DROP FUNCTION IF EXISTS public.get_latest_winners_public(integer);

DO $winner_rpc$
DECLARE
  v_user_name_expression text := '''Výherce''::text';
  v_user_nickname_expression text := 'NULL::text';
BEGIN
  -- Older isolated schemas contain only users.id/email. Build the same safe
  -- public contract without assuming optional presentation columns exist.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'name'
  ) THEN
    v_user_name_expression :=
      'COALESCE(public.sanitize_public_display_text(NULLIF(u.name, '''')), ''Výherce'')';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'first_name'
  ) THEN
    v_user_name_expression := format(
      'COALESCE(public.sanitize_public_display_text(NULLIF(u.first_name, '''')), %s)',
      v_user_name_expression
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'nickname'
  ) THEN
    v_user_nickname_expression :=
      'public.sanitize_public_display_text(NULLIF(u.nickname, ''''))';
    v_user_name_expression := format(
      'COALESCE(%s, %s)',
      v_user_nickname_expression,
      v_user_name_expression
    );
  END IF;

  EXECUTE format(
    $function_sql$
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
          %s AS user_name,
          %s AS user_nickname,
          CASE
            WHEN w.type = 'main' THEN
              COALESCE(public.sanitize_public_display_text(c.main_prize), 'Hlavní výhra')
            WHEN w.type = 'bonus' AND bp.amount IS NOT NULL THEN bp.amount || ' MioCoins'
            WHEN w.type = 'bonus' THEN
              COALESCE(public.sanitize_public_display_text(bp.description), 'Bonusová výhra')
            ELSE 'Výhra'
          END AS prize_name,
          CASE
            WHEN w.type = 'main' THEN public.sanitize_public_display_text(c.main_image)
            WHEN w.type = 'bonus' THEN public.sanitize_public_display_text(bp.image_url)
            ELSE NULL
          END AS prize_image_url,
          COALESCE(public.sanitize_public_display_text(c.title), 'Soutěž') AS contest_title,
          NULL::text AS user_avatar_url
        FROM public.winners w
        LEFT JOIN public.users u ON u.id = w.user_id
        LEFT JOIN public.contests c ON c.id = w.contest_id
        LEFT JOIN public.bonus_prizes bp ON bp.id = w.prize_id AND w.type = 'bonus'
        ORDER BY w.created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(winners_limit, 50), 1), 100);
      $function$;
    $function_sql$,
    v_user_name_expression,
    v_user_nickname_expression
  );
END;
$winner_rpc$;

REVOKE ALL ON FUNCTION public.get_latest_winners_public(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_winners_public(integer) TO anon, authenticated, service_role;
