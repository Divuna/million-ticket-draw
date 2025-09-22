-- Update vouchers table structure for admin-created vouchers
-- Make image_url mandatory
ALTER TABLE public.vouchers 
ALTER COLUMN image_url SET NOT NULL;

-- Remove old columns if they exist (checking first to avoid errors)
DO $$ 
BEGIN
    -- Remove value column if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'vouchers' AND column_name = 'value' AND table_schema = 'public') THEN
        ALTER TABLE public.vouchers DROP COLUMN value;
    END IF;
    
    -- Remove code column if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'vouchers' AND column_name = 'code' AND table_schema = 'public') THEN
        ALTER TABLE public.vouchers DROP COLUMN code;
    END IF;
END $$;

-- Create trigger for updated_at if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add trigger to vouchers table
DROP TRIGGER IF EXISTS update_vouchers_updated_at ON public.vouchers;
CREATE TRIGGER update_vouchers_updated_at
    BEFORE UPDATE ON public.vouchers
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Update RLS policies for vouchers table
DROP POLICY IF EXISTS "Admins can manage all vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Users can view assigned vouchers or unassigned vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Users can claim unassigned vouchers" ON public.vouchers;

-- Admin full access policy
CREATE POLICY "Admins can manage all vouchers" 
ON public.vouchers 
FOR ALL 
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users u 
        WHERE u.id = auth.uid() 
        AND u.role IN ('admin', 'superadmin')
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users u 
        WHERE u.id = auth.uid() 
        AND u.role IN ('admin', 'superadmin')
    )
);

-- Users can view their vouchers or unassigned vouchers
CREATE POLICY "Users can view assigned vouchers or unassigned vouchers" 
ON public.vouchers 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id OR user_id IS NULL);

-- Users can claim unassigned vouchers (update user_id on redeem)
CREATE POLICY "Users can claim unassigned vouchers" 
ON public.vouchers 
FOR UPDATE 
TO authenticated
USING (user_id IS NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid()))
WITH CHECK (user_id = auth.uid());