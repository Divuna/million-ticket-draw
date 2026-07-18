-- Security hardening for messages, notifications and internal queue surfaces.
--
-- Confirmed issues:
--   * public.event_queue allowed direct authenticated INSERT with RLS
--     WITH CHECK (true). The production cron worker forwards pending rows to
--     Sofinity, so an ordinary user could enqueue arbitrary internal events.
--   * Several legacy RPC helpers were directly executable by client roles while
--     creating messages, mutating OneSignal identifiers, creating notification
--     rows or calling external webhook/OneSignal endpoints.
--   * public.messages allowed ordinary users to insert their own row with an
--     arbitrary sender value and to update all columns on their own messages.
--
-- This migration only restricts direct client entrypoints. Existing Edge
-- Functions and internal automation use service_role or SECURITY DEFINER
-- database code and are preserved.

-- Internal event queue: keep admin SELECT through existing RLS, but remove all
-- direct client mutation paths. Queue producers must use trusted functions or
-- service-role automation.
DROP POLICY IF EXISTS allow_insert_event_queue ON public.event_queue;
DROP POLICY IF EXISTS allow_insert_event_queue_anon ON public.event_queue;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_queue FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.event_queue FROM authenticated;
GRANT SELECT ON TABLE public.event_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.event_queue TO service_role;

-- Messages: ordinary users may create only their own user-authored messages.
-- Admin/superadmin inserts remain covered by messages_insert_admin.
DROP POLICY IF EXISTS messages_insert ON public.messages;
CREATE POLICY messages_insert_user_own ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND sender = 'user'
  );

-- Preserve read/unread updates while blocking client-side mutation of message
-- author/content/user binding via broad table UPDATE privileges.
REVOKE UPDATE ON TABLE public.messages FROM authenticated;
GRANT UPDATE (read) ON TABLE public.messages TO authenticated;
GRANT UPDATE ON TABLE public.messages TO service_role;

-- Queue / external-call / message helper RPCs must not be directly callable
-- from PostgREST by anon/authenticated users.
ALTER FUNCTION public.notify_sofinity_event(text, uuid, uuid, jsonb) SET search_path TO public;
REVOKE ALL ON FUNCTION public.notify_sofinity_event(text, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_sofinity_event(text, uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.notify_sofinity_event(text, uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.notify_sofinity_event(text, uuid, uuid, jsonb) TO service_role;

ALTER FUNCTION public.forward_event_to_sofinity(jsonb) SET search_path TO public;
REVOKE ALL ON FUNCTION public.forward_event_to_sofinity(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.forward_event_to_sofinity(jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.forward_event_to_sofinity(jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.forward_event_to_sofinity(jsonb) TO service_role;

ALTER FUNCTION public._invoke_forward_messages_to_sofinity() SET search_path TO public;
REVOKE ALL ON FUNCTION public._invoke_forward_messages_to_sofinity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public._invoke_forward_messages_to_sofinity() FROM anon;
REVOKE ALL ON FUNCTION public._invoke_forward_messages_to_sofinity() FROM authenticated;
GRANT EXECUTE ON FUNCTION public._invoke_forward_messages_to_sofinity() TO service_role;

ALTER FUNCTION public.safe_send_message(uuid, text, text) SET search_path TO public;
REVOKE ALL ON FUNCTION public.safe_send_message(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safe_send_message(uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.safe_send_message(uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.safe_send_message(uuid, text, text) TO service_role;

ALTER FUNCTION public.update_onesignal_id(uuid, text) SET search_path TO public;
REVOKE ALL ON FUNCTION public.update_onesignal_id(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_onesignal_id(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.update_onesignal_id(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_onesignal_id(uuid, text) TO service_role;

ALTER FUNCTION public.create_guardian_message_for_user(uuid, text, uuid) SET search_path TO public;
REVOKE ALL ON FUNCTION public.create_guardian_message_for_user(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_guardian_message_for_user(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_guardian_message_for_user(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_guardian_message_for_user(uuid, text, uuid) TO service_role;

ALTER FUNCTION public.create_guardian_message_for_user(uuid, uuid, text) SET search_path TO public;
REVOKE ALL ON FUNCTION public.create_guardian_message_for_user(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_guardian_message_for_user(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_guardian_message_for_user(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_guardian_message_for_user(uuid, uuid, text) TO service_role;

ALTER FUNCTION public.create_guardian_notification_if_needed(uuid, uuid, uuid) SET search_path TO public;
REVOKE ALL ON FUNCTION public.create_guardian_notification_if_needed(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_guardian_notification_if_needed(uuid, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.create_guardian_notification_if_needed(uuid, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_guardian_notification_if_needed(uuid, uuid, uuid) TO service_role;

ALTER FUNCTION public.check_guardian_notifications_batch() SET search_path TO public;
REVOKE ALL ON FUNCTION public.check_guardian_notifications_batch() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_guardian_notifications_batch() FROM anon;
REVOKE ALL ON FUNCTION public.check_guardian_notifications_batch() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_guardian_notifications_batch() TO service_role;

ALTER FUNCTION public.run_pipeline_alerts() SET search_path TO public;
REVOKE ALL ON FUNCTION public.run_pipeline_alerts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_pipeline_alerts() FROM anon;
REVOKE ALL ON FUNCTION public.run_pipeline_alerts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.run_pipeline_alerts() TO service_role;

ALTER FUNCTION public.test_sofinity_player_sync() SET search_path TO public;
REVOKE ALL ON FUNCTION public.test_sofinity_player_sync() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_sofinity_player_sync() FROM anon;
REVOKE ALL ON FUNCTION public.test_sofinity_player_sync() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.test_sofinity_player_sync() TO service_role;

ALTER FUNCTION public.proxy_post_to_onesignal(text, text, text, text, text) SET search_path TO public;
REVOKE ALL ON FUNCTION public.proxy_post_to_onesignal(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.proxy_post_to_onesignal(text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.proxy_post_to_onesignal(text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.proxy_post_to_onesignal(text, text, text, text, text) TO service_role;
