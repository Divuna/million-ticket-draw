# GDPR — stav

## Konflikt dvou verzí je sjednocen

Do 7. 9. 2026 existovaly v produkci **dvě různé aktivní** verze GDPR a nešlo určit, která platí.
Obě byly kvůli tomu dočasně uložené v této složce vedle sebe.

**Sjednoceno.** Vznikl jeden nový návrh, který přebírá silné stránky obou a doplňuje ověřené
skutečnosti o skutečném fungování platformy:

**Nový zdroj: [`ZASADY_OCHRANY_OSOBNICH_UDAJU.md`](ZASADY_OCHRANY_OSOBNICH_UDAJU.md)**

Soubory `VERZE_GDPR.md` a `VERZE_OCHRANA_OSOBNICH_UDAJU.md` byly odstraněny, aby v repozitáři
nezůstaly tři GDPR dokumenty. Jejich znění zůstává dohledatelné v historii gitu (PR #402).

---

## ⏳ Dokument čeká na schválení Pavlem

**Dokument zatím není publikovaný a není autoritativní.**

| Krok | Stav |
|---|---|
| Sjednocení dvou verzí do jednoho návrhu | ✅ hotovo |
| Doplnění ověřených zpracovatelů | ✅ hotovo |
| Schválení Pavlem po právní kontrole | ⏳ **čeká** |
| Publikace do produkčního `content_pages` | ⏳ čeká na schválení |
| Deaktivace staré verze v CMS | ⏳ čeká na schválení |

**Produkční `content_pages` se v tomto kroku neměnilo.** Na webu je pořád zobrazena původní kratší
verze (`legal/gdpr`); druhá (`legal/ochrana-osobnich-udaju`) zůstává v databázi jako neaktivní pro
veřejnost, protože route na ni přesměrovává.

Po schválení se **stejný obsah** publikuje do CMS a druhý záznam se deaktivuje.

---

## Co nový dokument přinesl oproti oběma původním verzím

| | Původní `legal/gdpr` | Původní `ochrana-osobnich-udaju` | Nový dokument |
|---|---|---|---|
| Jmenovitý výčet zpracovatelů | ano (5) | ne | **ano (10 + dopravci)** |
| **Supabase** jako zpracovatel | ne | ne | **ano** |
| **Vercel** jako hosting | ne | ne | **ano** |
| **OpenAI** a asistent podpory | ne | ne | **ano** |
| **Sofinity** | ne | ne | **ano** |
| IČO, spisová značka, datová schránka | ne | částečně | **ano** |
| Odkaz na nařízení a na ÚOOÚ | ne | ano | **ano** |
| Rozlišení právních základů po účelech | povrchně | částečně | **ano** |
| Doby uchování | obecně | konkrétní, ale neověřené | **jen ověřitelné** |
| Automatizované rozhodování | ne | ne | **ano** |
| Ustanovení o dětech | ne | ne | **ano** |
| Lhůta pro vyřízení žádosti | ne | ne | **ano** |

### Co bylo z původních verzí vědomě vypuštěno

- **„Při neaktivitě delší než 3 roky účet mažeme."** V produkci **neexistuje žádná automatika**,
  která by účty po neaktivitě mazala — ověřeno v `cron.job`. Tvrdit to by znamenalo slíbit něco,
  co se neděje.
- **„Zákonem vyžadované dokumenty uchováváme 10 let."** Konkrétní lhůta nebyla doložena; nahrazena
  odkazem na dobu stanovenou právními předpisy.
- **„Standardní smluvní doložky."** Konkrétní mechanismus u jednotlivých poskytovatelů nebyl
  doložen; text proto odkazuje obecně na kapitolu V nařízení a nabízí sdělení konkrétní záruky
  na vyžádání.

---

## Vazba na ostatní dokumenty

Postup po schválení je popsaný v [`../README.md`](../README.md): GitHub je zdroj, produkční
`content_pages` je publikovaná kopie. Do schválení se GDPR chová jako výjimka z tohoto pravidla —
po schválení výjimka zaniká.
