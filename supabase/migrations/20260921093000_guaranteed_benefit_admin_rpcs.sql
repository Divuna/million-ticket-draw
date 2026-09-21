-- Garantované nákupní benefity — admin-only base, část 4/4: RPC pro benefit.
--
-- Rozsah této první verze:
--   * admin/superadmin založí benefit (omezený nebo neomezený),
--   * zvolí distribuci Všechny soutěže / Vybrané soutěže,
--   * benefit vzniká jako koncept (voucher.workflow_status='draft',
--     voucher_versions.status='draft', voucher_distribution_orders.status='requested').
--
-- ZÁMĚRNĚ MIMO ROZSAH (neměnit zde):
--   * schválení do provozu a cenová nastavení — zůstávají superadminovi přes
--     existující superadmin_review_voucher_distribution_order /
--     superadmin_review_guaranteed_benefit_version /
--     superadmin_set_voucher_distribution_price,
--   * purchase_guaranteed_benefit_bundle_atomic, get_guaranteed_benefit_offer,
--     buy_ticket_atomic, zákaznický nákupní flow, wallets, payments,
--     contest activation guard.

begin;

-- ---------------------------------------------------------------------------
-- Soutěže pro picker distribuce
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_contests_for_benefit_distribution()
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
    'contests', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select c.id, c.name, c.status::text as status, c.ticket_price
        from public.contests c
        where c.status in ('draft', 'pending', 'active')
        order by
          case c.status when 'active' then 0 when 'pending' then 1 else 2 end,
          c.created_at desc
        limit 200
      ) t
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.admin_list_contests_for_benefit_distribution() from public;
revoke all on function public.admin_list_contests_for_benefit_distribution() from anon;
grant execute on function public.admin_list_contests_for_benefit_distribution() to authenticated;

-- ---------------------------------------------------------------------------
-- Založení benefitu (voucher + verze + kódy + distribuční příkaz)
-- ---------------------------------------------------------------------------
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
  p_contest_ids             uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor       uuid := auth.uid();
  v_name        text := nullif(btrim(coalesce(p_name, '')), '');
  v_how         text := nullif(btrim(coalesce(p_how_to_use, '')), '');
  v_terms       text := nullif(btrim(coalesce(p_terms, '')), '');
  v_shared      text := nullif(btrim(coalesce(p_shared_code_or_url, '')), '');
  v_scope       text := coalesce(nullif(btrim(coalesce(p_distribution_scope, '')), ''), 'all_contests');
  v_unlimited   boolean := coalesce(p_is_unlimited, false);
  v_codes       text[];
  v_code_count  integer := 0;
  v_partner_ok  boolean;
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
    -- Omezený benefit: kódy dodává admin, žádné se negenerují automaticky.
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

  -- 1) Voucher (koncept, nikdy veřejný)
  -- Pozor: obsahová pole (short_description / how_to_use_text / terms_text)
  -- se na public.vouchers ZÁMĚRNĚ nezapisují. Jsou to legacy denormalizované
  -- kopie, které staging nemá a produkce ano — autoritativní obsah je vždy ve
  -- voucher_versions. Nepřidávat je sem zpět.
  insert into public.vouchers (
    name, image_url, partner_id, is_public,
    workflow_status, distribution_mode,
    start_date, end_date
  ) values (
    v_name,
    coalesce(nullif(btrim(coalesce(p_image_url, '')), ''), ''),
    p_partner_id,
    false,
    'draft',
    'guaranteed_purchase_benefit',
    p_valid_from,
    p_valid_until
  )
  returning id into v_voucher_id;

  -- 2) Verze
  insert into public.voucher_versions (
    voucher_id, version_number, status, name, short_description,
    usage_description, terms_text, how_to_use_text, image_url,
    benefit_kind, benefit_value, currency, minimum_purchase_amount,
    valid_from, valid_until, code_source, shared_code_or_url,
    requested_code_count, created_by
  ) values (
    v_voucher_id, 1, 'draft', v_name,
    nullif(btrim(coalesce(p_short_description, '')), ''),
    nullif(btrim(coalesce(p_short_description, '')), ''),
    v_terms, v_how,
    nullif(btrim(coalesce(p_image_url, '')), ''),
    p_benefit_kind, p_benefit_value,
    coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'CZK'),
    p_minimum_purchase_amount,
    p_valid_from, p_valid_until,
    case when v_unlimited then 'shared_static' else 'provided_by_partner' end,
    case when v_unlimited then v_shared else null end,
    v_code_count,
    v_actor
  )
  returning id into v_version_id;

  -- 3) Distribuční příkaz (koncept — schválení a cena zůstávají superadminovi)
  insert into public.voucher_distribution_orders (
    partner_id, voucher_id, voucher_version_id, contest_id,
    requested_quantity, status, is_unlimited, distribution_scope, submitted_by
  ) values (
    p_partner_id, v_voucher_id, v_version_id, null,
    v_code_count, 'requested', v_unlimited, v_scope, v_actor
  )
  returning id into v_order_id;

  -- 4) Kódy omezeného benefitu
  if not v_unlimited then
    insert into public.voucher_codes (voucher_id, code, status, distribution_order_id, created_by)
    select v_voucher_id, c, 'available', v_order_id, v_actor
    from unnest(v_codes) as c;
  end if;

  -- 5) Vybrané soutěže. "Všechny soutěže" je uložený rozsah, nikoli výčet.
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
      'is_unlimited', v_unlimited,
      'distribution_scope', v_scope,
      'code_count', v_code_count
    )
  );

  return jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'voucher_id', v_voucher_id,
    'voucher_version_id', v_version_id,
    'is_unlimited', v_unlimited,
    'distribution_scope', v_scope,
    'code_count', v_code_count
  );
end;
$fn$;

revoke all on function public.admin_create_guaranteed_benefit(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, text, boolean, text, text[], text, uuid[]) from public;
revoke all on function public.admin_create_guaranteed_benefit(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, text, boolean, text, text[], text, uuid[]) from anon;
grant execute on function public.admin_create_guaranteed_benefit(uuid, text, text, text, text, text, numeric, numeric, text, timestamptz, timestamptz, text, boolean, text, text[], text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Editace konceptu benefitu
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
  if v_order.status <> 'requested' then
    return jsonb_build_object('success', false, 'error', 'benefit_not_editable');
  end if;

  select * into v_version from public.voucher_versions where id = v_order.voucher_version_id;
  if v_version.status <> 'draft' then
    return jsonb_build_object('success', false, 'error', 'version_not_editable');
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

  -- Viz poznámka výše: obsahová pole žijí ve voucher_versions, ne ve vouchers.
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

revoke all on function public.admin_update_guaranteed_benefit(uuid, text, text, text, text, numeric, numeric, timestamptz, timestamptz, text) from public;
revoke all on function public.admin_update_guaranteed_benefit(uuid, text, text, text, text, numeric, numeric, timestamptz, timestamptz, text) from anon;
grant execute on function public.admin_update_guaranteed_benefit(uuid, text, text, text, text, numeric, numeric, timestamptz, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Distribuce: Všechny soutěže / Vybrané soutěže
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_benefit_distribution(
  p_order_id    uuid,
  p_scope       text,
  p_contest_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor      uuid := auth.uid();
  v_scope      text := coalesce(nullif(btrim(coalesce(p_scope, '')), ''), '');
  v_order      record;
  v_contest_id uuid;
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if v_scope not in ('all_contests', 'selected_contests') then
    return jsonb_build_object('success', false, 'error', 'invalid_distribution_scope');
  end if;

  select * into v_order from public.voucher_distribution_orders where id = p_order_id;
  if v_order.id is null then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  if v_scope = 'selected_contests'
     and coalesce(array_length(p_contest_ids, 1), 0) = 0 then
    return jsonb_build_object('success', false, 'error', 'contest_selection_required');
  end if;

  update public.voucher_distribution_orders
  set distribution_scope = v_scope,
      updated_at = now()
  where id = p_order_id;

  -- Odpojit vazby, které už ve výběru nejsou (historie zůstává přes detached_at).
  update public.voucher_distribution_contests
  set detached_at = now(),
      detached_by = v_actor
  where order_id = p_order_id
    and detached_at is null
    and (
      v_scope = 'all_contests'
      or contest_id <> all (coalesce(p_contest_ids, array[]::uuid[]))
    );

  if v_scope = 'selected_contests' then
    foreach v_contest_id in array p_contest_ids loop
      insert into public.voucher_distribution_contests (order_id, contest_id, attached_by)
      values (p_order_id, v_contest_id, v_actor)
      on conflict do nothing;
    end loop;
  end if;

  perform public.log_admin_action(
    'guaranteed_benefit_distribution_set', 'distribution_order', p_order_id, null,
    jsonb_build_object('distribution_scope', v_scope,
                       'contest_count', coalesce(array_length(p_contest_ids, 1), 0))
  );

  return jsonb_build_object('success', true, 'order_id', p_order_id, 'distribution_scope', v_scope);
end;
$fn$;

revoke all on function public.admin_set_benefit_distribution(uuid, text, uuid[]) from public;
revoke all on function public.admin_set_benefit_distribution(uuid, text, uuid[]) from anon;
grant execute on function public.admin_set_benefit_distribution(uuid, text, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Čtení pro admin obrazovku
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

revoke all on function public.admin_list_guaranteed_benefits() from public;
revoke all on function public.admin_list_guaranteed_benefits() from anon;
grant execute on function public.admin_list_guaranteed_benefits() to authenticated;

create or replace function public.admin_get_guaranteed_benefit(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_is_super boolean := public.is_superadmin();
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  return jsonb_build_object(
    'success', true,
    'is_superadmin', v_is_super,
    'benefit', (
      select to_jsonb(t)
      from (
        select o.id as order_id, o.voucher_id, o.voucher_version_id,
               o.status as order_status, o.is_unlimited, o.distribution_scope,
               o.requested_quantity, o.issued_quantity,
               -- Cenová data vidí jen superadmin.
               case when v_is_super then o.unit_price_ex_vat_snapshot end as unit_price_ex_vat_snapshot,
               case when v_is_super then o.vat_rate_percent_snapshot end as vat_rate_percent_snapshot,
               case when v_is_super then o.currency_snapshot end as currency_snapshot,
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

revoke all on function public.admin_get_guaranteed_benefit(uuid) from public;
revoke all on function public.admin_get_guaranteed_benefit(uuid) from anon;
grant execute on function public.admin_get_guaranteed_benefit(uuid) to authenticated;

commit;
