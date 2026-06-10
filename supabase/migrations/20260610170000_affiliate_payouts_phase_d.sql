-- ============================================================================
-- OneMil Affiliate Payouts - Phase D (reviewable proposal only)
-- Air Bank ABO .kpc export for payout batches.
--
-- IMPORTANT:
-- - Do not apply to staging/production without Pavel's explicit approval.
-- - Depends on Phase A+B+C payout schema.
-- - No PDF/e-mail/payment sending in this phase.
-- ============================================================================

BEGIN;

-- 1) Export metadata on payout batches.
ALTER TABLE public.affiliate_payout_batches
  ADD COLUMN IF NOT EXISTS bank_export_storage_path text,
  ADD COLUMN IF NOT EXISTS bank_export_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS bank_export_sha256 text,
  ADD COLUMN IF NOT EXISTS bank_export_size_bytes integer,
  ADD COLUMN IF NOT EXISTS bank_export_error text;

ALTER TABLE public.affiliate_payout_batches
  DROP CONSTRAINT IF EXISTS affiliate_payout_batches_export_sha256_check,
  ADD CONSTRAINT affiliate_payout_batches_export_sha256_check
  CHECK (bank_export_sha256 IS NULL OR bank_export_sha256 ~ '^[a-f0-9]{64}$');

ALTER TABLE public.affiliate_payout_batches
  DROP CONSTRAINT IF EXISTS affiliate_payout_batches_export_size_check,
  ADD CONSTRAINT affiliate_payout_batches_export_size_check
  CHECK (bank_export_size_bytes IS NULL OR (bank_export_size_bytes > 0 AND bank_export_size_bytes <= 51200));

ALTER TABLE public.affiliate_payout_batches
  DROP CONSTRAINT IF EXISTS affiliate_payout_batches_export_path_check,
  ADD CONSTRAINT affiliate_payout_batches_export_path_check
  CHECK (
    bank_export_storage_path IS NULL
    OR (
      char_length(btrim(bank_export_storage_path)) > 0
      AND bank_export_storage_path !~ '(^/|\\.\\.)'
    )
  );

CREATE INDEX IF NOT EXISTS idx_apb_exported_at
  ON public.affiliate_payout_batches(bank_export_generated_at)
  WHERE bank_export_generated_at IS NOT NULL;

-- 2) Prepare export snapshot.
-- Service-role only; Edge Function performs user/admin authorization first.
CREATE OR REPLACE FUNCTION public.prepare_affiliate_bank_export(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch public.affiliate_payout_batches%ROWTYPE;
  v_item_count integer;
  v_invalid record;
  v_items jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'status', 'forbidden');
  END IF;

  IF p_batch_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_batch_id');
  END IF;

  SELECT *
  INTO v_batch
  FROM public.affiliate_payout_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'status', 'batch_not_found');
  END IF;

  IF v_batch.status <> 'created' THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid_batch_status',
      'current_status', v_batch.status
    );
  END IF;

  IF v_batch.bank <> 'airbank' OR v_batch.bank_export_format <> 'abo_kpc' THEN
    RETURN jsonb_build_object('success', false, 'status', 'unsupported_bank_export_format');
  END IF;

  IF coalesce(v_batch.bank_export_encoding, '') <> 'windows-1250' THEN
    RETURN jsonb_build_object('success', false, 'status', 'unsupported_bank_export_encoding');
  END IF;

  IF coalesce(v_batch.bank_export_line_endings, '') <> 'crlf' THEN
    RETURN jsonb_build_object('success', false, 'status', 'unsupported_bank_export_line_endings');
  END IF;

  IF v_batch.payer_account IS NULL OR btrim(v_batch.payer_account) = '' THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_payer_account');
  END IF;

  IF v_batch.payer_account !~ '^[0-9]{1,6}-?[0-9]{1,10}$' THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_payer_account');
  END IF;

  IF v_batch.payer_bank_code IS NULL OR v_batch.payer_bank_code !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_payer_bank_code');
  END IF;

  IF v_batch.payer_bank_code <> '3030' THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_airbank_payer_bank_code');
  END IF;

  IF v_batch.due_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_due_date');
  END IF;

  IF v_batch.due_date < current_date THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_due_date');
  END IF;

  SELECT count(*)
  INTO v_item_count
  FROM public.affiliate_payout_batch_items
  WHERE batch_id = p_batch_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('success', false, 'status', 'empty_batch');
  END IF;

  SELECT *
  INTO v_invalid
  FROM (
    SELECT
      i.*,
      CASE
        WHEN i.recipient_account IS NULL OR btrim(i.recipient_account) = '' THEN 'missing_recipient_account'
        WHEN i.recipient_account !~ '^[0-9]{1,6}-?[0-9]{1,10}$' THEN 'invalid_recipient_account'
        WHEN i.recipient_bank_code IS NULL OR i.recipient_bank_code !~ '^[0-9]{4}$' THEN 'missing_recipient_bank_code'
        WHEN i.recipient_name IS NULL OR btrim(i.recipient_name) = '' THEN 'missing_recipient_name'
        WHEN i.amount_czk IS NULL OR i.amount_czk <= 0 THEN 'invalid_amount'
        WHEN i.variable_symbol IS NULL OR i.variable_symbol !~ '^[0-9]{1,10}$' THEN 'invalid_variable_symbol'
        WHEN i.constant_symbol IS NULL OR i.constant_symbol !~ '^[0-9]{4}$' THEN 'invalid_constant_symbol'
        WHEN i.specific_symbol IS NOT NULL AND i.specific_symbol !~ '^[0-9]{1,10}$' THEN 'invalid_specific_symbol'
        WHEN char_length(coalesce(i.payment_message, '')) > 35 THEN 'invalid_payment_message'
        ELSE NULL
      END AS validation_status
    FROM public.affiliate_payout_batch_items i
    WHERE i.batch_id = p_batch_id
  ) checked_items
  WHERE checked_items.validation_status IS NOT NULL
  ORDER BY checked_items.created_at, checked_items.id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', v_invalid.validation_status,
      'item_id', v_invalid.id,
      'commission_id', v_invalid.commission_id
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.affiliate_commissions c
    JOIN public.affiliate_payout_batch_items i ON i.commission_id = c.id
    WHERE i.batch_id = p_batch_id
      AND c.status <> 'in_payment_batch'
  ) THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_commission_status');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', i.id,
      'commission_id', i.commission_id,
      'amount_czk', i.amount_czk,
      'recipient_account', i.recipient_account,
      'recipient_bank_code', i.recipient_bank_code,
      'recipient_name', i.recipient_name,
      'variable_symbol', i.variable_symbol,
      'payment_message', i.payment_message,
      'constant_symbol', i.constant_symbol,
      'specific_symbol', i.specific_symbol
    )
    ORDER BY i.created_at, i.id
  )
  INTO v_items
  FROM public.affiliate_payout_batch_items i
  WHERE i.batch_id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'prepared',
    'batch_id', v_batch.id,
    'batch_number', v_batch.batch_number,
    'due_date', v_batch.due_date,
    'payer_account', v_batch.payer_account,
    'payer_bank_code', v_batch.payer_bank_code,
    'bank_export_format', v_batch.bank_export_format,
    'bank_export_encoding', v_batch.bank_export_encoding,
    'bank_export_line_endings', v_batch.bank_export_line_endings,
    'total_amount_czk', v_batch.total_amount_czk,
    'item_count', v_item_count,
    'items', coalesce(v_items, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_affiliate_bank_export(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_affiliate_bank_export(uuid) TO service_role;

COMMENT ON FUNCTION public.prepare_affiliate_bank_export(uuid) IS
  'Faze D navrh: service-role priprava snapshotu pro Air Bank ABO .kpc export payout davky.';

-- 3) Finalize export metadata and transition batch to exported.
CREATE OR REPLACE FUNCTION public.finalize_affiliate_bank_export(
  p_batch_id uuid,
  p_storage_path text,
  p_sha256 text,
  p_size_bytes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch public.affiliate_payout_batches%ROWTYPE;
  v_row_count integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'status', 'forbidden');
  END IF;

  IF p_batch_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_batch_id');
  END IF;

  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' OR p_storage_path ~ '(^/|\\.\\.)' THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_storage_path');
  END IF;

  IF p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_sha256');
  END IF;

  IF p_size_bytes IS NULL OR p_size_bytes <= 0 OR p_size_bytes > 51200 THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_file_size');
  END IF;

  SELECT *
  INTO v_batch
  FROM public.affiliate_payout_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'status', 'batch_not_found');
  END IF;

  IF v_batch.status <> 'created' THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid_batch_status',
      'current_status', v_batch.status
    );
  END IF;

  UPDATE public.affiliate_payout_batches
  SET status = 'exported',
      bank_export_url = p_storage_path,
      bank_export_storage_path = p_storage_path,
      bank_export_generated_at = now(),
      bank_export_sha256 = p_sha256,
      bank_export_size_bytes = p_size_bytes,
      bank_export_error = NULL
  WHERE id = p_batch_id
    AND status = 'created';

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RETURN jsonb_build_object('success', false, 'status', 'batch_update_failed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'exported',
    'batch_id', p_batch_id,
    'batch_number', v_batch.batch_number,
    'bank_export_storage_path', p_storage_path,
    'bank_export_sha256', p_sha256,
    'bank_export_size_bytes', p_size_bytes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_affiliate_bank_export(uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_affiliate_bank_export(uuid, text, text, integer) TO service_role;

COMMENT ON FUNCTION public.finalize_affiliate_bank_export(uuid, text, text, integer) IS
  'Faze D navrh: service-role finalizace Air Bank ABO .kpc exportu a prechod davky created -> exported.';

-- 4) Tighten paid transition: Phase D requires export before paid.
CREATE OR REPLACE FUNCTION public.mark_affiliate_payout_batch_paid(
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_batch public.affiliate_payout_batches%ROWTYPE;
  v_item_count integer;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  SELECT *
  INTO v_batch
  FROM public.affiliate_payout_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_batch.status <> 'exported' THEN
    RETURN jsonb_build_object(
      'status', 'invalid_batch_status',
      'current_status', v_batch.status,
      'required_status', 'exported'
    );
  END IF;

  SELECT count(*)
  INTO v_item_count
  FROM public.affiliate_payout_batch_items
  WHERE batch_id = p_batch_id;

  IF v_item_count = 0 THEN
    RETURN jsonb_build_object('status', 'empty_batch');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.affiliate_commissions c
    JOIN public.affiliate_payout_batch_items i ON i.commission_id = c.id
    WHERE i.batch_id = p_batch_id
      AND c.status <> 'in_payment_batch'
  ) THEN
    RETURN jsonb_build_object('status', 'invalid_commission_status');
  END IF;

  UPDATE public.affiliate_payout_batches
  SET status = 'paid',
      marked_paid_by = v_admin_id,
      marked_paid_at = now()
  WHERE id = p_batch_id;

  UPDATE public.affiliate_commissions c
  SET status = 'paid',
      paid_at = now(),
      paid_by = v_admin_id,
      updated_at = now()
  FROM public.affiliate_payout_batch_items i
  WHERE i.batch_id = p_batch_id
    AND i.commission_id = c.id;

  RETURN jsonb_build_object(
    'status', 'paid',
    'batch_id', p_batch_id,
    'item_count', v_item_count,
    'total_amount_czk', v_batch.total_amount_czk
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_affiliate_payout_batch_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_affiliate_payout_batch_paid(uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_affiliate_payout_batch_paid(uuid) IS
  'Faze D navrh: admin-only oznaceni payout davky jako zaplacene az po bank exportu (exported -> paid).';

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.finalize_affiliate_bank_export(uuid, text, text, integer);
-- DROP FUNCTION IF EXISTS public.prepare_affiliate_bank_export(uuid);
-- -- mark_affiliate_payout_batch_paid restore from Phase B migration if needed.
-- DROP INDEX IF EXISTS public.idx_apb_exported_at;
-- ALTER TABLE public.affiliate_payout_batches
--   DROP CONSTRAINT IF EXISTS affiliate_payout_batches_export_path_check,
--   DROP CONSTRAINT IF EXISTS affiliate_payout_batches_export_size_check,
--   DROP CONSTRAINT IF EXISTS affiliate_payout_batches_export_sha256_check,
--   DROP COLUMN IF EXISTS bank_export_error,
--   DROP COLUMN IF EXISTS bank_export_size_bytes,
--   DROP COLUMN IF EXISTS bank_export_sha256,
--   DROP COLUMN IF EXISTS bank_export_generated_at,
--   DROP COLUMN IF EXISTS bank_export_storage_path;
-- COMMIT;
