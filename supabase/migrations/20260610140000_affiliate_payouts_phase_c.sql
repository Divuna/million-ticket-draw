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

-- 4) Pred-PDF kontrola a snapshot pro Edge Function.
-- Tato funkce neuklada zadny doklad ani PDF; pouze ridi, jestli je bezpecne PDF
-- vubec generovat. Pokud uz doklad existuje, vrati document_already_exists.
CREATE OR REPLACE FUNCTION public.prepare_affiliate_payout_document(
  p_commission_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row record;
  v_accounting_email text;
  v_document_number text;
  v_recipient_billing_address text;
  v_document_type text;
BEGIN
  IF p_commission_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_commission_id');
  END IF;

  SELECT btrim(value)
  INTO v_accounting_email
  FROM public.settings
  WHERE key = 'accounting_email'
  LIMIT 1;

  IF v_accounting_email IS NULL OR v_accounting_email = '' THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_accounting_email');
  END IF;

  SELECT
    c.id,
    c.affiliate_id,
    c.status,
    c.amount_base_czk,
    c.vat_rate,
    c.amount_total_czk,
    c.payout_document_id,
    a.name AS recipient_name,
    a.email AS recipient_email,
    a.ico AS recipient_ico,
    a.vat_id AS recipient_vat_id,
    a.is_vat_payer AS recipient_is_vat_payer,
    a.billing_street,
    a.billing_city,
    a.billing_zip,
    a.billing_country
  INTO v_row
  FROM public.affiliate_commissions c
  JOIN public.affiliate_accounts a ON a.id = c.affiliate_id
  WHERE c.id = p_commission_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'status', 'commission_not_found');
  END IF;

  IF v_row.status <> 'approved' THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid_commission_status',
      'current_status', v_row.status
    );
  END IF;

  IF v_row.payout_document_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.affiliate_payout_documents d
       WHERE d.commission_id = p_commission_id
     ) THEN
    RETURN jsonb_build_object('success', false, 'status', 'document_already_exists');
  END IF;

  IF v_row.recipient_name IS NULL OR btrim(v_row.recipient_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_name');
  END IF;

  IF v_row.recipient_email IS NULL OR btrim(v_row.recipient_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_email');
  END IF;

  IF v_row.amount_total_czk IS NULL OR v_row.amount_total_czk <= 0 THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_amount');
  END IF;

  IF coalesce(v_row.recipient_is_vat_payer, false)
     AND (v_row.recipient_vat_id IS NULL OR btrim(v_row.recipient_vat_id) = '') THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_vat_id');
  END IF;

  v_document_type := CASE
    WHEN coalesce(v_row.recipient_is_vat_payer, false) THEN 'self_billed_tax_invoice'
    ELSE 'commission_statement'
  END;

  v_recipient_billing_address := nullif(
    concat_ws(
      ', ',
      nullif(btrim(coalesce(v_row.billing_street, '')), ''),
      nullif(btrim(concat_ws(' ', v_row.billing_zip, v_row.billing_city)), ''),
      nullif(btrim(coalesce(v_row.billing_country, '')), '')
    ),
    ''
  );

  v_document_number := public.next_affiliate_payout_document_number();

  RETURN jsonb_build_object(
    'success', true,
    'status', 'prepared',
    'commission_id', v_row.id,
    'affiliate_id', v_row.affiliate_id,
    'document_number', v_document_number,
    'document_type', v_document_type,
    'recipient_name', btrim(v_row.recipient_name),
    'recipient_email', btrim(v_row.recipient_email),
    'recipient_ico', v_row.recipient_ico,
    'recipient_vat_id', v_row.recipient_vat_id,
    'recipient_billing_address', v_recipient_billing_address,
    'recipient_is_vat_payer', coalesce(v_row.recipient_is_vat_payer, false),
    'recipient_subject_type', CASE
      WHEN coalesce(v_row.recipient_is_vat_payer, false) THEN 'vat_payer'
      ELSE 'non_vat_payer'
    END,
    'amount_base_czk', v_row.amount_base_czk,
    'vat_rate', coalesce(v_row.vat_rate, 0),
    'amount_total_czk', v_row.amount_total_czk,
    'accounting_email', v_accounting_email
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_affiliate_payout_document(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_affiliate_payout_document(uuid) TO service_role;

COMMENT ON FUNCTION public.prepare_affiliate_payout_document(uuid) IS
  'Faze C navrh: pred-PDF kontrola approved provize a snapshot pro Edge Function. Bez DB zapisu dokladu.';

-- 5) Transakcni finalizace DB casti po uspesnem uploadu PDF.
CREATE OR REPLACE FUNCTION public.finalize_affiliate_payout_document(
  p_commission_id uuid,
  p_document_number text,
  p_pdf_storage_path text,
  p_pdf_sha256 text,
  p_affiliate_email_subject text,
  p_affiliate_email_body text,
  p_accounting_email_subject text,
  p_accounting_email_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row record;
  v_accounting_email text;
  v_document_id uuid;
  v_affiliate_email_queue_id uuid;
  v_accounting_email_queue_id uuid;
  v_updated_count integer;
  v_document_type text;
  v_recipient_billing_address text;
BEGIN
  BEGIN
    IF p_commission_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_commission_id');
    END IF;

    IF p_document_number IS NULL OR p_document_number !~ '^APD-[0-9]{4}-[0-9]{6}$' THEN
      RETURN jsonb_build_object('success', false, 'status', 'invalid_document_number');
    END IF;

    IF p_pdf_storage_path IS NULL OR btrim(p_pdf_storage_path) = '' THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_pdf_storage_path');
    END IF;

    IF p_pdf_sha256 IS NULL OR p_pdf_sha256 !~ '^[a-f0-9]{64}$' THEN
      RETURN jsonb_build_object('success', false, 'status', 'invalid_pdf_sha256');
    END IF;

    SELECT btrim(value)
    INTO v_accounting_email
    FROM public.settings
    WHERE key = 'accounting_email'
    LIMIT 1;

    IF v_accounting_email IS NULL OR v_accounting_email = '' THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_accounting_email');
    END IF;

    SELECT
      c.id,
      c.affiliate_id,
      c.status,
      c.amount_base_czk,
      c.vat_rate,
      c.amount_total_czk,
      c.payout_document_id,
      a.name AS recipient_name,
      a.email AS recipient_email,
      a.ico AS recipient_ico,
      a.vat_id AS recipient_vat_id,
      a.is_vat_payer AS recipient_is_vat_payer,
      a.billing_street,
      a.billing_city,
      a.billing_zip,
      a.billing_country
    INTO v_row
    FROM public.affiliate_commissions c
    JOIN public.affiliate_accounts a ON a.id = c.affiliate_id
    WHERE c.id = p_commission_id
    FOR UPDATE OF c;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'status', 'commission_not_found');
    END IF;

    IF v_row.status <> 'approved' THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 'invalid_commission_status',
        'current_status', v_row.status
      );
    END IF;

    IF v_row.payout_document_id IS NOT NULL
       OR EXISTS (
         SELECT 1
         FROM public.affiliate_payout_documents d
         WHERE d.commission_id = p_commission_id
       ) THEN
      RETURN jsonb_build_object('success', false, 'status', 'document_already_exists');
    END IF;

    IF v_row.recipient_name IS NULL OR btrim(v_row.recipient_name) = '' THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_name');
    END IF;

    IF v_row.recipient_email IS NULL OR btrim(v_row.recipient_email) = '' THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_email');
    END IF;

    IF v_row.amount_total_czk IS NULL OR v_row.amount_total_czk <= 0 THEN
      RETURN jsonb_build_object('success', false, 'status', 'invalid_amount');
    END IF;

    IF coalesce(v_row.recipient_is_vat_payer, false)
       AND (v_row.recipient_vat_id IS NULL OR btrim(v_row.recipient_vat_id) = '') THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_vat_id');
    END IF;

    v_document_type := CASE
      WHEN coalesce(v_row.recipient_is_vat_payer, false) THEN 'self_billed_tax_invoice'
      ELSE 'commission_statement'
    END;

    v_recipient_billing_address := nullif(
      concat_ws(
        ', ',
        nullif(btrim(coalesce(v_row.billing_street, '')), ''),
        nullif(btrim(concat_ws(' ', v_row.billing_zip, v_row.billing_city)), ''),
        nullif(btrim(coalesce(v_row.billing_country, '')), '')
      ),
      ''
    );

    INSERT INTO public.affiliate_payout_documents (
      commission_id,
      affiliate_id,
      document_number,
      document_type,
      recipient_name,
      recipient_email,
      recipient_ico,
      recipient_vat_id,
      recipient_billing_address,
      recipient_is_vat_payer,
      recipient_subject_type,
      amount_base_czk,
      vat_rate,
      amount_total_czk,
      pdf_url,
      pdf_storage_path,
      pdf_generated_at,
      pdf_sha256,
      email_status,
      affiliate_email,
      accounting_email
    )
    VALUES (
      v_row.id,
      v_row.affiliate_id,
      p_document_number,
      v_document_type,
      btrim(v_row.recipient_name),
      btrim(v_row.recipient_email),
      v_row.recipient_ico,
      v_row.recipient_vat_id,
      v_recipient_billing_address,
      coalesce(v_row.recipient_is_vat_payer, false),
      CASE WHEN coalesce(v_row.recipient_is_vat_payer, false) THEN 'vat_payer' ELSE 'non_vat_payer' END,
      v_row.amount_base_czk,
      coalesce(v_row.vat_rate, 0),
      v_row.amount_total_czk,
      null,
      p_pdf_storage_path,
      now(),
      p_pdf_sha256,
      'pending',
      btrim(v_row.recipient_email),
      v_accounting_email
    )
    RETURNING id INTO v_document_id;

    INSERT INTO public.email_queue (
      email,
      subject,
      body,
      attachment_storage_bucket,
      attachment_storage_path,
      attachment_filename,
      attachment_content_type,
      attachment_required
    )
    VALUES (
      btrim(v_row.recipient_email),
      p_affiliate_email_subject,
      p_affiliate_email_body,
      'affiliate-payout-docs',
      p_pdf_storage_path,
      p_document_number || '.pdf',
      'application/pdf',
      true
    )
    RETURNING id INTO v_affiliate_email_queue_id;

    INSERT INTO public.email_queue (
      email,
      subject,
      body,
      attachment_storage_bucket,
      attachment_storage_path,
      attachment_filename,
      attachment_content_type,
      attachment_required
    )
    VALUES (
      v_accounting_email,
      p_accounting_email_subject,
      p_accounting_email_body,
      'affiliate-payout-docs',
      p_pdf_storage_path,
      p_document_number || '.pdf',
      'application/pdf',
      true
    )
    RETURNING id INTO v_accounting_email_queue_id;

    UPDATE public.affiliate_payout_documents
    SET email_queue_id = v_affiliate_email_queue_id,
        accounting_email_queue_id = v_accounting_email_queue_id
    WHERE id = v_document_id;

    UPDATE public.affiliate_commissions
    SET status = 'ready_to_pay',
        payout_document_id = v_document_id,
        updated_at = now()
    WHERE id = p_commission_id
      AND status = 'approved'
      AND payout_document_id IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'commission_update_failed';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'created',
      'document_id', v_document_id,
      'document_number', p_document_number,
      'pdf_storage_path', p_pdf_storage_path,
      'email_queue_id', v_affiliate_email_queue_id,
      'accounting_email_queue_id', v_accounting_email_queue_id,
      'commission_status', 'ready_to_pay'
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'status', 'document_already_exists');
    WHEN raise_exception THEN
      IF SQLERRM = 'commission_update_failed' THEN
        RETURN jsonb_build_object('success', false, 'status', 'commission_update_failed');
      END IF;
      RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_affiliate_payout_document(
  uuid, text, text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_affiliate_payout_document(
  uuid, text, text, text, text, text, text, text
) TO service_role;

COMMENT ON FUNCTION public.finalize_affiliate_payout_document(
  uuid, text, text, text, text, text, text, text
) IS
  'Faze C navrh: transakcni finalizace payout dokladu po uploadu PDF. Vklada doklad, email_queue a posouva provizi do ready_to_pay.';

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.finalize_affiliate_payout_document(uuid, text, text, text, text, text, text, text);
-- DROP FUNCTION IF EXISTS public.prepare_affiliate_payout_document(uuid);
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
