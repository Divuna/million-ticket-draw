-- Migration: 20260717220000_wallets_insert_zero_balance_only.sql
--
-- SECURITY FIX for public.wallets direct client INSERT.
--
-- PROBLEM
-- Policy "Users can insert own wallet" had WITH CHECK (auth.uid() = user_id)
-- only, with no constraint on balances. A signed-in user without a wallet
-- could INSERT their own row with an arbitrary balance_coins /
-- bonus_balance_coins — i.e. mint MioCoins for free (reproduced on staging:
-- balance 999999 + bonus 555).
--
-- FIX (smallest safe change)
-- The INSERT policy now additionally requires balance_coins = 0 AND
-- bonus_balance_coins = 0. A direct client INSERT can only ever create an
-- empty wallet.
--
-- UNCHANGED / STILL WORKS
-- * ensure_wallet_exists(uuid) is SECURITY DEFINER (owner postgres) and
--   inserts (0, 0) — used by registration / Homepage / Vouchers /
--   VoucherCarousel; unaffected (and still compliant with the zero rule).
-- * There is no user UPDATE policy on wallets, so a client cannot change an
--   existing balance (verified: UPDATE affects 0 rows). buy_ticket_atomic,
--   buy_voucher_atomic and payment triggers update balances via
--   SECURITY DEFINER and are unaffected.
-- * UNIQUE (user_id) still prevents a second wallet.
-- * admin_wallet_access_secure (admin/superadmin ALL) unchanged.
-- * SELECT own-wallet policy unchanged.

DROP POLICY IF EXISTS "Users can insert own wallet" ON public.wallets;
CREATE POLICY "Users can insert own wallet"
ON public.wallets
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND balance_coins = 0
  AND bonus_balance_coins = 0
);
