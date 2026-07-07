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

## Bezpečnostní pravidlo

Dokud Pavel neschválí konkrétní návrh affiliate provizí pro agentury, nesmí se:
- spouštět ostré affiliate výplaty,
- veřejně slibovat automatické vyplácení provizí,
- měnit provizní logika v produkci,
- měnit peněžní toky,
- měnit pravidla výplat.

Jakákoli změna týkající se provizí, výplat, peněz, fakturace nebo produkční databáze vyžaduje výslovné Pavlovo schválení.
