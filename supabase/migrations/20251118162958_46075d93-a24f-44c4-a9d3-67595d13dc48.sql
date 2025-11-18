-- ============================================================================
-- OneMil → Sofinity Messaging Pipeline Fix
-- ============================================================================

-- 1. DROP existing problematic policies on messages table
DROP POLICY IF EXISTS "Users can insert own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view own messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Admins can update messages" ON public.messages;

-- 2. CREATE proper RLS policies for messages table
-- Users can insert their own messages (user → admin)
CREATE POLICY "Users can send messages to admin"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id 
  AND sender = 'user'
);

-- Users can view their own messages
CREATE POLICY "Users can view their own messages"
ON public.messages
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admins can view all messages
CREATE POLICY "Admins can view all messages"
ON public.messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'superadmin')
  )
);

-- Admins can send messages (admin → user)
CREATE POLICY "Admins can send messages to users"
ON public.messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'superadmin')
  )
);

-- Admins can update messages (mark as read, etc.)
CREATE POLICY "Admins can update all messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'superadmin')
  )
);

-- Users can update their own messages (mark as read)
CREATE POLICY "Users can update own messages"
ON public.messages
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- 3. CREATE trigger function to forward user messages to Sofinity
CREATE OR REPLACE FUNCTION public.forward_user_message_to_sofinity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_email text;
  v_user_name text;
BEGIN
  -- Only forward messages from users to admin (not admin replies)
  IF NEW.sender = 'user' THEN
    -- Get user details
    SELECT email, name INTO v_user_email, v_user_name
    FROM public.users
    WHERE id = NEW.user_id;

    -- Send event to Sofinity via notify_sofinity_event
    PERFORM notify_sofinity_event(
      'customer_message_sent',
      NEW.user_id,
      NULL,
      jsonb_build_object(
        'message_id', NEW.id,
        'user_email', v_user_email,
        'user_name', v_user_name,
        'title', NEW.title,
        'content', NEW.content,
        'category', NEW.category,
        'created_at', NEW.created_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. CREATE trigger on messages table
DROP TRIGGER IF EXISTS trg_forward_user_message_to_sofinity ON public.messages;

CREATE TRIGGER trg_forward_user_message_to_sofinity
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.forward_user_message_to_sofinity();

-- 5. Ensure messages table has RLS enabled
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;