-- Security hardening: restrict Storage object access for private documents and
-- public-but-admin/partner-managed media.
--
-- This migration intentionally does not move or delete any existing objects.

-- Partner invoices are private documents. They must never be listable/readable
-- by anon/authenticated users directly from Storage. Edge Functions use the
-- service role to upload files and create signed URLs.
UPDATE storage.buckets
SET public = false,
    allowed_mime_types = ARRAY['application/pdf', 'application/xml', 'text/xml'],
    file_size_limit = 10485760
WHERE id = 'partner-invoices';

DROP POLICY IF EXISTS "Anyone can view partner invoices" ON storage.objects;
DROP POLICY IF EXISTS "allow upload partner invoices" ON storage.objects;
DROP POLICY IF EXISTS "Service role can upload partner invoices" ON storage.objects;
DROP POLICY IF EXISTS "partner_invoices_service_role_all" ON storage.objects;

CREATE POLICY "partner_invoices_service_role_all"
  ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'partner-invoices')
  WITH CHECK (bucket_id = 'partner-invoices');

-- Contest hero/gallery/banner assets are public to read, but only admins should
-- be able to create, replace or delete them from the browser. Service role Edge
-- Functions continue to bypass RLS for generated assets.
DROP POLICY IF EXISTS "Authenticated users can upload contest images" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can update contest images" ON storage.objects;
DROP POLICY IF EXISTS "Admin users can delete contest images" ON storage.objects;
DROP POLICY IF EXISTS "storage_contest_images_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_contest_images_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_contest_images_admin_delete" ON storage.objects;

CREATE POLICY "storage_contest_images_admin_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contest-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

CREATE POLICY "storage_contest_images_admin_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'contest-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'contest-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

CREATE POLICY "storage_contest_images_admin_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'contest-images'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

DROP POLICY IF EXISTS "Authenticated users can upload contest banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update contest banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete contest banners" ON storage.objects;
DROP POLICY IF EXISTS "storage_contest_banners_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_contest_banners_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_contest_banners_admin_delete" ON storage.objects;

CREATE POLICY "storage_contest_banners_admin_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contest-banners'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

CREATE POLICY "storage_contest_banners_admin_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'contest-banners'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'contest-banners'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

CREATE POLICY "storage_contest_banners_admin_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'contest-banners'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

-- Partner offer assets are public to read, but upload/replace must be limited
-- to the authenticated owner of the partner folder: offers/{partner_id}/...
UPDATE storage.buckets
SET public = true,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    file_size_limit = 5242880
WHERE id = 'partner-offer-assets';

DROP POLICY IF EXISTS "partner-offer-assets authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "partner-offer-assets authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "storage_partner_offer_assets_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_partner_offer_assets_owner_update" ON storage.objects;

CREATE POLICY "storage_partner_offer_assets_owner_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'partner-offer-assets'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.partners p
        WHERE p.auth_user_id = auth.uid()
          AND (storage.foldername(name))[1] = 'offers'
          AND (storage.foldername(name))[2] = p.id::text
      )
    )
  );

CREATE POLICY "storage_partner_offer_assets_owner_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'partner-offer-assets'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.partners p
        WHERE p.auth_user_id = auth.uid()
          AND (storage.foldername(name))[1] = 'offers'
          AND (storage.foldername(name))[2] = p.id::text
      )
    )
  )
  WITH CHECK (
    bucket_id = 'partner-offer-assets'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
      OR EXISTS (
        SELECT 1
        FROM public.partners p
        WHERE p.auth_user_id = auth.uid()
          AND (storage.foldername(name))[1] = 'offers'
          AND (storage.foldername(name))[2] = p.id::text
      )
    )
  );

-- Partner logos are public to read, but ordinary partners can only write
-- filenames derived from their own partner id. Admin uploads remain allowed.
UPDATE storage.buckets
SET public = true,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'],
    file_size_limit = 5242880
WHERE id = 'partner-logos';

DROP POLICY IF EXISTS "Admin can upload partner logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin can update partner logos" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete partner logos" ON storage.objects;
DROP POLICY IF EXISTS "partner_upload_own_logo" ON storage.objects;
DROP POLICY IF EXISTS "partner_update_own_logo" ON storage.objects;
DROP POLICY IF EXISTS "storage_partner_logos_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_partner_logos_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "storage_partner_logos_admin_delete" ON storage.objects;
DROP POLICY IF EXISTS "storage_partner_logos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_partner_logos_owner_update" ON storage.objects;

CREATE POLICY "storage_partner_logos_admin_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'partner-logos'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

CREATE POLICY "storage_partner_logos_admin_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'partner-logos'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  )
  WITH CHECK (
    bucket_id = 'partner-logos'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

CREATE POLICY "storage_partner_logos_admin_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'partner-logos'
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role)
    )
  );

CREATE POLICY "storage_partner_logos_owner_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'partner-logos'
    AND EXISTS (
      SELECT 1
      FROM public.partners p
      WHERE p.auth_user_id = auth.uid()
        AND (
          name LIKE (p.id::text || '-%')
          OR name LIKE (p.id::text || '.%')
          OR name LIKE ('affiliate/' || p.id::text || '.%')
        )
    )
  );

CREATE POLICY "storage_partner_logos_owner_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'partner-logos'
    AND EXISTS (
      SELECT 1
      FROM public.partners p
      WHERE p.auth_user_id = auth.uid()
        AND (
          name LIKE (p.id::text || '-%')
          OR name LIKE (p.id::text || '.%')
          OR name LIKE ('affiliate/' || p.id::text || '.%')
        )
    )
  )
  WITH CHECK (
    bucket_id = 'partner-logos'
    AND EXISTS (
      SELECT 1
      FROM public.partners p
      WHERE p.auth_user_id = auth.uid()
        AND (
          name LIKE (p.id::text || '-%')
          OR name LIKE (p.id::text || '.%')
          OR name LIKE ('affiliate/' || p.id::text || '.%')
        )
    )
  );
