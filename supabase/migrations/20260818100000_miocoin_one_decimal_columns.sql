-- MioCoin — one-decimal rule, part 1/4: column types and validation guards.
--
-- Confirmed OneMil business rule (ONEMIL_BUSINESS_CONTEXT.md §8.1):
--   * a MioCoin value never carries more than ONE decimal place
--   * the minimum issuable partner reward is 0.5 MC
--   * a manually entered MioCoin setting must be >= 0.5 AND have <= 1 decimal;
--     an invalid value is REJECTED, never silently rounded (1.25 must not become 1.3)
--
-- Why the partner coin chain was broken before this migration:
--   partner_reward_codes.coins, partner_coin_activations.coins,
--   partner_invoice_lines.coins and partner_invoices.coins_activated were all
--   `integer`. A 0.6 MC reward therefore could not survive anywhere — it was
--   truncated to 0 at issuance and could never reach the wallet or an invoice.
--
-- Why plain `numeric` and not `numeric(x,1)`:
--   numeric(x,1) SILENTLY rounds an incoming 1.25 to 1.3. The confirmed rule is
--   that an out-of-spec value must be rejected. Unconstrained numeric + a CHECK
--   gives us rejection instead of silent correction.
--
-- Money vs. quantity: this migration only touches MioCoin QUANTITY columns.
-- CZK amounts (amount_net, vat_amount, amount_gross, price_per_coin) keep their
-- existing 2-decimal financial behaviour and are deliberately untouched. Likewise
-- payments.amount, wallets.balance_coins and wallet_transactions.amount (the
-- Stripe top-up / refund / referral path) are OUT OF SCOPE for this change — they
-- are a separate reward path from the partner engine this migration closes, and
-- payments.amount is already normalised to a whole CZK price by stripe-webhook.
--
-- Read-only production audit performed before writing this migration
-- (project xkzhjldrojjlrkezorey, 18. 08. 2026):
--   * partners.reward_mc                    numeric(10,4), 0 rows violate min 0.5 / one-decimal
--   * partner_product_reward_rules.fixed_mc numeric, 0 rows violate
--   * partner_product_reward_rules.ratio_mc numeric, 0 rows violate
--   * shoptet_connection_requests.reward_mc numeric, 0 rows violate
--   * partner_reward_codes.coins            integer, 0 rows would violate once numeric
--   * partner_coin_activations.coins        integer, 0 rows would violate once numeric
--   * partner_invoice_lines.coins            integer, 0 rows would violate once numeric
--   * partner_invoices.coins_activated       integer, 0 rows would violate once numeric
--   * partner_invoices.coins_total           already numeric, 0 rows violate
--   * wallets.balance_coins                  already numeric(10,2) — untouched, out of scope
--   * no view depends on any of the four coin columns being altered
--   → every constraint below is satisfied by current production data.
--
-- Rollback:
--   ALTER TABLE public.partner_reward_codes     DROP CONSTRAINT partner_reward_codes_coins_one_decimal;
--   ALTER TABLE public.partner_coin_activations DROP CONSTRAINT partner_coin_activations_coins_one_decimal;
--   ALTER TABLE public.partner_invoice_lines    DROP CONSTRAINT partner_invoice_lines_coins_one_decimal;
--   ALTER TABLE public.partner_invoices         DROP CONSTRAINT partner_invoices_coins_one_decimal;
--   ALTER TABLE public.partners                          DROP CONSTRAINT partners_reward_mc_one_decimal;
--   ALTER TABLE public.partner_product_reward_rules      DROP CONSTRAINT pprr_fixed_mc_one_decimal;
--   ALTER TABLE public.partner_product_reward_rules      DROP CONSTRAINT pprr_ratio_mc_one_decimal;
--   ALTER TABLE public.shoptet_connection_requests       DROP CONSTRAINT scr_reward_mc_one_decimal;
--   DROP FUNCTION IF EXISTS public.miocoin_min_partner_reward_mc();
--   -- and, only if every stored value is a whole number, ALTER ... TYPE integer back.

begin;

-- ── 0. The 0.5 minimum in one place ──────────────────────────────────────────
-- Used by compute_partner_reward / create_partner_order_reward. Deliberately NOT
-- referenced from CHECK constraints: a constraint that calls a function is not
-- re-validated when the function changes, so the constant is spelled out inline
-- in the checks below and this helper exists for procedural code only.

CREATE OR REPLACE FUNCTION public.miocoin_min_partner_reward_mc()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT 0.5::numeric $$;

COMMENT ON FUNCTION public.miocoin_min_partner_reward_mc() IS
  'Minimum issuable partner MioCoin reward (0.5 MC). A computed order reward below this is not issued.';

REVOKE ALL ON FUNCTION public.miocoin_min_partner_reward_mc() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.miocoin_min_partner_reward_mc() TO authenticated, service_role;

-- ── 1. Partner coin chain: integer → numeric ─────────────────────────────────

ALTER TABLE public.partner_reward_codes
  ALTER COLUMN coins TYPE numeric USING coins::numeric;

ALTER TABLE public.partner_coin_activations
  ALTER COLUMN coins TYPE numeric USING coins::numeric;

ALTER TABLE public.partner_invoice_lines
  ALTER COLUMN coins TYPE numeric USING coins::numeric;

ALTER TABLE public.partner_invoices
  ALTER COLUMN coins_activated TYPE numeric USING coins_activated::numeric,
  ALTER COLUMN coins_activated SET DEFAULT 0;

COMMENT ON COLUMN public.partner_reward_codes.coins IS
  'MioCoins carried by this reward code. Max 1 decimal place (OneMil MioCoin rule). Computed once by compute_partner_reward and never recomputed.';
COMMENT ON COLUMN public.partner_coin_activations.coins IS
  'MioCoins activated by the customer. Max 1 decimal place. Copied verbatim from partner_reward_codes.coins — never re-rounded.';
COMMENT ON COLUMN public.partner_invoice_lines.coins IS
  'MioCoin quantity of one invoiced activation. Max 1 decimal place. Money amounts on the invoice keep 2 decimals.';
COMMENT ON COLUMN public.partner_invoices.coins_activated IS
  'Total invoiced MioCoin quantity. Max 1 decimal place (sum of 1-decimal line quantities).';

-- ── 2. One-decimal guards on the coin chain ──────────────────────────────────
-- round(x, 1) on a positive numeric is half-up, which is exactly the confirmed
-- rounding behaviour (4.95 → 5.0, 4.85 → 4.9, 4.84 → 4.8).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_reward_codes_coins_one_decimal') THEN
    ALTER TABLE public.partner_reward_codes
      ADD CONSTRAINT partner_reward_codes_coins_one_decimal
      CHECK (coins = round(coins, 1));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_coin_activations_coins_one_decimal') THEN
    ALTER TABLE public.partner_coin_activations
      ADD CONSTRAINT partner_coin_activations_coins_one_decimal
      CHECK (coins = round(coins, 1));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_invoice_lines_coins_one_decimal') THEN
    ALTER TABLE public.partner_invoice_lines
      ADD CONSTRAINT partner_invoice_lines_coins_one_decimal
      CHECK (coins = round(coins, 1));
  END IF;

  -- coins_total is already numeric; it is the summed quantity, so it must obey
  -- the same rule as the lines it is summed from.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_invoices_coins_one_decimal') THEN
    ALTER TABLE public.partner_invoices
      ADD CONSTRAINT partner_invoices_coins_one_decimal
      CHECK (
        coins_activated = round(coins_activated, 1)
        AND (coins_total IS NULL OR coins_total = round(coins_total, 1))
      );
  END IF;
END $$;

-- ── 3. Manually entered MioCoin settings: min 0.5 + max 1 decimal ────────────
-- These are the values a partner types into the dashboard. They must be rejected
-- when out of spec (0.4 → error, 1.25 → error), not corrected behind their back.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partners_reward_mc_one_decimal') THEN
    ALTER TABLE public.partners
      ADD CONSTRAINT partners_reward_mc_one_decimal
      CHECK (reward_mc >= 0.5 AND reward_mc = round(reward_mc, 1));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pprr_fixed_mc_one_decimal') THEN
    ALTER TABLE public.partner_product_reward_rules
      ADD CONSTRAINT pprr_fixed_mc_one_decimal
      CHECK (fixed_mc IS NULL OR (fixed_mc >= 0.5 AND fixed_mc = round(fixed_mc, 1)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pprr_ratio_mc_one_decimal') THEN
    ALTER TABLE public.partner_product_reward_rules
      ADD CONSTRAINT pprr_ratio_mc_one_decimal
      CHECK (ratio_mc IS NULL OR (ratio_mc >= 0.5 AND ratio_mc = round(ratio_mc, 1)));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scr_reward_mc_one_decimal') THEN
    ALTER TABLE public.shoptet_connection_requests
      ADD CONSTRAINT scr_reward_mc_one_decimal
      CHECK (reward_mc >= 0.5 AND reward_mc = round(reward_mc, 1));
  END IF;
END $$;

COMMENT ON COLUMN public.partners.reward_mc IS
  'Global conversion: reward_base_czk CZK = reward_mc MioCoins. Manually entered: min 0.5, max 1 decimal place, enforced by partners_reward_mc_one_decimal.';
COMMENT ON COLUMN public.partner_product_reward_rules.fixed_mc IS
  'MioCoins per single unit of this SKU. Manually entered: min 0.5, max 1 decimal place.';
COMMENT ON COLUMN public.partner_product_reward_rules.ratio_mc IS
  'MioCoins per ratio_base_czk CZK for this SKU. Manually entered: min 0.5, max 1 decimal place.';

commit;
