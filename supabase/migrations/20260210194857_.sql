CREATE POLICY "partner_update_own_logo"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'partner-logos'
  AND owner = auth.uid()
)
WITH CHECK (
  bucket_id = 'partner-logos'
  AND owner = auth.uid()
);;
