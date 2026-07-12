-- ============================================================================
-- Sales Leads — Discovery Jobs (background fill-to-count discovery)
--
-- „Najít nové firmy" už neběží jako jeden dlouhý request. Frontend založí JOB
-- (requested_count = počet SKUTEČNĚ uložených firem s ověřeným webem). Worker
-- (EF sales-lead-discover, poháněný pg_cronem) zpracovává job po dávkách,
-- průběžně ukládá a aktualizuje progress, dokud nedodá požadovaný počet nebo
-- nedojdou kandidáti / nevyčerpá bezpečný strop. Discovery NIKDY neukládá e-mail.
--
-- Nedotýká se e-mailů, CRM, plateb, peněženek, soutěží, voucherů ani Stripe.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_lead_discovery_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_group        text NOT NULL,
  requested_count   int  NOT NULL,
  max_candidates    int  NOT NULL DEFAULT 80,
  status            text NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','done','stopped','failed')),
  -- fronta kandidátů + kurzor (worker generuje po dávkách)
  candidate_pool    jsonb NOT NULL DEFAULT '[]'::jsonb,
  cursor            int  NOT NULL DEFAULT 0,
  search_rounds     int  NOT NULL DEFAULT 0,
  search_exhausted  boolean NOT NULL DEFAULT false,
  -- živé metriky (bod 14)
  candidates_checked int NOT NULL DEFAULT 0,
  created_count      int NOT NULL DEFAULT 0,
  duplicates         int NOT NULL DEFAULT 0,
  websites_rejected  int NOT NULL DEFAULT 0,
  wrong_category     int NOT NULL DEFAULT 0,
  with_ico           int NOT NULL DEFAULT 0,
  with_dic           int NOT NULL DEFAULT 0,
  with_address       int NOT NULL DEFAULT 0,
  with_phone         int NOT NULL DEFAULT 0,
  finish_reason      text,
  error              text,
  created_by         uuid,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  started_at         timestamptz,
  finished_at        timestamptz
);

ALTER TABLE public.sales_lead_discovery_jobs ENABLE ROW LEVEL SECURITY;

-- Čtení jen admin se sales_leads.manage nebo superadmin. Žádná write policy pro
-- authenticated → zápis výhradně worker (service_role) + SECURITY DEFINER RPC.
DROP POLICY IF EXISTS sldj_select ON public.sales_lead_discovery_jobs;
CREATE POLICY sldj_select ON public.sales_lead_discovery_jobs
  FOR SELECT TO authenticated
  USING (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin());

CREATE INDEX IF NOT EXISTS idx_sldj_status_created
  ON public.sales_lead_discovery_jobs(status, created_at);

-- ── RPC: založení jobu (guarded, 1 aktivní job) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_lead_discovery_job_create(
  p_lead_group     text,
  p_requested_count int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_count int; v_active int;
BEGIN
  IF NOT (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;
  IF p_lead_group IS NULL OR btrim(p_lead_group) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_lead_group');
  END IF;
  v_count := LEAST(GREATEST(COALESCE(p_requested_count, 5), 1), 25);

  -- Jen 1 aktivní job (queued/running) v celém modulu.
  SELECT count(*) INTO v_active
    FROM public.sales_lead_discovery_jobs
    WHERE status IN ('queued','running');
  IF v_active > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'job_already_running');
  END IF;

  INSERT INTO public.sales_lead_discovery_jobs (lead_group, requested_count, created_by)
  VALUES (btrim(p_lead_group), v_count, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'job_id', v_id, 'requested_count', v_count);
END $$;

REVOKE ALL ON FUNCTION public.sales_lead_discovery_job_create(text, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sales_lead_discovery_job_create(text, int) TO authenticated;

-- ── RPC: zrušení jobu člověkem ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sales_lead_discovery_job_stop(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_admin_permission('sales_leads.manage') OR public.is_superadmin()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'access_denied');
  END IF;
  UPDATE public.sales_lead_discovery_jobs
    SET status = 'stopped', finish_reason = 'stopped_by_user',
        finished_at = now(), updated_at = now()
    WHERE id = p_id AND status IN ('queued','running');
  RETURN jsonb_build_object('success', true);
END $$;

REVOKE ALL ON FUNCTION public.sales_lead_discovery_job_stop(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.sales_lead_discovery_job_stop(uuid) TO authenticated;

COMMENT ON TABLE public.sales_lead_discovery_jobs IS
  'Background discovery jobs. requested_count = počet uložených firem s ověřeným webem, ne počet kandidátů. Zápis jen worker (service_role). Discovery neukládá e-mail.';

COMMIT;
