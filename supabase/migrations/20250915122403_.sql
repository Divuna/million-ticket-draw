-- Add INSERT policy for tickets table to allow users to create their own tickets
CREATE POLICY "tickets_insert_own" 
ON public.tickets 
FOR INSERT 
TO authenticated
WITH CHECK (auth.uid() = user_id);;
