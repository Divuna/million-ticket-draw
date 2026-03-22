-- Ensure the contest-images bucket is public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'contest-images';

-- Drop existing policies if they exist (ignore errors)
DROP POLICY IF EXISTS "Public Access for contest images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public download of contest images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view contest images" ON storage.objects;

-- Create a comprehensive policy for public access to contest images
CREATE POLICY "Anyone can view contest images" ON storage.objects
FOR SELECT USING (bucket_id = 'contest-images');;
