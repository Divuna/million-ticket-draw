begin;

-- Shoptet represents an existing unpaid/pending order as RPC status `unknown`.
-- The grace scheduler must treat that as below-trigger (same effect as `unpaid`)
-- instead of failing the whole import run.
create or replace function public.schedule_shoptet_partner_reward_status(
  p_partner_id uuid,
  p_external_order_id text,
  p_order_status text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_code public.partner_reward_codes%rowtype;
  v_partner public.partners%rowtype;
  v_order_id text := nullif(trim(coalesce(p_external_order_id, '')), '');
  v_status text := lower(trim(coalesce(p_order_status, '')));
  v_previous_status text;
  v_threshold text;
  v_eligible boolean := false;
  v_previous_eligible boolean := false;
  v_started_at timestamptz;
  v_now timestamptz := now();
begin
  if p_partner_id is null then
    return jsonb_build_object('success', false, 'error', 'missing_partner_id');
  end if;
  if v_order_id is null then
    return jsonb_build_object('success', false, 'error', 'missing_external_order_id');
  end if;
  if v_status not in ('paid', 'delivered', 'completed', 'unpaid', 'unknown', 'cancelled', 'returned', 'not_picked_up') then
    return jsonb_build_object('success', false, 'error', 'unsupported_order_status');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_partner_id::text || ':' || v_order_id, 0));

  select * into v_code
  from public.partner_reward_codes
  where partner_id = p_partner_id
    and external_order_id = v_order_id
    and metadata->>'source' = 'partner_order_api'
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'reward_not_found');
  end if;

  if coalesce(v_code.metadata->>'source_detail', '') <> 'shoptet_import' then
    return jsonb_build_object('success', false, 'error', 'not_shoptet_reward');
  end if;

  select * into v_partner
  from public.partners
  where id = p_partner_id;

  if not found then
    return jsonb_build_object('success', false, 'error', 'partner_not_found');
  end if;

  v_threshold := coalesce(nullif(trim(v_partner.reward_trigger_status), ''), 'paid');
  v_previous_status := lower(coalesce(v_code.metadata->>'order_status', 'pending'));

  v_eligible := case v_threshold
    when 'paid' then v_status in ('paid', 'delivered', 'completed')
    when 'shipped' then v_status in ('delivered', 'completed')
    when 'completed' then v_status = 'completed'
    else false
  end;

  v_previous_eligible := case v_threshold
    when 'paid' then v_previous_status in ('paid', 'delivered', 'completed')
    when 'shipped' then v_previous_status in ('delivered', 'completed')
    when 'completed' then v_previous_status = 'completed'
    else false
  end;

  if v_status in ('cancelled', 'returned', 'not_picked_up') then
    return public.update_partner_order_reward_status(p_partner_id, v_order_id, v_status);
  end if;

  if v_code.status <> 'pending' then
    update public.partner_reward_codes
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
        'order_status', v_status,
        'order_status_updated_at', v_now
      )
    where code = v_code.code;

    return jsonb_build_object(
      'success', true,
      'status', v_code.status,
      'grace_pending', false,
      'already_finalized', true
    );
  end if;

  if not v_eligible then
    update public.partner_reward_codes
    set metadata = (coalesce(metadata, '{}'::jsonb) - 'shoptet_paid_grace_started_at')
      || jsonb_build_object(
        'order_status', v_status,
        'order_status_updated_at', v_now
      )
    where code = v_code.code;

    return jsonb_build_object(
      'success', true,
      'status', 'pending',
      'grace_pending', false,
      'below_trigger', true
    );
  end if;

  if v_previous_eligible and nullif(v_code.metadata->>'shoptet_paid_grace_started_at', '') is not null then
    begin
      v_started_at := (v_code.metadata->>'shoptet_paid_grace_started_at')::timestamptz;
    exception when others then
      v_started_at := v_now;
    end;
  else
    v_started_at := v_now;
  end if;

  update public.partner_reward_codes
  set metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'order_status', v_status,
      'order_status_updated_at', v_now,
      'shoptet_paid_grace_started_at', v_started_at
    )
  where code = v_code.code;

  return jsonb_build_object(
    'success', true,
    'status', 'pending',
    'grace_pending', true,
    'grace_started_at', v_started_at,
    'grace_until', v_started_at + interval '15 minutes'
  );
end;
$function$;

revoke all on function public.schedule_shoptet_partner_reward_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.schedule_shoptet_partner_reward_status(uuid, text, text) to service_role;

commit;
