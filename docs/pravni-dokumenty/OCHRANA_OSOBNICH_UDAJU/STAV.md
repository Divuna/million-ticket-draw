# GDPR — stav konfliktu

## ⛔ Konflikt NENÍ rozhodnutý

**Žádná ze dvou verzí uložených v této složce není autoritativní.**

Dokud Pavel po právní kontrole nerozhodne, platí:

- **AI nesmí sama vybrat vítěznou verzi.**
- **AI nesmí jednu verzi přepsat druhou** ani je slučovat.
- **AI nesmí vytvořit `AKTUALNI_GDPR.md`** ani jiný soubor, který by konflikt tiše rozhodl.
- Při jakémkoli požadavku, který předpokládá jediné platné znění GDPR: **STOP a nahlásit Pavlovi.**

GDPR je proto **výslovná výjimka** z pravidla „GitHub je zdroj, CMS je publikovaná kopie"
(viz [`../README.md`](../README.md)) — tady zatím žádný schválený zdroj neexistuje.

---

## Obě verze vedle sebe

| | [`VERZE_GDPR.md`](VERZE_GDPR.md) | [`VERZE_OCHRANA_OSOBNICH_UDAJU.md`](VERZE_OCHRANA_OSOBNICH_UDAJU.md) |
|---|---|---|
| CMS slug | `legal/gdpr` | `legal/ochrana-osobnich-udaju` |
| `is_active` v DB | true | true |
| Délka | 1 281 znaků | **3 030 znaků** |
| Poslední úprava | **29. 4. 2026** | 28. 12. 2025 |
| Vlastní verzování | ne | ano — „Verze: 1.0 \| Platné od: 28. 12. 2025" |
| IČO správce | ne | **ano (17795851)** |
| Odkaz na Nařízení EU 2016/679 | ne | **ano** |
| Datová schránka | ne | **ano (c9mizui)** |
| Odkaz na ÚOOÚ | ne | **ano (www.uoou.cz)** |
| Doby uchování | obecně („po dobu trvání účtu") | **konkrétně** (10 let u faktur, 3 roky neaktivita) |
| Jmenovitý výčet zpracovatelů | **ano** (Stripe, Resend, OneSignal, Google, Meta) | ne — jen kategorie („platební brány", „dopravci") |
| Předávání mimo EU / SCC | **ano** | ne |
| Veřejně dostupné | **ano — `/gdpr`** | ne (route redirectuje na `/gdpr`) |

## Proč to nejde rozhodnout automaticky

**Novější není lepší a starší není horší.** Každá verze má něco, co ta druhá nemá:

- `legal/gdpr` je o čtyři měsíce novější a jako jediná **jmenuje konkrétní zpracovatele**
  a zmiňuje předávání mimo EU na základě standardních smluvních doložek.
- `legal/ochrana-osobnich-udaju` je starší, ale **výrazně důkladnější** — nese vlastní verzování,
  IČO, odkaz na nařízení i na ÚOOÚ, konkrétní doby uchování a datovou schránku.

Nelze proto určit, jestli novější text vznikl jako **vědomé zjednodušení**, nebo jako **náhrada
naslepo**, při které se ztratil obsah. To je právní a vlastnické rozhodnutí, ne technické.

## Co je potřeba rozhodnout

1. **Které znění je platné** — nebo jestli se má vytvořit sloučená verze z obou.
2. **Co s tím druhým** — deaktivovat v CMS, nebo ponechat jako historii.
3. **Doplnit chybějící zpracovatele** — v obou verzích chybí:
   - **Supabase** — přitom drží *všechna* osobní data (účty, platby, tikety, výhry).
     `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`
   - **Vercel** — od 2. 9. 2026 produkční hosting. `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`

## Postup po rozhodnutí

1. Pavel s právníkem určí platné znění.
2. Schválený text se uloží do této složky jako zdroj (název určí Pavel).
3. Teprve pak se publikuje do CMS.
4. Neplatná verze se v CMS deaktivuje a v GitHubu označí jako historická.
5. Do té doby zůstávají oba soubory v této složce **jen jako doklad, co v produkci reálně je**.
