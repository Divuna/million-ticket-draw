# OneMil pro partnery — přehled pro majitele (PR #114)

> **STAV: PŘIPRAVENO, ZATÍM NE V PRODUKCI.** Tento přehled popisuje, jak bude
> spolupráce fungovat po spuštění Partner API (PR #114). Spuštění vyžaduje
> výslovné schválení; do té doby jde o přípravu, ne o živý provoz.

Tento dokument je pro **majitele nebo manažera** partnerského e-shopu — bez
technických detailů. Technický návod pro vývojáře je v
[PARTNER_API_GUIDE.md](./PARTNER_API_GUIDE.md).

## Co pro vás OneMil dělá
Vašim zákazníkům dáváme za nákup u vás odměnu v **MioCoinech** — kredit, který
mohou využít v OneMilu (soutěže, výhry). Vy se nestaráte o soutěže ani výhry,
jen necháte svůj e-shop posílat OneMilu informaci o objednávkách. OneMil se
postará o zbytek.

## Jak to funguje, krok za krokem
1. **Zákazník nakoupí** ve vašem e-shopu jako obvykle.
2. **Váš e-shop pošle OneMilu na pozadí informaci o objednávce.** Zákazník na
   nic nečeká — pokladna funguje úplně normálně, i kdyby byl OneMil zrovna
   nedostupný.
3. **OneMil spočítá výši odměny** v MioCoinech podle vašeho nastavení v Partner
   portálu (kolik korun = 1 MioCoin). **Vy konečný počet MioCoinů neposíláte** —
   počítá ho OneMil.
4. **Vznikne čekající odměna** — kód a odkaz, který můžete dát zákazníkovi
   (např. do potvrzení objednávky). Zatím je to jen příslib.
5. **Když je objednávka zaplacená / doručená / dokončená**, odměna se
   **aktivuje** (stane se aktivní odměnou).
6. **Když je objednávka zrušená / vrácená / nezaplacená / nevyzvednutá**, odměna
   se **zruší** — žádné MioCoiny se nepřipíšou.
7. **Zákazník dostane MioCoiny až tehdy, když si aktivní kód uplatní** v OneMilu
   (přihlásí se a zadá kód). Bez uplatnění se nic nepřipisuje.

## Kdy a za co platíte
- **Při vytvoření objednávky se neděje nic účtovatelného.** Žádná faktura, žádný
  e-mail od OneMilu, žádné PDF, žádná platba, žádné připsání do peněženky.
- **Platíte až později a jen za MioCoiny, které byly skutečně aktivovány a
  zákazníky uplatněny** — podle stávající fakturační logiky OneMilu (souhrnné
  vyúčtování). Za čekající nebo zrušené odměny neplatíte nic.

## Co potřebujete k rozjezdu
- Schválený partnerský účet v OneMilu.
- Nastavený přepočet „kolik Kč = 1 MioCoin" v Partner portálu.
- Vývojáře (vlastního nebo dodavatele e-shopu), kterému předáte
  [PARTNER_API_GUIDE.md](./PARTNER_API_GUIDE.md).

## Časté otázky
- **Zpomalí to moji pokladnu?** Ne. OneMil se volá na pozadí a pokladna na něj
  nikdy nečeká.
- **Co když OneMil zrovna nefunguje?** Objednávka u vás proběhne normálně; váš
  systém událost OneMilu pošle znovu později.
- **Můžu omylem nastavit špatný počet MioCoinů?** Ne — počet vždy počítá OneMil
  z vašeho nastavení, vy ho neposíláte.
