# OneMil — schválený návrh výsledku tiketu

## Stav
Tento dokument popisuje schválený vizuální směr výsledkového okna po otevření/koupi tiketu.

Referenční PNG má být v repozitáři uložené zde:

`docs/design-references/ticket-result-approved.png`

## Závazná implementační pravidla

- Referenční PNG slouží pouze jako vizuální vzor. Nesmí se vložit do aplikace jako screenshot výsledkového okna.
- UI musí být vytvořené jako skutečné React/Tailwind komponenty s reálnými dynamickými daty.
- Funkčnost se nesmí měnit.
- Nesmí se měnit nákupní logika, RPC, databázové operace, určování výherních pozic, výherní stav, cena tiketu, wallet logika, claim výhry ani ukládání výsledku.
- Změny mají být pouze prezentační: layout, spacing, barvy, typografie, okraje, stíny, ikony a pořadí prezentačních bloků, pokud to nemění logiku ani dostupná data.
- Stejný vizuální systém musí používat `src/components/TicketResultModal.tsx` i `src/components/MysteryPurchaseResultDialog.tsx`, aby různé typy tiketů nepůsobily jako dvě různé aplikace.
- Zachovat všechny existující výsledkové stavy: nevýherní tiket, bonusová věcná výhra, MioCoin výhra, hlavní výhra, partner offer a mystery kupon.
- Zachovat všechny stávající podmínky zobrazení a datové zdroje.

## Schválený vizuální směr

- světlý OneMil styl
- warm cream / bílá plocha
- tmavý text
- oranžová `#F97316` / `#FF8A00` jako hlavní akcent
- jemné amber detaily
- čistý prémiový modal
- dominantní informace o výsledku tiketu
- u nevýherního stavu jasné `TENTOKRÁT BEZ VÝHRY`
- dominantní blok `DALŠÍ VÝHERNÍ TIKET` s počtem tahů, když je tato hodnota skutečně dostupná
- pokud je vzdálenost malá a dává to smysl, vizuální postup 1 → 2 → 3 → ... → výherní pozice
- kupon jako samostatná čistá karta s existujícím reálným obsahem
- výrazné oranžové tlačítko `Pokračovat`
- mobil-first a bez horizontálního přetečení

## Bezpečnostní kontrola před mergem

Před dokončením porovnat diff a potvrdit, že nebyly změněny:

- `buy_ticket_atomic` ani jiné purchase RPC
- Supabase migrace / SQL
- wallet nebo MioCoin účetní logika
- určování `won_type`, `won_prize`, `ticket_number`, `distance_to_next_bonus`
- zápis do `tickets`, `winners`, `bonus_prizes`
- claim nebo redeem funkce
- ceny a odečítání zůstatku

Pokud je k dosažení vzhledu potřeba měnit některou z těchto oblastí, změnu neprovádět a nejprve ji nahlásit.
