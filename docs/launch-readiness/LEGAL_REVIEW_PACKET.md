# OneMil — Podklady pro právní review

> **Účel:** Launch blocker #1 — právní/CMS review (L01 VOP, L03 GDPR, L04 cookies, A13 CMS obsah). Texty jsou zatím **owner-accepted jen pro testovací fázi**, ne pro ostrý provoz. Tento dokument je read-only balíček pro právníka — **nic v CMS ani databázi se neměnilo**.
>
> **Pravidlo pro právní review — potvrzeno Pavlem 23. 9. 2026:** Libra má právní dokumenty připravit podle **cílového stavu při ostrém spuštění**, tedy jako by všechny zde popsané potvrzené funkce a obchodní mechanismy byly dokončené. Známé technické mezery jsou interní implementační úkoly OneMil a nesmí vést k tomu, že by Libra potvrzený produktový model z právních textů vynechala. OneMil musí tyto technické mezery odstranit a otestovat před ostrým spuštěním, aby produkt odpovídal schváleným právním textům.
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

## 0. Pevná obchodní a produktová pravidla — Libra je nemá redesignovat

Tato pravidla jsou pro právní review **vstupní produktová fakta**. Libra má navrhnout právně správné
znění, upozornit na právní riziko nebo nutné podmínky a případně říct, že konkrétní model není
přípustný. Nemá však bez výslovného dotazu Pavla sama měnit ekonomiku, princip soutěže nebo role
jednotlivých stran.

1. **Provozovatel:** OneMil provozuje iCONIC POINT s.r.o., IČO 17795851.
2. **Role OneMil:** OneMil je primárně partnerská odměnová a marketingová platforma s uživatelskou
   soutěžní vrstvou; není pouze samostatná soutěžní aplikace.
3. **Veřejný název kreditu:** interní kredit se veřejně jmenuje **MIO**. Nové právní a veřejné texty
   nemají používat „MioCoin/MioCoiny“ jako produktový název.
4. **Povaha MIO:** MIO je interní digitální kredit použitelný uvnitř OneMil. Nelze jej vyplatit v
   penězích ani převést mimo OneMil.
5. **Placené MIO:** MIO z placeného dobití má platnost **12 měsíců od konkrétního dobití**.
6. **Soutěžní nákup:** zákazník **nekupuje samostatný soutěžní tiket**. Za MIO pořizuje
   **garantovaný nákupní benefit** a k němu získává **1 soutěžní tiket zdarma jako bonus**.
7. **Garantovaný benefit:** není soutěžní výhra. Musí mít skutečného konkrétního poskytovatele;
   iCONIC POINT s.r.o. není automaticky poskytovatelem partnerových benefitů, voucherů nebo nabídek.
8. **Tikety:** přidělují se postupně v číselné řadě.
9. **Hlavní výhra:** získává ji držitel **posledního tiketu** dané soutěže.
10. **Bonusové výhry:** mohou být navázány na předem určená konkrétní čísla tiketů. Konkrétní
    bonusové výherní pozice se účastníkům **předem nezobrazují**; zákazník může vidět existenci a
    druhy bonusových výher.
11. **Pevný počet tiketů:** po vydání prvního tiketu se celkový počet tiketů nemění.
12. **Věk:** zákaznická soutěžní část je určena pouze osobám **18+**.
13. **Pravidla soutěží:** každá konkrétní soutěž má vlastní závazná pravidla/PDF; obecná stránka
    pravidel vysvětluje pouze princip.
14. **Partner/e-shop:** partner může odměňovat zákazníky MIO za nákupy a další potvrzené aktivity a
    sám nastavuje odměnovou logiku pro budoucí objednávky.
15. **Změny partnerovy odměny:** změna pravidel odměňování platí pro budoucí objednávky; již vzniklé
    nebo aktivované odměny se zpětně nepřepočítávají.
16. **Více e-shopů:** jedna partnerská firma může mít více samostatných e-shopových napojení.
17. **Partnerský odměnový kód:** vydaný partnerský kód má platnost **90 dní**. Neaktivovaná odměna
    se zákazníkovi nepřipíše.
18. **Partnerská fakturace:** partner platí pouze za MIO, která zákazníci skutečně aktivují; za
    vydané a neaktivované odměny neplatí.
19. **Partnerská cena:** aktuální obchodní princip je **1 aktivované MIO = 1 Kč bez DPH + DPH**.
20. **Zahajovací akce partnera:** první **30 dní** OneMil hradí první **2 MIO z každé aktivované
    odměny**; partner platí případnou část nad 2 MIO.
21. **Osobní kód běžného uživatele:** odměna je nepeněžní a vyplácí se v MIO, nikoli v Kč.
22. **Osobní doporučení:** základní model je **5 % v MIO z placených dobití doporučeného uživatele**
    a jednorázově **15 MIO po jeho prvním placeném dobití**; za samotnou registraci odměna nevzniká.
23. **Affiliate je oddělený systém:** Influencer / Obchodník / Agentura může mít peněžní provize v
    Kč; nesmí se směšovat s nepeněžním osobním doporučením běžných uživatelů.
24. **Affiliate — zákazník:** cílový model počítá peněžní provizi z reálně zaplacených zákaznických
    dobití v Kč; aktuální výchozí sazba je 5 %, pokud není individuálně nastavena jinak.
25. **Affiliate — přivedená firma:** provize vzniká z reálně uhrazených partnerských faktur a počítá
    se z částky bez DPH; aktuální výchozí sazba je 5 %, pokud není individuálně nastavena jinak.
26. **Voucher, garantovaný benefit a Partner Offer jsou odlišné věci:** právní text je nemá slučovat
    pod jeden pojem.
27. **Marketingový souhlas:** je samostatný a dobrovolný; nesmí být podmínkou běžné registrace.
28. **Cílový stav pro Libru:** známé technické mezery se mají před ostrým spuštěním dokončit.
    Libra proto připravuje dokumentaci pro výše uvedený **cílový hotový stav**, ne pro dnešní
    nedokončené technické mezikroky.

---

## 0A. Otevřené právní a procesní otázky — Libra má navrhnout řešení

Níže uvedené body nejsou pevně určeny obchodním modelem. Libra má navrhnout právně bezpečné
řešení a přesné znění. Pokud některý bod vyžaduje obchodní rozhodnutí vlastníka, má to výslovně
označit místo toho, aby si rozhodnutí sama domyslela.

1. **Právní kvalifikace MIO** — jak MIO právně vymezit, aby odpovídalo skutečnému internímu
   kreditu a nebylo nesprávně popsáno jako elektronické peníze, kryptoměna nebo jiný regulovaný
   platební prostředek.
2. **14denní odstoupení a okamžité čerpání** — jak přesně nastavit souhlas/poučení při placeném
   dobití MIO a kdy může spotřebitel právo na odstoupení ztratit nebo zachovat.
3. **Refundace a částečně spotřebované MIO** — jak vypořádat zákonnou refundaci, pokud už část
   MIO byla spotřebována, včetně bonusové části balíčku.
4. **Expirace placeného MIO** — 12 měsíců je pevné pravidlo; Libra má určit informační povinnosti,
   upozornění před expirací, právní důsledky expirace a zda je potřeba zvláštní souhlas.
5. **Platnost neplaceného MIO** — expirace partnerského, bonusového, referral nebo jiného
   neplaceného MIO zatím není obecně sjednocena. Libra má říct, zda je právně vhodné mít odlišná
   pravidla; konkrétní dobu případně potvrdí Pavel.
6. **Pořadí čerpání MIO** — právně a spotřebitelsky doporučit, zda se mají nejdřív čerpat nejdříve
   expirující placené MIO nebo jiný typ kreditu. Finální obchodní pravidlo potvrdí Pavel.
7. **Smazání/blokace účtu** — co se právně musí stát s placeným MIO, neplaceným MIO, benefity,
   vouchery, tikety a již vzniklými výhrami.
8. **Odpovědnost za garantovaný benefit/voucher** — rozdělení odpovědnosti mezi OneMil a
   konkrétního partnera a reklamační cesta pro zákazníka.
9. **Nepřevzetí výhry** — zda a po jaké lhůtě může výhra zaniknout, jaké pokusy o kontakt jsou
   nutné a co se s výhrou následně stane.
10. **Daně a náklady výher** — kdo nese daň, dopravu, přepis, registraci nebo jiné náklady podle
    typu výhry a co musí být vždy v pravidlech konkrétní soutěže.
11. **Změna/předčasné ukončení soutěže** — zákonné limity změn pravidel, technické havárie, vyšší
    moc, podvod a ochrana již vzniklých práv účastníků.
12. **Formulace „na výhru není právní nárok“** — posoudit, zda může být použita a v jakém rozsahu,
    zejména po okamžiku, kdy už byl konkrétní výherce určen.
13. **Věk 18+** — potvrdit, zda současné čestné potvrzení věku stačí, nebo zda je nutný silnější
    mechanismus ověření.
14. **Reklamační řád a ADR** — přesné lhůty, náležitosti reklamace, komunikační kanály a aktuální
    poučení o mimosoudním řešení spotřebitelských sporů.
15. **GDPR při registraci** — zda má uživatel „souhlasit s GDPR“, nebo pouze potvrdit, že se se
    zásadami ochrany osobních údajů seznámil.
16. **GDPR partner ↔ OneMil** — určit role správce/zpracovatele/společných správců při předávání
    objednávkových údajů z e-shopu a zda je nutná samostatná zpracovatelská smlouva.
17. **AI Bob** — právní základ, rozsah informační povinnosti a případná omezení při předávání
    konverzace a omezených údajů o účtu OpenAI.
18. **Doby uchování a výmaz** — přesné retenční lhůty pro účty, platby, MIO, soutěže, výhry,
    podporu, bezpečnostní logy, souhlasy a data po zrušení účtu.
19. **Přenosy mimo EU/EHP a zpracovatelé** — přesně identifikovat právnické osoby, jejich role a
    mechanismy předávání pro Supabase, Vercel, Stripe, Resend, OneSignal, Google, Meta, Sofinity a
    OpenAI.
20. **Marketing, cookies a push** — finální právní text souhlasů, Google/Meta měření, localStorage,
    OneSignal a způsob odvolání souhlasu.
21. **Affiliate smluvní režim** — fakturace, daně, vznik nároku, storna, výplata a vypořádání
    nevyplacených provizí po ukončení spolupráce.
22. **Partner B2B smluvní režim** — zda použít partnerské podmínky, individuální smlouvu nebo
    kombinaci; fakturace, trial, reklamace, odpovědnost za data a ukončení spolupráce.
23. **Dokumentová hierarchie a nové souhlasy** — přednost VOP, pravidel konkrétní soutěže,
    partnerských/Affiliate podmínek a individuálních smluv; kdy změna vyžaduje nový aktivní souhlas.
24. **0 Kč během partnerského trialu** — účetní a daňově správná forma: zda nulová faktura, jiný
    doklad nebo pouze přehled.
25. **Právní posouzení soutěžního modelu** — potvrdit, za jakých podmínek model
    „garantovaný nákupní benefit + 1 tiket zdarma“, poslední tiket jako hlavní výhra a skryté předem
    určené bonusové pozice nespadá do režimu hazardních her.

### Co Libra nemá sama rozhodnout bez Pavla

U každé konkrétní soutěže musí Pavel nebo odpovědná osoba dodat obchodní fakta, která nelze odvodit
právním výkladem:

- území konkrétní soutěže,
- přesnou specifikaci a hodnotu hlavní výhry,
- způsob předání výhry,
- lhůtu pro reakci výherce,
- lhůtu pro předání,
- kdo hradí konkrétní náklady předání,
- obchodní postup při nevyzvednutí, pokud zákon připouští více variant,
- případné zvláštní podmínky konkrétní soutěže.

Libra má u těchto bodů určit **právní mantinely a doporučenou formulaci**, nikoli vymýšlet chybějící
obchodní fakta.

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
14. **Reklamace a podpora:** jaký reklamační postup, lhůty, náležitosti a komunikační kanály musí VOP obsahovat pro placené MIO, garantované benefity, vouchery, soutěžní výhry a technické chyby?
15. **Odpovědnost:** jak správně rozdělit odpovědnost mezi iCONIC POINT s.r.o. jako provozovatele OneMil, konkrétního partnera jako poskytovatele benefitu/voucheru a externí poskytovatele (např. Stripe)?
16. **Omezení/blokace účtu:** za jakých podmínek lze účet dočasně omezit nebo zablokovat při podvodu, manipulaci, zneužívání či bezpečnostním incidentu a jak vypořádat MIO, benefity, tikety a již vzniklé výhry?
17. **Mimosoudní řešení sporů:** potvrdit přesné aktuální poučení pro českého spotřebitele, včetně příslušného subjektu ADR, způsobu podání návrhu a údajů, které musí být uvedeny ve VOP.
18. **GDPR právní základy:** potvrdit právní základ pro jednotlivé účely (smlouva, zákonná povinnost, oprávněný zájem, souhlas), zejména pro bezpečnost, zlepšování služby, 18+ kontrolu a AI podporu.
19. **Registrace a GDPR:** registrace dnes vyžaduje zaškrtnutí VOP i GDPR a UI používá formulaci „souhlasit se zásadami ochrany osobních údajů“. Posoudit, zda má být GDPR potvrzení pouze seznámením/potvrzením informace, nikoli „souhlasem“ jako právním základem.
20. **Marketing:** marketingový souhlas je při registraci samostatný a dobrovolný a lze jej později udělit nebo odvolat v profilu. Potvrdit správné znění, evidenci a požadavky na obchodní sdělení.
21. **Cookies a obdobné technologie:** skutečný systém má pouze kategorie nezbytné / analytické / marketingové; GTM se načte až po souhlasu s analytikou nebo marketingem, Meta Pixel až po marketingovém souhlasu. Souhlas se ukládá do localStorage i databáze. Přepsat cookie zásady tak, aby toto přesně popisovaly.
22. **OneSignal:** potvrdit právní a informační režim pro push notifikace a lokální úložiště/identifikátory používané OneSignalem.
23. **Zpracovatelé a přenosy mimo EU/EHP:** potvrdit přesné právnické osoby, role a mechanismy předávání u Supabase, Vercel, Stripe, Resend, OneSignal, Google, Meta, Sofinity a OpenAI.
24. **AI podpora:** při použití Boba se OpenAI předává aktuální zpráva, až 10 předchozích zpráv, jméno z profilu, omezené údaje o účtu (zůstatek MIO, počet výher, stav voucherů, poslední aktivita) a přehled soutěží; e-mail aplikace sama nepřidává. Potvrdit právní základ a rozsah informační povinnosti.
25. **Doby uchování a výmaz:** stanovit konkrétní lhůty pro účet, podporu, platby, soutěže, výhry, souhlasy, bezpečnostní logy a data po zrušení účtu; potvrdit deklarovanou 30denní lhůtu pro výmaz.
26. **DPO a ÚOOÚ:** potvrdit, zda OneMil nemá povinnost jmenovat pověřence pro ochranu osobních údajů a zda je stávající poučení o stížnosti k ÚOOÚ správné.
27. **Osobní kód běžného uživatele:** právně posoudit nepeněžní odměnu v MIO za placená dobití doporučeného uživatele. Potvrdit, jak musí být podmínky odměny popsány, zda lze odměnu stornovat při refundaci původní platby a jak upravit zákaz self-referralu a zneužití.
28. **První placené dobití:** potvrdit právní podmínky zamýšleného jednorázového bonusu 15 MIO po prvním placeném dobití doporučeného uživatele. Tento bonus zatím není technicky implementován a nesmí být považován za aktivní nárok, dokud nebude implementace hotová a ověřená.
29. **Oddělení běžného uživatele a Affiliate:** běžný uživatel dostává pouze nepeněžní MIO; schválený Affiliate/influencer/obchodník může dostávat peněžní provize v Kč. Potvrdit, že mají mít tyto dva programy samostatné podmínky.
30. **Affiliate zákaznická provize:** zamýšlený model je peněžní provize z placených dobití přivedených zákazníků; sazba je nastavena na affiliate účtu (aktuální výchozí hodnota 5 %). Současný kalkulátor ale používá `payments.amount`, kam Stripe webhook ukládá připsané MIO, nikoli skutečně zaplacené CZK; u bonusových balíčků se proto částky liší. Před ostrým provozem je nutné právně i obchodně potvrdit správný základ provize a technicky jej sjednotit se skutečně zaplacenou částkou v CZK.
31. **Affiliate provize za firmu:** provize vzniká ze skutečně uhrazené partnerské faktury a počítá se z částky bez DPH; sazba je nastavena na affiliate účtu (aktuální výchozí hodnota 5 %). Posoudit smluvní, daňové, účetní a fakturační požadavky.
32. **Storno provizí:** určit, kdy lze již vypočtenou nebo schválenou odměnu/provizi stornovat nebo korigovat při refundaci, storno platby, chybné atribuci, podvodu nebo zrušení partnerské faktury.
33. **Atribuce:** potvrdit, jak dlouho může být zákazník nebo firma přiřazena ke konkrétnímu doporučiteli/Affiliate a jak o této skutečnosti informovat dotčené osoby z hlediska GDPR.
34. **Affiliate marketing:** potvrdit povinnosti influencera/Affiliate při označování reklamy, obchodní spolupráce a propagace osobního/affiliate odkazu nebo kódu.
35. **Ukončení Affiliate spolupráce:** stanovit, co se stane s již vzniklými, schválenými a dosud nevyplacenými provizemi při ukončení spolupráce, blokaci účtu nebo porušení pravidel.
36. **Partnerské MIO a odměnové kódy:** potvrdit smluvní model, kdy partner nastavuje výši odměny a zákazník získává MIO až aktivací vydaného partnerského kódu/odměny.
37. **Platnost partnerského kódu:** potvrdit 90denní platnost vydaného partnerského odměnového kódu a důsledky jeho neaktivování v této lhůtě.
38. **Výkonnostní fakturace partnera:** potvrdit model, kdy partner neplatí za vydané/neaktivované odměny, ale pouze za zákazníkem skutečně aktivované MIO; aktuální obchodní cena je 1 MIO = 1 Kč bez DPH + 21 % DPH.
39. **Partnerská fakturace:** potvrdit, jaké údaje musí obsahovat faktura/přehled aktivovaných MIO, jaké jsou náležitosti oprav a storna při chybné nebo zrušené aktivaci.
40. **Zahajovací akce:** posoudit 30denní obchodní akci, v níž OneMil hradí první 2 MIO z každé aktivované odměny; partner hradí jen část nad 2 MIO. Určit správný účetní a daňový způsob zobrazení 100% slevy, včetně období, kdy výsledná částka vyjde 0 Kč.
41. **Nastavení odměn partnerem:** potvrdit, že partner může měnit odměnovou logiku pro budoucí objednávky bez zpětného přepočtu již vydaných nebo aktivovaných odměn.
42. **Více e-shopů jedné firmy:** právně a smluvně popsat, že jedna partnerská firma může mít více samostatných e-shopových napojení, přičemž odměny a objednávky musí být dohledatelné ke konkrétnímu napojení.
43. **Odpovědnost za data objednávky:** určit odpovědnost partnera za správnost údajů předávaných OneMilu (stav zaplacení, cena objednávky, produkty, e-mail zákazníka) a postup při chybě nebo duplicitním importu.
44. **Zpracování údajů zákazníků partnera:** posoudit role OneMil/partnera podle GDPR při předávání údajů zákazníka z e-shopu do OneMil a určit potřebné smluvní dokumenty a informační povinnosti.
45. **Ukončení partnerství:** určit, co se stane s již vydanými, ale dosud neaktivovanými kódy, již aktivovanými MIO, nevyfakturovanými aktivacemi a existujícími benefity/nabídkami při ukončení spolupráce s partnerem.
46. **Architektura právních dokumentů:** potvrdit, které dokumenty mají být samostatné pro koncového uživatele, partnera/e-shop, Affiliate/influencera/obchodníka a jednotlivé soutěže a které mohou být řešeny jedním společným dokumentem.
47. **VOP koncového uživatele:** připravit finální rozsah pro používání OneMil, MIO, platby, refundace, garantované benefity, vouchery, účet, reklamace, soutěžní účast a obecnou odpovědnost.
48. **Partnerské obchodní podmínky / smlouva:** rozhodnout, zda má mít partner samostatné B2B obchodní podmínky, individuální smlouvu, nebo kombinaci obojího; zahrnout odměny MIO, integraci e-shopu, fakturaci, trial, GDPR, odpovědnost za data, benefity/vouchery a ukončení spolupráce.
49. **Affiliate podmínky / smlouva:** rozhodnout, zda má mít Affiliate/influencer/obchodník samostatné podmínky nebo smlouvu; zahrnout atribuci, sazby, vznik a schválení provize, fakturaci, daně, reklamní povinnosti, storna a ukončení spolupráce.
50. **Pravidla konkrétní soutěže:** potvrdit, že každá soutěž má vlastní závazná pravidla/PDF a že obecná stránka /pravidla-souteze slouží jen k vysvětlení principu OneMil.
51. **GDPR a cookies:** určit, zda mají zůstat jako samostatné dokumenty a jak mají být provázány s VOP, Partner podmínkami a Affiliate podmínkami.
52. **Marketingové souhlasy:** potvrdit, zda mají být samostatným souhlasem mimo VOP/GDPR a jak evidovat jeho udělení/odvolání.
53. **Pořadí přednosti dokumentů:** určit, co má platit při rozporu mezi VOP, pravidly konkrétní soutěže, partnerskými/Affiliate podmínkami a individuální smlouvou.
54. **Verzování a účinnost:** určit, jak evidovat verze dokumentů, datum účinnosti, souhlasy uživatelů/partnerů/Affiliate a kdy je nutné získat nový souhlas po změně.
55. **Publikace a dostupnost:** určit, které dokumenty musí být veřejně dostupné před registrací, před platbou, před účastí v soutěži, před partner registrací a před Affiliate registrací.

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
