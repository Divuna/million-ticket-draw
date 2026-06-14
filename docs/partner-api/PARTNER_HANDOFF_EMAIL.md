# Předávací e-mail partnerovi (návrh)

> **STAV: PŘIPRAVENO, ZATÍM NE V PRODUKCI.** Tento e-mail odeslat partnerovi
> teprve **po** spuštění Partner API (rollout PR #114). Do té doby jde o návrh.
> Nahraďte `[Jméno]`, `[název e-shopu]` a doplňte způsob předání dokumentů
> (příloha nebo odkaz na soubory).

---

**Předmět:** OneMil — jak napojit váš e-shop a odměňovat zákazníky MioCoiny

Dobrý den [Jméno],

děkujeme za zájem zapojit [název e-shopu] do OneMilu. Napojení je jednoduché a
**nijak nezdrží ani neovlivní vaši pokladnu** — váš e-shop pošle OneMilu základní
informaci o objednávce na pozadí a my za nákup odměníme vašeho zákazníka
v MioCoinech.

Jak to funguje ve zkratce:
- Zákazník u vás nakoupí jako obvykle.
- Váš systém pošle OneMilu událost o objednávce (vytvoření, zaplacení, zrušení…).
- OneMil sám spočítá výši odměny podle vašeho nastavení (kolik Kč = 1 MioCoin) —
  vy konečný počet MioCoinů neposíláte.
- Odměna je nejdřív „čekající"; po zaplacení/doručení se aktivuje. Zákazník
  MioCoiny dostane, až si aktivní kód uplatní v OneMilu.
- Platíte až později a jen za skutečně aktivované a uplatněné MioCoiny.

Připravili jsme pro vás dva dokumenty:
- **Přehled pro vás** (netechnický): `PARTNER_OWNER_OVERVIEW.md`
- **Technický návod pro vývojáře** (kompletní API): `PARTNER_API_GUIDE.md`

**Další krok:** předejte prosím technický návod (`PARTNER_API_GUIDE.md`) svému
vývojáři nebo dodavateli e-shopu — obsahuje vše potřebné k napojení. Rádi
zodpovíme jakékoli dotazy.

S pozdravem
Pavel Diviš
OneMil
📧 podpora@onemil.cz
