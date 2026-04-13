-- Block 5: partner_offer_clicks — lightweight click/impression tracking
-- ─────────────────────────────────────────────────────────────────────────────
-- Records when a user opens an offer detail view.
-- user_id / contest_id are nullable — click is recorded even for anonymous or
-- context-free opens (future use). Non-fatal: app never waits for this insert.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.partner_offer_clicks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id    uuid        NOT NULL REFERENCES public.partner_offers(id) ON DELETE CASCADE,
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  contest_id  uuid        REFERENCES public.contests(id) ON DELETE SET NULL,
  clicked_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poc_offer_id   ON public.partner_offer_clicks (offer_id);
CREATE INDEX IF NOT EXISTS idx_poc_user_id    ON public.partner_offer_clicks (user_id);
CREATE INDEX IF NOT EXISTS idx_poc_clicked_at ON public.partner_offer_clicks (clicked_at);

ALTER TABLE public.partner_offer_clicks ENABLE ROW LEVEL SECURITY;

-- Admin can read all rows
CREATE POLICY "admin_read_offer_clicks"
ON public.partner_offer_clicks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- Authenticated users can insert their own click
CREATE POLICY "user_insert_offer_click"
ON public.partner_offer_clicks FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);
