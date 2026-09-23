# OneMil — Podklady pro právní review

> **Účel:** Launch blocker #1 — právní/CMS review (L01 VOP, L03 GDPR, L04 cookies, A13 CMS obsah). Texty jsou zatím **owner-accepted jen pro testovací fázi**, ne pro ostrý provoz. Tento dokument je read-only balíček pro právníka — **nic v CMS ani databázi se neměnilo**.
>
> **⚠️ Stripe live se NEMÁ přepínat před dokončením tohoto právního review.** Live rollout plán viz [STRIPE_LIVE_ROLLOUT_PLAN.md](./STRIPE_LIVE_ROLLOUT_PLAN.md).

---

## Provozovatel

| Pole | Hodnota |
|------|---------|
| Firma | iCONIC POINT s.r.o. |
| IČO | 17795851 |
| DIČ | CZ17795851 |
| Sídlo | Na Folimance 2155/15, Vinohrady, 120 00 Praha 2 |

---

## 1. Nalezené právní/CMS texty

**Zdroj pravdy = databáze** `content_pages` (section `legal`), editovatelné přes `/admin/content`. Frontend je jen renderuje (`SlugContentPage.tsx`, `TermsConditions.tsx`, `PrivacyPolicy.tsx`, `CookieConsentBanner.tsx`).

| Slug (DB) | Titul | Veřejná routa | Délka | Aktualizováno | Placeholdery |
|-----------|-------|---------------|-------|---------------|--------------|
| `vop` | Všeobecné obchodní podmínky | `/vop` (+ `/terms` redirect) | **712 zn.** ⚠️ | 2026-04-29 | ne |
| `gdpr` | Zásady zpracování OÚ (GDPR) | `/gdpr` (+ `/privacy`, `/legal/ochrana-osobnich-udaju`) | 1281 zn. | 2026-04-29 | ne |
| `cookies` | Zásady použití cookies | `/legal/cookies` | 2328 zn. | 2026-02-01 | ne |
| `ochrana-osobnich-udaju` | Ochrana osobních údajů | `/legal/ochrana-osobnich-udaju` | 3030 zn. | 2025-12-28 | ne |
| `pravidla-souteze` | Pravidla soutěže (obecná) | `/pravidla-souteze` | 1025 zn. | 2026-04-29 | **ANO** ⚠️ |
| `autorska-prava` | Autorská práva | `/legal/autorska-prava` | 2220 zn. | 2026-02-01 | ne |

> Per-contest pravidla = `contests.rules_pdf_url` (PDF v bucketu `contest-rules`): ze 127 soutěží má 34 PDF; 1 aktivní, 0 aktivních bez PDF. Procesní kontrola před spuštěním každé soutěže.

---

## 2. Známé nedostatky (datově ověřené, read-only 30. 06. 2026)

**VOP (`/vop`)** — ⚠️ nejslabší (jen 712 znaků):
- **Chybí identifikace firmy** — žádné IČO, žádný název iCONIC POINT s.r.o.
- Reklamační řád zmíněn jen okrajově — chybí plný reklamační proces, lhůty, postup.
- Chybí typicky: práva spotřebitele, odstoupení od smlouvy, povaha MIO (interní kredit, nevyplatitelný a nepřevoditelný mimo OneMil), platební podmínky.
- Text neodpovídá aktuálnímu podporovanému nákupnímu modelu: zákazník pořizuje za MIO **garantovaný nákupní benefit** a získává k němu **1 soutěžní tiket zdarma jako bonus**.
- VOP zatím neřeší potvrzený produktový záměr, že MIO z placeného dobití má mít platnost **12 měsíců od daného dobití**; tato expirace zatím není technicky v produkční peněžence vynucena a musí být před zveřejněním implementována a právně posouzena.

**GDPR (`/gdpr`)**:
- **Chybí Supabase jako zpracovatel** (hosting/DB zpracovatel není uveden).
- Stripe a OneSignal zmíněny; doplnit úplný seznam zpracovatelů + právní základy + doby uchování.

**Cookies (`/legal/cookies`)**:
- **Nezmiňuje reálné nástroje** — chybí Stripe, OneSignal, Google Tag Manager.
- Chybí rozlišení **cookies vs. localStorage** (`onemil-auth`, `cookie_consent` jsou localStorage, ne cookies) — text musí odpovídat reálnému chování a consent banneru.

**Pravidla soutěží (`/pravidla-souteze`)**:
- Obsahuje **placeholdery** `[NÁZEV SOUTĚŽE]`, `[DATUM]`, `[POPIS HLAVNÍ VÝHRY]`, `[HODNOTA]` — obecná CMS stránka, ne závazný zdroj konkrétní soutěže.
- Per-contest závazná pravidla jdou přes `rules_pdf_url` u každé soutěže.
- Aktuální produktový model: tikety se přidělují sekvenčně 1, 2, 3…, hlavní výhru získává držitel posledního tiketu. Bonusové výherní pozice jsou určeny interně předem, ale jejich konkrétní čísla se účastníkům předem nezobrazují.
- Právní review má výslovně posoudit, zda je tento způsob skrytých předem určených bonusových pozic a model „garantovaný nákupní benefit + 1 tiket zdarma“ v pořádku podle českého práva.

**Duplicita GDPR**:
- `gdpr` (1281 zn.) i `ochrana-osobnich-udaju` (3030 zn.) existují souběžně. Kód směruje `/privacy` → `/gdpr`. Právník by měl rozhodnout, která je kanonická, a druhou sjednotit/zrušit.

---

## 3. Otázky pro právníka

1. **VOP:** doplnit plnou identifikaci provozovatele (iCONIC POINT s.r.o., IČO 17795851, sídlo) + kompletní reklamační řád — jaký rozsah požaduje české právo pro tuto službu?
2. **MIO:** jak právně ukotvit interní digitální kredit MIO (nevyplatitelný a nepřevoditelný mimo OneMil) a jak jej odlišit od elektronických peněz, kryptoměny nebo jiného regulovaného platebního prostředku?
3. **Odstoupení od smlouvy:** jak řešit 14denní odstoupení u placeného dobití MIO, garantovaných nákupních benefitů a voucherů?
4. **GDPR:** potvrdit úplný seznam zpracovatelů (Supabase, Stripe, OneSignal, Resend, případně Sofinity/GTM/GA) + právní základy + doby uchování.
5. **GDPR duplicita:** sjednotit `/gdpr` vs. `/legal/ochrana-osobnich-udaju` — která je kanonická?
6. **Cookies:** schválit přesný popis cookies + localStorage + tracking (Stripe, OneSignal, GTM/GA) odpovídající reálnému chování a consent banneru.
7. **Pravidla soutěží:** jaký obecný text na `/pravidla-souteze` a jaká je povinná struktura pravidel jednotlivé soutěže? Je nutné účastníkům předem zveřejnit konkrétní čísla bonusových výherních pozic, nebo mohou zůstat předem určená interně a nezveřejněná?
8. **Soutěžní model:** právně posoudit celý model „garantovaný nákupní benefit za MIO + 1 soutěžní tiket zdarma“, sekvenční přidělování tiketů, hlavní výhru pro držitele posledního tiketu a skryté předem určené bonusové pozice. Určit, zda a za jakých podmínek tento model nespadá pod regulaci hazardních her.
9. **Věk 18+:** je gating dostatečný, nebo je třeba doplnit do VOP/pravidel?
10. **Platnost placeného MIO:** lze nastavit expiraci MIO z placeného dobití na 12 měsíců od konkrétního dobití? Jaké informační povinnosti, upozornění a pravidla pro spotřebu/propadnutí je nutné dodržet?
11. **Změna pravidel po spuštění:** za jakých okolností lze po aktivaci soutěže změnit její pravidla a které parametry už změnit nelze?
12. **Ukončení/přerušení soutěže:** jak právně postupovat při závažné technické poruše, zásahu vyšší moci, podvodu nebo jiném mimořádném důvodu? Co se stane s již vydanými tikety, zakoupenými garantovanými benefity a právy účastníků?
13. **Uzavřená soutěž:** současná produkční logika považuje stav `closed` za konečný a počet tiketů po prvním vydaném tiketu nelze změnit. Potvrdit, zda toto má být výslovně promítnuto do pravidel/VOP.

---

## 4. Návrh e-mailu právníkovi

> **Předmět:** OneMil — právní review před spuštěním (VOP, GDPR, cookies, pravidla soutěží)
>
> Dobrý den,
>
> připravujeme spuštění platformy OneMil (provozovatel iCONIC POINT s.r.o., IČO 17795851) a potřebujeme právní revizi a doplnění těchto dokumentů před ostrým provozem s reálnými platbami:
>
> 1. **Všeobecné obchodní podmínky** — `https://onemil.cz/vop` (aktuální verze je velmi stručná; chybí identifikace firmy a reklamační řád)
> 2. **GDPR / Zpracování osobních údajů** — `https://onemil.cz/gdpr` (doplnit zpracovatele, zejm. Supabase)
> 3. **Zásady cookies** — `https://onemil.cz/legal/cookies` (sjednotit s reálnými nástroji: Stripe, OneSignal, Google Tag Manager; rozlišit cookies vs. localStorage)
> 4. **Pravidla soutěží** — `https://onemil.cz/pravidla-souteze` (obecná stránka má placeholdery; + struktura pravidel jednotlivých soutěží)
>
> Stručný kontext: OneMil je partnerská odměnová a spotřebitelská platforma. Uživatel může získat nebo placeně dobít interní kredit **MIO**. U podporovaného soutěžního nákupu uživatel za MIO pořizuje **garantovaný nákupní benefit** a získává k němu **1 soutěžní tiket zdarma jako bonus**. Tikety se přidělují sekvenčně (1, 2, 3…). Hlavní výhru získává držitel posledního tiketu. Bonusové výherní pozice jsou určeny interně předem, ale jejich konkrétní čísla se účastníkům předem nezobrazují. Prosíme o právní posouzení tohoto modelu, včetně jeho vztahu k regulaci hazardních her. Věkový limit je 18+.
>
> V příloze posílám konkrétní seznam zjištěných nedostatků a otázek (sekce 2 a 3 tohoto podkladu). Můžete prosím dokumenty zrevidovat a doplnit do podoby vhodné pro ostrý provoz?
>
> Děkuji, Pavel Diviš

---

## 5. Další krok

1. Pavel pošle e-mail (sekce 4) právníkovi s odkazy + seznamem nedostatků a otázek.
2. Po obdržení revidovaných textů je Pavel vloží do `/admin/content` (CMS).
3. Pak přepnout L01/L03/L04/A13 v [LAUNCH_TODO.md](./LAUNCH_TODO.md) na `prošlo`.
4. Tím se odblokuje launch blocker #1; **teprve poté** pokračovat na Stripe live (#2) — viz [STRIPE_LIVE_ROLLOUT_PLAN.md](./STRIPE_LIVE_ROLLOUT_PLAN.md).

**⚠️ Stripe live se nepřepíná před dokončením tohoto právního review.**
