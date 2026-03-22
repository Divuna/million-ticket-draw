-- Create storage bucket for ticket share images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ticket-shares', 'ticket-shares', true, 5242880, ARRAY['image/png', 'image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- Public read access (required for OG images)
CREATE POLICY "Public can view ticket share images"
ON storage.objects
FOR SELECT
USING (bucket_id = 'ticket-shares');;
