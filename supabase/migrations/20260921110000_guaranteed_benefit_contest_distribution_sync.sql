-- Garantované nákupní benefity — DISTRIBUCE DO SOUTĚŽÍ.
--
-- `voucher_distribution_contests` je runtime vazební tabulka i pro
-- `all_contests` — rozsah se vždy materializuje do skutečných vazeb,
-- nezůstává jen jako text na orderu.
--
-- IZOLACE OD PARTNER OFFERS (závazné):
--   Tato část má VLASTNÍ funkce i VLASTNÍ triggery. Partner Offers
--   (`partner_offer_contests`, `partner_offer_selected_contests`,
--   `trg_fn_link_offers_to_new_contest`, `trg_fn_link_approved_offer_to_contests`,
--   `trg_contest_link_offers`, `assign_partner_offer_to_ticket`) se NEMĚNÍ
--   a nesmí se do nich zasahovat.
--
-- ZÁMĚRNĚ NEDOTČENO: purchase_guaranteed_benefit_bundle_atomic,
--   get_guaranteed_benefit_offer, validate_guaranteed_benefit_links (nákupní
--   větev), zákaznický nákupní flow, buy_ticket_atomic, wallets, payments,
--   contest activation guard.

begin;

-- ---------------------------------------------------------------------------
-- Interní sync jedné distribuce (jeden order)
-- ---------------------------------------------------------------------------
-- Pravidla:
--   * pouze `status = 'approved'` order se kamkoli napojuje — pozastavený
--     (`suspended`) ani ukončený (`ended`) benefit nesmí do nové soutěže,
--   * `all_contests` → dopojí VŠECHNY soutěže ve stavu active/pending, které
--     ještě nemají aktivní vazbu,
--   * `selected_contests` → no-op; zdrojem pravdy je výběr, který spravuje
--     `admin_set_benefit_distribution`,
--   * `single_contest` (legacy) → no-op, aby se historické ordery nezměnily.
--
-- Funkce ZÁMĚRNĚ nikdy neodpojuje. Odpojení je vždy vědomá admin akce.
-- Vazba na soutěž, která později skončí, zůstává jako historický záznam, že
-- tam benefit distribuován byl.
create or replace function public.sync_guaranteed_benefit_order_contests(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_order   record;
  v_actor   uuid := auth.uid();
  v_added   integer := 0;
begin
  select id, status, distribution_scope
  into v_order
  from public.voucher_distribution_orders
  where id = p_order_id;

  if v_order.id is null then
    return 0;
  end if;
  if v_order.status <> 'approved' then
    return 0;
  end if;
  if v_order.distribution_scope <> 'all_contests' then
    return 0;
  end if;

  insert into public.voucher_distribution_contests (order_id, contest_id, attached_by)
  select v_order.id, c.id, v_actor
  from public.contests c
  where c.status in ('active', 'pending')
    and not exists (
      select 1
      from public.voucher_distribution_contests dc
      where dc.order_id = v_order.id
        and dc.contest_id = c.id
        and dc.detached_at is null
    )
  on conflict do nothing;

  get diagnostics v_added = row_count;
  return v_added;
end;
$fn$;

revoke all on function public.sync_guaranteed_benefit_order_contests(uuid) from public;
revoke all on function public.sync_guaranteed_benefit_order_contests(uuid) from anon;
revoke all on function public.sync_guaranteed_benefit_order_contests(uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Trigger na voucher_distribution_orders
-- ---------------------------------------------------------------------------
-- Pokrývá:
--   * nový order vytvořený rovnou jako `approved` + `all_contests`
--     → okamžité vazby na všechny současné active/pending soutěže,
--   * návrat `suspended` → `approved` → doplnění vazeb na současné soutěže,
--   * změnu rozsahu na `all_contests` provedenou mimo admin RPC.
create or replace function public.trg_fn_sync_benefit_order_contests()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.status = 'approved' and new.distribution_scope = 'all_contests' then
    -- Nefatální: selhání synchronizace nesmí shodit vznik ani změnu orderu.
    begin
      perform public.sync_guaranteed_benefit_order_contests(new.id);
    exception when others then
      raise warning 'sync_guaranteed_benefit_order_contests failed for order %: %',
        new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_sync_benefit_order_contests on public.voucher_distribution_orders;
create trigger trg_sync_benefit_order_contests
after insert or update of status, distribution_scope on public.voucher_distribution_orders
for each row execute function public.trg_fn_sync_benefit_order_contests();

-- ---------------------------------------------------------------------------
-- Trigger na contests — budoucí soutěže
-- ---------------------------------------------------------------------------
-- VLASTNÍ trigger garantovaných benefitů. `trg_contest_link_offers`
-- (Partner Offers) zůstává beze změny a běží nezávisle vedle něj.
--
-- Spouští se při vzniku soutěže ve stavu active/pending a při přechodu
-- do active/pending z jiného stavu. Napojí všechny `approved` benefity
-- s rozsahem `all_contests`. Pozastavené ani ukončené benefity se nenapojí.
create or replace function public.trg_fn_link_guaranteed_benefits_to_contest()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if new.status not in ('active', 'pending') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status in ('active', 'pending') then
    return new;
  end if;

  -- Nefatální: chyba v napojení benefitů nesmí zablokovat vznik ani aktivaci
  -- soutěže. Neúspěch se dá dohnat opětovným uložením distribuce.
  begin
    insert into public.voucher_distribution_contests (order_id, contest_id, attached_by)
    select o.id, new.id, auth.uid()
    from public.voucher_distribution_orders o
    join public.vouchers v on v.id = o.voucher_id
    where o.status = 'approved'
      and o.distribution_scope = 'all_contests'
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and not exists (
        select 1
        from public.voucher_distribution_contests dc
        where dc.order_id = o.id
          and dc.contest_id = new.id
          and dc.detached_at is null
      )
    on conflict do nothing;
  exception when others then
    raise warning 'trg_fn_link_guaranteed_benefits_to_contest failed for contest %: %',
      new.id, sqlerrm;
  end;

  return new;
end;
$fn$;

drop trigger if exists trg_link_guaranteed_benefits_to_contest on public.contests;
create trigger trg_link_guaranteed_benefits_to_contest
after insert or update of status on public.contests
for each row execute function public.trg_fn_link_guaranteed_benefits_to_contest();

-- ---------------------------------------------------------------------------
-- admin_set_benefit_distribution — bezpečná synchronizace po změně rozsahu
-- ---------------------------------------------------------------------------
-- all_contests    → NIKDY plošně neodpojuje; jen dopojí současné active/pending.
--                   (Dřívější verze odpojovala všechny vazby, což u přechodu
--                   selected → all mazalo správné vazby. Nevracet.)
-- selected_contests → odpojí pouze odebrané, přidá pouze nové, existující
--                   správné vazby nechá beze změny (partial unique index
--                   + ON CONFLICT DO NOTHING).
create or replace function public.admin_set_benefit_distribution(
  p_order_id    uuid,
  p_scope       text,
  p_contest_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor      uuid := auth.uid();
  v_scope      text := coalesce(nullif(btrim(coalesce(p_scope, '')), ''), '');
  v_order      record;
  v_contest_id uuid;
  v_detached   integer := 0;
  v_attached   integer := 0;
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if v_scope not in ('all_contests', 'selected_contests') then
    return jsonb_build_object('success', false, 'error', 'invalid_distribution_scope');
  end if;

  select * into v_order from public.voucher_distribution_orders where id = p_order_id;
  if v_order.id is null then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  if v_scope = 'selected_contests'
     and coalesce(array_length(p_contest_ids, 1), 0) = 0 then
    return jsonb_build_object('success', false, 'error', 'contest_selection_required');
  end if;

  update public.voucher_distribution_orders
  set distribution_scope = v_scope,
      updated_at = now()
  where id = p_order_id;

  if v_scope = 'selected_contests' then
    -- Odpojit pouze ty, které už ve výběru nejsou. Historii nemazat.
    update public.voucher_distribution_contests
    set detached_at = now(),
        detached_by = v_actor
    where order_id = p_order_id
      and detached_at is null
      and contest_id <> all (coalesce(p_contest_ids, array[]::uuid[]));
    get diagnostics v_detached = row_count;

    foreach v_contest_id in array p_contest_ids loop
      insert into public.voucher_distribution_contests (order_id, contest_id, attached_by)
      values (p_order_id, v_contest_id, v_actor)
      on conflict do nothing;
    end loop;

    select count(*) into v_attached
    from public.voucher_distribution_contests
    where order_id = p_order_id and detached_at is null;
  else
    -- all_contests: dopojit současné active/pending. Trigger na orderu se
    -- postará o totéž, tohle je explicitní a idempotentní cesta pro případ,
    -- kdy se rozsah nemění (UPDATE OF nevystřelí).
    v_attached := public.sync_guaranteed_benefit_order_contests(p_order_id);

    select count(*) into v_attached
    from public.voucher_distribution_contests
    where order_id = p_order_id and detached_at is null;
  end if;

  perform public.log_admin_action(
    'guaranteed_benefit_distribution_set', 'distribution_order', p_order_id, null,
    jsonb_build_object('distribution_scope', v_scope,
                       'requested_contest_count', coalesce(array_length(p_contest_ids, 1), 0),
                       'detached', v_detached,
                       'active_links', v_attached)
  );

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'distribution_scope', v_scope,
    'active_links', v_attached,
    'detached', v_detached
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Backfill: existující approved all_contests ordery dostanou vazby hned
-- ---------------------------------------------------------------------------
do $backfill$
declare
  r record;
begin
  for r in
    select o.id
    from public.voucher_distribution_orders o
    join public.vouchers v on v.id = o.voucher_id
    where o.status = 'approved'
      and o.distribution_scope = 'all_contests'
      and v.distribution_mode = 'guaranteed_purchase_benefit'
  loop
    perform public.sync_guaranteed_benefit_order_contests(r.id);
  end loop;
end
$backfill$;

commit;
