-- Harden auth.users trigger functions so admin/user registration never fails with
-- "Database error creating new user". Inserts into public.users / profiles / wallets
-- and user_roles are best-effort: failures are logged, trigger always RETURNS NEW.
--
-- Also ensures on_auth_user_created exists (was referenced in cleanup docs but not
-- defined in earlier migrations).

-- ---------------------------------------------------------------------------
-- 1) Bootstrap public.users + profile + wallet (profiles / wallets FK to public.users)
-- ---------------------------------------------------------------------------
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

  -- public.users: include role + name so NOT NULL / legacy checks never break signup
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
      user_id,
      full_name,
      date_of_birth,
      avatar_url
    )
    VALUES (
      NEW.id,
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
-- 2) Default app role row — must not abort auth.users insert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'handle_new_user_role: insert failed user_id=%: % %',
        NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Marketing consent row — keep correct columns; never block signup
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.insert_default_marketing_consent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  BEGIN
    INSERT INTO public.user_legal_acceptances (user_id, document_slug, document_version)
    VALUES (NEW.id, 'marketing', '1.0');
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'insert_default_marketing_consent error for user %: % %',
        NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Ensure primary signup trigger on auth.users (idempotent)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();
