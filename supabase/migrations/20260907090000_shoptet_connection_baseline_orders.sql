-- Shoptet: baseline historických objednávek + partnerské ověření napojení
-- Část C issue #289. Schváleno Pavlem: baseline platí POUZE pro NOVÁ napojení
-- vzniklá po nasazení této změny.
--
-- Návrh je záměrně minimální a nezavádí paralelní systém — jen doplňuje
-- existující tok submit → (nově) verify → approve → import:
--
--   1. Partner odešle exportní URL          → submit-shoptet-connection (beze změny)
--   2. Partner klikne „Ověřit napojení"      → verify-shoptet-connection (NOVÉ)
--        - stáhne export z PENDING Vault klíče, zkontroluje ho
--        - NIC nevydá: žádné MioCoiny, kód, e-mail ani fakturační položku
--        - zapíše čísla objednávek, které v exportu byly, jako baseline
--          (`activated_at IS NULL` = zatím neplatí)
--        - orazítkuje `shoptet_connection_requests.verified_at`
--   3. Admin schválí                         → approve-shoptet-connection
--        - u `request_kind = 'initial'` vyžaduje `verified_at IS NOT NULL`
--        - baseline dostane `activated_at = now()` = přesný okamžik aktivace
--   4. Import                                → import-shoptet-orders
--        - objednávku z aktivní baseline nikdy nezpracuje
--
-- STARÁ NAPOJENÍ SE NEMĚNÍ. Tabulka baseline je zároveň vypínačem funkce:
-- partner bez jediného aktivního baseline řádku prochází importem přesně jako
-- dosud. BOHEMIA INFINITY s.r.o. ani vereonika sro proto žádný řádek nedostanou
-- a jejich odměnová i importní logika zůstává beze změny. Migrace nedělá žádný
-- backfill a nesahá na `partners`, odměny, peněženky, platby ani fakturaci.

BEGIN;

-- ── 1. Stopa úspěšného partnerského ověření ─────────────────────────────────
-- Bez ní by nešlo vynutit „aktivace až po úspěšném testu" a admin by neviděl,
-- jestli partner test vůbec provedl.
ALTER TABLE public.shoptet_connection_requests
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_order_count integer;

COMMENT ON COLUMN public.shoptet_connection_requests.verified_at IS
  'Okamžik posledního úspěšného partnerského ověření exportu (dry-run). NULL = neověřeno.';
COMMENT ON COLUMN public.shoptet_connection_requests.verified_order_count IS
  'Počet objednávek nalezených v exportu při ověření — pouze číslo, žádná data objednávky.';

-- ── 2. Baseline historických objednávek ─────────────────────────────────────
-- Ukládá se VÝHRADNĚ číslo objednávky z exportu. Žádný e-mail, jméno, adresa,
-- částka ani cokoli dalšího ze zákaznických dat.
CREATE TABLE IF NOT EXISTS public.shoptet_connection_baseline_orders (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid NOT NULL REFERENCES public.shoptet_connection_requests(id) ON DELETE CASCADE,
  partner_id        uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  external_order_id text NOT NULL,
  captured_at       timestamptz NOT NULL DEFAULT now(),
  -- NULL = zachyceno při ověření, ale napojení ještě není schválené, takže
  -- baseline zatím nic neblokuje. Vyplní ho teprve schválení = okamžik aktivace.
  activated_at      timestamptz,
  CONSTRAINT scbo_external_order_id_not_blank CHECK (btrim(external_order_id) <> ''),
  -- Na požadavek, ne na partnera: zamítnutý a znovu podaný požadavek musí umět
  -- zachytit baseline znovu, aniž by kolidoval se starým pokusem.
  CONSTRAINT scbo_request_order_unique UNIQUE (request_id, external_order_id)
);

COMMENT ON TABLE public.shoptet_connection_baseline_orders IS
  'Objednávky, které v Shoptet exportu existovaly už PŘED aktivací napojení. '
  'Nikdy z nich nesmí vzniknout odměna, kód, zákaznický e-mail ani fakturační '
  'položka — ani když později změní stav na paid/delivered/completed. '
  'Platí jen pro napojení vzniklá po zavedení této tabulky; stará napojení '
  'zde nemají žádný řádek a chovají se beze změny.';

-- Jediný dotaz, který importer dělá: aktivní baseline daného partnera.
CREATE INDEX IF NOT EXISTS idx_scbo_partner_active
  ON public.shoptet_connection_baseline_orders (partner_id, external_order_id)
  WHERE activated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scbo_request
  ON public.shoptet_connection_baseline_orders (request_id);

-- Interní tabulka: čte a zapisuje ji výhradně service_role (Edge Functions).
-- RLS je zapnuté a záměrně BEZ policy → pro anon i authenticated deny-all.
ALTER TABLE public.shoptet_connection_baseline_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shoptet_connection_baseline_orders FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.shoptet_connection_baseline_orders TO service_role;

-- ── 3. Čtení pending URL pro ověření ────────────────────────────────────────
-- Zrcadlí existující `get_shoptet_export_url(uuid)`, jen nad PENDING klíčem —
-- ověření běží dřív, než schválení vytvoří finální partnerský klíč.
-- URL zůstává ve Vaultu; funkci smí volat pouze service_role, takže se k ní
-- klient nikdy nedostane a Edge Function ji nikam nevrací ani neloguje.
CREATE OR REPLACE FUNCTION public.get_shoptet_pending_url(p_request_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $function$
declare
  v_name text;
  v_url  text;
begin
  if p_request_id is null then
    return null;
  end if;
  if not exists (select 1 from public.shoptet_connection_requests where id = p_request_id) then
    return null;
  end if;

  v_name := 'shoptet_pending_url_' || replace(p_request_id::text, '-', '');
  select decrypted_secret into v_url from vault.decrypted_secrets where name = v_name;
  return v_url;
end $function$;

REVOKE ALL ON FUNCTION public.get_shoptet_pending_url(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shoptet_pending_url(uuid) TO service_role;

-- ── 4. Srovnání auditního logu se skutečností ───────────────────────────────
-- `shoptet_import_row_log.action` má na stagingu ještě starý CHECK z doby, kdy
-- importer znal jen 7 akcí. Produkce ho nemá vůbec a už dnes tam leží řádky
-- `skip_no_reward` z PR #392 — na stagingu by takový insert tiše shodil celou
-- dávku 500 řádků (importer návratovou hodnotu insertu nekontroluje) a audit by
-- mlčky přišel o data. Baseline přidává další akci `skip_baseline`, takže se
-- staging srovnává s produkcí: constraint se odstraňuje, nový se nezavádí.
ALTER TABLE public.shoptet_import_row_log
  DROP CONSTRAINT IF EXISTS shoptet_import_row_log_action_check;

COMMIT;
