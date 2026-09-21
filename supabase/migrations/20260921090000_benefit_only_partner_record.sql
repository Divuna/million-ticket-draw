-- Garantované nákupní benefity — admin-only base, část 1/3: minimální evidenční firma.
--
-- Aditivní. Defaulty reprodukují dnešní chování: každý existující řádek
-- public.partners zůstává benefit_only_record = false a guard se ho nedotkne.
--
-- Pravidlo (neměnit): firma založená pouze pro garantovaný benefit NESMÍ získat
-- auth účet, partnerské přihlášení, API klíče, Shoptet/API integraci, affiliate
-- atribuci, payout oprávnění ani jiná partnerská práva.

begin;

alter table public.partners
  add column if not exists benefit_only_record boolean not null default false;

alter table public.partners
  add column if not exists created_for text;

comment on column public.partners.benefit_only_record is
  'True = evidenční firma založená pouze pro garantované nákupní benefity. Nikdy nezíská login, API klíče, integrace, payouty ani affiliate práva.';

comment on column public.partners.created_for is
  'Původ záznamu (např. guaranteed_benefit). Pouze auditní stopa.';

create index if not exists idx_partners_benefit_only_record
  on public.partners (benefit_only_record)
  where benefit_only_record = true;

-- Guard: drží invariant I8. Spouští se pouze pro benefit_only_record = true,
-- takže běžné partnery (registrace, Shoptet cron, affiliate) neovlivňuje.
create or replace function public.guard_benefit_only_partner()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if coalesce(new.benefit_only_record, false) = false then
    return new;
  end if;

  if new.auth_user_id is not null then
    raise exception 'Evidenční firma pro garantovaný benefit nesmí mít partnerský účet (auth_user_id).'
      using errcode = 'check_violation';
  end if;

  if new.status = 'approved'::partner_status then
    raise exception 'Evidenční firma pro garantovaný benefit nesmí být schválený partner.'
      using errcode = 'check_violation';
  end if;

  if coalesce(new.shoptet_import_enabled, false) then
    raise exception 'Evidenční firma pro garantovaný benefit nesmí mít Shoptet import.'
      using errcode = 'check_violation';
  end if;

  if new.shoptet_export_secret_name is not null then
    raise exception 'Evidenční firma pro garantovaný benefit nesmí mít Shoptet export secret.'
      using errcode = 'check_violation';
  end if;

  if coalesce(new.payout_ready, false)
     or new.payout_account is not null
     or new.payout_bank is not null then
    raise exception 'Evidenční firma pro garantovaný benefit nesmí mít payout nastavení.'
      using errcode = 'check_violation';
  end if;

  if new.referred_by_affiliate_id is not null then
    raise exception 'Evidenční firma pro garantovaný benefit nesmí mít affiliate atribuci.'
      using errcode = 'check_violation';
  end if;

  if new.public_ref_code is not null then
    raise exception 'Evidenční firma pro garantovaný benefit nesmí mít veřejný ref kód.'
      using errcode = 'check_violation';
  end if;

  if new.terms_accepted_at is not null then
    raise exception 'Evidenční firma pro garantovaný benefit nepodepisuje partnerské podmínky v aplikaci.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_guard_benefit_only_partner on public.partners;
create trigger trg_guard_benefit_only_partner
before insert or update on public.partners
for each row execute function public.guard_benefit_only_partner();

-- Druhá vrstva: evidenční firma nesmí získat API klíč ani omylem.
create or replace function public.guard_benefit_only_partner_api_key()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $fn$
begin
  if exists (
    select 1 from public.partners p
    where p.id = new.partner_id
      and p.benefit_only_record = true
  ) then
    raise exception 'Evidenční firma pro garantovaný benefit nesmí mít API klíč.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_guard_benefit_only_partner_api_key on public.partner_api_keys;
create trigger trg_guard_benefit_only_partner_api_key
before insert or update on public.partner_api_keys
for each row execute function public.guard_benefit_only_partner_api_key();

commit;
