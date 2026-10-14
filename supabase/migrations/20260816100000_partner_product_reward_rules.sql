-- Partner product-level MioCoin reward rules — data model (Phase 1, additive).
--
-- Goal: let a partner reward either the whole e-shop (today's behaviour), only
-- selected products, or the whole e-shop with per-SKU exceptions. Nothing here
-- changes how rewards are calculated yet — the shared reward engine
-- (compute_partner_reward) and its callers land in later phases.
--
-- Product matching is ALWAYS by the stable product code / SKU. The product name
-- is a display-only cache for the partner dashboard and is never used for
-- matching.
--
-- Safety:
--   * Purely additive. No existing table, column, policy or RPC is modified.
--   * partners.reward_mode defaults to 'whole_shop' → every existing partner
--     keeps exactly today's behaviour until they opt in.
--   * Partner-own write access on the rules table mirrors the existing
--     partners_update_own policy (a partner already edits reward_base_czk /
--     reward_mc directly). Financial issuance still happens only in
--     SECURITY DEFINER RPCs / service_role automation.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.partner_seen_products;
--   DROP TABLE IF EXISTS public.partner_product_reward_rules;
--   ALTER TABLE public.partners DROP COLUMN IF EXISTS reward_mode;
--   ALTER TABLE public.partners DROP COLUMN IF EXISTS product_badge_enabled;

begin;

-- ── 1. partners: reward mode + widget badge toggle ───────────────────────────

alter table public.partners
  add column if not exists reward_mode text not null default 'whole_shop';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'partners_reward_mode_check'
  ) then
    alter table public.partners
      add constraint partners_reward_mode_check
      check (reward_mode in ('whole_shop', 'selected_products', 'whole_shop_with_exceptions'));
  end if;
end $$;

-- Product badge on the Shoptet product page can be switched off by the partner.
-- The cart summary is intentionally NOT toggleable — it stays on whenever the
-- Shoptet MioCoin connection is active (confirmed product decision).
alter table public.partners
  add column if not exists product_badge_enabled boolean not null default true;

comment on column public.partners.reward_mode is
  'How the partner rewards customers: whole_shop (global reward_base_czk/reward_mc), selected_products (only SKUs with an active rule), whole_shop_with_exceptions (global rate, per-SKU overrides).';
comment on column public.partners.product_badge_enabled is
  'Partner can hide the per-product MioCoin badge in their Shoptet. The cart summary is always shown and is not affected by this flag.';

-- ── 2. partner_product_reward_rules ──────────────────────────────────────────

create table if not exists public.partner_product_reward_rules (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners(id) on delete cascade,
  -- Stable Shoptet product code / SKU. Case-insensitive matching is done by
  -- normalising to lower(trim(...)) on both write and lookup.
  product_key    text not null check (char_length(product_key) between 1 and 120),
  product_label  text check (product_label is null or char_length(product_label) <= 300),
  reward_type    text not null default 'fixed_mc'
                 constraint pprr_reward_type_check
                 check (reward_type in ('fixed_mc', 'ratio')),
  -- fixed_mc: MioCoins per single unit (multiplied by quantity).
  fixed_mc       numeric check (fixed_mc is null or fixed_mc > 0),
  -- ratio: same shape as the global conversion (ratio_base_czk Kč = ratio_mc MC),
  -- applied to the item's real after-discount price.
  ratio_base_czk numeric check (ratio_base_czk is null or ratio_base_czk > 0),
  ratio_mc       numeric check (ratio_mc is null or ratio_mc > 0),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint pprr_reward_values_check check (
    (reward_type = 'fixed_mc' and fixed_mc is not null)
    or (reward_type = 'ratio' and ratio_base_czk is not null and ratio_mc is not null)
  )
);

-- Case-insensitive uniqueness: Shoptet codes are matched case-insensitively, so
-- 'ABC123' and 'abc123' must never coexist as two competing rules for one partner.
create unique index if not exists idx_pprr_partner_product_unique
  on public.partner_product_reward_rules(partner_id, lower(product_key));

create index if not exists idx_pprr_partner_active
  on public.partner_product_reward_rules(partner_id)
  where active;

comment on table public.partner_product_reward_rules is
  'Per-product MioCoin reward rules. Matched strictly by product_key (Shoptet product code / SKU); product_label is display-only.';

-- ── 3. partner_seen_products (product picker source) ─────────────────────────
-- Populated from item-level Shoptet imports and Partner Order API items, so the
-- partner dashboard can offer a product picker whose keys are guaranteed to be
-- the same keys that later arrive in real orders.

create table if not exists public.partner_seen_products (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partners(id) on delete cascade,
  product_key    text not null check (char_length(product_key) between 1 and 120),
  last_seen_name text,
  last_seen_at   timestamptz not null default now()
);

create unique index if not exists idx_psp_partner_product_unique
  on public.partner_seen_products(partner_id, lower(product_key));

create index if not exists idx_psp_partner_last_seen
  on public.partner_seen_products(partner_id, last_seen_at desc);

comment on table public.partner_seen_products is
  'Cache of product codes actually observed in this partner''s imported orders. Display/autocomplete source for the partner dashboard product picker.';

-- ── 4. updated_at trigger for the rules table ────────────────────────────────

create or replace function public.partner_product_reward_rules_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists pprr_updated_at on public.partner_product_reward_rules;
create trigger pprr_updated_at
  before update on public.partner_product_reward_rules
  for each row execute function public.partner_product_reward_rules_set_updated_at();

-- ── 5. RLS ───────────────────────────────────────────────────────────────────

alter table public.partner_product_reward_rules enable row level security;
alter table public.partner_seen_products         enable row level security;

-- Rules: partner manages their own rows (same trust level as the existing
-- partners_update_own policy for reward_base_czk / reward_mc). Admins full access.
drop policy if exists pprr_partner_own on public.partner_product_reward_rules;
create policy pprr_partner_own
  on public.partner_product_reward_rules
  for all to authenticated
  using (
    partner_id in (select id from public.partners where auth_user_id = auth.uid())
    or public.is_admin()
    or public.is_superadmin()
  )
  with check (
    partner_id in (select id from public.partners where auth_user_id = auth.uid())
    or public.is_admin()
    or public.is_superadmin()
  );

-- Seen products: read-only for the partner. Writes come from service_role
-- (import / Partner Order API) only — no client INSERT/UPDATE policy on purpose.
drop policy if exists psp_partner_select_own on public.partner_seen_products;
create policy psp_partner_select_own
  on public.partner_seen_products
  for select to authenticated
  using (
    partner_id in (select id from public.partners where auth_user_id = auth.uid())
    or public.is_admin()
    or public.is_superadmin()
  );

commit;
