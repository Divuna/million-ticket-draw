-- ─────────────────────────────────────────────────────────────────────────────
-- registered_user_presence — Admin "Online teď" for signed-in users
--
-- Problem:
--   useAdminOnlineIndicator is a stub that always returns onlineCount=0.
--   Admin panel "Online teď" badge shows 0 users even when dozens of users
--   are actively browsing the app.
--
-- Fix:
--   1. Add last_seen_at timestamptz to public.users (nullable; NULL = never seen).
--   2. Add index for fast range scans (admin poll window).
--   3. bump_user_last_seen() — SECURITY DEFINER, updates only auth.uid() row.
--      Called by every signed-in browser every 60 seconds.
--   4. get_admin_online_users(p_active_window_seconds) — SECURITY DEFINER,
--      admin/superadmin only, returns users active within the given window.
--
-- Safety invariants:
--   • bump_user_last_seen: single UPDATE on auth.uid(); read-only elsewhere.
--   • get_admin_online_users: SELECT only; admin guard inside function body.
--   • Does NOT touch buy_ticket_atomic, tickets, wallets, payments, Stripe,
--     Partner Offers, Sofinity, OneSignal, or the chunked MioCoin save flow.
--   • Does NOT store page history, activity log, or phone numbers.
--   • All statements are IF NOT EXISTS / CREATE OR REPLACE — fully idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Column ────────────────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- ─── 2. Index ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at
  ON public.users (last_seen_at DESC)
  WHERE last_seen_at IS NOT NULL;

-- ─── 3. Heartbeat RPC ─────────────────────────────────────────────────────────
-- Called by every authenticated browser every 60 s.
-- Updates only the row for the calling user (auth.uid()) — cannot touch other rows.
CREATE OR REPLACE FUNCTION public.bump_user_last_seen()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
  SET    last_seen_at = now()
  WHERE  id = auth.uid();
$$;

-- ─── 4. Admin read RPC ────────────────────────────────────────────────────────
-- Returns the list of users who have called bump_user_last_seen within the
-- last p_active_window_seconds seconds (default 300 = 5 minutes).
-- Accessible only to users with role admin or superadmin.
-- Returns: { success, users: [{userId, onlineAt}] }
CREATE OR REPLACE FUNCTION public.get_admin_online_users(
  p_active_window_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id uuid        := auth.uid();
  v_cutoff   timestamptz := now() - (p_active_window_seconds || ' seconds')::interval;
  v_result   jsonb;
BEGIN
  -- Admin / superadmin gate
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE  id   = v_admin_id
      AND  role IN ('admin', 'superadmin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pouze administrátoři mohou číst online uživatele'
    );
  END IF;

  SELECT jsonb_build_object(
    'success', true,
    'users',   COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'userId',   id::text,
          'onlineAt', last_seen_at
        )
        ORDER BY last_seen_at DESC
      ),
      '[]'::jsonb
    )
  )
  INTO v_result
  FROM public.users
  WHERE last_seen_at >= v_cutoff;

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
