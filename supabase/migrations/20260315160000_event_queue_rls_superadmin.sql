-- Optional: allow superadmin to SELECT from event_queue (policy currently only allows role = 'admin').
-- Run manually in Supabase SQL Editor if you use superadmin and want them to see Admin Event Queue.
-- Do not run via CLI unless intended.

DROP POLICY IF EXISTS "Admins can view event queue" ON public.event_queue;

CREATE POLICY "Admins can view event queue"
ON public.event_queue FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'superadmin')
  )
);
