BEGIN;

-- Trvalá diagnostika vyhledávání kandidátů pro discovery joby.
--
-- Důvod: diagnostika z generateCandidateUrlsWithDiagnostics() dosud končila jen
-- v console.log Edge Function, který přes Supabase konektor (MCP/CLI) není
-- čitelný — po nulovém výsledku pak nešlo zjistit, zda selhal OpenAI, DDG, nebo
-- oba zdroje. Nově se ukládá k jobu a čte se běžným SQL.
--
-- Tvar: append-only JSON pole, jeden objekt na search kolo, aby zůstala
-- historie VŠECH kol (worker běží opakovaně přes cron a stav si nese dál).
--   [
--     {
--       "round": 0,
--       "at": "2026-08-08T10:00:00.000Z",
--       "openai_raw_count": 12,
--       "openai_usable_count": 0,
--       "ddg_raw_count": 40,
--       "ddg_usable_count": 9,
--       "final_candidate_count": 9,
--       "fallback_reason": "openai_no_usable_candidates",
--       "added_to_pool": 9
--     }
--   ]
--
-- Obsahuje výhradně čísla, ISO timestamp a enum důvodu fallbacku — nikdy API
-- klíče, tokeny, Authorization hlavičky ani jiné secrets.
--
-- Aditivní změna: žádný existující sloupec, index, policy ani RPC se nemění.
-- Zápis dělá worker přes service_role (obchází RLS); čtení pokrývá stávající
-- policy `sldj_select` (has_admin_permission('sales_leads.manage') OR
-- is_superadmin()), takže se nepřidává ani neupravuje žádná policy.

ALTER TABLE public.sales_lead_discovery_jobs
  ADD COLUMN IF NOT EXISTS search_diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_lead_discovery_jobs_search_diagnostics_is_array'
      AND conrelid = 'public.sales_lead_discovery_jobs'::regclass
  ) THEN
    ALTER TABLE public.sales_lead_discovery_jobs
      ADD CONSTRAINT sales_lead_discovery_jobs_search_diagnostics_is_array
      CHECK (jsonb_typeof(search_diagnostics) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.sales_lead_discovery_jobs.search_diagnostics IS
  'Append-only JSON pole diagnostiky vyhledávání kandidátů, jeden objekt na search kolo '
  '(round, at, openai_raw_count, openai_usable_count, ddg_raw_count, ddg_usable_count, '
  'final_candidate_count, fallback_reason, added_to_pool). Nikdy neobsahuje secrets.';

COMMIT;
