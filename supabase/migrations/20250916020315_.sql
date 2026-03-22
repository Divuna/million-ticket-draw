-- Add updated_at column to contests table
ALTER TABLE public.contests 
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Create or update the trigger function for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for contests table to auto-update updated_at
CREATE TRIGGER update_contests_updated_at
    BEFORE UPDATE ON public.contests
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();;
