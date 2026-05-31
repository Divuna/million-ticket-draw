-- ─────────────────────────────────────────────────────────────────────────────
-- get_admin_top_bar_stats — SECURITY DEFINER RPC for the admin sticky top bar
--
-- Problem:
--   AdminSoundIndicator read public.tickets and public.payments directly from
--   the browser. RLS on tickets only lets each user read their own rows, so
--   the "Hry dnes" badge showed 0 for admins even when production had dozens
--   of tickets today. Payments similarly relies on table-level RLS.
--
-- Fix:
--   One admin-only SECURITY DEFINER function that aggregates today's tickets
--   and completed payments inside Postgres and returns the data the frontend
--   needs. Bypasses RLS via SECURITY DEFINER + explicit admin/superadmin
--   role check inside the function body.
--
-- Day boundary:
--   Counts use Prague-local midnight (`now() AT TIME ZONE 'Europe/Prague'`)
--   so the badges reflect the calendar day as the admin in Prague sees it,
--   regardless of server time zone.
--
-- Payment amounts:
--   Returns the raw `amount` array (the credited MioCoin packages) so the
--   frontend can keep using the existing src/lib/paymentReporting.ts helpers
--   for CZK derivation and "neznámé" detection — single source of truth.
--
-- Safety invariants:
--   • Read-only: function performs SELECTs only; no inserts/updates/deletes.
--   • Admin-only: returns success=false if the caller is not admin/superadmin.
--   • Does NOT touch buy_ticket_atomic, tickets, winners, wallets, payments
--     write paths, Stripe webhooks, Partner Offers, Sofinity, OneSignal, or
--     the issue #71 chunked MioCoin save flow.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_admin_top_bar_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id        uuid;
  v_today_start     timestamptz;
  v_games_today     integer;
  v_payments_today  integer;
  v_payment_amounts numeric[];
BEGIN
  v_admin_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id   = v_admin_id
      AND role IN ('admin', 'superadmin')
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pouze administratori mohou cist admin top-bar staty'
    );
  END IF;

  -- Prague-local midnight of today, expressed as a UTC timestamptz.
  v_today_start :=
    (date_trunc('day', now() AT TIME ZONE 'Europe/Prague')) AT TIME ZONE 'Europe/Prague';

  SELECT COUNT(*)
  INTO v_games_today
  FROM public.tickets
  WHERE created_at >= v_today_start;

  SELECT COUNT(*),
         COALESCE(array_agg(amount) FILTER (WHERE amount IS NOT NULL), ARRAY[]::numeric[])
  INTO v_payments_today, v_payment_amounts
  FROM public.payments
  WHERE created_at >= v_today_start
    AND status = 'completed';

  RETURN jsonb_build_object(
    'success',         true,
    'games_today',     v_games_today,
    'payments_today',  v_payments_today,
    'payment_amounts', v_payment_amounts
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
