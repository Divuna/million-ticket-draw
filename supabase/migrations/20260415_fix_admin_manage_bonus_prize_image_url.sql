-- Fix: add p_image_url parameter to admin_manage_bonus_prize so that
-- physically-uploaded bonus prize images are actually stored in bonus_prizes.image_url.
-- Previously the frontend uploaded the file to storage but never passed the path
-- to the RPC, leaving bonus_prizes.image_url always NULL.

CREATE OR REPLACE FUNCTION public.admin_manage_bonus_prize(
  p_prize_id uuid DEFAULT NULL,
  p_contest_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_ticket_position integer DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_status text DEFAULT 'pending',
  p_operation text DEFAULT 'create',
  p_image_url text DEFAULT NULL          -- NEW: storage path or absolute URL
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

    -- Update bonus prize (image_url updated when a new value is supplied)
    UPDATE bonus_prizes
    SET
      description  = COALESCE(p_description,      description),
      ticket_position = COALESCE(p_ticket_position, ticket_position),
      amount       = COALESCE(p_amount,            amount),
      status       = COALESCE(p_status,            status),
      image_url    = COALESCE(p_image_url,         image_url)   -- NEW
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

    -- Create new bonus prize (include image_url when provided)
    INSERT INTO bonus_prizes (
      contest_id, description, ticket_position, amount, status, image_url   -- NEW: image_url
    ) VALUES (
      p_contest_id, p_description, p_ticket_position, p_amount, p_status, p_image_url
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
    'prize_id', v_prize_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'message', SQLERRM
    );
END;
$$;
