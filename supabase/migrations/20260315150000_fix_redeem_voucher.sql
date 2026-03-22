-- Fix voucher redeem flow: vouchers.value and vouchers.code were removed in earlier migrations.
-- This migration adds redeem_price_vouchers (cost in wallet balance_vouchers to redeem one voucher)
-- and updates redeem_voucher + get_available_vouchers to use current schema.
-- Run manually in Supabase SQL Editor; do not run db push automatically.

-- 1) Add column for "voucher balance" redemption cost (per voucher)
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS redeem_price_vouchers NUMERIC NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.vouchers.redeem_price_vouchers IS 'Cost in wallet.balance_vouchers to redeem this voucher (used by redeem_voucher)';

-- 2) redeem_voucher: use redeem_price_vouchers instead of value; log voucher name instead of code
CREATE OR REPLACE FUNCTION public.redeem_voucher(p_voucher_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_voucher_record vouchers%ROWTYPE;
  v_remaining_vouchers integer;
  v_user_wallet_balance numeric;
  v_price numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Uživatel není přihlášen');
  END IF;

  SELECT * INTO v_voucher_record
  FROM vouchers
  WHERE id = p_voucher_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Voucher neexistuje');
  END IF;

  IF v_voucher_record.start_date IS NOT NULL AND now() < v_voucher_record.start_date THEN
    RETURN json_build_object('success', false, 'message', 'Voucher ještě není aktivní');
  END IF;
  IF v_voucher_record.end_date IS NOT NULL AND now() > v_voucher_record.end_date THEN
    RETURN json_build_object('success', false, 'message', 'Voucher již vypršel');
  END IF;

  IF EXISTS (
    SELECT 1 FROM user_vouchers
    WHERE user_id = v_user_id AND voucher_id = p_voucher_id AND redeemed = true
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Tento voucher jste již uplatnili');
  END IF;

  IF v_voucher_record.max_quantity IS NOT NULL THEN
    v_remaining_vouchers := v_voucher_record.max_quantity - coalesce(v_voucher_record.redeemed_count, 0);
    IF v_remaining_vouchers <= 0 THEN
      RETURN json_build_object('success', false, 'message', 'Všechny vouchery byly již uplatněny');
    END IF;
  END IF;

  v_price := coalesce(v_voucher_record.redeem_price_vouchers, 1);
  SELECT balance_vouchers INTO v_user_wallet_balance
  FROM wallets
  WHERE user_id = v_user_id;
  IF v_user_wallet_balance IS NULL OR v_user_wallet_balance < v_price THEN
    RETURN json_build_object('success', false, 'message', 'Nedostatečný zůstatek voucherů v peněžence');
  END IF;

  BEGIN
    UPDATE wallets
    SET balance_vouchers = balance_vouchers - v_price
    WHERE user_id = v_user_id;

    UPDATE vouchers
    SET redeemed_count = coalesce(redeemed_count, 0) + 1
    WHERE id = p_voucher_id;

    INSERT INTO user_vouchers (user_id, voucher_id, redeemed)
    VALUES (v_user_id, p_voucher_id, true);

    PERFORM log_admin_action(
      'voucher_redeemed',
      'vouchers',
      p_voucher_id,
      NULL,
      jsonb_build_object(
        'user_id', v_user_id,
        'voucher_name', v_voucher_record.name,
        'redeem_price_vouchers', v_price,
        'remaining_vouchers', CASE
          WHEN v_voucher_record.max_quantity IS NULL THEN 'unlimited'
          ELSE (v_voucher_record.max_quantity - coalesce(v_voucher_record.redeemed_count, 0) - 1)::text
        END
      )
    );

    RETURN json_build_object(
      'success', true,
      'message', 'Voucher byl úspěšně uplatněn',
      'redeemed_value', v_price
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', 'Chyba při uplatnění voucheru: ' || SQLERRM);
  END;
END;
$function$;

-- 3) get_available_vouchers: return name as code and redeem_price_vouchers as value (no code/value columns)
CREATE OR REPLACE FUNCTION public.get_available_vouchers(p_user_id uuid DEFAULT NULL)
 RETURNS TABLE (
   id uuid,
   code text,
   value numeric,
   image_url text,
   banner_url text,
   max_quantity integer,
   redeemed_count integer,
   remaining_vouchers integer,
   start_date timestamptz,
   end_date timestamptz,
   is_active boolean,
   user_already_redeemed boolean
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := coalesce(p_user_id, auth.uid());
  RETURN QUERY
  SELECT
    v.id,
    v.name::text AS code,
    coalesce(v.redeem_price_vouchers, 1)::numeric AS value,
    v.image_url,
    v.banner_url,
    v.max_quantity,
    coalesce(v.redeemed_count, 0)::integer AS redeemed_count,
    CASE
      WHEN v.max_quantity IS NULL THEN NULL::integer
      ELSE (v.max_quantity - coalesce(v.redeemed_count, 0))::integer
    END AS remaining_vouchers,
    v.start_date,
    v.end_date,
    (
      (v.start_date IS NULL OR now() >= v.start_date) AND
      (v.end_date IS NULL OR now() <= v.end_date) AND
      (v.max_quantity IS NULL OR (v.max_quantity - coalesce(v.redeemed_count, 0)) > 0)
    ) AS is_active,
    EXISTS (
      SELECT 1 FROM user_vouchers uv
      WHERE uv.user_id = v_user_id AND uv.voucher_id = v.id AND uv.redeemed = true
    ) AS user_already_redeemed
  FROM vouchers v
  WHERE v.image_url IS NOT NULL
  ORDER BY v.created_at DESC;
END;
$function$;
