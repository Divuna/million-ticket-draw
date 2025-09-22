-- Make user_id nullable in vouchers table for admin-created vouchers
ALTER TABLE vouchers ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS policy to allow admins to create vouchers without user_id
DROP POLICY IF EXISTS "vouchers_select_own" ON vouchers;
DROP POLICY IF EXISTS "Allow admin full access to vouchers" ON vouchers;

-- Create new RLS policies for vouchers
CREATE POLICY "Users can view assigned vouchers" ON vouchers
FOR SELECT USING (
  auth.uid() = user_id OR 
  user_id IS NULL  -- Allow viewing unassigned vouchers
);

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

-- Allow users to redeem vouchers (update user_id when claiming)
CREATE POLICY "Users can claim unassigned vouchers" ON vouchers
FOR UPDATE USING (
  user_id IS NULL AND EXISTS (
    SELECT 1 FROM users u 
    WHERE u.id = auth.uid()
  )
) WITH CHECK (
  user_id = auth.uid()
);