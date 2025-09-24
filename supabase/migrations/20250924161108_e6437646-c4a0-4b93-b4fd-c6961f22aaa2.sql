-- Create banners table
CREATE TABLE public.banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  target_page TEXT NOT NULL DEFAULT 'homepage_customer',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access
CREATE POLICY "Admin full access to banners" 
ON public.banners 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM users u 
  WHERE u.id = auth.uid() 
  AND u.role IN ('admin', 'superadmin')
));

-- Create policy for public read access to active banners
CREATE POLICY "Public can view active banners" 
ON public.banners 
FOR SELECT 
USING (active = true AND (start_date IS NULL OR start_date <= CURRENT_DATE) AND (end_date IS NULL OR end_date >= CURRENT_DATE));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_banners_updated_at
BEFORE UPDATE ON public.banners
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert test banners with STRING_AGG friendly data
INSERT INTO public.banners (title, image_url, active, target_page, start_date, end_date) VALUES
('Mega Jackpot - Vyhrajte až 1 milion!', '/placeholder.svg', true, 'homepage_customer', CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days'),
('Černý pátek - Slevy až 70%', '/placeholder.svg', true, 'homepage_customer', CURRENT_DATE, CURRENT_DATE + INTERVAL '7 days'),
('Vánoční akce - Speciální nabídky', '/placeholder.svg', false, 'homepage_customer', CURRENT_DATE + INTERVAL '20 days', CURRENT_DATE + INTERVAL '50 days'),
('Nový rok, nové výhry!', '/placeholder.svg', true, 'homepage_customer', CURRENT_DATE - INTERVAL '5 days', CURRENT_DATE + INTERVAL '25 days');

-- Create helper function for banner aggregation
CREATE OR REPLACE FUNCTION get_active_banners_summary()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT STRING_AGG(
      CONCAT(title, ' (', 
             CASE WHEN active THEN 'Aktivní' ELSE 'Neaktivní' END, 
             ', ', target_page, ')'),
      ' | '
      ORDER BY created_at DESC
    )
    FROM banners
    WHERE start_date IS NULL OR start_date <= CURRENT_DATE
      AND (end_date IS NULL OR end_date >= CURRENT_DATE)
  );
END;
$$;