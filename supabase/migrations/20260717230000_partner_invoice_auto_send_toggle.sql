-- Migration: 20260717230000_partner_invoice_auto_send_toggle.sql
--
-- Adds a superadmin-controlled switch for automatic issuing + sending of
-- partner invoices, and makes the weekly automation draft-only unless the
-- switch is ON (the ON-mode PDF + single email + status='issued' flow is
-- orchestrated by the partner-invoice-auto-send Edge Function).
--
-- PARTS
-- 1. settings flag `partner_invoice_auto_send_enabled` (default 'false').
--    Read/write is governed by the existing settings RLS policy
--    ("Only admins can modify settings" — is_superadmin()), so only a
--    superadmin can see or change it. No new RLS is added.
-- 2. Helper is_partner_invoice_auto_send_enabled() (SECURITY DEFINER) so the
--    automation Edge Function / service role can read the flag reliably.
-- 3. Dedup marker partner_invoices.auto_email_sent_at — the auto-send Edge
--    Function atomically claims a draft invoice before sending, guaranteeing
--    at most one automatic email per invoice even across repeated runs.
-- 4. create_partner_invoices_for_last_week() no longer calls
--    enqueue_partner_invoice_email(): in OFF mode the weekly automation
--    creates ONLY drafts (no PDF, no email). VAT/amount math, invoice
--    numbers, variable symbols and partner_invoice_lines are unchanged.
--
-- UNCHANGED / STILL WORKS
-- * create_partner_invoices_for_period(date,date) — untouched (coin invoices).
-- * enqueue_partner_invoice_email(...) definition — untouched (only the call
--   site inside the weekly function is removed).
-- * Manual send / manual PDF / resend via send-partner-invoice-email and
--   generate-partner-invoice-pdf Edge Functions — unchanged.
-- * Offer invoices (type='offer') and the partner portal — untouched.

-- 1. Default OFF flag.
INSERT INTO public.settings (key, value)
VALUES ('partner_invoice_auto_send_enabled', 'false')
ON CONFLICT (key) DO NOTHING;

-- 2. Readable flag helper for automation (bypasses RLS via SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.is_partner_invoice_auto_send_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT lower(trim(value)) = 'true'
       FROM public.settings
      WHERE key = 'partner_invoice_auto_send_enabled'
      LIMIT 1),
    false
  );
$function$;

REVOKE ALL ON FUNCTION public.is_partner_invoice_auto_send_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_partner_invoice_auto_send_enabled() TO authenticated, service_role;

-- 3. Dedup claim marker + atomic claim/release for the auto-send flow.
ALTER TABLE public.partner_invoices
  ADD COLUMN IF NOT EXISTS auto_email_sent_at timestamptz;

-- Atomically claim a draft invoice for automatic sending. Returns true only
-- for the caller that first flips auto_email_sent_at from NULL while the
-- invoice is still 'draft'. Any repeated / concurrent run gets false and must
-- not send an email — this is the database-side duplicate guard.
CREATE OR REPLACE FUNCTION public.claim_partner_invoice_for_auto_send(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_claimed uuid;
BEGIN
  UPDATE public.partner_invoices
     SET auto_email_sent_at = now()
   WHERE id = p_invoice_id
     AND status = 'draft'
     AND auto_email_sent_at IS NULL
     AND type IS DISTINCT FROM 'offer'
  RETURNING id INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$function$;

-- Release the claim if the automatic PDF/email step failed, so a later run
-- can retry. The invoice stays 'draft'. Only releases still-draft invoices
-- (an invoice already flipped to 'issued' keeps its sent marker).
CREATE OR REPLACE FUNCTION public.release_partner_invoice_auto_send_claim(p_invoice_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.partner_invoices
     SET auto_email_sent_at = NULL
   WHERE id = p_invoice_id
     AND status = 'draft';
$function$;

REVOKE ALL ON FUNCTION public.claim_partner_invoice_for_auto_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_partner_invoice_for_auto_send(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_partner_invoice_auto_send_claim(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_partner_invoice_auto_send_claim(uuid) TO service_role;

-- 4. Weekly automation: draft-only, no email enqueue (removes the OFF-mode
--    auto email described in requirement 6). Now RETURNS the ids of the
--    invoices it created in THIS run, so the auto-send flow only processes
--    the current weekly period's fresh invoices and never touches older
--    drafts (which must always stay for manual approval).
DROP FUNCTION IF EXISTS public.create_partner_invoices_for_last_week();
CREATE FUNCTION public.create_partner_invoices_for_last_week()
RETURNS TABLE(invoice_id uuid)
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
    -- vat_rate is a fraction (0.21), not a percent -> no /100
    v_vat_amount   := v_amount_net * v_partner.vat_rate;
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

    INSERT INTO public.partner_invoice_lines (
      invoice_id,
      activation_id,
      external_order_id,
      coins,
      activated_at
    )
    SELECT
      v_invoice_id,
      id,
      external_order_id,
      coins,
      activated_at
    FROM public.partner_coin_activations
    WHERE partner_id = v_partner.id
      AND invoiced = false
      AND activated_at >= v_period_start
      AND activated_at <  (v_period_end + 1);

    UPDATE public.partner_coin_activations
       SET invoiced = true
     WHERE id IN (
       SELECT l.activation_id
       FROM public.partner_invoice_lines l
       WHERE l.invoice_id = v_invoice_id
     );

    -- Emit the id of the invoice created in this run. No automatic email
    -- here: the weekly automation creates drafts only. Automatic issuing +
    -- sending (PDF + exactly one email + status 'issued', only after
    -- success) is handled by the partner-invoice-auto-send Edge Function
    -- when the superadmin switch partner_invoice_auto_send_enabled is ON,
    -- and only for the ids returned here.
    invoice_id := v_invoice_id;
    RETURN NEXT;
  END LOOP;
  RETURN;
END;
$function$;

-- 5. Cron entrypoint: post to the partner-invoice-auto-send Edge Function via
--    pg_net + Vault (same pattern as request_partner_invoice_pdf). This is the
--    safe way to run the weekly automation through the Edge Function so that
--    the ON-mode "PDF + one email + issued only after success" flow applies.
--    Creating this function is side-effect free; it only runs when invoked.
CREATE OR REPLACE FUNCTION public.run_partner_invoice_weekly_automation()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_token    text;
  v_base_url text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RETURN;
  END IF;

  BEGIN
    SELECT decrypted_secret INTO v_token
      FROM vault.decrypted_secrets WHERE name = 'internal_function_token';
    SELECT decrypted_secret INTO v_base_url
      FROM vault.decrypted_secrets WHERE name = 'edge_functions_url';
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;

  IF v_token IS NULL OR v_base_url IS NULL THEN
    RETURN;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_base_url || '/partner-invoice-auto-send',
      headers := jsonb_build_object(
        'Content-Type',     'application/json',
        'x-internal-token', v_token
      ),
      body    := jsonb_build_object('trigger', 'weekly_cron')
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN;
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.run_partner_invoice_weekly_automation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_partner_invoice_weekly_automation() TO service_role;

-- 6. Cron repoint — STAGING ONLY, applied outside this migration file so that
--    applying the migration to production never changes the production cron.
--    The production weekly job (job 17, 'weekly_partner_invoices',
--    '0 2 * * 0' -> select public.create_partner_invoices_for_last_week())
--    must be repointed to the Edge Function only in a separate, explicitly
--    approved step, e.g.:
--
--      SELECT cron.schedule(
--        'weekly_partner_invoices',
--        '0 2 * * 0',
--        $$ SELECT public.run_partner_invoice_weekly_automation(); $$
--      );
--
--    (cron.schedule upserts by job name, preserving the schedule.)
