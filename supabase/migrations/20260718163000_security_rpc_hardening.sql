-- Production-aligned security hardening applied on 2026-07-18.
-- No data updates. Only function guards, visibility check and EXECUTE grants.

create or replace function public.pause_contest(contest_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) then
    raise exception 'Admin access required';
  end if;

  update public.contests
  set status = 'paused'
  where id = contest_id;
end;
$$;

revoke all on function public.pause_contest(uuid) from public;
revoke all on function public.pause_contest(uuid) from anon;
grant execute on function public.pause_contest(uuid) to authenticated;
grant execute on function public.pause_contest(uuid) to service_role;

create or replace function public.resume_contest(contest_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    or public.has_role(auth.uid(), 'superadmin'::public.app_role)
  ) then
    raise exception 'Admin access required';
  end if;

  update public.contests
  set status = 'active'
  where id = contest_id;
end;
$$;

revoke all on function public.resume_contest(uuid) from public;
revoke all on function public.resume_contest(uuid) from anon;
grant execute on function public.resume_contest(uuid) to authenticated;
grant execute on function public.resume_contest(uuid) to service_role;

-- Legacy overload accepts an arbitrary user id and is not needed by the client.
-- Keep it available only to trusted backend operations.
revoke all on function public.transfer_bonus_to_main(uuid) from public;
revoke all on function public.transfer_bonus_to_main(uuid) from anon;
revoke all on function public.transfer_bonus_to_main(uuid) from authenticated;
grant execute on function public.transfer_bonus_to_main(uuid) to service_role;

create or replace function public.buy_voucher_atomic(p_user_id uuid, p_voucher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_wallet_balance     numeric;
  v_wallet_id          uuid;
  v_price              numeric := 5;
  v_existing_favorite  uuid;
  v_existing_purchased boolean;
  v_voucher_available  boolean;
  v_voucher_code_id    uuid;
  v_user_voucher_id    uuid;
begin
  if p_user_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Unauthorized');
  end if;

  select id, balance_coins into v_wallet_id, v_wallet_balance
  from public.wallets
  where user_id = p_user_id
  for update;

  if v_wallet_id is null then
    return jsonb_build_object('success', false, 'error', 'Peněženka nenalezena');
  end if;

  if v_wallet_balance < v_price then
    return jsonb_build_object('success', false, 'error', 'Nedostatek MioCoinů');
  end if;

  select exists(
    select 1
    from public.user_vouchers
    where user_id = p_user_id
      and voucher_id = p_voucher_id
      and redeemed = true
  ) into v_existing_purchased;

  if v_existing_purchased then
    return jsonb_build_object('success', false, 'error', 'Voucher již zakoupen');
  end if;

  select true into v_voucher_available
  from public.vouchers v
  where v.id = p_voucher_id
    and v.is_public = true
    and (v.start_date is null or v.start_date <= now())
    and (v.end_date is null or v.end_date >= now())
    and (v.max_quantity is null or v.redeemed_count < v.max_quantity)
  for update;

  if coalesce(v_voucher_available, false) is not true then
    return jsonb_build_object('success', false, 'error', 'Voucher není dostupný');
  end if;

  select vc.id into v_voucher_code_id
  from public.voucher_codes vc
  where vc.voucher_id = p_voucher_id
    and vc.status = 'available'
  order by vc.created_at, vc.id
  for update skip locked
  limit 1;

  if v_voucher_code_id is null then
    return jsonb_build_object('success', false, 'error', 'Pro tento voucher už není dostupný žádný kód');
  end if;

  select id into v_existing_favorite
  from public.user_vouchers
  where user_id = p_user_id
    and voucher_id = p_voucher_id
    and redeemed = false
  for update;

  if v_existing_favorite is not null then
    update public.user_vouchers
    set redeemed = true,
        voucher_code_id = v_voucher_code_id,
        updated_at = now()
    where id = v_existing_favorite
    returning id into v_user_voucher_id;
  else
    insert into public.user_vouchers (user_id, voucher_id, redeemed, voucher_code_id)
    values (p_user_id, p_voucher_id, true, v_voucher_code_id)
    returning id into v_user_voucher_id;
  end if;

  update public.voucher_codes
  set status = 'issued',
      issued_to_user_id = p_user_id,
      issued_user_voucher_id = v_user_voucher_id,
      issued_at = now(),
      updated_at = now()
  where id = v_voucher_code_id
    and status = 'available';

  if not found then
    raise exception 'Selected voucher code could not be issued';
  end if;

  update public.wallets
  set balance_coins = balance_coins - v_price
  where id = v_wallet_id;

  insert into public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) values (
    p_user_id, v_wallet_id, -v_price, v_wallet_balance - v_price,
    'voucher_purchase', 'buy_voucher_atomic', p_voucher_id,
    jsonb_build_object('price', v_price, 'voucher_code_id', v_voucher_code_id)
  );

  return jsonb_build_object(
    'success', true,
    'voucher_code_id', v_voucher_code_id,
    'user_voucher_id', v_user_voucher_id
  );
end;
$$;

revoke all on function public.buy_voucher_atomic(uuid, uuid) from public;
revoke all on function public.buy_voucher_atomic(uuid, uuid) from anon;
grant execute on function public.buy_voucher_atomic(uuid, uuid) to authenticated;
grant execute on function public.buy_voucher_atomic(uuid, uuid) to service_role;
