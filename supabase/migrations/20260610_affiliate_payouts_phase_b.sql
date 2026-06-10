-- ============================================================================
-- DÁVKOVÉ VÝPLATY PROVIZÍ — FÁZE B: DÁVKA + PAID (NÁVRH, NEAPLIKOVÁNO)
-- ============================================================================
-- Závisí na Fázi A:
--   supabase/migrations/20260609_affiliate_payouts_phase_a.sql
--
-- Tato migrace připravuje pouze dávkový mechanismus:
--   - vytvoření platební dávky z provizí ready_to_pay,
--   - položky dávky,
--   - systémový VS,
--   - označení celé dávky jako zaplacené,
--   - volitelné zrušení dávky ve stavu created.
--
-- Neřeší:
--   - PDF doklady,
--   - e-maily,
--   - Air Bank export,
--   - nasazení na staging/produkci.
--
-- ⛔ NEAPLIKOVAT bez výslovného schválení Pavla. Nejdřív staging + postcheck.
-- ============================================================================

BEGIN;

-- ── 1) Zúžení starého commission status RPC ──────────────────────────────────
-- Fáze B ruší ruční per-row výplatu provize. Staré RPC smí dál sloužit jen pro
-- schválení calculated -> approved; stav paid vzniká výhradně přes dávku.
CREATE OR REPLACE FUNCTION public.admin_set_affiliate_commission_status(
  p_commission_id uuid,
  p_new_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  IF p_new_status IS NULL OR p_new_status NOT IN ('approved', 'paid') THEN
    RETURN jsonb_build_object('status', 'invalid_status');
  END IF;

  SELECT status
  INTO v_current
  FROM public.affiliate_commissions
  WHERE id = p_commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF p_new_status = 'paid' THEN
    RETURN jsonb_build_object(
      'status', 'invalid_transition',
      'from', v_current,
      'to', p_new_status
    );
  END IF;

  IF NOT (v_current = 'calculated' AND p_new_status = 'approved') THEN
    RETURN jsonb_build_object(
      'status', 'invalid_transition',
      'from', v_current,
      'to', p_new_status
    );
  END IF;

  UPDATE public.affiliate_commissions
  SET status = 'approved',
      updated_at = now()
  WHERE id = p_commission_id;

  RETURN jsonb_build_object(
    'status', 'updated',
    'id', p_commission_id,
    'from', v_current,
    'to', p_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_affiliate_commission_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_affiliate_commission_status(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.admin_set_affiliate_commission_status(uuid, text) IS
  'Fáze B návrh: staré per-row RPC omezené jen na calculated -> approved. Paid vzniká pouze přes payout batch.';

-- ── 2) Vytvoření platební dávky ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_affiliate_payout_batch(
  p_commission_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_ids uuid[];
  v_requested_count integer;
  v_locked_count integer;
  v_batch_id uuid := gen_random_uuid();
  v_batch_seq bigint;
  v_batch_number text;
  v_total numeric(12,2);
  v_item_count integer;
  v_invalid record;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  SELECT array_agg(DISTINCT x)
  INTO v_ids
  FROM unnest(coalesce(p_commission_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  v_requested_count := coalesce(array_length(v_ids, 1), 0);
  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object('status', 'empty_selection');
  END IF;

  -- Systémový VS níže používá 6 číslic dávky + 4 číslice pořadí položky.
  -- Pokud by sekvence někdy přetekla, je bezpečnější dávku odmítnout než vyrobit
  -- nekorektní VS delší než 10 znaků.
  v_batch_seq := nextval('public.affiliate_payout_batch_seq');
  IF v_batch_seq > 999999 THEN
    RETURN jsonb_build_object('status', 'batch_sequence_exhausted');
  END IF;
  v_batch_number := 'APB-' || to_char(now(), 'YYYY') || '-' || lpad(v_batch_seq::text, 6, '0');

  DROP TABLE IF EXISTS pg_temp.tmp_affiliate_payout_batch_selection;

  CREATE TEMP TABLE tmp_affiliate_payout_batch_selection (
    commission_id uuid PRIMARY KEY,
    affiliate_id uuid NOT NULL,
    amount_total_czk numeric(12,2),
    recipient_name text,
    recipient_account text,
    recipient_bank_code text,
    rn integer NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_affiliate_payout_batch_selection (
    commission_id,
    affiliate_id,
    amount_total_czk,
    recipient_name,
    recipient_account,
    recipient_bank_code,
    rn
  )
  WITH locked_commissions AS (
    SELECT
      c.id,
      c.affiliate_id,
      c.amount_total_czk,
      c.created_at,
      btrim(a.name) AS recipient_name,
      btrim(a.payout_account) AS recipient_account,
      btrim(a.payout_bank) AS recipient_bank_code
    FROM public.affiliate_commissions c
    JOIN public.affiliate_accounts a ON a.id = c.affiliate_id
    WHERE c.id = ANY(v_ids)
    FOR UPDATE OF c
  )
  SELECT
    id,
    affiliate_id,
    amount_total_czk,
    recipient_name,
    recipient_account,
    recipient_bank_code,
    row_number() OVER (ORDER BY created_at, id)::integer
  FROM locked_commissions;

  SELECT count(*) INTO v_locked_count FROM tmp_affiliate_payout_batch_selection;
  IF v_locked_count <> v_requested_count THEN
    RETURN jsonb_build_object(
      'status', 'not_found',
      'requested_count', v_requested_count,
      'found_count', v_locked_count
    );
  END IF;

  -- Validace stavů a minimálních údajů pro dávku.
  SELECT
    c.id,
    c.status,
    c.payout_batch_id,
    c.amount_total_czk,
    t.recipient_name,
    t.recipient_account,
    t.recipient_bank_code
  INTO v_invalid
  FROM public.affiliate_commissions c
  JOIN tmp_affiliate_payout_batch_selection t ON t.commission_id = c.id
  WHERE c.status <> 'ready_to_pay'
     OR c.payout_batch_id IS NOT NULL
     OR c.amount_total_czk IS NULL
     OR c.amount_total_czk <= 0
     OR t.recipient_name IS NULL
     OR t.recipient_name = ''
     OR t.recipient_account IS NULL
     OR t.recipient_account = ''
     OR t.recipient_account !~ '^[0-9]{2,6}-?[0-9]{2,10}$'
     OR t.recipient_bank_code IS NULL
     OR t.recipient_bank_code = ''
     OR t.recipient_bank_code !~ '^[0-9]{4}$'
  ORDER BY c.created_at, c.id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'status',
      CASE
        WHEN v_invalid.status <> 'ready_to_pay' THEN 'invalid_commission_status'
        WHEN v_invalid.payout_batch_id IS NOT NULL THEN 'already_in_batch'
        WHEN v_invalid.amount_total_czk IS NULL OR v_invalid.amount_total_czk <= 0 THEN 'invalid_amount'
        WHEN v_invalid.recipient_name IS NULL OR v_invalid.recipient_name = '' THEN 'missing_recipient_name'
        WHEN v_invalid.recipient_account IS NULL OR v_invalid.recipient_account = '' THEN 'missing_recipient_account'
        WHEN v_invalid.recipient_account !~ '^[0-9]{2,6}-?[0-9]{2,10}$' THEN 'invalid_recipient_account'
        WHEN v_invalid.recipient_bank_code IS NULL OR v_invalid.recipient_bank_code = '' THEN 'missing_recipient_bank_code'
        WHEN v_invalid.recipient_bank_code !~ '^[0-9]{4}$' THEN 'invalid_recipient_bank_code'
        ELSE 'invalid_commission'
      END,
      'commission_id', v_invalid.id,
      'current_status', v_invalid.status
    );
  END IF;

  SELECT count(*), coalesce(sum(amount_total_czk), 0)
  INTO v_item_count, v_total
  FROM tmp_affiliate_payout_batch_selection;

  IF v_item_count > 9999 THEN
    RETURN jsonb_build_object('status', 'too_many_items', 'item_count', v_item_count);
  END IF;

  INSERT INTO public.affiliate_payout_batches (
    id,
    batch_number,
    status,
    bank,
    bank_export_format,
    bank_export_encoding,
    bank_export_line_endings,
    total_amount_czk,
    item_count,
    created_by
  )
  VALUES (
    v_batch_id,
    v_batch_number,
    'created',
    'airbank',
    'abo_kpc',
    'windows-1250',
    'crlf',
    v_total,
    v_item_count,
    v_admin_id
  );

  INSERT INTO public.affiliate_payout_batch_items (
    batch_id,
    commission_id,
    amount_czk,
    recipient_account,
    recipient_bank_code,
    recipient_name,
    variable_symbol,
    payment_message,
    constant_symbol
  )
  SELECT
    v_batch_id,
    t.commission_id,
    t.amount_total_czk,
    t.recipient_account,
    t.recipient_bank_code,
    t.recipient_name,
    lpad(((v_batch_seq - 1) * 10000 + t.rn)::text, 10, '0'),
    left('OneMil provize ' || v_batch_number, 35),
    '0000'
  FROM tmp_affiliate_payout_batch_selection t
  ORDER BY t.rn;

  UPDATE public.affiliate_commissions c
  SET status = 'in_payment_batch',
      payout_batch_id = v_batch_id,
      updated_at = now()
  WHERE c.id = ANY(v_ids);

  RETURN jsonb_build_object(
    'status', 'created',
    'batch_id', v_batch_id,
    'batch_number', v_batch_number,
    'item_count', v_item_count,
    'total_amount_czk', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_affiliate_payout_batch(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_affiliate_payout_batch(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.create_affiliate_payout_batch(uuid[]) IS
  'Fáze B návrh: admin-only vytvoření payout dávky z ready_to_pay provizí. Bez PDF, e-mailů a bank exportu.';

-- ── 3) Označení celé dávky jako zaplacené ────────────────────────────────────
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

  IF v_batch.status NOT IN ('created', 'exported') THEN
    RETURN jsonb_build_object(
      'status', 'invalid_batch_status',
      'current_status', v_batch.status
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
  'Fáze B návrh: admin-only označení celé payout dávky jako zaplacené, atomicky propíše provize na paid.';

-- ── 4) Bezpečné zrušení dávky před exportem/zaplacením ───────────────────────
CREATE OR REPLACE FUNCTION public.cancel_affiliate_payout_batch(
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

  IF v_batch.status <> 'created' THEN
    RETURN jsonb_build_object(
      'status', 'invalid_batch_status',
      'current_status', v_batch.status
    );
  END IF;

  SELECT count(*)
  INTO v_item_count
  FROM public.affiliate_payout_batch_items
  WHERE batch_id = p_batch_id;

  UPDATE public.affiliate_commissions c
  SET status = 'ready_to_pay',
      payout_batch_id = NULL,
      updated_at = now()
  FROM public.affiliate_payout_batch_items i
  WHERE i.batch_id = p_batch_id
    AND i.commission_id = c.id
    AND c.status = 'in_payment_batch';

  UPDATE public.affiliate_payout_batches
  SET status = 'cancelled',
      cancelled_at = now()
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'batch_id', p_batch_id,
    'item_count', v_item_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_affiliate_payout_batch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_affiliate_payout_batch(uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_affiliate_payout_batch(uuid) IS
  'Fáze B návrh: admin-only zrušení created payout dávky a návrat provizí do ready_to_pay.';

COMMIT;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.cancel_affiliate_payout_batch(uuid);
-- DROP FUNCTION IF EXISTS public.mark_affiliate_payout_batch_paid(uuid);
-- DROP FUNCTION IF EXISTS public.create_affiliate_payout_batch(uuid[]);
-- -- Staré admin_set_affiliate_commission_status(uuid,text) obnovit z migrace
-- -- 20260603_affiliate_commission_status_workflow.sql, pokud by se Fáze B vracela.
-- COMMIT;
-- ============================================================================
