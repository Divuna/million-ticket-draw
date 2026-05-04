## Diagnóza

Nákup tiketu padá s chybou `57014: canceling statement due to statement timeout` po ~8.5 sekundy. Soutěž je čerstvá (0/100 prodaných tiketů), takže to není zámek řádku ani „contest full". DB pohled potvrdil:

- contest `3a5ce8cd…` je `active`, `next_ticket_number=1`, ticket_price=20
- wallet uživatele má 16 902 MC (dostatek)
- na tabulce `tickets` visí **více triggerů**, které se spouštějí při INSERT uvnitř `buy_ticket_atomic`:
  - `trg_ticket_insert` → `fn_send_event_to_sofinity` — dělá **synchronní `net.http_post`** na vlastní edge funkci `send_event_to_sofinity`
  - `trg_assign_offer_on_ticket_insert` → `assign_partner_offer_to_ticket`
  - `audit_tickets_trigger` → `fn_audit_generic` (zápis do `audit_logs`)
  - dále event_logs / winners triggery

### Hlavní podezřelý

`fn_send_event_to_sofinity` volá `net.http_post(...)` synchronně uvnitř transakce nákupu tiketu. Pokud `pg_net` worker stojí, je zahlcený, nebo edge funkce odpovídá pomalu, **celá transakce `buy_ticket_atomic` čeká** a po 8 s ji Postgres zruší. To přesně sedí na pozorovaný 8.5 s timeout a 500 Internal Server Error.

Architektonicky je to navíc špatně — projekt už má pipeline `event_logs → event_queue → Sofinity` (worker `process_event_queue_worker`), takže synchronní HTTP přímo z triggeru je duplicitní a nebezpečný (každý nákup tiketu = blokující externí volání).

## Plán opravy

### Krok 1 — okamžitě odblokovat nákup tiketů
Přepsat `fn_send_event_to_sofinity` tak, aby místo synchronního `net.http_post` jen vložila řádek do `event_queue` (případně `event_logs`, podle toho, co worker konzumuje). Tím se transakce nákupu tiketu okamžitě dokončí a forwarding do Sofinity poběží asynchronně přes existující worker.

Záložní varianta (pokud nebude jasné, kterou tabulku worker čte): celé volání obalit do `BEGIN … EXCEPTION WHEN OTHERS THEN NULL; END;` s krátkým `statement_timeout` (např. 1 s) lokálně, aby selhání externí funkce nikdy neshodilo nákup.

### Krok 2 — ověřit
Po nasazení migrace zkusit nákup tiketu v soutěži CORVETTE. Očekávaná latence < 500 ms. Zkontrolovat, že:
- `tickets` má nový řádek
- `wallets.balance_coins` se snížil o 20
- `event_logs` / `event_queue` má `prize_won`/`ticket_purchased` záznam (podle existující logiky)
- Sofinity worker ho zpracuje v dalším běhu

### Krok 3 — preventivně
Projít ostatní triggery na hot-path tabulkách (`wallets`, `winners`) a ujistit se, že žádný další nedělá synchronní externí HTTP. Pokud ano, přepsat stejným vzorem.

## Co se NEbude měnit
- `buy_ticket_atomic` RPC samotná (chráněné jádro)
- `assign_partner_offer_to_ticket` a její trigger
- ekonomická pravidla (cena, limity)
- RLS policies
- schéma tabulek

## Soubory / migrace
- nová migrace v `supabase/migrations/` přepisující `public.fn_send_event_to_sofinity` (CREATE OR REPLACE FUNCTION)
- migrace bude jen jako soubor, podle pravidla projektu se aplikuje ručně v Supabase SQL Editoru po schválení

Po schválení přepnu do build módu, vytvořím migraci a požádám o její aplikaci v SQL Editoru.