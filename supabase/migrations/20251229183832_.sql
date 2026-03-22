-- Create function to mark all unseen wins as seen for current user
CREATE OR REPLACE FUNCTION public.mark_wins_as_seen()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE winners
  SET user_seen = true
  WHERE user_id = auth.uid()
    AND user_seen = false;
END;
$$;;
