-- FÁZE 6 — affiliate provize v Kč (24. 9. 2026)
--
-- Potvrzená pravidla (Pavel):
--   * zákaznická provize = sazba affiliate (dnes 5 %) ze SKUTEČNĚ ZAPLACENÝCH Kč
--     (`payments.paid_amount_czk`), nikdy z `payments.amount` (MIO vč. bonusu),
--   * jen z reálné dokončené placené Stripe platby; first-touch atribuce beze změny,
--   * refundace snižuje provizi ve stejném poměru jako refundované Kč
--     (úplná refundace = celé storno), kumulativně a idempotentně,
--   * provizi, kterou už kvůli vystavenému dokladu / dávce / výplatě nelze zpětně
--     snížit, NEMĚNÍME: refundace vytvoří recovery (pohledávku) téhož affiliate,
--     kterou automaticky umoří jeho budoucí provize (nejstarší recovery první);
--     záporná provize nevzniká, jiný affiliate se nikdy nedotkne,
--   * firemní provize (5 % ze zaplacené faktury bez DPH) se NEMĚNÍ,
--   * DPH affiliate beze změny (21 % nad základ jen u plátce DPH).
--
-- Co se mění technicky:
--   1) `affiliate_commission_payments` — přesná vazba platba → měsíční provize
--      (snapshot zaplacených Kč a sazby, započtená a nezapočtená refundace).
--      Měsíční provize zůstává jeden řádek za affiliate a měsíc (payout workflow
--      beze změny).
--   2) `affiliate_commission_recoveries` — jedna recovery na platbu uzamčené
--      provize, částka = kumulativní rozdíl provize z nezapočtené refundace
--      (vždy přepočet z celkových Kč, žádné sčítání zaokrouhlení). Záporná
--      hodnota = nárok affiliate (refundace se vrátila po uzamčení).
--   3) `affiliate_commission_recovery_allocations` — umoření (`offset`) a vrácený
--      nárok (`release`) navázané na konkrétní zákaznickou provizi. Alokace na
--      provizi, která ještě jde změnit, jsou předběžné a přepočítávají se; po
--      vystavení výplatního dokladu jsou konečné. Nic se nemaže (`released_at`).
--   4) `affiliate_commissions`: `gross_amount_base_czk` (hrubá provize),
--      `recovery_offset_czk`, `recovery_credit_czk`; `amount_base_czk` =
--      hrubá − umoření + vrácený nárok = částka k výplatě (nikdy záporná).
--   5) `calculate_affiliate_commissions_for_month`: zákaznická větev z čistých
--      zaplacených Kč, vazby + umoření; firemní větev doslova beze změny.
--   6) Trigger na `payments` (změna stavu / refundované částky):
--        - `calculated` a `approved` BEZ výplatního dokladu → částka se upraví,
--        - s výplatním dokladem / `ready_to_pay` / `in_payment_batch` / `paid`
--          → provize ani doklad se nemění, vznikne/změní se recovery.
--      Pořadí zámků: platba → affiliate (advisory) → provize.
--
-- Umoření běží jen proti budoucím ZÁKAZNICKÝM provizím; firemní provize se
-- nezapočítávají (firemní větev zůstává beze změny). Účetní/daňové doklady
-- (opravný doklad, DPH u plátce) se automaticky nevystavují — otevřený bod.
--
-- Historické platby bez `paid_amount_czk` se nepřepočítávají (testovací data →
-- předstartovní reset). Nevytváří se druhý provizní systém.
--
-- ZÁMĚRNĚ NEDOTČENO: firemní větev, payout doklady/dávky/export, Fáze 5
-- (osobní doporučení), peněženky MIO, Stripe, prepare/finalize/reverse refundace.

begin;

-- ===========================================================================
-- Vazba platba → měsíční zákaznická provize
-- ===========================================================================
create table if not exists public.affiliate_commission_payments (
  id                   uuid primary key default gen_random_uuid(),
  commission_id        uuid not null references public.affiliate_commissions(id) on delete cascade,
  affiliate_id         uuid not null references public.affiliate_accounts(id) on delete cascade,
  payment_id           uuid not null unique references public.payments(id) on delete restrict,
  paid_amount_czk      numeric(12,2) not null check (paid_amount_czk > 0),
  commission_rate      numeric(6,2) not null check (commission_rate >= 0),
  refunded_czk         numeric(12,2) not null default 0,
  unapplied_refund_czk numeric(12,2) not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (refunded_czk >= 0 and refunded_czk <= paid_amount_czk),
  check (refunded_czk + unapplied_refund_czk >= 0 and refunded_czk + unapplied_refund_czk <= paid_amount_czk)
);
comment on table public.affiliate_commission_payments is
  'Přesná vazba zaplacené platby na měsíční zákaznickou affiliate provizi. refunded_czk = refundace započtená do částky provize; unapplied_refund_czk = refundace po uzamčení provize (výplatní doklad / výplata) — řeší ji recovery.';
create index if not exists idx_acp_commission on public.affiliate_commission_payments(commission_id);
create index if not exists idx_acp_affiliate on public.affiliate_commission_payments(affiliate_id);

alter table public.affiliate_commission_payments enable row level security;
drop policy if exists acp_select on public.affiliate_commission_payments;
create policy acp_select on public.affiliate_commission_payments
  for select to authenticated using (
    public.is_superadmin()
    or affiliate_id in (select a.id from public.affiliate_accounts a where a.auth_user_id = auth.uid())
  );
revoke insert, update, delete, truncate on public.affiliate_commission_payments from anon, authenticated;

-- ===========================================================================
-- Hrubá provize, umoření a vrácený nárok na řádku provize
-- ===========================================================================
alter table public.affiliate_commissions
  add column if not exists gross_amount_base_czk numeric(12,2),
  add column if not exists recovery_offset_czk   numeric(12,2) not null default 0,
  add column if not exists recovery_credit_czk   numeric(12,2) not null default 0;
comment on column public.affiliate_commissions.gross_amount_base_czk is
  'Fáze 6: hrubá zákaznická provize bez DPH před umořením recovery. amount_base_czk = hrubá − recovery_offset_czk + recovery_credit_czk.';

-- ===========================================================================
-- Recovery: refundace k provizi, kterou už nelze zpětně změnit
-- ===========================================================================
create table if not exists public.affiliate_commission_recoveries (
  id              uuid primary key default gen_random_uuid(),
  affiliate_id    uuid not null references public.affiliate_accounts(id) on delete restrict,
  commission_id   uuid not null references public.affiliate_commissions(id) on delete restrict,
  payment_id      uuid not null unique references public.payments(id) on delete restrict,
  line_id         uuid not null unique references public.affiliate_commission_payments(id) on delete restrict,
  amount_czk      numeric(12,2) not null,
  created_at      timestamptz not null default clock_timestamp(),
  updated_at      timestamptz not null default clock_timestamp()
);
comment on table public.affiliate_commission_recoveries is
  'Fáze 6: pohledávka affiliate vzniklá refundací platby, jejíž provize už má výplatní doklad nebo je vyplacená. amount_czk = kumulativní částka provize bez DPH odpovídající nezapočteným refundovaným Kč (záporná = nárok affiliate po selhané refundaci). Umořuje se z budoucích zákaznických provizí téhož affiliate.';
create index if not exists idx_acr_affiliate on public.affiliate_commission_recoveries(affiliate_id, created_at);

create table if not exists public.affiliate_commission_recovery_allocations (
  id              uuid primary key default gen_random_uuid(),
  recovery_id     uuid not null references public.affiliate_commission_recoveries(id) on delete restrict,
  affiliate_id    uuid not null references public.affiliate_accounts(id) on delete restrict,
  commission_id   uuid references public.affiliate_commissions(id) on delete set null,
  kind            text not null check (kind in ('offset', 'release')),
  amount_czk      numeric(12,2) not null check (amount_czk > 0),
  created_at      timestamptz not null default clock_timestamp(),
  released_at     timestamptz,
  release_reason  text
);
comment on table public.affiliate_commission_recovery_allocations is
  'Fáze 6: offset = část recovery umořená z provize; release = vrácený nárok přičtený k provizi. Alokace na provizi s výplatním dokladem je konečná; na ještě měnitelné provizi předběžná (při změně se jen označí released_at, nemaže se).';
create index if not exists idx_acra_recovery on public.affiliate_commission_recovery_allocations(recovery_id) where released_at is null;
create index if not exists idx_acra_commission on public.affiliate_commission_recovery_allocations(commission_id) where released_at is null;

alter table public.affiliate_commission_recoveries enable row level security;
alter table public.affiliate_commission_recovery_allocations enable row level security;
drop policy if exists acr_select on public.affiliate_commission_recoveries;
create policy acr_select on public.affiliate_commission_recoveries
  for select to authenticated using (
    public.is_superadmin()
    or affiliate_id in (select a.id from public.affiliate_accounts a where a.auth_user_id = auth.uid())
  );
drop policy if exists acra_select on public.affiliate_commission_recovery_allocations;
create policy acra_select on public.affiliate_commission_recovery_allocations
  for select to authenticated using (
    public.is_superadmin()
    or affiliate_id in (select a.id from public.affiliate_accounts a where a.auth_user_id = auth.uid())
  );
revoke insert, update, delete, truncate on public.affiliate_commission_recoveries from anon, authenticated;
revoke insert, update, delete, truncate on public.affiliate_commission_recovery_allocations from anon, authenticated;

-- ===========================================================================
-- Čistá zaplacená částka platby pro provizi (interní)
--   completed → celá; refund_pending/refunded → minus refundované Kč;
--   jiný stav (storno, selhání) → 0.
-- ===========================================================================
create or replace function public._affiliate_payment_refunded_czk(p_status text, p_paid numeric, p_refund numeric)
 returns numeric
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when p_status = 'completed' then 0
    when p_status in ('refund_pending', 'refunded') then least(coalesce(p_paid, 0), greatest(coalesce(p_refund, 0), 0))
    else coalesce(p_paid, 0)
  end;
$function$;

-- Nahrazeno _affiliate_recovery_reallocate (starší stagingová verze Fáze 6).
drop function if exists public._affiliate_commission_recompute(uuid);

-- Zámek affiliate (pořadí: platba → affiliate → provize).
create or replace function public._affiliate_recovery_lock(p_affiliate_id uuid)
 returns void
 language sql
 set search_path to ''
as $function$
  select pg_advisory_xact_lock(hashtext('onemil_affiliate_recovery'), hashtext(p_affiliate_id::text));
$function$;

-- ===========================================================================
-- Přepočet měnitelných zákaznických provizí affiliate + umoření recovery.
-- Volající drží zámek affiliate. Deterministické a idempotentní: alokace se
-- mění jen tehdy, když se liší od požadovaného stavu.
-- ===========================================================================
create or replace function public._affiliate_recovery_reallocate(p_affiliate_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_c        record;
  v_r        record;
  v_gross    numeric;
  v_cap      numeric;
  v_take     numeric;
  v_offset   numeric;
  v_credit   numeric;
  v_total    numeric;
  v_changed  int := 0;
begin
  -- Zůstatek každé recovery po KONEČNÝCH alokacích (provize s výplatním dokladem).
  drop table if exists pg_temp.tmp_recovery_bal;
  create temp table tmp_recovery_bal on commit drop as
  select r.id as recovery_id, r.created_at,
         r.amount_czk
         - coalesce(sum(al.amount_czk) filter (where al.kind = 'offset'), 0)
         + coalesce(sum(al.amount_czk) filter (where al.kind = 'release'), 0) as bal
  from public.affiliate_commission_recoveries r
  left join public.affiliate_commission_recovery_allocations al
         on al.recovery_id = r.id and al.released_at is null
        and exists (select 1 from public.affiliate_commissions c
                    where c.id = al.commission_id
                      and (c.payout_document_id is not null
                           or c.status in ('ready_to_pay', 'in_payment_batch', 'paid')))
  where r.affiliate_id = p_affiliate_id
  group by r.id, r.created_at, r.amount_czk;

  for v_c in
    select c.*
    from public.affiliate_commissions c
    where c.affiliate_id = p_affiliate_id
      and c.commission_type = 'customer_payments'
      and (c.status = 'calculated' or (c.status = 'approved' and c.payout_document_id is null))
      and exists (select 1 from public.affiliate_commission_payments l where l.commission_id = c.id)
    order by c.period_month, c.created_at, c.id
    for update of c
  loop
    select coalesce(round(sum((l.paid_amount_czk - l.refunded_czk) * l.commission_rate / 100.0), 2), 0)
    into v_gross
    from public.affiliate_commission_payments l
    where l.commission_id = v_c.id;

    v_cap := v_gross;
    drop table if exists pg_temp.tmp_recovery_desired;
    create temp table tmp_recovery_desired (recovery_id uuid, kind text, amount_czk numeric) on commit drop;

    -- 1) vrácené nároky (záporný zůstatek) se přičtou k provizi
    for v_r in select recovery_id, bal from tmp_recovery_bal where bal < 0 order by created_at, recovery_id loop
      insert into tmp_recovery_desired values (v_r.recovery_id, 'release', -v_r.bal);
      v_cap := v_cap - v_r.bal;
      update tmp_recovery_bal set bal = 0 where recovery_id = v_r.recovery_id;
    end loop;

    -- 2) otevřené recovery se umoří, nejstarší první, nejvýš do výše provize
    for v_r in select recovery_id, bal from tmp_recovery_bal where bal > 0 order by created_at, recovery_id loop
      exit when v_cap <= 0;
      v_take := least(v_r.bal, v_cap);
      insert into tmp_recovery_desired values (v_r.recovery_id, 'offset', v_take);
      v_cap := v_cap - v_take;
      update tmp_recovery_bal set bal = bal - v_take where recovery_id = v_r.recovery_id;
    end loop;

    if exists (select recovery_id, kind, amount_czk from tmp_recovery_desired
               except
               select recovery_id, kind, amount_czk from public.affiliate_commission_recovery_allocations
               where commission_id = v_c.id and released_at is null)
       or exists (select recovery_id, kind, amount_czk from public.affiliate_commission_recovery_allocations
                  where commission_id = v_c.id and released_at is null
                  except
                  select recovery_id, kind, amount_czk from tmp_recovery_desired) then
      update public.affiliate_commission_recovery_allocations
      set released_at = clock_timestamp(), release_reason = 'reallocated'
      where commission_id = v_c.id and released_at is null;

      insert into public.affiliate_commission_recovery_allocations (recovery_id, affiliate_id, commission_id, kind, amount_czk)
      select recovery_id, p_affiliate_id, v_c.id, kind, amount_czk from tmp_recovery_desired;
    end if;

    select coalesce(sum(amount_czk) filter (where kind = 'offset'), 0),
           coalesce(sum(amount_czk) filter (where kind = 'release'), 0)
    into v_offset, v_credit
    from tmp_recovery_desired;

    v_total := case when coalesce(v_c.vat_rate, 0) > 0
                    then round(v_cap * (1 + v_c.vat_rate / 100.0), 2)
                    else v_cap end;

    if v_c.amount_base_czk is distinct from v_cap
       or v_c.amount_total_czk is distinct from v_total
       or v_c.gross_amount_base_czk is distinct from v_gross
       or v_c.recovery_offset_czk is distinct from v_offset
       or v_c.recovery_credit_czk is distinct from v_credit then
      update public.affiliate_commissions
      set amount_base_czk = v_cap, amount_total_czk = v_total, gross_amount_base_czk = v_gross,
          recovery_offset_czk = v_offset, recovery_credit_czk = v_credit, updated_at = now()
      where id = v_c.id;
      v_changed := v_changed + 1;

      if v_offset <> 0 or v_credit <> 0 or v_c.recovery_offset_czk <> 0 or v_c.recovery_credit_czk <> 0 then
        insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
        values ('affiliate_commission_recovery_applied', 'affiliate_commission_integrity', null,
                jsonb_build_object('commission_id', v_c.id, 'affiliate_id', p_affiliate_id,
                                   'commission_status', v_c.status,
                                   'gross_amount_base_czk', v_gross,
                                   'recovery_offset_czk', v_offset,
                                   'recovery_credit_czk', v_credit,
                                   'net_amount_base_czk', v_cap,
                                   'net_amount_total_czk', v_total,
                                   'previous_amount_base_czk', v_c.amount_base_czk,
                                   'remaining_recovery_czk', (select coalesce(sum(bal), 0) from tmp_recovery_bal where bal > 0),
                                   'allocations', (select coalesce(jsonb_agg(jsonb_build_object('recovery_id', recovery_id, 'kind', kind, 'amount_czk', amount_czk)), '[]'::jsonb) from tmp_recovery_desired)),
                now());
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'changed_commissions', v_changed,
    'open_recovery_czk', (select coalesce(sum(bal), 0) from tmp_recovery_bal where bal > 0),
    'pending_credit_czk', (select coalesce(-sum(bal), 0) from tmp_recovery_bal where bal < 0));
end;
$function$;

-- ===========================================================================
-- Refundace / změna stavu platby → přepočet provize nebo recovery
-- ===========================================================================
create or replace function public.affiliate_commission_sync_payment(p_payment_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_pay       public.payments%rowtype;
  v_line      public.affiliate_commission_payments%rowtype;
  v_c         public.affiliate_commissions%rowtype;
  v_target    numeric;
  v_unapplied numeric;
  v_rec       numeric;
  v_prev_rec  numeric;
  v_rec_id    uuid;
  v_new_base  numeric;
  v_res       jsonb;
begin
  -- Zámek platby (v triggeru už ho refundace drží) → pořadí platba → affiliate → provize.
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.paid_amount_czk is null then
    return jsonb_build_object('status', 'not_applicable');
  end if;

  if not exists (select 1 from public.affiliate_customer_refs where user_id = v_pay.user_id) then
    return jsonb_build_object('status', 'no_affiliate');
  end if;

  select * into v_line from public.affiliate_commission_payments where payment_id = p_payment_id;
  if not found then
    -- Platba zatím v žádné provizi není; měsíční výpočet ji započte z aktuálního stavu.
    return jsonb_build_object('status', 'not_in_commission');
  end if;

  -- Zámek affiliate (serializuje recovery a umoření téhož affiliate). Měsíční
  -- výpočet ho bere až po zámku plateb měsíce, takže pořadí je vždy platba → affiliate.
  perform public._affiliate_recovery_lock(v_line.affiliate_id);

  select * into v_c from public.affiliate_commissions where id = v_line.commission_id for update;
  select * into v_line from public.affiliate_commission_payments where id = v_line.id for update;

  v_target := public._affiliate_payment_refunded_czk(v_pay.status, v_pay.paid_amount_czk, v_pay.refund_amount_czk);

  if v_c.status = 'calculated' or (v_c.status = 'approved' and v_c.payout_document_id is null) then
    -- Provizi lze ještě změnit. Idempotentní: nastaví se stav, ne přírůstek.
    if v_line.refunded_czk = v_target and v_line.unapplied_refund_czk = 0 then
      return jsonb_build_object('status', 'unchanged', 'commission_id', v_c.id);
    end if;

    update public.affiliate_commission_payments
    set refunded_czk = v_target, unapplied_refund_czk = 0, updated_at = now()
    where id = v_line.id;

    v_res := public._affiliate_recovery_reallocate(v_line.affiliate_id);
    select amount_base_czk into v_new_base from public.affiliate_commissions where id = v_c.id;

    insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
    values ('affiliate_commission_adjusted', 'affiliate_commission_integrity', null,
            jsonb_build_object('commission_id', v_c.id, 'affiliate_id', v_c.affiliate_id,
                               'payment_id', p_payment_id, 'payment_status', v_pay.status,
                               'refunded_czk', v_target, 'previous_refunded_czk', v_line.refunded_czk,
                               'commission_status', v_c.status,
                               'amount_base_czk', v_new_base,
                               'previous_base_czk', v_c.amount_base_czk), now());

    return jsonb_build_object('status', 'adjusted', 'commission_id', v_c.id,
                              'amount_base_czk', v_new_base, 'previous_base_czk', v_c.amount_base_czk) || v_res;
  end if;

  -- Výplatní doklad je vystavený nebo je provize vyplacená: provize ani doklad se
  -- nemění. Kumulativní recovery = rozdíl provize této platby z nezapočtených Kč
  -- (vždy z celkových částek → žádná chyba zaokrouhlení). Záporná = nárok affiliate.
  v_unapplied := v_target - v_line.refunded_czk;
  v_rec := round((v_line.paid_amount_czk - v_line.refunded_czk) * v_line.commission_rate / 100.0, 2)
         - round((v_line.paid_amount_czk - v_line.refunded_czk - v_unapplied) * v_line.commission_rate / 100.0, 2);

  select id, amount_czk into v_rec_id, v_prev_rec
  from public.affiliate_commission_recoveries where line_id = v_line.id;

  if v_line.unapplied_refund_czk = v_unapplied and coalesce(v_prev_rec, 0) = v_rec then
    return jsonb_build_object('status', 'unchanged_locked', 'commission_id', v_c.id,
                              'recovery_czk', coalesce(v_prev_rec, 0));
  end if;

  update public.affiliate_commission_payments
  set unapplied_refund_czk = v_unapplied, updated_at = now()
  where id = v_line.id;

  insert into public.affiliate_commission_recoveries (affiliate_id, commission_id, payment_id, line_id, amount_czk)
  values (v_line.affiliate_id, v_c.id, p_payment_id, v_line.id, v_rec)
  on conflict (line_id) do update set amount_czk = excluded.amount_czk, updated_at = clock_timestamp()
  returning id into v_rec_id;

  insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
  values ('affiliate_commission_recovery_recorded', 'affiliate_commission_integrity', null,
          jsonb_build_object('recovery_id', v_rec_id, 'commission_id', v_c.id, 'affiliate_id', v_c.affiliate_id,
                             'payment_id', p_payment_id, 'payment_status', v_pay.status,
                             'commission_status', v_c.status,
                             'unapplied_refund_czk', v_unapplied,
                             'recovery_czk', v_rec, 'previous_recovery_czk', coalesce(v_prev_rec, 0),
                             'note', 'Provize má výplatní doklad nebo je vyplacená; provize ani doklad se nemění, recovery se umoří z budoucích provizí téhož affiliate.'),
          now());

  v_res := public._affiliate_recovery_reallocate(v_line.affiliate_id);

  return jsonb_build_object('status', 'recovery_recorded', 'commission_id', v_c.id,
                            'commission_status', v_c.status, 'recovery_id', v_rec_id,
                            'recovery_czk', v_rec, 'unapplied_refund_czk', v_unapplied) || v_res;
end;
$function$;

create or replace function public.trg_fn_affiliate_commission_payment_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.paid_amount_czk is not null
     and (old.status is distinct from new.status
          or old.refund_amount_czk is distinct from new.refund_amount_czk) then
    perform public.affiliate_commission_sync_payment(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_affiliate_commission_payment_sync on public.payments;
create trigger trg_affiliate_commission_payment_sync
  after update of status, refund_amount_czk on public.payments
  for each row execute function public.trg_fn_affiliate_commission_payment_sync();

-- ===========================================================================
-- Měsíční výpočet: zákaznická větev ze zaplacených Kč + vazby + umoření;
-- firemní větev beze změny
-- ===========================================================================
create or replace function public.calculate_affiliate_commissions_for_month(p_month date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
  v_aids  uuid[] := '{}'::uuid[];
  v_aid   uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;
  IF p_month IS NULL THEN RETURN jsonb_build_object('status', 'invalid_month'); END IF;

  -- FÁZE 6: souběžné výpočty jeden po druhém; a nejdřív zamknout platby měsíce
  -- (FOR SHARE), aby běžící refundace doběhla dřív, než se z nich spočítá částka,
  -- a refundace začatá později počkala na dokončení výpočtu (pořadí platba → affiliate → provize).
  PERFORM pg_advisory_xact_lock(hashtext('onemil_affiliate_customer_commissions'));
  PERFORM 1
  FROM public.payments pay
  JOIN public.affiliate_customer_refs cr ON cr.user_id = pay.user_id
  WHERE pay.paid_amount_czk IS NOT NULL
    AND date_trunc('month', pay.created_at)::date = v_month
  ORDER BY pay.id
  FOR SHARE OF pay;

  -- FÁZE 6: zámky dotčených affiliate DŘÍV, než se sáhne na provize.
  FOR v_aid IN
    SELECT DISTINCT s.aid FROM (
      SELECT c.affiliate_id AS aid FROM public.affiliate_commissions c
      WHERE c.period_month = v_month AND c.status = 'calculated' AND c.commission_type = 'customer_payments'
      UNION
      SELECT cr.affiliate_id FROM public.affiliate_customer_refs cr
      JOIN public.payments pay ON pay.user_id = cr.user_id
      WHERE pay.paid_amount_czk IS NOT NULL
        AND date_trunc('month', pay.created_at)::date = v_month
    ) s
    ORDER BY s.aid
  LOOP
    PERFORM public._affiliate_recovery_lock(v_aid);
    v_aids := array_append(v_aids, v_aid);
  END LOOP;

  -- Předběžná umoření na přepočítávaných řádcích se uvolní (historie zůstává).
  UPDATE public.affiliate_commission_recovery_allocations
  SET released_at = clock_timestamp(), release_reason = 'commission_recalculated'
  WHERE released_at IS NULL
    AND commission_id IN (SELECT id FROM public.affiliate_commissions
                          WHERE period_month = v_month AND status = 'calculated');

  -- Vazby na mazané řádky zmizí kaskádou.
  DELETE FROM public.affiliate_commissions
  WHERE period_month = v_month AND status = 'calculated';

  -- FÁZE 6: zákaznická větev — základ = skutečně zaplacené Kč po refundacích.
  -- Jen nová Stripe dobití (paid_amount_czk); historické platby bez Kč se nepočítají.
  -- Platba, která už je navázaná na jinou (neprepočítávanou) provizi, se nepočítá znovu.
  DROP TABLE IF EXISTS pg_temp.tmp_affiliate_month_payments;
  CREATE TEMP TABLE tmp_affiliate_month_payments ON COMMIT DROP AS
  SELECT cr.affiliate_id AS aid, a.is_vat_payer, a.commission_rate_customer AS rate,
         pay.id AS payment_id, pay.paid_amount_czk AS paid,
         public._affiliate_payment_refunded_czk(pay.status, pay.paid_amount_czk, pay.refund_amount_czk) AS refunded
  FROM public.affiliate_customer_refs cr
  JOIN public.affiliate_accounts a ON a.id = cr.affiliate_id
  JOIN public.payments pay ON pay.user_id = cr.user_id
  WHERE a.status = 'approved'
    AND pay.status IN ('completed', 'refund_pending', 'refunded')
    AND pay.paid_amount_czk IS NOT NULL
    AND pay.paid_amount_czk > 0
    AND pay.stripe_session_id IS NOT NULL
    AND (pay.method IS NULL OR pay.method NOT IN ('bonus','partner','api'))
    AND date_trunc('month', pay.created_at)::date = v_month
    AND NOT EXISTS (SELECT 1 FROM public.affiliate_commission_payments l WHERE l.payment_id = pay.id);

  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, amount_base_czk, vat_rate, amount_total_czk, status,
     gross_amount_base_czk)
  SELECT
    s.aid, 'customer_payments', v_month, s.base,
    CASE WHEN s.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN s.is_vat_payer THEN ROUND(s.base * 1.21, 2) ELSE s.base END,
    'calculated',
    s.base
  FROM (
    SELECT t.aid, t.is_vat_payer,
      ROUND(SUM((t.paid - t.refunded) * t.rate / 100.0), 2) AS base
    FROM tmp_affiliate_month_payments t
    GROUP BY t.aid, t.is_vat_payer
    HAVING SUM(t.paid - t.refunded) > 0
  ) s
  ON CONFLICT (affiliate_id, commission_type, period_month)
    WHERE period_month IS NOT NULL AND commission_type = 'customer_payments'
  DO NOTHING;

  -- Vazby platba → provize (jen k právě vytvořeným řádkům ve stavu calculated).
  INSERT INTO public.affiliate_commission_payments
    (commission_id, affiliate_id, payment_id, paid_amount_czk, commission_rate, refunded_czk)
  SELECT c.id, t.aid, t.payment_id, t.paid, t.rate, t.refunded
  FROM tmp_affiliate_month_payments t
  JOIN public.affiliate_commissions c
    ON c.affiliate_id = t.aid
   AND c.commission_type = 'customer_payments'
   AND c.period_month = v_month
   AND c.status = 'calculated'
  ON CONFLICT (payment_id) DO NOTHING;

  -- FÁZE 6: umoření otevřených recovery z nových provizí (jen affiliate s recovery).
  FOREACH v_aid IN ARRAY v_aids LOOP
    IF EXISTS (SELECT 1 FROM public.affiliate_commission_recoveries r WHERE r.affiliate_id = v_aid) THEN
      PERFORM public._affiliate_recovery_reallocate(v_aid);
    END IF;
  END LOOP;

  -- Firemní větev — beze změny.
  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, source_invoice_id, company_ref_id,
     amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    p.referred_by_affiliate_id,
    'company_invoice',
    date_trunc('month', pi.paid_at)::date,
    pi.id,
    cref.id,
    ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2),
    CASE WHEN a.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN a.is_vat_payer
         THEN ROUND(ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2) * 1.21, 2)
         ELSE ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2) END,
    'calculated'
  FROM public.partner_invoices pi
  JOIN public.partners p           ON p.id = pi.partner_id
  JOIN public.affiliate_accounts a ON a.id = p.referred_by_affiliate_id
  LEFT JOIN public.affiliate_company_refs cref
         ON cref.partner_id   = pi.partner_id
        AND cref.affiliate_id = p.referred_by_affiliate_id
  WHERE p.referred_by_affiliate_id IS NOT NULL
    AND a.status = 'approved'
    AND pi.status = 'paid'
    AND pi.paid_at IS NOT NULL
    AND COALESCE(pi.amount_ex_vat, 0) > 0
    AND date_trunc('month', pi.paid_at)::date <= v_month
  ON CONFLICT (source_invoice_id) WHERE source_invoice_id IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'ok', 'period_month', v_month,
    'customer_rows', (SELECT count(*) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_rows',  (SELECT count(*) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated'),
    'customer_total',(SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_total', (SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated')
  );
END;
$function$;

-- ===========================================================================
-- Oprávnění (měsíční výpočet ponechává dnešní granty: authenticated s admin
-- guardem uvnitř + service_role pro cron)
-- ===========================================================================
revoke all on function public._affiliate_payment_refunded_czk(text, numeric, numeric) from public, anon, authenticated;
revoke all on function public._affiliate_recovery_lock(uuid) from public, anon, authenticated;
revoke all on function public._affiliate_recovery_reallocate(uuid) from public, anon, authenticated;
revoke all on function public.affiliate_commission_sync_payment(uuid) from public, anon, authenticated;
grant execute on function public.affiliate_commission_sync_payment(uuid) to service_role;
revoke all on function public.trg_fn_affiliate_commission_payment_sync() from public, anon, authenticated;
revoke all on function public.calculate_affiliate_commissions_for_month(date) from public, anon;
grant execute on function public.calculate_affiliate_commissions_for_month(date) to authenticated, service_role;

commit;
