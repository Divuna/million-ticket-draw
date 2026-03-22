-- Fix handle_new_auth_user: ensure public.users row exists before creating wallet
-- REAL BUG: The trigger tried to INSERT INTO wallets (wallets.user_id → public.users.id FK)
-- but public.users was never populated by this trigger. New user registration was failing
-- with: "insert or update on table wallets violates foreign key constraint wallets_user_id_fkey"
--
-- Fix: INSERT INTO public.users (id, email) first, then wallets will pass FK check.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ensure public.users row exists (FK prerequisite for wallets)
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;

  -- Create profile
  INSERT INTO public.profiles (
    id,
    full_name,
    date_of_birth,
    avatar_url
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULL,
    NULL
  )
  ON CONFLICT (id) DO NOTHING;

  -- Create wallet (now safe: public.users row guaranteed above)
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;
