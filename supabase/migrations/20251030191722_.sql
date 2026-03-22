-- Drop existing function to allow return type change
DROP FUNCTION IF EXISTS public.notify_sofinity_event(text, uuid, uuid, jsonb);

-- Create event queue table for async processing
CREATE TABLE IF NOT EXISTS public.event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  user_id uuid,
  contest_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  source_system text DEFAULT 'onemil',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count integer DEFAULT 0,
  last_error text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_event_queue_status ON public.event_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_event_queue_created ON public.event_queue(created_at DESC);

-- Enable RLS
ALTER TABLE public.event_queue ENABLE ROW LEVEL SECURITY;

-- Admin can view all queue items
DROP POLICY IF EXISTS "Admins can view event queue" ON public.event_queue;
CREATE POLICY "Admins can view event queue"
ON public.event_queue FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- Recreate notify_sofinity_event with queue-based architecture
CREATE OR REPLACE FUNCTION public.notify_sofinity_event(
  p_event_name text,
  p_user_id uuid DEFAULT NULL,
  p_contest_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_queue_id uuid;
BEGIN
  -- Log locally to event_logs (unchanged)
  INSERT INTO event_logs (event_name, user_id, contest_id, metadata, source_system)
  VALUES (p_event_name, p_user_id, p_contest_id, coalesce(p_metadata, '{}'::jsonb), 'onemil');

  -- Queue event for async processing by edge function
  INSERT INTO event_queue (event_name, user_id, contest_id, metadata, source_system, status)
  VALUES (p_event_name, p_user_id, p_contest_id, coalesce(p_metadata, '{}'::jsonb), 'onemil', 'pending')
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;

EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'notify_sofinity_event error: %', SQLERRM;
  RETURN NULL;
END;
$$;

-- Create trigger function to process queue via edge function
CREATE OR REPLACE FUNCTION public.process_event_queue_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_pg_net boolean := false;
  v_url text;
  v_anon_key text;
  v_payload jsonb;
BEGIN
  -- Only process new pending events
  IF NEW.status = 'pending' THEN
    -- Check if pg_net is available
    SELECT EXISTS (
      SELECT 1 FROM pg_proc pr
      JOIN pg_namespace ns ON ns.oid = pr.pronamespace
      WHERE ns.nspname = 'net' AND pr.proname = 'http_post'
    ) INTO v_has_pg_net;

    IF v_has_pg_net THEN
      v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhremhqbGRyb2pqbHJrZXpvcmV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NDEyMTQsImV4cCI6MjA3MzQxNzIxNH0.O8--xNUY9PFqIBlXDav1x-coeYbZEy8UzAtMDEZhS6U';
      v_url := 'https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/send_event_to_sofinity';
      
      -- Build payload for edge function
      v_payload := jsonb_build_object(
        'queue_id', NEW.id,
        'event_name', NEW.event_name,
        'user_id', NEW.user_id,
        'contest_id', NEW.contest_id,
        'metadata', NEW.metadata,
        'timestamp', NEW.created_at::text
      );

      -- Call edge function asynchronously via pg_net
      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_anon_key,
          'apikey', v_anon_key
        ),
        body := v_payload
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'process_event_queue_trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Create trigger to process queue on insert
DROP TRIGGER IF EXISTS trigger_process_event_queue ON public.event_queue;
CREATE TRIGGER trigger_process_event_queue
AFTER INSERT ON public.event_queue
FOR EACH ROW
EXECUTE FUNCTION public.process_event_queue_trigger();;
