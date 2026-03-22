-- Enable realtime for winners table so celebration sound can play on new wins

-- Set REPLICA IDENTITY FULL to include complete row data in realtime payload
ALTER TABLE public.winners REPLICA IDENTITY FULL;

-- Add winners table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.winners;;
