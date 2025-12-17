-- Create winner status history table
CREATE TABLE public.winner_status_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  winner_id uuid NOT NULL REFERENCES public.winners(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.winner_status_history ENABLE ROW LEVEL SECURITY;

-- Admin can view all history
CREATE POLICY "Admins can view winner status history"
ON public.winner_status_history
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM users
  WHERE users.id = auth.uid()
  AND users.role IN ('admin', 'superadmin')
));

-- Admin can insert history
CREATE POLICY "Admins can insert winner status history"
ON public.winner_status_history
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM users
  WHERE users.id = auth.uid()
  AND users.role IN ('admin', 'superadmin')
));

-- Create index for faster lookups
CREATE INDEX idx_winner_status_history_winner_id ON public.winner_status_history(winner_id);
CREATE INDEX idx_winner_status_history_created_at ON public.winner_status_history(created_at DESC);