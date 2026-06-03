-- ============================================================================
-- OneMil Affiliate program — admin commission status workflow (fourth safe step)
-- ============================================================================
-- SECURITY DEFINER RPC to move affiliate_commissions through its lifecycle.
-- Staging only. Additive: one function, no schema/data changes elsewhere.
--
-- Isolation guarantees:
--   - No change to customer accounts, Partner portal, payments, tickets,
--     contests, wallet, or buy_ticket_atomic.
--   - Writes ONLY to affiliate_commissions (status, paid_at, updated_at).
--
-- Allowed transitions (forward only):
--   calculated -> approved
--   approved   -> paid    (sets paid_at = now())
-- Disallowed: any backward move, calculated -> paid skip, or unknown status.
--
-- Authorization: admin only (is_admin()).
--
-- Returns safe jsonb:
--   {"status":"forbidden"}            -- caller not admin
--   {"status":"not_found"}            -- commission id does not exist
--   {"status":"invalid_status"}       -- p_new_status not in (approved, paid)
--   {"status":"invalid_transition", "from":<current>, "to":<requested>}
--   {"status":"updated", "id":..., "from":<old>, "to":<new>}
--
-- Idempotent DDL: CREATE OR REPLACE.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_set_affiliate_commission_status(
  p_commission_id uuid,
  p_new_status    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current text;
BEGIN
  -- Admin only.
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;

  -- Target status must be one of the two writable states.
  IF p_new_status IS NULL OR p_new_status NOT IN ('approved', 'paid') THEN
    RETURN jsonb_build_object('status', 'invalid_status');
  END IF;

  -- Lock the row and read its current status.
  SELECT status INTO v_current
  FROM public.affiliate_commissions
  WHERE id = p_commission_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  -- Enforce forward-only transitions.
  IF NOT (
       (v_current = 'calculated' AND p_new_status = 'approved')
    OR (v_current = 'approved'   AND p_new_status = 'paid')
  ) THEN
    RETURN jsonb_build_object(
      'status', 'invalid_transition',
      'from', v_current,
      'to', p_new_status
    );
  END IF;

  UPDATE public.affiliate_commissions
  SET status  = p_new_status,
      paid_at = CASE WHEN p_new_status = 'paid' THEN now() ELSE paid_at END
  WHERE id = p_commission_id;

  RETURN jsonb_build_object(
    'status', 'updated',
    'id', p_commission_id,
    'from', v_current,
    'to', p_new_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_affiliate_commission_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_affiliate_commission_status(uuid, text) TO authenticated;
