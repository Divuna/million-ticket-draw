-- Fix Storage owner policies from 20260718191000.
--
-- In Storage policies, an unqualified `name` inside the partner subquery can be
-- resolved as public.partners.name instead of storage.objects.name. Always
-- qualify the Storage object path explicitly.

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
          AND (storage.foldername(storage.objects.name))[1] = 'offers'
          AND (storage.foldername(storage.objects.name))[2] = p.id::text
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
          AND (storage.foldername(storage.objects.name))[1] = 'offers'
          AND (storage.foldername(storage.objects.name))[2] = p.id::text
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
          AND (storage.foldername(storage.objects.name))[1] = 'offers'
          AND (storage.foldername(storage.objects.name))[2] = p.id::text
      )
    )
  );

DROP POLICY IF EXISTS "storage_partner_logos_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_partner_logos_owner_update" ON storage.objects;

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
          storage.objects.name LIKE (p.id::text || '-%')
          OR storage.objects.name LIKE (p.id::text || '.%')
          OR storage.objects.name LIKE ('affiliate/' || p.id::text || '.%')
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
          storage.objects.name LIKE (p.id::text || '-%')
          OR storage.objects.name LIKE (p.id::text || '.%')
          OR storage.objects.name LIKE ('affiliate/' || p.id::text || '.%')
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
          storage.objects.name LIKE (p.id::text || '-%')
          OR storage.objects.name LIKE (p.id::text || '.%')
          OR storage.objects.name LIKE ('affiliate/' || p.id::text || '.%')
        )
    )
  );
