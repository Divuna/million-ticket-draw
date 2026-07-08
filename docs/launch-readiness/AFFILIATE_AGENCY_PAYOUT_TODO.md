# OneMil — TODO: Affiliate provize a výplaty pro reklamní agentury

**Datum:** 07. 07. 2026  
**Stav:** návrh nutný před implementací / neschváleno pro ostré použití

## Poznámka

Affiliate provize a výplaty pro reklamní agentury se nesmí začít obchodně slibovat ani technicky zapínat bez nového návrhu a výslovného schválení Pavlem.

Aktuální stav v projektu:
- existuje technický základ affiliate účtů,
- existuje evidence přivedených zákazníků a firem,
- existuje výpočet provizí z placených zákaznických dobití a z placených B2B faktur,
- existuje základ výplatních dávek a bankovního exportu,
- ale affiliate program byl pro první veřejný test odložen mimo scope a výplaty se mají řešit až ve fázi zapnutí affiliate.

## Co se musí před spuštěním navrhnout

Nejdřív vytvořit konkrétní návrh, který Pavel schválí. Návrh musí odpovědět minimálně na tyto otázky:

1. **Kdo dostává provizi**
   - reklamní agentura,
   - registrovaná firma,
   - nebo podle domluvy buď agentura, nebo firma.

2. **Z čeho provize vzniká**
   - z fakturace firmy přivedené agenturou,
   - ze zákaznického dobíjení MioCoinů přes affiliate odkaz,
   - případně z obou větví.

3. **Jak se nastaví vztah agentura → firma → zákazník**
   - jestli zákaznické provize z dobíjení patří agentuře,
   - nebo firmě,
   - nebo musí mít každá firma vlastní affiliate kód.

4. **Jak dlouho provize běží**
   - zda trvale / lifetime,
   - nebo po omezenou dobu.

5. **Jak se provize schvalují a vyplácejí**
   - kdo je schvaluje,
   - kdy se dávka vytvoří,
   - kdy se označí jako zaplacená,
   - jak se řeší doklad / samofaktura / účetnictví.

6. **Co se bude psát do obchodních e-mailů agenturám**
   - nepoužívat formulace, že výplaty už ostré běží,
   - používat pouze bezpečnou formulaci: „připravujeme provizní model / první partnerskou vlnu / technické zázemí je připravené, ostré výplaty budou po schválení pravidel“.

## TODO: Úprava affiliate / provizní části OneMil

Současný affiliate systém se nemá rušit ani odebírat.

Cílem je pouze doplnit a zpřehlednit provizní část tak, aby byla jasná pro influencery, UGC partnery, běžné doporučující lidi, firmy, agentury a obchodníky.

### 1. Přepracovat registraci affiliate / provizního účtu

Současná stránka „Registrace Affiliate partnera“ je příliš zaměřená na influencery.

Obsahuje pole jako Instagram, TikTok, YouTube, Facebook, velikost publika a kategorie obsahu, což nedává smysl pro firmu, agenturu ani obchodníka.

Registrace se musí nejdřív zeptat, jaký typ účtu chce člověk nebo firma založit:

1. **Influencer účet**  
   Pro ty, kteří chtějí doporučovat OneMil hráčům / soutěžícím.

2. **Firemní účet**  
   Pro ty, kteří chtějí přivádět nebo zakládat firemní spolupráce.

#### Influencer účet — registrace

Influencer účet slouží pro ty, kteří přivádějí hráče / soutěžící do OneMil.

Formulář může obsahovat:

- jméno / název / přezdívku,
- e-mail,
- telefon,
- hlavní kanál / web / profil,
- Instagram,
- TikTok,
- YouTube,
- Facebook,
- velikost publika / dosah,
- kategorie obsahu,
- heslo.

V dalším kroku se pouze eviduje typ:

- influencer,
- UGC partner,
- běžný doporučující člověk.

Všichni mají stejné prostředí. Rozlišení slouží hlavně pro marketing, komunikaci a další práci s nimi.

#### Firemní účet — registrace

Firemní účet slouží pro ty, kteří přivádějí nebo zakládají firemní spolupráce v OneMil.

Formulář nemá vyžadovat influencer údaje jako Instagram, TikTok, YouTube, velikost publika nebo kategorii obsahu.

Formulář má obsahovat hlavně:

- název firmy / agentury / obchodníka,
- e-mail,
- telefon,
- web,
- IČO, pokud existuje,
- typ účtu: firma / agentura / obchodník,
- heslo.

Všichni mají stejné prostředí. Rozlišení slouží hlavně pro obchodní řízení, marketing a vyhodnocení spolupráce.

### 2. Rozdělit affiliate / provizní část na dvě větve

Affiliate / provizní část má mít dvě hlavní větve:

1. Influencer účet
2. Firemní účet

Nejde o rušení současného systému. Jde o přehlednější rozdělení toho, kdo co v systému dělá.

### 3. Influencer účet

Influencer účet je pro lidi, kteří přivádějí hráče / soutěžící do OneMil.

Patří sem:

- influencer,
- UGC partner,
- běžný člověk, který chce doporučovat OneMil.

Všichni v této větvi mají stejné prostředí.

Rozlišení influencer / UGC partner / běžný doporučující člověk se eviduje hlavně kvůli marketingu, komunikaci a dalšímu řízení spolupráce.

Influencer účet má zobrazovat hlavně:

- doporučovací kód / odkaz,
- přivedené hráče / soutěžící,
- provize z dobíjení těchto hráčů,
- výplatní profil.

Princip:

Influencer / UGC partner / doporučující člověk přivede hráče nebo soutěžícího do OneMil.

Tento hráč se registruje, používá aplikaci a později si může dobíjet MioCoiny.

Z dobíjení tohoto hráče vzniká provize pro influencer účet.

### 4. Firemní účet

Firemní účet je pro ty, kteří přivádějí nebo zakládají firemní spolupráce v OneMil.

Patří sem:

- firma,
- agentura,
- obchodník.

Všichni v této větvi mají stejné prostředí.

Rozlišení firma / agentura / obchodník se eviduje hlavně kvůli obchodnímu řízení, marketingu a vyhodnocení spolupráce.

Firemní účet má zobrazovat hlavně:

- založené / přivedené firmy,
- provize z fakturace firem,
- provize z dobíjení zákazníků firem,
- nastavení příjemců provizí,
- výplatní profil.

### 5. Pravidlo pro firemní účet

Kdo firemní spolupráci založí nebo přivede, ten nastavuje provize u této firmy.

Příklad:

- když firmu přivede agentura, nastavuje provize agentura,
- když firmu přivede obchodník, nastavuje provize obchodník,
- když se firma založí sama, nastavuje si provize firma.

### 6. Dvě provizní větve u každé firmy

U každé založené nebo přivedené firmy musí být možné nastavit dva samostatné příjemce provize:

1. příjemce provize z fakturace firmy vůči OneMil,
2. příjemce provize z dobíjení zákazníků této firmy.

Provize z fakturace firmy znamená provizi z toho, co firma platí OneMil.

Provize z dobíjení zákazníků firmy znamená provizi z toho, když si zákazníci této firmy později sami dobíjejí MioCoiny.

Každá z těchto dvou provizí má vždy jen jednoho příjemce.

Provize se nikdy nedělí mezi více výplatních účtů.

### 7. Možní příjemci provize u firmy

Příjemcem provize může být:

- firma,
- agentura,
- obchodník,
- konkrétní člověk z firmy,
- jiný schválený příjemce,
- nikdo.

U každé provizní větve se vždy vybere pouze jeden příjemce.

Příklad:

- provize z fakturace firmy → agentura,
- provize z dobíjení zákazníků firmy → člověk z firmy.

Nebo:

- provize z fakturace firmy → obchodník,
- provize z dobíjení zákazníků firmy → firma.

Nebo:

- provize z fakturace firmy → firma,
- provize z dobíjení zákazníků firmy → firma.

### 8. Výplatní profil

Každý příjemce provize musí mít vlastní výplatní profil.

Výplatní profil se nemusí řešit hned v prvním registračním formuláři.

Může být doplněný později v nastavení účtu nebo před první výplatou.

Výplatní profil má obsahovat:

- jméno / název příjemce,
- e-mail,
- číslo účtu,
- banku,
- IČO / DIČ, pokud jde o firmu nebo podnikatele,
- informaci, zda je příjemce plátce DPH.

Bez schváleného výplatního profilu se provize nesmí připravit k výplatě.

### 9. Admin schválení

Před výplatou musí být provize schválená adminem.

Admin musí vidět:

- komu provize patří,
- z čeho provize vznikla,
- za jaké období vznikla,
- na jaký výplatní profil se má vyplatit,
- jestli jde o provizi z dobíjení hráčů,
- jestli jde o provizi z fakturace firmy,
- nebo jestli jde o provizi z dobíjení zákazníků firmy.

### 10. Ochrana proti převzetí firmy

Při založení nebo přivedení firmy přes Firemní účet musí systém ověřit, zda už firma není evidovaná podle e-mailu, IČO nebo existujícího partner účtu.

Pokud firma už existuje nebo má aktivní lead, nesmí ji jiný Firemní účet znovu založit ani převzít.

Pokud už má firma přiřazeného affiliate / provizního vlastníka, nesmí se automaticky přepsat na jiný účet.

Duplicitní nebo sporné případy musí řešit admin.

## Bezpečnostní pravidlo

Dokud Pavel neschválí konkrétní návrh affiliate provizí pro agentury, nesmí se:
- spouštět ostré affiliate výplaty,
- veřejně slibovat automatické vyplácení provizí,
- měnit provizní logika v produkci,
- měnit peněžní toky,
- měnit pravidla výplat.

Jakákoli změna týkající se provizí, výplat, peněz, fakturace nebo produkční databáze vyžaduje výslovné Pavlovo schválení.

Bez výslovného schválení Pavla se také nesmí:

- rušit současný affiliate systém,
- odebírat existující affiliate funkce,
- dělit jednu provizi mezi více výplatních účtů.
