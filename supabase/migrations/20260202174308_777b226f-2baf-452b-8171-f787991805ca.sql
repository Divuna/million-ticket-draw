-- Create storage bucket for partner invoice exports
INSERT INTO storage.buckets (id, name, public)
VALUES ('partner-invoices', 'partner-invoices', true)
ON CONFLICT (id) DO NOTHING;

-- Create policy for admin access to upload invoices
CREATE POLICY "Admins can upload invoices"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'partner-invoices' 
  AND EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create policy for public read access
CREATE POLICY "Anyone can view partner invoices"
ON storage.objects
FOR SELECT
USING (bucket_id = 'partner-invoices');