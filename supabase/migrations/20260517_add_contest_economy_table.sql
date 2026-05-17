-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 4: Persist admin contest economy assumptions
-- Creates contest_economy table (one row per contest).
--
-- Purpose: persist the 7 economy assumption inputs that admin enters in the
-- AdminContestManagement modal (Ekonomika tab + economy summary bar).
--
-- Safety invariants:
--   • This table is admin-only (RLS enforced).
--   • It is never read by buy_ticket_atomic, winner logic, or any public API.
--   • Existing contests are unaffected (no row = defaults apply).
--   • ON DELETE CASCADE: when a contest is deleted, its economy row is removed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.contest_economy (
  contest_id              UUID        NOT NULL PRIMARY KEY
                            REFERENCES public.contests(id) ON DELETE CASCADE,
  main_prize_cost_czk     NUMERIC     NOT NULL DEFAULT 0,
  miocoin_real_cost_czk   NUMERIC     NOT NULL DEFAULT 0,
  vat_rate_percent        NUMERIC     NOT NULL DEFAULT 21,
  setup_cost_czk          NUMERIC     NOT NULL DEFAULT 7000,
  marketing_percent       NUMERIC     NOT NULL DEFAULT 15,
  default_handling_czk    NUMERIC     NOT NULL DEFAULT 75,
  target_margin_percent   NUMERIC     NOT NULL DEFAULT 20,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.contest_economy IS
  'Admin-only contest economy planning data. '
  'Never used in ticket purchase, winner, or payment logic.';

-- ── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE public.contest_economy ENABLE ROW LEVEL SECURITY;

-- Admins and superadmins can read and write all rows.
CREATE POLICY "contest_economy_admin_all"
  ON public.contest_economy
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND role IN ('admin', 'superadmin')
    )
  );
