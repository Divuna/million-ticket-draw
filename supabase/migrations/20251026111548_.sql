-- Safe removal of trigger_send_push system and creation of missing trigger_notification_sent trigger
-- Step 1: Drop the broken push notification trigger
DROP TRIGGER IF EXISTS trg_send_push ON public.notifications;

-- Step 2: Drop the broken push notification function
DROP FUNCTION IF EXISTS public.trigger_send_push();

-- Step 3: Create the missing trigger for Sofinity forwarding
-- This ensures trigger_notification_sent() function actually gets executed
DROP TRIGGER IF EXISTS trigger_notification_sent ON public.notifications;
CREATE TRIGGER trigger_notification_sent
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_notification_sent();;
