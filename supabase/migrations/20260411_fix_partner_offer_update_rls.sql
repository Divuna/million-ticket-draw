-- Fix: partner_offers UPDATE policy was too restrictive
-- WITH CHECK required status = 'draft', which blocked submitting (draft → submitted)
-- New logic:
--   USING:      partner can update rows where status IN ('draft', 'rejected')
--   WITH CHECK: partner can set status to 'draft', 'submitted', or 'rejected' (never 'approved')

DROP POLICY IF EXISTS po_partner_update ON partner_offers;

CREATE POLICY po_partner_update ON partner_offers
FOR UPDATE
TO authenticated
USING (
  partner_id IN (
    SELECT id FROM partners WHERE auth_user_id = auth.uid()
  )
  AND status IN ('draft', 'rejected')
)
WITH CHECK (
  partner_id IN (
    SELECT id FROM partners WHERE auth_user_id = auth.uid()
  )
  AND status IN ('draft', 'submitted', 'rejected')
);
