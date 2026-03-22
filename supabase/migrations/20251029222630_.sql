-- Remove problematic trigger that causes registration to fail
-- The trigger tries to access project_id field that doesn't exist on users table
DROP TRIGGER IF EXISTS trigger_users_forward_to_sofinity ON public.users;;
