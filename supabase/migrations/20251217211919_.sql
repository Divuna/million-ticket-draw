-- Modify prevent_manual_total_miocoin_update to allow updates from trigger context
-- Uses pg_trigger_depth() > 1 to detect cascading trigger calls (e.g., from trg_sync_total_miocoin_bonus)

CREATE OR REPLACE FUNCTION prevent_manual_total_miocoin_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow updates from trigger context (pg_trigger_depth() > 1 means called from another trigger)
  -- This permits trg_sync_total_miocoin_bonus to update total_miocoin_bonus
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  -- Block direct application updates to total_miocoin_bonus
  IF OLD.total_miocoin_bonus IS DISTINCT FROM NEW.total_miocoin_bonus THEN
    RAISE EXCEPTION 'Direct update of total_miocoin_bonus is not allowed. Use bonus_prizes table instead.';
  END IF;

  RETURN NEW;
END;
$$;;
