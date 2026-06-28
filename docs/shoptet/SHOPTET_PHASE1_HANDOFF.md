# Shoptet Importer — Phase 1 Codex Handoff

**Datum:** 27. 06. 2026  
**Stav:** Phase 1A/1B/1C staging kompletní. Produkce nedotčena.  
**Commit:** `2f0027e4`

---

## NEXT CHAT / CODEX START HERE

### Co je hotovo

| Fáze | Popis | Stav |
|------|-------|------|
| Phase 1A | DB základ na staging (`shoptet_import_*` tabulky, Vault helpers, partner pole) | ✅ |
| Phase 1B | Dry-run Edge Functions nasazeny na staging, BOHEMIA dry-run 6/6 OK | ✅ |
| Phase 1C | Live-write test: 6 BOHEMIA kódů vytvořeno, idempotence OK | ✅ |
| Phase 1C email | Testovací e-mail doručen na `veru.enge@gmail.com`, 0 starých e-mailů odeslány | ✅ |
| E2E infra | `superadmin-e2e@onemil.cz` přidán jako staging E2E superadmin | ✅ |

### Co není hotovo

- Produkční rollout (migrace, EF deploy, Vault secret, BOHEMIA config) — **čeká na schválení Pavla**
- Staging staging staging kódy nebyly uplatněny zákazníkem (kódy jsou funkční, jen nebyly testovány end-to-end přes UI)

### Exact next prompt for Codex (Pavel zkopíruje):

```
Připrav produkční rollout plán pro Shoptet importer Phase 1.

Kontext:
- Staging (dxmowysntemfqfnanxua): Phase 1A/1B/1C kompletní, commit 2f0027e4.
- Produkce (xkzhjldrojjlrkezorey): NEDOTČENA.
- Viz docs/shoptet/SHOPTET_PHASE1_HANDOFF.md a CLAUDE.md sekce SHOPTET IMPORTER.

Úkol:
1. Read-only audit produkce: ověř zda existuje RESEND_API_KEY (EF secret), zkontroluj email_queue stav, ověř zda BOHEMIA partner řádek existuje.
2. Vytvoř detailní produkční rollout checklist (bez spuštění):
   - Přesný SQL pro každý krok (migrace apply, partner update)
   - Přesné příkazy pro EF deploy
   - Přesné instrukce pro Vault secret (bez tisku URL)
   - Smoke test plán: 1 testovací objednávka → 1 e-mail na veru.enge@gmail.com (ne reálným zákazníkům)
   - Rollback kroky
   - Pořadí kroků
3. Definuj, co musí Pavel výslovně schválit před každým krokem.
4. Neaplikuj nic na produkci.
5. Nespouštěj žádný produkční SQL.
6. Nenasazuj nic na produkci.
7. Nikdy netiskni: Shoptet export URL, API klíče, tokeny, hashe, plné reward kódy, e-maily zákazníků z CSV.
8. Vrať: rollout checklist, rollback plán, seznam věcí ke schválení Pavlem.
```

---

## Architektura a bezpečnostní pravidla

### Projektové identifikátory
- **Produkce:** `xkzhjldrojjlrkezorey` — `onemil.cz`
- **Staging:** `dxmowysntemfqfnanxua` — pouze lokální dev server (`localhost:5173` + `.env.staging`)

### Shoptet export URL — bezpečnostní pravidlo (absolutní)
- URL je uložena **výhradně v Supabase Vault** pod klíčem `shoptet_export_{partner_id}`.
- Nikdy v DB sloupcích, v logu, v HTTP response body, v terminálovém výstupu, v dokumentaci.
- Přístup jen přes `get_shoptet_export_url(partner_id)` — SECURITY DEFINER, service_role only.

### Import flow
```
Shoptet CSV export URL (Vault)
  → import-shoptet-orders EF
  → fetch CSV
  → parse + validate rows
  → create_partner_order_reward (per valid row, idempotent via external_order_id)
      → partner_reward_codes (status=issued)
      → email_queue (zákaznický e-mail s kódem)
  → shoptet_import_runs (summary)
  → shoptet_import_row_log (order kódy + outcomes, bez PII)
```

### Aktivace MioCoinů
- Kódy vytvořené importem jsou `status=issued`.
- Wallet credit nastane **až** při `redeem_miocoin_code(p_code)` — zákazník v aplikaci.
- Import sám o sobě NEPŘIDÁVÁ MioCoiny do peněženky.

### Email binding
- `redeem_miocoin_code` enforces: `coalesce(issued_to_email, customer_email)` = email volajícího uživatele.
- Pokud se neshoduje → `email_mismatch` → UI zobrazí "Tento kód je vázán na jiný e-mail."
- Toto je záměrná bezpečnostní funkce.

### Idempotence
- `create_partner_order_reward` je idempotentní přes UNIQUE constraint na `external_order_id`.
- Opakované spuštění importu pro stejné objednávky nevytvoří duplicity.

---

## Staging DB stav (27. 06. 2026)

### partner_reward_codes (6 kódů vytvořených Phase 1C)
- Všechny `status=issued`, `activated_at=null`, `activated_by_user_id=null`.
- Vázány na `veru.enge@gmail.com`.
- Nebyly uplatněny — kódy jsou funkční.

### email_queue
- 1 sent Shoptet Phase 1C e-mail (odeslaný na `veru.enge@gmail.com`)
- 0 pending
- 474 old E2E artefaktů ve stavu `failed`

### shoptet_import_runs
- 2 záznamy pro BOHEMIA: 1 dry-run + 1 live-write

---

## Soubory (commit `2f0027e4`)

```
supabase/migrations/20260624160000_shoptet_import_phase1a.sql
supabase/functions/set-shoptet-export-secret/index.ts
supabase/functions/import-shoptet-orders/index.ts
supabase/config.toml  (registrace EF)
```

---

## Produkční rollout — přehled kroků (plán, neaplikováno)

Pořadí je závazné. Každý krok vyžaduje výslovné schválení Pavla.

1. **pg_dump záloha** produkce před čímkoliv.
2. **Ověřit `RESEND_API_KEY`** v produkčních EF secrets (ne Vault) — bez něj import posílá e-maily přes `email_queue` ale EF `process-email-queue` by selhal.
3. **Ověřit `email_queue` stav na produkci** — ověřit, že žádné problematické pending e-maily nejsou ve frontě před enablem importeru.
4. **Aplikovat migraci** `20260624160000_shoptet_import_phase1a.sql` na produkci přes Supabase SQL Editor.
   - Postchecky: nové sloupce v `partners`, tabulky `shoptet_import_runs` + `shoptet_import_row_log` existují, RLS on, SECURITY DEFINER funkce existují, anon execute=false.
5. **Nasadit EF** `set-shoptet-export-secret` + `import-shoptet-orders` na produkci.
   - `verify_jwt=false` pro obě (interní auth přes x-internal-token / service-role / superadmin JWT).
   - Smoke: no-auth → 401.
6. **BOHEMIA Vault secret**: uložit BOHEMIA Shoptet export URL do produkčního Vault přes `set-shoptet-export-secret`. URL nikdy netisknout.
7. **BOHEMIA config**: nastavit `shoptet_import_enabled=true` + `shoptet_customer_delivery='email'` pro BOHEMIA na produkci.
8. **Produkční smoke test**:
   - Spustit `import-shoptet-orders` s přesně 1 testovací objednávkou.
   - Ověřit: 1 kód vytvořen, 1 e-mail ve `email_queue`.
   - Ověřit: e-mail odeslán na `veru.enge@gmail.com` (ne reálným zákazníkům z CSV).
   - Ověřit idempotenci: re-run → 0 nových kódů.
9. **Rollback plán** (pokud cokoliv selže):
   - DROP FUNCTION `set_shoptet_export_secret`, `get_shoptet_export_url`.
   - DROP TABLE `shoptet_import_runs`, `shoptet_import_row_log`.
   - ALTER TABLE `partners` DROP COLUMN `shoptet_import_enabled`, `shoptet_export_secret_name`, `shoptet_customer_delivery`.
   - DELETE Vault secret pro BOHEMIA.
   - EF deactivate/delete.

---

## Bezpečnostní připomínky (přetrvávají)

- **Rotovat exponované/test interní tokeny** před reálným launchem.
- **Rotovat produkční DB heslo** (appeared in chat during Phase 2 apply).
- **Nikdy necommitovat secrets** do repozitáře.
- **Nikdy tisknout:** Shoptet export URL, API klíče, tokeny, hashe, plné reward kódy, e-maily zákazníků z CSV.

---

## Testovací účty (staging reference)

| Účet | Role | Popis |
|------|------|-------|
| `eshop@onemil.cz` | Partner (e-shop) | BOHEMIA testovací e-shop strana |
| `veru.enge@gmail.com` | Zákazník | Příjemce testovacích MioCoin kódů |
| `admin-e2e@onemil.cz` | Scoped admin | Phase 2/3b permission specy |
| `superadmin-e2e@onemil.cz` | Superadmin | Admin-area E2E specy (přidán při infra cleanup) |
| `divispavel2@gmail.com` | Superadmin (produkce) | Reálný produkční superadmin |
