# Vzorový Air Bank ABO `.kpc` soubor — Phase D

## Účel

Tento adresář obsahuje vzorový soubor hromadného příkazu k úhradě ve formátu ABO (`.kpc`) pro Air Bank. Slouží **výhradně** k ručnímu importnímu testu v Air Bank internetovém bankovnictví.

**Fáze D nesmí být aplikována na staging bez úspěšného ověření tohoto importního testu.**

---

## Soubory

| Soubor | Popis |
|--------|-------|
| `generate-sample.cjs` | Node.js skript pro (re)generování vzorového souboru |
| `sample-onemil-20260625.kpc` | Pre-generovaný vzorový soubor (2 příjemci, 579,45 Kč) |

---

## Jak regenerovat soubor

```sh
node docs/affiliate-payouts/sample-bank-export/generate-sample.cjs
```

Přepíše `sample-onemil-20260625.kpc` ve stejném adresáři.

---

## Testovací data ve vzorovém souboru

| Pole | Hodnota |
|------|---------|
| Účet příkazce | `3151752019` / `3030` (Air Bank — Iconic Point s.r.o.) |
| Datum splatnosti | 25. 06. 2026 |
| Celková částka | 579,45 Kč (57945 haléřů) |
| Počet příjemců | 2 |

**Příjemce 1**

| Pole | Hodnota |
|------|---------|
| Účet | `0012545857` / `0800` (Česká spořitelna) |
| Částka | 123,45 Kč |
| VS | `2026060001` |
| KS | `0000` |
| Zpráva | `Provize obchodnik Novak` |

**Příjemce 2**

| Pole | Hodnota |
|------|---------|
| Účet | `0987654321` / `0300` (ČSOB) |
| Částka | 456,00 Kč |
| VS | `2026060002` |
| KS | `0000` |
| Zpráva | `Provize obchodnik Kratka` |

---

## Přesný obsah souboru

```
UHL1
1 1501 000001 3030
2 3151752019 00000000057945 250626
0012545857 000000012345 2026060001 08000000 0 Provize obchodnik Novak
0987654321 000000045600 2026060002 03000000 0 Provize obchodnik Kratka
3 +
5 +
```

Kódování: Windows-1250 kompatibilní (pouze ASCII ≤ 0x7F). Konce řádků: CRLF (`\r\n`). Velikost: 215 bajtů.

---

## Formát dle specifikace (ČSAS ABO)

```
UHL1
1 <druh=1501> <cislo_souboru> <smer_kod_banky_prikazce>
2 <ucet_prikazce_10> <castka_skupiny_14_halere> <datum_splatnosti_ddmmrr>
<ucet_prijemce_10> <castka_polozky_12_halere> <vs> <bank_kod+KS_8> <ss> <zprava_35>
...
3 +
5 +
```

- Pole jsou oddělena **mezerou**
- Účet příkazce je **v hlavičce skupiny** (věta `2`), nikoliv u každé položky
- Položka začíná **účtem příjemce** (bez debetního účtu)
- KS pole = směrový kód banky příjemce (4 cifry) + konstantní symbol (4 cifry) = 8 číslic
- Částky jsou v **haléřích**, zleva doplněny nulami na max délku

---

## Ruční importní test v Air Bank

### Postup

1. Přihlaste se do Air Bank internetového bankovnictví.
2. Přejděte na **Platby → Hromadný příkaz k úhradě → Nahrát soubor** (nebo ekvivalentní nabídku).
3. Vyberte soubor `sample-onemil-20260625.kpc`.
4. Ověřte, že banka soubor **akceptuje** a správně zobrazuje:
   - celkovou částku (579,45 Kč),
   - datum splatnosti (25. 06. 2026),
   - oba příjemce s odpovídajícími částkami a VS.
5. **Neodešlete platbu** — jde o testovací data s fiktivními účty.
6. Výsledek testu zazamenejte do `docs/affiliate-payouts/DESIGN.md` §15.

### Blokující kritéria před staging aplikací Fáze D

- [ ] Air Bank soubor akceptuje bez chybové hlášky
- [ ] Správně zobrazeny oba příjemci a celková částka
- [ ] Datum splatnosti správně parsováno (formát `ddmmrr`)
- [ ] Pavel Diviš výslovně schválí aplikaci Fáze D na staging

**Bez splnění všech bodů se Fáze D nesmí aplikovat na staging ani produkci.**
