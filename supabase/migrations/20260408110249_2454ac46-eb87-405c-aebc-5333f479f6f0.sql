-- 1. Add column
ALTER TABLE public.contests ADD COLUMN fast_game boolean NOT NULL DEFAULT false;

-- 2. Recreate admin_manage_contest with p_fast_game parameter
CREATE OR REPLACE FUNCTION public.admin_manage_contest(
  p_contest_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_main_prize text DEFAULT NULL,
  p_main_image text DEFAULT NULL,
  p_status text DEFAULT 'draft',
  p_ticket_count integer DEFAULT 1000000,
  p_ticket_price numeric DEFAULT 1,
  p_operation text DEFAULT 'create',
  p_fast_game boolean DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_contest_id uuid;
  v_old_record contests%rowtype;
  v_new_record contests%rowtype;
  v_bonus_summary text;
  v_payload jsonb;
BEGIN
  v_admin_id := auth.uid();
  
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = v_admin_id 
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat soutěže';
  END IF;

  IF p_operation = 'update' AND p_contest_id IS NOT NULL THEN
    SELECT * INTO v_old_record
    FROM contests
    WHERE id = p_contest_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Soutěž nebyla nalezena';
    END IF;

    UPDATE contests 
    SET 
      title = COALESCE(p_title, title),
      description = COALESCE(p_description, description),
      main_prize = COALESCE(p_main_prize, main_prize),
      main_image = COALESCE(p_main_image, main_image),
      status = COALESCE(p_status, status),
      ticket_count = COALESCE(p_ticket_count, ticket_count),
      ticket_price = COALESCE(p_ticket_price, ticket_price),
      fast_game = COALESCE(p_fast_game, fast_game),
      updated_at = now()
    WHERE id = p_contest_id
    RETURNING * INTO v_new_record;

    v_contest_id := p_contest_id;

  ELSE
    IF p_title IS NULL OR p_main_prize IS NULL THEN
      RAISE EXCEPTION 'Název soutěže a hlavní cena jsou povinné';
    END IF;

    INSERT INTO contests (
      title, description, main_prize, main_image, 
      status, ticket_count, ticket_price, fast_game
    ) VALUES (
      p_title, p_description, p_main_prize, p_main_image,
      p_status, p_ticket_count, p_ticket_price, COALESCE(p_fast_game, false)
    ) RETURNING * INTO v_new_record;

    v_contest_id := v_new_record.id;
  END IF;

  SELECT STRING_AGG(
    CONCAT(bp.ticket_position, ':', bp.description, 
           CASE WHEN bp.amount IS NOT NULL AND bp.amount > 0 
                THEN CONCAT('(', bp.amount, ' MioCoins)')
                ELSE '(Fyzická výhra)' END),
    ', ' ORDER BY bp.ticket_position
  ) INTO v_bonus_summary
  FROM bonus_prizes bp
  WHERE bp.contest_id = v_contest_id;

  INSERT INTO admin_actions (
    admin_id, action_type, target_table, target_id, notes, metadata
  ) VALUES (
    v_admin_id,
    CONCAT('contest_', p_operation),
    'contests',
    v_contest_id,
    CONCAT('Soutěž ', p_operation, ': ', v_new_record.title),
    jsonb_build_object(
      'old_data', CASE WHEN p_operation = 'update' THEN to_jsonb(v_old_record) ELSE NULL END,
      'new_data', to_jsonb(v_new_record),
      'bonus_summary', COALESCE(v_bonus_summary, 'Žádné bonusové výhry'),
      'operation', p_operation
    )
  );

  v_payload := jsonb_build_object(
    'event_name', CONCAT('contest_', p_operation),
    'contest_id', v_contest_id,
    'title', v_new_record.title,
    'main_prize', v_new_record.main_prize,
    'status', v_new_record.status,
    'ticket_count', v_new_record.ticket_count,
    'ticket_price', v_new_record.ticket_price,
    'bonus_summary', COALESCE(v_bonus_summary, 'Žádné bonusové výhry'),
    'admin_id', v_admin_id,
    'timestamp', now()
  );

  PERFORM notify_sofinity_event(
    CONCAT('contest_', p_operation),
    v_admin_id,
    v_contest_id,
    v_payload
  );

  RETURN json_build_object(
    'success', true,
    'message', CASE 
      WHEN p_operation = 'create' THEN 'Soutěž byla úspěšně vytvořena'
      ELSE 'Soutěž byla úspěšně aktualizována'
    END,
    'contest_id', v_contest_id,
    'contest_data', row_to_json(v_new_record)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba při správě soutěže: %', SQLERRM;
END;
$$;

-- 3. Recreate get_contest_management_data with fast_game
DROP FUNCTION IF EXISTS get_contest_management_data(uuid);

CREATE OR REPLACE FUNCTION get_contest_management_data(p_contest_id_filter UUID DEFAULT NULL)
RETURNS TABLE (
  contest_id UUID,
  title TEXT,
  description TEXT,
  main_prize TEXT,
  main_image TEXT,
  status TEXT,
  ticket_count INTEGER,
  ticket_price NUMERIC,
  tickets_sold BIGINT,
  progress_percentage NUMERIC,
  total_miocoin_bonus BIGINT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  fast_game BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id AS contest_id,
    c.title,
    c.description,
    c.main_prize,
    c.main_image,
    c.status,
    c.ticket_count,
    c.ticket_price,
    COALESCE(t.sold_count, 0)::BIGINT AS tickets_sold,
    CASE 
      WHEN c.ticket_count > 0 THEN 
        ROUND((COALESCE(t.sold_count, 0)::NUMERIC / c.ticket_count::NUMERIC) * 100, 1)
      ELSE 0::NUMERIC
    END AS progress_percentage,
    COALESCE(b.total_bonus, 0)::BIGINT AS total_miocoin_bonus,
    c.created_at,
    c.updated_at,
    c.fast_game
  FROM contests c
  LEFT JOIN (
    SELECT tk.contest_id AS cid, COUNT(*) AS sold_count
    FROM tickets tk
    GROUP BY tk.contest_id
  ) t ON t.cid = c.id
  LEFT JOIN (
    SELECT bp.contest_id AS cid, SUM(COALESCE(bp.amount, 0))::BIGINT AS total_bonus
    FROM bonus_prizes bp
    GROUP BY bp.contest_id
  ) b ON b.cid = c.id
  WHERE (p_contest_id_filter IS NULL OR c.id = p_contest_id_filter)
  ORDER BY c.created_at DESC;
END;
$$;