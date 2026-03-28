-- List / thread queries: eq(user_id) + order by created_at (Messages.tsx, ai-chat recent history).
CREATE INDEX IF NOT EXISTS idx_messages_user_id_created_at
  ON public.messages (user_id, created_at DESC);
