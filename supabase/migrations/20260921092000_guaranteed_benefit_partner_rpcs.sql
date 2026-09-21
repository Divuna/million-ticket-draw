-- Garantované nákupní benefity — admin-only base, část 3/4: RPC pro firmu.
--
-- Všechny citlivé zápisy jdou výhradně přes tyto SECURITY DEFINER funkce.
-- Frontend nikdy nezapisuje přímo do public.partners.
--
-- Gate: superadmin NEBO admin s výslovným oprávněním guaranteed_benefits.manage.
-- Tato role NESMÍ spravovat běžné partnery ani cenová/payout/Shoptet/affiliate
-- nastavení — whitelist sloupců je vynucen v admin_update_benefit_partner.

begin;

-- ---------------------------------------------------------------------------
-- Gate helper
-- ---------------------------------------------------------------------------
create or replace function public.can_manage_guaranteed_benefits(
  check_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  select check_user_id is not null
     and (
       public.is_superadmin(check_user_id)
       or public.has_admin_permission('guaranteed_benefits.manage', check_user_id)
     );
$fn$;

revoke all on function public.can_manage_guaranteed_benefits(uuid) from public;
revoke all on function public.can_manage_guaranteed_benefits(uuid) from anon;
grant execute on function public.can_manage_guaranteed_benefits(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Vyhledání existující firmy
-- ---------------------------------------------------------------------------
create or replace function public.admin_search_benefit_partners(p_query text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  return jsonb_build_object(
    'success', true,
    'partners', coalesce((
      select jsonb_agg(to_jsonb(t))
      from (
        select p.id,
               p.name,
               p.company_name,
               p.ico,
               p.website_url,
               p.contact_email::text as contact_email,
               p.benefit_only_record,
               p.status::text as status,
               (p.auth_user_id is not null) as has_login
        from public.partners p
        where v_q is null
           or p.name ilike '%' || v_q || '%'
           or coalesce(p.company_name, '') ilike '%' || v_q || '%'
           or coalesce(p.ico, '') ilike '%' || v_q || '%'
           or coalesce(p.website_url, '') ilike '%' || v_q || '%'
           or coalesce(p.contact_email::text, '') ilike '%' || v_q || '%'
        order by p.benefit_only_record asc, p.name asc
        limit 50
      ) t
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.admin_search_benefit_partners(text) from public;
revoke all on function public.admin_search_benefit_partners(text) from anon;
grant execute on function public.admin_search_benefit_partners(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Deduplikace: IČO -> doména -> kontaktní e-mail -> fuzzy název (jen návrh)
-- ---------------------------------------------------------------------------
create or replace function public.admin_match_benefit_partner(
  p_ico           text default null,
  p_website_url   text default null,
  p_contact_email text default null,
  p_name          text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_ico    text := nullif(regexp_replace(coalesce(p_ico, ''), '[^0-9A-Za-z]', '', 'g'), '');
  v_domain text := case
                     when nullif(btrim(coalesce(p_website_url, '')), '') is null then null
                     else public.sales_lead_normalize_domain(p_website_url)
                   end;
  v_email  text := nullif(lower(btrim(coalesce(p_contact_email, ''))), '');
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
  v_id     uuid;
  v_by     text;
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  -- 1) IČO
  if v_ico is not null then
    select p.id into v_id
    from public.partners p
    where nullif(regexp_replace(coalesce(p.ico, ''), '[^0-9A-Za-z]', '', 'g'), '') = v_ico
    order by p.created_at asc
    limit 1;
    if v_id is not null then
      v_by := 'ico';
    end if;
  end if;

  -- 2) Doména webu
  if v_id is null and v_domain is not null then
    select p.id into v_id
    from public.partners p
    where public.sales_lead_normalize_domain(p.website_url) = v_domain
    order by p.created_at asc
    limit 1;
    if v_id is not null then
      v_by := 'website_domain';
    end if;
  end if;

  -- 3) Kontaktní e-mail
  if v_id is null and v_email is not null then
    select p.id into v_id
    from public.partners p
    where lower(btrim(coalesce(p.contact_email::text, ''))) = v_email
    order by p.created_at asc
    limit 1;
    if v_id is not null then
      v_by := 'contact_email';
    end if;
  end if;

  return jsonb_build_object(
    'success', true,
    'matched_by', v_by,
    'match', (
      select to_jsonb(t)
      from (
        select p.id, p.name, p.company_name, p.ico, p.website_url,
               p.contact_email::text as contact_email,
               p.benefit_only_record, p.status::text as status,
               (p.auth_user_id is not null) as has_login
        from public.partners p
        where v_id is not null and p.id = v_id
      ) t
    ),
    -- 4) Fuzzy shoda názvu: pouze návrh k potvrzení, nikdy automatické sloučení.
    'name_candidates', case
      when v_id is not null or v_name is null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(to_jsonb(t))
        from (
          select p.id, p.name, p.company_name, p.ico, p.website_url,
                 p.benefit_only_record
          from public.partners p
          where lower(btrim(p.name)) like '%' || lower(v_name) || '%'
             or lower(v_name) like '%' || lower(btrim(p.name)) || '%'
             or lower(btrim(coalesce(p.company_name, ''))) like '%' || lower(v_name) || '%'
          order by p.name asc
          limit 10
        ) t
      ), '[]'::jsonb)
    end
  );
end;
$fn$;

revoke all on function public.admin_match_benefit_partner(text, text, text, text) from public;
revoke all on function public.admin_match_benefit_partner(text, text, text, text) from anon;
grant execute on function public.admin_match_benefit_partner(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Find-or-create minimální evidenční firmy
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_benefit_partner(
  p_name                  text,
  p_company_name          text default null,
  p_website_url           text default null,
  p_logo_url              text default null,
  p_contact_email         text default null,
  p_contact_phone         text default null,
  p_ico                   text default null,
  p_dic                   text default null,
  p_billing_street        text default null,
  p_billing_city          text default null,
  p_billing_zip           text default null,
  p_billing_country       text default 'CZ',
  p_confirm_name_mismatch boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_match jsonb;
  v_id    uuid;
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;
  if v_name is null then
    return jsonb_build_object('success', false, 'error', 'name_required');
  end if;

  -- Deterministická deduplikace: nikdy nevytvářet duplicitu.
  v_match := public.admin_match_benefit_partner(p_ico, p_website_url, p_contact_email, v_name);

  if jsonb_typeof(coalesce(v_match->'match', 'null'::jsonb)) = 'object' then
    return jsonb_build_object(
      'success', true,
      'was_created', false,
      'partner_id', (v_match->'match'->>'id')::uuid,
      'matched_by', v_match->>'matched_by',
      'partner', v_match->'match'
    );
  end if;

  -- Nejasná shoda podle názvu se pouze nabídne adminovi k potvrzení.
  if not coalesce(p_confirm_name_mismatch, false)
     and jsonb_array_length(coalesce(v_match->'name_candidates', '[]'::jsonb)) > 0 then
    return jsonb_build_object(
      'success', false,
      'error', 'name_match_needs_confirmation',
      'was_created', false,
      'name_candidates', v_match->'name_candidates'
    );
  end if;

  insert into public.partners (
    name, company_name, logo_url, website_url,
    contact_email, contact_phone, ico, dic,
    billing_street, billing_city, billing_zip, billing_country,
    benefit_only_record, created_for
  ) values (
    v_name,
    nullif(btrim(coalesce(p_company_name, '')), ''),
    coalesce(nullif(btrim(coalesce(p_logo_url, '')), ''), ''),
    coalesce(nullif(btrim(coalesce(p_website_url, '')), ''), ''),
    nullif(btrim(coalesce(p_contact_email, '')), '')::citext,
    nullif(btrim(coalesce(p_contact_phone, '')), ''),
    nullif(btrim(coalesce(p_ico, '')), ''),
    nullif(btrim(coalesce(p_dic, '')), ''),
    nullif(btrim(coalesce(p_billing_street, '')), ''),
    nullif(btrim(coalesce(p_billing_city, '')), ''),
    nullif(btrim(coalesce(p_billing_zip, '')), ''),
    coalesce(nullif(btrim(coalesce(p_billing_country, '')), ''), 'CZ'),
    true,
    'guaranteed_benefit'
  )
  returning id into v_id;

  perform public.log_admin_action(
    'benefit_partner_created',
    'partner',
    v_id,
    null,
    jsonb_build_object('name', v_name, 'benefit_only_record', true)
  );

  return jsonb_build_object(
    'success', true,
    'was_created', true,
    'partner_id', v_id,
    'matched_by', null,
    'partner', (
      select to_jsonb(t)
      from (
        select p.id, p.name, p.company_name, p.ico, p.website_url,
               p.contact_email::text as contact_email,
               p.benefit_only_record, p.status::text as status,
               (p.auth_user_id is not null) as has_login
        from public.partners p where p.id = v_id
      ) t
    )
  );
end;
$fn$;

revoke all on function public.admin_create_benefit_partner(text, text, text, text, text, text, text, text, text, text, text, text, boolean) from public;
revoke all on function public.admin_create_benefit_partner(text, text, text, text, text, text, text, text, text, text, text, text, boolean) from anon;
grant execute on function public.admin_create_benefit_partner(text, text, text, text, text, text, text, text, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Editace evidenční firmy — pouze benefit_only_record = true, pouze whitelist
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_benefit_partner(
  p_partner_id      uuid,
  p_name            text default null,
  p_company_name    text default null,
  p_website_url     text default null,
  p_logo_url        text default null,
  p_contact_email   text default null,
  p_contact_phone   text default null,
  p_ico             text default null,
  p_dic             text default null,
  p_billing_street  text default null,
  p_billing_city    text default null,
  p_billing_zip     text default null,
  p_billing_country text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_benefit_only boolean;
begin
  if not public.can_manage_guaranteed_benefits() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select benefit_only_record into v_benefit_only
  from public.partners where id = p_partner_id;

  if v_benefit_only is null then
    return jsonb_build_object('success', false, 'error', 'partner_not_found');
  end if;

  -- Běžného partnera tato role spravovat nesmí.
  if v_benefit_only = false then
    return jsonb_build_object('success', false, 'error', 'not_a_benefit_only_partner');
  end if;

  -- Whitelist sloupců. Nikdy se nedotýkáme auth_user_id, status, cen,
  -- payoutů, Shoptetu, affiliate atribuce ani veřejného ref kódu.
  update public.partners set
    name            = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
    company_name    = coalesce(nullif(btrim(coalesce(p_company_name, '')), ''), company_name),
    website_url     = coalesce(nullif(btrim(coalesce(p_website_url, '')), ''), website_url),
    logo_url        = coalesce(nullif(btrim(coalesce(p_logo_url, '')), ''), logo_url),
    contact_email   = coalesce(nullif(btrim(coalesce(p_contact_email, '')), '')::citext, contact_email),
    contact_phone   = coalesce(nullif(btrim(coalesce(p_contact_phone, '')), ''), contact_phone),
    ico             = coalesce(nullif(btrim(coalesce(p_ico, '')), ''), ico),
    dic             = coalesce(nullif(btrim(coalesce(p_dic, '')), ''), dic),
    billing_street  = coalesce(nullif(btrim(coalesce(p_billing_street, '')), ''), billing_street),
    billing_city    = coalesce(nullif(btrim(coalesce(p_billing_city, '')), ''), billing_city),
    billing_zip     = coalesce(nullif(btrim(coalesce(p_billing_zip, '')), ''), billing_zip),
    billing_country = coalesce(nullif(btrim(coalesce(p_billing_country, '')), ''), billing_country),
    updated_at      = now()
  where id = p_partner_id;

  perform public.log_admin_action(
    'benefit_partner_updated', 'partner', p_partner_id, null,
    jsonb_build_object('scope', 'benefit_only')
  );

  return jsonb_build_object('success', true, 'partner_id', p_partner_id);
end;
$fn$;

revoke all on function public.admin_update_benefit_partner(uuid, text, text, text, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.admin_update_benefit_partner(uuid, text, text, text, text, text, text, text, text, text, text, text, text) from anon;
grant execute on function public.admin_update_benefit_partner(uuid, text, text, text, text, text, text, text, text, text, text, text, text) to authenticated;

commit;
