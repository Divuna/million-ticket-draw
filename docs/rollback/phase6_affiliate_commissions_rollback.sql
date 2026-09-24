-- ROLLBACK Fáze 6 (migrace 20260926100000_phase6_affiliate_commissions_paid_czk.sql)
-- Vrací měsíční výpočet affiliate provizí PŘESNĚ do produkční podoby zachycené
-- read-only z xkzhjldrojjlrkezorey před nasazením Fáze 6 (md5 níže).
-- Spouštět jen po rozhodnutí Pavla.
--
-- Po rollbacku se zákaznická provize opět počítá z payments.amount (MIO vč. bonusu),
-- refundace provizi neupravují a recovery / umoření z budoucích provizí neexistuje.
-- Rollback odstraní i tabulky a sloupce Fáze 6 (viz krok 4 — před tím exportovat).

begin;

-- 1) Přepočet provize po refundaci vypnout.
drop trigger if exists trg_affiliate_commission_payment_sync on public.payments;

-- 2) Původní měsíční výpočet.
-- calculate_affiliate_commissions_for_month(p_month date)   md5 a36ce9300e2718eeb0393d8730551b9e   ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.calculate_affiliate_commissions_for_month(p_month date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;
  IF p_month IS NULL THEN RETURN jsonb_build_object('status', 'invalid_month'); END IF;

  DELETE FROM public.affiliate_commissions
  WHERE period_month = v_month AND status = 'calculated';

  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    s.aid, 'customer_payments', v_month, s.base,
    CASE WHEN s.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN s.is_vat_payer THEN ROUND(s.base * 1.21, 2) ELSE s.base END,
    'calculated'
  FROM (
    SELECT cr.affiliate_id AS aid, a.is_vat_payer,
      ROUND(SUM(pay.amount) * (a.commission_rate_customer / 100.0), 2) AS base
    FROM public.affiliate_customer_refs cr
    JOIN public.affiliate_accounts a ON a.id = cr.affiliate_id
    JOIN public.payments pay ON pay.user_id = cr.user_id
    WHERE a.status = 'approved'
      AND pay.status = 'completed'
      AND pay.amount > 0
      AND (pay.method IS NULL OR pay.method NOT IN ('bonus','partner','api'))
      AND date_trunc('month', pay.created_at)::date = v_month
    GROUP BY cr.affiliate_id, a.is_vat_payer, a.commission_rate_customer
    HAVING SUM(pay.amount) > 0
  ) s
  ON CONFLICT (affiliate_id, commission_type, period_month)
    WHERE period_month IS NOT NULL AND commission_type = 'customer_payments'
  DO NOTHING;

  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, source_invoice_id, company_ref_id,
     amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    p.referred_by_affiliate_id,
    'company_invoice',
    date_trunc('month', pi.paid_at)::date,
    pi.id,
    cref.id,
    ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2),
    CASE WHEN a.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN a.is_vat_payer
         THEN ROUND(ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2) * 1.21, 2)
         ELSE ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2) END,
    'calculated'
  FROM public.partner_invoices pi
  JOIN public.partners p           ON p.id = pi.partner_id
  JOIN public.affiliate_accounts a ON a.id = p.referred_by_affiliate_id
  LEFT JOIN public.affiliate_company_refs cref
         ON cref.partner_id   = pi.partner_id
        AND cref.affiliate_id = p.referred_by_affiliate_id
  WHERE p.referred_by_affiliate_id IS NOT NULL
    AND a.status = 'approved'
    AND pi.status = 'paid'
    AND pi.paid_at IS NOT NULL
    AND COALESCE(pi.amount_ex_vat, 0) > 0
    AND date_trunc('month', pi.paid_at)::date <= v_month
  ON CONFLICT (source_invoice_id) WHERE source_invoice_id IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'ok', 'period_month', v_month,
    'customer_rows', (SELECT count(*) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_rows',  (SELECT count(*) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated'),
    'customer_total',(SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_total', (SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated')
  );
END;
$function$;

-- 2b) Výplatní doklad: zámek částky a původní produkční prepare/finalize.
drop trigger if exists trg_affiliate_commission_amount_frozen on public.affiliate_commissions;

-- prepare_affiliate_payout_document(p_commission_id uuid)   md5 b077dd01067a771c5f789f831bd9eda7   ACL: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.prepare_affiliate_payout_document(p_commission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- finalize_affiliate_payout_document(p_commission_id uuid, p_document_number text, p_pdf_storage_path text, p_pdf_sha256 text, p_affiliate_email_subject text, p_affiliate_email_body text, p_accounting_email_subject text, p_accounting_email_body text)   md5 1b7bb4d75425a771fb4ece7e9bbe2bdb   ACL: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.finalize_affiliate_payout_document(p_commission_id uuid, p_document_number text, p_pdf_storage_path text, p_pdf_sha256 text, p_affiliate_email_subject text, p_affiliate_email_body text, p_accounting_email_subject text, p_accounting_email_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

-- 3) Nové funkce Fáze 6.
drop function if exists public.trg_fn_affiliate_commission_payment_sync();
drop function if exists public.trg_fn_affiliate_commission_amount_frozen();
drop function if exists public.affiliate_commission_sync_payment(uuid);
drop function if exists public._affiliate_recovery_reallocate(uuid);
drop function if exists public._affiliate_recovery_lock(uuid);
drop function if exists public._affiliate_commission_recompute(uuid);
drop function if exists public._affiliate_payment_refunded_czk(text, numeric, numeric);

-- 4) Tabulky a sloupce Fáze 6 (návrat na produkční schéma).
-- POZOR: smaže evidenci vazeb, recovery, umoření a snapshotů výplatních dokladů. Při rollbacku po ostrém
-- provozu je NEJDŘÍV exportovat (audit_logs se nemaže). Částky už uložených
-- provizí (amount_base_czk / amount_total_czk) zůstávají, jak jsou.
drop table if exists public.affiliate_payout_document_snapshots;
drop function if exists public.trg_fn_affiliate_payout_snapshot_immutable();
drop table if exists public.affiliate_commission_recovery_allocations;
drop table if exists public.affiliate_commission_recoveries;
drop table if exists public.affiliate_commission_payments;
alter table public.affiliate_commissions
  drop column if exists gross_amount_base_czk,
  drop column if exists recovery_offset_czk,
  drop column if exists recovery_credit_czk,
  drop column if exists payout_locked_at;

commit;
