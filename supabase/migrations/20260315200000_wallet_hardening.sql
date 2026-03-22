-- =============================================================================
-- Wallet hardening part 1: ledger table + payment trigger fixes (STEPS 1-3).
-- Part 2 (STEPS 4-9, remaining functions) is in 20260315201000_wallet_hardening_functions.sql
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: wallet_transactions — append-only ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id            uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid        NOT NULL,
  wallet_id     uuid        NOT NULL,
  amount        numeric     NOT NULL,
  balance_after numeric     NOT NULL,
  type          text        NOT NULL,
  source        text        NOT NULL,
  reference_id  uuid,
  metadata      jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.wallet_transactions IS
  'Append-only ledger for all wallet balance changes. Rows must never be updated or deleted.';

COMMENT ON COLUMN public.wallet_transactions.amount IS
  'Signed delta applied to the wallet balance. Positive = credit, negative = debit.';

COMMENT ON COLUMN public.wallet_transactions.balance_after IS
  'Snapshot of the relevant wallet balance column immediately after this change.';

CREATE OR REPLACE FUNCTION public.fn_wallet_transactions_immutable()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transactions rows are immutable and cannot be modified or deleted';
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_transactions_immutable_update ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_transactions_immutable_update
  BEFORE UPDATE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_wallet_transactions_immutable();

DROP TRIGGER IF EXISTS trg_wallet_transactions_immutable_delete ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_transactions_immutable_delete
  BEFORE DELETE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_wallet_transactions_immutable();

CREATE INDEX IF NOT EXISTS idx_wt_user_id     ON public.wallet_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wt_wallet_id   ON public.wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wt_reference   ON public.wallet_transactions (reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wt_type        ON public.wallet_transactions (type);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_select    ON public.wallet_transactions;
DROP POLICY IF EXISTS no_direct_write ON public.wallet_transactions;

CREATE POLICY owner_select ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY no_direct_write ON public.wallet_transactions
  FOR INSERT WITH CHECK (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: fix update_wallet_after_payment
--   BEFORE: credits both balance_coins AND balance_vouchers (double credit bug)
--   AFTER:  credits balance_coins only; writes a ledger entry
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_wallet_after_payment()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_wallet_id      uuid;
  v_new_balance    numeric;
BEGIN
  IF NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.wallets (user_id, balance_coins, balance_vouchers, created_at)
  VALUES (NEW.user_id, NEW.amount, 0, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance_coins = wallets.balance_coins + NEW.amount
  RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    NEW.user_id,
    v_wallet_id,
    NEW.amount,
    v_new_balance,
    'payment_credit',
    'update_wallet_after_payment',
    NEW.id,
    jsonb_build_object(
      'stripe_session_id', NEW.stripe_session_id,
      'method',            NEW.method,
      'payment_status',    NEW.status
    )
  );

  RETURN NEW;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: fix admin_manage_payment refund path
--   BEFORE: credits both balance_coins AND balance_vouchers on refund
--   AFTER:  credits balance_coins only; writes a ledger entry
--   NOTE: production signature is (p_payment_id uuid, p_new_status text, p_operation text).
--   DROP and recreate to avoid parameter-rename conflict with CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.admin_manage_payment(uuid, text, text);

CREATE OR REPLACE FUNCTION public.admin_manage_payment(
  p_payment_id uuid,
  p_new_status text,
  p_operation  text
)
  RETURNS json
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id      uuid;
  v_old_record    payments%rowtype;
  v_new_record    payments%rowtype;
  v_user_email    text;
  v_wallet_id     uuid;
  v_new_balance   numeric;
  v_payload       jsonb;
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = v_admin_id AND role IN ('admin', 'superadmin')
  ) THEN
    RAISE EXCEPTION 'Pouze administrátoři mohou spravovat platby';
  END IF;

  IF p_payment_id IS NULL THEN
    RAISE EXCEPTION 'ID platby je povinné';
  END IF;

  SELECT * INTO v_old_record FROM payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Platba nebyla nalezena';
  END IF;

  SELECT email INTO v_user_email FROM users WHERE id = v_old_record.user_id;

  IF p_operation = 'refund' AND v_old_record.status = 'completed' THEN
    UPDATE payments SET status = 'refunded'
    WHERE id = p_payment_id
    RETURNING * INTO v_new_record;

    INSERT INTO public.wallets (user_id, balance_coins, created_at)
    VALUES (v_old_record.user_id, v_old_record.amount, now())
    ON CONFLICT (user_id) DO UPDATE
      SET balance_coins = wallets.balance_coins + v_old_record.amount
    RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;

    INSERT INTO public.wallet_transactions (
      user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
    ) VALUES (
      v_old_record.user_id,
      v_wallet_id,
      v_old_record.amount,
      v_new_balance,
      'admin_refund_credit',
      'admin_manage_payment',
      p_payment_id,
      jsonb_build_object('admin_id', v_admin_id, 'operation', 'refund')
    );

  ELSIF p_operation = 'update_status' AND p_new_status IS NOT NULL THEN
    UPDATE payments SET status = p_new_status
    WHERE id = p_payment_id
    RETURNING * INTO v_new_record;
  ELSE
    RAISE EXCEPTION 'Neplatná operace nebo stav platby';
  END IF;

  INSERT INTO admin_actions (admin_id, action_type, target_table, target_id, notes, metadata)
  VALUES (
    v_admin_id,
    CONCAT('payment_', p_operation),
    'payments',
    p_payment_id,
    CASE
      WHEN p_operation = 'refund' THEN CONCAT('Refundována platba: ', v_old_record.amount, ' pro ', v_user_email)
      ELSE CONCAT('Změna stavu platby na: ', p_new_status, ' pro ', v_user_email)
    END,
    jsonb_build_object(
      'old_data',      to_jsonb(v_old_record),
      'new_data',      to_jsonb(v_new_record),
      'user_email',    v_user_email,
      'operation',     p_operation,
      'refund_amount', CASE WHEN p_operation = 'refund' THEN v_old_record.amount ELSE NULL END
    )
  );

  v_payload := jsonb_build_object(
    'event_name',  CONCAT('payment_', p_operation),
    'payment_id',  p_payment_id,
    'old_status',  v_old_record.status,
    'new_status',  v_new_record.status,
    'amount',      v_old_record.amount,
    'user_email',  v_user_email,
    'admin_id',    v_admin_id,
    'timestamp',   now()
  );

  PERFORM notify_sofinity_event(CONCAT('payment_', p_operation), v_admin_id, NULL, v_payload);

  RETURN json_build_object(
    'success',      true,
    'message',      CASE
                      WHEN p_operation = 'refund' THEN 'Platba byla úspěšně refundována'
                      ELSE 'Stav platby byl úspěšně změněn'
                    END,
    'payment_id',   p_payment_id,
    'payment_data', row_to_json(v_new_record)
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Chyba při správě platby: %', SQLERRM;
END;
$$;
