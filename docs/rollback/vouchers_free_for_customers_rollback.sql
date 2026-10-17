-- Rollback migrace 20261017120000_vouchers_free_for_customers.sql:
-- vrátí pevnou cenu 5 MIO a bezpodmínečné odečtení z peněženky.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'buy_voucher_atomic';

  v_def := replace(v_def, 'v_price              numeric := 0;', 'v_price              numeric := 5;');
  v_def := replace(v_def, '  if v_price > 0 then
  v_debit := public.wallet_debit_fefo(', '  v_debit := public.wallet_debit_fefo(');
  v_def := replace(v_def, '                       ''lot_allocations'', v_debit->''allocations'')
  );
  end if;
', '                       ''lot_allocations'', v_debit->''allocations'')
  );
');
  execute v_def;
end
$$;
