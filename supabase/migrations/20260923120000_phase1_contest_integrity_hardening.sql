-- FÁZE 1 opravného úkolu (audit 23. 9. 2026) — integrita soutěží a úklid rizik.
--
-- Tato migrace NEMĚNÍ peněženky, platby, provize ani pořadí tiketů.
-- Obsahuje pouze:
--   1.1 odstranění triggeru, který při INSERTu soutěže posílal požadavek do cizího
--       Supabase projektu (rrmvxsldrjgbdxluklka) s hlavičkou
--       `Bearer current_setting('app.settings.service_role_key')`,
--   1.2 (zrušeno rozhodnutím Pavla 23. 9. 2026 — vzdálenost k další výhře je
--       záměrná součást hráčského zážitku a zůstává; assign_contest_ticket_atomic
--       se touto migrací nemění),
--   1.3 garantovaný benefit se nevydá, pokud jeho verze není schválená nebo je
--       po `valid_until`,
--   1.4 DB guard: po vydání prvního tiketu nelze přes aplikaci (role anon /
--       authenticated, tedy ani admin UI a admin RPC) přidat, smazat ani přesunout
--       bonusovou výhru ani změnit její obsah / hodnotu; + auditní stopa všech
--       změn bonusových výher u rozběhnuté soutěže,
--   1.5 vypnutí legacy cronu `influencer_commissions_monthly` (souběžná mrtvá
--       provizní cesta, 2 % z MioCoin částky),
--   1.6 PLAYER REFERRAL VAZBA JE TRVALÁ (rozhodnutí Pavla 23. 9. 2026):
--       `process_referral_inactivity` už nic nedeaktivuje a cron
--       `referral_inactivity_daily` se odplánuje. Historické řádky se NEMĚNÍ.
--
-- ZÁMĚRNĚ NEDOTČENO: buy_ticket_atomic (jen service_role, zákazník ho volat nemůže),
-- wallets, wallet_transactions, payments, referral_rewards, provizní výpočty,
-- pořadí a číslování tiketů, pozice hlavní výhry, RLS politiky.

begin;

-- ---------------------------------------------------------------------------
-- 1.1 Trigger volající cizí projekt při vložení soutěže
-- ---------------------------------------------------------------------------
-- MioCoin bonusy dnes admin ukládá přes admin_begin/append/finalize_miocoin_save;
-- tento trigger nemá v repozitáři žádný zdroj ani konzumenta.
drop trigger if exists trg_generate_miocoin_on_contest_insert on public.contests;
drop function if exists public.on_contest_created_generate_miocoin();

-- ---------------------------------------------------------------------------
-- 1.3 purchase_guaranteed_benefit_bundle_atomic
-- ---------------------------------------------------------------------------
-- Změny proti produkční definici (20260921120500):
--   * omezená větev: navíc `vv.status = 'approved'` a platnost `valid_until`,
--   * neomezená větev: navíc platnost `valid_until`.
-- Výstup (včetně `distance_to_next_bonus` pro hráčský zážitek „další výhra je
-- za N tiketů") je beze změny. Vše ostatní (flag, allowlist, idempotence, pořadí výběru, billing, odečet,
-- ticket, ledger) je beze změny.
create or replace function public.purchase_guaranteed_benefit_bundle_atomic(p_user_id uuid, p_contest_id uuid, p_idempotency_key uuid)
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

-- ---------------------------------------------------------------------------
-- 1.4 Bonusové výhry po startu soutěže — guard + audit
-- ---------------------------------------------------------------------------
-- Soutěž je „rozběhnutá", jakmile existuje její první tiket
-- (`next_ticket_number > 1` nebo řádek v `tickets`).
--
-- Guard platí pro aplikační role `anon` a `authenticated` — tedy pro admin UI,
-- přímé RLS zápisy superadmina i SECURITY DEFINER admin RPC (ty běží pod JWT
-- volajícího, `request.jwt.claims.role` zůstává `authenticated`).
-- `service_role` a přímé databázové relace bez JWT (migrace, údržba, řízený
-- předstartovní reset, e2e úklid) guardem neprocházejí — každá jejich změna
-- u rozběhnuté soutěže se ale zapíše do audit_logs níže.
--
-- U rozběhnuté soutěže je povoleno jen:
--   * pending → won (výhru vyhodnocuje assign_contest_ticket_atomic / buy_ticket_atomic),
--   * změny stavu doručení u už vyhrané výhry (won → shipped/delivered…),
--   * admin poznámka, obrázek, nákladové údaje (supplier/unit_cost/vat/handling),
--     guardian_required.
-- Zakázáno: INSERT, DELETE, změna contest_id / ticket_position / amount /
-- title / description / detailed_description, zrušení čekající výhry
-- (pending → cokoli kromě won) a návrat na pending.
create or replace function public.bonus_prizes_request_role()
 returns text
 language sql
 stable
 set search_path to 'public'
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
$function$;

create or replace function public.bonus_prizes_contest_started(p_contest_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public'
as $function$
  select coalesce((select c.next_ticket_number > 1 from public.contests c where c.id = p_contest_id), false)
      or exists (select 1 from public.tickets t where t.contest_id = p_contest_id);
$function$;

revoke all on function public.bonus_prizes_request_role() from public, anon, authenticated;
revoke all on function public.bonus_prizes_contest_started(uuid) from public, anon, authenticated;

create or replace function public.guard_bonus_prizes_after_contest_start()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_role text := public.bonus_prizes_request_role();
  v_contest uuid;
begin
  -- Údržbová cesta (service_role, přímá DB relace bez JWT) — jen audit.
  if v_role is null or v_role not in ('anon', 'authenticated') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    v_contest := new.contest_id;
    if public.bonus_prizes_contest_started(v_contest) then
      raise exception 'Bonusovou výhru nelze přidat: soutěž už má vydané tikety.'
        using errcode = 'check_violation', hint = 'contest_already_started';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if public.bonus_prizes_contest_started(old.contest_id) then
      raise exception 'Bonusovou výhru nelze smazat: soutěž už má vydané tikety.'
        using errcode = 'check_violation', hint = 'contest_already_started';
    end if;
    return old;
  end if;

  -- UPDATE
  if public.bonus_prizes_contest_started(old.contest_id)
     or (new.contest_id is distinct from old.contest_id
         and public.bonus_prizes_contest_started(new.contest_id)) then
    if new.contest_id           is distinct from old.contest_id
       or new.ticket_position   is distinct from old.ticket_position
       or new.amount            is distinct from old.amount
       or new.title             is distinct from old.title
       or new.description       is distinct from old.description
       or new.detailed_description is distinct from old.detailed_description then
      raise exception 'Pozici, hodnotu ani obsah bonusové výhry nelze po vydání prvního tiketu měnit.'
        using errcode = 'check_violation', hint = 'contest_already_started';
    end if;

    if new.status is distinct from old.status then
      if old.status = 'pending' and new.status is distinct from 'won' then
        raise exception 'Čekající bonusovou výhru nelze po vydání prvního tiketu zrušit ani změnit.'
          using errcode = 'check_violation', hint = 'contest_already_started';
      end if;
      if old.status is distinct from 'pending' and new.status = 'pending' then
        raise exception 'Vyhranou bonusovou výhru nelze vrátit mezi čekající.'
          using errcode = 'check_violation', hint = 'contest_already_started';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.audit_bonus_prizes_after_contest_start()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_contest uuid := case when tg_op = 'DELETE' then old.contest_id else new.contest_id end;
  v_id      uuid := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  -- Změny PŘED startem zaznamenávají admin RPC do admin_actions; tady se
  -- auditují jen změny u soutěže, která už má vydané tikety.
  if not public.bonus_prizes_contest_started(v_contest)
     and not (tg_op = 'UPDATE' and old.contest_id is distinct from new.contest_id
              and public.bonus_prizes_contest_started(old.contest_id)) then
    return null;
  end if;

  insert into public.audit_logs (event, event_type, user_id, reference_id, metadata, created_at)
  values (
    'bonus_prize_' || lower(tg_op),
    'bonus_prize_integrity',
    auth.uid(),
    v_id,
    jsonb_build_object(
      'table',        'bonus_prizes',
      'contest_id',   v_contest,
      'request_role', coalesce(public.bonus_prizes_request_role(), 'db_session'),
      'db_user',      current_user,
      'old',          case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      'new',          case when tg_op = 'DELETE' then null else to_jsonb(new) end
    ),
    now()
  );
  return null;
end;
$function$;

revoke all on function public.guard_bonus_prizes_after_contest_start() from public, anon, authenticated;
revoke all on function public.audit_bonus_prizes_after_contest_start() from public, anon, authenticated;

drop trigger if exists trg_guard_bonus_prizes_after_contest_start on public.bonus_prizes;
create trigger trg_guard_bonus_prizes_after_contest_start
  before insert or update or delete on public.bonus_prizes
  for each row execute function public.guard_bonus_prizes_after_contest_start();

drop trigger if exists trg_audit_bonus_prizes_after_contest_start on public.bonus_prizes;
create trigger trg_audit_bonus_prizes_after_contest_start
  after insert or update or delete on public.bonus_prizes
  for each row execute function public.audit_bonus_prizes_after_contest_start();

-- ---------------------------------------------------------------------------
-- 1.5 Legacy cron influencer provizí (2 % z MioCoin částky, status 'paid')
-- ---------------------------------------------------------------------------
-- Funkce calculate_influencer_commissions_current_month zůstává (historie),
-- jen se přestane plánovat. Provize počítá Affiliate v2 (cron 25).
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'influencer_commissions_monthly';
end $$;

-- ---------------------------------------------------------------------------
-- 1.6 Player referral vazba je trvalá
-- ---------------------------------------------------------------------------
-- Rozhodnutí Pavla 23. 9. 2026: vazba doporučující → doporučený se NESMÍ
-- automaticky deaktivovat kvůli neaktivitě. Zaniká jen při smazání účtu,
-- potvrzeném podvodu/zneužití nebo jiné oprávněné události (ručně, s důvodem).
-- Funkce zůstává kvůli zpětné kompatibilitě jako no-op; historické řádky
-- se nemění (případné `permanently_inactive` zůstávají, jak vznikly).
create or replace function public.process_referral_inactivity()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Záměrně nic nedělá: player referral vazba je trvalá (23. 9. 2026).
  return 0;
end;
$function$;

do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'referral_inactivity_daily';
end $$;

commit;
