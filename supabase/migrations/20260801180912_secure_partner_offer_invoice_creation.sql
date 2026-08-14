REVOKE ALL ON FUNCTION public.create_partner_offer_invoices_for_period(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_partner_offer_invoices_for_period(date, date) FROM anon;
REVOKE ALL ON FUNCTION public.create_partner_offer_invoices_for_period(date, date) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_offer_invoices_for_period(date, date) TO service_role;
