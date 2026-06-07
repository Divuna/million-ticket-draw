-- ============================================================================
-- OneMil B2B company leads - Phase 1 DB foundation
-- ============================================================================
-- Creates the pre-attribution workflow table for companies added by approved
-- sales reps / agencies from /affiliate/dashboard.
--
-- Additive only:
--   - new table: public.affiliate_company_leads
--   - indexes and RLS policies for read visibility
--
-- Not included in this phase:
--   - Edge Functions / RPC for lead creation or company confirmation
--   - public table access
--   - UI, emails, admin approval flow, password setup
--   - commission logic, partner registration logic, ticket/wallet logic
--   - changes to affiliate_company_refs or partners attribution
--
-- Final attribution remains in:
--   - public.affiliate_company_refs
--   - public.partners.referred_by_affiliate_id
--
-- Production application requires explicit approval and postcheck.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.affiliate_company_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  affiliate_id uuid
    REFERENCES public.affiliate_accounts(id) ON DELETE SET NULL,

  sales_rep_affiliate_id_snapshot uuid,
  sales_rep_ref_code_snapshot text,
  sales_rep_email_snapshot text,
  sales_rep_name_snapshot text,

  partner_id uuid
    REFERENCES public.partners(id) ON DELETE SET NULL,

  company_name text NOT NULL,
  ico text,
  dic text,
  company_email text NOT NULL,
  website text,
  contact_person text,
  contact_phone text,
  sales_rep_note text,

  status text NOT NULL DEFAULT 'sent_to_company'
    CHECK (
      status IN (
        'sent_to_company',
        'company_confirmed',
        'company_rejected',
        'pending_admin_approval',
        'approved',
        'admin_rejected',
        'expired'
      )
    ),

  company_confirmation_token_hash text,
  company_confirmation_sent_at timestamptz,
  company_confirmation_expires_at timestamptz,
  company_confirmation_used_at timestamptz,
  company_confirmed_at timestamptz,
  company_rejected_at timestamptz,
  company_rejection_reason text,

  submitted_to_admin_at timestamptz,

  admin_reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_reviewed_at timestamptz,
  admin_rejection_reason text,
  approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT affiliate_company_leads_company_name_not_blank
    CHECK (length(btrim(company_name)) > 0),
  CONSTRAINT affiliate_company_leads_company_email_not_blank
    CHECK (length(btrim(company_email)) > 0),
  CONSTRAINT affiliate_company_leads_company_email_format
    CHECK (company_email ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
);

CREATE INDEX IF NOT EXISTS idx_affiliate_company_leads_affiliate_id
  ON public.affiliate_company_leads(affiliate_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_company_leads_partner_id
  ON public.affiliate_company_leads(partner_id)
  WHERE partner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_affiliate_company_leads_status
  ON public.affiliate_company_leads(status);

CREATE INDEX IF NOT EXISTS idx_affiliate_company_leads_created_at
  ON public.affiliate_company_leads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_affiliate_company_leads_company_email
  ON public.affiliate_company_leads(lower(btrim(company_email)));

CREATE INDEX IF NOT EXISTS idx_affiliate_company_leads_ico
  ON public.affiliate_company_leads(lower(btrim(ico)))
  WHERE ico IS NOT NULL AND length(btrim(ico)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_company_leads_active_company_email
  ON public.affiliate_company_leads(lower(btrim(company_email)))
  WHERE status IN ('sent_to_company', 'company_confirmed', 'pending_admin_approval');

CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_company_leads_active_ico
  ON public.affiliate_company_leads(lower(btrim(ico)))
  WHERE ico IS NOT NULL
    AND length(btrim(ico)) > 0
    AND status IN ('sent_to_company', 'company_confirmed', 'pending_admin_approval');

CREATE UNIQUE INDEX IF NOT EXISTS uq_affiliate_company_leads_token_hash
  ON public.affiliate_company_leads(company_confirmation_token_hash)
  WHERE company_confirmation_token_hash IS NOT NULL;

ALTER TABLE public.affiliate_company_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.affiliate_company_leads FROM anon;
GRANT SELECT ON TABLE public.affiliate_company_leads TO authenticated;

DROP POLICY IF EXISTS affiliate_company_leads_sales_rep_select
  ON public.affiliate_company_leads;

CREATE POLICY affiliate_company_leads_sales_rep_select
  ON public.affiliate_company_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.affiliate_accounts
      WHERE affiliate_accounts.id = affiliate_company_leads.affiliate_id
        AND affiliate_accounts.auth_user_id = auth.uid()
        AND affiliate_accounts.status = 'approved'
        AND 'sales_rep' = ANY(affiliate_accounts.modes)
    )
  );

DROP POLICY IF EXISTS affiliate_company_leads_admin_select
  ON public.affiliate_company_leads;

CREATE POLICY affiliate_company_leads_admin_select
  ON public.affiliate_company_leads
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role = ANY (ARRAY['admin'::public.app_role, 'superadmin'::public.app_role])
    )
  );

DROP TRIGGER IF EXISTS trg_affiliate_company_leads_touch
  ON public.affiliate_company_leads;

CREATE TRIGGER trg_affiliate_company_leads_touch
  BEFORE UPDATE ON public.affiliate_company_leads
  FOR EACH ROW EXECUTE FUNCTION public.affiliate_touch_updated_at();

COMMENT ON TABLE public.affiliate_company_leads IS
  'Pre-attribution workflow layer for B2B company leads created by approved sales reps / agencies.';

COMMENT ON COLUMN public.affiliate_company_leads.affiliate_id IS
  'Nullable link to current affiliate account. Uses ON DELETE SET NULL; snapshots preserve readable history.';

COMMENT ON COLUMN public.affiliate_company_leads.status IS
  'Lead workflow status. Final attribution is created later in affiliate_company_refs with source company_lead after admin approval.';
