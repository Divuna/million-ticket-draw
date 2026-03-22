# Admin access fix – divispavel2@gmail.com ("Přístup odepřen")

## 1. Where the application reads the user role

- **Frontend (admin guard):** `useUserRole` in `src/hooks/useUserRole.ts` reads **only from the `user_roles` table**:
  - Query: `supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()`
  - If no row or error → `role` is set to `'user'` → `isAdmin = false`
- **AdminDashboard** shows "Přístup odepřen" when `!isAdmin` (line 624).
- **RLS and backend:** Many policies and `get_current_user_role()` use **`public.users.role`**, not `user_roles`. So for full admin access (UI + RLS + edge functions that check `users.role`), both must be set.

**Summary:** The app uses **`user_roles`** as the source of truth for the admin panel UI. The **`users.role`** column is used by RLS and some edge functions. Neither JWT metadata nor the `profiles` table is used for the admin check.

---

## 2. Why the admin guard blocks access

- For `divispavel2@gmail.com`, the guard blocks because **`useUserRole`** gets `role` from **`user_roles`**.
- So either:
  - There is **no row** in `user_roles` for this user’s `user_id`, or  
  - The row exists but **`role`** is not `'admin'` or `'superadmin'`.
- In both cases the hook ends up with `role = 'user'` and `isAdmin = false`, so AdminDashboard renders "Přístup odepřen".

---

## 3. Verify the user and role (run in Supabase SQL Editor)

Use this to confirm the user exists and what role they have today:

```sql
-- 1) Resolve user id and current role from public.users (id = auth id)
SELECT u.id AS user_id, u.email, u.role AS users_role
FROM public.users u
WHERE u.email = 'divispavel2@gmail.com';

-- 2) Current role in user_roles (this is what the app uses for admin panel)
SELECT ur.user_id, ur.role AS user_roles_role
FROM public.user_roles ur
WHERE ur.user_id = (SELECT id FROM public.users WHERE email = 'divispavel2@gmail.com' LIMIT 1);
```

- If (1) returns no row, the user is not in `public.users` (e.g. not yet synced from Auth).
- If (2) returns no row or `role` is not `admin`/`superadmin`, that is why the admin panel shows "Přístup odepřen".

---

## 4. Exact SQL to grant admin access (do not run automatically)

Run the following in the **Supabase SQL Editor** when you are ready. It updates both **`users.role`** and **`user_roles`** so the UI and RLS/backend agree.

```sql
-- Grant admin access to divispavel2@gmail.com
-- (Run in Supabase SQL Editor. Do not run via CLI.)

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Resolve user id from public.users (must exist; id = auth.users.id)
  SELECT id INTO v_user_id
  FROM public.users
  WHERE email = 'divispavel2@gmail.com'
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found: no row in public.users with email divispavel2@gmail.com. Ensure the user has signed up and public.users is populated (e.g. via trigger on auth.users).';
  END IF;

  -- 1) Set users.role (for RLS and get_current_user_role())
  UPDATE public.users
  SET role = 'admin'
  WHERE id = v_user_id;

  -- 2) Insert or update user_roles (for useUserRole / admin panel UI)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'admin'::app_role)
  ON CONFLICT (user_id) DO UPDATE SET role = 'admin'::app_role;
END $$;
```

If your `user_roles` table does **not** have a unique constraint on `user_id`, the `ON CONFLICT` will cause an error. Use this variant instead:

```sql
-- Variant if user_roles has no UNIQUE(user_id): run each statement separately.

-- 1) Resolve user id
-- (Check result: must return one row with user_id)
SELECT id AS user_id FROM public.users WHERE email = 'divispavel2@gmail.com' LIMIT 1;

-- 2) Update users.role (replace <USER_ID> with the id from step 1)
-- UPDATE public.users SET role = 'admin' WHERE id = '<USER_ID>';

-- 3a) If user_roles row exists: update it
-- UPDATE public.user_roles SET role = 'admin' WHERE user_id = '<USER_ID>';

-- 3b) If no row exists: insert (run only if 3a updated 0 rows)
-- INSERT INTO public.user_roles (user_id, role) VALUES ('<USER_ID>', 'admin');
```

---

## 5. After running the SQL

- User **divispavel2@gmail.com** should have:
  - **`public.users.role`** = `'admin'`
  - **`public.user_roles`** one row with that `user_id` and **`role`** = `'admin'`
- They may need to **refresh the page** or **log out and log in** so the frontend refetches `user_roles` and `isAdmin` becomes true.
- To grant **superadmin** instead of **admin**, replace `'admin'` with `'superadmin'` in the SQL above (in both `users.role` and `user_roles.role`).
