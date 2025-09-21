-- Enhanced contest management functions with logging and Sofinity integration

-- Function to create or update contest with full logging
CREATE OR REPLACE FUNCTION public.admin_manage_contest(
  p_contest_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_main_prize text DEFAULT NULL,
  p_main_image text DEFAULT NULL,
  p_status text DEFAULT 'draft',
  p_ticket_count integer DEFAULT 1000000,
  p_ticket_price numeric DEFAULT 1,
  p_operation text DEFAULT 'create'
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
  -- Get current admin user
  v_admin_id := auth.uid();
  
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = v_admin_id 
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat soutěže';
  END IF;

  -- Handle UPDATE operation
  IF p_operation = 'update' AND p_contest_id IS NOT NULL THEN
    -- Get old record for logging
    SELECT * INTO v_old_record
    FROM contests
    WHERE id = p_contest_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Soutěž nebyla nalezena';
    END IF;

    -- Update contest
    UPDATE contests 
    SET 
      title = COALESCE(p_title, title),
      description = COALESCE(p_description, description),
      main_prize = COALESCE(p_main_prize, main_prize),
      main_image = COALESCE(p_main_image, main_image),
      status = COALESCE(p_status, status),
      ticket_count = COALESCE(p_ticket_count, ticket_count),
      ticket_price = COALESCE(p_ticket_price, ticket_price),
      updated_at = now()
    WHERE id = p_contest_id
    RETURNING * INTO v_new_record;

    v_contest_id := p_contest_id;

  -- Handle CREATE operation
  ELSE
    -- Validate required fields for creation
    IF p_title IS NULL OR p_main_prize IS NULL THEN
      RAISE EXCEPTION 'Název soutěže a hlavní cena jsou povinné';
    END IF;

    -- Create new contest
    INSERT INTO contests (
      title, description, main_prize, main_image, 
      status, ticket_count, ticket_price
    ) VALUES (
      p_title, p_description, p_main_prize, p_main_image,
      p_status, p_ticket_count, p_ticket_price
    ) RETURNING * INTO v_new_record;

    v_contest_id := v_new_record.id;
  END IF;

  -- Get bonus prizes summary using STRING_AGG
  SELECT STRING_AGG(
    CONCAT(bp.ticket_position, ':', bp.description, 
           CASE WHEN bp.amount IS NOT NULL AND bp.amount > 0 
                THEN CONCAT('(', bp.amount, ' MioCoins)')
                ELSE '(Fyzická výhra)' END),
    ', ' ORDER BY bp.ticket_position
  ) INTO v_bonus_summary
  FROM bonus_prizes bp
  WHERE bp.contest_id = v_contest_id;

  -- Log admin action
  INSERT INTO admin_actions (
    admin_id,
    action_type,
    target_table,
    target_id,
    notes,
    metadata
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

  -- Prepare Sofinity payload
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

  -- Send event to Sofinity
  PERFORM notify_sofinity_event(
    CONCAT('contest_', p_operation),
    v_admin_id,
    v_contest_id,
    v_payload
  );

  -- Return success response
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

-- Function to manage bonus prizes with logging
CREATE OR REPLACE FUNCTION public.admin_manage_bonus_prize(
  p_prize_id uuid DEFAULT NULL,
  p_contest_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_ticket_position integer DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_status text DEFAULT 'pending',
  p_operation text DEFAULT 'create'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid;
  v_prize_id uuid;
  v_old_record bonus_prizes%rowtype;
  v_new_record bonus_prizes%rowtype;
  v_contest_title text;
  v_payload jsonb;
BEGIN
  -- Get current admin user
  v_admin_id := auth.uid();
  
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = v_admin_id 
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat bonusové výhry';
  END IF;

  -- Handle UPDATE operation
  IF p_operation = 'update' AND p_prize_id IS NOT NULL THEN
    -- Get old record for logging
    SELECT * INTO v_old_record
    FROM bonus_prizes
    WHERE id = p_prize_id;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Bonusová výhra nebyla nalezena';
    END IF;

    -- Update bonus prize
    UPDATE bonus_prizes 
    SET 
      description = COALESCE(p_description, description),
      ticket_position = COALESCE(p_ticket_position, ticket_position),
      amount = COALESCE(p_amount, amount),
      status = COALESCE(p_status, status)
    WHERE id = p_prize_id
    RETURNING * INTO v_new_record;

    v_prize_id := p_prize_id;
    p_contest_id := v_new_record.contest_id;

  -- Handle CREATE operation
  ELSE
    -- Validate required fields for creation
    IF p_contest_id IS NULL OR p_description IS NULL OR p_ticket_position IS NULL THEN
      RAISE EXCEPTION 'ID soutěže, popis a pozice tiketu jsou povinné';
    END IF;

    -- Check if contest exists
    IF NOT EXISTS (SELECT 1 FROM contests WHERE id = p_contest_id) THEN
      RAISE EXCEPTION 'Soutěž s daným ID neexistuje';
    END IF;

    -- Check if ticket position is already taken
    IF EXISTS (
      SELECT 1 FROM bonus_prizes 
      WHERE contest_id = p_contest_id AND ticket_position = p_ticket_position
    ) THEN
      RAISE EXCEPTION 'Pozice tiketu % je již obsazena v této soutěži', p_ticket_position;
    END IF;

    -- Create new bonus prize
    INSERT INTO bonus_prizes (
      contest_id, description, ticket_position, amount, status
    ) VALUES (
      p_contest_id, p_description, p_ticket_position, p_amount, p_status
    ) RETURNING * INTO v_new_record;

    v_prize_id := v_new_record.id;
  END IF;

  -- Get contest title for logging
  SELECT title INTO v_contest_title
  FROM contests
  WHERE id = p_contest_id;

  -- Log admin action
  INSERT INTO admin_actions (
    admin_id,
    action_type,
    target_table,
    target_id,
    notes,
    metadata
  ) VALUES (
    v_admin_id,
    CONCAT('bonus_prize_', p_operation),
    'bonus_prizes',
    v_prize_id,
    CONCAT('Bonusová výhra ', p_operation, ': ', v_new_record.description, 
           ' (pozice ', v_new_record.ticket_position, ')'),
    jsonb_build_object(
      'old_data', CASE WHEN p_operation = 'update' THEN to_jsonb(v_old_record) ELSE NULL END,
      'new_data', to_jsonb(v_new_record),
      'contest_title', v_contest_title,
      'operation', p_operation
    )
  );

  -- Prepare Sofinity payload
  v_payload := jsonb_build_object(
    'event_name', CONCAT('bonus_prize_', p_operation),
    'contest_id', p_contest_id,
    'prize_id', v_prize_id,
    'description', v_new_record.description,
    'ticket_position', v_new_record.ticket_position,
    'amount', v_new_record.amount,
    'status', v_new_record.status,
    'contest_title', v_contest_title,
    'admin_id', v_admin_id,
    'timestamp', now()
  );

  -- Send event to Sofinity
  PERFORM notify_sofinity_event(
    CONCAT('bonus_prize_', p_operation),
    v_admin_id,
    p_contest_id,
    v_payload
  );

  -- Return success response
  RETURN json_build_object(
    'success', true,
    'message', CASE 
      WHEN p_operation = 'create' THEN 'Bonusová výhra byla úspěšně vytvořena'
      ELSE 'Bonusová výhra byla úspěšně aktualizována'
    END,
    'prize_id', v_prize_id,
    'prize_data', row_to_json(v_new_record)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba při správě bonusové výhry: %', SQLERRM;
END;
$$;

-- Function to get contest with bonus prizes summary and progress
CREATE OR REPLACE FUNCTION public.get_contest_management_data(p_contest_id uuid DEFAULT NULL)
RETURNS TABLE(
  contest_id uuid,
  title text,
  description text,
  main_prize text,
  main_image text,
  status text,
  ticket_count integer,
  ticket_price numeric,
  tickets_sold bigint,
  progress_percentage numeric,
  bonus_count bigint,
  bonus_summary text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH contest_stats AS (
    SELECT 
      c.id,
      c.title,
      c.description,
      c.main_prize,
      c.main_image,
      c.status,
      c.ticket_count,
      c.ticket_price,
      c.created_at,
      c.updated_at,
      COALESCE(t.tickets_sold, 0) as tickets_sold,
      ROUND((COALESCE(t.tickets_sold, 0)::numeric / c.ticket_count::numeric) * 100, 2) as progress_percentage,
      COALESCE(bp.bonus_count, 0) as bonus_count,
      bp.bonus_summary
    FROM contests c
    LEFT JOIN (
      SELECT 
        contest_id,
        COUNT(*) as tickets_sold
      FROM tickets
      GROUP BY contest_id
    ) t ON c.id = t.contest_id
    LEFT JOIN (
      SELECT 
        contest_id,
        COUNT(*) as bonus_count,
        STRING_AGG(
          CONCAT(ticket_position, ':', description, 
                 CASE WHEN amount IS NOT NULL AND amount > 0 
                      THEN CONCAT('(', amount, ' MioCoins)')
                      ELSE '(Fyzická)' END,
                 '[', status, ']'),
          ', ' ORDER BY ticket_position
        ) as bonus_summary
      FROM bonus_prizes
      GROUP BY contest_id
    ) bp ON c.id = bp.contest_id
    WHERE (p_contest_id IS NULL OR c.id = p_contest_id)
  )
  SELECT 
    cs.id,
    cs.title,
    cs.description,
    cs.main_prize,
    cs.main_image,
    cs.status,
    cs.ticket_count,
    cs.ticket_price,
    cs.tickets_sold,
    cs.progress_percentage,
    cs.bonus_count,
    COALESCE(cs.bonus_summary, 'Žádné bonusové výhry'),
    cs.created_at,
    cs.updated_at
  FROM contest_stats cs
  ORDER BY cs.updated_at DESC;
END;
$$;