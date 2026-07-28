-- Historical winners.notes is free-form internal audit text. Public callers
-- must never be able to recover a ticket sequence from it, including word
-- order variants that a context-specific replacement list could miss.
--
-- The safe rule is deliberately general:
--   1. remove every numeric token from the public projection,
--   2. remove ticket/order labels independently of their position,
--   3. fail closed when a label survives or when a label uses a spelled-out
--      number (there is no numeric token that can be safely separated).
--
-- The original winners.notes value is never updated. Structured contest and
-- prize fields remain the source of public prize names, images and amounts.

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
    'pořad[[:alpha:]]*|porad[[:alpha:]]*|'
    'ordinal[[:alpha:]]*|sequence[[:alpha:]]*|'
    'číslo|cislo|number|order|no|č|c)\M[.]?)';
  v_had_sequence_marker boolean := p_note ~* v_sequence_marker;
  v_had_numeric_token boolean := p_note ~ '[[:digit:]]';
BEGIN
  -- A sequence label with no digit may contain a spelled-out number
  -- ("ticket thirty-four", "třicátá čtvrtá pozice"). It cannot be
  -- distinguished safely from ordinary prose, so do not publish it.
  IF v_had_sequence_marker AND NOT v_had_numeric_token THEN
    RETURN NULL;
  END IF;

  -- Hash notation is always sequence-like in historical winner notes.
  v_clean := regexp_replace(
    v_clean,
    '#[[:space:]]*[[:digit:]]+(st|nd|rd|th)?',
    '',
    'gi'
  );

  -- Remove every remaining numeric token, irrespective of whether the label
  -- appears before or after it. This covers grouped values and ordinal forms:
  -- 34, 34., 34th, 1 234, 1,234, 1.234 and 1-234.
  v_clean := regexp_replace(
    v_clean,
    '[[:digit:]]+([[:space:],.-][[:digit:]]+)*[[:space:]]*(st|nd|rd|th)?',
    '',
    'gi'
  );

  -- Remove the independent sequence labels after the numeric pass. Because
  -- the two passes do not depend on word order, both "position 34" and
  -- "34th position" follow the same rule.
  v_clean := regexp_replace(v_clean, v_sequence_marker, '', 'gi');

  -- Normalize punctuation and whitespace left by the redaction while keeping
  -- the rest of the human-readable prize text.
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

  -- Defense in depth: the public function never returns a partially
  -- sanitized value if a digit or a sequence marker remains.
  IF v_clean ~ '[[:digit:]]' OR v_clean ~* v_sequence_marker THEN
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
  'Fail-closed public projection of internal winner notes: removes every numeric token and ticket/order marker without changing stored notes.';

-- Realtime logical replication publishes raw row values and is not a suitable
-- public projection for tables that contain internal sequence state or notes.
-- Public consumers already poll get_latest_winners_public/public_contests;
-- neither table has an internal admin Realtime consumer that needs preserving.
DO $realtime$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'winners'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.winners;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contests'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.contests;
  END IF;
END;
$realtime$;
