# OneMil — LAUNCH TODO (testovací evidence)

> Checklist k odškrtávání během launch testingu. Pouze dokumentace.
> Stav: `neotestováno` / `prošlo` / `selhalo` / `neověřeno`.
> Sloupce: ID · Priorita · Oblast · Krok · Očekávaný výsledek · Skutečný výsledek · Odkaz · Důkaz · Stav · Poznámka.
> Default „Skutečný výsledek/Důkaz" je prázdné; vyplnit při testu. Odkazy = route z [ROUTE_CHECKLIST.md](./ROUTE_CHECKLIST.md).

## Zákazník (B)

| ID | Prio | Oblast | Krok | Očekávaný výsledek | Skutečný | Odkaz | Důkaz | Stav | Pozn. |
|----|------|--------|------|--------------------|----------|-------|-------|------|-------|
| C01 | P0 | Registrace | Vytvořit nový účet (18+) | Účet vytvořen, přihlášen | | /register | | neotestováno | spec 01 |
| C02 | P0 | Onboarding | Zadat datum narození <18 | Zamítnuto | | /onboarding/date-of-birth | | neotestováno | |
| C03 | P0 | Login | Platné/neplatné údaje | Redirect / zůstane | | /login | | neotestováno | spec 02 |
| C04 | P0 | Login gating | Zákazník vs partner/affiliate vstup | Každý jen svůj; admin vždy | | /login | | neotestováno | spec 33 |
| C05 | P0 | Profil | Načíst + uložit profil | Údaje uloženy | | /profile | | neotestováno | spec 17 |
| C06 | P0 | Peněženka | Zobrazit zůstatek | Správný MioCoin | | /profile | | neotestováno | spec 09 |
| C07 | P0 | MioCoin kód aktivní | Uplatnit `issued` kód (správný e-mail) | +coiny, kód `activated` | | /profile | | neotestováno | |
| C08 | P0 | MioCoin kód čekající | Uplatnit `pending` kód | Chyba `pending`, žádný credit | | /profile | | neotestováno | spec 48 (RPC) |
| C09 | P0 | MioCoin kód zrušený | Uplatnit `cancelled` kód | Chyba `cancelled` | | /profile | | neotestováno | spec 48 (RPC) |
| C10 | P1 | MioCoin kód email-mismatch | Uplatnit cizím účtem | `email_mismatch` | | /profile | | neověřeno | |
| C11 | P0 | Soutěže | Seznam + detail | Načte bez chyb | | /games, /contest/:id | | neotestováno | spec 04 |
| C12 | P0 | Nákup ticketu | Koupit ticket | `buy_ticket_atomic`, modal | | /contest/:id | | neotestováno | spec 03/04 |
| C13 | P0 | Výhra | Výherní pozice | won_type main>bonus, winners | | /contest/:id | | neotestováno | spec 05 |
| C14 | P0 | Vouchery | Katalog/nákup/koupené | Tři taby, redemption | | /vouchers | | neotestováno | spec 03-voucher,10,11 |
| C15 | P0 | Zprávy Bob ON | Poslat zprávu | AI odpověď `{text,cta}` | | /messages | | neotestováno | spec 31 |
| C16 | P0 | Zprávy Bob OFF | Admin OFF → uživatel píše | Routuje na admina, ai-chat nevolán | | /messages | | neotestováno | spec 31 |
| C17 | P0 | Admin↔uživatel | Obousměrná komunikace | Doručeno, realtime | | /messages | | neotestováno | spec 29,32 |
| C18 | P1 | Odhlášení | Logout | Session zrušena | | (nav) | | neotestováno | |
| C19 | P1 | Mobil | Layout na mobilu | Bez ořezů, bottom nav | | všechny | | neověřeno | jen spec 12 |
| C20 | P0 | Wins | Taby Výhry/Nabídky | Partner Offers ≠ výhry | | /wins | | neotestováno | |
| C21 | P0 | Smazání účtu | Vyžádat smazání | GDPR flow funguje | | /delete-account | | neověřeno | |
| C22 | P0 | Reset hesla | Zákazník „zapomenuté heslo" | Cesta k obnově hesla existuje a funguje | | /login | | neověřeno | **GAP: v routeru/UI nenalezen forgot/reset-password flow pro zákazníka (jen partner set-password). Ověřit, zda existuje — jinak P0 blocker.** |
| C23 | P1 | Doporučení (invite) | „Pozvi přátele" + invite reward | Vlastní invite kód/odkaz, žádné cizí data | | /profile | | neotestováno | ReferralSection; RLS own-row |

## Admin (C)

| ID | Prio | Oblast | Krok | Očekávaný výsledek | Skutečný | Odkaz | Důkaz | Stav | Pozn. |
|----|------|--------|------|--------------------|----------|-------|-------|------|-------|
| A01 | P0 | Admin login | Přihlásit admina | Přístup `/admin/*` | | /login | | neotestováno | spec 33,14 |
| A02 | P0 | Vytvoření soutěže | Create contest | Vytvořena, ticket_count validní | | /admin/contest/:id | | neotestováno | |
| A03 | P1 | Ekonomika | Ekonomika tab | Kalkulace, neukládá do DB | | /admin/contest/:id | | neotestováno | spec 16,18,19 |
| A04 | P1 | Bonusové výhry | MioCoin chunked save | Pozice + total synced | | /admin/contest/:id | | neotestováno | spec 18,19,20 |
| A05 | P0 | Vouchery | `/admin/vouchers` | „Přehled voucherů" | | /admin/vouchers | | neotestováno | spec 46 |
| A06 | P0 | Partneři | Pending badge + approve | Počet + schválení | | /admin/partners | | neotestováno | spec 37 |
| A07 | P0 | Faktury | draft→Odeslat, issued→Znovu | Správná tlačítka | | /admin/invoices | | neotestováno | spec 45 |
| A08 | P0 | PDF | Generovat PDF | `%PDF`, signed URL, export row | | /admin/invoices | | neotestováno | spec 44 |
| A09 | P0 | E-mail faktury | Odeslat e-mailem | Jen safe recipient (staging) | | /admin/invoices | | neotestováno | spec 44 |
| A10 | P1 | Referrals | `/admin/referrals` | Taby přítomny | | /admin/referrals | | neotestováno | spec 46 |
| A11 | P0 | Izolace | Admin akce | Nemění nesouvisející data | | /admin/* | | neotestováno | |
| A12 | P2 | Test dashboard | „Vytvořit Test User" | „Produkčně vypnut" toast | | /admin/tests | | neotestováno | |
| A13 | P0 | CMS obsah | Naplnit VOP/GDPR/pravidla | Obsah uložen a zobrazen | | /admin/content | | neověřeno | blocker F |

## Partner (D)

| ID | Prio | Oblast | Krok | Očekávaný výsledek | Skutečný | Odkaz | Důkaz | Stav | Pozn. |
|----|------|--------|------|--------------------|----------|-------|-------|------|-------|
| P01 | P1 | Registrace partnera | `/partner/register` | Žádost, žádná provize | | /partner/register | | neotestováno | |
| P02 | P0 | Schválení | Admin approve | Aktivní + password setup link (ne heslo) | | /admin/partners | | neotestováno | spec 37,38 |
| P03 | P0 | Dashboard | Otevřít dashboard | Konverze+helper, Fakturace, Stav napojení API | | /partner/dashboard | | neotestováno | spec 47 |
| P04 | P1 | Přepočet MioCoinů | Nastavit reward_base/mc | Uloženo, ovlivní výpočet | | /partner/dashboard | | neověřeno | |
| P05 | P1 | API klíč | Generovat/rotovat | Zobrazen jednou, hash uložen | | /partner/dashboard | | neotestováno | |
| P06 | P1 | API dokumentace | Otevřít Dokumentace API | Order-event guide, real endpoint | | /partner/dashboard | | neotestováno | settings aktualizován |
| P07 | P0 | create_order_reward | POST order_total+email | `pending`, kód+link, coiny=OneMil | | API | | neotestováno | spec 48 |
| P08 | P0 | Duplicita | Stejný external_order_id | Stejný kód, duplicate:true | | API | | neotestováno | spec 48 |
| P09 | P0 | Aktivace | status paid/delivered/completed | Odměna → aktivní (`issued`) | | API | | neotestováno | spec 48 |
| P10 | P0 | Zrušení | status cancelled/returned/unpaid/not_picked_up | Odměna → `cancelled` | | API | | neotestováno | spec 48 |
| P11 | P0 | Redeem zákazníkem | Uplatnit aktivní kód | wallet credit + activation row | | /profile | | neotestováno | spec 48 |
| P12 | P0 | Žádné vedlejší efekty | Po create_order_reward | 0 faktur/e-mailů/PDF/plateb/wallet/aktivací | | API | | prošlo | produkční smoke 14.06. + spec 48 |
| P13 | P1 | Fakturační návaznost | weekly cron | Draft faktura z aktivovaných coinů | | — | | neověřeno | časované |
| P14 | P0 | Vlastní faktury | `/partner/invoices` | Jen vlastní, PDF přes signed URL | | /partner/invoices | | neotestováno | spec 43 |

## Platby a fakturace (E)

| ID | Prio | Oblast | Krok | Očekávaný výsledek | Skutečný | Odkaz | Důkaz | Stav | Pozn. |
|----|------|--------|------|--------------------|----------|-------|-------|------|-------|
| PAY01 | P0 | Stripe checkout | Top-up (test mode) | Redirect na Stripe | | /profile | | neověřeno | netestovat na produkci |
| PAY02 | P0 | Stripe webhook | Platba dokončena | Wallet credit, idempotence | | — | | neověřeno | |
| PAY03 | P0 | Success/Cancel | Návrat z plateb | Správné routy | | /payment-success, /payment-cancel | | neotestováno | |
| PAY04 | P1 | Webhook fail | Selhání | 500 → retry, žádný dvojí credit | | — | | neověřeno | |

## Právní a veřejné (F)

| ID | Prio | Oblast | Krok | Očekávaný výsledek | Skutečný | Odkaz | Důkaz | Stav | Pozn. |
|----|------|--------|------|--------------------|----------|-------|-------|------|-------|
| L01 | P0 | Obchodní podmínky | Otevřít a ověřit obsah | Naplněno, aktuální | | /terms, /vop | | neověřeno | blocker |
| L02 | P0 | Pravidla soutěží | Ověřit obsah | Tikety 1,2,3…, pozice předem, ne loterie | | /pravidla-souteze | | neověřeno | blocker |
| L03 | P0 | GDPR/Privacy | Ověřit obsah | Naplněno | | /gdpr, /privacy | | neověřeno | blocker |
| L04 | P0 | Cookies | Ověřit cookie lištu + uložení souhlasu | `CookieConsentBanner` se zobrazí, souhlas se uloží do `cookie_consents`; ověřit i policy text | | (banner globálně) | | neotestováno | banner EXISTUJE (src/components/CookieConsentBanner.tsx) — ověřit funkci+text |
| L05 | P0 | Kontakt | Reálné údaje | Dle COMPANY_CONTEXT.md | | /kontakt | | neověřeno | |
| L06 | P1 | Reklamace/support | Cesta k podpoře | Bob/zprávy + e-mail | | /messages | | neověřeno | |
| L07 | P1 | Veřejné texty | Re-audit wording | Žádný hazard/`referral`/B2B leak | | / a zákaznické | | prošlo | audit 13.06. |
| L08 | P0 | 18+ gating | Věkový limit | Vynucen | | /onboarding/date-of-birth | | neověřeno | |

## Affiliate / influencer (samostatný program — rozhodnout rozsah pro 1. veřejný test)

| ID | Prio | Oblast | Krok | Očekávaný výsledek | Skutečný | Odkaz | Důkaz | Stav | Pozn. |
|----|------|--------|------|--------------------|----------|-------|-------|------|-------|
| AF01 | P1 | Affiliate login gating | Login jen s `affiliate_accounts` | Pustí jen affiliate; jinak hláška+signOut | | /affiliate/login | | neotestováno | |
| AF02 | P1 | Affiliate dashboard | Influencer/Obchodník/Profil | Statistiky, ref kód, profil uložen | | /affiliate/dashboard | | neotestováno | |
| AF03 | P1 | B2B company lead | Přidat firmu (sales_rep) → confirm → admin approve | Stavy lead flow, žádná provize z approve | | /affiliate/dashboard, /partner/invite, /admin/company-leads | | neotestováno | spec 34–38 |
| AF04 | P2 | Affiliate payouts | Dávka + Air Bank export + paid | `created→exported→paid`, .kpc export | | /admin/affiliate-payouts | | neotestováno | spec 40–42 |
| AF05 | P1 | Rozhodnutí rozsahu | Je affiliate součástí 1. veřejného testu? | Jasné ano/ne; pokud ne → out-of-scope | | — | | neověřeno | **rozhodnout** |

## Bezpečnost (SEC)

| ID | Prio | Oblast | Krok | Očekávaný výsledek | Skutečný | Odkaz | Důkaz | Stav | Pozn. |
|----|------|--------|------|--------------------|----------|-------|-------|------|-------|
| SEC01 | P0 | Security advisor backlog | Projít 23 pre-existing nálezů (CLAUDE.md SECURITY BACKLOG) | Rozhodnout fix vs vědomě akceptovat před veřejným spuštěním | | — | | neověřeno | **GAP: dosud neuzavřeno; RLS / public-execute SECURITY DEFINER nálezy z 2026-05-24** |
| SEC02 | P1 | RLS izolace | Zákazník nevidí cizí data (faktury, invite, wallet) | Own-row scoping drží | | různé | | neotestováno | pokryto dřívějšími audity |
| SEC03 | P2 | Push (OneSignal) | Notifikace pipeline | `notifications`→`push_log`→OneSignal | | — | | neověřeno | interní, P2 pro 1. test |

## Automatika (CI)

| ID | Prio | Oblast | Krok | Očekávaný výsledek | Skutečný | Odkaz | Důkaz | Stav | Pozn. |
|----|------|--------|------|--------------------|----------|-------|-------|------|-------|
| CI01 | P0 | P0 Smoke | Spustit P0 smoke (staging) | Vše zelené | | — | | neotestováno | 01,02,33,14,04,05,09,03-voucher,29,32,31 |
| CI02 | P0 | Full E2E | Spustit Full E2E (staging) | 49 speců zelené | | — | | neotestováno | |
| CI03 | P0 | Partner API spec | spec 48 | 3 passed | | — | | prošlo | run 27490386537 |
| CI04 | P1 | Mrtvý kód | TestLogin/InfluencerDashboard mimo router | Rozhodnout smazat/zapojit | | — | | neověřeno | |
| CI05 | P1 | onemil_spec.md | Chybí | Vytvořit nebo potvrdit, že netřeba | | — | | neověřeno | soubor neexistuje |
