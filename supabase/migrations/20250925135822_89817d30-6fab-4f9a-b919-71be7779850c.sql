-- Create storage bucket for partner logos
INSERT INTO storage.buckets (id, name, public) VALUES ('partner-logos', 'partner-logos', true);

-- Create policies for partner logo uploads
CREATE POLICY "Admin can upload partner logos" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'partner-logos' AND EXISTS (
  SELECT 1 FROM users 
  WHERE users.id = auth.uid() 
  AND users.role = ANY (ARRAY['admin'::text, 'superadmin'::text])
));

CREATE POLICY "Admin can update partner logos" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'partner-logos' AND EXISTS (
  SELECT 1 FROM users 
  WHERE users.id = auth.uid() 
  AND users.role = ANY (ARRAY['admin'::text, 'superadmin'::text])
));

CREATE POLICY "Admin can delete partner logos" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'partner-logos' AND EXISTS (
  SELECT 1 FROM users 
  WHERE users.id = auth.uid() 
  AND users.role = ANY (ARRAY['admin'::text, 'superadmin'::text])
));

CREATE POLICY "Anyone can view partner logos" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'partner-logos');