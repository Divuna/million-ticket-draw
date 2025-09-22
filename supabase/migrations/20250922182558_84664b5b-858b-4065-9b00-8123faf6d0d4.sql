-- Remove old columns if they exist
ALTER TABLE vouchers DROP COLUMN IF EXISTS value;
ALTER TABLE vouchers DROP COLUMN IF EXISTS code;
ALTER TABLE vouchers DROP COLUMN IF EXISTS redeemed;
ALTER TABLE vouchers DROP COLUMN IF EXISTS redeemed_at;

-- Ensure all required columns have correct constraints
ALTER TABLE vouchers ALTER COLUMN name SET NOT NULL;
ALTER TABLE vouchers ALTER COLUMN redeemed_count SET DEFAULT 0;
ALTER TABLE vouchers ALTER COLUMN redeemed_count SET NOT NULL;
ALTER TABLE vouchers ALTER COLUMN updated_at SET DEFAULT now();

-- Add trigger for automatic updated_at updates
CREATE TRIGGER update_vouchers_updated_at
  BEFORE UPDATE ON vouchers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Users can view assigned vouchers" ON vouchers;
DROP POLICY IF EXISTS "Admins can manage all vouchers" ON vouchers;
DROP POLICY IF EXISTS "Users can claim unassigned vouchers" ON vouchers;

-- Create proper RLS policies
CREATE POLICY "Admins can manage all vouchers" ON vouchers
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Users can view assigned vouchers or unassigned vouchers" ON vouchers
FOR SELECT USING (
  auth.uid() = user_id OR user_id IS NULL
);

CREATE POLICY "Users can claim unassigned vouchers" ON vouchers
FOR UPDATE USING (
  user_id IS NULL AND EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid()
  )
) WITH CHECK (
  user_id = auth.uid()
);