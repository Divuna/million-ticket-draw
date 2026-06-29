# CLAUDE.md

## PARTNER INVOICE VAT FIX — PRODUKČNÍ ROLLOUT DOKONČEN (29. 06. 2026, schválení Pavla)

VAT výpočet partnerských faktur **opraven a sjednocen na produkci `xkzhjldrojjlrkezorey`** (29. 06. 2026, výslovné schválení Pavla). `vat_rate` je konvenčně **zlomek** (0.21 = 21 %); DPH = `net * vat_rate`, gross = `net + DPH`.

**Root cause:** dvě fakturační funkce (`create_partner_invoices_for_last_week`, `generate_partner_invoice`) dělily `vat_rate / 100`, což pro zlomkovou konvenci dávalo DPH 100× menší; `create_partner_invoices_for_period` (živá weekly cron cesta, job 17) už počítala správně `net * vat_rate`. Navíc produkce měla **smíšená data**: 10 partnerů `0.2100`, 1 partner `21.0000` — proto samotná migrace nestačila a musela předcházet datová oprava.

**Aplikováno (gate: `docs/rollback/partner_invoice_vat_fraction_production_gate.md`):**
- **Backup:** Supabase scheduled physical backup 29 Jun 2026 02:17:36 +0000.
- **Data fix:** guarded transakce — `UPDATE partners SET vat_rate=0.21 WHERE vat_rate=21` (1 řádek, partner `44253103-7d55-416a-8db4-57f945f1cf3b`); po opravě `percent_partners=0`.
- **Migrace:** `20260629180000_partner_invoice_vat_fraction_fix.sql` — `create_partner_invoices_for_last_week` + `generate_partner_invoice` sjednoceny na `net * vat_rate` (bez `/100`). `create_partner_invoices_for_period` beze změny (už správně). Commit migrace `9b4df3a8`.

**Postcheck ✅:** všech 11 partnerů `vat_rate=0.2100`; `lastweek_div100=false`, `generate_div100=false`, `period_div100=false`; dry-run `0.21` → vat 21,00 / gross 121,00; `existing_invoice_mismatch=0`. Ověřeno na stagingu předtím (net 14,00 → DPH 2,94 → gross 16,94).

**Bez vedlejších efektů:** žádná faktura nevytvořena, žádné e-maily, existující faktury nezměněny, žádná data smazána.

**Pravidla (neměnit):** `partners.vat_rate` držet jako zlomek (0.21), nikdy procento (21). Všechny 3 fakturační funkce počítají `net * vat_rate` (bez `/100`) — nevracet `/100` zpět. **Rollback:** vrátit definice funkcí z `20260612125606_partner_invoice_line_snapshots.sql` (varianty s `/100`) + `UPDATE partners SET vat_rate=21 WHERE id='44253103-7d55-416a-8db4-57f945f1cf3b'`. Otevřené TODO (jen návrh): detailní kontrolní přehled položek na partnerské faktuře (viz `onemil_state.md`).

## SHOPTET AUTOMATIC IMPORT SCHEDULER — PRODUKČNÍ ROLLOUT DOKONČEN (29. 06. 2026, schválení Pavla)

Automatický Shoptet import **nasazeno na produkci `xkzhjldrojjlrkezorey`** (29. 06. 2026 17:30 UTC, výslovné schválení Pavla). Cron poběží automaticky každých 15 minut.

**Aplikováno na produkci:**
- **DB migrace:** `20260629150000_shoptet_auto_import_cron_prod.sql` (atomická transakce). Obsahuje: `pg_net` + `pg_cron` extensions, Vault secret `shoptet_cron_internal_token` (generován jednou, nikdy netisknout), SECURITY DEFINER funkce `verify_shoptet_cron_token(text)` (service_role only, revoke public/anon/authenticated), orchestrator `run_shoptet_cron_imports()` (SECURITY DEFINER, loop přes partnery WHERE `shoptet_import_enabled=true`, overlap guard 30 min, dispatch přes `net.http_post` s x-internal-token header, body `{partner_id, mode='live', trigger='cron'}`), pg_cron job `shoptet_auto_import_15min` schedule `*/15 * * * *`.
- **EF `import-shoptet-orders` v8 ACTIVE** (verify_jwt=false, Vault token verification via RPC `verify_shoptet_cron_token(p_token)`, trigger='cron' support, overlap guard, respektuje `reward_trigger_status` threshold, 5-bucket status taxonomie, idempotentní).
- **Backup před apply:** `backups/onemil-production-pre-shoptet-cron-20260629-143257.dump` (465 825 272 B, ověřen `pg_restore -l` exit 0, 1643 TOC entries, obsahuje shoptet_import_runs).

**Produkční postcheck ✅ (29. 06. 2026):**
- Cron job `shoptet_auto_import_15min`: active=true, schedule `*/15 * * * *` ✅
- Latest cron run: status=`ok`, rows_failed=0 ✅
- Idempotence ověřena: run 1 created=1 skipped_dup=2; run 2 created=0 skipped_dup=3 ✅
- BOHEMIA `shoptet_customer_delivery='partner'`, žádné OneMil e-maily zákazníkům ✅
- Cron stále funguje po resetu DB hesla ✅

**Kritická pravidla (neměnit):**
- Orchestrator `run_shoptet_cron_imports` běží každých 15 minut; partner s `shoptet_import_enabled=true` bez běžícího importu <30 min starého se dispatchuje.
- EF verifikuje token server-side přes RPC `verify_shoptet_cron_token` — token se nikdy nevystavuje klientovi.
- BOHEMIA zůstává `shoptet_customer_delivery='partner'` — OneMil neposílá zákazníkům e-maily.
- Duplicate detection v `create_partner_order_reward` (advisory lock + dedup na `external_order_id`).

**Rollback:** `SELECT cron.unschedule('shoptet_auto_import_15min'); DROP FUNCTION IF EXISTS public.run_shoptet_cron_imports(); DROP FUNCTION IF EXISTS public.verify_shoptet_cron_token(text);` Vault secret lze smazat přes API.

**Commit:** `cd811f41` (migrace + aplikace + push na main).

## SHOPTET CUSTOMER E-MAIL ENQUEUE -- PRODUCTION ROLLOUT COMPLETE (29. 06. 2026)

BOHEMIA/Shoptet customer e-mail enqueue fix is now **applied on production `xkzhjldrojjlrkezorey`** after explicit Pavel approval. Applied migration: `supabase/migrations/20260629160000_shoptet_onemil_customer_email.sql`. Deployed Edge Function: `import-shoptet-orders` **ACTIVE version 10**. A fresh production backup was created and verified with `pg_restore -l` before rollout.

The DB fix is intentionally atomic inside `public.update_partner_order_reward_status(...)`: when a partner-order reward code transitions from `pending` to `issued`, it enqueues exactly one pending `email_queue` row only if `partners.shoptet_customer_delivery = 'onemil'`. `shoptet_customer_delivery = 'partner'` does not enqueue a customer e-mail. Duplicate status updates do not enqueue duplicates. `partner_coin_activations` remain redeem-only and were not touched by this rollout.

Production postcheck: migration applied and recorded; EF active v10; BOHEMIA remains `shoptet_customer_delivery='onemil'`; no historical e-mails backfilled; BOHEMIA order `2026000004` was not resent; no manual e-mails sent; `partner_coin_activations` unchanged; pending `email_queue` remained 0; new future orders are ready to enqueue the customer e-mail on fresh `pending -> issued`. Rollback: restore the previous `update_partner_order_reward_status` definition from backup/prior migration source, mark migration `20260629160000` reverted if DB rollback is performed, and redeploy the previous `import-shoptet-orders` version/source; never delete/modify queued e-mails without separate approval.

Real production verification after rollout: BOHEMIA order `2026000005` completed the full flow end-to-end: imported=yes, reward code created=yes, status=`activated`, customer e-mail queued=yes, e-mail sent=yes, duplicate=no. This confirms the production path `Shoptet import -> reward code -> email_queue -> sent e-mail -> customer activation` without recording customer e-mail, full code, Shoptet URL, or any secret value.

## PARTNER DASHBOARD WEEKLY OVERVIEW — RLS FIX NA STAGINGU + PRODUKČNÍ ROLLOUT DOKONČEN (29. 06. 2026)

Partner dashboard „Týdenní přehled" (a statistické karty „Vydané kódy / Aktivované kódy") ukazoval BOHEMIA všude 0, přestože data v DB existovala. **Root cause (read-only audit):** `partner_reward_codes`, `partner_coin_activations` a `partner_api_keys` měly **RLS enabled, ale 0 policies → deny-all** pro partnerovu `authenticated` session. Frontend čte tyto tabulky přímo přes `.from()` s partner JWT → PostgREST vrací `[]` (bez chyby) → vše 0. Data byla správná (`issued_at` vyplněn, žádný backfill nepotřeba); UI `weeklyReports` v `PartnerDashboard.tsx` je správné a nemění se.

**Oprava (STAGING `dxmowysntemfqfnanxua`):** migrace `supabase/migrations/20260629120000_partner_own_select_rls.sql` — přidány **3 SELECT-only** partner-own + admin/superadmin policies (`partner_reward_codes_select_own`, `partner_coin_activations_select_own`, `partner_api_keys_select_own`), vzor `partner_id IN (SELECT id FROM partners WHERE auth_user_id = auth.uid()) OR is_admin() OR is_superadmin()`. **Žádné INSERT/UPDATE/DELETE policy** — zápisy zůstávají výhradně přes SECURITY DEFINER RPC / service_role.

**Staging postcheck ✅:** 3× SELECT (`cmd='r'`, role authenticated), 0 write policies; partner UPDATE vlastního řádku = 0 rows, INSERT = RLS denied; partner vidí jen vlastní řádky (9 PRC, ne 15; PCA 2, ne 5; PAK 0); cross-partner izolace (cizí partner = 0); admin/superadmin vidí vše (15/5/4); `is_admin()` u partnera = false; BOHEMIA staging nezměněna. (Izolace testována v transakcích s ROLLBACK přes dočasný `auth_user_id` flip na reálného ne-admin uživatele — `auth_user_id` má FK na `auth.users`.)

**Produkční rollout ✅ (29. 06. 2026, schválení Pavla):** migrace aplikována na `xkzhjldrojjlrkezorey` (transakční, COMMIT OK); 3× SELECT policies (`cmd='r'`, role `authenticated`), 0 write policies. **BOHEMIA partner visibility ověřena:** vidí 5 partner_reward_codes (z toho 2 Shoptet + 1 aktivovaný), `is_admin=false`. **Admin/superadmin vidí vše:** PRC 5 / PCA 3 / PAK 17. **Data intaktní:** všech 5 kódů (4 issued, 1 activated), 2 Shoptet, `auth_user_id` intaktní, `delivery='partner'` beze změny. Žádné mutace, transakce ROLLBACK; partnera se změní projeví po znovunačtení dashboardu.

**Pravidlo (neměnit):** tyto 3 tabulky musí mít partner-own SELECT policy (bez ní partner dashboard nevidí vlastní data); nepřidávat partnerovi write policy — zápisy jen přes SECURITY DEFINER/service_role. Rollback: 3× `DROP POLICY IF EXISTS` (viz migrace). Žádný frontend deploy.

## SHOPTET PHASE 2 — PRODUKČNÍ ROLLOUT DOKONČEN (29. 06. 2026, schválení Pavla)

Shoptet Phase 2 self-service e-shop connection **nasazeno na produkci `xkzhjldrojjlrkezorey`** (29. 06. 2026, výslovné schválení Pavla).

**Aplikováno na produkci:**
- **DB migrace:** `20260628120000_shoptet_connection_requests.sql` (jediný soubor — atomická transakce). Obsahuje: `partners.reward_trigger_status` sloupec (default `'paid'`), `shoptet_connection_requests` tabulka + 4 RLS policies + 4 indexy + trigger, 3 Vault RPC (service_role only).
- **EF `submit-shoptet-connection` v3 ACTIVE** — partner podá žádost přes `/partner/dashboard`, URL uložena do Vault (nikdy do DB).
- **EF `approve-shoptet-connection` v3 ACTIVE** — admin schválí/zamítne, při schválení: promote Vault URL, `shoptet_customer_delivery='onemil'` (non-negotiable), `reward_trigger_status` zkopírován z žádosti, `shoptet_import_enabled=true`.
- **EF `import-shoptet-orders` v5 ACTIVE** — respektuje `reward_trigger_status` threshold (paid/shipped/completed), 5-bucket status taxonomie, idempotentní.

**Produkční postcheck ✅ (29. 06. 2026):** tabulka + 4 policies + 4 indexy existují; Vault RPCs anon=false/service_role=true; BOHEMIA `shoptet_customer_delivery='partner'` beze změny; 0 testovacích SCR řádků; všechny 3 EF ACTIVE.

**Frontend:** vyžaduje Lovable Publish (UI pro `/partner/dashboard` Step 5 + `/admin/partners` Step 6 — Shoptet badge + formulář).

**Kritická pravidla (neměnit):**
- `approve-shoptet-connection` MUSÍ vždy SET `shoptet_customer_delivery='onemil'` pro self-service partnery.
- BOHEMIA (`61c23960-7271-4c75-a1a4-dcb6e81b41ce`) má `delivery='partner'` — nikdy neprochází self-service flow.
- Shoptet URL se NIKDY neukládá do žádné aplikační tabulky — výhradně Vault.
- `reward_trigger_status` default `'paid'` zachovává BOHEMIA legacy chování.

## SHOPTET PHASE 1 PRODUKČNÍ LIVE ISSUANCE — DOKONČENO (28. 06. 2026)

Shoptet Phase 1A/1B/1C dokončeno na stagingu i **produkci**. Staging: `dxmowysntemfqfnanxua`; produkce: `xkzhjldrojjlrkezorey`. Phase 1A/1B commit: `2f0027e4`. Shoptet URL uložena výhradně ve Vault; nikdy netisknout.

**Produkční live issuance (28. 06. 2026, schválení Pavla):**
- Live run 1: 2 řádky CSV, 2 valid, **2 kódy vytvořeny**, 2 status→issued, 0 failed, status=`ok`.
- Live run 2 (idempotency): 2 řádky, **0 created, 2 skipped_dup** — duplicity správně blokovány.
- Emails zákazníkům: **0** (`shoptet_customer_delivery='partner'` — BOHEMIA doručuje kódy přes vlastní e-shop).
- Staré 3 testovací kódy (ext_order_id=NULL) nedotčeny.
- CSV byl dynamický export Shoptet — 2 reálné objednávky (`2026000001`, `2026000002`); DEMO objednávky z dry-runu mezitím zmizely z exportu (normální chování živého exportu).
- Metoda: PL/pgSQL DO blok přes `http` extension (v1.6) — URL ani emaily zákazníků nikdy nevratil do tool results.
- `eshop@onemil.cz` = partner strana (BOHEMIA); `veru.enge@gmail.com` = testovací zákazník (staging only).
- Full handoff: `docs/shoptet/SHOPTET_PHASE1_HANDOFF.md`.
- **Final postcheck (28. 06. 2026) ✅:** 2 kódy s ext_order_id (oba issued), 0 failed import rows, 0 pending email_queue, partner_coin_activations=3 (nedotčeno), latest live run=`ok`, staré 3 null-ext-id kódy nedotčeny.
- **Monitoring po Phase 1C (bez nového kódu):** denně — latest live run status (`ok`), failed import rows (0), pending email_queue (0 = norma, BOHEMIA partner-delivery). Týdně — rows_created vs. nové objednávky, skipped_dup spike = anomálie Shoptet exportu, partner_coin_activations roste jen po zákaznickém redemption, stale `issued` kódy starší 30 dní (signál, že zákazníci neuplatňují). Vše přes read-only SQL v Supabase SQL Editoru. Volitelně Phase 2: admin view `/admin/shoptet-imports` + Telegram alert při `status != 'ok'`.

## SHOPTET PHASE 2 — E2E STAGING TEST PROŠEL + PRODUKČNÍ ROLLOUT DOKONČEN (28.–29. 06. 2026)

Shoptet Phase 2 self-service e-shop connection **staging E2E test ✅ PASSED**. Všechny 6 fází ověřeny:
- **Phase 1 Draft:** partner vytvoří draft v `/partner/dashboard`
- **Phase 2 Submit:** EF `submit-shoptet-connection` uloží URL do Vault (v Vault_pending), DB flag `url_received=true`
- **Phase 3 Admin Badge:** `/admin/partners` zobrazuje počet čekajících žádostí
- **Phase 4 Approve:** EF `approve-shoptet-connection` propaguje Vault URL (pending→final), nastaví `shoptet_customer_delivery='onemil'`, zkopíruje `reward_trigger_status`, přepne `shoptet_import_enabled=true`
- **Phase 5 Reject:** EF zamítne s `rejection_reason`, Vault URL smazáno
- **Phase 6 Import Dry-Run:** `import-shoptet-orders` v5 respektuje `reward_trigger_status` threshold (paid/shipped/completed)

**E2E Test Metrics:**
- Method: API-level (EF + PostgREST, žádný browser)
- Submit flow: ✅ status changed to 'submitted', URL not persisted in DB (only flag)
- Admin badge: ✅ submitted count loaded for tab display
- Approve flow: ✅ partner.shoptet_customer_delivery='onemil' SET, trigger copied, import_enabled=true
- Reject flow: ✅ status='rejected', rejection_reason persisted
- Dry-run: ✅ respects reward_trigger_status, status='ok', 0 emails, 0 codes created
- BOHEMIA: ✅ shoptet_customer_delivery='partner' unchanged
- Production: ✅ untouched

**Produkční rollout:** dokončen 29. 06. 2026 (viz sekce výše). Frontend Lovable Publish zbývá.

## SHOPTET PHASE 2 — PRODUKTOVÉ ROZHODNUTÍ: TŘI ZPŮSOBY NAPOJENÍ E-SHOPU (28. 06. 2026, opraveno 28. 06. 2026)

OneMil nabízí tři způsoby napojení partnerského e-shopu. Partner sekce v dashboardu tyto možnosti jednoduše vysvětlí.

### 1. Shoptet CSV automat (výchozí doporučená cesta)
- Samoobslužné napojení pro Shoptet e-shopy bez programování.
- Partner zadá URL Shoptet exportu v `/partner/dashboard`; admin schválí.
- OneMil pravidelně stahuje CSV a automaticky vytváří MioCoin kódy.
- **OneMil posílá zákazníkovi e-mail s kódem ihned po vydání** — toto je výchozí chování pro všechny self-service Shoptet partnery.
- **Phase 2 implementační návrh:** nová tabulka `shoptet_connection_requests`, EF `submit-shoptet-connection` + `approve-shoptet-connection`, partner UI formulář, admin badge + schvalovací flow. Detailní návrh byl připraven 28. 06. 2026.

### 2. OneMil Partner API (pro technicky schopné e-shopy)
- E-shop posílá objednávku přímo do OneMil přes Partner API (EF `partner-activate`).
- Přesnější a rychlejší napojení než CSV — bez prodlevy, bez exportního souboru.
- Vhodné pro větší e-shopy s vlastním vývojovým týmem.
- Existující implementace: `create_partner_order_reward` + `update_partner_order_reward_status`.
- Zákazník dostane kód standardně e-mailem od OneMil.

### 3. Individuální partner delivery (výjimka po domluvě)
- OneMil vytvoří a spravuje kódy, ale doručení zákazníkovi zajistí partner vlastním systémem.
- Nastavení: `shoptet_customer_delivery='partner'` — OneMil neposílá e-mail zákazníkovi.
- BOHEMIA zůstává v tomto režimu: kódy jsou `issued` v OneMil, BOHEMIA je doručuje přes vlastní e-shop.
- Tato možnost je výjimka — aktivuje ji admin ručně, ne partner samoobslužně.

### Pravidlo pro partner dashboard (Phase 2)
Partner sekce vysvětlí volbu jednoduše:
- „Shoptet e-shop? Použijte **Shoptet automat** — zadejte export URL, my se postaráme o zbytek."
- „Větší e-shop s vývojáři? Zvažte **Partner API** — pište nám na `eshop@onemil.cz`."
- „Individuální doručení (např. vlastní e-mailová šablona) je možné po domluvě s OneMil."

### Kritické pravidlo Phase 2 — `shoptet_customer_delivery` při approve (neměnit)
- **Produkční default `partners.shoptet_customer_delivery` je `'partner'`** (BOHEMIA ho má od Phase 1).
- **Nový self-service Shoptet partner musí dostat `'onemil'`** — OneMil posílá e-mail zákazníkovi.
- Proto **EF `approve-shoptet-connection` MUSÍ při schválení vždy nastavit `shoptet_customer_delivery = 'onemil'`** na daném `partners` řádku.
- BOHEMIA má samostatný záznam s `'partner'` — approve EF se BOHEMIA nedotýká (BOHEMIA nepodává žádost přes self-service flow).
- Individuální `'partner'` nebo `'both'` delivery pro nové partnery nastaví admin manuálně po schválení — formulář partner nenabízí.
- **Toto pravidlo nesmí být porušeno ani optimalizováno:** bez explicitního SET `shoptet_customer_delivery='onemil'` by nový partner zdědil produkční default `'partner'` a zákazníci by nedostávali e-maily.

## PARTNERS_TABLE_PUBLIC_EXPOSURE — PRODUKČNÍ FIX HOTOVÝ (24. 06. 2026)

Pre-existing nález `partners_table_public_exposure` je na produkci `xkzhjldrojjlrkezorey` opraven. PR #118 mergnut do `main`.
- **Migrace aplikována:** `supabase/migrations/20260624122921_partners_public_view_rls_lock.sql` (atomicky, COMMIT). Vytvořen view `public.public_partners` (jen safe approved/logo pole), `grant select` anon+authenticated; na base `public.partners` odebrán broad `Public read partners`, revokenut select pro public/anon, přidána policy `partners_select_own_admin` (own-row přes `auth_user_id` OR `is_admin()` OR `is_superadmin()`).
- **Frontend:** veřejné zobrazení partnerských log čte z `public_partners` (`src/hooks/usePartners.ts`). Produkční live bundle **`index-B-nGIJdT.js`** obsahuje `public_partners`.
- **Ověřeno na produkci:** `public_partners` existuje; anon ho čte (1 approved logo řádek); přímý anon read `partners` blokován (`42501 permission denied`); authenticated non-admin → 0 řádků; partner vidí vlastní řádek (1); admin i superadmin vidí vše (11/11); homepage loga se opět renderují; **BOHEMIA API key flow beze změny** (1 aktivní klíč, `partner_api_keys` nedotčena); Shoptet importer beze změny.
- **Backup před migrací (validní):** `backups/onemil-production-pre-partners-exposure-fix-20260624-151442.dump` (~466 MB, `pg_restore -l` OK). (První pokus o dump se přerušil → smazán; platný je až retry.)
- **Pozn. k zámku:** migraci blokoval osiřelý `idle in transaction` backend PID `1131426` (z přerušeného prvního pg_dump, `COPY public.admin_actions`). Ukončen `pg_terminate_backend` **s výslovným schválením Pavla** (jen tento jeden PID), poté migrace prošla.
- **⏳ Otevřený reminder:** před ostrým launchem rotovat exponované/test tokeny i produkční DB heslo (objevilo se v chatu).
- **Pravidlo (neměnit):** veřejné partnerské zobrazení číst přes `public_partners`, ne přes `partners.select('*')`; base `partners` nevracet broad public/anon SELECT.

## PHASE 4 SLICE A — PRODUKČNÍ SMOKE ✅ PASS (24. 06. 2026)

Phase 4 Slice A publikováno na produkci (Lovable Publish) a ručně ověřeno — **smoke PASS**. Delegace Partner Offers (offer-only stránka) je LIVE.
- Nový klíč `partner_offers.finance.manage` existuje (checkbox v `/admin/admins`). ✅
- Subadmin s klíčem vidí v nav „Partnerské nabídky" a úspěšně otevře `/admin/partner-offers`. ✅
- Citlivé routy zůstávají blokované superadmin-only fallbackem: `/admin/invoices`, `/admin/partners-portal`, `/admin/payments`, `/admin/winners`, `/admin/statistics`. ✅
- Nebyly otevřeny: faktury, platby, payouty, provize, výherci, soutěže, audit/system, admin role management. ✅
- **Další možný krok (Phase 4 Slice B):** samostatná Partner Offers finance stránka jen pro offer faktury (`partner_invoices type='offer'` + `partner_offer_invoice_lines`) — NEpoužívat smíšené `/admin/invoices` ani `/admin/partners-portal`; pro skutečnou izolaci zvážit DB/RLS scoping (Slice C). Vyžaduje samostatné schválení Pavla.
- **⏳ Stále otevřeno:** reset produkčního DB hesla (objevilo se v chatu při Phase 2 apply).

## PARTNER API KEY ROTATION — PRODUKČNÍ FIX HOTOVÝ (24. 06. 2026)

Production partner API key rotation fix je dokončený. PR #117 (`fix: improve partner API key rotation errors`) byl mergnut do `main`; produkční Edge Functions `partner-rotate-api-key` a `rotate-partner-api-key` byly nasazeny na projekt `xkzhjldrojjlrkezorey`.

- Token mismatch byl dočasně opraven sjednocením `INTERNAL_FUNCTION_TOKEN` a `VITE_INTERNAL_FUNCTION_TOKEN` pro testování. Safe probe `partner-rotate-api-key` bez partner session vrátil `missing_session`, tedy internal-token validace prochází.
- BOHEMIA manual API key regeneration uspěla. BOHEMIA má přesně 1 aktivní API key podle `revoked_at IS NULL` a 15 starších key rows s vyplněným `revoked_at`.
- Latest active key prefix: `01efbfaf`.
- `partner_api_keys` neobsahuje plaintext API key sloupec; existují jen prefix/hash sloupce (`key_prefix`, `key_hash`, `api_key_hash`).
- **Security reminder:** dočasné/exponované test tokeny musí být před reálným launchem rotované.
- **Security reminder:** pre-existing `partners_table_public_exposure` musí být stále opravené před production launch.

## PHASE 4 SLICE A — PARTNER OFFERS OPRÁVNĚNÍ (23. 06. 2026, frontend-only)

Nejmenší safe krok delegace Partner Offers: nový klíč `partner_offers.finance.manage` jen pro **`/admin/partner-offers`**. **Žádné DB/RLS/SQL/EF/produkční změny; frontend-only; faktury/portál/platby/payouty/provize/výherci/soutěže/tikety/audit netknuty.**
- **`useAdminPermissions.ts`:** klíč `partner_offers.finance.manage` (label „Partnerské nabídky (finance)") přidán do `ADMIN_PERMISSION_KEYS`/`ADMIN_PERMISSION_LABELS`; `ADMIN_ROUTE_PERMISSION['/admin/partner-offers']` + `SUBADMIN_ENTRY_ROUTES` (nav label „Partnerské nabídky").
- **`App.tsx`:** `/admin/partner-offers` přepnuto z `RequireSuperadmin` na `RequirePermission("partner_offers.finance.manage")`. Jediná změněná routa.
- **`AdminPrimaryNav.tsx`:** ikona `Tag` pro nový klíč (non-superadmin vidí „Partnerské nabídky" jen s klíčem). Grant UI v `/admin/admins` se zobrazí automaticky (iteruje `ADMIN_PERMISSION_KEYS`).
- **Rozsah role:** jen offer-only stránka `/admin/partner-offers` (moderace nabídek + per-offer billing `billing_mode`/`price_per_activation`/`billing_admin_override` + aktivace/kliky). Business logika `AdminPartnerOffers` netknuta.
- **Superadmin-only zůstává (Slice B/C, mimo tento krok):** offer faktury (`partner_invoices type='offer'`, `partner_offer_invoice_lines`) ve smíšených `/admin/invoices` + `/admin/partners-portal`; globální `/admin/payments`, affiliate/influencer commissions+payouts, winners, prize-delivery, contest internals, audit/system, `/admin/admins`. Build ✅, `tsc --noEmit` 0 chyb. Vyžaduje Lovable Publish + grant klíče v `/admin/admins`.

## PHASE 3B — PRODUKČNÍ SMOKE ✅ PASS (23. 06. 2026)

Phase 3b support oprávnění publikována na produkci (Lovable Publish) a ručně ověřena — **smoke PASS**. Granulární support role je nyní LIVE.
- Superadmin vidí v `/admin/admins` nové checkboxy `support.messages` + `users.view.basic`. ✅
- Subadmin se `support.messages`: vidí JEN „Zprávy", NEvidí Bob ON/OFF, může používat support zprávy. ✅
- Subadmin s `users.view.basic`: vidí „Uživatelé", NEvidí adresu ani datum narození, NEmůže měnit role. ✅
- Přímé citlivé URL (`/admin/payments`, `/admin/winners`, `/admin/statistics`) blokovány superadmin-only fallbackem. ✅
- Superadmin beze změny. ✅
- **⏳ FINÁLNÍ AKCE (otevřená):** resetovat produkční DB heslo — objevilo se v chatu během Phase 2 apply; reset proběhne po tomto dokumentačním zápisu.

## PHASE 3B — SUPPORT OPRÁVNĚNÍ (23. 06. 2026, frontend-only)

Přidána dvě safe support oprávnění pro subadminy. **Žádné DB/RLS/SQL/EF/produkční změny; frontend-only.** Granty se dělají vložením řádků do `admin_permissions` (volné textové klíče — bez migrace).
- **Nové klíče:** `support.messages` (label „Zprávy (podpora)") → `/admin/messages` + `/admin/messages/:userId`; `users.view.basic` (label „Uživatelé (základní)") → `/admin/users`. Přidáno do `ADMIN_PERMISSION_KEYS`, `ADMIN_PERMISSION_LABELS`, `ADMIN_ROUTE_PERMISSION`, `SUBADMIN_ENTRY_ROUTES` (nav labels „Zprávy"/„Uživatelé", ikony MessageSquare/Users).
- **Routy:** `/admin/messages`, `/admin/messages/:userId` přepnuty z `RequireSuperadmin` na `RequirePermission("support.messages")`; `/admin/users` na `RequirePermission("users.view.basic")`. Ostatní Phase 3 superadmin-only routy beze změny.
- **Nav:** non-superadmin vidí „Zprávy" jen s `support.messages`, „Uživatelé" jen s `users.view.basic` (přes `SUBADMIN_ENTRY_ROUTES` v `AdminPrimaryNav`).
- **Support smí:** číst support konverzace, odpovídat, označit přečtené, ukončit chat; vidět základní seznam uživatelů (jméno, role badge, vytvořeno).
- **Support NESMÍ:** přepínat Boba (toggle skryt `isSuperAdmin`-only v `AdminMessages`), měnit role (UI superadmin-only, RLS lock Phase 1), vidět datum narození / adresu (`AdminUsers` pro non-superadmina SELECTuje jen `id, full_name, first_name, last_name, phone, updated_at` — žádné `date_of_birth/street/city/zip/country/avatar`), ani citlivé finance/contest/winners/audit (Phase 3 route guardy + Phase 1 RLS).
- **Pravidlo:** support klíče jsou safe-only; rozšiřovat sensitive oblasti jen samostatným schváleným krokem. Build ✅, `tsc --noEmit` 0 chyb. Vyžaduje Lovable Publish + grant klíčů subadminům v `/admin/admins`.

## PHASE 3 — ROUTE-LEVEL HARDENING SENSITIVE ADMIN ROUT (23. 06. 2026, frontend-only)

Uzavřena díra přímého URL přístupu: non-superadmin admin (subadmin) se nedostane na citlivé admin routy ani přes přímý odkaz. **Žádné DB/RLS/SQL/EF/produkční změny; frontend-only. Support oprávnění JEŠTĚ NEPŘIDÁNA.**
- **`RequireSuperadmin.tsx` (nový):** superadmin → render beze změny; non-superadmin → „Tato část je dostupná pouze superadminovi." (page body se nenamountuje). AdminLayout dál blokuje ne-adminy na `/`. DB ochrana dat zůstává per-table superadmin RLS (Phase 1) — toto je UI/route vrstva defense-in-depth.
- **Superadmin-only routy (wrapnuté `RequireSuperadmin`):** `/admin/users`, `/admin/admins`, `/admin/payments`, `/admin/winners`, `/admin/prize-delivery`, `/admin/tests`, `/admin/partners`, `/admin/partner-offers`, `/admin/messages`, `/admin/messages/:userId`, `/admin/audit-logs`, `/admin/event-queue`, `/admin/audit-repair`, `/admin/onemil-audit`, `/admin/contest/:contestId`, `/admin/legal-acceptances`, `/admin/onboarding-incomplete`, `/admin/partners-portal`, `/admin/invoices`, `/admin/referrals`, `/admin/referral-dashboard`, `/admin/influencers`, `/admin/affiliate-accounts`, `/admin/influencer-commissions`, `/admin/influencer-campaigns`, `/admin/company-leads`, `/admin/affiliate-commissions`, `/admin/affiliate-payouts`, `/admin/affiliate-payouts/:batchId`.
- **Beze změny:** `/admin` + `/admin/statistics` (`RequireSuperadminOrRedirect` — efektivně superadmin-only); Phase 2 safe routy `/admin/vouchers`, `/admin/content`, `/admin/banners`, `/admin/notifications` (`RequirePermission`); `/admin/*` 404.
- **Pozn.:** `/admin/messages` + `/admin/users` jsou pro teď superadmin-only; Phase 3b je přepne na `support.messages` / `users.view.basic` (swap `RequireSuperadmin` → `RequirePermission`). Build ✅, `tsc --noEmit` 0 chyb. Vyžaduje Lovable Publish.

## PHASE 2 — PRODUKČNÍ FRONTEND SMOKE ✅ PASS (23. 06. 2026)

Phase 2 frontend publikován na produkci (Lovable Publish) a ručně ověřen — **smoke PASS**. DB apply (`admin_permissions`) byl dokončen a ověřen dříve.
- **Superadmin:** vidí Phase 2 permission checkboxy v `/admin/admins`. ✅
- **Subadmin se všemi 4 safe oprávněními:** vidí JEN Vouchery, Obsah stránek, Bannery, Notifikace. ✅
- **Subadmin už NEvidí Dashboard / Statistiky aplikace.** ✅
- **Přímý `/admin`** → redirect subadmina na `/admin/vouchers`. ✅
- **`/admin/statistics`** subadminovi nepřístupné. ✅
- **Skryto:** contest internals, finance, users/admin management, winners, audit/system. ✅
- **⏳ Produkční DB heslo NEresetovat zatím** — objevilo se v chatu; Pavel resetuje až po dokončení veškerých zbývajících rollout prací. (Otevřený follow-up.)

## PHASE 2 — SUBADMIN DASHBOARD/STATISTIKY SKRYTÍ (23. 06. 2026, frontend-only)

Oprava: subadmin po grantu safe oprávnění stále viděl **Dashboard** pill + **Statistiky aplikace** + agregátní platform karty (počty uživatelů, aktivní soutěže, bonusy, vouchery). Nyní non-superadmin vidí **jen** explicitně grantnuté safe oblasti. **Žádná DB/RLS/EF/produkční změna; frontend-only.**
- **`AdminPrimaryNav.tsx`:** non-superadmin row 1 už NEzobrazuje sekční pills (vč. „Dashboard" → `/admin/statistics`). Místo toho přímé odkazy jen na držené safe klíče v pořadí `Vouchery, Obsah stránek, Bannery, Notifikace` (`SUBADMIN_ENTRY_ROUTES` + ikony Gift/BookOpen/Image/Bell). Superadmin row 1 beze změny (plné sekce).
- **`RequireSuperadminOrRedirect.tsx` (nový):** wrapuje `/admin` (Dashboard) i `/admin/statistics` v `App.tsx`. Superadmin → render beze změny; non-superadmin → redirect na první držený safe route v pořadí `/admin/vouchers → /admin/content → /admin/banners → /admin/notifications`; bez oprávnění → text „Nemáte přiřazené žádné oprávnění administrace." AdminLayout dál blokuje ne-adminy na `/`.
- **`useAdminPermissions.ts`:** přidán `SUBADMIN_ENTRY_ROUTES` (ordered safe entry routes — jediný zdroj pořadí redirectu i nav).
- **Pravidlo:** non-superadmin NESMÍ vidět Dashboard, Statistiky aplikace, platform metriky, počty uživatelů/soutěží/bonusů, contest/statistics overview ani default `/admin` obsah. Safe klíče zůstávají: `vouchers.manage`→Vouchery, `content.manage`→Obsah stránek, `banners.manage`→Bannery, `notifications.manage`→Notifikace. Build ✅, `tsc --noEmit` 0 chyb. Vyžaduje Lovable Publish.

## PHASE 2 — `admin_permissions` APLIKOVÁN NA PRODUKCI (23. 06. 2026, schválení Pavla)

Aditivní `admin_permissions` DB foundation **aplikován na produkci `xkzhjldrojjlrkezorey`** (Pavel: „SCHVALUJI PHASE 2 PRODUKČNÍ APPLY"). Aplikováno `docs/rollback/phase2_admin_permissions_apply.sql` (transakční, COMMIT, exit 0). **Žádný frontend publish, žádný EF deploy, žádný `db push`, žádná jiná produkční změna.**
- **Backup PŘED apply:** `backups/onemil-production-pre-phase2-admin-permissions-20260623-195824.dump` (465 655 142 B, `pg_restore -l` OK, 2197 TOC). Git-ignored, necommitovat.
- **Vytvořeno:** tabulka `public.admin_permissions` (RLS on, UNIQUE(user_id,permission_key), index `idx_admin_permissions_user_id`), helper `public.has_admin_permission(check_key text, check_user_id uuid default auth.uid())` (SECURITY DEFINER, owner postgres), policy `admin_permissions_select` (own/superadmin SELECT) + `admin_permissions_superadmin_write` (superadmin ALL).
- **Verifikace ✅ (všech 10 checků):** dependency `is_superadmin` t; table+RLS t/t; sloupce OK; UNIQUE+index OK; obě policy OK; helper SECURITY DEFINER owner postgres; helper EXECUTE = `authenticated`+postgres+service_role (anon/PUBLIC NEMAJÍ — `anon_can_execute=f`); 0 řádků / 0 neočekávaných klíčů; `user_roles` = **565** (beze změny baseline admin:1, superadmin:1, user:563). Phase 1 funkce (4) + superadmin-only policy (6) beze změny.
- **Rollback (pokud bude třeba):** `docs/rollback/phase2_admin_permissions_rollback.sql` (drop JEN Phase 2 objektů).
- **⚠️ DALŠÍ KROK — frontend NENÍ publikován:** Phase 2 frontend gating (`useAdminPermissions`, `RequirePermission`, nav/route gating, grant UI) **publikovat na produkci AŽ teď, samostatně** — DB už je připravena. Po publishi udělit subadminům konkrétní klíče (`vouchers.manage`/`content.manage`/`banners.manage`/`notifications.manage`) v `/admin/admins`.
- **⚠️ Po dokončení rolloutu: resetovat produkční DB heslo** (objevilo se v chatu).

## PHASE 2 — PRODUKČNÍ APPLY PACKAGE PŘIPRAVEN (NEAPLIKOVÁNO) (23. 06. 2026)

Připraven bezpečný **produkční apply package** pro aditivní `admin_permissions` DB foundation (jen Phase 2 foundation, nic citlivého). **NIC neaplikováno na produkci `xkzhjldrojjlrkezorey`; žádný produkční SQL nespuštěn; žádný EF deploy; žádný frontend publish.**
- **Soubory:** `docs/rollback/phase2_admin_permissions_production_plan.md`, `phase2_admin_permissions_apply.sql`, `phase2_admin_permissions_rollback.sql`, `phase2_admin_permissions_verification.sql`.
- **Apply rozsah (přesně):** `public.admin_permissions` (+ UNIQUE(user_id,permission_key) + index `idx_admin_permissions_user_id` + RLS) · helper `public.has_admin_permission(text, uuid default auth.uid())` (SECURITY DEFINER, execute jen `authenticated`, revoke PUBLIC/anon) · policy `admin_permissions_select` (own/superadmin) + `admin_permissions_superadmin_write` (superadmin only). Apply je transakční + idempotentní + pre-apply guard aborts pokud chybí `is_superadmin()` (Phase 1 dependency).
- **Povolené klíče (jen safe):** `vouchers.manage`, `content.manage`, `banners.manage`, `notifications.manage`. **Mimo rozsah:** contest internals, tickets, revenue/statistics, payments, invoices, commissions, payouts, winners, prize delivery, audit/system/settings, admin role management.
- **Rollback** dropuje JEN Phase 2 objekty (policies → helper → table); **nesmí** sáhnout na `is_superadmin()`, `user_roles` ani Phase 1.
- **Pre-apply checklist:** výslovné schválení Pavla + manuální `pg_dump` (PITR off) + potvrdit produkci nedotčenou + **frontend Phase 2 NEPUBLIKOVAT před DB apply** (jinak non-superadmin ztratí nav).
- **Stav:** ⛔ produkční apply NENÍ schválen; package čeká na schválení.

## PHASE 2 — STAGING E2E PASSED / STAGING-VALIDATED (23. 06. 2026)

Targeted Phase 2 staging E2E **prošel**: run `28043183824` (`playwright-staging.yml`, spec `tests/e2e/phase2-admin-permissions.spec.ts`), conclusion **success**, headSha `d92c5ca2` (ověřeno `gh run view`).

- **Phase 2 (granulární subadmin oprávnění) je staging-validated** — DB foundation (`admin_permissions`, `has_admin_permission()`, klíče `vouchers.manage`/`content.manage`/`banners.manage`/`notifications.manage`) + frontend gating (`useAdminPermissions()`, `RequirePermission`, route/nav gating, grant/revoke UI v `/admin/admins`) + targeted E2E zelený na stagingu `dxmowysntemfqfnanxua`.
- **Produkční DB apply `admin_permissions` NENÍ schválen.** Produkce `xkzhjldrojjlrkezorey` NEDOTČENA.
- **Pravidlo / další krok:** produkční apply migrace `admin_permissions` provést POUZE po výslovném schválení Pavla + kontrole zálohy (manuální `pg_dump`, PITR off). **Frontend Phase 2 nepublikovat na produkci PŘED aplikací migrace** — jinak non-superadmin ztratí nav. Klíče zatím jen safe (žádné citlivé).

## PHASE 2 — TARGETED STAGING PERMISSION E2E SPEC (23. 06. 2026)

Added a targeted staging-only Playwright spec: `tests/e2e/phase2-admin-permissions.spec.ts`. **No production, no Edge Function deploy, no app behavior change, no full E2E.**

- Uses existing staging CI secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`) and requires the URL to contain staging ref `dxmowysntemfqfnanxua`.
- Temporarily scopes `admin-e2e@onemil.cz` to exactly `vouchers.manage`, after first saving existing `admin_permissions` rows; `afterAll` restores the original rows (normally empty) so the grant is revoked/cleaned.
- DB helper assertions: `admin-e2e@onemil.cz` has `vouchers.manage=true` and `content.manage=false`, `banners.manage=false`, `notifications.manage=false`; `divispavel2@gmail.com` is verified as superadmin and implicit-all through `has_admin_permission()`.
- Browser assertions for scoped admin: `/admin/vouchers` renders; `/admin/content`, `/admin/banners`, `/admin/notifications` show the Czech permission fallback; sensitive/unscoped admin links such as statistics, users/admin role management, finance, winners/prize delivery, audit, invoices, affiliate finance are hidden.
- Superadmin browser smoke runs only if dedicated `E2E_SUPERADMIN_EMAIL`/`E2E_SUPERADMIN_PASSWORD` (or staging-prefixed equivalents) exist; otherwise it is skipped honestly while DB helper superadmin coverage remains.
- Existing staging workflow already supports targeted runs via `only_spec`; use `gh workflow run playwright-staging.yml -f only_spec=tests/e2e/phase2-admin-permissions.spec.ts`.

## PHASE 2 — FRONTEND GATING PRVNÍHO SAFE SLICE (23. 06. 2026)

Frontend wiring granulárních subadmin oprávnění (navazuje na DB foundation `admin_permissions`). **Žádná DB/RLS/EF změna; žádná produkce.** Klíče jen safe: `vouchers.manage`, `content.manage`, `banners.manage`, `notifications.manage`.

- **Hook `src/hooks/useAdminPermissions.ts`** (nový): čte `admin_permissions` aktuálního uživatele (RLS = vlastní řádky), vrací `{ can(key), permissions, loading, isSuperAdmin }`. **Superadmin ⇒ `can()` true pro vše** (zrcadlí DB `has_admin_permission`). Když tabulka neexistuje (např. produkce před migrací) → chyba → prázdná množina; superadmin nedotčen. Export `ADMIN_PERMISSION_KEYS`, `ADMIN_PERMISSION_LABELS`, `ADMIN_ROUTE_PERMISSION`.
- **Route gating** `src/components/admin/RequirePermission.tsx` (nový) obaluje 4 routy v `App.tsx`: `/admin/vouchers` (vouchers.manage), `/admin/content` (content.manage), `/admin/banners` (banners.manage), `/admin/notifications` (notifications.manage). Při denied fallback: **„Tato část je dostupná pouze superadminovi nebo administrátorovi s oprávněním."** (AdminLayout chrome zůstává.)
- **Nav gating (strict scoping pro non-superadmina):** `AdminContextSubNav.tsx` — `filterEntriesForSubadmin(entries, can)` ukáže non-superadminovi **jen položky s drženým oprávněním** (mapování path→klíč pro 4 safe položky); vše ostatní (citlivé i nemapované) skryto → zachovává Phase 1 sensitive-nav hiding jako podmnožinu. `AdminPrimaryNav.tsx` — non-superadmin vidí jen sekce s drženým oprávněním (Dashboard při content/banners/notifications; Vouchery při vouchers.manage). **Superadmin vidí plnou nav beze změny.**
- **Grant/revoke UI** v `src/pages/AdminAdmins.tsx` (stránka už superadmin-only): nový sloupec „Oprávnění (Phase 2)" se 4 checkboxy na admin řádek; toggle = insert/delete `admin_permissions` (RLS dovolí jen superadminovi) + `log_admin_action` (granted/revoked). Superadmin řádky = „vše (superadmin)". UI není vystaveno non-superadminovi (stránka redirectuje).
- **Phase 1 contest-sensitive gates beze změny.** Žádné finance/contest internals klíče. Build ✅, `tsc --noEmit` 0 chyb.
- **⚠️ Deployment ordering:** tento frontend NEPUBLIKOVAT na produkci, dokud není migrace `admin_permissions` aplikovaná na produkci — jinak non-superadmin admini ztratí nav (tabulka chybí → prázdné perms). Superadmin nedotčen. Produkční apply = výslovné schválení + manuální `pg_dump` (PITR off).
- **Pravidlo:** do tohoto slice nepřidávat citlivé klíče; `can()` i `has_admin_permission` musí vracet true pro superadmina; route/nav gating držet konzistentní přes `ADMIN_ROUTE_PERMISSION`/`NAV_PERMISSION_BY_PATH`.

## PHASE 2 — `admin_permissions` DB FOUNDATION NA STAGINGU (23. 06. 2026)

DB základ pro granulární subadmin oprávnění (bezpečný první slice). **Aplikováno POUZE na staging `dxmowysntemfqfnanxua`; produkce `xkzhjldrojjlrkezorey` NEDOTČENA.** Aditivní — žádná existující policy/RPC/tabulka/chování nezměněno; zatím to nic nečte (frontend wiring je další fáze).

- **Migrace:** `supabase/migrations/20260623_admin_permissions.sql`.
- **Tabulka `public.admin_permissions`** (`id, user_id → auth.users ON DELETE CASCADE, permission_key text, granted_by, created_at`, UNIQUE(user_id, permission_key), index na user_id, RLS on).
- **Helper `public.has_admin_permission(check_key text, check_user_id uuid default auth.uid())`** — SECURITY DEFINER, owner postgres, `SET search_path=public`, execute jen `authenticated` (revoke public/anon). Vrací true když `is_superadmin(check_user_id)` **NEBO** existuje řádek pro `(user_id, key)`. **Superadmin má implicitně VŠECHNA oprávnění** (žádný řádek netřeba).
- **RLS:** `admin_permissions_select` (SELECT: vlastní řádky NEBO superadmin čte vše); `admin_permissions_superadmin_write` (ALL: grant/revoke jen superadmin, USING+WITH CHECK `is_superadmin()`). Anon nemá policy ani execute.
- **Scope klíčů (zatím jen bezpečné):** `vouchers.manage`, `content.manage`, `banners.manage`, `notifications.manage`. **ŽÁDNÉ citlivé oblasti** (contest internals/tickets/revenue/payments/invoices/commissions/payouts/winners/prize delivery/audit/system/settings/admin role mgmt).
- **Staging testy ✅** (seedované řádky + dočasný role flip v transakci s rollbackem): superadmin→true pro každý klíč (i náhodný), admin bez oprávnění→false, admin s `vouchers.manage`→true jen pro ten klíč (content.manage→false), admin čte jen vlastní řádky (1, ne cizí), admin INSERT zablokován RLS (`42501`), superadmin INSERT OK, anon execute=false. Staging data/role beze změny (`rows=0`, `admin:2`).
- **Rollback:** `DROP FUNCTION IF EXISTS public.has_admin_permission(text, uuid); DROP TABLE IF EXISTS public.admin_permissions;`
- **Další fáze (frontend, samostatně):** `useAdminPermissions()` hook (`can(key)`, superadmin⇒all), route guardy + nav gating pro `/admin/vouchers|content|banners|notifications`, grant UI v `/admin/admins`. Produkční apply až po výslovném schválení + manuální `pg_dump` (PITR off). Pravidlo: `has_admin_permission` i `can()` musí vracet true pro superadmina; do tohoto slice nepřidávat citlivé klíče.

## SUBADMIN CONTEST UI GATING — FRONTEND-ONLY (23. 06. 2026)

Po Phase 1 backend locku doplněno **frontend-only** skrytí citlivých contest interních dat před non-superadminy. Žádná DB/RLS/RPC/EF změna; backend security beze změny. Gate = existující `useUserRole().isSuperAdmin`.

- **`src/components/AdminContestManagement.tsx`** — list view: pro non-superadmina se **nefetchují** `contest_progress` / `contest_revenue` / `contest_activity_last_24h` (nahrazeno `Promise.resolve({data:[],error:null})`); skryt souhrnný panel (Tikety prodány/zbývají/Prodáno %/Výnos MC/Tikety za 24h) i tabulkové sloupce **Tikety / % hotovo / Bonusové MioCoiny** (header + buňky). Subadmin vidí jen Název / Hlavní výhra / Status / Akce. Modal `ContestModal`: skryté taby **Bonusy – MioCoins, Bonusy – věcné, Ekonomika** (bonusové pozice + ekonomika/marže). Základní údaje + Grafika + Vytvořit zůstávají.
- **`src/components/TicketMapAdmin.tsx`** — non-superadmin: žádný fetch, fallback `Tato část je dostupná pouze superadminovi.` (mapa tiketů = výherní/bonusové pozice, raw tikety).
- **`src/components/AdminBonusOverview.tsx`** — non-superadmin: žádný fetch/realtime, fallback (bonusové pozice).
- **`src/components/admin/ContestControlPanel.tsx`** — non-superadmin: fallback.
- **`src/components/ContestDetailAdmin.tsx`** — guard přepnut z `isAdmin` na `isSuperAdmin` (fetch i render); subadmin (validní admin) dostane fallback místo redirectu na login.
- **NEzměněno:** `AdminContestView.tsx` (zákaznický buy-ticket view s `userWallet/onBuyTicket` — gating by rozbil public flow), žádné public user flows, žádné payments/voucher UI.
- **Pravidlo:** sensitive contest internals (progress/revenue/24h/economy/bonus+winning positions/ticket map/raw tickets) renderovat jen pro `isSuperAdmin`. Subadmin vidí jen základní contest info (název, veřejná výhra, status, základní list akce). Backend RLS/RPC tyto views/tabulky stejně drží superadmin-only (frontend gate = defense-in-depth + UX).
- **Nav odkazy skryté (23. 06. 2026, dokončeno):** `src/components/admin/AdminContextSubNav.tsx` — pro non-superadmina filtruje citlivé sub-nav položky přes `filterEntriesForSubadmin` (hledá `dashboardTab ∈ {ticketmap, bonus-overview, prizes, distribution, contest-control}` a `path = /admin/statistics`; vyprázdněné menu se zahodí). Skryto: Mapa tiketů, Přehled bonusů, Bonusové ceny, Distribuce bonusů, Contest control, Statistiky. Zůstává: Správa soutěží, Seznam soutěží + ostatní nescitlivé. Superadmin vidí plnou nav beze změny (`isSuperAdmin ? seg.entries : filterEntriesForSubadmin(...)`). Pravidlo: nevracet citlivé nav položky pro non-superadmina; nový citlivý dashboardTab přidat do `SENSITIVE_DASHBOARD_TABS`. `npm run build` ✅, `tsc --noEmit` 0 chyb. Žádná DB změna nutná.

## PHASE 1 POST-PRODUCTION SMOKE FIX -- contest_progress PUBLIC AGGREGATE (23. 06. 2026)

After Phase 1 production lock, `/games` loaded but browser console showed `permission denied for table tickets` while fetching contest progress. Root cause: public frontend reads `public.contest_progress`; production had `security_invoker=true`, so anon/authenticated callers needed raw `tickets` access. Phase 1 correctly locked raw `tickets`, so the public aggregate broke.

Production fix applied on `xkzhjldrojjlrkezorey`:
- SQL applied exactly: `ALTER VIEW public.contest_progress RESET (security_invoker);`
- This restores the already owner-accepted E22 behavior: `contest_progress` is a public aggregate only (`contest_id`, `tickets_sold`, `tickets_total`, remaining/percent), not raw ticket access.
- No tickets RLS was weakened; no raw public `tickets` access was granted.
- No frontend changes, no Edge Function deploy, no `db push`.

Verification:
- `anon` can select `contest_id, tickets_sold, tickets_total` from `public.contest_progress`.
- `anon` still gets `permission denied for table tickets` on raw `public.tickets`.
- Authenticated normal user with own tickets sees own rows only and `0` other-user ticket rows.
- Superadmin still has `public.is_superadmin() = true` and can read admin-locked `tickets` / `payments`.
- Browser check on `https://onemil.cz/games` found no `contest_progress`, `tickets`, `42501`, or `permission denied` console warning. Remaining observed console noise was unrelated auth refresh-token state in the test browser.

## PHASE 1 — SENSITIVE-ADMIN PRODUCTION LOCK APPLIED (22. 06. 2026)

Phase 1 sensitive-admin production DB/RLS/RPC lock was applied successfully to production project `xkzhjldrojjlrkezorey` after Pavel's explicit approval: `SCHVALUJI PRODUKČNÍ APPLY`.

Pre-apply safety:
- Manual production backup exists at `backups/onemil-production-pre-phase1-20260622-220723.dump` (`465,594,754` bytes / `444.03 MB`); `pg_restore -l` passed with `2195` TOC entries. **Do not commit `backups/`.**
- Rollback remained ready in `docs/rollback/phase1_production_rollback.sql`; baseline remains `docs/rollback/phase1_baseline.sql`.

Applied production DB/RLS/RPC result:
- `public.is_superadmin(check_user_id uuid default auth.uid())` exists, `SECURITY DEFINER`, owner `postgres`; `anon` execute revoked, `authenticated` execute granted.
- `divispavel2@gmail.com` returns `true` from `public.is_superadmin(...)`.
- Sensitive RLS policy fail count: `0`.
- Target RPC fail count: `0`.
- Affiliate own commission SELECT preserved.
- Payments/tickets own-row policies preserved.
- Partner own invoice policies preserved.
- `winners` / `bonus_prizes` public-read behavior preserved.
- Edge Functions were **not deployed**; they remain verification-only and were already superadmin-gated in production on JWT/user paths.
- Rollback was not needed.

Follow-up:
- Pavel reset the production DB password again because one password appeared in chat during the manual backup step.
- Stale tracked local `.cursor/mcp.json` direct production DB credential was removed after the reset; the app/runtime is unaffected because it does not use the direct DB password.
- `backups/` is gitignored and must remain uncommitted.

## PHASE 1 — SENSITIVE-ADMIN STAGING LOCK FINAL MILESTONE (22. 06. 2026)

Full Phase 1 sensitive-admin lock is complete on staging project `dxmowysntemfqfnanxua`. Staging now blocks scoped admin/subadmin access to sensitive admin data across RLS, RPCs, and Edge Functions. **Production project `xkzhjldrojjlrkezorey` was not touched.**

Covered areas:
- `payments`
- `influencer_commissions`
- affiliate finance RLS/RPC/Edge Functions
- partner invoice Edge Functions
- partner invoices and exports
- `contest_economy`
- tickets admin read / contest revenue dependencies
- contest admin RPCs
- winners write/status history
- prize delivery RPCs
- `referral_rewards`
- `settings`
- `event_logs`

Partner invoice Edge Functions changed on staging: `generate-partner-invoice-pdf` and `send-partner-invoice-email`. JWT path now requires `role='superadmin'`; internal token / service-role automation paths intentionally remain unchanged.

Tests passed: superadmin allowed; admin/subadmin blocked; normal user blocked; anon blocked; affiliate own commission visibility preserved; staging data and roles unchanged after cleanup.

Operational note: the old worktree previously had Supabase CLI linked to production, so any future staging deploy must explicitly pass `--project-ref dxmowysntemfqfnanxua` or use the clean main worktree after verifying the target. Remaining production-only item: `get_admin_top_bar_stats` exists on production and must be handled during production rollout. Public-read `winners` / `bonus_prizes` behavior is a separate product/design decision, not part of this staging lock.

Production rollout requires explicit Pavel approval, manual `pg_dump` first because PITR is off, rollback from `docs/rollback/phase1_baseline.sql`, and staged rollout with stop points.

This record is documentation only. No SQL was run, no Edge Functions were deployed, no production changes were made, and no app behavior was changed.

## PHASE 1 — AFFILIATE FINANCE LOCK KOMPLETNÍ NA STAGINGU (22. 06. 2026)

Celá affiliate finance oblast je na stagingu `dxmowysntemfqfnanxua` uzamčena na **superadmin-only** ve všech třech vrstvách. **Produkce `xkzhjldrojjlrkezorey` NEDOTČENA.**

- **RLS gates (`public.is_superadmin()`):** `affiliate_payout_documents`/`apd_admin_all`, `affiliate_payout_batch_items`/`apbi_admin_all`, `affiliate_payout_batches`/`apb_admin_all`, `affiliate_commissions`/`aff_commissions_admin_write`, `affiliate_commissions`/`aff_commissions_select` (**affiliate-own SELECT branch zachován** — affiliate vidí vlastní provize).
- **RPC gates (`public.is_superadmin()`, interní gate, owner postgres, SECURITY DEFINER):** `admin_set_affiliate_commission_status`, `create_affiliate_payout_batch`, `mark_affiliate_payout_batch_paid`, `update_affiliate_payout_batch_meta`. (Tyto RPC obcházejí RLS — proto musely být gatovány zvlášť.)
- **Edge Functions (superadmin-only, `role = 'superadmin'`, chyba `access_denied_superadmin_only`):** `create-affiliate-payout-document` **v10**, `generate-affiliate-bank-export` **v11**. `generate-affiliate-bank-export` přenasazena z přesného commitnutého zdroje (staging = GitHub).
- **Testy ✅** (seedované řádky / throwaway superadmin + dočasný role flip v transakci s rollbackem; EF přes throwaway user JWT, smazán): superadmin povolen, admin/subadmin blokován, normální uživatel blokován, anon blokován, affiliate vidí vlastní provize, admin přímý write blokován (`42501`), EF admin→403, anon→401, superadmin→safe not_found bez mutace. Staging data/role beze změny (`admin:2`).
- **Rollback zdroje:** `docs/rollback/phase1_baseline.sql` (RLS policy + RPC definice z živé produkce); git historie / předchozí EF verze pro Edge Functions.
- **Produkční rollout = samostatný krok s výslovným schválením Pavla + manuální `pg_dump` PŘED zápisem (PITR off).** Pravidlo: affiliate finance gates nevracet na `is_admin()`; `aff_commissions_select` nesmí ztratit affiliate-own branch; EF nevracet na `role IN ('admin','superadmin')`.

## PHASE 1 — AFFILIATE_PAYOUT_BATCH_ITEMS SUPERADMIN-ONLY NA STAGINGU (22. 06. 2026)

Druhý objekt affiliate finance oblasti uzamčen (staging only).
- **Staging `dxmowysntemfqfnanxua`:** policy `apbi_admin_all` na `public.affiliate_payout_batch_items` změněna z `is_admin()` na `public.is_superadmin()` (ALL, USING+WITH CHECK). Jediná policy tabulky; žádná jiná tabulka/RPC/EF/frontend. **Produkce `xkzhjldrojjlrkezorey` NEDOTČENA.**
- **Test ✅** (využit existující reálný řádek, dočasný role flip v transakci s rollbackem): superadmin→čte (1), admin/subadmin→0, normální uživatel→0, anon→0; admin přímý INSERT zablokován RLS WITH CHECK (`42501`, s reálnými FK id). Existující řádek beze změny (`total_rows=1`), role beze změny (`admin:2`); opravená policy **záměrně ponechána**.
- **Rollback SQL:** `DROP POLICY IF EXISTS apbi_admin_all ON public.affiliate_payout_batch_items; CREATE POLICY apbi_admin_all ON public.affiliate_payout_batch_items AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());`
- **Další objekt:** `affiliate_payout_batches` / `apb_admin_all`. Pak `affiliate_commissions` (2 policy, zachovat affiliate-own SELECT), nakonec 4 RPC gates (write teeth — SECURITY DEFINER obchází RLS). Produkční rollout: schválení Pavla + manuální `pg_dump` (PITR off).

## PHASE 1 — AFFILIATE_PAYOUT_DOCUMENTS SUPERADMIN-ONLY NA STAGINGU (22. 06. 2026)

První objekt affiliate finance oblasti uzamčen na superadmina (staging only).
- **Staging `dxmowysntemfqfnanxua`:** policy `apd_admin_all` na `public.affiliate_payout_documents` změněna z `is_admin()` (ALL, USING+WITH CHECK) na `public.is_superadmin()` (ALL, USING+WITH CHECK). **Změněna JEN tato jedna policy** (tabulka má jedinou policy); žádná jiná tabulka/RPC/EF/frontend. **Produkce `xkzhjldrojjlrkezorey` NEDOTČENA** (stále `is_admin()`).
- **Test (seedovaný throwaway doc — FK přeskočeno `session_replication_role=replica` jen pro seed — + dočasný role flip v transakci s rollbackem):** superadmin→čte (1), admin/subadmin→0, normální uživatel→0, anon→0; **admin přímý INSERT zablokován RLS WITH CHECK (`42501`)** (testováno s reálnými FK id, aby blokoval jen RLS). Staging data/role beze změny (`total_docs=0`, `admin:2`); opravená policy **záměrně ponechána**.
- **Rollback SQL (staging):** `DROP POLICY IF EXISTS apd_admin_all ON public.affiliate_payout_documents; CREATE POLICY apd_admin_all ON public.affiliate_payout_documents AS PERMISSIVE FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());`
- **Pozn.:** legitimní vytváření dokladů jde přes EF `create-affiliate-payout-document` (service-role, obchází RLS) → neovlivněno. Přímé admin čtení (`AdminAffiliatePayoutDetail.tsx`) je nyní superadmin-only.
- **Další affiliate finance objekt:** `affiliate_payout_batch_items` / `apbi_admin_all` (taky jediná `ALL is_admin()` policy). Pak `affiliate_payout_batches`, pak `affiliate_commissions` (2 policy, zachovat affiliate-own SELECT branch), nakonec 4 RPC gates (write teeth — SECURITY DEFINER obchází RLS).
- **Produkční rollout:** výslovné schválení Pavla + manuální `pg_dump` PŘED zápisem (PITR off); per-objekt staging-first + rollback z `docs/rollback/phase1_baseline.sql`.

## PHASE 1 — INFLUENCER_COMMISSIONS EXPOSURE FIX NA STAGINGU (22. 06. 2026)

Oprava nadměrné expozice `public.influencer_commissions` (citlivá finanční data) na stagingu.
- **Původní staging policy:** `influencer_commissions_read` `SELECT TO public USING (true)` → **anon i kdokoli přihlášený mohl číst všechny řádky provizí.**
- **Opravená staging policy:** `SELECT TO authenticated USING (public.is_superadmin())`. Byla to jediná policy tabulky; **žádná jiná tabulka/RPC/EF/frontend nezměněna.** **Produkce `xkzhjldrojjlrkezorey` NEDOTČENA** (stále `TO public USING (true)`).
- **Test (seedovaná provize + dočasný role flip v transakci s rollbackem):** superadmin→čte (1), admin/subadmin→0, normální uživatel→0, anon→0. Staging data/role beze změny (`total_rows=0`, `admin:2`); opravená policy **záměrně ponechána** ve stavu `is_superadmin()`.
- **Rollback SQL (staging):** `DROP POLICY IF EXISTS influencer_commissions_read ON public.influencer_commissions; CREATE POLICY influencer_commissions_read ON public.influencer_commissions AS PERMISSIVE FOR SELECT TO public USING (true);`
- **Risk note:** pokud mají influenceři někdy vidět **vlastní** provize, je nutné navrhnout samostatnou own-row policy (`influencer_partner_id` = volající) — teď takový konzument neexistuje, scope je superadmin-only.
- **Produkční rollout:** výslovné schválení Pavla + manuální `pg_dump` PŘED zápisem (PITR off); per-objekt staging-first + rollback z `docs/rollback/phase1_baseline.sql`.

## PHASE 1 — PAYMENTS SUPERADMIN-ONLY GATE OVĚŘEN NA STAGINGU (22. 06. 2026)

První reálný superadmin-only gate (pilot vzoru) na sensitive oblasti — `payments` read.
- **Staging `dxmowysntemfqfnanxua`:** policy `admin_payments_read_all` na `public.payments` změněna z `has_role(admin) OR has_role(superadmin)` na `public.is_superadmin()`. **Změněna JEN tato jedna policy**; own-payment policy (`payments_select_own`, `payments_user_read`) beze změny. **Produkce `xkzhjldrojjlrkezorey` NEDOTČENA.**
- **Test (seedovaná pending platba cizího vlastníka + dočasný role flip v transakci s rollbackem):** superadmin čte všechny platby (1); admin/subadmin necte cizí platby (0); normální uživatel necte cizí (0); anon necte (0). Staging data i role ponechány beze změny (`total_payments=0`, `admin:2`).
- **Rollback SQL (staging):** `DROP POLICY IF EXISTS admin_payments_read_all ON public.payments; CREATE POLICY admin_payments_read_all ON public.payments AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'superadmin'::app_role)));`
- **Frontend dopad (očekávaný, ne bug):** `AdminPayments.tsx` `.from('payments')` — subadmin po gate uvidí prázdný seznam (jen vlastní řádky), ne chybu; superadmin vidí vše.
- **Validuje vzor pro další Phase 1 gating.** Pravidlo: produkční krok vyžaduje výslovné schválení Pavla + manuální `pg_dump` PŘED zápisem (PITR je off); per-objekt staging-first + rollback SQL z `docs/rollback/phase1_baseline.sql`. (Staging `payments` policy ponechána ve stavu `is_superadmin()`.)

## PHASE 1 — `is_superadmin()` HELPER NA STAGINGU (22. 06. 2026)

První reálná Phase 1 změna: gate helper `public.is_superadmin(check_user_id uuid default auth.uid())`. Vrací true jen když má uživatel `role='superadmin'` v `user_roles`. SECURITY DEFINER, owner postgres, `SET search_path=public`, execute jen `authenticated` (revoke public/anon). **Aditivní — žádná RLS/RPC/EF/frontend změna.**
- **Migrace:** `supabase/migrations/20260622_is_superadmin_helper.sql`. Commit `059dd981`.
- **Aplikováno POUZE na staging** `dxmowysntemfqfnanxua`. **Produkce `xkzhjldrojjlrkezorey` NEDOTČENA.**
- **Staging testy prošly:** superadmin→true, admin/subadmin→false, neznámý uživatel→false, anon/bez auth→false, authenticated může execute, anon nemůže, SECURITY DEFINER owner postgres potvrzeno. (Staging nemá superadmina → true case ověřen přes dočasný transaction-rollback flip, bez rezidua.)
- **Rollback:** `DROP FUNCTION IF EXISTS public.is_superadmin(uuid);`
- **Pravidlo / další krok (rozhodnout samostatně):** aplikaci helperu na produkci provést PŘED jakýmkoli superadmin-only gatingem; každý další re-gating staging-first + rollback SQL z `docs/rollback/phase1_baseline.sql`. Helper sám nic neomezuje, dokud se nepoužije v policy/RPC.

## PHASE 1 (SUBADMIN PERMISSIONS) — BACKUP STAV POTVRZEN (22. 06. 2026, jen dokumentace)

Před plánovaným superadmin-only re-gatingem (Phase 1) ověřen produkční backup stav `xkzhjldrojjlrkezorey` v Dashboard → Database → Backups.
- **Plánované denní DB zálohy existují.** Poslední viditelná: **22. 06. 2026 02:16:36 UTC**. Starší denní zálohy: 21., 20., 19., 18., 17., 16., 15. 06. 2026 (rolling ~7 dní).
- **PITR (point-in-time recovery) NENÍ zapnuté** — dashboard ho ukazuje jako Pro Plan add-on. Obnova jen na denní body, ne na libovolný čas.
- **Storage objekty NEJSOU součástí DB záloh** (buckety/soubory zálohovat zvlášť).
- **Rollback baseline:** `docs/rollback/phase1_baseline.sql` (živý zachycený stav RLS policy + RPC z produkce, 22. 06. 2026) je autoritativní reverzní zdroj — migrační soubory v gitu NEodpovídají plně živému stavu (drift). Checklist: `docs/rollback/phase1_backup_checklist.md`.
- **Pravidlo pro Phase 1:** postupovat jen po malých staged migracích, každá s rollback SQL odvozeným z `phase1_baseline.sql`; před zápisem doporučen manuální `pg_dump` (PITR je off). Žádné SQL/RLS/EF/frontend/produkční chování nezměněno.

## INVITE-SUBADMIN AUDIT FIX — CALLER ID V `audit_logs` (22. 06. 2026)

Opraveno auditní logování pozvánek subadminů.
- **Root cause:** `invite-subadmin` volal RPC `log_admin_action`, který zapisuje `audit_logs.user_id = auth.uid()`. EF běží pod **service-role** klientem → `auth.uid()` je NULL → `subadmin_invited` řádky měly `user_id = null` a nešlo zjistit, který superadmin pozvánku poslal.
- **Nové chování:** `invite-subadmin` zapisuje **přímo do `public.audit_logs`** s `user_id = caller.id` (ověřený volající z JWT, krok 1 funkce). Metadata obsahují `entity_type='user'`, `entity_id` (= pozvaný), `target_user_id`, `invited_email` a `new_data.role='admin'`. Best-effort (try/catch, nikdy neblokuje pozvánku).
- **Historické `subadmin_invited` řádky s `user_id=null` NEBYLY backfillnuté** — původního volajícího z nich nelze rekonstruovat. Nové pozvánky už superadmina zaznamenávají správně.
- **Produkce:** `invite-subadmin` přenasazena jako **v3** (`xkzhjldrojjlrkezorey`); staging v2.
- **Beze změny:** role logika (role hardcoded `admin`, nikdy superadmin), email sending, generateLink, samotný RPC `log_admin_action`, RLS, DB schéma, auth, payments, contests, vouchers, wallets, tickets, partners, Sofinity. Pravidlo: `invite-subadmin` audit zápis nevracet zpět na `log_admin_action` (ztratil by caller id pod service-role).

## SUBADMIN MANAGEMENT — `/admin/admins` LIVE (22. 06. 2026)

Superadmin-only správa adminů je hotová a v provozu.

- **`/admin/admins`** je živá stránka, přístupná **pouze pro `isSuperAdmin`** (jinak redirect na `/admin`). Nav odkaz „Správa adminů" je v sekci **Uživatelé** a vidí ho jen superadmin. Jediný superadmin = **divispavel2@gmail.com**.
- **Povýšení existujícího uživatele** na admina (subadmina) přes přímý `user_roles` insert/update (RLS už zápis omezuje na superadmina). **Odebrání** admin práv vrací roli na `user`. Superadmin řádky jsou jen pro zobrazení — nelze je zde měnit. Subadmin dostane **vždy roli `admin`, nikdy `superadmin`**.
- **Pozvání nového subadmina e-mailem:** Edge Function **`invite-subadmin`** je **nasazená na produkci** (`xkzhjldrojjlrkezorey`, v2, `verify_jwt=false`, auth interně). Guard: caller JWT → `auth.getUser` → musí být `superadmin` (401/403 jinak). `createUser` bez hesla → role `admin` → `generateLink('recovery', redirectTo=${SITE_URL}/reset-password)` → e-mail přes `email_queue`. Odkaz/heslo se nikdy nevrací ani neloguje. Odmítá měnit existujícího superadmina (409). Pravidlo: **neměnit role logiku — role je hardcoded `admin`.**
- **Pozvaný subadmin** dostane e-mail, klikne na jednorázový recovery odkaz, nastaví si heslo na **`/reset-password`** (sdílený generický recovery flow; min. 8 znaků) a přihlásí se přes `/login`. `ResetPassword.tsx` detekuje expirovaný/použitý odkaz (URL error params) a loguje přesnou Supabase chybu.
- **Status overview na stránce:** RPC **`get_admin_subadmins_overview()`** (SECURITY DEFINER, owner postgres, `SET search_path=public`, interní admin gate, execute jen `authenticated`) vrací bezpečnou projekci z `user_roles + auth.users + profiles + public.users + email_queue`. Stránka zobrazuje: „Pozvánka odeslána/čeká/selhala" (z `email_queue`, **NE** z `auth.invited_at` — invite jde přes `createUser`), „Účet aktivní/Čeká na aktivaci" (z `last_sign_in_at`), „Online teď" (reuse `get_admin_online_users(300)`, poll 30 s) a „Naposledy online" (`public.users.last_seen_at`).
  - **Migrace `supabase/migrations/20260622_admin_subadmins_overview.sql` aplikována na staging i PRODUKCI.** Produkce `xkzhjldrojjlrkezorey` ověřena (22. 06. 2026): `public.get_admin_subadmins_overview` existuje, SECURITY DEFINER, owner postgres, execute jen `authenticated`, `anon` blokován. Status badge UI na produkci ožije po Lovable Publish frontendu.
- **Žádná změna RLS/schématu/auth nastavení**; nedotčeno: payments, contests, vouchers, wallets, tickets, partners, Sofinity. Build prošel. Pravidla: `invite-subadmin` nevracet anon/admin (jen superadmin); `get_admin_subadmins_overview` nevracet citlivá pole (tokeny/hesla/metadata/recovery link/email body); `/admin/admins` nepřepínat z `isSuperAdmin` gate.

## PWA FOOTER INSTALL CTA — VISUAL POLISH (16. 06. 2026)

`src/components/InstallAppButton.tsx` is now the active footer install UI surface near footer social icons: compact install pill, main label `Stáhnout aplikaci`, platform label `iPhone`/`Android`, lucide Apple/Chrome icons. Keep behavior unchanged: iOS opens the existing Czech Safari instruction modal, Android/Chrome uses the saved `beforeinstallprompt`, installed/standalone hides UI, desktop stays hidden unless a real install prompt exists. Build `npm run build` passed.

Do not change PWA hook behavior, `public/manifest.webmanifest`, public icons, `public/OneSignalSDKWorker.js`, Supabase, Stripe, payments, routes, or unrelated UI for this polish.

## NON-STRIPE CLEANUP — L02a/L06/CI05 ROZHODNUTO (16. 06. 2026, Pavel)

Rozhodnutí Pavla (detaily v `OWNER_LEGAL_DECISION_SHEET.md`):
- **L02a** `/pravidla-souteze` → **owner-accepted pro testovací fázi** (jako L01/L03/L04); cleanup placeholderů odložen před live.
- **L06** reklamace/support → **technická support cesta dostatečná pro testovací fázi** (owner-accepted); finální wording/reklamační text odložen před live s právníkem.
- **CI05** → **`onemil_spec.md` NEvytvářet**; source-of-truth = onemil_state.md, onemil_history.md, CLAUDE.md, .cursor/SYSTEM_MAP.md, PROJECT_CONTEXT.md + launch docs.

**CI04 PROVEDENO 16.06. (schválení Pavla, commit `35b787cc`):** smazány `src/pages/TestLogin.tsx` + `src/pages/InfluencerDashboard.tsx` + nepoužitý import v `App.tsx`. Build ✅, žádné zbývající reference, funkční routy nedotčeny. Pravidlo: tyto soubory neobnovovat (byly mrtvý kód bez Route/importu).

Zbývá:
- **L02b** per-contest rules PDF: 0 aktivních z 127 → trvalý pre-aktivační procesní checklist (neblokuje).
Žádné SQL/CMS/Stripe/deploy (CI04 = jen smazání mrtvého kódu + build).

## AF05 ROZHODNUTO — AFFILIATE ODLOŽEN MIMO 1. VEŘEJNÝ TEST (16. 06. 2026, Pavel)

**Pavel rozhodl: VARIANTA B — Affiliate program NENÍ součástí prvního veřejného testu.** Affiliate NENÍ blocker; zůstává live v kódu, aktivně se neonboarduje. Jádro 1. testu = zákazník → MioCoiny → soutěže/vouchery → později Stripe. Payouty + Air Bank `.kpc` export až ve fázi zapnutí affiliate. **Veřejné odkazy `/influencer`, `/influencer/register`, `/affiliate/login` (patička) se NEMAŽOU — skrytí je volitelný follow-up se samostatným schválením (kódová změna).** Detail + audit footprintu: `docs/launch-readiness/AF05_AFFILIATE_SCOPE_DECISION.md`. Pravidlo: neměnit affiliate kód/routy kvůli tomuto rozhodnutí; affiliate zůstává funkční pro pozdější zapnutí. Žádný kód/SQL/CMS/Stripe/deploy.

## OWNER/LEGAL DECISION SHEET VYTVOŘEN (16. 06. 2026, jen dokumentace)

Konsolidovaný seznam zbývajících non-Stripe owner/legal rozhodnutí: `docs/launch-readiness/OWNER_LEGAL_DECISION_SHEET.md`. Pokrývá L01/L03/L04 (legal review VOP/GDPR/cookies), A13 (CMS obsah), L02a (placeholdery obecných pravidel), L02b (per-contest rules PDF QA), L06 (reklamační wording), AF05 (affiliate scope), CI04 (mazání mrtvého kódu), CI05 (`onemil_spec.md` ano/ne). Každá položka: stav teď + proč rozhodnutí + doporučení + `[ ] schváleno / [ ] odložit`. Sekce na konci „blocked-by-Stripe" (PAY01–PAY04, C23 wallet credit, plný partner invoice flow) — NEřeší se v listu. Žádný kód/SQL/CMS/Stripe/deploy. Pravidlo: doporučení v listu needitovat jako rozhodnutí — rozhoduje Pavel/právník.

## NON-STRIPE LAUNCH AUDIT — P06/P13/L02/L06/AF04/AF05/CI04/CI05 (16. 06. 2026, read-only)

Audit zbývajících non-Stripe bloků po P04 staging fixu. Pouze read-only DB dotazy + code audit; žádný produkční zápis, žádná CMS změna, žádný Stripe, žádný deploy, žádný nový test (Full E2E čerstvě zelený `27597509314`).

**Ověřeno / lze uzavřít:**
- **P06 → prošlo:** produkční `settings.partner_api_documentation` (6421 znaků) = order-event guide s REÁLNÝM endpointem (`has_real_url=true`, `has_placeholder=false`). Live doc NENÍ stale. Jediný `<onemil-api>` placeholder je v interním repo dokumentu `docs/partner-api/PARTNER_API_GUIDE.md` (handoff, ne live) — kosmetické.
- **P13 → ověřeno strukturálně:** produkční cron job 17 `weekly_partner_invoices` aktivní `0 2 * * 0` → `create_partner_invoices_for_last_week()`; funkce `_for_period(date,date)` + OBA `enqueue_partner_invoice_email` overloady (uuid; partner+period) existují. Řetězec kompletní; plný draft z reálných aktivovaných coinů vyžaduje reálnou partner paid aktivitu.
- **AF04 → ověřeno staging + live prod:** specy 40/41/42 zelené (run `27372767070`), backend+EF LIVE (rollout 12.06.). Standardní Full E2E je SKIPuje (payout secrets).
- **L06 → tech cesta ověřena:** `/kontakt` `mailto:podpora@onemil.cz` + `/messages` Bob/admin handoff; žádné `/support/*` routy nepotřeba.
- **CI04 → potvrzeno mrtvé:** `InfluencerDashboard` importován (`App.tsx:76`) bez Route; `TestLogin.tsx` nikde neimportován.

**Owner decision (NEdělat bez Pavla):**
- **AF05** — je affiliate součástí 1. veřejného testu? (scope, ne tech blocker)
- **L02a** — úklid placeholderů obecné CMS stránky `/pravidla-souteze` (CMS obsah). **L02b** — per-contest rules PDF QA před spuštěním každé soutěže (0 aktivních = teď neblokuje).
- **L06 wording** — reklamační řád / přesný reklamační text (obsah/legal).
- **CI04 mazání** — smazání `InfluencerDashboard`/`TestLogin` souborů vyžaduje schválení (mazání souborů).
- **CI05** — vytvořit `onemil_spec.md`, nebo potvrdit, že `onemil_state.md`+`CLAUDE.md`+SYSTEM_MAP stačí.

**Blocked-by-Stripe (beze změny):** PAY01–PAY03; P13 plný běh z reálných aktivací nepřímo závisí na reálné partner paid aktivitě.

## P04 FIX — PARTNERS UPDATE RLS — PRODUKČNÍ ROLLOUT PROVEDEN (16. 06. 2026, schválení Pavla)

**✅ PRODUKCE `xkzhjldrojjlrkezorey`:** migrace `20260616_partners_update_rls_partner_own.sql` aplikována 16.06. (výslovné schválení Pavla). Precheck: jen `Public read partners` SELECT (bez UPDATE). Postcheck: 3 policy (`Public read partners` SELECT + `partners_update_own` `auth_user_id=auth.uid()` + `partners_update_admin` `is_admin()`). Data NEZMĚNĚNA — 11 partnerů, reward checksum identický `d57e638f9d48f302ad5b562fc2cd90e9` před i po. Žádný Stripe, žádná reálná platba, žádná CMS, žádný frontend deploy.

**⏳ Frontend `.select()` affected-rows check (`PartnerDashboard.tsx`) se na produkci projeví až po samostatném Lovable Publish** — samotná RLS oprava už ale umožní zápis (partner save funguje i se stávajícím live frontendem). **Lovable Publish Code neumí provést automaticky (žádný CLI/API/token) — musí ho ručně provést Pavel v Lovable UI.**

**Poslední P04 staging recheck (16.06.):** cílený staging run `27599115269` (spec 56) = **3 passed · 0 failed · 0 skipped**. 56b potvrdil P04 end-to-end (partner uloží konverzi → DB `reward_base_czk=100, reward_mc=1`, mění jen vlastní řádek). Stripe neřešen.

**P04 = TECHNICKY OVĚŘENO PRO TESTOVACÍ FÁZI (16.06., rozhodnutí Pavla) — už NENÍ aktivní non-Stripe blocker.** Evidence: ✅ staging E2E spec 56 run `27599115269` (56b DB verify); ✅ produkční RLS 3 policy (`Public read partners`/`partners_update_own`/`partners_update_admin`); ✅ live bundle `index-C9tBfrJx.js` obsahuje frontend affected-rows ochranu; ✅ produkční data nezměněna (checksum `d57e638f...`). Plný produkční UI smoke (login partnera → změna → save → DB verify) = VOLITELNÝ follow-up, čeká na bezpečný test partner login (nedělat produkční write pro vytvoření partnera bez schválení).

Partner save konverzního nastavení MioCoinů ověřen **na stagingu** `dxmowysntemfqfnanxua` (schválení Pavla pro staging) a nyní aplikován i na produkci.

- **Migrace** `supabase/migrations/20260616_partners_update_rls_partner_own.sql` (aplikováno jen staging): policy `partners_update_own` (authenticated, `auth_user_id = auth.uid()` USING+WITH CHECK) + `partners_update_admin` (`is_admin()`). `Public read partners` SELECT nedotčen. Postcheck: 3 policy (1 SELECT + 2 UPDATE).
- **App** `src/pages/PartnerDashboard.tsx`: save používá `.select('id')` a ověřuje `updatedRows.length === 1`; 0 řádků → `throw` → česká `toast.error('Nepodařilo se uložit nastavení')` + rollback. **Žádný falešný success.** (Defense-in-depth; samotná RLS oprava už umožní zápis.)
- **Spec 56b** odebrán `test.fixme` → reálně prošlo. Cílený run `27597435909`: **3 passed** (56a+56b+56c). Staging Full E2E `27597509314`: **153 passed · 0 failed · 28 skipped**.
- **Pravidlo:** `partners` UPDATE policy je partner-own (`auth_user_id`) — nevracet `USING(true)`/deny-all; PartnerDashboard save NEvracet zpět na `.update()` bez affected-rows checku.
- **DOPORUČENÍ PRO PRODUKCI (neaplikováno):** stejnou migraci aplikovat na produkci `xkzhjldrojjlrkezorey` po výslovném schválení Pavla — partner si jinak ani v produkci neuloží konverzní nastavení.

## SPEC 56 — P01 ČÁSTEČNĚ / P04 FAILING (RLS) / P05 PROŠLO — OPRAVA KLAMAVÉHO STAVU (15. 06. 2026)

**⚠️ Commit `7d90f1cd` označil P01/P04/P05 jako `prošlo` PŘEDČASNĚ a NEPOTVRZENĚ.** Citoval run `27571406245` jako „3/3 passed" — ten run ve SKUTEČNOSTI selhal 6/6 (56a/56b/56c × 2 pokusy). Full E2E `27571700378` i cílený `27573182299` rovněž selhaly. Stav vrácen na reálný (commit `384e8020` fix-pokus problém NEvyřešil — šlo o hlubší příčiny). Žádná reálná platba, žádná produkční data, žádný produkční SQL, žádná CMS změna, žádný deploy.

**Diagnóza (run 27573182299 artefakty + přímá reprodukce proti stagingu):**
- **56a (P01) — env limitace, NE app/RLS/test bug.** `/partner/register` form UI + povinná pole + client validace OVĚŘENY. Plný `auth.signUp` submit (→ „Registrace odeslána") NELZE na stagingu: přímá reprodukce `POST /auth/v1/signup` → `429 over_email_send_rate_limit` (staging má email-confirmation, vestavěný email limit vyčerpán). V `auth.users` 0× `spec56-reg-*` (signUp nic nevytvořil), zatímco `spec56-partner-*` přes service-role `createUser` OK. **Stejný důvod jako trvale skipnutý spec 01.** → 56a rescoped jen na UI+validaci.
- **56b (P04) — REÁLNÁ RLS CHYBA (zastaveno, neopraveno).** Toast „Nastavení odměn bylo uloženo" se zobrazí, ale DB zůstane `reward_base_czk=0/reward_mc=0`. Příčina: `public.partners` má jedinou policy `Public read partners` (SELECT) a **ŽÁDNOU UPDATE policy** — ověřeno na stagingu `dxmowysntemfqfnanxua` I produkci `xkzhjldrojjlrkezorey`. Partner UPDATE vlastního řádku → 0 řádků + null error; `PartnerDashboard.tsx:857` `.update()` bez `.select()` nekontroluje affected rows → falešný success. → 56b převeden na `test.fixme` s blocker anotací. **Vyžaduje schválení Pavla.**
- **56c (P05) — prošlo.** Sekce „API klíče" + tlačítko „Regenerovat API klíč" viditelné schválenému partnerovi.

**Pravidla spec 56 (neměnit):**
- `addInitScript` pro pre-seed `localStorage.cookie_consent` MUSÍ být v každém testu i v `loginAsPartner` — CookieConsentBanner (fixed bottom-0 z-[100]) jinak blokuje pointer events.
- 56a NEvracet zpět na assertion „Registrace odeslána" — staging email rate-limit to neumožní.
- 56b NEvracet z `test.fixme` na pass-make bez reálné opravy RLS + app (schválení Pavla).

**LAUNCH_TODO oprava (15. 06. 2026):** P01 → „částečně / form+validace ověřeno"; P04 → „FAILING — RLS blocker"; P05 → „prošlo". Ostatní batch (P02/P03/P07-P11/P14/AF01-AF03/SEC02/CI01) z `7d90f1cd` ponechány (mají vlastní zelené runy z `27569039738`).

## C19/C23/A13 OVĚŘENY — SPEC 54 + 55 (15. 06. 2026)

Staging Full E2E run `27569039738`: **150 passed · 0 failed**. Commity `57b877a2`, `8a68c812`. Žádná reálná platba, žádná produkční data, žádný produkční SQL, žádná CMS změna, žádný deploy.

**Nově přidané specy:**
- `tests/e2e/54-mobile-layout-customer-pages.spec.ts` — C19. 6 zákaznických stránek (`/`, `/games`, `/wins`, `/vouchers`, `/profile`, `/messages`) na iPhone SE viewportu 375×812px. 3 podmínky na stránku: žádné uncaught JS chyby, bottom nav (`role=navigation name="Hlavní menu"`) viditelná, horizontální overflow ≤ 375px. 6/6 passed (targeted run `27567440891`).
- `tests/e2e/55-invite-referral-c23.spec.ts` — C23. 55a ReferralSection viditelná (nadpis „Pozvi přátele"). 55b vlastní referral kód v `<code>` elementu (ensure_referral_code RPC). 55c RLS izolace (zákazník2 nevidí cizí referral_codes). 55d anon deny. 4/4 passed (targeted run `27567627210`).

**Pravidla spec 54 (neměnit):**
- Viewport 375×812 (iPhone SE) — `test.use({ viewport: MOBILE })` platí pro celý describe blok.
- Bottom nav hledej přes `getByRole('navigation', { name: 'Hlavní menu' })` — přesný accessible name; `aria-label` je v `BottomNavBar.tsx`.
- Horizontální overflow měříme přes `page.evaluate(() => document.documentElement.scrollWidth)` ≤ `MOBILE.width`.
- `waitForLoadState('networkidle')` je wrapped do `.catch(() => {})` — stránky mají polling, timeout není chyba.

**Pravidla spec 55 (neměnit):**
- Referral kód se renderuje v `<code>` elementu (ReferralSection.tsx:368), NIKOLI v `input[readonly]`. Selector: `page.locator('code').first()`.
- Label text je `'Váš doporučovací kód'` (přesný string z ReferralSection.tsx:366).
- Wallet credit za doporučení (invite reward) je **BLOCKED-BY-PAY01–PAY03** — vzniká výhradně z `create_referral_reward_from_payment` (trigger na `payment_status='completed'`). Bez reálné Stripe platby není testovatelné.
- Throwaway customer2 pro 55c: vytvořit přes service_role admin, smazat v `afterAll`.

**A13 CMS obsah:** CMS stránky `vop`, `gdpr`, `pravidla-souteze`, `cookies` existují v `content_pages` a jsou dostupné přes routy. Právní obsah: owner-accepted pro testovací fázi (Pavel, 15.06.) — stejný status jako L01/L03/L04. **Neoznačovat A13 jako `prošlo` bez výslovného potvrzení Pavla po finálním právním review.**

## A02/A11/A12/C10 OVĚŘENY — SPEC 52 + 53 (15. 06. 2026)

Staging Full E2E run `27563286558`: **140 passed · 0 failed**. Commity `83a6f3cb`, `48099c5c`. Žádná reálná platba, žádná produkční data, žádný produkční SQL, žádná CMS změna, žádný deploy.

**Nově přidané specy:**
- `tests/e2e/52-admin-contest-create.spec.ts` — A02 + A11. 52a/52b: admin create-contest modal UI validace (ticket_count=0 → „Počet tiketů" v error listu; chybějící main_image → „Hlavní obrázek"; save button disabled). 52c: `admin_manage_contest` RPC přes admin JWT, ověření v DB (ticket_count=100). 52d: draft contest RLS — anon klient vrátí 0 řádků.
- `tests/e2e/53-admin-tests-page-c10-email-mismatch.spec.ts` — A12 + C10. 53a: admin `/admin/tests` stránka zobrazuje „Produkční test vypnut" (žádné `admin-create-test-user` volání). 53b: `redeem_miocoin_code` s cizím JWT → `{success:false, error:'email_mismatch'}` → UI toast „Tento kód je vázán na jiný e-mail." → kód zůstane `issued`.

**Pravidla spec 52 (neměnit):**
- `AdminContestManagement.tsx` defaultuje `ticket_count: 1000000` → pro test validace je nutné vyčistit input na `0` (`ticketCountInput.fill('0')`).
- Modal se otevírá na tabu `basic`; save button + error container jsou uvnitř `<TabsContent value="create">` (hidden) → před assertionem nutno přepnout tab: `dialog.getByRole('tab', { name: /Vytvořit soutěž/i }).click()`.
- Save button selector: `.last()` — tab trigger (`role="tab"`) i save button (`role="button"`) mají stejný text „Vytvořit soutěž"; `.last()` vybere button.
- Cleanup přes service_role klient (smaže `bonus_prizes`, `admin_actions`, `contests` pro test contest).

**Pravidla spec 53 (neměnit):**
- 53b setup: throwaway partner (service_role) + customer1 + customer2; `create_partner_order_reward(p_customer_email: CUSTOMER1_EMAIL)` → `update_partner_order_reward_status(p_order_status:'paid')` → kód `issued`; customer2 JWT zavolá `redeem_miocoin_code(p_code)` → `email_mismatch`.
- `p_order_status` (NE `p_new_status`) — název parametru dle migrace `20260613200202`.

## ZÁKAZNICKÝ FLOW C01–C21 + ADMIN A01–A10 — E2E OVĚŘEN (15. 06. 2026)

Staging Full E2E run `27552310208`: **134 passed · 28 skipped · 0 failed**. Žádná reálná platba, žádná produkční data nezměněna, žádný produkční SQL, žádná CMS změna, žádný deploy. C01–C21 ověřeny E2E nebo pokryty existujícím flow bez reálné Stripe platby; admin A01/A03–A10 ověřeny existujícími specy.

**Nově přidané specy (commit `7e6061c1`):**
- `tests/e2e/50-miocoin-code-redeem-ui.spec.ts` (C07) — staging-only, self-contained: throwaway partner+customer, objednávka přes `create_partner_order_reward` → `update_partner_order_reward_status('paid')` → kód `issued`; zákazník uplatní přes `RedeemMioCoinCard` na `/profile`. 50a success+DB `activated`, 50b invalid, 50c already_used. Cleanup v afterAll.
- `tests/e2e/51-delete-account-page.spec.ts` (C21) — `/delete-account` informační stránka: 51a načtení bez chyb, 51b nadpis+instrukce+`podpora@onemil.cz`+GDPR+nevratnost, 51c přihlášený bez redirektu+mailto.
- **Pravidlo (neměnit):** toast/obsah assertions v spec 50/51 musí mít `.first()` — sonner toast renderuje title+description jako 2 elementy → bez `.first()` strict mode violation. `update_partner_order_reward_status` param je `p_order_status` (NE `p_new_status`).

**Zbývá neověřeno:**
- C10 — ✅ OVĚŘENO spec 53b (run `27563005623`). Neplatí jako neověřeno.
- C19 (mobil layout), C23 (invite reward) — non-blocking.
- A02 — ✅ OVĚŘENO spec 52a/52b/52c (run `27563142294`). Neplatí jako neověřeno.
- A11 — ✅ OVĚŘENO spec 52d (RLS izolace draft, run `27563142294`). Neplatí jako neověřeno.
- A12 — ✅ OVĚŘENO spec 53a (run `27563005623`). Neplatí jako neověřeno.
- A13 (CMS — owner/legal blocker).
- PAY01–PAY03 — Stripe checkout → webhook → wallet; čeká na staging Stripe secrets (viz `docs/launch-readiness/PAY01_PAYMENTS_TEST_MODE_NOTE.md`).

**28 skipů záměrných:** spec 01 (nový uživatel), spec 07/08 (Partner Offer cooldown), spec 39–42 (affiliate payout bez secrets). LAUNCH_TODO CI02 = prošlo.

## L01 / L03 / L04 — PRÁVNÍ TEXTY OWNER-ACCEPTED PRO TESTOVACÍ FÁZI (15. 06. 2026, rozhodnutí Pavla)

Pavel bere aktuální právní texty `/vop`, `/gdpr` a `/legal/cookies` jako dočasně přijatelné pro testovací fázi. Projekt není veřejně spuštěn pro zákazníky — finální doladění proběhne s právníky před ostrým spuštěním.

**Pravidlo (neměnit bez nového rozhodnutí Pavla):**
- L01 `/vop`, L03 `/gdpr`, L04 `/legal/cookies` jsou `owner-accepted pro testovací fázi` — NIKOLI finálně schváleny pro live provoz.
- Před live: právní review + doplnění zjištěných nedostatků: VOP (identifikace firmy, reklamační řád), GDPR (Supabase jako zpracovatel), cookies (Stripe místo „Platební brána", OneSignal, GTM, oprava tvrzení o cookies vs. localStorage).
- Neoznačovat L01/L03/L04 jako `prošlo` v LAUNCH_TODO bez výslovného potvrzení Pavla po finálním právním review.

## TESTOVACÍ REŽIM — STAV PROJEKTU (15. 06. 2026, dokumentace)

OneMil je technicky dostupný na veřejné adrese, ale zatím nejde o veřejné spuštění pro zákazníky. Projekt je stále v testovací fázi a Pavel na něm průběžně ověřuje funkce, platby, soutěže, MioCoiny, účty a doklady.

Dosavadní data nejsou reálný veřejný provoz. Platby, účty, MioCoiny, soutěže, doklady, Stripe záznamy a související transakce jsou testovací nebo smyšlená data. Web zatím není určený pro běžné uživatele ani reálné zákaznické platby.

Produkční prostředí může být používáno k testování, ale Stripe běží na testovacích klíčích. Před ostrým spuštěním musí Pavel vědomě potvrdit přepnutí Stripe na live režim, live webhook a finální produkční nastavení.

## L08 18+ GATING — SPEC 49 PŘIDÁN A OVĚŘEN (15. 06. 2026)

`tests/e2e/49-age-gating.spec.ts` ověřuje věkový gate na obou vstupních bodech:
- `/register`: odmítne věk 17 a 0 (zobrazí `Pro registraci musíte mít alespoň 18 let.`); přijme věk 18 a 25 (žádná age error).
- `/onboarding/date-of-birth`: odmítne věk 17 (age error viditelný); přijme věk 18 (age error není; bez session → `Uživatel není přihlášen.`).
Staging run `27541581559`: 6/6 passed. Commit `70970e90`. L08 = prošlo. Žádná změna kódu/SQL/CMS.
Pravidlo: nevracet business logiku `validateAge` (age >= 18); spec 49 spustit při jakékoli změně `/register` nebo `/onboarding/date-of-birth`.

## LAUNCH L04 — COOKIE BANNER LINK OPRAVEN NA /legal/cookies (15. 06. 2026, schválení Pavla)

Technický mismatch cookie banneru opraven: kanonická cookies stránka je `/legal/cookies`, owner-managed CMS obsah přes `/admin/content` (`content_pages section=legal slug=cookies`). Odkazy v `CookieConsentBanner.tsx` nyní míří na `/legal/cookies`; právní text a CMS beze změny. Meta `<noscript>` tracking image fallback zůstává pryč z `index.html`; `consent.ts` beze změny, Meta init/PageView stále jen při `marketing=true`. Žádný SQL ani deploy. L04 zůstává P0 jen do owner/legal potvrzení finálního cookies textu `/legal/cookies`.## LAUNCH L01 — VOP ROUTY TECHNICKY SJEDNOCENY NA /vop (15. 06. 2026, schválení Pavla)

Owner decision: kanonická stránka obchodních podmínek je `/vop`, protože je owner-managed CMS editovatelná přes `/admin/content` a Pavel si VOP text spravuje sám. Kódově sjednoceno pouze routami/odkazy: `/vop` zůstává CMS stránka přes `SlugContentPage slug="vop"`, `/terms` je kompatibilní redirect na `/vop`; registrace míří na `/vop`; footer už vedl na `/vop`. Právní text, CMS `content_pages`, SQL a deploy beze změny. L01 zůstává P0 jen do owner/legal potvrzení finálního právního obsahu `/vop`.
## LAUNCH L03 — PRIVACY/GDPR ROUTY TECHNICKY SJEDNOCENY NA /gdpr (15. 06. 2026, schválení Pavla)

Owner decision: kanonická privacy/GDPR stránka je `/gdpr`, protože je CMS editovatelná přes `/admin/content` a registrace už ukládá `document_slug='gdpr'`. Kódově sjednoceno pouze routami/odkazy: `/gdpr` zůstává CMS stránka přes `SlugContentPage slug="gdpr"`, `/privacy` a `/legal/ochrana-osobnich-udaju` zůstávají kompatibilní přes redirect na `/gdpr`; footer veřejně ukazuje jen jeden privacy/GDPR odkaz na `/gdpr`; registrační checkbox, cookie banner a související odkazy míří na `/gdpr`. Právní text, CMS `content_pages`, SQL, cookies logika/`consent.ts` a deploy beze změny. L03 zůstává P0 jen do owner/legal potvrzení finálního právního obsahu `/gdpr`.
## LAUNCH L04 — META NOSCRIPT FALLBACK ODSTRANĚN (15. 06. 2026, schválení Pavla)

Technický follow-up k L04 proveden se schválením Pavla: z `index.html` byl odstraněn pouze Meta Pixel `<noscript>` tracking image fallback (`facebook.com/tr?...PageView&noscript=1`), protože při vypnutém JS nemůže běžet React cookie banner ani `consent.ts`, ale fallback mohl odeslat Meta PageView bez souhlasu. `consent.ts` beze změny: Meta `fbq('init')` + `PageView` se dál volá jen při `marketing=true`; GTM/GA4 beze změny. Build `npm run build` ověřen. Žádný SQL, deploy ani CMS content změněn. L04 stále zůstává P0 jen kvůli owner/legal potvrzení finálního cookies textu.

## LAUNCH L04 — COOKIES POLICY CLEAN AUDIT Z ORIGIN/MAIN (15. 06. 2026, read-only)

L04 cookies audit byl zopakován z čistého detached checkoutu aktuálního `origin/main` na commitu `2eb29291166bea4685d8f11184e999766403fb06`; worktree byl čistý. Tento audit **nahrazuje** předchozí L04 audit z větve `codex/affiliate-payouts-audit`. Produkční CMS `content_pages` `/legal/cookies` (`section=legal`, `slug=cookies`) je aktivní, `content_length=2328`, obsahuje `podpora@onemil.cz`; L09 e-mail mismatch je vyřešený i pro cookies (`info@onemil.cz` 0×, `support@onemil.cz` 0× v aktivním CMS, `podpora@onemil.cz` 5×). L04 ale zůstává **P0 blocker**, protože Pavel/legal musí potvrdit aktualizovaný cookies text proti reálným nástrojům: Supabase Auth `localStorage.onemil-auth`, `localStorage.cookie_consent`, `public.cookie_consents`, GA4, GTM, Meta Pixel, Meta noscript fallback, OneSignal SDK/worker/cache/IndexedDB/`user_devices`, Stripe checkout redirect a aplikační `localStorage`/`sessionStorage` klíče. Samostatný technický follow-up: prověřit Meta noscript fallback. Žádný kód, SQL, deploy ani CMS content změněn.

## LAUNCH L09 — KONTAKTNÍ E-MAILY V CMS SJEDNOCENY (15. 06. 2026, schválení Pavla)

Kanonický veřejný/legal support e-mail = `podpora@onemil.cz` (potvrdil Pavel). Produkční CMS `public.content_pages`: `info@onemil.cz` → `podpora@onemil.cz` nahrazeno (jen e-mail substring, beze změny jakéhokoli právního wordingu) ve **3 aktivních legal stránkách**: `ochrana-osobnich-udaju`, `cookies`, `autorska-prava`. Třetí (`autorska-prava`) nalezena při precheck — stejný špatný e-mail, spadá pod pravidlo „other pages unless the same exact wrong email is found". Postcheck: 0× `info@onemil.cz` kdekoli v CMS, 0× `active_legal_info_remaining`, 0× `support@onemil.cz`, 5 stránek s `podpora@`. App kód byl už 100% čistý. Žádný deploy, žádná změna kódu, žádná migrace — pouze cílený DB UPDATE 3 řádků. L09 v LAUNCH_TODO → `prošlo` (už ne P0 blocker). Pravidlo: needitovat právní texty mimo e-mail; nevracet `info@`/`support@onemil.cz`.

## LAUNCH L02 — PRAVIDLA SOUTĚŽE PER-SOUTĚŽNÍ (15. 06. 2026, jen dokumentace)

Re-audit: závazná pravidla soutěže jsou per-soutěžní (`public.contests.rules` + `contests.rules_pdf_url`; admin nahrává PDF ke konkrétní soutěži do bucketu `contest-rules`; ContestDetail je zobrazuje; žádná PDF šablona → žádné placeholdery v generování). `/pravidla-souteze` je jen obecná CMS stránka, NE závazný zdroj. V LAUNCH_TODO L02 rozdělen na L02a (P1, obecná CMS stránka má placeholdery — content cleanup/owner-legal, NE blocker) a L02b (P0, per-contest QA: každá aktivní soutěž musí mít zkontrolovaný rules_pdf_url). Produkce: 0 aktivních soutěží → per-contest pravidla teď nic neblokují. Pravidlo: pravidla soutěže needitovat jako jeden statický text; kontrolovat per-soutěžní rules PDF.

## SEC01 VYŘEŠENO — E17 PRODUKČNÍ FIX OVĚŘEN (15. 06. 2026, schválení Pavla)

E17 `v_influencer_referrals_paid` affiliate-scoped redesign na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_e17_influencer_referrals_paid_affiliate_scoped`): influencer_referrals owner+admin RLS, 2 minimal-disclosure SECURITY DEFINER helpery (anon exec=false), view security_invoker=on. Precheck=baseline; postcheck count 0=0, invoker on, anon=false, auth=true; prod advisor 2→1; P0 smoke `27529591097` success. Bez rollbacku. **SEC01 efektivně vyřešen — všechny ERRORy fixnuty/accepted; zbývá jen E22 (owner-accepted) a WARN/INFO backlog. SEC01 už NENÍ launch blocker.** Progrese prod ERROR: 23→10→8→7→5→3→2→1(accepted). Pravidla (neměnit): influencer_referrals nevracet USING(true); v_influencer_referrals_paid nevracet na SECURITY DEFINER; helpery bez anon execute; contest_progress nepřepínat na security_invoker.

## SEC01 E17 AFFILIATE-SCOPED REDESIGN — STAGING OVĚŘEN (15. 06. 2026)

E17 `v_influencer_referrals_paid` na stagingu `dxmowysntemfqfnanxua` (migrace `sec01_e17_influencer_referrals_paid_affiliate_scoped`): influencer_referrals owner+admin RLS (broad USING(true) odstraněn), 2 minimal-disclosure SECURITY DEFINER helpery (user_completed_first_topup, referral_user_is_valid; anon exec=false), view přestavěn na security_invoker nad base tabulkou. Postcheck OK, count 0=0. Advisor E17 zmizel (2→1; zbývá jen E22 accepted → effective 0). Full E2E `27528853194` 122 passed/0 fail (affiliate + admin OK). Žádné raw platby/auth.users. Produkce NEDOTČENA (připraveno pro prod schválení). Po prod E17 lze SEC01 uzavřít. Pravidlo: influencer_referrals nevracet USING(true); v_influencer_referrals_paid nevracet na SECURITY DEFINER; helpery nesmí mít anon execute.

## SEC01 E22 contest_progress — OWNER-ACCEPTED (15. 06. 2026, jen dokumentace)

Pavel formálně akceptoval E22 `public.contest_progress` jako záměrný veřejný agregát (tikety prodáno/zbývá/%); bez osobních dat, ponechává se SECURITY DEFINER (security_invoker by rozbil zákaznické počty). Není blocker. Jen dokumentace (SECURITY_FINDINGS.md status accepted-risk; LAUNCH_TODO). Žádné SQL/advisor change. Produkční raw advisor 2 ERROR, ale efektivní nevyřešený SEC01 = 1 (E17 v_influencer_referrals_paid). SEC01 zůstává P0 blocker kvůli E17; po jeho vyřešení lze uzavřít (mimo WARN/INFO). Pravidlo: contest_progress NEpřepínat na security_invoker.

## SEC01 E18 PARTNER-OWN RLS — PRODUKČNÍ FIX OVĚŘEN (15. 06. 2026, schválení Pavla)

Produkce `xkzhjldrojjlrkezorey` (migrace `sec01_e18_partner_api_activity_partner_own_rls`): policy `partner_api_requests_partner_own` (partner-own přes partners.auth_user_id + admin) na partner_api_requests + `security_invoker=on` na partner_api_activity. Precheck=baseline (RLS on, 0 policy, 6 reálných řádků); postcheck: policy on, invoker on, anon=false, auth=true; prod advisor 3→2; P0 smoke `27528174542` success. Bez rollbacku. SEC01 zůstává P0 blocker — produkce 2 ERROR: E17 (affiliate-scoped RLS redesign, NO-GO naslepo) + E22 (formální owner-accept). Progrese prod ERROR: 23→10→8→7→5→3→2. Pravidlo: partner_api_requests_partner_own je partner-scoped — nevracet deny-all/SECURITY DEFINER.

## SEC01 E18 PARTNER-OWN RLS — STAGING OVĚŘEN (15. 06. 2026)

E18 `partner_api_activity` na stagingu `dxmowysntemfqfnanxua` (migrace `sec01_e18_partner_api_activity_partner_own_rls`): RLS policy `partner_api_requests_partner_own` (partner-own přes partners.auth_user_id + admin) na partner_api_requests + `security_invoker=on` na partner_api_activity. Postcheck: policy on, invoker on, anon=false, auth=true. Advisor staging 3→2 (E18 zmizel). Full E2E `27527383016` 122 passed/0 fail (spec 47 green) — partner vidí jen vlastní API aktivitu. Produkce NEDOTČENA (připraveno pro prod schválení). SEC01 zůstává P0 blocker — produkce 3 ERROR (E17 redesign, E18 čeká prod, E22 owner-accept). Pravidlo: partner_api_requests_partner_own je partner-scoped (nevracet deny-all/definer).

## SEC01 GROUP 3 SAFE/INTERIM — PRODUKČNÍ FIX OVĚŘEN (15. 06. 2026, schválení Pavla)

Produkce `xkzhjldrojjlrkezorey` (migrace `sec01_group3_safe_interim_hardening`): E19 contest_miocoin_totals + E20 winners_with_contest (unused) → revoke anon/auth + security_invoker=on (cleared); E17 v_influencer_referrals_paid + E18 partner_api_activity → revoke anon no-op (anon už false), zůstávají interim (redesign pending); E22 contest_progress ponechán (owner-accept candidate). Precheck=baseline; postcheck OK; prod advisor 5→3; P0 smoke `27526912855` success (5 passed). Bez rollbacku. SEC01 zůstává P0 blocker — 3 ERROR: E17 (affiliate-scoped RLS redesign), E18 (partner-own RLS redesign), E22 (formální owner-accept). Progrese prod ERROR: 23→10→8→7→5→3. Pravidlo: E19/E20 nevracet granty/SECURITY DEFINER; E22 nepřepínat na security_invoker (rozbije zákaznické počty).

## SEC01 GROUP 3 SAFE/INTERIM — STAGING OVĚŘEN (15. 06. 2026)

Group 3 safe/interim na stagingu `dxmowysntemfqfnanxua` (migrace `sec01_group3_safe_interim_hardening`): E19 contest_miocoin_totals + E20 winners_with_contest (unused) → revoke anon/auth + security_invoker (cleared); E18 partner_api_activity + E17 v_influencer_referrals_paid → revoke anon (interim, SDV ERROR zůstává, redesign owner decision); E22 contest_progress ponechán (owner-accept candidate — invoker by rozbil zákaznické počty). Advisor staging 5→3. Full E2E `27526273831` 122 passed/0 fail (Games/ContestDetail/partner/affiliate OK). Produkce NEDOTČENA (5 ERROR). SEC01 zůstává P0 blocker. Pravidlo: E19/E20 nevracet anon/auth; E22 nepřepínat na security_invoker (rozbije počty); E17/E18 vyžadují RLS redesign před invoker.

## SEC01 E05/E23 — PRODUKČNÍ FIX OVĚŘEN (15. 06. 2026, schválení Pavla)

Produkce `xkzhjldrojjlrkezorey` (migrace `sec01_e05_e23_tickets_admin_read_and_invoker`): aditivní policy `tickets_admin_select_all` (has_role admin/superadmin) + `security_invoker=on` na E05 `contest_activity_last_24h` a E23 `contest_revenue`. Precheck=baseline; postcheck: policy přítomná (tickets 3 policy), invoker on, output 0/127/4000 nezměněn; customer own-row beze změny. Prod advisor 7→5. P0 smoke `27525944645` success (5 passed). Bez rollbacku. SEC01 zůstává P0 blocker — 5 ERROR = Group 3 (E17/E18/E19/E20/E22) + WARN/INFO. Pravidlo: `tickets_admin_select_all` je gated rolí (nevracet); E05/E23 nesmí zpět na SECURITY DEFINER bez invoker.

## SEC01 E05/E23 — STAGING VYŘEŠENO (14. 06. 2026)

Staging `dxmowysntemfqfnanxua` (migrace `sec01_e05_e23_tickets_admin_read_and_invoker`): aditivní policy `tickets_admin_select_all` (has_role admin/superadmin) + `security_invoker=on` na E05 `contest_activity_last_24h` a E23 `contest_revenue`. Postcheck: policy on, invoker on, output 7/789/1153 nezměněn. Advisor staging 7→5 (zbytek Group 3). Full E2E `27512846743` 122 passed/0 fail (admin contest/revenue/ticket-map OK). Produkce pro E05/E23 security_invoker NEDOTČENA (jen interim anon-revoke). SEC01 zůstává P0 blocker. Pravidlo: `tickets` admin read policy je gated rolí — nezpřístupňuje cizí tikety běžným uživatelům; nevracet.

## SEC01 E09 SECURITY_INVOKER — PRODUKČNÍ FIX OVĚŘEN (14. 06. 2026, schválení Pavla)

E09 `admin_winner_delivery_stats` → `security_invoker=on` na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_e09_admin_winner_delivery_stats_security_invoker`). Postcheck: invoker on, output 127/101 nezměněn. Prod advisor 8→7. P0 smoke `27512629715` success (5 passed). Bez rollbacku. SEC01 zůstává P0 blocker (7 ERROR: E05/E23 + Group 3). E05/E23 nelze (tickets RLS deny-all) — potřebují tickets admin-read policy nebo accept.

## SEC01 E09 SECURITY_INVOKER — STAGING OVĚŘEN (14. 06. 2026)

E09 `admin_winner_delivery_stats` → `security_invoker=on` pouze na staging (migrace `sec01_e09_admin_winner_delivery_stats_security_invoker`). Bezpečné díky admin RLS na contests+winners. Postcheck: invoker on, výstup 786/297 nezměněn. Advisor staging 8→7. Full E2E `27512219000` 122 passed/0 fail (/admin/prize-delivery OK). Produkce NEDOTČENA. E05/E23 security_invoker NELZE (tickets RLS deny-all by vynulovalo totaly) — potřebují tickets admin-read policy (owner decision) nebo accept. SEC01 zůstává P0 blocker (produkce 8 ERROR).

## SEC01 GROUP 2 SAFE/INTERIM — PRODUKČNÍ FIX OVĚŘEN (14. 06. 2026, schválení Pavla)

Group 2 safe/interim aplikován na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_group2_safe_interim_hardening`): E14 revoke anon/auth + security_invoker (cleared); E03 ENABLE RLS + revoke (cleared, NEsmazáno); E05/E09/E23 revoke anon (authenticated ponechán, SDV ERROR zůstává). Precheck=baseline; postcheck OK; prod advisor ERROR 10→8; P0 smoke `27511945205` success (5 passed); bez rollbacku. SEC01 zůstává P0 blocker (8 ERROR = Security Definer View). Pravidlo: nevracet anon SELECT; E05/E09/E23 security_invoker až po ověření admin RLS (owner decision); E03 DROP jen po schválení.

## SEC01 GROUP 2 SAFE/INTERIM — STAGING OVĚŘEN (14. 06. 2026)

SEC01 Group 2 safe/interim aplikován pouze na staging `dxmowysntemfqfnanxua` (migrace `sec01_group2_safe_interim_hardening`): E14 `valid_partner_api_keys` revoke anon/auth + security_invoker (cleared); E03 `_messages_policies_backup` ENABLE RLS + revoke (cleared, NEsmazáno); E05/E09/E23 admin views revoke anon (authenticated ponechán, SDV ERROR zůstává). Advisor staging 10→8. Full E2E `27511465619` = 122 passed/0 fail. Produkce pro Group 2 NEDOTČENA. SEC01 zůstává P0 blocker. Pravidlo: tyto objekty nevracet anon SELECT; E05/E09/E23 security_invoker až po ověření admin RLS (owner decision); E03 DROP jen po schválení.

## SEC01 SECURITY_FINDINGS ŘÁDKY SROVNÁNY (14. 06. 2026, jen dokumentace)

13 Group 1 řádků v `docs/launch-readiness/SECURITY_FINDINGS.md` (E01/E02/E04/E06/E07/E08/E10/E11/E12/E13/E15/E16/E21) přepnuto na `fixed (production, verified)` kvůli souladu s ověřenou hlavičkou. Group 2/3 řádky nezměněny. Jen dokumentace.

## SEC01 GROUP 1 — PRODUKČNÍ FIX OVĚŘEN (14. 06. 2026, schválení Pavla)

SEC01 Group 1 (11 app-unused SECURITY DEFINER views) aplikován na produkci `xkzhjldrojjlrkezorey` (REVOKE anon/auth + `security_invoker=on`, migrace `sec01_group1_safe_view_hardening`). Precheck=baseline; postcheck 11/11; advisor ERROR 23→10; P0 smoke `27511158470` success (5 passed); bez rollbacku. Pravidlo: těchto 11 views NESMÍ mít zpět anon/authenticated SELECT ani SECURITY DEFINER bez invoker. SEC01 zůstává P0 blocker — zbývá 10 ERROR (Group 2/3: 1 RLS Disabled in Public + 9 Security Definer View) + WARN/INFO; vyžadují fix nebo owner-accept.

## SEC01 GROUP 1 — STAGING FIX OVĚŘEN (14. 06. 2026)

SEC01 Group 1 (11 app-unused SECURITY DEFINER views) aplikován pouze na staging `dxmowysntemfqfnanxua` (REVOKE anon/auth + `security_invoker=on`, migrace `sec01_group1_safe_view_hardening`). Advisor staging: 11 cílených ERROR zmizelo (21→10). Full E2E `27510668205` = 121 passed/0 fail. **Produkce NEDOTČENA** (stále 23 ERROR). SEC01 zůstává P0 blocker (Group 2/3 = 10 ERROR + prod neopraven). Produkční rollout vyžaduje samostatné schválení ownera. Pravidlo: tyto views NESMÍ mít zpět anon/authenticated SELECT ani SECURITY DEFINER bez invoker.

## SEC01 SECURITY FINDINGS INVENTÁŘ (14. 06. 2026, jen dokumentace)

`docs/launch-readiness/SECURITY_FINDINGS.md` = read-only inventar produkcniho Security Advisoru (`xkzhjldrojjlrkezorey`): **467 nalezu (23 ERROR / 20 INFO / 424 WARN)**. 23 ERROR odpovida puvodni „23" ze SEC01 (2 Exposed Auth Users, 1 RLS Disabled in Public, 20 Security Definer View). Fixnuto=0 v inventari; ERRORy open, WARN/INFO needs-owner-decision/accepted-risk. **SEC01 = P0 blocker** dokud nejsou ERRORy fixnuty nebo ownerem akceptovany. Nic neoznaceno fixed bez dukazu. Zadny kod/SQL/RLS/deploy/produkce.

## PRAVNI CMS TEXTY — L01–L04 + L09 BLOCKER PO EXPORTU (14. 06. 2026, jen dokumentace)

Po exportu produkcnich CMS pravnich textu (`content_pages`) zaznamenano v `docs/launch-readiness/LAUNCH_TODO.md` jako P0 blocker: /vop prilis kratky; /pravidla-souteze ma placeholdery (`[NÁZEV SOUTĚŽE]`/`[DATUM]`/`[POPIS HLAVNÍ VÝHRY]`/`[HODNOTA]`); /gdpr vs /legal/ochrana-osobnich-udaju se lisi (sjednotit); /legal/cookies overit proti realnym nastrojum+banneru; nektere pravni texty maji `info@onemil.cz` vs verejny `podpora@onemil.cz` (L09 — kontaktni e-maily potvrdit ownerem pred editaci). Zadny pravni text/CMS/SQL/deploy/produkce nezmenen. Dalsi krok: owner/legal review pred launchem.

## CONTACT / LEGAL EMAIL CONSISTENCY AUDIT (14. 06. 2026, jen dokumentace)

Owner potvrzeno: kanonicky verejny support e-mail pro OneMil launch readiness je `podpora@onemil.cz`. `COMPANY_CONTEXT.md` byl dokumentacne sjednocen na `podpora@onemil.cz` pro hlavni verejny support kontakt i podporu; `b2b@onemil.cz` zustava jen pro obchodni spoluprace. Cleanup audit potvrzuje, ze stara support adresa nezustava v live app code, email templates, Edge Functions, settings docs ani current source-of-truth docs; zbyle vyskyty jsou jen stare audit/history notes. `LAUNCH_TODO.md` L05 oznacen jako proslo. CMS `vop`, `gdpr`, `pravidla-souteze` a `cookies` existuji, ale pravni kvalita/aktualnost zustava neoverena v L01-L04. Zadny kod, SQL, deploy, produkcni data, Partner API, fakturace ani reward logika.

## LAUNCH READINESS DOKUMENTACE (14. 06. 2026, jen dokumentace)

Launch testovaci plan ve `docs/launch-readiness/`: `LAUNCH_TEST_PLAN.md` (A–H), `ROUTE_CHECKLIST.md` (mapa rout P0/P1/P2), `LAUNCH_TODO.md` (65 bodu; P0=48/P1=16/P2=1). P0 blockery: pravni obsah (VOP/GDPR/pravidla), cookies, kontakt/reklamace, zeleny Full E2E + P0 smoke, realne partner reward settings. NEOVERENO oznacene jako todo. Zadny kod/SQL/deploy/produkce.

## STAGING INTERNAL_FUNCTION_TOKEN — REALIGNMENT (14. 06. 2026)

Staging `INTERNAL_FUNCTION_TOKEN` (Supabase `dxmowysntemfqfnanxua`) byl realignovan s GitHub secretem `STAGING_VITE_INTERNAL_FUNCTION_TOKEN` (oba na jednu novou sdilenou hodnotu) — predtim drift z partner-API rotaci shazoval spec 44/43/22 (401). Produkcni `INTERNAL_FUNCTION_TOKEN` ani `VITE_INTERNAL_FUNCTION_TOKEN` nezmenen. **Pravidlo: GitHub secrety nastavovat pres `gh secret set --body`, NE pres PowerShell pipe (pipe pridava BOM U+FEFF → header TypeError).** Cilene runy zelene: 44 `27500754646`, 43 `27500810383`, 22 `27500856702`. Zadny kod/test/migrace/deploy/produkce.

## PARTNER API ONBOARDING SADA (14. 06. 2026, jen dokumentace)

Kompletni partner onboarding sada ve `docs/partner-api/`: `README.md` (index), `PARTNER_OWNER_OVERVIEW.md` (netechnicky majitel), `PARTNER_API_GUIDE.md` (vyvojar, order-event), `PARTNER_HANDOFF_EMAIL.md` (cesky predavaci e-mail). Jedna sada, zadne konkurencni verze, bez Botanicu. Owner: order events → OneMil pocita MioCoiny → cekajici → aktivni (paid/delivered/completed) / zrusena (cancelled/returned/unpaid/not_picked_up) → MioCoiny az uplatnenim → partner plati pozdeji jen za aktivovane/uplatnene dle stavajici invoice logiky; pri create zadna faktura/e-mail/PDF/platba/wallet credit. Pripraveno PO rolloutu PR #114, NE zive; `settings.partner_api_documentation` nezmenen. Zadny kod/SQL/deploy/merge/produkce.

## PARTNER API GUIDE — ORDER-EVENT MODEL (14. 06. 2026, jen dokumentace)

Partner-facing pruvodce Partner API je v `docs/partner-api/PARTNER_API_GUIDE.md` (PR #114 branch), revidovan na order-event model (objednavka vytvorena → cekajici odmena; paid/delivered/completed → aktivni odmena; cancelled/returned/unpaid/not_picked_up → zrusena). Checkout neceka na OneMil; retry se stejnym `external_order_id` (idempotence). Partner neposila konecny pocet MioCoinu. Pripraveno PO rolloutu PR #114 — NE zive; `settings.partner_api_documentation` nezmenen. Zadny kod/SQL/deploy/merge/produkce.

## PARTNER API PR #114 — PRODUKCNI ROLLOUT PROVEDEN (14. 06. 2026)

**Rollout PROVEDEN se schvalenim Pavla.** PR #114 mergnuto do `main` (merge commit `f5e508ca`). Na produkci `xkzhjldrojjlrkezorey` aplikovany migrace `20260613200202` + `20260613200849`; nasazena EF `partner-activate` **v130** (`verify_jwt=false`).

- **Postchecky OK:** enum `partner_code_status` ma `pending`; RPC `create_partner_order_reward` + `update_partner_order_reward_status` existuji s EXECUTE jen pro `service_role` (anon/authenticated=false); idempotency index existuje; `redeem_miocoin_code` odmita `pending`; zadny `partner_api_v1` objekt.
- **Smoke (RPC service_role + EF 401 boundary):** create→`pending` 2 coiny (kod GRT3XLP46KR6, partner Test Influencer A, test e-mail prod-rollout-test@onemil.cz), duplicate→stejny kod, **0 activations / 0 invoices / 0 wallet txns** pri create; EF bez klice i se spatnym klicem → 401. Probe radek pote smazan. Full EF happy-path s realnym klicem zamerne NEspusten (vystaveni produkcniho klice blokovano bezpecnostnim guardem) — overen ekvivalentni RPC, ktery EF vola.
- **`settings.partner_api_documentation` ZATIM NEZMENEN** (stale stary endpoint) — vyzaduje doplneni realneho base URL misto `<onemil-api>` a schvaleni partner-facing wordingu pred prepsanim.
- **Rollback info zachyceno** pred zmenou: partner-activate v129 (zdroj ulozen), definice `redeem_miocoin_code`/`log_partner_coin_activation_from_reward`/`activate_partner_reward_sql` (md5).
- Pri `create_order_reward` NEvznika faktura/e-mail/PDF/platba/wallet credit/activation — overeno.

### Puvodni checklist (historicky, nyni PROVEDEN)

Produkcni rollout checklist pro Partner API existing-system (PR #114) byl pripraven. **Schvalovaci fraze byla:** „Schvaluji produkcni rollout Partner API (PR #114)…". Puvodni gate pred provedenim:

- Staging spec 48 zeleny (run `27490386537`).
- Pred rolloutem potvrdit `partners.reward_base_czk` + `reward_mc` u realnych partneru.
- Pri `create_order_reward` NESMI vzniknout faktura/e-mail/PDF/platba/wallet credit/`partner_coin_activations` radek; wallet credit + activation az po `redeem_miocoin_code`.
- Presna schvalovaci fraze: „Schvaluji produkcni rollout Partner API (PR #114): aplikovat migrace 20260613200202 a 20260613200849 na produkci xkzhjldrojjlrkezorey a nasadit Edge Function partner-activate. Rozumim, ze se nevytvari zadna faktura/e-mail/PDF/platba/wallet credit pri vytvoreni objednavky."

## PUBLIC CUSTOMER-FACING UI TEXT AUDIT — ✅ ČISTÉ (13. 06. 2026)

Read-only audit zákaznických UI textů (routy `/`, `/games`, `/wins`, `/vouchers`, `/profile`, `/messages`, `/my-contests`).

- **Žádné viditelné zákaznické anglické slovo `referral`.** Výskyty jsou code-only (identifikátory, komentáře, RPC/table názvy, `rejected:self_referral`) nebo admin/partner/interní oblasti.
- **Zákaznické wording české:** `Pozvi přátele` (nadpis `ReferralSection.tsx`), `doporučovací kód`, `odměny z doporučení`.
- **Žádný B2B/partner billing text neuniká do zákaznických rout.** Billing wording (Fakturace MioCoinů, `price_per_coin`, IČO/DIČ, samofakturace) izolovaný v partner/admin (`PartnerDashboard`, `PartnerInvoices`, `AdminInvoices`). Homepage „partnerské e-shopy" = legitimní zákaznický benefit copy.
- **Žádný fix nutný.** Volitelné budoucí zpřísnění: CI guard proti viditelnému anglickému `referral` v zákaznickém UI. Read-only: bez změny souborů, SQL, deploye. Affiliate Payouts a Partner Invoices nedotčeny.

## P0 PARTNER FLOW AUDIT — ✅ PO DASHBOARD BUSINESS-TEXT ÚPRAVÁCH (13. 06. 2026)

P0 audit schváleného partnerského flow dokončen po úpravách partner dashboard business textů. Staging cílený run `27466916402` (spec 43): **4 passed · 1 skipped · 0 failed**, success.

- **Ověřeno:** partner login, dashboard loads, konverzní helper text přítomen, karta `Fakturace MioCoinů` viditelná, `Moje faktury` → `/partner/invoices`, partner invoices page loads, PDF download jen když PDF existuje, partner nevidí faktury jiných partnerů, partner nemá přístup na admin invoice stránky, logout přes standardní sdílenou auth cestu.
- **Produkce read-only:** RLS izolace partnerských invoice dat (`partner_invoices`/`_lines`/`_exports` partner-own přes `auth.uid()`, admin `is_admin()`, žádné `USING (true)`).
- **Žádný partner blocker.** Bez změny produkčních dat, SQL, deploye, e-mailů, PDF, faktur či partnerů. Affiliate Payouts a customer invite reward security nedotčeny.
- **Doporučené volitelné zpřísnění — ✅ UZAVŘENO (spec 47, viz níže):** dedikovaný approved-partner dashboard smoke spec přidán.

## PARTNER DASHBOARD SMOKE SPEC 47 (13. 06. 2026, invariant)

`tests/e2e/47-partner-dashboard-smoke.spec.ts` (staging-only, self-contained; service-role throwaway approved partner + cleanup v `afterAll`). Commity `fe5f59a9` (add) + `e3c2439b` (logout). Staging cílený run `27474214282`: **3 passed · 0 skipped · 0 failed**, success.

- **Ověřuje:** schválený partner otevře `/partner/dashboard`; sekce `Nastavení konverze MioCoinů` viditelná; konverzní helper text viditelný (přesná kopie); karta `Fakturace MioCoinů` viditelná; `Moje faktury` → `/partner/invoices`; 47f logout přes top-nav `Odhlásit se` (PartnerHeader v `App.tsx`, `handleLogout` → `navigate('/partner/login')`) redirectuje na `/partner/login`.
- **Test-only (neměnit charakter):** žádná změna app UI/logiky, schema, SQL, deploye, e-mailů, PDF ani produkčních dat. Uzavírá zpřísnění z P0 partner flow auditu.

## PARTNER DASHBOARD — KONVERZE MIOCOINŮ PŘÍKLAD (13. 06. 2026, invariant)

**✅ LIVE OVĚŘENO (13. 06. 2026):** Lovable Publish dokončen po commitu `7464cd78`; Pavel live ověřil helper pod `Nastavení konverze MioCoinů`. Při ověření žádná změna kalkulace, DB, SQL, EF deploye, e-mailů ani dat.

V sekci „Nastavení konverze MioCoinů" (`/partner/dashboard`, `src/pages/PartnerDashboard.tsx`) je pod inputy český helper text: „Příklad: při nastavení 100 Kč = 1 MioCoin dostane zákazník za objednávku 500 Kč celkem 5 MioCoinů." Pouze frontend info blok (vzor `bg-muted/30` + `Info` ikona). NEMĚNIT kalkulační logiku konverze ani DB. Build ✅ exit 0.

## PARTNER DASHBOARD — FAKTURACE MIOCOINŮ EXPLAINER (13. 06. 2026, invariant)

**✅ LIVE OVĚŘENO (13. 06. 2026):** Lovable Publish dokončen po commitu `8c5e5375`; Pavel live ověřil, že karta `Fakturace MioCoinů` je na `/partner/dashboard` pro schváleného partnera, pod `Nastavení konverze MioCoinů`. Při ověření žádná data nezměněna, žádné e-maily, žádné SQL, žádný deploy mimo Lovable Publish.

Read-only info blok „Fakturace MioCoinů" v `/partner/dashboard` (`src/pages/PartnerDashboard.tsx`, gated `isAccountApproved`, za kartou „Nastavení konverze MioCoinů"). Vysvětluje partnerovi: fakturujeme jen aktivované MioCoiny, vyúčtování automaticky jednou týdně, faktura přijde e-mailem + je v „Moje faktury"; aktuální cena z `partner.price_per_coin` (fallback `1.00`). Odkaz „Moje faktury" → `/partner/invoices`.

- **Sjednocený label konceptu faktury:** partner-facing draft = **„Koncept"** všude (`PartnerInvoices.tsx` + dashboard offer invoice badge; dřívější „Návrh" odstraněn). Neměnit zpět na „Návrh".
- **Pravidlo:** explainer pouze popisuje existující chování — NEMĚNIT billing logiku, cron `weekly_partner_invoices` (job 17, neděle 02:00 UTC), DB schema, PDF/e-mail EF. Build ✅ exit 0. Žádné SQL/deploy/e-maily. Affiliate Payouts a customer invite reward security nedotčeny.

## P0 ADMIN FLOW AUDIT — ✅ ZELENÝ PO SECURITY + INVOICE + CUSTOMER-FLOW PRÁCI (13. 06. 2026)

P0 audit admin flow dokončen. Staging behaviorálně ověřen (green run), UI kontrakty staticky, produkce read-only.

- **Staging Full E2E run `27464656913` green** — admin specy passed (`15`, `16`, `18`, `23`, `24`, `29`, `30`, `32`, `33` 6/6, `43` 4/5, `44` 7/7, `45` 1/1).
- **Ověřené admin flow:** admin login, admin dashboard, contests admin page, otevření create/edit contest UI, vouchers admin page (route + policy), messages/admin unread state, partner invoices admin page, partner invoice detail drawer, invoice tlačítka, admin „Doporučení a odměny" overview, admin tests page bez volání `admin-create-test-user`.
- **Invoice tlačítka (spec 45 + statická kontrola `AdminInvoices.tsx`):** `draft → Odeslat fakturu emailem`, `issued → Znovu odeslat`, `paid → žádné send/resend`. **Admin tests page:** `createTestUser` neutralizován (toast „bezpečnostně vypnut"), žádné `.invoke('admin-create-test-user')` v `src`.
- **Produkce `xkzhjldrojjlrkezorey` read-only:** `partner_invoices`/`_lines`/`_exports` admin přes `is_admin()` + partner own-row; invite reward tabulky own-row + admin read-all; `vouchers` admin SELECT + záměrný world-readable katalog; žádné `USING (true)`.
- **Žádný admin blocker.** Bez změny souborů, bez SQL writes, bez deploye, bez e-mailů, bez generování PDF, bez označení faktur zaplaceno, bez vytváření soutěží, žádná produkční data nezměněna.
- **Doporučené pozdější test-only zlepšení — ✅ UZAVŘENO (spec 46, viz níže):** dedikované read-only smoke specy pro `/admin/vouchers` a `/admin/referrals` přidány.

## ADMIN SMOKE SPEC 46 — VOUCHERS + DOPORUČENÍ A ODMĚNY (13. 06. 2026, invariant)

Dedikovaný read-only admin smoke test `tests/e2e/46-admin-vouchers-referrals-smoke.spec.ts` (staging-only, self-skipping bez admin secrets). Commit `6d67fd2f`. Staging cílený běh `27465396025` (přes `only_spec`): 1 passed, run success.

- **Ověřuje:** `/admin/vouchers` načte s `Přehled voucherů`; `/admin/referrals` načte taby `Doporučení hráčů` a `Audit doporučení`; žádné neodchycené client-side chyby (`pageerror` listener).
- **Read-only (neměnit charakter):** žádné vytváření/editace voucherů, žádné vytváření/úprava invite rewardů, žádné e-maily, žádné SQL, žádný deploy. Login přes `loginViaUI` helper.
- Uzavírá test-only gap z P0 admin auditu. Affiliate Payouts a Partner Invoices nedotčeny.

## P0 CUSTOMER FLOW AUDIT — ✅ ZELENÝ PO SECURITY + INVOICE PRÁCI (13. 06. 2026)

P0 audit zákaznických flow dokončen po invite reward security práci a Partner Invoice úklidu. Staging behaviorálně ověřen, produkce pouze read-only.

- **Staging Full E2E run `27464656913` ✅:** 112 passed · 28 skipped · 0 failed (větev `main`).
- **Ověřené zákaznické flow:** registrace, login, profil, načtení peněženky, „Pozvi přátele"/vlastní invite data, stránka Hry, detail soutěže, stránka Voucher, stránka Zprávy, top-up/checkout otevření bez reálné platby, logout. 28 skipů non-blocking (partner offers cooldown, staging-only B2B/Partner Invoice specy, 1 záměrný registrační skip) — žádný zákaznický P0 flow neselhal.
- **Produkce `xkzhjldrojjlrkezorey` read-only:** zákaznické RPC přítomny s `authenticated` execute (`buy_ticket_atomic`, `ensure_referral_code`, `set_my_referrer_by_code`, `get_bob_enabled`, `redeem_miocoin_code`, `bump_user_last_seen`); policy `profiles`/`wallets`/`messages`/`contests`/invite reward tabulky scoped, žádné broad `USING (true)`; `vouchers` world-readable SELECT záměrný pro veřejný voucher katalog.
- **Žádný zákaznický blocker.** Bez změny souborů, bez SQL writes, bez deploye, bez e-mailů, bez plateb, žádná produkční data nezměněna.

## ADMIN TEST DASHBOARD — akce admin-create-test-user VYPNUTA (13. 06. 2026, invariant)

Po odstranění produkční Edge Function `admin-create-test-user` byla v admin test dashboardu vypnuta akce, která ji volala, aby admin neklikal na nefunkční/nebezpečné produkční tlačítko.

- **Soubor:** `src/tests/ComprehensiveAdminTestDashboard.tsx`. `createTestUser` už nevolá `supabase.functions.invoke('admin-create-test-user')`; místo toho zobrazí toast „Tento produkční test byl bezpečnostně vypnut." Tři tlačítka „Vytvořit Test User" přejmenována na „Produkční test vypnut".
- **Build ✅** `npm run build` exit 0. Commit `a7329fc7`.
- **Pravidlo (neměnit):** neobnovovat volání `admin-create-test-user` z UI bez přidání řádného admin guardu na samotnou Edge Function (a jejího bezpečného redeploye).
- Změna omezena na admin test UI. Žádné SQL, žádný deploy Edge Function, žádné e-maily, žádní uživatelé, customer app nedotčena. Affiliate Payouts a Partner Invoices nedotčeny.

## ADMIN-CREATE-TEST-USER ODSTRANĚN Z PRODUKCE (13. 06. 2026, invariant)

Edge Function `admin-create-test-user` byla odstraněna z produkce `xkzhjldrojjlrkezorey` (poslední otevřený bod invite reward security auditu, MEDIUM).

- **Důvod:** funkce měla `verify_jwt=false`, žádnou interní admin/superadmin autorizaci, používala service role a mohla zapisovat testovací data → byla volatelná bez autentizace.
- **Příkaz:** `supabase functions delete admin-create-test-user --project-ref xkzhjldrojjlrkezorey --yes`. Read-only ověření přes `list_edge_functions` potvrdilo, že slug v produkčním seznamu chybí.
- **Staging `dxmowysntemfqfnanxua`** tuto funkci nasazenou neměl a nebyl změněn.
- **Pravidlo (neměnit):** funkci `admin-create-test-user` NEnasazovat zpět na produkci bez řádného admin guardu (Authorization Bearer → `auth.getUser` → `user_roles` admin/superadmin). Zdrojová složka v repu zůstává; redeploy jen po přidání autorizace.
- Žádná produkční tabulková data nezměněna, žádné SQL, žádná jiná Edge Function nasazena/odstraněna, žádné e-maily, žádní uživatelé. Affiliate Payouts a Partner Invoices nedotčeny.
- Vedlejší efekt: interní admin test dashboard může zobrazit „function not found", pokud se klikne staré test tlačítko.
- **Invite reward security audit UZAVŘEN:** (1) CRITICAL wallet-minting RPC opraveno REVOKE; (2) HIGH invite reward RLS expozice opravena; (3) MEDIUM `admin-create-test-user` odstraněn z produkce.

## ODMĚNY ZA DOPORUČENÍ — STAGING SYNCHRONIZOVÁN S PRODUKČNÍMI FIXY (13. 06. 2026, invariant)

Staging `dxmowysntemfqfnanxua` byl synchronizován s již schválenými produkčními invite reward security fixy. Produkce `xkzhjldrojjlrkezorey` byla v tomto kroku **pouze read-only** a nebyla změněna.

- **Staging před syncem postrádal oba fixy:** (1) `create_referral_reward_from_wallet_credit(uuid,numeric)` stále povoloval execute pro `anon` i `authenticated`; (2) `referrals`, `referral_rewards`, `referral_codes` měly RLS zapnuté, ale **nula policy** (deny-all i pro vlastní data).
- **Aplikováno pouze na staging:** REVOKE `EXECUTE` na `create_referral_reward_from_wallet_credit(uuid,numeric)` od `anon`, `authenticated`, `public`; přidány stejné own-row + admin/superadmin SELECT policy jako na produkci na `referrals`, `referral_rewards`, `referral_codes`.
- **Staging postcheck ✅:** anon execute=false, authenticated execute=false, service_role execute=true; 6 SELECT policy; žádné broad `USING (true)`; payment reward triggery `create_referral_reward_from_payment` i `reverse_referral_reward_on_payment_status_change` zůstaly intaktní.
- **Staging Full E2E run `27459386337` ✅** — registrace/login, profil, peněženka, top-up/checkout (bez reálné platby), vlastní invite zobrazení zákazníka, admin invite přehled. Žádný rozbitý flow.
- **Pravidlo (neměnit):** staging i produkce musí pro tyto tři tabulky držet own+admin policy bez `USING (true)` a funkce `create_referral_reward_from_wallet_credit` nesmí mít anon/authenticated/public EXECUTE.
- Bez změny produkčních dat, bez reálných plateb, bez vytváření uživatelů, bez e-mailů, bez deploye, bez změny app kódu. Affiliate Payouts a Partner Invoices nedotčeny.
- **Otevřený bezpečnostní bod (NEOPRAVENO):** MEDIUM — Edge Function `admin-create-test-user` bez autorizace + service role.

## INVITE REWARD RLS — ✅ REGRESSION AUDIT PO PRODUKČNÍ OPRAVĚ (13. 06. 2026)

Regression audit after production invite reward RLS fix was completed on production project `xkzhjldrojjlrkezorey`. Verified read-only on production: `referrals`, `referral_rewards`, `referral_codes` now have exactly 2 scoped SELECT policies per table; no broad `USING (true)` policies remain; `wallets`, `profiles`, and `payments` policies stayed unchanged. Static code check confirmed only 4 frontend files read the 3 invite reward tables: `src/components/ReferralSection.tsx`, `src/pages/AdminReferrals.tsx`, `src/pages/AdminReferralDashboard.tsx`, `src/components/AdminReferralAudit.tsx`. Login, profile, wallet, top-up, voucher, and payment code do not depend on the changed tables. Edge Functions do not reference the changed invite reward tables. `create-stripe-checkout` remains JWT-gated and derives `user_id` server-side. `stripe-webhook` remains signature-verified and uses service-role path; wallet credit and `create_referral_reward_from_payment` are unaffected by tightened customer SELECT policies. Production smoke on post-fix commit `40df522b` passed at 2026-06-13 06:10 and confirmed registration/login still work. Conclusion: customer login safe; profile safe; wallet safe; top-up safe; payment/wallet credit path safe; own invite display safe; admin invite overview safe. No broken flow found. No production data was changed during the audit, no app code changed, no SQL writes, no deploy. Remaining open security item: MEDIUM — `admin-create-test-user` Edge Function lacks authorization and uses service role.

## ODMĚNY ZA DOPORUČENÍ — RLS OPRAVA EXPOZICE DAT (13. 06. 2026, invariant)

Navazuje na REVOKE opravu níže. HIGH nález z auditu: tabulky `referrals`, `referral_rewards`, `referral_codes` měly broad SELECT policy `USING (true)` (role `public`), takže každý přihlášený uživatel mohl číst cizí invite graf, kódy a částky odměn. **Opraveno a ověřeno na produkci `xkzhjldrojjlrkezorey`.**

- **Odstraněny** broad `*_read USING (true)` SELECT policy na všech třech tabulkách.
- **Přidány own-row SELECT policy (role `authenticated`):**
  - `referrals` → `referrer_user_id = auth.uid() OR referred_user_id = auth.uid()`.
  - `referral_rewards` → `referrer_user_id = auth.uid() OR referred_user_id = auth.uid()`.
  - `referral_codes` → `user_id = auth.uid()`.
- **Přidány admin/superadmin read-all policy:** `has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)`.
- **Postcheck ✅:** přesně 2 SELECT policy na tabulku, žádné `USING (true)` nezůstalo, anon/public nemá policy ani grant (deny).
- **Pravidlo (neměnit):** tyto tabulky NESMÍ mít zpět `USING (true)` / `public` SELECT policy. Admin referral UI čte plnou tabulku přes admin read-all policy; kódy se generují/čtou přes SECURITY DEFINER RPC (`ensure_referral_code`, `set_my_referrer_by_code`) které RLS obcházejí.
- **Rozsah:** žádná změna app kódu, žádný deploy, wallet/payment reward trigger nedotčen, Affiliate Payouts nedotčeny, Partner Invoices nedotčeny.
- **Otevřený bezpečnostní bod (NEOPRAVENO):** MEDIUM — Edge Function `admin-create-test-user` bez autorizace + service role.

## ODMĚNY ZA DOPORUČENÍ — KRITICKÁ PRODUKČNÍ OPRAVA (13. 06. 2026, invariant)

Bezpečnostní audit zákaznického invite reward flow odhalil a opravil kritickou díru na produkci `xkzhjldrojjlrkezorey`.

- **Funkce `public.create_referral_reward_from_wallet_credit(uuid, numeric)`** byla `SECURITY DEFINER` a EXECUTE měl `anon`, `authenticated` i `public`; bez autorizace volajícího, bez vazby na platbu, bez idempotence → kdokoli mohl připsat odměnu za doporučení a MioCoiny do peněženky bez reálné platby.
- **Aplikováno** (výslovné schválení Pavla): `REVOKE EXECUTE ON FUNCTION public.create_referral_reward_from_wallet_credit(uuid, numeric) FROM anon, authenticated, public;` Postcheck: anon=false, authenticated=false, service_role=true.
- **Pravidlo (neměnit):** tato funkce NESMÍ mít `anon`/`authenticated`/`public` EXECUTE. Odměny za doporučení vznikají VÝHRADNĚ přes legitimní platební trigger `create_referral_reward_from_payment` (idempotentní `ON CONFLICT (payment_id)`) — ten zůstal nedotčen. Nevracet EXECUTE grant zpět.
- **Otevřené body z auditu (NEOPRAVENO, vyžadují samostatné schválení):** (1) HIGH — invite reward tabulky `referral_rewards`/`referrals`/`referral_codes` mají široké SELECT policy (`USING (true)`) vystavující cizí data; (2) MEDIUM — Edge Function `admin-create-test-user` bez autorizace + service role.

## PARTNER INVOICES — ✅ PRODUKČNÍ TEST NOVÉ PDF AKTIVAČNÍ TABULKY OVĚŘEN + UKLIZEN (13. 06. 2026)

Produkční test invoice `OMA-20260003` byl vytvořen, PDF-generated, ověřen a odeslán přesně jednou. Pavel potvrdil, že e-mail dorazil a vše je správně. Invoice id: `75fc016e-5283-4801-a19f-0566a2aaa587`. Activation code/id: `TESTPDF20260613A` / `764ddcde-ff44-4c48-99fa-9ed9ef453818`. External order id: `TEST-PDF-OVERVIEW-20260613-5MC`. Invoice total: `5` MioCoins. `partner_invoice_lines` total: `5` MioCoins, 1 line. PDF overview total: `5` MioCoins. PDF export id: `48e44363-acde-4807-8d8c-ec3f85b5a8e7`. PDF obsahuje `Kontrolní přehled aktivací MioCoinů`, test activation code, test external order id a total `5`. E-mail byl odeslán přesně jednou na `eshop@onemil.cz`. Final status: `issued`. `paid_at`: `null`. `OMA-20260001` nebyla dotčena. Nic nebylo označeno jako zaplacené. Affiliate Payouts a nesouvisející systémy byly nedotčeny. **✅ CLEANUP PROVEDEN (13. 06. 2026, schválení Pavla):** smazány `partner_invoices`, `partner_invoice_lines` (1 řádek), `partner_invoice_exports`, `partner_coin_activations`, `partner_reward_codes` pro kód `TESTPDF20260613A`; storage objekt `partner-invoices/invoice-75fc016e-...-1781327271530.pdf` smazán. Postcheck: všechny cílové řádky = 0; `OMA-20260001` existuje a nebyla dotčena.

## PARTNER INVOICES — ✅ ADMIN RESEND BUTTON PŘIDÁN (12. 06. 2026)

Admin UI `src/pages/AdminInvoices.tsx` má tlačítko `Znovu odeslat` pouze pro partner faktury se stavem `issued`. Používá existující safe resend mode `send-partner-invoice-email` s `{ invoice_id, resend: true }`, nemění status, nenastavuje `paid_at` a neregeneruje PDF; pokud není dostupný existující PDF export, zobrazí toast `PDF faktura zatím není k dispozici.` Normální admin invoice UI už nezobrazuje status-only `Odeslat` ani `Označit jako zaplaceno`; draft se vystavuje přes skutečné e-mailové odeslání a paid se zde ručně nenastavuje. Lovable Publish byl ověřen na live webu s bundlem `index-DZZxPOk1.js`: `draft` ukazuje `Odeslat fakturu emailem`, `issued` ukazuje `Znovu odeslat`, `paid` nemá send/resend tlačítko. Při ověření nebyl odeslán žádný e-mail, žádný invoice status se nezměnil a `OMA-20260001` zůstává `issued`, `paid_at = null`. Manuální produkční resend faktury `OMA-20260001` na `eshop@onemil.cz` už byl proveden dříve po schválení Pavla. Affiliate Payouts nedotčeny.

## PARTNER INVOICES — ✅ PDF OVERVIEW PRODUKČNÍ FIX DOKONČEN (12. 06. 2026)

Production fix pro Partner Invoice PDF overview mismatch je kompletní na produkci `xkzhjldrojjlrkezorey`. Migrace `20260612125606_partner_invoice_line_snapshots.sql` byla aplikována jako verze `20260612132440`. Edge Function `generate-partner-invoice-pdf` byla nasazena jako verze `131`; `send-partner-invoice-email` byla později pro schválený jednorázový resend nasazena jako verze `123`. Faktura `OMA-20260001` už nezobrazuje chybný date-range activation overview. Protože jde o legacy fakturu s 0 invoice-linked rows, PDF používá safe fallback/no-detail overview místo zavádějících 15 MioCoins. Při PDF overview fixi nebyly odeslány žádné e-maily, nic nebylo označeno jako zaplacené a Affiliate Payouts byly nedotčeny. Production smoke prošel: run `27418726117`. Strict detail total = 5 pro legacy fakturu by vyžadoval samostatně schválený cílený backfill.

## PARTNER INVOICES — ✅ LIVE V PRODUKCI (12. 06. 2026, schválení Pavla)

Partner Portal fakturace opravena, staging-ověřena a **12. 06. 2026 nasazena na produkci `xkzhjldrojjlrkezorey`** (3 migrace + 2 EF + private bucket + Vault auto-PDF aktivace). Smoke ✅: 401/403 kontrakt, admin Generovat PDF (signed URL, `%PDF`), Odeslat fakturu emailem → pouze `eshop@onemil.cz` (OMA-20260001 `draft → issued`, nic paid), partner RLS own/foreign 5/0. Production smoke `27414185094` + P0 `27414186632` ✅. **Lovable Publish proběhl a post-publish ověření prošlo (12. 06. 2026):** live bundle `index-BKax3mKj.js`, admin „Generovat PDF" funguje po publishi (nový export row — jediná záměrná datová změna), partner PDF download přes signed URL live, e-mail znovu netestován (dřívější smoke pouze `eshop@onemil.cz`), nic paid, Affiliate Payouts nedotčeny. Finální rollout commit `f3d281c0`. **Partner Invoice fix je plně live end-to-end.**

**Aplikované staging migrace (soubory v repu, NEAPLIKOVAT na produkci bez schválení):** `20260612090000_partner_invoice_rls_policies.sql` (partner vidí jen vlastní faktury/exporty/řádky; admin UPDATE statusu) · `20260612093000_partner_invoice_enqueue_fix.sql` (chybějící overload `enqueue_partner_invoice_email(p_invoice_id uuid)` — cron volal neexistující signaturu, první reálná fakturace by spadla) · `20260612110000_partner_invoice_auto_pdf.sql` (hook `partner_invoice_post_create` = enqueue e-mail + best-effort PDF request přes pg_net+Vault; zapojen do `create_partner_invoices_for_last_week` i `_for_period`).

**Závazná pravidla (neměnit bez schválení Pavla):**
- EF `generate-partner-invoice-pdf` a `send-partner-invoice-email` autorizují: `x-internal-token` (automatizace/cron — stejný vzor jako joby 23/24) NEBO service-role bearer NEBO **admin/superadmin JWT** (UI fallback). **Žádný `VITE_INTERNAL_FUNCTION_TOKEN` v prohlížeči — nevracet.** `verify_jwt=false` v config.toml (auth řeší funkce interně).
- Bucket `partner-invoices` je na stagingu **private**; EF vrací 10letou signed URL (`createSignedUrl`), ne public URL. Na produkci přepnout na private při rolloutu — nevracet `getPublicUrl`.
- Partner faktury negeneruje a e-maily neposílá — pouze čte vlastní data (RLS) a stahuje PDF přes uloženou signed URL. `PartnerDashboard.downloadOfferInvoicePdf` čte `partner_invoice_exports`, NEVOLÁ EF.
- `send-partner-invoice-email` bez `RESEND_API_KEY` vrací řízený `503 email_service_not_configured` a NEMĚNÍ status faktury. Posílá jen pro status `draft`, po úspěchu `draft → issued`.
- Testovací e-mail příjemce při ověřování partner invoice flow je **výhradně `eshop@onemil.cz`** (aktualizováno 12. 06. 2026). Nikdy neposílat testovací faktury reálným externím partnerům, zákazníkům ani třetím stranám.
- Spec 43 (`43-partner-invoices.spec.ts`) a spec 44 (`44-partner-invoice-pdf-email.spec.ts`) musí zůstat zelené (run `27412464954`: 9 passed). Oba jsou staging-only a self-contained.

## NEJNOVĚJŠÍ STAV — DÁVKOVÉ VÝPLATY AFFILIATE/OBCHODNÍCH PROVIZÍ (10. 06. 2026)

Fáze A+B+C jsou aplikované a ověřené pouze na staging Supabase projektu `dxmowysntemfqfnanxua`. Produkce `xkzhjldrojjlrkezorey` je netknutá. Nebyl proveden web deploy, Lovable Publish ani full E2E.

Fáze C staging stav:
- DB migrace `20260610140000_affiliate_payouts_phase_c.sql` aplikovaná na staging.
- `affiliate_payout_documents` má nové PDF/e-mail auditní sloupce.
- `email_queue` má nové sloupce pro privátní storage přílohy a `attachment_required`.
- RPC existují: `prepare_affiliate_payout_document`, `finalize_affiliate_payout_document`.
- Edge Functions: `create-affiliate-payout-document` nasazená na staging, verze 1; `process-email-queue` nasazený na staging, verze 2.
- `settings.accounting_email = accounting-test@onemil.test`.
- Test `tests/e2e/41-affiliate-payout-documents.spec.ts`: `4 passed`.
- Cleanup testu 41 čistý: `email_queue`, `affiliate_accounts`, `affiliate_payout_documents` pro spec41 = 0.

Oprava během testu: `process-email-queue` už neinicializuje Resend při startu funkce; Resend se inicializuje až před skutečným odesláním. Required PDF příloha bez souboru skončí řízeně jako `failed`. Commit opravy: `6f998677c4fc5ccb085f9e511d625c58579d6f62`.

Fáze D / Air Bank export má připravený opravený reviewable návrh v repu, bez aplikace SQL, bez deploye Edge Function a bez zásahu do Supabase. Připraveno: migrace `supabase/migrations/20260610170000_affiliate_payouts_phase_d.sql`, Edge Function `generate-affiliate-bank-export`, UI detail dávky, cílený test `tests/e2e/42-affiliate-bank-export.spec.ts` a navazující úprava spec 40. Návrh používá prepare/finalize RPC, privátní bucket `affiliate-bank-exports`, Windows-1250, CRLF, částky v haléřích, VS max 10 číslic, KS `0000`, zprávu max 35 znaků a zpřísňuje flow na `created → exported → paid`. Review opravy (commit `7890dc0c745a0659354d0378a97fe35d4c9fd606`): ABO layout dle ČSAS specifikace (položka začíná účtem příjemce, bez debetního účtu), path-traversal regex, items-sum integrity check, `due_date` horní limit +364 dní. Vzorový soubor pro ruční importní test: `docs/affiliate-payouts/sample-bank-export/sample-onemil-20260625.kpc` — účet plátce `3151752019/3030` (Iconic Point s.r.o., Air Bank). **Importní test Air Bank ✅ SPLNĚN (10. 06. 2026):** Test 1 (fiktivní příjemci) → „K opravě" (neexistující účty). Test 2 (reálný příjemce `225259937/0600`, 1,00 Kč) → stav „Vytvořena", **žádné „K opravě"** ✅. Formát `.kpc` plně funkční; „K opravě" bylo artefaktem fiktivních účtů. Pavel žádnou platbu neodeslal. **Blokující podmínka importního testu je splněna. Fáze D DB migrace aplikována na staging `dxmowysntemfqfnanxua` ✅ (10. 06. 2026).** Postcheck OK: 5 export sloupců, 3 CHECK constrainty, index, RPC `prepare_affiliate_bank_export` (service_role only), `finalize_affiliate_bank_export` (service_role only), `mark_affiliate_payout_batch_paid` (authenticated+service_role), bucket `affiliate-bank-exports` privátní. Edge Function `generate-affiliate-bank-export` nasazena na staging ACTIVE verze 1, smoke bez JWT → 401 ✅. Test `tests/e2e/42-affiliate-bank-export.spec.ts`: `3 passed` ✅ (run `27301399760`). Test `tests/e2e/40-affiliate-payouts.spec.ts`: `4 passed` ✅ (run `27301606390`). **Fáze D staging ověření kompletní.** Produkce stále blokována. Do produkce nic nepřenášet bez výslovného schválení Pavla; nedělat deploy ani Lovable Publish.

**Fáze D.1 — APLIKOVÁNA NA STAGING ✅ (10. 06. 2026):** Migrace `supabase/migrations/20260610180000_affiliate_payouts_phase_d1.sql` aplikována **pouze na staging** `dxmowysntemfqfnanxua`. Produkce `xkzhjldrojjlrkezorey` nedotčena a blokována. Settings seed OK: `affiliate_payout_payer_account = 3151752019`, `affiliate_payout_payer_bank_code = 3030`. ACL OK: `create_affiliate_payout_batch` nemá `anon` EXECUTE (explicitní REVOKE proveden po aplikaci — Supabase přidává implicitní grant), `update_affiliate_payout_batch_meta` nemá `anon` EXECUTE. `create_affiliate_payout_batch` auto-filluje `payer_account`/`payer_bank_code` ze settings a `due_date = current_date + 2`. Nové RPC `update_affiliate_payout_batch_meta` (admin-only, FOR UPDATE, guard `status='created'`) umožňuje editaci před exportem; admin edituje v detailu `/admin/affiliate-payouts/:id`. `prepareBatchForExport` workaround odstraněn ze spec 42. Spec 42 `42-affiliate-bank-export.spec.ts`: **6 passed** (run `27303172376`, 42a–42f). Spec 40 `40-affiliate-payouts.spec.ts`: **4 passed** (run `27303389522`, žádné regrese). **Fáze D.1 staging ověření kompletní.** Do produkce nic nepřenášet bez výslovného schválení Pavla; žádný deploy ani Lovable Publish.

**Production rollout checklist (Phase A+B+C+D+D.1) — PŘIPRAVEN, NEAUTORIZOVÁNO (11. 06. 2026):** Plný checklist v `docs/affiliate-payouts/DESIGN.md` §17, shrnutí v `onemil_state.md`. Migration order (NE podle `ls`): A `20260609_…_phase_a` → B `20260610_…_phase_b` → B guard `20260610120000_…_temp_table_guard` → C `20260610140000_…_phase_c` → D `20260610170000_…_phase_d` → D.1 `20260610180000_…_phase_d1`; po D.1 ručně `REVOKE EXECUTE … create_affiliate_payout_batch FROM anon`; potvrdit settings (payer 3151752019/3030, produkční `accounting_email`). EF: `create-affiliate-payout-document`, `generate-affiliate-bank-export`, `process-email-queue`. Postchecks per-fáze (RLS, RPC, `mark_..._paid` vyžaduje `exported`, bucket privátní, service_role-only export RPC, žádný `anon` EXECUTE, advisors). P0 smoke + EF no-JWT→401. E2E staging: spec 40 (4), 41 (4), 42 (6) + Full E2E. Rollback reverzně D.1→A jen na prázdném datasetu; nemazat `dddddddd-…`. **⛔ FINAL GATE: produkce `xkzhjldrojjlrkezorey` BLOKOVÁNA dokud Pavel nedá nové výslovné písemné schválení.**

**Final readiness audit (11. 06. 2026) — ACL nález + patch NEAPLIKOVÁN:** Audit našel na stagingu implicitní `anon`+`authenticated` EXECUTE na `prepare_/finalize_affiliate_payout_document` a `next_affiliate_payout_document_number` (Fáze C funkce BEZ vnitřního auth guardu — reálná díra: každý přihlášený uživatel mohl vytvářet doklady a posouvat provize do `ready_to_pay`) + `anon` EXECUTE na `admin_set_affiliate_commission_status` a `cancel_affiliate_payout_batch` (defense-in-depth, mají `is_admin()`). Fix: migrace `20260611090000_affiliate_payouts_acl_patch.sql` (idempotentní REVOKE, 10 funkcí, v DESIGN.md §17 krok 7, nahrazuje manuální post-apply REVOKE) — **APLIKOVÁNA POUZE NA STAGING `dxmowysntemfqfnanxua` ✅ (11. 06. 2026, schválení Pavla)**. ACL postcheck prošel pro všech 10 funkcí (document/export RPC = service_role only; admin RPC bez `anon`). Post-patch ověření: spec 41 **5 passed** (run `27371575748`, vč. 41e ACL regression locku ✅), spec 42 **6 passed** (run `27372071508`). Spec 40 v tomto kroku záměrně nespuštěn. Po patchi žádné další SQL, žádný deploy, žádný Lovable Publish. Spec 41 po D/D.1 byl předtím ověřen i bez 41e: run `27370912054`, 4 passed. ⚠️ `process-email-queue` nemá vnitřní auth check — produkční redeploy musí zachovat `verify_jwt` kompatibilní s pg_cron job 16 (DESIGN.md §17.2). Buckets privátní ✅, RLS OK ✅, build ✅. **Full Staging E2E (11. 06. 2026) ✅ ZELENÝ — větev PRODUCTION-READY:** run `27372767070` — **123 passed · 4 skipped · 0 failed** (11m49s). Spec 40: 4 passed ✅ · Spec 41: 5 passed (incl. 41e ACL regression lock) ✅ · Spec 42: 6 passed ✅. Telegram OK doručen. Větev `codex/affiliate-payouts-audit` je plně staging-verified.

**🚀 PRODUKČNÍ ROLLOUT BACKENDU PROVEDEN (12. 06. 2026, výslovné písemné schválení Pavla):** Na produkci `xkzhjldrojjlrkezorey` aplikováno všech **7 migrací v pořadí** A → B → B guard → C → D → D.1 → ACL patch (per-migrace postchecky ✅). Settings: `accounting_email = divispavel2@gmail.com`, `affiliate_payout_payer_account = 3151752019`, `affiliate_payout_payer_bank_code = 3030` ✅. EF nasazeny: `create-affiliate-payout-document` v1 (`verify_jwt=true`), `generate-affiliate-bank-export` v1 (`verify_jwt=true`), `process-email-queue` v124 (`verify_jwt=false` — **MUSÍ zůstat false**: pg_cron job 16 volá bez Authorization headeru; ověřeno dotazem na `cron.job` + no-auth smoke 200). Postchecky ✅: 3 tabulky + RLS, oba buckety privátní, document/export RPC service_role-only, admin RPC bez `anon`, no-JWT smoke 401/401, advisors bez nových payout nálezů (admin RPC `authenticated SECURITY DEFINER` WARN = by design, `is_admin()` guard). Testovací řádek `dddddddd-…` nedotčen; žádný payout/platba/e-mail nevytvořen. **✅ PLNĚ DOKONČENO V PRODUKCI (12. 06. 2026):** Backend rollout (7 migrací + 3 EF + settings) ✅ · merge do `main` (commit `fc7c08ec`) ✅ · produkční smoke `27395842847` ✅ · P0 smoke `27395845092` ✅ · Lovable Publish (Pavel) ✅ · authenticated produkční UI smoke ✅: `/admin/affiliate-payouts` empty state, `/admin/affiliate-commissions`, `/admin/affiliate-accounts` — vše načte bez console errors. Žádná produkční data nezměněna. **Dávkové výplaty affiliate/obchodních provizí jsou LIVE.** **TEST flow E2E ověřen na produkci (12. 06. 2026, app neveřejná):** TEST provize `eeeeeeee-…` → doklad APD-2026-000001 → dávka APB-2026-000005 → `.kpc` export; e-mail s PDF přílohou doručen na `divispavel2@gmail.com` ✅, `influencer@onemil.c` řízeně failed (neplatná adresa) ✅; žádná platba, nic paid, `dddddddd-…` nedotčen; TEST artefakty smazány (2 orphan soubory zůstávají v privátních bucketech — lze ručně smazat ve Storage). Ponecháno: affiliate `cd74ff3a` `payout_account=12545857` + `payout_bank=0800` (batch RPC vyžaduje oddělený 4ciferný kód banky); Botanic TEST data (`[TEST DATA]` marker) — **nahradit reálnými údaji před veřejným spuštěním**.

## PRAVIDLO PRO SPOUŠTĚNÍ TESTŮ — ŠKÁLUJ ROZSAH (09. 06. 2026, závazné)

Když Pavel řekne „spusť test" nebo když se ladí konkrétní část aplikace, **NEspouštěj automaticky hned celý staging Full E2E** — je pomalý a při ladění jedné stránky zbytečně zdržuje.

**Správný postup:**
1. **Nejdřív spusť nejmenší relevantní test** — konkrétní spec (např. `npx playwright test tests/e2e/39-...`), případně jediný test přes `--grep "<title>"`.
2. **Když cílený test projde**, teprve potom **navrhni** celý staging Full E2E jako finální kontrolu.
3. **Celý staging Full E2E spusť automaticky jen:**
   - před finálním schválením větší změny,
   - před produkčním nasazením,
   - nebo když Pavel výslovně řekne, že chce celý test.
4. **U každého spuštění napiš, proč právě tento rozsah** (proč jen tento spec / proč už celý suite).

Toto pravidlo nemění P0 smoke povinnosti před Lovable Publish (viz sekce „OCHRANA PROTI REGRESÍM") — týká se volby rozsahu při běžném ladění.

## 🌿 SAMOSTATNÁ VĚTEV: DÁVKOVÉ VÝPLATY AFFILIATE/OBCHODNÍCH PROVIZÍ (09. 06. 2026, ROZPRACOVÁNO — návrh)

**Samostatná pracovní větev úkolu. Hlavní roadmapa OneMil se teď NEMĚNÍ. Po dokončení této větve se vrací do hlavního kmene.** Žádná implementace nasazená, žádná migrace aplikovaná, produkce nedotčena.

**Řeší:** dávkové výplaty provizí směrem **OneMil → obchodník/affiliate** (opačný směr než `partner_invoices` = firma→OneMil).

### Dohodnutá rozhodnutí Pavla (závazná pro tuto větev)
1. Admin **NEzadává ručně** datum platby, VS ani referenci — **systém generuje vše automaticky**.
2. Výplata se řeší **dávkou (batch)**, ne po jedné provizi. Tlačítko **`Označit jako vyplacené` je až na úrovni celé dávky**, NIKDY na jednotlivé provizi.
3. Systém automaticky generuje: výplatní doklad/samofakturu, číslo dokladu, VS/referenci, PDF, e-maily (obchodník + účetní), platební dávku, **export pro Air Bank**.
4. Admin jen: zkontroluje schválené provize → vybere k proplacení → vytvoří dávku → stáhne hromadný příkaz pro Air Bank → vloží do banky → odešle → označí celou dávku jako zaplacenou.
5. Doklad se vytvoří **po schválení provize**, hned se odešle obchodníkovi + kopie účetnímu OneMil. Po označení dávky jako zaplacené se posílá **potvrzení o zaplacení** (ne nový účetní doklad).
6. Souhlas se samofakturací = součást odsouhlasení podmínek partnerského/affiliate programu.
7. **Banka = Air Bank.** Importní formát (ABO vs. SEPA XML) **NUTNO OVĚŘIT — nedomýšlet.**
8. **Předchozí návrh `00a52bc0` (ruční reference/VS/datum) je NAHRAZEN a NESMÍ se aplikovat jako finální řešení.**
9. **Migrace `20260609_affiliate_commission_payout_evidence.sql` se NEMÁ aplikovat.**
10. Testovací řádek `dddddddd-dddd-dddd-dddd-dddddddddddd` (produkce, stav `paid`) **zatím nemazat.**

### Cílový workflow (8 stavů)
`calculated` → `approved` → `payout_document_created` (PDF doklad/samofaktura odeslán obchodníkovi+účetní) → `ready_to_pay` (doklad+bank.údaje+příjemce+částka validní) → `payment_batch_created` (admin vybere, systém vytvoří dávku) → `bank_export_generated` (export pro Air Bank) → `paid` (admin označí celou dávku po odeslání plateb) → `payment_confirmation_sent` (potvrzení obchodníkovi + souhrn účetní).

### Navržený DB model (jako soubory, NEAPLIKOVAT)
- `affiliate_payout_documents` (doklad/samofaktura: číslo, PDF URL, email stav, typ, vazba na provizi)
- `affiliate_payout_batches` (dávka: číslo, stav, datum, kdo vytvořil, kdo+kdy označil zaplaceno, export soubor)
- `affiliate_payout_batch_items` (položky: vazba na provizi, částka, účet příjemce, systémový VS/reference)
- rozšíření `affiliate_commissions`: vazba na batch, stav dokladu, confirmation timestamp, status CHECK o nové stavy
- číselné řady (doklady, dávky), storage bucket pro PDF, bezpečné úložiště pro bankovní exporty, RLS jen admin/superadmin (+ vlastník dokladu kde dává smysl)

### Navržené funkce/RPC
vytvoření dokladu · generování PDF · odeslání e-mailu s dokladem · vytvoření dávky · generování Air Bank exportu · označení dávky zaplacené · odeslání potvrzení o zaplacení.

### Navržené UI
rozšíření `/admin/affiliate-commissions` (výběr provizí) · nová `/admin/affiliate-payouts` · detail `/admin/affiliate-payouts/:id` · `Vytvořit platební dávku` · `Stáhnout hromadný příkaz` · `Označit dávku jako zaplacenou` · přehled dokladů/e-mailů/exportů.

### Nedodělané body (před implementací)
1. Ověřit **Air Bank importní formát** (ABO/SEPA XML — nedomýšlet). 2. Ověřit existující PDF generování (`generate-partner-invoice-pdf`). 3. Ověřit `email_queue` šablony. 4. Ověřit, kde je účetní e-mail OneMil. 5. Ověřit schéma `affiliate_commissions`, `affiliate_accounts`, `partner_invoices`, `email_queue`, storage bucketů, PDF funkcí. 6. Implementační plán po fázích. 7. Migrace jako soubory, NEAPLIKOVAT. 8. Testy nejdřív staging. 9. Produkce až po výslovném schválení Pavla.

**Rozsah je velký → výstup MUSÍ být po fázích, NIC nenasazovat bez průběžného schválení Pavla.** Navržené fázování: A (DB základ) → B (dávka + paid) → C (doklady + e-maily) → D (Air Bank export) → E (potvrzení).

**STAV (09. 06. 2026 — HANDOFF, implementace zastavena kvůli limitu Claude Code):** Fáze A návrh hotov, commit `6711e648`. Soubory `supabase/migrations/20260609_affiliate_payouts_phase_a.sql` (**NEAPLIKOVÁNO** staging/produkce) + `docs/affiliate-payouts/DESIGN.md` (kompletní návrh + **§11 handoff** pro pokračování v novém chatu/Codexu). Fáze B se nedělala. Air Bank ABO `.kpc` ověřen, přesný layout NUTNO POTVRDIT. **Před pokračováním čti `docs/affiliate-payouts/DESIGN.md` §11.**

## ADMIN STRÁNKA `Provize obchodníků` — FÁZE 1 (09. 06. 2026, invarianty)

**Live na produkci.** Route `/admin/affiliate-commissions`. Commit implementace `156519d5`, oprava PostgREST sloupců `e2e673e1`. Production smoke `27170849002` ✅.

**Zdroj dat:** `affiliate_commissions` WHERE `commission_type = 'company_invoice'`. JOIN `affiliate_accounts` (sloupec `name`, ne `full_name`). Firma přes `source_invoice_id` nebo `company_ref_id`; jinak `Neuvedeno`.

**Skutečné sloupce `affiliate_commissions`:** `amount_base_czk` (čistá provize), `vat_rate`, `amount_total_czk` (vč. DPH). Sloupce `amount_czk` a `commission_rate` NEEXISTUJÍ — nepoužívat.

**Fáze 2 (commit `508474fe`):** Schválit (`calculated→approved`) + Označit jako vyplacené (`approved→paid`) přes RPC `admin_set_affiliate_commission_status`. AlertDialog potvrzení před každou akcí. Přeskočení přechodu nebo rollback RPC odmítne. ABO export NENÍ součástí — vyžaduje schválení Pavla.

**Spec 39** (`tests/e2e/39-admin-affiliate-commissions.spec.ts`) — staging-only, 3 testy (39a stránka načte, 39b nadpis, 39c banner).

---

## B2B FAKTURACE A PROVIZE — INVARIANTY (08. 06. 2026)

**Produkčně ověřeno:** production smoke run `27168922017` ✅ success — commit `4a5a8d40`, 08. 06. 2026 21:44 UTC.
Celý B2B workflow (Botanic → Pavel vazba, emaily, nastavení hesla firmy, fakturace, provize, měsíční cron) funguje end-to-end na produkci `xkzhjldrojjlrkezorey`.

### Fakturační řetězec (ověřen E2E testem na produkci)

```
partner_reward_codes (vydání kódu)
  → partner_coin_activations (aktivace coinů zákazníkem, invoiced=false)
  → create_partner_invoices_for_period(from, to)   [pg_cron job 17, každou neděli]
      → partner_invoices (status='draft', coins × price_per_coin)
      → partner_coin_activations.invoiced = true
  → admin označí fakturu status='paid'
  → calculate_affiliate_commissions_for_month(měsíc)   [pg_cron job 25, 2. v měsíci]
      → affiliate_commissions (commission_type='company_invoice', 5 % z amount_ex_vat)
```

**Závazná pravidla (neměnit bez výslovného schválení Pavla):**
- Provize vzniká **výhradně** z `partner_invoices.status = 'paid'` — nikdy z registrace, schválení leadu ani ze samotné aktivace.
- `commission_type` pro B2B provize = `'company_invoice'` (CHECK constraint — nelze vložit jiný typ).
- Status flow provize: `calculated → approved → paid` — přechod je jednosměrný, rollback není možný po `approved`.
- `calculate_affiliate_commissions_for_month` maže jen `status='calculated'` záznamy před přepočtem — `approved` a `paid` jsou nedotčeny.
- `partner_coin_activations.code` má FK na `partner_reward_codes(code)` — přímý INSERT aktivace bez vydaného kódu selže.
- `partner_coin_activations.code` je UNIQUE — každý kód lze aktivovat pouze jednou.

### pg_cron job `affiliate_company_commissions_monthly` (jobid 25)

- **Schedule:** `0 3 2 * *` — 2. den v měsíci, 03:00 UTC
- **Command:** `SELECT public.calculate_affiliate_commissions_for_month(date_trunc('month', current_date - interval '1 month')::date);`
- **Migrace:** `supabase/migrations/20260608_affiliate_company_commissions_cron.sql`, commit `8d8de0c1`
- **Nasazeno:** produkce `xkzhjldrojjlrkezorey`, 08. 06. 2026, postcheck ✅
- **Rollback:** `SELECT cron.unschedule('affiliate_company_commissions_monthly');`
- **Neměnit** bez výslovného schválení Pavla.

### Přehled všech pg_cron jobů (08. 06. 2026)

| ID | Název | Schedule | Volá |
|----|-------|----------|------|
| 11 | forward_messages_to_sofinity | každou minutu | EF sofinity |
| 16 | process_email_queue_every_10_min | každých 10 min | EF process-email-queue |
| 17 | weekly_partner_invoices | neděle 02:00 | `create_partner_invoices_for_last_week()` |
| 18 | referral_inactivity_daily | denně 02:15 | `process_referral_inactivity()` |
| 20 | influencer_commissions_monthly | 1. v měsíci 02:00 | `calculate_influencer_commissions_current_month()` |
| 23 | process-event-queue | každou minutu | EF process_event_queue_worker |
| 24 | send_offer_reminders_daily | denně 08:00 | EF send-offer-reminders |
| **25** | **affiliate_company_commissions_monthly** | **2. v měsíci 03:00** | **`calculate_affiliate_commissions_for_month(...)`** |

### Zbývající mezery před ostrým B2B provozem

1. `source_invoice_id` a `company_ref_id` v `affiliate_commissions` jsou NULL — funkce nepropojuje provizi na konkrétní fakturu; audit je manuální.
2. Botanic `price_per_coin = 1.00 Kč` — default; nastavit reálnou smluvní cenu v `/admin/partners` před prvním ostrým fakturačním cyklem.
3. Botanic `payout_ready = false` — chybí platební údaje; doplnit v `/partner/dashboard`.
4. Botanic `billing_street/city/zip = NULL` — neúplná fakturační adresa.

## B2B LEADS — `create-affiliate-company-lead` INVARIANTY (07. 06. 2026)

Edge Function `create-affiliate-company-lead` je deployována na **STAGING ONLY** (`dxmowysntemfqfnanxua`). Produkce `xkzhjldrojjlrkezorey` nebyla dotčena.

**Závazná pravidla (neměnit bez výslovného schválení Pavla):**
- Funkce nesmí nikdy zapsat do `affiliate_company_refs` ani vytvořit provizi (`affiliate_commissions`).
- Do DB se ukládá **pouze hash tokenu** (`company_confirmation_token_hash`, SHA-256, 64 znaků); raw token se nikdy neperzistuje.
- Response nesmí obsahovat raw token — pouze `{ success, lead_id, status }`.
- Funkce vyžaduje: platný JWT (`supabaseAdmin.auth.getUser`), `affiliate_accounts.status = 'approved'`, `'sales_rep' = ANY(modes)`.
- Vytvoření leadu, potvrzení firmou ani schválení adminem nevytváří provizi. Provize vzniká pouze z placené aktivity firmy.
- Před nasazením na produkci: E2E/smoke spec pro backend flow + výslovné schválení Pavla.
- Staging testovací účet: `sales-rep-test@onemil.cz`, ref `TESTSR2026`, modes `["sales_rep"]` — pouze staging, nesahat.

Commit `b54fbb0e`. Happy-path staging test ✅ (07. 06. 2026).
Spec 34 (`tests/e2e/34-affiliate-company-lead-backend.spec.ts`) ✅ — Staging Full E2E run `27100946115`: 68 passed · 3 skipped · 0 failed. Commit `1ec3a127`.
**Před stavbou UI `Přidat firmu` musí spec 34 zůstat zelený. Produkční nasazení vyžaduje výslovné schválení Pavla.**

## B2B LEADS — PHASE 2B UI (07. 06. 2026, implementováno, staging only)

UI design schválen Pavlem. Implementováno v commitu `aaa2e092`. Spec 35 zelený — Staging Full E2E run `27102532004`: 71 passed · 3 skipped · 0 failed. Commit `fd8f4921`. DB, Edge Functions ani produkce nebyly změněny.

**Závazná pravidla:**
- `Přidat firmu` NIKDY na `/affiliate/login`. Patří pouze do `/affiliate/dashboard`, `sales_rep` / `Obchodník` mode.
- Zobrazit pokud `activeMode === 'sales_rep'` (UI modes check odstraněn 08. 06. 2026 — backend EF `create-affiliate-company-lead` stále vyžaduje `'sales_rep' = ANY(modes)`, neautorizovaný pokus → 403). Spec 35c aktualizován.
- UI musí volat POUZE Edge Function `create-affiliate-company-lead` — žádný přímý INSERT do `affiliate_company_leads` z klienta.
- Po odeslání formuláře: pouze toast + refresh leadů. Žádný zápis do `affiliate_company_refs`, žádná provize.
- „Žádosti o registraci firem" (sekce leadů) čte z `affiliate_company_leads`. „Moje firmy (schválené)" čte z `affiliate_company_refs`. Datové zdroje musí zůstat striktně odděleny.
- Spec 34 a spec 35 musí zůstat zelené. Produkce vyžaduje výslovné schválení Pavla + postcheck.

**Implementované komponenty:**
- `src/components/AddCompanyLeadDialog.tsx` — formulář; povinná: company_name, company_email; volitelná: ico, dic, website (https://), contact_person, contact_phone, sales_rep_note (max 2000 znaků).
- `src/components/CompanyLeadSection.tsx` — seznam leadů, badge stavů, trigger pro dialog.

**Spec 35** (`tests/e2e/35-affiliate-company-lead-ui.spec.ts`) ✅ — zelený. Self-contained (dynamické testovací uživatele). Pokrývá: 35a sales_rep vidí sekci; 35b dialog 8 polí + Zrušit; 35c influencer-only nevidí sekci.

## B2B LEADS — PHASE 2C IMPLEMENTOVÁNO + SPEC 36 ZELENÝ, MERGNUTO DO `main` (08. 06. 2026, staging only)

Company confirmation/rejection workflow **implementován a uzamčen zeleným staging E2E. Mergnuto do `main` (fast-forward). Produkce `xkzhjldrojjlrkezorey` NEDOTČENA.** Žádný Lovable Publish, žádný production EF deploy, žádná production DB změna. **Produkční rollout vyžaduje výslovné schválení Pavla.**

- Finální commit na `main`: `f1999b9fe980737f78de5f82d28817db458044b0` (`f1999b9f`).
- Merge fast-forward z dočasné větve `fix/spec36-reject-retry` (po merge smazána lokálně i na originu). Jediná mergnutá změna z větve byla **test-only** `tests/e2e/36-affiliate-company-lead-confirm.spec.ts`.
- Poslední zelený staging Full E2E run `27123113289`: **82 passed · 3 skipped · 0 failed**. Spec 34 ✅, spec 35 ✅, spec 36 ✅ (11/11).

**Edge Function `confirm-affiliate-company-lead` (`supabase/functions/confirm-affiliate-company-lead/index.ts`):**
- PUBLIC — bez JWT (`verify_jwt = false` v `supabase/config.toml`); firma kliká link z e-mailu jako neautentizovaný návštěvník. DB přes service-role.
- GET `?token=RAW_TOKEN` → validuje hash, vrátí `{ success, company_name, sales_rep_name, expires_at }`.
- POST `{ token, action: "confirm" | "reject", rejection_reason? }` → atomická UPDATE `WHERE status='sent_to_company'`:
  - confirm: `status = 'pending_admin_approval'`, nastaví `company_confirmed_at`, `submitted_to_admin_at`, `company_confirmation_used_at`, smaže token hash.
  - reject: `status = 'company_rejected'`, nastaví `company_rejected_at`, `company_confirmation_used_at`, `company_rejection_reason`, smaže token hash.
- Token: 404 invalid / 410 expired / 409 already-processed. Race condition ochrana: UPDATE vrátí 0 řádků → HTTP 409. Použitý token (hash NULL po confirm/reject) → lookup nenajde řádek → 404.
- NIKDY: INSERT do `affiliate_company_refs`, `affiliate_commissions`, vytváření/aktivace partner účtu, `partners.referred_by_affiliate_id`, password setup link, vracení raw tokenu ani hash.

**Veřejná stránka `src/pages/CompanyLeadConfirm.tsx`:**
- Route `/partner/invite` — public (přidána do `App.tsx` + do allowed listů affiliate i influencer — useEffect guard i render guard).
- Zobrazí summary žádosti, tlačítka `Potvrzuji žádost` / `Zamítnout žádost`, loading/success/error stavy. Reject má volitelný textarea s důvodem.

**Email URL**: `create-affiliate-company-lead` nyní generuje `/partner/invite?token=X` (změněno z `/affiliate/company-lead/confirm`).

**Žádná nová DB migrace** — Phase 1 schema obsahuje všechny potřebné sloupce.

**Spec 36** (`tests/e2e/36-affiliate-company-lead-confirm.spec.ts`): staging-only, self-contained, 11 testů (36a–36k). Backend: confirm, reject, expired, used→404, invalid→404, no-partner/refs/commission, GET info. UI (`/partner/invite`): confirm, reject, expired, invalid stavy.
- **Pravidlo (neměnit zpět):** spec 36i reject UI používá `dispatchEvent('click')` uvnitř `expect(...).toPass()` retry bloku — `.click()` čeká na stabilitu a re-rendery stránky klik nikdy nedispatchly; `dispatchEvent('click')` vystřelí bublající event okamžitě, React 18 root-delegated listener ho chytí.
- Spec 34 email assertion opravena na `/partner/invite`. Spec 34 a spec 35 musí zůstat zelené.

## PHASE 2D — Admin approval flow for confirmed B2B company leads (08. 06. 2026, Bloky 1–4 ✅ KOMPLETNÍ na staging, G1+G2+G4+G5 ✅ splněny — čeká G3 Lovable Publish, výslovné schválení Pavla)

**Phase 2D — Bloky 1–4 kompletní na staging. Staging Full E2E run `27139244907`: 95 passed · 3 skipped · 0 failed. Spec 34 ✅, 35 ✅, 36 ✅, 37 ✅ (13/13). Finální commit `468ecfc8`. Produkce `xkzhjldrojjlrkezorey` nedotčena zápisem mimo schválené gates. Produkční rollout: G1 ✅ DB/RPC migrace + postcheck (08. 06. 2026); G2 ✅ EF smoke (08. 06. 2026); G4 ✅ generateLink staging test (08. 06. 2026); G5 ✅ email queue staging test (08. 06. 2026). Čeká pouze G3 Lovable Publish + P0 smoke — vyžaduje výslovné schválení Pavla.**

**Cíl:** admin schvaluje/zamítá company leady ve stavu `pending_admin_approval` (po company confirm z Phase 2C).

**Závazná pravidla (neměnit bez výslovného schválení Pavla):**
1. Admin vidí **pouze** leady se stavem `pending_admin_approval`.
2. Admin může **approve** nebo **reject**.
3. **Approve musí:** vytvořit/aktivovat company partner účet; propojit lead na `partner_id`; nastavit lead status `approved` (+`approved_at`, `admin_reviewed_by`, `admin_reviewed_at`); zapsat atribuci `affiliate_company_refs.source='company_lead'`; zrcadlit do `partners.referred_by_affiliate_id`; poslat bezpečný password setup link; **NIKDY** neposílat vygenerované heslo.
4. **Reject musí:** nastavit status `admin_rejected` (+`admin_rejection_reason`, `admin_reviewed_by`, `admin_reviewed_at`); **NE**vytvořit partnera; **NE**vytvořit atribuci; **NE**vytvořit provizi.
5. **Provize** pouze z placené/fakturované aktivity firmy (`partner_invoices` → `affiliate_commissions.commission_type='company_invoice'`), nikdy z approve.
6. Status přechody: `pending_admin_approval → approved` nebo `pending_admin_approval → admin_rejected`. Guard `WHERE status='pending_admin_approval'`, 0 řádků → 409. Zakázáno: `sent_to_company → approved`, approve z `company_rejected`/`expired`/`admin_rejected`, mutace po `approved`.

**Implementační bloky (v tomto pořadí):**

**Blok 1 — DB/RPC ✅ NASAZENO NA STAGING** (migrace `20260608_approve_affiliate_company_lead_txn.sql` + `20260608_approve_affiliate_company_lead_txn_harden.sql`, commit `f093e22c`):
- **`approve_affiliate_company_lead_txn`** — SECURITY DEFINER, `SET search_path=''`, `GRANT EXECUTE TO authenticated`. Atomický approve/reject, `FOR UPDATE` status guard, idempotentní INSERT `partners`, best-effort atribuce (`EXCEPTION WHEN OTHERS` — nikdy neshodí approve).
- **`record_affiliate_company_ref_by_id`** — SECURITY DEFINER, `SET search_path=''`, **interní: `EXECUTE` pro `anon` i `authenticated` explicitně odebráno** (hardening). Voláno výhradně z `approve_affiliate_company_lead_txn` přes SECURITY DEFINER context. **Neměnit toto nastavení grantů.**
- Stará `record_affiliate_company_ref(text, uuid)` — **nedotčena**.
- Nullable `affiliate_id` → atribuci přeskočit (best-effort). Approve nikdy neshodit.
- Žádná nová DB migrace na sloupce — Phase 1 schema má vše. Produkce nedotčena.

**Blok 2 — Edge Function ✅ NASAZENO NA STAGING** (commit `c36410eb`, `supabase/functions/approve-affiliate-company-lead/index.ts`, `supabase/config.toml` `verify_jwt = false`):
- Admin JWT guard: `Authorization: Bearer <JWT>` → `auth.getUser` → `user_roles IN ('admin','superadmin')`. 401/403 pokud nesplněno.
- Request: `POST { lead_id, action, rejection_reason? }`. Response: `{ success, lead_id, status }` — nikdy heslo/token/hash. 5xx masked jako `internal_error`.
- Approve: načíst lead (status guard) → `createUser` bez hesla (nebo reuse existujícího auth user) → kolize s partnerem → 409 → RPC → `generateLink` (nikdy nelog/nevrátit) → `email_queue` best-effort. `generateLink` selhání = `setup_link_pending:true`.
- Reject: status guard → RPC `action='reject'`. Žádný `createUser`, žádný `generateLink`.
- Kolize emailu (existující partner) → 409 `company_email_already_has_partner_account`.
- Smoke ✅: no JWT → 401, invalid JWT → 401/`invalid_authorization_token`, missing header → 401/`missing_authorization_header`.

**Blok 3 — Admin UI ✅ IMPLEMENTOVÁNO** (commit `2a81db8f`, `src/pages/AdminCompanyLeads.tsx` + `adminNavConfig.ts` + `AdminContextSubNav.tsx` + `App.tsx`):
- Route `/admin/company-leads` (inside AdminLayout). `adminNavConfig.ts`: `Building2`, `companyLeads` entry, `users` sekce, routing.
- Nav badge: `pendingCompanyLeadsCount` polled 60 s přes supabase count query, červený badge na `Žádosti firem` když > 0.
- Schválit: confirm dialog → POST EF `{action:'approve'}` → toast (+`setup_link_pending` varování) → refresh. Zamítnout: dialog + povinný `rejection_reason` max 1000 znaků → POST EF `{action:'reject', rejection_reason}` → toast → refresh.
- Data přes SELECT `WHERE status='pending_admin_approval'`. **Žádný client INSERT/UPDATE — vše přes EF.**
- `npm run build` ✅ exit 0. Produkce nedotčena.

**Blok 4 — Spec 37 ✅ ZELENÝ** (`tests/e2e/37-affiliate-company-lead-admin-approval.spec.ts`, commit `468ecfc8`):
- Staging-only, self-contained, 13 testů (37a–37m). Vzor jako spec 36 (insertLeadDirect, dynamické testovací účty).
- 37a–37j backend: approve, partner vznik, refs `source='company_lead'`, nullable approve, reject, reject→žádný partner/refs, duplicate approve→409, špatný status→409, non-admin→403, anon→401.
- 37k–37m admin UI: vidí lead, Schválit → zmizí, Zamítnout s důvodem → zmizí.
- **Invarianty spec 37 (neměnit):**
  - `loginAsAdmin` volá `await page.waitForLoadState('networkidle', { timeout: 15_000 })` po `waitForURL(/\/admin/)` — zajišťuje, že Supabase session je plně v localStorage před `callApproveEF`. Bez toho vrací `getSession()` null → EF se neodesílá.
  - UI testy 37l/37m používají `Promise.all([page.waitForResponse(...POST EF..., {timeout:20s}), click])` pro explicitní čekání na HTTP odpověď z EF před assertionem `not.toBeVisible`. Neměnit zpět na prostý click.
- Spec 34/35/36/37 musí zůstat zelené. Staging Full E2E run `27139244907`: **95 passed · 3 skipped · 0 failed** ✅.

**Staging rollout pořadí:** Blok 1 → Blok 2 → Blok 3 → Blok 4 ✅ DOKONČENO.

**Produkční rollout gates** (každý vyžaduje výslovné schválení Pavla): G1 ✅ DB/RPC postcheck (08. 06. 2026, produkce); G2 ✅ EF smoke (08. 06. 2026, produkce — bez JWT→401, neplatný JWT→401, invalid token→404); G3 ⏳ Lovable Publish (P0 smoke zelený) — čeká schválení Pavla; G4 ✅ `generateLink` ověřen na stagingu (34 approve emailů, jednorázový recovery token, bez hesla); G5 ✅ email queue ověřen na stagingu (6 invite + 34 approve emailů, commission_count=0). **Detailní rollout checklist (pořadí operací, SQL, curl příkazy, rollback plán) je v `onemil_state.md` → sekce Phase 2D.**

**Rizika:** nullable `affiliate_id` (best-effort, approve nikdy neshodit); email kolize (idempotence check před `createUser`); `generateLink` selhání po approve (best-effort, `setup_link_pending`); race condition (`FOR UPDATE`); `createUser`+RPC atomicita (retry idempotence); `generateLink` typ ověřit pouze na stagingu bez změny produkční Auth konfigurace.

**Rollback staging:** EF delete + git revert UI + DROP FUNCTION. Data leadů nedotčena.

**Phase 2A–2D KOMPLETNÍ V PRODUKCI (09. 06. 2026). Lovable Publish ✅. Pavel ověřil celý flow v produkci.**

## PARTNER PASSWORD SETUP FLOW — INVARIANTY (09. 06. 2026)

Po admin approve firma dostane email s jednorázovým Supabase recovery linkem (`type: "recovery"`, `redirectTo: PARTNER_SET_PASSWORD_URL`). Kliknutím přistane na `/partner/set-password`.

**Závazná pravidla (neměnit bez výslovného schválení Pavla):**
- `isPasswordRecovery: boolean` je součástí `AuthContext` (nastaveno v `onAuthStateChange` batchem s `user` — React 18 batch zajišťuje viditelnost ve stejném renderu jako `user`).
- `isPasswordRecovery` se nastavuje na `true` při `PASSWORD_RECOVERY` eventu.
- `isPasswordRecovery` se resetuje na `false` při `USER_UPDATED` eventu (po úspěšném `updateUser` — jinak App.tsx efekt opakovaně redirectuje zpět na set-password).
- Route guard (`useEffect` i render guard) musí vracet/přeskočit redirect dokud `isPasswordRecovery === true`.
- `/partner/set-password` musí být v allowed lists všech guard bloků v `App.tsx` (influencer useEffect/render, affiliate useEffect/render).
- Recovery link se nikdy neloguje ani nevrací v API response — pouze se vloží do `email_queue`.
- `SITE_URL` env var v EF `approve-affiliate-company-lead` umožňuje staging override (default `https://onemil.cz`).

Commity: `7ec4253a` (stránka + spec 38), `0759c04f` (race condition fix), `f1236405` (USER_UPDATED reset).

## SPRÁVA SOUTĚŽÍ — statistické karty jen z `active` (06. 06. 2026, admin UI invariant)

Pět statistických karet v `AdminContestManagement.tsx` (`Tikety prodány`, `Tikety zbývají`, `Prodáno %`, `Výnos (MC)`, `Tikety za 24h`) počítá **`summaryTotals` pouze ze soutěží `status === 'active'`** (`contests.filter(c => c.status === 'active')`). pending/draft/paused/closed/archiv se nezapočítávají; bez active soutěže = 0. Taby a tabulka soutěží beze změny. Commit `d212dff7`.

## DETAIL SOUTĚŽE — badge věcných výher (06. 06. 2026, UI invariant)

Karty věcných bonusových výher (`src/pages/ContestDetail.tsx`) mají badge počtu (`N× v soutěži`) jako **pill s přesahem přes horní pravý roh**: Energy Orange→Warm Amber gradient, tmavý kontrastní bold text, stín/glow + ring, `z-10`. Karta proto **nemá `overflow-hidden`** (přesah by se ořízl); pozadí karty klipuje `border-radius`, vnitřní obrázek má vlastní rounded wrapper. Vizuál only. Commit `dafe0064`.

## DETAIL SOUTĚŽE — MioCoin/bonus souhrn (06. 06. 2026, invariant)

`src/pages/ContestDetail.tsx` MioCoin box: „V této soutěži je celkem **X** dalších výher." + „Z toho **Y** MioCoinů…". **X** = count `bonus_prizes` (amount>0) + count `bonus_prizes` (amount null/0). **Y** = celková MioCoin částka (RPC `get_contest_miocoin_bonus`, fallback `contests.total_miocoin_bonus`). **Partner Offers se do X ani Y nezapočítávají** (nejsou v `bonus_prizes`, mohou přibývat během soutěže). Frontend display/counting only. Commit `208434d0`.

## OCHRANA PROTI REGRESÍM — ZÁVAZNÉ SYSTÉMOVÉ PRAVIDLO (05. 06. 2026)

**OneMil se NEHLÍDÁ ručně. Každá větší změna MUSÍ být chráněná testem, smoke testem nebo vědomě schválenou výjimkou Pavla.**

### 1. Definition of Done — změna NENÍ hotová, dokud:
1. `npm run build` projde (exit 0);
2. proběhl **relevantní E2E/smoke test** podle oblasti změny (zeleně, staging);
3. je **ověřeno, že se nerozbily související části** (sousední oblasti v mapě níže);
4. **DB / migrace / Edge Functions / Bob prompt** mají **samostatné výslovné potvrzení Pavla** (+ produkční postcheck);
5. **dokumentace** (`onemil_state.md`, `onemil_history.md`, `CLAUDE.md`) je aktualizovaná;
6. **commit je pushnutý**. (Produkce se projeví až po **Lovable Publish** — live build ≠ `main`, dokud se nepublikuje.)

### 2. Minimální P0 smoke PŘED každým Lovable Publish:
- registrace / login (spec 01, 02),
- login gating dle typu účtu (spec 33, 14),
- nákup ticketu (spec 04),
- výhra (spec 05),
- peněženka / balance (spec 09, 03-voucher),
- zprávy admin ↔ uživatel (spec 29, 32),
- Bob ON/OFF kontrakt (spec 31).
Pokud se měnila konkrétní oblast → **+ celý blok té oblasti**.

#### Dva GitHub Actions workflow proti stagingu (stejné staging secrets):
- **`playwright-staging.yml` — „Playwright Staging Full E2E"** = KOMPLETNÍ kontrola (všech 33 speců). `workflow_dispatch` + 3×/den.
- **`playwright-staging-p0.yml` — „OneMil Staging P0 Smoke"** = RYCHLÁ kontrola PŘED Lovable Publish. `workflow_dispatch` only. Spouští jen P0 specy: `01,02` (registrace/login), `33,14` (login gating), `04` (ticket), `05` (výhra), `09,03-voucher` (peněženka/balance), `29,32` (zprávy admin↔uživatel), `31` (Bob ON/OFF kontrakt).
- **Před každým Publish běží minimálně P0 Smoke.** Pokud se měnila konkrétní oblast, pustí se k tomu navíc relevantní testy té oblasti (mapa v `onemil_state.md`), případně celý Full E2E.

### 3. Každá kritická oblast MUSÍ mít test NEBO vědomě schválenou výjimku:
přihlášení · soutěže · hraní · dobíjení · peněženka · výhry · zprávy · Bob · affiliate · partneři · admin.

### 4. Bob pravidlo (neměnné bez samostatného schválení):
- **neměnit prompt**, **neměnit CTA routing**, **neměnit formát `{ text, cta }`**;
- testovat pouze **kontrakt** (formát, CTA jen na povolené cesty `/games`,`/wins`,`/vouchers`,`/profile`, OFF→ai-chat se nevolá), **nikdy přesný text odpovědi**.

### 5. Pravidlo přístupu k cizím oblastem
`buy_ticket_atomic`, platby, event/push pipeline, provize a Bob prompt se **nemění bez výslovné instrukce**. Neznámou oblast nejdřív zmapuj (mapa kritických oblastí v `onemil_state.md`), pak měň.

## LOGIN — ROZHODNUTÍ O VSTUPECH DLE TYPU ÚČTU (05. 06. 2026)

**Závazná pravidla pro přihlašování. Neměnit bez výslovného schválení Pavla.**

- `/affiliate/login` (`AffiliateLogin.tsx`) = **samostatný vstup pro Affiliate účet** — pustí jen účet s `affiliate_accounts` řádkem, jinak hláška + signOut.
- `/partner/login` (`PartnerLogin.tsx`) = **samostatný vstup pro Partner účet** — pustí jen účet s `partners` řádkem, jinak hláška + signOut.
- `/login` (`Login.tsx`) = **zůstává SDÍLENÝ**, protože přes něj chodí také **admin/superadmin**. **NESMÍ se uzavřít jen pro soutěžící**, dokud neexistuje spolehlivý DB signál „soutěžící účet".
- **Admin check MUSÍ být VŽDY první** (po signIn, před jakoukoliv partner/affiliate/competitor kontrolou) a **admin nesmí být NIKDY blokován** kvůli partners/affiliate záznamu (multi-role admin musí projít).
- **`profiles`/`wallets` NEJSOU spolehlivý signál soutěžícího** — mají je i partneři (4/4) i affiliate (3/3); na `auth.users` není trigger. Signál „soutěžící" zatím **neexistuje a nevymýšlí se**.
- **Budoucí oddělení `/login`** (striktní competitor-only) vyžaduje **samostatně schválenou migraci/signál** (např. role `competitor` v `user_roles` nebo flag `profiles.registered_as_customer`) **+ backfill** existujících soutěžících PŘED zapnutím blokování.
- Multi-role: každý login gatuje na svůj záznam; účet projde jen tam, kde má odpovídající registraci. Zamčeno spec 33. Commity `48413dee`, `4748042d`.

## BOB ON/OFF PŘEPÍNAČ — FÁZE 1 V PRODUKCI (04. 06. 2026)

**Admin globálně vypíná/zapíná Boba. Migrace `20260604_get_bob_enabled_rpc.sql` APLIKOVÁNA na produkci `xkzhjldrojjlrkezorey`.**

- Flag `settings.bob_enabled` ('true'/'false', default true) + RPC `get_bob_enabled()` (SECURITY DEFINER, vrací JEN boolean, žádné secrety, EXECUTE authenticated). Customer čte přes RPC; admin zapisuje přes settings upsert.
- Frontend: `useBobEnabled.ts`, Switch v `/admin/messages`, oranžový pulz na nav „Zprávy" při OFF, `Messages.tsx` při OFF routuje na admin (ai-chat se NEvolá) + sonner handoff toast.
- **Bob prompt / CTA routing / handlery / `{ text, cta }` formát ani ai-chat kód NEMĚNIT** — přepínač Boba nesahá do AI logiky, jen routuje mimo něj.
- **Pravidlo:** handoff hláška v `Messages.tsx` používá sonner (`toast as sonnerToast`), ne shadcn — shadcn `use-toast` se tam nerenderoval. Neměnit zpět.
- Zamčeno spec 31 (serial — sdílí globální flag). Staging E2E `26977917782`: 57 passed. Commit `c0842894`. Vyžaduje Lovable Publish.

## ADMIN AFFILIATE SOCIAL — DVĚ ADMIN STRÁNKY, ZDROJ = affiliate_accounts (04. 06. 2026)

**Existují DVĚ admin stránky pro affiliate/influencery:**
- `/admin/influencers` (`AdminInfluencers.tsx`, nav „Affiliate partneři") — legacy, čte `partners`. **Social NOVĚ čte z `affiliate_accounts`** (přes `auth_user_id`, `openDetail` → `fetchAffiliateProfile`), fallback `partners.notes.social_networks` / `partners.website_url`.
- `/admin/affiliate-accounts` (`AdminAffiliateAccounts.tsx`, nav „Affiliate účty (v2)") — Affiliate v2, čte `affiliate_accounts` přímo.

**Zdroj pravdy pro affiliate social je `affiliate_accounts`** (affiliate edituje v `/affiliate/dashboard`). Pokud admin vidí social prázdné, ověř, že stránka čte affiliate_accounts, ne partners.notes. Social = klikací odkazy, žádné embed/iframe/video/API. Zamčeno spec 30. Commit `fb3dab91`.

## ADMIN MESSAGING — OBNOVENA ADMIN INSERT RLS POLICY (03. 06. 2026, STAGING)

**Admin nemohl poslat zprávu (affiliate ani jinému) uživateli — „Zprávu nelze odeslat".**

- Root cause: `public.messages` INSERT policies měly jen `messages_insert` (authenticated, `auth.uid()=user_id`) + `messages_insert_system` (service_role). Chyběla admin policy → admin reply s `user_id≠auth.uid()` RLS odmítl. Postihovalo VŠECHNY admin reply.
- Fix: migrace `20260603_messages_admin_insert_policy.sql` → policy `messages_insert_admin` (authenticated admin/superadmin přes `user_roles`). **STAGING ✅ + PRODUKCE ✅ APLIKOVÁNO 04. 06. 2026** (postcheck: admin insert affiliate = povolen, běžný uživatel za admina = odmítnut).
- Příjemce admin zprávy affiliate = `affiliate_accounts.auth_user_id` (= `auth.users.id`, FK target `messages.user_id`), NE `affiliate_accounts.id`.
- Frontend: `AdminAffiliateAccounts` SELECTuje `auth_user_id` + tlačítko „Napsat zprávu" → `/admin/messages/<auth_user_id>`.
- **Pravidlo:** nemazat/nenahrazovat `messages_insert_admin` policy — bez ní selže veškeré admin odesílání zpráv.
- Zamčeno spec 29. Staging E2E `26915631607`: 53 passed. Commit `ee17440e`.

## AFFILIATE v2 — ADMIN SOCIAL ZOBRAZENÍ: ODSTRANĚN TICHÝ FALLBACK (03. 06. 2026)

**Admin viděl social pole (YouTube aj.) prázdné, ač byla v DB. Data se ukládala správně — chyba byla jen v zobrazení.**

- Root cause: `AFFILIATE_ACCOUNT_SELECT_FALLBACK` v `AdminAffiliateAccounts.tsx` a `AffiliateDashboard.tsx` tiše vynechával social sloupce; aktivoval se při selhání primárního SELECTu (stale PostgREST schema cache po migraci).
- Fix: fallback **odstraněn** — obě stránky vždy SELECTují plnou sadu social sloupců. Sloupce trvale existují (staging+produkce). Žádná DB/RPC/migrace změna. Social = jen text (`<p>`), žádné embed/iframe/video/API.
- **Pravidlo:** nevracet SELECT fallback, který vynechává social sloupce — tiše skrývá uložená data.
- Zamčeno spec 23 (admin detail social) + spec 28 (dashboard save/readback). Staging E2E `26914578757`: 52 passed. Commit `2d838dd5`.

## AFFILIATE v2 — SOCIAL/PROFIL POLE EDITOVATELNÁ (03. 06. 2026, PRODUKCE)

**`/affiliate/dashboard → Profil` umožňuje editovat všechna profilová/social pole. Nasazeno na STAGING I PRODUKCI (`xkzhjldrojjlrkezorey`). E2E zelený.**

- Frontend `src/components/AffiliateProfileSection.tsx`: sekce „Sociální sítě a dosah" s editovatelnými inputy (web/IG/TikTok/YT/FB/velikost publika/kategorie). Read-only jen „Účet" souhrn (zaměření, ref kód, stav, registrační e-mail). Social pole = **jen text, žádné embed/iframe/video/API/autoplay** — neměnit.
- RPC `update_affiliate_own_profile` rozšířeno na **19-arg** (+6 NULL-preserving social params: NULL=ponech, ''=smaž). Stará 13-arg signatura dropnuta. Migrace `20260603_affiliate_profile_update_social_fields.sql`.
- **Staging `dxmowysntemfqfnanxua`:** aplikováno ✅. **Produkce `xkzhjldrojjlrkezorey`:** APLIKOVÁNO 03. 06. 2026 ✅ (postcheck: jediná 19-arg SECURITY DEFINER funkce, authenticated EXECUTE, 7 social sloupců, 3 záznamy nedotčeny, RLS zapnuté).
- Staging Full E2E run `26913262729`: 52 passed, 0 failed. Commits `09f01916`, `e2f5e24c`.
- Nezměněno: provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`. Žádné Edge Functions.

## AFFILIATE v2 — REGISTRAČNÍ / SOCIAL POLE V PRODUKCI (03. 06. 2026)

**Migrace `20260603_affiliate_registration_profile_fields.sql` APLIKOVÁNA na produkci `xkzhjldrojjlrkezorey` (výslovné schválení Pavla).**

- `affiliate_accounts` má 6 nových nullable text sloupců: `instagram_url`, `tiktok_url`, `youtube_url`, `facebook_url`, `audience_size`, `content_categories` (+ existující `website_url`).
- Nová 12-arg overload RPC `register_affiliate_account` (SECURITY DEFINER). Stará 5-arg overload PONECHÁNA — drop-old-signature migrace (`20260603_affiliate_registration_rpc_drop_old_signature.sql`) NEbyla aplikována na produkci v této akci.
- Social/web pole se ukládají i zobrazují **jen jako text** (`ReadonlyItem` v dashboardu, `DetailField` v adminu — oba `<p>`). ŽÁDNÝ iframe/embed/video/autoplay/feed/Instagram-TikTok-YouTube-Facebook API. Toto pravidlo neměnit.
- Postcheck OK: sloupce přítomny, RLS zapnuté, 3 affiliate záznamy nedotčeny. `npm run build` ✅.
- Nezměněno: provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`. Žádné Edge Functions.

## AFFILIATE v2 — PRODUKČNÍ STAV (03. 06. 2026)

**Affiliate v2 dashboard a profil jsou KOMPLETNĚ NASAZENY A OVĚŘENY V PRODUKCI (`xkzhjldrojjlrkezorey`).**

- Dashboard `/affiliate/dashboard`: horní přepínač `Influencer` / `Obchodník` / `Profil`, luxury UI, statistiky, QR kód (lokální), pravidla.
- `Profil a výplatní údaje` jsou pouze v samostatné sekci `Profil`.
- Sekce Influencer obsahuje zákaznický odkaz `/?ref=KOD`.
- Sekce Obchodník obsahuje firemní odkaz `/partner/register?via=KOD`.
- Obě sekce používají stejný `ref_code`.
- `/influencer/dashboard` → přesměruje na `/affiliate/dashboard` (route-level `<Navigate>`).
- Profilová sekce: IČO, DIČ, web, telefon, fakturační adresa CZ/SK, IBAN/bankovní účet, payout status.
- DB: `affiliate_accounts` + sloupce `ico`, `billing_*`, `website_url`, RLS zapnuté.
- RPC: `update_affiliate_own_profile` (SECURITY DEFINER) — affiliate mění jen vlastní řádek.
- Staging E2E: run `26907560666` — **49 passed · 3 skipped · 0 failed** ✅. Spec 26 a spec 27 prošly.
- Commit: `0272a3ac2937cae8dd5c7cdfa820a4340d6eff99`.
- Nezměněno: `buy_ticket_atomic`, platby, tikety, soutěže, peněženka, zákaznický účet, Partner portal.
- NEOBNOVOVAT starou smazanou affiliate větev.

## AFFILIATE v2 — PRODUKČNÍ STAV (03. 06. 2026)

**Affiliate v2 je NASAZENO A SMOKE OVĚŘENO V PRODUKCI (`xkzhjldrojjlrkezorey`).**

- DB: `affiliate_accounts`, `affiliate_customer_refs`, `affiliate_company_refs`, `affiliate_commissions`,
  `partners.referred_by_affiliate_id`. RLS zapnuté. 5 SECURITY DEFINER RPC.
- 3 legacy influenceři migrováni.
- Edge Functions `get-pending-partner-registrations` (v129) a `approve-partner-registration` (v128) — ACTIVE.
  Ochrana: `Authorization: Bearer <JWT>` + `user_roles` check pro `admin`/`superadmin`.
  `VITE_INTERNAL_FUNCTION_TOKEN` se **nepoužívá** a není potřeba nastavovat v Lovable.
- Staging E2E: `https://github.com/Divuna/million-ticket-draw/actions/runs/26887279500` ✅
- Nezměněno: `buy_ticket_atomic`, platby, tikety, soutěže, peněženka, zákaznický účet, Partner portal.
- NEOBNOVOVAT starou smazanou affiliate větev (ChatGPT duplikát z 02. 06. 2026).

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Before Starting Any Task

Always read these files first — they are the source of truth for current system state, known bugs, and next steps:
- `onemil_state.md` — current system state (treat as authoritative, ignore `state.md`)
- `onemil_history.md` — project timeline and context

Always read:
- `COMPANY_CONTEXT.md` — for company identity, owner, contacts, email signature, billing identity, and official company context.
- `ONEMIL_BUSINESS_CONTEXT.md` — for OneMil business model, product positioning, partner model, user rewards, influencers, agencies, social contests, vouchers, coupons, Partner Offers, and official explanation of what OneMil is.
- `PAPERCLIP_SETUP_CONTEXT.md` — for Paperclip setup, AI agents, OneMil Chief of Staff, sales department, lead database, and AI employee structure.

For schema/architecture context: `.cursor/SYSTEM_MAP.md` and `.cursor/PROJECT_CONTEXT.md`

## Commands

```sh
npm run dev              # Start Vite dev server (localhost:5173)
npm run build            # Production build
npm run lint             # ESLint validation
npm run functions:serve  # Serve Supabase Edge Functions locally
npm run deploy:ai        # Deploy ai-chat Edge Function to production
npm run e2e:full         # Full E2E test suite
npm run test:concurrency # Race condition tests
```

## Architecture

**OneMil** is a global contest and reward platform (React 18 + TypeScript + Vite, hosted via Lovable/Vercel).

**Core flow:** voucher purchase (Stripe) → wallet credit (MioCoin) → ticket purchase (`buy_ticket_atomic` RPC) → contest close at 1,000,000 tickets → winner distribution → prize delivery

**Backend:** Supabase (Postgres + Auth + Realtime + Edge Functions on Deno). 40+ Edge Functions in `supabase/functions/`.

**Event pipelines:**
- Reporting: `event_logs` → `event_queue` → Sofinity (external analytics)
- Push notifications: `notifications` → `push_log` → OneSignal

**Auth & roles:** Supabase Auth with three account types enforced via `useUserRole()`:
- Customers: `/`, `/games`, `/profile`, `/messages`, etc.
- Partners: `/partner/*` only
- Influencers: `/influencer/*` only (strictest isolation — sub-type of partner)
- Admins: `/admin/*`

**State management:** React Query (TanStack v5) for server state; `AuthContext` for auth state; component-level hooks for UI state.

**Key integrations:** Stripe (payments), OneSignal (push), Resend + Sofinity (email/events), OpenAI (AI chat via `ai-chat` Edge Function).

## Database Rules

- Always inspect the schema before writing or suggesting SQL (check `supabase/migrations/` or `.cursor/SYSTEM_MAP.md`).
- Never rename existing tables or columns. Never break RLS policies.
- All SQL is applied manually in the Supabase SQL Editor. Never run `supabase db push` or `db reset` automatically.
- Write SQL changes as migration files into `supabase/migrations/` — do not apply them.

## Actions Requiring User Approval

Do not execute these without explicit user instruction:
- Applying production migrations or any SQL that mutates production data
- Dropping/truncating tables or columns, modifying RLS
- Changing wallet or contest economic rules (ticket cost, prize amounts, contest close conditions)
- Deleting files or running destructive scripts

## Core Logic — Do Not Change Without Explicit Instruction

- `buy_ticket_atomic` RPC and all related ticket/contest logic
- Event pipeline: `event_logs` → `event_queue` → Sofinity
- Push pipeline: `notifications` → `push_log` → OneSignal
- Voucher → MioCoin → ticket economic flow

## Customer Profile Mailto Recommendation

- Commit `04e5a73542558804107de9b8a1e0565b1140ae3c` (`feat: add shop recommendation mailto card`) added
  `Doporučit OneMil oblíbenému obchodu`.
- Files: `src/components/RecommendShopMailtoCard.tsx` and `src/pages/Profile.tsx`.
- The card is visible in Profile under `Pozvi přátele`, above `Účet`.
- Current implementation is mailto-only: the user enters a shop/seller e-mail and their own e-mail app
  opens with a prefilled recipient, subject, and body. OneMil does not send the e-mail automatically.
- No Supabase, SQL, database, Edge Function, or deploy was touched for this feature. User confirmed it is
  visible after Lovable Publish.
- Future TODO (NOT IMPLEMENTED YET): optionally reward the user with 1 MioCoin for sending a shop
  recommendation e-mail, claimable at most once per day and only once per target e-mail per user; track
  sent recommendation statistics, target shop/seller e-mails, counts per e-mail/domain, and prevent abuse.
  This future layer requires a database table, RLS, reward logic, and admin/statistics view.
- Current next step: continue improving the OneMil customer presentation/video concept, then later decide
  whether to implement the MioCoin reward/statistics layer for shop recommendation e-mails.

## Admin Contest Economy Panel

- PR #26 added a frontend-only read-only **Ekonomika** tab to `src/components/AdminContestManagement.tsx`.
- PR #27 added a compact read-only live economy summary bar above the admin contest modal tabs.
- PR #30 changed the admin final save path so MioCoin bonuses are persisted using the exact previewed positions from frontend state instead of being re-randomized through `distribute-bonus-prizes`.
- PR #72 updated the final MioCoin save architecture to reuse the batched Edge Function `distribute-bonus-prizes` with `explicit_bonuses`, so large MioCoin bonus creation works without one monolithic DB insert.
- Generated MioCoin bonus positions are immutable after contest creation. In edit mode, already materialized MioCoin positions cannot be regenerated, cleared, or rewritten.
- `distribute-bonus-prizes` was deployed to production after PR #72 merge.
- Verified production result (`test7`): `admin_total=63000`, `real_total=63000`, `miocoin_rows=63000`.
- Phase 3A adds frontend-only physical prize cost preview fields in `src/components/AdminContestManagement.tsx`: supplier name, unit cost CZK, VAT rate, and optional per-prize handling override.
- The panel is an orientation preview during contest creation/editing. It calculates gross revenue, VAT, net revenue, main prize cost, MioCoin cost, handling cost, setup cost, marketing cost, total estimated cost, profit, margin, break-even ticket count, and recommended ticket price.
- The summary bar shows ticket count, total estimated costs, recommended ticket price, estimated net profit, and margin using the same frontend-only calculations as the **Ekonomika** tab.
- Economy assumptions are local frontend state only and reset when the modal context changes.
- The panel and summary bar do not save economy assumptions to Supabase.
- Physical prize cost preview is also frontend-only; supplier/cost/VAT/handling preview fields are not persisted to Supabase yet.
- Physical prize preview cost is now included in total estimated cost, profit, margin, break-even, and recommended ticket price. Handling uses per-prize override when set, otherwise the global default.
- Final contest save now validates bonus positions before persisting MioCoin rows: integer positions, range `1..ticket_count`, duplicate MioCoin positions, physical/MioCoin collisions, and final-ticket collisions.
- Editing existing contest bonus positions is blocked when tickets already exist.
- PR #52 added bulk quantity distribution for physical bonus prizes (Počet kusů + Rozmístění pozic: Rovnoměrně/Náhodně). For qty > 1 the app auto-assigns N unique positions via `pickPositions` helper; collision rules exclude MioCoin positions, existing physical prizes, final-ticket position, and out-of-range positions. Only `src/components/AdminContestManagement.tsx` changed.
- No changes were made to `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, main prize final-ticket logic, migrations, or production smoke scope.

## Store Policy / Launch Copy Rules

- Public launch age rule is **18+**.
- Public copy must not describe OneMil contests as lottery, drawing/losování, random-generator based, gambling, betting, jackpot, casino, or similar framing.
- Correct public contest model: tickets open sequentially in order `1, 2, 3...`; winning positions are predefined in the rules of the given contest.
- MioCoin is internal OneMil credit.
- MioCoin cannot be withdrawn as money.
- MioCoin cannot be transferred outside OneMil.
- MioCoin can only be used inside OneMil.
- Charitable campaigns must state the specific beneficiary, purpose, and support amount for that campaign.
- PR #2 merged these copy rules to `main` after PR smoke and staging full E2E passed. No deploy was performed as part of that merge.

## Launch Strategy / Store Submission

- OneMil launch strategy is **Web/PWA first**.
- Apple App Store and Google Play submission is postponed.
- Reason: OneMil will not pay Apple/Google 15–30% fees for MioCoin purchases in the current launch strategy.
- Stripe remains the payment provider for Web/PWA MioCoin top-up.
- Future native iOS/Android apps may be reconsidered only after payment/store strategy is explicitly approved.
- Do not implement native store billing, native app submission changes, or mobile-only payment-routing changes without explicit user approval.

## Deployment rule
After every file change, always run:
git add -A && git commit -m "fix: <short description of change>" && git push

Never leave changes without pushing to GitHub.

## Chat system rules

Modes:
- AI mode (Bob active)
- ADMIN mode (Bob off after first admin message)

Flow:
- AI responds to user messages
- User can request support
- AI continues until admin sends first message
- First admin message switches to ADMIN mode
- AI must stop immediately
- Admin handles chat
- When support ends, switch back to AI mode

Technical:
- AI messages come from ai-chat via reply_message_id
- Must appear immediately
- Realtime is fallback
- No duplicates

---

## CURRENT SYSTEM STATUS (31. 05. 2026)

- **➡️ CURRENT NEXT STEP:** Připravit lepší **premium vizuální koncept** pro OneMil video/prezentační vizuály — raw screenshoty působí příliš technicky a nedostatečně premium. (Detail v `onemil_state.md`.)
- **Customer MioCoin code redemption NASAZENO (31. 05. 2026):** `RedeemMioCoinCard.tsx` v Profilu pod Peněženkou, RPC `redeem_miocoin_code` (migrace `20260531_redeem_miocoin_code.sql`) aplikován na staging i **produkci** (`xkzhjldrojjlrkezorey`), frontend publikován přes Lovable. Source-neutral wording „Uplatnit MioCoin kód". Commit `ce76027b`.
- **Error toast contrast fix (31. 05. 2026):** shadcn `toast.tsx` + sonner `sonner.tsx` — error toasty červené pozadí + bílý čitelný text. Commit `a220d993`. (Vyžaduje Lovable Publish pokud ještě neproběhl.)
- **Profile save RLS fix (31. 05. 2026):** `public.profiles` chyběla INSERT policy → `upsert` v `handleProfileSave` selhával (42501). Policy `profiles_insert_own FOR INSERT TO authenticated WITH CHECK (id=auth.uid())` aplikována ručně na staging+produkci, ověřeno funkční. Permanentní migrace `20260531_profiles_insert_own_rls.sql`, commit `6fceef27`.
- **Winner card backgrounds KOMPLETNÍ (31. 05. 2026):** Rotující brand pozadí (trophy/crown/clean) na kartách výherců. Assets v `src/assets/winner-backgrounds/`. Konstanta `WINNER_BG_ROTATION` + `index % 3` nasazena na Homepage i Winners stránce. Overlay v `WinnerCard.tsx`: opacity `0.42`, gradient levý `0.78` / střed `0.20` / pravý `0.14`. **Pravidlo:** každá nová stránka se `WinnerCard` musí použít `WINNER_BG_ROTATION[index % 3]` — overlay logika je automatická v komponentě. Commity: `7276c254` → `4b127aef` → `9d9c716c` → `8197d6ae`.
- **GitHub Actions odblokován (31. 05. 2026):** Repo změněno z private na **public** — Actions minuty jsou nyní zdarma neomezeně. Smoke ✅, Staging Full E2E ✅.

## CURRENT SYSTEM STATUS (30. 05. 2026)

- **OneMil Premium Icon System KOMPLETNÍ (30. 05. 2026):** `src/components/icons/OneMilIcons.tsx` obsahuje 23 brand ikon. Customer-facing UI kompletně přepnuto z Lucide na OneMil ikony. Sémantická pravidla: `OneMilGiftIcon` = bonusy/dárky; `OneMilVoucherIcon` = vouchery; `OneMilWinIcon` = sekce Výhry; `OneMilTrophyIcon` = Soutěže/hlavní výhra; `OneMilMioCoinIcon` = MioCoin dobití. Všechny hlavní customer stránky mají unifikovaný premium header tile vzor (dark karta + shimmer + 64px orange gradient tile + gradient h1). Bottom nav: size 24px, active scale-110. Commity: `cc490725` → `ee9b7d9c` → `61840ab6` → `94ed004f` → `1d5c5dde` → `87f74083`. Detailní dokumentace v `onemil_state.md`.
- **Icon pravidlo pro budoucí vývoj:** Nové customer-facing stránky MUSÍ používat `OneMilIcons.tsx` a unifikovaný header tile vzor. Lucide ikony zachovat POUZE pro utility (Clock, Arrow, Check, Loader2, Camera, Volume aj.).

## CURRENT SYSTEM STATUS (27. 05. 2026)

- **Migrace coming_soon_banners.description APLIKOVÁNA (27. 05. 2026):** `supabase/migrations/20260527_coming_soon_banners_add_description.sql` aplikována manuálně v Supabase a ověřena. Struktura: `id uuid, image_url text, title text, created_at timestamptz, description text`. Info popup feature je plně funkční.
- **WinnerCard redesign (27. 05. 2026):** `src/components/WinnerCard.tsx` přepsán — sjednocen s MioCoin card stylem (dark bg, orange border, Poppins prize gradient, muted labels, h-112px, star šum snížen). Commit `b6776ebe`.
- **Připravujeme bannery — info popup (27. 05. 2026):** Nový sloupec `description`, admin textarea, homepage pulsující ℹ ikona + dark premium modal. Commit `f11b634f`. (Vyžaduje aplikaci migrace výše.)
- **Připravujeme bannery — editovatelné tituly (27. 05. 2026):** Admin input + Uložit pro `title`; premium Poppins gradient na homepage i admin preview. Commity `4428b7d0`, `265f2330`.
- **Telegram bot nastaven (25. 05. 2026):** @Onemilclaudebot (id `8969270078`). Token + chat_id Pavla (`6714365501`) uloženy jako Windows user env vars `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID`. Claude Code může posílat notifikace přes Telegram Bot API. Žádný server/webhook — pouze jednosměrné notifikace (Claude → Pavel).
- **CI artifact upload — continue-on-error (25. 05. 2026):** `continue-on-error: true` přidáno na všechny `upload-artifact` kroky v `playwright.yml` i `playwright-staging.yml` (commit `408da958`). Plná kvóta artefaktů už nemůže shodit workflow — testy jsou autoritativní.
- **Homepage hero banner — finální stav (25. 05. 2026):** Cílový rozměr **1920 × 600 px**. Kontejner `w-full sm:aspect-[16/5] sm:max-h-[600px]`. Mobil: `h-auto object-contain` (žádné pruhy, žádný ořez). Tablet+: `sm:object-cover`. Commit `ecea087c`.
- **Admin bannery — toggle Zobrazovat trvale (24. 05. 2026):** `src/pages/AdminBanners.tsx` — Switch skrývá datumová pole a ukládá `null` pro trvale zobrazené bannery. Commit `03271812`.
- **Homepage placement bannery — layout (24. 05. 2026):** MioCoin karty — fallback text skryt při banner obrázku; layout obrázek nahoře / tlačítko dole. Lower boxy — ikona+text skryty při banner obrázku, `min-h` zachovává výšku. Commity `f486afa9`–`e9254494`.
- **Admin „Online teď" ZAMČEN PROTI REGRESI v staging CI (20. 05. 2026):** Staging Full E2E run `26189017692` — **29 passed, 0 failed, 3 skipped** (4m 35s). Spec 21 (`tests/e2e/21-admin-online-registered-users.spec.ts`) prošel za 16.8s. Ověřeno: `useHeartbeat` fires `bump_user_last_seen` po přihlášení, `get_admin_online_users` vrátí aktivního uživatele adminovi, badge count ≥ 1, popover zobrazuje e-mail normálního E2E uživatele. Commit `b70beba` (spec 21 add) + `b2129ac` (fix: `exact:false` → `exact:true` — strict-mode violation). Anonymní návštěvníci nejsou sledováni (zůstávají v Google Analytics).
- **Admin „Online teď" LIVE na produkci (20. 05. 2026):** Přihlášení uživatelé jsou zobrazeni v admin top bar "Online teď" badge. Migrace `20260520_registered_user_presence.sql` aplikována a ověřena na staging i produkci. Frontend: `useHeartbeat(user?.id)` volá `bump_user_last_seen` každých 60 s; `useAdminOnlineIndicator` polluje `get_admin_online_users` každých 30 s. Anonymní návštěvníci nejsou sledováni (zůstávají v Google Analytics). Commit `0732738` (feat) + `ab5cb25` (fix: `.catch` → `async/await` runtime crash). Lovable publish dokončen, live chování ověřeno.
- **Issue #71 ZAMČEN PROTI REGRESI v staging CI (20. 05. 2026):** Staging Full E2E run `26180130657` — **28 passed, 0 failed, 3 skipped** (2m 54s). Spec 20 (`tests/e2e/20-admin-miocoin-chunked-save.spec.ts`) prošel za 9.7s a end-to-end ověřil: 600 MioCoin pozic vygenerováno, `CHUNK_SIZE = 500` → 2 chunky, `bonus_prizes` count = 600, `contests.total_miocoin_bonus` = 6 000, `admin_actions` obsahuje `miocoin_save_begin` + `miocoin_bulk_create` s `metadata.chunked = true`. Telegram `✅ OneMil STAGING full E2E OK — all specs passed` doručen (message_id 560). Chunked MioCoin save flow je nyní chráněn každým staging CI během.
- **PR #81 mergnut (20. 05. 2026):** fix(test): scope spec 20 "600 pozic" assertion to the badge only. Merge commit: `ef01011`. Pouze `tests/e2e/20-admin-miocoin-chunked-save.spec.ts` (6 ins / 3 del). Anchored regex `/^Celkem:.*600 pozic/i` eliminuje Playwright strict-mode kolizi s "Vygenerováno 600 pozic s celkovou hodnotou…" summary řádkem.
- **PR #80 mergnut (20. 05. 2026):** ci(staging): seed E2E Spec20 chunked MioCoin save test contest. Merge commit: `cbd51f9`. Pouze `.github/workflows/playwright-staging.yml` (+43 řádků). Přidán seed step `seed-spec20-contest` (status=draft, ticket_count=1000, ticket_price=1, main_image set) + `E2E_SPEC20_CONTEST_ID` v test env. Production workflow `playwright.yml` nedotčen.
- **PR #79 mergnut (20. 05. 2026):** test: lock chunked MioCoin save with staging E2E spec 20. Merge commit: `6573144`. Pouze `tests/e2e/20-admin-miocoin-chunked-save.spec.ts` (+183 řádků). Staging-only, non-destructive — drží frontend na `admin_begin/admin_append_chunk/admin_finalize` flow + `total_miocoin_bonus` sync + audit rows `miocoin_save_begin/miocoin_bulk_create` s `chunked=true`. Read-back přes `@supabase/supabase-js` (anon + admin sign-in). Druhý commit ve stejném PR: fix(test) na `admin_actions.timestamp` sloupec (ne `created_at`).
- **Issue #71 finálně VYŘEŠEN (20. 05. 2026):** velké MioCoin bonusové save (~95k pozic) nyní fungují na produkci. Final invariant: large MioCoin saves musí používat chunked flow s `CHUNK_SIZE = 500` (`admin_begin_miocoin_save` → `admin_append_miocoin_chunk` × N → `admin_finalize_miocoin_save`). Production manual test ✅ — MioCoin bonus creation works, admin totals display correctly. Předchozí selhané cesty: (1) jeden velký Edge Function request (`distribute-bonus-prizes` s `explicit_bonuses`) — Deno wall-clock timeout, (2) jeden velký SQL RPC (`admin_bulk_insert_miocoin_bonuses`) — PostgREST/Kong gateway HTTP timeout (~60s), (3) chunked save s `CHUNK_SIZE=5000` — chunk 1/9 stále hitnul gateway timeout.
- **PR #78 mergnut (20. 05. 2026):** lower MioCoin save chunk size from 5000 to 500. Merge commit: `301a778`. Pouze `src/components/AdminContestManagement.tsx` (4 ins / 1 del). Production test23 ukázal timeout i s chunky po 5000; sníženo na 500 → ~190 malých chunků pro 95k pozic, každý komfortně pod gateway budget. Žádné DB ani Edge Function změny.
- **PR #77 mergnut + migrace aplikována na produkci (20. 05. 2026):** chunked MioCoin save — tři nové SECURITY DEFINER funkce: `admin_begin_miocoin_save(p_contest_id, p_expected_count)` (wipe stale rows, reset total, audit `miocoin_save_begin`), `admin_append_miocoin_chunk(p_contest_id, p_bonuses)` (set-based INSERT … SELECT, žádný DELETE), `admin_finalize_miocoin_save(p_contest_id, p_expected_count)` (verify count, sync `total_miocoin_bonus`, audit `miocoin_bulk_create`). Merge commit: `3ecd892`. Migrace: `supabase/migrations/20260520_miocoin_chunked_save_functions.sql`. Frontend `handleSave` upraven: begin → append loop → finalize; save success vyžaduje finalize success. Legacy `admin_bulk_insert_miocoin_bonuses` ponechán beze změny.
- **PR #76 mergnut + migrace aplikována (20. 05. 2026), ale neúčinný:** přidal `set_config('statement_timeout', '300000', true)` do `admin_bulk_insert_miocoin_bonuses` + idempotentní DROP TABLE IF EXISTS. Production verifikace: `contains_drop_tmp=true`, `contains_statement_timeout=true`, `contains_total_sync=true`. **Stále selhalo** na test22 s `canceling statement due to statement timeout` — root cause: PL/pgSQL `set_config` LOCAL nezasahuje běžící outer PostgREST statement a Supabase API gateway má vlastní HTTP timeout. Tento PR byl architektonický slepá ulička; nahrazen chunked flow v PR #77/#78.
- **PR #75 mergnut (20. 05. 2026):** exclude final ticket from MioCoin bonus position generator. Merge commit: `42c1017`. Pouze `src/components/AdminContestManagement.tsx` (10 ins / 7 del). Zavedena konstanta `maxMioCoinPosition = ticketCount - 1` aplikovaná v obou distribučních cestách (even + random). Save-time validation guard zachován jako safety net.
- **PR #74 mergnut (20. 05. 2026):** switch explicit MioCoin save from Edge Function to SQL RPC. Merge commit: `3a46ede`. Pouze `src/components/AdminContestManagement.tsx` (18 ins / 21 del). Nahrazeno `supabase.functions.invoke("distribute-bonus-prizes", { explicit_bonuses })` voláním `supabase.rpc("admin_bulk_insert_miocoin_bonuses", …)` — eliminace Deno wall-clock timeoutu pro explicitní save. `distribute-bonus-prizes` ponechán pro non-explicit (random/step_interval) cestu.
- **PR #66 migrace aplikována na produkci (20. 05. 2026):** `admin_bulk_insert_miocoin_bonuses` nyní materializuje JSON payload do temp tabulky `tmp_miocoin_bonuses (ON COMMIT DROP)` — `jsonb_array_elements` voláno přesně 1× místo 5×. Index `idx_bonus_prizes_contest_position` na `bonus_prizes(contest_id, ticket_position)` přidán. Timeout při 56 000–95 000 pozicích odstraněn.
- **Staging Full E2E ZELENÝ po PR #66 (20. 05. 2026):** run `26156907020` — **27 passed, 0 failed, 3 skipped** (3m 6s). Spec 18 ✅ (11.3s). Spec 19 ✅ (10.4s). Telegram: `✅ OneMil STAGING full E2E OK` doručen (message_id 521).
- **PR #66 mergnut (20. 05. 2026):** perf: materialize JSON payload once in admin_bulk_insert_miocoin_bonuses. Merge commit: `59b2efe3154d629d6c4b9acd4dd4477f0a4ef502`. Pouze `supabase/migrations/20260520_materialize_bulk_miocoin_payload.sql`. Žádný frontend, žádné testy, žádný workflow.
- **PR #65 migrace aplikována na produkci (20. 05. 2026):** set-based SQL validace (GROUP BY HAVING, JOIN) namísto per-row smyčky. Aplikováno dříve ve stejný den.
- **Staging Full E2E ZELENÝ po PR #65 (20. 05. 2026):** run `26153556353` — **27 passed, 0 failed, 3 skipped** (2m 54s). Spec 18 ✅ (10.0s). Spec 19 ✅ (10.0s). Telegram: `✅ OneMil STAGING full E2E OK` doručen (message_id 517).
- **PR #65 mergnut (20. 05. 2026):** perf: optimize admin_bulk_insert_miocoin_bonuses for 95k rows. Merge commit: `e809bd0561d05846290922d94a860d5df49c78cf`. Pouze `supabase/migrations/20260520_optimize_bulk_miocoin_bonuses.sql`.
- **PR #64 mergnut (20. 05. 2026):** fix duplicate contest creation when CREATE save partially succeeds and later step throws. Merge commit: `72b74bc64dad27abd04a2c64214c77dc1e3a533c`. Pouze `src/components/AdminContestManagement.tsx`. Root cause: outer `catch` v `handleSave` zobrazil toast ale nezavřel modal → admin mohl kliknout Uložit znovu → druhý contest vytvořen. Fix: `createdContestIdInCreateMode` tracking variable — pokud contest byl vytvořen ale pozdější krok selhal, outer catch zavolá `onSaved()/onClose()` s informativním toastem místo tiché smyčky. Production smoke po mergi: run `26151630359` ✅.
- **PR #63 mergnut (20. 05. 2026):** fix stale contests.total_miocoin_bonus after bulk MioCoin save. Migrace aplikována na staging i produkci. Root cause: trigger `sync_total_miocoin_bonus` na produkci neexistuje → sloupec zůstával 0. Fix: UPDATE contests.total_miocoin_bonus po každém bulk INSERT + backfill + zero-fill.
- **PR #62 mergnut (20. 05. 2026):** fix silent save when MioCoin generator inputs filled but bonuses not generated. Guard v `handleSave`: pokud `mioCoinBonuses.length === 0 && totalMioCoinsInput > 0 && stepValue > 0` → toast + return před persistencí. Staging E2E zelený (run `26135981706`, 27/0/3).
- **PR #61 mergnut (20. 05. 2026):** bulk MioCoin bonus save — nová SECURITY DEFINER funkce `admin_bulk_insert_miocoin_bonuses` nahrazuje N sequential RPC callů jedním bulk INSERT. RLS policy "Allow admin full access to bonus prizes" přidána idempotentně. Aplikováno na staging i produkci.
- **Staging Full E2E ZELENÝ po PR #60 (19. 05. 2026):** run `26113679217` — **26 passed, 0 failed, 3 skipped**. Spec 18 ✅ (retry — transient staging latence). Spec 19 ✅. Telegram: `✅ OneMil STAGING full E2E OK` doručen (message_id 497).
- **PR #60 mergnut (19. 05. 2026):** fix create modal not closing when rules PDF upload fails after contest creation. Merge commit: `a25a7d71d986485d60cab92f153db30746e09019`. Změněn pouze `src/components/AdminContestManagement.tsx`. Root cause: v PDF upload error branch byl `return` i v CREATE módu — modal zůstával otevřený přestože contest byl už vytvořen SECURITY DEFINER RPC. Fix (mirrors PR #55): v CREATE módu falls through k `onSaved()/onClose()`; v EDIT módu `setSaving(false); return` zachováno. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #59 (19. 05. 2026):** run `26106988469` — **27 passed, 0 failed, 3 skipped** (3m 6s). Spec 18 ✅ (11.3s, první pokus). Spec 19 ✅. Telegram: `✅ OneMil STAGING full E2E OK` doručen (message_id 492).
- **PR #59 mergnut (19. 05. 2026):** fix spec 18 pro PRs #56/#57 economy UI changes. Merge commit: `ab9e37f`. Změněn pouze `tests/e2e/18-admin-economy-persist.spec.ts`. Root cause: staging run `26105990009` — spec timeout na `Náklad na hlavní výhru` fill (pole přesunuto PR #57 do Basic tabu) a pokus o fill read-only pole `Náklad na MioCoin bonusy` (PR #56/#57). Fix: Step 4a v Basic tabu, Step 4b jen `Jednorázový`+`Cílová marže`, `Náklad na MioCoin bonusy` fill+assertion odstraněny.
- **PR #58 mergnut (19. 05. 2026):** fix physical prize grouping key — `image_url` vyloučeno z klíče v `src/pages/ContestDetail.tsx`. Bulk výhry mají unikátní UUID storage cestu → starý klíč s `image_url` → N duplicitních karet. Nový klíč: `${description}||${detailed_description}` → správné seskupení.
- **PR #57 mergnut (19. 05. 2026):** Economy input cleanup v `src/components/AdminContestManagement.tsx`. `Náklad na hlavní výhru` přesunut do Basic tabu. `Reálný náklad na MioCoin bonusy` vždy read-only (auto-odvozeno z `effectiveMioCoinCost`).
- **PR #56 mergnut (19. 05. 2026):** fix MioCoin bonus save RPC + auto-sync economy v `src/components/AdminContestManagement.tsx`. `admin_manage_bonus_prize` RPC s explicitními null args (eliminuje overload ambiguitu). `effectiveMioCoinCost` = auto-sync economy kalkulace se skutečnými MioCoin bonusy.
- **Staging Full E2E ZELENÝ po PR #55 (19. 05. 2026):** run `26059677757` — **27 passed, 0 failed, 3 skipped** (4m 14s). Spec 18 ✅ (10.8s, první pokus). Spec 19 ✅ (10.9s). Telegram: `✅ OneMil STAGING full E2E OK` doručen (message_id 475).
- **PR #55 mergnut (19. 05. 2026):** fix duplicate physical bonus prize cards (ContestDetail) + fix create-contest modal not closing. Merge commit: `9808f83d13e4ff09516dc2f352abcc3c28274ab8`. Změněny: `src/pages/ContestDetail.tsx`, `src/components/AdminContestManagement.tsx`. Part A: přidán `groupedBonusPrizes` useMemo — fyzické výhry se seskupují podle `description+detailed_description+image`; každá skupina → jedna karta s badge `N× v soutěži`. MioCoin bonusy zůstávají individuální. Part B: pro CREATE mód při `updatedRows.length === 0` (RLS blokuje client-side UPDATE čerstvého řádku) kód nyní pokračuje k `onSaved()/onClose()` místo `return`; pro EDIT mód původní chování zachováno. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #53 + #54 (18. 05. 2026):** run `26057380995` — **26 passed, 0 failed, 3 skipped** (4m 0s). Spec 08 ✅ skipped (PR #54 fix drží). Spec 18 ✅ passed (retry #1, 15.8s — transient staging latence). Spec 19 ✅ (12.3s). Telegram: `✅ OneMil STAGING full E2E OK` doručen (message_id 471).
- **PR #54 mergnut (18. 05. 2026):** fix flaky skip guard v spec 08 (`tests/e2e/08-partner-offer-persistence.spec.ts`). Merge commit: `819cb77819bfc37598a621b46821a1995c17d2c9`. Nahrazen `waitForTimeout(2_000) + okamžité isVisible()` za `Promise.race` pattern (mirror spec 07) — wait up to 10s pro offer card nebo empty state, poté skip guard. Přidán i `!firstCard.isVisible()` fallback skip. Žádný app kód, workflow, schéma nezměněno.
- **PR #53 mergnut (18. 05. 2026):** fix gallery upload "Invalid key" — raw file names se sanitizují před uložením do Supabase Storage (`src/components/AdminContestManagement.tsx`). Merge commit: `8356ac04bdf3d03f457febe6e199fca4593e856b`. Přidán helper `sanitizeStorageFileName()`: NFD normalize + strip diakritiky + spaces→hyphens + strip speciálních znaků + collapse hyphens + fallback "file". Aplikován na všechny 3 gallery upload paths. Nový storage key formát: `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #52 (18. 05. 2026):** run `26053065266` — **27 passed, 0 failed, 3 skipped** (3m 56s). Spec 18 ✅ (9.8s), spec 19 ✅ (10.0s). Telegram: `✅ OneMil STAGING full E2E OK` doručen. Žádná regrese po přidání bulk distribution feature.
- **PR #52 mergnut (18. 05. 2026):** přidána bulk quantity distribution pro věcné bonusové výhry v `src/components/AdminContestManagement.tsx`. Merge commit: `e43cda76c4f187bd4a8e9ae00ec3396626a73e19`. Nová UI pole: Počet kusů (default 1), Rozmístění pozic (Rovnoměrně / Náhodně). Automatická bezkolizní distribuce pozic pro qty > 1 — vylučuje MioCoin pozice, existující věcné výhry, final-ticket pozici a pozice mimo rozsah. Opraven stale helper text. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ — Phase 4 KOMPLETNÍ (18. 05. 2026):** run `26046436837` — **27 passed, 0 failed, 3 skipped** (4m 28s). Spec 18 ✅ (11.9s), spec 19 ✅ (11.2s, první pokus bez retry). Telegram: `✅ OneMil STAGING full E2E OK` doručen. Všechny 19 spec souborů zelené. 3 skipy jsou pre-existující záměrné skipy (spec 01 new-user registration, spec 07 partner offer open, spec 08 partner offer persistence).
- **Staging SQL fix aplikován manuálně (18. 05. 2026):** Na staging projektu `dxmowysntemfqfnanxua` bylo aplikováno: (1) `ALTER TABLE bonus_prizes ADD COLUMN IF NOT EXISTS supplier_name/unit_cost_czk/vat_rate_percent/handling_override_czk` — Phase 4 economy sloupce; (2) `CREATE POLICY "Allow admin full access to bonus prizes" ON bonus_prizes FOR ALL USING (has_role(...))` — chybějící write policy odblokovala přímé client-side UPDATE/DELETE z admin UI. Bez write policy `.update()` economy dat tiše selhával (0 řádků), `.delete()` cleanup taky; SECURITY DEFINER RPC obcházel RLS a INSERT fungoval, čímž se maskovala chyba.
- **PR #51 mergnut (18. 05. 2026):** přidán workflow seed step "Ensure staging admin E2E user has admin role" do `playwright-staging.yml` — Supabase Admin API najde/vytvoří `admin-e2e@onemil.cz` v auth.users a upsertuje public.users (role=admin), user_roles, profiles, wallets před spuštěním E2E suite. Idempotentní. Merge commit: `97797662d19cafe53062a04fb73449545ef98780`. Pouze `.github/workflows/playwright-staging.yml`.
- **Production smoke ZELENÝ (18. 05. 2026):** run `26027726603` — 5 passed, 0 failed, 0 skipped (22s). Telegram: `✅ OneMil PROD smoke OK`. Phase 4 migrace na produkci ověřeny bez regrese.
- **Phase 4 — Economy Persistence NASAZENA NA PRODUKCI (18. 05. 2026):** `contest_economy` tabulka + `bonus_prizes` economy sloupce aplikovány na produkci; production smoke zelený; staging Full E2E zelený (run `26026329321`, 26/3/0); spec 18 ověřuje celý persistence cyklus.
- **PR #49 mergnut (18. 05. 2026):** fix spec 18 cleanup hang — přidán `{ timeout: 1000 }` do close button click; selector `[aria-label="Close"]` nenacházel element, bez `actionTimeout` čekal donekonečna. Merge commit: `a0a2b494ef398c74b1cee591b1554d4610daac00`. Pouze `tests/e2e/18-admin-economy-persist.spec.ts`.
- **PR #50 mergnut (18. 05. 2026):** přidán `tests/e2e/19-admin-physical-prize-economy-persist.spec.ts` (173 řádků, staging-only). Ověřuje celý cyklus persistování fyzických nákladových údajů věcných výher (supplier_name, unit_cost_czk, vat_rate_percent, handling_override_czk). Sdílí `E2E_SPEC18_CONTEST_ID`. Merge commit: `1b937efba87cbda9118a2d8e532d2da6fdc46d44`.
- **Staging Full E2E ZELENÝ (18. 05. 2026):** run `26026329321` — 26 passed, 3 skipped, 0 failed. Spec 18 (economy persist) prošel (10.7s). Spec 17 prošel. Spec 16 prošel. Telegram OK doručen.
- **PR #16 mergnut (17. 05. 2026):** přidán `tests/e2e/17-profile-smoke.spec.ts` — staging-only, read-only profile smoke test. Ověřuje `/profile` rendering pro E2E uživatele: identita, peněženka/MioCoin sekce, Účet heading, Přihlašovací údaje, Osobní údaje. Přejmenováno z `12-` na `17-` (kolize s `12-mobile-messages-layout.spec.ts`). Merge commit: `7fd9766972b4a84c9ee33b11357f42ad46c38854`. Žádný app kód, migrace ani business logika nezměněna.
- **PR #38 mergnut (17. 05. 2026):** spec 16 Ekonomika tab assertions přesunuty na `econPanel = dialog.locator('[role="tabpanel"][data-state="active"]')` — zamezuje strict mode violations z always-visible summary baru. Pouze `tests/e2e/16-admin-economy-preview.spec.ts`.
- **PR #37 mergnut (17. 05. 2026):** spec 16 `Balné` assertion opraven na `{ exact: true }` — regex matchoval 2 elementy. Pouze `tests/e2e/16-admin-economy-preview.spec.ts` (1 řádek).
- **PR #36 mergnut (17. 05. 2026):** admin contest create/edit modal je nyní wider (`max-w-[95vw]`), economy summary bar se zalamuje responsivně, záložky se zalamují — žádný vnitřní horizontální scrollbar. Změněn pouze `src/components/AdminContestManagement.tsx` (layout CSS). Žádná logika nezměněna.
- **PR #34 mergnut (17. 05. 2026):** přidán `tests/e2e/16-admin-economy-preview.spec.ts` — staging-only, read-only smoke test admin economy preview. Ověřuje, že věcná výhra aktualizuje economy summary bar a záložku Ekonomika bez finálního uložení. Selektory jsou stabilní (inputByLabel helper, summaryValue přes div.uppercase.opacity-70). Skip guard pokud chybí admin secrets.
- **Playwright testy: 19 spec souborů** (01–19); staging full E2E obsahuje všechny spec soubory
- CI pipeline stabilní: dva oddělené workflow (commit `82f979f`):
  - `.github/workflows/playwright.yml` — **production smoke**: pouze `01-registration` + `02-login`; spouští se 3× denně + push/PR na `main`
  - `.github/workflows/playwright-staging.yml` — **staging full E2E**: všech 19 spec souborů; pouze `workflow_dispatch` (manuálně) + schedule 3× denně
- **Produkce nemůže spouštět** testy 03–17 (ticket purchase, voucher, wallet, win-flow, Partner Offers, admin, profile) — hard-coded file paths v `playwright.yml`
- Telegram zprávy rozlišují: `✅ OneMil PROD smoke OK` / `❌ OneMil PROD smoke FAILED` vs `✅ OneMil STAGING full E2E OK` / `❌ OneMil STAGING full E2E FAILED`
- **Production smoke manuálně ověřen** (run `25618763318`): 6 passed, 1m 22s, Telegram doručen, specs 03–08 neběžely ✅
- Payment pipeline ověřen: Stripe webhook vrací 500 na selhání (retry), idempotency funguje, wallet credit přes trigger
- Registrace + login plně otestovány v Playwright (Chromium, CI)
- Playwright testy: **17 spec souborů**; staging testy 03–17 čekají na GitHub Secrets (set):
  - `STAGING_E2E_TEST_EMAIL` → `e2e@onemil.cz`, `STAGING_E2E_TEST_PASSWORD`, `STAGING_E2E_CONTEST_ID` → `3fa56db0-4007-4fb7-aa2f-e460173070d8`, `STAGING_E2E_WIN_CONTEST_ID` → `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb`
- **Staging seed ověřen** (10. 05. 2026): test user `e2e@onemil.cz`, wallet 5000 MioCoin, general contest + win contest active, partner offer approved a připojena — detaily v `onemil_state.md`
- **Staging full E2E ZELENÝ + wallet reset ověřen** (run `25625184545`, 10. 05. 2026): ✅ ALL PASSED — 13 passed, 4 skipped, 0 failed, 2m 33s
  - Workflow auto-seeduje nový win contest před každým spuštěním (PostgREST INSERT + step output)
  - Workflow resetuje wallet test uživatele na 5 000 MioCoin před testy (commit `50ba68c`)
  - Telegram success doručen
  - Commity: `3c4aecf`, `324a747`, `6ee26df`, `e70fd5c` (stabilizace) + `50ba68c` (wallet reset) + `631f915` (signup email domain `@example.com` → `@onemil.cz`)
  - Staging full E2E **naplánováno 3× denně** (commit `37cfd6c`): 04:00 / 12:00 / 20:00 Praha — offset od production smoke, žádný překryv
  - `workflow_dispatch` zůstává dostupný
  - Destruktivní testy (03–08) **nesmí běžet v produkci** (hard-coded v `playwright.yml`)
  - Produkce nedotčena
- **Migrace commitnuty ale neaplikovány** v Supabase:
  - `20260420_ensure_wallet_exists.sql` — wallet auto-creation helper
  - `20260420_fix_profiles_insert_remove_user_id.sql` — oprava trigger profiles INSERT
  - `20260424_fix_won_type_main_priority_over_bonus.sql` — won_type: main > bonus priorita
  - `20260504_fix_nonblocking_sofinity_triggers.sql` — 57014 timeout fix (trigger non-blocking)
- **Migrace aplikované v produkci (05. 05. 2026):**
  - `20260504_add_remaining_and_bonus_distance_to_buy_ticket_atomic.sql` ✅
- won_type bug potvrzen a opravena v migraci: poslední tiket + bonusová pozice → byl vracen 'bonus' místo 'main'
- Frontend volá `buy_ticket_atomic` přímo (ContestDetail, Games, FavoriteGames) — ne přes Edge Function
- buy_ticket_atomic nyní vrací: `remaining_tickets`, `next_bonus_position`, `distance_to_next_bonus`

## STAGING READINESS — stav (09. 05. 2026)

**Produkce:** projekt `onemil`, ref `xkzhjldrojjlrkezorey`, region `eu-north-1`
**Staging:** projekt `onemil-staging`, region `eu-north-1`, ref TBD po vytvoření manuálně

- **Fáze 1 dokončena** (commit `20c6452`): hardcoded produkční URL nahrazeny env/client-based hodnotami
  - `process_event_queue_worker/index.ts` — `SOFINITY_RELAY_URL` env var
  - `src/pages/ShareTicket.tsx` — `${supabaseUrl}/functions/v1/og-ticket-share`
  - `src/components/TicketResultModal.tsx` — `${supabaseUrl}/functions/v1/og-ticket-share`
- `api/og-ticket.ts` + `vercel.json` — **legacy**, Lovable je aktivní deploy cesta; tyto soubory se nespouštějí
- **Fáze 2 dokončena** (09. 05. 2026, commit `4167527`):
  - Projekt `onemil-staging` vytvořen, ref `dxmowysntemfqfnanxua`, region `eu-north-1`
  - `SOFINITY_RELAY_URL` nastaven → `https://dxmowysntemfqfnanxua.supabase.co/functions/v1/sofinity-noop`
  - `sofinity-noop` nasazena na staging, POST test ✅ `{"ok":true,"noop":true}`
  - Produkce `xkzhjldrojjlrkezorey` a Sofinity relay `rrmvxsldrjgbdxluklka` nedotčeny
- **Fáze 3 — POZASTAVENO (10. 05. 2026):**
  - `db push` selhal na migraci #3 (`20250914043049_`) — `public.payments` neexistuje v prázdné staging DB
  - Root cause: počáteční schéma nebylo nikdy zachyceno jako migrace; první migrace jsou hotfixy na existující schéma
  - **Schema baseline aplikován manuálně:** produkční schéma zdumpováno a aplikováno na staging přes SQL Editor
  - Ověřeno na staging: 73 tabulek ✅, `buy_ticket_atomic` ✅, wallet trigger ✅, 95 RLS ✅
  - `schema_migrations` testován ve 4 formátech — nejlepší dosažitelný stav: **324 číselných prefixů, 17 souborů permanently pending**
  - Root cause: repozitář obsahuje soubory s duplicitními timestamps a smíšenými 8/14-cifernými prefixy — exit code 0 nelze dosáhnout bez přejmenování souborů
  - **Strategie rozhodnuta (10. 05. 2026): Option A — `db push` se na staging nepoužívá**
  - Nové DB změny se aplikují manuálně přes SQL Editor (stejný workflow jako produkce)
  - `schema_migrations`: 324 řádků — přijato jako finální stav, neměnit
  - 17 permanently pending souborů je obsaženo v baseline schématu — CLI je nedokáže sledovat, ale schéma je správné
  - **⛔ Nespouštět `db push` na staging. Needitovat `schema_migrations` bez schválení.**
  - Produkce `xkzhjldrojjlrkezorey` nedotčena ✅
  - Detaily v `onemil_state.md` — Fáze 3 sekce
- **Staging Edge Functions nasazeny (10. 05. 2026):**
  - `sofinity-noop` — ACTIVE ✅ (nasazeno dříve)
  - `upload-ticket-share` — ACTIVE ✅ (nasazeno 10. 05. 2026)
  - Storage bucket `ticket-shares` existuje na staging, public: true ✅

## NEDODĚLÁNO — otevřené body (10. 05. 2026)

- **Vizuální systém:** brand větve nemergnuto do `main` (viz sekce níže)

## Partner Offers — invarianty (uzamčeno, nesmí se měnit)

- Partner Offers **nejsou** výhry soutěže
- Partner Offers se **nesmí** počítat do výpočtu vzdálenosti k nejbližší výhře v `TicketResultModal`
- Partner Offers se **nesmí** zapisovat do tabulek `winners` ani `bonus_prizes`
- `assign_partner_offer_to_ticket` se volá pouze při `won_type === null`

---

## Vizuální systém — NEDOKONČENO (27. 04. 2026)

Grafika je rozpracovaná. Momentálně testujeme funkčnost systému. Grafika se dořeší poté.

**Větve s vizuálními změnami (obě nemergnuto do `main`):**
- `claude/setup-playwright-tests-bShrg` — Poppins + Energy Orange (commity `d6d4597`, `25e87dd`)
- `claude/thirsty-volhard-e1eb7c` — zmírnění zlaté, soft rgba bordery (commit `a21ef28`)

**Soubory dotčené vizuálními změnami:**
- `src/index.css` — CSS proměnné gold → amber-orange, glow opacity snížena
- `src/components/ContestCard.css` — border sweep a inner glow zmírněny
- `src/components/ContestCard.tsx` — border, progress bar, CTA button barvy
- `src/components/MioCoin.tsx` — outer ring gradient, shadow snížena

**Co je potřeba dořešit:**
- Rozhodnutí o mergi větví do `main`
- Sjednocení fontu (Poppins vs Plus Jakarta Sans)
- Vizuální review všech stránek po brand aplikaci
- Schválení výsledku v prohlížeči před mergem

---

## Aktuální uzamčený stav (13. 04. 2026, dokumentace synchronizována 20:46:33 +02:00)
- Dočasný frontend private-access gate v `src/App.tsx` byl odstraněn (2026-04-10); přihlášení a role routing beze změny; `npm run build` ověřen úspěšně.
- Partner Offers v1 je dokončené, nasazené a prošlo finálním E2E ověřením.
- Chybějící wiring byl doplněn v `supabase/functions/purchase-ticket/index.ts`, takže assignment běží automaticky po `buy_ticket_atomic` při `won_type === null`.
- Block E frontend je nasazený a builduje čistě (commit `b7aa4ce`):
  - `src/components/OfferCard.tsx` — existuje
  - `src/components/OfferDetailModal.tsx` — existuje
  - `src/pages/Wins.tsx` — obsahuje tab Výhry / Nabídky
- Partner portal offer management UI nasazeno v `src/pages/PartnerDashboard.tsx` (2026-04-11):
  - Partner vidí seznam svých nabídek s reálnými stavy (draft/submitted/approved/rejected)
  - Může vytvářet draft, odesílat ke schválení, vracet zamítnuté k úpravám
  - Approved nabídky jsou read-only (nelze editovat)
  - Build: ✅ exit code 0
- Partner billing visibility nasazeno v `src/pages/PartnerDashboard.tsx` (2026-04-12):
  - Karta „Fakturace nabídek" čte `partner_offer_activations`, `partner_offer_billing_configs`, `partner_invoices(type='offer')`
  - PDF download volá `generate-partner-invoice-pdf` přes `withEdgeInternalToken`
- `category_contests` zůstává mimo v1, dokud nebude existovat skutečný model kategorií soutěží.
- OneMil kanonické memory soubory jsou pouze:
  - `onemil_state.md`
  - `onemil_history.md`
  - `CLAUDE.md`
  v workspace `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw`.

## Contest admin – uzamčená pravidla (13. 04. 2026, sync 20:46:33 +02:00)

### Statuses
- Platné hodnoty v DB (constraint `contests_status_check`): `draft`, `pending`, `active`, `paused`, `closed`
- `draft` se v admin UI zobrazuje jako **„Archiv test"** — DB hodnota se nemění
- `closed` je pouze systémový přechod — admin ho nemůže nastavit ručně
- **`closed` je finální** — uzavřená soutěž se nesmí vrátit do žádného jiného stavu; `handleStatusChange` to blokuje guard + disabled Select

### Admin contest management UX
- `src/components/AdminContestManagement.tsx` — 3 taby: Aktivní soutěže / Archiv test / Archiv ukončených soutěží (archiv na stejné stránce, ne nová stránka ani row dropdown)
- `closed` soutěže patří do tabu Archiv ukončených soutěží
- Přechod do `draft` (Archiv test): povolen jen z `pending` nebo `paused`; z `active` zablokován
- Contest create: `AdminContestManagement` → `admin_manage_contest`; `ticket_count` musí být platný na frontendu i při create na RPC (žádný tichý default / žádné tiché přijetí neplatného nebo chybějícího `ticket_count`)
- Lovable: po změnách admin UI často **Share → Publish**, aby byl live build v prohlížeči

### Hard delete – zakázáno
- Hard delete soutěže je nebezpečný: `partner_offer_contests.contest_id` má FK na `contests(id)`
- Soft detach (`detached_at`) logicky odpojí nabídku, ale FK řádky fyzicky zůstávají → DELETE selže
- Testovací soutěže se archivují přesunem do `draft`, ne mazáním; neřadit je mezi běžné produkční „cleanup" cíle
- V admin UI je delete povolen pouze pro `draft` a `pending` (testovací fáze)

### Co se nesmí měnit
- `buy_ticket_atomic` — bez explicitní instrukce
- `assign_partner_offer_to_ticket` — bez explicitní instrukce
- `partner_offer_contests` — neměnit FK model; **nemazat** vazební řádky natvrdo kvůli úklidu soutěží
- Trigger `trg_partner_offer_approved` — neměnit
- Přechod `active` → `draft` musí zůstat zablokovaný
- Úklid soutěží: řešit stavem (`draft` / Archiv test), ne mazáním contestu ani mazáním `partner_offer_contests`

---

## Brand Identity (uzamčeno 27. 04. 2026)

Full reference: `docs/brand/onemil_brand_kit/graphics.md` (source zip: `docs/brand/onemil_brand_kit.zip`)
**Tagline:** Luxusní soutěže. Skutečné výhry.

- **Aesthetic:** dark premium tech-luxury — never casino / hazard / gambling / jackpot / roulette / chips / slot-machine (visuals or wording)
- **Headings:** Poppins 600–800 (Google Fonts import only — no font files in repo)
- **Body / UI:** Inter 400–500
- **Accent colour:** Energy Orange `#FF8A00` (primary CTA gradient: `#FF8A00` → `#FFB547`)
- **Backgrounds:** Midnight Black `#0A0B0F` / Deep Navy `#101722` / Graphite `#1D2128`
- **Text:** Platinum `#E7EBF0` / Silver `#BFC6CF` / Muted Silver `#8E98A6`
- **CSS token prefix:** `--om-*` (e.g. `--om-orange`, `--om-black`, `--om-platinum`)
- **Primary logo:** trophy / "1" motif *behind* the OneMil wordmark (web, app, hero)
- **Secondary logo:** trophy *above* the OneMil wordmark — stacked (social, banners, posters)
- **Standalone icon:** trophy / "1" symbol only — favicon, app icon, avatars
- **Logo colour:** metallic silver / platinum gradient (not flat white, not yellow gold)
- **Forbidden words (CZ):** casino, hazard, sázení, sázka, jackpot, žetony, zbohatni
- **Forbidden words (EN):** casino, gambling, betting, jackpot, roulette, chips, slot
- **Use instead:** soutěž, tiket, MioCoin, voucher, hlavní výhra, luxusní cena

---

## Git workflow rule

After ANY code change that is confirmed working:
1. git add .
2. git commit -m "<short clear message>"
3. git push

Rules:
- NEVER push broken code
- ALWAYS test before push
- NEVER skip push after confirmed fix

---

## State/History auto-commit rule

Po každém zápisu do `onemil_state.md` nebo `onemil_history.md` automaticky spusť:

```sh
git add -A && git commit -m "update state" && git push origin main
```

Toto pravidlo platí vždy, bez výjimky — nikdy nenechávej state/history změny bez commitu a pushe.

---

## Paperclip — operační pravidla (12. 05. 2026)

Paperclip běží lokálně jako AI management vrstva pro OneMil.
Spuštění: `npx paperclipai onboard --yes` z `C:\Users\divis\Desktop\Onemil - Projekt\million-ticket-draw`.
Detailní setup viz `PAPERCLIP_SETUP_CONTEXT.md`.

### Aktivní agenti

| Agent | Adaptér | Role |
|-------|---------|------|
| Provozní ředitel OneMil | claude_local / codex_local | Manažer, deleguje práci |
| Průzkumník obchodních leadů OneMil | codex_local | Lead research, hledá firmy |

### Pravidla pro Claude Code při práci s Paperclipem

- **Nikdy nečti `onemil_history.md` automaticky** v kontextu Paperclip agentů — pouze na výslovnou žádost Pavla.
- Provozní ředitel **deleguje** lead scouting, velké tabulky, marketingový průzkum a repetitivní práci na Průzkumníka. Sám zpracovává, pouze pokud Pavel řekne „zpracuj osobně".
- Výstupy se **zveřejňují přímo do komentáře Paperclip issue** (ne jen jako interní soubor).
- Soubory (CSV, Markdown, reporty) se ukládají do: `C:\Users\divis\Desktop\OneMil Paperclip Outputs`
- Nový agent se **navrhuje, ale nespouští** bez schválení Pavla Diviše.
- Pavel Diviš je owner a final decision maker — žádná akce (e-mail, outreach, GitHub, Supabase, Stripe, produkce) bez jeho výslovného schválení.

---

## Social login visibility rule (31. 05. 2026)

- Canonical config: `src/config/socialAuth.ts`.
- `src/pages/Login.tsx` and `src/pages/Register.tsx` should only read `ENABLED_OAUTH_PROVIDERS`; do not duplicate provider visibility logic there.
- Google and Facebook buttons are visible by default.
- Hide Google or Facebook only with explicit env disable flags: `VITE_ENABLE_GOOGLE_AUTH=false` / `0`, `VITE_ENABLE_FACEBOOK_AUTH=false` / `0`.
- Apple is hidden by default because Supabase returned `Unsupported provider: provider is not enabled`.
- Show Apple only when `VITE_ENABLE_APPLE_AUTH=true` / `1` and the provider is actually enabled in Supabase.
- Do not change Supabase Auth config, database, email/password login, registration links, profile, wallet, contests, tickets, vouchers, winners, Partner Offers, AI chat, or admin when adjusting only social button visibility.
- Related commits: `cdbaec0`, `ec48700`, `3874f20`.

---

## Affiliate v2 staging E2E status after security model change (03. 06. 2026)

- Affiliate v2 no longer uses `VITE_INTERNAL_FUNCTION_TOKEN` in the Lovable/browser build.
- Reason: the Lovable workspace does not have Build Secrets, and we do not want to expose an internal token in the browser.
- Edge Functions `get-pending-partner-registrations` and `approve-partner-registration` are protected by
  `Authorization: Bearer <user JWT>`, `supabaseAdmin.auth.getUser(token)`, and `user_roles` check for
  `admin` / `superadmin`.
- Security model commit: `9f3f53b55f89a3f0c2b16637af32335376fede1d`.
- CORS/staging verification commit: `9bf059d1cf712db36dbc70309dc735e451899d97`.
- `get-pending-partner-registrations` no longer returns `401`.
- Browser E2E `affiliate company via flow` passed.
- Verified flow: `/partner/register?via=KOD` -> pending registrace -> admin schvaleni -> `partner` ->
  `affiliate_company_refs` -> `partners.referred_by_affiliate_id`.
- Run URL: `https://github.com/Divuna/million-ticket-draw/actions/runs/26887279500`.
- Production was not touched.
- Before production deployment, Lovable `VITE_INTERNAL_FUNCTION_TOKEN` is no longer required.

Rules for follow-up work:

- Do not restore the deleted affiliate branch.
- Do not touch production without Pavel's explicit confirmation.
- Do not change customer accounts.
- Do not change Partner portal except where necessary to verify pending registrations.
- Do not change payments, tickets, contests, wallet, or `buy_ticket_atomic`.
## ADMIN NAVIGACE — PARTNEŘI PENDING BADGE (07. 06. 2026, invariant)

`AdminContextSubNav.tsx` zobrazuje u položky `/admin/partners` (`Partneři`) červený číselný badge s počtem čekajících partnerských registrací. Počet se načítá read-only přes existující `get-pending-partner-registrations`; badge se zobrazuje jen když count > 0. Kliknutí zůstává `/admin/partners`. Neměnit schvalování partnerů, DB, affiliate logiku, onboarding ani zprávy. Commit `0339cd4a`.

## AFFILIATE / REFERRAL PUBLIC LINKS — BEZ LOVABLE/LOCALHOST (07. 06. 2026, invariant)

Veřejné affiliate/referral/partner odkazy používat přes `src/lib/publicAppUrl.ts`. `VITE_APP_URL` je povolené jen jako HTTPS a nesmí být localhost, Lovable ani preview; jinak fallback `https://onemil.cz`. Správné odkazy: `https://onemil.cz/?ref=CODE` a `https://onemil.cz/partner/register?via=CODE`. Neměnit DB, tracking, provize, partner registration logic, ticket/wallet logic ani UI grafiku. Commit `d2b12504`.
## B2B SALES REP / AGENCY COMPANY LEADS — TARGET WORKFLOW (07. 06. 2026, invariant)

Target `Přidat firmu` flow belongs in `/affiliate/dashboard` mode `Obchodník`: sales rep / agency enters company name, IČO, DIČ, company email, website, contact person / phone, and sales rep note. The company must receive an email saying who sent the request and what OneMil is, with `Potvrzuji žádost` and `Zamítnout žádost`. Until company confirmation it is only an invitation/lead, not a full admin partner registration. After company confirmation it moves to admin approval; dashboard states must include `odesláno firmě`, `firma potvrdila`, `firma zamítla`, `čeká na schválení adminem`, `schváleno`, `zamítnuto adminem`. After admin approval, create/activate the company partner account, write `affiliate_company_refs`, mirror to `partners.referred_by_affiliate_id`, and send a secure one-time password setup link with expiration. Never email generated passwords. Commission must not arise from lead creation, company confirmation, or admin approval; it arises only from paid/factured company activity such as paid `partner_invoices`. Influencer codes remain mainly for customers; B2B attribution must not rely only on public shared links; sales reps cannot claim companies without company confirmation; companies must be able to reject requests; admin approves only company-confirmed requests.

Placement invariant: `/affiliate/login` remains login-only. Never place `Přidat firmu` on the Affiliate login page, and never allow public/unauthenticated B2B company claim from login. `Přidat firmu` belongs only inside `/affiliate/dashboard`, visible only to approved affiliate accounts whose `modes` includes `sales_rep`, in the sales rep / `Obchodník` section near `Moje firmy`, leads, request statuses and company commission data. Influencer-only accounts without `sales_rep` must not see it.

Phase 1 DB invariant: planned table name is `affiliate_company_leads`, a pre-attribution workflow layer only. `affiliate_id` must be nullable with `ON DELETE SET NULL`, not cascade, and lead history must remain readable through snapshots: `sales_rep_affiliate_id_snapshot`, `sales_rep_ref_code_snapshot`, `sales_rep_email_snapshot`, `sales_rep_name_snapshot`. Sales rep eligibility requires `affiliate_accounts.status = 'approved'`, `'sales_rep' = ANY(modes)`, and `affiliate_accounts.auth_user_id = auth.uid()`. Allowed statuses: `sent_to_company`, `company_confirmed`, `company_rejected`, `pending_admin_approval`, `approved`, `admin_rejected`, `expired`. Company confirmation/rejection must go through an Edge Function or `SECURITY DEFINER` RPC with hashed token. Final attribution after admin approval remains only in `affiliate_company_refs` plus `partners.referred_by_affiliate_id`, with `affiliate_company_refs.source = 'company_lead'`. No commission from lead creation, company confirmation or admin approval; commission only from paid/factured company activity.

Staging DB status: `affiliate_company_leads` Phase 1 is applied on STAGING only (`onemil-staging`, ref `dxmowysntemfqfnanxua`). Production `xkzhjldrojjlrkezorey` was not touched. Applied staging migrations: `affiliate_company_leads_phase1` and `supabase/migrations/20260607173746_affiliate_company_leads_admin_reviewed_by_index.sql` (commit `3260b1c60f1a01e7c524443ce1c413c739891621`). Staging verification: table exists, RLS enabled, policies exist, `anon` has no access, `authenticated` has SELECT only through RLS, normal users have no INSERT/UPDATE/DELETE, and index `idx_affiliate_company_leads_admin_reviewed_by` exists. Do not implement UI/Edge/email/admin approval/commission/partner registration/ticket/wallet/graphics changes as part of this DB status.

Phase 2 backend design invariant: approved design only, not implemented. Required backend units are `create-affiliate-company-lead` (authenticated Edge Function from `/affiliate/dashboard`, approved `sales_rep` only, create lead, generate secure token, store only hash, send company confirmation email, return `{ success: true, lead_id, status: "sent_to_company" }`), `confirm-affiliate-company-lead` (public token endpoint, validate hash/expiry/unused token, confirm -> `pending_admin_approval`, reject -> `company_rejected`, no partner/attribution/commission), and `approve-affiliate-company-lead` (admin-only Edge Function optionally backed by RPC, approve only `pending_admin_approval`, create/activate partner, write `affiliate_company_refs.source = 'company_lead'`, mirror `partners.referred_by_affiliate_id`, send secure password setup link, never email generated password, no commission). Allowed transitions: `sent_to_company -> pending_admin_approval`, `sent_to_company -> company_rejected`, `sent_to_company -> expired`, `pending_admin_approval -> approved`, `pending_admin_approval -> admin_rejected`. Block direct `sent_to_company -> approved`, approval after rejected/expired, mutation after approved, and attribution before admin approval. Keep production untouched; do not change ticket/wallet/payment/`buy_ticket_atomic`/graphics/login placement/commission logic.

## SECURITY BACKLOG (09. 06. 2026)

Pre-existing security findings z 2026-05-24 nejsou součástí Phase 2 a mají být řešeny samostatným bezpečnostním auditem. Při G3 publishi Phase 2 (`/admin/affiliate-commissions`) bylo 23 nálezů (Supabase linter + supabase_lov) označeno jako ignore s odůvodněním „pre-existing, unrelated to Phase 2". Tyto nálezy musí být znovu otevřeny a vyřešeny v samostatném security audit ticketu — netýkají se commission UI a nebyly zavedeny Phase 2 změnou.
## C22 CUSTOMER PASSWORD RESET (14. 06. 2026)

Clean branch `codex/customer-password-reset-clean` brings only the customer password reset work from source commit `daafb1d0` onto current `main`. Keep this scoped: `/reset-password` is the customer Supabase Auth reset route, `/partner/set-password` remains the partner setup route. Do not mix this with the old `codex/affiliate-payouts-audit` branch, Partner API, invoices, reward logic, SQL, deploys, or production data.

PR #115 merged to `main` as `a7690d0b63b9f0c46bcf96f8e2810605dd5e934a`. Targeted staging workflow `27507097356` ran spec 44 against `main`/`a7690d0b` and passed. Earlier local post-merge failure was a `page.goto('/login')` timeout caused by local dev-server startup/reuse timing; CI-mode local rerun also passed 3/3. No SQL, deploy, production data, Partner API, invoice, reward, or migration changes in the C22 verification follow-up.

---

## LEGAL / PUBLIC TEXTS P0 REVIEW (14. 06. 2026)

Documentation-only static audit. `/terms`, `/privacy`, `/kontakt`, cookie banner/settings, footer legal links, and CMS route wiring were reviewed. Static pages exist and are not obvious placeholders, but CMS-backed legal routes `/vop`, `/gdpr`, `/pravidla-souteze`, and `/legal/cookies` still require owner/environment confirmation of real content. Owner confirmed `podpora@onemil.cz` as the canonical public support e-mail, and documentation/source-of-truth wording has been aligned. Do not invent legal wording or edit legal text without owner approval. No code, SQL, deploy, production data, Partner API, invoice, reward, or migration change.

---
## PWA INSTALL CTA — VĚTEV `feature/pwa-install-ui` (16. 06. 2026)

PWA install UI je připravené na samostatné větvi `feature/pwa-install-ui`; NEMERGOVAT do `main` bez Pavlova potvrzení ručních phone checků.

Implementační commit: `a030ad512f2b01fa81ec84de110e92dabdbf9ddd`.

Vytvořeno: `src/hooks/usePwaInstallPrompt.ts`, `src/components/InstallAppButton.tsx`.
Změněno: `src/pages/Homepage.tsx`, `docs/launch-readiness/PWA_INSTALL_IMPLEMENTATION_PLAN.md`, `onemil_state.md`, `onemil_history.md`, `CLAUDE.md`.

Build: `npm run build` prošel. Runtime simulace prošla: desktop bez promptu CTA hidden; Android `beforeinstallprompt` → CTA + `prompt()`; accepted → hidden; iPhone Safari UA → instruction modal; standalone display mode → hidden.

Nedotčeno: `public/manifest.webmanifest`, public ikony, `public/OneSignalSDKWorker.js`, Supabase, Stripe, payments, wallet, contests, tickets, winners, Partner Offers, affiliate, Bob, routes, legal pages a unrelated UI.

Zbývá ručně ověřit na telefonu: Android Chrome native install dialog, Android launch z plochy, iPhone Safari `Přidat na plochu`, iPhone launch z plochy skrývá CTA.
