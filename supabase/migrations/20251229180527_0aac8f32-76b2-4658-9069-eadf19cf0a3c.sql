-- Add user_seen column to winners table for badge tracking
ALTER TABLE public.winners 
ADD COLUMN user_seen boolean NOT NULL DEFAULT false;

-- Create index for efficient querying of unseen wins
CREATE INDEX idx_winners_user_unseen ON public.winners (user_id, user_seen) WHERE user_seen = false;