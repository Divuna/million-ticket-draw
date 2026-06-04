-- ============================================================================
-- OneMil — global Bob (AI chat) on/off flag
-- ============================================================================
-- Stores the flag as settings.bob_enabled ('true' | 'false').
-- get_bob_enabled() exposes ONLY this boolean — it never returns any other
-- settings row and never any secret / API key. Defaults to true when absent.
--
-- Customers read the flag via this RPC (settings has admin-only RLS, so they
-- cannot SELECT it directly). Admins flip the flag by writing settings.bob_enabled
-- (they already have write RLS on public.settings).
--
-- No change to messages schema/RLS, ai-chat, Bob prompt, CTA routing, or the
-- { text, cta } response format. Apply to STAGING first; production needs
-- explicit approval.
-- ============================================================================

INSERT INTO public.settings (key, value, updated_at)
VALUES ('bob_enabled', 'true', now())
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_bob_enabled()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COALESCE(
    (SELECT value = 'true' FROM public.settings WHERE key = 'bob_enabled' LIMIT 1),
    true
  );
$$;

REVOKE ALL ON FUNCTION public.get_bob_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bob_enabled() TO authenticated;
