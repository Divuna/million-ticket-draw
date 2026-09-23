# OneMil — finální balík pro Libra AI

**Status:** předávací export pro právní review, nikoli nový zdroj pravdy  
**Datum:** 23. 9. 2026  
**Provozovatel:** iCONIC POINT s.r.o., IČO 17795851, DIČ CZ17795851  
**Sídlo:** Na Folimance 2155/15, Vinohrady, 120 00 Praha 2  
**Web:** www.onemil.cz  
**Podpora:** podpora@onemil.cz  
**Telefon:** +420 731 215 816

> Tento soubor je jednorázový předávací balík pro Libra AI. Při budoucím rozporu se vždy řiď zdroji v pořadí:
> 1. `ONEMIL_BUSINESS_CONTEXT.md`
> 2. `COMPANY_CONTEXT.md`
> 3. `docs/pravni-dokumenty/`
> 4. `docs/launch-readiness/` pouze jako auditní podklady.

---

## 1. Zadání pro Libra AI

Připrav kompletní právní dokumentaci pro **cílový ostrý stav OneMil**.

Všechny níže uvedené potvrzené funkce a obchodní mechanismy považuj pro účely právního zpracování za stav, který bude před ostrým spuštěním dokončený. Známé technické mezery jsou interní implementační úkoly OneMil a **nesmí vést k tomu, že potvrzený produktový model z právních textů vynecháš**.

Pokud je některé potvrzené obchodní pravidlo právně nepřípustné, rizikové nebo vyžaduje změnu, výslovně to označ, vysvětli proč a navrhni nejmenší nutnou změnu. Bez vysvětlení sama neměň ekonomiku, princip soutěže ani role stran.

U otevřených bodů navrhni konkrétní právně bezpečné řešení a přesné znění. Pokud je potřeba obchodní rozhodnutí Pavla, napiš přesně jaké.

### Požadovaný výstup

Připrav:
1. finální VOP pro koncového uživatele,
2. finální GDPR,
3. finální Cookies,
4. finální Obecná pravidla soutěží,
5. finální šablonu pravidel konkrétní soutěže,
6. Partnerské B2B podmínky / smluvní rámec,
7. Affiliate podmínky / smluvní rámec,
8. texty registračních potvrzení, marketingového souhlasu, cookie souhlasů a případného souhlasu s okamžitým čerpáním MIO,
9. seznam nutných změn aplikace/procesů, aby právní text a skutečné chování byly shodné,
10. seznam launch blockerů.

Na konci přidej tabulku:
`Oblast | Právní závěr | Nutná změna textu | Nutná změna aplikace/procesu | Priorita před startem`

A změny rozděl na:
- A: před Stripe live,
- B: před první ostrou soutěží,
- C: může počkat.

---

## 2. Co OneMil je

OneMil je partnerská odměnová a marketingová platforma s uživatelskou soutěžní vrstvou. Není pouze samostatná soutěžní aplikace.

Pro koncového uživatele propojuje zejména:
- MIO,
- garantované nákupní benefity,
- spotřebitelské soutěže o věcné ceny,
- vouchery,
- Partner Offers,
- hlavní a bonusové výhry.

iCONIC POINT s.r.o. provozuje platformu, ale není automaticky poskytovatelem všech benefitů, voucherů nebo partnerských nabídek.

---

## 3. Pevná pravidla — obchodní model neměnit bez právního důvodu

- Veřejný název interního kreditu je **MIO**. Nepoužívat nově MioCoin/MioCoiny.
- MIO je interní digitální kredit OneMil.
- MIO nelze běžně vyplatit v penězích ani převést mimo OneMil.
- Placené MIO má platnost **12 měsíců od konkrétního dobití**.
- Soutěžní část OneMil je určena pouze osobám **18+**.
- Zákazník nekupuje samostatný soutěžní tiket.
- Za MIO pořizuje **garantovaný nákupní benefit** a dostává **1 tiket zdarma jako bonus**.
- Garantovaný benefit není soutěžní výhra.
- Garantovaný benefit má konkrétního skutečného poskytovatele.
- Tikety se přidělují sekvenčně 1, 2, 3...
- Hlavní výhru získává držitel **posledního tiketu**.
- Bonusové výhry mohou být přiřazeny k předem určeným tiketům.
- Konkrétní čísla bonusových výherních pozic nejsou účastníkům předem zobrazena.
- Po vydání prvního tiketu se celkový počet tiketů soutěže nemění.
- Každá soutěž má vlastní závazná pravidla/PDF.
- Partner může měnit odměňování pouze pro budoucí objednávky; historie se zpětně nepřepočítává.
- Jedna partnerská firma může mít více samostatných e-shopů.
- Partnerský odměnový kód má platnost **90 dní**.
- Partner platí pouze za skutečně aktivované MIO.
- Základní partnerská cena: **1 aktivované MIO = 1 Kč bez DPH + DPH**.
- Zahajovací partnerská akce trvá **30 dní**; první **2 MIO z každé aktivované odměny** hradí OneMil.
- Běžný uživatel má za osobní doporučení nepeněžní odměnu: **5 % v MIO z placených dobití doporučeného uživatele**.
- Navíc jednorázově **15 MIO po jeho prvním placeném dobití**.
- Za samotnou registraci v uživatelském doporučení odměna nevzniká.
- Affiliate je oddělený systém.
- Influencer / Obchodník / Agentura může dostávat peněžní provize v Kč.
- Affiliate zákaznická provize se má počítat ze skutečně zaplacených Kč; výchozí sazba je 5 %, pokud není individuálně nastavena jinak.
- Affiliate provize za přivedenou firmu vzniká z uhrazených partnerských faktur bez DPH; výchozí sazba je 5 %.
- Voucher, garantovaný benefit a Partner Offer jsou odlišné věci.
- Marketingový souhlas je samostatný a dobrovolný.

---

## 4. MIO, platby a refundace

Platby za MIO probíhají přes Stripe v CZK.

Před platbou musí uživatel vidět cenu v Kč, počet MIO a případná bonusová MIO.

Příklady aktuálních balíčků:
- 50 Kč → 50 MIO
- 300 Kč → 310 MIO
- 500 Kč → 525 MIO
- 1 200 Kč → 1 280 MIO

Balíčky se mohou měnit. Proto nelze u zákaznického dobití obecně tvrdit „1 MIO = 1 Kč“.

OneMil nechce absolutní formulaci „zakoupené MIO nelze vrátit“. Libra má vyřešit 14denní odstoupení, okamžité čerpání, případný souhlas se započetím plnění, částečně spotřebované MIO, bonusová MIO při refundaci a chybné/duplicitní platby.

---

## 5. Soutěžní model

Podporovaný soutěžní nákup:
`MIO → garantovaný nákupní benefit + 1 tiket zdarma`.

Hlavní výhra = držitel posledního tiketu.

Bonusové pozice jsou určeny předem, konkrétní čísla jsou skrytá a uživatel může předem vidět druhy dostupných bonusových výher.

Každá soutěž má pevný počet tiketů a vlastní pravidla/PDF.

Libra musí výslovně posoudit, zda a za jakých podmínek tento model nespadá pod regulaci hazardních her.

---

## 6. Garantované benefity, vouchery a Partner Offers

### Garantovaný nákupní benefit
- pořizuje se za MIO,
- tiket je k němu zdarma,
- není výhrou,
- má konkrétního poskytovatele,
- má podmínky použití a platnost.

Podporovaný soutěžní nákup se nesmí dokončit bez přiděleného garantovaného benefitu.

### Voucher
Samostatná nabídka odemykaná/kupovaná za MIO. Nemusí být spojená s tiketem.

### Voucher v soutěži
Volitelný bonus, nikoli garantovaný benefit pro každého.

### Partner Offer
Marketingová nabídka partnera; není výhra, garantovaný benefit ani automaticky voucher.

Libra má určit odpovědnost při odmítnutí benefitu, nefunkčním kódu nebo ukončení činnosti partnera.

---

## 7. Výhry

Pravidla konkrétní soutěže musí řešit způsob předání, reakční lhůtu, lhůtu pro předání, náklady a nepřevzetí.

Není potvrzeno obecné pravidlo „výhra propadne po 30 dnech“.

Libra má vyřešit daně, dopravu, přepis/registraci, správní poplatky a specifika různých typů výher.

---

## 8. Účet, blokace a výmaz

Libra má určit, co se při blokaci nebo zrušení účtu stane s placeným MIO, ostatním MIO, benefity, vouchery, tikety, již vzniklými výhrami a zákonně uchovávanými záznamy.

OneMil nechce automatickou klauzuli „vše bez náhrady propadá“.

---

## 9. Reklamace a odpovědnost

Podpora:
- podpora@onemil.cz
- +420 731 215 816
- zprávy v aplikaci.

Reklamace mohou řešit platby, MIO, garantované benefity, vouchery, tikety, výhry a technické chyby.

Nechceme absolutní vyloučení refundací, odpovědnosti ani blokaci bez vypořádání práv uživatele.

Libra má rozdělit odpovědnost mezi OneMil, konkrétního partnera a externí poskytovatele.

---

## 10. Osobní kódy

Běžný uživatel může mít osobní kód / odkaz.

Cílové odměny:
- 5 % v MIO z placených dobití doporučeného uživatele,
- 15 MIO po jeho prvním placeném dobití,
- nic za samotnou registraci.

MIO z tohoto programu není peněžní provize.

Libra má potvrdit podmínky storna při refundaci a ochranu proti self-referralu a zneužití.

---

## 11. Affiliate

Affiliate může přivádět zákazníky i firmy.

### Zákaznická provize
- ze skutečně zaplacených zákaznických dobití v Kč,
- výchozí sazba 5 %.

### Provize za firmu
- z reálně uhrazených partnerských faktur,
- z částky bez DPH,
- výchozí sazba 5 %.

Libra má vyřešit smluvní režim, fakturaci, DPH, daně, vznik nároku, storna, podvody, ukončení a označování reklamy.

---

## 12. Partnerský B2B model

Partner může dávat MIO za nákup, opakovaný nákup, vybrané produkty, kampaně, věrnost a jiné dohodnuté aktivity.

Možné režimy:
1. celý e-shop,
2. jen vybrané produkty,
3. celý e-shop + produktové výjimky.

Partnerský kód má platnost 90 dní.

Partner platí jen za aktivované MIO.

Cena: 1 aktivované MIO = 1 Kč bez DPH + DPH.

Zahajovací akce:
- 30 dní,
- první 2 MIO každé aktivované odměny hradí OneMil.

Libra má vyřešit i případ, kdy po 100% slevě vyjde 0 Kč, a GDPR vztah e-shop ↔ OneMil.

---

## 13. GDPR, cookies a AI

Správce: iCONIC POINT s.r.o.

Relevantní služby:
- Supabase
- Vercel
- Stripe
- Resend
- OneSignal
- Google
- Meta
- Sofinity
- OpenAI
- dopravci

### Bob / OpenAI
Při použití Boba se může předávat aktuální zpráva, až 10 předchozích zpráv, jméno, omezená data účtu a přehled soutěží.

E-mail se automaticky nepřidává, pokud jej uživatel sám nenapíše.
Bob nerozhoduje o výherci.

### Cookies
Cílové kategorie:
- nezbytné,
- analytické,
- marketingové.

GTM až po příslušném souhlasu.
Meta Pixel až po marketingovém souhlasu.
Souhlas se eviduje lokálně i v databázi.
Push řeší OneSignal.

---

## 14. Dokumenty, které má Libra připravit

- VOP zákazníka,
- GDPR,
- Cookies,
- Obecná pravidla soutěží,
- šablonu pravidel konkrétní soutěže,
- Partnerské B2B podmínky/smluvní rámec,
- Affiliate podmínky/smluvní rámec,
- texty souhlasů.

Libra má určit vzájemnou přednost dokumentů, verzování a kdy je nutný nový aktivní souhlas.

---

## 15. Známé technické mezery — cílový právní text s nimi má počítat jako s dokončenými před startem

1. 12měsíční expirace placeného MIO ještě není plně technicky vynucena.
2. 5% uživatelská referral odměna se dnes eviduje, ale audit zjistil, že se nepřipisuje do peněženky.
3. Jednorázový bonus 15 MIO po prvním placeném dobití doporučeného uživatele není ještě plně ověřený produkční flow.
4. Affiliate zákaznická provize musí být technicky počítána ze skutečně zaplacených Kč, ne z počtu připsaných MIO.
5. Reálný end-to-end výmaz/anonymizace účtu musí být ověřen.
6. Stripe live se přepne až po právním review.
7. Staré veřejné výrazy MC/MioCoin musí být sjednoceny na MIO.
8. Affiliate atribuce musí být ověřena end-to-end, aby se kód neztrácel cestou na registraci.
9. Uživatelské referral a Affiliate kódy musí být chráněné proti kolizi.
10. U více e-shopů jedné firmy musí být dotažena identita konkrétního napojení.

---

## 16. Otevřené právní otázky

Libra má navrhnout/rozhodnout:
1. právní kvalifikaci MIO,
2. 14denní odstoupení,
3. okamžité čerpání,
4. refundaci po částečném spotřebování,
5. bonusová MIO při refundaci,
6. podmínky 12měsíční expirace,
7. expiraci ostatních druhů MIO,
8. pořadí čerpání MIO,
9. vypořádání při blokaci/smazání účtu,
10. odpovědnost za benefit/voucher,
11. reklamaci nefunkčního benefitu,
12. nepřevzetí výhry,
13. daně a náklady výher,
14. změnu/přerušení soutěže,
15. formulaci „na výhru není právní nárok“,
16. dostatečnost 18+ potvrzení,
17. reklamační lhůty,
18. ADR/ČOI,
19. GDPR checkbox při registraci,
20. GDPR role Partner ↔ OneMil,
21. Bob/OpenAI,
22. retenční doby,
23. přenosy mimo EU/EHP,
24. cookies/marketing/push,
25. Affiliate smluvní a daňový režim,
26. Partner B2B smluvní režim,
27. hierarchii právních dokumentů,
28. kdy vyžadovat nový souhlas,
29. účetní řešení 0 Kč během partnerské akce,
30. hazardní posouzení celého soutěžního modelu.

---

## 17. Co Libra nemá sama vymýšlet

U konkrétní soutěže musí OneMil dodat:
- území,
- přesnou specifikaci a hodnotu hlavní výhry,
- způsob předání,
- reakční lhůtu,
- lhůtu pro předání,
- kdo hradí konkrétní náklady,
- konkrétní variantu při nepřevzetí, pokud zákon dovoluje více možností,
- zvláštní podmínky.

Libra má určit právní mantinely, ne vymýšlet obchodní fakta.

---

## 18. Současný právní stav, který se má přepsat

Současné VOP jsou příliš krátké, používají starý název MioCoin, popisují OneMil jen jako soutěžní platformu a obsahují absolutní tvrzení „zakoupený kredit nelze vrátit“.

Současné Cookies neodpovídají plně cílovému chování technologií.

Současná obecná pravidla soutěží obsahují placeholdery a nesmí sloužit jako pravidla konkrétní soutěže.

GDPR návrh je nejdále, ale vyžaduje právní kontrolu právních základů, zpracovatelů, přenosů, retenčních dob, AI a vztahu Partner ↔ OneMil.

---

## 19. Klíčová zásada

Právní dokumenty a produkt se musí shodovat.

Pokud právní řešení vyžaduje změnu UI, checkboxu, potvrzení, evidence nebo procesu, uveď přesně:
- kde má být,
- před jakou akcí,
- co má uživatel vidět,
- co má potvrdit,
- co musí OneMil uložit jako důkaz.
