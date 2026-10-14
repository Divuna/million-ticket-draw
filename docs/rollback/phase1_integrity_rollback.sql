-- ROLLBACK Fáze 1 (20260923120000_phase1_contest_integrity_hardening.sql)
-- Vrací produkci xkzhjldrojjlrkezorey přesně do stavu před nasazením Fáze 1.
-- Definice níže byly zachyceny read-only z živé produkce 23. 9. 2026 těsně
-- před nasazením. Migrace Fáze 1 nemění žádná data v tabulkách — rollback se
-- týká jen definic funkcí, triggerů a cron jobů.
-- Spouštět jen po výslovném rozhodnutí Pavla.

begin;

-- 1.4 guard + audit bonusových výher
drop trigger if exists trg_guard_bonus_prizes_after_contest_start on public.bonus_prizes;
drop trigger if exists trg_audit_bonus_prizes_after_contest_start on public.bonus_prizes;
drop function if exists public.guard_bonus_prizes_after_contest_start();
drop function if exists public.audit_bonus_prizes_after_contest_start();
drop function if exists public.bonus_prizes_contest_started(uuid);
drop function if exists public.bonus_prizes_request_role();

-- 1.3 nákupní RPC — produkční definice z 20260921120500 (md5 prosrc e7e27bd0072f867632611b761a335e4f)
create or replace function public.purchase_guaranteed_benefit_bundle_atomic(
  p_user_id uuid, p_contest_id uuid, p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_flag text; v_allowlist text; v_contest_status text; v_price numeric;
  v_bundle_id uuid; v_existing public.contest_bundle_purchases%rowtype;
  v_sel record; v_billable boolean; v_billing_reason text;
  v_wallet_id uuid; v_balance numeric; v_new_balance numeric;
  v_uv_id uuid; v_ticket_id uuid; v_issuance_id uuid; v_ticket jsonb; v_fail text;
  v_is_unlimited boolean := false;
  v_code_id uuid;
  v_customer_code text;
begin
  if v_user is null then return jsonb_build_object('success', false, 'error', 'unauthorized'); end if;
  if p_user_id is not null and p_user_id <> v_user then return jsonb_build_object('success', false, 'error', 'forbidden'); end if;
  if p_idempotency_key is null then return jsonb_build_object('success', false, 'error', 'idempotency_key_required'); end if;

  select value into v_flag from public.settings where key = 'guaranteed_benefit_purchase_enabled';
  if coalesce(v_flag, 'false') <> 'true' then return jsonb_build_object('success', false, 'error', 'feature_disabled'); end if;

  select value into v_allowlist from public.settings where key = 'guaranteed_benefit_purchase_contest_allowlist';
  if v_allowlist is not null and btrim(v_allowlist) not in ('', '[]')
     and not (v_allowlist::jsonb ? p_contest_id::text) then
    return jsonb_build_object('success', false, 'error', 'contest_not_in_pilot');
  end if;

  select status, ticket_price into v_contest_status, v_price
  from public.contests where id = p_contest_id for update;
  if not found then return jsonb_build_object('success', false, 'error', 'contest_not_found'); end if;
  if v_contest_status <> 'active' then return jsonb_build_object('success', false, 'error', 'contest_not_active'); end if;

  begin
    insert into public.contest_bundle_purchases (idempotency_key, user_id, contest_id, charged_miocoins, status)
    values (p_idempotency_key, v_user, p_contest_id, 0, 'pending')
    on conflict (user_id, idempotency_key) do nothing returning id into v_bundle_id;

    if v_bundle_id is null then
      select * into v_existing from public.contest_bundle_purchases
      where user_id = v_user and idempotency_key = p_idempotency_key;
      if v_existing.status = 'completed' then
        return jsonb_build_object('success', true, 'idempotent', true,
          'ticket_row_id', v_existing.ticket_id,
          'voucher_issuance_id', v_existing.voucher_issuance_id,
          'charged_miocoins', v_existing.charged_miocoins);
      end if;
      v_fail := 'purchase_already_in_progress'; raise exception 'GB_FAIL';
    end if;

    -- ── 1) OMEZENÝ BENEFIT (vždy přednost) ────────────────────────────────
    -- Zachovává dnešní preferenci benefitu, který zákazník ještě nedostal,
    -- i bezpečný souběh nad posledními kódy (FOR UPDATE … SKIP LOCKED).
    select vc.id as code_id, o.id as order_id, o.voucher_id as voucher_id,
           o.voucher_version_id as voucher_version_id,
           o.unit_price_ex_vat_snapshot as unit_price_ex_vat_snapshot,
           o.vat_rate_percent_snapshot as vat_rate_percent_snapshot,
           o.currency_snapshot as currency_snapshot,
           vc.code as customer_code
    into v_sel
    from public.voucher_codes vc
    join public.voucher_distribution_orders o on o.id = vc.distribution_order_id
    join public.vouchers v on v.id = o.voucher_id
    where o.status = 'approved'
      and not o.is_unlimited
      and o.issued_quantity < o.requested_quantity
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vc.status = 'available'
      and exists (
        select 1 from public.voucher_distribution_contests dc
        where dc.order_id = o.id
          and dc.contest_id = p_contest_id
          and dc.detached_at is null
      )
    order by
      (exists (select 1 from public.voucher_issuances vi
               where vi.user_id = v_user and vi.voucher_id = o.voucher_id)) asc,
      random()
    for update of vc skip locked limit 1;

    if found then
      v_is_unlimited := false;
      v_code_id      := v_sel.code_id;
      v_customer_code := v_sel.customer_code;
    else
      -- ── 2) NEOMEZENÝ BENEFIT (fallback) ─────────────────────────────────
      -- Nespotřebovává ani nevytváří `voucher_codes`; zákazník dostane
      -- sdílený kód/odkaz ze `voucher_versions.shared_code_or_url`.
      select null::uuid as code_id, o.id as order_id, o.voucher_id as voucher_id,
             o.voucher_version_id as voucher_version_id,
             o.unit_price_ex_vat_snapshot as unit_price_ex_vat_snapshot,
             o.vat_rate_percent_snapshot as vat_rate_percent_snapshot,
             o.currency_snapshot as currency_snapshot,
             vv.shared_code_or_url as customer_code
      into v_sel
      from public.voucher_distribution_orders o
      join public.vouchers v on v.id = o.voucher_id
      join public.voucher_versions vv on vv.id = o.voucher_version_id
      where o.status = 'approved'
        and o.is_unlimited
        and v.distribution_mode = 'guaranteed_purchase_benefit'
        and v.workflow_status = 'approved'
        and vv.status = 'approved'
        and vv.code_source = 'shared_static'
        and vv.shared_code_or_url is not null
        and length(btrim(vv.shared_code_or_url)) > 0
        and exists (
          select 1 from public.voucher_distribution_contests dc
          where dc.order_id = o.id
            and dc.contest_id = p_contest_id
            and dc.detached_at is null
        )
      order by
        (exists (select 1 from public.voucher_issuances vi
                 where vi.user_id = v_user and vi.voucher_id = o.voucher_id)) asc,
        random()
      limit 1;

      if not found then v_fail := 'no_benefit_available'; raise exception 'GB_FAIL'; end if;

      v_is_unlimited := true;
      v_code_id      := null;
      v_customer_code := v_sel.customer_code;
    end if;

    v_billable := not exists (select 1 from public.voucher_issuances vi
                              where vi.user_id = v_user and vi.voucher_id = v_sel.voucher_id);
    v_billing_reason := case when v_billable then 'first_customer_issuance' else 'repeat_customer_issuance' end;

    select id, balance_coins into v_wallet_id, v_balance
    from public.wallets where user_id = v_user for update;
    if v_wallet_id is null then v_fail := 'wallet_not_found'; raise exception 'GB_FAIL'; end if;
    if v_balance is null or v_balance < v_price then v_fail := 'insufficient_miocoins'; raise exception 'GB_FAIL'; end if;
    v_new_balance := v_balance - v_price;
    update public.wallets set balance_coins = v_new_balance where id = v_wallet_id;

    insert into public.user_vouchers (user_id, voucher_id, voucher_code_id, acquisition_source, redeemed)
    values (v_user, v_sel.voucher_id, v_code_id, 'guaranteed_purchase_benefit', true)
    returning id into v_uv_id;

    if v_code_id is not null then
      update public.voucher_codes
      set status = 'issued', issued_to_user_id = v_user, issued_user_voucher_id = v_uv_id, issued_at = now()
      where id = v_code_id;
    end if;

    v_ticket := public."assign_contest_ticket_atomic"(v_user, p_contest_id);
    if coalesce(v_ticket->>'success', 'false') <> 'true' then
      v_fail := coalesce(v_ticket->>'error', 'ticket_creation_failed'); raise exception 'GB_FAIL';
    end if;
    v_ticket_id := (v_ticket->>'ticket_row_id')::uuid;

    insert into public.voucher_issuances (
      distribution_order_id, voucher_id, voucher_version_id, voucher_code_id,
      user_id, user_voucher_id, ticket_id, billable, billing_reason,
      unit_price_ex_vat_snapshot, vat_rate_percent_snapshot, currency_snapshot
    ) values (
      v_sel.order_id, v_sel.voucher_id, v_sel.voucher_version_id, v_code_id,
      v_user, v_uv_id, v_ticket_id, v_billable, v_billing_reason,
      v_sel.unit_price_ex_vat_snapshot, v_sel.vat_rate_percent_snapshot, v_sel.currency_snapshot
    ) returning id into v_issuance_id;

    insert into public.wallet_transactions
      (user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata)
    values (v_user, v_wallet_id, -v_price, v_new_balance, 'benefit_purchase',
      'purchase_guaranteed_benefit_bundle_atomic', v_ticket_id,
      jsonb_build_object('contest_id', p_contest_id, 'voucher_id', v_sel.voucher_id,
        'voucher_issuance_id', v_issuance_id, 'is_unlimited', v_is_unlimited,
        'ticket_number', (v_ticket->>'ticket_number')::integer, 'free_ticket', true));

    -- `issued_quantity` roste i u neomezeného benefitu kvůli reportingu;
    -- `billable_issued_quantity` dál podle dnešního pravidla.
    update public.voucher_distribution_orders
    set issued_quantity = issued_quantity + 1,
        billable_issued_quantity = billable_issued_quantity + (case when v_billable then 1 else 0 end),
        updated_at = now()
    where id = v_sel.order_id;

    update public.contest_bundle_purchases
    set status = 'completed', ticket_id = v_ticket_id, voucher_issuance_id = v_issuance_id,
        charged_miocoins = v_price, completed_at = now()
    where id = v_bundle_id;

    return jsonb_build_object(
      'success', true, 'idempotent', false,
      'ticket_row_id', v_ticket_id, 'ticket_number', (v_ticket->>'ticket_number')::integer,
      'ticket_free', true, 'won_type', v_ticket->'won_type', 'won_prize', v_ticket->'won_prize',
      'remaining_tickets', (v_ticket->>'remaining_tickets')::integer,
      'next_bonus_position', v_ticket->'next_bonus_position',
      'distance_to_next_bonus', v_ticket->'distance_to_next_bonus',
      'voucher_id', v_sel.voucher_id, 'user_voucher_id', v_uv_id,
      'voucher_issuance_id', v_issuance_id, 'billable', v_billable,
      'is_unlimited', v_is_unlimited,
      'charged_miocoins', v_price,
      'coupon', (
        select jsonb_build_object(
          'name', vv.name, 'short_description', vv.short_description,
          'how_to_use', vv.how_to_use_text, 'terms', vv.terms_text,
          'partner_name', coalesce(nullif(btrim(p.company_name), ''), p.name),
          'image_url', coalesce(vv.image_url, v.image_url),
          'code', v_customer_code, 'valid_until', vv.valid_until)
        from public.voucher_versions vv
        join public.vouchers v on v.id = vv.voucher_id
        join public.partners p on p.id = v.partner_id
        where vv.id = v_sel.voucher_version_id)
    );
  exception
    when others then
      return jsonb_build_object('success', false, 'error', coalesce(v_fail, sqlerrm));
  end;
end;
$function$;

-- 1.6 process_referral_inactivity — původní produkční definice
CREATE OR REPLACE FUNCTION public.process_referral_inactivity()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE public.referrals r
  SET status = 'permanently_inactive',
      permanently_inactive_at = COALESCE(permanently_inactive_at, now())
  FROM public.user_play_activity a
  WHERE r.referred_user_id = a.user_id
    AND r.status = 'active'
    AND a.last_played_at IS NOT NULL
    AND a.last_played_at < (now() - interval '1 year');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- 1.1 trigger volající cizí projekt — původní produkční definice
-- (ACL původně: PUBLIC, postgres, anon, authenticated, service_role = EXECUTE)
CREATE OR REPLACE FUNCTION public.on_contest_created_generate_miocoin()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/distribute-bonus-prizes',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object(
      'contest_id', NEW.id,
      'bonus_type', 'MioCoin',
      'total_value', NEW.total_miocoin_bonus,
      'amount_per_unit', 1,
      'distribution_rule', 'random',
      'batch_size', 500
    )::text
  );
  RETURN NEW;
END;
$function$;
grant execute on function public.on_contest_created_generate_miocoin() to public, anon, authenticated, service_role;

CREATE TRIGGER trg_generate_miocoin_on_contest_insert AFTER INSERT ON public.contests
  FOR EACH ROW WHEN ((new.total_miocoin_bonus > 0)) EXECUTE FUNCTION on_contest_created_generate_miocoin();

-- 1.5 + 1.6 cron joby — původní plány
select cron.schedule('influencer_commissions_monthly', '0 2 1 * *', 'SELECT calculate_influencer_commissions_current_month();');
select cron.schedule('referral_inactivity_daily', '15 2 * * *', ' SELECT public.process_referral_inactivity(); ');

commit;

-- Edge Functions: znovu nasadit předchozí zdroj z commitu c47881ed
--   (supabase/functions/purchase-ticket, supabase/functions/distribute-bonus-prizes)
--   s --project-ref xkzhjldrojjlrkezorey a --no-verify-jwt (obě měly verify_jwt=false).
