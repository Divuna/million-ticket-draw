-- Fix search path warnings for the new test functions
ALTER FUNCTION public.run_complete_admin_test_suite() SET search_path = public;
ALTER FUNCTION public.test_admin_crud_operations() SET search_path = public;
ALTER FUNCTION public.test_admin_security_rls() SET search_path = public;
ALTER FUNCTION public.test_audit_logging() SET search_path = public;
ALTER FUNCTION public.test_sofinity_integration() SET search_path = public;