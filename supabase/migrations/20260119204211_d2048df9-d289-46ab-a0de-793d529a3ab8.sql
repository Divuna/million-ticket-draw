-- Add logo_status column to partners table
-- Values: 'none' (no logo uploaded), 'pending' (waiting for approval), 'approved' (visible on homepage), 'rejected' (not visible)
ALTER TABLE public.partners
ADD COLUMN logo_status text NOT NULL DEFAULT 'none';

-- Add comment for documentation
COMMENT ON COLUMN public.partners.logo_status IS 'Logo approval status: none, pending, approved, rejected';