-- ============================================================================
-- Garantovaný nákupní benefit — read-only offer lookup for the customer UI
-- ============================================================================
-- A customer cannot see any of the data needed to render the offer: settings is
-- superadmin-only, and vouchers / voucher_versions / voucher_distribution_orders
-- / voucher_codes are partner-or-superadmin scoped. This function is the single,
-- minimal, read-only window into that data.
--
-- It answers exactly one question — "may this customer buy a guaranteed purchase
-- benefit in this contest right now, and what does it cost?" — using the SAME
-- availability gates as purchase_guaranteed_benefit_bundle_atomic, so the UI can
-- never advertise an offer the purchase would refuse.
--
-- It is read-only: no INSERT/UPDATE/DELETE and deliberately no row locking (no
-- FOR UPDATE / SKIP LOCKED), so it never blocks a concurrent real purchase. The
-- offer may go stale between render and purchase; that is fine, because the
-- purchase RPC fails closed with no_benefit_available.
--
-- Disclosure is limited to what the customer sees anyway right after buying:
-- benefit name, short description, partner name, price in MioCoins, image and
-- voucher id. It never returns voucher codes, code counts, ordered or issued
-- quantities, the partner distribution price, VAT, distribution order ids, or
-- any other partner's data.
--
-- Changes nothing else: buy_ticket_atomic, the purchase RPC, wallets, winning
-- logic, RLS policies and invoicing are untouched.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.voucher_distribution_orders') is null
     or to_regclass('public.voucher_versions') is null
     or to_regclass('public.voucher_codes') is null
     or to_regclass('public.vouchers') is null
     or to_regclass('public.partners') is null
     or to_regclass('public.contests') is null
     or to_regclass('public.settings') is null then
    raise exception 'Missing garantovaný nákupní benefit offer dependency';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'voucher_versions'
      and column_name = 'customer_price_miocoins'
  ) then
    raise exception 'Missing public.voucher_versions.customer_price_miocoins';
  end if;
end $$;

create or replace function public.get_guaranteed_benefit_offer(p_contest_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user           uuid := auth.uid();
  v_flag           text;
  v_allowlist      text;
  v_contest_status text;
  v_offer          record;
begin
  -- Any failed gate returns the same minimal shape: nothing is disclosed.
  if v_user is null then
    return jsonb_build_object('available', false);
  end if;

  select value into v_flag
  from public.settings
  where key = 'guaranteed_benefit_purchase_enabled';
  if coalesce(v_flag, 'false') <> 'true' then
    return jsonb_build_object('available', false);
  end if;

  select value into v_allowlist
  from public.settings
  where key = 'guaranteed_benefit_purchase_contest_allowlist';
  if v_allowlist is not null
     and btrim(v_allowlist) not in ('', '[]')
     and not (v_allowlist::jsonb ? p_contest_id::text) then
    return jsonb_build_object('available', false);
  end if;

  select status into v_contest_status
  from public.contests
  where id = p_contest_id;
  if not found or v_contest_status <> 'active' then
    return jsonb_build_object('available', false);
  end if;

  -- Same candidate the purchase would pick: approved order for this contest with
  -- remaining capacity, approved benefit, an available code, and a set customer
  -- price. Read-only: no FOR UPDATE, no SKIP LOCKED.
  select vv.name                    as benefit_name,
         vv.short_description       as benefit_short_description,
         coalesce(nullif(btrim(p.company_name), ''), p.name) as partner_name,
         vv.customer_price_miocoins as price_miocoins,
         coalesce(vv.image_url, v.image_url) as image_url,
         v.id                       as voucher_id
  into v_offer
  from public.voucher_codes vc
  join public.voucher_distribution_orders o
    on o.id = vc.distribution_order_id
  join public.vouchers v
    on v.id = o.voucher_id
  join public.voucher_versions vv
    on vv.id = o.voucher_version_id
  join public.partners p
    on p.id = o.partner_id
  where o.contest_id = p_contest_id
    and o.status = 'approved'
    and o.issued_quantity < o.requested_quantity
    and v.distribution_mode = 'guaranteed_purchase_benefit'
    and v.workflow_status = 'approved'
    and vc.status = 'available'
    and vv.customer_price_miocoins is not null
    and vv.customer_price_miocoins > 0
  order by
    (exists (
      select 1 from public.voucher_issuances vi
      where vi.user_id = v_user and vi.voucher_id = o.voucher_id
    )) asc,
    o.issued_quantity asc,
    o.submitted_at asc,
    vc.created_at asc
  limit 1;

  if not found then
    return jsonb_build_object('available', false);
  end if;

  return jsonb_build_object(
    'available', true,
    'benefit_name', v_offer.benefit_name,
    'benefit_short_description', v_offer.benefit_short_description,
    'partner_name', v_offer.partner_name,
    'price_miocoins', v_offer.price_miocoins,
    'image_url', v_offer.image_url,
    'voucher_id', v_offer.voucher_id
  );
end;
$$;

-- Only the signed-in customer UI needs this. service_role receives an implicit
-- EXECUTE from Supabase default privileges; it is revoked so the grant list is
-- exactly `authenticated`. No backend function calls this lookup.
revoke all on function public.get_guaranteed_benefit_offer(uuid)
  from public, anon, service_role;
grant execute on function public.get_guaranteed_benefit_offer(uuid) to authenticated;

comment on function public.get_guaranteed_benefit_offer(uuid) is
  'Read-only customer offer lookup for the garantovaný nákupní benefit. Same availability gates as purchase_guaranteed_benefit_bundle_atomic, no writes and no locks. Returns only benefit name, short description, partner name, price in MioCoins, image and voucher id; never codes, counts, quantities, partner distribution price, VAT or order ids.';

commit;
