# Obecná pravidla soutěží — veřejná stránka

## Co to je

Obecná veřejná stránka `/pravidla-souteze`, která vysvětluje **princip** soutěží OneMil.

| | |
|---|---|
| Zdrojové znění | [`OBECNA_PRAVIDLA_SOUTEZI.md`](OBECNA_PRAVIDLA_SOUTEZI.md) |
| Publikovaná kopie | `content_pages`, `section='legal'`, `slug='pravidla-souteze'` |
| Veřejná adresa | `/pravidla-souteze` (odkaz v patičce) |
| Poslední úprava | 29. 4. 2026 |

## ⚠️ Co to NENÍ

**Nejsou to pravidla konkrétní soutěže a nikdy jako taková nesmí sloužit.**

Závazná pravidla každé soutěže jsou **vlastní PDF té soutěže**, vytvořené podle
[`../SABLONA_PRAVIDEL_SOUTEZE.md`](../SABLONA_PRAVIDEL_SOUTEZE.md) a archivované
v [`../souteze/NAZEV_SOUTEZE/`](../souteze/). Do produkce se nahrávají do
`contests.rules_pdf_url`.

| | Obecná stránka | Pravidla konkrétní soutěže |
|---|---|---|
| Kde | `/pravidla-souteze` | PDF u dané soutěže |
| Co popisuje | princip soutěží OneMil obecně | konkrétní počet tiketů, výhru, lhůty, území |
| Zdroj | tato složka | `../souteze/NAZEV_SOUTEZE/` |
| Šablona | — | `../SABLONA_PRAVIDEL_SOUTEZE.md` |

## Zdokumentované placeholdery — zatím se neopravují

Publikovaný text obsahuje **čtyři nevyplněné placeholdery**:

| Řádek | Placeholder |
|---|---|
| 2. Název soutěže | `[NÁZEV SOUTĚŽE]` |
| 3. Doba trvání | `[DATUM]` … `[DATUM]` |
| 5. Výhry | `[POPIS HLAVNÍ VÝHRY]` |
| 5. Výhry | `[HODNOTA]` |

Jsou to pozůstatky po tom, že stránka vznikla ze šablony pravidel jedné soutěže, místo aby popisovala
princip obecně. Na obecné stránce nedávají smysl — obecná pravidla žádný konkrétní název ani datum
mít nemají.

**V tomto kroku se záměrně neopravují**, jen dokumentují. Přepis textu je samostatná úloha
se schválením Pavla; je to veřejný právní text, ne technická drobnost.

## Související otevřený nález

Tentýž text byl vyexportován do `OneMil_Pravidla_souteze.pdf` (kořen repozitáře) a **tenhle
soubor je i s placeholdery nahraný jako `rules_pdf_url` u všech produkčních soutěží**. Detail
v [`../HISTORICKE_SOUBORY.md`](../HISTORICKE_SOUBORY.md).

Obě dotčené soutěže jsou od 7. 9. 2026 `paused` a nesmí být obnoveny, dokud nemají vlastní správná
pravidla.
