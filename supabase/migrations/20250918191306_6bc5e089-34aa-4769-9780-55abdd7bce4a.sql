-- Change amount column from integer to numeric to support decimal values
ALTER TABLE public.bonus_prizes 
ALTER COLUMN amount TYPE numeric USING amount::numeric;