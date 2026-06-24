-- Fix pre-existing partners_table_public_exposure.
-- Public/logo display moves to a narrow view; the base partners table is
-- restricted to own partner rows plus admin/superadmin.

begin;

create or replace view public.public_partners as
select
  id,
  name,
  logo_url,
  website_url,
  created_at,
  updated_at,
  status,
  logo_status
from public.partners
where status = 'approved'
  and logo_status = 'approved'
  and logo_url is not null;

grant select on public.public_partners to anon, authenticated;

drop policy if exists "Public read partners" on public.partners;
drop policy if exists partners_select_own_admin on public.partners;

revoke select on public.partners from public;
revoke select on public.partners from anon;

create policy partners_select_own_admin
on public.partners
for select
to authenticated
using (
  auth_user_id = auth.uid()
  or public.is_admin()
  or public.is_superadmin()
);

commit;
