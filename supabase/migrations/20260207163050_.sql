
-- RPC: admin_block_referrer
-- Upserts referral_blocked_users with SECURITY DEFINER so admin bypasses RLS
CREATE OR REPLACE FUNCTION public.admin_block_referrer(
  p_user_id uuid,
  p_blocked boolean,
  p_reason text DEFAULT 'admin_manual'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Check caller is admin or superadmin
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  IF p_blocked THEN
    INSERT INTO public.referral_blocked_users (user_id, blocked, reason, blocked_at)
    VALUES (p_user_id, true, p_reason, now())
    ON CONFLICT (user_id) DO UPDATE
      SET blocked = true,
          reason = p_reason,
          blocked_at = now();
  ELSE
    UPDATE public.referral_blocked_users
    SET blocked = false
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- RPC: admin_update_referral_reward
-- Updates referral_rewards.status with SECURITY DEFINER so admin bypasses RLS
CREATE OR REPLACE FUNCTION public.admin_update_referral_reward(
  p_reward_id uuid,
  p_new_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
BEGIN
  -- Check caller is admin or superadmin
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Validate status
  IF p_new_status NOT IN ('earned', 'reversed', 'blocked') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  UPDATE public.referral_rewards
  SET status = p_new_status
  WHERE id = p_reward_id;
END;
$$;
;
