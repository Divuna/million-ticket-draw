# Všeobecné obchodní podmínky

## Aktuální znění

**Jednoznačné, bez konfliktu.** Zdrojem je `VSEOBECNE_OBCHODNI_PODMINKY.md` v této složce.

**25. 9. 2026 (schváleno Pavlem):** bod 8 „Zakoupený kredit nelze vrátit.“ nahrazen zněním o vrácení
nevyužité placené části MIO do 14 dnů (nadpis „Vrácení platby za MIO“), bod 4 přejmenován na „MIO“.
Publikováno **jen na staging**; produkční `content_pages` drží do schválení nasazení původní znění
(md5 `ba3f4b02…`, 712 znaků) — rozdíl GitHub × produkční CMS je tedy záměrný a známý.

| | |
|---|---|
| Zdroj | produkční `content_pages`, `section='legal'`, `slug='vop'` |
| Veřejná adresa | `/vop` (`/terms` redirectuje sem) |
| Délka | 712 znaků |
| Poslední úprava | 29. 4. 2026 |
| Editace | `/admin/content` |

`OneMil_VOP.pdf` v kořeni repozitáře je jeho export z 1. 5. 2026 se **shodným obsahem** — není to
konkurenční verze, ale není ani autoritativní; viz [`../HISTORICKE_SOUBORY.md`](../HISTORICKE_SOUBORY.md).

## Známé nedostatky — `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`

Text má 712 znaků a deset holých vět. Pro spotřebitelské podmínky to nestačí. Chybí zejména:

- **identifikace provozovatele** — firma, IČO, sídlo, zápis v OR. Údaje jsou v `COMPANY_CONTEXT.md`
  a na `/kontakt`, ale ve VOP samotných ne.
- ~~odstoupení od smlouvy u MIO~~ — řešeno bodem 8 (25. 9. 2026, staging),
- **reklamační řád**,
- **řešení sporů** — mimosoudní řešení, ČOI,
- **změna podmínek** — jak a s jakým předstihem,
- **aktuální produktový model** — staré VOP nepopisují garantovaný nákupní benefit pořizovaný za MIO + 1 soutěžní tiket zdarma,
- **platnost placeného MIO** — potvrzený produktový záměr 12 měsíců od konkrétního dobití vyžaduje právní schválení a před zveřejněním také technickou implementaci.

### ✅ (vyřešeno 25. 9. 2026 na stagingu) Dřívější věcný rozpor s tím, co aplikace umí

Bod 8 zní: *„Zakoupený kredit nelze vrátit."*

Aplikace ale refundace **umí a používá** — Edge Function `stripe-refund` a RPC
`prepare_stripe_refund`, které odečtou celý připsaný počet MIO včetně balíčkového bonusu.
Veřejný text tedy tvrdí něco jiného, než systém dělá. `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`

## Co je naopak v pořádku

- 18+ omezení odpovídá vynucené kontrole při registraci (povinný checkbox i pro OAuth).
- Popis MIO („digitální kredit použitelný pouze v aplikaci a nelze jej vyplatit") odpovídá
  `ONEMIL_BUSINESS_CONTEXT.md` §8.
- Popis principu soutěže (postupné přidělování, hlavní výhra na posledním tiketu) odpovídá
  produkční logice.
- Konkrétní čísla bonusových výherních pozic se podle aktuálního potvrzeného modelu účastníkům předem nezobrazují; starší formulace tvrdící, že jsou pozice zveřejněné v pravidlech, jsou zastaralé.
