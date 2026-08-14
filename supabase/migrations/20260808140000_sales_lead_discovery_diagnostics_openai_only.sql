BEGIN;

-- Pouze aktualizace dokumentačního komentáře sloupce po odstranění DDG fallbacku.
-- Nové záznamy nesou jen OpenAI pole; starší záznamy s ddg_* zůstávají v jsonb
-- beze změny a nepřepisují se.
--
-- Žádná změna dat ani typu: `search_diagnostics` zůstává jsonb pole s volným
-- tvarem objektů.

COMMENT ON COLUMN public.sales_lead_discovery_jobs.search_diagnostics IS
  'Append-only JSON pole diagnostiky vyhledávání kandidátů, jeden objekt na search kolo '
  '(round, at, openai_raw_count, openai_usable_count, final_candidate_count, fallback_reason, '
  'openai_http_status, openai_error_type, added_to_pool). openai_http_status je číslo skutečné '
  'odpovědi nebo null, když odpověď nevznikla; openai_error_type je none/not_called/http_error/'
  'timeout/network_error/parse_error. OpenAI je jediný zdroj kandidátů — DuckDuckGo fallback byl '
  'odstraněn (z Edge runtime vracel HTTP 202 bez výsledků), takže pole ddg_* se už nezapisují; '
  've starších záznamech ale zůstávají. Nikdy neobsahuje tělo odpovědi, hlavičky ani secrets.';

COMMIT;
