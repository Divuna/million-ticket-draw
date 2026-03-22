-- Remove value and code columns, add name column to vouchers table
ALTER TABLE vouchers DROP COLUMN IF EXISTS value;
ALTER TABLE vouchers DROP COLUMN IF EXISTS code;
ALTER TABLE vouchers ADD COLUMN name text NOT NULL DEFAULT 'New Voucher';;
