-- Add parent_message_id column to messages table for threaded replies
ALTER TABLE messages 
ADD COLUMN parent_message_id uuid REFERENCES messages(id) ON DELETE CASCADE;

-- Create index for better performance when querying replies
CREATE INDEX idx_messages_parent_id ON messages(parent_message_id);

-- Update RLS policies to allow users and admins to reply to messages
-- Users can reply to their own message threads
CREATE POLICY "Users can reply to their own threads"
ON messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id AND
  (parent_message_id IS NULL OR 
   EXISTS (
     SELECT 1 FROM messages parent 
     WHERE parent.id = messages.parent_message_id 
     AND parent.user_id = auth.uid()
   ))
);

-- Admins can reply to any message thread
CREATE POLICY "Admins can reply to any thread"
ON messages
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role IN ('admin', 'superadmin')
  )
);

COMMENT ON COLUMN messages.parent_message_id IS 'References parent message for threaded replies';