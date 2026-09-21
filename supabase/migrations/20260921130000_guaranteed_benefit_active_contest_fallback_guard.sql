-- Garantované nákupní benefity — OCHRANA AKTIVNÍ SOUTĚŽE PŘED ZTRÁTOU
-- POSLEDNÍHO NEOMEZENÉHO FALLBACKU.
--
-- ZÁVAZNÉ PRAVIDLO: každá soutěž ve stavu `active` musí mít vždy alespoň
-- jeden approved, `is_unlimited=true` garantovaný nákupní benefit s aktivní
-- vazbou v `voucher_distribution_contests`. Tento stav se kontroluje jak při
-- aktivaci soutěže, tak i později u každé admin akce, která by mohla
-- poslední takový benefit soutěži odebrat.
--
-- IZOLACE OD PARTNER OFFERS (závazné, neměnit):
--   Partner Offers triggery (`trg_contest_link_offers`,
--   `trg_fn_link_offers_to_new_contest`) se touto migrací NEDOTÝKAJÍ.
--
-- ARCHITEKTURA GUARDU NA `contests` (AFTER, ne BEFORE):
--   Guard je AFTER INSERT OR UPDATE OF status trigger, ne BEFORE. Důvod:
--   u INSERTu rovnou jako `active` ještě neexistuje řádek v `contests`, když
--   BEFORE trigger běží — pokus o INSERT do `voucher_distribution_contests`
--   (FK na contests.id) by proto vždy selhal na cizím klíči. AFTER trigger
--   běží až po fyzickém vložení řádku (byť ještě v nezacommitnuté transakci,
--   je uvnitř téže transakce viditelný), takže FK insert projde. Pokud guard
--   po pokusu o synchronizaci pořád nenajde platný fallback, vyhodí výjimku,
--   která rollbackne CELOU transakci — tedy i právě vložený řádek `contests`.
--   Z pohledu klienta je efekt identický s BEFORE trigger odmítnutím.
--
--   Jméno triggeru `trg_require_unlimited_benefit_for_active_contest` je
--   záměrně zvoleno tak, aby v abecedním pořadí (Postgres spouští AFTER
--   triggery na stejnou událost abecedně) běželo AŽ PO
--   `trg_link_guaranteed_benefits_to_contest` — guard tak vidí výsledek
--   existující (nefatální) synchronizace dřív, než sám provede vlastní
--   pokus o domaterializování a finální kontrolu.
--
-- BĚŽNÉ UPDATY AKTIVNÍ SOUTĚŽE (např. next_ticket_number přes
--   buy_ticket_atomic) guard NEBLOKUJE: trigger je vázán na
--   `UPDATE OF status` (nespustí se, pokud UPDATE sloupec status vůbec
--   nemění v SET klauzuli) a funkce navíc explicitně přeskočí kontrolu,
--   pokud `old.status` už `active` bylo.
--
-- KILL-SWITCH: `settings.guaranteed_benefit_active_contest_guard_enabled`.
--   Chybějící řádek nebo hodnota různá od `'false'` znamená guard ZAPNUTÝ
--   (fail-safe default). Na stagingu explicitně nastaveno na `'true'`, aby
--   šel guard rovnou testovat. Produkce touto migrací vůbec není dotčena.

begin;

-- ---------------------------------------------------------------------------
-- Kill-switch (staging default: zapnuto)
-- ---------------------------------------------------------------------------
insert into public.settings (key, value)
values ('guaranteed_benefit_active_contest_guard_enabled', 'true')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Helper: je guard právě teď zapnutý?
-- ---------------------------------------------------------------------------
create or replace function public.guaranteed_benefit_active_contest_guard_enabled()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select coalesce(
    (select value from public.settings
     where key = 'guaranteed_benefit_active_contest_guard_enabled'),
    'true'
  ) <> 'false';
$fn$;

revoke all on function public.guaranteed_benefit_active_contest_guard_enabled() from public;
revoke all on function public.guaranteed_benefit_active_contest_guard_enabled() from anon;
revoke all on function public.guaranteed_benefit_active_contest_guard_enabled() from authenticated;

-- ---------------------------------------------------------------------------
-- Helper: má daná soutěž aktivní approved neomezený fallback?
-- ---------------------------------------------------------------------------
-- Kritéria jsou schválně identická s fallback větví
-- `purchase_guaranteed_benefit_bundle_atomic` — guard nesmí prohlásit za
-- "kryto" nic, co by nákupní RPC ve skutečnosti nepoužilo jako fallback.
-- `p_exclude_order_id` umožňuje ptát se "je soutěž kryta JINÝM benefitem",
-- což používají ochranné kontroly v admin RPC níže.
create or replace function public.guaranteed_benefit_has_active_unlimited_fallback(
  p_contest_id uuid,
  p_exclude_order_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select exists (
    select 1
    from public.voucher_distribution_contests dc
    join public.voucher_distribution_orders o on o.id = dc.order_id
    join public.vouchers v on v.id = o.voucher_id
    join public.voucher_versions vv on vv.id = o.voucher_version_id
    where dc.contest_id = p_contest_id
      and dc.detached_at is null
      and (p_exclude_order_id is null or o.id <> p_exclude_order_id)
      and o.status = 'approved'
      and o.is_unlimited
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vv.status = 'approved'
      and vv.code_source = 'shared_static'
      and vv.shared_code_or_url is not null
      and length(btrim(vv.shared_code_or_url)) > 0
  );
$fn$;

revoke all on function public.guaranteed_benefit_has_active_unlimited_fallback(uuid, uuid) from public;
revoke all on function public.guaranteed_benefit_has_active_unlimited_fallback(uuid, uuid) from anon;
revoke all on function public.guaranteed_benefit_has_active_unlimited_fallback(uuid, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- 1) BLOKACE AKTIVACE SOUTĚŽE
-- ---------------------------------------------------------------------------
create or replace function public.trg_fn_require_unlimited_benefit_for_active_contest()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if not public.guaranteed_benefit_active_contest_guard_enabled() then
    return new;
  end if;

  if new.status is distinct from 'active' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from 'active' then
    -- Soutěž byla active už předtím — běžný update (např. next_ticket_number
    -- z buy_ticket_atomic, nebo status sloupec v SET beze změny hodnoty)
    -- guard nekontroluje.
    return new;
  end if;

  -- Přechod DO active (INSERT rovnou jako active, nebo UPDATE z draft/pending).
  -- 2) SYNCHRONIZACE PŘED KONTROLOU — defense-in-depth pokus o domaterializování
  -- approved all_contests neomezených benefitů, i když už to nefatálně zkusil
  -- trg_link_guaranteed_benefits_to_contest. Tenhle pokus je taky nefatální —
  -- skutečnou (fatální) kontrolu dělá povinný check hned pod ním, takže
  -- selhání téhle synchronizace samo o sobě aktivaci nepovolí projít.
  begin
    insert into public.voucher_distribution_contests (order_id, contest_id, attached_by)
    select o.id, new.id, auth.uid()
    from public.voucher_distribution_orders o
    join public.vouchers v on v.id = o.voucher_id
    where o.status = 'approved'
      and o.is_unlimited
      and o.distribution_scope = 'all_contests'
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and not exists (
        select 1 from public.voucher_distribution_contests dc
        where dc.order_id = o.id
          and dc.contest_id = new.id
          and dc.detached_at is null
      )
    on conflict do nothing;
  exception when others then
    raise warning 'trg_fn_require_unlimited_benefit_for_active_contest: sync failed for contest %: %',
      new.id, sqlerrm;
  end;

  if not public.guaranteed_benefit_has_active_unlimited_fallback(new.id) then
    raise exception
      'Soutez nelze aktivovat: chybi schvaleny neomezeny (fallback) garantovany nakupni benefit s aktivni vazbou na tuto soutez.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_require_unlimited_benefit_for_active_contest on public.contests;
create trigger trg_require_unlimited_benefit_for_active_contest
after insert or update of status on public.contests
for each row execute function public.trg_fn_require_unlimited_benefit_for_active_contest();

-- ---------------------------------------------------------------------------
-- 3) OCHRANA POSLEDNÍHO FALLBACKU — admin_set_guaranteed_benefit_status
-- ---------------------------------------------------------------------------
-- Beze změny zůstávají: gate `can_manage_guaranteed_benefits`, validace
-- stavu, guard `ended` je konečný, audit přes `log_admin_action`.
-- Nově: přechod approved -> suspended/ended u `is_unlimited` orderu se
-- odmítne, pokud by některá `active` soutěž zůstala bez JINÉHO schváleného
-- neomezeného benefitu.
create or replace function public.admin_set_guaranteed_benefit_status(
  p_order_id uuid, p_status text, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_order  record;
  v_exposed_contest_ids uuid[];
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if v_status is null or v_status not in ('approved', 'suspended', 'ended') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  select * into v_order from public.voucher_distribution_orders where id = p_order_id;
  if v_order.id is null then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;
  if v_order.status not in ('approved', 'suspended', 'ended') then
    return jsonb_build_object('success', false, 'error', 'benefit_not_operational');
  end if;
  if v_order.status = 'ended' and v_status <> 'ended' then
    return jsonb_build_object('success', false, 'error', 'benefit_already_ended');
  end if;

  if v_status in ('suspended', 'ended')
     and v_order.is_unlimited
     and v_order.status = 'approved'
     and public.guaranteed_benefit_active_contest_guard_enabled() then
    select array_agg(dc.contest_id) into v_exposed_contest_ids
    from public.voucher_distribution_contests dc
    join public.contests c on c.id = dc.contest_id
    where dc.order_id = p_order_id
      and dc.detached_at is null
      and c.status = 'active'
      and not public.guaranteed_benefit_has_active_unlimited_fallback(dc.contest_id, p_order_id);

    if coalesce(array_length(v_exposed_contest_ids, 1), 0) > 0 then
      return jsonb_build_object(
        'success', false,
        'error', 'would_leave_active_contest_without_unlimited_fallback',
        'contest_ids', to_jsonb(v_exposed_contest_ids)
      );
    end if;
  end if;

  update public.voucher_distribution_orders
  set status = v_status,
      decision_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), decision_reason),
      updated_at = now()
  where id = p_order_id;

  perform public.log_admin_action(
    'guaranteed_benefit_status_set', 'distribution_order', p_order_id,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', v_status)
  );

  return jsonb_build_object('success', true, 'order_id', p_order_id, 'order_status', v_status);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3) OCHRANA POSLEDNÍHO FALLBACKU — admin_set_benefit_distribution
-- ---------------------------------------------------------------------------
-- Beze změny: gate, invalid_distribution_scope, contest_selection_required,
-- detach-jen-odebrané pro selected_contests, sync pro all_contests (nikdy
-- neplošně neodpojuje), audit.
-- Nově: přechod DO selected_contests (ať už z all_contests, nebo zúžení
-- existujícího výběru) se odmítne, pokud by některá `active` soutěž, která
-- by tímto voláním byla odpojena, zůstala bez JINÉHO schváleného
-- neomezeného benefitu. Kontrola běží PŘED jakoukoli mutací.
create or replace function public.admin_set_benefit_distribution(
  p_order_id    uuid,
  p_scope       text,
  p_contest_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor      uuid := auth.uid();
  v_scope      text := coalesce(nullif(btrim(coalesce(p_scope, '')), ''), '');
  v_order      record;
  v_contest_id uuid;
  v_detached   integer := 0;
  v_attached   integer := 0;
  v_exposed_contest_ids uuid[];
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

  if v_scope = 'selected_contests'
     and v_order.is_unlimited
     and v_order.status = 'approved'
     and public.guaranteed_benefit_active_contest_guard_enabled() then
    select array_agg(dc.contest_id) into v_exposed_contest_ids
    from public.voucher_distribution_contests dc
    join public.contests c on c.id = dc.contest_id
    where dc.order_id = p_order_id
      and dc.detached_at is null
      and c.status = 'active'
      and dc.contest_id <> all (coalesce(p_contest_ids, array[]::uuid[]))
      and not public.guaranteed_benefit_has_active_unlimited_fallback(dc.contest_id, p_order_id);

    if coalesce(array_length(v_exposed_contest_ids, 1), 0) > 0 then
      return jsonb_build_object(
        'success', false,
        'error', 'would_leave_active_contest_without_unlimited_fallback',
        'contest_ids', to_jsonb(v_exposed_contest_ids)
      );
    end if;
  end if;

  update public.voucher_distribution_orders
  set distribution_scope = v_scope,
      updated_at = now()
  where id = p_order_id;

  if v_scope = 'selected_contests' then
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
  else
    perform public.sync_guaranteed_benefit_order_contests(p_order_id);
  end if;

  select count(*) into v_attached
  from public.voucher_distribution_contests
  where order_id = p_order_id and detached_at is null;

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
$function$;

commit;
