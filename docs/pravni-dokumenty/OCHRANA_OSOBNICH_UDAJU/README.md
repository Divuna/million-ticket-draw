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

### Přesná identifikace právnických osob

Tabulka v článku 4 uvádí **obchodní označení služeb** (Supabase, Stripe, Vercel, …), nikoli právní
názvy provozujících společností. Z projektu lze doložit, že se daná služba používá, ale **ne, která
konkrétní právnická osoba ji pro OneMil provozuje** — u řady poskytovatelů se liší podle regionu
a smluvního vztahu. Vymyslet název („Supabase Inc.", „Google Ireland Limited") by znamenalo tvrdit
neověřenou skutečnost, proto je text nahradil obchodním označením a nabídkou sdělit přesnou
identifikaci na vyžádání.

**Doplnění přesných právních názvů je otevřený bod pro právní kontrolu** — viz seznam níže.

### Ověření faktických tvrzení (7. 9. 2026)

| Tvrzení | Ověření | Výsledek |
|---|---|---|
| Nezpracováváme údaje o platební kartě | žádné pole typu `card_number`/`cvc`/`exp_*` v `src/`, `supabase/functions/`, `supabase/migrations/` | ✅ ponecháno |
| Ochrana proti automatizovaným útokům | rate limit v `purchase-ticket`, tabulka `user_security_signals`, kontrola self-referralu | ✅ ponecháno |
| Údaje o správci (IČO, DIČ, sídlo, spisová značka, datová schránka) | shoda s `COMPANY_CONTEXT.md` | ✅ ponecháno |
| **Pravidelné zálohování** | doložen pouze **jednorázový** historický snímek (`CLAUDE.md`, 29. 6. 2026); aktuální nastavení záloh nelze z dostupných nástrojů ověřit | ❌ **odstraněno** |

### Co asistent podpory skutečně předává OpenAI

Původní návrh tvrdil, že se OpenAI neposílá jméno ani jiné kontaktní údaje. **To bylo nepravdivé.**
Ověřeno v `supabase/functions/ai-chat/index.ts`:

| Údaj | Důkaz |
|---|---|
| Jméno z profilu | `.select("full_name")` → `displayName` → `- Display name:` v system contextu |
| Zůstatek MioCoinů, počet výher, stav voucherů | `buildBobContextSystemMessage` — sekce `USER DATA` |
| Čas poslední zprávy | `- Last activity:` v system contextu |
| Přehled soutěží | `Contests (from DB, JSON):` |
| Historie konverzace | `OPENAI_CHAT_HISTORY_LIMIT = 10` |
| **E-mailová adresa** | `grep "user.email\|\.email"` v `ai-chat` = **0 výskytů** → aplikace e-mail nepřidává |

Článek 8 byl podle toho přepsán. E-mail se popisuje pravdivě: aplikace ho nepřidává, ale uživatel
ho může sám napsat do textu zprávy.

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

8. **Přesné právní názvy zpracovatelů.** Článek 4 uvádí jen obchodní označení služeb. Právník
   a Pavel mají doplnit skutečné právnické osoby ze zpracovatelských smluv — z projektu je
   ověřitelné pouze to, že se daná služba používá.

9. **Zálohování.** Tvrzení o pravidelném zálohování bylo odstraněno, protože ho nešlo doložit
   aktuálním nastavením. Pokud zálohování reálně probíhá, má se do článku 6 vrátit — ale až po
   ověření skutečné konfigurace, ne z paměti.

10. **Předání údajů asistentovi podpory.** Článek 8 nově přiznává, že se OpenAI předává jméno
    z profilu a omezené údaje o účtu. Právník má potvrdit právní základ právě pro tenhle rozsah,
    ne jen pro obsah samotné zprávy.

11. **Lhůta 30 dnů pro smazání účtu.** Převzata z veřejné stránky `/delete-account`
    (`src/pages/DeleteAccount.tsx`). Právník má potvrdit, že je závazek splnitelný a že
    neodporuje zákonným lhůtám uchování.

---

## Co se v tomto kroku neměnilo

- **Produkční `content_pages`** — na webu je pořád původní znění.
- **Žádná migrace, Edge Function ani deploy.**
- Publikace nového znění a deaktivace starého záznamu proběhne až po schválení Pavlem.
