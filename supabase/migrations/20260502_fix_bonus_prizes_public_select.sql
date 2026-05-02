-- Allow all users (anon + authenticated) to SELECT bonus_prizes.
-- Previously only admins had a policy, so regular users got empty results
-- on ContestDetail even though bonus prizes existed in the DB.

CREATE POLICY "Public can view bonus prizes"
ON public.bonus_prizes
FOR SELECT
USING (true);
