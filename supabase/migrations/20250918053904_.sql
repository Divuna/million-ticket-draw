-- Create storage bucket for contest images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('contest-images', 'contest-images', true);

-- Create storage policies for contest images
CREATE POLICY "Anyone can view contest images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'contest-images');

CREATE POLICY "Authenticated users can upload contest images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'contest-images' AND auth.role() = 'authenticated');

CREATE POLICY "Admin users can update contest images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'contest-images' AND auth.role() = 'authenticated');

CREATE POLICY "Admin users can delete contest images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'contest-images' AND auth.role() = 'authenticated');;
