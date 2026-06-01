-- =============================================================================
-- Profile save RLS fix — INSERT policy on public.profiles
--
-- Profile save (src/pages/Profile.tsx → handleProfileSave) uses
-- supabase.from('profiles').upsert(...), which compiles to
-- INSERT ... ON CONFLICT (id) DO UPDATE. Under RLS, Postgres evaluates the
-- INSERT WITH CHECK arm first — so even when the row already exists and only
-- the UPDATE path runs, a missing INSERT policy makes the whole statement fail
-- with 42501 "new row violates row-level security policy".
--
-- This policy lets a logged-in user insert/upsert only their own profile row
-- (id = auth.uid()), mirroring the existing profiles_update_own self-scope.
--
-- Idempotent: DROP POLICY IF EXISTS before CREATE so re-running is safe.
-- =============================================================================

DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;

CREATE POLICY profiles_insert_own
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
