-- Prepared only: private draft attachment storage for sales lead e-mail drafts.
-- Do not apply until product approval confirms that draft attachments should persist.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('sales-lead-email-draft-attachments', 'sales-lead-email-draft-attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 26214400;

CREATE TABLE IF NOT EXISTS public.sales_lead_email_draft_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  storage_bucket text NOT NULL DEFAULT 'sales-lead-email-draft-attachments',
  storage_path text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 26214400),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_lead_email_draft_attachments_bucket_check
    CHECK (storage_bucket = 'sales-lead-email-draft-attachments'),
  CONSTRAINT sales_lead_email_draft_attachments_path_unique
    UNIQUE (storage_bucket, storage_path)
);

ALTER TABLE public.sales_lead_email_draft_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_lead_email_draft_attachments_manage_select"
  ON public.sales_lead_email_draft_attachments;
CREATE POLICY "sales_lead_email_draft_attachments_manage_select"
  ON public.sales_lead_email_draft_attachments
  FOR SELECT
  TO authenticated
  USING (public.has_admin_permission('sales_leads.manage', auth.uid()));

DROP POLICY IF EXISTS "sales_lead_email_draft_attachments_manage_insert"
  ON public.sales_lead_email_draft_attachments;
CREATE POLICY "sales_lead_email_draft_attachments_manage_insert"
  ON public.sales_lead_email_draft_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_admin_permission('sales_leads.manage', auth.uid())
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS "sales_lead_email_draft_attachments_manage_delete"
  ON public.sales_lead_email_draft_attachments;
CREATE POLICY "sales_lead_email_draft_attachments_manage_delete"
  ON public.sales_lead_email_draft_attachments
  FOR DELETE
  TO authenticated
  USING (public.has_admin_permission('sales_leads.manage', auth.uid()));

DROP POLICY IF EXISTS "sales_lead_email_draft_storage_manage_select"
  ON storage.objects;
CREATE POLICY "sales_lead_email_draft_storage_manage_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'sales-lead-email-draft-attachments'
    AND public.has_admin_permission('sales_leads.manage', auth.uid())
  );

DROP POLICY IF EXISTS "sales_lead_email_draft_storage_manage_insert"
  ON storage.objects;
CREATE POLICY "sales_lead_email_draft_storage_manage_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'sales-lead-email-draft-attachments'
    AND public.has_admin_permission('sales_leads.manage', auth.uid())
  );

DROP POLICY IF EXISTS "sales_lead_email_draft_storage_manage_update"
  ON storage.objects;
CREATE POLICY "sales_lead_email_draft_storage_manage_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'sales-lead-email-draft-attachments'
    AND public.has_admin_permission('sales_leads.manage', auth.uid())
  )
  WITH CHECK (
    bucket_id = 'sales-lead-email-draft-attachments'
    AND public.has_admin_permission('sales_leads.manage', auth.uid())
  );

DROP POLICY IF EXISTS "sales_lead_email_draft_storage_manage_delete"
  ON storage.objects;
CREATE POLICY "sales_lead_email_draft_storage_manage_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'sales-lead-email-draft-attachments'
    AND public.has_admin_permission('sales_leads.manage', auth.uid())
  );

COMMENT ON TABLE public.sales_lead_email_draft_attachments IS
  'Metadata for private sales lead e-mail draft attachments. File content stays in private Supabase Storage.';
