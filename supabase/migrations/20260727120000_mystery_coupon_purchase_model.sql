-- ============================================================================
-- Mystery kupon — finální nákupní model
-- ============================================================================
-- Opravuje dvě věci proti předchozí verzi:
--
--   1. CENA. Mystery nákup stojí vždy `contests.ticket_price` — tedy přesně tu
--      částku, která už je na tlačítku „Uplatnit X MioCoinů". Cena uložená na
--      `voucher_versions.customer_price_miocoins` se pro mystery nákup NEPOUŽÍVÁ
--      (sloupec zůstává kvůli historii a schváleným podmínkám, jen už neurčuje,
--      kolik zákazník zaplatí). Díky tomu může být v jedné soutěži víc kuponů
--      s různými podmínkami a cena na tlačítku je pořád jednoznačná.
--
--   2. UTAJENÍ. `get_guaranteed_benefit_offer` vrací pouze `available` a
--      `price_miocoins`. Název kuponu, partnera ani obrázek zákazník před
--      nákupem nevidí — o to jde: kupon je mystery.
--
-- Navíc: výběr kuponu je nyní NÁHODNÝ mezi dostupnými schválenými kupony
-- přiřazenými k soutěži. Zachovává se přednost kuponu, který zákazník ještě
-- neměl, takže se nejdřív rozdají nové a teprve pak se opakuje.
--
-- Nemění se: buy_ticket_atomic, assign_contest_ticket_atomic, peněženky, RLS,
-- výherní logika, fakturace. Jedna transakce, idempotence a fail-closed
-- chování zůstávají beze změny.
-- ============================================================================

begin;

do $$
begin
  if to_regprocedure('public.get_guaranteed_benefit_offer(uuid)') is null
     or to_regprocedure('public.purchase_guaranteed_benefit_bundle_atomic(uuid,uuid,uuid)') is null
     or to_regprocedure('public."assign_contest_ticket_atomic"(uuid,uuid)') is null then
    raise exception 'Missing mystery coupon dependency';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Nabídka: jen dostupnost a cena. Nic o konkrétním kuponu.
-- ---------------------------------------------------------------------------
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
  v_ticket_price   numeric;
begin
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

  select status, ticket_price
  into v_contest_status, v_ticket_price
  from public.contests
  where id = p_contest_id;
  if not found or v_contest_status <> 'active' then
    return jsonb_build_object('available', false);
  end if;

  -- Stačí zjistit, že je aspoň jeden použitelný kupon. Který to bude, se
  -- rozhodne až při nákupu — a zákazník se to dozví teprve po něm.
  if not exists (
    select 1
    from public.voucher_codes vc
    join public.voucher_distribution_orders o on o.id = vc.distribution_order_id
    join public.vouchers v on v.id = o.voucher_id
    where o.contest_id = p_contest_id
      and o.status = 'approved'
      and o.issued_quantity < o.requested_quantity
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vc.status = 'available'
  ) then
    return jsonb_build_object('available', false);
  end if;

  -- Cena mystery nákupu = cena tiketu soutěže (tj. co už je na tlačítku).
  return jsonb_build_object(
    'available', true,
    'price_miocoins', v_ticket_price
  );
end;
$$;

revoke all on function public.get_guaranteed_benefit_offer(uuid)
  from public, anon, service_role;
grant execute on function public.get_guaranteed_benefit_offer(uuid) to authenticated;

comment on function public.get_guaranteed_benefit_offer(uuid) is
  'Mystery kupon: vrací pouze dostupnost a cenu (= contests.ticket_price). Nikdy nevrací název kuponu, partnera, obrázek, kódy, počty ani distribuční ceny — zákazník kupon vidí až po nákupu.';

-- ---------------------------------------------------------------------------
-- Nákup: cena = contests.ticket_price, náhodný kupon, tiket zdarma.
-- ---------------------------------------------------------------------------
create or replace function public."purchase_guaranteed_benefit_bundle_atomic"(
  p_user_id uuid,
  p_contest_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user            uuid := auth.uid();
  v_flag            text;
  v_allowlist       text;
  v_contest_status  text;
  v_price           numeric;
  v_bundle_id       uuid;
  v_existing        public.contest_bundle_purchases%rowtype;
  v_code            record;
  v_billable        boolean;
  v_billing_reason  text;
  v_wallet_id       uuid;
  v_balance         numeric;
  v_new_balance     numeric;
  v_uv_id           uuid;
  v_ticket_id       uuid;
  v_issuance_id     uuid;
  v_ticket          jsonb;
  v_fail            text;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;
  if p_user_id is not null and p_user_id <> v_user then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if p_idempotency_key is null then
    return jsonb_build_object('success', false, 'error', 'idempotency_key_required');
  end if;

  select value into v_flag
  from public.settings
  where key = 'guaranteed_benefit_purchase_enabled';
  if coalesce(v_flag, 'false') <> 'true' then
    return jsonb_build_object('success', false, 'error', 'feature_disabled');
  end if;

  select value into v_allowlist
  from public.settings
  where key = 'guaranteed_benefit_purchase_contest_allowlist';
  if v_allowlist is not null
     and btrim(v_allowlist) not in ('', '[]')
     and not (v_allowlist::jsonb ? p_contest_id::text) then
    return jsonb_build_object('success', false, 'error', 'contest_not_in_pilot');
  end if;

  -- Zámek soutěže + cena mystery nákupu (stejné pořadí zámků jako klasický tok).
  select status, ticket_price
  into v_contest_status, v_price
  from public.contests where id = p_contest_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'contest_not_found');
  end if;
  if v_contest_status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'contest_not_active');
  end if;

  begin
    insert into public.contest_bundle_purchases (
      idempotency_key, user_id, contest_id, charged_miocoins, status
    ) values (
      p_idempotency_key, v_user, p_contest_id, 0, 'pending'
    )
    on conflict (user_id, idempotency_key) do nothing
    returning id into v_bundle_id;

    if v_bundle_id is null then
      select * into v_existing
      from public.contest_bundle_purchases
      where user_id = v_user and idempotency_key = p_idempotency_key;
      if v_existing.status = 'completed' then
        return jsonb_build_object(
          'success', true,
          'idempotent', true,
          'ticket_row_id', v_existing.ticket_id,
          'voucher_issuance_id', v_existing.voucher_issuance_id,
          'charged_miocoins', v_existing.charged_miocoins
        );
      end if;
      v_fail := 'purchase_already_in_progress';
      raise exception 'GB_FAIL';
    end if;

    -- Náhodný mystery kupon z dostupných schválených kuponů této soutěže.
    -- Přednost dostane kupon, který zákazník ještě neměl; uvnitř téže skupiny
    -- se pořadí losuje, takže se kupony rozdávají různě.
    select vc.id                          as code_id,
           o.id                           as order_id,
           o.voucher_id                   as voucher_id,
           o.voucher_version_id           as voucher_version_id,
           o.unit_price_ex_vat_snapshot   as unit_price_ex_vat_snapshot,
           o.vat_rate_percent_snapshot    as vat_rate_percent_snapshot,
           o.currency_snapshot            as currency_snapshot
    into v_code
    from public.voucher_codes vc
    join public.voucher_distribution_orders o
      on o.id = vc.distribution_order_id
    join public.vouchers v
      on v.id = o.voucher_id
    where o.contest_id = p_contest_id
      and o.status = 'approved'
      and o.issued_quantity < o.requested_quantity
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vc.status = 'available'
    order by
      (exists (
        select 1 from public.voucher_issuances vi
        where vi.user_id = v_user and vi.voucher_id = o.voucher_id
      )) asc,
      random()
    for update of vc skip locked
    limit 1;

    if not found then
      v_fail := 'no_benefit_available';
      raise exception 'GB_FAIL';
    end if;

    v_billable := not exists (
      select 1 from public.voucher_issuances vi
      where vi.user_id = v_user and vi.voucher_id = v_code.voucher_id
    );
    v_billing_reason := case
      when v_billable then 'first_customer_issuance'
      else 'repeat_customer_issuance'
    end;

    -- Odečet ceny mystery nákupu (= cena tiketu soutěže).
    select id, balance_coins into v_wallet_id, v_balance
    from public.wallets where user_id = v_user for update;
    if v_wallet_id is null then
      v_fail := 'wallet_not_found';
      raise exception 'GB_FAIL';
    end if;
    if v_balance is null or v_balance < v_price then
      v_fail := 'insufficient_miocoins';
      raise exception 'GB_FAIL';
    end if;
    v_new_balance := v_balance - v_price;
    update public.wallets set balance_coins = v_new_balance where id = v_wallet_id;

    insert into public.user_vouchers (
      user_id, voucher_id, voucher_code_id, acquisition_source, redeemed
    ) values (
      v_user, v_code.voucher_id, v_code.code_id, 'guaranteed_purchase_benefit', true
    )
    returning id into v_uv_id;

    update public.voucher_codes
    set status = 'issued',
        issued_to_user_id = v_user,
        issued_user_voucher_id = v_uv_id,
        issued_at = now()
    where id = v_code.code_id;

    -- Tiket ZDARMA přes sdílený helper (žádný odečet, žádný ticket_purchase).
    v_ticket := public."assign_contest_ticket_atomic"(v_user, p_contest_id);
    if coalesce(v_ticket->>'success', 'false') <> 'true' then
      v_fail := coalesce(v_ticket->>'error', 'ticket_creation_failed');
      raise exception 'GB_FAIL';
    end if;
    v_ticket_id := (v_ticket->>'ticket_row_id')::uuid;

    insert into public.voucher_issuances (
      distribution_order_id, voucher_id, voucher_version_id, voucher_code_id,
      user_id, user_voucher_id, ticket_id, billable, billing_reason,
      unit_price_ex_vat_snapshot, vat_rate_percent_snapshot, currency_snapshot
    ) values (
      v_code.order_id, v_code.voucher_id, v_code.voucher_version_id, v_code.code_id,
      v_user, v_uv_id, v_ticket_id, v_billable, v_billing_reason,
      v_code.unit_price_ex_vat_snapshot, v_code.vat_rate_percent_snapshot,
      v_code.currency_snapshot
    )
    returning id into v_issuance_id;

    insert into public.wallet_transactions
      (user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata)
    values
      (v_user, v_wallet_id, -v_price, v_new_balance, 'benefit_purchase',
       'purchase_guaranteed_benefit_bundle_atomic', v_ticket_id,
       jsonb_build_object(
         'contest_id', p_contest_id,
         'voucher_id', v_code.voucher_id,
         'voucher_issuance_id', v_issuance_id,
         'ticket_number', (v_ticket->>'ticket_number')::integer,
         'free_ticket', true));

    update public.voucher_distribution_orders
    set issued_quantity = issued_quantity + 1,
        billable_issued_quantity =
          billable_issued_quantity + (case when v_billable then 1 else 0 end),
        updated_at = now()
    where id = v_code.order_id;

    update public.contest_bundle_purchases
    set status = 'completed',
        ticket_id = v_ticket_id,
        voucher_issuance_id = v_issuance_id,
        charged_miocoins = v_price,
        completed_at = now()
    where id = v_bundle_id;

    -- Teprve TEĎ se kupon odhaluje — po zaplacení.
    return jsonb_build_object(
      'success', true,
      'idempotent', false,
      'ticket_row_id', v_ticket_id,
      'ticket_number', (v_ticket->>'ticket_number')::integer,
      'ticket_free', true,
      'won_type', v_ticket->'won_type',
      'won_prize', v_ticket->'won_prize',
      'remaining_tickets', (v_ticket->>'remaining_tickets')::integer,
      'next_bonus_position', v_ticket->'next_bonus_position',
      'distance_to_next_bonus', v_ticket->'distance_to_next_bonus',
      'voucher_id', v_code.voucher_id,
      'user_voucher_id', v_uv_id,
      'voucher_issuance_id', v_issuance_id,
      'billable', v_billable,
      'charged_miocoins', v_price,
      'coupon', (
        select jsonb_build_object(
          'name', vv.name,
          'short_description', vv.short_description,
          'how_to_use', vv.how_to_use_text,
          'terms', vv.terms_text,
          'partner_name', coalesce(nullif(btrim(p.company_name), ''), p.name),
          'image_url', coalesce(vv.image_url, v.image_url),
          'code', vc.code,
          'valid_until', vv.valid_until
        )
        from public.voucher_versions vv
        join public.vouchers v on v.id = vv.voucher_id
        join public.partners p on p.id = v.partner_id
        join public.voucher_codes vc on vc.id = v_code.code_id
        where vv.id = v_code.voucher_version_id
      )
    );

  exception
    when others then
      return jsonb_build_object(
        'success', false,
        'error', coalesce(v_fail, sqlerrm)
      );
  end;
end;
$$;

revoke all on function public."purchase_guaranteed_benefit_bundle_atomic"(uuid, uuid, uuid)
  from public, anon;
grant execute on function public."purchase_guaranteed_benefit_bundle_atomic"(uuid, uuid, uuid)
  to authenticated, service_role;

comment on function public."purchase_guaranteed_benefit_bundle_atomic"(uuid, uuid, uuid) is
  'Mystery kupon: účtuje contests.ticket_price jako benefit_purchase, vydá NÁHODNÝ dostupný schválený kupon (přednost má kupon, který zákazník ještě neměl) a tiket vytvoří ZDARMA přes assign_contest_ticket_atomic. Kupon i jeho kód vrací až po úspěšném nákupu. Jedna transakce, idempotentní, fail-closed.';

commit;
