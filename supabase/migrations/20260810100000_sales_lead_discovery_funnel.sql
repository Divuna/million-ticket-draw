BEGIN;

-- Podrobná trychtýřová diagnostika discovery jobu.
--
-- Proč: produkční job d3386b32 (2026-08-09, e-shopy) hlásil created_count = 0,
-- wrong_category = 9 — ale reálně uložil 4 firmy (2× gastronomie, 1× jine,
-- 1× sport). Worker totiž počítal uložený lead jako created jen tehdy, když ho
-- klasifikátor zařadil přesně do žádaného oboru; jinak ho po uložení označil za
-- wrong_category. Stejný čítač se navíc používal i pro kandidáty zahozené ještě
-- před uložením. Ke zmatku přispěly tři continue větve úplně bez čítače
-- (chyba klasifikátoru, chyba RPC, jiný než created/skipped výsledek RPC) —
-- proto 3 + 7 + 9 = 19 z 20 zkontrolovaných kandidátů a jeden zmizel beze stopy.
-- Sloučené bylo i websites_rejected (tři různé příčiny v jednom čísle).
--
-- Sloupec drží počty po fázích a po konkrétních důvodech, takže u každého jobu
-- je vidět, kde a proč kandidáti odpadli. Obsahuje výhradně počty a krátké
-- důvodové kódy — žádné URL, e-maily ani jiná osobní data.
--
-- Tvar:
--   {
--     "candidates_from_search": 32,
--     "checked": 20,
--     "site_rejected": {"non_official_third_party": 4, "empty_page": 2},
--     "no_company_name": 1,
--     "official_rejected": {"company_identity_not_confirmed": 3},
--     "duplicates": 3,
--     "classifier_failed": 0,
--     "classified_irrelevant": 1,
--     "classified_fallback_other": 4,
--     "wrong_category": 0,
--     "email_found": 2,
--     "email_missing": 5,
--     "rpc_error": 0,
--     "rpc_rejected": {"duplicate_domain": 1},
--     "created": 6,
--     "created_in_target_group": 2,
--     "created_in_other_group": 4
--   }

ALTER TABLE public.sales_lead_discovery_jobs
  ADD COLUMN IF NOT EXISTS funnel jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_lead_discovery_jobs_funnel_is_object'
      AND conrelid = 'public.sales_lead_discovery_jobs'::regclass
  ) THEN
    ALTER TABLE public.sales_lead_discovery_jobs
      ADD CONSTRAINT sales_lead_discovery_jobs_funnel_is_object
      CHECK (jsonb_typeof(funnel) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN public.sales_lead_discovery_jobs.funnel IS
  'Trychtýřová diagnostika jobu: počty po fázích a důvodech vyřazení '
  '(site_rejected, no_company_name, official_rejected, duplicates, classifier_failed, '
  'classified_irrelevant, classified_fallback_other, wrong_category, email_found, '
  'email_missing, rpc_error, rpc_rejected, created, created_in_target_group, '
  'created_in_other_group). Jen počty a důvodové kódy — '
  'nikdy URL, e-maily ani secrets.';

COMMIT;
