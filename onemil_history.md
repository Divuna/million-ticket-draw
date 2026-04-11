# OneMil — DEVELOPMENT HISTORY (CHRONOLOGICAL ONLY)

**Timestamp (Europe/Prague): 2026-04-09 19:44**

## Strict header (do not break)
### What belongs in this file
- Only **dated chronological history** (what happened and when).
- Keep entries short and factual; link to concrete artifacts (migrations, functions, pages) where possible.

### What must never be written here
- Current state summaries, invariants, "what is working/broken now" (belongs to `onemil_state.md`).
- Mixed state+history blocks or duplicated state dumps.
- Undated narrative dumps.

---

## 2026-02-08 — Partner Offers v1: reminder automation
- Edge Function `supabase/functions/send-offer-reminders/index.ts` present (documented as "Block F — send-offer-reminders").
- Uses DB RPC `get_due_offer_reminder_rows()` and updates `user_partner_offers.last_reminder_at`.
- Documents safety invariant: never touches `winners` / `bonus_prizes`.

## 2026-03-15 — Deep backend stabilization audit (recorded)
- Scope recorded: schema, SQL functions, triggers, migrations, wallet system, contest engine, ticket generation, bonus prize logic, event pipeline, push pipeline, edge functions.
- Fixes recorded as applied via six migrations:
  - `20260315240000_fix_bonus_prize_response.sql`
  - `20260315260000_cleanup_duplicate_triggers.sql`
  - `20260315270000_remove_redundant_ticket_trigger.sql`
  - `20260315280000_cleanup_winners_indexes.sql`
  - `20260315290000_additional_safety_constraints.sql`
  - `20260315300000_fix_bonus_wallet_ledger.sql`

## 2026-03-22 — E2E contest flow "final fix" (recorded)
- Result recorded: E2E success (tickets, contest close, winners, wallet, notifications).

## 2026-03-23 — OneMil ↔ Sofinity stabilization (recorded)
- Result recorded: pipeline stable, backlog processed, cron automation in place.

## 2026-03-30 — AI chat CTA follow-up detection regression (recorded)
- Issue recorded: follow-up messages not recognized as support intent → CTA "Kontaktovat podporu" disappears.
- Root cause recorded: `isSupportIntentForCta` too strict.

## 2026-04-08 to 2026-04-09 — Cursor session work (recorded)
- Temporary private-access gate work (`src/App.tsx`).
- SEO static assets + sitemap/robots production availability work (via commits).
- Admin contests list robustness work recorded (ensure contest list loads even if bonus-stats RPC fails).

## 2026-04-09 — Memory reconciliation correction pass
- Goal: keep clean state/history split and keep Partner Offers v1 treated as confirmed project context.
- Partner Offers section in `onemil_state.md` updated to distinguish:
  - confirmed project truth
  - confirmed in current repo snapshot
  - needs repo re-check later (narrow existence checks only)
- Note: Partner Offers details are considered **partially reconciled** until final E2E and a final documentation pass are completed.

---

## 2026-04-10 — Partner Offers v1 – finální E2E uzavření, wiring fix, token rotace, kanonický memory režim

### Shrnutí
Partner Offers v1 bylo v tomto chatu finálně uzavřeno.
Po dokončení bloků A–G proběhlo vícekolové E2E ověřování, během kterého byly potvrzeny reálné integrační vazby a opravena jedna chybějící produkční mezera: automatické napojení assignment logiky do `purchase-ticket`.

Výsledný stav:
**Partner Offers v1 PASSED finálním E2E.**

---

### 1. Výchozí stav na začátku tohoto úseku
Na začátku bylo považováno za hotové:
- Block A
- Block B
- Block C
- Block D
- Block E
- Block F
- Block G

Ale ještě nebylo finálně end-to-end potvrzené, že:
- assignment přes ticket purchase běží opravdu automaticky
- `won_type` gate funguje i na HTTP úrovni
- reminder pipeline má správně sjednocený internal token

---

### 2. E2E verifikace – plán a postup
Nejdřív byl zvolen menší, tokenově úsporný postup:
1. plán E2E
2. DB + admin smoke check
3. seed + assignment slice
4. finální HTTP-level integrační test

Tím se zabránilo zbytečně velkým promptům a zbytečnému spalování tokenů.

---

### 3. DB + admin smoke check
Bylo potvrzeno:
- Block G DB objekty existují
- funkce jsou callable
- `partner_invoices.type` existuje
- `partner_offer_activations.invoiced` a `invoice_id` existují
- `get_admin_activation_summary()` funguje
- `sync_partner_offer_activations()` funguje
- TypeScript build je čistý
- admin UI compile smoke je OK

V této fázi byl nalezen jeden blocker:
- `send-offer-reminders` vracel 401

---

### 4. Block F – internal token blocker
Bylo potvrzeno, že:
- `INTERNAL_FUNCTION_TOKEN` neodpovídal mezi prostředími
- reminder function kvůli tomu vracela 401
- cron na reminder běh tím pádem selhával

#### Zjištěné body
Používaly se tři místa:
- Supabase secret `INTERNAL_FUNCTION_TOKEN`
- lokální `.env` `VITE_INTERNAL_FUNCTION_TOKEN`
- cron joby s hardcoded tokenem

#### Provedená oprava
Byl vygenerován nový silný token a proběhla rotace:
- přepsán token v pg_cron `send_offer_reminders_daily`
- přepsán token v pg_cron `process-event-queue`
- ručně sjednocen `.env`
- ručně sjednocen Supabase secret `INTERNAL_FUNCTION_TOKEN`

Poté proběhla hygienická kontrola:
- starý token už se nikde nevyskytoval

#### Ověření po opravě
Test:
- `send-offer-reminders`

Výsledek:
- HTTP 200
- `{"success":true,"emails_queued":0,"offers_touched":0}`

Závěr:
**Block F blocker odstraněn.**

---

### 5. Seed + assignment flow audit
Byl proveden řízený test assignment vrstvy.

Potvrzeno:
- `assign_partner_offer_to_ticket(...)` funguje správně při ručním volání
- `user_partner_offers` vzniká správně
- `status = active`
- `ticket_id` FK funguje správně při reálném ticket UUID
- cooldown vrací `NULL`
- `last_assigned_at` se aktualizuje
- `sync_partner_offer_activations()` vytváří activation rows

V této fázi se ale ukázalo:
- assignment RPC existuje
- ale **nevolá ho nic automaticky při ticket purchase**

To byl skutečný chybějící blok.

---

### 6. Kritický fix – chybějící wiring v purchase-ticket
Bylo rozhodnuto pro správné řešení:
- **Option B**
- napojit assignment do:
  - `supabase/functions/purchase-ticket/index.ts`

Výslovně bylo zakázáno:
- měnit `buy_ticket_atomic`
- přidávat DB trigger na `tickets`
- sahat na `winners`
- sahat na `bonus_prizes`

#### Implementace
Změněn pouze:
- `supabase/functions/purchase-ticket/index.ts`

Přidaná logika:
- po úspěšném `buy_ticket_atomic`
- pokud `data.success === true && data.won_type === null`
- zavolá se:
  - `assign_partner_offer_to_ticket(...)`
- předá se:
  - `ticket_row_id` jako `p_ticket_id`
- chyba je non-fatal
- response pro uživatele zůstává stejná

Tím byl dokončen chybějící wiring v Block D.

---

### 7. Finální HTTP-level integrační test
Po wiring fixu proběhl finální skutečný integrační test přes:
- reálné HTTP volání `purchase-ticket`
- reálné JWT

#### Positive path
Potvrzeno:
- při `won_type = null` vznikne nový `user_partner_offers`
- `ticket_id` v UPO odpovídá `ticket_row_id` z response
- response body zůstává beze změny

#### Negative path
Potvrzeno:
- při `won_type = 'bonus'` **nevznikne žádné UPO**
- gate funguje správně

#### Finální závěr testu
**Partner Offers v1 PASSED finálním E2E ověřením.**

---

### 8. Praktický výsledek po E2E
Bylo finálně potvrzeno:
- assignment flow funguje
- cooldown funguje
- `ticket_id` wiring funguje
- `last_assigned_at` se aktualizuje
- `won_type` gate blokuje assignment pro výherce
- user response zůstává nedotčená
- activation sync funguje
- reminder token problem byl vyřešen

Nebyl nalezen žádný nový produkční blocker.

---

### 9. Kanonické memory soubory – nové pracovní pravidlo
Během chatu byl zjištěn problém, že Cursor / Claude používaly různé memory soubory a staré workspaces.

Bylo sjednoceno nové pravidlo pro OneMil:

Kanonická složka:
`C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw`

Kanonické soubory:
- `onemil_state.md`
- `onemil_history.md`
- `CLAUDE.md`

Potvrzeno:
- workspace byl přepnut správně na `million-ticket-draw`
- další OneMil zápisy se mají dělat už jen sem
- staré `ProjectsBundle\onemil` se bere jen jako legacy reference, ne jako aktivní místo zápisu

---

### 10. Stav na konci
Partner Offers v1 je považováno za:
- implementované
- nasazené
- dopojené
- end-to-end otestované
- uzavřené jako hotový modul v rámci v1

Mimo v1 nadále zůstává:
- `category_contests`

---

### 11. Další krok
Další práce už nemá znovu otevírat architekturu Partner Offers v1.

Správný další krok:
1. jen případné bugfixy z běžného provozu
2. nebo další samostatný modul mimo Partner Offers

---

### Důležité varování pro další chat
Další asistent NESMÍ:
- znovu vracet Partner Offers do `winners`
- znovu vracet Partner Offers do `bonus_prizes`
- přidávat novou bottom položku
- znovu míchat billing do `partner_offers`
- znovu otevírat Blocks A–G bez důvodu
- ignorovat, že finální E2E už proběhlo úspěšně
- zapisovat OneMil stav mimo:
  - `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_state.md`
  - `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_history.md`

---

## 2026-04-10 — Block E frontend implementace a nasazení

### Co bylo provedeno
Po post-deploy auditu bylo zjištěno, že Block E (user UI pro Nabídky) existoval v paměti, ale soubory chyběly v repozitáři.

Byly vytvořeny a commitnuty tyto soubory:
- `src/components/OfferCard.tsx` — nový
- `src/components/OfferDetailModal.tsx` — nový
- `src/pages/Wins.tsx` — aktualizován (přidán tab switcher Výhry / Nabídky)

### Chování implementace
- Nabídky čtou z `user_partner_offers` kde `status = active` AND `hidden_at IS NULL`
- Otevření detailu zapisuje `opened_at` (non-fatal)
- Skrytí zapisuje `hidden_at` → DB trigger Block F automaticky odešle systémovou zprávu do `messages`
- Skrytá nabídka okamžitě zmizí ze seznamu
- Tab switcher Výhry / Nabídky je uvnitř `/wins` — bottom menu zůstalo `Výhry`
- Partner display name: `company_name ?? name`
- Zobrazuje `valid_to`

### Build výsledek
- `npm run build` → exit code 0
- Žádné nové TypeScript ani import chyby

### Commit
- `b7aa4ce` — `feat: Block E – add Nabídky tab to /wins with OfferCard and OfferDetailModal`
- Pushnut do `main`

---

## 2026-04-10 — Odstranění dočasného private-access gate v App

- V `src/App.tsx` odstraněn email allowlist (`divispavel2@gmail.com`), `isLockExemptRoute` / `isLocked` a celá obrazovka „Web je momentálně neveřejný“; role redirecty v `useEffect` beze změny logiky kromě odstranění early return kvůli locku.
- Ověřeno lokálně: `npm run build` — Vite production build dokončen úspěšně (`✓ built`).
