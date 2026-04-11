-- Root cause fix: ContestDetail.tsx calls buy_ticket_atomic RPC directly,
-- never going through purchase-ticket Edge Function where assign was wired.
-- Solution: DB trigger on tickets AFTER INSERT — assign runs for ALL code paths.

CREATE OR REPLACE FUNCTION public.trg_fn_assign_offer_on_ticket_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.assign_partner_offer_to_ticket(
      p_user_id    := NEW.user_id,
      p_contest_id := NEW.contest_id,
      p_ticket_id  := NEW.id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'assign_partner_offer_to_ticket failed for ticket %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_offer_on_ticket_insert ON public.tickets;

CREATE TRIGGER trg_assign_offer_on_ticket_insert
AFTER INSERT ON public.tickets
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_assign_offer_on_ticket_insert();
