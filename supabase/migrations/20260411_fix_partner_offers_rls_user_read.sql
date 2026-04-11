-- Fix: regular (customer) users cannot read partner_offers rows.
-- The SELECT policies only covered admins and the owning partner.
-- When Wins.tsx JOINs user_partner_offers → partner_offers, the offer
-- data was silently returning NULL, causing OfferCard to render nothing.
--
-- Solution: allow any authenticated user to read approved partner_offers
-- that have been assigned to them via user_partner_offers.
-- (Approved offers are safe to expose to the assigned users.)

CREATE POLICY po_user_assigned_select ON public.partner_offers
FOR SELECT
TO authenticated
USING (
  status = 'approved'
  AND id IN (
    SELECT offer_id
    FROM public.user_partner_offers
    WHERE user_id = auth.uid()
  )
);
