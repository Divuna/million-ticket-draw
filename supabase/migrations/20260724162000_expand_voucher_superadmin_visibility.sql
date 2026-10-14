-- Follow-up for staging validation of the voucher visibility correction.
--
-- The first corrective migration limited the superadmin permissive policy to
-- guaranteed purchase benefits. That correctly protected benefits, but it did
-- not satisfy the stronger access rule that a superadmin may read every
-- voucher, including non-public classic vouchers.

begin;

do $$
begin
  if to_regclass('public.vouchers') is null then
    raise exception 'Missing dependency public.vouchers';
  end if;

  if to_regprocedure('public.is_superadmin(uuid)') is null then
    raise exception 'Missing dependency public.is_superadmin(uuid)';
  end if;
end
$$;

drop policy if exists vouchers_guaranteed_benefit_superadmin_select
  on public.vouchers;
drop policy if exists vouchers_superadmin_select
  on public.vouchers;
create policy vouchers_superadmin_select
  on public.vouchers
  for select
  to authenticated
  using ((select public.is_superadmin((select auth.uid()))));

comment on policy vouchers_superadmin_select on public.vouchers is
  'Superadmins may read all classic vouchers and guaranteed purchase benefits.';

commit;
