-- Keep the public partner logo feed readable while preventing client-side writes.
-- The application reads this view on the homepage; partner management continues
-- through the protected underlying admin flow.

revoke all privileges on table public.public_partners from anon;
revoke all privileges on table public.public_partners from authenticated;

grant select on table public.public_partners to anon;
grant select on table public.public_partners to authenticated;
