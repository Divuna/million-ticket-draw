# Právní dokumenty OneMil

**Tato složka je jediný autoritativní zdroj aktuálního právního znění OneMil.**

Vznikla 7. 9. 2026, aby skončil zmatek mezi právními PDF v kořeni repozitáře, texty v CMS
(`content_pages` v produkční databázi) a auditními dokumenty v `docs/launch-readiness/`.

---

## Hierarchie zdrojů pravdy

Pořadí je závazné. Když si dva zdroje odporují, rozhoduje ten výš — a rozpor se **hlásí Pavlovi**,
nepřebíjí se tiše.

| # | Zdroj | Co určuje |
|---|---|---|
| 1 | `ONEMIL_BUSINESS_CONTEXT.md` | obchodní a produktový model OneMil |
| 2 | `COMPANY_CONTEXT.md` | firemní identita a údaje provozovatele |
| 3 | **`docs/pravni-dokumenty/`** | **aktuální právní znění** |
| 4 | `docs/launch-readiness/` | **pouze** audity, checklisty, historická zjištění |
| 5 | vše ostatní (stará PDF, `test grafika/`, …) | **historické, neautoritativní** |

### Co z toho plyne pro AI

- **`docs/launch-readiness/` se nikdy nesmí použít jako zdroj právního znění.** Je to auditní
  oblast: popisuje, co se našlo a co je potřeba, ne co platí.
- **Právní PDF mimo tuto složku se nesmí použít jako šablona ani jako platný text.**
  Seznam je v [`HISTORICKE_SOUBORY.md`](HISTORICKE_SOUBORY.md).
- **Nikdy si sám nevybírej mezi dvěma verzemi téhož dokumentu.** Když nelze bezpečně určit, která
  je aktuální: **STOP** a nahlas konflikt.
- **Nevytvářej nový business source of truth.** Tahle složka obsahuje výhradně právní dokumenty
  a právní šablony; obchodní model zůstává v `ONEMIL_BUSINESS_CONTEXT.md`.

---

## Obsah

| Cesta | Účel |
|---|---|
| [`VSEOBECNE_OBCHODNI_PODMINKY/`](VSEOBECNE_OBCHODNI_PODMINKY/) | VOP — aktuální znění a jeho zdroj |
| [`OCHRANA_OSOBNICH_UDAJU/`](OCHRANA_OSOBNICH_UDAJU/) | GDPR — ⚠️ **nevyřešený konflikt dvou verzí** |
| [`ZASADY_COOKIES/`](ZASADY_COOKIES/) | zásady cookies |
| [`SABLONA_PRAVIDEL_SOUTEZE.md`](SABLONA_PRAVIDEL_SOUTEZE.md) | **jediná** šablona pravidel pro všechny budoucí soutěže |
| [`souteze/`](souteze/) | archiv finálních pravidel konkrétních soutěží |
| [`HISTORICKE_SOUBORY.md`](HISTORICKE_SOUBORY.md) | soupis starých právních souborů, ze kterých se nesmí čerpat |

---

## Stav k 7. 9. 2026

Tahle složka zatím **eviduje a strukturuje**, nepřepisuje. Právní texty žijí dál v CMS
(`content_pages`) a zobrazují se na `/vop`, `/gdpr`, `/legal/cookies` a `/pravidla-souteze`.
Každá podsložka popisuje, co je dnes považováno za aktuální a co je otevřené.

**Nic z toho nenahrazuje právní kontrolu.** Formulace označené `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`
nesmí AI ani nikdo jiný prohlásit za hotové bez potvrzení právníkem.
