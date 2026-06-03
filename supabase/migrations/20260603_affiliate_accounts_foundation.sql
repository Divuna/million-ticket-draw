-- ============================================================================
-- OneMil Affiliate program — standalone DB foundation (first safe step)
-- ============================================================================
-- Creates a SEPARATE affiliate model, fully isolated from:
--   - customer accounts
--   - Partner portal (partners table B2B billing)
--   - payments / tickets / contests / wallet / buy_ticket_atomic
--
-- This migration is ADDITIVE ONLY:
--   - 4 new tables (affiliate_*)
--   - 1 nullable FK column on partners (referred_by_affiliate_id)
-- No existing table data is modified. No existing object is dropped.
--
-- Business rules encoded here:
--   - One affiliate account per auth user (UNIQUE auth_user_id)
--   - One shared ref_code per affiliate (UNIQUE), used for both customers & companies
--   - modes[] = {'influencer'} | {'sales_rep'} | both
--   - First-touch attribution enforced by DB:
--       * customer  -> affiliate_customer_refs.user_id    UNIQUE
--       * company   -> affiliate_company_refs.partner_id  UNIQUE
--   - Commission base is always ex-VAT (amount_base_czk)
--   - Default commission rate: customer = 5 %, company = 5 %
--   - VAT payer adds VAT on top; non-payer gets net only (amount_total_czk)
--   - Company commission is lifetime (no end), wired in a later step
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) affiliate_accounts — the standalone affiliate identity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_accounts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id              uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name                      text NOT NULL,
  email                     text NOT NULL,
  phone                     text,
  ref_code                  text NOT NULL UNIQUE,
  modes                     text[] NOT NULL DEFAULT '{influencer}',
  status                    text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','approved','suspended','rejected')),
  commission_rate_customer  numeric(5,2) NOT NULL DEFAULT 5.00,
  commission_rate_company   numeric(5,2) NOT NULL DEFAULT 5.00,
  is_vat_payer              boolean NOT NULL DEFAULT false,
  vat_id                    text,
  payout_account            text,
  payout_bank               text,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  approved_at               timestamptz,
  rejected_at               timestamptz,
  CONSTRAINT affiliate_accounts_modes_valid
    CHECK (modes <@ ARRAY['influencer','sales_rep']::text[] AND array_length(modes, 1) >= 1)
);

-- ---------------------------------------------------------------------------
-- 2) affiliate_customer_refs — first-touch customer attribution (permanent)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_customer_refs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL UNIQUE,            -- UNIQUE = first source wins forever
  source        text,                            -- 'direct_link' | 'qr_code' | 'social' | ...
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_customer_refs_affiliate
  ON public.affiliate_customer_refs(affiliate_id);

-- ---------------------------------------------------------------------------
-- 3) affiliate_company_refs — referred company attribution (lifetime)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_company_refs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  partner_id    uuid NOT NULL UNIQUE REFERENCES public.partners(id) ON DELETE CASCADE,
  source        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_affiliate_company_refs_affiliate
  ON public.affiliate_company_refs(affiliate_id);

-- ---------------------------------------------------------------------------
-- 4) affiliate_commissions — unified payouts (customer + company planes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.affiliate_commissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id       uuid NOT NULL REFERENCES public.affiliate_accounts(id) ON DELETE CASCADE,
  commission_type    text NOT NULL CHECK (commission_type IN ('customer_payments','company_invoice')),
  customer_ref_id    uuid REFERENCES public.affiliate_customer_refs(id) ON DELETE SET NULL,
  company_ref_id     uuid REFERENCES public.affiliate_company_refs(id) ON DELETE SET NULL,
  source_invoice_id  uuid REFERENCES public.partner_invoices(id) ON DELETE SET NULL,
  period_month       date,
  amount_base_czk    numeric(12,2) NOT NULL,     -- ex-VAT base
  vat_rate           numeric(5,2) NOT NULL DEFAULT 0,
  amount_total_czk   numeric(12,2) NOT NULL,     -- base + VAT (if payer) else = base
  status             text NOT NULL DEFAULT 'calculated'
                     CHECK (status IN ('calculated','approved','paid')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  paid_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_affiliate
  ON public.affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status
  ON public.affiliate_commissions(status);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_period
  ON public.affiliate_commissions(period_month);

-- ---------------------------------------------------------------------------
-- 5) partners.referred_by_affiliate_id — nullable link (who brought the company)
--    Invisible to the company. Set later by admin / RPC. No data change here.
-- ---------------------------------------------------------------------------
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS referred_by_affiliate_id uuid
  REFERENCES public.affiliate_accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_partners_referred_by_affiliate
  ON public.partners(referred_by_affiliate_id);

-- ============================================================================
-- RLS — affiliate sees only own data; admin sees all; writes locked down
-- ============================================================================
ALTER TABLE public.affiliate_accounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_customer_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_company_refs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliate_commissions   ENABLE ROW LEVEL SECURITY;

-- ----- affiliate_accounts ----------------------------------------------------
DROP POLICY IF EXISTS aff_accounts_select ON public.affiliate_accounts;
CREATE POLICY aff_accounts_select ON public.affiliate_accounts
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_admin());

-- Writes (INSERT/UPDATE/DELETE) admin-only for now.
-- Self-service registration / profile edit will be added later via SECURITY DEFINER RPC.
DROP POLICY IF EXISTS aff_accounts_admin_write ON public.affiliate_accounts;
CREATE POLICY aff_accounts_admin_write ON public.affiliate_accounts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----- affiliate_customer_refs ----------------------------------------------
DROP POLICY IF EXISTS aff_customer_refs_select ON public.affiliate_customer_refs;
CREATE POLICY aff_customer_refs_select ON public.affiliate_customer_refs
  FOR SELECT TO authenticated
  USING (
    affiliate_id IN (SELECT id FROM public.affiliate_accounts WHERE auth_user_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS aff_customer_refs_admin_write ON public.affiliate_customer_refs;
CREATE POLICY aff_customer_refs_admin_write ON public.affiliate_customer_refs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----- affiliate_company_refs -----------------------------------------------
DROP POLICY IF EXISTS aff_company_refs_select ON public.affiliate_company_refs;
CREATE POLICY aff_company_refs_select ON public.affiliate_company_refs
  FOR SELECT TO authenticated
  USING (
    affiliate_id IN (SELECT id FROM public.affiliate_accounts WHERE auth_user_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS aff_company_refs_admin_write ON public.affiliate_company_refs;
CREATE POLICY aff_company_refs_admin_write ON public.affiliate_company_refs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----- affiliate_commissions ------------------------------------------------
DROP POLICY IF EXISTS aff_commissions_select ON public.affiliate_commissions;
CREATE POLICY aff_commissions_select ON public.affiliate_commissions
  FOR SELECT TO authenticated
  USING (
    affiliate_id IN (SELECT id FROM public.affiliate_accounts WHERE auth_user_id = auth.uid())
    OR public.is_admin()
  );

-- Commission writes: admin only (DB functions run as SECURITY DEFINER / admin context).
DROP POLICY IF EXISTS aff_commissions_admin_write ON public.affiliate_commissions;
CREATE POLICY aff_commissions_admin_write ON public.affiliate_commissions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================================
-- updated_at touch triggers (reuse if a shared function already exists)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.affiliate_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_affiliate_accounts_touch ON public.affiliate_accounts;
CREATE TRIGGER trg_affiliate_accounts_touch
  BEFORE UPDATE ON public.affiliate_accounts
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_touch_updated_at();

DROP TRIGGER IF EXISTS trg_affiliate_commissions_touch ON public.affiliate_commissions;
CREATE TRIGGER trg_affiliate_commissions_touch
  BEFORE UPDATE ON public.affiliate_commissions
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_touch_updated_at();
