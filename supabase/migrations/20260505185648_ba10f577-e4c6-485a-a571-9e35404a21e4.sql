CREATE POLICY "contests_admin_update"
ON public.contests
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superadmin'::app_role));