-- Fix RLS: user_contest_favorites
-- Allow authenticated users SELECT, INSERT, DELETE where user_id = auth.uid()

CREATE POLICY "user_contest_favorites_select_own"
  ON public.user_contest_favorites
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_contest_favorites_insert_own"
  ON public.user_contest_favorites
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_contest_favorites_delete_own"
  ON public.user_contest_favorites
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Fix RLS: user_vouchers
-- Allow authenticated users INSERT and DELETE where user_id = auth.uid()

CREATE POLICY "user_vouchers_insert_own"
  ON public.user_vouchers
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_vouchers_delete_own"
  ON public.user_vouchers
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
