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

## Vztah GitHub ↔ produkční CMS

Aby nevznikly dva zdroje pravdy, platí jednosměrný tok:

```
docs/pravni-dokumenty/  ──schválení──▶  content_pages (produkce)  ──▶  web / aplikace
        ZDROJ                              PUBLIKOVANÁ KOPIE
```

| | Role |
|---|---|
| `docs/pravni-dokumenty/` | **zdrojové právní znění** — tady se text spravuje a verzuje |
| `content_pages` v produkci | **publikovaná kopie** pro web a aplikaci |

**Závazný postup u schváleného dokumentu:**

1. Změna se nejdřív připraví **zde v GitHubu**.
2. Po schválení se publikuje do CMS (`/admin/content`).
3. Nikdy naopak — CMS se needituje jako první a GitHub se z něj nedohání.

**Když se GitHub a CMS liší:** AI **nesmí sama rozhodnout, který text přepsat.**
**STOP** a nahlásit rozdíl Pavlovi. Rozdíl může znamenat neschválenou změnu v CMS stejně jako
zapomenutou publikaci z GitHubu — a to z textu poznat nejde.

### Dočasná výjimka: GDPR

GDPR má **jediný sjednocený zdroj** —
[`OCHRANA_OSOBNICH_UDAJU/ZASADY_OCHRANY_OSOBNICH_UDAJU.md`](OCHRANA_OSOBNICH_UDAJU/ZASADY_OCHRANY_OSOBNICH_UDAJU.md).
Původní dvě soupeřící verze byly sloučeny a z repozitáře odstraněny.

Dokument ale **zatím čeká na schválení Pavlem** a do té doby není autoritativní ani publikovaný.
Produkční `content_pages` proto zatím drží starší znění. Po schválení se nový text publikuje
do CMS a tahle výjimka zanikne.
Detail: [`OCHRANA_OSOBNICH_UDAJU/STAV.md`](OCHRANA_OSOBNICH_UDAJU/STAV.md).

### Pravidla konkrétních soutěží

Pro konkrétní soutěž je zdrojem **finální Word/PDF** archivovaný v
[`souteze/NAZEV_SOUTEZE/`](souteze/). Hodnota `rules_pdf_url` v produkci je **publikovaná kopie
právě tohoto konkrétního PDF**. PDF jiné soutěže ani generická historická šablona se použít nesmí.

---

## Obsah

| Cesta | Účel |
|---|---|
| [`VSEOBECNE_OBCHODNI_PODMINKY/VSEOBECNE_OBCHODNI_PODMINKY.md`](VSEOBECNE_OBCHODNI_PODMINKY/VSEOBECNE_OBCHODNI_PODMINKY.md) | **VOP — zdrojové znění** |
| [`ZASADY_COOKIES/ZASADY_COOKIES.md`](ZASADY_COOKIES/ZASADY_COOKIES.md) | **Cookies — zdrojové znění** |
| [`OCHRANA_OSOBNICH_UDAJU/ZASADY_OCHRANY_OSOBNICH_UDAJU.md`](OCHRANA_OSOBNICH_UDAJU/ZASADY_OCHRANY_OSOBNICH_UDAJU.md) | **GDPR — zdrojové znění** (⏳ čeká na schválení) |
| [`OBECNA_PRAVIDLA_SOUTEZI/`](OBECNA_PRAVIDLA_SOUTEZI/) | obecná veřejná stránka `/pravidla-souteze` — **ne** pravidla konkrétní soutěže |
| [`SABLONA_PRAVIDEL_SOUTEZE.md`](SABLONA_PRAVIDEL_SOUTEZE.md) | **jediná** šablona pravidel pro všechny budoucí soutěže |
| [`souteze/`](souteze/) | archiv finálních pravidel konkrétních soutěží |
| [`HISTORICKE_SOUBORY.md`](HISTORICKE_SOUBORY.md) | soupis starých právních souborů, ze kterých se nesmí čerpat |

Soubory `README.md` v jednotlivých složkách obsahují **auditní poznámky** — nikdy právní text.
Právní text je vždy v samostatném souboru s velkými písmeny v názvu.

---

## Stav k 7. 9. 2026

Právní texty jsou zde uložené **jako skutečné zdrojové soubory**, ne jako rozcestník do CMS.

VOP, cookies a obecná pravidla soutěží jsou převzaty **beze změny** z produkce ke 7. 9. 2026 —
nic se u nich právně nevylepšovalo ani nepřepisovalo.

GDPR je jediná výjimka: původní dvě soupeřící verze byly **sjednoceny do jednoho nového návrhu**,
který čeká na schválení. Do schválení zůstává v produkci starší znění.

| Dokument | Zdroj zde | Publikovaná kopie |
|---|---|---|
| VOP | `VSEOBECNE_OBCHODNI_PODMINKY/VSEOBECNE_OBCHODNI_PODMINKY.md` | `/vop` |
| Cookies | `ZASADY_COOKIES/ZASADY_COOKIES.md` | `/legal/cookies` |
| Obecná pravidla soutěží | `OBECNA_PRAVIDLA_SOUTEZI/OBECNA_PRAVIDLA_SOUTEZI.md` | `/pravidla-souteze` |
| GDPR | `OCHRANA_OSOBNICH_UDAJU/ZASADY_OCHRANY_OSOBNICH_UDAJU.md` ⏳ | `/gdpr` (zatím starší znění) |

Otevřené je: **schválení a publikace nového GDPR**, **placeholdery v obecných pravidlech soutěží**
a **vlastní pravidla pro obě produkční soutěže** (obě jsou od 7. 9. 2026 `paused`).

**Nic z toho nenahrazuje právní kontrolu.** Formulace označené `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`
nesmí AI ani nikdo jiný prohlásit za hotové bez potvrzení právníkem.
