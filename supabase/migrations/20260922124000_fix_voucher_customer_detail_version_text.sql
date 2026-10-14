-- Oprava zákaznického detailu voucheru:
-- prezentační text garantovaného benefitu je autoritativně ve voucher_versions.
-- Legacy vouchers tabulka tyto sloupce nemá ve všech prostředích.

begin;

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
      'short_description', nullif(btrim(v_version.short_description), ''),
      'usage_description', nullif(btrim(v_version.usage_description), ''),
      'terms_text', nullif(btrim(v_version.terms_text), ''),
      'how_to_use_text', nullif(btrim(v_version.how_to_use_text), ''),
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
