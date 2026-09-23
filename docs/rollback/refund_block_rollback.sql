-- ROLLBACK refund bloku (migrace 20260924100000_refund_block_wallet_lots.sql)
-- Vrací peněženkové a refundační funkce PŘESNĚ do produkční podoby zachycené
-- read-only z xkzhjldrojjlrkezorey (2026-09-23T18:26:09.534Z) před nasazením.
-- Spouštět jen po výslovném rozhodnutí Pavla.
--
-- Po rollbacku je zdrojem pravdy opět jen wallets.balance_coins. Tabulky sad
-- se odstraní až v kroku 3 (volitelný) — do té doby jsou jen neaktivní historie.
-- Sloupce payments (paid_amount_czk, base_mio, bonus_mio, …) zůstávají: jsou
-- aditivní a nic je po rollbacku nečte.

begin;

-- 1) Vypnout synchronizaci sad a denní expiraci.
drop trigger if exists trg_wallets_lot_sync on public.wallets;
do $$ begin perform cron.unschedule(jobid) from cron.job where jobname = 'expire_wallet_lots_daily'; end $$;

-- 2) Původní definice funkcí (12).

-- buy_voucher_atomic(p_user_id uuid, p_voucher_id uuid)   ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.buy_voucher_atomic(p_user_id uuid, p_voucher_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

-- claim_miocoin_bonus(p_bonus_id uuid, p_user_id uuid)   ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.claim_miocoin_bonus(p_bonus_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_amount        integer;
  v_wallet_id     uuid;
  v_bonus_balance numeric;
  v_new_balance   numeric;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT bp.amount INTO v_amount
  FROM public.bonus_prizes bp
  JOIN public.winners w ON w.prize_id = bp.id
  WHERE bp.id       = p_bonus_id
    AND bp.status   IN ('won', 'pending')
    AND w.user_id   = p_user_id
    AND w.type      = 'bonus'
    AND w.delivered = false
  FOR UPDATE OF bp, w;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bonus not found, not owned by user, or already delivered';
  END IF;

  SELECT id, bonus_balance_coins
  INTO v_wallet_id, v_bonus_balance
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found for user';
  END IF;

  IF v_bonus_balance IS NULL OR v_bonus_balance < v_amount THEN
    RAISE EXCEPTION 'Bonus wallet balance is inconsistent with the claimed prize';
  END IF;

  UPDATE public.wallets
  SET
    balance_coins       = balance_coins + v_amount,
    bonus_balance_coins = bonus_balance_coins - v_amount
  WHERE user_id = p_user_id
  RETURNING balance_coins INTO v_new_balance;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    p_user_id,
    v_wallet_id,
    v_amount,
    v_new_balance,
    'bonus_claim',
    'claim_miocoin_bonus',
    p_bonus_id,
    jsonb_build_object(
      'movement', 'bonus_to_main',
      'bonus_debited', v_amount
    )
  );

  UPDATE public.bonus_prizes
  SET status = 'delivered'
  WHERE id = p_bonus_id;

  UPDATE public.winners
  SET delivered = true
  WHERE prize_id = p_bonus_id
    AND user_id = p_user_id
    AND type = 'bonus';
END;
$function$;

-- finalize_stripe_refund(p_payment_id uuid)   ACL: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.finalize_stripe_refund(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments%rowtype;
BEGIN
  IF p_payment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input');
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Opakované volání je bezpečné.
  IF v_payment.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', true, 'already_final', true, 'status', 'refunded');
  END IF;

  IF v_payment.status <> 'refund_pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_status', 'status', v_payment.status);
  END IF;

  -- Databáze nedůvěřuje volajícímu: dokončit lze jen refundaci, která je
  -- skutečně evidovaná a u Stripe skončila jako `succeeded`.
  IF v_payment.stripe_refund_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'missing_stripe_refund_id');
  END IF;

  IF v_payment.stripe_refund_status IS DISTINCT FROM 'succeeded' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'stripe_refund_not_succeeded',
      'stripe_refund_status', v_payment.stripe_refund_status
    );
  END IF;

  UPDATE public.payments
  SET status            = 'refunded',
      refund_updated_at = now()
  WHERE id = p_payment_id;

  RETURN jsonb_build_object('ok', true, 'already_final', false, 'status', 'refunded');
END;
$function$;

-- prepare_stripe_refund(p_payment_id uuid)   ACL: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.prepare_stripe_refund(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment      public.payments%rowtype;
  v_wallet_id    uuid;
  v_balance      numeric;
  v_new_balance  numeric;
  v_already      boolean := false;
BEGIN
  IF p_payment_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_input',
      'message', 'Chybí ID platby.'
    );
  END IF;

  -- Zámek platby pro celou dobu transakce.
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'not_found',
      'message', 'Platba nebyla nalezena.'
    );
  END IF;

  IF v_payment.status = 'refunded' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'already_refunded',
      'message', 'Platba už byla refundována.'
    );
  END IF;

  -- Neúspěšná Stripe refundace se NIKDY nespouští znovu automaticky.
  -- Platba je sice zpátky `completed`, ale evidovaná refundace to prozradí.
  IF v_payment.stripe_refund_id IS NOT NULL
     AND v_payment.stripe_refund_status IN ('failed', 'canceled') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'refund_failed_needs_manual_review',
      'message', 'Předchozí refundace u Stripe selhala. Je nutná ruční kontrola, automatické opakování není povolené.'
    );
  END IF;

  -- Povolen je jen první pokus (`completed`) nebo bezpečné zopakování
  -- rozpracované refundace (`refund_pending`).
  IF v_payment.status NOT IN ('completed', 'refund_pending') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_status',
      'message', 'Refundovat lze jen dokončenou platbu.'
    );
  END IF;

  IF v_payment.stripe_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'missing_stripe_session',
      'message', 'K této platbě chybí Stripe session, refundaci nelze provést.'
    );
  END IF;

  IF v_payment.amount IS NULL OR v_payment.amount <= 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_amount',
      'message', 'Platba nemá kladnou částku.'
    );
  END IF;

  -- Už jednou odečteno? Pak se MioCoiny nesmí odečíst podruhé.
  SELECT true INTO v_already
  FROM public.wallet_transactions
  WHERE reference_id = p_payment_id
    AND type = 'refund_debit'
  LIMIT 1;

  v_already := COALESCE(v_already, false);

  IF NOT v_already THEN
    -- Zámek peněženky ve stejné transakci jako zámek platby.
    SELECT id, balance_coins INTO v_wallet_id, v_balance
    FROM public.wallets
    WHERE user_id = v_payment.user_id
    FOR UPDATE;

    -- Chybějící peněženka i nedostatečný zůstatek = stejný obchodní výsledek:
    -- část MioCoinů už není k dispozici, refundace se nesmí spustit.
    IF v_wallet_id IS NULL OR v_balance < v_payment.amount THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'insufficient_balance',
        'message', 'Refundaci nelze provést, protože část MioCoinů z této platby již byla použita.'
      );
    END IF;

    -- Odečte se přesně celá částka platby, nikdy méně.
    UPDATE public.wallets
    SET balance_coins = balance_coins - v_payment.amount
    WHERE id = v_wallet_id
    RETURNING balance_coins INTO v_new_balance;

    INSERT INTO public.wallet_transactions (
      user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
    ) VALUES (
      v_payment.user_id,
      v_wallet_id,
      -v_payment.amount,
      v_new_balance,
      'refund_debit',
      'prepare_stripe_refund',
      p_payment_id,
      jsonb_build_object(
        'payment_status_before', v_payment.status,
        'debited',               v_payment.amount
      )
    );
  END IF;

  -- Stav se posouvá jen z `completed`; opakování na `refund_pending` nechává beze změny.
  IF v_payment.status = 'completed' THEN
    UPDATE public.payments
    SET status = 'refund_pending',
        refund_updated_at = now()
    WHERE id = p_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',                true,
    'already_prepared',  v_already,
    'payment_id',        p_payment_id,
    'user_id',           v_payment.user_id,
    'amount',            v_payment.amount,
    'stripe_session_id', v_payment.stripe_session_id,
    'stripe_refund_id',  v_payment.stripe_refund_id,
    'status',            'refund_pending'
  );
END;
$function$;

-- purchase_guaranteed_benefit_bundle_atomic(p_user_id uuid, p_contest_id uuid, p_idempotency_key uuid)   ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.purchase_guaranteed_benefit_bundle_atomic(p_user_id uuid, p_contest_id uuid, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- Vydává se jen schválená a platná verze benefitu.
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
    join public.voucher_versions vv on vv.id = o.voucher_version_id
    where o.status = 'approved'
      and not o.is_unlimited
      and o.issued_quantity < o.requested_quantity
      and v.distribution_mode = 'guaranteed_purchase_benefit'
      and v.workflow_status = 'approved'
      and vv.status = 'approved'
      and (vv.valid_until is null or vv.valid_until >= now())
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
        and (vv.valid_until is null or vv.valid_until >= now())
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

-- record_partner_customer_ref(p_nonce uuid)   ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.record_partner_customer_ref(p_nonce uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_uid                 uuid := auth.uid();
  v_pending             public.partner_pending_attributions%ROWTYPE;
  v_account_created_at  timestamptz;
  v_bonus               numeric := 15;
  v_wallet_id           uuid;
  v_balance             numeric;
  v_row_id              uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('status', 'unauthenticated');
  END IF;
  IF p_nonce IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid_or_expired_intent');
  END IF;

  SELECT * INTO v_pending
  FROM public.partner_pending_attributions
  WHERE id = p_nonce
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_or_expired_intent');
  END IF;

  IF v_pending.consumed_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'invalid_or_expired_intent');
  END IF;

  IF v_pending.expires_at < now() THEN
    RETURN jsonb_build_object('status', 'invalid_or_expired_intent');
  END IF;

  SELECT created_at INTO v_account_created_at FROM auth.users WHERE id = v_uid;

  IF v_account_created_at IS NULL OR v_account_created_at <= v_pending.created_at THEN
    RETURN jsonb_build_object('status', 'account_predates_intent');
  END IF;

  IF EXISTS (SELECT 1 FROM public.partner_customer_refs WHERE user_id = v_uid) THEN
    UPDATE public.partner_pending_attributions
       SET consumed_at = now(), consumed_by_user_id = v_uid
     WHERE id = p_nonce;
    RETURN jsonb_build_object('status', 'already_attributed');
  END IF;

  UPDATE public.partner_pending_attributions
     SET consumed_at = now(), consumed_by_user_id = v_uid
   WHERE id = p_nonce;

  INSERT INTO public.partner_customer_refs (partner_id, user_id, connection_id, source)
  VALUES (v_pending.partner_id, v_uid, v_pending.connection_id, 'partner_link')
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_row_id;

  IF v_row_id IS NULL THEN
    RETURN jsonb_build_object('status', 'already_attributed');
  END IF;

  PERFORM public.ensure_wallet_exists(v_uid);

  UPDATE public.wallets
     SET balance_coins = balance_coins + v_bonus
   WHERE user_id = v_uid
  RETURNING id, balance_coins INTO v_wallet_id, v_balance;

  INSERT INTO public.wallet_transactions
    (user_id, wallet_id, amount, balance_after, type, source, metadata)
  VALUES (
    v_uid, v_wallet_id, v_bonus, v_balance,
    'partner_new_customer_bonus', 'record_partner_customer_ref',
    jsonb_build_object('partner_id', v_pending.partner_id, 'connection_id', v_pending.connection_id)
  );

  UPDATE public.partner_customer_refs
     SET bonus_coins = v_bonus, bonus_granted_at = now()
   WHERE id = v_row_id;

  RETURN jsonb_build_object(
    'status', 'recorded',
    'partner_id', v_pending.partner_id,
    'bonus_coins', v_bonus
  );
END;
$function$;

-- record_stripe_refund_status(p_payment_id uuid, p_refund_id text, p_status text)   ACL: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.record_stripe_refund_status(p_payment_id uuid, p_refund_id text, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment public.payments%rowtype;
BEGIN
  IF p_payment_id IS NULL OR p_refund_id IS NULL OR p_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input');
  END IF;

  -- Přijímají se jen skutečné Stripe stavy refundace.
  IF p_status NOT IN ('pending', 'requires_action', 'succeeded', 'failed', 'canceled') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_stripe_status',
      'stripe_refund_status', p_status
    );
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- K jedné platbě smí patřit jen jedna Stripe refundace.
  IF v_payment.stripe_refund_id IS NOT NULL
     AND v_payment.stripe_refund_id IS DISTINCT FROM p_refund_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'refund_id_conflict',
      'message', 'K platbě je už evidovaná jiná Stripe refundace.'
    );
  END IF;

  -- Terminální Stripe stavy jsou `succeeded`, `failed` i `canceled`. Stripe
  -- negarantuje pořadí doručení událostí, takže starší nebo přeházená událost
  -- nesmí uložený terminální stav přepsat jiným stavem.
  IF (v_payment.stripe_refund_status IN ('succeeded', 'failed', 'canceled')
        AND p_status IS DISTINCT FROM v_payment.stripe_refund_status)
     OR (v_payment.status = 'refunded' AND p_status <> 'succeeded') THEN
    RETURN jsonb_build_object(
      'ok', true,
      'ignored', true,
      'code', 'terminal_state',
      'payment_id', p_payment_id,
      'stripe_refund_status', v_payment.stripe_refund_status,
      'status', v_payment.status
    );
  END IF;

  UPDATE public.payments
  SET stripe_refund_id     = p_refund_id,
      stripe_refund_status = p_status,
      refund_updated_at    = now()
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ignored', false,
    'payment_id', p_payment_id,
    'stripe_refund_status', p_status,
    'status', v_payment.status
  );
END;
$function$;

-- redeem_miocoin_code(p_code text)   ACL: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.redeem_miocoin_code(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_email       text;
  v_code        text := upper(trim(coalesce(p_code, '')));
  v_row         public.partner_reward_codes%rowtype;
  v_restrict    citext;
  v_wallet_id   uuid;
  v_new_balance numeric;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_logged_in');
  END IF;

  IF v_code = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  SELECT * INTO v_row
  FROM public.partner_reward_codes
  WHERE upper(code) = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  IF v_row.status = 'activated' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_used');
  ELSIF v_row.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'cancelled');
  ELSIF v_row.status = 'expired' THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  ELSIF v_row.status = 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'pending');
  ELSIF v_row.status <> 'issued' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_code');
  END IF;

  IF v_row.expired_at IS NOT NULL AND v_row.expired_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'expired');
  END IF;

  v_restrict := coalesce(v_row.issued_to_email, v_row.customer_email);
  IF v_restrict IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NULL OR v_restrict <> v_email::citext THEN
      RETURN jsonb_build_object('success', false, 'error', 'email_mismatch');
    END IF;
  END IF;

  PERFORM public.ensure_wallet_exists(v_uid);

  UPDATE public.wallets
  SET balance_coins = balance_coins + v_row.coins
  WHERE user_id = v_uid
  RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    v_uid,
    v_wallet_id,
    v_row.coins,
    v_new_balance,
    'miocoin_code_credit',
    'redeem_miocoin_code',
    NULL,
    jsonb_build_object('code', v_row.code, 'partner_id', v_row.partner_id)
  );

  UPDATE public.partner_reward_codes
  SET status = 'activated',
      activated_at = now(),
      activated_by_user_id = v_uid
  WHERE code = v_row.code;

  RETURN jsonb_build_object(
    'success', true,
    'coins', v_row.coins,
    'new_balance', v_new_balance
  );
END;
$function$;

-- reverse_failed_stripe_refund(p_payment_id uuid, p_stripe_status text)   ACL: {postgres=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.reverse_failed_stripe_refund(p_payment_id uuid, p_stripe_status text DEFAULT 'failed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment       public.payments%rowtype;
  v_debited       numeric;
  v_wallet_id     uuid;
  v_new_balance   numeric;
  v_already       boolean := false;
  v_reward_id     uuid;
  v_referrer      uuid;
  v_reward_mc     numeric;
  v_credit_ok     boolean;
  v_reward_restored boolean := false;
BEGIN
  IF p_payment_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_input');
  END IF;

  -- Přijímají se výhradně skutečné neúspěšné Stripe stavy.
  IF p_stripe_status IS NULL OR p_stripe_status NOT IN ('failed', 'canceled') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'invalid_stripe_status',
      'stripe_refund_status', p_stripe_status
    );
  END IF;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_found');
  END IF;

  -- Dokončenou refundaci nelze vzít zpět.
  IF v_payment.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'already_refunded');
  END IF;

  -- Opakovaná událost po už provedené reverzi: žádná další změna peněženky
  -- ani doporučovací odměny. Platba ale nesmí zůstat viset v `refund_pending`.
  SELECT true INTO v_already
  FROM public.wallet_transactions
  WHERE reference_id = p_payment_id
    AND type = 'refund_reversal'
  LIMIT 1;

  IF COALESCE(v_already, false) THEN
    IF v_payment.status <> 'completed' THEN
      UPDATE public.payments
      SET status               = 'completed',
          stripe_refund_status = CASE
                                   WHEN v_payment.stripe_refund_status IN ('failed', 'canceled')
                                     THEN v_payment.stripe_refund_status
                                   ELSE p_stripe_status
                                 END,
          refund_updated_at    = now()
      WHERE id = p_payment_id
      RETURNING status, stripe_refund_status INTO v_payment.status, v_payment.stripe_refund_status;
    END IF;

    RETURN jsonb_build_object(
      'ok',                 true,
      'already_reversed',   true,
      'status',             v_payment.status,
      'stripe_refund_status', v_payment.stripe_refund_status
    );
  END IF;

  -- První reverze smí proběhnout jen z rozpracované refundace.
  IF v_payment.status <> 'refund_pending' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_status', 'status', v_payment.status);
  END IF;

  -- Vrací se jen to, co bylo skutečně odečteno.
  SELECT ABS(amount) INTO v_debited
  FROM public.wallet_transactions
  WHERE reference_id = p_payment_id
    AND type = 'refund_debit'
  LIMIT 1;

  IF v_debited IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'nothing_to_reverse');
  END IF;

  -- 1) Vrácení zákaznických MioCoinů — právě jeden kladný ledger řádek.
  SELECT id INTO v_wallet_id
  FROM public.wallets
  WHERE user_id = v_payment.user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.wallets (user_id, balance_coins, created_at)
    VALUES (v_payment.user_id, v_debited, now())
    RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;
  ELSE
    UPDATE public.wallets
    SET balance_coins = balance_coins + v_debited
    WHERE id = v_wallet_id
    RETURNING balance_coins INTO v_new_balance;
  END IF;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    v_payment.user_id,
    v_wallet_id,
    v_debited,
    v_new_balance,
    'refund_reversal',
    'reverse_failed_stripe_refund',
    p_payment_id,
    jsonb_build_object(
      'stripe_refund_status', p_stripe_status,
      'restored',             v_debited
    )
  );

  -- 2) Obnova doporučovací odměny, kterou při `completed -> refund_pending`
  --    stornoval trigger `trg_payments_referral_reverse`.
  SELECT id, referrer_user_id, reward_mc
  INTO v_reward_id, v_referrer, v_reward_mc
  FROM public.referral_rewards
  WHERE payment_id = p_payment_id
    AND status = 'reversed'
    AND reverse_reason = 'payment_status_changed:refund_pending'
  LIMIT 1
  FOR UPDATE;

  IF v_reward_id IS NOT NULL THEN
    UPDATE public.referral_rewards
    SET status         = 'earned',
        reversed_at    = NULL,
        reverse_reason = NULL
    WHERE id = v_reward_id;

    -- POZOR: `try_credit_wallet_mc` má v produkci tři overloady a poziční
    -- dvouargumentové volání je NEJEDNOZNAČNÉ (`42725`). Pojmenovaný argument
    -- `p_amount_mc` váže právě booleanovou variantu `(uuid, numeric)`.
    SELECT public.try_credit_wallet_mc(p_user_id => v_referrer, p_amount_mc => v_reward_mc)
    INTO v_credit_ok;

    IF COALESCE(v_credit_ok, false) IS NOT TRUE THEN
      RAISE EXCEPTION
        'Nepodařilo se vrátit doporučovací odměnu pro platbu %; reverze refundace byla zrušena.',
        p_payment_id;
    END IF;

    v_reward_restored := true;
  END IF;

  -- 3) Platba se vrací mezi dokončené — peníze zákazníkovi vráceny NEBYLY.
  UPDATE public.payments
  SET status               = 'completed',
      stripe_refund_status = p_stripe_status,
      refund_updated_at    = now()
  WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'ok',                     true,
    'already_reversed',       false,
    'restored',               v_debited,
    'referral_reward_restored', v_reward_restored,
    'status',                 'completed',
    'stripe_refund_status',   p_stripe_status
  );
END;
$function$;

-- transfer_all_bonus_to_main_wallet()   ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.transfer_all_bonus_to_main_wallet()
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     uuid := auth.uid();
  v_wallet_id   uuid;
  v_bonus       numeric;
  v_new_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT id, bonus_balance_coins INTO v_wallet_id, v_bonus
  FROM public.wallets WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_bonus IS NULL OR v_bonus <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.wallets
  SET balance_coins       = balance_coins + v_bonus,
      bonus_balance_coins = 0
  WHERE user_id = v_user_id
  RETURNING balance_coins INTO v_new_balance;

  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, metadata
  ) VALUES (
    v_user_id, v_wallet_id, v_bonus, v_new_balance,
    'bonus_transfer', 'transfer_all_bonus_to_main_wallet',
    jsonb_build_object('bonus_transferred', v_bonus)
  );

  RETURN v_bonus;
END;
$function$;

-- transfer_bonus_to_main()   ACL: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.transfer_bonus_to_main()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_bonus integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT bonus_balance_coins
  INTO v_bonus
  FROM public.wallets
  WHERE user_id = v_user_id
  FOR UPDATE;

  IF v_bonus IS NULL OR v_bonus <= 0 THEN
    RETURN;
  END IF;

  UPDATE public.wallets
  SET
    balance_coins = balance_coins + v_bonus,
    bonus_balance_coins = 0
  WHERE user_id = v_user_id;

  INSERT INTO public.bonus_transfer_history (user_id, amount)
  VALUES (v_user_id, v_bonus);
END;
$function$;

-- update_wallet_after_payment()   ACL: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
CREATE OR REPLACE FUNCTION public.update_wallet_after_payment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet_id   uuid;
  v_new_balance numeric;
BEGIN
  -- 1. Připisuje se výhradně dokončená platba.
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  -- 2. Nekladná nebo chybějící částka se ignoruje.
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- 3. Idempotence — pro tuto platbu už kredit i historie existují.
  IF EXISTS (
    SELECT 1
    FROM public.wallet_transactions
    WHERE reference_id = NEW.id
      AND type = 'payment_credit'
  ) THEN
    RETURN NEW;
  END IF;

  -- 4. Připsání na peněženku; chybějící peněženka se založí.
  INSERT INTO public.wallets (user_id, balance_coins, created_at)
  VALUES (NEW.user_id, NEW.amount, now())
  ON CONFLICT (user_id) DO UPDATE
    SET balance_coins = public.wallets.balance_coins + EXCLUDED.balance_coins
  RETURNING id, balance_coins INTO v_wallet_id, v_new_balance;

  -- 5. Právě jeden řádek účetní historie.
  INSERT INTO public.wallet_transactions (
    user_id, wallet_id, amount, balance_after, type, source, reference_id, metadata
  ) VALUES (
    NEW.user_id,
    v_wallet_id,
    NEW.amount,
    v_new_balance,
    'payment_credit',
    'update_wallet_after_payment',
    NEW.id,
    jsonb_build_object(
      'method',             NEW.method,
      'payment_status',     NEW.status,
      'payment_created_at', NEW.created_at
    )
  );

  RETURN NEW;
END;
$function$;

-- 3) Nové objekty refund bloku (po ověření, že nic nevolá).
drop function if exists public.wallet_debit_fefo(uuid, numeric, text, uuid, jsonb, boolean);
drop function if exists public.wallet_credit_lot(uuid, numeric, text, uuid, text, uuid, uuid, numeric, numeric, numeric, text, jsonb);
drop function if exists public.wallet_expire_due_lots(uuid);
drop function if exists public.wallet_lot_consistency_issues();
drop function if exists public._wallet_lots_expire_user(uuid, uuid);
drop function if exists public._wallet_lots_consume(uuid, numeric, text, text, uuid, jsonb, boolean);
drop function if exists public._wallet_lots_create(uuid, uuid, numeric, text, uuid, text, uuid, uuid, numeric, numeric, numeric, text, jsonb);
drop function if exists public._wallet_set_managed(boolean);
drop function if exists public.trg_fn_wallets_lot_sync();
drop function if exists public.get_immediate_use_consent_config();
alter table public.payments drop constraint if exists payments_mio_split_check;
-- Volitelně (smaže historii sad a souhlasů):
-- alter table public.payments drop constraint if exists payments_immediate_use_consent_fkey;
-- drop table if exists public.wallet_lot_movements;
-- drop table if exists public.wallet_lots;
-- drop table if exists public.payment_immediate_use_consents;

commit;

-- Edge Functions: znovu nasadit zdroj z origin/main 51122473
--   create-stripe-checkout, stripe-webhook (--no-verify-jwt), stripe-refund
--   vždy s --project-ref xkzhjldrojjlrkezorey.
