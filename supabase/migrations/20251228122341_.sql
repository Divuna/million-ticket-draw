-- Create user_legal_acceptances table
CREATE TABLE public.user_legal_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  document_slug TEXT NOT NULL,
  document_version TEXT NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_legal_acceptances ENABLE ROW LEVEL SECURITY;

-- Users can view their own acceptances
CREATE POLICY "Users can view own acceptances"
ON public.user_legal_acceptances
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own acceptances
CREATE POLICY "Users can insert own acceptances"
ON public.user_legal_acceptances
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Admins can view all acceptances
CREATE POLICY "Admins can view all acceptances"
ON public.user_legal_acceptances
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM users u
  WHERE u.id = auth.uid()
  AND u.role IN ('admin', 'superadmin')
));

-- Create index for efficient queries
CREATE INDEX idx_user_legal_acceptances_user_id ON public.user_legal_acceptances(user_id);
CREATE INDEX idx_user_legal_acceptances_document ON public.user_legal_acceptances(document_slug, document_version);;
