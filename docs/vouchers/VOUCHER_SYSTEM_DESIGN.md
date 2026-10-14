# OneMil Voucher System Design

Tento dokument je zdroj pravdy pro budoucí implementaci voucher systému OneMil. Popisuje cílové chování produktu, datový model a bezpečné fáze implementace. Nejde o migraci, technický rollout plán ani pokyn k okamžité změně produkce.

## Stav dokumentu

- Stav: schválený produktový a technický návrh pro budoucí implementaci.
- Fáze: Fáze 0, dokumentace.
- Rozsah: voucher systém OneMil pro unikátní kódy vydávané uživatelům po nákupu za MioCoiny.
- Mimo rozsah: partner portál, partner ověřovací stránka, partner API, fakturace, Stripe, soutěže, ticket systém, produkční migrace.

## 1. Základní princip

Voucher v OneMil je nabídka partnera, kterou nastavuje a spravuje admin OneMil. Partner v první verzi nevstupuje do OneMil systému jako správce voucheru. Partner dodá podklady a OneMil admin z nich vytvoří voucherovou kampaň.

Partner dodává zejména:

- grafiku nebo banner,
- text nabídky,
- podmínky použití,
- platnost,
- počet kusů,
- případně vlastní unikátní kódy.

Partner si zatím vouchery v OneMil sám nevytváří. Nebude mít portál pro tvorbu voucherů, OneMil ověřovací stránku ani API napojení. Partner si dodané nebo vygenerované kódy nahraje do svého vlastního systému a ověřuje je u sebe.

První verze voucher systému neřeší fakturaci, Stripe ani platby partnerovi. Voucher flow je interní OneMil produktový mechanismus: uživatel zaplatí 5 MioCoinů, OneMil mu vydá jeden unikátní kód a partner tento kód následně uznává ve svém vlastním procesu.

## 2. Současný systém a cílový posun

Současný systém už obsahuje základní tabulky `vouchers` a `user_vouchers`. `vouchers` eviduje nabídku, veřejnost, platnost, obrázky a kapacitu. `user_vouchers` eviduje vztah uživatele k voucheru a rozlišuje oblíbený vs. zakoupený stav přes `redeemed`.

Současné zobrazení zakoupeného voucheru ale nepoužívá skutečný partnerský kód. Kód ve frontendu je dnes jen odvozený identifikátor typu `OMV-...` generovaný z `user_vouchers.id`. To nestačí pro reálný voucher systém, protože partner potřebuje skutečný unikátní kód, který zná jeho vlastní systém.

Cílový posun je:

- `vouchers` zůstane hlavní tabulka pro voucherovou nabídku,
- přibude inventář skutečných unikátních kódů,
- při koupi se atomicky vydá jeden volný kód,
- zakoupený voucher bude zobrazovat právě tento přidělený kód,
- OneMil bude evidovat vydání kódu, ale ne jeho reálné použití u partnera.

## 3. Grafika voucher karty

Voucher karta ve veřejné aplikaci má být primárně grafická. Nemá působit jako textová tabulka nebo klasická kuponová dlaždice. Má vizuálně navazovat na prémiový styl OneMil karet, soutěžních karet a MioCoin balíčků.

Hlavním vizuálem voucheru je full-card banner:

- používá se `banner_url`,
- banner vyplňuje hlavní plochu karty,
- `image_url` zůstává jen jako legacy nebo fallback,
- na kartě se samostatně nevypisuje název partnera ani název voucheru,
- název partnera, název nabídky a hlavní sdělení jsou součástí grafického banneru připraveného adminem.

Karta má obsahovat jen minimum UI nad grafikou:

- grafický banner přes celé políčko,
- tlačítko `Detail`,
- malé bublinky v horní části karty.

Bublinky jsou doplňkové informace sladěné s OneMil vizuálem. Nemají přebít banner. Mohou zobrazovat platnost a dostupnost:

- `Platí do 30. 9.`,
- `Zbývá 100 ks`.

Když je dostupná jen jedna informace, zobrazí se jedna bublinka. Když jsou dostupné obě informace, zobrazí se dvě bublinky vedle sebe. Pokud informace není dostupná nebo by byla zavádějící, bublinka se nezobrazí.

## 4. Detail voucheru

Kliknutí na `Detail` otevře detail voucheru jako modál nebo samostatnou stránku. Volba modál vs. stránka je implementační detail, ale obsah musí být stejný a uživatel musí jasně rozumět, co kupuje.

Detail voucheru obsahuje:

- velký banner,
- popis voucheru,
- podmínky použití,
- platnost,
- návod k použití u partnera,
- dostupnost nebo počet zbývajících kusů,
- hlavní tlačítko `Koupit za 5 MioCoinů`.

Detail nesmí vytvářet dojem, že OneMil už v této fázi ověřuje použití kódu u partnera. Detail vysvětluje, že po koupi uživatel obdrží unikátní kód, který použije podle instrukcí partnera.

## 5. Uživatelský flow

Uživatel vidí dostupný voucher v seznamu voucherů. Na kartě klikne na `Detail`. V detailu si přečte podmínky, platnost a návod k použití. Pokud chce voucher získat, klikne na `Koupit za 5 MioCoinů`.

Po kliknutí na `Koupit za 5 MioCoinů` systém provede jednu atomickou operaci:

1. ověří, že uživatel je přihlášený,
2. ověří, že voucher je veřejný a dostupný,
3. ověří platnost podle data,
4. ověří, že existuje volný unikátní kód,
5. ověří, že uživatel má dostatek MioCoinů,
6. odečte 5 MioCoinů,
7. vybere jeden volný kód,
8. označí kód jako vydaný,
9. přiřadí kód uživateli,
10. vytvoří nebo aktualizuje zakoupený voucher uživatele.

Po úspěšné koupi se voucher přesune do sekce `Zakoupené`. Zakoupený voucher nemá tlačítko `Uplatnit voucher`, protože OneMil v první verzi neeviduje reálné uplatnění u partnera. Místo toho má tlačítko `Zobrazit kód`.

Kliknutí na `Zobrazit kód` otevře okno nebo modál s unikátním kódem. Uživatel může kód:

- zkopírovat,
- opsat,
- ukázat partnerovi.

Zavření okna nic nemění v databázi. Kód zůstává vydaný a lze ho zobrazit opakovaně. Zobrazení kódu není uplatnění. Je to pouze opakované nahlédnutí na již vydaný kód.

## 6. Kódy

OneMil nebude používat společné kódy typu `ORLEN10`. Společný kód se snadno šíří mimo aplikaci a OneMil ztrácí kontrolu nad tím, komu byl vydán. Pro OneMil je důležité evidovat, že konkrétní uživatel získal konkrétní kód.

Používat se budou pouze unikátní kódy.

Varianta A: OneMil generuje unikátní kódy. Admin zadá počet kusů a systém vytvoří požadovaný počet kódů. Tyto kódy může admin exportovat a poslat partnerovi, aby je partner nahrál do svého systému.

Varianta B: Partner dodá vlastní unikátní kódy. Admin je nahraje do OneMil, systém je zvaliduje, odhalí duplicity a zařadí do zásoby daného voucheru.

Partner si kódy eviduje a ověřuje ve svém vlastním systému. OneMil v první verzi neeviduje reálné použití kódu u partnera, protože bez přímého napojení na partnerův systém to nejde spolehlivě potvrdit.

## 7. Evidence v OneMil

OneMil má evidovat hlavně vydání kódů. Cílem je vědět, jaký kód existuje, ke kterému voucheru patří, komu byl vydán a jestli byl zneplatněn.

OneMil má evidovat:

- jaký kód existuje,
- ke kterému voucheru patří,
- jestli je volný, vydaný nebo zneplatněný,
- komu byl vydán,
- kdy byl vydán,
- ke kterému zakoupenému voucheru patří.

Stavy kódu:

- `available`: kód je volný a může být vydán,
- `issued`: kód byl vydán konkrétnímu uživateli,
- `voided`: kód byl zneplatněn adminem a nemá se dál používat.

V první verzi se nezavádí stav `used`. Bez partner portálu, ověřovací stránky nebo API napojení by takový stav nebyl spolehlivý. OneMil nesmí uživateli ani adminovi tvrdit, že ví o skutečném použití kódu u partnera, pokud tato informace nepřichází přímo z partnerova systému.

## 8. Admin kontrola

Admin voucherů má později vidět nejen nastavení voucheru, ale také stav kódové zásoby. Admin potřebuje kontrolovat, zda je pro veřejný voucher dostatek kódů a komu byly vydané kódy přiřazeny.

Admin má vidět:

- celkový počet kódů,
- počet volných kódů,
- počet vydaných kódů,
- počet zneplatněných kódů,
- komu byl kód vydán,
- kdy byl kód vydán,
- export kódů pro partnera,
- možnost zneplatnit kód.

Admin správa musí podporovat dva vstupy kódů:

- generování kódů OneMil,
- import kódů dodaných partnerem.

Export kódů pro partnera musí být přístupný jen oprávněnému adminovi. Export nesmí být veřejný a nesmí se zapisovat do logů. Pokud se v budoucnu bude řešit bezpečnější ukládání, může být export omezený jen na nově vytvořený batch nebo na speciální admin akci.

## 9. Databázový návrh

Tato část je návrhová. Není to migrace.

### Rozšíření `vouchers`

`vouchers` zůstává hlavní tabulka voucherové nabídky. Cílově může obsahovat nebo získat pole pro:

- interní admin název,
- veřejný status,
- `banner_url` jako hlavní full-card grafika,
- `image_url` jako legacy/fallback,
- popis voucheru,
- podmínky použití,
- návod k použití,
- platnost od/do,
- cenu v MioCoinech, v první verzi 5,
- volitelný partner/admin metadata údaj.

Současné `max_quantity` by cílově mělo odpovídat počtu dostupných kódů, aby nevznikl rozpor mezi textem `Zbývá 100 ks` a reálnou zásobou volných unikátních kódů. Pokud bude kapacita řízena kódy, je lepší počítat dostupnost z `voucher_codes` než držet ruční číslo odděleně.

### Nová tabulka `voucher_codes`

`voucher_codes` je inventář skutečných unikátních kódů.

Návrhové sloupce:

- `id`,
- `voucher_id`,
- `batch_id`,
- `code`,
- `status`,
- `issued_to_user_id`,
- `issued_user_voucher_id`,
- `issued_at`,
- `voided_at`,
- `voided_by`,
- `void_reason`,
- `created_at`,
- `created_by`,
- `source`.

`status` má používat jen hodnoty:

- `available`,
- `issued`,
- `voided`.

`source` může rozlišovat:

- `generated_by_onemil`,
- `provided_by_partner`.

Kód musí být unikátní minimálně v rámci aktivní zásoby. Prakticky je bezpečnější mít globální unikátnost nebo unikátnost v rámci voucheru podle produktového rozhodnutí. Import musí detekovat duplicity dřív, než se kódy dostanou do aktivní zásoby.

### Volitelná tabulka `voucher_code_batches`

`voucher_code_batches` slouží pro hromadnou správu generovaných nebo importovaných kódů.

Návrhové sloupce:

- `id`,
- `voucher_id`,
- `source`,
- `created_by`,
- `created_at`,
- `label`,
- `total_count`,
- `import_filename`,
- `notes`.

Batch pomáhá adminovi zjistit, kdy a odkud se kódy vzaly, kolik jich bylo nahráno a jaký export byl poslán partnerovi.

### Rozšíření `user_vouchers`

`user_vouchers` dnes reprezentuje oblíbený nebo zakoupený voucher uživatele. Cílově má být zakoupený voucher navázaný na konkrétní vydaný kód.

Návrhové rozšíření:

- `voucher_code_id`,
- případně `purchased_at`, pokud nebude dostačovat `created_at`/`updated_at`,
- zachování kompatibility s existující logikou oblíbených voucherů.

Zakoupený voucher musí mít přesnou vazbu na jeden vydaný kód. Uživatel nesmí vidět cizí kód a jeden kód nesmí být přiřazen více uživatelům.

## 10. Bezpečnost a rizika

Současný kód `OMV-...` ve `useUserVouchers.ts` není skutečný voucher kód. Je to jen frontendově vytvořený identifikátor z `user_vouchers.id`. Před reálným spuštěním voucher kódů se musí nahradit skutečným kódem z bezpečně řízené zásoby.

`buy_voucher_atomic` bude později muset kontrolovat `is_public = true`. Nákup nesmí povolit skrytý voucher, i kdyby uživatel znal jeho ID. Dostupnost musí znamenat veřejný, platný, nevyprodaný voucher s volným kódem.

Přidělení kódu musí být atomické. Jeden volný kód se nesmí vydat dvěma uživatelům. Výběr kódu musí být součástí stejné transakce jako odečet MioCoinů a vytvoření zakoupeného voucheru. Doporučený princip je uzamknout vybraný volný kód pro update a změnit jeho stav na `issued` v téže transakci.

Kódy nesmí být v logách. Nesmí se zapisovat do console logů, audit logů, Edge Function logů ani chybových hlášek. Pokud je nutné logovat operaci, loguje se jen `voucher_code_id`, batch, status nebo maskovaná hodnota.

Kódy nesmí být veřejně dostupné přes běžné selecty. RLS musí zajistit, že:

- běžný uživatel vidí jen svůj vydaný kód,
- admin vidí vše,
- partner v první verzi nemá přístup do OneMil systému,
- anonymní uživatel nevidí žádné skutečné kódy.

Bez partner napojení OneMil neví, zda byl kód skutečně použit. Proto se v první verzi nesmí používat UI ani databázový stav, který by tvrdil, že kód byl u partnera uplatněn.

Další rizika:

- rozpor mezi `max_quantity` a počtem volných kódů,
- import duplicitních partner kódů,
- export kódů do nesprávného souboru nebo nesprávné osobě,
- omylem zveřejněný voucher bez připravené zásoby kódů,
- zneplatnění již vydaného kódu bez jasného admin důvodu.

## 11. Co se zatím nebude dělat

První verze voucher systému záměrně nedělá:

- žádný partner portál,
- žádnou partner ověřovací stránku,
- žádné partner API,
- žádnou fakturaci,
- žádný Stripe,
- žádné změny soutěží,
- žádné změny ticket systému,
- žádné produkční migrace jako první krok,
- žádnou evidenci reálného použití kódu u partnera,
- žádné automatické finanční vypořádání s partnerem.

Tento limit je důležitý. Udržuje první implementaci bezpečnou, srozumitelnou a oddělenou od citlivých částí systému jako wallet top-up, Stripe, ticket purchase, soutěže a partner fakturace.

## 12. Implementační fáze

### Fáze 0: dokumentace

Vytvořit tento dokument jako schválený zdroj pravdy. Žádné změny aplikace, žádné změny databáze, žádná migrace, žádný Edge Function deploy a žádná produkční změna.

Výsledek fáze 0:

- existuje `docs/vouchers/VOUCHER_SYSTEM_DESIGN.md`,
- produktový a technický směr je zapsaný,
- další práce se řídí tímto dokumentem.

### Fáze 1: staging-only databázový základ pro kódy

Navrhnout a aplikovat pouze na staging aditivní databázový základ pro `voucher_codes` a případně `voucher_code_batches`. Ověřit RLS, unikátnost a vztahy na stagingu. Produkce se v této fázi nedotýká.

Fáze 1 nesmí měnit wallet, Stripe, soutěže, ticket systém ani produkční data.

### Fáze 2: admin správa kódů

Přidat admin nástroje pro správu kódů:

- generování OneMil kódů,
- import partner kódů,
- validace duplicit,
- přehled batchů,
- export kódů pro partnera,
- zneplatnění kódu.

Tato fáze může být nejprve pouze staging UI a staging DB. Export musí být chráněný a nesmí logovat kódy.

### Fáze 3: grafická full-card voucher karta a detail

Upravit veřejnou voucher kartu a detail voucheru podle tohoto dokumentu:

- full-card `banner_url`,
- `image_url` jako fallback,
- bublinky platnosti a dostupnosti,
- tlačítko `Detail`,
- detail s tlačítkem `Koupit za 5 MioCoinů`.

Tato fáze nesmí měnit význam zakoupených kódů ani zavádět tlačítko `Uplatnit voucher`.

### Fáze 4: přidělení unikátního kódu při koupi

Rozšířit nákup voucheru tak, aby při koupi atomicky vydal jeden volný unikátní kód. Nákup musí zkontrolovat:

- přihlášeného uživatele,
- `is_public = true`,
- datumovou platnost,
- dostupnost volného kódu,
- dostatek MioCoinů,
- že uživatel voucher už nekoupil.

Výsledkem je zakoupený voucher s vazbou na konkrétní `voucher_code_id`. Sekce `Zakoupené` zobrazuje tlačítko `Zobrazit kód`.

### Fáze 5: admin přehledy a kontrola vydaných kódů

Doplnit admin přehledy:

- celkový počet kódů,
- volné kódy,
- vydané kódy,
- zneplatněné kódy,
- komu byl kód vydán,
- kdy byl kód vydán,
- vazba na zakoupený voucher,
- audit admin zneplatnění.

Fáze 5 stále nemusí zavádět partner portál ani partner API. Pokud se později bude řešit reálné ověřování u partnera, má to být samostatná další fáze se samostatným schválením.

## 13. Shrnutí pravidel

První verze voucher systému je systém vydávání unikátních kódů, ne systém ověřování jejich reálného použití u partnera.

Správné pojmy:

- dostupný voucher,
- detail voucheru,
- koupit za 5 MioCoinů,
- zakoupený voucher,
- zobrazit kód,
- kód vydán.

Nepoužívat v první verzi:

- `Uplatnit voucher` jako tlačítko v OneMil,
- stav `used`,
- společné kódy typu `ORLEN10`,
- partner ověřovací flow,
- tvrzení, že OneMil ví o reálném použití kódu u partnera.

Hlavní bezpečnostní pravidlo: skutečný voucher kód smí vidět pouze oprávněný admin a uživatel, kterému byl konkrétní kód vydán.
