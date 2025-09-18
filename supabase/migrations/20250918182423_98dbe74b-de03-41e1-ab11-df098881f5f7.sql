-- Add CORS configuration for contest-images bucket
-- This allows images to be displayed in browser from any origin

-- Update the contest-images bucket to ensure proper CORS settings
UPDATE storage.buckets 
SET cors = '[
  {
    "allowedOrigins": ["*"], 
    "allowedMethods": ["GET", "HEAD"],
    "allowedHeaders": ["*"],
    "maxAge": 3600
  }
]'::jsonb
WHERE id = 'contest-images';

-- Ensure the bucket is public
UPDATE storage.buckets 
SET public = true 
WHERE id = 'contest-images';

-- Update storage policies to ensure images are accessible
CREATE POLICY IF NOT EXISTS "Public Access for contest images" ON storage.objects
FOR SELECT USING (bucket_id = 'contest-images');

CREATE POLICY IF NOT EXISTS "Allow public download of contest images" ON storage.objects
FOR SELECT USING (bucket_id = 'contest-images' AND auth.role() = 'anon');