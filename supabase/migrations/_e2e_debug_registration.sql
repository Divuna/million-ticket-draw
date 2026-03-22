-- Debug: simulate the exact INSERT that handle_new_auth_user performs
-- and capture the exact error from public.users triggers
DO $$
DECLARE
  test_id uuid := gen_random_uuid();
  test_email text := 'debug_reg@test.onemil';
BEGIN
  -- Step 1: Insert into auth.users (required for FK public.users.id -> auth.users.id)
  INSERT INTO auth.users (id, email, is_sso_user, is_anonymous)
  VALUES (test_id, test_email, false, false)
  ON CONFLICT (id) DO NOTHING;

  -- Step 2: Try INSERT into public.users (fires after_user_created_forward trigger)
  BEGIN
    INSERT INTO public.users (id, email)
    VALUES (test_id, test_email)
    ON CONFLICT (id) DO NOTHING;
    RAISE NOTICE 'public.users INSERT: SUCCESS';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'public.users INSERT FAILED: sqlstate=% msg=%', SQLSTATE, SQLERRM;
  END;

  -- Step 3: Try INSERT into public.wallets (fires after public.users exists)
  BEGIN
    INSERT INTO public.wallets (user_id)
    VALUES (test_id)
    ON CONFLICT (user_id) DO NOTHING;
    RAISE NOTICE 'public.wallets INSERT: SUCCESS';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'public.wallets INSERT FAILED: sqlstate=% msg=%', SQLSTATE, SQLERRM;
  END;

  -- Cleanup
  DELETE FROM public.wallets WHERE user_id = test_id;
  DELETE FROM public.users   WHERE id = test_id;
  DELETE FROM auth.users     WHERE id = test_id;

  RAISE NOTICE 'Debug complete - test data cleaned up';
END;
$$;
