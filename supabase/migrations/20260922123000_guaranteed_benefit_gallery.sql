-- Garantované benefity: galerie obrázků + zákaznický detail.
-- STAGING-first. Přidává pouze prezentační vrstvu; nemění cenu, peněženky,
-- tikety, billing, pořadí benefitů ani historické schválené voucher_versions.

begin;

create table if not exists public.voucher_gallery_images (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete cascade,
  image_url text not null check (length(btrim(image_url)) > 0),
  sort_order integer not null check (sort_order between 0 and 5),
  created_by uuid null,
  created_at timestamptz not null default now(),
  unique (voucher_id, sort_order),
  unique (voucher_id, image_url)
);

create index if not exists idx_voucher_gallery_images_voucher_sort
  on public.voucher_gallery_images(voucher_id, sort_order);

alter table public.voucher_gallery_images enable row level security;

-- Galerie se nečte ani nezapisuje přímo z klienta. Všechno jde přes
-- přesně omezené SECURITY DEFINER RPC níže.
revoke all on table public.voucher_gallery_images from public, anon, authenticated;

create or replace function public.admin_get_guaranteed_benefit_gallery(
  p_order_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_voucher_id uuid;
  v_main_image_url text;
begin
  if not public.can_manage_guaranteed_benefits(v_actor) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select o.voucher_id, v.image_url
    into v_voucher_id, v_main_image_url
  from public.voucher_distribution_orders o
  join public.vouchers v on v.id = o.voucher_id
  where o.id = p_order_id
    and v.distribution_mode = 'guaranteed_purchase_benefit';

  if v_voucher_id is null then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'voucher_id', v_voucher_id,
    'main_image_url', v_main_image_url,
    'images', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', g.id,
          'image_url', g.image_url,
          'sort_order', g.sort_order
        )
        order by g.sort_order
      )
      from public.voucher_gallery_images g
      where g.voucher_id = v_voucher_id
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function public.admin_get_guaranteed_benefit_gallery(uuid) from public, anon;
grant execute on function public.admin_get_guaranteed_benefit_gallery(uuid) to authenticated;

create or replace function public.admin_set_guaranteed_benefit_gallery(
  p_order_id uuid,
  p_image_urls text[]
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_voucher_id uuid;
  v_url text;
  v_clean text[] := array[]::text[];
  v_index integer := 0;
begin
  if not public.can_manage_guaranteed_benefits(v_actor) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  select o.voucher_id
    into v_voucher_id
  from public.voucher_distribution_orders o
  join public.vouchers v on v.id = o.voucher_id
  where o.id = p_order_id
    and v.distribution_mode = 'guaranteed_purchase_benefit';

  if v_voucher_id is null then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  foreach v_url in array coalesce(p_image_urls, array[]::text[]) loop
    v_url := nullif(btrim(v_url), '');
    if v_url is not null and not (v_url = any(v_clean)) then
      v_clean := array_append(v_clean, v_url);
    end if;
  end loop;

  if cardinality(v_clean) > 6 then
    return jsonb_build_object('success', false, 'error', 'gallery_limit_exceeded');
  end if;

  delete from public.voucher_gallery_images
  where voucher_id = v_voucher_id;

  if cardinality(v_clean) > 0 then
    foreach v_url in array v_clean loop
      insert into public.voucher_gallery_images(
        voucher_id, image_url, sort_order, created_by
      )
      values (v_voucher_id, v_url, v_index, v_actor);
      v_index := v_index + 1;
    end loop;
  end if;

  perform public.log_admin_action(
    'guaranteed_benefit_gallery_set',
    'distribution_order',
    p_order_id,
    null,
    jsonb_build_object('image_count', cardinality(v_clean))
  );

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'voucher_id', v_voucher_id,
    'image_count', cardinality(v_clean)
  );
end;
$fn$;

revoke all on function public.admin_set_guaranteed_benefit_gallery(uuid, text[]) from public, anon;
grant execute on function public.admin_set_guaranteed_benefit_gallery(uuid, text[]) to authenticated;

create or replace function public.get_voucher_customer_detail(
  p_voucher_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_user uuid := auth.uid();
  v_voucher record;
  v_version record;
begin
  if v_user is null then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  select * into v_voucher
  from public.vouchers
  where id = p_voucher_id;

  if v_voucher.id is null then
    return jsonb_build_object('success', false, 'error', 'voucher_not_found');
  end if;

  if not coalesce(v_voucher.is_public, false)
     and not exists (
       select 1
       from public.user_vouchers uv
       where uv.user_id = v_user
         and uv.voucher_id = p_voucher_id
     ) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if v_voucher.current_approved_version_id is not null then
    select * into v_version
    from public.voucher_versions
    where id = v_voucher.current_approved_version_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'voucher', jsonb_build_object(
      'id', v_voucher.id,
      'name', v_voucher.name,
      'image_url', coalesce(nullif(btrim(v_voucher.image_url), ''), v_version.image_url),
      'banner_url', v_voucher.banner_url,
      'short_description', coalesce(
        nullif(btrim(v_voucher.short_description), ''),
        nullif(btrim(v_version.short_description), '')
      ),
      'usage_description', coalesce(
        nullif(btrim(v_voucher.usage_description), ''),
        nullif(btrim(v_version.usage_description), '')
      ),
      'terms_text', coalesce(
        nullif(btrim(v_voucher.terms_text), ''),
        nullif(btrim(v_version.terms_text), '')
      ),
      'how_to_use_text', coalesce(
        nullif(btrim(v_voucher.how_to_use_text), ''),
        nullif(btrim(v_version.how_to_use_text), '')
      ),
      'gallery_images', coalesce((
        select jsonb_agg(g.image_url order by g.sort_order)
        from public.voucher_gallery_images g
        where g.voucher_id = v_voucher.id
      ), '[]'::jsonb)
    )
  );
end;
$fn$;

revoke all on function public.get_voucher_customer_detail(uuid) from public, anon;
grant execute on function public.get_voucher_customer_detail(uuid) to authenticated;

commit;
