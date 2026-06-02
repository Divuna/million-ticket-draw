-- Migration proposal: affiliate commission foundation
-- Purpose:
--   Create a safe, standalone database foundation for the future unified
--   OneMil Affiliate commission system.
--
-- Scope:
--   - Adds new affiliate tables, audit table, rate history, and read-only admin views.
--   - Does NOT connect customer registration, partner registration, payments, wallet,
--     buy_ticket_atomic, contest engine, Partner Offers, or existing customer referrals.
--   - Does NOT calculate production commissions yet.
--   - RLS is intentionally read-only for authenticated admins in this first step.
--     Future admin writes must go through reviewed SECURITY DEFINER RPC functions
--     that validate inputs and write affiliate_audit_logs entries.
--
-- Business model:
--   - First attribution wins and is locked.
--   - Commission is generated only from paid OneMil customer top-ups in a later step.
--   - Free MioCoins from partners/API/bonus/vouchers/admin credits/wins/codes are excluded.
--   - Rates are managed through history records and every future commission event stores
--     commission_rate_snapshot for immutable accounting.
--   - Payout/bank details are intentionally out of scope for this first foundation.
--
-- Note:
--   This migration intentionally avoids btree_gist/EXCLUDE constraints so it can
--   run on Supabase projects where btree_gist availability has not been confirmed.
--   Commission-rate overlap is guarded by a trigger plus transaction advisory lock.

-- -----------------------------------------------------------------------------
-- Affiliate partners
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  legal_name text,
  contact_email text,
  affiliate_type text NOT NULL DEFAULT 'other'
    CHECK (affiliate_type IN ('influencer', 'sales_partner', 'agency', 'individual', 'other')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'paused', 'terminated', 'rejected')),
  contract_starts_at timestamptz,
  contract_ends_at timestamptz,
  terms_accepted_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (contract_ends_at IS NULL OR contract_starts_at IS NULL OR contract_ends_at > contract_starts_at)
);

COMMENT ON TABLE public.affiliate_partners IS
  'Unified CZK affiliate partners. Can represent influencers, agencies, sales partners, individuals, or other referrers.';
COMMENT ON COLUMN public.affiliate_partners.auth_user_id IS
  'Optional login user for a future affiliate portal. Not required for admin-created partners.';
COMMENT ON COLUMN public.affiliate_partners.status IS
  'Only active partners should be eligible for future commission creation.';

-- -----------------------------------------------------------------------------
-- Human affiliate codes
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'retired')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  CHECK (code = upper(code)),
  CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$')
);

COMMENT ON TABLE public.affiliate_codes IS
  'Human-readable affiliate codes, e.g. NOVAK123. UUIDs should not be exposed as public affiliate codes.';

-- -----------------------------------------------------------------------------
-- Commission rate history
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_commission_rate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE CASCADE,
  commission_rate numeric(8, 6) NOT NULL DEFAULT 0.02
    CHECK (commission_rate >= 0 AND commission_rate <= 1),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to > valid_from)
);

COMMENT ON TABLE public.affiliate_commission_rate_history IS
  'Historical commission rates. Future commission events must snapshot the rate used at payment time.';
COMMENT ON COLUMN public.affiliate_commission_rate_history.commission_rate IS
  'Decimal rate, e.g. 0.02 = 2 %. Default business fallback is 2 % if no custom rate exists.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_rate_one_open_interval
  ON public.affiliate_commission_rate_history(affiliate_partner_id)
  WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_rate_partner_window
  ON public.affiliate_commission_rate_history(affiliate_partner_id, valid_from, valid_to);

-- -----------------------------------------------------------------------------
-- Customer lifetime attribution
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_affiliate_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  affiliate_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE RESTRICT,
  affiliate_code_id uuid REFERENCES public.affiliate_codes(id) ON DELETE SET NULL,
  source text NOT NULL
    CHECK (source IN ('direct_link', 'merchant_email', 'partner_register', 'manual_admin', 'import', 'other')),
  source_merchant_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  attributed_at timestamptz NOT NULL DEFAULT now(),
  locked boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id)
);

COMMENT ON TABLE public.user_affiliate_attributions IS
  'Locked first-touch lifetime attribution for CZK affiliate commissions. One user can have at most one commission owner.';
COMMENT ON COLUMN public.user_affiliate_attributions.locked IS
  'Future automation must not overwrite attribution when true. Manual admin changes require audit logging.';

-- -----------------------------------------------------------------------------
-- Merchant/company referrals
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchant_affiliate_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  affiliate_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE RESTRICT,
  affiliate_code_id uuid REFERENCES public.affiliate_codes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'approved', 'active', 'bonus_eligible', 'rejected', 'cancelled')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  activated_at timestamptz,
  bonus_eligible_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (merchant_partner_id)
);

COMMENT ON TABLE public.merchant_affiliate_referrals IS
  'Tracks which affiliate partner referred a B2B merchant/company partner. This does not by itself attribute merchant customers.';
COMMENT ON COLUMN public.merchant_affiliate_referrals.bonus_eligible_at IS
  'Set only after the merchant starts its reward system, e.g. first real MioCoin activation. Not for empty registrations.';

-- -----------------------------------------------------------------------------
-- Future immutable commission events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_commission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  payment_amount_snapshot numeric NOT NULL CHECK (payment_amount_snapshot > 0),
  payment_amount_source text NOT NULL DEFAULT 'payments.amount',
  commission_rate_snapshot numeric(8, 6) NOT NULL CHECK (commission_rate_snapshot >= 0 AND commission_rate_snapshot <= 1),
  commission_amount_czk numeric(12, 2) NOT NULL CHECK (commission_amount_czk >= 0),
  status text NOT NULL DEFAULT 'calculated'
    CHECK (status IN ('calculated', 'approved', 'paid', 'reversed', 'cancelled')),
  calculated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz,
  reversed_at timestamptz,
  reverse_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (payment_id)
);

COMMENT ON TABLE public.affiliate_commission_events IS
  'Future immutable commission ledger. Not populated by this migration. One paid top-up payment can create at most one affiliate commission event.';
COMMENT ON COLUMN public.affiliate_commission_events.commission_rate_snapshot IS
  'Rate used at the time of commission creation. Historical accounting must not depend on later rate changes.';

-- -----------------------------------------------------------------------------
-- Optional bonuses
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_bonus_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE RESTRICT,
  bonus_type text NOT NULL
    CHECK (bonus_type IN ('merchant_activation', 'paying_customer_campaign', 'manual_admin', 'other')),
  source_merchant_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  source_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount_czk numeric(12, 2) NOT NULL CHECK (amount_czk >= 0),
  status text NOT NULL DEFAULT 'calculated'
    CHECK (status IN ('calculated', 'approved', 'paid', 'reversed', 'cancelled')),
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.affiliate_bonus_events IS
  'Optional campaign/manual bonuses. Default business bonus is 0 CZK unless admin creates a bonus rule in a future step.';

-- -----------------------------------------------------------------------------
-- Monthly payout summaries without sensitive bank details
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_partner_id uuid NOT NULL REFERENCES public.affiliate_partners(id) ON DELETE RESTRICT,
  period_month date NOT NULL,
  commission_amount_czk numeric(12, 2) NOT NULL DEFAULT 0 CHECK (commission_amount_czk >= 0),
  bonus_amount_czk numeric(12, 2) NOT NULL DEFAULT 0 CHECK (bonus_amount_czk >= 0),
  total_amount_czk numeric(12, 2) GENERATED ALWAYS AS (commission_amount_czk + bonus_amount_czk) STORED,
  status text NOT NULL DEFAULT 'calculated'
    CHECK (status IN ('calculated', 'approved', 'paid', 'cancelled')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_month = date_trunc('month', period_month)::date),
  UNIQUE (affiliate_partner_id, period_month)
);

COMMENT ON TABLE public.affiliate_payouts IS
  'Monthly payout summaries only. Sensitive payout/bank details are intentionally excluded from the first version.';

-- -----------------------------------------------------------------------------
-- Dedicated audit log for affiliate admin operations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_table text NOT NULL,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.affiliate_audit_logs IS
  'Audit trail for future affiliate admin changes, especially attribution/rate/status changes.';

-- -----------------------------------------------------------------------------
-- Updated-at helper for affiliate foundation tables only
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_affiliate_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_affiliate_partners_updated_at ON public.affiliate_partners;
CREATE TRIGGER trg_affiliate_partners_updated_at
BEFORE UPDATE ON public.affiliate_partners
FOR EACH ROW
EXECUTE FUNCTION public.set_affiliate_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_affiliate_rate_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Serialize rate-history writes per affiliate partner without requiring btree_gist.
  PERFORM pg_advisory_xact_lock(hashtext(NEW.affiliate_partner_id::text));

  IF EXISTS (
    SELECT 1
    FROM public.affiliate_commission_rate_history existing
    WHERE existing.affiliate_partner_id = NEW.affiliate_partner_id
      AND existing.id <> NEW.id
      AND tstzrange(existing.valid_from, COALESCE(existing.valid_to, 'infinity'::timestamptz), '[)')
          && tstzrange(NEW.valid_from, COALESCE(NEW.valid_to, 'infinity'::timestamptz), '[)')
  ) THEN
    RAISE EXCEPTION 'Affiliate commission rate intervals must not overlap for partner %', NEW.affiliate_partner_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_affiliate_rate_overlap ON public.affiliate_commission_rate_history;
CREATE TRIGGER trg_prevent_affiliate_rate_overlap
BEFORE INSERT OR UPDATE ON public.affiliate_commission_rate_history
FOR EACH ROW
EXECUTE FUNCTION public.prevent_affiliate_rate_overlap();

DROP TRIGGER IF EXISTS trg_affiliate_payouts_updated_at ON public.affiliate_payouts;
CREATE TRIGGER trg_affiliate_payouts_updated_at
BEFORE UPDATE ON public.affiliate_payouts
FOR EACH ROW
EXECUTE FUNCTION public.set_affiliate_updated_at();

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_affiliate_partners_status
  ON public.affiliate_partners(status);

CREATE INDEX IF NOT EXISTS idx_affiliate_codes_partner
  ON public.affiliate_codes(affiliate_partner_id, status);

CREATE INDEX IF NOT EXISTS idx_user_affiliate_attributions_partner
  ON public.user_affiliate_attributions(affiliate_partner_id, attributed_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_affiliate_referrals_partner
  ON public.merchant_affiliate_referrals(affiliate_partner_id, registered_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_commission_events_partner_status
  ON public.affiliate_commission_events(affiliate_partner_id, status, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_bonus_events_partner_status
  ON public.affiliate_bonus_events(affiliate_partner_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_partner_period
  ON public.affiliate_payouts(affiliate_partner_id, period_month DESC);

-- -----------------------------------------------------------------------------
-- RLS: read-only admin skeleton
-- No client-side INSERT/UPDATE/DELETE policies are added in this first step.
-- Future writes should go through reviewed admin RPCs with audit logging.
-- -----------------------------------------------------------------------------
ALTER TABLE public.affiliate_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_affiliate_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_affiliate_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_bonus_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read affiliate partners"
  ON public.affiliate_partners FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin read affiliate codes"
  ON public.affiliate_codes FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin read affiliate commission rate history"
  ON public.affiliate_commission_rate_history FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin read user affiliate attributions"
  ON public.user_affiliate_attributions FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin read merchant affiliate referrals"
  ON public.merchant_affiliate_referrals FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin read affiliate commission events"
  ON public.affiliate_commission_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin read affiliate bonus events"
  ON public.affiliate_bonus_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin read affiliate payouts"
  ON public.affiliate_payouts FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admin read affiliate audit logs"
  ON public.affiliate_audit_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

GRANT SELECT ON
  public.affiliate_partners,
  public.affiliate_codes,
  public.affiliate_commission_rate_history,
  public.user_affiliate_attributions,
  public.merchant_affiliate_referrals,
  public.affiliate_commission_events,
  public.affiliate_bonus_events,
  public.affiliate_payouts,
  public.affiliate_audit_logs
TO authenticated;

-- -----------------------------------------------------------------------------
-- Read-only admin views for a future admin UI skeleton
-- security_invoker preserves underlying RLS in Postgres 15+.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_admin_affiliate_partners
WITH (security_invoker = true)
AS
SELECT
  ap.id,
  ap.display_name,
  ap.legal_name,
  ap.contact_email,
  ap.affiliate_type,
  ap.status,
  ac.code AS primary_code,
  rate.commission_rate AS current_commission_rate,
  COALESCE(user_stats.attributed_users_count, 0) AS attributed_users_count,
  COALESCE(merchant_stats.referred_merchants_count, 0) AS referred_merchants_count,
  COALESCE(commission_stats.commissions_total_czk, 0) AS commissions_total_czk,
  COALESCE(bonus_stats.bonuses_total_czk, 0) AS bonuses_total_czk,
  ap.created_at,
  ap.updated_at
FROM public.affiliate_partners ap
LEFT JOIN LATERAL (
  SELECT code
  FROM public.affiliate_codes c
  WHERE c.affiliate_partner_id = ap.id
    AND c.status = 'active'
  ORDER BY c.created_at ASC
  LIMIT 1
) ac ON true
LEFT JOIN LATERAL (
  SELECT commission_rate
  FROM public.affiliate_commission_rate_history r
  WHERE r.affiliate_partner_id = ap.id
    AND r.valid_from <= now()
    AND (r.valid_to IS NULL OR r.valid_to > now())
  ORDER BY r.valid_from DESC
  LIMIT 1
) rate ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS attributed_users_count
  FROM public.user_affiliate_attributions uaa
  WHERE uaa.affiliate_partner_id = ap.id
) user_stats ON true
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS referred_merchants_count
  FROM public.merchant_affiliate_referrals mar
  WHERE mar.affiliate_partner_id = ap.id
) merchant_stats ON true
LEFT JOIN LATERAL (
  SELECT SUM(commission_amount_czk) AS commissions_total_czk
  FROM public.affiliate_commission_events ace
  WHERE ace.affiliate_partner_id = ap.id
    AND ace.status IN ('calculated', 'approved', 'paid')
) commission_stats ON true
LEFT JOIN LATERAL (
  SELECT SUM(amount_czk) AS bonuses_total_czk
  FROM public.affiliate_bonus_events abe
  WHERE abe.affiliate_partner_id = ap.id
    AND abe.status IN ('calculated', 'approved', 'paid')
) bonus_stats ON true;

CREATE OR REPLACE VIEW public.v_admin_affiliate_payout_summary
WITH (security_invoker = true)
AS
SELECT
  ap.id AS affiliate_partner_id,
  ap.display_name,
  ap.status AS affiliate_status,
  p.period_month,
  p.commission_amount_czk,
  p.bonus_amount_czk,
  p.total_amount_czk,
  p.status AS payout_status,
  p.approved_at,
  p.paid_at,
  p.updated_at
FROM public.affiliate_payouts p
JOIN public.affiliate_partners ap
  ON ap.id = p.affiliate_partner_id;

GRANT SELECT ON
  public.v_admin_affiliate_partners,
  public.v_admin_affiliate_payout_summary
TO authenticated;
