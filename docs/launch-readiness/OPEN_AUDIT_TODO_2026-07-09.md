# OneMil — Open audit TODO po PR #162

Datum: 2026-07-09  
Typ: dokumentace / launch readiness  
Produkce dotčena: NE

## Uzavřeno

- PR #162 byl squash mergnutý do `main`.
- Merge commit: `68b143e463ce5d22a5030431ca48cb135655471f`.
- Public vouchery se řídí skutečně volnými `voucher_codes` přes `get_public_available_vouchers()`.
- `buy_voucher_atomic` neodečte MioCoiny bez vydání kódu.
- UI používá `available_code_count`.
- Staging ověření prošlo.

## Zbývá dořešit / znovu ověřit před live

| ID | Priorita | Oblast | Úkol | Očekávaný výsledek | Stav | Poznámka |
|----|----------|--------|------|--------------------|------|----------|
| OA01 | P0 | Stripe / platby | Znovu ověřit Stripe idempotence po aktuálním `main` | Opakovaný webhook nevytvoří druhou platbu ani druhý credit | neověřeno po PR #162 | Navázat na PAY02/PAY04, ověřit proti aktuálnímu stavu větve |
| OA02 | P0 | Paralelní dobíjení | Ověřit souběžné dokončení / retry platby | Peněženka se navýší přesně jednou za jednu Stripe session | neověřeno | Staging-only, bez produkční platby |
| OA03 | P0 | Paralelní nákup ticketu | Ověřit souběžný nákup ticketu více požadavky | Nevydá se duplicitní ticket, peněženka se neodečte špatně | neověřeno | Staging-only, chránit contest/wallet logiku |
| OA04 | P0 | Hlavní výhra | Ověřit hlavní výhru na posledním ticketu po aktuálním `main` | Poslední ticket správně vytvoří main winner a uzavře soutěž | neověřeno po PR #162 | Staging-only, destruktivní test nesmí běžet v produkci |
| OA05 | P1 | OneSignal / push | Ověřit push pipeline `notifications` → `push_log` → OneSignal | Push se zapíše a odešle podle očekávání | neověřeno | Navazuje na SEC03 v LAUNCH_TODO |

## Pravidla pro další práci

- Všechny destruktivní testy dělat pouze na stagingu.
- Produkční Supabase se nesmí měnit bez výslovného schválení Pavla.
- Peněženky, platby, Stripe, RLS a soutěžní logika vyžadují samostatný schválený krok.
- Po každém PR nejdřív staging ověření, pak samostatný merge pokyn.
