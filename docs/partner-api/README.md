# OneMil Partner API — onboarding sada (PR #114)

> **STAV: PŘIPRAVENO, ZATÍM NE V PRODUKCI.**
> Celá tato sada popisuje Partner API zavedené v PR #114. Stává se platnou
> **až po produkčním rolloutu PR #114** (merge + migrace
> `20260613200202`/`20260613200849` + deploy Edge Function `partner-activate`),
> který vyžaduje výslovné písemné schválení. Do té doby neuvádět partnerům jako
> živé a neukládat do `settings.partner_api_documentation`.

Tato složka obsahuje **jednu** ucelenou onboarding sadu pro partnery. Žádné
konkurenční verze — každý dokument má jednu roli:

| Dokument | Pro koho | Obsah |
|----------|----------|-------|
| [PARTNER_OWNER_OVERVIEW.md](./PARTNER_OWNER_OVERVIEW.md) | Majitel/manažer partnera (netechnický) | Co OneMil dělá, jak vzniká odměna, kdy a za co partner platí |
| [PARTNER_API_GUIDE.md](./PARTNER_API_GUIDE.md) | Vývojář partnera (technický) | Order-event API: endpoint, požadavky, odpovědi, chyby, retry/idempotence |
| [PARTNER_HANDOFF_EMAIL.md](./PARTNER_HANDOFF_EMAIL.md) | Pavel → partner | Hotový český e-mail, kterým se sada předá partnerovi |

## Doporučený postup
1. Pavel pošle partnerovi e-mail z `PARTNER_HANDOFF_EMAIL.md`.
2. Majitel partnera si přečte `PARTNER_OWNER_OVERVIEW.md`.
3. Majitel předá `PARTNER_API_GUIDE.md` svému vývojáři k integraci.
