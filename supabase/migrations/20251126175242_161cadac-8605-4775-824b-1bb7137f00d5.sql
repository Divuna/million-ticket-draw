-- Enable RLS on coming_soon_banners if not already enabled
ALTER TABLE public.coming_soon_banners ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Public can view coming soon banners" ON public.coming_soon_banners;
DROP POLICY IF EXISTS "Admins can manage coming soon banners" ON public.coming_soon_banners;

-- Allow public to view banners
CREATE POLICY "Public can view coming soon banners"
ON public.coming_soon_banners
FOR SELECT
TO public
USING (true);

-- Allow admins full access (INSERT, UPDATE, DELETE)
CREATE POLICY "Admins can manage coming soon banners"
ON public.coming_soon_banners
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);