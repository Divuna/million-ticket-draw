-- Add description column to coming_soon_banners for info popup content
ALTER TABLE public.coming_soon_banners
  ADD COLUMN IF NOT EXISTS description TEXT;
