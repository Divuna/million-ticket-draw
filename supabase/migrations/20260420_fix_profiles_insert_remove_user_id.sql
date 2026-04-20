-- Fix: handle_new_auth_user inserts user_id into public.profiles, but that column
-- does not exist in the table. The INSERT fails with ERROR 42703, is swallowed by
-- the EXCEPTION block, and every new registration silently gets no profiles row.
--
-- Root cause: migration 20260320140000_auth_registration_never_fail.sql added
-- user_id to the profiles INSERT without adding the column to the table DDL.
-- The correct INSERT (matching 20260315310000_fix_handle_new_auth_user.sql) uses
-- only (id, full_name, date_of_birth, avatar_url).
--
-- Fix: replace only the profiles INSERT block — remove user_id column and value.
-- All other blocks (public.users, public.wallets, EXCEPTION hardening) unchanged.
-- Trigger on_auth_user_created is NOT recreated — it is already correct.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_name  text;
BEGIN
  v_email := COALESCE(NEW.email::text, '');
  v_name := NULLIF(
    trim(
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        ''
      )
    ),
    ''
  );

  BEGIN
    INSERT INTO public.users (id, email, name, role)
    VALUES (NEW.id, v_email, v_name, 'user')
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'handle_new_auth_user: public.users insert failed user_id=%: % %',
        NEW.id, SQLSTATE, SQLERRM;
  END;

  BEGIN
    INSERT INTO public.profiles (
      id,
      full_name,
      date_of_birth,
      avatar_url
    )
    VALUES (
      NEW.id,
      COALESCE(v_name, ''),
      NULL,
      NULL
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'handle_new_auth_user: public.profiles insert failed user_id=%: % %',
        NEW.id, SQLSTATE, SQLERRM;
  END;

  BEGIN
    INSERT INTO public.wallets (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'handle_new_auth_user: public.wallets insert failed user_id=%: % %',
        NEW.id, SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Backfill: create missing profiles rows for accounts already in auth.users
-- that never got one due to the broken INSERT above.
-- Uses ON CONFLICT (id) DO NOTHING so existing rows are never overwritten.
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id, full_name, date_of_birth, avatar_url)
SELECT
  au.id,
  COALESCE(NULLIF(trim(COALESCE(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '')), ''), ''),
  NULL,
  NULL
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = au.id
)
ON CONFLICT (id) DO NOTHING;
