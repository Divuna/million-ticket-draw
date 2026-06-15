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
| C22 | P0 | Reset hesla | Zákazník „zapomenuté heslo" | Cesta k obnově hesla existuje a funguje | Prošlo: odkaz z `/login`, recovery request i update hesla | /login, /reset-password | GH run 27507097356 | prošlo | Spec 44 zelený na `main` po merge PR #115 (`a7690d0b`). |
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
| A13 | P0 | CMS obsah | Naplnit VOP/GDPR/pravidla | Obsah uložen a zobrazen | Známý DB výsledek: CMS stránky `vop`, `gdpr`, `pravidla-souteze` existují; právní kvalita/aktuálnost neověřena | /admin/content | DB result + email audit 14.06. | neověřeno | blocker F: právník/vlastník musí ověřit obsah |

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
| L01 | P0 | Obchodní podmínky | Owner/legal review obsahu | Naplněno, aktuální | **Technické sjednocení rout hotové 15.06. (owner decision Pavel): kanonická stránka obchodních podmínek je `/vop`, protože je owner-managed CMS editovatelná přes `/admin/content`. `/terms` zůstává kompatibilní redirect na `/vop`; registrace míří na `/vop`; footer už vedl na `/vop`. Právní text/CMS beze změny.** | /vop, /terms | code route/link update 15.06. | **selhalo (blocker)** | L01 zůstává P0 jen do owner/legal potvrzení finálního právního obsahu `/vop` |
| L02a | P1 | Pravidla soutěží — obecná CMS stránka | Owner/legal úklid placeholderů | `/pravidla-souteze` bez placeholderů, korektní obecný text | **Re-audit 15.06.: `/pravidla-souteze` je jen OBECNÁ CMS stránka (`content_pages` slug `pravidla-souteze`), NE závazný právní zdroj konkrétní soutěže. Stále obsahuje placeholdery `[NÁZEV SOUTĚŽE]`/`[DATUM]`/`[POPIS HLAVNÍ VÝHRY]`/`[HODNOTA]`.** | /pravidla-souteze | re-audit 15.06. | neověřeno | content cleanup / owner-legal; NE blocker per-soutěžních pravidel (downgrade z P0 na P1 — není závazný zdroj) |
| L02b | P0 | Pravidla soutěží — per-contest | Každá aktivní soutěž má vlastní zkontrolovaný rules PDF | Před spuštěním soutěže: korektní `contests.rules_pdf_url` (+ volitelně `rules` text), bez placeholderů | **Re-audit 15.06.: závazná pravidla jsou per-soutěžní — `public.contests.rules` + `public.contests.rules_pdf_url`; admin nahrává PDF ke konkrétní soutěži do bucketu `contest-rules`; ContestDetail zobrazuje z dané soutěže; žádná PDF šablona = žádné placeholdery v generování. Produkce: 127 soutěží, 34 s rules PDF, 0 `rules` textů s placeholdery, **0 aktivních soutěží** → per-contest pravidla teď nic živého neblokují.** | /admin/contest/:id, /contest/:id | prod check 15.06. | neověřeno | per-contest QA: zkontrolovat rules PDF u každé soutěže těsně před jejím spuštěním |
| L03 | P0 | GDPR/Privacy | Sjednotit + ověřit obsah | Jedna konzistentní verze | **Technické sjednocení rout hotové 15.06. (owner decision Pavel): kanonická privacy/GDPR stránka je `/gdpr`, protože je CMS editovatelná přes `/admin/content` a registrace ukládá `document_slug='gdpr'`. `/privacy` a `/legal/ochrana-osobnich-udaju` zůstávají kompatibilní přes redirect na `/gdpr`; footer, registrace, cookie banner a další app odkazy míří na `/gdpr`. Právní text/CMS beze změny.** | /gdpr, /privacy, /legal/ochrana-osobnich-udaju | code route/link update 15.06. | **selhalo (blocker)** | L03 zůstává P0 jen do owner/legal potvrzení finálního právního obsahu `/gdpr` |
| L04 | P0 | Cookies | Owner/legal review policy proti reálným nástrojům + banneru | Policy text odpovídá reálným cookies/storage/tracking chování | **Čistý audit 15.06. z aktuálního `origin/main` (`2eb29291166bea4685d8f11184e999766403fb06`) nahrazuje předchozí audit z `codex/affiliate-payouts-audit`. Produkční CMS `/legal/cookies` existuje + is_active, `content_length=2328`, obsahuje `podpora@onemil.cz`; L09 e-mail mismatch vyřešen (`info@`/`support@` v aktivním CMS 0×). Technický follow-up hotový se schválením Pavla: Meta `<noscript>` tracking image fallback odstraněn z `index.html`; JS Meta Pixel flow v `consent.ts` zůstává jen po marketing consentu. L04 stále P0: owner/legal musí potvrdit text proti realitě: Supabase Auth `localStorage.onemil-auth`, `localStorage.cookie_consent`, `public.cookie_consents`, GA4, GTM, Meta Pixel, OneSignal SDK/worker/cache/IndexedDB/`user_devices`, Stripe checkout redirect a app `localStorage`/`sessionStorage` klíče.** | banner, /gdpr, /legal/cookies | clean origin/main audit + prod CMS read-only + noscript fix 15.06. | **selhalo (blocker)** | P0 dokud Pavel/legal nepotvrdí aktualizovaný cookies text |
| L05 | P0 | Kontakt | Reálné údaje | Dle COMPANY_CONTEXT.md | Owner potvrzeno: kanonický veřejný support e-mail je `podpora@onemil.cz`; cleanup hotový, žádné live/source-of-truth použití staré support adresy nezůstává | /kontakt, /vop, /gdpr, /delete-account, footer | owner decision + cleanup audit 14.06. | prošlo | Public support e-mail consistency resolved; stará support adresa zůstává jen ve starých audit/history notes |
| L06 | P1 | Reklamace/support | Cesta k podpoře | Bob/zprávy + e-mail | `/messages` support handoff existuje; e-mail je dostupný na `/kontakt`; samostatné `/support/*` stránky závisí na CMS obsahu | /messages, /kontakt, /support/nahlasit-problem | static audit 14.06. | neověřeno | potvrdit reklamační/support wording a CMS support stránky |
| L07 | P1 | Veřejné texty | Re-audit wording | Žádný hazard/`referral`/B2B leak | | / a zákaznické | | prošlo | audit 13.06. |
| L08 | P0 | 18+ gating | Věkový limit | Vynucen | | /onboarding/date-of-birth | | neověřeno | |
| L09 | P0 | E-maily v právních CMS textech | Sjednocené kontaktní e-maily | Žádný `info@onemil.cz` v aktivních legal CMS; vše `podpora@onemil.cz` | **VYŘEŠENO 15.06. (schválení Pavla): kanonický e-mail = `podpora@onemil.cz`. CMS `content_pages` `info@onemil.cz` → `podpora@onemil.cz` nahrazeno (jen e-mail, beze změny wordingu) ve 3 aktivních legal stránkách: `ochrana-osobnich-udaju`, `cookies`, `autorska-prava` (3. nalezen při precheck — stejný špatný e-mail). Postcheck: 0× `info@` v CMS, 0× `support@`, 5 stránek s `podpora@`. App kód byl už čistý.** | /legal/ochrana-osobnich-udaju, /legal/cookies, /legal/autorska-prava | CMS update + postcheck 15.06. | **prošlo** | L09 uzavřen; právní wording nezměněn (jen e-mail) |

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
| SEC01 | P0 | Security advisor backlog | Projít a uzavřít/akceptovat nálezy Security Advisoru | Každý nález fixnut nebo výslovně akceptován ownerem | **✅ VYŘEŠENO: všechny SEC01 ERRORy fixnuty nebo ownerem akceptovány. E17 affiliate-scoped redesign aplikován na PRODUKCI (migrace `sec01_e17_influencer_referrals_paid_affiliate_scoped`; prod advisor 2→1; P0 smoke `27529591097` success; count zachován). Jediný zbývající raw ERROR = E22 `contest_progress`, formálně owner-accepted. Progrese prod ERROR: 23→10→8→7→5→3→2→1(accepted).** | [SECURITY_FINDINGS.md](./SECURITY_FINDINGS.md) | prod advisor 2→1 + smoke 27529591097 | **prošlo (SEC01 vyřešeno; ne blocker)** | **SEC01 už NENÍ launch blocker — všechny ERRORy fixnuty/accepted. Zbývá jen WARN/INFO backlog (non-blocking, samostatně).** |
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
