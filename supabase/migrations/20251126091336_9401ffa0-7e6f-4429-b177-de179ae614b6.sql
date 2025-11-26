-- Add is_public column to vouchers table
ALTER TABLE public.vouchers 
ADD COLUMN is_public boolean NOT NULL DEFAULT false;

-- Create index for better performance when filtering by is_public
CREATE INDEX idx_vouchers_is_public ON public.vouchers(is_public) WHERE is_public = true;

-- Add comment to explain the column
COMMENT ON COLUMN public.vouchers.is_public IS 'When true, voucher is visible to all users on homepage. Set manually by admin.';