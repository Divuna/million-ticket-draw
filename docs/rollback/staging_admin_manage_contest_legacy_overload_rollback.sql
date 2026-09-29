-- STAGING ONLY (dxmowysntemfqfnanxua) — rollback odstranění legacy přetížení admin_manage_contest.
-- 29. 9. 2026: staging měl dvě signatury, produkce jen jednu. PostgREST vracel PGRST203
-- (nelze vybrat funkci) → admin nemohl vytvořit ani upravit soutěž.
--
-- ZACHOVÁNO (shodné s produkcí po odstranění komentářů, norm. md5 eef4f457aa4290c4a4aa5c7117608537):
--   public.admin_manage_contest(uuid,text,text,text,text,text,integer,numeric,text,boolean)
--   md5 staging 2b39e78a85fda766bf256a406816027f, ACL {postgres,authenticated,service_role}
--
-- ODSTRANĚNO (jen staging), md5 d60be435b554b440286254093535573d,
-- ACL {=X/postgres, postgres, anon, authenticated, service_role}, owner postgres.
-- Obnovení (nedoporučeno — vrátí PGRST203):

CREATE OR REPLACE FUNCTION public.admin_manage_contest(p_operation text, p_contest_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_main_prize text DEFAULT NULL::text, p_main_image text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_ticket_count integer DEFAULT NULL::integer, p_ticket_price numeric DEFAULT NULL::numeric, p_fast_game boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_admin_id uuid;
  v_contest_id uuid;
  v_old_record contests%rowtype;
  v_new_record contests%rowtype;
  v_bonus_summary text;
BEGIN
  v_admin_id := auth.uid();
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_admin_id AND role = 'superadmin') THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat soutěže';
  END IF;
  IF p_operation = 'update' AND p_contest_id IS NOT NULL THEN
    SELECT * INTO v_old_record FROM contests WHERE id = p_contest_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Soutěž nebyla nalezena'; END IF;
    IF p_ticket_count IS NOT NULL AND p_ticket_count < 5 THEN
      RAISE EXCEPTION 'Počet ticketů musí být platné číslo alespoň 5.';
    END IF;
    UPDATE contests SET
      title = COALESCE(p_title, title),
      description = COALESCE(p_description, description),
      main_prize = COALESCE(p_main_prize, main_prize),
      main_image = COALESCE(p_main_image, main_image),
      status = COALESCE(p_status, status),
      ticket_count = COALESCE(p_ticket_count, ticket_count),
      ticket_price = COALESCE(p_ticket_price, ticket_price),
      fast_game = COALESCE(p_fast_game, fast_game),
      updated_at = now()
    WHERE id = p_contest_id RETURNING * INTO v_new_record;
    v_contest_id := p_contest_id;
  ELSE
    IF p_title IS NULL OR p_main_prize IS NULL THEN
      RAISE EXCEPTION 'Název soutěže a hlavní cena jsou povinné';
    END IF;
    IF p_ticket_count IS NULL OR p_ticket_count < 5 THEN
      RAISE EXCEPTION 'Počet ticketů musí být platné číslo alespoň 5.';
    END IF;
    INSERT INTO contests (title, description, main_prize, main_image, status, ticket_count, ticket_price, fast_game)
    VALUES (p_title, p_description, p_main_prize, p_main_image, p_status, p_ticket_count, p_ticket_price, COALESCE(p_fast_game, false))
    RETURNING * INTO v_new_record;
    v_contest_id := v_new_record.id;
  END IF;
  SELECT STRING_AGG(CONCAT(bp.ticket_position,':',bp.description), ', ' ORDER BY bp.ticket_position)
  INTO v_bonus_summary FROM bonus_prizes bp WHERE bp.contest_id = v_contest_id;
  INSERT INTO admin_actions (admin_id, action_type, target_table, target_id, notes, metadata)
  VALUES (v_admin_id, CONCAT('contest_', p_operation), 'contests', v_contest_id,
    CONCAT('Soutěž ', p_operation, ': ', v_new_record.title),
    jsonb_build_object('old_data', CASE WHEN p_operation = 'update' THEN to_jsonb(v_old_record) ELSE NULL END,
      'new_data', to_jsonb(v_new_record), 'operation', p_operation));
  PERFORM notify_sofinity_event(CONCAT('contest_', p_operation), v_admin_id, v_contest_id,
    jsonb_build_object('contest_id', v_contest_id, 'title', v_new_record.title,
      'ticket_count', v_new_record.ticket_count, 'admin_id', v_admin_id, 'timestamp', now()));
  RETURN jsonb_build_object('success', true,
    'message', CASE WHEN p_operation = 'create' THEN 'Soutěž byla úspěšně vytvořena' ELSE 'Soutěž byla úspěšně aktualizována' END,
    'contest_id', v_contest_id, 'contest_data', row_to_json(v_new_record));
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Chyba při správě soutěže: %', SQLERRM;
END;
$function$;
