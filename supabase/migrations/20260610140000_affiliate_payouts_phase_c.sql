-- ============================================================================
-- DAVKOVE VYPLATY PROVIZI — FAZE C: PDF DOKLADY + EMAIL QUEUE (NAVRH)
-- ============================================================================
-- Zavisi na Fazi A+B:
--   20260609_affiliate_payouts_phase_a.sql
--   20260610_affiliate_payouts_phase_b.sql
--
-- Tato migrace pripravuje pouze DB zaklad pro:
--   - ulozeni PDF dokladu do privatniho bucketu affiliate-payout-docs,
--   - audit PDF/e-mail stavu,
--   - bezpecne prilohy v email_queue pres storage bucket/path.
--
-- Neresi:
--   - Air Bank export,
--   - produkcni nasazeni,
--   - Lovable Publish.
--
-- NEAPLIKOVAT bez vyslovneho schvaleni Pavla. Nejdriv staging + postcheck.
-- ============================================================================

BEGIN;

-- 1) Auditni metadata payout dokladu.
ALTER TABLE public.affiliate_payout_documents
  ADD COLUMN IF NOT EXISTS pdf_storage_path text,
  ADD COLUMN IF NOT EXISTS pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_sha256 text,
  ADD COLUMN IF NOT EXISTS email_queue_id uuid,
  ADD COLUMN IF NOT EXISTS accounting_email_queue_id uuid,
  ADD COLUMN IF NOT EXISTS email_error text;

ALTER TABLE public.affiliate_payout_documents
  DROP CONSTRAINT IF EXISTS affiliate_payout_documents_pdf_sha256_check;

ALTER TABLE public.affiliate_payout_documents
  ADD CONSTRAINT affiliate_payout_documents_pdf_sha256_check
  CHECK (pdf_sha256 IS NULL OR pdf_sha256 ~ '^[a-f0-9]{64}$');

CREATE INDEX IF NOT EXISTS idx_apd_pdf_storage_path
  ON public.affiliate_payout_documents(pdf_storage_path)
  WHERE pdf_storage_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_apd_email_queue_id
  ON public.affiliate_payout_documents(email_queue_id)
  WHERE email_queue_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_apd_accounting_email_queue_id
  ON public.affiliate_payout_documents(accounting_email_queue_id)
  WHERE accounting_email_queue_id IS NOT NULL;

-- 2) Bezpecne privatni prilohy ve sdilene email_queue.
-- Stare attachment_url zustava kompatibilni. Nove payout e-maily ukladaji bucket/path
-- a worker si soubor stahuje pres service role az pri odesilani.
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS attachment_storage_bucket text,
  ADD COLUMN IF NOT EXISTS attachment_storage_path text,
  ADD COLUMN IF NOT EXISTS attachment_filename text,
  ADD COLUMN IF NOT EXISTS attachment_content_type text,
  ADD COLUMN IF NOT EXISTS attachment_required boolean NOT NULL DEFAULT false;

ALTER TABLE public.email_queue
  DROP CONSTRAINT IF EXISTS email_queue_private_attachment_pair_check;

ALTER TABLE public.email_queue
  ADD CONSTRAINT email_queue_private_attachment_pair_check
  CHECK (
    (attachment_storage_bucket IS NULL AND attachment_storage_path IS NULL)
    OR
    (attachment_storage_bucket IS NOT NULL AND attachment_storage_path IS NOT NULL)
  );

ALTER TABLE public.email_queue
  DROP CONSTRAINT IF EXISTS email_queue_required_attachment_source_check;

ALTER TABLE public.email_queue
  ADD CONSTRAINT email_queue_required_attachment_source_check
  CHECK (
    attachment_required = false
    OR attachment_url IS NOT NULL
    OR (attachment_storage_bucket IS NOT NULL AND attachment_storage_path IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_email_queue_private_attachment_pending
  ON public.email_queue(status, attachment_storage_bucket, attachment_storage_path)
  WHERE attachment_storage_path IS NOT NULL;

-- 3) Sekvencni helper pro Edge Function.
-- Edge Function nema raw SQL pristup pres supabase-js, proto cislo dokladu bere
-- pres service-role RPC. Funkce neni urcena pro frontend.
CREATE OR REPLACE FUNCTION public.next_affiliate_payout_document_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_seq bigint;
BEGIN
  v_seq := nextval('public.affiliate_payout_document_seq');

  IF v_seq > 999999 THEN
    RAISE EXCEPTION 'affiliate_payout_document_seq exhausted';
  END IF;

  RETURN 'APD-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_affiliate_payout_document_number() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_affiliate_payout_document_number() TO service_role;

COMMENT ON FUNCTION public.next_affiliate_payout_document_number() IS
  'Faze C navrh: service-role helper pro ciselnou radu payout dokladu APD-YYYY-000001.';

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.next_affiliate_payout_document_number();
-- DROP INDEX IF EXISTS public.idx_email_queue_private_attachment_pending;
-- ALTER TABLE public.email_queue
--   DROP CONSTRAINT IF EXISTS email_queue_required_attachment_source_check,
--   DROP CONSTRAINT IF EXISTS email_queue_private_attachment_pair_check,
--   DROP COLUMN IF EXISTS attachment_required,
--   DROP COLUMN IF EXISTS attachment_content_type,
--   DROP COLUMN IF EXISTS attachment_filename,
--   DROP COLUMN IF EXISTS attachment_storage_path,
--   DROP COLUMN IF EXISTS attachment_storage_bucket;
-- DROP INDEX IF EXISTS public.idx_apd_accounting_email_queue_id;
-- DROP INDEX IF EXISTS public.idx_apd_email_queue_id;
-- DROP INDEX IF EXISTS public.idx_apd_pdf_storage_path;
-- ALTER TABLE public.affiliate_payout_documents
--   DROP CONSTRAINT IF EXISTS affiliate_payout_documents_pdf_sha256_check,
--   DROP COLUMN IF EXISTS email_error,
--   DROP COLUMN IF EXISTS accounting_email_queue_id,
--   DROP COLUMN IF EXISTS email_queue_id,
--   DROP COLUMN IF EXISTS pdf_sha256,
--   DROP COLUMN IF EXISTS pdf_generated_at,
--   DROP COLUMN IF EXISTS pdf_storage_path;
-- COMMIT;
-- ============================================================================
