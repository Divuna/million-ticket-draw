# OneMil — LAUNCH TEST PLAN (připravenost na první veřejné testování)

> Pouze dokumentace. Žádná změna kódu/SQL/produkce/nasazení. Žádná testovací data nevytvořena.
> Doprovodné soubory: [ROUTE_CHECKLIST.md](./ROUTE_CHECKLIST.md) (mapa stránek A), [LAUNCH_TODO.md](./LAUNCH_TODO.md) (evidence G).
> Cíl: po projití tohoto plánu lze říct „OneMil je připravený na první veřejné testování."
> **NEOVĚŘENO** = vyžaduje ruční potvrzení; viz LAUNCH_TODO.

## Prostředí a zásady testování
- **Staging** Supabase `dxmowysntemfqfnanxua` — primární prostředí pro destruktivní/E2E testy.
- **Produkce** `xkzhjldrojjlrkezorey` — pouze read-only kontroly, žádná testovací data.
- Existuje **49 Playwright E2E speců** (`tests/e2e/*.spec.ts`) + dva workflow: Full E2E a P0 Smoke.
- Pravidlo rozsahu: nejdřív cílený spec, pak celý suite (viz CLAUDE.md).
- **NEMĚNIT:** `buy_ticket_atomic`, event/push pipeline, Bob prompt/CTA, voucher→MioCoin→ticket ekonomika.

---

## A) Mapa stránek
Kompletní v [ROUTE_CHECKLIST.md](./ROUTE_CHECKLIST.md) — všech ~70 rout s URL / pro koho / co vidět / co kliknout / co se stane / DB / co nesmí / P0–P2.

---

## B) Zákaznické testy

| Oblast | Krok | Očekávaný výsledek | Spec (pokud je) |
|--------|------|--------------------|-----------------|
| Registrace | nový účet, 18+ onboarding | účet vytvořen, přihlášen | 01 |
| Přihlášení | platné/neplatné údaje | redirect / zůstane na loginu | 02, 33, 14 |
| Login gating | partner/affiliate vs zákazník | každý jen na svůj vstup; admin vždy projde | 33 |
| Profil | načtení, uložení | identita, peněženka, údaje uloženy (profiles upsert) | 17 |
| Peněženka | zobrazení balance | správný MioCoin zůstatek | 09 |
| **MioCoin kód — aktivní** | uplatnit `issued` kód vázaný na e-mail | +coiny do peněženky, kód → `activated` | 03-voucher / partner flow |
| **MioCoin kód — čekající** | uplatnit `pending` kód | odmítnuto chybou `pending`, žádný credit | (spec 48 ověřuje RPC) |
| **MioCoin kód — zrušený** | uplatnit `cancelled` kód | odmítnuto chybou `cancelled` | (spec 48) |
| MioCoin kód — cizí e-mail | uplatnit kód jiným účtem | `email_mismatch` | NEOVĚŘENO ručně |
| Soutěže | seznam, detail | načte bez chyb | 04 |
| Nákup ticketu | koupit ticket | `buy_ticket_atomic`, výsledek modal | 03, 04 |
| Výhra | výherní pozice | won_type main>bonus, winners zápis | 05 |
| Vouchery | katalog, nákup, koupené | tři taby, redemption | 03-voucher, 10, 11 |
| Zprávy (Bob ON) | poslat zprávu | AI odpověď, formát `{text,cta}` | 31 |
| Zprávy (Bob OFF) | admin přepne OFF | routuje na admina, ai-chat se nevolá | 31 |
| Admin↔uživatel zprávy | obousměrná komunikace | doručeno, realtime | 29, 32 |
| Odhlášení | logout | session zrušena, redirect | (součást spec login) |
| Mobilní zobrazení | layout na mobilu | bez ořezů, čitelné, bottom nav | 12 (mobile messages) — ostatní NEOVĚŘENO |

---

## C) Admin testy

| Oblast | Krok | Očekávaný výsledek | Spec |
|--------|------|--------------------|------|
| Admin login | přes `/login` | admin role detekována, přístup `/admin/*` | 33, 14 |
| Vytvoření soutěže | create přes `admin_manage_contest` | soutěž vytvořena, `ticket_count` validní | 15/16 oblast |
| Ekonomika soutěže | Ekonomika tab (frontend-only preview) | kalkulace, neukládá ekonomiku do DB | 16, 18, 19 |
| Bonusové výhry | MioCoin chunked save (CHUNK 500) | pozice vytvořeny, total synced | 18, 19, 20 |
| Tikety | kontrola pozic/kolizí | žádné duplicity/kolize | (validace v save) |
| Vouchery | `/admin/vouchers` | „Přehled voucherů" načte | 46 |
| Partneři | `/admin/partners` pending badge | počet čekajících, schválení | 37 |
| Faktury | `/admin/invoices` draft→Odeslat, issued→Znovu odeslat | správná tlačítka dle stavu | 45 |
| PDF | Generovat PDF (signed URL, `%PDF`) | PDF vznikne, export row | 44 |
| E-maily | Odeslat fakturu e-mailem | jen safe recipient `eshop@onemil.cz` (staging) | 44 |
| Doporučení a odměny | `/admin/referrals` taby | „Doporučení hráčů" + „Audit doporučení" | 46 |
| **Izolace** | admin akce nemění nesouvisející data | žádné cizí faktury/data dotčeny | součást auditů |
| admin-create-test-user | tlačítko v test dashboardu | „Produkční test vypnut" toast, žádné volání | (statická kontrola) |

---

## D) Partner testy (Partner API order-event model, LIVE)

| Oblast | Krok | Očekávaný výsledek | Spec |
|--------|------|--------------------|------|
| Registrace partnera | `/partner/register` | žádost, žádná provize | 34/35 oblast |
| Schválení partnera | admin approve | partner aktivní, password setup link (ne heslo) | 37, 38 |
| Dashboard partnera | `/partner/dashboard` | konverze + helper, Fakturace karta, Stav napojení API | 47 |
| Nastavení přepočtu | reward_base_czk / reward_mc | uloženo; ovlivní výpočet | NEOVĚŘENO ručně |
| API klíč | generovat/rotovat | zobrazen jednou, hash uložen | (admin/EF flow) |
| Partner API dokumentace | `/partner/dashboard` → Dokumentace API | order-event guide, endpoint `partner-activate` | (settings.partner_api_documentation aktualizován) |
| **create_order_reward** | POST order_total_czk + email | `pending` odměna, OneMil počítá coiny, kód+link | 48 |
| **Duplicitní objednávka** | stejný `external_order_id` | stejný kód, `duplicate:true` | 48 |
| **paid/delivered/completed** | update status | odměna → aktivní (`issued`) | 48 |
| **cancelled/returned/unpaid/not_picked_up** | update status | odměna → `cancelled` | 48 |
| Uplatnění zákazníkem | redeem aktivního kódu | wallet credit + `partner_coin_activations` řádek | 48 |
| Fakturační návaznost | cron `weekly_partner_invoices` | draft faktura z aktivovaných coinů | NEOVĚŘENO ručně (časované) |
| **Žádné vedlejší efekty při create** | po create_order_reward | 0 faktur / e-mailů / PDF / plateb / wallet credit / aktivací | 48 + produkční smoke 14.06. |

---

## E) Platby a fakturace

| Oblast | Krok | Očekávaný výsledek |
|--------|------|--------------------|
| Stripe checkout | top-up MioCoinů | redirect na Stripe, success/cancel routy |
| Stripe webhook | platba dokončena | wallet credit přes trigger, idempotence, 500 na fail → retry |
| Peněženka | po platbě | správný zůstatek |
| Partner faktury | weekly cron + admin | draft → issued, PDF, e-mail jen safe recipient |
| PDF faktury | generate-partner-invoice-pdf | private bucket, 10letý signed URL |
| E-mail faktury | send-partner-invoice-email | bez RESEND_API_KEY → 503, nemění status |
| **Vedlejší efekty** | jakákoli fakturace | žádné nechtěné platby/označení paid/cizí data |

> **NEOVĚŘENO:** reálný Stripe end-to-end na produkci (vyžaduje reálnou platbu — netestovat na produkci). Ověřit na staging/test mode.

---

## F) Právní a veřejné spuštění

| Položka | Stav | Poznámka |
|---------|------|----------|
| Obchodní podmínky | `/terms` + `/vop` existují | **NEOVĚŘENO zda obsah naplněn a aktuální** |
| Pravidla soutěží | `/pravidla-souteze` (CMS) | **NEOVĚŘENO obsah**; musí: tikety 1,2,3…, výherní pozice předem dané, ne loterie |
| GDPR / ochrana os. údajů | `/gdpr`, `/privacy` | **NEOVĚŘENO obsah** |
| Cookies | NEOVĚŘENO zda existuje cookie lišta/policy | todo |
| Kontakt | `/kontakt` | ověřit reálné údaje (viz COMPANY_CONTEXT.md) |
| Reklamace / support | NEOVĚŘENO zda samostatná stránka | podpora přes Bob/zprávy + e-mail |
| Smazání účtu | `/delete-account` | GDPR — ověřit funkčnost |
| Veřejné texty | audit 13.06. ✅ čisté (žádný viditelný `referral`, žádný hazard wording, žádný B2B billing leak) | drží |
| Věkový limit 18+ | onboarding | ověřit gating |

**Co chybí před veřejným testem (právní):** potvrzení naplnění a správnosti VOP/GDPR/pravidel soutěží, existence cookie řešení, reálné kontaktní/reklamační údaje.

---

## H) Závěr

### Co je připravené
- Routing a stránky existují pro celý zákaznický, partnerský, affiliate i admin flow.
- Partner API order-event model je **LIVE v produkci** (PR #114) + zelený spec 48.
- Partner Invoices, Affiliate Payouts, Bob ON/OFF, invite reward security — nasazené a auditované.
- 49 E2E speců + P0 smoke + Full E2E workflow.
- Veřejné zákaznické texty auditované (13.06.).

### Co se musí otestovat ručně
- Reálný Stripe top-up (test mode), mobilní zobrazení napříč stránkami, MioCoin kód email-mismatch, partner reward settings vliv na výpočet, weekly invoice cron návaznost, naplnění právních CMS stránek, cookies.

### Co musí projít automaticky (P0 před spuštěním)
- Full Staging E2E zelený (49 speců) + P0 Smoke zelený (01,02,33,14,04,05,09,03-voucher,29,32,31) + spec 48 (partner order API).

### Co blokuje veřejné spuštění (P0 blockery)
1. **NEOVĚŘENO: právní obsah** (VOP/GDPR/pravidla soutěží naplněný a správný) — bez toho nelze veřejně spustit.
2. **NEOVĚŘENO: cookies řešení.**
3. **NEOVĚŘENO: reálné kontaktní/reklamační údaje.**
4. Zelený Full E2E + P0 smoke na aktuálním `main`.
5. Reálné partner reward settings (ne `[TEST DATA]`) u partnerů, kteří půjdou živě.

### Doporučený pořádek testování
1. **Statika/právní** (F) — naplnění VOP/GDPR/pravidel, cookies, kontakt.
2. **Automatika** — P0 smoke → cílené specy dotčených oblastí → Full E2E (staging).
3. **Zákaznický flow ručně** (B) — registrace → profil → peněženka → soutěž → ticket → výhra → voucher → zprávy → odhlášení → mobil.
4. **Admin flow** (C) — login → soutěž → ekonomika → faktury/PDF/e-mail → izolace.
5. **Partner flow** (D) — registrace → schválení → dashboard → API klíč → create/duplicate/status/redeem → fakturace.
6. **Platby** (E) — Stripe test mode → webhook → peněženka → faktury.
7. **Závěrečná kontrola** — projít LAUNCH_TODO, vše P0 = prošlo.

> Po projití všech P0 v LAUNCH_TODO bez „selhalo"/„neověřeno" → OneMil připravený na první veřejné testování.
