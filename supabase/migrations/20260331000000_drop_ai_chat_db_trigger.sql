-- Remove the pg_net DB trigger that called ai-chat on every user message INSERT.
-- ai-chat is now invoked exclusively by the frontend (useMessages.ts fetch()),
-- which sends a fresh session token + apikey. The DB trigger caused a duplicate
-- request with a stale/anon token that returned 401.

DROP TRIGGER IF EXISTS trg_forward_user_message_to_sofinity ON public.messages;
DROP FUNCTION IF EXISTS public.forward_user_message_to_sofinity();
