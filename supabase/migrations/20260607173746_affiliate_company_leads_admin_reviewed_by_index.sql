CREATE INDEX IF NOT EXISTS idx_affiliate_company_leads_admin_reviewed_by
  ON public.affiliate_company_leads(admin_reviewed_by)
  WHERE admin_reviewed_by IS NOT NULL;
