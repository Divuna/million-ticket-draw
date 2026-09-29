-- Předstartovní audit 29. 9. 2026 — _affiliate_recovery_reallocate bez dočasných tabulek.
--
-- Problém: funkce vytvářela pro každého affiliate dočasnou tabulku `tmp_recovery_bal`
-- a pro KAŽDOU měnitelnou provizi další `tmp_recovery_desired` (DROP + CREATE TEMP
-- TABLE). Zámky na vytvořené/zrušené dočasné tabulky drží transakce až do konce.
-- Měsíční výpočet (`calculate_affiliate_commissions_for_month`) ji volá pro každého
-- affiliate s recovery v jedné transakci → při ~250 affiliate s recovery a 12 měsíci
-- nevyplacených provizí na stagingu „out of shared memory“ (53200,
-- max_locks_per_transaction 64 × 60 spojení) a celý výpočet provizí selže.
--
-- Oprava: stejný algoritmus nad poli v paměti PL/pgSQL. Beze změny zůstává:
-- výběr recovery a jejich zůstatek po konečných alokacích, výběr měnitelných provizí
-- (FOR UPDATE), pořadí (nejdřív vrácené nároky, pak umoření nejstarší první, nejvýš do
-- výše provize), porovnání s existujícími alokacemi (množinově), uvolnění a vložení
-- alokací, výpočet DPH, update provize, audit `affiliate_commission_recovery_applied`
-- i návratová hodnota. Signatura, SECURITY DEFINER, search_path a ACL beze změny.
--
-- Rollback: docs/rollback/affiliate_recovery_reallocate_no_temp_tables_rollback.sql

CREATE OR REPLACE FUNCTION public._affiliate_recovery_reallocate(p_affiliate_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_c        record;
  v_gross    numeric;
  v_cap      numeric;
  v_take     numeric;
  v_offset   numeric;
  v_credit   numeric;
  v_total    numeric;
  v_changed  int := 0;
  -- zůstatky recovery (seřazeno podle created_at, id) — dřív tmp_recovery_bal
  v_rec_ids  uuid[];
  v_rec_bal  numeric[];
  v_n        int;
  i          int;
  -- požadované alokace pro aktuální provizi — dřív tmp_recovery_desired
  v_d_ids    uuid[];
  v_d_kinds  text[];
  v_d_amts   numeric[];
begin
  -- Zůstatek každé recovery po KONEČNÝCH alokacích (provize s výplatním dokladem).
  select coalesce(array_agg(s.recovery_id order by s.created_at, s.recovery_id), '{}'::uuid[]),
         coalesce(array_agg(s.bal order by s.created_at, s.recovery_id), '{}'::numeric[])
  into v_rec_ids, v_rec_bal
  from (
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
    group by r.id, r.created_at, r.amount_czk
  ) s;
  v_n := coalesce(array_length(v_rec_ids, 1), 0);

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
    v_d_ids := '{}'::uuid[];
    v_d_kinds := '{}'::text[];
    v_d_amts := '{}'::numeric[];

    -- 1) vrácené nároky (záporný zůstatek) se přičtou k provizi
    for i in 1..v_n loop
      if v_rec_bal[i] < 0 then
        v_d_ids := v_d_ids || v_rec_ids[i];
        v_d_kinds := v_d_kinds || 'release'::text;
        v_d_amts := v_d_amts || (-v_rec_bal[i]);
        v_cap := v_cap - v_rec_bal[i];
        v_rec_bal[i] := 0;
      end if;
    end loop;

    -- 2) otevřené recovery se umoří, nejstarší první, nejvýš do výše provize
    for i in 1..v_n loop
      exit when v_cap <= 0;
      if v_rec_bal[i] > 0 then
        v_take := least(v_rec_bal[i], v_cap);
        v_d_ids := v_d_ids || v_rec_ids[i];
        v_d_kinds := v_d_kinds || 'offset'::text;
        v_d_amts := v_d_amts || v_take;
        v_cap := v_cap - v_take;
        v_rec_bal[i] := v_rec_bal[i] - v_take;
      end if;
    end loop;

    if exists (select d.recovery_id, d.kind, d.amount_czk
               from unnest(v_d_ids, v_d_kinds, v_d_amts) as d(recovery_id, kind, amount_czk)
               except
               select recovery_id, kind, amount_czk from public.affiliate_commission_recovery_allocations
               where commission_id = v_c.id and released_at is null)
       or exists (select recovery_id, kind, amount_czk from public.affiliate_commission_recovery_allocations
                  where commission_id = v_c.id and released_at is null
                  except
                  select d.recovery_id, d.kind, d.amount_czk
                  from unnest(v_d_ids, v_d_kinds, v_d_amts) as d(recovery_id, kind, amount_czk)) then
      update public.affiliate_commission_recovery_allocations
      set released_at = clock_timestamp(), release_reason = 'reallocated'
      where commission_id = v_c.id and released_at is null;

      insert into public.affiliate_commission_recovery_allocations (recovery_id, affiliate_id, commission_id, kind, amount_czk)
      select d.recovery_id, p_affiliate_id, v_c.id, d.kind, d.amount_czk
      from unnest(v_d_ids, v_d_kinds, v_d_amts) with ordinality as d(recovery_id, kind, amount_czk, ord)
      order by d.ord;
    end if;

    select coalesce(sum(d.amount_czk) filter (where d.kind = 'offset'), 0),
           coalesce(sum(d.amount_czk) filter (where d.kind = 'release'), 0)
    into v_offset, v_credit
    from unnest(v_d_kinds, v_d_amts) as d(kind, amount_czk);

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
                                   'remaining_recovery_czk', (select coalesce(sum(b), 0) from unnest(v_rec_bal) as b where b > 0),
                                   'allocations', (select coalesce(jsonb_agg(jsonb_build_object('recovery_id', d.recovery_id, 'kind', d.kind, 'amount_czk', d.amount_czk) order by d.ord), '[]'::jsonb)
                                                   from unnest(v_d_ids, v_d_kinds, v_d_amts) with ordinality as d(recovery_id, kind, amount_czk, ord))),
                now());
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'ok',
    'changed_commissions', v_changed,
    'open_recovery_czk', (select coalesce(sum(b), 0) from unnest(v_rec_bal) as b where b > 0),
    'pending_credit_czk', (select coalesce(-sum(b), 0) from unnest(v_rec_bal) as b where b < 0));
end;
$function$;
