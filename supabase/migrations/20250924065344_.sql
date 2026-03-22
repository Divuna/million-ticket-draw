-- Update the contests status check constraint to allow admin panel statuses
ALTER TABLE public.contests DROP CONSTRAINT IF EXISTS contests_status_check;

-- Add new constraint that allows the statuses used in admin panel
ALTER TABLE public.contests ADD CONSTRAINT contests_status_check 
CHECK (status IN ('pending', 'active', 'closed'));;
