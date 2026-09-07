# Ochrana osobních údajů (GDPR)

## Zdrojové znění

**[`ZASADY_OCHRANY_OSOBNICH_UDAJU.md`](ZASADY_OCHRANY_OSOBNICH_UDAJU.md)** — jediný GDPR dokument
OneMil v tomto repozitáři.

⏳ **Čeká na schválení Pavlem.** Do té doby není autoritativní a nesmí se publikovat do CMS.
Stav a historie sjednocení: [`STAV.md`](STAV.md).

Tenhle soubor obsahuje **auditní poznámky**. Právní text je výhradně v souboru výše.

---

## Ověření skutečných zpracovatelů

Do dokumentu byl zařazen pouze poskytovatel, jehož zapojení šlo doložit v kódu nebo v produkci.

| Poskytovatel | Důkaz | Zařazen |
|---|---|---|
| Supabase | celý backend, databáze a autentizace projektu `xkzhjldrojjlrkezorey` | ✅ |
| Vercel | produkční hosting od 2. 9. 2026, `vercel.json` řídí HTTP hlavičky | ✅ |
| Stripe | EF `create-stripe-checkout`, `stripe-webhook`, `stripe-refund` | ✅ |
| Resend | EF `process-email-queue`, `send-partner-invoice-email` a další | ✅ |
| OneSignal | `useOneSignal.ts`, `public/OneSignalSDKWorker.js`, 10 registrovaných zařízení v `user_devices` | ✅ |
| Google | GTM `GTM-MK25MC9P` v `consent.ts`, načítá GA4 — jen se souhlasem | ✅ |
| Meta | Meta Pixel v `consent.ts` — jen se souhlasem | ✅ |
| Sofinity | aktivní cron `forward_messages_to_sofinity` (`*/1 * * * *`); forwarder posílá `user_id` a obsah zpráv | ✅ |
| OpenAI | EF `ai-chat` posílá `{ role: "user", content: userContent }` na `api.openai.com` | ✅ |
| Dopravci | doručení věcných výher — doručovací adresa v profilu + evidence `winners` | ✅ |

Žádný poskytovatel nebyl zařazen jen proto, že byl v zadání. Naopak žádný ověřený zpracovatel
nebyl vynechán.

### Poznámka k asistentovi podpory

Přepínač `settings.bob_enabled` je v produkci **`false`**, asistent je tedy momentálně vypnutý.
Infrastruktura ale existuje a lze ho kdykoli zapnout, proto je zpracování v dokumentu popsáno
podmíněně („když je asistent zapnutý"). Zamlčet ho by znamenalo, že by GDPR přestalo odpovídat
skutečnosti hned po zapnutí.

---

## `VYŽADUJE PRÁVNÍ SCHVÁLENÍ`

Body, které nelze rozhodnout z projektu a musí je potvrdit právník:

1. **Záruky pro předávání mimo EU/EHP.** Text odkazuje obecně na kapitolu V nařízení a nabízí
   sdělení konkrétní záruky na vyžádání. Právník má potvrdit, o jaký mechanismus u jednotlivých
   poskytovatelů skutečně jde a zda takto obecná formulace obstojí.

2. **Doby uchování.** Dokument uvádí jen ověřitelné formulace („po dobu trvání registrace",
   „po dobu stanovenou právními předpisy"). Právník má stanovit konkrétní lhůty, zejména
   u účetních dokladů a u údajů držených kvůli obhajobě právních nároků.

3. **Automatické mazání neaktivních účtů.** Původní verze slibovala smazání po třech letech
   neaktivity, ale **žádná taková automatika v produkci neexistuje** (ověřeno v `cron.job`).
   Právník a Pavel mají rozhodnout, zda takový závazek zavést — a pokud ano, musí se
   naimplementovat, ne jen napsat.

4. **Rozsah oprávněného zájmu.** Zejména u „zlepšování a rozvoje platformy" má právník potvrdit,
   že je oprávněný zájem správným základem a že byl proveden test proporcionality.

5. **Zpracování obsahu zpráv jazykovým modelem.** Právník má potvrdit zvolený právní základ a to,
   zda podmíněná formulace obstojí, nebo zda má být zpracování podmíněno výslovným souhlasem.

6. **Předání údajů dopravcům.** Konkrétní dopravci nejsou v systému evidovaní, text je proto uvádí
   jako kategorii. Právník má potvrdit, zda to postačuje, nebo je nutné je jmenovat.

7. **Absence pověřence (DPO).** Dokument uvádí, že pověřenec nebyl jmenován. Právník má potvrdit,
   že OneMil povinnost jmenovat pověřence skutečně nemá.

---

## Co se v tomto kroku neměnilo

- **Produkční `content_pages`** — na webu je pořád původní znění.
- **Žádná migrace, Edge Function ani deploy.**
- Publikace nového znění a deaktivace starého záznamu proběhne až po schválení Pavlem.
