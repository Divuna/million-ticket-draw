-- Vouchery pro zákazníky zdarma, placení jen jako vypínač v adminu
-- (rozhodnutí Pavla 17. 10. 2026).
--
-- 1) settings.voucher_paid_enabled ('true' | 'false'), výchozí 'false' = zdarma.
-- 2) public.get_voucher_price_mio(): vrací JEN cenu voucheru (5 při zapnutém
--    placení, jinak 0). SECURITY DEFINER, žádné jiné nastavení neprozradí.
-- 3) buy_voucher_atomic: cena z get_voucher_price_mio(); při ceně 0 se z peněženky
--    nic neodečítá ani se nezapisuje pohyb. Ostatní kontroly beze změny
--    (auth.uid(), peněženka, dostupnost, volný kód FOR UPDATE SKIP LOCKED,
--    stejný voucher jen jednou).
--
-- V buy_voucher_atomic se mění jen vyjmenované části ŽIVÉ definice
-- (staging × produkce mohou mít drift), s kontrolou, že každá existuje právě jednou.
-- Rollback: docs/rollback/vouchers_free_for_customers_rollback.sql

insert into public.settings (key, value)
values ('voucher_paid_enabled', 'false')
on conflict (key) do nothing;

create or replace function public.get_voucher_price_mio()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select case
    when (select s.value from public.settings s where s.key = 'voucher_paid_enabled') = 'true' then 5::numeric
    else 0::numeric
  end;
$$;

revoke all on function public.get_voucher_price_mio() from public;
grant execute on function public.get_voucher_price_mio() to anon, authenticated, service_role;

do $$
declare
  v_def text;
  v_new text;
  v_old_price constant text := 'v_price              numeric := 5;';
  v_new_price constant text := 'v_price              numeric := public.get_voucher_price_mio();';
  v_old_debit constant text := '  v_debit := public.wallet_debit_fefo(';
  v_new_debit constant text := '  if v_price > 0 then
  v_debit := public.wallet_debit_fefo(';
  v_old_tail constant text := '                       ''lot_allocations'', v_debit->''allocations'')
  );
';
  v_new_tail constant text := '                       ''lot_allocations'', v_debit->''allocations'')
  );
  end if;
';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'buy_voucher_atomic';

  if v_def is null then raise exception 'buy_voucher_atomic not found'; end if;
  if (length(v_def) - length(replace(v_def, v_old_price, ''))) / length(v_old_price) <> 1 then
    raise exception 'price literal not found exactly once';
  end if;
  if (length(v_def) - length(replace(v_def, v_old_debit, ''))) / length(v_old_debit) <> 1 then
    raise exception 'debit call not found exactly once';
  end if;
  if (length(v_def) - length(replace(v_def, v_old_tail, ''))) / length(v_old_tail) <> 1 then
    raise exception 'transaction insert tail not found exactly once';
  end if;

  v_new := replace(replace(replace(v_def, v_old_price, v_new_price), v_old_debit, v_new_debit), v_old_tail, v_new_tail);
  execute v_new;
end
$$;
