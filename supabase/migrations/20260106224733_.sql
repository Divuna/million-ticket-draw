-- Add detailed_description column to bonus_prizes table
ALTER TABLE public.bonus_prizes 
ADD COLUMN IF NOT EXISTS detailed_description text;;
