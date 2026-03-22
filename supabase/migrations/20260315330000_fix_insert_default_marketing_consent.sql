-- Fix BUG-3: insert_default_marketing_consent references wrong column names
--
-- PROBLEM: The function tried to INSERT (user_id, accepted, created_at) but the
-- user_legal_acceptances table has (id, user_id, document_slug, document_version,
-- accepted_at). The columns 'accepted' and 'created_at' do not exist.
-- This caused every new user registration to fail with:
--   "column 'accepted' of relation 'user_legal_acceptances' does not exist"
--
-- FIX: Use the correct column names matching the actual table schema.
--      document_slug='marketing' / document_version='1.0' matches existing rows.
--      Added EXCEPTION handler so marketing consent failures never block registration.

CREATE OR REPLACE FUNCTION public.insert_default_marketing_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_legal_acceptances (user_id, document_slug, document_version)
  VALUES (NEW.id, 'marketing', '1.0');

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Marketing consent failure must never block user registration.
  RAISE LOG 'insert_default_marketing_consent error for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
