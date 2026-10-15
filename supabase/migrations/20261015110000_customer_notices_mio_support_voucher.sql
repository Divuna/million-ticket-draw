-- Zákaznická upozornění z redesignu (deska „Ikona, notifikace a e-maily“):
--   * push „MIO připsány“ + e-mail „Platba přijata“ po úspěšném dobití (payments, method='stripe'),
--   * push „Nová zpráva od podpory“ po odpovědi admina (messages.sender='admin'),
--   * e-mail „Voucher je tvůj“ s kódem po získání voucheru (user_vouchers).
--
-- Každé upozornění má vlastní vypínač v public.settings; VÝCHOZÍ STAV JE VYPNUTO ('false').
-- Zapíná se v administraci (Notifikace → Automatická upozornění) nebo přímo v settings.
--
-- Bezpečnost: všechny spouštěče jsou AFTER a celé tělo je v bloku EXCEPTION – chyba
-- upozornění nikdy nezastaví platbu, připsání MIO, zprávu ani nákup voucheru.
-- Push jde existující cestou notifications → push_log → OneSignal (nic nového se neposílá jinudy).
-- E-mail jde do email_queue jako strukturovaný JSON (om_template v1); vzhled vykreslí
-- process-email-queue sdílenou šablonou. Číslo tiketu se nikde neuvádí.

insert into public.settings (key, value)
values
  ('notice_push_mio_credited', 'false'),
  ('notice_email_payment_received', 'false'),
  ('notice_push_support_reply', 'false'),
  ('notice_email_voucher_code', 'false')
on conflict (key) do nothing;

create or replace function public._customer_notice_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.value from public.settings s where s.key = p_key), 'false') = 'true';
$$;

revoke all on function public._customer_notice_enabled(text) from public, anon, authenticated;

create or replace function public._customer_notice_fmt_mio(p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then '0'
    when p_value = trunc(p_value) then to_char(p_value, 'FM999999999990')
    else replace(to_char(round(p_value, 1), 'FM999999999990.0'), '.', ',')
  end;
$$;

revoke all on function public._customer_notice_fmt_mio(numeric) from public, anon, authenticated;

-- ── Platba: push „MIO připsány“ + e-mail „Platba přijata“ ────────────────────────
create or replace function public.trg_fn_payment_customer_notices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_mio text;
  v_body jsonb;
  v_rows jsonb;
begin
  begin
    if new.status is distinct from 'completed' or new.method is distinct from 'stripe' or new.user_id is null then
      return new;
    end if;
    if tg_op = 'UPDATE' and old.status = 'completed' then
      return new;
    end if;

    v_mio := public._customer_notice_fmt_mio(coalesce(new.amount, 0));
    v_rows := jsonb_build_array(jsonb_build_object('label', 'Balíček', 'value',
      case
        when new.base_mio is not null and coalesce(new.bonus_mio, 0) > 0
          then public._customer_notice_fmt_mio(new.base_mio) || ' MIO + ' || public._customer_notice_fmt_mio(new.bonus_mio) || ' bonus'
        else v_mio || ' MIO'
      end));
    if new.paid_amount_czk is not null then
      v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'Zaplaceno', 'value',
        replace(to_char(new.paid_amount_czk, 'FM999999990.00'), '.', ',') || ' Kč'));
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object('label', 'ID platby', 'value', left(new.id::text, 8)));

    if public._customer_notice_enabled('notice_push_mio_credited') then
      insert into public.notifications (user_id, type, title, message)
      values (new.user_id, 'mio_credited', 'MIO připsány',
              'Na účet ti přibylo ' || v_mio || ' MIO. Hodně štěstí!');
    end if;

    if public._customer_notice_enabled('notice_email_payment_received') then
      select u.email into v_email from auth.users u where u.id = new.user_id;
      if v_email is not null and not exists (
        select 1 from public.email_queue q where q.dedupe_key = 'payment_received:' || new.id::text
      ) then
        v_body := jsonb_build_object(
          'om_template', 'v1',
          'eyebrow', 'Platba přijata',
          'title', '+' || v_mio || ' MIO je tvých',
          'preheader', 'Platba proběhla a MIO jsou na účtu.',
          'greeting', 'Dobrý den,',
          'paragraphs', jsonb_build_array('děkujeme za dobití. Shrnutí platby:'),
          'rows', v_rows,
          'action', jsonb_build_object('label', 'Otevřít OneMil', 'url', 'https://onemil.cz/profile'),
          'footer_note', 'MIO jsou vnitřní kredit OneMil a nelze je vybrat jako peníze.'
        );
        insert into public.email_queue (email, subject, body, status, dedupe_key)
        values (v_email, 'Platba přijata – ' || v_mio || ' MIO je na účtu', v_body::text, 'pending',
                'payment_received:' || new.id::text);
      end if;
    end if;
  exception when others then
    raise log 'trg_fn_payment_customer_notices failed (payment_id=%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.trg_fn_payment_customer_notices() from public, anon, authenticated;

-- Jméno „zz“: AFTER spouštěče běží abecedně, tenhle až po připsání MIO a odměnách.
drop trigger if exists trg_zz_payment_customer_notices on public.payments;
create trigger trg_zz_payment_customer_notices
  after insert or update of status on public.payments
  for each row execute function public.trg_fn_payment_customer_notices();

-- ── Zprávy: push „Nová zpráva od podpory“ ────────────────────────────────────────
create or replace function public.trg_fn_support_reply_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.sender is distinct from 'admin' or new.user_id is null then
      return new;
    end if;
    if not public._customer_notice_enabled('notice_push_support_reply') then
      return new;
    end if;
    -- Víc odpovědí za sebou = jedno upozornění (max. 1 za 10 minut).
    if exists (
      select 1 from public.notifications n
      where n.user_id = new.user_id and n.type = 'support_reply'
        and n.created_at > now() - interval '10 minutes'
    ) then
      return new;
    end if;
    insert into public.notifications (user_id, type, title, message)
    values (new.user_id, 'support_reply', 'Nová zpráva od podpory',
            'Podpora OneMil ti odpověděla ve Zprávách.');
  exception when others then
    raise log 'trg_fn_support_reply_notice failed (message_id=%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.trg_fn_support_reply_notice() from public, anon, authenticated;

drop trigger if exists trg_zz_support_reply_notice on public.messages;
create trigger trg_zz_support_reply_notice
  after insert on public.messages
  for each row execute function public.trg_fn_support_reply_notice();

-- ── Voucher: e-mail s kódem ─────────────────────────────────────────────────────
-- Odložený (DEFERRABLE INITIALLY DEFERRED) spouštěč běží až při potvrzení transakce,
-- kdy už existuje i záznam o vydání (voucher_issuances) z nákupu se soutěžním tiketem.
create or replace function public.trg_fn_voucher_code_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_code text;
  v_voucher_name text;
  v_partner_name text;
  v_body jsonb;
begin
  begin
    if new.user_id is null or not public._customer_notice_enabled('notice_email_voucher_code') then
      return new;
    end if;
    if exists (select 1 from public.email_queue q where q.dedupe_key = 'voucher_code:' || new.id::text) then
      return new;
    end if;

    -- Aktuální stav řádku (kód mohl být doplněn až po vložení, ve stejné transakci).
    select vc.code into v_code
    from public.user_vouchers uv
    join public.voucher_codes vc on vc.id = uv.voucher_code_id
    where uv.id = new.id;

    if v_code is null then
      -- Neomezený benefit: sdílený kód z verze, ze které byl voucher vydán.
      select nullif(btrim(vv.shared_code_or_url), ''), vv.name
        into v_code, v_voucher_name
      from public.voucher_issuances vi
      join public.voucher_versions vv on vv.id = vi.voucher_version_id
      where vi.user_voucher_id = new.id
      limit 1;
    end if;

    if v_code is null then
      return new;  -- bez kódu nemá e-mail smysl
    end if;

    select coalesce(v_voucher_name, v.name), p.name
      into v_voucher_name, v_partner_name
    from public.vouchers v
    left join public.partners p on p.id = v.partner_id
    where v.id = new.voucher_id;

    select u.email into v_email from auth.users u where u.id = new.user_id;
    if v_email is null then
      return new;
    end if;

    v_body := jsonb_build_object(
      'om_template', 'v1',
      'eyebrow', 'Tvůj voucher',
      'title', 'Voucher je tvůj',
      'preheader', coalesce(v_voucher_name, 'Voucher') || coalesce(' od ' || v_partner_name, ''),
      'greeting', 'Dobrý den,',
      'paragraphs', jsonb_build_array(
        coalesce(v_voucher_name, 'Voucher') || coalesce(' od ' || v_partner_name, '') || '.',
        'Tady je kód tvého voucheru. Zadej ho při nákupu u partnera. Najdeš ho také v aplikaci ve Voucherech → Zakoupené.'
      ),
      'code', jsonb_build_object('label', 'Kód voucheru', 'value', v_code),
      'action', jsonb_build_object('label', 'Zobrazit v aplikaci', 'url', 'https://onemil.cz/vouchers')
    );
    insert into public.email_queue (email, subject, body, status, dedupe_key)
    values (v_email, 'Tvůj voucher ' || coalesce(v_voucher_name, 'OneMil'), v_body::text, 'pending',
            'voucher_code:' || new.id::text);
  exception when others then
    raise log 'trg_fn_voucher_code_email failed (user_voucher_id=%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.trg_fn_voucher_code_email() from public, anon, authenticated;

drop trigger if exists trg_zz_voucher_code_email on public.user_vouchers;
create constraint trigger trg_zz_voucher_code_email
  after insert on public.user_vouchers
  deferrable initially deferred
  for each row execute function public.trg_fn_voucher_code_email();
