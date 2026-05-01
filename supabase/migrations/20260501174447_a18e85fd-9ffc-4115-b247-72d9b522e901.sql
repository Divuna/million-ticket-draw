-- Create public storage bucket for contest rules PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('contest-rules', 'contest-rules', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read access
CREATE POLICY "Public can read contest rules PDFs"
ON storage.objects
FOR SELECT
USING (bucket_id = 'contest-rules');

-- Admins/superadmins can upload
CREATE POLICY "Admins can upload contest rules PDFs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contest-rules'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
);

-- Admins/superadmins can update
CREATE POLICY "Admins can update contest rules PDFs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'contest-rules'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
);

-- Admins/superadmins can delete
CREATE POLICY "Admins can delete contest rules PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'contest-rules'
  AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
);