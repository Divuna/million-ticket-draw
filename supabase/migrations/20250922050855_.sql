-- Create storage bucket for voucher images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('voucher-images', 'voucher-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for voucher images
CREATE POLICY "Public can view voucher images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'voucher-images');

CREATE POLICY "Admins can upload voucher images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'voucher-images' AND
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Admins can update voucher images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'voucher-images' AND
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Admins can delete voucher images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'voucher-images' AND
  EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'superadmin')
  )
);;
