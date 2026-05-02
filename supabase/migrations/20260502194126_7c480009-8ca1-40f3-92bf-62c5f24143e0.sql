ALTER TABLE public.contest_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contest_media_public_select" ON public.contest_media;
CREATE POLICY "contest_media_public_select"
  ON public.contest_media FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "contest_media_admin_insert" ON public.contest_media;
CREATE POLICY "contest_media_admin_insert"
  ON public.contest_media FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  );

DROP POLICY IF EXISTS "contest_media_admin_update" ON public.contest_media;
CREATE POLICY "contest_media_admin_update"
  ON public.contest_media FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  );

DROP POLICY IF EXISTS "contest_media_admin_delete" ON public.contest_media;
CREATE POLICY "contest_media_admin_delete"
  ON public.contest_media FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'superadmin'::app_role)
  );

GRANT SELECT ON public.contest_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.contest_media TO authenticated;