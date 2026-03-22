
-- Create trigger function to send guardian message when guardian-required prize is won
CREATE OR REPLACE FUNCTION public.trigger_guardian_message_on_winner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guardian_required boolean;
  v_amount numeric;
  v_prize_title text;
  v_user_dob date;
  v_user_age int;
BEGIN
  -- Only process bonus prizes (they have prize_id)
  IF NEW.prize_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if this is a guardian-required physical prize
  SELECT guardian_required, amount, COALESCE(title, description)
  INTO v_guardian_required, v_amount, v_prize_title
  FROM bonus_prizes
  WHERE id = NEW.prize_id;

  -- Exit if not guardian required or not physical (has monetary amount)
  IF NOT v_guardian_required OR (v_amount IS NOT NULL AND v_amount > 0) THEN
    RETURN NEW;
  END IF;

  -- Check if user is under 18
  SELECT date_of_birth INTO v_user_dob
  FROM profiles
  WHERE id = NEW.user_id;

  IF v_user_dob IS NULL THEN
    -- No DOB, assume guardian message is needed (safer)
    v_user_age := 0;
  ELSE
    v_user_age := EXTRACT(YEAR FROM age(CURRENT_DATE, v_user_dob));
  END IF;

  -- Only send message if user is under 18
  IF v_user_age < 18 THEN
    -- Check if message already exists to prevent duplicates
    IF NOT EXISTS (
      SELECT 1 FROM messages 
      WHERE user_id = NEW.user_id 
      AND sender = 'system'
      AND content LIKE '%' || v_prize_title || '%zákonného zástupce%'
      AND created_at > NOW() - INTERVAL '1 minute'
    ) THEN
      INSERT INTO messages (user_id, sender, content, created_at)
      VALUES (
        NEW.user_id,
        'system',
        '🎉 Gratulujeme k výhře "' || v_prize_title || '". Pro převzetí této výhry je nutný zákonný zástupce. Prosím kontaktujte nás přes chat.',
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on winners table
DROP TRIGGER IF EXISTS on_guardian_prize_winner ON winners;
CREATE TRIGGER on_guardian_prize_winner
  AFTER INSERT ON winners
  FOR EACH ROW
  EXECUTE FUNCTION trigger_guardian_message_on_winner();

-- Add comment for documentation
COMMENT ON FUNCTION trigger_guardian_message_on_winner() IS 'Automatically sends a system message to under-18 users who win guardian-required physical prizes';
;
