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
--   6) Výplatní doklad: prepare_affiliate_payout_document pod zámkem provize
--      zapíše neměnný snapshot (affiliate_payout_document_snapshots) a uzamkne
--      provizi (payout_locked_at); PDF i finalize_affiliate_payout_document
--      pracují výhradně se snapshotem. Částku uzamčené provize nejde změnit.
--   7) Trigger na `payments` (změna stavu / refundované částky):
--        - `calculated` a `approved` BEZ výplatního dokladu → částka se upraví,
--        - se snapshotem / výplatním dokladem / `ready_to_pay` / `in_payment_batch` / `paid`
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
-- ZÁMĚRNĚ NEDOTČENO: firemní větev, payout dávky/export, Edge Function dokladu, Fáze 5
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
-- Výplatní doklad: neměnný snapshot částky + uzamčení provize (souběh s refundací)
--
-- Tok dokladu: prepare_affiliate_payout_document (DB) → PDF v Edge Function
-- create-affiliate-payout-document (čte VÝHRADNĚ výstup prepare) → upload →
-- finalize_affiliate_payout_document (DB). prepare pod zámkem řádku provize
-- zapíše snapshot a nastaví payout_locked_at: od té chvíle je provize uzamčená
-- stejně jako s vystaveným dokladem (refundace → recovery). finalize vloží doklad
-- výhradně ze snapshotu. Částku uzamčené provize nelze změnit žádnou cestou.
-- ===========================================================================
alter table public.affiliate_commissions
  add column if not exists payout_locked_at timestamptz;
comment on column public.affiliate_commissions.payout_locked_at is
  'Fáze 6: okamžik, kdy prepare_affiliate_payout_document zafixoval částku pro výplatní doklad (snapshot). Od té chvíle se provize nemění; refundace vytváří recovery.';

create table if not exists public.affiliate_payout_document_snapshots (
  commission_id    uuid primary key references public.affiliate_commissions(id) on delete cascade,
  affiliate_id     uuid not null references public.affiliate_accounts(id) on delete restrict,
  document_number  text not null unique,
  amount_base_czk  numeric(12,2) not null,
  vat_rate         numeric not null,
  amount_total_czk numeric(12,2) not null,
  payload          jsonb not null,
  created_at       timestamptz not null default clock_timestamp(),
  document_id      uuid references public.affiliate_payout_documents(id) on delete set null,
  finalized_at     timestamptz
);
comment on table public.affiliate_payout_document_snapshots is
  'Fáze 6: neměnný finanční snapshot výplatního dokladu zapsaný pod zámkem provize v prepare_affiliate_payout_document. PDF i affiliate_payout_documents vznikají výhradně z něj.';

alter table public.affiliate_payout_document_snapshots enable row level security;
drop policy if exists apds_select on public.affiliate_payout_document_snapshots;
create policy apds_select on public.affiliate_payout_document_snapshots
  for select to authenticated using (public.is_superadmin());
revoke insert, update, delete, truncate on public.affiliate_payout_document_snapshots from anon, authenticated;

-- Snapshot je neměnný: smí se jen jednou doplnit vazba na vzniklý doklad. Zmizet
-- smí jen spolu se svou provizí (kaskáda) a vazba na doklad jen se smazaným dokladem.
create or replace function public.trg_fn_affiliate_payout_snapshot_immutable()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.affiliate_commissions where id = old.commission_id) then
      return old;
    end if;
    raise exception 'affiliate_payout_snapshot_immutable' using errcode = '42501';
  end if;
  if new.commission_id is distinct from old.commission_id
     or new.affiliate_id is distinct from old.affiliate_id
     or new.document_number is distinct from old.document_number
     or new.amount_base_czk is distinct from old.amount_base_czk
     or new.vat_rate is distinct from old.vat_rate
     or new.amount_total_czk is distinct from old.amount_total_czk
     or new.payload is distinct from old.payload
     or new.created_at is distinct from old.created_at
     or (old.document_id is not null and new.document_id is distinct from old.document_id
         and exists (select 1 from public.affiliate_payout_documents where id = old.document_id))
     or (old.finalized_at is not null and new.finalized_at is distinct from old.finalized_at) then
    raise exception 'affiliate_payout_snapshot_immutable' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_affiliate_payout_snapshot_immutable on public.affiliate_payout_document_snapshots;
create trigger trg_affiliate_payout_snapshot_immutable
  before update or delete on public.affiliate_payout_document_snapshots
  for each row execute function public.trg_fn_affiliate_payout_snapshot_immutable();

-- Částka uzamčené provize (snapshot nebo doklad) se nesmí změnit žádnou cestou.
create or replace function public.trg_fn_affiliate_commission_amount_frozen()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if (old.payout_locked_at is not null or old.payout_document_id is not null)
     and (new.amount_base_czk is distinct from old.amount_base_czk
          or new.amount_total_czk is distinct from old.amount_total_czk
          or new.vat_rate is distinct from old.vat_rate) then
    raise exception 'affiliate_commission_amount_frozen' using errcode = '42501';
  end if;
  if old.payout_locked_at is not null and new.payout_locked_at is distinct from old.payout_locked_at then
    raise exception 'affiliate_commission_amount_frozen' using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_affiliate_commission_amount_frozen on public.affiliate_commissions;
create trigger trg_affiliate_commission_amount_frozen
  before update of amount_base_czk, amount_total_czk, vat_rate, payout_locked_at on public.affiliate_commissions
  for each row execute function public.trg_fn_affiliate_commission_amount_frozen();

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
                           or c.payout_locked_at is not null
                           or c.status in ('ready_to_pay', 'in_payment_batch', 'paid')))
  where r.affiliate_id = p_affiliate_id
  group by r.id, r.created_at, r.amount_czk;

  for v_c in
    select c.*
    from public.affiliate_commissions c
    where c.affiliate_id = p_affiliate_id
      and c.commission_type = 'customer_payments'
      and (c.status = 'calculated'
           or (c.status = 'approved' and c.payout_document_id is null and c.payout_locked_at is null))
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

  if v_c.status = 'calculated'
     or (v_c.status = 'approved' and v_c.payout_document_id is null and v_c.payout_locked_at is null) then
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

  -- Výplatní doklad je vystavený / připravený (snapshot) nebo je provize vyplacená: provize ani doklad se
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
-- Výplatní doklad — prepare: pod zámkem provize zapíše neměnný snapshot a
-- provizi uzamkne (payout_locked_at). Opakované volání vrátí týž snapshot
-- (stejné číslo dokladu i částky). Edge Function staví PDF jen z tohoto výstupu.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.prepare_affiliate_payout_document(p_commission_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row record;
  v_accounting_email text;
  v_document_number text;
  v_recipient_billing_address text;
  v_document_type text;
  v_snap public.affiliate_payout_document_snapshots%ROWTYPE;
  v_payload jsonb;
BEGIN
  IF p_commission_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_commission_id');
  END IF;

  SELECT btrim(value)
  INTO v_accounting_email
  FROM public.settings
  WHERE key = 'accounting_email'
  LIMIT 1;

  IF v_accounting_email IS NULL OR v_accounting_email = '' THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_accounting_email');
  END IF;

  -- FÁZE 6: zámek řádku provize drží celé rozhodnutí o částce; refundace čeká
  -- (pořadí platba → affiliate → provize) a po uvolnění už vidí uzamčenou provizi.
  SELECT
    c.id,
    c.affiliate_id,
    c.status,
    c.amount_base_czk,
    c.vat_rate,
    c.amount_total_czk,
    c.payout_document_id,
    c.payout_locked_at,
    a.name AS recipient_name,
    a.email AS recipient_email,
    a.ico AS recipient_ico,
    a.vat_id AS recipient_vat_id,
    a.is_vat_payer AS recipient_is_vat_payer,
    a.billing_street,
    a.billing_city,
    a.billing_zip,
    a.billing_country
  INTO v_row
  FROM public.affiliate_commissions c
  JOIN public.affiliate_accounts a ON a.id = c.affiliate_id
  WHERE c.id = p_commission_id
  FOR UPDATE OF c;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'status', 'commission_not_found');
  END IF;

  IF v_row.status <> 'approved' THEN
    RETURN jsonb_build_object(
      'success', false,
      'status', 'invalid_commission_status',
      'current_status', v_row.status
    );
  END IF;

  IF v_row.payout_document_id IS NOT NULL
     OR EXISTS (
       SELECT 1
       FROM public.affiliate_payout_documents d
       WHERE d.commission_id = p_commission_id
     ) THEN
    RETURN jsonb_build_object('success', false, 'status', 'document_already_exists');
  END IF;

  -- FÁZE 6: snapshot už existuje (předchozí pokus nedoběhl) → vrátit přesně jej.
  SELECT * INTO v_snap
  FROM public.affiliate_payout_document_snapshots
  WHERE commission_id = p_commission_id;
  IF FOUND THEN
    RETURN v_snap.payload || jsonb_build_object('snapshot_reused', true);
  END IF;

  IF v_row.recipient_name IS NULL OR btrim(v_row.recipient_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_name');
  END IF;

  IF v_row.recipient_email IS NULL OR btrim(v_row.recipient_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_email');
  END IF;

  IF v_row.amount_total_czk IS NULL OR v_row.amount_total_czk <= 0 THEN
    RETURN jsonb_build_object('success', false, 'status', 'invalid_amount');
  END IF;

  IF coalesce(v_row.recipient_is_vat_payer, false)
     AND (v_row.recipient_vat_id IS NULL OR btrim(v_row.recipient_vat_id) = '') THEN
    RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_vat_id');
  END IF;

  v_document_type := CASE
    WHEN coalesce(v_row.recipient_is_vat_payer, false) THEN 'self_billed_tax_invoice'
    ELSE 'commission_statement'
  END;

  v_recipient_billing_address := nullif(
    concat_ws(
      ', ',
      nullif(btrim(coalesce(v_row.billing_street, '')), ''),
      nullif(btrim(concat_ws(' ', v_row.billing_zip, v_row.billing_city)), ''),
      nullif(btrim(coalesce(v_row.billing_country, '')), '')
    ),
    ''
  );

  v_document_number := public.next_affiliate_payout_document_number();

  v_payload := jsonb_build_object(
    'success', true,
    'status', 'prepared',
    'commission_id', v_row.id,
    'affiliate_id', v_row.affiliate_id,
    'document_number', v_document_number,
    'document_type', v_document_type,
    'recipient_name', btrim(v_row.recipient_name),
    'recipient_email', btrim(v_row.recipient_email),
    'recipient_ico', v_row.recipient_ico,
    'recipient_vat_id', v_row.recipient_vat_id,
    'recipient_billing_address', v_recipient_billing_address,
    'recipient_is_vat_payer', coalesce(v_row.recipient_is_vat_payer, false),
    'recipient_subject_type', CASE
      WHEN coalesce(v_row.recipient_is_vat_payer, false) THEN 'vat_payer'
      ELSE 'non_vat_payer'
    END,
    'amount_base_czk', v_row.amount_base_czk,
    'vat_rate', coalesce(v_row.vat_rate, 0),
    'amount_total_czk', v_row.amount_total_czk,
    'accounting_email', v_accounting_email
  );

  INSERT INTO public.affiliate_payout_document_snapshots
    (commission_id, affiliate_id, document_number, amount_base_czk, vat_rate, amount_total_czk, payload)
  VALUES
    (v_row.id, v_row.affiliate_id, v_document_number, v_row.amount_base_czk,
     coalesce(v_row.vat_rate, 0), v_row.amount_total_czk, v_payload);

  UPDATE public.affiliate_commissions
  SET payout_locked_at = clock_timestamp(), updated_at = now()
  WHERE id = p_commission_id;

  RETURN v_payload;
END;
$function$;

-- ===========================================================================
-- Výplatní doklad — finalize: doklad vzniká VÝHRADNĚ ze snapshotu; živá částka
-- provize se musí se snapshotem shodovat (jinak se nic nezapíše).
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.finalize_affiliate_payout_document(p_commission_id uuid, p_document_number text, p_pdf_storage_path text, p_pdf_sha256 text, p_affiliate_email_subject text, p_affiliate_email_body text, p_accounting_email_subject text, p_accounting_email_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_row record;
  v_snap public.affiliate_payout_document_snapshots%ROWTYPE;
  v_accounting_email text;
  v_document_id uuid;
  v_affiliate_email_queue_id uuid;
  v_accounting_email_queue_id uuid;
  v_updated_count integer;
BEGIN
  BEGIN
    IF p_commission_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_commission_id');
    END IF;

    IF p_document_number IS NULL OR p_document_number !~ '^APD-[0-9]{4}-[0-9]{6}$' THEN
      RETURN jsonb_build_object('success', false, 'status', 'invalid_document_number');
    END IF;

    IF p_pdf_storage_path IS NULL OR btrim(p_pdf_storage_path) = '' THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_pdf_storage_path');
    END IF;

    IF p_pdf_sha256 IS NULL OR p_pdf_sha256 !~ '^[a-f0-9]{64}$' THEN
      RETURN jsonb_build_object('success', false, 'status', 'invalid_pdf_sha256');
    END IF;

    SELECT btrim(value)
    INTO v_accounting_email
    FROM public.settings
    WHERE key = 'accounting_email'
    LIMIT 1;

    IF v_accounting_email IS NULL OR v_accounting_email = '' THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_accounting_email');
    END IF;

    SELECT
      c.id,
      c.affiliate_id,
      c.status,
      c.amount_base_czk,
      c.vat_rate,
      c.amount_total_czk,
      c.payout_document_id,
      c.payout_locked_at
    INTO v_row
    FROM public.affiliate_commissions c
    WHERE c.id = p_commission_id
    FOR UPDATE OF c;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'status', 'commission_not_found');
    END IF;

    IF v_row.status <> 'approved' THEN
      RETURN jsonb_build_object(
        'success', false,
        'status', 'invalid_commission_status',
        'current_status', v_row.status
      );
    END IF;

    IF v_row.payout_document_id IS NOT NULL
       OR EXISTS (
         SELECT 1
         FROM public.affiliate_payout_documents d
         WHERE d.commission_id = p_commission_id
       ) THEN
      RETURN jsonb_build_object('success', false, 'status', 'document_already_exists');
    END IF;

    -- FÁZE 6: doklad jen ze snapshotu z prepare (stejné číslo i částky jako PDF).
    SELECT * INTO v_snap
    FROM public.affiliate_payout_document_snapshots
    WHERE commission_id = p_commission_id
    FOR UPDATE;

    IF NOT FOUND OR v_row.payout_locked_at IS NULL THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_payout_snapshot');
    END IF;

    IF v_snap.document_number <> p_document_number THEN
      RETURN jsonb_build_object('success', false, 'status', 'payout_snapshot_mismatch');
    END IF;

    IF v_row.amount_base_czk IS DISTINCT FROM v_snap.amount_base_czk
       OR v_row.amount_total_czk IS DISTINCT FROM v_snap.amount_total_czk
       OR coalesce(v_row.vat_rate, 0) IS DISTINCT FROM v_snap.vat_rate THEN
      RETURN jsonb_build_object('success', false, 'status', 'payout_snapshot_amount_mismatch');
    END IF;

    IF v_snap.amount_total_czk IS NULL OR v_snap.amount_total_czk <= 0 THEN
      RETURN jsonb_build_object('success', false, 'status', 'invalid_amount');
    END IF;

    IF coalesce(btrim(v_snap.payload->>'recipient_name'), '') = '' THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_name');
    END IF;

    IF coalesce(btrim(v_snap.payload->>'recipient_email'), '') = '' THEN
      RETURN jsonb_build_object('success', false, 'status', 'missing_recipient_email');
    END IF;

    INSERT INTO public.affiliate_payout_documents (
      commission_id,
      affiliate_id,
      document_number,
      document_type,
      recipient_name,
      recipient_email,
      recipient_ico,
      recipient_vat_id,
      recipient_billing_address,
      recipient_is_vat_payer,
      recipient_subject_type,
      amount_base_czk,
      vat_rate,
      amount_total_czk,
      pdf_url,
      pdf_storage_path,
      pdf_generated_at,
      pdf_sha256,
      email_status,
      affiliate_email,
      accounting_email
    )
    VALUES (
      v_row.id,
      v_row.affiliate_id,
      v_snap.document_number,
      v_snap.payload->>'document_type',
      v_snap.payload->>'recipient_name',
      v_snap.payload->>'recipient_email',
      v_snap.payload->>'recipient_ico',
      v_snap.payload->>'recipient_vat_id',
      v_snap.payload->>'recipient_billing_address',
      coalesce((v_snap.payload->>'recipient_is_vat_payer')::boolean, false),
      v_snap.payload->>'recipient_subject_type',
      v_snap.amount_base_czk,
      v_snap.vat_rate,
      v_snap.amount_total_czk,
      null,
      p_pdf_storage_path,
      now(),
      p_pdf_sha256,
      'pending',
      v_snap.payload->>'recipient_email',
      v_accounting_email
    )
    RETURNING id INTO v_document_id;

    INSERT INTO public.email_queue (
      email,
      subject,
      body,
      attachment_storage_bucket,
      attachment_storage_path,
      attachment_filename,
      attachment_content_type,
      attachment_required
    )
    VALUES (
      v_snap.payload->>'recipient_email',
      p_affiliate_email_subject,
      p_affiliate_email_body,
      'affiliate-payout-docs',
      p_pdf_storage_path,
      p_document_number || '.pdf',
      'application/pdf',
      true
    )
    RETURNING id INTO v_affiliate_email_queue_id;

    INSERT INTO public.email_queue (
      email,
      subject,
      body,
      attachment_storage_bucket,
      attachment_storage_path,
      attachment_filename,
      attachment_content_type,
      attachment_required
    )
    VALUES (
      v_accounting_email,
      p_accounting_email_subject,
      p_accounting_email_body,
      'affiliate-payout-docs',
      p_pdf_storage_path,
      p_document_number || '.pdf',
      'application/pdf',
      true
    )
    RETURNING id INTO v_accounting_email_queue_id;

    UPDATE public.affiliate_payout_documents
    SET email_queue_id = v_affiliate_email_queue_id,
        accounting_email_queue_id = v_accounting_email_queue_id
    WHERE id = v_document_id;

    UPDATE public.affiliate_payout_document_snapshots
    SET document_id = v_document_id, finalized_at = clock_timestamp()
    WHERE commission_id = p_commission_id;

    UPDATE public.affiliate_commissions
    SET status = 'ready_to_pay',
        payout_document_id = v_document_id,
        updated_at = now()
    WHERE id = p_commission_id
      AND status = 'approved'
      AND payout_document_id IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> 1 THEN
      RAISE EXCEPTION 'commission_update_failed';
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'status', 'created',
      'document_id', v_document_id,
      'document_number', p_document_number,
      'pdf_storage_path', p_pdf_storage_path,
      'email_queue_id', v_affiliate_email_queue_id,
      'accounting_email_queue_id', v_accounting_email_queue_id,
      'commission_status', 'ready_to_pay'
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'status', 'document_already_exists');
    WHEN raise_exception THEN
      IF SQLERRM = 'commission_update_failed' THEN
        RETURN jsonb_build_object('success', false, 'status', 'commission_update_failed');
      END IF;
      RAISE;
  END;
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
revoke all on function public.trg_fn_affiliate_payout_snapshot_immutable() from public, anon, authenticated;
revoke all on function public.trg_fn_affiliate_commission_amount_frozen() from public, anon, authenticated;
revoke all on function public.prepare_affiliate_payout_document(uuid) from public, anon, authenticated;
revoke all on function public.finalize_affiliate_payout_document(uuid, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.calculate_affiliate_commissions_for_month(date) from public, anon;
grant execute on function public.calculate_affiliate_commissions_for_month(date) to authenticated, service_role;

commit;
