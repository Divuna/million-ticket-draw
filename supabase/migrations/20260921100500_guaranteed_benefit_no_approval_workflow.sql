-- Garantované nákupní benefity — ODSTRANĚNÍ SCHVALOVACÍHO KROKU (první verze).
--
-- Rozhodnutí Pavla: v první verzi NENÍ žádný schvalovací workflow.
--   * benefit zakládá superadmin NEBO admin s `guaranteed_benefits.manage`,
--   * firma/partner nic neschvaluje,
--   * žádný další admin ani superadmin benefit po vytvoření neschvaluje,
--   * po uložení se všemi povinnými údaji je benefit rovnou provozní,
--   * admin s klíčem si sám nastaví cenu pro OneMil — nečeká na superadmina.
--
-- Mění se POUZE stav po vytvoření a cenová cesta. Nemění se:
--   purchase_guaranteed_benefit_bundle_atomic, get_guaranteed_benefit_offer,
--   buy_ticket_atomic, zákaznický nákupní flow, wallets, payments,
--   contest activation guard, Partner Offers, guardy evidenční firmy.
--
-- Poznámka k DB invariantům, které se ZÁMĚRNĚ neobcházejí:
--   `guard_guaranteed_benefit_history` drží schválenou verzi voucheru neměnnou
--   a zakazuje měnit obchodní podmínky a cenové snapshoty schváleného orderu.
--   Proto se obsah benefitu po vytvoření needituje — admin ho místo toho
--   pozastaví/ukončí (`admin_set_guaranteed_benefit_status`) a založí nový.
--   Distribuci (`distribution_scope` + vazby soutěží) lze měnit dál.

begin;

-- ---------------------------------------------------------------------------
-- Interní: vyřeší partnerské cenové pravidlo (jen z jiných SECURITY DEFINER fcí)
-- ---------------------------------------------------------------------------
create or replace function public.resolve_benefit_price_rule(
  p_partner_id       uuid,
  p_unit_price_ex_vat numeric,
  p_vat_rate_percent  numeric,
  p_currency          text,
  p_actor             uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_currency text := upper(coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'CZK'));
  v_price    numeric := coalesce(p_unit_price_ex_vat, 0);
  v_vat      numeric := coalesce(p_vat_rate_percent, 21);
  v_rule_id  uuid;
begin
  if p_partner_id is null then
    raise exception 'partner_id_required' using errcode = 'check_violation';
  end if;
  if v_price < 0 then
    raise exception 'invalid_unit_price' using errcode = 'check_violation';
  end if;
  if v_vat < 0 or v_vat > 100 then
    raise exception 'invalid_vat_rate' using errcode = 'check_violation';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = 'check_violation';
  end if;

  -- Beze změny ceny se existující otevřené pravidlo recykluje — jinak by se
  -- při každém benefitu zbytečně uzavíralo a zakládalo nové.
  select id into v_rule_id
  from public.voucher_distribution_price_rules
  where scope = 'partner'
    and partner_id = p_partner_id
    and active
    and valid_until is null
    and unit_price_ex_vat = v_price
    and vat_rate_percent = v_vat
    and currency = v_currency
  limit 1;

  if v_rule_id is not null then
    return v_rule_id;
  end if;

  -- Uzavřít předchozí otevřené pravidlo (unikátní index povoluje jen jedno).
  -- `now()` je v rámci transakce konstantní, takže pravidlo založené ve stejné
  -- transakci by mělo valid_until = valid_from a porušilo by CHECK
  -- `valid_until > valid_from`. Proto greatest(...).
  update public.voucher_distribution_price_rules
  set active = false,
      valid_until = greatest(now(), valid_from + interval '1 microsecond'),
      updated_at = now()
  where scope = 'partner'
    and partner_id = p_partner_id
    and active
    and valid_until is null;

  insert into public.voucher_distribution_price_rules (
    scope, partner_id, unit_price_ex_vat, vat_rate_percent, currency, created_by
  ) values (
    'partner', p_partner_id, v_price, v_vat, v_currency, p_actor
  )
  returning id into v_rule_id;

  return v_rule_id;
end;
$fn$;

revoke all on function public.resolve_benefit_price_rule(uuid, numeric, numeric, text, uuid) from public;
revoke all on function public.resolve_benefit_price_rule(uuid, numeric, numeric, text, uuid) from anon;
revoke all on function public.resolve_benefit_price_rule(uuid, numeric, numeric, text, uuid) from authenticated;

-- ---------------------------------------------------------------------------
-- Cena pro OneMil — smí nastavit i admin s guaranteed_benefits.manage
-- ---------------------------------------------------------------------------
-- Rozsah je záměrně POUZE partnerský (scope='partner'). Globální ceník je
-- platformní nastavení a zůstává superadminovi přes
-- superadmin_set_voucher_distribution_price — tu nerozvolňujeme.
create or replace function public.admin_set_guaranteed_benefit_price(
  p_partner_id        uuid,
  p_unit_price_ex_vat numeric,
  p_vat_rate_percent  numeric default 21,
  p_currency          text default 'CZK'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor   uuid := auth.uid();
  v_rule_id uuid;
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if p_partner_id is null or not exists (select 1 from public.partners where id = p_partner_id) then
    return jsonb_build_object('success', false, 'error', 'partner_not_found');
  end if;
  if p_unit_price_ex_vat is null or p_unit_price_ex_vat < 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_unit_price');
  end if;

  begin
    v_rule_id := public.resolve_benefit_price_rule(
      p_partner_id, p_unit_price_ex_vat, p_vat_rate_percent, p_currency, v_actor
    );
  exception when others then
    return jsonb_build_object('success', false, 'error', sqlerrm);
  end;

  perform public.log_admin_action(
    'guaranteed_benefit_price_set', 'distribution_price_rule', v_rule_id, null,
    jsonb_build_object(
      'partner_id', p_partner_id,
      'unit_price_ex_vat', p_unit_price_ex_vat,
      'vat_rate_percent', coalesce(p_vat_rate_percent, 21),
      'currency', upper(coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'CZK'))
    )
  );

  return jsonb_build_object('success', true, 'price_rule_id', v_rule_id);
end;
$fn$;

revoke all on function public.admin_set_guaranteed_benefit_price(uuid, numeric, numeric, text) from public;
revoke all on function public.admin_set_guaranteed_benefit_price(uuid, numeric, numeric, text) from anon;
grant execute on function public.admin_set_guaranteed_benefit_price(uuid, numeric, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Vytvoření benefitu — rovnou provozní, bez schvalovacího kroku
-- ---------------------------------------------------------------------------
-- Stará signatura se dropuje, aby nevznikl nejednoznačný overload.
drop function if exists public.admin_create_guaranteed_benefit(
  uuid, text, text, text, text, text, numeric, numeric, text,
  timestamptz, timestamptz, text, boolean, text, text[], text, uuid[]
);

create or replace function public.admin_create_guaranteed_benefit(
  p_partner_id              uuid,
  p_name                    text,
  p_short_description       text default null,
  p_how_to_use              text default null,
  p_terms                   text default null,
  p_benefit_kind            text default 'other',
  p_benefit_value           numeric default null,
  p_minimum_purchase_amount numeric default null,
  p_currency                text default 'CZK',
  p_valid_from              timestamptz default null,
  p_valid_until             timestamptz default null,
  p_image_url               text default null,
  p_is_unlimited            boolean default false,
  p_shared_code_or_url      text default null,
  p_codes                   text[] default null,
  p_distribution_scope      text default 'all_contests',
  p_contest_ids             uuid[] default null,
  p_unit_price_ex_vat       numeric default null,
  p_vat_rate_percent        numeric default 21
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor       uuid := auth.uid();
  v_now         timestamptz := now();
  v_name        text := nullif(btrim(coalesce(p_name, '')), '');
  v_how         text := nullif(btrim(coalesce(p_how_to_use, '')), '');
  v_terms       text := nullif(btrim(coalesce(p_terms, '')), '');
  v_shared      text := nullif(btrim(coalesce(p_shared_code_or_url, '')), '');
  v_scope       text := coalesce(nullif(btrim(coalesce(p_distribution_scope, '')), ''), 'all_contests');
  v_currency    text := upper(coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'CZK'));
  v_unlimited   boolean := coalesce(p_is_unlimited, false);
  v_price       numeric := coalesce(p_unit_price_ex_vat, 0);
  v_vat         numeric := coalesce(p_vat_rate_percent, 21);
  v_codes       text[];
  v_code_count  integer := 0;
  v_partner_ok  boolean;
  v_rule_id     uuid;
  v_rule        record;
  v_voucher_id  uuid;
  v_version_id  uuid;
  v_order_id    uuid;
  v_contest_id  uuid;
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if v_name is null then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;
  if v_how is null then
    return jsonb_build_object('success', false, 'error', 'how_to_use_required');
  end if;
  if v_terms is null then
    return jsonb_build_object('success', false, 'error', 'terms_required');
  end if;
  if coalesce(p_benefit_kind, '') not in ('fixed_amount', 'percentage', 'product', 'other') then
    return jsonb_build_object('success', false, 'error', 'invalid_benefit_kind');
  end if;
  if v_scope not in ('all_contests', 'selected_contests') then
    return jsonb_build_object('success', false, 'error', 'invalid_distribution_scope');
  end if;
  if v_price < 0 then
    return jsonb_build_object('success', false, 'error', 'invalid_unit_price');
  end if;
  if v_vat < 0 or v_vat > 100 then
    return jsonb_build_object('success', false, 'error', 'invalid_vat_rate');
  end if;

  select true into v_partner_ok from public.partners where id = p_partner_id;
  if v_partner_ok is null then
    return jsonb_build_object('success', false, 'error', 'partner_not_found');
  end if;

  if v_unlimited then
    if v_shared is null then
      return jsonb_build_object('success', false, 'error', 'shared_code_or_url_required');
    end if;
    v_code_count := 0;
  else
    select array_agg(c)
    into v_codes
    from (
      select distinct btrim(x) as c
      from unnest(coalesce(p_codes, array[]::text[])) as x
      where nullif(btrim(x), '') is not null
    ) s;

    v_code_count := coalesce(array_length(v_codes, 1), 0);
    if v_code_count = 0 then
      return jsonb_build_object('success', false, 'error', 'codes_required');
    end if;
    if v_shared is not null then
      return jsonb_build_object('success', false, 'error', 'shared_code_not_allowed_for_limited');
    end if;
  end if;

  if v_scope = 'selected_contests'
     and coalesce(array_length(p_contest_ids, 1), 0) = 0 then
    return jsonb_build_object('success', false, 'error', 'contest_selection_required');
  end if;

  -- 1) Cena pro OneMil. Benefit bez sjednané ceny se zakládá s 0 — nikdy se
  --    nečeká na superadmina.
  --    Pozor: resolve_benefit_price_rule může nový řádek vložit, takže se
  --    nesmí volat uvnitř WHERE téhož SELECTu — snímek dotazu by nový řádek
  --    neviděl a cenové sloupce by zůstaly NULL (porušení check2).
  v_rule_id := public.resolve_benefit_price_rule(p_partner_id, v_price, v_vat, v_currency, v_actor);

  select r.id, r.unit_price_ex_vat, r.vat_rate_percent, r.currency
  into v_rule
  from public.voucher_distribution_price_rules r
  where r.id = v_rule_id;

  if v_rule.id is null then
    return jsonb_build_object('success', false, 'error', 'price_rule_not_resolved');
  end if;

  -- 2) Voucher — rovnou schválený, nikdy veřejný.
  --    Obsahová pole se na public.vouchers ZÁMĚRNĚ nezapisují (drift staging ×
  --    produkce); autoritativní obsah je ve voucher_versions.
  insert into public.vouchers (
    name, image_url, partner_id, is_public,
    workflow_status, distribution_mode,
    approved_at, approved_by,
    start_date, end_date
  ) values (
    v_name,
    coalesce(nullif(btrim(coalesce(p_image_url, '')), ''), ''),
    p_partner_id,
    false,
    'approved',
    'guaranteed_purchase_benefit',
    v_now,
    v_actor,
    p_valid_from,
    p_valid_until
  )
  returning id into v_voucher_id;

  -- 3) Verze — rovnou schválená.
  insert into public.voucher_versions (
    voucher_id, version_number, status, name, short_description,
    usage_description, terms_text, how_to_use_text, image_url,
    benefit_kind, benefit_value, currency, minimum_purchase_amount,
    valid_from, valid_until, code_source, shared_code_or_url,
    requested_code_count, approved_code_count,
    created_by, submitted_at, submitted_by, approved_at, approved_by
  ) values (
    v_voucher_id, 1, 'approved', v_name,
    nullif(btrim(coalesce(p_short_description, '')), ''),
    nullif(btrim(coalesce(p_short_description, '')), ''),
    v_terms, v_how,
    nullif(btrim(coalesce(p_image_url, '')), ''),
    p_benefit_kind, p_benefit_value,
    v_currency,
    p_minimum_purchase_amount,
    p_valid_from, p_valid_until,
    case when v_unlimited then 'shared_static' else 'provided_by_partner' end,
    case when v_unlimited then v_shared else null end,
    v_code_count,
    case when v_unlimited then null else v_code_count end,
    v_actor, v_now, v_actor, v_now, v_actor
  )
  returning id into v_version_id;

  update public.vouchers
  set current_approved_version_id = v_version_id,
      updated_at = v_now
  where id = v_voucher_id;

  -- 4) Distribuční příkaz — rovnou schválený, s cenovým snapshotem.
  insert into public.voucher_distribution_orders (
    partner_id, voucher_id, voucher_version_id, contest_id,
    requested_quantity, status, is_unlimited, distribution_scope,
    price_rule_id, unit_price_ex_vat_snapshot, vat_rate_percent_snapshot,
    currency_snapshot, submitted_by, decided_by, decided_at, decision_reason
  ) values (
    p_partner_id, v_voucher_id, v_version_id, null,
    v_code_count, 'approved', v_unlimited, v_scope,
    v_rule.id, v_rule.unit_price_ex_vat, v_rule.vat_rate_percent,
    v_rule.currency, v_actor, v_actor, v_now,
    'Vytvořeno administrací OneMil — první verze bez schvalovacího kroku.'
  )
  returning id into v_order_id;

  -- 5) Kódy omezeného benefitu.
  if not v_unlimited then
    insert into public.voucher_codes (voucher_id, code, status, distribution_order_id, created_by)
    select v_voucher_id, c, 'available', v_order_id, v_actor
    from unnest(v_codes) as c;
  end if;

  -- 6) Vybrané soutěže. "Všechny soutěže" je uložený rozsah, nikoli výčet.
  if v_scope = 'selected_contests' then
    foreach v_contest_id in array p_contest_ids loop
      insert into public.voucher_distribution_contests (order_id, contest_id, attached_by)
      values (v_order_id, v_contest_id, v_actor)
      on conflict do nothing;
    end loop;
  end if;

  perform public.log_admin_action(
    'guaranteed_benefit_created', 'distribution_order', v_order_id, null,
    jsonb_build_object(
      'partner_id', p_partner_id,
      'voucher_id', v_voucher_id,
      'voucher_version_id', v_version_id,
      'is_unlimited', v_unlimited,
      'distribution_scope', v_scope,
      'code_count', v_code_count,
      'order_status', 'approved',
      'price_rule_id', v_rule.id,
      'unit_price_ex_vat', v_rule.unit_price_ex_vat,
      'vat_rate_percent', v_rule.vat_rate_percent,
      'currency', v_rule.currency,
      'created_without_approval_workflow', true
    )
  );

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'voucher_id', v_voucher_id,
    'voucher_version_id', v_version_id,
    'order_status', 'approved',
    'is_unlimited', v_unlimited,
    'distribution_scope', v_scope,
    'code_count', v_code_count,
    'price_rule_id', v_rule.id,
    'unit_price_ex_vat', v_rule.unit_price_ex_vat,
    'vat_rate_percent', v_rule.vat_rate_percent,
    'currency', v_rule.currency
  );
end;
$fn$;

revoke all on function public.admin_create_guaranteed_benefit(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, text, boolean, text, text[], text, uuid[], numeric, numeric) from public;
revoke all on function public.admin_create_guaranteed_benefit(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, text, boolean, text, text[], text, uuid[], numeric, numeric) from anon;
grant execute on function public.admin_create_guaranteed_benefit(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, text, boolean, text, text[], text, uuid[], numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Provozní stav benefitu — pozastavit / ukončit / znovu zapnout
-- ---------------------------------------------------------------------------
-- Náhrada za schvalovací krok: admin s klíčem si sám řídí, jestli benefit běží.
-- Obsah schváleného benefitu je podle DB invariantu neměnný, takže chybně
-- založený benefit se ukončí a založí znovu — bez čekání na superadmina.
create or replace function public.admin_set_guaranteed_benefit_status(
  p_order_id uuid,
  p_status   text,
  p_reason   text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_status text := nullif(btrim(coalesce(p_status, '')), '');
  v_order  record;
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if v_status not in ('approved', 'suspended', 'ended') then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  select * into v_order from public.voucher_distribution_orders where id = p_order_id;
  if v_order.id is null then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;
  if v_order.status not in ('approved', 'suspended', 'ended') then
    return jsonb_build_object('success', false, 'error', 'benefit_not_operational');
  end if;
  -- Ukončený benefit se znovu nezapíná; založí se nový.
  if v_order.status = 'ended' and v_status <> 'ended' then
    return jsonb_build_object('success', false, 'error', 'benefit_already_ended');
  end if;

  update public.voucher_distribution_orders
  set status = v_status,
      decision_reason = coalesce(nullif(btrim(coalesce(p_reason, '')), ''), decision_reason),
      updated_at = now()
  where id = p_order_id;

  perform public.log_admin_action(
    'guaranteed_benefit_status_set', 'distribution_order', p_order_id,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', v_status)
  );

  return jsonb_build_object('success', true, 'order_id', p_order_id, 'order_status', v_status);
end;
$fn$;

revoke all on function public.admin_set_guaranteed_benefit_status(uuid, text, text) from public;
revoke all on function public.admin_set_guaranteed_benefit_status(uuid, text, text) from anon;
grant execute on function public.admin_set_guaranteed_benefit_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Editace: schválená verze je podle DB invariantu neměnná — vrátit jasný důvod
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_guaranteed_benefit(
  p_order_id                uuid,
  p_name                    text default null,
  p_short_description       text default null,
  p_how_to_use              text default null,
  p_terms                   text default null,
  p_benefit_value           numeric default null,
  p_minimum_purchase_amount numeric default null,
  p_valid_from              timestamptz default null,
  p_valid_until             timestamptz default null,
  p_shared_code_or_url      text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_order   record;
  v_version record;
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select * into v_order from public.voucher_distribution_orders where id = p_order_id;
  if v_order.id is null then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  select * into v_version from public.voucher_versions where id = v_order.voucher_version_id;

  -- Schválená verze voucheru je neměnná (guard_guaranteed_benefit_history).
  -- Není to schvalovací krok, ale auditní invariant — obsah vydaného benefitu
  -- se nesmí zpětně přepsat.
  if v_version.status = 'approved' then
    return jsonb_build_object('success', false, 'error', 'benefit_content_immutable');
  end if;

  if v_version.code_source <> 'shared_static'
     and nullif(btrim(coalesce(p_shared_code_or_url, '')), '') is not null then
    return jsonb_build_object('success', false, 'error', 'shared_code_not_allowed_for_limited');
  end if;

  update public.voucher_versions set
    name                    = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
    short_description       = coalesce(nullif(btrim(coalesce(p_short_description, '')), ''), short_description),
    how_to_use_text         = coalesce(nullif(btrim(coalesce(p_how_to_use, '')), ''), how_to_use_text),
    terms_text              = coalesce(nullif(btrim(coalesce(p_terms, '')), ''), terms_text),
    benefit_value           = coalesce(p_benefit_value, benefit_value),
    minimum_purchase_amount = coalesce(p_minimum_purchase_amount, minimum_purchase_amount),
    valid_from              = coalesce(p_valid_from, valid_from),
    valid_until             = coalesce(p_valid_until, valid_until),
    shared_code_or_url      = case
                                when code_source = 'shared_static'
                                then coalesce(nullif(btrim(coalesce(p_shared_code_or_url, '')), ''), shared_code_or_url)
                                else shared_code_or_url
                              end,
    updated_at              = now()
  where id = v_order.voucher_version_id;

  update public.vouchers set
    name       = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
    start_date = coalesce(p_valid_from, start_date),
    end_date   = coalesce(p_valid_until, end_date),
    updated_at = now()
  where id = v_order.voucher_id;

  perform public.log_admin_action(
    'guaranteed_benefit_updated', 'distribution_order', p_order_id, null, '{}'::jsonb
  );

  return jsonb_build_object('success', true, 'order_id', p_order_id);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Detail: cenu vidí i admin s klíčem (už ji sám nastavuje)
-- ---------------------------------------------------------------------------
create or replace function public.admin_get_guaranteed_benefit(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  return jsonb_build_object(
    'success', true,
    'is_superadmin', public.is_superadmin(),
    'benefit', (
      select to_jsonb(t)
      from (
        select o.id as order_id, o.voucher_id, o.voucher_version_id,
               o.status as order_status, o.is_unlimited, o.distribution_scope,
               o.requested_quantity, o.issued_quantity,
               o.unit_price_ex_vat_snapshot,
               o.vat_rate_percent_snapshot,
               o.currency_snapshot,
               p.id as partner_id, p.name as partner_name,
               p.company_name as partner_company_name,
               p.benefit_only_record as partner_benefit_only,
               vv.name as benefit_name, vv.short_description,
               vv.how_to_use_text, vv.terms_text, vv.benefit_kind,
               vv.benefit_value, vv.minimum_purchase_amount, vv.currency,
               vv.valid_from, vv.valid_until, vv.code_source,
               vv.shared_code_or_url,
               v.workflow_status as voucher_status,
               coalesce((
                 select jsonb_agg(jsonb_build_object('contest_id', dc.contest_id, 'name', c.name, 'status', c.status::text))
                 from public.voucher_distribution_contests dc
                 join public.contests c on c.id = dc.contest_id
                 where dc.order_id = o.id and dc.detached_at is null
               ), '[]'::jsonb) as contests
        from public.voucher_distribution_orders o
        join public.partners p on p.id = o.partner_id
        join public.vouchers v on v.id = o.voucher_id
        join public.voucher_versions vv on vv.id = o.voucher_version_id
        where o.id = p_order_id
      ) t
    )
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Seznam: doplnit cenu, aby admin viděl, co má nastavené
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_guaranteed_benefits()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  return jsonb_build_object(
    'success', true,
    'is_superadmin', public.is_superadmin(),
    'benefits', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select o.id                    as order_id,
               o.voucher_id,
               o.voucher_version_id,
               o.status                as order_status,
               o.is_unlimited,
               o.distribution_scope,
               o.requested_quantity,
               o.issued_quantity,
               o.unit_price_ex_vat_snapshot,
               o.vat_rate_percent_snapshot,
               o.currency_snapshot,
               o.created_at,
               p.id                    as partner_id,
               p.name                  as partner_name,
               p.benefit_only_record   as partner_benefit_only,
               vv.name                 as benefit_name,
               vv.short_description,
               vv.valid_from,
               vv.valid_until,
               vv.code_source,
               v.workflow_status       as voucher_status,
               (
                 select count(*) from public.voucher_codes vc
                 where vc.distribution_order_id = o.id and vc.status = 'available'
               )                       as available_codes,
               (
                 select count(*) from public.voucher_distribution_contests dc
                 where dc.order_id = o.id and dc.detached_at is null
               )                       as linked_contests
        from public.voucher_distribution_orders o
        join public.partners p        on p.id = o.partner_id
        join public.vouchers v        on v.id = o.voucher_id
        join public.voucher_versions vv on vv.id = o.voucher_version_id
        where v.distribution_mode = 'guaranteed_purchase_benefit'
        order by o.created_at desc
        limit 200
      ) t
    ), '[]'::jsonb)
  );
end;
$fn$;

commit;

-- ---------------------------------------------------------------------------
-- Trigger guard na public.vouchers — jediná trigger-level schvalovací brána
-- ---------------------------------------------------------------------------
-- Uvolněno VÝHRADNĚ pro garantované benefity. Klasický voucherový katalog
-- zůstává superadmin-only. Podmínka vyžaduje distribution_mode
-- 'guaranteed_purchase_benefit' PŘED i PO změně, aby nešlo klasický voucher
-- překlopit na benefit a tím schvalovací bránu obejít.
begin;

create or replace function public.guard_voucher_delete_and_review()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_is_service boolean :=
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role';
  v_is_guaranteed_benefit boolean;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.voucher_versions where voucher_id = old.id)
       or exists (select 1 from public.voucher_distribution_orders where voucher_id = old.id)
       or exists (select 1 from public.voucher_issuances where voucher_id = old.id)
       or exists (select 1 from public.user_vouchers where voucher_id = old.id and redeemed) then
      raise exception 'Used or versioned vouchers cannot be deleted';
    end if;
    return old;
  end if;

  if (
    new.workflow_status is distinct from old.workflow_status
    and new.workflow_status in ('approved', 'rejected', 'suspended', 'ended')
  ) or new.current_approved_version_id is distinct from old.current_approved_version_id
     or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by
     or new.rejected_at is distinct from old.rejected_at
     or new.rejected_by is distinct from old.rejected_by then

    v_is_guaranteed_benefit :=
      coalesce(old.distribution_mode, 'classic') = 'guaranteed_purchase_benefit'
      and coalesce(new.distribution_mode, 'classic') = 'guaranteed_purchase_benefit';

    if not v_is_service
       and not public.is_superadmin(auth.uid())
       and not (v_is_guaranteed_benefit and public.can_manage_guaranteed_benefits()) then
      raise exception 'Only a superadmin can review, suspend or end a voucher';
    end if;
  end if;
  return new;
end;
$fn$;

commit;
