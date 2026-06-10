-- =============================================================================
-- Fáze D.1 — auto-fill payer_account/bank_code/due_date při vytvoření dávky
--            + RPC pro editaci meta dávky před exportem
-- NEAPLIKOVAT — pouze reviewable návrh
-- =============================================================================

-- ── 1) Settings seed ─────────────────────────────────────────────────────────
-- Uloží výchozí údaje plátce. Lze přepsat v /admin/settings.
INSERT INTO public.settings (key, value)
VALUES
  ('affiliate_payout_payer_account',  '3151752019'),
  ('affiliate_payout_payer_bank_code', '3030')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── 2) create_affiliate_payout_batch — nahrazení Fáze B verze ────────────────
-- Přidán auto-fill: payer_account + payer_bank_code ze settings,
-- due_date = current_date + 2.
-- Vrací 'missing_payer_account_setting' pokud klíč v settings chybí.
CREATE OR REPLACE FUNCTION public.create_affiliate_payout_batch(
  p_commission_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id       uuid    := auth.uid();
  v_ids            uuid[];
  v_requested_count integer;
  v_locked_count   integer;
  v_batch_id       uuid    := gen_random_uuid();
  v_batch_seq      bigint;
  v_batch_number   text;
  v_total          numeric(12,2);
  v_item_count     integer;
  v_invalid        record;
  v_payer_account  text;
  v_payer_bank_code text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  -- Načti účet plátce ze settings; bez něj dávku nelze vytvořit.
  SELECT value INTO v_payer_account
  FROM public.settings
  WHERE key = 'affiliate_payout_payer_account';

  IF v_payer_account IS NULL THEN
    RETURN jsonb_build_object('status', 'missing_payer_account_setting');
  END IF;

  SELECT value INTO v_payer_bank_code
  FROM public.settings
  WHERE key = 'affiliate_payout_payer_bank_code';

  -- Bank code fallback; v praxi musí být nastaveno na '3030' pro Air Bank.
  v_payer_bank_code := coalesce(v_payer_bank_code, '3030');

  SELECT array_agg(DISTINCT x)
  INTO v_ids
  FROM unnest(coalesce(p_commission_ids, ARRAY[]::uuid[])) AS x
  WHERE x IS NOT NULL;

  v_requested_count := coalesce(array_length(v_ids, 1), 0);
  IF v_requested_count = 0 THEN
    RETURN jsonb_build_object('status', 'empty_selection');
  END IF;

  -- Systémový VS níže používá 6 číslic dávky + 4 číslice pořadí položky.
  v_batch_seq := nextval('public.affiliate_payout_batch_seq');
  IF v_batch_seq > 999999 THEN
    RETURN jsonb_build_object('status', 'batch_sequence_exhausted');
  END IF;
  v_batch_number := 'APB-' || to_char(now(), 'YYYY') || '-' || lpad(v_batch_seq::text, 6, '0');

  DROP TABLE IF EXISTS pg_temp.tmp_affiliate_payout_batch_selection;

  CREATE TEMP TABLE tmp_affiliate_payout_batch_selection (
    commission_id    uuid PRIMARY KEY,
    affiliate_id     uuid NOT NULL,
    amount_total_czk numeric(12,2),
    recipient_name   text,
    recipient_account text,
    recipient_bank_code text,
    rn               integer NOT NULL
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
      btrim(a.name)          AS recipient_name,
      btrim(a.payout_account) AS recipient_account,
      btrim(a.payout_bank)   AS recipient_bank_code
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
    created_by,
    payer_account,
    payer_bank_code,
    due_date
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
    v_admin_id,
    v_payer_account,
    v_payer_bank_code,
    current_date + 2
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
  'Fáze D.1: auto-fill payer_account/bank_code ze settings, due_date = current_date + 2.';

-- ── 3) update_affiliate_payout_batch_meta ────────────────────────────────────
-- Umožňuje adminovi upravit payer_account, payer_bank_code a due_date
-- dokud dávka není exportovaná (status = ''created'').
CREATE OR REPLACE FUNCTION public.update_affiliate_payout_batch_meta(
  p_batch_id       uuid,
  p_payer_account  text,
  p_payer_bank_code text,
  p_due_date       date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch record;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'status', 'forbidden');
  END IF;

  -- Načti dávku s FOR UPDATE — guard proti race condition.
  SELECT id, status
  INTO v_batch
  FROM public.affiliate_payout_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'status', 'not_found');
  END IF;

  IF v_batch.status <> 'created' THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid_batch_status',
      'current_status', v_batch.status,
      'required_status', 'created'
    );
  END IF;

  -- Validace payer_account: číslo s volitelným prefixem (formát CZ bankovního účtu).
  IF p_payer_account IS NULL OR p_payer_account = '' THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_payer_account');
  END IF;
  IF p_payer_account !~ '^[0-9]{1,6}-?[0-9]{1,10}$' THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_payer_account');
  END IF;

  -- Validace bank_code: pro Air Bank musí být 3030.
  IF p_payer_bank_code IS NULL OR p_payer_bank_code = '' THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_payer_bank_code');
  END IF;
  IF p_payer_bank_code <> '3030' THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_airbank_payer_bank_code');
  END IF;

  -- Validace due_date: nesmí být v minulosti ani více než rok dopředu.
  IF p_due_date IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_due_date');
  END IF;
  IF p_due_date < current_date THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_due_date_past');
  END IF;
  IF p_due_date > current_date + 364 THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_due_date_future');
  END IF;

  UPDATE public.affiliate_payout_batches
  SET
    payer_account   = p_payer_account,
    payer_bank_code = p_payer_bank_code,
    due_date        = p_due_date
  WHERE id = p_batch_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'updated',
    'batch_id', p_batch_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_affiliate_payout_batch_meta(uuid, text, text, date) FROM PUBLIC;
-- Anon explicitně odebrat (Supabase přidává implicitní grant).
REVOKE EXECUTE ON FUNCTION public.update_affiliate_payout_batch_meta(uuid, text, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_affiliate_payout_batch_meta(uuid, text, text, date) TO authenticated;

COMMENT ON FUNCTION public.update_affiliate_payout_batch_meta(uuid, text, text, date) IS
  'Fáze D.1: admin může upravit payer_account, payer_bank_code a due_date dávky dokud má status = created.';
