-- Allow public read access to settings table
CREATE POLICY "Public can read settings"
ON public.settings
FOR SELECT
TO public
USING (true);

-- Optionally, restrict admin write access
CREATE POLICY "Only admins can modify settings"
ON public.settings
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'superadmin')
  )
);;
