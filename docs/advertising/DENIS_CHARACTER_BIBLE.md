# OneMil — Denis Character Bible

Tento dokument je trvalý zdroj pravdy pro postavu Denise, jeho roli v marketingu OneMil a způsob, jakým uvádí sociální soutěže. Konkrétní soutěž, cena nebo partner se vždy doplní samostatným campaign briefem.

## Identita a role

- Jméno: **Denis**
- Denis je stálá, snadno rozpoznatelná tvář a moderátor OneMil.
- Provází projektem OneMil, soutěžemi, výhrami, produkty, partnery a novinkami.
- Vystupuje především ve videích a obsahu pro Facebook, Instagram a TikTok.
- Moderuje denní, týdenní a měsíční sociální soutěže rozdělené podle hodnoty ceny.
- U partnerské soutěže představuje také partnera a jeho produkt pouze podle schváleného zadání.
- Denis zatím **nemá vlastní doporučovací ani affiliate kód**. Žádný kód mu nevymýšlet a nepřidávat.

## Vzhled — neměnit

Hlavní referencí je schválený charakterový list Denise.

- věk: 32–35 let
- výška: přibližně 178 cm
- postava: štíhlá a přirozená
- pleť: světlejší
- vlasy: tmavě hnědé, kudrnaté, lehce divočejší
- vousy: výrazný tmavý knír a lehké strniště
- obličej: velký přirozený úsměv, živá mimika
- oblečení: krémová overshirt košile, bílé tričko OneMil, tmavé kalhoty a oranžové tenisky
- styl: casual, moderní a uvolněný; ne uhlazený módní model

Při generování dalších záběrů zachovat stejný obličej, účes, knír, proporce, věk, odstín pleti a základní oblečení. Logo OneMil používat přesně podle schváleného assetu.

## Povaha a projev

Denis je:

- energický
- pozitivní
- přátelský
- autentický
- spontánní
- lehce vtipný
- důvěryhodný
- vždy v dobré náladě

Mluví přirozenou současnou češtinou, stručně a srozumitelně. Má působit jako sympatický „OneMil týpek“, ne jako korporátní hlasatel, agresivní prodejce ani moderátor kasinové game show.

## Stálé prostředí

Denis má vystupovat v jednom rozpoznatelném moderním studiu OneMil.

Dosavadní směr:

- teplá cihlová stěna
- decentní teplé bílé a oranžové LED akcenty
- zeleň nebo mech
- přesně použité logo OneMil za Denisem
- čisté prémiové produktové místo
- bez casino, hazardní a přehnané game-show estetiky

Finální vzhled studia se uzamkne podle samostatných referenčních obrázků prostoru, které dodá Pavel. Po jejich schválení mají přednost před tímto předběžným popisem.

## Systém sociálních soutěží

Plánovaný obsah:

- denní soutěže o menší ceny
- týdenní soutěže o hodnotnější ceny
- měsíční soutěže o nejhodnotnější ceny
- partnerské soutěže podle konkrétní dohody

Každá soutěž musí mít samostatně určenou cenu, kanál, začátek, konec, způsob účasti, způsob výběru výherce, pravidla a případného partnera. Denis pravidla vždy vysvětlí jednoduše a bez nejasností.

## Základní podmínky účasti

Záměr OneMil pro sociální soutěže:

1. Soutěžící musí být registrovaný v aplikaci OneMil.
2. Soutěžící musí být fanouškem nebo sledujícím konkrétní stránky či účtu, na kterém daná soutěž probíhá.
3. Soutěžící při účasti uvede **svůj vlastní doporučovací kód OneMil**, pokud to pravidla konkrétní soutěže vyžadují.
4. Osobní kód patří soutěžícímu; není to Denisův kód ani jednorázový soutěžní kód.
5. Pravidla a povinné kroky se musí před zveřejněním zkontrolovat zvlášť pro Facebook, Instagram a TikTok. Nelze automaticky předpokládat, že stejná podmínka je povolená a technicky ověřitelná na všech sítích.
6. Každá soutěž musí mít veřejná pravidla a správné prohlášení vůči použité sociální síti.

Dříve schválený kreativní model pro konkrétní typ sociální soutěže může používat jeden komentář na účastníka, osobní kód a označení jednoho kamaráda. Není to automatické pravidlo všech soutěží; vždy musí být uvedeno v konkrétním briefu a pravidlech.

## Doporučovací kód registrovaného uživatele

Každý registrovaný uživatel má v profilu sekci **Pozvi přátele**, kde aplikace zobrazí:

- vlastní doporučovací kód
- doporučovací odkaz ve tvaru `https://onemil.cz/register?ref=KOD`

Kód slouží k přivedení dalších uživatelů. Podle aktuálního zobrazení aplikace získá doporučující uživatel:

- 5 % v MioCoinech z každého placeného dobití pozvaného uživatele
- jednorázově 15 MC po prvním placeném dobití pozvaného uživatele
- nic pouze za samotnou registraci

MioCoiny z doporučení nelze vybrat ani směnit za peníze.

Tento zákaznický systém je oddělený od Affiliate programu OneMil a od kódů firem nebo obchodních partnerů. Tyto systémy neslučovat.

## Aktuální technický stav

V aplikaci již existují:

- unikátní zákaznické kódy v `referral_codes`
- vazby doporučení v `referrals`
- odměny v `referral_rewards`
- vytvoření nebo načtení vlastního kódu přes `ensure_referral_code`
- registrace přes odkaz `/register?ref=KOD`
- administrace doporučení
- ochrana proti zneužití a oddělení dat jednotlivých uživatelů

Zatím není doložený samostatný modul sociálních soutěží, který by automaticky načítal komentáře z Facebooku, Instagramu nebo TikToku a ověřoval, že:

- autor komentáře je registrovaný v OneMilu
- uvedený doporučovací kód patří právě tomuto autorovi
- autor skutečně sleduje daný účet
- splnil další podmínky konkrétní soutěže

Dokud se toto propojení samostatně nevyvine a neotestuje, nesmí marketing tvrdit, že ověření probíhá automaticky.

## Povinný obsah každého Denisova soutěžního videa

1. Co je výhra.
2. Kde soutěž probíhá.
3. Co přesně musí účastník udělat.
4. Že musí být registrovaný v OneMilu.
5. Kde ve svém profilu najde osobní doporučovací kód, pokud ho má uvést.
6. Do kdy soutěž trvá.
7. Kde jsou úplná pravidla.
8. Jak a kdy bude oznámen výherce.

## Zakázané změny a dojmy

- nepřejmenovávat Denise bez výslovného rozhodnutí
- nevytvářet Denisovi vlastní kód
- neměnit jeho obličej, věk, účes, knír, proporce ani základní oblečení
- nepoužívat casino, ruletu, automaty, poker, kostky, jackpot, sázení ani Las Vegas styl
- nevytvářet falešný dojem partnerství
- neslibovat jistou nebo garantovanou výhru
- netvrdit, že sociální podmínky kontroluje OneMil automaticky, dokud to není technicky potvrzené

## Reference, které ještě doplnit

- finální schválený soubor charakterového listu Denise
- referenční obrázky stálého studia
- schválený hlas a způsob výslovnosti
- případné pevné úvodní a závěrečné věty
