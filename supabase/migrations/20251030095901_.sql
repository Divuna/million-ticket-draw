-- Add source_system column to event_logs table
-- This will help track which system generated the event when forwarding to Sofinity
ALTER TABLE public.event_logs 
ADD COLUMN source_system text NOT NULL DEFAULT 'onemil';;
