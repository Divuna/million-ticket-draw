-- Migration: 20260717210000_user_vouchers_insert_favorites_only.sql
--
-- SECURITY FIX for public.user_vouchers direct client writes.
--
-- PROBLEM
-- Policy user_vouchers_insert_own allowed ANY own-row INSERT, so a signed-in
-- user could insert a row with redeemed = true (and/or an arbitrary
-- voucher_code_id) — i.e. "buy" a voucher without paying 5 MioCoins and
-- without a legitimately issued code.
--
-- FIX (smallest safe change)
-- 1. INSERT policy now only allows FAVORITES: own row, redeemed = false,
--    voucher_code_id IS NULL. This is exactly what the frontend inserts
--    (src/pages/Vouchers.tsx "přidat do oblíbených").
-- 2. DELETE policy now only allows removing FAVORITES (redeemed = false),
--    so a purchased-voucher record cannot be deleted by the customer.
--    The frontend delete already filters on redeemed = false.
--
-- UNCHANGED / STILL WORKS
-- * Purchases go exclusively through buy_voucher_atomic (SECURITY DEFINER,
--   owner postgres — not subject to these policies): code issue, redeemed
--   flip, 5 MioCoin deduction and wallet_transactions row are untouched.
-- * There is no user UPDATE policy on user_vouchers, so redeemed cannot be
--   flipped by the client (unchanged).
-- * user_owns_voucher SELECT policy (own rows) unchanged.
-- * admin_all_voucher_access_secure (admin/superadmin ALL) unchanged.

DROP POLICY IF EXISTS user_vouchers_insert_own ON public.user_vouchers;
CREATE POLICY user_vouchers_insert_own
ON public.user_vouchers
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND redeemed = false
  AND voucher_code_id IS NULL
);

DROP POLICY IF EXISTS user_vouchers_delete_own ON public.user_vouchers;
CREATE POLICY user_vouchers_delete_own
ON public.user_vouchers
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND redeemed = false
);
