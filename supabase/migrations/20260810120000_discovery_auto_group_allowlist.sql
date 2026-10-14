BEGIN;

-- Automatické denní discovery hledá jen povolené kategorie (teď pouze e-shopy).
--
-- Proč: obchodní e-mail, kterým se oslovují nově nalezené firmy, je psaný
-- výhradně pro e-shopy. Dokud nevzniknou samostatné šablony a pravidla pro
-- další segmenty, nesmí plánovač střídat auto-moto, gastronomii ani jiné obory.
--
-- Jak: nový příznak `sales_lead_groups.auto_discovery_enabled`. Rotace
-- v `sales_lead_pick_next_discovery_group()` zůstává beze změny až na to, že
-- vybírá jen z povolených kategorií — při jediné povolené kategorii se tedy
-- fakticky nerotuje. Vrátit více kategorií pak znamená jediný UPDATE, žádnou
-- migraci ani zásah do kódu:
--
--   UPDATE public.sales_lead_groups
--   SET auto_discovery_enabled = true
--   WHERE slug IN ('e-shopy', 'sport', ...);
--
-- Fail closed: když není povolená žádná kategorie, plánovač vrátí
-- `no_active_group` a NEVYTVOŘÍ žádný job.
--
-- Rozsah: jeden sloupec + jedna funkce pro výběr kategorie. Nemění se plánovač,
-- čas cronu (20 4 * * *), requested_count (5), max_candidates (80), worker,
-- deduplikace, ověřování webu, ARES, ověřování e-mailu ani funnel diagnostika.
-- Ruční discovery jakékoli kategorie z administrace zůstává beze změny —
-- zakládá job přímo a tuto funkci vůbec nevolá.
--
-- Rollback:
--   UPDATE public.sales_lead_groups SET auto_discovery_enabled = true
--     WHERE is_active AND slug <> 'jine';
--   -- a případně obnovit definici funkce z 20260807120000.

ALTER TABLE public.sales_lead_groups
  ADD COLUMN IF NOT EXISTS auto_discovery_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sales_lead_groups.auto_discovery_enabled IS
  'true = kategorii smi vybrat automaticky denni plánovač discovery. Rucni discovery z administrace timto prepinacem neni omezeno.';

-- Teď výhradně e-shopy. `jine` je catch-all pro klasifikaci, ne cílový segment.
UPDATE public.sales_lead_groups
SET auto_discovery_enabled = (slug = 'e-shopy' AND is_active);

CREATE OR REPLACE FUNCTION public.sales_lead_pick_next_discovery_group()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT g.slug
  FROM public.sales_lead_groups g
  LEFT JOIN LATERAL (
    SELECT max(j.created_at) AS last_used
    FROM public.sales_lead_discovery_jobs j
    WHERE j.lead_group = g.slug
  ) u ON true
  WHERE g.is_active
    AND g.auto_discovery_enabled
    AND g.slug <> 'jine'
  ORDER BY u.last_used ASC NULLS FIRST, g.sort_order ASC, g.slug ASC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.sales_lead_pick_next_discovery_group()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sales_lead_pick_next_discovery_group()
  TO service_role;

DO $$
DECLARE
  v_enabled int;
  v_pick text;
BEGIN
  SELECT count(*) INTO v_enabled
  FROM public.sales_lead_groups
  WHERE auto_discovery_enabled;

  SELECT public.sales_lead_pick_next_discovery_group() INTO v_pick;

  IF v_enabled <> 1 OR v_pick IS DISTINCT FROM 'e-shopy' THEN
    RAISE EXCEPTION 'automaticke discovery musi vybirat prave e-shopy (povoleno %, vybrano %)',
      v_enabled, coalesce(v_pick, 'NULL');
  END IF;
END $$;

COMMIT;
