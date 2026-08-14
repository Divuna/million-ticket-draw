BEGIN;

-- Pouze aktualizace dokumentačního komentáře sloupce: diagnostika nově nese i
-- skutečný výsledek HTTP volání obou zdrojů (status + typ chyby), aby šlo bez
-- console logs poznat, zda selhal OpenAI, DDG, nebo oba.
--
-- Žádná změna dat ani typu: `search_diagnostics` zůstává jsonb pole s volným
-- tvarem objektů, takže nová pole nevyžadují migraci schématu a starší záznamy
-- bez nich zůstávají validní.

COMMENT ON COLUMN public.sales_lead_discovery_jobs.search_diagnostics IS
  'Append-only JSON pole diagnostiky vyhledávání kandidátů, jeden objekt na search kolo '
  '(round, at, openai_raw_count, openai_usable_count, ddg_raw_count, ddg_usable_count, '
  'final_candidate_count, fallback_reason, openai_http_status, openai_error_type, '
  'ddg_http_status, ddg_error_type, added_to_pool). http_status je číslo skutečné '
  'odpovědi nebo null, když odpověď nevznikla; error_type je none/not_called/http_error/'
  'timeout/network_error/parse_error. Nikdy neobsahuje tělo odpovědi, hlavičky ani secrets.';

COMMIT;
