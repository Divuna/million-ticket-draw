-- FÁZE 6 — affiliate provize v Kč (24. 9. 2026)
--
-- Potvrzená pravidla (Pavel):
--   * zákaznická provize = sazba affiliate (dnes 5 %) ze SKUTEČNĚ ZAPLACENÝCH Kč
--     (`payments.paid_amount_czk`), nikdy z `payments.amount` (MIO vč. bonusu),
--   * jen z reálné dokončené placené Stripe platby; first-touch atribuce beze změny,
--   * refundace snižuje provizi ve stejném poměru jako refundované Kč
--     (úplná refundace = celé storno), kumulativně a idempotentně,
--   * firemní provize (5 % ze zaplacené faktury bez DPH) se NEMĚNÍ,
--   * DPH affiliate beze změny (21 % nad základ jen u plátce DPH).
--
-- Co se mění technicky:
--   1) `affiliate_commission_payments` — přesná vazba platba → měsíční provize
--      (snapshot zaplacených Kč a sazby, aktuálně započtená refundace).
--      Měsíční provize zůstává jeden řádek za affiliate a měsíc (payout workflow
--      beze změny), její částka = round(Σ(zaplaceno − refundováno) × sazba, 2).
--   2) `calculate_affiliate_commissions_for_month`: zákaznická větev počítá
--      z čistých zaplacených Kč a zapisuje vazby; firemní větev doslova beze změny.
--   3) Trigger na `payments` (změna stavu / refundované částky) přepočte provizi,
--      do které platba patří (serializace se měsíčním výpočtem přes zámek řádku
--      platby, pořadí zámků platba → provize):
--        - `calculated` a `approved` BEZ výplatního dokladu → částka se upraví,
--        - s vystaveným dokladem (`ready_to_pay`, `in_payment_batch`) nebo
--          `paid` → částka se NEMĚNÍ (doklad je odeslaný, u plátce DPH daňový);
--          refundace se jen eviduje jako nezapočtená (`unapplied_refund_czk`)
--          + audit `affiliate_commission_refund_after_document` → rozhodnutí Pavla.
--
-- Historické platby bez `paid_amount_czk` se nepřepočítávají (testovací data →
-- předstartovní reset). Nevytváří se druhý provizní systém.
--
-- ZÁMĚRNĚ NEDOTČENO: firemní větev, payout doklady/dávky/export, Fáze 5
-- (osobní doporučení), peněženky MIO, Stripe, prepare/finalize/reverse refundace.

begin;

-- ===========================================================================
-- Vazba platba → měsíční zákaznická provize
-- ===========================================================================
create table if not exists public.affiliate_commission_payments (
  id                   uuid primary key default gen_random_uuid(),
  commission_id        uuid not null references public.affiliate_commissions(id) on delete cascade,
  affiliate_id         uuid not null references public.affiliate_accounts(id) on delete cascade,
  payment_id           uuid not null unique references public.payments(id) on delete restrict,
  paid_amount_czk      numeric(12,2) not null check (paid_amount_czk > 0),
  commission_rate      numeric(6,2) not null check (commission_rate >= 0),
  refunded_czk         numeric(12,2) not null default 0,
  unapplied_refund_czk numeric(12,2) not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (refunded_czk >= 0 and refunded_czk <= paid_amount_czk),
  check (refunded_czk + unapplied_refund_czk >= 0 and refunded_czk + unapplied_refund_czk <= paid_amount_czk)
);
comment on table public.affiliate_commission_payments is
  'Přesná vazba zaplacené platby na měsíční zákaznickou affiliate provizi. refunded_czk = refundace započtená do částky provize; unapplied_refund_czk = refundace, kterou nešlo započíst (provize už má výplatní doklad nebo je vyplacená) — čeká na rozhodnutí.';
create index if not exists idx_acp_commission on public.affiliate_commission_payments(commission_id);
create index if not exists idx_acp_affiliate on public.affiliate_commission_payments(affiliate_id);

alter table public.affiliate_commission_payments enable row level security;
drop policy if exists acp_select on public.affiliate_commission_payments;
create policy acp_select on public.affiliate_commission_payments
  for select to authenticated using (
    public.is_superadmin()
    or affiliate_id in (select a.id from public.affiliate_accounts a where a.auth_user_id = auth.uid())
  );
revoke insert, update, delete, truncate on public.affiliate_commission_payments from anon, authenticated;

-- ===========================================================================
-- Čistá zaplacená částka platby pro provizi (interní)
--   completed → celá; refund_pending/refunded → minus refundované Kč;
--   jiný stav (storno, selhání) → 0.
-- ===========================================================================
create or replace function public._affiliate_payment_refunded_czk(p_status text, p_paid numeric, p_refund numeric)
 returns numeric
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when p_status = 'completed' then 0
    when p_status in ('refund_pending', 'refunded') then least(coalesce(p_paid, 0), greatest(coalesce(p_refund, 0), 0))
    else coalesce(p_paid, 0)
  end;
$function$;

-- Částka provize z vazeb: round(Σ(zaplaceno − započtená refundace) × sazba / 100, 2).
create or replace function public._affiliate_commission_recompute(p_commission_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_c     public.affiliate_commissions%rowtype;
  v_base  numeric;
  v_total numeric;
begin
  select * into v_c from public.affiliate_commissions where id = p_commission_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select coalesce(round(sum((l.paid_amount_czk - l.refunded_czk) * l.commission_rate / 100.0), 2), 0)
  into v_base
  from public.affiliate_commission_payments l
  where l.commission_id = p_commission_id;

  v_total := case when coalesce(v_c.vat_rate, 0) > 0
                  then round(v_base * (1 + v_c.vat_rate / 100.0), 2)
                  else v_base end;

  if v_base <> v_c.amount_base_czk or v_total <> v_c.amount_total_czk then
    update public.affiliate_commissions
    set amount_base_czk = v_base, amount_total_czk = v_total, updated_at = now()
    where id = p_commission_id;
  end if;

  return jsonb_build_object('status', 'ok', 'amount_base_czk', v_base, 'amount_total_czk', v_total,
                            'previous_base_czk', v_c.amount_base_czk);
end;
$function$;

-- ===========================================================================
-- Refundace / změna stavu platby → přepočet provize, do které platba patří
-- ===========================================================================
create or replace function public.affiliate_commission_sync_payment(p_payment_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_pay     public.payments%rowtype;
  v_line    public.affiliate_commission_payments%rowtype;
  v_c       public.affiliate_commissions%rowtype;
  v_target  numeric;
  v_res     jsonb;
begin
  -- Zámek platby (v triggeru už ho refundace drží) → pořadí platba → provize.
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found or v_pay.paid_amount_czk is null then
    return jsonb_build_object('status', 'not_applicable');
  end if;

  -- Jen zákazník s affiliate atribucí; ostatní platby nic neobnáší.
  if not exists (select 1 from public.affiliate_customer_refs where user_id = v_pay.user_id) then
    return jsonb_build_object('status', 'no_affiliate');
  end if;

  -- Serializace s měsíčním výpočtem drží zámek řádku platby: refundace ho má
  -- (FOR UPDATE / UPDATE) a měsíční výpočet si platby nejdřív zamkne FOR SHARE.
  -- Oba tak zamykají ve stejném pořadí platba → provize (žádný advisory lock
  -- zde — vedl by k uváznutí proti výpočtu, který čeká na zámek platby).

  select * into v_line from public.affiliate_commission_payments where payment_id = p_payment_id;
  if not found then
    -- Platba zatím v žádné provizi není; měsíční výpočet ji započte z aktuálního stavu.
    return jsonb_build_object('status', 'not_in_commission');
  end if;

  select * into v_c from public.affiliate_commissions where id = v_line.commission_id for update;
  select * into v_line from public.affiliate_commission_payments where id = v_line.id for update;

  v_target := public._affiliate_payment_refunded_czk(v_pay.status, v_pay.paid_amount_czk, v_pay.refund_amount_czk);

  if v_c.status = 'calculated' or (v_c.status = 'approved' and v_c.payout_document_id is null) then
    -- Idempotentní: nastaví se stav, ne přírůstek.
    if v_line.refunded_czk = v_target and v_line.unapplied_refund_czk = 0 then
      return jsonb_build_object('status', 'unchanged', 'commission_id', v_c.id);
    end if;

    update public.affiliate_commission_payments
    set refunded_czk = v_target, unapplied_refund_czk = 0, updated_at = now()
    where id = v_line.id;

    v_res := public._affiliate_commission_recompute(v_c.id);

    insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
    values ('affiliate_commission_adjusted', 'affiliate_commission_integrity', null,
            jsonb_build_object('commission_id', v_c.id, 'affiliate_id', v_c.affiliate_id,
                               'payment_id', p_payment_id, 'payment_status', v_pay.status,
                               'refunded_czk', v_target, 'previous_refunded_czk', v_line.refunded_czk,
                               'commission_status', v_c.status,
                               'amount_base_czk', v_res->'amount_base_czk',
                               'previous_base_czk', v_res->'previous_base_czk'), now());

    return jsonb_build_object('status', 'adjusted', 'commission_id', v_c.id) || v_res;
  end if;

  -- Výplatní doklad je vystavený (ready_to_pay / in_payment_batch) nebo je
  -- provize vyplacená (paid): částka se nemění, refundace se jen eviduje.
  if v_line.unapplied_refund_czk = v_target - v_line.refunded_czk then
    return jsonb_build_object('status', 'unchanged_locked', 'commission_id', v_c.id);
  end if;

  update public.affiliate_commission_payments
  set unapplied_refund_czk = v_target - refunded_czk, updated_at = now()
  where id = v_line.id;

  insert into public.audit_logs (event, event_type, user_id, metadata, created_at)
  values ('affiliate_commission_refund_after_document', 'affiliate_commission_integrity', null,
          jsonb_build_object('commission_id', v_c.id, 'affiliate_id', v_c.affiliate_id,
                             'payment_id', p_payment_id, 'payment_status', v_pay.status,
                             'commission_status', v_c.status,
                             'unapplied_refund_czk', v_target - v_line.refunded_czk,
                             'note', 'Provize má výplatní doklad nebo je vyplacená; částka se nemění, čeká na rozhodnutí.'),
          now());

  return jsonb_build_object('status', 'recorded_unapplied', 'commission_id', v_c.id,
                            'commission_status', v_c.status,
                            'unapplied_refund_czk', v_target - v_line.refunded_czk);
end;
$function$;

create or replace function public.trg_fn_affiliate_commission_payment_sync()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.paid_amount_czk is not null
     and (old.status is distinct from new.status
          or old.refund_amount_czk is distinct from new.refund_amount_czk) then
    perform public.affiliate_commission_sync_payment(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_affiliate_commission_payment_sync on public.payments;
create trigger trg_affiliate_commission_payment_sync
  after update of status, refund_amount_czk on public.payments
  for each row execute function public.trg_fn_affiliate_commission_payment_sync();

-- ===========================================================================
-- Měsíční výpočet: zákaznická větev ze zaplacených Kč + vazby; firemní beze změny
-- ===========================================================================
create or replace function public.calculate_affiliate_commissions_for_month(p_month date)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
DECLARE
  v_month date := date_trunc('month', p_month)::date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('status', 'forbidden');
  END IF;
  IF p_month IS NULL THEN RETURN jsonb_build_object('status', 'invalid_month'); END IF;

  -- FÁZE 6: souběžné výpočty jeden po druhém; a nejdřív zamknout platby měsíce
  -- (FOR SHARE), aby běžící refundace doběhla dřív, než se z nich spočítá částka,
  -- a refundace začatá později počkala na dokončení výpočtu (pořadí platba → provize).
  PERFORM pg_advisory_xact_lock(hashtext('onemil_affiliate_customer_commissions'));
  PERFORM 1
  FROM public.payments pay
  JOIN public.affiliate_customer_refs cr ON cr.user_id = pay.user_id
  WHERE pay.paid_amount_czk IS NOT NULL
    AND date_trunc('month', pay.created_at)::date = v_month
  ORDER BY pay.id
  FOR SHARE OF pay;

  -- Vazby na mazané řádky zmizí kaskádou.
  DELETE FROM public.affiliate_commissions
  WHERE period_month = v_month AND status = 'calculated';

  -- FÁZE 6: zákaznická větev — základ = skutečně zaplacené Kč po refundacích.
  -- Jen nová Stripe dobití (paid_amount_czk); historické platby bez Kč se nepočítají.
  -- Platba, která už je navázaná na jinou (neprepočítávanou) provizi, se nepočítá znovu.
  DROP TABLE IF EXISTS pg_temp.tmp_affiliate_month_payments;
  CREATE TEMP TABLE tmp_affiliate_month_payments ON COMMIT DROP AS
  SELECT cr.affiliate_id AS aid, a.is_vat_payer, a.commission_rate_customer AS rate,
         pay.id AS payment_id, pay.paid_amount_czk AS paid,
         public._affiliate_payment_refunded_czk(pay.status, pay.paid_amount_czk, pay.refund_amount_czk) AS refunded
  FROM public.affiliate_customer_refs cr
  JOIN public.affiliate_accounts a ON a.id = cr.affiliate_id
  JOIN public.payments pay ON pay.user_id = cr.user_id
  WHERE a.status = 'approved'
    AND pay.status IN ('completed', 'refund_pending', 'refunded')
    AND pay.paid_amount_czk IS NOT NULL
    AND pay.paid_amount_czk > 0
    AND pay.stripe_session_id IS NOT NULL
    AND (pay.method IS NULL OR pay.method NOT IN ('bonus','partner','api'))
    AND date_trunc('month', pay.created_at)::date = v_month
    AND NOT EXISTS (SELECT 1 FROM public.affiliate_commission_payments l WHERE l.payment_id = pay.id);

  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    s.aid, 'customer_payments', v_month, s.base,
    CASE WHEN s.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN s.is_vat_payer THEN ROUND(s.base * 1.21, 2) ELSE s.base END,
    'calculated'
  FROM (
    SELECT t.aid, t.is_vat_payer,
      ROUND(SUM((t.paid - t.refunded) * t.rate / 100.0), 2) AS base
    FROM tmp_affiliate_month_payments t
    GROUP BY t.aid, t.is_vat_payer
    HAVING SUM(t.paid - t.refunded) > 0
  ) s
  ON CONFLICT (affiliate_id, commission_type, period_month)
    WHERE period_month IS NOT NULL AND commission_type = 'customer_payments'
  DO NOTHING;

  -- Vazby platba → provize (jen k právě vytvořeným řádkům ve stavu calculated).
  INSERT INTO public.affiliate_commission_payments
    (commission_id, affiliate_id, payment_id, paid_amount_czk, commission_rate, refunded_czk)
  SELECT c.id, t.aid, t.payment_id, t.paid, t.rate, t.refunded
  FROM tmp_affiliate_month_payments t
  JOIN public.affiliate_commissions c
    ON c.affiliate_id = t.aid
   AND c.commission_type = 'customer_payments'
   AND c.period_month = v_month
   AND c.status = 'calculated'
  ON CONFLICT (payment_id) DO NOTHING;

  -- Firemní větev — beze změny.
  INSERT INTO public.affiliate_commissions
    (affiliate_id, commission_type, period_month, source_invoice_id, company_ref_id,
     amount_base_czk, vat_rate, amount_total_czk, status)
  SELECT
    p.referred_by_affiliate_id,
    'company_invoice',
    date_trunc('month', pi.paid_at)::date,
    pi.id,
    cref.id,
    ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2),
    CASE WHEN a.is_vat_payer THEN 21 ELSE 0 END,
    CASE WHEN a.is_vat_payer
         THEN ROUND(ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2) * 1.21, 2)
         ELSE ROUND(pi.amount_ex_vat * (a.commission_rate_company / 100.0), 2) END,
    'calculated'
  FROM public.partner_invoices pi
  JOIN public.partners p           ON p.id = pi.partner_id
  JOIN public.affiliate_accounts a ON a.id = p.referred_by_affiliate_id
  LEFT JOIN public.affiliate_company_refs cref
         ON cref.partner_id   = pi.partner_id
        AND cref.affiliate_id = p.referred_by_affiliate_id
  WHERE p.referred_by_affiliate_id IS NOT NULL
    AND a.status = 'approved'
    AND pi.status = 'paid'
    AND pi.paid_at IS NOT NULL
    AND COALESCE(pi.amount_ex_vat, 0) > 0
    AND date_trunc('month', pi.paid_at)::date <= v_month
  ON CONFLICT (source_invoice_id) WHERE source_invoice_id IS NOT NULL DO NOTHING;

  RETURN jsonb_build_object(
    'status', 'ok', 'period_month', v_month,
    'customer_rows', (SELECT count(*) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_rows',  (SELECT count(*) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated'),
    'customer_total',(SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='customer_payments' AND status='calculated'),
    'company_total', (SELECT COALESCE(SUM(amount_total_czk),0) FROM public.affiliate_commissions WHERE period_month = v_month AND commission_type='company_invoice'  AND status='calculated')
  );
END;
$function$;

-- ===========================================================================
-- Oprávnění (měsíční výpočet ponechává dnešní granty: authenticated s admin
-- guardem uvnitř + service_role pro cron)
-- ===========================================================================
revoke all on function public._affiliate_payment_refunded_czk(text, numeric, numeric) from public, anon, authenticated;
revoke all on function public._affiliate_commission_recompute(uuid) from public, anon, authenticated;
revoke all on function public.affiliate_commission_sync_payment(uuid) from public, anon, authenticated;
grant execute on function public.affiliate_commission_sync_payment(uuid) to service_role;
revoke all on function public.trg_fn_affiliate_commission_payment_sync() from public, anon, authenticated;
revoke all on function public.calculate_affiliate_commissions_for_month(date) from public, anon;
grant execute on function public.calculate_affiliate_commissions_for_month(date) to authenticated, service_role;

commit;
