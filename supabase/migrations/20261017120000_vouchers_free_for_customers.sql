-- Vouchery pro zákazníky zdarma (rozhodnutí Pavla 17. 10. 2026).
--
-- buy_voucher_atomic měl pevnou cenu 5 MIO. Nově je cena 0 a při nulové ceně se
-- z peněženky nic neodečítá ani se nezapisuje pohyb (wallet_debit_fefo ani
-- wallet_transactions se nevolají). Ostatní kontroly beze změny: auth.uid(),
-- peněženka existuje, voucher je dostupný, volný kód (FOR UPDATE SKIP LOCKED),
-- stejný voucher jen jednou.
--
-- Mění se jen vyjmenované části ŽIVÉ definice (staging × produkce mohou mít drift),
-- s kontrolou, že každý nahrazovaný text existuje právě jednou.
-- Rollback: docs/rollback/vouchers_free_for_customers_rollback.sql

do $$
declare
  v_def text;
  v_new text;
  v_old_price constant text := 'v_price              numeric := 5;';
  v_new_price constant text := 'v_price              numeric := 0;';
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
