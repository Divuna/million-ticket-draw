-- Create storage bucket for AI-generated contest banners
INSERT INTO storage.buckets (id, name, public)
VALUES ('contest-banners', 'contest-banners', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to contest banners
CREATE POLICY "Contest banners are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'contest-banners');

-- Allow authenticated users (admins) to upload banners
CREATE POLICY "Authenticated users can upload contest banners"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'contest-banners' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their uploaded banners
CREATE POLICY "Authenticated users can update contest banners"
ON storage.objects FOR UPDATE
USING (bucket_id = 'contest-banners' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete banners
CREATE POLICY "Authenticated users can delete contest banners"
ON storage.objects FOR DELETE
USING (bucket_id = 'contest-banners' AND auth.role() = 'authenticated');