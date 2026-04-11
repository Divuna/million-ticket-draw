-- Trigger: when partner_offers.status changes to 'approved' and deployment_mode = 'all_contests'
-- automatically insert records into partner_offer_contests for all active/pending contests.
-- Duplicates are prevented via WHERE NOT EXISTS (respects partial unique index uq_poc_active).

-- ── 1. Trigger function ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_fn_link_approved_offer_to_contests()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (OLD.status IS DISTINCT FROM 'approved') AND (NEW.status = 'approved') THEN
    IF NEW.deployment_mode = 'all_contests' THEN
      INSERT INTO public.partner_offer_contests (offer_id, contest_id)
      SELECT NEW.id, c.id
      FROM public.contests c
      WHERE c.status IN ('active', 'pending')
        AND NOT EXISTS (
          SELECT 1
          FROM public.partner_offer_contests poc
          WHERE poc.offer_id   = NEW.id
            AND poc.contest_id = c.id
            AND poc.detached_at IS NULL
        );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2. Trigger ─────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_partner_offer_approved ON public.partner_offers;

CREATE TRIGGER trg_partner_offer_approved
AFTER UPDATE OF status ON public.partner_offers
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_link_approved_offer_to_contests();

-- ── 3. Backfill: already-approved all_contests offers missing from poc ──────
INSERT INTO public.partner_offer_contests (offer_id, contest_id)
SELECT po.id, c.id
FROM public.partner_offers po
CROSS JOIN public.contests c
WHERE po.status          = 'approved'
  AND po.deployment_mode = 'all_contests'
  AND c.status IN ('active', 'pending')
  AND NOT EXISTS (
    SELECT 1
    FROM public.partner_offer_contests poc
    WHERE poc.offer_id   = po.id
      AND poc.contest_id = c.id
      AND poc.detached_at IS NULL
  );
