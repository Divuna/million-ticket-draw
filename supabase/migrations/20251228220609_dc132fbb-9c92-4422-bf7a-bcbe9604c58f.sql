-- Create a function to check and insert guardian followup notifications
-- This prevents duplicates by using ON CONFLICT (requires adding a unique constraint first)

-- First, add a unique constraint to prevent duplicate notifications
-- Note: We need a composite key on type + user_id + a reference to the prize
-- Since notifications doesn't have prize_id, we'll store it in the message or use upsert logic

-- Create a function that checks if a guardian notification should be created
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
  v_date_of_birth date;
  v_age integer;
  v_existing_notification uuid;
  v_notification_id uuid;
  v_message text;
BEGIN
  -- Get the prize record
  SELECT * INTO v_prize_record
  FROM bonus_prizes
  WHERE id = p_prize_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'reason', 'Prize not found');
  END IF;
  
  -- Check if it's a physical prize (amount is null or 0)
  IF v_prize_record.amount IS NOT NULL AND v_prize_record.amount > 0 THEN
    RETURN json_build_object('success', false, 'reason', 'Not a physical prize');
  END IF;
  
  -- Check if guardian_required is true
  IF v_prize_record.guardian_required IS NOT TRUE THEN
    RETURN json_build_object('success', false, 'reason', 'Guardian not required for this prize');
  END IF;
  
  -- Get user's date of birth from profiles
  SELECT date_of_birth INTO v_date_of_birth
  FROM profiles
  WHERE id = p_user_id;
  
  IF v_date_of_birth IS NULL THEN
    RETURN json_build_object('success', false, 'reason', 'Date of birth not set');
  END IF;
  
  -- Calculate age
  v_age := EXTRACT(YEAR FROM age(CURRENT_DATE, v_date_of_birth));
  
  -- If age >= 18, no notification needed
  IF v_age >= 18 THEN
    RETURN json_build_object('success', false, 'reason', 'User is 18 or older', 'age', v_age);
  END IF;
  
  -- Build the notification message with prize_id embedded for uniqueness check
  v_message := format('Uživatel je mladší 18 let – nutný kontakt zákonného zástupce. [prize_id:%s]', p_prize_id);
  
  -- Check if notification already exists for this prize
  SELECT id INTO v_existing_notification
  FROM notifications
  WHERE type = 'guardian_followup'
    AND user_id = p_user_id
    AND message LIKE '%[prize_id:' || p_prize_id || ']%';
  
  IF v_existing_notification IS NOT NULL THEN
    RETURN json_build_object('success', false, 'reason', 'Notification already exists', 'notification_id', v_existing_notification);
  END IF;
  
  -- Insert the notification
  INSERT INTO notifications (
    type,
    user_id,
    title,
    message,
    status
  ) VALUES (
    'guardian_followup',
    p_user_id,
    'Výherce mladší 18 let',
    v_message,
    'pending'
  )
  RETURNING id INTO v_notification_id;
  
  RETURN json_build_object(
    'success', true,
    'notification_id', v_notification_id,
    'user_age', v_age,
    'prize_id', p_prize_id
  );
END;
$$;

-- Create a function to check all guardian-required prizes and create missing notifications
CREATE OR REPLACE FUNCTION public.check_guardian_notifications_batch()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prize RECORD;
  v_result json;
  v_created_count integer := 0;
  v_skipped_count integer := 0;
  v_errors text[] := ARRAY[]::text[];
BEGIN
  -- Loop through all physical guardian-required prizes that have been won
  FOR v_prize IN
    SELECT 
      bp.id as prize_id,
      bp.contest_id,
      bp.ticket_position,
      t.user_id
    FROM bonus_prizes bp
    JOIN tickets t ON t.contest_id = bp.contest_id AND t.number = bp.ticket_position
    WHERE bp.guardian_required = true
      AND (bp.amount IS NULL OR bp.amount = 0)
      AND bp.status IN ('won', 'pending')
  LOOP
    BEGIN
      SELECT create_guardian_notification_if_needed(
        v_prize.prize_id,
        v_prize.user_id,
        v_prize.contest_id
      ) INTO v_result;
      
      IF (v_result->>'success')::boolean THEN
        v_created_count := v_created_count + 1;
      ELSE
        v_skipped_count := v_skipped_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_errors := array_append(v_errors, format('Prize %s: %s', v_prize.prize_id, SQLERRM));
    END;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'created_count', v_created_count,
    'skipped_count', v_skipped_count,
    'errors', v_errors,
    'timestamp', now()
  );
END;
$$;