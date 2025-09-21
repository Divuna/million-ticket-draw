-- Fix notifications table to include title field needed for Sofinity events
ALTER TABLE public.notifications 
ADD COLUMN IF NOT EXISTS title TEXT;

-- Update trigger function to handle the title field properly
CREATE OR REPLACE FUNCTION public.trigger_notification_sent()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM notify_sofinity_event(
    'notification_sent',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'notification_id', NEW.id,
      'type', NEW.type,
      'title', NEW.title,
      'message', NEW.message,
      'sent_at', NEW.created_at
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comprehensive RLS policies for admin access
-- Users table - allow admin/superadmin full access
CREATE POLICY "Allow admin full access to users" 
ON public.users 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

-- Contests table - allow admin CRUD operations
CREATE POLICY "Allow admin full access to contests" 
ON public.contests 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

-- Bonus prizes - extend existing admin policy
DROP POLICY IF EXISTS "Admins can manage bonus prizes" ON public.bonus_prizes;
CREATE POLICY "Allow admin full access to bonus prizes" 
ON public.bonus_prizes 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

-- Vouchers table - allow admin access
CREATE POLICY "Allow admin full access to vouchers" 
ON public.vouchers 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

-- Tickets table - allow admin to view all
CREATE POLICY "Allow admin to view all tickets" 
ON public.tickets 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

-- Wallets table - allow admin access
CREATE POLICY "Allow admin full access to wallets" 
ON public.wallets 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

-- Audit logs - allow admin to view all
CREATE POLICY "Allow admin to view all audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.users u 
    WHERE u.id = auth.uid() 
    AND u.role IN ('admin', 'superadmin')
  )
);

-- Function to log admin actions
CREATE OR REPLACE FUNCTION public.log_admin_action(
  action_name TEXT,
  entity_type TEXT,
  entity_id UUID DEFAULT NULL,
  old_data JSONB DEFAULT NULL,
  new_data JSONB DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.audit_logs (event, user_id, metadata, created_at)
  VALUES (
    action_name,
    auth.uid(),
    jsonb_build_object(
      'entity_type', entity_type,
      'entity_id', entity_id,
      'old_data', old_data,
      'new_data', new_data,
      'admin_action', true
    ),
    NOW()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;