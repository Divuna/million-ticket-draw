-- FÁZE 5 — osobní doporučení hráčů (finální pravidla schválená Pavlem 24. 9. 2026)
--
-- Připsání:
--   * vazba doporučení je trvalá; za samotnou registraci nevzniká nic,
--   * doporučující dostane 5 % v MIO ze SKUTEČNĚ ZAPLACENÝCH Kč každého
--     dokončeného placeného dobití doporučeného uživatele,
--   * jednorázově navíc 15 MIO po PRVNÍM úspěšném placeném dobití
--     (nejvýše jednou na doporučeného — refundace možnost znovu neotevře),
--   * obě odměny jsou nepeněžní MIO ve vlastní sadě (wallet lot) s 12měsíční
--     expirací; připisuje se výhradně centrální lot cestou (`wallet_credit_lot`).
--
-- Storno (refundace):
--   * 5 % odměna i bonus 15 MIO se stornují POMĚRNĚ podle refundované části
--     skutečně zaplacených Kč (plná refundace = celé); MIO max. 1 desetinné
--     místo, počítáno kumulativně, aby postupné refundace nesčítaly chyby
--     zaokrouhlení,
--   * odečítá se jen ze sady dané odměny; z jiných sad se nikdy nebere
--     a peněženka nejde do mínusu. Co nejde odečíst, vznikne jako pohledávka
--     (`referral_shortfalls`) a umořuje se z BUDOUCÍCH odměn téhož
--     doporučujícího (nejstarší pohledávka první). Každé umoření je v
--     `referral_shortfall_repayments`, u odměny `shortfall_offset_mc` a
--     `credited_mc` (kolik šlo na pohledávky / kolik se skutečně připsalo).
--
-- Neúspěšná Stripe refundace:
--   * vrátí přesně MIO odečtená touto refundací do téže sady,
--   * zruší přesně pohledávku vzniklou touto refundací; část, která už byla
--     umořena z pozdější odměny, se doporučujícímu vrátí jako nová sada
--     (`referral_shortfall_release`). Jiné pohledávky ani odměny se nemění.
--   * vše je vázané na klíč události (`referral_reward_adjustments.event_key`)
--     → idempotentní.
--
-- Opravuje:
--   * `create_referral_reward_from_payment` zakládal záznam, ale MIO nepřipsal
--     (a počítal z MIO včetně balíčkového bonusu místo zaplacených Kč),
--   * reverzní trigger při stornu odečítal MIO, která nikdy připsána nebyla,
--   * obnova po neúspěšné refundaci připisovala přes `try_credit_wallet_mc`.
--
-- Historické (nikdy nepřipsané, `credited_at IS NULL`) odměny se zpětně
-- nepřipisují; jejich storno mění jen stav (testovací data → předstartovní reset).
--
-- ZÁMĚRNĚ NEDOTČENO: affiliate provize, firemní referral, 18+, výherní workflow,
-- cookies, Stripe live, notify_referral_reward_multi, buy_ticket_atomic.

begin;

-- ===========================================================================
-- Rozšíření sad a pohybů
-- ===========================================================================
alter table public.wallet_lots drop constraint if exists wallet_lots_source_check;
alter table public.wallet_lots add constraint wallet_lots_source_check check (source in (
  'payment_paid', 'payment_bonus', 'payment_legacy',
  'partner_code', 'partner_new_customer_bonus',
  'winner_bonus', 'winner_bonus_transfer',
  'legacy_opening', 'direct_balance_change', 'refund_restore_legacy',
  'referral_reward', 'referral_first_topup_bonus', 'referral_shortfall_release'));

alter table public.wallet_lots drop constraint if exists wallet_lots_status_check;
alter table public.wallet_lots add constraint wallet_lots_status_check check (status in (
  'active', 'depleted', 'expired', 'refund_pending', 'refunded', 'reversed'));

alter table public.wallet_lot_movements drop constraint if exists wallet_lot_movements_movement_type_check;
alter table public.wallet_lot_movements add constraint wallet_lot_movements_movement_type_check check (movement_type in (
  'credit', 'consume', 'expire', 'refund_debit', 'bonus_cancel',
  'refund_reversal', 'direct_debit', 'referral_reversal', 'referral_restore'));

-- ===========================================================================
-- referral_rewards: typ, připsání, souhrn storna
-- ===========================================================================
alter table public.referral_rewards
  add column if not exists reward_type           text not null default 'percent',
  add column if not exists paid_amount_czk       numeric(12,2),
  add column if not exists lot_id                uuid,
  add column if not exists credited_at           timestamptz,
  add column if not exists credited_mc           numeric(14,2),
  add column if not exists shortfall_offset_mc   numeric(14,2) not null default 0,
  add column if not exists reversal_target_mc    numeric(14,2) not null default 0,
  add column if not exists reversed_mc           numeric(14,2) not null default 0,
  add column if not exists reversal_shortfall_mc numeric(14,2) not null default 0;

-- Staging měl krátce dřívější verzi této migrace: doplnit připsanou částku.
update public.referral_rewards set credited_mc = reward_mc
where credited_at is not null and credited_mc is null;

comment on column public.referral_rewards.reward_type is
  'percent = 5 % ze zaplacených Kč dobití; first_topup_bonus = jednorázových 15 MIO po prvním placeném dobití.';
comment on column public.referral_rewards.paid_amount_czk is 'Skutečně zaplacené Kč dobití, ze kterého odměna vznikla.';
comment on column public.referral_rewards.credited_at is 'Kdy byla odměna zpracována (připsána / použita na pohledávky). NULL = nikdy (historické záznamy).';
comment on column public.referral_rewards.credited_mc is 'Kolik MIO z odměny se skutečně připsalo do sady (reward_mc − shortfall_offset_mc).';
comment on column public.referral_rewards.shortfall_offset_mc is 'Kolik MIO z odměny bylo použito na umoření dřívějších pohledávek doporučujícího.';
comment on column public.referral_rewards.lot_id is 'Sada MIO doporučujícího s připsanou částí odměny (NULL, když šlo vše na pohledávky nebo nebyla nikdy připsána).';
comment on column public.referral_rewards.reversal_target_mc is 'Souhrn: kolik MIO se má stornovat (aktivní úpravy).';
comment on column public.referral_rewards.reversed_mc is 'Souhrn: kolik MIO se stornem odečetlo ze sady odměny.';
comment on column public.referral_rewards.reversal_shortfall_mc is 'Souhrn: kolik storna nešlo odečíst a vzniklo jako pohledávka.';

alter table public.referral_rewards drop constraint if exists referral_rewards_reward_type_check;
alter table public.referral_rewards add constraint referral_rewards_reward_type_check
  check (reward_type in ('percent', 'first_topup_bonus'));

alter table public.referral_rewards drop constraint if exists referral_rewards_lot_fkey;
alter table public.referral_rewards add constraint referral_rewards_lot_fkey
  foreign key (lot_id) references public.wallet_lots(id) on delete set null;

alter table public.referral_rewards drop constraint if exists referral_rewards_reversal_check;
alter table public.referral_rewards add constraint referral_rewards_reversal_check check (
  reward_mc >= 0
  and reversal_target_mc >= 0 and reversal_target_mc <= reward_mc
  and reversed_mc >= 0 and reversal_shortfall_mc >= 0
  and reversed_mc + reversal_shortfall_mc = reversal_target_mc);

alter table public.referral_rewards drop constraint if exists referral_rewards_credit_check;
alter table public.referral_rewards add constraint referral_rewards_credit_check check (
  shortfall_offset_mc >= 0
  and (credited_mc is null or (credited_mc >= 0 and credited_mc + shortfall_offset_mc = reward_mc)));

-- Jedna odměna daného typu na platbu (místo dřívější jedné odměny na platbu).
drop index if exists public.uq_referral_rewards_payment;
create unique index if not exists uq_referral_rewards_payment_type
  on public.referral_rewards(payment_id, reward_type);

-- 15 MIO nejvýše jednou za celou existenci doporučeného uživatele.
create unique index if not exists uq_referral_first_topup_bonus_per_referred
  on public.referral_rewards(referred_user_id) where reward_type = 'first_topup_bonus';

-- ===========================================================================
-- Úpravy odměn po událostech, pohledávky a jejich umoření
-- ===========================================================================
create table if not exists public.referral_reward_adjustments (
  id               uuid primary key default gen_random_uuid(),
  reward_id        uuid not null references public.referral_rewards(id) on delete cascade,
  referrer_user_id uuid not null,
  payment_id       uuid,
  event_key        text not null,
  reason           text not null,
  refund_fraction  numeric(14,10) not null check (refund_fraction >= 0 and refund_fraction <= 1),
  target_mc        numeric(14,2) not null default 0 check (target_mc >= 0),
  from_lot_mc      numeric(14,2) not null default 0 check (from_lot_mc >= 0),
  shortfall_mc     numeric(14,2) not null default 0 check (shortfall_mc >= 0),
  shortfall_id     uuid,
  lot_id           uuid references public.wallet_lots(id) on delete set null,
  created_at       timestamptz not null default now(),
  restored_at      timestamptz,
  restore_metadata jsonb,
  check (from_lot_mc + shortfall_mc = target_mc),
  unique (reward_id, event_key)
);
comment on table public.referral_reward_adjustments is
  'Každé storno odměny za doporučení jednou událostí (refundace / změna stavu platby): poměr, cílová částka, co se odečetlo ze sady a co vzniklo jako pohledávka. restored_at = událost vrácena (neúspěšná Stripe refundace).';
create index if not exists idx_rra_payment_event on public.referral_reward_adjustments(payment_id, event_key);

create table if not exists public.referral_shortfalls (
  id               uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null,
  adjustment_id    uuid not null unique references public.referral_reward_adjustments(id) on delete cascade,
  reward_id        uuid not null references public.referral_rewards(id) on delete cascade,
  payment_id       uuid,
  amount_mc        numeric(14,2) not null check (amount_mc > 0),
  repaid_mc        numeric(14,2) not null default 0 check (repaid_mc >= 0),
  cancelled_mc     numeric(14,2) not null default 0 check (cancelled_mc >= 0),
  released_mc      numeric(14,2) not null default 0 check (released_mc >= 0),
  cancelled_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (repaid_mc + cancelled_mc <= amount_mc),
  check (released_mc <= repaid_mc)
);
comment on table public.referral_shortfalls is
  'Nezaplacená část storna odměny za doporučení (doporučující MIO z dané sady už utratil). Umořuje se z budoucích odměn; zrušená neúspěšnou Stripe refundací má cancelled_at.';
-- clock_timestamp(): i pohledávky vzniklé v jedné transakci mají jednoznačné
-- pořadí, takže umoření „nejstarší první" je deterministické.
alter table public.referral_shortfalls alter column created_at set default clock_timestamp();
create index if not exists idx_referral_shortfalls_open
  on public.referral_shortfalls(referrer_user_id, created_at) where cancelled_at is null;

alter table public.referral_reward_adjustments drop constraint if exists referral_reward_adjustments_shortfall_fkey;
alter table public.referral_reward_adjustments add constraint referral_reward_adjustments_shortfall_fkey
  foreign key (shortfall_id) references public.referral_shortfalls(id) on delete set null;

create table if not exists public.referral_shortfall_repayments (
  id               uuid primary key default gen_random_uuid(),
  shortfall_id     uuid not null references public.referral_shortfalls(id) on delete cascade,
  referrer_user_id uuid not null,
  source_reward_id uuid not null references public.referral_rewards(id) on delete cascade,
  amount_mc        numeric(14,2) not null check (amount_mc > 0),
  created_at       timestamptz not null default now()
);
comment on table public.referral_shortfall_repayments is
  'Auditní stopa umoření: kolik z které nové odměny šlo na kterou pohledávku.';
create index if not exists idx_rsr_shortfall on public.referral_shortfall_repayments(shortfall_id);
create index if not exists idx_rsr_source_reward on public.referral_shortfall_repayments(source_reward_id);

create or replace function public.fn_referral_audit_immutable()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  raise exception '% je neměnná auditní tabulka (%).', tg_table_name, tg_op;
end;
$function$;
drop trigger if exists trg_referral_shortfall_repayments_immutable on public.referral_shortfall_repayments;
create trigger trg_referral_shortfall_repayments_immutable
  before update or delete on public.referral_shortfall_repayments
  for each row execute function public.fn_referral_audit_immutable();

alter table public.referral_reward_adjustments enable row level security;
alter table public.referral_shortfalls enable row level security;
alter table public.referral_shortfall_repayments enable row level security;
drop policy if exists rra_select_own on public.referral_reward_adjustments;
create policy rra_select_own on public.referral_reward_adjustments
  for select to authenticated using (referrer_user_id = auth.uid() or public.is_admin() or public.is_superadmin());
drop policy if exists rs_select_own on public.referral_shortfalls;
create policy rs_select_own on public.referral_shortfalls
  for select to authenticated using (referrer_user_id = auth.uid() or public.is_admin() or public.is_superadmin());
drop policy if exists rsr_select_own on public.referral_shortfall_repayments;
create policy rsr_select_own on public.referral_shortfall_repayments
  for select to authenticated using (referrer_user_id = auth.uid() or public.is_admin() or public.is_superadmin());
revoke insert, update, delete, truncate on public.referral_reward_adjustments,
  public.referral_shortfalls, public.referral_shortfall_repayments from anon, authenticated;

-- ===========================================================================
-- Interní: zámek peněženky doporučujícího (serializuje připsání, umoření a storno)
-- ===========================================================================
create or replace function public._referral_lock_wallet(p_user_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_wallet uuid;
begin
  perform public._wallet_set_managed(true);
  insert into public.wallets (user_id, balance_coins, bonus_balance_coins, created_at)
  values (p_user_id, 0, 0, now())
  on conflict (user_id) do nothing;
  perform public._wallet_set_managed(false);

  select id into v_wallet from public.wallets where user_id = p_user_id for update;
  return v_wallet;
end;
$function$;

-- ===========================================================================
-- Připsání odměny: nejdřív umořit otevřené pohledávky, zbytek do nové sady
-- ===========================================================================
create or replace function public._referral_credit_reward(p_reward_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_rr      public.referral_rewards%rowtype;
  v_wallet  uuid;
  v_left    numeric;
  v_offset  numeric := 0;
  v_take    numeric;
  v_res     jsonb;
  v_type    text;
  v_repaid  jsonb := '[]'::jsonb;
  s         record;
begin
  select * into v_rr from public.referral_rewards where id = p_reward_id;
  if not found then
    raise exception 'referral_reward_not_found' using errcode = 'P0001';
  end if;

  -- Pořadí zámků: peněženka doporučujícího → odměna → pohledávky.
  v_wallet := public._referral_lock_wallet(v_rr.referrer_user_id);
  select * into v_rr from public.referral_rewards where id = p_reward_id for update;

  -- Idempotence: jednou zpracovaná odměna se znovu nepřipisuje ani neumořuje.
  if v_rr.credited_at is not null then
    return jsonb_build_object('credited', false, 'already_credited', true);
  end if;

  if v_rr.reward_mc is null or v_rr.reward_mc <= 0 then
    return jsonb_build_object('credited', false, 'reason', 'zero_reward');
  end if;

  v_left := v_rr.reward_mc;

  -- 1) Umoření otevřených pohledávek (nejstarší první).
  for s in
    select id, amount_mc - repaid_mc - cancelled_mc as outstanding
    from public.referral_shortfalls
    where referrer_user_id = v_rr.referrer_user_id
      and cancelled_at is null
      and amount_mc - repaid_mc - cancelled_mc > 0
    order by created_at, id
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_left, s.outstanding);

    update public.referral_shortfalls
    set repaid_mc = repaid_mc + v_take, updated_at = now()
    where id = s.id;

    insert into public.referral_shortfall_repayments (shortfall_id, referrer_user_id, source_reward_id, amount_mc)
    values (s.id, v_rr.referrer_user_id, p_reward_id, v_take);

    v_repaid := v_repaid || jsonb_build_array(jsonb_build_object('shortfall_id', s.id, 'amount', v_take));
    v_offset := v_offset + v_take;
    v_left := v_left - v_take;
  end loop;

  v_type := case v_rr.reward_type when 'first_topup_bonus' then 'referral_first_topup_bonus'
                                   else 'referral_reward' end;

  -- 2) Zbytek jako nepeněžní MIO do vlastní sady (12 měsíců od připsání).
  if v_left > 0 then
    v_res := public.wallet_credit_lot(
      v_rr.referrer_user_id, v_left, v_type,
      p_reward_id, 'referral_payment:' || coalesce(v_rr.payment_id::text, ''),
      null, null, 0, v_left, null, v_type,
      jsonb_build_object('reward_id', p_reward_id,
                         'referred_user_id', v_rr.referred_user_id,
                         'payment_id', v_rr.payment_id,
                         'paid_amount_czk', v_rr.paid_amount_czk,
                         'reward_type', v_rr.reward_type,
                         'gross_mio', v_rr.reward_mc,
                         'shortfall_offset_mio', v_offset));

    insert into public.wallet_transactions (
      user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
    ) values (
      v_rr.referrer_user_id, v_wallet, v_left, (v_res->>'new_balance')::numeric,
      v_type, 'referral', v_rr.payment_id,
      jsonb_build_object('reward_id', p_reward_id,
                         'reward_type', v_rr.reward_type,
                         'referred_user_id', v_rr.referred_user_id,
                         'paid_amount_czk', v_rr.paid_amount_czk,
                         'gross_mio', v_rr.reward_mc,
                         'shortfall_offset_mio', v_offset,
                         'credited_mio', v_left,
                         'lot_id', v_res->>'lot_id')
    );
  end if;

  update public.referral_rewards
  set lot_id              = (v_res->>'lot_id')::uuid,
      credited_at         = now(),
      credited_mc         = v_left,
      shortfall_offset_mc = v_offset
  where id = p_reward_id;

  if v_offset > 0 then
    insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
    values ('referral_shortfall_repaid', 'referral_reward_integrity', v_rr.referrer_user_id,
            jsonb_build_object('reward_id', p_reward_id, 'gross', v_rr.reward_mc,
                               'offset', v_offset, 'credited', v_left, 'repayments', v_repaid), now());
  end if;

  return jsonb_build_object('credited', true, 'gross', v_rr.reward_mc, 'offset', v_offset,
                            'credited_mio', v_left, 'lot_id', v_res->>'lot_id', 'repayments', v_repaid);
end;
$function$;

-- ===========================================================================
-- Vznik odměn z dokončeného placeného dobití
-- ===========================================================================
create or replace function public.referral_award_for_payment(p_payment_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_pay        public.payments%rowtype;
  v_referrer   uuid;
  v_rate       constant numeric := 0.05;
  v_bonus      constant numeric := 15;
  v_percent    numeric;
  v_reward_id  uuid;
  v_bonus_id   uuid;
  v_first      boolean;
begin
  select * into v_pay from public.payments where id = p_payment_id;
  if not found then
    return jsonb_build_object('awarded', false, 'reason', 'payment_not_found');
  end if;

  -- Jen dokončené PLACENÉ dobití se skutečně zaplacenými Kč.
  if v_pay.status <> 'completed' or v_pay.paid_amount_czk is null or v_pay.paid_amount_czk <= 0 then
    return jsonb_build_object('awarded', false, 'reason', 'not_paid_topup');
  end if;

  select referrer_user_id into v_referrer
  from public.referrals
  where referred_user_id = v_pay.user_id
    and status = 'active';

  if v_referrer is null or v_referrer = v_pay.user_id then
    return jsonb_build_object('awarded', false, 'reason', 'no_active_referral');
  end if;

  -- 5 % ze zaplacených Kč, MIO na 1 desetinné místo.
  v_percent := round(v_pay.paid_amount_czk * v_rate, 1);

  if v_percent > 0 then
    insert into public.referral_rewards (
      referrer_user_id, referred_user_id, payment_id, payment_stripe_session_id,
      paid_amount_mc, commission_rate, reward_mc, status, reward_type, paid_amount_czk, created_at
    ) values (
      v_referrer, v_pay.user_id, v_pay.id, v_pay.stripe_session_id,
      v_pay.amount, v_rate, v_percent, 'earned', 'percent', v_pay.paid_amount_czk, now()
    )
    on conflict do nothing
    returning id into v_reward_id;

    if v_reward_id is not null then
      perform public._referral_credit_reward(v_reward_id);
    end if;
  end if;

  -- 15 MIO jen za PRVNÍ placené dobití; jakákoli dřívější placená platba
  -- (i refundovaná) nárok ruší, unikátní index drží jedinečnost i při souběhu.
  select not exists (
    select 1 from public.payments p
    where p.user_id = v_pay.user_id
      and p.id <> v_pay.id
      and p.stripe_session_id is not null
      and p.status in ('completed', 'refund_pending', 'refunded')
      and p.created_at <= v_pay.created_at
  ) into v_first;

  if v_first then
    insert into public.referral_rewards (
      referrer_user_id, referred_user_id, payment_id, payment_stripe_session_id,
      paid_amount_mc, commission_rate, reward_mc, status, reward_type, paid_amount_czk, created_at
    ) values (
      v_referrer, v_pay.user_id, v_pay.id, v_pay.stripe_session_id,
      v_pay.amount, 0, v_bonus, 'earned', 'first_topup_bonus', v_pay.paid_amount_czk, now()
    )
    on conflict do nothing
    returning id into v_bonus_id;

    if v_bonus_id is not null then
      perform public._referral_credit_reward(v_bonus_id);
    end if;
  end if;

  return jsonb_build_object('awarded', v_reward_id is not null or v_bonus_id is not null,
                            'percent_reward_id', v_reward_id,
                            'bonus_reward_id', v_bonus_id,
                            'percent_mio', case when v_reward_id is not null then v_percent else 0 end,
                            'bonus_mio', case when v_bonus_id is not null then v_bonus else 0 end);
end;
$function$;

create or replace function public.create_referral_reward_from_payment()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.status = 'completed' and new.paid_amount_czk is not null and new.paid_amount_czk > 0 then
    perform public.referral_award_for_payment(new.id);
  end if;
  return new;
end;
$function$;

-- Referral trigger musí běžet AŽ PO připsání dobití (triggery stejné události
-- běží abecedně): zámky pak jdou vždy doporučený → doporučující, stejně jako
-- v prepare_stripe_refund, a souběh dobití s refundací nemůže uváznout.
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'trg_payments_referral_reward'
             and tgrelid = 'public.payments'::regclass) then
    alter trigger trg_payments_referral_reward on public.payments rename to trg_wallet_referral_reward_after_topup;
  end if;
end $$;

-- ===========================================================================
-- Stav a souhrny odměny z aktivních (nevrácených) úprav
-- ===========================================================================
create or replace function public._referral_reward_recompute(p_reward_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_frac   numeric;
  v_target numeric;
  v_lot    numeric;
  v_short  numeric;
  v_reason text;
  v_at     timestamptz;
begin
  -- Pozor: LEAST ignoruje NULL (least(NULL, 1) = 1) → nejdřív coalesce.
  select least(coalesce(sum(refund_fraction), 0), 1), coalesce(sum(target_mc), 0),
         coalesce(sum(from_lot_mc), 0), coalesce(sum(shortfall_mc), 0), max(created_at)
  into v_frac, v_target, v_lot, v_short, v_at
  from public.referral_reward_adjustments
  where reward_id = p_reward_id and restored_at is null;

  select reason into v_reason from public.referral_reward_adjustments
  where reward_id = p_reward_id and restored_at is null
  order by created_at desc, id desc limit 1;

  update public.referral_rewards
  set status                = case when v_frac >= 1 then 'reversed'
                                   when v_frac > 0 then 'partially_reversed'
                                   else 'earned' end,
      reversal_target_mc    = v_target,
      reversed_mc           = v_lot,
      reversal_shortfall_mc = v_short,
      reversed_at           = case when v_frac > 0 then v_at else null end,
      reverse_reason        = case when v_frac > 0 then v_reason else null end
  where id = p_reward_id;
end;
$function$;

-- ===========================================================================
-- Storno odměn platby jednou událostí (interní)
--   p_refunded_czk: Kč refundované touto událostí; NULL = celá platba.
-- ===========================================================================
create or replace function public._referral_reverse_for_payment(
  p_payment_id uuid, p_refunded_czk numeric, p_event_key text, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_paid      numeric;
  v_event     numeric;
  v_referrer  uuid;
  v_wallet    uuid;
  r           record;
  v_prev_frac numeric;
  v_prev_tgt  numeric;
  v_cum       numeric;
  v_eff       numeric;
  v_cum_tgt   numeric;
  v_t         numeric;
  v_avail     numeric;
  v_take      numeric;
  v_short     numeric;
  v_lot       public.wallet_lots%rowtype;
  v_adj       uuid;
  v_sf        uuid;
  v_new       numeric;
  v_total     numeric := 0;
  v_short_tot numeric := 0;
  v_rows      integer := 0;
begin
  if p_event_key is null or p_event_key = '' then
    raise exception 'referral_event_key_required' using errcode = 'P0001';
  end if;

  select paid_amount_czk into v_paid from public.payments where id = p_payment_id;

  v_event := case when p_refunded_czk is null or v_paid is null or v_paid <= 0 then 1
                  else least(greatest(p_refunded_czk / v_paid, 0), 1) end;

  select referrer_user_id into v_referrer
  from public.referral_rewards where payment_id = p_payment_id limit 1;
  if v_referrer is null then
    return jsonb_build_object('rewards', 0, 'reversed_mio', 0, 'shortfall_mio', 0, 'event_fraction', v_event);
  end if;

  -- Pořadí zámků: peněženka doporučujícího → odměny → sady.
  v_wallet := public._referral_lock_wallet(v_referrer);
  perform public._wallet_lots_expire_user(v_referrer, v_wallet);

  for r in
    select *
    from public.referral_rewards
    where payment_id = p_payment_id
      and status in ('earned', 'partially_reversed')
    order by reward_type, id
    for update
  loop
    -- Idempotence: tatáž událost se na odměnu nikdy neaplikuje podruhé.
    if exists (select 1 from public.referral_reward_adjustments
               where reward_id = r.id and event_key = p_event_key) then
      continue;
    end if;

    select coalesce(sum(refund_fraction), 0), coalesce(sum(target_mc), 0)
    into v_prev_frac, v_prev_tgt
    from public.referral_reward_adjustments
    where reward_id = r.id and restored_at is null;

    if v_prev_frac >= 1 then
      continue;
    end if;

    v_cum := least(v_prev_frac + v_event, 1);
    v_eff := v_cum - v_prev_frac;
    v_take := 0;
    v_short := 0;
    v_sf := null;

    if r.credited_at is null then
      -- Nikdy nepřipsaná historická odměna: jen stav, žádný pohyb peněženky.
      v_t := 0;
    else
      -- Kumulativně: celkové storno = round(odměna × celkový refundovaný podíl, 1).
      v_cum_tgt := least(r.reward_mc, round(r.reward_mc * v_cum, 1));
      v_t := greatest(v_cum_tgt - v_prev_tgt, 0);

      if v_t > 0 and r.lot_id is not null then
        select * into v_lot from public.wallet_lots where id = r.lot_id for update;
        v_avail := case when v_lot.status = 'active' and v_lot.expires_at > now()
                        then v_lot.remaining_amount else 0 end;
        v_take := least(v_avail, v_t);
      end if;
      v_short := v_t - v_take;
    end if;

    insert into public.referral_reward_adjustments (
      reward_id, referrer_user_id, payment_id, event_key, reason, refund_fraction,
      target_mc, from_lot_mc, shortfall_mc, lot_id
    ) values (
      r.id, r.referrer_user_id, p_payment_id, p_event_key, p_reason, v_eff,
      v_t, v_take, v_short, case when v_take > 0 then r.lot_id else null end
    ) returning id into v_adj;

    if v_take > 0 then
      update public.wallet_lots
      set remaining_amount = remaining_amount - v_take,
          status = case when remaining_amount - v_take = 0 then 'reversed' else status end,
          updated_at = now()
      where id = r.lot_id;

      insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id, metadata)
      values (r.lot_id, r.referrer_user_id, 'referral_reversal', -v_take, p_reason, p_payment_id,
              jsonb_build_object('reward_id', r.id, 'reward_type', r.reward_type,
                                 'adjustment_id', v_adj, 'event_key', p_event_key));

      perform public._wallet_set_managed(true);
      update public.wallets set balance_coins = balance_coins - v_take
      where id = v_wallet returning balance_coins into v_new;
      perform public._wallet_set_managed(false);

      insert into public.wallet_transactions (
        user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
      ) values (
        r.referrer_user_id, v_wallet, -v_take, v_new, 'referral_reversal', p_reason, p_payment_id,
        jsonb_build_object('reward_id', r.id, 'reward_type', r.reward_type, 'adjustment_id', v_adj,
                           'event_key', p_event_key, 'target', v_t, 'refund_fraction', v_eff)
      );
    end if;

    if v_short > 0 then
      insert into public.referral_shortfalls (referrer_user_id, adjustment_id, reward_id, payment_id, amount_mc)
      values (r.referrer_user_id, v_adj, r.id, p_payment_id, v_short)
      returning id into v_sf;
      update public.referral_reward_adjustments set shortfall_id = v_sf where id = v_adj;

      insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
      values ('referral_shortfall_created', 'referral_reward_integrity', r.referrer_user_id,
              jsonb_build_object('reward_id', r.id, 'payment_id', p_payment_id, 'adjustment_id', v_adj,
                                 'shortfall_id', v_sf, 'target', v_t, 'reversed', v_take,
                                 'shortfall', v_short, 'event_key', p_event_key), now());
    end if;

    perform public._referral_reward_recompute(r.id);

    v_total := v_total + v_take;
    v_short_tot := v_short_tot + v_short;
    v_rows := v_rows + 1;
  end loop;

  return jsonb_build_object('rewards', v_rows, 'reversed_mio', v_total, 'shortfall_mio', v_short_tot,
                            'event_fraction', v_event);
end;
$function$;

-- ===========================================================================
-- Vrácení jedné události storna (neúspěšná Stripe refundace) — interní
-- ===========================================================================
create or replace function public._referral_restore_for_payment(p_payment_id uuid, p_event_key text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_referrer  uuid;
  v_wallet    uuid;
  a           record;
  v_sf        public.referral_shortfalls%rowtype;
  v_cancel    numeric;
  v_release   numeric;
  v_res       jsonb;
  v_new       numeric;
  v_restored  numeric := 0;
  v_cancelled numeric := 0;
  v_released  numeric := 0;
  v_rows      integer := 0;
begin
  select referrer_user_id into v_referrer
  from public.referral_reward_adjustments
  where payment_id = p_payment_id and event_key = p_event_key and restored_at is null
  limit 1;

  if v_referrer is null then
    return jsonb_build_object('rewards', 0, 'restored_mio', 0, 'shortfall_cancelled_mio', 0, 'released_mio', 0);
  end if;

  v_wallet := public._referral_lock_wallet(v_referrer);

  for a in
    select *
    from public.referral_reward_adjustments
    where payment_id = p_payment_id and event_key = p_event_key and restored_at is null
    order by created_at, id
    for update
  loop
    perform 1 from public.referral_rewards where id = a.reward_id for update;
    v_cancel := 0;
    v_release := 0;

    -- 1) Přesně odečtená MIO zpět do téže sady.
    if a.from_lot_mc > 0 and a.lot_id is not null then
      update public.wallet_lots
      set remaining_amount = remaining_amount + a.from_lot_mc,
          status = case when status in ('reversed', 'depleted') then 'active' else status end,
          updated_at = now()
      where id = a.lot_id;

      insert into public.wallet_lot_movements (lot_id, user_id, movement_type, amount, reason, reference_id, metadata)
      values (a.lot_id, a.referrer_user_id, 'referral_restore', a.from_lot_mc, 'stripe_refund_failed', p_payment_id,
              jsonb_build_object('reward_id', a.reward_id, 'adjustment_id', a.id, 'event_key', p_event_key));

      perform public._wallet_set_managed(true);
      update public.wallets set balance_coins = balance_coins + a.from_lot_mc
      where id = v_wallet returning balance_coins into v_new;
      perform public._wallet_set_managed(false);

      insert into public.wallet_transactions (
        user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
      ) values (
        a.referrer_user_id, v_wallet, a.from_lot_mc, v_new, 'referral_restore', 'reverse_failed_stripe_refund',
        p_payment_id, jsonb_build_object('reward_id', a.reward_id, 'adjustment_id', a.id, 'lot_id', a.lot_id)
      );
      v_restored := v_restored + a.from_lot_mc;
    end if;

    -- 2) Zrušit přesně pohledávku této události. Co z ní už bylo umořeno
    --    z pozdější odměny, se doporučujícímu vrátí jako nová sada.
    if a.shortfall_id is not null then
      select * into v_sf from public.referral_shortfalls where id = a.shortfall_id for update;
      if v_sf.cancelled_at is null then
        v_cancel := v_sf.amount_mc - v_sf.repaid_mc - v_sf.cancelled_mc;
        v_release := v_sf.repaid_mc - v_sf.released_mc;

        update public.referral_shortfalls
        set cancelled_mc = cancelled_mc + v_cancel,
            released_mc  = released_mc + v_release,
            cancelled_at = now(),
            updated_at   = now()
        where id = v_sf.id;

        if v_release > 0 then
          v_res := public.wallet_credit_lot(
            a.referrer_user_id, v_release, 'referral_shortfall_release',
            v_sf.id, 'referral_shortfall:' || v_sf.id::text,
            null, null, 0, v_release, null, 'referral_shortfall_release',
            jsonb_build_object('shortfall_id', v_sf.id, 'reward_id', a.reward_id,
                               'adjustment_id', a.id, 'event_key', p_event_key));

          insert into public.wallet_transactions (
            user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
          ) values (
            a.referrer_user_id, v_wallet, v_release, (v_res->>'new_balance')::numeric,
            'referral_shortfall_release', 'reverse_failed_stripe_refund', p_payment_id,
            jsonb_build_object('shortfall_id', v_sf.id, 'reward_id', a.reward_id,
                               'adjustment_id', a.id, 'lot_id', v_res->>'lot_id')
          );
        end if;

        insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
        values ('referral_shortfall_cancelled', 'referral_reward_integrity', a.referrer_user_id,
                jsonb_build_object('shortfall_id', v_sf.id, 'adjustment_id', a.id, 'payment_id', p_payment_id,
                                   'cancelled_outstanding', v_cancel, 'released_repaid', v_release,
                                   'event_key', p_event_key), now());
      end if;
    end if;

    update public.referral_reward_adjustments
    set restored_at = now(),
        restore_metadata = jsonb_build_object('restored_mio', a.from_lot_mc,
                                              'shortfall_cancelled_mio', v_cancel,
                                              'released_mio', v_release)
    where id = a.id;

    perform public._referral_reward_recompute(a.reward_id);

    v_cancelled := v_cancelled + v_cancel;
    v_released := v_released + v_release;
    v_rows := v_rows + 1;
  end loop;

  -- Sada mohla mezitím expirovat: vrácená MIO pak řádně expirují s pohybem.
  perform public._wallet_lots_expire_user(v_referrer, v_wallet);

  return jsonb_build_object('rewards', v_rows, 'restored_mio', v_restored,
                            'shortfall_cancelled_mio', v_cancelled, 'released_mio', v_released);
end;
$function$;

-- Storno mimo refundační tok (platba přejde z `completed` do jiného stavu jinak
-- než přes prepare_stripe_refund) → celé odměny. `completed → refund_pending`
-- se přeskakuje: storno dělá prepare poměrně k refundovaným Kč.
create or replace function public.reverse_referral_reward_on_payment_status_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status = 'completed'
     and new.status is distinct from 'completed'
     and new.status is distinct from 'refund_pending' then
    perform public._referral_reverse_for_payment(
      new.id, null, 'payment_status:' || new.id::text,
      'payment_status_changed:' || coalesce(new.status, 'null'));
  end if;

  return new;
end;
$function$;

-- Připsanou odměnu nelze měnit jen stavem (vznikla by neshoda MIO a evidence).
create or replace function public.admin_update_referral_reward(p_reward_id uuid, p_new_status text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_role text;
  v_credited timestamptz;
BEGIN
  -- Check caller is admin or superadmin
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NULL OR v_role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  -- Validate status
  IF p_new_status NOT IN ('earned', 'reversed', 'blocked') THEN
    RAISE EXCEPTION 'Invalid status: %', p_new_status;
  END IF;

  SELECT credited_at INTO v_credited FROM public.referral_rewards WHERE id = p_reward_id;
  IF v_credited IS NOT NULL THEN
    RAISE EXCEPTION 'Odměna už byla připsána do peněženky jako MIO; její stav nelze měnit ručně (referral_reward_credited_locked).'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.referral_rewards
  SET status = p_new_status
  WHERE id = p_reward_id;
END;
$function$;

-- Staré podpisy z dřívější stagingové verze této migrace.
drop function if exists public._referral_restore_for_payment(uuid);
drop function if exists public._referral_reverse_for_payment(uuid, numeric, text);

-- ===========================================================================
-- Refundace v2 + storno odměny za doporučení
-- (definice F4 z 20260924100000, změny označené „FÁZE 5")
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
  v_referral    jsonb;
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

    -- FÁZE 5: 5 % odměna i bonus 15 MIO se stornují poměrně k refundovaným Kč.
    v_referral := public._referral_reverse_for_payment(
      p_payment_id, v_refund_czk, 'stripe_refund:' || p_payment_id::text, 'stripe_refund');
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
    'referral_reversal',  v_referral,
    'stripe_session_id',  v_payment.stripe_session_id,
    'stripe_refund_id',   v_payment.stripe_refund_id,
    'status',             'refund_pending'
  );
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
  v_referral        jsonb;
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

  -- 2) FÁZE 5: vrátit přesně storno odměny za doporučení z této refundace
  --    (MIO do téže sady + zrušení pohledávky vzniklé touto refundací).
  v_referral := public._referral_restore_for_payment(p_payment_id, 'stripe_refund:' || p_payment_id::text);

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
    'referral_reward_restored', coalesce((v_referral->>'rewards')::int, 0) > 0,
    'referral_restore',         v_referral,
    'status',                   'completed',
    'stripe_refund_status',     p_stripe_status
  );
end;
$function$;

-- ===========================================================================
-- Oprávnění
-- ===========================================================================
revoke all on function public._referral_lock_wallet(uuid) from public, anon, authenticated;
revoke all on function public._referral_credit_reward(uuid) from public, anon, authenticated;
revoke all on function public._referral_reward_recompute(uuid) from public, anon, authenticated;
revoke all on function public._referral_reverse_for_payment(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public._referral_restore_for_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.fn_referral_audit_immutable() from public, anon, authenticated;
revoke all on function public.referral_award_for_payment(uuid) from public, anon, authenticated;
grant execute on function public.referral_award_for_payment(uuid) to service_role;
revoke all on function public.create_referral_reward_from_payment() from public, anon, authenticated;
revoke all on function public.reverse_referral_reward_on_payment_status_change() from public, anon, authenticated;
revoke all on function public.prepare_stripe_refund(uuid) from public, anon, authenticated;
revoke all on function public.reverse_failed_stripe_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.prepare_stripe_refund(uuid) to service_role;
grant execute on function public.reverse_failed_stripe_refund(uuid, text) to service_role;

commit;
