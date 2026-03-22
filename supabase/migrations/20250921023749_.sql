-- Create admin_actions table for detailed admin logging
CREATE TABLE IF NOT EXISTS admin_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id uuid NOT NULL,
  action_type text NOT NULL,
  target_table text NOT NULL,
  target_id uuid,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS on admin_actions table
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for admin access only
CREATE POLICY "Allow admin full access to admin actions" 
ON admin_actions 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM users u 
  WHERE u.id = auth.uid() 
  AND u.role IN ('admin', 'superadmin')
));

-- Create function to handle contest events and send to Sofinity
CREATE OR REPLACE FUNCTION handle_contest_sofinity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  admin_user_id uuid;
  event_name text;
  contest_metadata jsonb;
  bonus_prizes_summary text;
BEGIN
  -- Get the current admin user
  admin_user_id := auth.uid();
  
  -- Determine event name based on operation
  IF TG_OP = 'INSERT' THEN
    event_name := 'contest_created';
  ELSIF TG_OP = 'UPDATE' THEN
    event_name := 'contest_updated';
  ELSE
    event_name := 'contest_changed';
  END IF;

  -- Get bonus prizes summary using STRING_AGG
  SELECT STRING_AGG(
    CONCAT(bp.ticket_position, ':', bp.description, '(', COALESCE(bp.amount::text, 'physical'), ')'),
    ', '
    ORDER BY bp.ticket_position
  ) INTO bonus_prizes_summary
  FROM bonus_prizes bp
  WHERE bp.contest_id = NEW.id;

  -- Build metadata with contest details
  contest_metadata := jsonb_build_object(
    'contest_id', NEW.id,
    'title', NEW.title,
    'status', NEW.status,
    'main_prize', NEW.main_prize,
    'ticket_count', NEW.ticket_count,
    'ticket_price', NEW.ticket_price,
    'bonus_prizes_summary', COALESCE(bonus_prizes_summary, 'No bonus prizes'),
    'admin_action', true,
    'operation', TG_OP
  );

  -- Send event to Sofinity using existing function
  PERFORM notify_sofinity_event(
    event_name,
    admin_user_id,
    NEW.id,
    contest_metadata
  );

  -- Log admin action
  INSERT INTO admin_actions (
    admin_id,
    action_type,
    target_table,
    target_id,
    notes,
    metadata
  ) VALUES (
    admin_user_id,
    event_name,
    'contests',
    NEW.id,
    CONCAT('Contest ', TG_OP, ': ', NEW.title),
    contest_metadata
  );

  -- Also log to existing audit_logs for compatibility
  PERFORM log_admin_action(
    event_name,
    'contests',
    NEW.id,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );

  RETURN NEW;
END;
$$;

-- Create trigger for contest creation
CREATE OR REPLACE TRIGGER tr_contest_sofinity_events
AFTER INSERT OR UPDATE ON contests
FOR EACH ROW
EXECUTE FUNCTION handle_contest_sofinity_event();

-- Create function to get admin actions with user details and STRING_AGG summaries
CREATE OR REPLACE FUNCTION get_admin_actions_summary(
  p_limit integer DEFAULT 50,
  p_action_type text DEFAULT NULL,
  p_target_table text DEFAULT NULL,
  p_date_from timestamp with time zone DEFAULT NULL,
  p_date_to timestamp with time zone DEFAULT NULL
)
RETURNS TABLE(
  summary_line text,
  total_actions bigint,
  unique_admins bigint,
  recent_actions text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH filtered_actions AS (
    SELECT 
      aa.*,
      u.email as admin_email,
      u.name as admin_name
    FROM admin_actions aa
    LEFT JOIN users u ON aa.admin_id = u.id
    WHERE 
      (p_action_type IS NULL OR aa.action_type = p_action_type)
      AND (p_target_table IS NULL OR aa.target_table = p_target_table)
      AND (p_date_from IS NULL OR aa.timestamp >= p_date_from)
      AND (p_date_to IS NULL OR aa.timestamp <= p_date_to)
    ORDER BY aa.timestamp DESC
    LIMIT p_limit
  ),
  aggregated_data AS (
    SELECT
      COUNT(*) as total_count,
      COUNT(DISTINCT admin_id) as unique_admin_count,
      STRING_AGG(
        CONCAT(
          admin_email, ': ', action_type, ' on ', target_table, 
          ' at ', timestamp::date
        ),
        ' | '
        ORDER BY timestamp DESC
      ) as actions_summary
    FROM filtered_actions
  )
  SELECT 
    CONCAT('Total: ', total_count, ' actions by ', unique_admin_count, ' admins'),
    total_count,
    unique_admin_count,
    actions_summary
  FROM aggregated_data;
END;
$$;;
