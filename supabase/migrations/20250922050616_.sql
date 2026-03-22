-- Create comprehensive voucher management system

-- 1. Update vouchers table to support admin-managed vouchers with images
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS max_quantity INTEGER;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS redeemed_count INTEGER DEFAULT 0;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add trigger to update updated_at
CREATE TRIGGER update_vouchers_updated_at
BEFORE UPDATE ON vouchers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 2. Create user_vouchers table to track individual redemptions
CREATE TABLE IF NOT EXISTS user_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  voucher_id UUID NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  redeemed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add RLS policies for user_vouchers
ALTER TABLE user_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own voucher redemptions"
ON user_vouchers
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can redeem vouchers"
ON user_vouchers
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own redemptions"
ON user_vouchers
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all user vouchers"
ON user_vouchers
FOR ALL
USING (EXISTS (
  SELECT 1 FROM users 
  WHERE id = auth.uid() 
  AND role IN ('admin', 'superadmin')
));

-- Add trigger for updated_at
CREATE TRIGGER update_user_vouchers_updated_at
BEFORE UPDATE ON user_vouchers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 3. Create function to redeem voucher
CREATE OR REPLACE FUNCTION public.redeem_voucher(
  p_voucher_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_voucher_record vouchers%ROWTYPE;
  v_remaining_vouchers INTEGER;
  v_user_wallet_balance NUMERIC;
BEGIN
  -- Get authenticated user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Uživatel není přihlášen');
  END IF;

  -- Get voucher details
  SELECT * INTO v_voucher_record
  FROM vouchers
  WHERE id = p_voucher_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'message', 'Voucher neexistuje');
  END IF;

  -- Check if voucher is still valid (time-wise)
  IF v_voucher_record.start_date IS NOT NULL AND NOW() < v_voucher_record.start_date THEN
    RETURN json_build_object('success', false, 'message', 'Voucher ještě není aktivní');
  END IF;
  
  IF v_voucher_record.end_date IS NOT NULL AND NOW() > v_voucher_record.end_date THEN
    RETURN json_build_object('success', false, 'message', 'Voucher již vypršel');
  END IF;

  -- Check if user already redeemed this voucher
  IF EXISTS (
    SELECT 1 FROM user_vouchers 
    WHERE user_id = v_user_id AND voucher_id = p_voucher_id AND redeemed = TRUE
  ) THEN
    RETURN json_build_object('success', false, 'message', 'Tento voucher jste již uplatnili');
  END IF;

  -- Check remaining vouchers (if limited)
  IF v_voucher_record.max_quantity IS NOT NULL THEN
    v_remaining_vouchers := v_voucher_record.max_quantity - COALESCE(v_voucher_record.redeemed_count, 0);
    IF v_remaining_vouchers <= 0 THEN
      RETURN json_build_object('success', false, 'message', 'Všechny vouchery byly již uplatněny');
    END IF;
  END IF;

  -- Check user wallet balance
  SELECT balance_vouchers INTO v_user_wallet_balance
  FROM wallets
  WHERE user_id = v_user_id;
  
  IF v_user_wallet_balance IS NULL OR v_user_wallet_balance < v_voucher_record.value THEN
    RETURN json_build_object('success', false, 'message', 'Nedostatečný zůstatek voucherů v peněžence');
  END IF;

  -- Perform the redemption transaction
  BEGIN
    -- Deduct from user wallet
    UPDATE wallets
    SET balance_vouchers = balance_vouchers - v_voucher_record.value
    WHERE user_id = v_user_id;

    -- Update voucher redeemed count
    UPDATE vouchers
    SET redeemed_count = COALESCE(redeemed_count, 0) + 1
    WHERE id = p_voucher_id;

    -- Record the redemption
    INSERT INTO user_vouchers (user_id, voucher_id, redeemed)
    VALUES (v_user_id, p_voucher_id, TRUE);

    -- Log the action
    PERFORM log_admin_action(
      'voucher_redeemed',
      'vouchers',
      p_voucher_id,
      NULL,
      jsonb_build_object(
        'user_id', v_user_id,
        'voucher_code', v_voucher_record.code,
        'value', v_voucher_record.value,
        'remaining_vouchers', CASE 
          WHEN v_voucher_record.max_quantity IS NULL THEN 'unlimited'
          ELSE (v_voucher_record.max_quantity - COALESCE(v_voucher_record.redeemed_count, 0) - 1)::TEXT
        END
      )
    );

    RETURN json_build_object(
      'success', true, 
      'message', 'Voucher byl úspěšně uplatněn',
      'redeemed_value', v_voucher_record.value
    );
    
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'message', 'Chyba při uplatnění voucheru: ' || SQLERRM);
  END;
END;
$function$;

-- 4. Create function to get available vouchers for users
CREATE OR REPLACE FUNCTION public.get_available_vouchers(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  code TEXT,
  value NUMERIC,
  image_url TEXT,
  banner_url TEXT,
  max_quantity INTEGER,
  redeemed_count INTEGER,
  remaining_vouchers INTEGER,
  start_date TIMESTAMP WITH TIME ZONE,
  end_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN,
  user_already_redeemed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := COALESCE(p_user_id, auth.uid());
  
  RETURN QUERY
  SELECT 
    v.id,
    v.code,
    v.value,
    v.image_url,
    v.banner_url,
    v.max_quantity,
    COALESCE(v.redeemed_count, 0) as redeemed_count,
    CASE 
      WHEN v.max_quantity IS NULL THEN NULL
      ELSE v.max_quantity - COALESCE(v.redeemed_count, 0)
    END as remaining_vouchers,
    v.start_date,
    v.end_date,
    (
      (v.start_date IS NULL OR NOW() >= v.start_date) AND
      (v.end_date IS NULL OR NOW() <= v.end_date) AND
      (v.max_quantity IS NULL OR v.max_quantity - COALESCE(v.redeemed_count, 0) > 0)
    ) as is_active,
    EXISTS (
      SELECT 1 FROM user_vouchers uv 
      WHERE uv.user_id = v_user_id 
      AND uv.voucher_id = v.id 
      AND uv.redeemed = TRUE
    ) as user_already_redeemed
  FROM vouchers v
  WHERE v.image_url IS NOT NULL -- Only show admin-managed vouchers with images
  ORDER BY v.created_at DESC;
END;
$function$;;
