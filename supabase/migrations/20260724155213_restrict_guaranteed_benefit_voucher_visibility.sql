-- ============================================================================
-- Garantovany nakupni benefit - voucher SELECT RLS correction
-- ============================================================================
-- The legacy "Public read vouchers" policy used USING (true), so adding another
-- permissive ownership policy could not hide guaranteed purchase benefits.
-- This migration:
--   1. keeps classic public vouchers readable by anon/authenticated clients,
--   2. preserves an authenticated user's assigned classic vouchers,
--   3. allows guaranteed benefits only to their partner, a superadmin, or the
--      user who actually received the benefit,
--   4. adds restrictive fail-closed guards so another permissive policy cannot
--      accidentally make guaranteed benefits public again.
--
-- It does not change voucher purchases, favorites, buy_ticket_atomic, frontend,
-- Edge Functions, invoice automation, or any voucher data.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.vouchers') is null
     or to_regclass('public.partners') is null
     or to_regclass('public.user_vouchers') is null
     or to_regclass('public.voucher_issuances') is null then
    raise exception 'Missing guaranteed purchase benefit RLS dependency';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vouchers'
      and column_name = 'distribution_mode'
  ) then
    raise exception 'Missing public.vouchers.distribution_mode';
  end if;

  if to_regprocedure('public.is_superadmin(uuid)') is null then
    raise exception 'Missing dependency public.is_superadmin(uuid)';
  end if;
end
$$;

alter table public.vouchers enable row level security;

-- Replace the unsafe catch-all public policy. A public voucher must be both
-- classic and explicitly public.
drop policy if exists "Public read vouchers" on public.vouchers;
create policy "Public read vouchers"
  on public.vouchers
  for select
  to anon, authenticated
  using (
    distribution_mode = 'classic'
    and is_public = true
  );

-- Preserve the legacy assigned-voucher path without exposing every unassigned
-- or private voucher to every authenticated user.
drop policy if exists "Users can view assigned vouchers or unassigned vouchers"
  on public.vouchers;
create policy "Users can view assigned vouchers or unassigned vouchers"
  on public.vouchers
  for select
  to authenticated
  using (
    distribution_mode = 'classic'
    and (
      is_public = true
      or user_id = (select auth.uid())
    )
  );

-- Recreate the Phase 1 partner policy with an explicit mode guard.
drop policy if exists vouchers_partner_own_select on public.vouchers;
create policy vouchers_partner_own_select
  on public.vouchers
  for select
  to authenticated
  using (
    distribution_mode = 'guaranteed_purchase_benefit'
    and exists (
      select 1
      from public.partners p
      where p.id = vouchers.partner_id
        and p.auth_user_id = (select auth.uid())
    )
  );

drop policy if exists vouchers_guaranteed_benefit_superadmin_select
  on public.vouchers;
drop policy if exists vouchers_superadmin_select
  on public.vouchers;
create policy vouchers_superadmin_select
  on public.vouchers
  for select
  to authenticated
  using ((select public.is_superadmin((select auth.uid()))));

drop policy if exists vouchers_guaranteed_benefit_issued_user_select
  on public.vouchers;
create policy vouchers_guaranteed_benefit_issued_user_select
  on public.vouchers
  for select
  to authenticated
  using (
    distribution_mode = 'guaranteed_purchase_benefit'
    and (
      exists (
        select 1
        from public.user_vouchers uv
        where uv.voucher_id = vouchers.id
          and uv.user_id = (select auth.uid())
          and uv.acquisition_source = 'guaranteed_purchase_benefit'
      )
      or exists (
        select 1
        from public.voucher_issuances vi
        where vi.voucher_id = vouchers.id
          and vi.user_id = (select auth.uid())
      )
    )
  );

-- Permissive policies are OR-combined. These restrictive policies are the
-- fail-closed boundary that every applicable SELECT must also satisfy.
drop policy if exists vouchers_anon_guaranteed_benefit_guard
  on public.vouchers;
create policy vouchers_anon_guaranteed_benefit_guard
  on public.vouchers
  as restrictive
  for select
  to anon
  using (distribution_mode = 'classic');

drop policy if exists vouchers_authenticated_guaranteed_benefit_guard
  on public.vouchers;
create policy vouchers_authenticated_guaranteed_benefit_guard
  on public.vouchers
  as restrictive
  for select
  to authenticated
  using (
    distribution_mode = 'classic'
    or (
      distribution_mode = 'guaranteed_purchase_benefit'
      and (
        (select public.is_superadmin((select auth.uid())))
        or exists (
          select 1
          from public.partners p
          where p.id = vouchers.partner_id
            and p.auth_user_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.user_vouchers uv
          where uv.voucher_id = vouchers.id
            and uv.user_id = (select auth.uid())
            and uv.acquisition_source = 'guaranteed_purchase_benefit'
        )
        or exists (
          select 1
          from public.voucher_issuances vi
          where vi.voucher_id = vouchers.id
            and vi.user_id = (select auth.uid())
        )
      )
    )
  );

comment on policy "Public read vouchers" on public.vouchers is
  'Only classic vouchers with is_public=true are public. Guaranteed purchase benefits are never public.';
comment on policy vouchers_authenticated_guaranteed_benefit_guard on public.vouchers is
  'Restrictive boundary: guaranteed purchase benefits require partner, superadmin, or issued-user ownership.';

commit;
