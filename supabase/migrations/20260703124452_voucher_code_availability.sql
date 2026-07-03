-- ============================================================================
-- Voucher availability follows real voucher_codes inventory.
-- ============================================================================
-- Scope:
--   - Public/customer catalog returns only public, active vouchers with at least
--     one currently available voucher_codes row.
--   - buy_voucher_atomic keeps wallet debit/code issue ordering, but the
--     availability guard now also requires an available code before purchase.
--   - No data backfill. No production data mutation by this migration file.
-- ============================================================================

create or replace function public.get_public_available_vouchers()
returns table (
  id uuid,
  name text,
  image_url text,
  banner_url text,
  max_quantity integer,
  redeemed_count integer,
  start_date timestamptz,
  end_date timestamptz,
  short_description text,
  usage_description text,
  terms_text text,
  how_to_use_text text,
  user_id uuid,
  is_public boolean,
  available_code_count integer
)
language sql
security definer
set search_path to 'public'
as $$
  select
    v.id,
    v.name,
    v.image_url,
    v.banner_url,
    v.max_quantity,
    coalesce(v.redeemed_count, 0)::integer as redeemed_count,
    v.start_date,
    v.end_date,
    v.short_description,
    v.usage_description,
    v.terms_text,
    v.how_to_use_text,
    v.user_id,
    v.is_public,
    counts.available_code_count::integer
  from public.vouchers v
  cross join lateral (
    select count(*)::integer as available_code_count
    from public.voucher_codes vc
    where vc.voucher_id = v.id
      and vc.status = 'available'
  ) counts
  where v.is_public = true
    and (v.start_date is null or v.start_date <= now())
    and (v.end_date is null or v.end_date >= now())
    and counts.available_code_count > 0
  order by v.created_at desc;
$$;

revoke all on function public.get_public_available_vouchers() from public;
grant execute on function public.get_public_available_vouchers() to anon, authenticated, service_role;

comment on function public.get_public_available_vouchers() is
  'Customer/public voucher catalog. Returns only public active vouchers with at least one available voucher_codes row; never exposes actual codes.';

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
    return jsonb_build_object('success', false, 'error', 'Wallet not found');
  end if;

  if v_wallet_balance < v_price then
    return jsonb_build_object('success', false, 'error', 'Insufficient MioCoins');
  end if;

  select exists(
    select 1
    from public.user_vouchers
    where user_id = p_user_id
      and voucher_id = p_voucher_id
      and redeemed = true
  ) into v_existing_purchased;

  if v_existing_purchased then
    return jsonb_build_object('success', false, 'error', 'Voucher already purchased');
  end if;

  select true into v_voucher_available
  from public.vouchers v
  where v.id = p_voucher_id
    and v.is_public = true
    and (v.start_date is null or v.start_date <= now())
    and (v.end_date is null or v.end_date >= now())
    and exists (
      select 1
      from public.voucher_codes vc
      where vc.voucher_id = v.id
        and vc.status = 'available'
    )
  for update;

  if coalesce(v_voucher_available, false) is not true then
    return jsonb_build_object('success', false, 'error', 'Voucher is not available');
  end if;

  select vc.id into v_voucher_code_id
  from public.voucher_codes vc
  where vc.voucher_id = p_voucher_id
    and vc.status = 'available'
  order by vc.created_at, vc.id
  for update skip locked
  limit 1;

  if v_voucher_code_id is null then
    return jsonb_build_object('success', false, 'error', 'No available code for this voucher');
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
