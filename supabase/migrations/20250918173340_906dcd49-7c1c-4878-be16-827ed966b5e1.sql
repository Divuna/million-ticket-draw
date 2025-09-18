-- Add main_image field to contests table
ALTER TABLE public.contests 
ADD COLUMN main_image TEXT;