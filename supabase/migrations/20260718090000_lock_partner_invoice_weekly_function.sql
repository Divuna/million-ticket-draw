-- Security hardening for PR #240.
-- The weekly invoice creation function is an internal financial operation and
-- must not be callable by anonymous or normal authenticated users.

REVOKE ALL ON FUNCTION public.create_partner_invoices_for_last_week()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_partner_invoices_for_last_week()
TO service_role;
