-- Add admin_notes column to bonus_prizes table
ALTER TABLE public.bonus_prizes 
ADD COLUMN admin_notes text;

-- Create function to update bonus prize delivery status with logging
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
BEGIN
  -- Get current admin user
  v_admin_id := auth.uid();
  
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM users 
    WHERE id = v_admin_id 
    AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Only admin users can update prize delivery status';
  END IF;

  -- Get old record for logging
  SELECT * INTO v_old_record
  FROM bonus_prizes
  WHERE id = p_prize_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bonus prize not found';
  END IF;

  v_contest_id := v_old_record.contest_id;

  -- Update the bonus prize
  UPDATE bonus_prizes 
  SET 
    status = p_status,
    admin_notes = p_admin_notes
  WHERE id = p_prize_id
  RETURNING * INTO v_new_record;

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
      'description', v_new_record.description
    )
  );

  -- Prepare Sofinity payload
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

  -- Send event to Sofinity
  PERFORM notify_sofinity_event(
    'prize_delivery_updated',
    v_admin_id,
    v_contest_id,
    v_payload
  );

  -- Return success response
  RETURN json_build_object(
    'success', true,
    'message', 'Stav předání výhry byl úspěšně aktualizován',
    'updated_prize', row_to_json(v_new_record)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba při aktualizaci stavu: %', SQLERRM;
END;
$$;

-- Create function to get prizes delivery summary with STRING_AGG
CREATE OR REPLACE FUNCTION public.get_prizes_delivery_summary(p_contest_id uuid DEFAULT NULL)
RETURNS TABLE(
  contest_title text,
  total_prizes bigint,
  delivered_count bigint,
  pending_count bigint,
  won_count bigint,
  prize_positions text,
  summary_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH prize_stats AS (
    SELECT 
      c.title as contest_title,
      COUNT(bp.id) as total_prizes,
      COUNT(CASE WHEN bp.status = 'delivered' THEN 1 END) as delivered_count,
      COUNT(CASE WHEN bp.status = 'pending' THEN 1 END) as pending_count,
      COUNT(CASE WHEN bp.status = 'won' THEN 1 END) as won_count,
      STRING_AGG(
        CONCAT(bp.ticket_position, ':', bp.status, 
               CASE WHEN bp.admin_notes IS NOT NULL 
                    THEN CONCAT('(', bp.admin_notes, ')') 
                    ELSE '' END),
        ', ' ORDER BY bp.ticket_position
      ) as prize_positions
    FROM contests c
    LEFT JOIN bonus_prizes bp ON c.id = bp.contest_id
    WHERE (p_contest_id IS NULL OR c.id = p_contest_id)
    GROUP BY c.id, c.title
  )
  SELECT 
    ps.contest_title,
    ps.total_prizes,
    ps.delivered_count,
    ps.pending_count,
    ps.won_count,
    ps.prize_positions,
    CONCAT(ps.contest_title, ': ', ps.total_prizes, ' výher celkem, ',
           ps.delivered_count, ' předáno, ', ps.pending_count, ' čeká, ',
           ps.won_count, ' vyhráno') as summary_text
  FROM prize_stats ps;
END;
$$;;
