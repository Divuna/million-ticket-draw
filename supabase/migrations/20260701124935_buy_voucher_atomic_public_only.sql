-- ============================================================================
-- Require public vouchers in buy_voucher_atomic.
-- ============================================================================
-- Scope:
--   - Replaces only public.buy_voucher_atomic(p_user_id uuid, p_voucher_id uuid).
--   - Keeps voucher price, wallet debit, wallet transaction, unique code issue,
--     and redeemed_count trigger behavior unchanged.
--   - Does not backfill old user_vouchers without voucher_code_id.
--   - Adds the missing public visibility guard: v.is_public = true.
-- ============================================================================

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
    and (v.end_date   is null or v.end_date   >= now())
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
    -- trigger trg_user_voucher_redeemed_count fires on UPDATE redeemed false -> true
    update public.user_vouchers
    set redeemed = true,
        voucher_code_id = v_voucher_code_id,
        updated_at = now()
    where id = v_existing_favorite
    returning id into v_user_voucher_id;
  else
    -- trigger trg_user_voucher_redeemed_count fires on INSERT with redeemed=true
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

  -- redeemed_count is managed exclusively by trg_user_voucher_redeemed_count trigger.

  return jsonb_build_object(
    'success', true,
    'voucher_code_id', v_voucher_code_id,
    'user_voucher_id', v_user_voucher_id
  );
end;
$$;
