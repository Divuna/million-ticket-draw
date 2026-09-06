-- ============================================================================
-- TODO #349, bod 3 — jeden e-shop nesmí být aktivně připojený pod dvěma partnery
--
-- Před aktivací Shoptet napojení je potřeba ověřit, že tentýž e-shop (doména)
-- už není aktivně připojený pod JINÝM partnerským účtem. Dosud taková kontrola
-- nikde neexistovala — admin schválil napojení, `promote_shoptet_pending_url`
-- přepsal finální Vault klíč a dva partneři mohli mít současně živý import
-- ze stejného e-shopu (tedy i dvojí odměny z jedné objednávky).
--
-- ⚠️ ZÁVAZNÝ INVARIANT, KTERÝ TATO MIGRACE NEPORUŠUJE:
--   Shoptet exportní URL se NIKDY neukládá do aplikační tabulky, logu ani
--   odpovědi — žije výhradně ve Vaultu. Proto se doména NEUKLÁDÁ do žádného
--   nového sloupce. Funkce níže si ji přečte přímo z Vaultu uvnitř
--   SECURITY DEFINER kontextu, porovná ji a ven vrátí jen identitu kolidujícího
--   partnera. Ani URL, ani hash, ani hostname se z funkce nevrací.
--
-- Rozsah: čistě aditivní. Žádná změna existujících tabulek, dat, odměn,
-- peněženek, plateb ani stávajících Vault RPC.
-- ============================================================================

-- Normalizace hostu pro porovnání: jen hostname, malými písmeny, bez portu
-- a bez vedoucího "www.". Shoptet e-shopy jezdí jako <id>.myshoptet.com nebo
-- na vlastní doméně, obojí tímhle projde stejně.
create or replace function public.shoptet_export_url_host(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    regexp_replace(
      lower(coalesce(substring(p_url from '^[a-z]+://([^/:?#]+)'), '')),
      '^www\.', ''
    ),
    ''
  );
$$;

revoke all on function public.shoptet_export_url_host(text) from public, anon, authenticated;
grant execute on function public.shoptet_export_url_host(text) to service_role;

-- Vrátí informaci, zda e-shop z PENDING URL dané žádosti už aktivně používá
-- jiný partner.
--
-- „Aktivně připojený" = partner má zapnutý import NEBO má napojení ve stavu
-- approved/active. To je stejná definice, jakou používá partnerský dashboard
-- pro zobrazení živého napojení.
--
-- Návratová hodnota (nikdy neobsahuje URL, hash ani hostname):
--   { "checked": true,  "conflict": false }
--   { "checked": true,  "conflict": true, "partner_id": "...", "partner_name": "..." }
--   { "checked": false, "reason": "pending_url_not_found" }   -- promote spadne vzápětí sám
create or replace function public.shoptet_pending_url_conflict(
  p_request_id uuid,
  p_partner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_pending_name text;
  v_pending_url  text;
  v_host         text;
  v_other        record;
begin
  if p_request_id is null or p_partner_id is null then
    raise exception 'request_id and partner_id are required';
  end if;

  v_pending_name := 'shoptet_pending_url_' || replace(p_request_id::text, '-', '');

  select decrypted_secret into v_pending_url
    from vault.decrypted_secrets
   where name = v_pending_name;

  v_host := public.shoptet_export_url_host(v_pending_url);

  -- Bez čitelné pending URL se nedá nic porovnat. Nevracíme chybu — navazující
  -- promote_shoptet_pending_url stejně vzápětí selže s vlastní, přesnější chybou.
  if v_host is null then
    return jsonb_build_object('checked', false, 'reason', 'pending_url_not_found');
  end if;

  select p.id, p.name
    into v_other
    from public.partners p
    join vault.decrypted_secrets s
      on s.name = 'shoptet_export_url_' || replace(p.id::text, '-', '')
   where p.id <> p_partner_id
     and public.shoptet_export_url_host(s.decrypted_secret) = v_host
     and (
       p.shoptet_import_enabled is true
       or exists (
         select 1
           from public.shoptet_connection_requests r
          where r.partner_id = p.id
            and r.status in ('approved', 'active')
       )
     )
   limit 1;

  if not found then
    return jsonb_build_object('checked', true, 'conflict', false);
  end if;

  return jsonb_build_object(
    'checked', true,
    'conflict', true,
    'partner_id', v_other.id,
    'partner_name', v_other.name
  );
end $$;

revoke all on function public.shoptet_pending_url_conflict(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.shoptet_pending_url_conflict(uuid, uuid)
  to service_role;
