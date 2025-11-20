-- Add missing columns to messages table for Sofinity integration
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS topic TEXT,
ADD COLUMN IF NOT EXISTS extension TEXT,
ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS event TEXT,
ADD COLUMN IF NOT EXISTS private BOOLEAN DEFAULT false;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_messages_topic ON public.messages(topic);
CREATE INDEX IF NOT EXISTS idx_messages_event ON public.messages(event);