-- Auto-activation trigger for Partner Offers
-- ─────────────────────────────────────────────────────────────────────────────
-- When a row is inserted into user_partner_offers (either by the DB trigger
-- trg_assign_offer_on_ticket_insert or by any other path), automatically
-- create the matching partner_offer_activations row.
--
-- Design decisions:
--   • SECURITY DEFINER so the INSERT runs as the function owner regardless of
--     the calling role (covers both authenticated user context and service-role
--     calls from Edge Functions).
--   • ON CONFLICT (upo_id) DO NOTHING — UNIQUE constraint already exists;
--     this makes the trigger idempotent against any future double-fire.
--   • EXCEPTION block — activation failure must NEVER block the ticket purchase
--     or offer-assignment flow; it only emits a WARNING to the DB log.
--   • activated_at = COALESCE(obtained_at, created_at, now()) — mirrors what
--     sync_partner_offer_activations() already uses so both paths are consistent.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_auto_activate_partner_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  -- Resolve partner_id from the offer (required NOT NULL in activations table)
  SELECT partner_id
  INTO   v_partner_id
  FROM   public.partner_offers
  WHERE  id = NEW.offer_id;

  -- If offer row is somehow missing, skip without error
  IF v_partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Insert activation; ON CONFLICT keeps this idempotent
  INSERT INTO public.partner_offer_activations (
    upo_id,
    offer_id,
    partner_id,
    user_id,
    activated_at
  ) VALUES (
    NEW.id,
    NEW.offer_id,
    v_partner_id,
    NEW.user_id,
    COALESCE(NEW.obtained_at, NEW.created_at, now())
  )
  ON CONFLICT (upo_id) DO NOTHING;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- Log but never block the calling transaction
  RAISE WARNING 'trg_fn_auto_activate_partner_offer failed for upo_id=%: %',
    NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- ── Trigger ──────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_auto_activate_partner_offer ON public.user_partner_offers;

CREATE TRIGGER trg_auto_activate_partner_offer
  AFTER INSERT ON public.user_partner_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_auto_activate_partner_offer();
