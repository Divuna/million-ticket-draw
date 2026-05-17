-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4: Persist physical bonus prize economy metadata
-- Adds four nullable columns to bonus_prizes for cost tracking.
--
-- These columns are nullable because:
--   • Existing rows have no cost data and must remain valid.
--   • MioCoin bonus_prizes rows never need these fields.
--   • Physical prize rows get them populated by admin on contest save.
--
-- Safety invariants:
--   • All columns are nullable — no existing rows are broken.
--   • These are admin-only planning fields; never read by buy_ticket_atomic,
--     winner logic, Partner Offer assignment, or any public-facing API.
--   • No RLS change needed: bonus_prizes already has appropriate policies.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.bonus_prizes
  ADD COLUMN IF NOT EXISTS supplier_name          TEXT,
  ADD COLUMN IF NOT EXISTS unit_cost_czk          NUMERIC,
  ADD COLUMN IF NOT EXISTS vat_rate_percent        NUMERIC,
  ADD COLUMN IF NOT EXISTS handling_override_czk  NUMERIC;

COMMENT ON COLUMN public.bonus_prizes.supplier_name
  IS 'Admin-only: supplier name for physical prize cost tracking.';
COMMENT ON COLUMN public.bonus_prizes.unit_cost_czk
  IS 'Admin-only: purchase price without VAT in CZK.';
COMMENT ON COLUMN public.bonus_prizes.vat_rate_percent
  IS 'Admin-only: VAT rate (%) applied to this prize.';
COMMENT ON COLUMN public.bonus_prizes.handling_override_czk
  IS 'Admin-only: optional per-prize handling/packing/work cost override in CZK. '
     'NULL means the contest-level default from contest_economy.default_handling_czk applies.';
