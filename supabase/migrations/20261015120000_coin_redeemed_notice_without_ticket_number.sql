-- Push „MIO uplatněna“ (enqueue_notifications_from_event_logs, událost coin_redeemed)
-- ukazoval „Ticket: <číslo>“. Pravidlo Pavla: číslo tiketu se nikde neukazuje ani nesdílí.
-- Mění se VÝHRADNĚ tento literál v živé definici funkce (staging × produkce mohou mít drift);
-- když se text v definici nenajde, migrace nic nezmění.
do $$
declare
  v_def text;
  v_old text := '''Ticket: '' || COALESCE(NEW.metadata->>''ticket_number'',''?'')';
  v_new text := '''Tiket je ve hře. Hodně štěstí!''';
begin
  select pg_get_functiondef('public.enqueue_notifications_from_event_logs()'::regprocedure) into v_def;
  if position(v_old in v_def) > 0 then
    execute replace(v_def, v_old, v_new);
  else
    raise notice 'enqueue_notifications_from_event_logs: literál nenalezen, beze změny';
  end if;
end $$;
