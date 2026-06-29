# Production rollout gate — Partner invoice VAT fix + vat_rate sjednocení

**Stav:** ⛔ NEAPLIKOVÁNO. Gate only. Vyžaduje výslovné schválení Pavla + manuální backup.
**Cíl produkce:** `xkzhjldrojjlrkezorey`
**Migrace:** `supabase/migrations/20260629180000_partner_invoice_vat_fraction_fix.sql` (commit `9b4df3a8565d5a3e5436150a3c5a8da0a9623cc6`)
**Datum přípravy:** 29. 06. 2026

## Proč gate (shrnutí auditu)

- Produkce má **smíšenou konvenci**: 10 partnerů `vat_rate=0.2100` (zlomek), **1 partner `vat_rate=21.0000`** (procento). Default sloupce `0.2100`.
- Fakturační funkce jsou **nekonzistentní**: `create_partner_invoices_for_last_week` a `generate_partner_invoice` používají `/100`; `create_partner_invoices_for_period` přímý `* vat_rate`.
- Živý weekly cron (job 17, `0 2 * * 0`) volá `create_partner_invoices_for_last_week` (`/100`).
- Existující faktury jsou správně. Budoucí jsou rizikové.
- **Migrace sjednocuje funkce na zlomek (bez `/100`). Pokud se aplikuje BEZ opravy partnera s `vat_rate=21`, tento partner se přepne z „správně" na 100× moc (`net × 21`).** Proto se data MUSÍ srovnat PŘED migrací.

**Správný DPH model po rolloutu:** `vat_rate` = zlomek (0.21); `DPH = net * vat_rate`; `gross = net + DPH`. Ověřeno na stagingu: net 14,00 → DPH 2,94 → gross 16,94.

---

## backup needed: YES

PITR je na produkci OFF → manuální `pg_dump` PŘED jakoukoli mutací. Uložit do `backups/` (git-ignored, necommitovat). Ověřit `pg_restore -l` (exit 0) před pokračováním.

---

## Krok 0 — Read-only PRECHECK (spustit a porovnat PŘED rolloutem)

```sql
-- 0.1 Konvence vat_rate napříč partnery (očekávání: 0.2100 = 10, 21.0000 = 1)
SELECT vat_rate::text AS vat_rate, COUNT(*) AS n
FROM public.partners
GROUP BY vat_rate
ORDER BY vat_rate;

-- 0.2 Přesně kolik řádků trefí UPDATE (očekávání: 1)
SELECT COUNT(*) AS rows_to_fix
FROM public.partners
WHERE vat_rate = 21;

-- 0.3 Ten 1 partner NESMÍ mít nefakturované aktivace (očekávání: 0)
--     (kdyby měl, srovnání vat_rate by změnilo částku jeho příští faktury)
SELECT p.id, p.status, p.vat_rate::text AS vat_rate,
       COUNT(a.*) FILTER (WHERE a.invoiced = false) AS uninvoiced_acts
FROM public.partners p
LEFT JOIN public.partner_coin_activations a ON a.partner_id = p.id
WHERE p.vat_rate = 21
GROUP BY p.id, p.status, p.vat_rate;

-- 0.4 Aktuální stav funkcí (očekávání: lastweek=true, generate=true, period_div100=false)
SELECT
  pg_get_functiondef('public.create_partner_invoices_for_last_week()'::regprocedure) LIKE '%/ 100%' AS lastweek_div100,
  pg_get_functiondef('public.generate_partner_invoice(uuid,date,date)'::regprocedure) LIKE '%/ 100%' AS generate_div100,
  pg_get_functiondef('public.create_partner_invoices_for_period(date,date)'::regprocedure) LIKE '%/ 100%' AS period_div100;

-- 0.5 Existující faktury musí být správně (očekávání: mismatch = 0)
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (
    WHERE amount_net IS NOT NULL AND vat_rate IS NOT NULL AND vat_amount IS NOT NULL
      AND round(vat_amount,2) <> round(amount_net * (CASE WHEN vat_rate > 1 THEN vat_rate/100 ELSE vat_rate END), 2)
  ) AS mismatch
FROM public.partner_invoices;
```

**Gate podmínky (vše musí platit, jinak STOP):**
- 0.1: právě 1 řádek `21.0000`, zbytek `0.2100`.
- 0.2: `rows_to_fix = 1`.
- 0.3: `uninvoiced_acts = 0` pro toho partnera.
- 0.5: `mismatch = 0`.

---

## Krok 1 — Backup (manuální, mimo SQL editor)

`pg_dump` produkce → `backups/onemil-production-pre-vat-fraction-fix-<ts>.dump`, ověřit `pg_restore -l`.

## Krok 2 — Sjednotit partnera s `vat_rate=21` na `0.21` (transakčně, guarded)

```sql
BEGIN;

-- bezpečnostní guard: pokud by trefilo víc než 1 řádek, abort
DO $$
DECLARE v_n int;
BEGIN
  SELECT COUNT(*) INTO v_n FROM public.partners WHERE vat_rate = 21;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 partner with vat_rate=21, found %', v_n;
  END IF;
END $$;

UPDATE public.partners
SET vat_rate = 0.21
WHERE vat_rate = 21;

-- ověření uvnitř transakce: žádný partner už nesmí mít vat_rate > 1
SELECT COUNT(*) AS still_percent FROM public.partners WHERE vat_rate > 1;  -- očekávání: 0

COMMIT;
```

## Krok 3 — Aplikovat VAT fix migraci

Aplikovat obsah `supabase/migrations/20260629180000_partner_invoice_vat_fraction_fix.sql`
(CREATE OR REPLACE `create_partner_invoices_for_last_week` + `generate_partner_invoice`,
oba `net * vat_rate` bez `/100`; `create_partner_invoices_for_period` se nemění — už je správně).

---

## Krok 4 — POSTCHECK (po Kroku 2 i 3)

```sql
-- 4.1 Žádný partner už nemá procentní konvenci (očekávání: 0)
SELECT COUNT(*) AS percent_partners FROM public.partners WHERE vat_rate > 1;

-- 4.2 Všechny 3 funkce zlomkové, bez /100 (očekávání: vše false)
SELECT
  pg_get_functiondef('public.create_partner_invoices_for_last_week()'::regprocedure) LIKE '%/ 100%' AS lastweek_div100,
  pg_get_functiondef('public.generate_partner_invoice(uuid,date,date)'::regprocedure) LIKE '%/ 100%' AS generate_div100,
  pg_get_functiondef('public.create_partner_invoices_for_period(date,date)'::regprocedure) LIKE '%/ 100%' AS period_div100;

-- 4.3 Dry-run částek pro VŠECHNY partnery (read-only, žádná faktura se nevytváří):
--     net 100 modelově → vat musí být net*vat_rate, gross net*(1+vat_rate)
SELECT vat_rate::text AS vat_rate,
       (100 * vat_rate)::numeric(12,2)        AS vat_on_100,
       (100 * (1 + vat_rate))::numeric(12,2)  AS gross_on_100
FROM public.partners
GROUP BY vat_rate
ORDER BY vat_rate;
-- očekávání: vat_rate 0.21 → vat 21.00, gross 121.00 (žádné 2100 / 0.21)

-- 4.4 Existující faktury stále korektní (očekávání: mismatch = 0)
SELECT COUNT(*) FILTER (
  WHERE amount_net IS NOT NULL AND vat_rate IS NOT NULL AND vat_amount IS NOT NULL
    AND round(vat_amount,2) <> round(amount_net * vat_rate, 2)
) AS mismatch
FROM public.partner_invoices;
```

**Gate po rolloutu (vše musí platit):** 4.1 = 0; 4.2 vše false; 4.3 vat_rate 0.21 → 21.00 / 121.00; 4.4 mismatch = 0.

---

## Rollback

- **Krok 3 (funkce):** znovu aplikovat předchozí definice funkcí z `supabase/migrations/20260612125606_partner_invoice_line_snapshots.sql` (CREATE OR REPLACE vrátí `/100` varianty `last_week` + `generate`; `for_period` tam zůstává stejná).
- **Krok 2 (data):** vrátit partnera zpět:
  ```sql
  UPDATE public.partners SET vat_rate = 21 WHERE id = '<PARTNER_ID_Z_PRECHECKU_0.3>';
  ```
  (ID vzít z výsledku precheck 0.3, ne hádat.)
- **Krajní případ:** obnova z `backups/onemil-production-pre-vat-fraction-fix-<ts>.dump`.
- Existující faktury se nemění v žádném kroku → není co u nich rollbackovat.

---

## exact approval text (Pavel)

> „Schvaluji produkční rollout VAT fix partner faktur na xkzhjldrojjlrkezorey: 1) manuální pg_dump, 2) UPDATE jednoho partnera vat_rate=21 → 0.21, 3) aplikovat migraci 20260629180000_partner_invoice_vat_fraction_fix.sql, 4) postcheck. Rozumím, že se nevytváří žádná faktura, neposílá e-mail a existující faktury se nemění."

---

## Poznámky

- Žádná fakturace se v rámci rolloutu nespouští; weekly cron (job 17) běží sám v neděli 02:00 UTC — po rolloutu už bude počítat zlomkově správně pro všechny partnery.
- Po rolloutu zapsat výsledek do `CLAUDE.md` + `onemil_state.md`.
