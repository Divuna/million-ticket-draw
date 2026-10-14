-- Hlavní výhra musí vracet skutečný název ceny z contests.main_prize.
--
-- Do teď `assign_contest_ticket_atomic` vracela pro poslední tiket natvrdo
-- zapsaný řetězec 'Hlavni vyhra' (bez diakritiky), takže výherní modal ukázal
-- zástupný text místo skutečné ceny. U bonusových výher se přitom správně
-- bere `bonus_prizes.title/description`.
--
-- Forward migrace: přepisuje pouze zdroj hodnoty `won_prize` pro hlavní výhru.
-- Veškerá ostatní logika (uzamčení řádku, kontroly stavu, číslování tiketů,
-- zápis winners, uzavření soutěže, bonusové ceny, next_bonus_position,
-- distance_to_next_bonus) zůstává beze změny. Historické migrace se needitují.

CREATE OR REPLACE FUNCTION public.assign_contest_ticket_atomic(p_user_id uuid, p_contest_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ticket_count         integer;
  v_contest_status       text;
  v_next_ticket          integer;
  v_new_ticket_id        uuid;
  v_bonus_prize_id       uuid;
  v_bonus_title          text;
  v_next_bonus_position  integer;
  v_main_prize           text;
begin
  select ticket_count, status, next_ticket_number, main_prize
  into v_ticket_count, v_contest_status, v_next_ticket, v_main_prize
  from public.contests where id = p_contest_id for update;

  if v_contest_status is null then
    return jsonb_build_object('success', false, 'error', 'Contest not found');
  end if;
  if v_contest_status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'Contest not active');
  end if;
  if v_next_ticket > v_ticket_count then
    return jsonb_build_object('success', false, 'error', 'Contest full');
  end if;

  update public.contests set next_ticket_number = next_ticket_number + 1 where id = p_contest_id;

  insert into public.tickets (contest_id, user_id, number)
  values (p_contest_id, p_user_id, v_next_ticket)
  returning id into v_new_ticket_id;

  select id, coalesce(title, description)
  into v_bonus_prize_id, v_bonus_title
  from public.bonus_prizes
  where contest_id = p_contest_id
    and ticket_position = v_next_ticket
    and status = 'pending'
  limit 1;

  if v_next_ticket = v_ticket_count then
    insert into public.winners (user_id, contest_id, ticket_id, type)
    values (p_user_id, p_contest_id, v_new_ticket_id, 'main');
    update public.contests set status = 'closed' where id = p_contest_id;
  end if;

  if v_bonus_prize_id is not null then
    insert into public.winners (user_id, contest_id, ticket_id, prize_id, type)
    values (p_user_id, p_contest_id, v_new_ticket_id, v_bonus_prize_id, 'bonus');
    update public.bonus_prizes set status = 'won' where id = v_bonus_prize_id;
  end if;

  select ticket_position
  into v_next_bonus_position
  from public.bonus_prizes
  where contest_id = p_contest_id
    and ticket_position > v_next_ticket
    and status = 'pending'
  order by ticket_position asc
  limit 1;

  return jsonb_build_object(
    'success',               true,
    'ticket_row_id',         v_new_ticket_id,
    'ticket_number',         v_next_ticket,
    'won_type',              case
                               when v_next_ticket = v_ticket_count then 'main'
                               when v_bonus_prize_id is not null   then 'bonus'
                               else null
                             end,
    -- ZMĚNA: skutečný název hlavní výhry místo natvrdo zapsaného 'Hlavni vyhra'.
    -- Fallback drží starou hodnotu jen pro soutěž bez vyplněného main_prize,
    -- aby nikdy nevznikla výhra bez názvu.
    'won_prize',             case
                               when v_next_ticket = v_ticket_count
                                 then coalesce(nullif(btrim(v_main_prize), ''), 'Hlavni vyhra')
                               when v_bonus_prize_id is not null then v_bonus_title
                               else null
                             end,
    'remaining_tickets',     v_ticket_count - v_next_ticket,
    'next_bonus_position',   v_next_bonus_position,
    'distance_to_next_bonus', v_next_bonus_position - v_next_ticket
  );
end;
$function$;
