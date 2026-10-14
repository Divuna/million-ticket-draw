-- ROLLBACK: veřejný název MIO v zákaznických textech (migrace 20260928100000_public_name_mio_customer_texts.sql)
-- Vrací přesně původní literály. U format_miocoin_cz se obnovuje celá původní definice
-- (po migraci obsahuje čtyřikrát 'MIO', zpětná náhrada by nebyla jednoznačná);
-- tato definice byla shodná na stagingu i produkci (md5 pg_get_functiondef 9f8b6d58…).
-- Spouštět jen po rozhodnutí Pavla.

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
  array['''Nedostatek MIO''', '''Nedostatek MioCoinů''', '1']]);

select pg_temp.mio_rename('public.enqueue_notifications_from_event_logs()'::regprocedure, array[
  array['''MIO uplatněna''', '''MioCoin uplatněn''', '1']]);

select pg_temp.mio_rename('public.get_latest_winners(integer)'::regprocedure, array[
  array[''' MIO''', ''' MioCoins''', '1']]);

select pg_temp.mio_rename('public.get_latest_winners_public(integer)'::regprocedure, array[
  array[''' MIO''', ''' MioCoins''', '1']]);

select pg_temp.mio_rename('public.update_partner_order_reward_status(uuid,text,text)'::regprocedure, array[
  array['Máte připravené MIO</h1>', 'Máte připravené MioCoiny</h1>', '1'],
  array['Váš MIO kód', 'Váš MioCoin kód', '1'],
  array['Uplatnit MIO</a>', 'Uplatnit MioCoiny</a>', '1'],
  array['MIO jsou interní kredit OneMil a lze je použít', 'MioCoiny jsou interní kredit OneMil a lze je použít', '1'],
  array['''Máte připravené MIO od OneMil''', '''Máte připravené MioCoiny od OneMil''', '1']]);

CREATE OR REPLACE FUNCTION public.format_miocoin_cz(p_value numeric)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rounded numeric;
  v_number  text;
  v_word    text;
BEGIN
  IF p_value IS NULL THEN
    RETURN NULL;
  END IF;

  v_rounded := round(p_value, 1);

  IF v_rounded = trunc(v_rounded) THEN
    v_number := trunc(v_rounded)::bigint::text;
    IF trunc(v_rounded) = 1 THEN
      v_word := 'MioCoin';
    ELSIF trunc(v_rounded) >= 2 AND trunc(v_rounded) <= 4 THEN
      v_word := 'MioCoiny';
    ELSE
      v_word := 'MioCoinů';
    END IF;
  ELSE
    v_number := replace(trim(to_char(v_rounded, 'FM999999999990.0')), '.', ',');
    v_word   := 'MioCoinu';
  END IF;

  RETURN v_number || ' ' || v_word;
END;
$function$;

commit;

-- Bannery balíčků na STAGINGU (dočasně deaktivované 25. 9. 2026, původně active=true,
-- start_date/end_date NULL). Vrácení:
-- update public.banners set active = true where id in (
--   '9cc21e95-93c9-47e5-943b-dedee43f832b',  -- MioCoin balíček – 50
--   'e470ac31-9d73-4cf6-9acc-288c676c7174',  -- MioCoin balíček – 310
--   '43c1f1b5-9a98-4bc4-bf5b-b2cb4cac341a',  -- MioCoin balíček – 525
--   '810130e1-6969-458e-a045-ce7b780dbea9'); -- MioCoin balíček – 1280
