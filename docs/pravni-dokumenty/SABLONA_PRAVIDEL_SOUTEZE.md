# Šablona pravidel soutěže OneMil

**Jediná autoritativní šablona pro pravidla všech budoucích soutěží OneMil.**

Vychází výhradně z `ONEMIL_BUSINESS_CONTEXT.md`, `COMPANY_CONTEXT.md`, skutečné produkční logiky
a potvrzených rozhodnutí projektu. **Nezavádí žádnou novou obchodní ani právní podmínku.**

Nikdy nepoužívej jako výchozí bod pravidla jiné soutěže ani `OneMil_Pravidla_souteze.pdf` v kořeni
repozitáře — ten obsahuje nevyplněné placeholdery a je historický.

---

## Proměnné

Vše v `{{…}}` se musí vyplnit. **Žádná nesmí zůstat nevyplněná ve finálním PDF.**

| Proměnná | Odkud se bere |
|---|---|
| `{{NAZEV_SOUTEZE}}` | `contests.title` |
| `{{CONTEST_ID}}` | `contests.id` |
| `{{VERZE_PRAVIDEL}}` | ručně, začíná `1.0` |
| `{{DATUM_VYDANI}}` | datum vydání této verze pravidel |
| `{{DATUM_ZAHAJENI}}` | datum aktivace soutěže |
| `{{ZPUSOB_UKONCENI}}` | typicky „vydáním posledního tiketu"; jiný způsob musí potvrdit Pavel |
| `{{UZEMI_SOUTEZE}}` | **Pavel** — nelze zjistit ze systému |
| `{{POCET_TIKETU}}` | `contests.ticket_count` |
| `{{PODMINKA_ZISKANI_TIKETU}}` | `contests.ticket_price` v MioCoinech |
| `{{HLAVNI_VYHRA}}` | `contests.main_prize` |
| `{{SPECIFIKACE_HLAVNI_VYHRY}}` | **Pavel** — přesná specifikace, model, výbava, barva |
| `{{HODNOTA_HLAVNI_VYHRY}}` | **Pavel** |
| `{{BONUSOVE_VYHRY}}` | `bonus_prizes` — věcné i MioCoinové |
| `{{ZPUSOB_PREDANI}}` | **Pavel** |
| `{{LHUTA_PRO_REAKCI_VYHERCE}}` | **Pavel** |
| `{{LHUTA_PRO_PREDANI}}` | **Pavel** |
| `{{NAKLADY_SPOJENE_S_PREDANIM}}` | **Pavel** — kdo hradí dopravu, registraci, daň |
| `{{POSTUP_PRI_NEVYZVEDNUTI}}` | **Pavel** |
| `{{ZVLASTNI_PODMINKY}}` | **Pavel**, jinak „Neuplatňují se." |

---

## Pevné principy — needitovat bez nové právní kontroly

Následující platí pro **každou** soutěž OneMil a nesmí se v konkrétních pravidlech měnit:

1. Účastník musí být **18+**.
2. Soutěž má **pevný počet tiketů**.
3. Tikety se přidělují **postupně** v pořadí 1, 2, 3, …
4. Hlavní výhru získává **držitel posledního tiketu**.
5. Hlavní výhra **není určována následným losováním**.
6. **Každá soutěž má vlastní pravidla** a vlastní PDF; sdílený generický soubor je zakázaný.
7. **MioCoin nelze vyplatit** ani směnit zpět za peníze.
8. Veřejná terminologie **nesmí** OneMil popisovat jako hazard, casino, sázení, betting, gambling,
   jackpot ani podobně (`ONEMIL_BUSINESS_CONTEXT.md` §10).
9. Soutěž **nesmí být `active` bez PDF pravidel** (vynuceno triggerem
   `trg_contest_active_requires_rules_pdf` od 7. 9. 2026).

> **Změní-li se kterýkoli z principů 1–5, nestačí doplnit novou výhru do šablony.**
> Je to změna podstaty soutěže a **vyžaduje novou právní kontrolu.**

---

# ŠABLONA — text pravidel

> Vše níže se kopíruje do dokumentu soutěže a vyplní. Poznámky v `>` blocích se do finálního
> dokumentu **nepřenášejí**.

---

## PRAVIDLA SOUTĚŽE {{NAZEV_SOUTEZE}}

**Verze pravidel:** {{VERZE_PRAVIDEL}}
**Datum vydání:** {{DATUM_VYDANI}}
**Identifikátor soutěže:** {{CONTEST_ID}}

### 1. Pořadatel soutěže

Pořadatelem soutěže je společnost **iCONIC POINT s.r.o.**, IČO 17795851, DIČ CZ17795851,
se sídlem Na Folimance 2155/15, Vinohrady, 120 00 Praha 2, zapsaná v obchodním rejstříku vedeném
Městským soudem v Praze, oddíl C, vložka 376856 (dále jen „pořadatel").

Kontaktní e-mail: podpora@onemil.cz

> Údaje pocházejí z `COMPANY_CONTEXT.md`. Při jejich změně se musí aktualizovat i tato šablona.

### 2. Doba trvání soutěže

Soutěž začíná {{DATUM_ZAHAJENI}} a končí {{ZPUSOB_UKONCENI}}.

Soutěž probíhá na území: {{UZEMI_SOUTEZE}}

### 3. Účast v soutěži

Soutěže se může zúčastnit pouze fyzická osoba starší 18 let s registrovaným uživatelským účtem
v aplikaci OneMil.

Věk se potvrzuje při registraci. Účast není podmíněna souhlasem s marketingovým sdělením.

> `VYŽADUJE PRÁVNÍ SCHVÁLENÍ` — případné vyloučení osob v pracovním či obdobném poměru
> k pořadateli a osob jim blízkých není dnes v systému nijak vynuceno. Pokud se má uplatnit,
> musí to potvrdit právník a Pavel.

### 4. Princip soutěže

Soutěž má pevně stanovený počet **{{POCET_TIKETU}}** tiketů.

Tikety se účastníkům přidělují **postupně v pevně daném pořadí** 1, 2, 3 … Účastník vždy obdrží
následující dostupný tiket. Pořadí tiketů není účastníkům předem zobrazováno.

Získání tiketu je podmíněno: {{PODMINKA_ZISKANI_TIKETU}}

**Hlavní výhru získává držitel posledního tiketu soutěže.** Hlavní výhra není určována následným
losováním ani náhodným výběrem.

### 5. Výhry

**Hlavní výhra:** {{HLAVNI_VYHRA}}

Specifikace: {{SPECIFIKACE_HLAVNI_VYHRY}}

Hodnota výhry: {{HODNOTA_HLAVNI_VYHRY}}

**Bonusové výhry:** {{BONUSOVE_VYHRY}}

Bonusové výhry jsou přiřazeny k předem určeným tiketům. Konkrétní seznam bonusových výher je
uveden v aplikaci u dané soutěže. Pozice bonusových výher nejsou účastníkům předem zobrazovány.

Věcné výhry nelze směnit za peníze.

### 6. MioCoin

MioCoin je digitální kredit použitelný výhradně v aplikaci OneMil. **MioCoin nelze vyplatit
v penězích ani směnit zpět za peníze** a nelze jej převádět mimo OneMil.

### 7. Oznámení výhry a předání

Výherce je informován prostřednictvím aplikace nebo e-mailem na adresu uvedenou u jeho účtu.

Výherce je povinen reagovat do {{LHUTA_PRO_REAKCI_VYHERCE}} a poskytnout údaje nutné k předání
výhry.

Způsob předání: {{ZPUSOB_PREDANI}}
Lhůta pro předání: {{LHUTA_PRO_PREDANI}}
Náklady spojené s předáním: {{NAKLADY_SPOJENE_S_PREDANIM}}

Nevyzvednutá nebo nepřevzatá výhra: {{POSTUP_PRI_NEVYZVEDNUTI}}

> `VYŽADUJE PRÁVNÍ SCHVÁLENÍ` — zdanění výhry a povinnosti pořadatele podle zákona o daních
> z příjmů nejsou v této šabloně řešeny a musí je potvrdit právník.

### 8. Osobní údaje

Osobní údaje účastníků zpracovává pořadatel jako správce v rozsahu a za podmínek uvedených
v Zásadách zpracování osobních údajů dostupných na `https://onemil.cz/gdpr`.

### 9. Zvláštní podmínky

{{ZVLASTNI_PODMINKY}}

### 10. Závěrečná ustanovení

Tato pravidla jsou závazná pro danou soutěž a jsou dostupná u soutěže v aplikaci OneMil.

Pořadatel si vyhrazuje právo soutěž ukončit nebo pravidla změnit v případě závažných důvodů,
zejména při technické poruše nebo zneužití systému. Změna pravidel se vydává jako nová verze
s uvedením data vydání; předchozí verze zůstávají dohledatelné.

Na výhru není právní nárok. Účastí v soutěži účastník potvrzuje, že se seznámil s těmito pravidly.

> `VYŽADUJE PRÁVNÍ SCHVÁLENÍ` — rozsah práva pořadatele soutěž ukončit či pravidla změnit
> je vůči spotřebiteli citlivý a musí ho potvrdit právník.

---

## Kontrolní seznam před vydáním PDF

- [ ] žádná proměnná `{{…}}` nezůstala nevyplněná
- [ ] `{{POCET_TIKETU}}` odpovídá `contests.ticket_count`
- [ ] `{{PODMINKA_ZISKANI_TIKETU}}` odpovídá `contests.ticket_price`
- [ ] `{{HLAVNI_VYHRA}}` odpovídá `contests.main_prize`
- [ ] `{{BONUSOVE_VYHRY}}` odpovídá skutečným `bonus_prizes` dané soutěže
- [ ] dokument neobsahuje zakázanou terminologii (casino, hazard, sázení, jackpot, gambling…)
- [ ] Word i PDF jsou uložené v `docs/pravni-dokumenty/souteze/{{NAZEV_SOUTEZE}}/`
- [ ] PDF nahrané do `rules_pdf_url` je **totožné** s archivovaným
- [ ] všechny body `VYŽADUJE PRÁVNÍ SCHVÁLENÍ` jsou vyřešené nebo vědomě odsouhlasené
