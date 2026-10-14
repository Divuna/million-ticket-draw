-- Shoptet: let an already-connected partner change their CSV export URL.
--
-- WHY
--   Until now the export URL could only be set once, during onboarding. When a
--   partner has to regenerate the Shoptet permanent link — a new export template,
--   a regenerated export-security partner, or the 404 in issue #352 — there was no
--   way to hand OneMil the new link short of an admin editing Vault by hand.
--
-- WHAT THIS ADDS
--   One column, `request_kind`, telling apart the first connection from a later
--   URL change, plus the indexes that let a change request exist ALONGSIDE the
--   live connection instead of replacing it. That co-existence is the whole point:
--   while the change waits for review, the partner stays connected and imports
--   keep running from the OLD url.
--
-- NO NEW VAULT RPC IS NEEDED
--   store_shoptet_pending_url / promote_shoptet_pending_url / delete_shoptet_pending_url
--   are already keyed per request and per partner, and promote already overwrites an
--   existing final key (vault.update_secret branch). A URL change is therefore the
--   same Vault lifecycle as a first connection, just with a final key that exists.
--   The URL still never touches an application table, a log or an API response.
--
-- NOT CHANGED
--   No partner settings, no reward logic, no import, no wallet, no payment. Existing
--   rows all become request_kind='initial', so the first-connection flow behaves
--   exactly as before.
--
-- Rollback:
--   DROP INDEX IF EXISTS public.scr_partner_pending_change_unique;
--   DROP INDEX IF EXISTS public.scr_partner_pending_unique;
--   CREATE UNIQUE INDEX scr_partner_pending_unique
--     ON public.shoptet_connection_requests(partner_id)
--     WHERE status IN ('submitted','approved','active');
--   ALTER TABLE public.shoptet_connection_requests DROP COLUMN IF EXISTS request_kind;

begin;

-- ── 1. request_kind ──────────────────────────────────────────────────────────
-- Every existing row is a first connection.
alter table public.shoptet_connection_requests
  add column if not exists request_kind text not null default 'initial';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'scr_request_kind_check'
  ) then
    alter table public.shoptet_connection_requests
      add constraint scr_request_kind_check
      check (request_kind in ('initial','url_change'));
  end if;
end $$;

comment on column public.shoptet_connection_requests.request_kind is
  'initial = first Shoptet connection; url_change = replacing the export URL of an already active connection. A url_change request never carries partner settings — only a new URL, which lives in Vault only.';

-- ── 2. Indexes ───────────────────────────────────────────────────────────────
-- The old index allowed exactly one live row per partner, which made a change
-- request impossible: an active partner already occupies that slot. It is split
-- per kind so a partner can have one live connection AND one pending change.

drop index if exists public.scr_partner_pending_unique;

-- Unchanged meaning for the first connection: one submitted/approved/active
-- initial request per partner.
create unique index if not exists scr_partner_pending_unique
  on public.shoptet_connection_requests(partner_id)
  where status in ('submitted','approved','active')
    and request_kind = 'initial';

-- At most ONE url change awaiting review per partner. This is the authoritative
-- duplicate guard — the UI hides the action while a change is pending, but a
-- double submit or a second tab is stopped here, in the database.
-- Only 'submitted' is constrained: approved/rejected changes are history and may
-- accumulate, so a partner can change the URL again later.
create unique index if not exists scr_partner_pending_change_unique
  on public.shoptet_connection_requests(partner_id)
  where status = 'submitted'
    and request_kind = 'url_change';

create index if not exists idx_scr_request_kind
  on public.shoptet_connection_requests(request_kind);

commit;
