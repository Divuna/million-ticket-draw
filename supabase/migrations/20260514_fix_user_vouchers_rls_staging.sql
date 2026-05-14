-- Fix: add missing RLS policies to user_vouchers on staging.
--
-- The staging baseline dump missed three policies that exist on production:
--   user_owns_voucher   (SELECT) — allows authenticated users to read their own rows
--   user_vouchers_insert_own (INSERT) — allows authenticated users to insert their own rows
--   user_vouchers_delete_own (DELETE) — allows authenticated users to delete their own rows
--
-- Without user_owns_voucher, fetchUserVouchers returns [] for all non-admin users,
-- so the Zakoupené (purchased) and Oblíbené (favorites) tabs always show empty state.
-- buy_voucher_atomic is SECURITY DEFINER so its INSERT bypassed RLS — but the
-- subsequent SELECT in useUserVouchers was silently blocked, causing spec10 to fail.
--
-- Applied manually on staging (dxmowysntemfqfnanxua) via Supabase MCP on 2026-05-14.
-- Production (xkzhjldrojjlrkezorey) already has all four policies — no change needed there.

CREATE POLICY IF NOT EXISTS "user_owns_voucher"
ON public.user_vouchers
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "user_vouchers_insert_own"
ON public.user_vouchers
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY IF NOT EXISTS "user_vouchers_delete_own"
ON public.user_vouchers
FOR DELETE
TO authenticated
USING (user_id = auth.uid());
