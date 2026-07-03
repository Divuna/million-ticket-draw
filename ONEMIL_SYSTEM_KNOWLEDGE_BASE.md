# OneMil — System Knowledge Base

**Status:** hlavní znalostní základna systému OneMil  
**Vlastník:** Pavel Diviš  
**Projekt:** OneMil  
**Účel:** jeden srozumitelný zdroj pravdy pro ChatGPT, Claude, Cursor, Codex, Paperclip, Boba a budoucí automatizace.

---

## 1. K čemu tento soubor slouží

Tento soubor vysvětluje celý OneMil tak, aby AI asistenti i lidé věděli:

- co OneMil je,
- jak funguje,
- co systém umí,
- kam projekt směřuje,
- jaké výhody nabízí zákazníkům, partnerům, e-shopům, značkám, influencerům a adminům,
- jaké moduly už existují,
- jaké věci se nesmí porušit,
- jak odpovídat na dotazy o OneMil,
- jak připravovat obchodní, technické, marketingové i provozní výstupy.

Tento dokument nemá nahrazovat detailní technickou dokumentaci. Má být hlavní přehledový mozek projektu.

---

## 2. Jak se má tento soubor používat

Každý AI asistent, který pracuje na OneMil, má před důležitým úkolem načíst tento soubor společně s aktuálním stavem projektu.

Doporučené pořadí čtení:

1. `ONEMIL_SYSTEM_KNOWLEDGE_BASE.md` — celkový přehled systému.
2. `onemil_state.md` — aktuální stav a otevřené věci.
3. `CLAUDE.md` — pracovní pravidla a bezpečnostní omezení.
4. `ONEMIL_BUSINESS_CONTEXT.md` — detailní obchodní model.
5. `onemil_history.md` — pouze pokud je potřeba historie změn.

---

## 3. Jednoduché vysvětlení OneMil

OneMil je česká prémiová odměnová a soutěžní platforma.

Firmám a e-shopům umožňuje odměňovat zákazníky MioCoiny, kupony, vouchery a speciálními nabídkami. Zákazník tyto odměny použije v aplikaci OneMil na soutěže, vouchery nebo další výhody.

Pro zákazníka je OneMil aplikace, kde může získat a používat MioCoiny, zapojovat se do soutěží o prémiové věcné ceny, využívat vouchery a přijímat nabídky od partnerů.

Pro partnera je OneMil marketingový a věrnostní systém, který pomáhá motivovat zákazníky k nákupu, návratu, registraci a další aktivitě.

---

## 4. Co OneMil není

OneMil se nesmí veřejně popisovat jako:

- casino,
- hazard,
- sázková platforma,
- loterie,
- jackpot,
- systém rychlého zbohatnutí,
- platforma pro peněžní výhry.

OneMil pracuje s interním kreditem MioCoin a s věcnými výhrami. MioCoin nelze vybrat zpět jako peníze ani převést mimo OneMil.

---

## 5. Hlavní hodnota OneMil

### Pro firmy a e-shopy

OneMil firmám umožňuje:

- odměňovat zákazníky bez složité vlastní aplikace,
- dávat zákazníkům MioCoiny za nákup nebo jinou akci,
- platit jen za reálně aktivované / použité MioCoiny,
- zvýšit atraktivitu nákupu bez klasické slevy,
- budovat opakovaný kontakt se zákazníkem,
- zapojit se do soutěží, voucherů a partnerských nabídek,
- být vidět jako partner v marketingu OneMil,
- měřit výkon kampaní a odměn.

### Pro zákazníky

OneMil zákazníkům umožňuje:

- získávat MioCoiny za nákupy u partnerů,
- dobíjet MioCoiny přímo v aplikaci,
- používat MioCoiny na soutěže,
- využívat vouchery,
- získávat Partner Offers,
- sledovat výhry a komunikaci v aplikaci,
- mít vše v profilu a peněžence.

### Pro influencery, obchodníky a agentury

OneMil umožňuje:

- přivádět zákazníky nebo firmy,
- používat vlastní referenční kódy,
- získávat provize podle potvrzeného modelu,
- pracovat s kampaněmi,
- zapojit značky, e-shopy a komunity.

---

## 6. Hlavní zákaznický tok

Základní tok zákazníka:

```text
zákazník nakoupí u partnera
→ získá MioCoiny / kupon / kód
→ aktivuje odměnu v OneMil
→ MioCoiny se připíšou do peněženky
→ použije je na soutěž, voucher nebo nabídku
→ vrací se zpět do OneMil nebo k partnerovi
```

---

## 7. Hlavní partner tok

Základní tok partnera:

```text
partner nastaví odměnu
→ zákazník provede nákup nebo akci
→ systém vytvoří odměnový kód / aktivaci
→ zákazník odměnu aktivuje v OneMil
→ partner platí jen za aktivovanou / použitou hodnotu
→ partner vidí výsledky a fakturaci
```

---

## 8. MioCoin

MioCoin je interní kredit OneMil.

Uživatel ho může získat:

- dobitím v aplikaci,
- aktivací partnerského kuponu,
- odměnou po nákupu u partnera,
- bonusem v soutěži,
- kampaní nebo akcí.

MioCoin lze použít:

- na soutěžní tickety,
- na vouchery,
- na vybrané výhody v aplikaci,
- na budoucí odměnové mechaniky.

MioCoin nelze:

- vybrat jako peníze,
- převést mimo OneMil,
- prezentovat jako sázkový token,
- používat jako veřejnou směnitelnou měnu.

---

## 9. Soutěže

Soutěže jsou prémiová zákaznická vrstva OneMil.

Princip:

- soutěž má pevný počet ticketů,
- tickety se otevírají postupně,
- výherní pozice jsou předem určeny,
- hlavní výhra patří držiteli posledního ticketu,
- bonusové výhry mohou být fyzické ceny nebo MioCoin bonusy,
- soutěž musí mít jasná pravidla.

Soutěže slouží k tomu, aby OneMil byl atraktivní pro zákazníky a aby MioCoiny měly zábavné využití.

Zakázané veřejné vysvětlení soutěží:

- náhodné losování,
- jackpot,
- sázka,
- casino styl,
- jistá výhra,
- peněžní výhra.

---

## 10. Vouchery

Voucher je nabídka, kterou zákazník získá nebo koupí uvnitř OneMil.

Aktuální směr voucher systému:

- vouchery mají vlastní grafiku,
- veřejně se zobrazují na homepage a `/vouchers`,
- zakoupené vouchery mají vlastní záložku,
- unikátní voucher kód se zobrazí až po kliknutí na detail / zobrazení kódu,
- vouchery mohou být napojené na partnery,
- vybrané vouchery mohou podporovat dobročinný účel.

Voucher není totéž co Partner Offer.

---

## 11. Partner Offers

Partner Offer je speciální nabídka partnera uvnitř OneMil.

Pravidla:

- Partner Offers nejsou výhry soutěže,
- nesmí se ukládat do `winners`,
- nesmí se ukládat do `bonus_prizes`,
- mohou se zobrazovat v `/wins` v záložce Nabídky,
- uživatel je může otevřít nebo skrýt,
- skrytí je jen uživatelské skrytí, ne fyzické smazání dat,
- partner po schválení nabídky nesmí měnit schválený obsah bez nového procesu.

Partner Offers jsou marketingový kanál partnera.

---

## 12. Partner API a e-shop napojení

OneMil podporuje napojení partnerů a e-shopů.

Cílem je, aby partner mohl:

- posílat zákazníkům MioCoin odměny,
- importovat objednávky,
- rozhodovat, kdy zákazník získá odměnu,
- používat vlastní napojení nebo jednodušší variantu bez API,
- sledovat aktivace a fakturaci.

Shoptet automatický import je důležitý existující směr. Umožňuje importovat objednávky a navazovat na ně odměny podle nastavení partnera.

---

## 13. Platby a Stripe

Stripe slouží pro platby v OneMil.

Aktuální strategický směr:

- Web/PWA first,
- Stripe zůstává hlavní platební cesta pro web,
- App Store a Google Play nákupní model je odložený,
- live přepnutí Stripe je samostatný vědomě schválený krok.

U plateb, peněženek a peněžních hodnot platí nejvyšší opatrnost. Žádné zásahy do produkčních peněženek, plateb, faktur nebo ekonomiky se nesmí dělat bez výslovného schválení Pavla.

---

## 14. Peněženka

Peněženka drží MioCoin zůstatek uživatele.

Pravidla:

- peněženka je citlivá část systému,
- historie transakcí je auditní stopa,
- testovací zásahy do produkční peněženky jsou zakázané bez schválení,
- cleanup nebo změny peněžních hodnot musí být vždy výslovně schválené.

---

## 15. Zprávy a Bob

Bob je AI chat v OneMil.

Pravidla Boba:

- odpovědi běží přes Supabase Edge Function `ai-chat`,
- každá běžná odpověď musí mít text a CTA,
- CTA vede podle tématu na správnou stránku,
- při přepojení na podporu může být CTA null,
- pokud admin poprvé odpoví v chatu, Bob se vypíná a chat přebírá podpora.

Bob má být užitečný, stručný, český a bezpečný. Nemá vymýšlet pravidla, ceny ani slibovat věci, které nejsou v systému.

---

## 16. Notifikace a e-maily

OneMil používá e-mailovou a notifikační vrstvu.

Typické použití:

- systémové e-maily,
- partnerské e-maily,
- zákaznické e-maily po aktivaci odměny,
- připomenutí,
- fronta e-mailů,
- interní provozní zprávy,
- push notifikace přes OneSignal.

Pro hromadnější nebo obchodní e-maily musí platit:

- neodesílat bez schválení,
- hlídat duplicity,
- evidovat historii odeslání,
- respektovat odhlášení / zákaz dalšího kontaktu,
- nepůsobit jako spam.

---

## 17. Sofinity

Sofinity je reportingová a marketingová vrstva napojená na OneMil.

OneMil může do Sofinity posílat eventy jako:

- registrace uživatele,
- nákup voucheru,
- použití MioCoinu,
- uzavření soutěže,
- výhra,
- notifikace nebo e-mail.

Sofinity má pomáhat s reportingem, kampaněmi, marketingem a analýzou výkonu.

---

## 18. Admin

Admin část slouží pro řízení systému.

Admin spravuje zejména:

- soutěže,
- vouchery,
- výhry,
- partnery,
- fakturaci,
- uživatele,
- affiliate účty,
- testy a provozní kontroly,
- budoucí lead databázi.

Admin změny mají být přesné a bezpečné. U peněz, walletů, faktur, soutěžní logiky, RLS a produkčních migrací je nutné schválení Pavla.

---

## 19. Affiliate / influencer / obchodník

OneMil má affiliate vrstvu.

Smysl:

- influenceři mohou přivádět uživatele,
- obchodníci a agentury mohou přivádět firmy,
- provize se počítají podle schváleného modelu,
- payouty mají mít auditní stopu,
- obchodníci nemají mít možnost měnit systémová data mimo svůj rozsah.

---

## 20. Lead databáze a sales automatizace

Cílový směr:

OneMil má mít v adminu sekci pro obchodní leady.

Lead databáze má evidovat:

- název firmy,
- web,
- obor,
- typ firmy,
- produkty nebo služby,
- veřejný kontakt,
- sociální sítě,
- vhodnost pro OneMil,
- vhodnost pro MioCoin odměny,
- vhodnost pro vouchery,
- vhodnost pro Partner Offers,
- vhodnost jako dodavatel soutěžních cen,
- prioritu A/B/C,
- stav oslovení,
- poznámky,
- zdroj,
- datum přidání,
- poslední kontrolu.

Automatizace může:

- hledat firmy,
- najít veřejný kontakt,
- zhodnotit vhodnost,
- připravit návrh e-mailu,
- uložit lead do adminu.

Automatizace nesmí:

- sama bez schválení hromadně kontaktovat firmy,
- posílat spam,
- předstírat partnerství,
- slibovat ceny, které nejsou schválené,
- uvádět nepravdivé informace.

---

## 21. Obchodní vysvětlení pro firmu

Když AI vysvětluje OneMil firmě, má používat tento rámec:

OneMil pomáhá firmám odměňovat zákazníky MioCoiny, které zákazník využije v prémiové soutěžní a odměnové aplikaci. Firma může nabídnout atraktivnější benefit než běžnou slevu a platí jen za aktivovanou / použitou hodnotu podle nastavení spolupráce.

Hlavní argumenty:

- zákazník dostane zajímavější odměnu než malou slevu,
- firma neplatí za nevyužité odměny,
- OneMil pomáhá s marketingovou viditelností,
- systém je měřitelný,
- partner může nastavovat výši odměn,
- lze využít MioCoiny, vouchery i Partner Offers,
- OneMil vytváří důvod, proč se zákazník vrací.

---

## 22. Segmenty firem a co jim nabízet

### E-shopy

Nabízet:

- MioCoiny za nákup,
- kampaně podle hodnoty objednávky,
- vouchery,
- Partner Offers,
- zapojení do soutěží.

### Sportovní e-shopy

Nabízet:

- MioCoiny za nákup vybavení,
- soutěže o sportovní produkty,
- sezónní kampaně,
- bonusové výhry.

### Auto-moto firmy

Nabízet:

- prémiovou viditelnost,
- soutěže o auto-moto produkty,
- partnerství kolem hlavních cen,
- MioCoiny za servis, nákup nebo poptávku.

### Móda a lifestyle

Nabízet:

- vouchery,
- Partner Offers,
- kampaně s influencery,
- prémiovou prezentaci značky.

### Elektronika

Nabízet:

- soutěže o elektroniku,
- MioCoiny za nákup,
- produktové kampaně,
- vouchery a nabídky.

### Lokální firmy a restaurace

Nabízet:

- jednoduché zákaznické odměny,
- vouchery,
- lokální kampaně,
- menší MioCoin odměny za návštěvu nebo nákup.

---

## 23. Nejčastější námitky firem

### „Kolik nás to bude stát?“

Odpověď:
Nastavení může být postavené tak, aby firma platila až podle reálně aktivované / použité hodnoty. Neplatí za odměny, které zákazníci nikdy nevyužijí.

### „Proč nedat zákazníkovi raději slevu?“

Odpověď:
Sleva často jen sníží marži. MioCoin dává zákazníkovi zážitek, možnost soutěžit a důvod vracet se do OneMil i zpět k partnerům.

### „Není to hazard?“

Odpověď:
OneMil není hazardní platforma. MioCoin je interní kredit, nelze ho vybrat jako peníze a výhry jsou věcné. Soutěže mají jasná pravidla a předem daný průběh.

### „Musíme něco složitě napojovat?“

Odpověď:
Napojení může mít více úrovní. Pro některé partnery lze začít jednodušší variantou a teprve později přejít na automatizované napojení.

---

## 24. Veřejný styl komunikace

OneMil má komunikovat:

- česky,
- jasně,
- prémiově,
- důvěryhodně,
- bez přehnaných slibů,
- bez hazardního slovníku,
- bez laciného „zbohatni“ stylu.

Preferované výrazy:

- soutěž,
- výhra,
- prémiová cena,
- MioCoin,
- voucher,
- odměna,
- partner,
- zákaznická výhoda,
- jasná pravidla.

Zakázané nebo rizikové výrazy:

- hazard,
- sázka,
- jackpot,
- casino,
- žetony,
- jistá výhra,
- peněžní výhra,
- zaručený zisk.

---

## 25. Vizuální směr

Aktuální veřejný zákaznický UI směr je light/champagne premium styl s oranžovými a amber akcenty.

Platí pro zákaznické části:

- homepage `/`,
- `/games`,
- `/vouchers`,
- `/wins`,
- `/winners`,
- `/profile`,
- `/messages`,
- `/login`,
- logged-out zákaznické stavy.

Admin, partner portál a affiliate/influencer část se nemají automaticky převádět do tohoto stylu bez samostatného schválení.

---

## 26. Co se musí vždy chránit

Bez výslovného schválení Pavla se nesmí:

- měnit produkční wallet zůstatky,
- měnit produkční platby,
- mazat nebo přepisovat finanční historii,
- měnit soutěžní ekonomiku,
- měnit `buy_ticket_atomic`,
- měnit RLS pravidla,
- spouštět produkční migrace,
- mazat produkční data,
- měnit live Stripe nastavení,
- měnit pravidla hlavních cen nebo ticketů.

---

## 27. Jak odpovídat Pavlovi

Když se Pavel ptá na OneMil:

- odpovídat česky,
- krátce a konkrétně,
- nejdřív ověřit GitHub/Supabase, pokud jde o aktuální stav,
- nevymýšlet názvy tabulek, souborů ani funkcí,
- pokud něco není ověřené, říct to,
- pokud má Pavel něco udělat, dát jen jeden konkrétní krok,
- pokud není žádný krok pro Pavla, nepsat prompt.

---

## 28. Jak se má tento soubor aktualizovat

Tento soubor se aktualizuje vždy, když vznikne nebo se zásadně změní:

- hlavní funkce,
- obchodní model,
- partner tok,
- zákaznický tok,
- Bob / AI pravidla,
- platební model,
- voucher model,
- soutěžní model,
- sales automatizace,
- lead databáze,
- právní nebo komunikační pravidlo,
- hlavní vizuální systém.

Pravidlo:

- aktuální pravda patří sem,
- detailní aktuální stav patří do `onemil_state.md`,
- chronologická historie patří do `onemil_history.md`,
- pracovní pravidla pro kódování patří do `CLAUDE.md`.

---

## 29. Aktuální směr projektu

OneMil směřuje k tomu být:

- prémiová zákaznická aplikace,
- B2B odměnový systém pro firmy,
- marketingový kanál pro partnery,
- soutěžní a voucherový ekosystém,
- platforma pro influencery, obchodníky a agentury,
- automatizovaný systém pro leady, partnery, e-maily, kampaně a reporting.

Krátkodobý směr:

- stabilizovat veřejné UI,
- dokončit voucher systém,
- připravit lead databázi,
- připravit bezpečnou sales automatizaci,
- držet Web/PWA first strategii,
- nepřepínat live Stripe bez samostatného schválení.

---

## 30. Jedna věta pro AI asistenty

OneMil je prémiová česká B2B odměnová a marketingová platforma s MioCoiny, vouchery, partnerskými nabídkami a soutěžní zákaznickou vrstvou; AI má vždy vycházet z aktuálních souborů projektu, chránit peněžní a soutěžní logiku a neprovádět žádné rizikové změny bez Pavlova schválení.
