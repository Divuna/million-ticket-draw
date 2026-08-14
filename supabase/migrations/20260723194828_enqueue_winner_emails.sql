-- Queue winner emails through the existing email_queue / process-email-queue
-- pipeline. No email provider is called from the winner transaction.
--
-- Bonus wins are grouped into deterministic 10-minute user/contest buckets.
-- The queue worker waits until the bucket closes, so every pending group can
-- be updated with all bonus wins before one email is sent.

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS available_at timestamp with time zone;

UPDATE public.email_queue
SET available_at = COALESCE(created_at, now())
WHERE available_at IS NULL;

ALTER TABLE public.email_queue
  ALTER COLUMN available_at SET DEFAULT now(),
  ALTER COLUMN available_at SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_queue_dedupe_key
  ON public.email_queue (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_queue_pending_available
  ON public.email_queue (available_at, created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.winner_email_html_escape(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO pg_catalog
AS $$
  SELECT replace(
    replace(
      replace(
        replace(
          replace(COALESCE(p_value, ''), '&', '&amp;'),
          '<', '&lt;'
        ),
        '>', '&gt;'
      ),
      '"', '&quot;'
    ),
    '''', '&#39;'
  );
$$;

REVOKE ALL ON FUNCTION public.winner_email_html_escape(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.winner_email_html_escape(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_winner_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
DECLARE
  v_recipient text;
  v_contest_title text;
  v_contest_title_html text;
  v_prize_items_html text;
  v_prize_count integer := 1;
  v_subject text;
  v_body text;
  v_dedupe_key text;
  v_bucket_start timestamp with time zone;
  v_bucket_end timestamp with time zone;
  v_available_at timestamp with time zone;
  v_wins_url constant text := 'https://onemil.cz/wins';
BEGIN
  -- Profiles are the normal application source. auth.users is the complete
  -- server-side fallback for winner rows whose profile email is missing.
  SELECT NULLIF(btrim(p.email), '')
  INTO v_recipient
  FROM public.profiles p
  WHERE p.id = NEW.user_id OR p.user_id = NEW.user_id
  ORDER BY (p.id = NEW.user_id) DESC
  LIMIT 1;

  IF v_recipient IS NULL THEN
    SELECT NULLIF(btrim(u.email::text), '')
    INTO v_recipient
    FROM auth.users u
    WHERE u.id = NEW.user_id;
  END IF;

  IF v_recipient IS NULL THEN
    RAISE LOG 'enqueue_winner_email skipped: no email for winner_id=%', NEW.id;
    RETURN NEW;
  END IF;

  SELECT COALESCE(
    NULLIF(btrim(c.title), ''),
    NULLIF(btrim(c.name), ''),
    'Soutěž OneMil'
  )
  INTO v_contest_title
  FROM public.contests c
  WHERE c.id = NEW.contest_id;

  v_contest_title := COALESCE(v_contest_title, 'Soutěž OneMil');
  v_contest_title_html := public.winner_email_html_escape(v_contest_title);

  IF NEW.type = 'bonus' THEN
    v_bucket_start := date_bin(
      interval '10 minutes',
      COALESCE(NEW.created_at, now()),
      timestamp with time zone '2001-01-01 00:00:00+00'
    );
    v_bucket_end := v_bucket_start + interval '10 minutes';
    v_available_at := v_bucket_end;
    v_dedupe_key := concat(
      'winner-email:bonus:',
      NEW.user_id,
      ':',
      NEW.contest_id,
      ':',
      extract(epoch FROM v_bucket_start)::bigint
    );

    SELECT
      count(*)::integer,
      string_agg(
        '<li style="margin:0 0 8px;">' ||
        public.winner_email_html_escape(
          CASE
            WHEN COALESCE(bp.amount, 0) > 0 THEN
              concat(
                COALESCE(
                  NULLIF(btrim(bp.title), ''),
                  NULLIF(btrim(bp.description), ''),
                  'Bonusová výhra'
                ),
                ' (',
                trim(to_char(bp.amount, 'FM999999999990D##')),
                ' MioCoinů)'
              )
            ELSE COALESCE(
              NULLIF(btrim(bp.title), ''),
              NULLIF(btrim(bp.description), ''),
              'Bonusová výhra'
            )
          END
        ) ||
        '</li>',
        '' ORDER BY w.created_at, w.id
      )
    INTO v_prize_count, v_prize_items_html
    FROM public.winners w
    LEFT JOIN public.bonus_prizes bp ON bp.id = w.prize_id
    WHERE w.user_id = NEW.user_id
      AND w.contest_id = NEW.contest_id
      AND w.type = 'bonus'
      AND w.created_at >= v_bucket_start
      AND w.created_at < v_bucket_end;
  ELSE
    v_available_at := now();
    v_dedupe_key := concat('winner-email:', NEW.id);

    SELECT
      '<li style="margin:0 0 8px;">' ||
      public.winner_email_html_escape(
        COALESCE(
          NULLIF(btrim(c.main_prize), ''),
          'Hlavní výhra'
        )
      ) ||
      '</li>'
    INTO v_prize_items_html
    FROM public.contests c
    WHERE c.id = NEW.contest_id;
  END IF;

  v_prize_items_html := COALESCE(
    v_prize_items_html,
    '<li style="margin:0 0 8px;">Výhra OneMil</li>'
  );

  v_subject := CASE
    WHEN v_prize_count > 1 THEN
      concat('Gratulujeme k ', v_prize_count, ' výhrám v soutěži ', v_contest_title)
    ELSE
      concat('Gratulujeme k výhře v soutěži ', v_contest_title)
  END;
  v_subject := regexp_replace(v_subject, E'[\r\n]+', ' ', 'g');

  v_body :=
    $html$<!DOCTYPE html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1d2128;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0A0B0F;padding:24px 32px;"><span style="font-size:22px;font-weight:700;color:#ffffff;">One<span style="color:#FF8A00;">Mil</span></span></td></tr>
<tr><td style="padding:32px;">
<h1 style="margin:0 0 16px;font-size:24px;color:#1d2128;">Gratulujeme k výhře!</h1>
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3a3f47;">V soutěži <strong>$html$ ||
    v_contest_title_html ||
    $html$</strong> jste získal(a):</p>
<ul style="margin:0 0 20px;padding-left:22px;font-size:15px;line-height:1.6;color:#3a3f47;">$html$ ||
    v_prize_items_html ||
    $html$</ul>
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3a3f47;">Výhra je dostupná v sekci <strong>Moje výhry</strong>.</p>
<div style="text-align:center;margin:28px 0;"><a href="https://onemil.cz/wins" style="display:inline-block;background:#FF8A00;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;">Zobrazit moje výhry</a></div>
<p style="margin:0;font-size:13px;line-height:1.6;color:#8E98A6;">Pokud tlačítko nefunguje, použijte bezpečný odkaz:<br><a href="https://onemil.cz/wins" style="color:#FF8A00;word-break:break-all;">$html$ ||
    v_wins_url ||
    $html$</a></p>
</td></tr>
<tr><td style="background:#f4f5f7;padding:20px 32px;text-align:center;"><p style="margin:0;font-size:12px;color:#8E98A6;">&copy; OneMil – Luxusní soutěže. Skutečné výhry.</p></td></tr>
</table></td></tr></table></body></html>$html$;

  INSERT INTO public.email_queue (
    email,
    subject,
    body,
    status,
    dedupe_key,
    available_at
  )
  VALUES (
    v_recipient,
    v_subject,
    v_body,
    'pending',
    v_dedupe_key,
    v_available_at
  )
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL
  DO UPDATE SET
    email = EXCLUDED.email,
    subject = EXCLUDED.subject,
    body = EXCLUDED.body,
    available_at = EXCLUDED.available_at
  WHERE public.email_queue.status = 'pending';

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- email_queue is best-effort. A queue/schema/profile failure must never
  -- abort the winner insert, wallet credit, or ticket purchase transaction.
  RAISE LOG 'enqueue_winner_email failed (winner_id=%): %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_winner_email()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_winner_email()
  TO service_role;

DROP TRIGGER IF EXISTS trg_enqueue_winner_email ON public.winners;
CREATE TRIGGER trg_enqueue_winner_email
AFTER INSERT ON public.winners
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_winner_email();
