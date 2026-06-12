-- ====================================================================
-- Partner Invoice — automatický PDF + e-mail hook při vzniku faktury
-- Fix krok 3 (12. 06. 2026)
--
-- Vzor: stejný jako existující produkční pipeline pg_cron -> net.http_post
-- s hlavičkou x-internal-token (joby 23/24). EF generate-partner-invoice-pdf
-- nově přijímá: x-internal-token | service-role bearer | admin JWT.
--
-- Nové funkce:
--   * request_partner_invoice_pdf(p_invoice_id) — BEST-EFFORT požadavek na
--     vygenerování PDF přes pg_net. Token + URL čte z Vault secrets
--     'internal_function_token' a 'edge_functions_url'. Pokud chybí pg_net,
--     secrets nebo cokoliv selže -> tiše RETURN. NIKDY neshodí fakturaci.
--     (Staging nemá pg_net -> hook je no-op; PDF tam generuje admin/test
--     přes JWT. Produkce má pg_net; aktivace = nastavení 2 Vault secrets.)
--   * partner_invoice_post_create(p_invoice_id) — společný post-create hook:
--     enqueue e-mail (1-arg overload z 20260612093000) + request PDF,
--     každý krok v ochranném EXCEPTION bloku.
--
-- Úprava fakturačních funkcí (kopie produkčních definic z
-- 20260208180630_.sql, změna pouze v post-create hooku):
--   * create_partner_invoices_for_last_week — volání
--     enqueue_partner_invoice_email(v_invoice_id) nahrazeno
--     partner_invoice_post_create(v_invoice_id)
--   * create_partner_invoices_for_period — hook DOPLNĚN (dosud žádný e-mail
--     ani PDF nevolala)
--
-- Žádný zásah do process-email-queue ani affiliate payouts.
-- NEAPLIKOVÁNO — čeká na výslovné schválení Pavla (staging first).
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. request_partner_invoice_pdf — best-effort EF call přes pg_net
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_partner_invoice_pdf(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_token text;
  v_base_url text;
BEGIN
  -- pg_net nemusí existovat (staging) -> no-op
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_token
      FROM vault.decrypted_secrets WHERE name = 'internal_function_token';
    SELECT decrypted_secret INTO v_base_url
      FROM vault.decrypted_secrets WHERE name = 'edge_functions_url';
  EXCEPTION WHEN OTHERS THEN
    RETURN; -- vault nedostupný -> no-op
  END;

  IF v_token IS NULL OR v_base_url IS NULL THEN
    RETURN; -- secrets nenastaveny -> no-op
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_base_url || '/generate-partner-invoice-pdf',
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'x-internal-token', v_token
      ),
      body    := jsonb_build_object('invoice_id', p_invoice_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN; -- http chyba nesmí shodit fakturaci
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.request_partner_invoice_pdf(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_partner_invoice_pdf(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_partner_invoice_pdf(uuid) FROM authenticated;

-- --------------------------------------------------------------------
-- 2. partner_invoice_post_create — společný hook (e-mail + PDF)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_invoice_post_create(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  BEGIN
    PERFORM public.enqueue_partner_invoice_email(p_invoice_id);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- e-mail enqueue nesmí shodit fakturaci
  END;

  BEGIN
    PERFORM public.request_partner_invoice_pdf(p_invoice_id);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- PDF request nesmí shodit fakturaci
  END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.partner_invoice_post_create(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partner_invoice_post_create(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.partner_invoice_post_create(uuid) FROM authenticated;

-- --------------------------------------------------------------------
-- 3. create_partner_invoices_for_last_week — hook místo přímého enqueue
--    (jinak identická s produkční verzí z 20260208180630_.sql)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partner_invoices_for_last_week()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_period_start date;
  v_period_end   date;
  v_partner      record;
  v_invoice_id   uuid;
  v_coins_total  numeric;
  v_amount_net   numeric;
  v_vat_amount   numeric;
  v_amount_gross numeric;
  v_invoice_number text;
  v_variable_symbol text;
  v_issue_date   date;
  v_due_date     date;
  v_taxable_date date;
  v_existing_id  uuid;
BEGIN
  v_period_start := (date_trunc('week', now())::date) - 7;
  v_period_end   := (date_trunc('week', now())::date) - 1;

  v_issue_date   := date_trunc('week', now())::date;
  v_due_date     := v_issue_date + 7;
  v_taxable_date := v_period_end;

  FOR v_partner IN
    SELECT *
    FROM public.partners
    WHERE status = 'approved'
      AND approved_at IS NOT NULL
      AND suspended_at IS NULL
      AND rejected_at IS NULL
  LOOP
    SELECT id INTO v_existing_id
    FROM public.partner_invoices
    WHERE partner_id = v_partner.id
      AND (
        (period_start = v_period_start AND period_end = v_period_end)
        OR
        (period_from = v_period_start AND period_to = v_period_end)
        OR
        (period_from = v_period_start AND period_to = v_period_end + 1)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(coins), 0)
      INTO v_coins_total
      FROM public.partner_coin_activations
     WHERE partner_id = v_partner.id
       AND invoiced = false
       AND activated_at >= v_period_start
       AND activated_at <  (v_period_end + 1);

    IF v_coins_total = 0 THEN
      CONTINUE;
    END IF;

    v_amount_net   := v_coins_total * v_partner.price_per_coin;
    v_vat_amount   := v_amount_net * (v_partner.vat_rate / 100);
    v_amount_gross := v_amount_net + v_vat_amount;

    SELECT gin.invoice_number, gin.variable_symbol
      INTO v_invoice_number, v_variable_symbol
    FROM public.generate_invoice_number(v_issue_date) gin;

    INSERT INTO public.partner_invoices (
      partner_id,
      period_start,
      period_end,
      period_from,
      period_to,
      invoice_number,
      variable_symbol,
      issue_date,
      due_date,
      taxable_date,
      coins_total,
      coins_activated,
      amount_net,
      amount_ex_vat,
      vat_rate,
      vat_amount,
      amount_gross,
      amount_inc_vat,
      status,
      created_at
    )
    VALUES (
      v_partner.id,
      v_period_start,
      v_period_end,
      v_period_start,
      v_period_end,
      v_invoice_number,
      v_variable_symbol,
      v_issue_date,
      v_due_date,
      v_taxable_date,
      v_coins_total,
      v_coins_total,
      v_amount_net,
      v_amount_net,
      v_partner.vat_rate,
      v_vat_amount,
      v_amount_gross,
      v_amount_gross,
      'draft',
      now()
    )
    RETURNING id INTO v_invoice_id;

    UPDATE public.partner_coin_activations
       SET invoiced = true
     WHERE partner_id = v_partner.id
       AND invoiced = false
       AND activated_at >= v_period_start
       AND activated_at <  (v_period_end + 1);

    -- Post-create hook: e-mail do fronty + best-effort PDF request
    PERFORM public.partner_invoice_post_create(v_invoice_id);
  END LOOP;
END;
$function$;

-- --------------------------------------------------------------------
-- 4. create_partner_invoices_for_period — hook DOPLNĚN
--    (jinak identická s produkční verzí z 20260208180630_.sql)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partner_invoices_for_period(p_period_from date, p_period_to date)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_partner record;
  v_coins numeric;
  v_invoice_id uuid;
  v_invoice_number text;
  v_variable_symbol text;
  v_issue_date date;
  v_due_date date;
  v_taxable_date date;
  v_existing_id uuid;
BEGIN
  v_issue_date := current_date;
  v_due_date := (current_date + 14);
  v_taxable_date := p_period_to;

  FOR v_partner IN
    SELECT DISTINCT partner_id
    FROM public.partner_coin_activations
    WHERE activated_at >= p_period_from
      AND activated_at <  (p_period_to + 1)
      AND invoiced = false
  LOOP
    SELECT id INTO v_existing_id
    FROM public.partner_invoices
    WHERE partner_id = v_partner.partner_id
      AND (
        (period_start = p_period_from AND period_end = p_period_to)
        OR
        (period_from = p_period_from AND period_to = p_period_to)
        OR
        (period_start = p_period_from AND period_end = p_period_to + 1)
        OR
        (period_from = p_period_from AND period_to = p_period_to + 1)
      )
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(coins), 0)
      INTO v_coins
    FROM public.partner_coin_activations
    WHERE partner_id = v_partner.partner_id
      AND activated_at >= p_period_from
      AND activated_at <  (p_period_to + 1)
      AND invoiced = false;

    IF v_coins = 0 THEN
      CONTINUE;
    END IF;

    SELECT gin.invoice_number, gin.variable_symbol
      INTO v_invoice_number, v_variable_symbol
    FROM public.generate_invoice_number(v_issue_date) gin;

    INSERT INTO public.partner_invoices (
      partner_id,
      period_start,
      period_end,
      period_from,
      period_to,
      invoice_number,
      variable_symbol,
      issue_date,
      due_date,
      taxable_date,
      coins_total,
      coins_activated,
      amount_net,
      amount_ex_vat,
      vat_rate,
      vat_amount,
      amount_gross,
      amount_inc_vat,
      status,
      created_at
    )
    SELECT
      p.id,
      p_period_from,
      p_period_to,
      p_period_from,
      p_period_to,
      v_invoice_number,
      v_variable_symbol,
      v_issue_date,
      v_due_date,
      v_taxable_date,
      v_coins,
      v_coins,
      (v_coins * p.price_per_coin),
      (v_coins * p.price_per_coin),
      p.vat_rate,
      (v_coins * p.price_per_coin * p.vat_rate),
      (v_coins * p.price_per_coin * (1 + p.vat_rate)),
      (v_coins * p.price_per_coin * (1 + p.vat_rate)),
      'draft',
      now()
    FROM public.partners p
    WHERE p.id = v_partner.partner_id
    RETURNING id INTO v_invoice_id;

    UPDATE public.partner_coin_activations
    SET invoiced = true
    WHERE partner_id = v_partner.partner_id
      AND activated_at >= p_period_from
      AND activated_at <  (p_period_to + 1)
      AND invoiced = false;

    -- Post-create hook: e-mail do fronty + best-effort PDF request
    PERFORM public.partner_invoice_post_create(v_invoice_id);
  END LOOP;
END;
$function$;

-- ====================================================================
-- Postcheck (spustit ručně po aplikaci):
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) args
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname IN
--     ('request_partner_invoice_pdf','partner_invoice_post_create',
--      'create_partner_invoices_for_last_week','create_partner_invoices_for_period');
--   -- 4 řádky
--
--   SELECT (pg_get_functiondef(p.oid) ~ 'partner_invoice_post_create') hook
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='create_partner_invoices_for_last_week';
--   -- hook = true
--
--   -- ACL: request_/post_create bez anon/authenticated EXECUTE
--   SELECT proname, pg_catalog.array_to_string(proacl, E'\n') FROM pg_proc p
--   JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND proname IN
--     ('request_partner_invoice_pdf','partner_invoice_post_create');
--
-- Produkční aktivace automatického PDF (součást rollout checklistu):
--   nastavit Vault secrets 'internal_function_token' (= INTERNAL_FUNCTION_TOKEN
--   z EF env) a 'edge_functions_url'
--   (= https://<ref>.supabase.co/functions/v1) — bez nich je PDF hook no-op
--   a e-mail flow funguje dál samostatně.
-- ====================================================================
