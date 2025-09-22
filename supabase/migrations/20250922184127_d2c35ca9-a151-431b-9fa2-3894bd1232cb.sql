-- Create storage bucket for voucher images if it doesn't exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('voucher-images', 'voucher-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for voucher images
CREATE POLICY "Allow public read access to voucher images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'voucher-images');

CREATE POLICY "Allow admin upload voucher images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'voucher-images' AND 
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Allow admin update voucher images" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'voucher-images' AND 
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Allow admin delete voucher images" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'voucher-images' AND 
  EXISTS (
    SELECT 1 FROM users 
    WHERE users.id = auth.uid() 
    AND users.role IN ('admin', 'superadmin')
  )
);