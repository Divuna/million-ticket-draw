
## Problém

Zákazník si koupí ticket, kupón se mu **uloží** do `/wins → Nabídky` (DB záznam v `user_partner_offers` vznikne správně), ale v ticket-result modalu **kupón nevidí** — modal ukáže jen číslo ticketu, ne zprávu „🎁 SPECIÁLNÍ NABÍDKA!". Zákazník tedy neví, že kupón vyhrál.

## Příčina

Frontend bug ve dvou souborech. `TicketResultModal` umí `partner_offer` zobrazit (`src/components/TicketResultModal.tsx`, větev `isPartnerOffer && result?.partner_offer`), a logika nákupu si nabídku správně načte z `user_partner_offers` do lokální proměnné `modalResult.partner_offer`. **Ale při předání do `<TicketResultModal result={...} />` se `partner_offer` zapomene přibalit:**

- `src/pages/Games.tsx`, řádky 470–479 — ručně se vypisuje `ticket_number, distance_to_next_bonus, next_bonus_position, won_prize, won_type, bonus_prize_id, remaining_tickets`, ale **chybí `partner_offer`**.
- `src/pages/FavoriteGames.tsx`, řádky 424–433 — stejný bug.
- `src/pages/ContestDetail.tsx` — **OK**, přes `stableResult` (ř. 591) `partner_offer` projde a modal ho zobrazí.

Tím pádem na `/games` a `/favorite-games` zákazník po nákupu kupón v modalu nikdy neuvidí, jen ho najde později v sekci Nabídky.

## Řešení

Dvouřádková oprava — do props `result` v obou modalech přidat jeden klíč `partner_offer: modalResult.partner_offer ?? null`. **Žádná změna logiky, žádná změna DB, žádná změna `assign_partner_offer_to_ticket`, žádná změna `buy_ticket_atomic`.** Jen propsání už načtených dat do komponenty, která je umí vykreslit.

### Soubory ke změně

1. `src/pages/Games.tsx` — v bloku `<TicketResultModal result={modalResult ? {...} : null}>` (ř. 471–479) přidat `partner_offer: modalResult.partner_offer ?? null,`.
2. `src/pages/FavoriteGames.tsx` — stejná úprava (ř. 425–433).

### Co se NEMĚNÍ

- `assign_partner_offer_to_ticket` (cooldown, rotace, eligibility) — beze změny.
- `buy_ticket_atomic`, RLS, schéma, ekonomika.
- `TicketResultModal.tsx` — už dnes umí offer vykreslit, jen čeká na data.
- `ContestDetail.tsx` — už funguje správně, nic se tam nedělá.
- `/wins → Nabídky` — funguje a ukládání zůstává beze změny.

## Důsledek

Po opravě: jakmile DB zákazníkovi nabídku přiřadí (dnes podle stávajících pravidel = první ticket po 5min cooldownu / rotace mezi partnery), v ticket modalu se okamžitě objeví karta „🎁 SPECIÁLNÍ NABÍDKA!" s logem partnera, názvem, krátkým textem a platností do. Zákazník tedy hned vidí, že vyhrál kupón, a stejný kupón najde i ve `/wins → Nabídky` (jako dnes).

Pokud DB v daném momentě žádnou nabídku nepřiřadí (cooldown, žádný platný offer v contestu), modal bude vypadat přesně jako dnes — žádná regrese.
