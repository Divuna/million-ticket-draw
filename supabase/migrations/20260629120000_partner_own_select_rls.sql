-- Partner-own SELECT RLS for the partner dashboard.
--
-- Root cause (read-only audit, 29. 06. 2026): partner_reward_codes,
-- partner_coin_activations and partner_api_keys all have RLS ENABLED but ZERO
-- policies → deny-all for the partner's authenticated PostgREST session. The
-- partner dashboard reads these tables directly via .from() with the partner
-- JWT, so every read returns [] and the weekly overview / stat cards / API key
-- list render all zeros, even though the rows exist.
--
-- Fix: add SELECT-only partner-own + admin/superadmin policies. Writes are NOT
-- granted here — all writes continue to flow exclusively through existing
-- SECURITY DEFINER RPCs / service_role automation (which bypass RLS).
--
-- Scope: STAGING (dxmowysntemfqfnanxua) only. Production untouched.
-- Rollback:
--   DROP POLICY IF EXISTS partner_reward_codes_select_own     ON public.partner_reward_codes;
--   DROP POLICY IF EXISTS partner_coin_activations_select_own ON public.partner_coin_activations;
--   DROP POLICY IF EXISTS partner_api_keys_select_own         ON public.partner_api_keys;

begin;

-- ── partner_reward_codes (weekly overview + stat cards) ──────────────────────
drop policy if exists partner_reward_codes_select_own on public.partner_reward_codes;
create policy partner_reward_codes_select_own
  on public.partner_reward_codes
  for select to authenticated
  using (
    partner_id in (select id from public.partners where auth_user_id = auth.uid())
    or public.is_admin()
    or public.is_superadmin()
  );

-- ── partner_coin_activations (offer "Celkem aktivací") ───────────────────────
drop policy if exists partner_coin_activations_select_own on public.partner_coin_activations;
create policy partner_coin_activations_select_own
  on public.partner_coin_activations
  for select to authenticated
  using (
    partner_id in (select id from public.partners where auth_user_id = auth.uid())
    or public.is_admin()
    or public.is_superadmin()
  );

-- ── partner_api_keys (API keys section — prefixes only) ──────────────────────
drop policy if exists partner_api_keys_select_own on public.partner_api_keys;
create policy partner_api_keys_select_own
  on public.partner_api_keys
  for select to authenticated
  using (
    partner_id in (select id from public.partners where auth_user_id = auth.uid())
    or public.is_admin()
    or public.is_superadmin()
  );

commit;
