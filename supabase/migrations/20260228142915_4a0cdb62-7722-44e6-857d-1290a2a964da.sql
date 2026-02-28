CREATE POLICY "Anyone can view coming soon banners"
  ON public.coming_soon_banners
  FOR SELECT
  USING (true);