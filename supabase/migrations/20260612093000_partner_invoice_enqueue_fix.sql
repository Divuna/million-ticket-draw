-- ====================================================================
-- Partner Invoice email enqueue fix — chybějící 1-arg overload
-- Fix krok 2 (audit 12. 06. 2026):
--
-- create_partner_invoices_for_last_week() (pg_cron job 17) i
-- create_partner_invoices_for_period() volají
--   PERFORM public.enqueue_partner_invoice_email(v_invoice_id);
-- ale v DB existuje pouze
--   enqueue_partner_invoice_email(p_partner_id uuid, p_period_from date, p_period_to date)
--
-- Cron dosud "succeeded" jen proto, že žádný partner neměl nevyfakturované
-- coiny (smyčka končí CONTINUE dřív, než na volání dojde). První reálná
-- fakturace by celý běh shodila chybou "function does not exist".
--
-- Tato migrace přidává bezpečný 1-arg overload, který:
--   * odvodí partnera, období, příjemce, číslo faktury a částku
--     z partner_invoices + partners,
--   * POUZE vloží řádek do email_queue (status 'pending') — nic neodesílá,
--     odeslání dělá existující worker process-email-queue (NEMĚNĚN),
--   * bez přílohy (attachment_required = false default) — PDF flow je
--     samostatný krok plánu,
--   * chybějící e-mail / neexistující faktura = tichý RETURN, nikdy
--     neshodí fakturační smyčku (stejný vzor jako 3-arg verze),
--   * 3-arg verze zůstává nedotčena.
--
-- Idempotentní: CREATE OR REPLACE FUNCTION.
-- NEAPLIKOVÁNO — čeká na výslovné schválení Pavla (staging first).
-- ====================================================================

CREATE OR REPLACE FUNCTION public.enqueue_partner_invoice_email(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_email          text;
  v_period_from    date;
  v_period_to      date;
  v_invoice_number text;
  v_amount_gross   numeric;
  v_subject        text;
  v_body           text;
BEGIN
  SELECT p.contact_email,
         COALESCE(i.period_start, i.period_from),
         COALESCE(i.period_end,   i.period_to),
         i.invoice_number,
         COALESCE(i.amount_gross, i.amount_inc_vat)
    INTO v_email, v_period_from, v_period_to, v_invoice_number, v_amount_gross
    FROM public.partner_invoices i
    JOIN public.partners p ON p.id = i.partner_id
   WHERE i.id = p_invoice_id;

  -- Faktura neexistuje nebo partner nemá e-mail -> tiše skončit,
  -- fakturační smyčka nesmí spadnout.
  IF NOT FOUND OR v_email IS NULL THEN
    RETURN;
  END IF;

  v_subject := 'OneMil – faktura'
    || COALESCE(' ' || v_invoice_number, '')
    || ' připravena';

  v_body :=
    'Faktura' ||
    COALESCE(' č. ' || v_invoice_number, '') ||
    ' za období ' ||
    COALESCE(v_period_from::text, '—') ||
    ' – ' ||
    COALESCE(v_period_to::text, '—') ||
    COALESCE(' na částku ' || to_char(v_amount_gross, 'FM999999990.00') || ' Kč vč. DPH', '') ||
    ' je připravena. Přihlaste se do partnerského portálu OneMil, kde fakturu najdete v sekci Moje faktury.';

  INSERT INTO public.email_queue (
    email,
    subject,
    body,
    status,
    created_at
  ) VALUES (
    v_email,
    v_subject,
    v_body,
    'pending',
    now()
  );
END;
$function$;

-- ====================================================================
-- Postcheck (spustit ručně po aplikaci):
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname = 'enqueue_partner_invoice_email'
--   ORDER BY args;
-- Očekáváno: 2 řádky —
--   (p_invoice_id uuid)                                  <- nový overload
--   (p_partner_id uuid, p_period_from date, p_period_to date)  <- původní, nedotčen
--
-- Funkční ověření (staging, s testovací fakturou):
--   SELECT public.enqueue_partner_invoice_email('<test-invoice-id>');
--   SELECT email, subject, status FROM public.email_queue
--   WHERE subject LIKE 'OneMil – faktura%' ORDER BY created_at DESC LIMIT 1;
--   -- řádek je 'pending'; e-mail odešle až worker process-email-queue.
-- ====================================================================
