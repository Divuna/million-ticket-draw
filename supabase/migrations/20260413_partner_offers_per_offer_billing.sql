-- Migration: per-offer billing fields on partner_offers
-- Block 1 of Partner Offers per-offer monetization
--
-- Adds:
--   billing_mode          text    NOT NULL DEFAULT 'paid_distribution'
--   price_per_activation  numeric NOT NULL DEFAULT 0
--   billing_admin_override boolean NOT NULL DEFAULT false
--
-- Backfill: copies billing_mode + price_per_activation from partner_offer_billing_configs
-- where a matching config exists. Falls back to defaults where no config exists.
--
-- Safe: additive only, no existing columns touched, no RLS changes.
-- Apply manually in Supabase SQL Editor. Do not run via CLI.

-- ── 1. Add columns ─────────────────────────────────────────────────────────
ALTER TABLE public.partner_offers
  ADD COLUMN IF NOT EXISTS billing_mode          text    NOT NULL DEFAULT 'paid_distribution',
  ADD COLUMN IF NOT EXISTS price_per_activation  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_admin_override boolean NOT NULL DEFAULT false;

-- ── 2. Backfill from partner_offer_billing_configs where available ──────────
UPDATE public.partner_offers po
SET
  billing_mode         = pbc.billing_mode,
  price_per_activation = pbc.price_per_activation
FROM public.partner_offer_billing_configs pbc
WHERE pbc.partner_id = po.partner_id;

-- ── 3. Verify: no nulls, all offers have values ────────────────────────────
DO $$
DECLARE
  v_null_billing_mode  int;
  v_null_price         int;
  v_null_override      int;
BEGIN
  SELECT COUNT(*) INTO v_null_billing_mode  FROM public.partner_offers WHERE billing_mode IS NULL;
  SELECT COUNT(*) INTO v_null_price         FROM public.partner_offers WHERE price_per_activation IS NULL;
  SELECT COUNT(*) INTO v_null_override      FROM public.partner_offers WHERE billing_admin_override IS NULL;

  IF v_null_billing_mode > 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: % partner_offers have NULL billing_mode', v_null_billing_mode;
  END IF;
  IF v_null_price > 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: % partner_offers have NULL price_per_activation', v_null_price;
  END IF;
  IF v_null_override > 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: % partner_offers have NULL billing_admin_override', v_null_override;
  END IF;

  RAISE NOTICE 'VERIFY OK: all partner_offers have non-null billing fields';
END;
$$;
