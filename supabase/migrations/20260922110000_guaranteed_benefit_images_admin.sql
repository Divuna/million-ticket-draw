-- Garantované benefity — správa obrázků v adminu.
-- Umožní adminovi s guaranteed_benefits.manage nahrávat do stávajícího
-- veřejného bucketu voucher-images a bezpečně nastavit obrázek konkrétního
-- garantovaného benefitu bez změny schválené voucher_versions historie.

begin;

-- Storage write: zachovat vouchers.manage a přidat guaranteed_benefits.manage.
drop policy if exists "voucher_images_admin_insert" on storage.objects;
create policy "voucher_images_admin_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'voucher-images'
  and (
    public.has_admin_permission('vouchers.manage')
    or public.has_admin_permission('guaranteed_benefits.manage')
  )
);

drop policy if exists "voucher_images_admin_update" on storage.objects;
create policy "voucher_images_admin_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'voucher-images'
  and (
    public.has_admin_permission('vouchers.manage')
    or public.has_admin_permission('guaranteed_benefits.manage')
  )
)
with check (
  bucket_id = 'voucher-images'
  and (
    public.has_admin_permission('vouchers.manage')
    or public.has_admin_permission('guaranteed_benefits.manage')
  )
);

drop policy if exists "voucher_images_admin_delete" on storage.objects;
create policy "voucher_images_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'voucher-images'
  and (
    public.has_admin_permission('vouchers.manage')
    or public.has_admin_permission('guaranteed_benefits.manage')
  )
);

create or replace function public.admin_set_guaranteed_benefit_image(
  p_order_id uuid,
  p_image_url text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_actor uuid := auth.uid();
  v_url text := nullif(btrim(coalesce(p_image_url, '')), '');
  v_voucher_id uuid;
  v_old_url text;
begin
  if not public.can_manage_guaranteed_benefits(v_actor) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if p_order_id is null then
    return jsonb_build_object('success', false, 'error', 'order_required');
  end if;

  if v_url is null then
    return jsonb_build_object('success', false, 'error', 'image_url_required');
  end if;

  select o.voucher_id, v.image_url
    into v_voucher_id, v_old_url
  from public.voucher_distribution_orders o
  join public.vouchers v on v.id = o.voucher_id
  where o.id = p_order_id
    and v.distribution_mode = 'guaranteed_purchase_benefit';

  if v_voucher_id is null then
    return jsonb_build_object('success', false, 'error', 'order_not_found');
  end if;

  update public.vouchers
  set image_url = v_url,
      updated_at = now()
  where id = v_voucher_id;

  perform public.log_admin_action(
    'guaranteed_benefit_image_set',
    'distribution_order',
    p_order_id,
    jsonb_build_object('image_url', v_old_url),
    jsonb_build_object('image_url', v_url)
  );

  return jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'voucher_id', v_voucher_id,
    'image_url', v_url
  );
end;
$fn$;

revoke all on function public.admin_set_guaranteed_benefit_image(uuid, text) from public;
revoke all on function public.admin_set_guaranteed_benefit_image(uuid, text) from anon;
grant execute on function public.admin_set_guaranteed_benefit_image(uuid, text) to authenticated;

commit;
