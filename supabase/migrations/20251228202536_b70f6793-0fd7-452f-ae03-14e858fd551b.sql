-- Add guardian_required column to bonus_prizes table
ALTER TABLE public.bonus_prizes 
ADD COLUMN guardian_required boolean NOT NULL DEFAULT false;