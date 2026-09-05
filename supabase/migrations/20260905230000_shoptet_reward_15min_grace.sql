begin;

-- Shoptet payment safety window.
-- A qualifying order must remain at/above the partner's configured trigger for
-- 15 minutes before the existing issuance function is allowed to issue MioCoins
-- and enqueue the customer email. Falling below the trigger during the window
-- clears the timer. Hard cancellation states keep the existing cancellation path.

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
  if v_status not in ('paid', 'delivered', 'completed', 'unpaid', 'cancelled', 'returned', 'not_picked_up') then
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

  -- Hard cancellation remains the existing system behaviour. During the grace
  -- period there is no queued customer email yet, so cancelling is clean.
  if v_status in ('cancelled', 'returned', 'not_picked_up') then
    return public.update_partner_order_reward_status(p_partner_id, v_order_id, v_status);
  end if;

  -- Once a code has already passed the grace period and was issued/activated,
  -- this scheduler never creates a second reward or rewinds it merely because a
  -- later non-hard status dropped below the trigger.
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
    -- Below the configured trigger: stay pending and clear any earlier paid
    -- timer. A later qualifying transition starts a fresh full 15-minute window.
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

  -- Preserve the original start only while the order continuously remains at or
  -- above its configured trigger. Otherwise start a new 15-minute window now.
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

create or replace function public.finalize_shoptet_partner_reward_grace()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row record;
  v_result jsonb;
  v_finalized integer := 0;
  v_failed integer := 0;
begin
  for v_row in
    select
      c.code,
      c.partner_id,
      c.external_order_id,
      c.metadata->>'order_status' as order_status
    from public.partner_reward_codes c
    join public.partners p on p.id = c.partner_id
    where c.status = 'pending'
      and c.metadata->>'source_detail' = 'shoptet_import'
      and nullif(c.metadata->>'shoptet_paid_grace_started_at', '') is not null
      and (c.metadata->>'shoptet_paid_grace_started_at')::timestamptz <= now() - interval '15 minutes'
      and p.status = 'approved'
      and p.shoptet_import_enabled is true
      and case coalesce(nullif(trim(p.reward_trigger_status), ''), 'paid')
        when 'paid' then c.metadata->>'order_status' in ('paid', 'delivered', 'completed')
        when 'shipped' then c.metadata->>'order_status' in ('delivered', 'completed')
        when 'completed' then c.metadata->>'order_status' = 'completed'
        else false
      end
    order by (c.metadata->>'shoptet_paid_grace_started_at')::timestamptz
    for update of c skip locked
  loop
    v_result := public.update_partner_order_reward_status(
      v_row.partner_id,
      v_row.external_order_id,
      v_row.order_status
    );

    if coalesce((v_result->>'success')::boolean, false) then
      v_finalized := v_finalized + 1;
    else
      v_failed := v_failed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'success', v_failed = 0,
    'finalized', v_finalized,
    'failed', v_failed
  );
end;
$function$;

revoke all on function public.finalize_shoptet_partner_reward_grace() from public, anon, authenticated;
grant execute on function public.finalize_shoptet_partner_reward_grace() to service_role;

-- One-minute finalizer keeps the promised wait between 15 and <16 minutes while
-- the existing email queue continues on its own cadence. Idempotent reschedule.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'finalize_shoptet_reward_grace_1min') then
    perform cron.unschedule('finalize_shoptet_reward_grace_1min');
  end if;

  perform cron.schedule(
    'finalize_shoptet_reward_grace_1min',
    '* * * * *',
    'select public.finalize_shoptet_partner_reward_grace();'
  );
end;
$$;

commit;
