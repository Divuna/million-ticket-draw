# Archiv pravidel konkrétních soutěží

Finální pravidla každé soutěže OneMil. Jeden adresář = jedna soutěž.

Zdrojem je vždy [`../SABLONA_PRAVIDEL_SOUTEZE.md`](../SABLONA_PRAVIDEL_SOUTEZE.md).

---

## Struktura

```
docs/pravni-dokumenty/souteze/NAZEV_SOUTEZE/
├── PRAVIDLA_SOUTEZE_NAZEV.docx
└── PRAVIDLA_SOUTEZE_NAZEV.pdf
```

`NAZEV_SOUTEZE` je čitelný název bez diakritiky a mezer, například `CORVETTE_C8`.

## Pravidla archivu

1. **Každá soutěž má vlastní adresář.** Žádné sdílení dokumentů mezi soutěžemi.
2. **Každá soutěž má vlastní Word i PDF.** Word je editovatelný zdroj, PDF je to, co dostane
   zákazník.
3. **PDF nahrané v administraci do `rules_pdf_url` musí být totožné s archivovaným PDF.**
   Když se rozejdou, platí archivovaná verze a rozdíl se musí vysvětlit.
4. **Změna pravidel = nová verze**, ne přepis. Zvyšte `{{VERZE_PRAVIDEL}}`, uveďte nové
   `{{DATUM_VYDANI}}` a starou verzi ponechte dohledatelnou:
   ```
   PRAVIDLA_SOUTEZE_NAZEV.pdf          ← aktuální
   PRAVIDLA_SOUTEZE_NAZEV_v1.0.pdf     ← předchozí
   ```
5. **Nikdy nepřepisuj historii bez záznamu nové verze.**
6. **Nikdy nekopíruj pravidla jiné soutěže** bez kontroly každého konkrétního údaje —
   počtu tiketů, ceny tiketu, hlavní výhry, bonusů, dat.

## Vazba na aktivaci soutěže

Soutěž **nesmí být aktivována**, dokud finální PDF neexistuje a není schválené. Databázový trigger
`trg_contest_active_requires_rules_pdf` od 7. 9. 2026 odmítne jakýkoli pokus nastavit
`status = 'active'` bez vyplněného `rules_pdf_url` — a stejně tak odmítne odebrat PDF už aktivní
soutěži.

Trigger ale hlídá jen to, že PDF **existuje**. Že je **správné a odpovídá dané soutěži**, hlídá
tenhle archiv a kontrolní seznam v šabloně.

---

## Stav k 7. 9. 2026

**Adresář je záměrně prázdný.** Žádná ukázková ani smyšlená soutěž se sem nezakládá.

⚠️ Zároveň platí otevřený nález: produkční soutěže dnes mají v `rules_pdf_url` nahraný **sdílený
generický soubor s nevyplněnými placeholdery** (`[NÁZEV SOUTĚŽE]`, `[DATUM]`) — viz
[`../HISTORICKE_SOUBORY.md`](../HISTORICKE_SOUBORY.md). Ten se musí nahradit skutečnými pravidly
podle šablony, a to je samostatný krok se schválením Pavla.
