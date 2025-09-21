-- Remove the problematic recursive RLS policy that causes infinite recursion
DROP POLICY IF EXISTS "Allow admin full access to users" ON public.users;

-- Create a security definer function to safely check admin roles
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE SET search_path = public;

-- Create a new safe admin policy for users table that doesn't cause recursion
CREATE POLICY "Safe admin access to users" ON public.users
FOR ALL USING (public.get_current_user_role() IN ('admin', 'superadmin'));