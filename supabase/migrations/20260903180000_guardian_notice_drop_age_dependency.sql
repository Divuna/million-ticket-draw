-- Odstranění věkové závislosti z upozornění na zákonného zástupce
-- ---------------------------------------------------------------------------
-- CÍLOVÝ STAV: OneMil ověřuje věk výhradně povinným checkboxem „Je mi 18 let“
-- při registraci. `profiles.date_of_birth` se od té doby nesbírá — registrační
-- trigger `handle_new_auth_user` do něj zapisuje NULL — a nesmí být podmínkou
-- registrace, soutěžení, výhry ani administrativního procesu.
--
-- ŘEŠENÝ PROBLÉM
-- Dvě databázové funkce dál odvozovaly věk z `profiles.date_of_birth` a obě
-- se kvůli chybějícímu datu chovaly špatně, každá opačně:
--
-- 1) `trigger_guardian_message_on_winner()` (trigger `on_guardian_prize_winner`
--    na `public.winners`) měla větev:
--        IF v_user_dob IS NULL THEN v_user_age := 0;
--    Uživatel bez data narození byl tedy vyhodnocen jako nezletilý (věk 0).
--    Protože datum narození dnes nemá NIKDO, spadli do této větve všichni.
--
-- 2) `create_guardian_notification_if_needed()` naopak končila předčasně:
--        IF v_date_of_birth IS NULL THEN RETURN ... 'Date of birth not set';
--    Follow-up notifikace pro administrativu tedy nevznikla NIKOMU.
--
-- Ani jedna funkce výhru neblokovala (obě vracejí normálně), ale obě
-- rozhodovaly podle údaje, který se už nesbírá.
--
-- OPRAVA
-- Z obou funkcí se odstraňuje POUZE výpočet věku a podmínka „mladší 18 let“.
-- Rozhodnutí nově stojí výhradně na atributu ceny `bonus_prizes.guardian_required`
-- (plus na tom, že jde o věcnou cenu), což je vlastnost výhry, ne uživatele.
--
-- Pozn. k dopadu: u trigger funkce jde fakticky o zachování současného chování
-- — dnes je bez data narození splněna podmínka `v_user_age < 18` vždy, takže se
-- zpráva posílá vždy. Nově se posílá ze správného důvodu. U notifikační funkce
-- se chování mění z „nikdy“ na „vždy u ceny se zákonným zástupcem“, což je
-- původní zamýšlené chování.
--
-- ROZSAH: dvě těla funkcí + jejich EXECUTE granty (znovu potvrzené v podobě,
-- kterou nastavila 20260718190001 — pouze `service_role`).
--
-- NEMĚNÍ SE: sloupec `profiles.date_of_birth` (zůstává, historická data se
-- nemažou ani neupravují), trigger `on_guardian_prize_winner` (zůstává),
-- `check_guardian_notifications_batch()`, `create_guardian_message_for_user()`,
-- `bonus_prizes`, `winners`, `notifications`, `messages`, RLS politiky,
-- constrainty ani jakákoli data. Migrace neprovádí žádný UPDATE/DELETE.
--
-- ROLLBACK: obnovit definice z
--   20251229171515_c0592ed5-bea3-4a62-8fdf-a9d14ef42de9.sql  (trigger fn)
--   20251228220609_dc132fbb-9c92-4422-bf7a-bcbe9604c58f.sql  (notification fn)
-- granty zůstávají stejné.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Trigger na winners: zpráva výherci podle atributu ceny, ne podle věku
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_guardian_message_on_winner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guardian_required boolean;
  v_amount numeric;
  v_prize_title text;
BEGIN
  -- Only process bonus prizes (they have prize_id)
  IF NEW.prize_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT guardian_required, amount, COALESCE(title, description)
  INTO v_guardian_required, v_amount, v_prize_title
  FROM bonus_prizes
  WHERE id = NEW.prize_id;

  -- Exit if not guardian required or not physical (has monetary amount).
  -- COALESCE: chybějící příznak nikdy neznamená „vyžaduje zástupce“.
  IF NOT COALESCE(v_guardian_required, false)
     OR (v_amount IS NOT NULL AND v_amount > 0)
  THEN
    RETURN NEW;
  END IF;

  -- Žádný výpočet věku. `guardian_required` je vlastnost ceny, ne uživatele,
  -- a datum narození se nesbírá, takže z něj nelze nic odvozovat.
  IF NOT EXISTS (
    SELECT 1 FROM messages
    WHERE user_id = NEW.user_id
      AND sender = 'admin'
      AND content LIKE '%' || v_prize_title || '%zákonného zástupce%'
      AND created_at > NOW() - INTERVAL '1 minute'
  ) THEN
    INSERT INTO messages (user_id, sender, content, created_at)
    VALUES (
      NEW.user_id,
      'admin',
      '🎉 Gratulujeme k výhře "' || v_prize_title || '". Pro převzetí této výhry je nutný zákonný zástupce. Prosím kontaktujte nás přes chat.',
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Administrativní follow-up notifikace: rovněž bez věku
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_guardian_notification_if_needed(
  p_prize_id uuid,
  p_user_id uuid,
  p_contest_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prize_record bonus_prizes%ROWTYPE;
  v_existing_notification uuid;
  v_notification_id uuid;
  v_message text;
BEGIN
  SELECT * INTO v_prize_record
  FROM bonus_prizes
  WHERE id = p_prize_id;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'reason', 'Prize not found');
  END IF;

  -- Physical prize only (amount is null or 0)
  IF v_prize_record.amount IS NOT NULL AND v_prize_record.amount > 0 THEN
    RETURN json_build_object('success', false, 'reason', 'Not a physical prize');
  END IF;

  IF v_prize_record.guardian_required IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'reason', 'Guardian not required for this prize');
  END IF;

  -- Dřív zde byl lookup `profiles.date_of_birth`, výpočet věku a dvě předčasné
  -- návratové větve ('Date of birth not set' / 'User is 18 or older').
  -- Odstraněno: věk se neodvozuje a chybějící datum narození nikoho nevyřazuje.

  -- Marker [prize_id:...] drží deduplikaci a je záměrně beze změny, aby
  -- odpovídal i dříve vytvořeným řádkům.
  v_message := format('Výhra vyžaduje převzetí se zákonným zástupcem. [prize_id:%s]', p_prize_id);

  SELECT id INTO v_existing_notification
  FROM notifications
  WHERE type = 'guardian_followup'
    AND user_id = p_user_id
    AND message LIKE '%[prize_id:' || p_prize_id || ']%';

  IF v_existing_notification IS NOT NULL THEN
    RETURN json_build_object('success', false, 'reason', 'Notification already exists', 'notification_id', v_existing_notification);
  END IF;

  INSERT INTO notifications (
    type,
    user_id,
    title,
    message,
    status
  ) VALUES (
    'guardian_followup',
    p_user_id,
    'Výhra se zákonným zástupcem',
    v_message,
    'pending'
  )
  RETURNING id INTO v_notification_id;

  RETURN json_build_object(
    'success', true,
    'notification_id', v_notification_id,
    'prize_id', p_prize_id
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Granty beze změny oproti 20260718190001 — pouze service_role
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_guardian_notification_if_needed(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_guardian_notification_if_needed(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_guardian_notification_if_needed(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_guardian_notification_if_needed(uuid, uuid, uuid) TO service_role;
