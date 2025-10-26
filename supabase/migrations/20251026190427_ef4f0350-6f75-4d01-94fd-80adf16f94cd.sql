-- Create function to update OneSignal player ID and notify Sofinity
CREATE OR REPLACE FUNCTION public.update_onesignal_id(
  p_user_id uuid,
  p_player_id text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_email text;
  v_payload jsonb;
BEGIN
  -- Update user's OneSignal player ID
  UPDATE public.users
  SET onesignal_player_id = p_player_id
  WHERE id = p_user_id
  RETURNING email INTO v_user_email;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'message', 'User not found'
    );
  END IF;

  -- Prepare Sofinity payload
  v_payload := jsonb_build_object(
    'event_name', 'onesignal_player_registered',
    'user_id', p_user_id,
    'player_id', p_player_id,
    'email', v_user_email,
    'timestamp', now()
  );

  -- Send event to Sofinity
  PERFORM notify_sofinity_event(
    'onesignal_player_registered',
    p_user_id,
    NULL,
    v_payload
  );

  -- Return success response
  RETURN json_build_object(
    'success', true,
    'message', 'OneSignal player ID updated and synced to Sofinity'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Error: ' || SQLERRM
    );
END;
$function$;