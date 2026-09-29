-- Rollback 20260929120000: vrací _affiliate_recovery_reallocate na definici z Fáze 6
-- (20260926100000, s dočasnými tabulkami). Produkce i staging měly před změnou md5
-- 54a79cc04332b8f0194fcab361de50f2 (po znovuaplikaci ověřit). ACL se CREATE OR REPLACE nemění.

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
