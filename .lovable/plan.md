## Diagnóza (na základě live DB dat)

### Co skutečně víme

1. **RPC `buy_ticket_atomic` doběhne úspěšně.** V contestu `15a67cda…` byl ticket #1 vložen (`tickets.created_at = 11:41:04.271`), `contests.next_ticket_number` se posunul na 2, wallet byl odepsán. Proběhl i trigger `on_coin_redeemed` (do `event_queue` se založil řádek `coin_redeemed`).
2. **Klient ale dostal `500 / 57014` po ~8.5 s.** PostgREST `authenticator` má `statement_timeout = 8 s`; RPC běžela déle a request byl klientovi zrušen. Server transakci ale dokončil = **„fantom" nákup** (peníze pryč, ticket existuje, UI ukáže chybu).
3. **Souborový worker `event_queue` selhává s 401** (samostatný issue, nebrzdí nákup, ale potvrzuje že async pipeline jede).

### Co RPC zpomaluje (na hot-path INSERT do `tickets`)

Aktuálně visí na `public.tickets` AFTER INSERT triggers:

| Trigger | Funkce | Problém |
|---|---|---|
| `audit_tickets_trigger` | `fn_audit_generic` | INSERT do `audit_logs` s celým `to_jsonb(NEW)` — rychlé, ale spouští **`audit_logs` triggery**, viz níže |
| `on_coin_redeemed` | `trigger_coin_redeemed` → `notify_sofinity_event` | ✅ správně async — jen INSERT do `event_queue` |
| `trg_assign_offer_on_ticket_insert` | `assign_partner_offer_to_ticket` | čistý SQL, rychlý |
| `trg_ticket_insert` | `fn_send_event_to_sofinity` | ❌ volá `net.http_post` synchronně (čeká na pg_net background worker pickup) |

A na `event_logs` jsou **dva identické triggery** (duplicita — pravděpodobně historický rename, nikdy se neuklidil):

- `trg_enqueue_notifications_from_event_logs` → `enqueue_notifications_from_event_logs`
- `trg_event_logs_notifications` → `enqueue_notifications_from_event_logs` (tatáž funkce!)

Každý INSERT do `event_logs` tedy běží **2× stejnou logiku** (2× `EXISTS` lookup + 2× INSERT do `notifications`). Pokud něco z hot-path píše do `event_logs`, dostáváme 2× zbytečnou práci a 2× šanci na zámek.

### Jak to fungovalo „dřív"

`trigger_coin_redeemed` (existuje a funguje) volá `notify_sofinity_event`, která **jen INSERTuje do `event_queue`** a vrátí. To je správný vzor — externí HTTP řeší async worker (`process_event_queue_worker`).

`fn_send_event_to_sofinity` (na `tickets`/`winners`/`contests`) je starší duplicitní cesta, která místo enqueue dělá `net.http_post` přímo. To je ten zbytečný a riskantní krok.

---

## Plán opravy

### Krok 1 — DB migrace (jediný soubor)

Vytvořit migraci `supabase/migrations/<timestamp>_unify_sofinity_pipeline.sql`:

1. **Odstranit duplicitní trigger** na `event_logs`:
   ```sql
   DROP TRIGGER IF EXISTS trg_enqueue_notifications_from_event_logs ON public.event_logs;
   ```
   (ponecháváme `trg_event_logs_notifications` — jeden je dost)

2. **Přepsat `fn_send_event_to_sofinity`** tak, aby místo `net.http_post` volala `notify_sofinity_event` (= jen enqueue do `event_queue`). Logika výběru `event_name` a `metadata` podle `TG_TABLE_NAME` (tickets / winners / contests) zůstává; obal celého těla do `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING; RETURN NEW; END;` aby selhání nikdy neshodilo nákup. Worker `process_event_queue_worker` pak event vyzvedne a pošle do Sofinity stejně jako dnes pro `coin_redeemed`.

3. **Nic jiného neměnit:**
   - `buy_ticket_atomic` — nedotýkat se
   - `assign_partner_offer_to_ticket` + jeho trigger — nedotýkat se
   - `fn_audit_generic`, `trigger_coin_redeemed`, `notify_sofinity_event` — nedotýkat se
   - žádné schema/RLS změny

Migrace bude **jen jako soubor v repu**, podle pravidla projektu se aplikuje ručně v Supabase SQL Editoru po schválení.

### Krok 2 — ověření v produkci

Po aplikaci migrace:

1. Klikneš v UI „Koupit tiket" v testovací soutěži.
2. Očekávaná latence: < 500 ms, žádný 500/57014.
3. Kontrolní dotazy (umím spustit):
   - `tickets` má nový řádek s incrementovaným `number`
   - `contests.next_ticket_number` posunutý
   - `wallets.balance_coins` snížený o `ticket_price`
   - `event_queue` má nový pending řádek `ticket_purchased` (od `fn_send_event_to_sofinity`) i `coin_redeemed` (od `trigger_coin_redeemed`)
   - `audit_logs` má INSERT řádek pro `tickets`

### Krok 3 — úklid „fantom" tiketu z 11:41

Ticket #1 v contestu `15a67cda…` byl reálně vložen, ale uživatel ho v UI neviděl jako úspěch. Po opravě se rozhodneš:
- nechat tak (uživatel ho má — vše OK ekonomicky), nebo
- vrátit MioCoiny + smazat ticket + vrátit `next_ticket_number`. Pokud chceš, připravím samostatný cleanup script (mimo tuto migraci).

### Krok 4 — preventivně

- Worker `event_queue` aktuálně padá s 401 Unauthorized při volání edge funkce — to je samostatný issue (špatný service-role token / chybí internal token header). Doporučuju řešit v separátním ticketu, nesouvisí s nákupem tiketu.
- Doporučuju přidat na contestu ještě hard read-only test (jednou po deployi): `SELECT count(*) FROM tickets WHERE contest_id=…` proti `next_ticket_number-1` — žádná divergence.

---

## Co se NEbude měnit

- `buy_ticket_atomic` RPC
- `assign_partner_offer_to_ticket` + trigger
- ekonomická pravidla (cena, limity, 1M ticket cap)
- RLS policies
- schéma tabulek (žádné ALTER/RENAME/DROP)
- `event_queue` worker (řeší se separátně)

## Soubory

- **Nový soubor:** `supabase/migrations/<timestamp>_unify_sofinity_pipeline.sql` — DROP duplicitního triggeru + CREATE OR REPLACE FUNCTION `fn_send_event_to_sofinity` (async enqueue + bezpečný EXCEPTION wrapper).
- Žádné změny ve frontend kódu.
- Žádné změny v edge funkcích.

Po schválení přepnu do build módu, vytvořím migraci a požádám o její aplikaci v Supabase SQL Editoru.
