-- Garantované nákupní benefity — NAPOJENÍ NÁKUPU NA MATERIALIZOVANÉ VAZBY.
--
-- Nákup nově nevybírá benefit podle `voucher_distribution_orders.contest_id`,
-- ale podle aktivních vazeb ve `voucher_distribution_contests`. Tím se do
-- nákupu dostanou i benefity s rozsahem `all_contests` / `selected_contests`,
-- které `contest_id` vůbec nemají (`NULL`).
--
-- PRAVIDLA VÝBĚRU (závazné pořadí):
--   1. OMEZENÝ benefit má VŽDY přednost (approved, aktivní vazba na soutěž,
--      volný `voucher_code`, nevyčerpaná zásoba).
--   2. NEOMEZENÝ benefit je POUZE fallback, když žádný omezený není
--      k dispozici (approved, `is_unlimited`, aktivní vazba na soutěž,
--      verze `shared_static` se `shared_code_or_url`).
--
-- ZÁMĚRNĚ NEDOTČENO: buy_ticket_atomic (včetně oprávnění), frontendový
--   fallback na buy_ticket_atomic, contest activation guard, Partner Offers,
--   wallets mimo dnešní odečet, feature flag, allowlist, idempotency,
--   assign_contest_ticket_atomic, dnešní billing pravidlo.

begin;

-- ---------------------------------------------------------------------------
-- Neomezený benefit nespotřebovává voucher_codes → issuance bez kódu
-- ---------------------------------------------------------------------------
-- UNIQUE index na sloupci zůstává; v Postgresu je více NULL hodnot povoleno,
-- takže se nic neuvolňuje pro omezené benefity — ty musí mít kód dál vždy
-- (vynucuje `validate_guaranteed_benefit_links`).
alter table public.voucher_issuances
  alter column voucher_code_id drop not null;

-- ---------------------------------------------------------------------------
-- validate_guaranteed_benefit_links — kontrola přes vazební tabulku
-- ---------------------------------------------------------------------------
-- Větve `vouchers` a `voucher_distribution_orders` zůstávají beze změny.
-- Ve větvi `voucher_issuances` se mění dvě věci:
--   * vazba soutěže se ověřuje přes `voucher_distribution_contests`;
--     historické `single_contest` záznamy dál projdou přes legacy shodu
--     `order.contest_id = ticket.contest_id`,
--   * `voucher_code_id` smí být NULL POUZE u skutečně neomezeného orderu,
--     jehož verze používá `shared_static` se `shared_code_or_url`.
create or replace function public.validate_guaranteed_benefit_links()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_partner_id uuid;
  v_voucher_id uuid;
  v_version_status text;
  v_order record;
  v_ticket record;
  v_user_voucher record;
  v_linked boolean;
begin
  if tg_table_name = 'vouchers' then
    if new.current_approved_version_id is not null then
      select vv.voucher_id, vv.status
        into v_voucher_id, v_version_status
      from public.voucher_versions vv
      where vv.id = new.current_approved_version_id;
      if v_voucher_id is distinct from new.id or v_version_status <> 'approved' then
        raise exception 'Current approved version must be approved and belong to the voucher';
      end if;
    end if;
  elsif tg_table_name = 'voucher_distribution_orders' then
    select v.partner_id into v_partner_id
    from public.vouchers v where v.id = new.voucher_id;
    select vv.voucher_id, vv.status into v_voucher_id, v_version_status
    from public.voucher_versions vv where vv.id = new.voucher_version_id;
    if v_partner_id is distinct from new.partner_id
       or v_voucher_id is distinct from new.voucher_id then
      raise exception 'Order partner, voucher and version do not match';
    end if;
    if new.status in ('approved', 'suspended', 'ended')
       and v_version_status <> 'approved' then
      raise exception 'Only an approved voucher version can be distributed';
    end if;
  elsif tg_table_name = 'voucher_issuances' then
    select * into v_order
    from public.voucher_distribution_orders
    where id = new.distribution_order_id;
    select user_id, contest_id into v_ticket
    from public.tickets where id = new.ticket_id;
    select user_id, voucher_id, voucher_code_id, acquisition_source
      into v_user_voucher
    from public.user_vouchers where id = new.user_voucher_id;

    if v_order.status <> 'approved'
       or v_order.voucher_id is distinct from new.voucher_id
       or v_order.voucher_version_id is distinct from new.voucher_version_id
       or v_ticket.user_id is distinct from new.user_id
       or v_user_voucher.user_id is distinct from new.user_id
       or v_user_voucher.voucher_id is distinct from new.voucher_id
       or v_user_voucher.voucher_code_id is distinct from new.voucher_code_id
       or v_user_voucher.acquisition_source <> 'guaranteed_purchase_benefit'
       or v_order.unit_price_ex_vat_snapshot <> new.unit_price_ex_vat_snapshot
       or v_order.vat_rate_percent_snapshot <> new.vat_rate_percent_snapshot
       or v_order.currency_snapshot <> new.currency_snapshot then
      raise exception 'Issuance links or historical price snapshot do not match';
    end if;

    -- Soutěž musí být na distribuci skutečně navázaná. Historické
    -- `single_contest` ordery projdou i bez vazby přes legacy shodu, aby
    -- se už existující záznamy nerozbily.
    v_linked := exists (
      select 1
      from public.voucher_distribution_contests dc
      where dc.order_id = new.distribution_order_id
        and dc.contest_id = v_ticket.contest_id
        and dc.detached_at is null
    );
    if not v_linked
       and v_order.contest_id is distinct from v_ticket.contest_id then
      raise exception 'Issuance contest is not linked to the distribution order';
    end if;

    if new.voucher_code_id is not null then
      -- Omezený benefit: dál vyžadujeme platný vydaný kód.
      if not exists (
        select 1 from public.voucher_codes vc
        where vc.id = new.voucher_code_id
          and vc.voucher_id = new.voucher_id
          and vc.distribution_order_id = new.distribution_order_id
          and vc.status = 'issued'
          and vc.issued_to_user_id = new.user_id
          and vc.issued_user_voucher_id = new.user_voucher_id
      ) then
        raise exception 'Issued voucher code does not match the issuance';
      end if;
    else
      -- Chybějící kód smí mít POUZE skutečně neomezený benefit se sdíleným
      -- statickým kódem. Jinak by šlo obejít zásobu kódů.
      if not coalesce(v_order.is_unlimited, false) then
        raise exception 'Only an unlimited benefit issuance may omit the voucher code';
      end if;
      if not exists (
        select 1 from public.voucher_versions vv
        where vv.id = new.voucher_version_id
          and vv.code_source = 'shared_static'
          and vv.shared_code_or_url is not null
          and length(btrim(vv.shared_code_or_url)) > 0
      ) then
        raise exception 'An unlimited benefit issuance requires a shared static code';
      end if;
    end if;

    if exists (
      select 1
      from public.voucher_issuances vi
      where vi.user_id = new.user_id
        and vi.voucher_id = new.voucher_id
        and vi.id <> new.id
    ) then
      if new.billable or new.billing_reason <> 'repeat_customer_issuance' then
        raise exception 'A repeated customer benefit issuance must not be billable';
      end if;
    elsif not new.billable or new.billing_reason <> 'first_customer_issuance' then
      raise exception 'The first customer benefit issuance must be billable';
    end if;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- get_guaranteed_benefit_offer — dostupnost přes vazby
-- ---------------------------------------------------------------------------
-- Nabídka je dostupná, když je k dispozici omezený NEBO neomezený benefit.
create or replace function public.get_guaranteed_benefit_offer(p_contest_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user           uuid := auth.uid();
  v_flag           text;
  v_allowlist      text;
  v_contest_status text;
  v_ticket_price   numeric;
begin
  if v_user is null then
    return jsonb_build_object('available', false);
  end if;

  select value into v_flag from public.settings
  where key = 'guaranteed_benefit_purchase_enabled';
  if coalesce(v_flag, 'false') <> 'true' then
    return jsonb_build_object('available', false);
  end if;

  select value into v_allowlist from public.settings
  where key = 'guaranteed_benefit_purchase_contest_allowlist';
  if v_allowlist is not null
     and btrim(v_allowlist) not in ('', '[]')
     and not (v_allowlist::jsonb ? p_contest_id::text) then
    return jsonb_build_object('available', false);
  end if;

  select status, ticket_price into v_contest_status, v_ticket_price
  from public.contests where id = p_contest_id;
  if not found or v_contest_status <> 'active' then
    return jsonb_build_object('available', false);
  end if;

  -- Omezený benefit (přednostní).
  if exists (
    select 1
    from public.voucher_codes vc
    join public.voucher_distribution_orders o on o.id = vc.distribution_order_id
    join public.vouchers v on v.id = o.voucher_id
    where o.status = 'approved'
      and not o.is_unlimited
      and o.issued_quantity < o.requested_quantity
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vc.status = 'available'
      and exists (
        select 1 from public.voucher_distribution_contests dc
        where dc.order_id = o.id
          and dc.contest_id = p_contest_id
          and dc.detached_at is null
      )
  ) then
    return jsonb_build_object('available', true, 'price_miocoins', v_ticket_price);
  end if;

  -- Neomezený benefit (fallback).
  if exists (
    select 1
    from public.voucher_distribution_orders o
    join public.vouchers v on v.id = o.voucher_id
    join public.voucher_versions vv on vv.id = o.voucher_version_id
    where o.status = 'approved'
      and o.is_unlimited
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vv.status = 'approved'
      and vv.code_source = 'shared_static'
      and vv.shared_code_or_url is not null
      and length(btrim(vv.shared_code_or_url)) > 0
      and exists (
        select 1 from public.voucher_distribution_contests dc
        where dc.order_id = o.id
          and dc.contest_id = p_contest_id
          and dc.detached_at is null
      )
  ) then
    return jsonb_build_object('available', true, 'price_miocoins', v_ticket_price);
  end if;

  return jsonb_build_object('available', false);
end;
$function$;

-- ---------------------------------------------------------------------------
-- purchase_guaranteed_benefit_bundle_atomic — výběr benefitu přes vazby
-- ---------------------------------------------------------------------------
-- Beze změny zůstávají: feature flag, allowlist, idempotency přes
-- `contest_bundle_purchases`, zámek peněženky a odečet, vznik tiketu přes
-- `assign_contest_ticket_atomic`, `wallet_transactions`, billing pravidlo
-- (první vydání benefitu zákazníkovi = billable, opakované = non-billable)
-- a atomicita přes `begin … exception` blok: jakákoli chyba rollbackne
-- celý nákup včetně pending řádku `contest_bundle_purchases`.
create or replace function public.purchase_guaranteed_benefit_bundle_atomic(
  p_user_id uuid, p_contest_id uuid, p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_flag text; v_allowlist text; v_contest_status text; v_price numeric;
  v_bundle_id uuid; v_existing public.contest_bundle_purchases%rowtype;
  v_sel record; v_billable boolean; v_billing_reason text;
  v_wallet_id uuid; v_balance numeric; v_new_balance numeric;
  v_uv_id uuid; v_ticket_id uuid; v_issuance_id uuid; v_ticket jsonb; v_fail text;
  v_is_unlimited boolean := false;
  v_code_id uuid;
  v_customer_code text;
begin
  if v_user is null then return jsonb_build_object('success', false, 'error', 'unauthorized'); end if;
  if p_user_id is not null and p_user_id <> v_user then return jsonb_build_object('success', false, 'error', 'forbidden'); end if;
  if p_idempotency_key is null then return jsonb_build_object('success', false, 'error', 'idempotency_key_required'); end if;

  select value into v_flag from public.settings where key = 'guaranteed_benefit_purchase_enabled';
  if coalesce(v_flag, 'false') <> 'true' then return jsonb_build_object('success', false, 'error', 'feature_disabled'); end if;

  select value into v_allowlist from public.settings where key = 'guaranteed_benefit_purchase_contest_allowlist';
  if v_allowlist is not null and btrim(v_allowlist) not in ('', '[]')
     and not (v_allowlist::jsonb ? p_contest_id::text) then
    return jsonb_build_object('success', false, 'error', 'contest_not_in_pilot');
  end if;

  select status, ticket_price into v_contest_status, v_price
  from public.contests where id = p_contest_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'contest_not_found'); end if;
  if v_contest_status <> 'active' then return jsonb_build_object('success', false, 'error', 'contest_not_active'); end if;

  begin
    insert into public.contest_bundle_purchases (idempotency_key, user_id, contest_id, charged_miocoins, status)
    values (p_idempotency_key, v_user, p_contest_id, 0, 'pending')
    on conflict (user_id, idempotency_key) do nothing returning id into v_bundle_id;

    if v_bundle_id is null then
      select * into v_existing from public.contest_bundle_purchases
      where user_id = v_user and idempotency_key = p_idempotency_key;
      if v_existing.status = 'completed' then
        return jsonb_build_object('success', true, 'idempotent', true,
          'ticket_row_id', v_existing.ticket_id,
          'voucher_issuance_id', v_existing.voucher_issuance_id,
          'charged_miocoins', v_existing.charged_miocoins);
      end if;
      v_fail := 'purchase_already_in_progress'; raise exception 'GB_FAIL';
    end if;

    -- ── 1) OMEZENÝ BENEFIT (vždy přednost) ────────────────────────────────
    -- Zachovává dnešní preferenci benefitu, který zákazník ještě nedostal,
    -- i bezpečný souběh nad posledními kódy (FOR UPDATE … SKIP LOCKED).
    select vc.id as code_id, o.id as order_id, o.voucher_id as voucher_id,
           o.voucher_version_id as voucher_version_id,
           o.unit_price_ex_vat_snapshot as unit_price_ex_vat_snapshot,
           o.vat_rate_percent_snapshot as vat_rate_percent_snapshot,
           o.currency_snapshot as currency_snapshot,
           vc.code as customer_code
    into v_sel
    from public.voucher_codes vc
    join public.voucher_distribution_orders o on o.id = vc.distribution_order_id
    join public.vouchers v on v.id = o.voucher_id
    where o.status = 'approved'
      and not o.is_unlimited
      and o.issued_quantity < o.requested_quantity
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vc.status = 'available'
      and exists (
        select 1 from public.voucher_distribution_contests dc
        where dc.order_id = o.id
          and dc.contest_id = p_contest_id
          and dc.detached_at is null
      )
    order by
      (exists (select 1 from public.voucher_issuances vi
               where vi.user_id = v_user and vi.voucher_id = o.voucher_id)) asc,
      random()
    for update of vc skip locked limit 1;

    if found then
      v_is_unlimited := false;
      v_code_id      := v_sel.code_id;
      v_customer_code := v_sel.customer_code;
    else
      -- ── 2) NEOMEZENÝ BENEFIT (fallback) ─────────────────────────────────
      -- Nespotřebovává ani nevytváří `voucher_codes`; zákazník dostane
      -- sdílený kód/odkaz ze `voucher_versions.shared_code_or_url`.
      select null::uuid as code_id, o.id as order_id, o.voucher_id as voucher_id,
             o.voucher_version_id as voucher_version_id,
             o.unit_price_ex_vat_snapshot as unit_price_ex_vat_snapshot,
             o.vat_rate_percent_snapshot as vat_rate_percent_snapshot,
             o.currency_snapshot as currency_snapshot,
             vv.shared_code_or_url as customer_code
      into v_sel
      from public.voucher_distribution_orders o
      join public.vouchers v on v.id = o.voucher_id
      join public.voucher_versions vv on vv.id = o.voucher_version_id
      where o.status = 'approved'
        and o.is_unlimited
        and v.distribution_mode = 'guaranteed_purchase_benefit'
        and v.workflow_status = 'approved'
        and vv.status = 'approved'
        and vv.code_source = 'shared_static'
        and vv.shared_code_or_url is not null
        and length(btrim(vv.shared_code_or_url)) > 0
        and exists (
          select 1 from public.voucher_distribution_contests dc
          where dc.order_id = o.id
            and dc.contest_id = p_contest_id
            and dc.detached_at is null
        )
      order by
        (exists (select 1 from public.voucher_issuances vi
                 where vi.user_id = v_user and vi.voucher_id = o.voucher_id)) asc,
        random()
      limit 1;

      if not found then v_fail := 'no_benefit_available'; raise exception 'GB_FAIL'; end if;

      v_is_unlimited := true;
      v_code_id      := null;
      v_customer_code := v_sel.customer_code;
    end if;

    v_billable := not exists (select 1 from public.voucher_issuances vi
                              where vi.user_id = v_user and vi.voucher_id = v_sel.voucher_id);
    v_billing_reason := case when v_billable then 'first_customer_issuance' else 'repeat_customer_issuance' end;

    select id, balance_coins into v_wallet_id, v_balance
    from public.wallets where user_id = v_user for update;
    if v_wallet_id is null then v_fail := 'wallet_not_found'; raise exception 'GB_FAIL'; end if;
    if v_balance is null or v_balance < v_price then v_fail := 'insufficient_miocoins'; raise exception 'GB_FAIL'; end if;
    v_new_balance := v_balance - v_price;
    update public.wallets set balance_coins = v_new_balance where id = v_wallet_id;

    insert into public.user_vouchers (user_id, voucher_id, voucher_code_id, acquisition_source, redeemed)
    values (v_user, v_sel.voucher_id, v_code_id, 'guaranteed_purchase_benefit', true)
    returning id into v_uv_id;

    if v_code_id is not null then
      update public.voucher_codes
      set status = 'issued', issued_to_user_id = v_user, issued_user_voucher_id = v_uv_id, issued_at = now()
      where id = v_code_id;
    end if;

    v_ticket := public."assign_contest_ticket_atomic"(v_user, p_contest_id);
    if coalesce(v_ticket->>'success', 'false') <> 'true' then
      v_fail := coalesce(v_ticket->>'error', 'ticket_creation_failed'); raise exception 'GB_FAIL';
    end if;
    v_ticket_id := (v_ticket->>'ticket_row_id')::uuid;

    insert into public.voucher_issuances (
      distribution_order_id, voucher_id, voucher_version_id, voucher_code_id,
      user_id, user_voucher_id, ticket_id, billable, billing_reason,
      unit_price_ex_vat_snapshot, vat_rate_percent_snapshot, currency_snapshot
    ) values (
      v_sel.order_id, v_sel.voucher_id, v_sel.voucher_version_id, v_code_id,
      v_user, v_uv_id, v_ticket_id, v_billable, v_billing_reason,
      v_sel.unit_price_ex_vat_snapshot, v_sel.vat_rate_percent_snapshot, v_sel.currency_snapshot
    ) returning id into v_issuance_id;

    insert into public.wallet_transactions
      (user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata)
    values (v_user, v_wallet_id, -v_price, v_new_balance, 'benefit_purchase',
      'purchase_guaranteed_benefit_bundle_atomic', v_ticket_id,
      jsonb_build_object('contest_id', p_contest_id, 'voucher_id', v_sel.voucher_id,
        'voucher_issuance_id', v_issuance_id, 'is_unlimited', v_is_unlimited,
        'ticket_number', (v_ticket->>'ticket_number')::integer, 'free_ticket', true));

    -- `issued_quantity` roste i u neomezeného benefitu kvůli reportingu;
    -- `billable_issued_quantity` dál podle dnešního pravidla.
    update public.voucher_distribution_orders
    set issued_quantity = issued_quantity + 1,
        billable_issued_quantity = billable_issued_quantity + (case when v_billable then 1 else 0 end),
        updated_at = now()
    where id = v_sel.order_id;

    update public.contest_bundle_purchases
    set status = 'completed', ticket_id = v_ticket_id, voucher_issuance_id = v_issuance_id,
        charged_miocoins = v_price, completed_at = now()
    where id = v_bundle_id;

    return jsonb_build_object(
      'success', true, 'idempotent', false,
      'ticket_row_id', v_ticket_id, 'ticket_number', (v_ticket->>'ticket_number')::integer,
      'ticket_free', true, 'won_type', v_ticket->'won_type', 'won_prize', v_ticket->'won_prize',
      'remaining_tickets', (v_ticket->>'remaining_tickets')::integer,
      'next_bonus_position', v_ticket->'next_bonus_position',
      'distance_to_next_bonus', v_ticket->'distance_to_next_bonus',
      'voucher_id', v_sel.voucher_id, 'user_voucher_id', v_uv_id,
      'voucher_issuance_id', v_issuance_id, 'billable', v_billable,
      'is_unlimited', v_is_unlimited,
      'charged_miocoins', v_price,
      'coupon', (
        select jsonb_build_object(
          'name', vv.name, 'short_description', vv.short_description,
          'how_to_use', vv.how_to_use_text, 'terms', vv.terms_text,
          'partner_name', coalesce(nullif(btrim(p.company_name), ''), p.name),
          'image_url', coalesce(vv.image_url, v.image_url),
          'code', v_customer_code, 'valid_until', vv.valid_until)
        from public.voucher_versions vv
        join public.vouchers v on v.id = vv.voucher_id
        join public.partners p on p.id = v.partner_id
        where vv.id = v_sel.voucher_version_id)
    );
  exception
    when others then
      return jsonb_build_object('success', false, 'error', coalesce(v_fail, sqlerrm));
  end;
end;
$function$;

commit;
