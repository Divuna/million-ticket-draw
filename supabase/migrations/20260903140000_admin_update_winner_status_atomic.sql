-- Atomická a auditovaná změna stavu výhry + sjednocení winners ↔ bonus_prizes
-- ---------------------------------------------------------------------------
-- Řeší nález A06 z docs/ONEMIL_MASTER_AUDIT_RESULTS.md:
--
-- 1) `/admin/winners` (AdminWinners.tsx) měnil stav třemi samostatnými,
--    netransakčními klientskými zápisy: přímý UPDATE `winners` → INSERT
--    `winner_status_history` → INSERT `messages`. Selhání kroku 2 nebo 3 se
--    jen zalogovalo do konzole („Continue anyway") a admin přesto viděl hlášku
--    „Stav výhry byl úspěšně změněn a uživatel byl informován“ — i když se
--    historie ani zpráva ve skutečnosti nezapsaly. V hromadné variantě se
--    chyby těch dvou kroků nezachytávaly vůbec.
--
-- 2) Změna stavu výhry nezapisovala žádný centrální audit (`admin_actions`),
--    na rozdíl od sesterské cesty `update_bonus_prize_delivery_status`.
--
-- 3) Dva nezávislé zdroje pravdy: `/admin/winners` psal jen `winners`,
--    `/admin/prize-delivery` psal jen `bonus_prizes`. Zákaznická stránka
--    `/wins` čte pouze `winners`, takže označení věcné bonusové výhry jako
--    předané přes prize-delivery bylo pro zákazníka neviditelné.
--
-- Oprava:
-- - Nová `admin_update_winner_status()` provede stav + historii + zprávu +
--   audit + synchronizaci `bonus_prizes` jako JEDNU transakci. Cokoli selže,
--   vrátí se celé; UI tedy nemůže dostat falešný úspěch.
-- - `update_bonus_prize_delivery_status()` nově dopíše i odpovídající řádek
--   `winners`, takže obě obrazovky konvergují na stejný stav.
--
-- Rozsah: dvě funkce + granty. Žádná změna dat, RLS politik, constraintů,
-- ani jiných funkcí. Migrace sama nemění žádný existující řádek.
--
-- Rollback: DROP FUNCTION public.admin_update_winner_status(uuid, text, text);
-- a obnovit `update_bonus_prize_delivery_status` z
-- 20250921145449_2b4db9c7-4095-43c7-b169-c2c551c65cc5.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Jediná bezpečná atomická cesta pro změnu stavu výhry
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_winner_status(
  p_winner_id  uuid,
  p_new_status text,
  p_message    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id     uuid := auth.uid();
  v_winner       public.winners%rowtype;
  v_old_status   text;
  v_delivered    boolean;
  v_message      text;
  v_prize_synced boolean := false;
BEGIN
  -- Admin guard nad kanonickou public.user_roles (nikdy legacy public.users.role,
  -- kde je v produkci doložený drift admin účtu).
  IF NOT (
    public.has_role(v_admin_id, 'admin'::public.app_role)
    OR public.has_role(v_admin_id, 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  IF p_new_status IS NULL OR p_new_status NOT IN (
    'pending', 'připraveno k odeslání', 'shipped', 'delivered'
  ) THEN
    RAISE EXCEPTION 'Neplatný stav výhry: %', COALESCE(p_new_status, '(null)');
  END IF;

  -- Zámek řádku výhry — souběžné změny stavu se serializují.
  SELECT * INTO v_winner
  FROM public.winners
  WHERE id = p_winner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Výhra nenalezena';
  END IF;

  v_old_status := COALESCE(v_winner.status, 'pending');
  v_delivered  := (p_new_status = 'delivered');

  -- 1. Stav výhry. `delivered` se zvedne jen při přechodu na 'delivered';
  --    nikdy se nesnižuje zpět, aby se nerozbila již uzavřená výhra.
  UPDATE public.winners
  SET
    status    = p_new_status,
    delivered = CASE WHEN v_delivered THEN true ELSE delivered END
  WHERE id = p_winner_id;

  -- 2. Historie změn stavu (dříve mohla tiše chybět).
  INSERT INTO public.winner_status_history (winner_id, old_status, new_status, changed_by)
  VALUES (p_winner_id, v_old_status, p_new_status, v_admin_id);

  -- 3. Notifikace zákazníkovi. Text smí dodat admin UI; jinak server default.
  v_message := COALESCE(
    NULLIF(btrim(p_message), ''),
    'Stav vaší výhry byl aktualizován na: ' || p_new_status || '.'
  );

  INSERT INTO public.messages (user_id, sender, content, read, topic, event, payload)
  VALUES (
    v_winner.user_id,
    'admin',
    v_message,
    false,
    'prize_status',
    'prize_status_change',
    jsonb_build_object(
      'winner_id',  p_winner_id,
      'new_status', p_new_status,
      'old_status', v_old_status
    )
  );

  -- 4. Sjednocení druhého zdroje pravdy: u bonusové věcné výhry posuň
  --    i `bonus_prizes`, aby se `/admin/prize-delivery` nerozešel s `/wins`.
  IF v_winner.prize_id IS NOT NULL AND v_delivered THEN
    UPDATE public.bonus_prizes
    SET status = 'delivered'
    WHERE id = v_winner.prize_id
      AND status IS DISTINCT FROM 'delivered';
    v_prize_synced := FOUND;
  END IF;

  -- 5. Centrální audit (stejný vzor jako update_bonus_prize_delivery_status).
  INSERT INTO public.admin_actions (
    admin_id, action_type, target_table, target_id, notes, metadata
  ) VALUES (
    v_admin_id,
    'winner_status_updated',
    'winners',
    p_winner_id,
    CONCAT('Stav výhry změněn: ', v_old_status, ' → ', p_new_status),
    jsonb_build_object(
      'old_status',        v_old_status,
      'new_status',        p_new_status,
      'delivered',         v_delivered,
      'prize_id',          v_winner.prize_id,
      'contest_id',        v_winner.contest_id,
      'bonus_prize_synced', v_prize_synced
    )
  );

  RETURN jsonb_build_object(
    'success',            true,
    'winner_id',          p_winner_id,
    'old_status',         v_old_status,
    'new_status',         p_new_status,
    'delivered',          v_delivered,
    'bonus_prize_synced', v_prize_synced,
    'user_notified',      true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_winner_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_winner_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_winner_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_winner_status(uuid, text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Opačný směr: prize-delivery nově dopíše i winners
-- ─────────────────────────────────────────────────────────────────────────────
-- Tělo zůstává jinak shodné s 20250921145449; přibývá pouze synchronizace
-- navázaného řádku `winners`, aby zákazník na `/wins` viděl skutečný stav.
CREATE OR REPLACE FUNCTION public.update_bonus_prize_delivery_status(
  p_prize_id uuid,
  p_status text,
  p_admin_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_record bonus_prizes%rowtype;
  v_new_record bonus_prizes%rowtype;
  v_admin_id uuid;
  v_contest_id uuid;
  v_payload jsonb;
  v_winners_synced integer := 0;
BEGIN
  v_admin_id := auth.uid();

  -- Kanonická user_roles (dříve legacy public.users.role).
  IF NOT (
    public.has_role(v_admin_id, 'admin'::public.app_role)
    OR public.has_role(v_admin_id, 'superadmin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Only admin users can update prize delivery status';
  END IF;

  SELECT * INTO v_old_record
  FROM bonus_prizes
  WHERE id = p_prize_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bonus prize not found';
  END IF;

  v_contest_id := v_old_record.contest_id;

  UPDATE bonus_prizes
  SET
    status = p_status,
    admin_notes = p_admin_notes
  WHERE id = p_prize_id
  RETURNING * INTO v_new_record;

  -- NOVÉ: drž `winners` v souladu, jinak zákazník na /wins vidí dál „čeká“.
  IF p_status = 'delivered' THEN
    UPDATE public.winners
    SET status = 'delivered', delivered = true
    WHERE prize_id = p_prize_id
      AND type = 'bonus';
    GET DIAGNOSTICS v_winners_synced = ROW_COUNT;
  END IF;

  INSERT INTO admin_actions (
    admin_id, action_type, target_table, target_id, notes, metadata
  ) VALUES (
    v_admin_id,
    'bonus_prize_delivery_updated',
    'bonus_prizes',
    p_prize_id,
    CONCAT('Updated delivery status to: ', p_status,
           CASE WHEN p_admin_notes IS NOT NULL
                THEN CONCAT(', Notes: ', p_admin_notes)
                ELSE '' END),
    jsonb_build_object(
      'old_status', v_old_record.status,
      'new_status', v_new_record.status,
      'old_admin_notes', v_old_record.admin_notes,
      'new_admin_notes', v_new_record.admin_notes,
      'contest_id', v_contest_id,
      'ticket_position', v_new_record.ticket_position,
      'description', v_new_record.description,
      'winners_synced', v_winners_synced
    )
  );

  v_payload := jsonb_build_object(
    'event_name', 'prize_delivery_updated',
    'contest_id', v_contest_id,
    'prize_id', p_prize_id,
    'ticket_position', v_new_record.ticket_position,
    'description', v_new_record.description,
    'old_status', v_old_record.status,
    'new_status', v_new_record.status,
    'admin_notes', v_new_record.admin_notes,
    'admin_id', v_admin_id,
    'timestamp', now()
  );

  PERFORM notify_sofinity_event(
    'prize_delivery_updated',
    v_admin_id,
    v_contest_id,
    v_payload
  );

  RETURN json_build_object(
    'success', true,
    'message', 'Stav předání výhry byl úspěšně aktualizován',
    'updated_prize', row_to_json(v_new_record),
    'winners_synced', v_winners_synced
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_bonus_prize_delivery_status(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_bonus_prize_delivery_status(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_bonus_prize_delivery_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_bonus_prize_delivery_status(uuid, text, text) TO service_role;
