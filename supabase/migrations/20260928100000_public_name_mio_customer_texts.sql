-- Veřejný název MIO v zákaznických textech generovaných databází (25. 9. 2026).
--
-- Mění VÝHRADNĚ textové řetězce, které vidí zákazník (e-mail s kódem, hláška při
-- nákupu voucheru, notifikace, veřejný seznam výherců, formátovač množství do e-mailů).
-- Logika, podmínky, návratové typy, oprávnění ani vlastník funkcí se nemění.
--
-- Staging a produkce mají u některých funkcí rozdílné definice (drift), proto se
-- NEPŘEPISUJE celá definice: vezme se živá definice v daném prostředí
-- (pg_get_functiondef), nahradí se jen přesně vyjmenované literály a ověří se jejich
-- počet. Když se počet liší, celá migrace selže a nic se nezmění.
--
-- Záměrně NEMĚNĚNO: process_event_queue_miocoin (title = 'MioCoin' je technická hodnota),
-- admin/partnerské funkce, data v tabulkách, ai-chat (Bob).
-- Rollback: docs/rollback/public_name_mio_customer_texts_rollback.sql

begin;

create or replace function pg_temp.mio_rename(p_fn regprocedure, p_pairs text[][])
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_old text; v_new text; v_cnt int; i int;
begin
  for i in 1 .. array_length(p_pairs, 1) loop
    v_old := p_pairs[i][1];
    v_new := p_pairs[i][2];
    v_cnt := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
    if v_cnt <> p_pairs[i][3]::int then
      raise exception 'mio_rename %: literal % found % times, expected %', p_fn, v_old, v_cnt, p_pairs[i][3];
    end if;
    v_def := replace(v_def, v_old, v_new);
  end loop;
  execute v_def;
end $$;

select pg_temp.mio_rename('public.buy_voucher_atomic(uuid,uuid)'::regprocedure, array[
  array['''Nedostatek MioCoinů''', '''Nedostatek MIO''', '1']]);

select pg_temp.mio_rename('public.enqueue_notifications_from_event_logs()'::regprocedure, array[
  array['''MioCoin uplatněn''', '''MIO uplatněna''', '1']]);

select pg_temp.mio_rename('public.format_miocoin_cz(numeric)'::regprocedure, array[
  array['''MioCoin''', '''MIO''', '1'],
  array['''MioCoiny''', '''MIO''', '1'],
  array['''MioCoinů''', '''MIO''', '1'],
  array['''MioCoinu''', '''MIO''', '1']]);

select pg_temp.mio_rename('public.get_latest_winners(integer)'::regprocedure, array[
  array[''' MioCoins''', ''' MIO''', '1']]);

select pg_temp.mio_rename('public.get_latest_winners_public(integer)'::regprocedure, array[
  array[''' MioCoins''', ''' MIO''', '1']]);

select pg_temp.mio_rename('public.update_partner_order_reward_status(uuid,text,text)'::regprocedure, array[
  array['Máte připravené MioCoiny</h1>', 'Máte připravené MIO</h1>', '1'],
  array['Váš MioCoin kód', 'Váš MIO kód', '1'],
  array['Uplatnit MioCoiny</a>', 'Uplatnit MIO</a>', '1'],
  array['MioCoiny jsou interní kredit OneMil a lze je použít', 'MIO jsou interní kredit OneMil a lze je použít', '1'],
  array['''Máte připravené MioCoiny od OneMil''', '''Máte připravené MIO od OneMil''', '1']]);

commit;
