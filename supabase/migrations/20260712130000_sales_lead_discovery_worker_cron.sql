-- ============================================================================
-- Sales Leads — Discovery Job worker cron.
-- pg_cron každou minutu zavolá EF sales-lead-discover (worker), který zpracuje
-- jednu dávku aktivního jobu. Token i base URL se čtou z Vaultu (nikdy v DB
-- plaintextem). Orchestrátor volá worker jen když existuje aktivní job.
--
-- APPLY POZNÁMKA: po aplikaci nastavit Vault secrety
--   sales_leads_worker_token (shodný s EF secret SALES_LEADS_WORKER_TOKEN)
--   sales_leads_functions_base_url (např. https://<ref>.supabase.co/functions/v1)
-- Nedotýká se wallets/payments/contests/tickets/winners/Stripe.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Orchestrátor: dispatch worker EF, jen když je aktivní job.
CREATE OR REPLACE FUNCTION public.run_sales_lead_discovery_worker()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active int;
  v_token  text;
  v_base   text;
BEGIN
  SELECT count(*) INTO v_active
    FROM public.sales_lead_discovery_jobs
    WHERE status IN ('queued','running');
  IF v_active = 0 THEN RETURN; END IF;

  SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets WHERE name = 'sales_leads_worker_token' LIMIT 1;
  SELECT decrypted_secret INTO v_base
    FROM vault.decrypted_secrets WHERE name = 'sales_leads_functions_base_url' LIMIT 1;
  IF v_token IS NULL OR v_base IS NULL THEN RETURN; END IF;

  PERFORM net.http_post(
    url := rtrim(v_base, '/') || '/sales-lead-discover',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-token', v_token),
    body := '{}'::jsonb
  );
END $$;

REVOKE ALL ON FUNCTION public.run_sales_lead_discovery_worker() FROM anon, authenticated, public;

-- Naplánuj každou minutu (idempotentně).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sales_lead_discovery_worker_min') THEN
    PERFORM cron.unschedule('sales_lead_discovery_worker_min');
  END IF;
  PERFORM cron.schedule('sales_lead_discovery_worker_min', '* * * * *',
    'SELECT public.run_sales_lead_discovery_worker();');
END $$;

COMMIT;
