-- REFUND BLOK (Fáze 2 + 3 + 4 opravného úkolu, 24. 9. 2026)
--
--   F2  Platba eviduje skutečně zaplacené Kč, základní a bonusová MIO, Stripe
--       režim a souhlas s okamžitým čerpáním. `payments.amount` zůstává
--       (= celkem připsaná MIO) kvůli zpětné kompatibilitě — referral a
--       affiliate výpočty se tímto krokem NEMĚNÍ.
--   F3  MIO sady (`wallet_lots`) + pohyby (`wallet_lot_movements`), jediný
--       algoritmus čerpání FEFO (nejbližší expires_at, při shodě dříve
--       připsaná sada) a 12měsíční expirace od skutečného připsání/aktivace.
--   F4  Refundace v2 nad stávajícím tokem prepare → Stripe → record →
--       finalize / reverse: vrací se jen nevyčerpaná placená část dané platby
--       (v Kč poměrně ke skutečně zaplacené částce), nevyčerpaný bonus dané
--       platby se ruší, cizí sady se nikdy nedotknou.
--
-- Invariant: součet `remaining_amount` aktivních neexpirovaných sad uživatele
-- = `wallets.balance_coins` (pro nezáporný zůstatek). `balance_coins` zůstává
-- rychlým souhrnem.
--
-- Stará testovací data: každý dnešní kladný zůstatek dostane jednu úvodní sadu
-- `legacy_opening` (připsáno teď, expirace za 12 měsíců). Historické platby
-- bez rozpadu na Kč nelze automaticky refundovat (`legacy_payment_not_supported`)
-- — produkční data jsou testovací a vyřeší je předstartovní reset. Nic se nemaže.
--
-- ZÁMĚRNĚ NEDOTČENO: buy_ticket_atomic, assign_contest_ticket_atomic, referral
-- odměny (create/reverse), try_credit_wallet_mc, affiliate provize, soutěžní
-- logika. Jejich případné přímé změny `wallets.balance_coins` zachytí
-- synchronizační trigger `trg_wallets_lot_sync` stejným FEFO algoritmem.

begin;

-- ===========================================================================
-- F2 — souhlas s okamžitým čerpáním + rozšíření plateb
-- ===========================================================================
create table if not exists public.payment_immediate_use_consents (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  consent_version    text not null,
  consent_text       text not null,
  accepted_at        timestamptz not null default now(),
  price_czk          integer,
  stripe_session_id  text unique,
  payment_id         uuid,
  created_at         timestamptz not null default now()
);
comment on table public.payment_immediate_use_consents is
  'Prokazatelný záznam aktivního souhlasu zákazníka s okamžitým použitím MIO u konkrétního dobití (verze a přesné znění textu, čas, Stripe session, platba).';

alter table public.payments
  add column if not exists paid_amount_czk          numeric(12,2),
  add column if not exists base_mio                 numeric(14,2),
  add column if not exists bonus_mio                numeric(14,2),
  add column if not exists currency                 text,
  add column if not exists stripe_livemode          boolean,
  add column if not exists immediate_use_consent_id uuid,
  add column if not exists refund_amount_czk        numeric(12,2),
  add column if not exists refund_paid_mio          numeric(14,2),
  add column if not exists refund_bonus_mio         numeric(14,2);

comment on column public.payments.amount is
  'Celkem připsaná MIO (základ + bonus). NENÍ ekonomická částka — ta je v paid_amount_czk.';
comment on column public.payments.paid_amount_czk is 'Skutečně zaplacená částka v Kč (Stripe amount_total).';
comment on column public.payments.base_mio is 'Základní placená MIO (bez bonusu).';
comment on column public.payments.bonus_mio is 'Bonusová MIO z balíčku.';

alter table public.payments drop constraint if exists payments_mio_split_check;
alter table public.payments add constraint payments_mio_split_check check (
  (paid_amount_czk is null and base_mio is null and bonus_mio is null)
  or (paid_amount_czk > 0 and base_mio > 0 and bonus_mio >= 0 and base_mio + bonus_mio = amount)
);

alter table public.payments drop constraint if exists payments_immediate_use_consent_fkey;
alter table public.payments add constraint payments_immediate_use_consent_fkey
  foreign key (immediate_use_consent_id) references public.payment_immediate_use_consents(id) on delete set null;

alter table public.payment_immediate_use_consents drop constraint if exists payment_immediate_use_consents_payment_fkey;
alter table public.payment_immediate_use_consents add constraint payment_immediate_use_consents_payment_fkey
  foreign key (payment_id) references public.payments(id) on delete set null;

create index if not exists idx_piuc_user on public.payment_immediate_use_consents(user_id, accepted_at desc);

alter table public.payment_immediate_use_consents enable row level security;
drop policy if exists piuc_select_own on public.payment_immediate_use_consents;
create policy piuc_select_own on public.payment_immediate_use_consents
  for select to authenticated using (user_id = auth.uid() or public.is_superadmin());

-- Konfigurace souhlasu. Znění NENÍ v projektu schválené — výchozí stav je
-- vypnuto a prázdný text. Zapne se až po schválení právního textu.
insert into public.settings (key, value) values
  ('immediate_use_consent_required', 'false'),
  ('immediate_use_consent_version',  ''),
  ('immediate_use_consent_text',     '')
on conflict (key) do nothing;

create or replace function public.get_immediate_use_consent_config()
 returns jsonb
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object(
    'required', coalesce((select value from public.settings where key = 'immediate_use_consent_required'), 'false') = 'true',
    'version',  coalesce((select value from public.settings where key = 'immediate_use_consent_version'), ''),
    'text',     coalesce((select value from public.settings where key = 'immediate_use_consent_text'), '')
  );
$function$;
revoke all on function public.get_immediate_use_consent_config() from public;
grant execute on function public.get_immediate_use_consent_config() to anon, authenticated, service_role;

-- ===========================================================================
-- F3 — MIO sady a pohyby
-- ===========================================================================
create table if not exists public.wallet_lots (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null,
  wallet_id             uuid not null references public.wallets(id) on delete cascade,
  source                text not null check (source in (
                          'payment_paid', 'payment_bonus', 'payment_legacy',
                          'partner_code', 'partner_new_customer_bonus',
                          'winner_bonus', 'winner_bonus_transfer',
                          'legacy_opening', 'direct_balance_change', 'refund_restore_legacy')),
  source_reference_id   uuid,
  source_reference_text text,
  payment_id            uuid references public.payments(id) on delete set null,
  parent_lot_id         uuid references public.wallet_lots(id) on delete set null,
  credited_amount       numeric(14,2) not null check (credited_amount > 0),
  remaining_amount      numeric(14,2) not null check (remaining_amount >= 0 and remaining_amount <= credited_amount),
  paid_mio              numeric(14,2) not null default 0 check (paid_mio >= 0),
  bonus_mio             numeric(14,2) not null default 0 check (bonus_mio >= 0),
  paid_amount_czk       numeric(12,2),
  credited_at           timestamptz not null default now(),
  expires_at            timestamptz not null,
  status                text not null default 'active' check (status in (
                          'active', 'depleted', 'expired', 'refund_pending', 'refunded')),
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.wallet_lots is
  'Jednotlivé sady MIO. Čerpá se výhradně přes wallet_debit_fefo (FEFO). Každá sada expiruje 12 měsíců od připsání.';

create unique index if not exists uniq_wallet_lots_payment_source
  on public.wallet_lots(payment_id, source) where payment_id is not null;
create index if not exists idx_wallet_lots_fefo
  on public.wallet_lots(user_id, expires_at, credited_at, id) where status = 'active' and remaining_amount > 0;
create index if not exists idx_wallet_lots_expiry
  on public.wallet_lots(expires_at) where status = 'active' and remaining_amount > 0;
create index if not exists idx_wallet_lots_wallet on public.wallet_lots(wallet_id);

create table if not exists public.wallet_lot_movements (
  id            uuid primary key default gen_random_uuid(),
  lot_id        uuid not null references public.wallet_lots(id) on delete cascade,
  user_id       uuid not null,
  movement_type text not null check (movement_type in (
                  'credit', 'consume', 'expire', 'refund_debit', 'bonus_cancel',
                  'refund_reversal', 'direct_debit')),
  amount        numeric(14,2) not null check (amount <> 0),
  reason        text,
  reference_id  uuid,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
comment on table public.wallet_lot_movements is
  'Neměnná historie pohybů jednotlivých sad MIO (připsání, čerpání, expirace, refundace a její reverze).';
create index if not exists idx_wlm_lot on public.wallet_lot_movements(lot_id, created_at);
create index if not exists idx_wlm_reference on public.wallet_lot_movements(reference_id, movement_type) where reference_id is not null;

create or replace function public.fn_wallet_lot_movements_immutable()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  raise exception 'wallet_lot_movements jsou neměnné (%).', tg_op;
end;
$function$;
drop trigger if exists trg_wallet_lot_movements_immutable on public.wallet_lot_movements;
create trigger trg_wallet_lot_movements_immutable
  before update or delete on public.wallet_lot_movements
  for each row execute function public.fn_wallet_lot_movements_immutable();

alter table public.wallet_lots enable row level security;
alter table public.wallet_lot_movements enable row level security;
drop policy if exists wallet_lots_select_own on public.wallet_lots;
create policy wallet_lots_select_own on public.wallet_lots
  for select to authenticated using (user_id = auth.uid() or public.is_superadmin());
drop policy if exists wallet_lot_movements_select_own on public.wallet_lot_movements;
create policy wallet_lot_movements_select_own on public.wallet_lot_movements
  for select to authenticated using (user_id = auth.uid() or public.is_superadmin());

-- ---------------------------------------------------------------------------
-- Interní jádro (bez klientských grantů)
-- ---------------------------------------------------------------------------
-- Příznak „změnu zůstatku provádí centrální funkce" — synchronizační trigger
-- ho respektuje a nic nezdvojuje. Nastavuje se vždy jen na dobu jednoho
-- zápisu do wallets a hned se vrací.
create or replace function public._wallet_set_managed(p_on boolean)
 returns void
 language sql
 set search_path to 'public'
as $function$
  select set_config('onemil.wallet_lot_managed', case when p_on then 'on' else 'off' end, true);
$function$;

create or replace function public._wallet_lots_create(
  p_user_id uuid, p_wallet_id uuid, p_amount numeric, p_source text,
  p_reference_id uuid, p_reference_text text, p_payment_id uuid, p_parent_lot_id uuid,
  p_paid_mio numeric, p_bonus_mio numeric, p_paid_amount_czk numeric,
  p_reason text, p_metadata jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_lot_id uuid;
  -- clock_timestamp(): i sady vzniklé v jedné transakci (placená + bonusová)
  -- mají jednoznačné pořadí připsání, a tedy deterministické FEFO.
  v_now    timestamptz := clock_timestamp();
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'wallet_lot_invalid_amount' using errcode = 'P0001';
  end if;

  insert into public.wallet_lots (
    user_id, wallet_id, source, source_reference_id, source_reference_text, payment_id,
    parent_lot_id, credited_amount, remaining_amount, paid_mio, bonus_mio, paid_amount_czk,
    credited_at, expires_at, status, metadata
  ) values (
    p_user_id, p_wallet_id, p_source, p_reference_id, p_reference_text, p_payment_id,
    p_parent_lot_id, p_amount, p_amount, coalesce(p_paid_mio, 0), coalesce(p_bonus_mio, 0), p_paid_amount_czk,
    v_now, v_now + interval '12 months', 'active', coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_lot_id;

  insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id, metadata)
  values (v_lot_id, p_user_id, 'credit', p_amount, coalesce(p_reason, p_source), coalesce(p_reference_id, p_payment_id),
          coalesce(p_metadata, '{}'::jsonb));

  return v_lot_id;
end;
$function$;

-- FEFO: nejbližší expires_at, při shodě dříve připsaná sada (credited_at), pak id.
-- Nikdy nečerpá z expirovaných, refundovaných ani rozpracovaných sad.
create or replace function public._wallet_lots_consume(
  p_user_id uuid, p_amount numeric, p_movement_type text, p_reason text,
  p_reference_id uuid, p_metadata jsonb, p_allow_partial boolean)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_left  numeric := p_amount;
  v_take  numeric;
  v_alloc jsonb := '[]'::jsonb;
  r       record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'wallet_lot_invalid_amount' using errcode = 'P0001';
  end if;

  for r in
    select id, remaining_amount
    from public.wallet_lots
    where user_id = p_user_id
      and status = 'active'
      and remaining_amount > 0
      and expires_at > now()
    order by expires_at asc, credited_at asc, id asc
    for update
  loop
    exit when v_left <= 0;
    v_take := least(r.remaining_amount, v_left);

    update public.wallet_lots
    set remaining_amount = remaining_amount - v_take,
        status = case when remaining_amount - v_take = 0 then 'depleted' else status end,
        updated_at = now()
    where id = r.id;

    insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id, metadata)
    values (r.id, p_user_id, p_movement_type, -v_take, p_reason, p_reference_id, coalesce(p_metadata, '{}'::jsonb));

    v_alloc := v_alloc || jsonb_build_array(jsonb_build_object('lot_id', r.id, 'amount', v_take));
    v_left := v_left - v_take;
  end loop;

  if v_left > 0 and not coalesce(p_allow_partial, false) then
    raise exception 'insufficient_miocoins' using errcode = 'P0001';
  end if;

  return jsonb_build_object('consumed', p_amount - greatest(v_left, 0),
                            'shortfall', greatest(v_left, 0),
                            'allocations', v_alloc);
end;
$function$;

-- Expirace splatných sad jednoho uživatele; předpokládá zamčený řádek wallets.
create or replace function public._wallet_lots_expire_user(p_user_id uuid, p_wallet_id uuid)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_total numeric := 0;
  v_new   numeric;
  r       record;
begin
  for r in
    select id, remaining_amount
    from public.wallet_lots
    where user_id = p_user_id
      and status = 'active'
      and remaining_amount > 0
      and expires_at <= now()
    order by expires_at, credited_at, id
    for update
  loop
    update public.wallet_lots
    set remaining_amount = 0, status = 'expired', updated_at = now()
    where id = r.id;

    insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason)
    values (r.id, p_user_id, 'expire', -r.remaining_amount, 'expiry_12_months');

    v_total := v_total + r.remaining_amount;
  end loop;

  if v_total > 0 then
    perform public._wallet_set_managed(true);
    update public.wallets
    set balance_coins = balance_coins - v_total
    where id = p_wallet_id
    returning balance_coins into v_new;
    perform public._wallet_set_managed(false);

    insert into public.wallet_transactions (user_id, wallet_id, amount, balance_after, type, source, metadata)
    values (p_user_id, p_wallet_id, -v_total, v_new, 'mio_expiry', 'wallet_expire_due_lots',
            jsonb_build_object('expired', v_total));
  end if;

  return v_total;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Centrální veřejné funkce (jen SECURITY DEFINER volající + service_role)
-- ---------------------------------------------------------------------------
create or replace function public.wallet_credit_lot(
  p_user_id uuid, p_amount numeric, p_source text,
  p_reference_id uuid default null, p_reference_text text default null,
  p_payment_id uuid default null, p_parent_lot_id uuid default null,
  p_paid_mio numeric default 0, p_bonus_mio numeric default 0,
  p_paid_amount_czk numeric default null, p_reason text default null,
  p_metadata jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_wallet_id uuid;
  v_lot_id    uuid;
  v_new       numeric;
begin
  if p_user_id is null then
    raise exception 'wallet_user_required' using errcode = 'P0001';
  end if;

  perform public._wallet_set_managed(true);
  insert into public.wallets (user_id, balance_coins, bonus_balance_coins, created_at)
  values (p_user_id, 0, 0, now())
  on conflict (user_id) do nothing;

  select id into v_wallet_id from public.wallets where user_id = p_user_id for update;

  v_lot_id := public._wallet_lots_create(
    p_user_id, v_wallet_id, p_amount, p_source, p_reference_id, p_reference_text,
    p_payment_id, p_parent_lot_id, p_paid_mio, p_bonus_mio, p_paid_amount_czk,
    p_reason, p_metadata);

  update public.wallets
  set balance_coins = balance_coins + p_amount
  where id = v_wallet_id
  returning balance_coins into v_new;
  perform public._wallet_set_managed(false);

  return jsonb_build_object('lot_id', v_lot_id, 'wallet_id', v_wallet_id, 'new_balance', v_new);
end;
$function$;

create or replace function public.wallet_expire_due_lots(p_user_id uuid default null)
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_total numeric := 0;
  r       record;
begin
  for r in
    select distinct w.user_id, w.id as wallet_id
    from public.wallet_lots l
    join public.wallets w on w.id = l.wallet_id
    where l.status = 'active' and l.remaining_amount > 0 and l.expires_at <= now()
      and (p_user_id is null or l.user_id = p_user_id)
  loop
    perform 1 from public.wallets where id = r.wallet_id for update;
    v_total := v_total + public._wallet_lots_expire_user(r.user_id, r.wallet_id);
  end loop;
  return v_total;
end;
$function$;

create or replace function public.wallet_debit_fefo(
  p_user_id uuid, p_amount numeric, p_reason text,
  p_reference_id uuid default null, p_metadata jsonb default '{}'::jsonb,
  p_allow_partial boolean default false)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_wallet_id uuid;
  v_res       jsonb;
  v_consumed  numeric;
  v_new       numeric;
begin
  select id into v_wallet_id from public.wallets where user_id = p_user_id for update;
  if v_wallet_id is null then
    raise exception 'wallet_not_found' using errcode = 'P0001';
  end if;

  perform public._wallet_lots_expire_user(p_user_id, v_wallet_id);

  v_res := public._wallet_lots_consume(p_user_id, p_amount, 'consume', p_reason,
                                       p_reference_id, p_metadata, p_allow_partial);
  v_consumed := (v_res->>'consumed')::numeric;

  perform public._wallet_set_managed(true);
  update public.wallets
  set balance_coins = balance_coins - v_consumed
  where id = v_wallet_id
  returning balance_coins into v_new;
  perform public._wallet_set_managed(false);

  return v_res || jsonb_build_object('wallet_id', v_wallet_id, 'new_balance', v_new);
end;
$function$;

-- ---------------------------------------------------------------------------
-- Pojistka: každá přímá změna wallets.balance_coins mimo centrální funkce
-- (legacy/servisní cesty: buy_ticket_atomic, try_credit_wallet_mc,
-- transfer_bonus_to_main(uuid), starý clampující refundační odečet, unlock_ticket, ruční
-- SQL) se převede na sadu (+) nebo na FEFO odečet (−).
-- ---------------------------------------------------------------------------
create or replace function public.trg_fn_wallets_lot_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_delta numeric;
  v_res   jsonb;
begin
  if coalesce(current_setting('onemil.wallet_lot_managed', true), 'off') = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_delta := coalesce(new.balance_coins, 0);
  else
    v_delta := coalesce(new.balance_coins, 0) - coalesce(old.balance_coins, 0);
  end if;

  if v_delta = 0 then
    return null;
  end if;

  if v_delta > 0 then
    perform public._wallet_lots_create(new.user_id, new.id, v_delta, 'direct_balance_change',
      null, null, null, null, 0, 0, null, 'direct_balance_change',
      jsonb_build_object('op', tg_op));
  else
    v_res := public._wallet_lots_consume(new.user_id, -v_delta, 'direct_debit',
      'direct_balance_change', null, jsonb_build_object('op', tg_op), true);
    if (v_res->>'shortfall')::numeric > 0 then
      insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
      values ('wallet_lot_shortfall', 'wallet_lot_integrity', new.user_id,
              jsonb_build_object('wallet_id', new.id, 'requested', -v_delta,
                                 'shortfall', (v_res->>'shortfall')::numeric,
                                 'balance_after', new.balance_coins), now());
    end if;
  end if;

  return null;
end;
$function$;

-- Kontrola konzistence: sady vs. zůstatek.
create or replace function public.wallet_lot_consistency_issues()
 returns table(user_id uuid, wallet_id uuid, balance_coins numeric, lots_remaining numeric, difference numeric)
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select w.user_id, w.id, w.balance_coins,
         coalesce(l.rem, 0) as lots_remaining,
         greatest(w.balance_coins, 0) - coalesce(l.rem, 0) as difference
  from public.wallets w
  left join (
    select wallet_id, sum(remaining_amount) as rem
    from public.wallet_lots
    where status = 'active' and remaining_amount > 0 and expires_at > now()
    group by wallet_id
  ) l on l.wallet_id = w.id
  where greatest(w.balance_coins, 0) <> coalesce(l.rem, 0);
$function$;

-- ---------------------------------------------------------------------------
-- Úvodní sady pro dnešní zůstatky (testovací data) — bez změny zůstatků.
-- ---------------------------------------------------------------------------
select public._wallet_set_managed(true);

with created as (
  insert into public.wallet_lots (user_id, wallet_id, source, credited_amount, remaining_amount,
                                  credited_at, expires_at, status, metadata)
  select w.user_id, w.id, 'legacy_opening', w.balance_coins, w.balance_coins,
         now(), now() + interval '12 months', 'active',
         jsonb_build_object('note', 'Úvodní sada ze zůstatku před zavedením MIO sad (testovací data).')
  from public.wallets w
  where w.balance_coins > 0
    and not exists (select 1 from public.wallet_lots l where l.wallet_id = w.id)
  returning id, user_id, credited_amount
)
insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason)
select id, user_id, 'credit', credited_amount, 'legacy_opening' from created;

select public._wallet_set_managed(false);

drop trigger if exists trg_wallets_lot_sync on public.wallets;
create trigger trg_wallets_lot_sync
  after insert or update of balance_coins on public.wallets
  for each row execute function public.trg_fn_wallets_lot_sync();

-- ===========================================================================
-- Připsání MIO — převod stávajících cest na sady
-- ===========================================================================

-- Stripe dobití: placená sada + navázaná bonusová sada.
create or replace function public.update_wallet_after_payment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_paid   jsonb;
  v_bonus  jsonb;
  v_new    numeric;
  v_wallet uuid;
begin
  -- 1. Připisuje se výhradně dokončená platba.
  if new.status is distinct from 'completed' then
    return new;
  end if;

  -- 2. Nekladná nebo chybějící částka se ignoruje.
  if new.amount is null or new.amount <= 0 then
    return new;
  end if;

  -- 3. Idempotence — pro tuto platbu už kredit i historie existují.
  if exists (
    select 1 from public.wallet_transactions
    where reference_id = new.id and type = 'payment_credit'
  ) then
    return new;
  end if;

  -- 4. Sady MIO.
  if new.base_mio is not null then
    v_paid := public.wallet_credit_lot(
      new.user_id, new.base_mio, 'payment_paid', new.id, null, new.id, null,
      new.base_mio, 0, new.paid_amount_czk, 'stripe_topup',
      jsonb_build_object('method', new.method, 'stripe_session_id', new.stripe_session_id));
    v_new := (v_paid->>'new_balance')::numeric;
    v_wallet := (v_paid->>'wallet_id')::uuid;

    if coalesce(new.bonus_mio, 0) > 0 then
      v_bonus := public.wallet_credit_lot(
        new.user_id, new.bonus_mio, 'payment_bonus', new.id, null, new.id,
        (v_paid->>'lot_id')::uuid, 0, new.bonus_mio, null, 'stripe_topup_bonus',
        jsonb_build_object('method', new.method, 'stripe_session_id', new.stripe_session_id));
      v_new := (v_bonus->>'new_balance')::numeric;
    end if;
  else
    -- Platba bez rozpadu na Kč (historický zápis / test) — jedna sada bez vazby na Kč.
    v_paid := public.wallet_credit_lot(
      new.user_id, new.amount, 'payment_legacy', new.id, null, new.id, null,
      new.amount, 0, null, 'payment_without_czk_split',
      jsonb_build_object('method', new.method, 'stripe_session_id', new.stripe_session_id));
    v_new := (v_paid->>'new_balance')::numeric;
    v_wallet := (v_paid->>'wallet_id')::uuid;
  end if;

  -- 5. Právě jeden řádek účetní historie.
  insert into public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) values (
    new.user_id, v_wallet, new.amount, v_new, 'payment_credit', 'update_wallet_after_payment', new.id,
    jsonb_build_object(
      'method',             new.method,
      'payment_status',     new.status,
      'payment_created_at', new.created_at,
      'paid_amount_czk',    new.paid_amount_czk,
      'base_mio',           new.base_mio,
      'bonus_mio',          new.bonus_mio,
      'paid_lot_id',        v_paid->>'lot_id',
      'bonus_lot_id',       v_bonus->>'lot_id'
    )
  );

  return new;
end;
$function$;

-- Partnerský kód: 90denní lhůta kódu zůstává (partner_reward_codes.expired_at);
-- po aktivaci vznikne sada s vlastní 12měsíční platností.
create or replace function public.redeem_miocoin_code(p_code text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid         uuid := auth.uid();
  v_email       text;
  v_code        text := upper(trim(coalesce(p_code, '')));
  v_row         public.partner_reward_codes%rowtype;
  v_restrict    citext;
  v_credit      jsonb;
  v_wallet_id   uuid;
  v_new_balance numeric;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_logged_in');
  end if;

  if v_code = '' then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  select * into v_row
  from public.partner_reward_codes
  where upper(code) = v_code
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if v_row.status = 'activated' then
    return jsonb_build_object('success', false, 'error', 'already_used');
  elsif v_row.status = 'cancelled' then
    return jsonb_build_object('success', false, 'error', 'cancelled');
  elsif v_row.status = 'expired' then
    return jsonb_build_object('success', false, 'error', 'expired');
  elsif v_row.status = 'pending' then
    return jsonb_build_object('success', false, 'error', 'pending');
  elsif v_row.status <> 'issued' then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;

  if v_row.expired_at is not null and v_row.expired_at < now() then
    return jsonb_build_object('success', false, 'error', 'expired');
  end if;

  v_restrict := coalesce(v_row.issued_to_email, v_row.customer_email);
  if v_restrict is not null then
    select email into v_email from auth.users where id = v_uid;
    if v_email is null or v_restrict <> v_email::citext then
      return jsonb_build_object('success', false, 'error', 'email_mismatch');
    end if;
  end if;

  v_credit := public.wallet_credit_lot(
    v_uid, v_row.coins, 'partner_code', null, v_row.code, null, null, 0, 0, null,
    'partner_code_activation', jsonb_build_object('code', v_row.code, 'partner_id', v_row.partner_id));
  v_wallet_id := (v_credit->>'wallet_id')::uuid;
  v_new_balance := (v_credit->>'new_balance')::numeric;

  insert into public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) values (
    v_uid,
    v_wallet_id,
    v_row.coins,
    v_new_balance,
    'miocoin_code_credit',
    'redeem_miocoin_code',
    null,
    jsonb_build_object('code', v_row.code, 'partner_id', v_row.partner_id, 'lot_id', v_credit->>'lot_id')
  );

  update public.partner_reward_codes
  set status = 'activated',
      activated_at = now(),
      activated_by_user_id = v_uid
  where code = v_row.code;

  return jsonb_build_object(
    'success', true,
    'coins', v_row.coins,
    'new_balance', v_new_balance
  );
end;
$function$;

-- Partner: bonus pro nového zákazníka (15 MIO z partnerské akce).
create or replace function public.record_partner_customer_ref(p_nonce uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid                 uuid := auth.uid();
  v_pending             public.partner_pending_attributions%rowtype;
  v_account_created_at  timestamptz;
  v_bonus               numeric := 15;
  v_credit              jsonb;
  v_wallet_id           uuid;
  v_balance             numeric;
  v_row_id              uuid;
begin
  if v_uid is null then
    return jsonb_build_object('status', 'unauthenticated');
  end if;
  if p_nonce is null then
    return jsonb_build_object('status', 'invalid_or_expired_intent');
  end if;

  select * into v_pending
  from public.partner_pending_attributions
  where id = p_nonce
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid_or_expired_intent');
  end if;

  if v_pending.consumed_at is not null then
    return jsonb_build_object('status', 'invalid_or_expired_intent');
  end if;

  if v_pending.expires_at < now() then
    return jsonb_build_object('status', 'invalid_or_expired_intent');
  end if;

  select created_at into v_account_created_at from auth.users where id = v_uid;

  if v_account_created_at is null or v_account_created_at <= v_pending.created_at then
    return jsonb_build_object('status', 'account_predates_intent');
  end if;

  if exists (select 1 from public.partner_customer_refs where user_id = v_uid) then
    update public.partner_pending_attributions
       set consumed_at = now(), consumed_by_user_id = v_uid
     where id = p_nonce;
    return jsonb_build_object('status', 'already_attributed');
  end if;

  update public.partner_pending_attributions
     set consumed_at = now(), consumed_by_user_id = v_uid
   where id = p_nonce;

  insert into public.partner_customer_refs (partner_id, user_id, connection_id, source)
  values (v_pending.partner_id, v_uid, v_pending.connection_id, 'partner_link')
  on conflict (user_id) do nothing
  returning id into v_row_id;

  if v_row_id is null then
    return jsonb_build_object('status', 'already_attributed');
  end if;

  v_credit := public.wallet_credit_lot(
    v_uid, v_bonus, 'partner_new_customer_bonus', v_row_id, null, null, null, 0, 0, null,
    'partner_new_customer_bonus',
    jsonb_build_object('partner_id', v_pending.partner_id, 'connection_id', v_pending.connection_id));
  v_wallet_id := (v_credit->>'wallet_id')::uuid;
  v_balance := (v_credit->>'new_balance')::numeric;

  insert into public.wallet_transactions
    (user_id, wallet_id, amount, balance_after, type, source, metadata)
  values (
    v_uid, v_wallet_id, v_bonus, v_balance,
    'partner_new_customer_bonus', 'record_partner_customer_ref',
    jsonb_build_object('partner_id', v_pending.partner_id, 'connection_id', v_pending.connection_id,
                       'lot_id', v_credit->>'lot_id')
  );

  update public.partner_customer_refs
     set bonus_coins = v_bonus, bonus_granted_at = now()
   where id = v_row_id;

  return jsonb_build_object(
    'status', 'recorded',
    'partner_id', v_pending.partner_id,
    'bonus_coins', v_bonus
  );
end;
$function$;

-- Výhra MIO bonusu: přesun z bonusové kapsy do utratitelného zůstatku = aktivace.
create or replace function public.claim_miocoin_bonus(p_bonus_id uuid, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_amount        integer;
  v_wallet_id     uuid;
  v_bonus_balance numeric;
  v_credit        jsonb;
  v_new_balance   numeric;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    raise exception 'Unauthorized';
  end if;

  select bp.amount into v_amount
  from public.bonus_prizes bp
  join public.winners w on w.prize_id = bp.id
  where bp.id       = p_bonus_id
    and bp.status   in ('won', 'pending')
    and w.user_id   = p_user_id
    and w.type      = 'bonus'
    and w.delivered = false
  for update of bp, w;

  if not found then
    raise exception 'Bonus not found, not owned by user, or already delivered';
  end if;

  select id, bonus_balance_coins
  into v_wallet_id, v_bonus_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'Wallet not found for user';
  end if;

  if v_bonus_balance is null or v_bonus_balance < v_amount then
    raise exception 'Bonus wallet balance is inconsistent with the claimed prize';
  end if;

  update public.wallets
  set bonus_balance_coins = bonus_balance_coins - v_amount
  where user_id = p_user_id;

  v_credit := public.wallet_credit_lot(
    p_user_id, v_amount, 'winner_bonus', p_bonus_id, null, null, null, 0, 0, null,
    'claim_miocoin_bonus', jsonb_build_object('bonus_prize_id', p_bonus_id));
  v_new_balance := (v_credit->>'new_balance')::numeric;

  insert into public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) values (
    p_user_id,
    v_wallet_id,
    v_amount,
    v_new_balance,
    'bonus_claim',
    'claim_miocoin_bonus',
    p_bonus_id,
    jsonb_build_object(
      'movement', 'bonus_to_main',
      'bonus_debited', v_amount,
      'lot_id', v_credit->>'lot_id'
    )
  );

  update public.bonus_prizes
  set status = 'delivered'
  where id = p_bonus_id;

  update public.winners
  set delivered = true
  where prize_id = p_bonus_id
    and user_id = p_user_id
    and type = 'bonus';
end;
$function$;

create or replace function public.transfer_all_bonus_to_main_wallet()
 returns numeric
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id     uuid := auth.uid();
  v_wallet_id   uuid;
  v_bonus       numeric;
  v_credit      jsonb;
  v_new_balance numeric;
begin
  if v_user_id is null then
    return 0;
  end if;

  select id, bonus_balance_coins into v_wallet_id, v_bonus
  from public.wallets where user_id = v_user_id
  for update;

  if v_bonus is null or v_bonus <= 0 then
    return 0;
  end if;

  update public.wallets
  set bonus_balance_coins = 0
  where user_id = v_user_id;

  v_credit := public.wallet_credit_lot(
    v_user_id, v_bonus, 'winner_bonus_transfer', null, null, null, null, 0, 0, null,
    'transfer_all_bonus_to_main_wallet', jsonb_build_object('bonus_transferred', v_bonus));
  v_new_balance := (v_credit->>'new_balance')::numeric;

  insert into public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, metadata
  ) values (
    v_user_id, v_wallet_id, v_bonus, v_new_balance,
    'bonus_transfer', 'transfer_all_bonus_to_main_wallet',
    jsonb_build_object('bonus_transferred', v_bonus, 'lot_id', v_credit->>'lot_id')
  );

  return v_bonus;
end;
$function$;

create or replace function public.transfer_bonus_to_main()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_bonus integer;
begin
  if v_user_id is null then
    return;
  end if;

  select bonus_balance_coins
  into v_bonus
  from public.wallets
  where user_id = v_user_id
  for update;

  if v_bonus is null or v_bonus <= 0 then
    return;
  end if;

  update public.wallets
  set bonus_balance_coins = 0
  where user_id = v_user_id;

  perform public.wallet_credit_lot(
    v_user_id, v_bonus, 'winner_bonus_transfer', null, null, null, null, 0, 0, null,
    'transfer_bonus_to_main', jsonb_build_object('bonus_transferred', v_bonus));

  insert into public.bonus_transfer_history (user_id, amount)
  values (v_user_id, v_bonus);
end;
$function$;

-- ===========================================================================
-- Čerpání MIO — převod zákaznických odečtů na FEFO
-- ===========================================================================
create or replace function public.buy_voucher_atomic(p_user_id uuid, p_voucher_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_wallet_balance     numeric;
  v_wallet_id          uuid;
  v_price              numeric := 5;
  v_existing_favorite  uuid;
  v_existing_purchased boolean;
  v_voucher_available  boolean;
  v_voucher_code_id    uuid;
  v_user_voucher_id    uuid;
  v_debit              jsonb;
begin
  if p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  select id into v_wallet_id
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_wallet_id is null then
    return jsonb_build_object('success', false, 'error', 'Peněženka nenalezena');
  end if;

  -- Splatné sady se odepíšou dřív, než se porovná zůstatek.
  perform public._wallet_lots_expire_user(p_user_id, v_wallet_id);
  select balance_coins into v_wallet_balance from public.wallets where id = v_wallet_id;

  if v_wallet_balance < v_price then
    return jsonb_build_object('success', false, 'error', 'Nedostatek MioCoinů');
  end if;

  select exists(
    select 1
    from public.user_vouchers
    where user_id = p_user_id
      and voucher_id = p_voucher_id
      and redeemed = true
  ) into v_existing_purchased;

  if v_existing_purchased then
    return jsonb_build_object('success', false, 'error', 'Voucher již zakoupen');
  end if;

  select true into v_voucher_available
  from public.vouchers v
  where v.id = p_voucher_id
    and v.is_public = true
    and (v.start_date is null or v.start_date <= now())
    and (v.end_date   is null or v.end_date   >= now())
    and (v.max_quantity is null or v.redeemed_count < v.max_quantity)
  for update;

  if coalesce(v_voucher_available, false) is not true then
    return jsonb_build_object('success', false, 'error', 'Voucher není dostupný');
  end if;

  select vc.id into v_voucher_code_id
  from public.voucher_codes vc
  where vc.voucher_id = p_voucher_id
    and vc.status = 'available'
  order by vc.created_at, vc.id
  for update skip locked
  limit 1;

  if v_voucher_code_id is null then
    return jsonb_build_object('success', false, 'error', 'Pro tento voucher už není dostupný žádný kód');
  end if;

  select id into v_existing_favorite
  from public.user_vouchers
  where user_id = p_user_id
    and voucher_id = p_voucher_id
    and redeemed = false
  for update;

  if v_existing_favorite is not null then
    update public.user_vouchers
    set redeemed = true,
        voucher_code_id = v_voucher_code_id,
        updated_at = now()
    where id = v_existing_favorite
    returning id into v_user_voucher_id;
  else
    insert into public.user_vouchers (user_id, voucher_id, redeemed, voucher_code_id)
    values (p_user_id, p_voucher_id, true, v_voucher_code_id)
    returning id into v_user_voucher_id;
  end if;

  update public.voucher_codes
  set status = 'issued',
      issued_to_user_id = p_user_id,
      issued_user_voucher_id = v_user_voucher_id,
      issued_at = now(),
      updated_at = now()
  where id = v_voucher_code_id
    and status = 'available';

  if not found then
    raise exception 'Selected voucher code could not be issued';
  end if;

  v_debit := public.wallet_debit_fefo(p_user_id, v_price, 'voucher_purchase', p_voucher_id,
                                      jsonb_build_object('voucher_code_id', v_voucher_code_id));

  insert into public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) values (
    p_user_id, v_wallet_id, -v_price, (v_debit->>'new_balance')::numeric,
    'voucher_purchase', 'buy_voucher_atomic', p_voucher_id,
    jsonb_build_object('price', v_price, 'voucher_code_id', v_voucher_code_id,
                       'lot_allocations', v_debit->'allocations')
  );

  return jsonb_build_object(
    'success', true,
    'voucher_code_id', v_voucher_code_id,
    'user_voucher_id', v_user_voucher_id
  );
end;
$function$;

-- Garantovaný benefit + tiket zdarma — odečet přes FEFO. Zbytek funkce je
-- shodný s Fází 1 (20260923120000), včetně vzdálenosti k další výhře.
create or replace function public.purchase_guaranteed_benefit_bundle_atomic(p_user_id uuid, p_contest_id uuid, p_idempotency_key uuid)
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
  v_debit jsonb;
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
    -- Vydává se jen schválená a platná verze benefitu.
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
    join public.voucher_versions vv on vv.id = o.voucher_version_id
    where o.status = 'approved'
      and not o.is_unlimited
      and o.issued_quantity < o.requested_quantity
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vv.status = 'approved'
      and (vv.valid_until is null or vv.valid_until >= now())
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
        and (vv.valid_until is null or vv.valid_until >= now())
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

    select id into v_wallet_id
    from public.wallets where user_id = v_user for update;
    if v_wallet_id is null then v_fail := 'wallet_not_found'; raise exception 'GB_FAIL'; end if;
    -- Splatné sady se odepíšou dřív, než se porovná zůstatek.
    perform public._wallet_lots_expire_user(v_user, v_wallet_id);
    select balance_coins into v_balance from public.wallets where id = v_wallet_id;
    if v_balance is null or v_balance < v_price then v_fail := 'insufficient_miocoins'; raise exception 'GB_FAIL'; end if;
    v_debit := public.wallet_debit_fefo(v_user, v_price, 'benefit_purchase', v_bundle_id,
                                        jsonb_build_object('contest_id', p_contest_id));
    v_new_balance := (v_debit->>'new_balance')::numeric;

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
        'ticket_number', (v_ticket->>'ticket_number')::integer, 'free_ticket', true,
        'lot_allocations', v_debit->'allocations'));

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

-- ===========================================================================
-- Parita stagingu: record_stripe_refund_status v PŘESNÉ produkční podobě
-- (produkce md5(prosrc) 210f49e76b661f0773c87eef9c0003f2). Na produkci beze
-- změny, na stagingu doplní chybějící krok refundačního toku.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.record_stripe_refund_status(p_payment_id uuid, p_refund_id text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments%rowtype;
BEGIN
  IF p_payment_id IS NULL OR p_refund_id IS NULL OR p_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input');
  END IF;

  -- Přijímají se jen skutečné Stripe stavy refundace.
  IF p_status NOT IN ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_stripe_status',
      'stripe_refund_status', p_status
    );
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- K jedné platbě smí patřit jen jedna Stripe refundace.
  IF v_payment.stripe_refund_id IS NOT NULL
     AND v_payment.stripe_refund_id IS DISTINCT FROM p_refund_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'refund_id_conflict',
      'message', 'K platbě je už evidovaná jiná Stripe refundace.'
    );
  END IF;

  -- Terminální Stripe stavy jsou `succeeded`, `failed` i `canceled`. Stripe
  -- negarantuje pořadí doručení událostí, takže starší nebo přeházená událost
  -- nesmí uložený terminální stav přepsat jiným stavem.
  IF (v_payment.stripe_refund_status IN ('succeeded', 'failed', 'canceled')
        AND p_status IS DISTINCT FROM v_payment.stripe_refund_status)
     OR (v_payment.status = 'refunded' AND p_status <> 'succeeded') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'ignored', true,
      'code', 'terminal_state',
      'payment_id', p_payment_id,
      'stripe_refund_status', v_payment.stripe_refund_status,
      'status', v_payment.status
    );
  END IF;

  UPDATE public.payments
  SET stripe_refund_id     = p_refund_id,
      stripe_refund_status = p_status,
      refund_updated_at    = now()
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ignored', false,
    'payment_id', p_payment_id,
    'stripe_refund_status', p_status,
    'status', v_payment.status
  );
END;
$function$;
revoke all on function public.record_stripe_refund_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_stripe_refund_status(uuid, text, text) to service_role;

-- ===========================================================================
-- F4 — refundace v2 (tok prepare → Stripe → record → finalize / reverse zůstává)
-- ===========================================================================
create or replace function public.prepare_stripe_refund(p_payment_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_payment     public.payments%rowtype;
  v_wallet_id   uuid;
  v_balance     numeric;
  v_new_balance numeric;
  v_already     boolean := false;
  v_paid_lot    public.wallet_lots%rowtype;
  v_bonus_lot   public.wallet_lots%rowtype;
  v_paid_rem    numeric := 0;
  v_bonus_rem   numeric := 0;
  v_total       numeric;
  v_refund_czk  numeric(12,2);
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Chybí ID platby.');
  end if;

  -- Zámek platby pro celou dobu transakce.
  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Platba nebyla nalezena.');
  end if;

  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', false, 'code', 'already_refunded', 'message', 'Platba už byla refundována.');
  end if;

  -- Neúspěšná Stripe refundace se NIKDY nespouští znovu automaticky.
  if v_payment.stripe_refund_id is not null
     and v_payment.stripe_refund_status in ('failed', 'canceled') then
    return jsonb_build_object(
      'ok', false,
      'code', 'refund_failed_needs_manual_review',
      'message', 'Předchozí refundace u Stripe selhala. Je nutná ruční kontrola, automatické opakování není povolené.'
    );
  end if;

  if v_payment.status not in ('completed', 'refund_pending') then
    return jsonb_build_object('ok', false, 'code', 'invalid_status', 'message', 'Refundovat lze jen dokončenou platbu.');
  end if;

  if v_payment.stripe_session_id is null then
    return jsonb_build_object('ok', false, 'code', 'missing_stripe_session',
      'message', 'K této platbě chybí Stripe session, refundaci nelze provést.');
  end if;

  if v_payment.amount is null or v_payment.amount <= 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_amount', 'message', 'Platba nemá kladnou částku.');
  end if;

  -- Už jednou připraveno? Pak se nic nesmí odečíst podruhé.
  select true into v_already
  from public.wallet_transactions
  where reference_id = p_payment_id
    and type = 'refund_debit'
  limit 1;
  v_already := coalesce(v_already, false);

  if not v_already then
    -- Refundace v2 potřebuje skutečně zaplacené Kč a placenou sadu této platby.
    if v_payment.paid_amount_czk is null or v_payment.base_mio is null then
      return jsonb_build_object(
        'ok', false,
        'code', 'legacy_payment_not_supported',
        'message', 'Platba nemá evidovanou zaplacenou částku v Kč ani vlastní sadu MIO (starší testovací záznam). Automatická refundace není možná.'
      );
    end if;

    -- Pořadí zámků: platba → peněženka → sady (stejně jako čerpání).
    select id, balance_coins into v_wallet_id, v_balance
    from public.wallets
    where user_id = v_payment.user_id
    for update;

    if v_wallet_id is null then
      return jsonb_build_object('ok', false, 'code', 'wallet_not_found', 'message', 'Peněženka nebyla nalezena.');
    end if;

    -- Expirovaná placená MIO se refundací nevrací.
    perform public._wallet_lots_expire_user(v_payment.user_id, v_wallet_id);

    select * into v_paid_lot from public.wallet_lots
    where payment_id = p_payment_id and source = 'payment_paid'
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'legacy_payment_not_supported',
        'message', 'K platbě neexistuje placená sada MIO. Automatická refundace není možná.');
    end if;

    select * into v_bonus_lot from public.wallet_lots
    where payment_id = p_payment_id and source = 'payment_bonus'
    for update;

    if v_paid_lot.status = 'active' and v_paid_lot.expires_at > now() then
      v_paid_rem := v_paid_lot.remaining_amount;
    end if;
    if v_bonus_lot.id is not null and v_bonus_lot.status = 'active' and v_bonus_lot.expires_at > now() then
      v_bonus_rem := v_bonus_lot.remaining_amount;
    end if;

    if v_paid_rem <= 0 then
      return jsonb_build_object(
        'ok', false,
        'code', 'nothing_to_refund',
        'message', 'Placená MIO z této platby už byla vyčerpána nebo expirovala. Není co refundovat.'
      );
    end if;

    -- Kč poměrně ke skutečně zaplacené částce, nikdy víc než bylo zaplaceno.
    v_refund_czk := least(v_payment.paid_amount_czk,
                          round(v_payment.paid_amount_czk * v_paid_rem / v_payment.base_mio, 2));
    v_total := v_paid_rem + v_bonus_rem;

    select balance_coins into v_balance from public.wallets where id = v_wallet_id;
    if v_balance < v_total then
      return jsonb_build_object('ok', false, 'code', 'wallet_lot_inconsistent',
        'message', 'Zůstatek peněženky neodpovídá sadám MIO. Refundace se nespustí, je nutná kontrola.');
    end if;

    -- Odečet VÝHRADNĚ ze sad této platby.
    update public.wallet_lots
    set remaining_amount = 0, status = 'refund_pending', updated_at = now()
    where id = v_paid_lot.id;
    insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id, metadata)
    values (v_paid_lot.id, v_payment.user_id, 'refund_debit', -v_paid_rem, 'stripe_refund', p_payment_id,
            jsonb_build_object('refund_amount_czk', v_refund_czk));

    if v_bonus_rem > 0 then
      update public.wallet_lots
      set remaining_amount = 0, status = 'refund_pending', updated_at = now()
      where id = v_bonus_lot.id;
      insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id)
      values (v_bonus_lot.id, v_payment.user_id, 'bonus_cancel', -v_bonus_rem, 'stripe_refund', p_payment_id);
    end if;

    perform public._wallet_set_managed(true);
    update public.wallets
    set balance_coins = balance_coins - v_total
    where id = v_wallet_id
    returning balance_coins into v_new_balance;
    perform public._wallet_set_managed(false);

    insert into public.wallet_transactions (
      user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
    ) values (
      v_payment.user_id,
      v_wallet_id,
      -v_total,
      v_new_balance,
      'refund_debit',
      'prepare_stripe_refund',
      p_payment_id,
      jsonb_build_object(
        'payment_status_before', v_payment.status,
        'debited',               v_total,
        'refund_paid_mio',       v_paid_rem,
        'refund_bonus_mio',      v_bonus_rem,
        'refund_amount_czk',     v_refund_czk,
        'paid_lot_id',           v_paid_lot.id,
        'bonus_lot_id',          v_bonus_lot.id
      )
    );

    update public.payments
    set refund_amount_czk = v_refund_czk,
        refund_paid_mio   = v_paid_rem,
        refund_bonus_mio  = v_bonus_rem
    where id = p_payment_id;

    v_payment.refund_amount_czk := v_refund_czk;
    v_payment.refund_paid_mio   := v_paid_rem;
    v_payment.refund_bonus_mio  := v_bonus_rem;
  end if;

  -- Stav se posouvá jen z `completed`; opakování na `refund_pending` nechává beze změny.
  if v_payment.status = 'completed' then
    update public.payments
    set status = 'refund_pending',
        refund_updated_at = now()
    where id = p_payment_id;
  end if;

  return jsonb_build_object(
    'ok',                 true,
    'already_prepared',   v_already,
    'payment_id',         p_payment_id,
    'user_id',            v_payment.user_id,
    'amount',             v_payment.amount,
    'refund_amount_czk',  v_payment.refund_amount_czk,
    'refund_amount_haler', case when v_payment.refund_amount_czk is null then null
                                else round(v_payment.refund_amount_czk * 100)::bigint end,
    'full_refund',        v_payment.refund_amount_czk is not null
                          and v_payment.refund_amount_czk = v_payment.paid_amount_czk,
    'refund_paid_mio',    v_payment.refund_paid_mio,
    'refund_bonus_mio',   v_payment.refund_bonus_mio,
    'stripe_session_id',  v_payment.stripe_session_id,
    'stripe_refund_id',   v_payment.stripe_refund_id,
    'status',             'refund_pending'
  );
end;
$function$;

create or replace function public.finalize_stripe_refund(p_payment_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_payment public.payments%rowtype;
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Opakované volání je bezpečné.
  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', true, 'already_final', true, 'status', 'refunded');
  end if;

  if v_payment.status <> 'refund_pending' then
    return jsonb_build_object('ok', false, 'code', 'invalid_status', 'status', v_payment.status);
  end if;

  -- Databáze nedůvěřuje volajícímu: dokončit lze jen refundaci, která je
  -- skutečně evidovaná a u Stripe skončila jako `succeeded`.
  if v_payment.stripe_refund_id is null then
    return jsonb_build_object('ok', false, 'code', 'missing_stripe_refund_id');
  end if;

  if v_payment.stripe_refund_status is distinct from 'succeeded' then
    return jsonb_build_object(
      'ok', false,
      'code', 'stripe_refund_not_succeeded',
      'stripe_refund_status', v_payment.stripe_refund_status
    );
  end if;

  update public.wallet_lots
  set status = 'refunded', updated_at = now()
  where payment_id = p_payment_id
    and status = 'refund_pending';

  update public.payments
  set status            = 'refunded',
      refund_updated_at = now()
  where id = p_payment_id;

  return jsonb_build_object('ok', true, 'already_final', false, 'status', 'refunded',
                            'refund_amount_czk', v_payment.refund_amount_czk);
end;
$function$;

create or replace function public.reverse_failed_stripe_refund(p_payment_id uuid, p_stripe_status text default 'failed'::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_payment         public.payments%rowtype;
  v_debited         numeric;
  v_wallet_id       uuid;
  v_new_balance     numeric;
  v_already         boolean := false;
  v_reward_id       uuid;
  v_referrer        uuid;
  v_reward_mc       numeric;
  v_credit_ok       boolean;
  v_reward_restored boolean := false;
  v_restored        numeric := 0;
  v_has_lot_moves   boolean := false;
  r                 record;
begin
  if p_payment_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  -- Přijímají se výhradně skutečné neúspěšné Stripe stavy.
  if p_stripe_status is null or p_stripe_status not in ('failed', 'canceled') then
    return jsonb_build_object('ok', false, 'code', 'invalid_stripe_status', 'stripe_refund_status', p_stripe_status);
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found');
  end if;

  -- Dokončenou refundaci nelze vzít zpět.
  if v_payment.status = 'refunded' then
    return jsonb_build_object('ok', false, 'code', 'already_refunded');
  end if;

  -- Opakovaná událost po už provedené reverzi: žádná další změna peněženky
  -- ani doporučovací odměny. Platba ale nesmí zůstat viset v `refund_pending`.
  select true into v_already
  from public.wallet_transactions
  where reference_id = p_payment_id
    and type = 'refund_reversal'
  limit 1;

  if coalesce(v_already, false) then
    if v_payment.status <> 'completed' then
      update public.payments
      set status               = 'completed',
          stripe_refund_status = case
                                   when v_payment.stripe_refund_status in ('failed', 'canceled')
                                     then v_payment.stripe_refund_status
                                   else p_stripe_status
                                 end,
          refund_updated_at    = now()
      where id = p_payment_id
      returning status, stripe_refund_status into v_payment.status, v_payment.stripe_refund_status;
    end if;

    return jsonb_build_object(
      'ok',                 true,
      'already_reversed',   true,
      'status',             v_payment.status,
      'stripe_refund_status', v_payment.stripe_refund_status
    );
  end if;

  -- První reverze smí proběhnout jen z rozpracované refundace.
  if v_payment.status <> 'refund_pending' then
    return jsonb_build_object('ok', false, 'code', 'invalid_status', 'status', v_payment.status);
  end if;

  -- Vrací se jen to, co bylo skutečně odečteno.
  select abs(amount) into v_debited
  from public.wallet_transactions
  where reference_id = p_payment_id
    and type = 'refund_debit'
  limit 1;

  if v_debited is null then
    return jsonb_build_object('ok', false, 'code', 'nothing_to_reverse');
  end if;

  select id into v_wallet_id
  from public.wallets
  where user_id = v_payment.user_id
  for update;

  -- 1a) Refundace v2: vrátit přesně pohyby této refundace do jejich sad.
  for r in
    select m.lot_id, m.amount
    from public.wallet_lot_movements m
    where m.reference_id = p_payment_id
      and m.movement_type in ('refund_debit', 'bonus_cancel')
  loop
    v_has_lot_moves := true;
    update public.wallet_lots
    set remaining_amount = remaining_amount + abs(r.amount),
        status = 'active',
        updated_at = now()
    where id = r.lot_id;

    insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id, metadata)
    values (r.lot_id, v_payment.user_id, 'refund_reversal', abs(r.amount), 'stripe_refund_failed', p_payment_id,
            jsonb_build_object('stripe_refund_status', p_stripe_status));

    v_restored := v_restored + abs(r.amount);
  end loop;

  if v_has_lot_moves then
    if v_restored <> v_debited then
      raise exception 'Reverze refundace % nesouhlasí: sady % vs. odečet %', p_payment_id, v_restored, v_debited;
    end if;

    perform public._wallet_set_managed(true);
    update public.wallets
    set balance_coins = balance_coins + v_restored
    where id = v_wallet_id
    returning balance_coins into v_new_balance;
    perform public._wallet_set_managed(false);
  else
    -- 1b) Refundace připravená starou verzí (bez sad): vrátit odečtenou částku
    --     jako novou sadu.
    v_new_balance := (public.wallet_credit_lot(
      v_payment.user_id, v_debited, 'refund_restore_legacy', p_payment_id, null, null, null, 0, 0, null,
      'stripe_refund_failed', jsonb_build_object('stripe_refund_status', p_stripe_status))->>'new_balance')::numeric;
    select id into v_wallet_id from public.wallets where user_id = v_payment.user_id;
    v_restored := v_debited;
  end if;

  insert into public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) values (
    v_payment.user_id,
    v_wallet_id,
    v_restored,
    v_new_balance,
    'refund_reversal',
    'reverse_failed_stripe_refund',
    p_payment_id,
    jsonb_build_object(
      'stripe_refund_status', p_stripe_status,
      'restored',             v_restored
    )
  );

  -- 2) Obnova doporučovací odměny, kterou při `completed -> refund_pending`
  --    stornoval trigger `trg_payments_referral_reverse` (beze změny).
  select id, referrer_user_id, reward_mc
  into v_reward_id, v_referrer, v_reward_mc
  from public.referral_rewards
  where payment_id = p_payment_id
    and status = 'reversed'
    and reverse_reason = 'payment_status_changed:refund_pending'
  limit 1
  for update;

  if v_reward_id is not null then
    update public.referral_rewards
    set status         = 'earned',
        reversed_at    = null,
        reverse_reason = null
    where id = v_reward_id;

    select public.try_credit_wallet_mc(p_user_id => v_referrer, p_amount_mc => v_reward_mc)
    into v_credit_ok;

    if coalesce(v_credit_ok, false) is not true then
      raise exception
        'Nepodařilo se vrátit doporučovací odměnu pro platbu %; reverze refundace byla zrušena.',
        p_payment_id;
    end if;

    v_reward_restored := true;
  end if;

  -- 3) Platba se vrací mezi dokončené — peníze zákazníkovi vráceny NEBYLY.
  update public.payments
  set status               = 'completed',
      stripe_refund_status = p_stripe_status,
      refund_updated_at    = now(),
      refund_amount_czk    = null,
      refund_paid_mio      = null,
      refund_bonus_mio     = null
  where id = p_payment_id;

  return jsonb_build_object(
    'ok',                       true,
    'already_reversed',         false,
    'restored',                 v_restored,
    'referral_reward_restored', v_reward_restored,
    'status',                   'completed',
    'stripe_refund_status',     p_stripe_status
  );
end;
$function$;

-- ===========================================================================
-- Oprávnění
-- ===========================================================================
revoke all on function public._wallet_set_managed(boolean) from public, anon, authenticated;
revoke all on function public._wallet_lots_create(uuid, uuid, numeric, text, uuid, text, uuid, uuid, numeric, numeric, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public._wallet_lots_consume(uuid, numeric, text, text, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public._wallet_lots_expire_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.wallet_credit_lot(uuid, numeric, text, uuid, text, uuid, uuid, numeric, numeric, numeric, text, jsonb) from public, anon, authenticated;
revoke all on function public.wallet_debit_fefo(uuid, numeric, text, uuid, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.wallet_expire_due_lots(uuid) from public, anon, authenticated;
revoke all on function public.wallet_lot_consistency_issues() from public, anon, authenticated;
revoke all on function public.trg_fn_wallets_lot_sync() from public, anon, authenticated;
revoke all on function public.fn_wallet_lot_movements_immutable() from public, anon, authenticated;
grant execute on function public.wallet_credit_lot(uuid, numeric, text, uuid, text, uuid, uuid, numeric, numeric, numeric, text, jsonb) to service_role;
grant execute on function public.wallet_debit_fefo(uuid, numeric, text, uuid, jsonb, boolean) to service_role;
grant execute on function public.wallet_expire_due_lots(uuid) to service_role;
grant execute on function public.wallet_lot_consistency_issues() to service_role;

-- Refundační funkce zůstávají service_role-only (stejně jako dosud).
revoke all on function public.prepare_stripe_refund(uuid) from public, anon, authenticated;
revoke all on function public.finalize_stripe_refund(uuid) from public, anon, authenticated;
revoke all on function public.reverse_failed_stripe_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_stripe_refund(uuid) to service_role;
grant execute on function public.finalize_stripe_refund(uuid) to service_role;
grant execute on function public.reverse_failed_stripe_refund(uuid, text) to service_role;

-- ===========================================================================
-- Denní expirace sad
-- ===========================================================================
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'expire_wallet_lots_daily';
  perform cron.schedule('expire_wallet_lots_daily', '10 3 * * *', 'select public.wallet_expire_due_lots(null);');
end $$;

commit;
