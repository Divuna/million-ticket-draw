-- Close the remaining indirect public ticket-order inference paths.
--
-- Stable bonus prize ids combined with lifecycle status reveal when a hidden
-- winning position has been crossed. The public projection therefore contains
-- only immutable catalogue fields. A customer's own winner row remains the
-- only public source of fulfilment state; internal data is unchanged.

DROP VIEW IF EXISTS public.public_bonus_prizes;

CREATE VIEW public.public_bonus_prizes
WITH (security_barrier = true)
AS
SELECT
  bp.id,
  bp.contest_id,
  bp.title,
  bp.description,
  bp.detailed_description,
  bp.image_url,
  bp.amount,
  bp.guardian_required
FROM public.bonus_prizes AS bp;

REVOKE ALL ON TABLE public.public_bonus_prizes FROM PUBLIC;
REVOKE ALL ON TABLE public.public_bonus_prizes FROM anon;
REVOKE ALL ON TABLE public.public_bonus_prizes FROM authenticated;
GRANT SELECT ON TABLE public.public_bonus_prizes TO anon;
GRANT SELECT ON TABLE public.public_bonus_prizes TO authenticated;
GRANT SELECT ON TABLE public.public_bonus_prizes TO service_role;

COMMENT ON VIEW public.public_bonus_prizes IS
  'Public immutable bonus catalogue. Lifecycle status and ticket position are intentionally internal.';

-- Historical uploaded share images may already contain a rendered ticket
-- number. Keep the objects intact for internal audit, but remove every public
-- read path now that sharing uses the fixed-content OG renderer.
DROP POLICY IF EXISTS "Public can view ticket share images" ON storage.objects;

UPDATE storage.buckets
SET public = false
WHERE id = 'ticket-shares'
  AND public = true;

-- Historical internal winner notes may spell an order entirely in words. Such
-- text has no numeric token that can be safely separated from prose, so the
-- public projection fails closed for a bilingual lexical class of cardinal and
-- ordinal number words. Stored winners.notes is never changed.
CREATE OR REPLACE FUNCTION public.sanitize_winner_note_public(p_note text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
DECLARE
  v_clean text := p_note;
  v_sequence_marker constant text :=
    '(ticket[_[:space:]-]*(number|position)|'
    'next[_[:space:]-]*ticket[_[:space:]-]*number|'
    '\m(tiket[[:alpha:]]*|ticket[[:alpha:]]*|'
    'pozic[[:alpha:]]*|position[[:alpha:]]*|'
    'příčk[[:alpha:]]*|prick[[:alpha:]]*|'
    'míst[[:alpha:]]*|mist[[:alpha:]]*|'
    'pořad[[:alpha:]]*|porad[[:alpha:]]*|'
    'rank[[:alpha:]]*|place[[:alpha:]]*|slot[[:alpha:]]*|'
    'ordinal[[:alpha:]]*|sequence[[:alpha:]]*|'
    'číslo|cislo|number|order|no|č|c)\M[.]?)';
  -- This is a lexical class, not a phrase replacement list. It recognizes
  -- number components independently of word order and punctuation.
  v_number_word constant text :=
    '\m('
    'nul[[:alpha:]]*|nult[[:alpha:]]*|'
    'jeden|jedna|jedno|jedné|jedne|jedny|prvn[[:alpha:]]*|'
    'dva|dvě|dve|dvou|druh[[:alpha:]]*|'
    'tři|tri|tří|třet[[:alpha:]]*|tret[[:alpha:]]*|'
    'čtyři|ctyri|čtyř|ctyr|čtvrt[[:alpha:]]*|ctvrt[[:alpha:]]*|'
    'pět|pet|pát[[:alpha:]]*|pat[[:alpha:]]*|'
    'šest[[:alpha:]]*|sest[[:alpha:]]*|sedm[[:alpha:]]*|osm[[:alpha:]]*|'
    'devět|devet|devát[[:alpha:]]*|devat[[:alpha:]]*|'
    'deset|desát[[:alpha:]]*|desat[[:alpha:]]*|'
    'jedenáct[[:alpha:]]*|jedenact[[:alpha:]]*|'
    'dvanáct[[:alpha:]]*|dvanact[[:alpha:]]*|'
    'třináct[[:alpha:]]*|trinact[[:alpha:]]*|'
    'čtrnáct[[:alpha:]]*|ctrnact[[:alpha:]]*|'
    'patnáct[[:alpha:]]*|patnact[[:alpha:]]*|'
    'šestnáct[[:alpha:]]*|sestnact[[:alpha:]]*|'
    'sedmnáct[[:alpha:]]*|sedmnact[[:alpha:]]*|'
    'osmnáct[[:alpha:]]*|osmnact[[:alpha:]]*|'
    'devatenáct[[:alpha:]]*|devatenact[[:alpha:]]*|'
    'dvacet|dvacát[[:alpha:]]*|dvacat[[:alpha:]]*|'
    'třicet|tricet|třicát[[:alpha:]]*|tricat[[:alpha:]]*|'
    'čtyřicet|ctyricet|čtyřicát[[:alpha:]]*|ctyricat[[:alpha:]]*|'
    'padesát[[:alpha:]]*|padesat[[:alpha:]]*|'
    'šedesát[[:alpha:]]*|sedesat[[:alpha:]]*|'
    'sedmdesát[[:alpha:]]*|sedmdesat[[:alpha:]]*|'
    'osmdesát[[:alpha:]]*|osmdesat[[:alpha:]]*|'
    'devadesát[[:alpha:]]*|devadesat[[:alpha:]]*|'
    'sto|stý|sty|sté|ste|set|tisíc[[:alpha:]]*|tisic[[:alpha:]]*|'
    'zero|zeroth|one|first|two|second|three|third|four|fourth|'
    'five|fifth|six|sixth|seven|seventh|eight|eighth|nine|ninth|'
    'ten|tenth|eleven|eleventh|twelve|twelfth|thirteen|thirteenth|'
    'fourteen|fourteenth|fifteen|fifteenth|sixteen|sixteenth|'
    'seventeen|seventeenth|eighteen|eighteenth|nineteen|nineteenth|'
    'twenty|twentieth|thirty|thirtieth|forty|fortieth|'
    'fifty|fiftieth|sixty|sixtieth|seventy|seventieth|'
    'eighty|eightieth|ninety|ninetieth|hundred|hundredth|'
    'thousand|thousandth'
    ')\M';
  v_had_sequence_marker boolean := p_note ~* v_sequence_marker;
  v_had_numeric_token boolean := p_note ~ '[[:digit:]]';
BEGIN
  IF p_note ~* v_number_word THEN
    RETURN NULL;
  END IF;

  IF v_had_sequence_marker AND NOT v_had_numeric_token THEN
    RETURN NULL;
  END IF;

  v_clean := regexp_replace(
    v_clean,
    '#[[:space:]]*[[:digit:]]+(st|nd|rd|th)?',
    '',
    'gi'
  );
  v_clean := regexp_replace(
    v_clean,
    '[[:digit:]]+([[:space:],.-][[:digit:]]+)*[[:space:]]*(st|nd|rd|th)?',
    '',
    'gi'
  );
  v_clean := regexp_replace(v_clean, v_sequence_marker, '', 'gi');
  v_clean := regexp_replace(v_clean, '[{}"]', '', 'g');
  v_clean := regexp_replace(v_clean, '[[:space:]]+', ' ', 'g');
  v_clean := regexp_replace(
    v_clean,
    '[[:space:]]*[=.,:;|/–—-]+[[:space:]]*',
    ' ',
    'g'
  );
  v_clean := regexp_replace(
    v_clean,
    '[[:space:]]+(na|at|on)[[:space:]=.,;:|/–—-]*$',
    '',
    'i'
  );
  v_clean := regexp_replace(
    v_clean,
    '^[[:space:]=.,;:|/–—-]+|[[:space:]=.,;:|/–—-]+$',
    '',
    'g'
  );
  v_clean := btrim(regexp_replace(v_clean, '[[:space:]]+', ' ', 'g'));

  IF v_clean ~ '[[:digit:]]'
    OR v_clean ~* v_sequence_marker
    OR v_clean ~* v_number_word
  THEN
    RETURN NULL;
  END IF;

  RETURN NULLIF(v_clean, '');
END;
$function$;

REVOKE ALL ON FUNCTION public.sanitize_winner_note_public(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sanitize_winner_note_public(text) FROM anon;
REVOKE ALL ON FUNCTION public.sanitize_winner_note_public(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sanitize_winner_note_public(text) TO service_role;

COMMENT ON FUNCTION public.sanitize_winner_note_public(text) IS
  'Fail-closed bilingual public projection of internal winner notes. Stored notes remain unchanged.';
