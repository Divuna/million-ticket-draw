-- Create storage bucket for banner images
INSERT INTO storage.buckets (id, name, public)
VALUES ('banner-images', 'banner-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for banner image uploads (admin only)
CREATE POLICY "Admin can upload banner images"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'banner-images' 
  AND EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Admin can update banner images"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'banner-images' 
  AND EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Admin can delete banner images"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'banner-images' 
  AND EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Public can view banner images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'banner-images');;
