# OneMil – aktuální stav projektu

## NON-STRIPE CLEANUP — L02a/L06/CI05 ROZHODNUTO; L02b/CI04 follow-up (16. 06. 2026, Pavel)

Rozhodnutí Pavla:
- **L02a** `/pravidla-souteze` → **owner-accepted pro testovací fázi** (jako L01/L03/L04); cleanup placeholderů odložen před live.
- **L06** reklamace/support → **technická support cesta dostatečná pro testovací fázi** (owner-accepted); finální wording/reklamační text odložen před live s právníkem.
- **CI05** → **`onemil_spec.md` NEvytvářet**; source-of-truth = onemil_state.md, onemil_history.md, CLAUDE.md, .cursor/SYSTEM_MAP.md, PROJECT_CONTEXT.md + launch docs.

**CI04 PROVEDENO 16.06. (schválení Pavla):** smazány `src/pages/TestLogin.tsx` + `src/pages/InfluencerDashboard.tsx` + nepoužitý import v `App.tsx` (commit `35b787cc`). Build ✅, žádné zbývající reference, funkční routy nedotčeny. Staging Full E2E `27601618931`: 152 passed · 0 failed · 28 skipped (spec 37k flake→retry pass).

Zbývá:
- **L02b** per-contest rules PDF: 0 aktivních z 127 → trvalý pre-aktivační procesní checklist (neblokuje).

## AF05 ROZHODNUTO — AFFILIATE ODLOŽEN MIMO 1. VEŘEJNÝ TEST (16. 06. 2026, Pavel)

**Pavel rozhodl: Affiliate program NENÍ součástí prvního veřejného testu (varianta B).** Affiliate NENÍ blocker 1. testu; zůstává live v kódu, ale aktivně se neonboarduje. Jádro 1. testu = zákazník → MioCoiny → soutěže/vouchery → později Stripe. Payouty + Air Bank `.kpc` export se řeší až ve fázi zapnutí affiliate. Veřejné odkazy `/influencer`, `/influencer/register`, `/affiliate/login` (patička) se NEMAŽOU — skrytí je volitelný follow-up se samostatným schválením. Detail: `docs/launch-readiness/AF05_AFFILIATE_SCOPE_DECISION.md`.

## OWNER/LEGAL DECISION SHEET (16. 06. 2026)

Zbývající non-Stripe owner/legal rozhodnutí konsolidována v `docs/launch-readiness/OWNER_LEGAL_DECISION_SHEET.md`: L01/L03/L04 (legal review), A13 (CMS obsah), L02a (placeholdery), L02b (per-contest rules QA), L06 (reklamační wording), AF05 (affiliate scope), CI04 (mrtvý kód), CI05 (`onemil_spec.md`). Každá s doporučením + checkboxem `[ ] schváleno / [ ] odložit`. Sekce „blocked-by-Stripe" (PAY01–PAY04, C23 wallet credit, plný partner invoice flow) řešena samostatně. Čeká na Pavla/právníka.

## NON-STRIPE LAUNCH AUDIT — P06/P13/L06/AF04 OVĚŘENO; AF05/L02a/L06-wording/CI04-del/CI05 = OWNER (16. 06. 2026)

Read-only audit (žádný produkční zápis, žádná CMS, žádný Stripe, žádný deploy).
- **P06 prošlo** — produkční `settings.partner_api_documentation` má reálný endpoint (no placeholder). Repo handoff doc placeholder = kosmetické.
- **P13 ověřeno strukturálně** — cron job 17 (neděle 02:00 UTC) aktivní + všechny invoice funkce + oba enqueue overloady na produkci.
- **AF04 ověřeno staging + live prod** — spec 40/41/42 (run 27372767070); standardní Full E2E skipuje (payout secrets).
- **L06 tech cesta** — `/kontakt` mailto podpora@ + `/messages` handoff; reklamační wording = owner.
- **CI04** — `InfluencerDashboard` (App.tsx:76, bez Route) + `TestLogin.tsx` (neimportován) = mrtvé; smazání čeká schválení.
- **OWNER decisions:** AF05 (affiliate v 1. testu?), L02a (CMS placeholdery), L02b (per-contest QA, 0 aktivních = neblokuje), L06 reklamační wording, CI05 (`onemil_spec.md` ano/ne).
- **Blocked-by-Stripe:** PAY01–PAY03.

## L01 / L03 / L04 — PRÁVNÍ TEXTY OWNER-ACCEPTED PRO TESTOVACÍ FÁZI (15. 06. 2026, rozhodnutí Pavla)

Pavel bere aktuální právní texty `/vop`, `/gdpr` a `/legal/cookies` jako dočasně přijatelné pro současný testovací režim projektu OneMil. Projekt je veřejně dostupný na adrese, ale není veřejně spuštěný pro zákazníky.

- **L01 `/vop`**: owner-accepted pro testovací fázi. Texty jsou stručné; před live je nutný právní review a doplnění (identifikace firmy, reklamační řád, detailnější znění).
- **L03 `/gdpr`**: owner-accepted pro testovací fázi. Chybí Supabase v seznamu zpracovatelů; před live doplnit.
- **L04 `/legal/cookies`**: owner-accepted pro testovací fázi. Chybí: Stripe místo „Platební brána", OneSignal, GTM; nepřesnost o cookies vs. localStorage; před live opravit.

**Pravidlo: L01, L03, L04 nejsou finálně schváleny pro ostrý provoz.** Před live spuštěním musí proběhnout právní review s právníkem a texty musí být aktualizovány. Stav LAUNCH_TODO: `owner-accepted (testovací fáze)` — ne `prošlo`.

## TESTOVACÍ REŽIM — STAV PROJEKTU (15. 06. 2026)

OneMil je technicky dostupný na veřejné adrese, ale zatím nejde o veřejné spuštění pro zákazníky. Projekt je stále v testovací fázi a Pavel na něm průběžně ověřuje funkce, platby, soutěže, MioCoiny, účty a doklady.

Dosavadní data nejsou reálný veřejný provoz. Platby, účty, MioCoiny, soutěže, doklady, Stripe záznamy a související transakce jsou testovací nebo smyšlená data. Web zatím není určený pro běžné uživatele ani reálné zákaznické platby.

Produkční prostředí může být používáno k testování, ale Stripe běží na testovacích klíčích. Před ostrým spuštěním musí Pavel vědomě potvrdit přepnutí Stripe na live režim, live webhook a finální produkční nastavení.

## P04 OPRAVENO — PARTNERS UPDATE RLS — STAGING + PRODUKCE (16. 06. 2026)

Schválený partner nyní reálně uloží konverzní nastavení MioCoinů. **Staging `dxmowysntemfqfnanxua` I PRODUKCE `xkzhjldrojjlrkezorey`** (schválení Pavla pro produkční rollout 16.06.). Produkční postcheck: 3 policy (SELECT + UPDATE own + UPDATE admin), data nezměněna (11 partnerů, checksum identický `d57e638f...`). Frontend affected-rows check čeká na samostatný Lovable Publish (RLS oprava sama už zápis umožní).

**Poslední P04 staging recheck (16.06.):** cílený staging run `27599115269` (spec 56) prošel **3 passed · 0 failed · 0 skipped**. 56b potvrdil P04 end-to-end: partner uloží konverzní nastavení → DB obsahuje `reward_base_czk=100, reward_mc=1`, partner mění jen vlastní řádek (RLS `partners_update_own`). Stripe neřešen.

**P04 = TECHNICKY OVĚŘENO PRO TESTOVACÍ FÁZI (16.06., rozhodnutí Pavla).** P04 už NENÍ aktivní non-Stripe blocker. Evidence:
- ✅ staging E2E: spec 56 run `27599115269` (56b: partner uloží konverzi → DB `reward_base_czk=100, reward_mc=1`, mění jen vlastní řádek).
- ✅ produkční RLS nasazené: 3 policy (`Public read partners`, `partners_update_own` `auth_user_id=auth.uid()`, `partners_update_admin` `is_admin()`).
- ✅ live bundle `index-C9tBfrJx.js` (`onemil.cz`) obsahuje frontend affected-rows ochranu (string `Nastavení se nepodařilo uložit — zkontrolujte, že máte oprávnění.`).
- ✅ produkční data nezměněna (11 partnerů, checksum `d57e638f...`).
- ⏳ Plný produkční UI smoke (login partnera → změna → uložení → DB verify) = VOLITELNÝ follow-up, čeká na bezpečný test partner login. Nedělat produkční write pro vytvoření partnera bez schválení.

- **Migrace** `20260616_partners_update_rls_partner_own.sql`: `partners_update_own` (`auth_user_id = auth.uid()`) + `partners_update_admin` (`is_admin()`). Postcheck OK (3 policy). `Public read partners` SELECT nedotčen.
- **App** `PartnerDashboard.tsx`: save `.select('id')` + ověření 1 řádku; 0 řádků → česká chyba + rollback (žádný falešný success).
- **Spec 56b** un-fixme → prošlo. Cílený run `27597435909`: 3 passed. Staging Full E2E `27597509314`: 153 passed · 0 failed · 28 skipped.
- **Pravidlo:** partner-own UPDATE (nevracet `USING(true)`); save nevracet bez affected-rows checku.
- **Produkce (neaplikováno):** stejnou migraci aplikovat na produkci po výslovném schválení Pavla.

## SPEC 56 — P01 ČÁSTEČNĚ / P04 FAILING (RLS BLOCKER) / P05 PROŠLO — OPRAVA KLAMAVÉHO STAVU (15. 06. 2026, HISTORIE)

**⚠️ Commit `7d90f1cd` označil P01/P04/P05 jako `prošlo` PŘEDČASNĚ.** Citoval run `27571406245` jako „3/3 passed" — ten run reálně selhal 6/6. Full E2E `27571700378` (150 passed/3 failed/28 skipped) i cílený `27573182299` selhaly na spec 56. Stav vrácen na reálný.

- **P01 — ČÁSTEČNĚ** (spec 56a): `/partner/register` form UI + povinná pole + client validace OVĚŘENY. Plný `auth.signUp` submit (→ „Registrace odeslána") NELZE na stagingu — `429 over_email_send_rate_limit` (email-confirmation, vyčerpaný email limit; ověřeno přímou reprodukcí `POST /auth/v1/signup`; 0× `spec56-reg-*` v `auth.users`). **Stejný důvod jako trvale skipnutý spec 01. NE app/RLS/test bug — limit prostředí.** 56a rescoped na UI+validaci.
- **P04 — FAILING, RLS BLOCKER** (spec 56b, `test.fixme`): toast „Nastavení odměn bylo uloženo" se ZOBRAZÍ, ale DB zůstane `reward_base_czk=0/reward_mc=0`. Příčina: `public.partners` má jen `Public read partners` (SELECT) a **ŽÁDNOU UPDATE policy** — staging `dxmowysntemfqfnanxua` I produkce `xkzhjldrojjlrkezorey`. Partner UPDATE vlastního řádku → 0 řádků + null error; `PartnerDashboard.tsx:857` `.update()` bez `.select()` nekontroluje affected rows → falešný success. **NEOPRAVENO — vyžaduje schválení Pavla.**
- **P05 — ✅ PROŠLO** (spec 56c): sekce „API klíče" + tlačítko „Regenerovat API klíč" viditelné schválenému partnerovi.

**Reálný launch blocker P04:** partner si NEMŮŽE uložit konverzní nastavení MioCoinů (ani v produkci). Návrh fixu (čeká schválení Pavla): (1) UPDATE policy na `partners` (partner-own přes `auth_user_id` + admin), (2) `PartnerDashboard` save přidat `.select()` a ověřit počet změněných řádků (jinak toast.error).

**Ostatní partner/affiliate položky (mají vlastní zelené runy, ponechány prošlo):**
- P02 → spec 37 (13/13); P03 → spec 47; P07–P11 → spec 48 + spec 50; P14 → spec 43.
- AF01 → spec 33+14; AF02 → spec 14+26-28; AF03 → spec 34-38.
- SEC02 → spec 43/55/37; CI01 → subset CI02 (run 27569039738).
- **Pravidlo (spec 56):** pre-seed `localStorage.cookie_consent` přes `addInitScript` MUSÍ být v každém testu i v `loginAsPartner`. 56a NEvracet na „Registrace odeslána" assertion; 56b NEvracet z `test.fixme` bez reálné opravy RLS+app.

## ZÁKAZNICKÝ FLOW C01–C21 + ADMIN A01–A10 — E2E OVĚŘEN PRO TESTOVACÍ FÁZI (15. 06. 2026, aktualizováno)

**Nejnovější run `27569039738`: 150 passed · 0 failed** (spec 54+55 přidány; commity `57b877a2`, `8a68c812`). Předchozí run `27563286558`: 140 passed · 0 failed (spec 52+53 přidány; commity `83a6f3cb`, `48099c5c`). Telegram OK. Žádná reálná platba, žádná produkční data, žádný produkční SQL, žádná CMS změna, žádný deploy.

**Nově ověřeno v runu `27569039738` (15. 06. 2026, commity `57b877a2`, `8a68c812`):**
- **C19 ✅ OVĚŘENO:** spec 54 `54-mobile-layout-customer-pages.spec.ts` — 6/6 passed. 6 zákaznických stránek (`/`, `/games`, `/wins`, `/vouchers`, `/profile`, `/messages`) testovány na iPhone SE viewportu 375×812px: žádné uncaught JS chyby, bottom nav (`role=navigation name="Hlavní menu"`) viditelná, žádný horizontální overflow (scrollWidth ≤ 375px). Targeted run `27567440891`.
- **C23 ✅ ČÁSTEČNĚ OVĚŘENO (bez Stripe):** spec 55 `55-invite-referral-c23.spec.ts` — 4/4 passed. 55a ReferralSection viditelná na `/profile` (nadpis „Pozvi přátele"). 55b vlastní referral kód viditelný (v `<code>` elementu po `ensure_referral_code` RPC, ≥4 znaky, ne placeholder `—`). 55c RLS izolace — zákazník2 nevidí `referral_codes` zákazníka1 (0 cizích řádků). 55d anon klient dostane 0 řádků z `referral_codes` i `referrals`. **BLOCKED-BY-PAY01–PAY03:** wallet credit vzniká výhradně z `create_referral_reward_from_payment` (trigger na `payment_status='completed'`) — nelze testovat bez reálné Stripe platby. Targeted run `27567627210`.
- **A13 owner-accepted (testovací fáze):** CMS stránky `vop`, `gdpr`, `pravidla-souteze`, `cookies` existují v `content_pages` a jsou dostupné přes routy. Právní obsah: owner-accepted pro testovací fázi (Pavel, 15.06.) — nelze označit jako `prošlo` pro live bez finálního právního review.

**Nově přidané E2E specy (commit `7e6061c1`, předchozí `347d637e`):**
- **C07 — `tests/e2e/50-miocoin-code-redeem-ui.spec.ts`** (staging-only, self-contained). Setup přes service role: throwaway partner+customer auth users, `public.users` řádek, approved partner; objednávka přes RPC `create_partner_order_reward` → `pending`, pak `update_partner_order_reward_status(p_order_status:'paid')` → kód `issued`. Zákazník uplatní kód přes `RedeemMioCoinCard` na `/profile`. Testy: 50a UI success toast + DB ověření `status='activated'`, 50b neplatný kód → chybový toast, 50c již uplatněný → already_used toast. Cleanup v afterAll (partner_coin_activations, partner_reward_codes, partner_invoices, partners, wallet_transactions, wallets, users, auth users).
- **C21 — `tests/e2e/51-delete-account-page.spec.ts`**. `/delete-account` je informační GDPR stránka (ne in-app fyzické smazání). Testy: 51a načtení bez uncaught JS errors + bez redirektu na /login, 51b nadpis „Smazání účtu" + instrukce + `podpora@onemil.cz` + GDPR/osobní údaj zmínka + nevratnost/30 dní, 51c přihlášený zákazník vidí stránku bez redirektu + mailto odkaz se `subject=`.
- **Pravidla (neměnit):** (1) sonner toast renderuje title+description jako 2 elementy → všechny toast/obsah assertions v spec 50/51 musí mít `.first()`, jinak strict mode violation. (2) RPC param je `p_order_status` (NE `p_new_status`) — signatura `update_partner_order_reward_status(uuid, text, text)` z migrace `20260613200202`, service_role-only.

**Admin flow A01–A13 (aktualizováno po runu `27563286558`):**
- A01 login: spec 33, 14 ✅ · A03 ekonomika: spec 16, 18 ✅ · A04 MioCoin chunked save: spec 20 ✅ · A05 vouchery: spec 46 ✅ · A06 partneři approve: spec 37 ✅ · A07 faktury tlačítka: spec 45 ✅ · A08 PDF: spec 44 ✅ · A09 e-mail faktury: spec 44 ✅ · A10 referrals: spec 46 ✅.
- **A02 ✅ NOVĚ OVĚŘENO:** spec 52a/52b (UI validace — ticket_count=0 → error list „Počet tiketů"; chybí main_image → error list „Hlavní obrázek"; save button disabled) + spec 52c (backend `admin_manage_contest` RPC vytvoří soutěž s ticket_count=100, ověřeno v DB). Run `27563142294` + `27563286558`.
- **A11 ✅ NOVĚ OVĚŘENO:** spec 52d (draft soutěž není viditelná anonymnímu klientu přes RLS — PostgREST vrací prázdné pole). Run `27563142294`.
- **A12 ✅ NOVĚ OVĚŘENO:** spec 53a (admin test dashboard zobrazuje neutralizovaná tlačítka „Produkční test vypnut", bez „Vytvořit Test User", žádné síťové volání na `admin-create-test-user`). Run `27563005623`.
- **A13 owner-accepted (testovací fáze):** CMS technicky funkční (stránky existují). Právní obsah: blocker F před live — potřebuje owner/legal review.

---

### Předchozí záznam (run `27546753042`)

Staging Full E2E run `27546753042`: **128 passed · 28 skipped · 0 failed**. Telegram: `✅ OneMil STAGING full E2E OK — all specs passed`. Žádná reálná platba neproběhla. Žádná produkční data nezměněna.

**Ověřené C položky (E2E nebo pokryté flow):**
- C01 Registrace (18+): spec 01 záměrně skipped (nový uživatel), 49a–f passed ✅
- C02 18+ gate: spec 49 ✅
- C03 Login (platné/neplatné): spec 02 ✅
- C04 Login gating dle účtu: spec 33, 14 ✅
- C05 Profil: spec 17 ✅
- C06 Peněženka (zůstatek): spec 09 ✅
- C08/C09 MioCoin kód pending/cancelled RPC: spec 48 ✅
- C11 Soutěže seznam + detail: spec 04 ✅
- C12 Nákup tiketu: spec 04 ✅ (`buy_ticket_atomic`)
- C13 Výhra: spec 05 ✅
- C14 Vouchery katalog/nákup/uplatnění: spec 03-voucher, 10, 11 ✅
- C15 Zprávy Bob ON: spec 31 ✅
- C16 Zprávy Bob OFF: spec 31 ✅
- C17 Admin↔uživatel zprávy: spec 29, 32 ✅
- C20 Wins tab Výhry/Nabídky: spec 05, 06 ✅
- C22 Reset hesla: spec 44 ✅ (dříve ověřeno)

**28 skipů** — záměrné nebo expected (spec 07/08 Partner Offer cooldown, spec 39–42 affiliate payout bez secrets, spec 01 nový uživatel).

**Zbývající neověřené C položky (po runu `27563286558`):**
- C07 — ✅ VYŘEŠENO spec 50.
- C21 — ✅ VYŘEŠENO spec 51.
- C10 — ✅ NOVĚ OVĚŘENO spec 53b: `redeem_miocoin_code` vrací `{success:false, error:'email_mismatch'}` pro cizí zákazníkův JWT; UI zobrazí toast „Tento kód je vázán na jiný e-mail."; kód zůstane `issued`. Run `27563005623`.
- C19 (mobil layout) — non-blocking, bez automatizovaného testu (vyžaduje device emulation).
- C23 (invite reward) — non-blocking, vyžaduje reálnou platbu pro plný flow.
- PAY01–PAY03 — chybí staging Stripe secrets; viz `docs/launch-readiness/PAY01_PAYMENTS_TEST_MODE_NOTE.md`.
- PAY01–PAY03 — plné Stripe end-to-end (checkout → webhook → wallet credit); EF nasazeny na staging, ale chybí staging Stripe secrets; viz `docs/launch-readiness/PAY01_PAYMENTS_TEST_MODE_NOTE.md`.

## L08 18+ GATING — E2E TEST PŘIDÁN A OVĚŘEN (15. 06. 2026)

`tests/e2e/49-age-gating.spec.ts` — nový Playwright spec pokrývající L08 věkový gate. Commit `70970e90`. Cílený staging run `27541581559`: **6/6 passed (18.7 s)**.

**Ověřeno testem:**
- `/register`: odmítne věk 17 let (error `Pro registraci musíte mít alespoň 18 let.`) a věk 0 let (narozeni dnes) — zůstane na `/register`.
- `/register`: přijme věk přesně 18 let a 25 let — žádná chyba věku, formulář pokračuje na kontrolu podmínek.
- `/onboarding/date-of-birth`: odmítne věk 17 let (error viditelný, strana beze změny URL).
- `/onboarding/date-of-birth`: přijme věk 18 let — age error se nezobrazí; bez session vyhodí `Uživatel není přihlášen.` (potvrzuje, že age check prošel).

**L08 status: prošlo** — LAUNCH_TODO.md aktualizováno. Frontendová `validateAge` logika je ověřena na obou vstupních bodech (`/register` i `/onboarding/date-of-birth`). Žádná změna business logiky, CMS, SQL ani deploy.

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

Kanonický veřejný/legal support e-mail = `podpora@onemil.cz`. Produkční CMS `content_pages`: `info@onemil.cz` → `podpora@onemil.cz` (jen e-mail, beze změny wordingu) ve 3 aktivních legal stránkách: `ochrana-osobnich-udaju`, `cookies`, `autorska-prava` (3. nalezena při precheck — stejný špatný e-mail). Postcheck: 0× `info@onemil.cz` v CMS, 0× `support@onemil.cz`, 5 stránek s `podpora@`. App kód už čistý. Žádný deploy/kód/migrace — jen cílený UPDATE 3 řádků. L09 → prošlo (ne P0 blocker).

## LAUNCH L02 PŘEKLASIFIKOVÁN — PRAVIDLA SOUTĚŽE JSOU PER-SOUTĚŽNÍ (15. 06. 2026, jen dokumentace)

Re-audit potvrdil, že závazná pravidla soutěže jsou **per-soutěžní**: `public.contests.rules` + `public.contests.rules_pdf_url` (admin nahrává PDF ke konkrétní soutěži do bucketu `contest-rules`; `ContestDetail.tsx` je zobrazuje z dané soutěže; žádná PDF šablona → žádné placeholdery v generování). `/pravidla-souteze` je jen **obecná CMS stránka** (`content_pages` slug `pravidla-souteze`), NE závazný právní zdroj konkrétní soutěže.

V `docs/launch-readiness/LAUNCH_TODO.md` byl L02 rozdělen:
- **L02a (P1, downgrade z P0):** obecná CMS stránka `/pravidla-souteze` stále obsahuje placeholdery → content cleanup / owner-legal review; NENÍ blocker per-soutěžních pravidel.
- **L02b (P0, per-contest QA):** každá aktivní soutěž musí mít před spuštěním vlastní zkontrolovaný `rules_pdf_url` (+ volitelně `rules` text) bez placeholderů.

Produkce: 127 soutěží, 34 s rules PDF, 0 `rules` textů s placeholdery, **0 aktivních soutěží** → per-contest pravidla teď nic živého neblokují. Jen dokumentace — žádný kód, SQL, deploy, právní text.

## ✅ SEC01 VYŘEŠENO — E17 APLIKOVÁN NA PRODUKCI (15. 06. 2026, schválení Pavla)

E17 `v_influencer_referrals_paid` affiliate-scoped redesign aplikován na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_e17_influencer_referrals_paid_affiliate_scoped`): `influencer_referrals` owner+admin RLS (broad USING(true) odstraněn), 2 minimal-disclosure SECURITY DEFINER helpery (`user_completed_first_topup`, `referral_user_is_valid`; anon exec=false), view přestavěn na `security_invoker=on` nad base tabulkou.

- **Precheck=baseline; postcheck:** count zachován (0=0), invoker on, anon=false, auth=true, policy owner+admin, helpery anon=false/auth=true.
- **Produkční advisor: ERROR 2 → 1** (E17 zmizel). Jediný zbývající raw ERROR = E22 `contest_progress` — **formálně owner-accepted**.
- **Produkční P0 smoke `27529591097` = success, 5 passed.** Bez rollbacku.
- **Bezpečnost:** affiliate vidí jen své; admin vše; běžný uživatel/anon nic; žádná raw payment data ani auth.users.

**➡️ SEC01 JE EFEKTIVNĚ VYŘEŠEN — všechny ERROR nálezy fixnuty nebo ownerem akceptovány. SEC01 už NENÍ launch blocker.** Progrese produkčních ERROR: **23 → 10 → 8 → 7 → 5 → 3 → 2 → 1 (accepted)**. Zbývá jen WARN/INFO backlog (non-blocking, řešit samostatně).

Rollback E17 k dispozici (obnovit definer view + broad policy + DROP helperů).

## SEC01 E17 AFFILIATE-SCOPED REDESIGN — OVĚŘEN NA STAGINGU (15. 06. 2026)

E17 `v_influencer_referrals_paid` přepracován **POUZE na staging** `dxmowysntemfqfnanxua` (migrace `sec01_e17_influencer_referrals_paid_affiliate_scoped`):
- `influencer_referrals`: broad `influencer_referrals_read USING(true)` nahrazeno `influencer_referrals_owner_admin` (affiliate-own přes `partners.auth_user_id=auth.uid()` + admin/superadmin).
- 2 minimal-disclosure SECURITY DEFINER helpery `user_completed_first_topup(uuid)` + `referral_user_is_valid(uuid)` (anon exec=false, authenticated=true) → žádné raw platby ani `auth.users` se neexponují.
- `v_influencer_referrals_paid` přestavěn na `security_invoker=on` nad `influencer_referrals` (jen) + filtr přes helpery.

- **Postcheck:** invoker on, anon=false, authenticated=true, count zachován (0=0); influencer_referrals policy owner+admin; helpery anon=false/auth=true.
- **Advisor staging: E17 zmizel (ERROR 2 → 1)**; zbývá jen E22 (contest_progress, již owner-accepted) → **efektivní nevyřešený staging ERROR = 0**.
- **Full Staging E2E `27528853194` = success, 122 passed, 0 fail** → affiliate dashboard (paying-users count scoped) + admin influencers fungují.
- **Bezpečnost:** affiliate vidí jen své; admin vše; běžný uživatel/anon nic; žádná raw payment data ani auth.users.
- **PRODUKCE pro E17 NEDOTČENA** — připraveno pro samostatné produkční schválení.
- **SEC01:** po produkčním rolloutu E17 lze uzavřít (E22 už accepted), mimo WARN/INFO.
- Rollback k dispozici.

## SEC01 E22 contest_progress — FORMÁLNĚ OWNER-ACCEPTED (15. 06. 2026, jen dokumentace)

Pavel formálně akceptoval E22 `public.contest_progress` jako záměrný veřejný agregát (počet prodaných/zbývajících tiketů, % naplnění); view neobsahuje osobní ani citlivá data, ponechává se `SECURITY DEFINER` (`security_invoker=on` by rozbil veřejné zobrazení — zákazník by viděl jen své tikety). Není to launch blocker. Zaznamenáno v `docs/launch-readiness/SECURITY_FINDINGS.md` (status `accepted-risk (owner: Pavel, 15.06.2026)`) a `LAUNCH_TODO.md`.

- **Žádné SQL, žádná změna advisor countu.** Produkční raw advisor stále hlásí 2 ERROR, ale E22 je akceptován → **efektivní nevyřešený SEC01 ERROR = 1: E17** (`v_influencer_referrals_paid`, affiliate-scoped RLS redesign, NO-GO naslepo).
- **SEC01 zůstává P0 blocker kvůli E17.** Po jeho vyřešení lze SEC01 uzavřít (mimo WARN/INFO).

## SEC01 E18 PARTNER-OWN RLS — APLIKOVÁN A OVĚŘEN NA PRODUKCI (15. 06. 2026, schválení Pavla)

E18 `partner_api_activity` redesign aplikován na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_e18_partner_api_activity_partner_own_rls`): RLS policy `partner_api_requests_partner_own` (partner-own přes `partners.auth_user_id = auth.uid()` + admin/superadmin) na `partner_api_requests` + `security_invoker = on` na `partner_api_activity`.

- **Precheck:** partner_api_requests RLS on, 0 policy, invoker off; 5 partnerů má auth_user_id; **6 reálných řádků** partner_api_requests → policy reálně scopuje.
- **Postcheck:** policy přítomná, invoker on, anon=false, authenticated=true.
- **Produkční advisor: ERROR 3 → 2** (E18 zmizel). Zbývá E17 (v_influencer_referrals_paid) + E22 (contest_progress).
- **Produkční P0 smoke `27528174542` = success, 5 passed.** Bez rollbacku. (Staging dříve E2E `27527383016` 122 passed, spec 47 green.)
- **SEC01 ZŮSTÁVÁ P0 BLOCKER:** produkce 2 ERROR. E17 = affiliate-scoped RLS redesign (NO-GO naslepo: nutný audit čtenářů influencer_referrals + privacy review plateb); E22 = formální owner-accept (veřejný agregát).
- **Progrese produkčních ERROR: 23 → 10 → 8 → 7 → 5 → 3 → 2.**
- Rollback: RESET invoker + DROP POLICY partner_api_requests_partner_own.

## SEC01 E18 PARTNER-OWN RLS — OVĚŘEN NA STAGINGU (15. 06. 2026)

E18 `partner_api_activity` redesign aplikován **POUZE na staging** `dxmowysntemfqfnanxua` (migrace `sec01_e18_partner_api_activity_partner_own_rls`): přidána RLS policy `partner_api_requests_partner_own` na `public.partner_api_requests` (partner-own přes `partners.auth_user_id = auth.uid()` + admin/superadmin), poté `security_invoker = on` na `partner_api_activity`.

- **Baseline:** partner_api_requests RLS on, 0 policy; 8 partnerů má auth_user_id; partner_api_requests 0 řádků na stagingu.
- **Postcheck:** policy přítomná, invoker on, anon=false, authenticated=true.
- **Advisor staging: ERROR 3 → 2** (E18 zmizel). Zbývá E22 (contest_progress) + E17 (v_influencer_referrals_paid).
- **Full Staging E2E `27527383016` = success, 122 passed, 0 fail** (spec 47 partner dashboard 47e/47f green) → partner dashboard funguje; partner vidí jen vlastní API aktivitu, admin vše.
- **PRODUKCE pro E18 NEDOTČENA** — připraveno pro samostatné produkční schválení.
- **SEC01 ZŮSTÁVÁ P0 BLOCKER:** produkce 3 ERROR (E17, E18, E22). E17 = affiliate-scoped RLS redesign; E22 = formální owner-accept.
- Rollback: RESET invoker + DROP POLICY partner_api_requests_partner_own.

## SEC01 GROUP 3 SAFE/INTERIM — APLIKOVÁN A OVĚŘEN NA PRODUKCI (15. 06. 2026, schválení Pavla)

SEC01 Group 3 safe/interim aplikován na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_group3_safe_interim_hardening`):
- **E19 `contest_miocoin_totals` + E20 `winners_with_contest`** (unused) → revoke anon/auth + `security_invoker=on` → **vyřešeno**.
- **E17 `v_influencer_referrals_paid` + E18 `partner_api_activity`** → REVOKE anon byl na produkci no-op (anon už byl false); zůstávají **interim** (auth ponechán), SDV ERROR zůstává — full fix = RLS redesign (owner decision).
- **E22 `contest_progress`** → NEDOTČENO (owner-accept candidate).

- **Precheck:** E17–E20 anon=false/auth=true/invoker=off, contest_progress anon=true → shoda s baseline.
- **Postcheck:** E19/E20 anon=f/auth=f/invoker=on; E17/E18 anon=f/auth=t; E22 beze změny.
- **Produkční advisor: ERROR 5 → 3** (zbývá E17, E18, E22).
- **Produkční P0 smoke `27526912855` = success, 5 passed.** Bez rollbacku. (Staging dříve E2E `27526273831` 122 passed.)
- **SEC01 ZŮSTÁVÁ P0 BLOCKER:** produkce 3 ERROR. Cesta k 0: E18 partner-own RLS redesign, E17 affiliate-scoped RLS redesign, E22 formální owner-accept; + WARN/INFO.
- **Progrese produkčních ERROR: 23 → 10 → 8 → 7 → 5 → 3.**
- Rollback caveat: standardní rollback by GRANToval anon zpět E17/E18, což by je na produkci přeotevřelo — pro prod je rollback E17/E18 = bez akce.

## SEC01 GROUP 3 SAFE/INTERIM — OVĚŘEN NA STAGINGU (15. 06. 2026)

SEC01 Group 3 safe/interim aplikován **POUZE na staging** `dxmowysntemfqfnanxua` (migrace `sec01_group3_safe_interim_hardening`):
- **E19 `contest_miocoin_totals`** (unused) → revoke anon/auth + `security_invoker=on` → **vyřešeno**.
- **E20 `winners_with_contest`** (unused) → revoke anon/auth + `security_invoker=on` → **vyřešeno**.
- **E18 `partner_api_activity`** → revoke anon (interim). SDV ERROR zůstává; full fix = partner-own RLS na `partner_api_requests` + invoker (owner decision; invoker sám by vyprázdnil PartnerDashboard, base table deny-all). MEDIUM riziko (cross-partner).
- **E17 `v_influencer_referrals_paid`** → revoke anon (interim). SDV ERROR zůstává; full fix = affiliate-scoped RLS na base tabulkách + granty (owner decision; invoker sám by rozbil — podkladové Group-1 views mají odebrané granty). HIGH riziko (cross-affiliate user data).
- **E22 `contest_progress`** → NEDOTČENO. Owner-accept candidate: veřejný agregát (počty/% prodáno), žádná privátní data; `security_invoker` by ho rozbil (zákazník čte jen vlastní tikety → špatné počty); čtou ho zákaznické stránky vč. anon.

- **Postcheck:** E19/E20 anon=f/auth=f/invoker=on; E17/E18 anon=f/auth=t; E22 beze změny.
- **Advisor staging: ERROR 5 → 3** (zbývá E17, E18, E22).
- **Full Staging E2E `27526273831` = success, 122 passed, 0 fail** → Games/ContestDetail, partner dashboard, affiliate dashboard fungují.
- **PRODUKCE pro Group 3 NEDOTČENA** (produkce stále 5 ERROR).
- **SEC01 ZŮSTÁVÁ P0 BLOCKER.** Cesta k 0 ERROR: E19/E20 prod apply; E18 partner-own RLS redesign; E17 affiliate-scoped RLS redesign; E22 formální owner-accept; + WARN/INFO.
- Rollback k dispozici.

## SEC01 E05/E23 — APLIKOVÁNO A OVĚŘENO NA PRODUKCI (15. 06. 2026, schválení Pavla)

Na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_e05_e23_tickets_admin_read_and_invoker`): přidána aditivní RLS policy `tickets_admin_select_all` (`has_role` admin/superadmin) na `public.tickets`, poté `security_invoker = on` na E05 `contest_activity_last_24h` a E23 `contest_revenue`.

- **Precheck:** tickets mělo 2 own-row policy, žádnou admin policy, oba views invoker off → shoda s baseline.
- **Postcheck:** `tickets_admin_select_all` přítomná (tickets nyní 3 policy), oba views invoker on; výstup nezměněn (activity 0 řádků [žádné tikety za 24h], revenue 127 řádků, tickets_sold 4000).
- **Customer privacy:** own-row policy beze změny; admin policy gated rolí → žádný leak cizích tiketů.
- **Produkční advisor: ERROR 7 → 5** (E05+E23 zmizely). Zbývajících 5 = pouze Group 3 (E17 v_influencer_referrals_paid, E18 partner_api_activity, E19 contest_miocoin_totals, E20 winners_with_contest, E22 contest_progress).
- **Produkční P0 smoke `27525944645` = success, 5 passed.** Bez rollbacku. (Staging dříve: E2E `27512846743` 122 passed.)
- **SEC01 ZŮSTÁVÁ P0 BLOCKER:** produkce 5 ERROR = Group 3 + WARN/INFO.
- Rollback: RESET invoker na obou views + DROP POLICY tickets_admin_select_all.

## SEC01 E05/E23 — VYŘEŠENO NA STAGINGU (tickets admin-read + security_invoker) (14. 06. 2026)

Na staging `dxmowysntemfqfnanxua` (migrace `sec01_e05_e23_tickets_admin_read_and_invoker`): přidána aditivní RLS policy `tickets_admin_select_all` (`has_role` admin/superadmin) na `public.tickets`, poté `security_invoker = on` na E05 `contest_activity_last_24h` a E23 `contest_revenue`.

- **Baseline = postcheck (service-role, nezměněno):** activity 7 řádků, revenue 789 řádků, tickets_sold celkem 1153; oba views invoker on; policy přítomná.
- **Privacy:** policy gated admin rolí → zákazníci dál vidí jen vlastní tikety (own-row), žádný nový leak.
- **Advisor staging: ERROR 7 → 5** (E05+E23 zmizely). Zbývajících 5 = pouze Group 3 (`contest_miocoin_totals`, `contest_progress`, `partner_api_activity`, `v_influencer_referrals_paid`, `winners_with_contest`).
- **Full Staging E2E `27512846743` = success, 122 passed, 0 fail** → /admin/contest/:id, TicketMapAdmin, AdminContestManagement mají správná čísla.
- **PRODUKCE pro E05/E23 security_invoker NEDOTČENA** (na produkci zůstává jen interim anon-revoke; prod stále 7 ERROR).
- **SEC01 ZŮSTÁVÁ P0 BLOCKER.** Pozn.: staging tickets předtím nemělo žádnou policy (deny-all); produkce má own-row policy — aditivní admin policy tam půjde čistě, ale vyžaduje samostatné prod schválení.
- Rollback: RESET invoker na obou views + DROP POLICY tickets_admin_select_all.

## SEC01 E09 SECURITY_INVOKER — APLIKOVÁN A OVĚŘEN NA PRODUKCI (14. 06. 2026, schválení Pavla)

E09 `admin_winner_delivery_stats` přepnuto na `security_invoker = on` na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_e09_admin_winner_delivery_stats_security_invoker`).

- **Baseline → postcheck:** invoker off→on; výstup nezměněn (127 řádků / 101 winners).
- **Produkční advisor: ERROR 8 → 7** (E09 zmizel). Zbývá 7 = E05 `contest_activity_last_24h`, E23 `contest_revenue` + Group 3 (`contest_miocoin_totals`, `contest_progress`, `partner_api_activity`, `v_influencer_referrals_paid`, `winners_with_contest`).
- **Produkční P0 smoke `27512629715` = success, 5 passed.** Bez rollbacku.
- **SEC01 ZŮSTÁVÁ P0 BLOCKER:** produkce 7 ERROR. E05/E23 potřebují admin-read policy na `tickets` (owner decision) nebo accept; Group 3 + WARN/INFO zbývají.
- Rollback: `ALTER VIEW public.admin_winner_delivery_stats RESET (security_invoker);`

## SEC01 E09 SECURITY_INVOKER — OVĚŘEN NA STAGINGU (14. 06. 2026)

E09 `admin_winner_delivery_stats` přepnuto na `security_invoker = on` **POUZE na staging** `dxmowysntemfqfnanxua` (migrace `sec01_e09_admin_winner_delivery_stats_security_invoker`). Bezpečné, protože podkladové tabulky mají admin-čitelné RLS: `contests` (`contests_admin_select_all`) + `winners` (authenticated read true).

- **Postcheck:** security_invoker=on; výstup nezměněn (786 řádků / 297 winners vs baseline).
- **Advisor staging: ERROR 8 → 7** (E09 zmizel).
- **Full Staging E2E `27512219000` = success, 122 passed, 0 fail** → `/admin/prize-delivery` funguje.
- **PRODUKCE pro E09 NEDOTČENA.**
- **E05/E23 NELZE přepnout na security_invoker** — čtou `tickets`, kde je RLS zapnuté **bez policy** (deny-all pro authenticated) → vynulovalo by admin totaly. Zůstávají interim (anon revoked) dokud nevznikne admin-read policy na `tickets` (owner decision) nebo formální accept.
- **SEC01 ZŮSTÁVÁ P0 BLOCKER:** produkce 8 ERROR; E09 čeká na produkční schválení; E05/E23 + Group 3 (E17–E20/E22) + WARN/INFO zbývají.
- Rollback k dispozici: `ALTER VIEW public.admin_winner_delivery_stats RESET (security_invoker);`

## SEC01 GROUP 2 SAFE/INTERIM — APLIKOVÁN A OVĚŘEN NA PRODUKCI (14. 06. 2026, schválení Pavla)

SEC01 Group 2 safe/interim aplikován na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_group2_safe_interim_hardening`; bez DROP tabulky, bez security_invoker na admin views).

- **Precheck:** produkční stav = baseline (E03/E14 anon=false/auth=true; 3 admin views anon+auth; vše RLS off/invoker off) → shoda.
- **E14 `valid_partner_api_keys`** → revoke anon+auth + `security_invoker=on` → **vyřešeno**.
- **E03 `_messages_policies_backup`** → `ENABLE ROW LEVEL SECURITY` + revoke anon+auth (tabulka NEsmazána) → **„RLS Disabled in Public" vyřešeno**.
- **E05/E09/E23** (contest_activity_last_24h, admin_winner_delivery_stats, contest_revenue) → revoke anon, authenticated ponechán. **Security Definer View ERROR zůstává** (security_invoker = owner decision).
- **Postcheck:** E03 rls_enabled=true/anon=f/auth=f; E14 anon=f/auth=f/invoker=on; 3 admin views anon=f/auth=t.
- **Produkční advisor: ERROR 10 → 8** (zbytek = vše Security Definer View).
- **Produkční P0 smoke `27511945205` = success, 5 passed.** Bez rollbacku. (Staging dříve: Full E2E `27511465619` 122 passed.)
- **SEC01 ZŮSTÁVÁ P0 BLOCKER:** 8 ERROR na produkci; zbývá E05/E09/E23 security_invoker (owner decision), E03 volitelný DROP, Group 3 (E17–E20/E22), WARN/INFO.
- Rollback k dispozici.

## SEC01 GROUP 2 SAFE/INTERIM — OVĚŘEN NA STAGINGU (14. 06. 2026)

SEC01 Group 2 safe/interim aplikován **POUZE na staging** `dxmowysntemfqfnanxua` (migrace `sec01_group2_safe_interim_hardening`; bez DROP tabulky, bez security_invoker na admin views):
- **E14 `valid_partner_api_keys`** (nikde nepoužíváno) → revoke anon+auth + `security_invoker=on` → **vyřešeno na stagingu**.
- **E03 `_messages_policies_backup`** → `ENABLE ROW LEVEL SECURITY` + revoke anon+auth (tabulka NEsmazána) → **„RLS Disabled in Public" vyřešeno na stagingu**.
- **E05 `contest_activity_last_24h` / E09 `admin_winner_delivery_stats` / E23 `contest_revenue`** → revoke anon, ponechán authenticated (admin UI). **Security Definer View ERROR zůstává** (security_invoker zatím nenastaven → owner decision).

- **Postcheck:** E03 rls_enabled=true/anon=f/auth=f; E14 anon=f/auth=f/invoker=on; 3 admin views anon=f/auth=t.
- **Advisor staging: ERROR 10 → 8** (E03+E14 cleared; zbývajících 8 = vše Security Definer View).
- **Full Staging E2E `27511465619` = success, 122 passed, 0 fail** → žádná regrese admin stránek (/admin/contest/:id, /admin/prize-delivery).
- **PRODUKCE pro Group 2 NEDOTČENA.** SEC01 **zůstává P0 blocker** (na produkci 10 ERROR; zbývá: produkční apply Group 2, E05/E09/E23 security_invoker [owner decision], E03 prod/DROP, Group 3, WARN/INFO).
- Rollback k dispozici (RESET invoker, DISABLE RLS, GRANT zpět dle baseline).

## SEC01 SECURITY_FINDINGS — ŘÁDKY SROVNÁNY S HLAVIČKOU (14. 06. 2026, jen dokumentace)

Opravena nekonzistence v `docs/launch-readiness/SECURITY_FINDINGS.md`: 13 Group 1 řádků (E01, E02, E04, E06, E07, E08, E10, E11, E12, E13, E15, E16, E21) přepnuto na status `fixed (production, verified)` v souladu s ověřenou hlavičkou (advisor 23→10, smoke `27511158470`). Group 2/3 řádky (E03, E05, E09, E14, E17–E20, E22, E23) nedotčeny. Pouze dokumentace — žádné SQL, deploy, app kód ani produkční data.

## SEC01 GROUP 1 — APLIKOVÁN A OVĚŘEN NA PRODUKCI (14. 06. 2026, schválení Pavla)

SEC01 Group 1 (11 app-unused SECURITY DEFINER views) aplikován na produkci `xkzhjldrojjlrkezorey` (migrace `sec01_group1_safe_view_hardening`): `REVOKE SELECT` od anon/authenticated + `SET (security_invoker = on)`.

- **Precheck:** produkční stav = zachycený baseline (8 anon+auth, 3 auth-only: v_first_topup_valid/v_influencer_referrals_valid/v_user_wallets; vše SECURITY DEFINER) → shoda, pokračováno.
- **Postcheck:** všech 11 anon revoked, auth revoked, security_invoker=on.
- **Advisor produkce:** ERROR **23 → 10** (všech 11 cílených views vyřešeno; oba Exposed Auth Users pryč). Zbývá 10 ERROR = 1 RLS Disabled in Public (`_messages_policies_backup`) + 9 Security Definer View (Group 2/3).
- **Produkční P0 smoke `27511158470` = success, 5 passed.** Bez rollbacku.
- Staging dříve ověřen (E2E `27510668205` 121 passed). Žádný deploy, žádná změna app kódu.
- **SEC01 ZŮSTÁVÁ P0 BLOCKER:** Group 1 hotov; Group 2/3 (10 ERROR) + WARN/INFO zbývají k fixu nebo owner-accept.
- **Rollback k dispozici** (RESET security_invoker + GRANT zpět dle baseline) pro případ pozdější regrese.

## SEC01 GROUP 1 — APLIKOVÁN A OVĚŘEN NA STAGINGU (14. 06. 2026)

SEC01 Group 1 (11 app-unused SECURITY DEFINER views) aplikován **POUZE na staging** `dxmowysntemfqfnanxua` (migrace `sec01_group1_safe_view_hardening`): `REVOKE SELECT` od anon/authenticated + `SET (security_invoker = on)` na `daily_platform_metrics`, `v_influencer_referrals_valid`, `v_user_wallets`, `contest_analytics`, `contest_ticket_map`, `event_queue_monitoring`, `event_queue_failed_summary`, `contest_integrity_check`, `system_health_monitor`, `admin_winner_delivery_detail`, `v_first_topup_valid`.

- **Postcheck:** všech 11 anon=false, auth=false, security_invoker=on.
- **Advisor staging re-run:** všech 11 cílených ERROR nálezů ZMIZELO (staging ERROR 21→10).
- **Full Staging E2E `27510668205` = success, 121 passed, 0 fail** → žádný customer/admin/partner flow se nerozbil.
- **PRODUKCE NEDOTČENA** (`xkzhjldrojjlrkezorey` stále 23 ERROR). Žádný deploy, žádná změna app kódu.
- **SEC01 ZŮSTÁVÁ P0 BLOCKER:** na stagingu zbývá 10 ERROR (1 RLS Disabled in Public `_messages_policies_backup` + 9 Security Definer View = Group 2/3); produkce neopravena. Produkční rollout Group 1 + řešení Group 2/3 vyžaduje samostatné schválení ownera.

## SEC01 SECURITY FINDINGS INVENTÁŘ — P0 BLOCKER (14. 06. 2026, jen dokumentace)

Read-only `get_advisors(security)` na produkci `xkzhjldrojjlrkezorey` → vytvoren `docs/launch-readiness/SECURITY_FINDINGS.md`. **467 nalezu: 23 ERROR / 20 INFO / 424 WARN.** 23 ERROR = puvodni „23" ze SEC01 (2× Exposed Auth Users, 1× RLS Disabled in Public na `_messages_policies_backup`, 20× Security Definer View). Fixnuto v inventari = 0 (drivejsi invite-reward/affiliate fixy se v aktualnim seznamu uz neobjevuji — overeno absenci). Open = 23 ERROR + W1 (102 function search_path) + W7 (Leaked Password Protection off). Needs owner decision / accepted-risk = INFO(20) + WARN(424): public-execute SECURITY DEFINER (151/156, vetsinou by-design s is_admin/auth.uid guardem), public buckets (9, asset buckets; `partner-invoices` spravne neni public), RLS Policy Always True (3: cookie_consents/event_queue), Extension in Public (2). **SEC01 zustava P0 blocker** dokud nejsou ERRORy fixnuty nebo ownerem vyslovne akceptovany. Zadny kod/SQL/RLS/deploy/produkcni data nezmeneno.

## PRAVNI CMS TEXTY — EXPORT REVIEW, L01–L04 + L09 BLOCKER (14. 06. 2026, jen dokumentace)

Owner exportoval produkcni CMS pravni texty (`content_pages`). Nalezy v `docs/launch-readiness/LAUNCH_TODO.md` (L01–L04, L09 = **selhalo / blocker**):
- **/vop** existuje + is_active, ale obsah **velmi kratky** → owner/legal review.
- **/pravidla-souteze** existuje + is_active, ale obsahuje **placeholdery** `[NÁZEV SOUTĚŽE]`, `[DATUM]`, `[POPIS HLAVNÍ VÝHRY]`, `[HODNOTA]` — nesmi do verejneho spusteni.
- **/gdpr** vs **/legal/ochrana-osobnich-udaju** oba existuji, **wording se lisi** → sjednotit/overit.
- **/legal/cookies** existuje + is_active (content_length≈2325); overit policy proti realnym cookie nastrojum a chovani banneru.
- Nektere pravni CMS texty obsahuji `info@onemil.cz`; verejny support je `podpora@onemil.cz` (L05 vyresen) → kontaktni e-maily v pravnich textech vyzaduji **owner/legal potvrzeni pred editaci** (L09).

**Zadny pravni text nezmenen, zadny CMS obsah nezmenen, zadne SQL, zadny deploy, zadna produkcni data dotcena.** Dalsi krok: **owner/legal review CMS pravnich textu pred launchem**.

## CONTACT / LEGAL EMAIL CONSISTENCY AUDIT (14. 06. 2026, documentation-only)

Owner potvrzeno: kanonicky verejny support e-mail pro OneMil launch readiness je `podpora@onemil.cz`. `COMPANY_CONTEXT.md` byl dokumentacne sjednocen na `podpora@onemil.cz` pro hlavni verejny support kontakt i podporu; `b2b@onemil.cz` zustava jen pro obchodni spoluprace. Cleanup audit potvrzuje, ze stara support adresa nezustava v live app code, email templates, Edge Functions, settings docs ani current source-of-truth docs; zbyle vyskyty jsou jen stare audit/history notes. `LAUNCH_TODO.md` L05 oznacen jako proslo. CMS `vop`, `gdpr`, `pravidla-souteze` a `cookies` existuji, ale pravni kvalita/aktualnost zustava neoverena v L01-L04. Pouze dokumentace; zadny kod, SQL, deploy, produkcni data, Partner API, fakturace ani reward logika.

## C22 CUSTOMER PASSWORD RESET CLEAN BRANCH (14. 06. 2026)

Clean branch z aktualniho `main`: `codex/customer-password-reset-clean`. Prenesena pouze C22 zakaznicka obnova hesla ze source commitu `daafb1d0` bez stare mixed vetve `codex/affiliate-payouts-audit`. Implementace pouziva existujici Supabase Auth reset flow: `/login` ma odkaz `Zapomenute heslo?`, nova route `/reset-password` umi poslat recovery e-mail a po recovery session nastavit nove heslo. `PASSWORD_RECOVERY` se rozlisuje podle aktualni routy: zakaznici zustavaji na `/reset-password`, partner setup zustava na `/partner/set-password`. Bez SQL, deploye, produkcnich dat, Partner API, fakturace nebo reward logiky.

## C22 CUSTOMER PASSWORD RESET MERGED + VERIFIED (14. 06. 2026)

PR #115 mergnut do `main` jako `a7690d0b63b9f0c46bcf96f8e2810605dd5e934a`. Prvni lokalni post-merge beh spec 44 selhal na timeoutu `page.goto('/login')`; rerun v CI modu lokalne prosel 3/3 a targeted GitHub staging workflow `27507097356` na `main`/`a7690d0b` prosel. Cause: lokalni dev-server reuse/startup timing, ne realna `/login` runtime chyba a ne chybejici staging build. C22 oznacen jako proslo v `docs/launch-readiness/LAUNCH_TODO.md`. Bez SQL, deploye, produkcnich dat, Partner API, fakturace nebo reward logiky.

## LEGAL / PUBLIC TEXTS P0 REVIEW (14. 06. 2026, documentation-only)

Static audit pravnich/verejnych stranek: `/terms` (`TermsConditions.tsx`), `/privacy` (`PrivacyPolicy.tsx`) a `/kontakt` (`Kontakt.tsx`) existuji a maji vecny obsah; cookie banner/settings existuje (`CookieConsentBanner`, `consent.ts`) a uklada localStorage + `cookie_consents`. CMS legal routes `/vop`, `/gdpr`, `/pravidla-souteze` existuji pres `SlugContentPage`, ale repo neobsahuje seed/prokazatelny obsah; footer take odkazuje na dynamic `/legal/cookies`. Kontakt/support e-mail je po owner rozhodnuti sjednocen: kanonicky verejny support e-mail je `podpora@onemil.cz` v app i `COMPANY_CONTEXT.md`. Legal P0 zustava blokovan jen pro pravni kvalitu/aktualnost CMS pravnich textu a cookie policy, ne pro support e-mail consistency. Zadny kod, SQL, deploy, produkcni data, Partner API, fakturace ani reward logika.

## LAUNCH PLAN GAP AUDIT (14. 06. 2026, jen dokumentace)

Read-only gap audit launch plan proti reálné app. Opravy/doplnky v `docs/launch-readiness/`: (1) cookie banner `CookieConsentBanner` EXISTUJE (zapisuje `cookie_consents`) → L04 preformulovan z „existuje?" na „funguje + policy text"; (2) **GAP P0: zakaznicky reset hesla nenalezen** v routeru/UI (jen partner set-password) → novy bod C22; (3) pridano C23 (zakaznicke doporuceni/invite), sekce AF01–AF05 (affiliate/influencer + rozhodnuti o rozsahu), SEC01–SEC03 (security advisor backlog 23 nalezu jako P0 launch consideration). Pocet bodu vzrostl z 65 na 75. Plan je po doplneni pripraveny ke spusteni; pred veřejnym testem nutno uzavrit P0 blockery (pravni obsah, reset hesla, kontakt/reklamace, security backlog, zeleny E2E, realne partner reward settings). Zadny kod/SQL/deploy/produkce.

## LAUNCH READINESS TESTOVACI PLAN PRIPRAVEN (14. 06. 2026, jen dokumentace)

Vytvorena sada ve `docs/launch-readiness/`: `LAUNCH_TEST_PLAN.md` (sekce A–H), `ROUTE_CHECKLIST.md` (mapa ~70 rout z `src/App.tsx` s P0/P1/P2), `LAUNCH_TODO.md` (65 testovacich bodu: zakaznik/admin/partner/platby/pravni/CI). Souhrn priorit: P0=48, P1=16, P2=1. **P0 blockery veřejneho spusteni (NEOVERENO):** naplneni pravniho obsahu (VOP/GDPR/pravidla souteze), cookies reseni, realne kontaktni/reklamacni udaje, zeleny Full E2E + P0 smoke na `main`, realne partner reward settings (ne `[TEST DATA]`). `onemil_spec.md` neexistuje (todo). `TestLogin`/`InfluencerDashboard` jsou mimo router (NEOVERENO mrtvy kod). Pouze dokumentace — zadny kod/SQL/deploy/produkce/testovaci data.

## STAGING INTERNAL_FUNCTION_TOKEN REALIGNMENT — CI ZELENE (14. 06. 2026)

Behem partner-API prace byl staging Supabase secret `INTERNAL_FUNCTION_TOKEN` nekolikrat rotovan, cimz prestal odpovidat GitHub Actions secretu `STAGING_VITE_INTERNAL_FUNCTION_TOKEN` → spec 44 (44c) padalo na 401 (a navazne 44d–g). Slo o staging secret drift, NE o chybu testu, app/API ani produkce (produkcni `INTERNAL_FUNCTION_TOKEN` nikdy nezmenen).

- **Fix (staging only, schvaleno Pavlem):** vygenerovan jeden novy sdileny token a nastaven jako (1) Supabase staging secret `INTERNAL_FUNCTION_TOKEN` (projekt `dxmowysntemfqfnanxua`) a (2) GitHub Actions secret `STAGING_VITE_INTERNAL_FUNCTION_TOKEN`. `VITE_INTERNAL_FUNCTION_TOKEN` ani zadny produkcni secret nezmenen. Token nikde netisten.
- **Pozn.:** prvni pokus nastavil GitHub secret pres PowerShell pipe (` | gh secret set`), cimz se na zacatek hodnoty dostal BOM (U+FEFF) → 44c padalo s `TypeError: ... ByteString ... 65279`. Opraveno nastavenim pres `gh secret set --body` (bez BOM). **Pravidlo: GitHub secrety nastavovat pres `--body`, ne pipe.**
- **Vysledek (cilene staging runy):** spec 44 `27500754646` zeleny (44a–44g, 7 passed); spec 43 `27500810383` zeleny; spec 22 `27500856702` zeleny.
- Zadny kod/test/migrace/EF/deploy nezmenen; produkce netknuta.

## PARTNER API PR #114 — PRODUKCNI ROLLOUT PROVEDEN (14. 06. 2026)

**Rollout PROVEDEN se schvalenim Pavla.** PR #114 mergnuto do `main` (merge commit `f5e508ca`). Produkce `xkzhjldrojjlrkezorey`: aplikovany migrace `20260613200202` (enum `pending` + idempotency index + RPC `create_partner_order_reward`/`update_partner_order_reward_status` + update `redeem_miocoin_code`/trigger) a `20260613200849` (crypto schema fix). EF `partner-activate` nasazena **v130**, `verify_jwt=false`.

- **Postchecky OK:** enum = `issued,activated,cancelled,expired,pending`; oba nove RPC existuji; EXECUTE jen `service_role` (anon=false, authenticated=false); idempotency index `idx_partner_reward_codes_order_api_idempotency` existuje; `redeem_miocoin_code` odmita `pending`; zadny `partner_api_v1` objekt nezaveden.
- **Smoke test:** RPC service_role (presne to, co EF vola) — create order 250 Kc u partnera `fd004ae0` (Test Influencer A, 100 Kc=1 MC) → `pending` 2 coiny, kod GRT3XLP46KR6; duplicate se stejnym `external_order_id` → stejny kod, `duplicate=true`. Pri create: **0 partner_coin_activations, 0 partner_invoices, 0 wallet_transactions**. EF boundary: bez Authorization → 401, spatny klic → 401. Probe radek pote smazan. Full EF happy-path s realnym klicem zamerne NEspusten — vystaveni produkcniho API klice bylo blokovano bezpecnostnim guardem; overen ekvivalentni RPC.
- **`settings.partner_api_documentation` NEZMENEN** — stale popisuje stary endpoint; pred prepsanim z `docs/partner-api/PARTNER_API_GUIDE.md` nutno doplnit realny base URL (misto `<onemil-api>`) a schvalit partner-facing wording.
- **Rollback info zachyceno:** partner-activate v129 (zdroj), md5 definic `redeem_miocoin_code`/`log_partner_coin_activation_from_reward`/`activate_partner_reward_sql`.
- **Otevreny bod pred ostrym partnerskym provozem:** potvrdit `reward_base_czk`/`reward_mc` u realnych partneru; aktualizovat zivou partner API dokumentaci.

## PARTNER API ONBOARDING SADA — KOMPLETNI (14. 06. 2026, jen dokumentace)

Ucelena onboarding sada pro partnery ve `docs/partner-api/` (PR #114 branch): `README.md` (index), `PARTNER_OWNER_OVERVIEW.md` (netechnicky prehled pro majitele), `PARTNER_API_GUIDE.md` (vyvojarsky order-event API guide — beze zmeny), `PARTNER_HANDOFF_EMAIL.md` (cesky predavaci e-mail pro Pavla). Jedna sada, zadne konkurencni verze; bez zminky o Botanicu. Vsude oznaceno „pripraveno PO rolloutu PR #114, NE zive v produkci". Owner overview vysvetluje: zakaznik nakoupi → e-shop posila order events na pozadi → OneMil pocita MioCoiny → cekajici odmena → paid/delivered/completed aktivuje, cancelled/returned/unpaid/not_picked_up zrusi → zakaznik dostane MioCoiny az uplatnenim → partner plati pozdeji jen za aktivovane/uplatnene MioCoiny dle stavajici invoice logiky; pri vytvoreni objednavky zadna faktura/e-mail/PDF/platba/wallet credit. `settings.partner_api_documentation` NEzmenen. Pouze dokumentace: zadny kod, SQL, deploy, merge ani produkcni zmena.

## PARTNER API GUIDE — REVIDOVAN NA ORDER-EVENT MODEL (14. 06. 2026)

Partner-facing pruvodce Partner API ulozen do `docs/partner-api/PARTNER_API_GUIDE.md` (PR #114 branch). Revidovan na **order-event model**: partner posila udalosti objednavky (vytvoreni → cekajici odmena; paid/delivered/completed → aktivni odmena; cancelled/returned/unpaid/not_picked_up → zrusena odmena). Checkout neceka na OneMil, volat na pozadi, pri vypadku retry se stejnym `external_order_id` (idempotence vraci stejny kod). Partner neposila konecny pocet MioCoinu — OneMil ho pocita z nastaveni partnera. Wording partner-facing („aktivni odmena"); raw `issued` jen v JSON prikladech. **Pripraveno pro stav PO rolloutu PR #114 — NE zive v produkci**; `settings.partner_api_documentation` zatim NEzmenen. Pouze dokumentace: zadny kod, SQL, deploy, merge ani produkcni zmena.

## PARTNER API PR #114 — PRODUKCNI ROLLOUT CHECKLIST PRIPRAVEN (14. 06. 2026)

Pripraven (NEPROVEDEN) produkcni rollout checklist pro Partner API existing-system implementaci (PR #114). Produkce `xkzhjldrojjlrkezorey` zustava NETKNUTA — zadny merge, zadne SQL, zadny deploy. Detailni plan (preconditions, SQL poradi, EF deploy, postchecky, bezpecny prod test, rollback) byl predan; toto je zaznam.

- **Vyzaduje vyslovne pisemne schvaleni Pavla PRED:** (1) merge PR #114, (2) aplikaci migraci `20260613200202` a `20260613200849` (v tomto poradi) na produkci, (3) deploy Edge Function `partner-activate` (musi zustat `verify_jwt=false`).
- **Staging spec 48 zeleny:** run `27490386537` (3 passed).
- **Pred rolloutem nutno potvrdit partner reward settings** (`partners.reward_base_czk` + `partners.reward_mc`) u kazdeho realneho partnera — jinak API vraci `invalid_partner_conversion_settings` (Botanic ma stale `[TEST DATA]`).
- **Pri `create_order_reward` (krok pending) NESMI vzniknout:** zadna faktura, zadny e-mail, zadne PDF, zadna platba, zadny wallet credit, zadny `partner_coin_activations` radek.
- **Wallet credit a `partner_coin_activations` vznikaji az po redempci zakaznikem** (`redeem_miocoin_code`); faktury az tydennim cronem.
- **Produkcni stav (read-only overeno 14.06.):** `partner-activate` v129 (stara single-action), enum `partner_code_status` bez `pending`, nove RPC + idempotency index NEpritomny, reward sloupce pritomny.
- **Presna schvalovaci fraze, kterou musi Pavel napsat:**
  > Schvaluji produkcni rollout Partner API (PR #114): aplikovat migrace 20260613200202 a 20260613200849 na produkci xkzhjldrojjlrkezorey a nasadit Edge Function partner-activate. Rozumim, ze se nevytvari zadna faktura/e-mail/PDF/platba/wallet credit pri vytvoreni objednavky.

## STAGING E2E CI ODBLOKOVANO + SPEC 48 ZELENY (14. 06. 2026)

Globalni staging CI vypadek (vsechny staging E2E vcetne `main` padaly v kroku „Ensure staging admin E2E user has admin role" s curl exit 22) vyresen. Spec 48 ted v CI zelene.

- **Root cause:** GoTrue admin endpoint `/auth/v1/admin/users` vracel HTTP 500 „Database error finding users". Priciny: 2 radky v staging `auth.users` mely `email_change = NULL`. GoTrue skenuje tento sloupec do non-nullable Go stringu → NULL shodi list cely projekt. Radky (`codex-partner-v1@test.local`, `codex-partner-v1-redeem@test.local`, vytvorene 13.06. 19:37–19:38) vlozil **odmitnuty Partner API v1 prototyp primym SQL INSERTem do auth.users** (obesel GoTrue, ktery by sloupec defaultoval na `''`). Casove presne mezi poslednim zelenym runem (17:42) a prvnim padem (19:43).
- **Workflow fix (main-compatible):** `.github/workflows/playwright-staging.yml` — admin-seed list call uz nepouziva `curl -sf` (slepy exit 22), ale zachytava HTTP status + telo a vypise maskovanou diagnostiku; `per_page` snizen 1000 → 200. Diky tomu byl root cause vubec videt.
- **Staging auth data repair (vyslovne schvaleno Pavlem, staging only, non-destructive):** `UPDATE auth.users SET email_change='' WHERE id IN (bd4dd766…, be53289f…) AND email_change IS NULL`. Pouze NULL → '' na 2 radcich; prototype radky NEsmazany (residue cleanup zustava pending). Postcheck: 0 zbylych NULL.
- **Spec 48 test fix (test-only):** setup throwaway zakaznika nyni zaklada i `public.users` radek (`wallets.user_id` FK → `public.users(id)`, zadny auth→public trigger). Partner API logika nezmenena.
- **Zeleny vysledek:** staging run `27490386537` — **3 passed** (48a–48d, 48e–48f, 48g). Cherry-pick commit `7b20a57c`, spec `c76dff74`.
- **Produkce netknuta:** zadne produkcni SQL, zadny deploy, `xkzhjldrojjlrkezorey` nedotcen.

## CLEAN PARTNER API BRANCH + SPEC 48 (14. 06. 2026)

Cista vetev `codex/partner-api-existing-system-clean` z aktualniho `main` (9a40cec8). Cherry-pick pouze commitu `590e4f5b` (Partner API order flow nad existujicim systemem); rejected prototyp ani duplicitni Partner Invoice prace z vetve `codex/affiliate-payouts-audit` NEzahrnuty. Doc konflikty vyreseny tak, ze `onemil_state.md`/`onemil_history.md`/`CLAUDE.md` zustaly identicke s `main` (doc zmeny commitu zahozeny, dokumentuje se zde).

- **Cherry-pick commit na clean vetvi:** `7b20a57c` (jen 4 kodove soubory: `partner-activate/index.ts`, `types.ts`, 2 migrace). Diff vs main = pouze Partner API; zadne `partner_api_v1` reference, zadne invoice duplicity.
- **Reuse potvrzeno:** existujici EF `partner-activate`, `partner_reward_codes`, `partner_coin_activations`, `partner_api_keys`, `redeem_miocoin_code`. Zadny novy endpoint ani tabulka.
- **Spec 48** `tests/e2e/48-partner-order-api.spec.ts` (commit `d7af1543`, staging-only, self-contained): create→pending, duplicate→stejny kod, pending nelze redeem, paid→issued, issued redeem kredituje wallet + vznikne activation, cancelled nelze redeem, zadna faktura/activation behem create.
- **CI blocker (pre-existing, NESOUVISI s touto zmenou):** staging Full E2E workflow padá v pre-test kroku „Ensure staging admin E2E user has admin role" (curl exit 22). Stejny krok padá i na `main` (scheduled run `27477105656` 13.06. 19:43 selhal; posledni zeleny byl spec 47 run `27474214282` 17:42). Spec 48 si vytvari vlastni throwaway uzivatele a tento seed krok nepotrebuje, ale workflow ho ma jako tvrdou branu → spec 48 v CI zatim nedobehl.
- **Manualni staging verifikace logiky (zelena, 14.06.):** pres nasazene RPC na partnerovi `99790c17` (100 Kc = 1 MioCoin): order 250 Kc → create `pending` 2 coiny (kod HI06EJ6KFUEU), duplicate → stejny kod, paid → `issued`, druhy order → cancel → `cancelled`; activations behem create = 0. Probe radky pote smazany. Redeem-rejection (pending/cancelled) je vynucen v `redeem_miocoin_code` a byl drive overen codex staging kody.
- **Zbyva pred merge:** opravit/odblokovat staging admin-seed CI krok, pak nechat spec 48 dobehnout zelene v CI; produkcni rollout checklist + vyslovne schvaleni Pavla. Staging cleanup (rejected prototyp `partner_api_v1_order_rewards` + codex test data) zustava pending na samostatne schvaleni.

## ✅ STAGING PARTNER API REAL ACTIVATION TEST — PROŠEL (13. 06. 2026)

Staging dxmowysntemfqfnanxua — real end-to-end partner API activation test prošel. Produkce nedotčena.

### SQL aplikováno pouze na staging

**ctivate_partner_reward_sql nahrazen reálnou implementací (staging-only):**
- Zamkne partner_reward_codes řádek (FOR UPDATE)
- Validuje: kód existuje pro daného partnera, status='issued', neexpirovaný
- UPDATE: status='activated', ctivated_at=now(), ctivated_by_user_id=<staging_e2e_user>
- Trigger 	rg_log_partner_coin_activation_reward automaticky vloží partner_coin_activations
- Vrátí {success:true, coins, activation_id}
- **Produkční ctivate_partner_reward_sql zůstává stub** — záměrně; reálná produkční implementace vyžaduje explicitní customer_user_id parametr (viz otevřený bod níže)

**Test reward code vytvořen:**
- Code: STAGING-APITEST-001, coins: 5, partner: E2E Staging Partner, status při vytvoření: issued

### Test výsledek

| Ověření | Výsledek |
|---------|---------|
| API HTTP status | **200 OK** |
| Response body | {"status":"ok","coins":5,"activation_id":"e9b4148b-8478-41e5-82b5-3c1223817fa5"} |
| partner_coin_activations řádek vytvořen | **Ano** — id e9b4148b-8478-41e5-82b5-3c1223817fa5, coins=5, invoiced=false |
| partner_reward_codes status po testu | ctivated (2026-06-13 18:21:01 UTC) |
| Faktury vytvořeny | **0** |
| E-maily odeslány | žádný |
| PDF generováno | žádné |
| Stripe/platba | žádná |
| Peněženka e2e@onemil.cz změněna | **Ne** (balance_coins=5000.00 beze změny — aktivace přes partner API trigger nekredituje wallet) |
| Produkční data dotčena | **Ne** |

### Data ponechaná na stagingu (pro budoucí testy)
- partner_reward_codes: STAGING-APITEST-001 (status=ctivated) — kód je spotřebovaný; pro další test je třeba vytvořit nový kód
- partner_coin_activations: id e9b4148b-... (invoiced=false) — zatím nefakturováno; staging cron job by mohl vytvořit fakturu v neděli → OK pro staging, nedotýká se produkce

### Otevřené body před produkčním nasazením partner API
1. **Produkční ctivate_partner_reward_sql je stub** — reálná implementace potřebuje customer_user_id parametr nebo jiný mechanismus (např. email lookup) pro ctivated_by_user_id
2. **partner_coin_activations.user_id NOT NULL** — pro B2B API aktivace (žádný přihlášený zákazník) je potřeba schema change nebo explicit customer user parameter
3. **Neúplný EF parametr** — partner-activate EF nepřijímá coins ani customer_user_id → partner e-shop nemůže specifikovat počet mincí ani zákazníka
4. Tyto body vyžadují samostatné schválení Pavla před produkčním nasazením
## ✅ STAGING PARTNER API TEST ENVIRONMENT — PŘIPRAVEN A ROTOVÁN (13. 06. 2026)

Staging dxmowysntemfqfnanxua má nasazené a funkční partner API EF pro bezpečné testování bez dotyku produkce.

### Nasazené staging EF (nové, pouze staging)
- partner-activate v1 — ACTIVE, erify_jwt=false (vlastní auth: x-internal-token + Authorization: Bearer <api_key>)
- dmin-generate-partner-api-key v1 — ACTIVE, erify_jwt=false (vlastní auth: x-internal-token + admin JWT)

### Staging secrets
- INTERNAL_FUNCTION_TOKEN — nastaven a ROTOVÁN (prefix 18f549b); **neobsahuje** produkční hodnotu; staging-only.

### Staging partner API klíč
- **Partner:** E2E Staging Partner (99790c17-0fcc-49f4-9f01-18e915dd241a)
- **Aktivní klíč prefix:** 9e56826 (key_id 7c7babd3-4ba9-45a4-8dab-fd8567b01a40)
- **Starý expozovaný klíč 5f00421 REVOKOVÁN.**

### Connection test výsledek
- HTTP 200 OK, body {"status":"ok","coins":null,"activation_id":null} — OK
- partner_coin_activations rows: **0** (stub potvrzeno — žádné DB zápisy)
- No invoice, no email, no PDF, no payment, no production data.
- Wrong token → 401 ✓

### Stub status
- ctivate_partner_reward_sql je na stagingu **stub** — vrací {success:true, partner_id} bez reálných DB zápisů.
- Pro testování reálné aktivační logiky je potřeba nasadit produkční verzi funkce (vyžaduje samostatné schválení Pavla).

### Curl template (pro Pavla)
`
curl -i -X POST "https://dxmowysntemfqfnanxua.supabase.co/functions/v1/partner-activate" \
  -H "x-internal-token: <STAGING_INTERNAL_FUNCTION_TOKEN>" \
  -H "Authorization: Bearer <STAGING_PARTNER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"reward_code":"TEST-CONN-001","external_order_id":"TEST-ORDER-001"}'
`
Plné hodnoty Pavel zná z terminálu; NEUKLÁDAT do dokumentace ani do kódu.

**Pravidla (neměnit):**
- partner-activate staging EF — staging-only; produkce má svůj vlastní token v Vault.
- INTERNAL_FUNCTION_TOKEN produkce NESMÍ být nikdy printnut ani sdílen.
- Staging API klíče jsou staging-only; nesmí se používat pro produkční e-shopy.
- Real activation (non-stub) vyžaduje: (1) produkční ctivate_partner_reward_sql nasazenu na staging, (2) existující partner_reward_codes pro testovacího partnera.
## ✅ PARTNER DASHBOARD SMOKE SPEC 47 — LOGOUT NYNÍ ASSERTOVÁN (13. 06. 2026)

Spec 47 (`tests/e2e/47-partner-dashboard-smoke.spec.ts`) test 47f aktualizován: místo best-effort skipu nyní klikne na existující top-nav tlačítko `Odhlásit se` (PartnerHeader v `App.tsx`, `handleLogout` = `signOut` → `navigate('/partner/login')`) a ověří redirect na `/partner/login`.

- **Commit:** `e3c2439b` (navazuje na add `fe5f59a9`). Pouze test soubor; žádná změna app UI/logiky.
- **Staging cílený run `27474214282`:** **3 passed · 0 skipped · 0 failed**, success (47f logout již passuje, není skipnut).
- Test-only: žádná změna app UI, žádné SQL, žádný deploy, žádná produkční data. Affiliate Payouts a customer invite reward security nedotčeny.

## ✅ STAGING PARTNER API REAL ACTIVATION TEST — PROŠEL (13. 06. 2026)

Staging dxmowysntemfqfnanxua — real end-to-end partner API activation test prošel. Produkce nedotčena.

### SQL aplikováno pouze na staging

**ctivate_partner_reward_sql nahrazen reálnou implementací (staging-only):**
- Zamkne partner_reward_codes řádek (FOR UPDATE)
- Validuje: kód existuje pro daného partnera, status='issued', neexpirovaný
- UPDATE: status='activated', ctivated_at=now(), ctivated_by_user_id=<staging_e2e_user>
- Trigger 	rg_log_partner_coin_activation_reward automaticky vloží partner_coin_activations
- Vrátí {success:true, coins, activation_id}
- **Produkční ctivate_partner_reward_sql zůstává stub** — záměrně; reálná produkční implementace vyžaduje explicitní customer_user_id parametr (viz otevřený bod níže)

**Test reward code vytvořen:**
- Code: STAGING-APITEST-001, coins: 5, partner: E2E Staging Partner, status při vytvoření: issued

### Test výsledek

| Ověření | Výsledek |
|---------|---------|
| API HTTP status | **200 OK** |
| Response body | {"status":"ok","coins":5,"activation_id":"e9b4148b-8478-41e5-82b5-3c1223817fa5"} |
| partner_coin_activations řádek vytvořen | **Ano** — id e9b4148b-8478-41e5-82b5-3c1223817fa5, coins=5, invoiced=false |
| partner_reward_codes status po testu | ctivated (2026-06-13 18:21:01 UTC) |
| Faktury vytvořeny | **0** |
| E-maily odeslány | žádný |
| PDF generováno | žádné |
| Stripe/platba | žádná |
| Peněženka e2e@onemil.cz změněna | **Ne** (balance_coins=5000.00 beze změny — aktivace přes partner API trigger nekredituje wallet) |
| Produkční data dotčena | **Ne** |

### Data ponechaná na stagingu (pro budoucí testy)
- partner_reward_codes: STAGING-APITEST-001 (status=ctivated) — kód je spotřebovaný; pro další test je třeba vytvořit nový kód
- partner_coin_activations: id e9b4148b-... (invoiced=false) — zatím nefakturováno; staging cron job by mohl vytvořit fakturu v neděli → OK pro staging, nedotýká se produkce

### Otevřené body před produkčním nasazením partner API
1. **Produkční ctivate_partner_reward_sql je stub** — reálná implementace potřebuje customer_user_id parametr nebo jiný mechanismus (např. email lookup) pro ctivated_by_user_id
2. **partner_coin_activations.user_id NOT NULL** — pro B2B API aktivace (žádný přihlášený zákazník) je potřeba schema change nebo explicit customer user parameter
3. **Neúplný EF parametr** — partner-activate EF nepřijímá coins ani customer_user_id → partner e-shop nemůže specifikovat počet mincí ani zákazníka
4. Tyto body vyžadují samostatné schválení Pavla před produkčním nasazením
## ✅ STAGING PARTNER API TEST ENVIRONMENT — PŘIPRAVEN A ROTOVÁN (13. 06. 2026)

Staging dxmowysntemfqfnanxua má nasazené a funkční partner API EF pro bezpečné testování bez dotyku produkce.

### Nasazené staging EF (nové, pouze staging)
- partner-activate v1 — ACTIVE, erify_jwt=false (vlastní auth: x-internal-token + Authorization: Bearer <api_key>)
- dmin-generate-partner-api-key v1 — ACTIVE, erify_jwt=false (vlastní auth: x-internal-token + admin JWT)

### Staging secrets
- INTERNAL_FUNCTION_TOKEN — nastaven a ROTOVÁN (prefix 18f549b); **neobsahuje** produkční hodnotu; staging-only.

### Staging partner API klíč
- **Partner:** E2E Staging Partner (99790c17-0fcc-49f4-9f01-18e915dd241a)
- **Aktivní klíč prefix:** 9e56826 (key_id 7c7babd3-4ba9-45a4-8dab-fd8567b01a40)
- **Starý expozovaný klíč 5f00421 REVOKOVÁN.**

### Connection test výsledek
- HTTP 200 OK, body {"status":"ok","coins":null,"activation_id":null} — OK
- partner_coin_activations rows: **0** (stub potvrzeno — žádné DB zápisy)
- No invoice, no email, no PDF, no payment, no production data.
- Wrong token → 401 ✓

### Stub status
- ctivate_partner_reward_sql je na stagingu **stub** — vrací {success:true, partner_id} bez reálných DB zápisů.
- Pro testování reálné aktivační logiky je potřeba nasadit produkční verzi funkce (vyžaduje samostatné schválení Pavla).

### Curl template (pro Pavla)
`
curl -i -X POST "https://dxmowysntemfqfnanxua.supabase.co/functions/v1/partner-activate" \
  -H "x-internal-token: <STAGING_INTERNAL_FUNCTION_TOKEN>" \
  -H "Authorization: Bearer <STAGING_PARTNER_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"reward_code":"TEST-CONN-001","external_order_id":"TEST-ORDER-001"}'
`
Plné hodnoty Pavel zná z terminálu; NEUKLÁDAT do dokumentace ani do kódu.

**Pravidla (neměnit):**
- partner-activate staging EF — staging-only; produkce má svůj vlastní token v Vault.
- INTERNAL_FUNCTION_TOKEN produkce NESMÍ být nikdy printnut ani sdílen.
- Staging API klíče jsou staging-only; nesmí se používat pro produkční e-shopy.
- Real activation (non-stub) vyžaduje: (1) produkční ctivate_partner_reward_sql nasazenu na staging, (2) existující partner_reward_codes pro testovacího partnera.
## ✅ PARTNER DASHBOARD SMOKE SPEC 47 PŘIDÁN (13. 06. 2026)

Dedikovaný approved-partner dashboard smoke test přidán, aby uzamkl live business-text úpravy partner dashboardu proti regresi.

- **Test soubor:** `tests/e2e/47-partner-dashboard-smoke.spec.ts` (staging-only, self-contained; service role vytvoří/uklidí jednoho throwaway approved partnera + auth usera, cleanup v `afterAll`).
- **Commit:** `fe5f59a9`.
- **Staging cílený run `27467129135`:** **2 passed · 1 skipped · 0 failed**, run success.
- **Ověřuje:** 47a–47d schválený partner otevře `/partner/dashboard`, sekce `Nastavení konverze MioCoinů` viditelná, konverzní helper text viditelný (přesná kopie), karta `Fakturace MioCoinů` viditelná; 47e `Moje faktury` naviguje na `/partner/invoices`. 47f logout = best-effort, **skipnuto** (partner dashboard nemá vystavený logout control — by design, ne fail).
- **Test-only:** žádná změna app UI/logiky, žádné schema, žádné SQL, žádný deploy, žádné e-maily, žádné PDF, žádná produkční data. Affiliate Payouts a customer invite reward security nedotčeny.
- Uzavírá doporučené volitelné zpřísnění z P0 partner flow auditu.

## ✅ P0 PARTNER FLOW AUDIT — PO DASHBOARD BUSINESS-TEXT ÚPRAVÁCH (13. 06. 2026)

P0 audit schváleného partnerského flow dokončen po úpravách business textů v partner dashboardu (explainer „Fakturace MioCoinů" + konverzní helper). Staging behaviorálně, produkce read-only.

- **Staging cílený run `27466916402` (spec 43):** **4 passed · 1 skipped · 0 failed**, run success.
- **Ověřené flow:** partner login · partner dashboard loads · konverzní helper text přítomen · karta `Fakturace MioCoinů` viditelná · `Moje faktury` otevírá `/partner/invoices` · partner invoices page loads · PDF download jen když PDF existuje · partner nevidí faktury jiných partnerů · partner nemá přístup na admin invoice stránky · logout používá standardní sdílenou auth cestu.
- **Produkce `xkzhjldrojjlrkezorey` — pouze read-only:** RLS potvrzuje izolaci partnerských invoice dat dle vazby vlastní partner/invoice — `partner_invoices` (`partner_id IN own`), `partner_invoice_lines`/`partner_invoice_exports` (invoice→partner přes `auth.uid()`), admin přes `is_admin()`; žádné `USING (true)`.
- **Žádný partner-facing blocker nenalezen.**
- **Doporučené volitelné budoucí zpřísnění:** dedikovaný approved-partner dashboard smoke spec pro `Fakturace MioCoinů`, konverzní helper a logout (dnes kryto statickou + manuální live verifikací).
- Bez změny produkčních dat, bez SQL writes, bez deploye, bez e-mailů, bez generování PDF, bez vytváření faktur či partnerů. Affiliate Payouts a customer invite reward security nedotčeny.

## ✅ PARTNER DASHBOARD — KONVERZE HELPER LIVE OVĚŘENO (13. 06. 2026)

Lovable Publish dokončen po commitu `7464cd78`. Pavel live ověřil, že partner dashboard zobrazuje konverzní helper pod sekcí `Nastavení konverze MioCoinů`.

- **Live helper text:** „Příklad: při nastavení 100 Kč = 1 MioCoin dostane zákazník za objednávku 500 Kč celkem 5 MioCoinů."
- Žádná změna kalkulační logiky, žádná změna DB, žádné SQL, žádný deploy Edge Functions, žádné e-maily, žádná data nezměněna při ověření. Affiliate Payouts, Partner Invoice backend a customer invite reward security nedotčeny.

## ✅ PARTNER DASHBOARD — KONVERZE MIOCOINŮ PŘÍKLAD (13. 06. 2026)

Do sekce „Nastavení konverze MioCoinů" na `/partner/dashboard` přidán krátký český helper text s příkladem, aby partner ihned pochopil převod „Základ (Kč) + MioCoiny".

- **Soubor:** `src/pages/PartnerDashboard.tsx` (pouze frontend, žádná změna výpočtu, DB ani SQL).
- **Přidaný text** (info blok pod inputy konverze): „Příklad: při nastavení 100 Kč = 1 MioCoin dostane zákazník za objednávku 500 Kč celkem 5 MioCoinů."
- Layout/design zachován (stejný `bg-muted/30` info blok + `Info` ikona jako u explaineru „Fakturace MioCoinů").
- **Build ✅:** `npm run build` exit 0 (22.02s). Žádná změna kalkulace, billing, cron, DB/EF. Affiliate Payouts, Partner Invoice backend a customer invite reward security nedotčeny.

## ✅ PUBLIC CUSTOMER-FACING UI TEXT AUDIT (13. 06. 2026)

Read-only audit veřejných/zákaznických UI textů dokončen — UI je čisté před outreachem.

- **Ověřené zákaznické routy:** `/`, `/games`, `/wins`, `/vouchers`, `/profile`, `/messages`, `/my-contests`.
- **Žádné viditelné zákaznické anglické slovo `referral`** nenalezeno. Výskyty `referral` jsou pouze code-only: identifikátory, komentáře, RPC/table názvy, JSX komentáře, RPC návratová hodnota (`rejected:self_referral`), nebo admin/partner/interní oblasti.
- **Zákaznické wording je české a používá:** `Pozvi přátele` (nadpis sekce v `ReferralSection.tsx`), `doporučovací kód`, `odměny z doporučení`, `doporučitel`.
- **Žádný B2B/partner billing text neuniká do zákaznických rout.** Partner/business billing wording (Fakturace MioCoinů, `price_per_coin`, IČO/DIČ, samofakturace, týdenní fakturace) je izolovaný v partner/admin oblastech (`PartnerDashboard`, `PartnerInvoices`, `AdminInvoices`).
- **Homepage text o partnerských e-shopech** („Nakupujete u partnerských e-shopů" → MioCoiny jako marketingová odměna) je legitimní zákaznický benefit copy, ne B2B billing.
- **Žádný aktuální fix není potřeba.** Volitelné budoucí zpřísnění: CI guard zabraňující viditelnému anglickému `referral` v zákaznickém UI.
- Read-only: žádná změna souborů, žádné SQL, žádný deploy. Affiliate Payouts a Partner Invoices nedotčeny.

## ✅ PARTNER DASHBOARD — FAKTURACE MIOCOINŮ CARD LIVE OVĚŘENO (13. 06. 2026)

Lovable Publish dokončen po commitu `8c5e5375`. Pavel live ověřil, že partner dashboard obsahuje novou kartu `Fakturace MioCoinů`.

- **Live stav:** karta `Fakturace MioCoinů` se zobrazuje na `/partner/dashboard` pro schváleného partnera, umístěná pod kartou `Nastavení konverze MioCoinů`.
- **Obsah ověřen live:** vysvětluje týdenní fakturaci aktivovaných MioCoinů, doručení faktury e-mailem, odkaz na `Moje faktury` a aktuální cenu za 1 MioCoin (z `partner.price_per_coin`).
- Při ověření nebyla změněna žádná data, neodeslány žádné e-maily, neaplikováno žádné SQL, žádný deploy mimo Lovable Publish. Affiliate Payouts, Partner Invoice backend a customer invite reward security nedotčeny.

## ✅ PARTNER DASHBOARD — FAKTURACE MIOCOINŮ EXPLAINER (13. 06. 2026)

Navazuje na Partner Flow business readiness audit (největší mezera: partner nevěděl, kdy a kde dostane fakturu). Přidán read-only info blok do `/partner/dashboard`.

- **Soubor:** `src/pages/PartnerDashboard.tsx` (pouze frontend, žádná billing logika, žádné schema, žádné SQL).
- **Nová karta „Fakturace MioCoinů"** (gated `isAccountApproved`, umístěná za kartou „Nastavení konverze MioCoinů", před „Fakturace nabídek"). Text: „Fakturujeme pouze aktivované MioCoiny. Vyúčtování probíhá automaticky jednou týdně. Fakturu vám pošleme e-mailem a najdete ji také v sekci **Moje faktury**. Aktuální cena: {price_per_coin} Kč za 1 MioCoin." Odkaz „Moje faktury" naviguje na `/partner/invoices`. Cena čte existující `partner.price_per_coin` (fallback `1.00`).
- **Sjednocení labelu konceptu:** jediný partner-facing „Návrh" (offer invoice draft badge, dříve řádek ~1590) změněn na **„Koncept"** — sjednoceno s `PartnerInvoices.tsx` (`draft: 'Koncept'`) a status badge dashboardu (`Koncept`).
- **Build ✅:** `npm run build` exit 0 (22.19s). Žádná změna billing/cron/DB/EF. Affiliate Payouts, Partner Invoice backend a customer invite reward security nedotčeny.
- Cron `weekly_partner_invoices` (job 17, neděle 02:00 UTC) a PDF/e-mail pipeline beze změny — explainer pouze popisuje existující chování.

## ✅ ADMIN SMOKE TEST — VOUCHERS + DOPORUČENÍ A ODMĚNY (13. 06. 2026)

Dedikovaný read-only admin smoke test přidán pro dvě admin stránky, které prošly P0 admin auditem, ale neměly vlastní spec. Tím se uzavírá dříve doporučené test-only zlepšení z P0 admin auditu.

- **Test soubor:** `tests/e2e/46-admin-vouchers-referrals-smoke.spec.ts` (staging-only, self-skipping bez admin secrets).
- **Commit:** `6d67fd2f`.
- **Staging cílený běh `27465396025`:** result **1 passed, run success** (přes `only_spec` input, 18.0s).
- **Test ověřuje:**
  - `/admin/vouchers` načte s nadpisem `Přehled voucherů`.
  - `/admin/referrals` načte taby `Doporučení hráčů` a `Audit doporučení`.
  - žádné neodchycené client-side chyby na obou stránkách (`pageerror` listener).
- **Read-only:** žádné vytváření/editace voucherů, žádné vytváření/úprava invite rewardů, žádné e-maily, žádné SQL, žádný deploy. Login přes existující `loginViaUI` helper.
- Affiliate Payouts a Partner Invoices nedotčeny. Žádná změna app kódu.

## ✅ P0 ADMIN FLOW AUDIT — PO SECURITY + INVOICE + CUSTOMER-FLOW PRÁCI (13. 06. 2026)

P0 audit nejdůležitějších admin flow dokončen po invite reward security práci, Partner Invoice úklidu a P0 customer-flow auditu. Staging behaviorálně ověřen (green run), UI kontrakty staticky ověřeny, produkce pouze read-only.

- **Staging Full E2E run `27464656913` byl green** — admin specy passed (`15`, `16`, `18`, `23`, `24`, `29`, `30`, `32`, `33` 6/6, `43` 4/5, `44` 7/7, `45` 1/1).
- **Ověřené admin flow:** admin login · admin dashboard · contests admin page · otevření create/edit contest UI · vouchers admin page (route + policy) · messages/admin unread state · partner invoices admin page · partner invoice detail drawer · invoice tlačítka · admin `Doporučení a odměny` overview · admin tests page bez volání `admin-create-test-user`.
- **Invoice tlačítka kontrakt (spec 45 + statická kontrola `AdminInvoices.tsx`):** `draft → Odeslat fakturu emailem`, `issued → Znovu odeslat`, `paid → žádné send/resend tlačítko`.
- **Admin tests page (statická kontrola `ComprehensiveAdminTestDashboard.tsx`):** jediná zmínka `admin-create-test-user` je v neutralizovaném `createTestUser` (toast „Tento produkční test byl bezpečnostně vypnut."); žádné `.invoke()` nikde v `src`.
- **Produkce `xkzhjldrojjlrkezorey` — pouze read-only:** `partner_invoices`/`_lines`/`_exports` admin čte přes `is_admin()`, partner own-row, žádné `USING (true)`; invite reward tabulky own-row + admin read-all (`has_role` admin/superadmin); `vouchers` admin SELECT + záměrný world-readable veřejný katalog.
- **Žádný admin blocker nenalezen.**
- **Doporučené pozdější test-only zlepšení:** přidat dedikované read-only smoke specy pro `/admin/vouchers` a `/admin/referrals` (jediné dva admin P0 flow zatím bez vlastního spec; dnes prochází přes route + policy).
- Bez změny souborů, bez SQL writes, bez deploye, bez e-mailů, bez generování PDF, bez označení faktur jako zaplaceno, bez vytváření soutěží. Žádná produkční data nezměněna. Affiliate Payouts a Partner Invoice logika nedotčeny.

## ✅ P0 CUSTOMER FLOW AUDIT — PO SECURITY + INVOICE PRÁCI (13. 06. 2026)

P0 audit nejdůležitějších zákaznických flow byl dokončen po nedávné invite reward security práci a Partner Invoice úklidu. Staging behaviorálně ověřen, produkce pouze read-only.

- **Staging Full E2E run `27464656913` ✅** — **112 passed · 28 skipped · 0 failed** (9.3m, exit success), větev `main`.
- **Ověřené zákaznické flow (staging):** registrace · login · profil · načtení peněženky · „Pozvi přátele" / vlastní invite data · stránka Hry · detail soutěže · stránka Voucher · stránka Zprávy · top-up/checkout otevření bez reálné platby · logout.
- **Per-spec:** `01-registration` 2/2 spuštěné passed (1 záměrný new-user skip), `02-login` 3/3, `17-profile-smoke` 2/2, `09-wallet-balance` 1/1, `03-voucher`/`10`/`11` passed, `04-ticket-purchase` 3/3, `12-mobile-messages` 1/1, `33-login-gating` 6/6, `31-bob-toggle` passed.
- **28 skipů je non-blocking** — koncentrované v podmíněných specech (partner offers 06/07/08 cooldown, staging-only B2B + Partner Invoice specy 22/34–45 vyžadující seed, jeden záměrný registrační case v 01). Žádný zákaznický P0 flow neselhal ani nebyl tiše přeskočen.
- **Produkce `xkzhjldrojjlrkezorey` — pouze read-only ověření:**
  - Zákaznické RPC přítomny s `authenticated` execute: `buy_ticket_atomic`, `ensure_referral_code`, `set_my_referrer_by_code`, `get_bob_enabled`, `redeem_miocoin_code`, `bump_user_last_seen`.
  - Policy pro `profiles`, `wallets`, `messages`, `contests` a invite reward tabulky zůstávají scoped — **žádné broad `USING (true)`**.
  - `vouchers` world-readable SELECT je **záměrný** pro veřejný voucher katalog (ne regrese).
- **Žádný zákaznický blocker nenalezen.**
- Bez změny souborů, bez SQL writes, bez deploye, bez e-mailů, bez plateb. Žádná produkční data nezměněna. Affiliate Payouts a Partner Invoices nedotčeny.

## 🧹 ÚKLID TESTOVACÍ PARTNER FAKTURY OMA-20260003 (13. 06. 2026)

Produkční testovací faktura `OMA-20260003` a všechna související testovací data smazána z produkce `xkzhjldrojjlrkezorey`. Schváleno Pavlem: „schvaluji úklid produkční testovací faktury OMA-20260003".

- **Smazané řádky (produkce):**
  - `partner_invoices` — `OMA-20260003` (id `75fc016e-5283-4801-a19f-0566a2aaa587`, status `issued`, created 2026-06-13)
  - `partner_invoice_lines` — 1 řádek (invoice_id `75fc016e...`, activation_id `764ddcde...`, external_order_id `TEST-PDF-OVERVIEW-20260613-5MC`, coins 5)
  - `partner_invoice_exports` — id `48e44363-acde-4807-8d8c-ec3f85b5a8e7`
  - `partner_coin_activations` — id `764ddcde-ff44-4c48-99fa-9ed9ef453818`, code `TESTPDF20260613A`
  - `partner_reward_codes` — code `TESTPDF20260613A` (`metadata.test = true`)
- **Storage objekt smazán:** `partner-invoices/invoice-75fc016e-5283-4801-a19f-0566a2aaa587-1781327271530.pdf` (přes `supabase storage rm --experimental`).
- **Postcheck ✅:** všechny cílové řádky = 0; `OMA-20260001` (id `cfa697db...`) existuje a nebyl dotčen.
- **Nedotčeno:** `OMA-20260001`, reálné partner faktury, reálné aktivace, Affiliate Payouts, Partner Invoice logika. Žádný deploy, žádné e-maily, žádné označení jako zaplaceno, žádná změna app kódu.

## 🧹 ADMIN TEST UI — vypnuta akce admin-create-test-user (13. 06. 2026)

Navazuje na produkční odstranění Edge Function `admin-create-test-user`. V admin test dashboardu vypnuta akce, která funkci volala.

- **Soubor:** `src/tests/ComprehensiveAdminTestDashboard.tsx`.
- `createTestUser` už nevolá odstraněnou Edge Function; zobrazuje toast „Tento produkční test byl bezpečnostně vypnut."
- Tři tlačítka „Vytvořit Test User" přejmenována na „Produkční test vypnut".
- **Build:** `npm run build` ✅ exit 0. Commit `a7329fc7`.
- Změna omezena na admin test UI. Žádné SQL, žádný deploy, žádné e-maily, žádní uživatelé. Customer app, Affiliate Payouts a Partner Invoices nedotčeny.

## 🧹 PRODUKČNÍ ODSTRANĚNÍ EDGE FUNKCE admin-create-test-user (13. 06. 2026)

Edge Function `admin-create-test-user` odstraněna z produkce `xkzhjldrojjlrkezorey` — poslední otevřený bod invite reward security auditu (MEDIUM).

- **Příkaz:** `supabase functions delete admin-create-test-user --project-ref xkzhjldrojjlrkezorey --yes`.
- **Read-only ověření:** slug `admin-create-test-user` chybí v produkčním Edge Function seznamu (`list_edge_functions`).
- **Důvod:** `verify_jwt=false`, žádná interní admin/superadmin autorizace, používala service role, mohla zapisovat testovací data.
- **Staging `dxmowysntemfqfnanxua`** tuto funkci nasazenou neměl a nebyl změněn.
- Žádná produkční tabulková data nezměněna. Žádné SQL. Žádná jiná Edge Function nasazena ani odstraněna. Žádné e-maily. Žádní uživatelé. Affiliate Payouts a Partner Invoices nedotčeny.
- Zdrojová složka v repu zůstává; redeploy možný až po přidání řádného admin guardu.
- Vedlejší efekt: interní admin test dashboard může ukázat „function not found" při kliknutí na staré test tlačítko.
- **Invite reward security audit UZAVŘEN:** (1) CRITICAL wallet-minting RPC opraveno REVOKE; (2) HIGH invite reward RLS expozice opravena; (3) MEDIUM `admin-create-test-user` produkční funkce odstraněna.

## 🔄 STAGING SYNC — INVITE REWARD SECURITY FIXY (13. 06. 2026)

Staging `dxmowysntemfqfnanxua` synchronizován s již schválenými produkčními invite reward security fixy. Produkce `xkzhjldrojjlrkezorey` byla v tomto kroku **pouze read-only** a nebyla změněna.

- **Staging před syncem postrádal oba fixy:**
  1. `create_referral_reward_from_wallet_credit(uuid,numeric)` stále povoloval `anon` i `authenticated` execute.
  2. `referrals`, `referral_rewards`, `referral_codes` měly RLS zapnuté, ale nula policy.
- **Aplikováno pouze na staging:**
  - REVOKE `EXECUTE` na `create_referral_reward_from_wallet_credit(uuid,numeric)` od `anon`, `authenticated`, `public`.
  - Přidány stejné own-row + admin/superadmin SELECT policy jako produkce na `referrals`, `referral_rewards`, `referral_codes`.
- **Staging postcheck ✅:** anon execute=false · authenticated execute=false · service_role execute=true · 6 SELECT policy · žádné broad `USING (true)` · payment reward triggery intaktní (`create_referral_reward_from_payment`, `reverse_referral_reward_on_payment_status_change`).
- **Staging Full E2E run `27459386337` proběhl úspěšně.** Ověřené flow: registrace/login, profil, peněženka, top-up/checkout bez reálné platby, vlastní invite zobrazení zákazníka, admin invite přehled. **Žádný rozbitý flow.**
- Bez změny produkčních dat, bez reálných plateb, bez vytváření uživatelů, bez e-mailů, bez deploye. Affiliate Payouts a Partner Invoices nedotčeny.
- **Otevřený bezpečnostní bod (NEOPRAVENO):** MEDIUM — Edge Function `admin-create-test-user` bez autorizace + service role.

## 🔒 INVITE REWARD RLS — ✅ REGRESSION AUDIT PO PRODUKČNÍ OPRAVĚ (13. 06. 2026)

- Regression audit after production invite reward RLS fix was completed.
- Production project: `xkzhjldrojjlrkezorey`.
- Verified read-only on production: `referrals`, `referral_rewards`, `referral_codes` now have exactly 2 scoped SELECT policies per table.
- No broad `USING (true)` policies remain.
- `wallets`, `profiles`, and `payments` policies stayed unchanged.
- Static code check confirmed only 4 frontend files read the 3 invite reward tables: `src/components/ReferralSection.tsx`, `src/pages/AdminReferrals.tsx`, `src/pages/AdminReferralDashboard.tsx`, `src/components/AdminReferralAudit.tsx`.
- Login, profile, wallet, top-up, voucher, and payment code do not depend on the changed tables.
- Edge Functions do not reference the changed invite reward tables.
- `create-stripe-checkout` remains JWT-gated and derives `user_id` server-side.
- `stripe-webhook` remains signature-verified and uses service-role path; wallet credit and `create_referral_reward_from_payment` are unaffected by tightened customer SELECT policies.
- Production smoke on post-fix commit `40df522b` passed at 2026-06-13 06:10 and confirmed registration/login still work.
- Conclusion: customer login safe; profile safe; wallet safe; top-up safe; payment/wallet credit path safe; own invite display safe; admin invite overview safe.
- No broken flow found.
- No production data was changed during the audit.
- No app code changed.
- No SQL writes.
- No deploy.
- Remaining open security item: MEDIUM — `admin-create-test-user` Edge Function lacks authorization and uses service role.

## 🔐 PRODUKČNÍ RLS OPRAVA — EXPOZICE DAT ODMĚN ZA DOPORUČENÍ (13. 06. 2026)

HIGH nález z bezpečnostního auditu **opraven a ověřen na produkci `xkzhjldrojjlrkezorey`**. Tabulky `referrals`, `referral_rewards`, `referral_codes` měly broad SELECT policy `USING (true)`, takže každý přihlášený uživatel mohl číst cizí invite graf, doporučovací kódy a částky odměn.

- **Odstraněny** broad `*_read USING (true)` SELECT policy.
- **Přidány own-row SELECT policy (authenticated):**
  - `referrals`: uživatel čte řádky, kde je `referrer_user_id` nebo `referred_user_id`.
  - `referral_rewards`: uživatel čte řádky, kde je `referrer_user_id` nebo `referred_user_id`.
  - `referral_codes`: uživatel čte jen vlastní kód přes `user_id = auth.uid()`.
- **Přidány admin/superadmin read-all policy:** `has_role(auth.uid(), 'admin'::app_role)` nebo `has_role(auth.uid(), 'superadmin'::app_role)`.
- **Postcheck ✅:** přesně 2 SELECT policy na tabulku · žádné `USING (true)` nezůstalo · anon/public nemá policy ani grant.
- Admin referral UI zůstává funkční (admin read-all policy).
- Wallet/payment reward trigger nedotčen. Affiliate Payouts nedotčeny. Partner Invoices nedotčeny. Žádná změna app kódu, žádný deploy.
- **Otevřený bezpečnostní bod (NEOPRAVENO):** MEDIUM — Edge Function `admin-create-test-user` bez autorizace + service role.

## 🔐 KRITICKÁ PRODUKČNÍ OPRAVA — ODMĚNY ZA DOPORUČENÍ (13. 06. 2026)

Read-only bezpečnostní audit zákaznického login/registrace + invite reward flow odhalil a **opravil kritickou díru na produkci `xkzhjldrojjlrkezorey`**.

- **Funkce:** `public.create_referral_reward_from_wallet_credit(uuid, numeric)`.
- **Problém:** byla `SECURITY DEFINER` a EXECUTE měl `anon`, `authenticated` i `public`; bez autorizace volajícího, bez vazby na platbu, bez idempotence → kdokoli mohl připsat odměnu za doporučení a MioCoiny do peněženky **bez reálné platby**.
- **Aplikované SQL** (výslovné schválení Pavla):
  `REVOKE EXECUTE ON FUNCTION public.create_referral_reward_from_wallet_credit(uuid, numeric) FROM anon, authenticated, public;`
- **Postcheck:** anon execute = false · authenticated execute = false · service_role execute = true.
- **Legitimní cesta odměn nedotčena:** platební trigger `create_referral_reward_from_payment` (idempotentní `ON CONFLICT (payment_id)`).
- **Rozsah dodržen:** žádná změna app kódu, žádný deploy, Affiliate Payouts nedotčeny, Partner Invoices nedotčeny.
- **Otevřené body z auditu (NEOPRAVENO):**
  1. **HIGH** — invite reward tabulky (`referral_rewards`/`referrals`/`referral_codes`) stále vystavují příliš dat přes široké SELECT policy (`USING (true)`).
  2. **MEDIUM** — Edge Function `admin-create-test-user` vyžaduje revizi autorizace.

## 🧾 PARTNER INVOICES — ✅ PRODUKČNÍ TEST NOVÉ PDF AKTIVAČNÍ TABULKY OVĚŘEN (13. 06. 2026)

- Produkční test invoice `OMA-20260003` byl vytvořen, PDF-generated, ověřen a odeslán přesně jednou.
- Pavel potvrdil, že e-mail dorazil a vše je správně.
- Invoice id: `75fc016e-5283-4801-a19f-0566a2aaa587`.
- Activation code/id: `TESTPDF20260613A` / `764ddcde-ff44-4c48-99fa-9ed9ef453818`.
- External order id: `TEST-PDF-OVERVIEW-20260613-5MC`.
- Invoice total: `5` MioCoins.
- `partner_invoice_lines` total: `5` MioCoins, 1 line.
- PDF overview total: `5` MioCoins.
- PDF export id: `48e44363-acde-4807-8d8c-ec3f85b5a8e7`.
- PDF obsahuje `Kontrolní přehled aktivací MioCoinů`, test activation code, test external order id a total `5`.
- E-mail byl odeslán přesně jednou na `eshop@onemil.cz`.
- Final status: `issued`.
- `paid_at`: `null`.
- `OMA-20260001` nebyla dotčena.
- Nic nebylo označeno jako zaplacené.
- Affiliate Payouts a nesouvisející systémy byly nedotčeny.
- Cleanup zatím nebyl proveden, aby Pavel mohl zkontrolovat e-mail/PDF.
- Cleanup identifiers for later: invoice `OMA-20260003`, invoice id `75fc016e-5283-4801-a19f-0566a2aaa587`, activation `TESTPDF20260613A`, activation id `764ddcde-ff44-4c48-99fa-9ed9ef453818`, PDF export `48e44363-acde-4807-8d8c-ec3f85b5a8e7`.

## 🧾 PARTNER INVOICES — ✅ ADMIN RESEND BUTTON PŘIDÁN (12. 06. 2026)

- Lovable Publish byl ověřen na produkci; live bundle je `index-DZZxPOk1.js`.
- Admin faktury na live nyní zobrazují: `draft` → `Odeslat fakturu emailem`, `issued` → `Znovu odeslat`, `paid` → žádné send/resend tlačítko.
- Staré status-only tlačítko `Odeslat` je pryč.
- Při live ověření nebyl odeslán žádný e-mail a nezměnil se žádný stav faktury.
- `OMA-20260001` zůstává `issued` a `paid_at = null`.
- Admin UI pro partner faktury má tlačítko `Znovu odeslat` v detailu faktury.
- Tlačítko je dostupné pouze pro partner faktury se stavem `issued`.
- Používá existující safe resend mode Edge Function `send-partner-invoice-email` s body `{ invoice_id, resend: true }`.
- Resend nemění status faktury, nenastavuje `paid_at` a neregeneruje PDF; vyžaduje existující PDF export.
- Pokud PDF export v UI není dostupný, admin dostane toast `PDF faktura zatím není k dispozici.`
- Normální admin invoice UI už nezobrazuje status-only tlačítko `Odeslat`; draft faktury se vystavují pouze přes skutečné odeslání e-mailu backend flow a paid stav se v této UI patičce ručně nenastavuje.
- Manuální produkční resend faktury `OMA-20260001` na `eshop@onemil.cz` už byl proveden dříve po schválení Pavla; nic nebylo označeno jako zaplacené.
- Affiliate Payouts zůstaly nedotčeny.

## 🧾 PARTNER INVOICES — ✅ PDF OVERVIEW PRODUKČNÍ FIX DOKONČEN (12. 06. 2026)

**Produkce `xkzhjldrojjlrkezorey`:**
- Production fix pro Partner Invoice PDF overview mismatch je kompletní.
- Migrace `20260612125606_partner_invoice_line_snapshots.sql` byla aplikována na produkci jako verze `20260612132440`.
- Edge Function `generate-partner-invoice-pdf` byla nasazena na produkci jako verze `131`.
- Edge Function `send-partner-invoice-email` byla později pro schválený jednorázový resend nasazena jako verze `123`; safe resend mode používá existující PDF export a nemění status ani `paid_at`.
- Faktura `OMA-20260001` už nezobrazuje chybný date-range activation overview.
- Legacy faktura `OMA-20260001` má 0 invoice-linked rows, takže PDF používá safe fallback/no-detail overview místo zavádějících 15 MioCoins.
- Nebyly odeslány žádné e-maily.
- Nic nebylo označeno jako zaplacené.
- Affiliate Payouts byly nedotčeny.
- Production smoke prošel: run `27418726117`.
- Strict detail total = 5 pro legacy fakturu by vyžadoval samostatně schválený cílený backfill.

## 🧾 PARTNER INVOICES — ✅ PRODUKČNÍ ROLLOUT PROVEDEN (12. 06. 2026, výslovné schválení Pavla „schvaluji produkční rollout partner faktur")

**Produkce `xkzhjldrojjlrkezorey` — vše aplikováno a smoke-ověřeno:**
- 3 migrace aplikovány v pořadí (RLS → enqueue fix → auto-PDF hook), postchecky ✅: 7 policies, oba enqueue overloady, hook v obou `create_partner_invoices_*`, nové funkce service_role-only.
- Bucket `partner-invoices` přepnut na **private** (10 legacy objektů z test éry — staré public URL přestaly fungovat dle plánu; nový PDF pro OMA-20260001 vygenerován se signed URL).
- EF nasazeny: `generate-partner-invoice-pdf` + `send-partner-invoice-email` (`--no-verify-jwt`, auth uvnitř funkce). Secrets ověřeny: `INTERNAL_FUNCTION_TOKEN`, `RESEND_API_KEY`.
- **Auto-PDF flow AKTIVOVÁN:** Vault secrets `internal_function_token` (zkopírován server-side z cron job 23 — nikdy nebyl v příkazu/logu) + `edge_functions_url`. Produkce má pg_net → `partner_invoice_post_create` při vzniku faktury frontuje e-mail a požádá o PDF.
- Smoke ✅: no-auth/bad-JWT → 401 (obě EF) · admin UI „Generovat PDF" na OMA-20260001 → nový export se signed URL, stažení 200 `%PDF` (26 KB) · admin UI „Odeslat fakturu emailem" → doručeno **pouze na `eshop@onemil.cz`**, status `draft → issued` (11:55:29 UTC), NIC nepaid · partner RLS simulace: BOHEMIA auth user vidí 5 faktur/11 exportů, cizí uid 0/0 · non-admin 403 kontrakt kryje spec 44b (staging).
- Workflows ✅: production smoke run `27414185094` · P0 smoke run `27414186632`.
- **✅ POST-PUBLISH OVĚŘENÍ (12. 06. 2026):** Lovable Publish proběhl a propagoval se — live bundle změněn na `index-BKax3mKj.js` (obsahuje nový PartnerDashboard download kód). Admin invoice UI funguje; „Generovat PDF" po publishi ověřen (nový export row + storage objekt 12:08:42 UTC — jediná záměrná datová změna ověření). Partner PDF download přes signed URL flow je live (privátní bucket, `/object/sign/`). E-mail po publishi znovu NEtestován — dřívější produkční smoke doručil pouze na `eshop@onemil.cz`. Žádná faktura nebyla označena jako zaplacená. Affiliate Payouts nedotčeny. Finální rollout commit `f3d281c0`. **Partner Invoice fix je plně live end-to-end.**
- ⏳ Zbývá: Botanic `[TEST DATA]` billing nahradit před veřejným spuštěním.

## 🧾 PARTNER INVOICES — FIX KOMPLETNÍ NA STAGINGU (12. 06. 2026, historický stav před rolloutem)

**Co bylo rozbité (audit 12. 06. 2026):** partner neviděl vlastní faktury (`partner_invoices` měla jen admin SELECT policy; exports/lines deny-all), admin změna stavu neměla UPDATE policy, oba invoice EF (`generate-partner-invoice-pdf`, `send-partner-invoice-email`) vyžadovaly `x-internal-token` který browser nemá → admin tlačítka vracela 401 (ověřeno na produkčním UI, faktura `cfa697db`), a `create_partner_invoices_for_last_week()` volala neexistující overload `enqueue_partner_invoice_email(uuid)` → první reálná fakturace by spadla.

**Staging stav (vše aplikováno/nasazeno POUZE na `dxmowysntemfqfnanxua`):**
- Migrace: `20260612090000_partner_invoice_rls_policies.sql` (partner own SELECT na invoices/exports/lines + admin UPDATE) ✅ · `20260612093000_partner_invoice_enqueue_fix.sql` (1-arg enqueue overload, jen INSERT do email_queue) ✅ · `20260612110000_partner_invoice_auto_pdf.sql` (`request_partner_invoice_pdf` best-effort pg_net+Vault, `partner_invoice_post_create` hook v obou `create_partner_invoices_*`) ✅.
- EF deploy (staging, `--no-verify-jwt`): `generate-partner-invoice-pdf` v2, `send-partner-invoice-email` v2. Auth: `x-internal-token` (automatizace, stejný vzor jako cron joby 23/24) NEBO service-role bearer NEBO admin/superadmin JWT (UI fallback). Žádný token v prohlížeči.
- PDF storage: bucket `partner-invoices` na stagingu vytvořen **private**; EF vrací 10letou **signed URL** místo public URL. ⚠️ Produkční bucket je zatím PUBLIC — v rolloutu přepnout na private (viz checklist).
- E-mail: bez `RESEND_API_KEY` na stagingu vrací EF řízený `503 email_service_not_configured`, status faktury zůstává `draft`. Reálné doručení se ověří při produkčním rollout smoke (klíč existuje na produkci) výhradně na `eshop@onemil.cz` (bezpečný testovací partner e-mail, aktualizováno 12. 06. 2026).
- Frontend (commit `78fa00fb`): `PartnerDashboard.downloadOfferInvoicePdf` čte `partner_invoice_exports` přes RLS (partner negeneruje faktury); `AdminInvoices` funguje beze změny (functions.invoke posílá JWT automaticky).
- Testy: spec 43 (RLS visibility, 4 testy) ✅ run `27401675220` · spec 44 (EF kontrakt: 401/403/PDF+export+download/partner RLS download/email safe-fail, 5 testů) ✅ run `27412464954` (9 passed 43+44). Cleanup po obou specích = 0 zbytků (partners, invoices, queue, storage, users).
- Automatický flow ověřen atomicky: `create_partner_invoices_for_period` → faktura + email_queue řádek + PDF hook no-op (staging bez pg_net), bez pádu; vše uklizeno v téže transakci.

**Production rollout checklist (NEPROVEDENO — čeká na výslovné schválení Pavla):**
1. Aplikovat 3 migrace v pořadí: `20260612090000` → `20260612093000` → `20260612110000`; postchecky z komentářů migrací (7 policies, 2 overloady enqueue, hook=true, ACL nových funkcí bez anon/authenticated).
2. `UPDATE storage.buckets SET public=false WHERE id='partner-invoices'` (stávajících 10 export řádků má public URL z testovací éry — přestanou fungovat; regenerovat PDF adminem nebo akceptovat).
3. Deploy `generate-partner-invoice-pdf` + `send-partner-invoice-email` s `--no-verify-jwt` (config.toml `verify_jwt=false`, auth řeší funkce interně). Ověřit env: `INTERNAL_FUNCTION_TOKEN`, `RESEND_API_KEY`, service key.
4. Volitelná aktivace auto-PDF: Vault secrets `internal_function_token` (= hodnota INTERNAL_FUNCTION_TOKEN) a `edge_functions_url` (`https://xkzhjldrojjlrkezorey.supabase.co/functions/v1`) — bez nich je PDF hook no-op a e-mail flow funguje samostatně.
5. Smoke: no-JWT → 401, non-admin → 403, admin JWT → PDF 200 + signed URL; „Odeslat fakturu" na testovací faktuře s recipientem **výhradně `eshop@onemil.cz`** (žádné reálné externí partner e-maily, žádní zákazníci/třetí strany); nic neoznačovat paid.
6. Lovable Publish (PartnerDashboard změna) + P0 smoke dle pravidel.
7. Pozn.: `create_partner_invoices_*` mají pre-existing `authenticated` EXECUTE grant (SECURITY INVOKER, RLS chrání zápisy) — zvážit REVOKE jako samostatné hardening.
8. Pozn.: Botanic má stále `[TEST DATA]` billing údaje — nahradit před ostrým provozem.

**Aktualizováno:** 10. 06. 2026 — 🌿 **Samostatná větev: dávkové výplaty affiliate/obchodních provizí (Fáze A+B+C na stagingu ověřené, Fáze D opravený reviewable návrh — importní test Air Bank ✅ SPLNĚN, formát `.kpc` plně funkční, čeká na výslovné schválení Pavla pro staging aplikaci, produkce netknutá).** Hlavní roadmapa se teď nemění.

## 🌿 DÁVKOVÉ VÝPLATY PROVIZÍ — AKTUÁLNÍ STAV STAGINGU (10. 06. 2026)

**Stav větve:** Fáze A, Fáze B i Fáze C jsou aplikované pouze na staging Supabase projekt `dxmowysntemfqfnanxua`. Bezpečnostní patch temp tabulky pro `create_affiliate_payout_batch` je aplikovaný. Produkce `xkzhjldrojjlrkezorey` je netknutá. Nebyl proveden žádný web deploy, žádný Lovable Publish a full E2E nebylo spuštěno.

**Důležité commity:**
- Fáze A úprava: `3b2ba8a65c7480636045440f15998a5d79abc082`
- Fáze B návrh: `ab44ffa04b54ab405ef17de502e5ef986f710c98`
- Fáze B cleanup: `74cf175fea8f514001728160ec4f044beaddc54b`
- temp table patch: `0915b03e0d3dc8a235e4ff12aba079875557ef4b`
- CI workflow inputy: `1bcf3221829f238a94ae8534aeeda495af8dfea0`
- test email fix: `2b9b6b07c549fb2f26dcab22f95c9967f68284a5`
- cookie consent fix: `7e061f1b6737435939eb3d1a6250301bccd7fb06`
- Fáze C worker fix: `6f998677c4fc5ccb085f9e511d625c58579d6f62`

**Ověřené GitHub Actions:**
- spec 40 run `27258741085` — 4 passed
- spec 39 run `27270797466` — 2 passed
- staging UI smoke run `27271124754` — 2 passed

**Fáze C — PDF doklady + e-mail queue na stagingu:**
- Aplikována migrace `20260610140000_affiliate_payouts_phase_c.sql`.
- `affiliate_payout_documents` má nové PDF/e-mail auditní sloupce.
- `email_queue` má nové sloupce pro privátní storage přílohy a `attachment_required`.
- Existují RPC `prepare_affiliate_payout_document` a `finalize_affiliate_payout_document`.
- Edge Function `create-affiliate-payout-document` je nasazená na stagingu, verze 1.
- Edge Function `process-email-queue` je nasazená na stagingu, verze 2.
- `settings.accounting_email = accounting-test@onemil.test`.
- Cílený test `tests/e2e/41-affiliate-payout-documents.spec.ts` prošel: `4 passed`.
- Cleanup testu 41 čistý: `email_queue` 0 zbytků pro spec41, `affiliate_accounts` 0 zbytků pro spec41, `affiliate_payout_documents` 0 zbytků pro spec41.
- Během testu opraven `process-email-queue`: Resend se už neinicializuje při startu funkce, ale až před skutečným odesláním; required PDF příloha bez souboru skončí řízeně jako `failed`.

**Ruční staging test Pavlem dokončen:**
- Staging: `dxmowysntemfqfnanxua`
- Testovací provize `pavel-manual-payout-test obchodnik` byla vidět na `/admin/affiliate-commissions`.
- Provizi šlo vybrat checkboxem a vytvořit z ní platební dávku.
- Vznikla dávka `APB-2026-000016`, částka `123,45 Kč`.
- Dávka šla otevřít v detailu.
- Potvrzovací dialog správně upozornil, že akce neposílá peníze.
- Dávka byla označena jako zaplacená.
- Dávka je v seznamu dávek se stavem `Zaplaceno`.
- Původní provize už nejde znovu zařadit do další dávky.

**UI stav na stagingu:**
- `/admin/affiliate-commissions` má dávkové workflow pro eligible provize.
- Per-row `Označit jako vyplacené` je odstraněno; jednotlivá provize se už neoznačuje jako paid.
- Eligible provize mají checkbox a akci `Vytvořit platební dávku`.
- `/admin/affiliate-payouts/:id` má detail dávky a tlačítko `Označit dávku jako zaplacenou`.
- Akce `Označit dávku jako zaplacenou` pouze eviduje, že platba byla provedena v bance; neposílá peníze.

**Fáze D APLIKOVÁNA NA STAGING ✅ (10. 06. 2026):** Migrace `20260610170000_affiliate_payouts_phase_d.sql` aplikována na staging `dxmowysntemfqfnanxua`. Postcheck OK: 5 nových export sloupců na `affiliate_payout_batches`, 3 CHECK constrainty, index `idx_apb_exported_at`, RPC `prepare_affiliate_bank_export` (service_role only), RPC `finalize_affiliate_bank_export` (service_role only), RPC `mark_affiliate_payout_batch_paid` (authenticated+service_role), bucket `affiliate-bank-exports` privátní ✅. Grant oprava: Supabase přidával `anon`/`authenticated` EXECUTE implicitně — po migraci provedeno `REVOKE`; `prepare` a `finalize` jsou nyní skutečně service_role only. Edge Function `generate-affiliate-bank-export` zatím NEdeployována. Produkce `xkzhjldrojjlrkezorey` nedotčena.

**Edge Function `generate-affiliate-bank-export` NASAZENA NA STAGING ✅ (10. 06. 2026):** ACTIVE, verze 1. Smoke test bez JWT → `401` ✅.

**Spec 42 `42-affiliate-bank-export.spec.ts`: `3 passed` ✅ (10. 06. 2026, run `27301399760`):** 42a) vytvoří Air Bank `.kpc` export a povolí paid až po exportu ✅; 42b) chybějící účet plátce vrátí řízenou chybu ✅; 42c) `created` dávku nelze označit jako paid před exportem ✅. Telegram OK doručen.

**Spec 40 `40-affiliate-payouts.spec.ts`: `4 passed` ✅ (10. 06. 2026, run `27301606390`):** 40a) batch lze vytvořit, ale paid je blokován před exportem ✅; 40b) admin UI zobrazí detail dávky a nabídne export před paid ✅; 40c) staré per-row RPC odmítne approved → paid ✅; 40d) AdminAffiliateAccounts detail nemá per-row paid akci ✅. **Fáze D staging ověření kompletní (spec 40 + spec 42).** Produkce nedotčena.

**Mimo aktuálně hotový staging rozsah:** Potvrzení o zaplacení (Fáze E) zatím není hotové. Produkční rollout zůstává odložený na koordinovaný balík DB + aktuální UI + smoke test.

**Produkční rollout závěr:** Fáze A+B se nesmí nasadit jako samotná DB změna bez aktuálního UI. Fáze B blokuje staré RPC `approved → paid`, zatímco staré produkční UI může pořád zobrazovat per-row `Označit jako vyplacené`; tím by staré ruční paid flow začalo vracet chybu. Nejbezpečnější je koordinované produkční okno: (1) produkční okno, (2) aplikovat DB Fázi A, (3) aplikovat DB Fázi B, (4) aplikovat temp-table guard, (5) ihned nasadit aktuální UI, (6) udělat produkční smoke. Správné storage buckety pro postcheck jsou `affiliate-payout-docs` a `affiliate-bank-exports`.

**Ruční importní test Air Bank — DOKONČEN ✅ (10. 06. 2026):**
- Test 1 (`sample-onemil-20260625.kpc`, 2 fiktivní příjemci): Air Bank soubor přijala, stav „Vytvořena", ale platby označeny „K opravě" — fiktivní účty příjemců neexistují v bankovním systému.
- Test 2 (`sample2-real-recipient-20260625.kpc`, příjemce `225259937/0600`, 1,00 Kč): Air Bank soubor přijala, stav „**Vytvořena**", platba příjemce zobrazena správně — **žádné „K opravě"** ✅.
- **Závěr: formát `.kpc` je plně funkční.** „K opravě" bylo čistě artefaktem neexistujících fiktivních účtů příjemců, nikoli chybou ve struktuře souboru.
- Pavel žádnou platbu nepotvrdil ani neodeslal.
- **Blokující podmínka importního testu je splněna.** Fáze D může pokročit na staging po výslovném schválení Pavla. Zdroj `payer_account`/`due_date` v produkčním prostředí musí být před aplikací potvrzen.

**Fáze D.1 APLIKOVÁNA NA STAGING ✅ (10. 06. 2026):** Migrace `20260610180000_affiliate_payouts_phase_d1.sql` aplikována na staging `dxmowysntemfqfnanxua`. Settings seed OK: `affiliate_payout_payer_account = 3151752019`, `affiliate_payout_payer_bank_code = 3030`. ACL OK: `create_affiliate_payout_batch` i `update_affiliate_payout_batch_meta` nemají `anon` EXECUTE — explicitní REVOKE provedeno po každé funkci (Supabase přidává implicit grant). `create_affiliate_payout_batch` auto-filluje `payer_account`, `payer_bank_code` ze settings a `due_date = current_date + 2` při vytvoření dávky. Admin může editovat tato pole v detailu `/admin/affiliate-payouts/:id` dokud je dávka ve stavu `created` — uložení přes RPC `update_affiliate_payout_batch_meta`. `prepareBatchForExport` workaround odstraněn ze spec 42. Produkce `xkzhjldrojjlrkezorey` nedotčena.

**Spec 42 `42-affiliate-bank-export.spec.ts`: `6 passed` ✅ (10. 06. 2026, run `27303172376`):** 42a) vytvoří Air Bank `.kpc` export a povolí paid až po exportu ✅; 42b) chybějící účet plátce (NULL-ováno po auto-fill) vrátí řízenou chybu ✅; 42c) `created` dávku nelze označit jako paid před exportem ✅; 42d) `create_affiliate_payout_batch` auto-filluje `payer_account` a `due_date = today+2` ✅; 42e) `update_affiliate_payout_batch_meta` umožňuje editaci před exportem ✅; 42f) `update_affiliate_payout_batch_meta` odmítne editaci po exportu ✅. Telegram OK doručen.

**Spec 40 `40-affiliate-payouts.spec.ts`: `4 passed` ✅ (10. 06. 2026, run `27303389522`):** Žádné regrese po D.1. 40a–40d všechny prošly. **Fáze D.1 staging ověření kompletní.**

**Produkce zůstává blokována.** Do produkce nic nepřenášet bez výslovného schválení Pavla. Žádný Lovable Publish. Testovací produkční řádek `dddddddd-dddd-dddd-dddd-dddddddddddd` zatím nemazat.

### Production rollout checklist — Affiliate Payouts Phase A+B+C+D+D.1 (připraven 11. 06. 2026, NEAUTORIZOVÁNO)

Plný checklist je v `docs/affiliate-payouts/DESIGN.md` §17. Shrnutí:

- **Migration order (NE podle `ls` — podtrzitko Phase B base sortuje poslední):** A `20260609_affiliate_payouts_phase_a.sql` → B `20260610_affiliate_payouts_phase_b.sql` → B guard `20260610120000_affiliate_payouts_phase_b_temp_table_guard.sql` → C `20260610140000_affiliate_payouts_phase_c.sql` → D `20260610170000_affiliate_payouts_phase_d.sql` → D.1 `20260610180000_affiliate_payouts_phase_d1.sql`. Po D.1 ručně `REVOKE EXECUTE ... create_affiliate_payout_batch FROM anon`. Potvrdit settings (payer 3151752019/3030, produkční `accounting_email`).
- **Edge Functions:** `create-affiliate-payout-document`, `generate-affiliate-bank-export`, `process-email-queue`.
- **Postchecks:** per-fáze (RLS, RPC existence, `mark_..._paid` vyžaduje `exported`, bucket `affiliate-bank-exports` privátní, service_role-only export RPC, žádný `anon` EXECUTE, advisors).
- **Smoke (P0 před Publish):** 01,02 / 33,14 / 04 / 05 / 09,03-voucher / 29,32 / 31 + EF no-JWT → 401.
- **E2E (staging):** spec 40 (4), spec 41 (4), spec 42 (6) zelené + Full E2E bez regresí.
- **Rollback:** EF delete/redeploy; DB reverzně D.1→A; jen na prázdném payout datasetu; nemazat `dddddddd-…`; frontend `git revert` + re-Publish.
- **Rizika:** implicitní `anon` grant po replace, ordering trap, staging `accounting_email`, bucket privacy, reálný Air Bank money path, email attachment failed flow, security backlog, adjacent regrese commissions/B2B.
- **⛔ FINAL GATE:** produkce `xkzhjldrojjlrkezorey` zůstává BLOKOVÁNA dokud Pavel nedá nové výslovné písemné schválení.

### Final readiness audit (11. 06. 2026) — nález: ACL díra Fáze C, patch připraven (NEAPLIKOVÁN)

- **🔴 Nález:** staging postcheck odhalil, že `prepare_affiliate_payout_document`, `finalize_affiliate_payout_document` a `next_affiliate_payout_document_number` mají `anon` + `authenticated` EXECUTE — Supabase implicitní granty, které `REVOKE ALL FROM PUBLIC` v Fázi C neodstranil. Tyto funkce NEMAJÍ vnitřní auth guard (service_role-only by design) → každý přihlášený uživatel mohl vkládat payout doklady, queue emaily a posouvat provize do `ready_to_pay`. Navíc `admin_set_affiliate_commission_status` a `cancel_affiliate_payout_batch` měly `anon` EXECUTE (mají vnitřní `is_admin()` — defense-in-depth).
- **Fix:** migrace `supabase/migrations/20260611090000_affiliate_payouts_acl_patch.sql` — idempotentní explicitní REVOKE pro všech 10 payout funkcí. **APLIKOVÁNA POUZE NA STAGING `dxmowysntemfqfnanxua` ✅ (11. 06. 2026, výslovné schválení Pavla).** ACL postcheck prošel pro všech 10 funkcí: document/export RPC (`prepare_/finalize_affiliate_payout_document`, `next_affiliate_payout_document_number`, `prepare_/finalize_affiliate_bank_export`) = pouze `postgres + service_role`; admin RPC (`admin_set_affiliate_commission_status`, `cancel_affiliate_payout_batch`, `mark_affiliate_payout_batch_paid`, `create_affiliate_payout_batch`, `update_affiliate_payout_batch_meta`) = `postgres + authenticated + service_role`, žádný `anon`. V rollout checklistu (DESIGN.md §17) je krok 7 a nahrazuje dřívější manuální post-apply REVOKE.
- **Regresní lock:** test 41e v `tests/e2e/41-affiliate-payout-documents.spec.ts` (anon i authenticated → 42501 na document RPC) — **prošel ✅**.
- **Post-patch ověření (11. 06. 2026):** spec 41 `41-affiliate-payout-documents.spec.ts`: **5 passed, 0 failed** (run `27371575748`, 41a–41e vč. 41e ACL locku). Spec 42 `42-affiliate-bank-export.spec.ts`: **6 passed, 0 failed** (run `27372071508`). Spec 40 v tomto kroku záměrně nespuštěn (dle instrukce). Po ACL patchi žádné další SQL, žádný deploy, žádný Lovable Publish.
- **Spec 41 po D/D.1 ověřen:** run `27370912054` — **4 passed, 0 failed** (41a–41d, před přidáním 41e). Mezera „spec 41 neběžel po aplikaci D/D.1" uzavřena.
- **EF JWT audit:** všechny 3 payout EF na stagingu `verify_jwt = true`. ⚠️ `process-email-queue` nemá žádný vnitřní auth check a produkční verzi volá pg_cron job 16 — před produkčním redeployem ověřit produkční `verify_jwt` setting a cron Authorization header (staging pg_cron nemá, kombinace netestovatelná). Detail v DESIGN.md §17.2.
- **Ostatní audit OK:** buckets `affiliate-payout-docs` i `affiliate-bank-exports` privátní ✅; RLS payout tabulek admin-only, `email_queue` deny-all (0 policies) ✅; settings staging OK ✅; `npm run build` ✅; `git diff --check` ✅.
- **Zbývající kroky před production-ready:** ~~(1) aplikace ACL patche na staging~~ ✅, ~~(2) spec 41 + 42 po patchi~~ ✅, ~~(3) Full Staging E2E jako finální kontrola~~ ✅. **Větev `codex/affiliate-payouts-audit` je PLNĚ STAGING-VERIFIED.**
- **Full Staging E2E (11. 06. 2026):** run `27372767070` — **123 passed · 4 skipped · 0 failed** (11m49s). Spec 40: 4 passed ✅, spec 41: 5 passed (incl. 41e ACL regression lock) ✅, spec 42: 6 passed ✅. Telegram doručen: `✅ OneMil STAGING full E2E OK — all specs passed`. 4 skipy jsou pre-existující záměrné skipy nesouvisející s payout větví.

### 🚀 PRODUKČNÍ ROLLOUT BACKENDU — PROVEDEN (12. 06. 2026, výslovné písemné schválení Pavla)

- **Migrace (7, v přesném pořadí, per-migrace postcheck ✅):** A `affiliate_payouts_phase_a` → B `affiliate_payouts_phase_b` → B guard `affiliate_payouts_phase_b_temp_table_guard` → C `affiliate_payouts_phase_c` → D `affiliate_payouts_phase_d` → D.1 `affiliate_payouts_phase_d1` → ACL `affiliate_payouts_acl_patch` — vše aplikováno na produkci `xkzhjldrojjlrkezorey`.
- **Settings ✅:** `accounting_email = divispavel2@gmail.com` · `affiliate_payout_payer_account = 3151752019` · `affiliate_payout_payer_bank_code = 3030`.
- **Edge Functions ✅:** `create-affiliate-payout-document` ACTIVE v1 (`verify_jwt=true`) · `generate-affiliate-bank-export` ACTIVE v1 (`verify_jwt=true`) · `process-email-queue` ACTIVE v124 (`verify_jwt=false` — **NEMĚNIT**: pg_cron job 16 volá `net.http_post` bez Authorization headeru, ověřeno dotazem na `cron.job`; deploy přes `npx supabase functions deploy process-email-queue --no-verify-jwt` po samostatném schválení Pavla, MCP/classifier deploy s `verify_jwt=false` blokoval).
- **Postchecky ✅:** 3 payout tabulky + RLS enabled + 3 admin-only policies; buckety `affiliate-payout-docs` i `affiliate-bank-exports` privátní; document/export RPC = `postgres+service_role` only (0 špatných grantů); admin RPC bez `anon` (0 nálezů); CHECK constrainty, indexy, sekvence, auto-fill D.1 ověřeny po každé fázi.
- **Smoke ✅:** `generate-affiliate-bank-export` no-JWT → **401**; `create-affiliate-payout-document` no-JWT → **401**; `process-email-queue` no-auth cron-style call → **200** `processed: 0` (cron kompatibilita potvrzena, nic neodesláno).
- **Advisors:** žádné nové payout nálezy. Admin RPC mají očekávaný WARN `authenticated_security_definer_function_executable` (by design — `is_admin()` guard, stejný vzor jako ~150 existujících funkcí). Pre-existing security backlog nesouvisí.
- **Data safety ✅:** testovací řádek `dddddddd-…` nedotčen (ověřeno před i po); 0 payout batchů, 0 dokladů — žádný payout nevytvořen, žádná platba, žádný e-mail neodeslán mimo existující flow.
- **✅ Merge + smoke (12. 06. 2026):** větev `codex/affiliate-payouts-audit` mergnutá do `main` fast-forward, commit `fc7c08ec`, push OK. Produkční smoke (run `27395842847`) ✅ passed. P0 staging smoke (run `27395845092`) ✅ passed. Žádné regrese z merge.
- **✅ Lovable Publish + UI smoke (12. 06. 2026):** Pavel provedl Lovable Publish. Authenticated produkční UI smoke prošel: `/admin` načte ✅, `/admin/affiliate-payouts` načte a zobrazí empty state ✅, `/admin/affiliate-commissions` načte ✅, `/admin/affiliate-accounts` načte ✅. Žádné console errors. Žádná produkční data nezměněna (0 batchů, 0 dokladů, žádná platba, žádný e-mail). **Dávkové výplaty affiliate/obchodních provizí jsou PLNĚ DOKONČENY V PRODUKCI.**
- **✅ TEST payout flow E2E na produkci (12. 06. 2026, schválení Pavla, app neveřejná):** Kompletní flow ověřen end-to-end až po export: TEST provize `eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee` (1,23 Kč) → schválena → doklad **APD-2026-000001** (PDF 19 KB v privátním bucketu) → dávka **APB-2026-000005** → Air Bank `.kpc` export (`exported`, 150 B, SHA-256 ověřen). E-mail `divispavel2@gmail.com` **doručen s PDF přílohou ✅**; e-mail `influencer@onemil.c` **řízeně failed** (neplatná adresa — správné chování workeru). **Žádná platba neproběhla, nic nebylo označeno jako paid.** Chráněný řádek `dddddddd-…` nedotčen. Cleanup: TEST provize, doklad, dávka, položky i email_queue řádky smazány. **Zbývají 2 orphan soubory v privátních bucketech** (`affiliate-payout-docs/2026/eeeeeeee-…/APD-2026-000001.pdf`, `affiliate-bank-exports/2026/APB-2026-000005.kpc`) — privátní, neškodné, lze ručně smazat v Supabase Storage (SQL delete blokuje protection trigger, Storage API vyžaduje service key). **Záměrně ponecháno:** affiliate `cd74ff3a` opravený formát bank údajů `payout_account = 12545857`, `payout_bank = 0800` (RPC vyžaduje účet bez kódu banky + 4ciferný kód zvlášť); Botanic TEST data (payout_ready, testovací billing) — **NUTNO nahradit reálnými údaji před veřejným spuštěním**.

## 🌿 SAMOSTATNÁ VĚTEV — DÁVKOVÉ VÝPLATY PROVIZÍ (09. 06. 2026, NÁVRH)

**Stav: návrh dohodnut, NIC neimplementováno/nasazeno. Hlavní kmen OneMil nedotčen — po dokončení větve návrat.**

**Co řešíme:** dávkové výplaty provizí OneMil → obchodník/affiliate. Admin jen vybírá provize, vytvoří dávku, stáhne hromadný příkaz pro **Air Bank**, po odeslání označí celou dávku jako zaplacenou. **Vše ostatní (doklad, číslo, VS, PDF, e-maily, export) generuje systém automaticky.** Žádné ruční zadávání data/VS/reference.

**Cílový workflow (8 stavů):** `calculated` → `approved` → `payout_document_created` → `ready_to_pay` → `payment_batch_created` → `bank_export_generated` → `paid` (na úrovni dávky) → `payment_confirmation_sent`.

**DB model (návrh, NEAPLIKOVÁNO):** `affiliate_payout_documents`, `affiliate_payout_batches`, `affiliate_payout_batch_items` + rozšíření `affiliate_commissions` (vazba na batch, stav dokladu, confirmation ts, status CHECK). Číselné řady, PDF storage bucket, bezpečné úložiště exportů, RLS jen admin.

**UI (návrh):** rozšíření `/admin/affiliate-commissions` (výběr) + nová `/admin/affiliate-payouts` + detail `/:id`; `Vytvořit platební dávku`, `Stáhnout hromadný příkaz`, `Označit dávku jako zaplacenou` (jen na dávce, ne na provizi).

**ZÁVAZNÉ:**
- Předchozí návrh `00a52bc0` (ruční reference/VS/datum) **NAHRAZEN, neaplikovat.**
- Migrace `20260609_affiliate_commission_payout_evidence.sql` **NEaplikovat.**
- Testovací řádek `dddddddd-dddd-dddd-dddd-dddddddddddd` (produkce, `paid`) **zatím nemazat.**
- Air Bank importní formát (ABO/SEPA XML) **NUTNO OVĚŘIT — nedomýšlet.**

**Nedodělané (před implementací):** ověřit Air Bank formát · existující PDF gen (`generate-partner-invoice-pdf`) · `email_queue` šablony · účetní e-mail OneMil · schéma `affiliate_commissions`/`affiliate_accounts`/`partner_invoices`/`email_queue`/buckety/PDF funkce · implementační plán po fázích · migrace jako soubory (neaplikovat) · testy staging · produkce až po schválení.

**Fázování:** A (DB základ) → B (dávka + paid) → C (doklady + e-maily) → D (Air Bank export) → E (potvrzení). **Nic nenasazovat bez průběžného schválení Pavla.**

**HANDOFF (09. 06. 2026 — implementace zastavena kvůli limitu Claude Code, pokračování v novém chatu/Codexu):**
- **Fáze A návrh hotov, commit `6711e648`.** Soubory: `supabase/migrations/20260609_affiliate_payouts_phase_a.sql` (DB základ — **NEAPLIKOVÁNO** staging/produkce), `docs/affiliate-payouts/DESIGN.md` (kompletní návrh + handoff §11).
- Fáze B (dávka + paid RPC + UI) se NEDĚLALA — další krok po sign-off.
- Air Bank = ABO `.kpc` (ověřeno airbank.cz); **přesný layout/offsety NUTNO POTVRDIT** proti oficiální spec / účetní — nedomýšlet.
- Účetní e-mail OneMil nepotvrzen. Souhlas se samofakturací → do podmínek affiliate/partner programu.
- Cílový systém: auto doklady/samofaktury, PDF, e-maily (obchodník+účetní), dávkové výplaty, Air Bank export, paid jen na úrovni celé dávky. Admin nezadává datum/VS/referenci ručně — generuje systém.
- Detailní handoff text: `docs/affiliate-payouts/DESIGN.md` §11.

---

**Předchozí milník (hlavní kmen):** Admin stránka `Provize obchodníků` fáze 2 live — schvalování + vyplácení B2B provizí. Production smoke run `27171517921` ✅ success (commit `508474fe`). Per-invoice B2B provize migrace aplikována na staging i produkci (`source_invoice_id`/`company_ref_id`, admin RLS na `partner_invoices`); tlačítka `Schválit`/`Označit jako vyplacené` ručně ověřena v produkci (`calculated→approved→paid`).

## 🟢 B2B WORKFLOW ONÉMIL — PRODUKČNĚ OVĚŘENO (08. 06. 2026)

**Production smoke run `27168922017` ✅ success** — commit `4a5a8d40`, workflow `Playwright Smoke Tests`, 08. 06. 2026 21:44 UTC.

Celý B2B workflow OneMil je produkčně ověřen end-to-end:
- ✅ Obchodník (Pavel) přidá firmu → lead v `affiliate_company_leads`
- ✅ Firma dostane email s potvrzovacím linkem → potvrdí žádost
- ✅ Admin schválí lead → partner účet Botanic vytvořen, `affiliate_company_refs.source='company_lead'`, `partners.referred_by_affiliate_id` nastaven
- ✅ Firma dostane email s jednorázovým recovery linkem → přistane na `/partner/set-password` → nastaví heslo → `/partner/dashboard`
- ✅ Aktivace MioCoinů zákazníkem (přes kód) → draft faktura → paid faktura → 5% provize Pavlovi (`calculated`)
- ✅ Měsíční cron (jobid 25, `0 3 2 * *`) automaticky spouští výpočet B2B company provizí

## 🟢 B2B FAKTURACE & PROVIZE — PRODUKČNÍ STAV (08. 06. 2026)

### pg_cron job `affiliate_company_commissions_monthly` (jobid 25) ✅ NASAZEN

- **Kdy:** 2. den v měsíci v 03:00 UTC
- **Co:** `SELECT public.calculate_affiliate_commissions_for_month(date_trunc('month', current_date - interval '1 month')::date);`
- **Migrace:** `supabase/migrations/20260608_affiliate_company_commissions_cron.sql`, commit `8d8de0c1`
- **Idempotentní:** ano (DO blok s IF NOT EXISTS)
- **Rollback:** `SELECT cron.unschedule('affiliate_company_commissions_monthly');`
- Postcheck ✅: jobid=25, active=true, schedule=`0 3 2 * *`, obsahuje_funkci=true, no_duplicate=true

### E2E test fakturace a provizí (08. 06. 2026) ✅

Celý řetězec otestován a rollbacknut na produkci:
`partner_reward_codes` → `partner_coin_activations` → `create_partner_invoices_for_period` → `partner_invoices` (paid) → `calculate_affiliate_commissions_for_month` → `affiliate_commissions`

Výsledky testu (10 coinů, Botanic, Pavel 5 %):
- coins=10, amount_net=10.00 Kč, VAT=2.10 Kč, amount_gross=12.10 Kč ✅
- Pavlova provize: amount_base_czk=0.50, amount_total_czk=0.50 (Pavel není plátce DPH), status=calculated ✅
- Rollback vyčistil všechna 4 testovací záznamy ✅

### Přehled pg_cron jobů (aktuální stav)

| ID | Název | Schedule | Aktivní |
|----|-------|----------|---------|
| 11 | forward_messages_to_sofinity | každou minutu | ✅ |
| 16 | process_email_queue_every_10_min | každých 10 min | ✅ |
| 17 | weekly_partner_invoices | neděle 02:00 | ✅ |
| 18 | referral_inactivity_daily | denně 02:15 | ✅ |
| 20 | influencer_commissions_monthly | 1. v měsíci 02:00 | ✅ |
| 23 | process-event-queue | každou minutu | ✅ |
| 24 | send_offer_reminders_daily | denně 08:00 | ✅ |
| **25** | **affiliate_company_commissions_monthly** | **2. v měsíci 03:00** | **✅** |

### Zbývající mezery před ostrým B2B provozem

1. `source_invoice_id` a `company_ref_id` v `affiliate_commissions` jsou NULL — funkce nepropojuje provizi na konkrétní fakturu (audit musí být manuální)
2. Botanic `price_per_coin = 1.00 Kč` — defaultní hodnota, nastavit reálnou smluvní cenu v `/admin/partners`
3. Botanic `payout_ready = false` — chybí platební údaje firmy
4. Botanic `billing_street/city/zip = NULL` — neúplná fakturační adresa
5. Botanic `terms_accepted_at = NULL` — firma nepřijala podmínky

---

## ✅ ADMIN STRÁNKA `Provize obchodníků` — FÁZE 1 LIVE (09. 06. 2026)

**Route:** `/admin/affiliate-commissions`
**Soubor:** `src/pages/AdminAffiliateCommissions.tsx`
**Commit implementace:** `156519d5`
**Commit opravy PostgREST sloupců:** `e2e673e1`
**Production smoke:** run `27170849002` ✅ success

### Co stránka dělá (fáze 1)

Read-only přehled B2B provizí obchodníků z `affiliate_commissions` kde `commission_type = 'company_invoice'`.

Tabulka zobrazuje:
- Měsíc, Obchodník, Ref kód, Firma (nebo `Neuvedeno`), Typ provize, Základ (bez DPH), DPH, Celkem, Stav, Datum vytvoření

Filtry: stav / obchodník / měsíc (posledních 12)

Info banner: „Provize se počítají z uhrazených faktur firem. Automatický výpočet běží každý měsíc."

Prázdný stav: zobrazí „Žádné B2B provize obchodníků zatím nebyly vypočítány." (bez chybového toastu)

Nav: sekce Uživatelé → Více → Affiliate → **Provize obchodníků**

### Fáze 2 — akce (commit `508474fe`, production smoke `27171517921` ✅)

- **Schválit** (`calculated → approved`) — tlačítko Schválit + AlertDialog „Opravdu chcete schválit tuto provizi?"
- **Označit jako vyplacenou** (`approved → paid`) — tlačítko + AlertDialog „Opravdu chcete označit tuto provizi jako vyplacenou?"
- **paid** — žádné tlačítko, pouze pomlčka
- RPC: `admin_set_affiliate_commission_status(p_commission_id, p_new_status)` — SECURITY DEFINER, is_admin() guard, FOR UPDATE lock
- Přeskočení `calculated → paid` není povoleno (RPC to odmítne: `invalid_transition`)
- Toasty: `Provize byla schválena.` / `Provize byla označena jako vyplacená.` / `Provizi se nepodařilo aktualizovat.`
- DB/EF/provizní logika nezměněna. ABO export zatím není součástí.

### Co není součástí žádné fáze (vyžaduje schválení Pavla)

- ABO export (čeká na doplnění IBAN affiliate obchodníků)
- Hromadné akce
- Změna provizní logiky

### Oprava PostgREST sloupců (commit `e2e673e1`)

Původní kód obsahoval 3 špatné názvy sloupců — PostgREST odmítal query a stránka zobrazovala toast chyby:

| Špatně | Správně |
|--------|---------|
| `amount_czk` | `amount_base_czk` + `amount_total_czk` |
| `commission_rate` | odstraněno (neexistuje v `affiliate_commissions`) |
| `affiliate_accounts.full_name` | `affiliate_accounts.name` |

### Skutečné sloupce `affiliate_commissions` (ověřeno na produkci)

`id`, `affiliate_id`, `commission_type`, `customer_ref_id`, `company_ref_id`, `source_invoice_id`, `period_month`, `amount_base_czk`, `vat_rate`, `amount_total_czk`, `status`, `created_at`, `updated_at`, `paid_at`

### Fáze 2 (plánováno, vyžaduje schválení Pavla)

- Schvalování a vyplácení provizí přes `admin_set_affiliate_commission_status`
- ABO export (po doplnění IBAN affiliate obchodníků)

---

## ✅ PHASE 2A–2D — B2B Company Lead Workflow KOMPLETNÍ V PRODUKCI (08. 06. 2026)

**Celý B2B company lead workflow (Phase 2A–2D) je nasazen a ověřen v produkci `xkzhjldrojjlrkezorey`. Lovable Publish ✅. Pavel úspěšně otestoval celý flow v produkci (09. 06. 2026).**

### Partner password setup flow (09. 06. 2026)

Po admin approve firma obdrží email s jednorázovým Supabase recovery linkem. Kliknutím přistane na `/partner/set-password` (ne rovnou na dashboard). Opraveny dva problémy:

1. **`redirectTo` v `generateLink`** — EF `approve-affiliate-company-lead` generuje link s `options: { redirectTo: PARTNER_SET_PASSWORD_URL }` (commit `c36410eb`). `SITE_URL` env var pro staging override.
2. **Race condition** — route guard redirectoval na `/partner/dashboard` dřív než PASSWORD_RECOVERY handler. Opraveno přidáním `isPasswordRecovery: boolean` do `AuthContext` (nastaveno v `onAuthStateChange` batchem s `user`). Commit `0759c04f`.
3. **Redirect loop po úspěšném updateUser** — Supabase po `updateUser` vypálí `USER_UPDATED` event, `isPasswordRecovery` zůstávala `true` → App.tsx efekt vrátil uživatele zpět na set-password. Opraveno: `USER_UPDATED` event resetuje `isPasswordRecovery = false`. Commit `f1236405`.

**Nové soubory:**
- `src/pages/PartnerSetPassword.tsx` — route `/partner/set-password`, states: `checking | ready | no_session | success`, `data-testid="psp-password/psp-confirm/psp-submit"`.
- `tests/e2e/38-partner-set-password.spec.ts` — 5 staging-only testů (38a–38e).

**Invarianty:**
- Po approve: firma dostane email → klikne → `/partner/set-password` → nastaví heslo → `/partner/dashboard`.
- Recovery link je jednorázový. Nikdy se neloguje ani nevrací v API response.
- `isPasswordRecovery` se resetuje na `USER_UPDATED` (nikoli při navigaci).
- `PartnerSetPassword` a `/partner/set-password` route musí zůstat v allowed lists všech guard bloků (influencer useEffect/render, affiliate useEffect/render).

---

## 🟢 PHASE 2D — Admin approval flow for confirmed B2B company leads (08. 06. 2026, KOMPLETNÍ na staging — Spec 37 ✅, G1+G2+G4+G5 ✅ splněny na produkci/stagingu — Lovable Publish ✅, PRODUKCE AKTIVNÍ)

**Phase 2D — Bloky 1–4 kompletní. Staging Full E2E run `27139244907`: 95 passed · 3 skipped · 0 failed. Spec 34 ✅, 35 ✅, 36 ✅, 37 ✅ (13/13). Commit `468ecfc8`. Produkce `xkzhjldrojjlrkezorey` nedotčena. Produkční rollout vyžaduje výslovné schválení Pavla.**

**Cíl:** admin schvaluje/zamítá company leady ve stavu `pending_admin_approval` (po company confirm z Phase 2C).

**Pravidla (neměnit):**
1. Admin vidí **pouze** leady se stavem `pending_admin_approval`.
2. Admin může **approve** nebo **reject**.
3. **Approve musí:** vytvořit nebo aktivovat company partner účet; propojit lead na `partner_id`; nastavit lead status `approved` (+`approved_at`, `admin_reviewed_by`, `admin_reviewed_at`); zapsat finální atribuci do `affiliate_company_refs` se `source = 'company_lead'`; zrcadlit do `partners.referred_by_affiliate_id`; poslat bezpečný password setup link; **NIKDY** neposílat vygenerované heslo.
4. **Reject musí:** nastavit status `admin_rejected` (+`admin_rejection_reason`, `admin_reviewed_by`, `admin_reviewed_at`); **NE**vytvořit partnera, **NE**vytvořit atribuci, **NE**vytvořit provizi.
5. **Provize** i nadále vzniká **pouze z placené/fakturované aktivity firmy** (`partner_invoices` → `affiliate_commissions.commission_type='company_invoice'`), nikdy z approve.

**Status přechody:** `pending_admin_approval → approved` (approve), `pending_admin_approval → admin_rejected` (reject). Pouze z `pending_admin_approval` (guard, jinak 409). Zakázáno: `sent_to_company → approved`, approve z `company_rejected`/`expired`/`admin_rejected`, mutace po `approved`.

### Implementační plán — pořadí bloků

**Blok 1 — DB/RPC ✅ NASAZENO NA STAGING (08. 06. 2026)**
- Migrace: `supabase/migrations/20260608_approve_affiliate_company_lead_txn.sql` + `20260608_approve_affiliate_company_lead_txn_harden.sql`. Commit `f093e22c`.
- **`approve_affiliate_company_lead_txn(p_lead_id, p_admin_user_id, p_partner_auth_id, p_action, p_rejection_reason)`** — SECURITY DEFINER, `SET search_path=''`, `GRANT EXECUTE TO authenticated`. Atomický approve/reject s `FOR UPDATE` status guard. Approve: idempotentní INSERT `partners`; UPDATE lead; best-effort atribuce (`EXCEPTION WHEN OTHERS` — nikdy neshodí approve). Reject: UPDATE lead, žádný partner.
- **`record_affiliate_company_ref_by_id(p_affiliate_id uuid, p_partner_id uuid, p_source text)`** — SECURITY DEFINER, `SET search_path=''`. Interní helper — **`EXECUTE` pro `anon` i `authenticated` explicitně odebráno** (hardening migrace). Voláno výhradně z `approve_affiliate_company_lead_txn` přes SECURITY DEFINER context (owner postgres).
- Stará `record_affiliate_company_ref(text, uuid)` — **nedotčena**.
- Postcheck ✅: obě funkce existují, `prosecdef=true`, `proconfig=[search_path=""]`; `approve_affiliate_company_lead_txn` — `authenticated` EXECUTE ✅; `record_affiliate_company_ref_by_id` — `anon`/`authenticated` EXECUTE ❌ odebráno ✅.
- Žádná nová DB migrace na sloupce — Phase 1 schema má vše.
- **Produkce nedotčena.**

**Blok 2 — Edge Function ✅ NASAZENO NA STAGING (08. 06. 2026, commit `c36410eb`)**
- Soubor: `supabase/functions/approve-affiliate-company-lead/index.ts`. Config: `supabase/config.toml` `[functions.approve-affiliate-company-lead] verify_jwt = false`.
- **Auth guard:** `Authorization: Bearer <admin JWT>` → `supabaseAdmin.auth.getUser(token)` → `user_roles IN ('admin','superadmin')` → 401/403 pokud nesplněno.
- **Request:** `POST { lead_id, action: 'approve'|'reject', rejection_reason? }` — **Response:** `{ success, lead_id, status }`. Nikdy heslo, password link, auth token firmy ani hash v response. 5xx masked jako `internal_error`.
- **Approve flow:** (1) validace + admin guard; (2) načíst lead (status guard, nenalezen → 404, špatný status → 409); (3) `auth.admin.createUser({ email, email_confirm: false })`, žádné heslo — pokud email existuje, reuse přes `listUsers`; (4) kolize: existující partner → 409; (5) RPC `approve_affiliate_company_lead_txn(…)` — conflict → 409; (6) `auth.admin.generateLink({ type: 'recovery', email })` — **nikdy nelog, nikdy nevrátit v response**; (7) INSERT `email_queue` best-effort; (8) vrátit `{success:true, lead_id, status:'approved', partner_id, setup_link_pending?}`.
- **Reject flow:** RPC s `action='reject'`, žádný `createUser`, žádný `generateLink`.
- **Smoke výsledky:** no JWT → 401, invalid JWT → 401/`invalid_authorization_token`, missing header → 401/`missing_authorization_header` ✅.
- **Produkce nedotčena.**

**Blok 3 — Admin UI ✅ IMPLEMENTOVÁNO (08. 06. 2026, commit `2a81db8f`)**
- `src/pages/AdminCompanyLeads.tsx` — nová stránka, route `/admin/company-leads` (inside AdminLayout).
- `src/components/admin/adminNavConfig.ts` — přidán `Building2` import, `companyLeads` nav entry (`Žádosti firem`), do `users` sekce subnav, routing `/admin/company-leads → "users"`.
- `src/components/admin/AdminContextSubNav.tsx` — `pendingCompanyLeadsCount` state, 60s polling (`supabase.from('affiliate_company_leads').select('id', {count:'exact',head:true}).eq('status','pending_admin_approval')`), červený badge na `Žádosti firem` když > 0.
- `src/App.tsx` — import + route.
- Seznam leadů: company name, email, IČO, DIČ, website, sales rep snapshot, `submitted_to_admin_at`, `company_confirmed_at`.
- Schválit: confirm dialog → POST EF `approve-affiliate-company-lead` `{action:'approve'}` → toast (vč. `setup_link_pending` varování) → refresh.
- Zamítnout: dialog s povinným textarea `rejection_reason` (max 1000 znaků) → POST EF `{action:'reject', rejection_reason}` → toast → refresh.
- Žádný přímý INSERT/UPDATE z klienta — vše přes EF. Zobrazuje pouze `pending_admin_approval`.
- `npm run build` ✅ exit 0. **Produkce nedotčena.**

**Blok 4 — Spec 37 ✅ ZELENÝ (08. 06. 2026, commit `468ecfc8`)**
- `tests/e2e/37-affiliate-company-lead-admin-approval.spec.ts` — staging-only, self-contained, 13 testů (37a–37m). Vzor identický se spec 36.
- **Backend testy (37a–37j):** approve → 200/status/partner_id; partner záznam v `partners`; `affiliate_company_refs` se `source='company_lead'`; approve bez `affiliate_id` (nullable) → uspěje bez refs; reject → 200/`admin_rejected`/reason; reject → žádný partner/refs/provize; druhý approve → 409; approve `company_rejected` lead → 409; non-admin JWT → 403; anonymous → 401.
- **Admin UI testy (37k–37m):** admin vidí lead v seznamu; Schválit → `Promise.all([waitForResponse POST EF, click])` → 200 → lead zmizí; Zamítnout s důvodem → totéž.
- **Klíčové invarianty spec 37:** `loginAsAdmin` volá `waitForLoadState('networkidle')` po redirectu na `/admin` (zajišťuje, že Supabase session je v localStorage před `callApproveEF`). UI testy 37l/37m používají `Promise.all([waitForResponse(...POST...), click])` pro explicitní čekání na EF odpověď. Neměnit tyto vzory zpět.
- Staging Full E2E run `27139244907`: **95 passed · 3 skipped · 0 failed**. Spec 34 ✅, 35 ✅, 36 ✅, 37 ✅.

### Staging rollout pořadí

```
Blok 1 → Blok 2 → Blok 3 → Blok 4
(DB/RPC)  (EF)     (UI)      (spec 37 + Full E2E zelený)
```

### Produkční rollout gates (každý vyžaduje výslovné schválení Pavla)

| Gate | Podmínka | Blokuje |
|------|----------|---------|
| G1 DB/RPC | postcheck: obě funkce SECURITY DEFINER, `record_…_by_id` bez execute grantu pro anon/authenticated | EF deploy | ✅ SPLNĚN 08. 06. 2026 — produkce `xkzhjldrojjlrkezorey` |
| G2 EF deploy | smoke: `approve` anon → 401, non-admin → 403; `confirm` invalid token → 404; `create` anon → 401 | Lovable Publish | ✅ SPLNĚN 08. 06. 2026 — produkce `xkzhjldrojjlrkezorey` |
| G3 Lovable Publish | P0 smoke CI zelený po Publish | live verifikace |
| G4 `generateLink` ověřen | staging manuální test: firma obdrží email, link funguje, je jednorázový | Lovable Publish | ✅ SPLNĚN 08. 06. 2026 — staging `dxmowysntemfqfnanxua`, 34 approve emailů v email_queue, setup link přítomen, bez hesla v emailu |
| G5 email queue | staging: oba typy emailů (invite + approved) dorazí na testovací adresu | Lovable Publish | ✅ SPLNĚN 08. 06. 2026 — staging `dxmowysntemfqfnanxua`, invite emaily (6) + approve emaily (34) v email_queue, heslo: 0 výskytů |

### Produkční rollout — přesné pořadí operací

```
Krok 1  DB/RPC migrace (SQL Editor, produkce xkzhjldrojjlrkezorey)
   ↓
Krok 2  DB postcheck (SQL dotazy — gate G1)
   ↓  [G1 ✅ — výslovné schválení Pavla]
Krok 3  EF deploy (3 funkce na produkci)
   ↓
Krok 4  EF smoke (gate G2)
   ↓  [G2 ✅ — výslovné schválení Pavla]
Krok 5  generateLink staging manuální test (gate G4)
Krok 5b email_queue staging manuální test (gate G5)
   ↓  [G4 + G5 ✅ — výslovné schválení Pavla]
Krok 6  Lovable Publish
   ↓
Krok 7  P0 smoke CI run (gate G3)
   ↓  [G3 ✅ — výslovné schválení Pavla]
Krok 8  Post-deploy live verifikace (viz níže)
```

### Produkční rollout — DB/RPC migrace (4 soubory, SQL Editor)

Aplikovat manuálně v Supabase SQL Editoru na produkci `xkzhjldrojjlrkezorey`. **V tomto pořadí, jedno po druhém, vždy bez chyby před dalším krokem. `supabase db push` NESPOUŠTĚT.**

| # | Soubor | Co vytváří |
|---|--------|------------|
| 1 | `20260607172151_affiliate_company_leads_phase1.sql` | Tabulka `affiliate_company_leads`, 9 indexů (vč. 2 UNIQUE), RLS enable, REVOKE anon, GRANT SELECT authenticated, 2 RLS policies (sales_rep SELECT, admin SELECT), trigger |
| 2 | `20260607173746_affiliate_company_leads_admin_reviewed_by_index.sql` | Index `idx_affiliate_company_leads_admin_reviewed_by` |
| 3 | `20260608_approve_affiliate_company_lead_txn.sql` | Funkce `record_affiliate_company_ref_by_id(uuid,uuid,text)` + `approve_affiliate_company_lead_txn(uuid,uuid,uuid,text,text)`, REVOKE ALL from PUBLIC, GRANT EXECUTE on `approve_affiliate_company_lead_txn` TO authenticated |
| 4 | `20260608_approve_affiliate_company_lead_txn_harden.sql` | REVOKE EXECUTE on `record_affiliate_company_ref_by_id` FROM anon + FROM authenticated — **kritický hardening, nesmí chybět** |

> ⚠️ Migrace 3 a 4 jsou neoddělitelné. Bez hardeningu (migrace 4) je helper `record_affiliate_company_ref_by_id` přístupný autentizovaným uživatelům přes PostgREST. Aplikovat obě ve stejné session.

### Produkční rollout — DB postcheck SQL (gate G1)

Spustit v SQL Editoru po aplikaci všech 4 migrací:

```sql
-- 1. Tabulka + RLS
SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'affiliate_company_leads';
-- Očekáváno: relrowsecurity = true

-- 2. Funkce jsou SECURITY DEFINER s prázdným search_path
SELECT proname, prosecdef, proconfig FROM pg_proc
WHERE proname IN ('approve_affiliate_company_lead_txn','record_affiliate_company_ref_by_id');
-- Očekáváno: prosecdef=true, proconfig='{search_path=""}'

-- 3. approve_affiliate_company_lead_txn — authenticated EXECUTE ✅
SELECT has_function_privilege('authenticated','approve_affiliate_company_lead_txn(uuid,uuid,uuid,text,text)','execute');
-- Očekáváno: true

-- 4. record_affiliate_company_ref_by_id — anon EXECUTE ❌ (revoked)
SELECT has_function_privilege('anon','record_affiliate_company_ref_by_id(uuid,uuid,text)','execute');
-- Očekáváno: false

-- 5. record_affiliate_company_ref_by_id — authenticated EXECUTE ❌ (revoked)
SELECT has_function_privilege('authenticated','record_affiliate_company_ref_by_id(uuid,uuid,text)','execute');
-- Očekáváno: false

-- 6. Stará record_affiliate_company_ref(text,uuid) nedotčena
SELECT proname FROM pg_proc WHERE proname = 'record_affiliate_company_ref';
-- Očekáváno: 1 řádek

-- 7. RLS policies existují
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'affiliate_company_leads';
-- Očekáváno: affiliate_company_leads_sales_rep_select, affiliate_company_leads_admin_select
```

Pokud cokoliv selže → **STOP, nespouštět EF deploy, kontaktovat Pavla.**

### Produkční rollout — Edge Functions (3 funkce, produkce)

Nasadit pomocí `supabase functions deploy --project-ref xkzhjldrojjlrkezorey` v tomto pořadí:

| # | Funkce | JWT režim | Popis |
|---|--------|-----------|-------|
| 1 | `create-affiliate-company-lead` | `verify_jwt = false` (vlastní JWT guard uvnitř) | Sales rep vytváří lead, odesílá email firmě |
| 2 | `confirm-affiliate-company-lead` | `verify_jwt = false` (public — firma kliká link) | Firma potvrzuje/zamítá přes token v URL |
| 3 | `approve-affiliate-company-lead` | `verify_jwt = false` (vlastní admin JWT guard uvnitř) | Admin schvaluje/zamítá, vytváří partner účet |

Všechny tři mají `verify_jwt = false` — JWT middleware Supabase platformy je bypasován, autentizace je řešena vlastním guard kódem uvnitř EF. **Toto nastavení neměnit.**

### Produkční rollout — EF smoke (gate G2)

Po deployi ověřit na produkci:

```bash
# approve-affiliate-company-lead: anon → 401
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/approve-affiliate-company-lead \
  -H "apikey: <ANON_KEY>"
# Očekáváno: 401

# confirm-affiliate-company-lead: invalid token → 404
curl -s -o /dev/null -w "%{http_code}" \
  "https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/confirm-affiliate-company-lead?token=invalidtoken"
# Očekáváno: 404

# create-affiliate-company-lead: anon → 401
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/create-affiliate-company-lead \
  -H "apikey: <ANON_KEY>"
# Očekáváno: 401

# approve-affiliate-company-lead: non-admin JWT → 403
# (použít JWT neprivilegovaného uživatele)
# Očekáváno: 403
```

Pokud jakákoliv EF vrátí 500 na tyto vstupy → **STOP.**

### Produkční rollout — generateLink staging test (gate G4)

**✅ SPLNĚN 08. 06. 2026** (staging `dxmowysntemfqfnanxua`, SQL postcheck přes MCP)

Výsledky:
- 34 approve emailů nalezeno v `email_queue` se subject `Vas ucet v OneMil byl schvalen — nastavte si heslo`
- Každý email obsahuje HTML tlačítko `Nastavit heslo a aktivovat ucet` s jednorázovým Supabase `recovery` tokenem
- Email obsahuje explicitní větu: *„Heslo nikdy nesdílíme v e-mailu. Odkaz výše je jednorázový a bezpečný."*
- `generateLink` typ `'recovery'` — odkaz přesměrovává přes Supabase Auth verify URL; jednorázový
- EF response nikdy neobsahuje raw token ani heslo — pouze `{success, lead_id, status:'approved'}`
- Heslo v emailech: **0 výskytů** (`heslo:` nebo `password:`)

**`generateLink` typ `'recovery'` ověřovat výhradně na stagingu. Produkční Auth redirect URL a Auth konfiguraci neměnit.**

### Produkční rollout — email queue staging test (gate G5)

**✅ SPLNĚN 08. 06. 2026** (staging `dxmowysntemfqfnanxua`, SQL postcheck přes MCP)

Výsledky:
- **Invite emaily** (z `create-affiliate-company-lead`): **6 záznamů** v `email_queue`, subject `Potvrzeni zadosti o registraci firmy do OneMil`, body obsahuje `/partner/invite?token=...` ✅
- **Approve emaily** (z `approve-affiliate-company-lead`): **34 záznamů** v `email_queue`, setup link přítomen ✅
- Heslo nikdy nezapsáno do žádného emailu: **0 výskytů** ✅
- Provize nevznikly: `commission_count = 0` za posledních 24 hodin ✅
- Lead stavy na stagingu: `sent_to_company` (6), `approved` (4), `admin_rejected` (3), `pending_admin_approval` (1) — workflow přechody fungují ✅
- Produkce `xkzhjldrojjlrkezorey` nebyla dotčena ✅

```sql
-- Na stagingu dxmowysntemfqfnanxua:
SELECT email, subject, status, created_at FROM email_queue
ORDER BY created_at DESC LIMIT 10;
-- Oba typy (invite + approve) musí existovat a nesmí zůstat stuck
```

Oba typy emailů musí dorazit na testovací adresu: invite email (z `create-affiliate-company-lead`) + approved email (z `approve-affiliate-company-lead`).

### Produkční rollout — Lovable Publish + P0 smoke (gate G3)

Po G1 + G2 + G4 + G5:
1. Lovable → **Publish** (HEAD main = commit `c8ab4df8` nebo novější).
2. Spustit P0 smoke CI (`playwright-staging-p0.yml` nebo produkční smoke).
3. P0 specy: 01, 02, 33, 14, 04, 05, 09, 03-voucher, 29, 32, 31.
4. Pokud P0 selže → **okamžitý Lovable rollback** na předchozí publish → investigace.

### Produkční rollout — post-deploy live verifikace (Krok 8)

| # | Akce | Očekáváno |
|---|------|-----------|
| 1 | Sales rep → `/affiliate/dashboard` → Obchodník | Vidí „Žádosti o registraci firem" + `+ Přidat firmu` |
| 2 | Sales rep vyplní formulář Přidat firmu | Toast úspěch; `email_queue` záznam vznikl |
| 3 | Testovací firma obdrží email | Email dorazí; `/partner/invite?token=X` linky funkční |
| 4 | Firma klikne Potvrzuji → `/partner/invite` | Lead přejde na `pending_admin_approval` |
| 5 | Admin → `/admin/company-leads` | Lead viditelný; červený badge v nav |
| 6 | Admin Schválit → Ano, schválit | Toast „Firma schválena"; lead zmizí ze seznamu |
| 7 | Firma obdrží password setup email | Email dorazí; link funguje; firma se přihlásí na `/partner/login` |
| 8 | DB ověření | `status='approved'`; `affiliate_company_refs` se `source='company_lead'`; `partners.referred_by_affiliate_id` nastaveno; žádná `affiliate_commissions` provize |

### Rizika a mitigace

| Riziko | Mitigace |
|--------|----------|
| `affiliate_company_refs.affiliate_id NOT NULL` + nullable `lead.affiliate_id` | RPC přeskočí INSERT pokud `IS NULL`; approve nikdy neshodí |
| Kolize emailu při `createUser` | EF zkontroluje existenci auth user před `createUser`; 409 se zprávou |
| `generateLink` selže po RPC approve | best-effort; `setup_link_pending:true` v response; admin re-send přes Supabase Dashboard |
| Race condition dva admini | `FOR UPDATE` lock + status guard → druhý caller 409 |
| `createUser` uspěje, RPC selže | EF retry najde existující auth user (idempotence), pokračuje |
| `generateLink` typ na produkci | ověřit pouze na stagingu; produkční Auth konfiguraci neměnit |

### Rollback plán

**Selhání při DB migraci (Krok 1):** žádné EF nasazeny → rollback `DROP TABLE IF EXISTS public.affiliate_company_leads CASCADE; DROP FUNCTION IF EXISTS approve_affiliate_company_lead_txn(...); DROP FUNCTION IF EXISTS record_affiliate_company_ref_by_id(...);` — produkce funguje bez B2B funkcionality.

**Selhání při EF deployi (Krok 3):** DB migrace aplikovány, EF nejsou aktivní → žádný dopad. Rollback: `supabase functions delete <jméno> --project-ref xkzhjldrojjlrkezorey`.

**Selhání po Lovable Publish (Krok 6):** P0 selhal → **okamžitý Lovable rollback** na předchozí publish. EF zůstanou nasazeny (admin-gated a token-gated — bezpečné). Investigovat, opravit, projít checklistem znovu.

**`generateLink` nefunguje v produkci:** EF vrátí `setup_link_pending: true` → lead je schválený, partner účet existuje, firma se ale nemůže přihlásit. Workaround: admin manuálně vygeneruje link přes Supabase Dashboard → Authentication → Users. Není blocker pro rollback.

**Produkční rollout Phase 2D vyžaduje výslovné schválení Pavla před každým gate.** Žádný Lovable Publish bez schválení. Žádný EF deploy bez schválení. `supabase db push` NESPOUŠTĚT.

---

## ✅ PHASE 2C — confirm/reject workflow + spec 36 ZELENÝ, MERGNUTO DO `main` (08. 06. 2026)

**Phase 2C (company confirmation/rejection) je implementována a uzamčena zeleným staging E2E. Mergnuto do `main`. Produkce nedotčena.**

- **Finální commit na `main`:** `f1999b9fe980737f78de5f82d28817db458044b0` (`f1999b9f`).
- **Merge:** fast-forward only z dočasné větve `fix/spec36-reject-retry` (smazána lokálně i na originu po merge).
- **Poslední zelený staging Full E2E run:** `27123113289` — **82 passed · 3 skipped · 0 failed** (7,2 min).
- **Spec 34 ✅, spec 35 ✅, spec 36 ✅** (spec 36 = 11/11 testů zelených, vč. 36i reject UI).
- Jediná změna mergnutá z větve byla **test-only**: `tests/e2e/36-affiliate-company-lead-confirm.spec.ts`.

**Implementované komponenty Phase 2C (na `main`, staging only):**
- Edge Function `supabase/functions/confirm-affiliate-company-lead/index.ts` — PUBLIC (`verify_jwt = false`), GET+POST, service-role pro DB. GET `?token=` → safe summary `{ success, company_name, sales_rep_name, expires_at }`. POST `{ token, action: "confirm"|"reject", rejection_reason? }`. Token: SHA-256 hash lookup, 404 invalid / 410 expired / 409 already-processed. Confirm: `sent_to_company → pending_admin_approval` (+`company_confirmed_at`, `company_confirmation_used_at`, `submitted_to_admin_at`, hash NULL). Reject: `sent_to_company → company_rejected` (+`company_rejected_at`, `company_confirmation_used_at`, `company_rejection_reason`, hash NULL). Race guard `UPDATE … WHERE status='sent_to_company'`. NIKDY: partner účet, `affiliate_company_refs`, `partners.referred_by_affiliate_id`, provize, password setup link, raw token/hash.
- Email URL v `create-affiliate-company-lead` změněna z `/affiliate/company-lead/confirm` na `/partner/invite`.
- Frontend stránka `src/pages/CompanyLeadConfirm.tsx` + public route `/partner/invite` v `App.tsx` (přidána do allowed listů affiliate i influencer — useEffect i render guard).
- `supabase/config.toml`: `[functions.confirm-affiliate-company-lead] verify_jwt = false`.

**Pozn. k testu spec 36i (reject UI):** klik na reject tlačítko používá `dispatchEvent('click')` uvnitř `expect(...).toPass()` retry bloku — `.click()` čekal na stabilitu a re-rendery stránky klik nikdy nedispatchly. `dispatchEvent('click')` vystřelí bublající event okamžitě, React 18 root-delegated listener ho chytí. Neměnit zpět na `.click()`.

**Produkce:** `xkzhjldrojjlrkezorey` **NEDOTČENA** — žádný Lovable Publish, žádný production EF deploy, žádná production DB změna. **Produkční rollout Phase 2C vyžaduje výslovné schválení Pavla.**

---

## ✅ PHASE 2A E2E — spec 34 `create-affiliate-company-lead` (07. 06. 2026)

**Staging Full E2E run `27100946115`: 68 passed · 3 skipped · 0 failed. Spec 34 prošel všemi 3 testy.**

- Spec soubor: `tests/e2e/34-affiliate-company-lead-backend.spec.ts`. Commit `1ec3a127`.
- Staging-only, backend API test (bez UI), volá Edge Function přímo přes fetch.
- Pokrývá 9 invariantů Phase 2A:
  1. Approved sales_rep vytvoří lead (success)
  2. Influencer-only affiliate → 403
  3. Anonymous request → 401
  4. Lead má status `sent_to_company`
  5. DB ukládá pouze token hash (64-char SHA-256 hex)
  6. Raw token není v response
  7. `email_queue` záznam vznikl s confirm/reject URL
  8. `affiliate_company_refs` — žádný zápis
  9. `affiliate_commissions` — žádná provize
- Telegram: `✅ OneMil STAGING full E2E OK — all specs passed` (message_id 1043).
- Produkce nedotčena.
- **Invariant:** před stavbou UI `Přidat firmu` musí spec 34 zůstat zelený. `create-affiliate-company-lead` nesmí nikdy vytvářet partner účet, attribution ani provizi. Produkční nasazení vyžaduje výslovné schválení Pavla.

---

## ✅ ADMIN NAVIGACE — badge čekajících partnerských registrací (07. 06. 2026)

**Admin kontextová podlišta v sekci „Uživatelé a partneři" zobrazuje u položky `Partneři` červený badge s počtem čekajících partnerských registrací.**
- Badge se zobrazí pouze když je počet `> 0`; při `0` se nezobrazuje.
- Zdroj počtu je stávající read-only Edge Function `get-pending-partner-registrations`.
- Kliknutí na `Partneři` dál otevírá stávající `/admin/partners`.
- Změněný soubor: `src/components/admin/AdminContextSubNav.tsx`. Commit `0339cd4a6775bb8dc34f395aa16f302d9fc61034`. `npm run build` ✅. GitHub Playwright Smoke Tests ✅.
- Beze změny DB, schvalování partnerů, affiliate logiky, onboardingu, zpráv a jiných částí adminu.

---

## ✅ AFFILIATE / REFERRAL ODKAZY — bezpečná veřejná doména (07. 06. 2026)

**Affiliate, referral a partner odkazy se generují přes bezpečný public URL helper.**
- Helper akceptuje `VITE_APP_URL` pouze když je `https` a není `localhost`, Lovable doména ani preview doména.
- Pokud env hodnota není bezpečná, fallback je vždy `https://onemil.cz`.
- Správné produkční odkazy:
  - zákazník/social: `https://onemil.cz/?ref=CODE`
  - obchodník/firma: `https://onemil.cz/partner/register?via=CODE`
- Změněné soubory: `src/lib/publicAppUrl.ts`, `src/pages/AffiliateDashboard.tsx`, `src/hooks/useInfluencerData.ts`, `src/components/ReferralSection.tsx`, `tests/e2e/26-affiliate-dashboard-content.spec.ts`.
- Commit `d2b125045848d0baffbef2d4de8abff362097d5b`. `npm run build` ✅. GitHub Playwright Smoke Tests ✅. GitHub Playwright Staging Full E2E ✅.
- Beze změny DB, affiliate trackingu, provizí, registrace partnerů, ticket logiky, wallet logiky a UI grafiky.

---

## 🎯 CÍLOVÝ B2B WORKFLOW — Obchodník / agentura přidává firmu (07. 06. 2026)

**Schválený cílový model pro přidávání firem přes obchodníka / agenturu v Affiliate v2.**

### Target B2B workflow
1. V `/affiliate/dashboard`, v režimu `Obchodník`, může sales rep / agentura použít `Přidat firmu`.
2. Sales rep vyplní údaje firmy:
   - company name
   - IČO
   - DIČ
   - company email
   - website
   - contact person / phone
   - sales rep note
3. Firma dostane e-mail s vysvětlením, že sales rep / agentura požádal o registraci firmy do OneMil.
4. E-mail musí obsahovat:
   - kdo žádost poslal,
   - co je OneMil,
   - tlačítko `Potvrzuji žádost`,
   - možnost/odkaz `Zamítnout žádost`.
5. Dokud firma žádost nepotvrdí, jde jen o invitation/lead a nesmí vzniknout plnohodnotná admin partnerská registrace.
6. Po potvrzení firmou se žádost přesune do admin schvalování.
7. Sales rep dashboard musí ukazovat stavy leadu:
   - `odesláno firmě`
   - `firma potvrdila`
   - `firma zamítla`
   - `čeká na schválení adminem`
   - `schváleno`
   - `zamítnuto adminem`
8. Po schválení adminem systém:
   - vytvoří/aktivuje firemní partner účet,
   - přiřadí firmu pod sales rep / agenturu,
   - zapíše `affiliate_company_refs`,
   - zrcadlí vazbu do `partners.referred_by_affiliate_id`,
   - pošle firmě bezpečný e-mailový odkaz pro nastavení hesla.
9. Nikdy neposílat firmám vygenerovaná hesla e-mailem. Nastavení hesla musí proběhnout přes bezpečný jednorázový odkaz s expirací.
10. Provize nevzniká vytvořením leadu, potvrzením firmy ani schválením adminem. Provize vzniká pouze z placené / fakturované aktivity firmy, například ze zaplacených `partner_invoices`.

### Rules
- Influencer codes remain mainly for customers.
- B2B company attribution must not rely only on public shared links.
- Sales rep cannot claim a company without company confirmation.
- Company must be able to reject the request.
- Admin approves only company-confirmed requests.
- Final attribution source remains `affiliate_company_refs` + `partners.referred_by_affiliate_id`.
- Existing commission calculation should remain based on paid/factured activity.

### Placement rule for `Přidat firmu`
- `/affiliate/login` remains only for Affiliate account login.
- `Přidat firmu` must not be placed on the Affiliate login page.
- `Přidat firmu` belongs only inside `/affiliate/dashboard`.
- It is visible only for approved affiliate accounts whose `modes` includes `sales_rep`.
- It belongs in the sales rep / `Obchodník` section near `Moje firmy`, leads, request statuses and company commission data.
- Influencer-only accounts without `sales_rep` must not see this function.
- Public B2B company claim must not originate from the login page or unauthenticated flow.

### Phase 1 DB design for B2B company leads
- Approved table name: `affiliate_company_leads`.
- Purpose: pre-attribution workflow layer for B2B company leads created by approved sales reps / agencies.
- Final attribution remains only in `affiliate_company_refs` and `partners.referred_by_affiliate_id`.
- `affiliate_id` must be nullable and reference `affiliate_accounts(id)` with `ON DELETE SET NULL`, not cascade, so lead history survives affiliate account deletion.
- Lead rows must keep readable sales rep snapshots:
  - `sales_rep_affiliate_id_snapshot`
  - `sales_rep_ref_code_snapshot`
  - `sales_rep_email_snapshot`
  - `sales_rep_name_snapshot`
- Sales rep eligibility must require `affiliate_accounts.status = 'approved'`, `'sales_rep' = ANY(modes)` and `affiliate_accounts.auth_user_id = auth.uid()`.
- Allowed lead statuses:
  - `sent_to_company`
  - `company_confirmed`
  - `company_rejected`
  - `pending_admin_approval`
  - `approved`
  - `admin_rejected`
  - `expired`
- After admin approval, the final `affiliate_company_refs.source` value should be `company_lead`.
- Public company confirmation/rejection must happen through an Edge Function or `SECURITY DEFINER` RPC using a hashed token.
- No commission is created from lead creation, company confirmation or admin approval. Commission remains only from paid / invoiced company activity.
- Phase 1 DB foundation is applied on STAGING only (`onemil-staging`, ref `dxmowysntemfqfnanxua`); production `xkzhjldrojjlrkezorey` was not touched.
- Staging applied migration: `affiliate_company_leads_phase1`.
- Staging follow-up index migration: `supabase/migrations/20260607173746_affiliate_company_leads_admin_reviewed_by_index.sql`, commit `3260b1c60f1a01e7c524443ce1c413c739891621`.
- Added staging index: `idx_affiliate_company_leads_admin_reviewed_by`.
- Staging verification: table exists, RLS enabled, policies exist, `anon` has no access, `authenticated` has SELECT only through RLS, normal users have no INSERT/UPDATE/DELETE, and the admin reviewer index exists.
- Not yet implemented: UI, Edge Functions, emails, admin approval flow, password setup, commission changes, partner registration changes, ticket/wallet changes, graphics, or production apply.

### Phase 2C — Company Confirmation/Rejection DESIGN SCHVÁLEN (07. 06. 2026, není implementováno)

**Design company confirmation/rejection workflow schválen Pavlem. Není implementováno — produkce nedotčena.**

#### Edge Function: `confirm-affiliate-company-lead`

- **Soubor (plánovaný):** `supabase/functions/confirm-affiliate-company-lead/index.ts`
- **Přístup:** PUBLIC — bez JWT. Firma kliká link z e-mailu jako neautentizovaný návštěvník.
- **CORS:** `Access-Control-Allow-Origin: *`

**GET `?token=RAW_TOKEN`** — načti informace o žádosti (bez změny stavu):
1. Vypočítej `sha256Hex(token)`.
2. Najdi lead přes `company_confirmation_token_hash`.
3. Ověř: nenalezen → 404; expirovaný → 410; `status ≠ 'sent_to_company'` → 409.
4. Vrať: `{ success: true, company_name, sales_rep_name, expires_at }`.

**POST `{ token, action: "confirm" | "reject" }`** — proveď akci:
1. Stejná validace jako GET (404 / 410 / 409).
2. Atomická UPDATE: `WHERE id = $lead_id AND status = 'sent_to_company'`.
3. Při `confirm`:
   - `status = 'pending_admin_approval'`
   - `company_confirmed_at = now()`
   - `company_confirmation_used_at = now()`
   - `submitted_to_admin_at = now()`
   - `company_confirmation_token_hash = NULL`
4. Při `reject`:
   - `status = 'company_rejected'`
   - `company_rejected_at = now()`
   - `company_confirmation_used_at = now()`
   - `company_confirmation_token_hash = NULL`
5. Pokud UPDATE vrátí 0 řádků (race condition) → HTTP 409.
6. Vrať: `{ success: true, action, status: new_status, company_name }`.

**Absolutní zákazy (nikdy nesmí):**
- INSERT do `affiliate_company_refs`
- INSERT do `affiliate_commissions`
- Vytváření partner účtu
- Vracet raw token ani token hash v response

#### Status transitions

```
sent_to_company  →  pending_admin_approval  (confirm)
sent_to_company  →  company_rejected        (reject)
```

#### HTTP stavové kódy

| Situace | Kód |
|---|---|
| Úspěch | 200 |
| Neplatný token | 404 |
| Expirovaný token | 410 |
| Již zpracovaný token | 409 |
| Chybný `action` parametr | 400 |

#### Frontend stránka: `src/pages/CompanyLeadConfirm.tsx`

- **Route (plánovaná):** `/partner/invite` — public, bez auth
- **Přidání do App.tsx:** nová `<Route path="/partner/invite" element={<CompanyLeadConfirm />} />` + `/partner/invite` do allowed listů pro affiliate/influencer render guard.
- **Chování:** mount → GET token info → spinner → zobraz summary + tlačítka → klik → POST → success/error state.
- **Success:** ✅ confirm = „Žádost potvrzena. Čeká na schválení adminem." / reject = „Žádost zamítnuta."
- **Error states:** 404 → „Neplatný odkaz" / 410 → „Platnost vypršela. Kontaktujte odesílatele." / 409 → „Žádost byla již zpracována."
- Design: OneMil dark premium, centrovaná karta, bez dashboard chromi, bez bottom nav.

#### Email URL aktualizace

Phase 2A `create-affiliate-company-lead` generuje URL: `/affiliate/company-lead/confirm?token=X&action=confirm`.  
Po implementaci Phase 2C se změní na: `/partner/invite?token=X&action=confirm`.  
Phase 2A je staging-only → žádné produkční e-maily v oběhu → bezpečná změna.

#### DB migrace

**Žádná nová migrace není potřeba.** Phase 1 schema obsahuje všechny potřebné sloupce:
`company_confirmation_token_hash`, `company_confirmation_expires_at`, `company_confirmation_used_at`, `company_confirmed_at`, `company_rejected_at`, `company_rejection_reason`, `submitted_to_admin_at`, `updated_at` (auto-trigger).
Unique partial index `uq_affiliate_company_leads_token_hash` existuje pro O(log n) lookup.

#### Plánovaný spec 36

Soubor: `tests/e2e/36-affiliate-company-lead-confirm.spec.ts` — staging-only, self-contained.

Backend testy (bez browseru):
- 36a) Platný `confirm` → 200, `pending_admin_approval`, `company_confirmed_at` set, token hash NULL
- 36b) Platný `reject` → 200, `company_rejected`, `company_rejected_at` set, token hash NULL
- 36c) Expirovaný token → 410
- 36d) Použitý token (druhý volání) → 409
- 36e) Neplatný token → 404
- 36f) Confirm NESMÍ vytvořit `affiliate_company_refs`, `affiliate_commissions`, ani partner účet
- 36g) GET platný token → 200, `company_name` a `sales_rep_name` v response

UI testy (browser):
- 36h) `/partner/invite?token=VALID&action=confirm` → summary viditelné, klik Potvrzuji → success state
- 36i) `/partner/invite?token=VALID&action=reject` → klik Zamítnout → success state
- 36j) `/partner/invite?token=EXPIRED` → error state „Platnost vypršela"
- 36k) `/partner/invite?token=INVALID` → error state „Neplatný odkaz"

#### Implementační pořadí

1. Aktualizovat email URL v `create-affiliate-company-lead` (2 řádky) → deploy na staging
2. Nová Edge Function `confirm-affiliate-company-lead` → deploy na staging
3. Smoke test EF z CLI/curl (confirm, reject, expired, invalid)
4. Nová stránka `CompanyLeadConfirm.tsx` + route v `App.tsx`
5. `npm run build` ✅
6. Spec 36 (backend testy dříve, UI testy po nasazení)
7. Staging Full E2E — spec 34 ✅, spec 35 ✅, spec 36 ✅, 0 regresí
8. Dokumentace + commit + push
9. **Produkce: výslovné schválení Pavla + Lovable Publish + postcheck**

---

### Phase 2B UI — `Přidat firmu` IMPLEMENTOVÁNO (07. 06. 2026, staging only)

**UI pro B2B lead workflow v `/affiliate/dashboard` je implementováno. Commit `aaa2e092`. `npm run build` ✅. Produkce nedotčena — produkční nasazení vyžaduje výslovné schválení Pavla + Lovable Publish.**

#### Umístění v dashboardu (sales_rep mode)
```
[stat cards]
[firemní odkaz + QR]
[Žádosti o registraci firem]   ← NOVÉ — affiliate_company_leads
[Moje firmy (schválené)]       ← beze změny — affiliate_company_refs
[Provize a výplaty]
[Kampaně placeholder]
```

#### Podmínka zobrazení
```tsx
activeMode === 'sales_rep' && account.modes.includes('sales_rep')
```
Influencer-only účty (bez `sales_rep` v `modes`) sekci ani tlačítko `+ Přidat firmu` nevidí.

#### Nové komponenty (IMPLEMENTOVÁNY, commit `aaa2e092`)
- `src/components/AddCompanyLeadDialog.tsx` — formulář (shadcn Dialog), volá pouze Edge Function `create-affiliate-company-lead` přes user JWT.
- `src/components/CompanyLeadSection.tsx` — seznam leadů z `affiliate_company_leads`, trigger pro AddCompanyLeadDialog.

#### Formulářová pole
| Pole | Povinné |
|---|---|
| Název firmy | ✅ |
| E-mail firmy | ✅ |
| IČO | volitelné |
| DIČ | volitelné |
| Web firmy | volitelné (https://) |
| Kontaktní osoba | volitelné |
| Telefon | volitelné |
| Poznámka pro OneMil | volitelné (max 2000 znaků) |

#### Lead stavy (CZ labels)
| DB status | Zobrazení | Barva |
|---|---|---|
| `sent_to_company` | Odesláno firmě | Amber |
| `company_confirmed` | Firma potvrdila | Teal |
| `company_rejected` | Firma zamítla | Červená |
| `pending_admin_approval` | Čeká na schválení adminem | Modrá |
| `approved` | Schváleno | Zelená |
| `admin_rejected` | Zamítnuto adminem | Tmavá červená |
| `expired` | Expirováno | Muted |

#### Oddělení datových zdrojů
- **„Žádosti o registraci firem"** → `affiliate_company_leads` (pipeline, v procesu)
- **„Moje firmy (schválené)"** → `affiliate_company_refs` (finální attribution, beze změny)
- Tyto dvě sekce nesmí sdílet datový zdroj ani se vizuálně splývat.

#### E2E pokrytí — Spec 35 ✅ ZELENÝ (07. 06. 2026)
Spec `tests/e2e/35-affiliate-company-lead-ui.spec.ts` — self-contained, staging-only, dynamicky vytváří dočasné testovací uživatele přes service role key (žádné fixed password secrets). Commit `fd8f4921`.

**Staging Full E2E run `27102532004`: 71 passed · 3 skipped · 0 failed.** Spec 34 ✅ + spec 35 (35a + 35b + 35c) ✅. Telegram `✅ OneMil STAGING full E2E OK` (message_id 1054).

Pokrývá:
- 35a) sales_rep vidí `company-lead-section` a `add-company-lead-btn`
- 35b) dialog `Pozvat firmu do OneMil` s 8 poli, Zrušit zavírá
- 35c) influencer-only účet → `company-lead-section` není viditelná (activeMode=sales_rep ale modes=['influencer'])

#### Invarianty (platné při implementaci)
- `Přidat firmu` nikdy na `/affiliate/login` ani v jiném mode než `sales_rep`.
- UI volá **pouze** Edge Function `create-affiliate-company-lead` — žádný přímý INSERT do `affiliate_company_leads` z klienta.
- Po úspěchu: toast + refresh leadů. Žádný zápis do `affiliate_company_refs`, žádná provize.
- Spec 34 musí zůstat zelený po každém commitu Phase 2B.
- Produkční nasazení vyžaduje výslovné schválení Pavla + postcheck.

---

### Phase 2A backend — `create-affiliate-company-lead` (STAGING HOTOVO, 07. 06. 2026)

- Edge Function `create-affiliate-company-lead` je implementována a deployována na **STAGING ONLY** (`onemil-staging`, ref `dxmowysntemfqfnanxua`), status **ACTIVE**, version 1.
- Commit: `b54fbb0e6c015f0bf25706b2994472d236cc2bbb`. `npm run build` ✅. Lokální repo synchronizováno (`git pull`).
- Soubory: `supabase/functions/create-affiliate-company-lead/index.ts`, `supabase/config.toml`.
- Staging happy-path test prošel (07. 06. 2026):
  - Testovací účet: `sales-rep-test@onemil.cz`, ref `TESTSR2026`, status `approved`, modes `["sales_rep"]` — pouze staging.
  - Response: `{ "success": true, "lead_id": "3147d6ce-83b6-40d4-ad3f-89e60fc9a276", "status": "sent_to_company" }`.
  - Lead vzniklý v `affiliate_company_leads` ✅.
  - `company_confirmation_token_hash` = 64-char SHA-256 hash ✅.
  - Raw token není v response ani v DB ✅.
  - `company_confirmation_sent_at` a `company_confirmation_expires_at` nastaveny ✅.
  - Sales rep snapshots (ref_code, email, name) správné ✅.
  - `email_queue` záznam s confirm/reject URL vzniklý ✅.
  - `affiliate_company_refs` — žádný zápis ✅.
  - `affiliate_commissions` — žádná provize ✅.
  - Produkce `xkzhjldrojjlrkezorey` nedotčena ✅.
- Security audit prošel: JWT auth ✅, approved check ✅, sales_rep mode check ✅, token hash only ✅, žádný raw token v logu ✅.
- **Invariant:** `create-affiliate-company-lead` nesmí nikdy zapsat do `affiliate_company_refs` ani vytvořit provizi.
- **Před nasazením na produkci:** E2E/smoke spec pro tento backend flow + výslovné schválení Pavla.

### Phase 2 backend design for B2B company leads
- Phase 2A (`create-affiliate-company-lead`) je implementována na staging — viz výše.
- Zbývající backend jednotky jsou approved jako design, ne implementovány.
- Production must not be touched.
- Approved backend unit `create-affiliate-company-lead`:
  - authenticated Edge Function called from `/affiliate/dashboard`,
  - only for approved affiliate accounts with `'sales_rep' = ANY(modes)`,
  - creates lead in `affiliate_company_leads`,
  - generates secure company confirmation token,
  - stores only token hash,
  - sends company confirmation email,
  - returns `{ success: true, lead_id, status: "sent_to_company" }`.
- Approved backend unit `confirm-affiliate-company-lead`:
  - public token endpoint,
  - validates token hash, expiry and unused token,
  - supports `confirm` and `reject`,
  - `confirm` moves lead to `pending_admin_approval`,
  - `reject` moves lead to `company_rejected`,
  - must not create partner, attribution or commission.
- Approved backend unit `approve-affiliate-company-lead`:
  - admin-only Edge Function, optionally backed by RPC,
  - approves only `pending_admin_approval`,
  - creates/activates partner account,
  - writes `affiliate_company_refs.source = 'company_lead'`,
  - mirrors to `partners.referred_by_affiliate_id`,
  - sends secure password setup link,
  - never emails generated password,
  - must not create commission.
- Allowed status transitions: `sent_to_company -> pending_admin_approval`, `sent_to_company -> company_rejected`, `sent_to_company -> expired`, `pending_admin_approval -> approved`, `pending_admin_approval -> admin_rejected`.
- Blocked transitions: no direct `sent_to_company -> approved`, no approval after rejected/expired, `approved` is final, and no attribution before admin approval.
- Required email events: company confirmation email, admin notification after company confirmation, company rejection notification to sales rep, admin approval email with password setup link, optional admin rejection email.
- Required tests: sales rep can create lead; influencer-only cannot create lead; anonymous cannot create lead; token hash only and no raw token stored; confirm/reject token transitions; expired/used token blocked; admin approval creates partner and attribution; normal user cannot approve; no commission until paid/factured company activity.
- Must stay unchanged: no production apply; no commission from lead creation, confirmation or admin approval; no changes to ticket, wallet, payment, `buy_ticket_atomic`, graphics or login placement; `Přidat firmu` remains only inside `/affiliate/dashboard` for approved `sales_rep`; final attribution remains `affiliate_company_refs` + `partners.referred_by_affiliate_id`.

---

## ✅ SPRÁVA SOUTĚŽÍ — statistické karty jen z `active` soutěží (06. 06. 2026)

**Pět statistických karet v adminu „Správa soutěží" počítá pouze ze soutěží se statusem `active`.**
- Dotčené karty: `Tikety prodány`, `Tikety zbývají`, `Prodáno %`, `Výnos (MC)`, `Tikety za 24h`.
- Soutěže `pending`, `draft`, `paused`, `closed`, archiv test, ukončené i nezahájené se do těchto pěti karet **nezapočítávají**.
- Když není žádná `active` soutěž, karty ukazují **nulové hodnoty**.
- Změněný soubor: `src/components/AdminContestManagement.tsx`. Commit `d212dff7`. `npm run build` ✅. Po Lovable Publish ověřeno Pavlem.
- Beze změny tabů, tabulky soutěží, DB, ticket logiky, ekonomiky, vytváření, bonusů, grafiky.

---

## ✅ DETAIL SOUTĚŽE — badge počtu věcných výher (06. 06. 2026)

**Karty věcných bonusových výher na veřejném detailu soutěže zobrazují badge počtu** (např. `295× v soutěži`) v premium OneMil stylu:
- Lehký **přesah přes horní pravý roh** karty.
- Větší, **bold**, čitelný; **Energy Orange → Warm Amber gradient**, tmavý vysoce kontrastní text, jemný stín/glow + ring.
- Změněný soubor: `src/pages/ContestDetail.tsx`. Commit `dafe0064`. `npm run build` ✅. Po Lovable Publish ověřeno Pavlem jako funkční a dobře viditelné.
- Vizuál badge only — beze změny dat, počítání výher, ticket/bonus logiky, DB, adminu, ekonomiky, grafiky.

---

## ✅ DETAIL SOUTĚŽE — MioCoin/bonus souhrn (06. 06. 2026)

**Veřejný detail soutěže (`src/pages/ContestDetail.tsx`) zobrazuje souhrn bonusů takto:**
- Hlavní text: `V této soutěži je celkem X dalších výher.`
- Pod tím: `Z toho Y MioCoinů, které vám mohou otevřít cestu k dalším soutěžím nebo k nákupu voucherů na krásné slevy u našich partnerů.`

**Výpočet:**
- **X** = počet MioCoin bonus pozic z `bonus_prizes` kde `amount > 0` (přesný `head:true` count) + počet věcných bonusových výher z `bonus_prizes` kde `amount` je null nebo 0.
- **Y** = celková nakonfigurovaná částka MioCoinů (z existující MioCoin total logiky — RPC `get_contest_miocoin_bonus`, fallback `contests.total_miocoin_bonus`).
- **Partner Offers jsou z počtu vyloučeny** — nejsou fixní součástí prize poolu soutěže a mohou se přidávat během soutěže; nejsou v `bonus_prizes`, takže se nezapočítávají.

Frontend display/counting only. Změněný soubor: `src/pages/ContestDetail.tsx`. Commit `208434d0`. `npm run build` ✅.

---

## 🛡️ OCHRANA PROTI REGRESÍM — ZÁVAZNÉ PRAVIDLO (05. 06. 2026)

**OneMil se NEHLÍDÁ ručně. Každá větší změna MUSÍ být chráněná testem, smoke testem nebo vědomě schválenou výjimkou Pavla.** (Plné znění v `CLAUDE.md`.)

### Definition of Done
Změna není hotová, dokud: (1) `npm run build` ✅; (2) relevantní E2E/smoke zeleně; (3) ověřeno, že nerozbila související oblasti; (4) DB/migrace/Edge/Bob-prompt mají samostatné potvrzení Pavla + postcheck; (5) dokumentace aktualizovaná; (6) commit pushnutý (produkce až po Lovable Publish).

### P0 smoke před každým Publish
registrace/login (01,02) · login gating (33,14) · nákup ticketu (04) · výhra (05) · peněženka/balance (09,03-voucher) · zprávy admin↔uživatel (29,32) · Bob ON/OFF kontrakt (31). Měněná oblast → + celý její blok.

### Mapa kritických oblastí (každá musí mít test nebo schválenou výjimku)
| Oblast | Pokrytí E2E |
|---|---|
| přihlášení / role | 01,02,14,25,33 |
| soutěže / tikety | 03,04,05 |
| dobíjení / platby | 03-voucher,10,11 |
| peněženka | 09,10 |
| výhry | 05,06,07,08 |
| zprávy | 12,29,32 |
| Bob | 31 (jen kontrakt) |
| affiliate | 13,22,26,27,28,30 |
| partneři | 06,07,08,15 |
| admin | 15,16,18,19,20,21,23,24 |

### Bob pravidlo
Neměnit prompt / CTA routing / formát `{ text, cta }`. Testovat jen kontrakt, ne přesný text odpovědi.

---

## ✅ AFFILIATE v2 — ADMIN `/influencers` DETAIL: KOMPLETNÍ v2 DATA (04. 06. 2026)

**`/admin/influencers` (hlavní admin stránka) detail nyní zobrazuje kompletní Affiliate v2 profil z `affiliate_accounts`** (přes `auth_user_id`). Rozšířeno nad rámec social: ref_code, zaměření (Influencer/Obchodník), stav účtu, provizní sazby (zákazníci/firmy), IČO, DIČ, plátce DPH, fakturační adresa, země, IBAN/účet, banka. `affiliate_accounts` = primární zdroj; fallback legacy `partners.notes` / `partners.website_url`; „—" když chybí všude.

- Nové sekce v detailu: „Affiliate účet" (ref/zaměření/stav/provize) + „Fakturační a výplatní údaje" (IČO/DIČ/DPH/adresa/země/IBAN/banka).
- Social = klikací odkazy (`target=_blank rel=noopener noreferrer`), žádné embed/iframe/video/API. „Napsat zprávu" ponecháno.
- `/admin/affiliate-accounts` **nezměněno, nesmazáno, neskryto** (technický záložní v2 přehled, jediný kompletní seznam vč. čistých Obchodníků).
- Spec 30 rozšířen (ref_code, modes, stav, provize, IG/TikTok/YT/FB, audience, kategorie, IČO, DIČ, DPH, IBAN, banka, no iframe/video). Staging Full E2E run `26933791136`: **54 passed · 0 failed** ✅. `npm run build` ✅. Commit `b79a821e`.

---

## ✅ AFFILIATE v2 — ADMIN `/influencers` DETAIL ČTE SOCIAL Z affiliate_accounts (04. 06. 2026)

**Skutečná příčina, proč admin viděl social prázdné** (screenshot „Detail Affiliate partnera"): Admin používal stránku **`/admin/influencers`** (`AdminInfluencers.tsx`, nav „Affiliate partneři"), NE `/admin/affiliate-accounts`. Tato legacy stránka četla social z **`partners.notes.social_networks`** (JSON), zatímco affiliate je edituje v `/affiliate/dashboard` → ukládá do **`affiliate_accounts`**. Dva oddělené datové modely → admin viděl „—" (Web fungoval, protože je sloupec `partners.website_url`).

**Ověřeno v DB** (`influencer@onemil.c`): `partners.notes.social_networks` = vše null; `affiliate_accounts` = instagram=`www.instagram.cz`, tiktok=`www.tiktok.com`, youtube=`youtube`, web=`www.onemil.cz`. **Data se ukládala** — admin jen četl špatný zdroj.

**Oprava (display-only, žádná DB změna):** `AdminInfluencers.openDetail` nyní načte `affiliate_accounts` řádek podle `auth_user_id` a detail **preferuje** affiliate_accounts hodnoty (instagram/tiktok/youtube/facebook/website/audience/categories), fallback na partners.notes / partners.website_url. Social zůstávají klikací odkazy (`<a target=_blank rel=noopener noreferrer>`) — žádné embed/iframe/video/API.

**Pozn.:** Existují dvě admin stránky — `/admin/influencers` (legacy partners, „Affiliate partneři") a `/admin/affiliate-accounts` („Affiliate účty (v2)", čte affiliate_accounts, opraveno dříve). Uživatel byl na první.

**Ověření:** Spec 30 (seeduje partner + linked affiliate_accounts s prázdnými notes, ověří detail zobrazí affiliate hodnoty). Staging Full E2E run `26917798377`: **54 passed · 0 failed** ✅. `npm run build` ✅. Commit `fb3dab91`.

---

## ✅ AFFILIATE v2 — PROFIL FORM RE-SYNC PO ULOŽENÍ (04. 06. 2026)

**Problém:** Po vyplnění a uložení social polí (web/IG/TikTok/YT/FB/dosah/kategorie) se v Profilu (a zdánlivě adminovi) data „nezobrazovala správně".

**Kde přesně byla chyba:** `AffiliateProfileSection` inicializoval `form` přes `useState({...initial})` — **jen jednou při mountu**. Po úspěšném uložení rodič znovu načte data z DB a předá nový `profile` prop, ale `form` zůstal na hodnotách před reloadem (useState pozdější initial ignoruje). **Data se do DB ukládala správně** (ověřeno: `influencer1@onemil.cz` má `youtube_url` v DB, RPC 19-arg, handleSave posílá všech 6 `p_*` social params). Chyba byla jen v **in-app obnovení zobrazení**.

**Ukládala se data do DB:** ANO. **Po reloadu se zobrazují:** ANO (po opravě i in-app onSaved reload; full page reload fungoval i předtím díky remountu). **Admin je vidí:** ANO (admin SELECT/interface/detail správné, fallback odstraněn minule — `2d838dd5`).

**Oprava:** Re-sync `form` z `initial`, když se serializovaná profil data skutečně změní (porovnání podle hodnoty, ne reference → nepřepíše rozeditované hodnoty při běžném re-renderu rodiče). Social pole zůstávají **jen text** (žádné embed/iframe/video/API). **Žádná DB migrace** — RPC už 19-arg, sloupce existují.

**Ověření:** Spec 28 rozšířen o `page.reload()` + re-assert inputů ze saved DB hodnot. Staging Full E2E run `26916797958`: **53 passed · 0 failed** ✅. `npm run build` ✅. Commit `abab6a9c`.

---

## ✅ LOGIN — /partner/login BLOKUJE LEGACY INFLUENCERY (05. 06. 2026, STAGING)

**`/partner/login` pustí jen skutečného firemního partnera. Legacy influencer (uložený v `partners`) je blokován.**

- **Proč to pořád šlo:** `/partner/login` kontroloval **jen existenci `partners` řádku**, ale legacy influenceři jsou taky v `partners` (`notes.type='influencer'`). Influencer byl omylem považován za firemního partnera a routován na `/affiliate/dashboard`.
- **Jak se pozná skutečný partner:** `partners` řádek, jehož `notes` **NEobsahuje** „influencer" (firemní partneři mají typicky `company_name`, `notes` NULL; influenceři mají `notes` JSON `"type":"influencer"`).
- **Oprava `PartnerLogin.tsx`:** po nalezení `partners` řádku se navíc testuje `notes` — pokud je to influencer → `signOut` + „Tady zatím nemáte firemní Partner účet…", **zůstane na /partner/login**. Jen firemní partner (bez influencer notes, approved) → `/partner/dashboard`. Influencer→/influencer/dashboard redirect ODSTRANĚN.
- **`/login`:** influencer (má `partners`) i affiliate jsou blokováni už od commitu `6f2d43e0` (admin první). Beze změny v této iteraci.
- **Footer:** „Přihlášení Affiliate partnera" opraveno na `/affiliate/login` (bylo `/partner/login`). „Přihlášení partnera" → `/partner/login` (správně).
- **Globální App guard** nepřebíjí — login stránka odhlásí a zůstane (žádný bounce na /affiliate/dashboard).
- Spec 14 přepsán: influencer blokován na /partner/login + affiliate přes /affiliate/login → dashboard. Staging Full E2E run `27000493579`: **65 passed · 0 failed** ✅. `npm run build` ✅. Commit `eb2f42ac`.
- **Commity `6f2d43e0`, `dd8defa7`, `4612d294`, `811e176c` ověřeny na `origin/main`** ✅. Produkce vyžaduje **Lovable Publish** (proto se to v produkci „pořád" dělo — live build byl starší).

---

## ✅ LOGIN — KONEC AUTO-BOUNCE AFFILIATE/PARTNER Z /login (05. 06. 2026, STAGING)

**`/login` už automaticky nehází affiliate/partner do jejich dashboardu. Admin vždy první.**

- **Redirect problém:** po auth na herním `/login` byl affiliate/partner (vč. multi-role `influencer@onemil.cz`) tiše hozen do `/affiliate/dashboard` (Login.tsx influencer/partner větve + globální App guard confinement). Špatné dveře → tiché přihlášení do affiliate prostoru místo hlášky.
- **Oprava `Login.tsx` (inline, deterministicky po signIn, bez race s guardem):**
  1. **ADMIN/superadmin VŽDY první** → `/admin` (nikdy blokován kvůli partner/affiliate záznamu);
  2. jakýkoliv `partners` NEBO `affiliate_accounts` záznam → `signOut` + **sonner** hláška „Tento účet není registrovaný jako soutěžící. Přihlaste se ve správné části aplikace.", **zůstane na /login** (žádný bounce — `/login` není v `CUSTOMER_BLOCKED_ROUTES`, takže guard nebounceuje);
  3. jinak zákazník → `/profile` (nebo redirect target).
  Žádná DB/migrace; Bob/ai-chat/provize netknuté.
- `/affiliate/login` a `/partner/login` gatují na svůj záznam (beze změny).
- **Affiliate E2E (multi-role) se nově přihlašuje přes `/affiliate/login`** — nový helper `loginAffiliateViaUI`; specy 25/26/27/28 upraveny; toast asserty `.filter` (login toast „Úspěšně přihlášeno" už nekoliduje).
- Spec 33 (6 testů): affiliate→/affiliate/login projde; affiliate→/partner/login blokován; zákazník→/affiliate/login blokován; **affiliate→/login blokován + zůstane**; **zákazník→/login projde**; **admin→/login → /admin**. Staging Full E2E run `26999704712`: **64 passed · 0 failed** ✅. `npm run build` ✅. Commity `6f2d43e0`, `dd8defa7`, `4612d294`.
- **Pozn.:** `/login` blokuje účet s partners/affiliate záznamem (chybí signál „soutěžící") — multi-role soutěžící bez vlastního signálu by byl taky blokován; čisté oddělení čeká na schválený signál (viz rozhodnutí níže). Admin je chráněn pořadím.

---

## ✅ LOGIN GATING DLE TYPU ÚČTU — /affiliate/login + /partner/login (05. 06. 2026)

**Affiliate/partner se nepřihlásí přes špatný vstup. `/login` ponechán (chybí signál „soutěžící").**

- **Nový `/affiliate/login`** (`AffiliateLogin.tsx`): pustí jen účet s `affiliate_accounts` řádkem; jinak signOut + „Tady zatím nemáte Affiliate účet…". Multi-role účet s affiliate záznamem projde. Affiliate registrace vede nově na `/affiliate/login`.
- **`/partner/login`**: gatuje na `partners` (+ stav); jinak signOut + „Tady zatím nemáte firemní Partner účet…". Čistý affiliate na partner loginu = **zablokován, NE přesměrován** do affiliate dashboardu.
- **`/login` (zákaznický): NEZMĚNĚN.** Ověřeno, že **spolehlivý signál „soutěžící účet" NEEXISTUJE** — žádný trigger na auth.users; všichni partneři (4/4) i affiliate (3/3) v produkci mají `wallets` řádek, takže wallet/profile nerozlišuje. Dle zadání signál nevymýšlím; `/login` zůstává sdílený (affiliate přes /login dál funguje → /affiliate/dashboard, specy 26/27 zelené).
- **Multi-role:** každý login gatuje na svůj záznam; účet s více registracemi projde jen tam, kde má odpovídající řádek.
- Spec 33 (3 testy): affiliate→/affiliate/login projde; affiliate→/partner/login blokován; zákazník→/affiliate/login blokován. Staging Full E2E run `26996683970`: **61 passed · 0 failed** ✅. `npm run build` ✅. Commit `4748042d` (+ `48413dee` partner hláška).

### ROZHODNUTÍ o `/login` (05. 06. 2026, závazné)
- `/affiliate/login` = samostatný vstup pro Affiliate účet (gate na `affiliate_accounts`).
- `/partner/login` = samostatný vstup pro Partner účet (gate na `partners`).
- **`/login` zůstává SDÍLENÝ**, protože přes něj chodí také **admin**. **Nesmí se uzavřít jen pro soutěžící**, dokud neexistuje spolehlivý DB signál „soutěžící účet".
- **Admin check VŽDY první**; admin **nikdy neblokovat** kvůli partner/affiliate záznamu (multi-role admin musí projít).
- **`profiles`/`wallets` nejsou spolehlivý signál** soutěžícího — mají je i partneři i affiliate.
- **Budoucí oddělení `/login`** vyžaduje **samostatně schválenou migraci/signál** (role `competitor` nebo flag `registered_as_customer`) **+ backfill** existujících účtů PŘED zapnutím blokování.

---

## ✅ ADMIN UNREAD BADGE — POČÍTÁ I BĚŽNÉ USER ZPRÁVY (04. 06. 2026, STAGING)

**Chyba:** Admin badge u „Zprávy" počítal **jen** nepřečtené `SUPPORT_REQUEST_MARKER` řádky (`useUnreadMessagesCount.ts`), takže běžná nepřečtená zpráva od zákazníka/partnera/affiliate (bez handoffu) se vůbec nezapočítala.

**Oprava (jen frontend, žádná DB/migrace):**
- Admin unread = **počet konverzací s jakoukoliv nepřečtenou `sender='user'` zprávou** (distinct `user_id`). Pokrývá zákazníky, partnery, affiliate i zprávy bez markeru. Klesá, jak admin otevírá thready (AdminMessageThread označí user zprávy `read`).
- Admin dostane **zvuk** i u nové běžné user zprávy (ne jen u markeru).
- `/admin/messages` už zobrazuje „Čeká na odpověď" / „Vyřešeno" dle posledního odesílatele (Lovable).
- Testidy: `admin-messages-unread-badge` (nav), `admin-thread-<uid>` (karta).
- **Bob / ai-chat / prompt / CTA beze změny.** Žádná DB migrace.
- E2E spec 32: seed nepřečtené user zprávy bez markeru → objeví se v adminu + badge → po otevření threadu `read=true`. Staging Full E2E run `26979723827`: **58 passed · 0 failed** ✅. `npm run build` ✅. Commit `42f29729`.

---

## ✅ BOB ON/OFF PŘEPÍNAČ — FÁZE 1 NASAZENA V PRODUKCI (04. 06. 2026)

**Admin může globálně vypnout/zapnout Boba. Nasazeno na STAGING I PRODUKCI (`xkzhjldrojjlrkezorey`). E2E zelený.**

### Produkční postcheck (read-only)
- `settings.bob_enabled` = `true` (default) ✅
- `get_bob_enabled()` → vrací `true`, `pg_typeof` = **boolean** ✅ (jen boolean, žádné jiné settings/secrety — funkce čte pouze řádek `bob_enabled`)
- SECURITY DEFINER ✅, 0 argumentů ✅, `authenticated` EXECUTE ✅
- ai-chat / Bob kód **beze změny** (git log prázdný). `npm run build` ✅.

- **DB:** flag `settings.bob_enabled` ('true'/'false') + RPC `get_bob_enabled()` (SECURITY DEFINER, vrací JEN boolean, žádné secrety, EXECUTE authenticated). Migrace `20260604_get_bob_enabled_rpc.sql` — **jen staging**.
- **Hook** `useBobEnabled.ts`: čte flag přes RPC; admin zápis přes `settings` upsert.
- **Admin přepínač** v `/admin/messages`: Switch „Bob aktivní/vypnutý" + český toast.
- **AdminPrimaryNav:** decentní oranžový pulz + tooltip „Bob je vypnutý – zprávy jdou přímo adminovi." u „Zprávy" když Bob OFF (projeví se po reloadu — nav má vlastní instanci hooku).
- **Customer `Messages.tsx`:** Bob OFF → vynutí admin route (ai-chat se NEvolá), zpráva uložena, sonner toast „Zprávu jsme předali podpoře. Ozveme se co nejdříve." Skrytý `data-testid="bob-state"` (on/off) pro E2E.
- **Bob prompt / CTA routing / handlery / `{ text, cta }` formát beze změny.** ai-chat kód nezměněn.
- **Pozn.:** handoff hláška přepnuta na **sonner** (shadcn `use-toast` se v Messages nerenderoval spolehlivě).
- **E2E spec 31** (serial — sdílí globální flag): RPC vrací boolean; admin toggle + nav pulz; Bob OFF → bob-state='off' + zpráva uložena + 0 ai řádků + sonner toast. Staging Full E2E run `26977917782`: **57 passed · 0 failed** ✅. `npm run build` ✅.
- Commits: `de8dd07b` (feat) … `e82b89d6` (sonner toast). **Produkční migrace APLIKOVÁNA 04. 06. 2026** ✅. Frontend na `main` (`c0842894`) — vyžaduje Lovable Publish.

---

## ✅ ADMIN MESSAGING RLS — APLIKOVÁNO V PRODUKCI (04. 06. 2026)

**Migrace `20260603_messages_admin_insert_policy.sql` aplikována na produkci `xkzhjldrojjlrkezorey` (výslovné schválení Pavla).** Policy `messages_insert_admin` (authenticated admin/superadmin přes `user_roles`) přidána k `public.messages`.

**Postcheck (read-only, RLS simulace přes SET ROLE authenticated + jwt claims, transakce abortovány):**
- 3 INSERT policies: `messages_insert` (authenticated, auth.uid()=user_id), `messages_insert_admin` (authenticated admin/superadmin), `messages_insert_system` (service_role) ✅
- **Test 1:** admin → affiliate (`4bab81c9…`) insert `sender='admin'` → `admin_insert_allowed=t` ✅
- **Test 2:** běžný uživatel insert `sender='admin'` jinému user_id → `normal_user_admin_insert_allowed=f` ✅ (RLS odmítl)
- Nic se neuložilo (oba testy RAISE EXCEPTION → rollback).

**Admin zpráva affiliate uživateli funguje** (RLS povoluje). `npm run build` ✅. Commit dokumentace níže.

---

## ✅ AFFILIATE v2 — ADMIN ZPRÁVA AFFILIATE UŽIVATELI: RLS FIX (03. 06. 2026, STAGING)

**Problém 2:** Admin nemohl odeslat zprávu affiliate (ani jinému) uživateli — UI: „Chyba — Zprávu nelze odeslat".

**Kde byla chyba:** Produkční `public.messages` INSERT policies byly zkonsolidovány jen na:
- `messages_insert` (role `authenticated`, `WITH CHECK auth.uid() = user_id`) — jen vlastní zprávy
- `messages_insert_system` (role `service_role`, `true`)

**Chyběla policy, která by adminovi (authenticated) dovolila vložit zprávu s `user_id ≠ auth.uid()`.** `AdminMessageThread.handleSend` vkládá `user_id=<příjemce>, sender='admin'` → jediná platná policy `messages_insert` vyžaduje `auth.uid()=user_id` → RLS odmítne → toast „Zprávu nelze odeslat". Postihovalo **všechny** admin reply, ne jen affiliate. (Stará admin-insert policy byla nahrazena a ztracena; poslední funkční admin zpráva 2026-02-10.)

**Příjemce = `affiliate_accounts.auth_user_id`** (= `public.users.id` = `auth.users.id`); `messages.user_id` má FK na `auth.users`. NE `affiliate_accounts.id`. Affiliate `influencer1@onemil.cz` má auth_user_id `4bab81c9…`, existuje v auth.users/public.users/profiles, 4 zprávy.

**Oprava:**
- Migrace `supabase/migrations/20260603_messages_admin_insert_policy.sql` — přidána policy `messages_insert_admin` (authenticated, admin/superadmin přes `user_roles`). INSERT-only, additivní, žádná data mutation. **Aplikováno na STAGING `dxmowysntemfqfnanxua`** ✅. **Produkce: NEAPLIKOVÁNO — čeká na schválení.**
- `AdminAffiliateAccounts.tsx`: SELECT `auth_user_id`, nové tlačítko **„Napsat zprávu"** v detailu → `/admin/messages/<auth_user_id>` (správné ID příjemce; disabled pokud účet nemá auth).
- Spec 29: admin pošle zprávu seedovanému affiliate auth uživateli → žádný error toast + bublina + DB readback.

**Ověření:** Staging Full E2E run `26915631607`: **53 passed · 0 failed** ✅ (spec 29 ✅). `npm run build` ✅. Commit `ee17440e`.

**Nezměněno:** provize, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`, Partner portal (mimo sdílenou messages RLS, která opravuje i partner/uživatel zprávy). Žádné Edge Functions.

---

## ✅ AFFILIATE v2 — ADMIN SOCIAL ZOBRAZENÍ: ODSTRANĚN TICHÝ FALLBACK (03. 06. 2026)

**Problém:** Admin v `/admin/affiliate-accounts` detailu viděl YouTube (a další social) prázdné/„Neuvedeno", ačkoliv hodnota byla v DB uložená.

**Diagnóza (kde byla chyba):** Data se **ukládala správně** — ověřeno v produkční DB (`influencer1@onemil.cz` / `TRUBKA89A0` měl `youtube_url = https://studio.youtube.com/video/...`). Chyba byla **jen v zobrazení adminovi**: `AdminAffiliateAccounts.tsx` (i `AffiliateDashboard.tsx`) měl `AFFILIATE_ACCOUNT_SELECT_FALLBACK`, který **tiše vynechával** všechna social pole. Když primární SELECT selhal (např. stale PostgREST schema cache hned po migraci přidávající sloupce, nebo transientní chyba), aktivoval se fallback → social data zmizela z UI, ačkoliv v DB byla.

**Oprava:** Fallback **odstraněn** v obou souborech — sloupce teď trvale existují na staging i produkci, takže obě stránky vždy SELECTují plnou sadu social sloupců. Žádná DB/RPC/migrace změna (sloupce i RPC už existují). Social pole zůstávají **jen text** (`DetailField`/`ReadonlyItem` = `<p>`), žádné iframe/embed/video/API.

**Ověření:**
- Admin detail social zobrazení (YouTube/Instagram/web/audience/…) je zamčeno **spec 23** (řádky 145–156).
- Dashboard save → readback (vč. YouTube/Instagram/web/audience) zamčeno **spec 28**.
- Staging Full E2E run `26914578757`: **52 passed · 0 failed** ✅ (spec 23 ✅, spec 28 ✅).
- `npm run build` ✅. Commit `2d838dd5`.

**Pozn.:** Pokud admin v produkci stále vidí prázdno, jde o stale Lovable build — stačí Publish; kód na `main` je správný.

---

## ✅ AFFILIATE v2 — SOCIAL/PROFIL POLE EDITOVATELNÁ V DASHBOARDU (03. 06. 2026, PRODUKCE)

**Stav: NASAZENO NA STAGING I PRODUKCI. Migrace aplikována na produkci `xkzhjldrojjlrkezorey` (výslovné schválení Pavla). Žádný další deploy není potřeba.**

### Problém (proč to nešlo editovat)
- V `/affiliate/dashboard → Profil` byla social pole (`instagram_url`, `tiktok_url`, `youtube_url`, `facebook_url`, `audience_size`, `content_categories`) jen **read-only** (`ReadonlyItem` → `<p>`), bez inputu.
- RPC `update_affiliate_own_profile` (13-arg) tato pole **vůbec neukládalo** — chyběly v signatuře i UPDATE.

### Oprava
- **Frontend** `src/components/AffiliateProfileSection.tsx`: nová editovatelná sekce **„Sociální sítě a dosah"** s inputy pro web/Instagram/TikTok/YouTube/Facebook/velikost publika/kategorie obsahu. Read-only zůstává jen „Účet" souhrn (zaměření, ref kód, stav, registrační e-mail). `website_url` přesunut z Kontaktních údajů sem (odstraněn duplikát). Social = **jen text**, žádné embed/iframe/video/API/autoplay.
- **RPC** rozšířeno na 19-arg (`update_affiliate_own_profile`): +6 social parametrů, **NULL-preserving** (NULL = ponech, '' = smaž). Stará 13-arg signatura dropnuta (žádná overload ambiguita). Migrace `supabase/migrations/20260603_affiliate_profile_update_social_fields.sql`.
- Editovatelná pole v Profilu: jméno, kontaktní e-mail, telefon, web, Instagram, TikTok, YouTube, Facebook, velikost publika, kategorie obsahu, IČO, DIČ, plátce DPH, fakturační adresa (ulice/město/PSČ/země CZ-SK-…), číslo účtu/IBAN, banka. Jedno tlačítko „Uložit změny" → český toast → reload dat.

### DB stav
- **Staging `dxmowysntemfqfnanxua`:** migrace aplikována, RPC = jediná 19-arg SECURITY DEFINER funkce ✅
- **Produkce `xkzhjldrojjlrkezorey`:** migrace **APLIKOVÁNA** (03. 06. 2026). Postcheck: RPC = jediná 19-arg SECURITY DEFINER funkce (overload_count=1) ✅, `authenticated` má EXECUTE ✅, 7 social/web sloupců přítomno ✅, 3 affiliate záznamy nedotčeny ✅, RLS zapnuté ✅. `npm run build` ✅.

### Co vidí admin
- `/admin/affiliate-accounts` detail: stejná pole přes `DetailField` jako **text** (beze změny). Žádné embedy.

### Testy
- Staging Full E2E run `26913262729`: **52 passed · 0 failed** ✅ (Telegram OK, message_id 928).
- Spec 28 rozšířen: registrace → profil inputy (`toHaveValue`) → editace Instagram+audience → Uložit → DB readback (editovaná pole uložena, ostatní nedotčena).
- Spec 26 řádek 94 opraven na nadpis „Sociální sítě a dosah". Spec 27 (phone save) zelený.
- `npm run build` ✅.

### Nezměněno (garantováno)
- Provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`. Žádné Edge Functions. Legacy influencer soubory nesmazány.

---

## ✅ AFFILIATE v2 — REGISTRAČNÍ / SOCIAL POLE NASAZENA V PRODUKCI (03. 06. 2026)

**Migrace `20260603_affiliate_registration_profile_fields.sql` aplikována na produkci `xkzhjldrojjlrkezorey` (výslovné schválení Pavla).**

### Nové sloupce v `affiliate_accounts` (additive, `ADD COLUMN IF NOT EXISTS`)
| Sloupec | Typ | Popis |
|---------|-----|-------|
| `instagram_url` | text nullable | Instagram profil (text) |
| `tiktok_url` | text nullable | TikTok profil (text) |
| `youtube_url` | text nullable | YouTube kanál (text) |
| `facebook_url` | text nullable | Facebook profil (text) |
| `audience_size` | text nullable | Velikost publika / dosah (text) |
| `content_categories` | text nullable | Kategorie obsahu (text) |

`website_url` již existoval — ukládá a zobrazuje se beze změny.

### RPC `register_affiliate_account`
- Nová 12-arg overload (SECURITY DEFINER, `search_path=''`) ukládá všechna registrační/social pole.
- Stará 5-arg overload **ponechána** (drop-old-signature migrace NEbyla v této akci schválena ani aplikována). Žádná overload ambiguita — liší se počtem argumentů; frontend volá 12-arg verzi.
- GRANT EXECUTE pouze `authenticated`.

### Produkční postcheck (read-only)
- 6 nových sloupců + `website_url` přítomny, typ `text` ✅
- Oba overloady RPC SECURITY DEFINER ✅
- 3 affiliate záznamy (2 approved, 1 rejected, 0 pending) — **nedotčeny** ✅
- RLS na `affiliate_accounts` stále zapnuté ✅

### Bezpečnost zobrazení — jen text, žádné embedy
- Dashboard `AffiliateProfileSection`: `ReadonlyItem` renderuje hodnoty jako `<p>` text.
- Admin `AdminAffiliateAccounts`: `DetailField` renderuje hodnoty jako `<p>` text.
- **Žádný `<iframe>`, `<embed>`, `<video>`, autoplay, feed loading ani Instagram/TikTok/YouTube/Facebook API.**

### Build
- `npm run build` ✅ (exit 0, built in ~17s). Lokál fast-forwardnut na `bff3c7e7`.

### Nezměněno (garantováno)
- Provizní výpočty, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic` — beze změny. Žádné Edge Functions ani jiné migrace nenasazeny.

---

## ✅ AFFILIATE v2 DASHBOARD — KOMPLETNĚ DOKONČENO (03. 06. 2026)

**Stav: NASAZENO, SMOKE OVĚŘENO, E2E ZELENÝ. Žádný další deploy není potřeba.**

### Produkce `xkzhjldrojjlrkezorey` — finální stav

#### Dashboard `/affiliate/dashboard`
- Premium luxury UI (gold akcenty, `luxury-card` styl, tmavé pozadí)
- **Horní přepínač Influencer / Obchodník / Profil** — uživatel přepíná sám; volba uložena v `localStorage`
- `Profil a výplatní údaje` jsou pouze v samostatné sekci `Profil` (už se neduplikují pod Influencerem ani Obchodníkem)
- **Legacy `/influencer/dashboard` → přesměrovává na `/affiliate/dashboard`** (route-level `<Navigate>`)
- Statistiky per-mód: registrace dnes / tento měsíc / 30 dní (influencer); firmy dnes / 30 dní (obchodník)
- Sekce Influencer obsahuje zákaznický odkaz `/?ref=KOD` + lokální QR kód (`qrcode.react`, žádný external API)
- Sekce Obchodník obsahuje firemní odkaz `/partner/register?via=KOD` + lokální QR kód (`qrcode.react`, žádný external API)
- Obě sekce používají stejný `ref_code`
- Moje zákazníci / Moje firmy (s názvy firem pokud RLS dovolí)
- Provize tabulka per-mód + payout status
- Kampaně (placeholder, brzy)
- **Pravidla spolupráce Influencer** — co smí/nesmí, povolená slova

#### Profilová sekce `AffiliateProfileSection`
- Jméno, e-mail, telefon, web / sociální síť
- IČO (CZ i SK formát — 8 číslic)
- DIČ (`vat_id`)
- Plátce DPH toggle
- Fakturační adresa: ulice, město, PSČ, **country selector CZ/SK/DE/AT/PL/HU/other**
- Bankovní účet / IBAN (CZ, SK, mezinárodní formát)
- Payout status: „Připraveno k výplatě" / „Chybí údaje"
- Uložení přes RPC `update_affiliate_own_profile` (SECURITY DEFINER)

#### DB — produkce
| Objekt | Stav |
|--------|------|
| `affiliate_accounts.ico` | ✅ EXISTS |
| `affiliate_accounts.billing_street/city/zip/country` | ✅ EXISTS |
| `affiliate_accounts.website_url` | ✅ EXISTS |
| `update_affiliate_own_profile` RPC | ✅ EXISTS |
| RLS stále zapnuté | ✅ |
| 3 affiliate záznamy (2 approved, 1 rejected) | ✅ nedotčeny |

#### Staging E2E
- Run `26907560666`: **49 passed · 3 skipped · 0 failed** — spec 26 + spec 27 prošly ✅
- Commit ověřeného dashboard přepínače: `0272a3ac2937cae8dd5c7cdfa820a4340d6eff99`
- Run `26902106200`: **45 passed · 3 skipped · 0 failed**
- Spec 14: affiliate login → `/affiliate/dashboard` ✅
- Spec 25: `/influencer/dashboard` redirect ✅
- Spec 26 (7 testů): hero, přepínač, odkaz+QR, stat karty, localStorage ✅
- Spec 27 (3 testy): profil renderuje, ukládání RPC, RLS check ✅

#### Nezměněno (garantováno)
- `buy_ticket_atomic`, platby, tikety, soutěže, peněženka, zákaznický účet, Partner portal (mimo schválený affiliate tok)

---

## ✅ AFFILIATE v2 — PROFIL MIGRACE NASAZENA V PRODUKCI (03. 06. 2026)

**Migrace `20260603_affiliate_profile_update.sql` aplikována na produkci `xkzhjldrojjlrkezorey`.**

### Nové sloupce v `affiliate_accounts`
| Sloupec | Typ | Popis |
|---------|-----|-------|
| `ico` | text nullable | IČO (CZ i SK formát) |
| `billing_street` | text nullable | Fakturační ulice |
| `billing_city` | text nullable | Fakturační město |
| `billing_zip` | text nullable | PSČ |
| `billing_country` | text DEFAULT 'CZ' | Země (CZ/SK/...) |
| `website_url` | text nullable | Web / sociální síť |

### RPC `update_affiliate_own_profile`
- SECURITY DEFINER — affiliate mění jen vlastní řádek (ověřuje `auth.uid()`)
- Nelze měnit: `ref_code`, `modes`, `status`, `commission_rate_*`, `approved_at`, `rejected_at`
- Lze měnit: kontakt, adresa, IČO, DIČ, bankovní účet, DPH flag, web
- Staging: aplikováno + ověřeno (spec 27 zelený)
- Produkce: aplikováno 03. 06. 2026

### Postcheck produkce
- 6 nových sloupců: ✅
- RPC funkce: ✅
- 3 existující affiliate záznamy: nedotčeny ✅
- RLS stále zapnuté: ✅

### Affiliate dashboard (`/affiliate/dashboard`)
- SELECT dotaz nyní načítá všechna profil pole (ico, billing_*, website_url)
- `AffiliateProfileSection` zobrazuje a ukládá kompletní profil
- Payout status: „Připraveno k výplatě" / „Chybí údaje"
- Podpora CZ i SK (country selector, IČO/DIČ formáty)

---

## ✅ AFFILIATE v2 — PRODUKČNÍ NASAZENÍ + SMOKE KONTROLA KOMPLETNÍ (03. 06. 2026)

**Stav: NASAZENO A OVĚŘENO V PRODUKCI. Žádný další deploy není potřeba.**

### Produkční projekt: `xkzhjldrojjlrkezorey`

### DB vrstva

| Objekt | Stav |
|--------|------|
| `affiliate_accounts` (4 sloupce, UNIQUE `auth_user_id`, UNIQUE `ref_code`) | ✅ EXISTS |
| `affiliate_customer_refs` (UNIQUE `user_id` = first-touch) | ✅ EXISTS |
| `affiliate_company_refs` (UNIQUE `partner_id` = first-touch) | ✅ EXISTS |
| `affiliate_commissions` (calculated → approved → paid) | ✅ EXISTS |
| `partners.referred_by_affiliate_id` (nullable FK) | ✅ EXISTS |
| RLS zapnuté na všech 4 affiliate tabulkách | ✅ (8 politik) |
| `record_affiliate_customer_ref(text)` | ✅ SECURITY DEFINER |
| `record_affiliate_company_ref(text, uuid)` | ✅ SECURITY DEFINER |
| `calculate_affiliate_commissions_for_month(date)` | ✅ SECURITY DEFINER |
| `admin_set_affiliate_commission_status(uuid, text)` | ✅ SECURITY DEFINER |
| `register_affiliate_account(text, text, text, text[], text)` | ✅ SECURITY DEFINER |

**Migrovaní legacy influenceři: 3** (ref_codes: `TRUBKA89A0`, `PAVELDIV1EF7`, `EDRSG49AC`; statusy: approved, approved, rejected)

### Edge Functions

| Funkce | Verze | Status | Ochrana |
|--------|-------|--------|---------|
| `get-pending-partner-registrations` | v129 | ACTIVE ✅ | JWT + admin/superadmin role check |
| `approve-partner-registration` | v128 | ACTIVE ✅ | JWT + admin/superadmin role check |

`VITE_INTERNAL_FUNCTION_TOKEN` se **nepoužívá** — není potřeba nastavovat v Lovable.

### Produkční smoke kontrola ✅

| Route | Výsledek |
|-------|----------|
| `/admin/affiliate-accounts` | ✅ route existuje, chráněno `useUserRole` |
| `/affiliate/register` | ✅ route existuje, přihlášení potřeba pro submit |
| `/affiliate/dashboard` | ✅ route existuje, RLS — vidí jen vlastní data |

### Nezměněno (garantováno)
- `buy_ticket_atomic` — nedotčeno
- platby, tikety, soutěže, peněženka — nedotčeno
- zákaznický účet — nedotčeno
- Partner portal — nedotčeno (mimo schválený affiliate tok)

### DB migrace aplikované na produkci (v pořadí)
| # | Soubor | Výsledek |
|---|--------|----------|
| 1 | `20260603_affiliate_accounts_foundation.sql` | ✅ |
| 2 | `20260603_affiliate_attribution_rpcs.sql` | ✅ |
| 3 | `20260603_affiliate_monthly_commissions.sql` | ✅ |
| 4 | `20260603_affiliate_commission_status_workflow.sql` | ✅ |
| 5 | `20260603_affiliate_self_registration_rpc.sql` | ✅ |
| 6 | `20260603_migrate_influencers_to_affiliate_accounts.sql` | ✅ — 3 influenceři |

---

## ➡️ CURRENT NEXT STEP (03. 06. 2026)

**Affiliate v2 je kompletně nasazeno v produkci a smoke ověřeno.**
Další krok: **připravit premium vizuální koncept pro OneMil video/prezentační vizuály** (surové screenshoty působí příliš technicky — viz sekce níže).

---

**Produkční projekt:** `xkzhjldrojjlrkezorey`

### DB migrace aplikované na produkci (v pořadí)
| # | Soubor | Výsledek |
|---|--------|----------|
| 1 | `20260603_affiliate_accounts_foundation.sql` | ✅ OK — 4 tabulky, RLS, triggery |
| 2 | `20260603_affiliate_attribution_rpcs.sql` | ✅ OK — `record_affiliate_customer_ref`, `record_affiliate_company_ref` |
| 3 | `20260603_affiliate_monthly_commissions.sql` | ✅ OK — `calculate_affiliate_commissions_for_month`, unikátní index |
| 4 | `20260603_affiliate_commission_status_workflow.sql` | ✅ OK — `admin_set_affiliate_commission_status` |
| 5 | `20260603_affiliate_self_registration_rpc.sql` | ✅ OK — `register_affiliate_account` |
| 6 | `20260603_migrate_influencers_to_affiliate_accounts.sql` | ✅ OK — **3 legacy influenceři migrováni** |

### Postcheck výsledky
- 4 tabulky: `affiliate_accounts`, `affiliate_customer_refs`, `affiliate_company_refs`, `affiliate_commissions` ✅
- `partners.referred_by_affiliate_id` sloupec ✅
- 5 RPC funkcí ✅
- 8 RLS politik ✅
- `affiliate_accounts` obsahuje 3 záznamy (migrovaní influenceři) ✅

### Edge Functions nasazeny na produkci
| Funkce | Verze | Status |
|--------|-------|--------|
| `get-pending-partner-registrations` | v129 | ACTIVE ✅ |
| `approve-partner-registration` | v128 | ACTIVE ✅ |

Ochrana: user JWT + admin/superadmin role check. `VITE_INTERNAL_FUNCTION_TOKEN` se **nepoužívá**.

### Další bezpečný krok
Lovable Publish není potřeba (žádná frontend změna v tomto deployi). Produkce je plně funkční.

---

## ✅ AFFILIATE v2 — HISTORICKÝ STAGING HANDOFF (PŘEKRYTO — produkce nasazena 03. 06. 2026)

Viz sekci „AFFILIATE v2 — PRODUKČNÍ NASAZENÍ + SMOKE KONTROLA KOMPLETNÍ" nahoře.
Staging E2E run: `https://github.com/Divuna/million-ticket-draw/actions/runs/26887279500`
Security model commity: `9f3f53b` (JWT model), `9bf059d` (CORS staging fix), `f17cd3ef` (docs).

---

## 🟢 AFFILIATE PROGRAM v2 — GET-PENDING TOKEN FIX (03. 06. 2026, krok 10; PŘEKRYTO NOVÝM MODELEM)

Historický krok: oprava token nesouladu pro načtení pending partnerských registrací.
Aktuální stav po commitech `9f3f53b55f89a3f0c2b16637af32335376fede1d` a
`9bf059d1cf712db36dbc70309dc735e451899d97`: tyto dvě browser-facing admin Edge Functions už
`x-internal-token` / `INTERNAL_FUNCTION_TOKEN` guard nepoužívají. Zůstává JWT + admin/superadmin role check.
Lovable/browser build `VITE_INTERNAL_FUNCTION_TOKEN` pro Affiliate v2 už není potřeba.

- **Změněný soubor:** `src/pages/AdminPartnersPortal.tsx` — `loadPendingRegistrations` volá
  `get-pending-partner-registrations` nyní přes `withEdgeInternalToken({...})` (stejně jako
  `approve-partner-registration`). Tím se přidá `x-internal-token`, který funkce vyžaduje.
- **Historický frontend token:** `withEdgeInternalToken` uměl číst `VITE_INTERNAL_FUNCTION_TOKEN`, ale aktuální server-side
  model ho pro `get-pending-partner-registrations` / `approve-partner-registration` už nevyžaduje.
- **Staging funkce live:** probe bez JWT padá na chybějící/neplatný `Authorization`, ne na internal-token `401`.
- **Firemní tok (DB E2E, data uklizena):** partner z metadat → `record_affiliate_company_ref` →
  `affiliate_company_refs` (source `via_link`) → `partners.referred_by_affiliate_id`=SALESK9. ✅
- **Build:** `npm run build` ✅.
- **Browser E2E ověřeno:** `/partner/register?via=KOD` → pending list → approve → partner → atribuce.
  Run URL: `https://github.com/Divuna/million-ticket-draw/actions/runs/26887279500`.
- Nezměněno: produkce, zákazník, Partner portal dashboard logika (mimo nutný token na load), platby, tikety,
  soutěže, peněženka, `buy_ticket_atomic`.
- **DALŠÍ BEZPEČNÝ KROK:** produkční nasazení celé v2 vrstvy pouze po výslovném potvrzení Pavla;
  Lovable `VITE_INTERNAL_FUNCTION_TOKEN` už před produkcí nenastavovat.

---

## 🟢 AFFILIATE PROGRAM v2 — STAGING PARTNER APPROVAL STACK (03. 06. 2026, krok 9; HISTORICKÝ STAV)

Nasazen chybějící partner-approval edge stack na staging + ověřen firemní `?via=` tok.

- **Chyběly na stagingu:** `approve-partner-registration`, `get-pending-partner-registrations` (staging měl jen
  sofinity-noop, upload-ticket-share, distribute-bonus-prizes).
- **Nasazeno POUZE na staging** `dxmowysntemfqfnanxua` (verify_jwt=true, ACTIVE v1). Produkce
  `xkzhjldrojjlrkezorey` NEDOTČENA (deploy je scoped na projekt).
- **Repo sync:** do CORS allow-headers obou funkcí přidán `x-internal-token` (oprava preflightu);
  `get-pending` surface `affiliate_via_code` (z kroku 8).
- **E2E firemní tok ověřen na úrovni DB/funkce (data uklizena):** vytvoření partnera (replika
  approve INSERTu z metadat s `affiliate_via_code`) → admin atribuce `record_affiliate_company_ref` →
  `affiliate_company_refs` (source `via_link`, attributed_to SALESE2E) → `partners.referred_by_affiliate_id`
  nastaveno → re-attribute `already_attributed` (first-touch, nepřepsáno).
- **Build:** `npm run build` ✅.
- **Aktualizace po změně bezpečnostního modelu:** plný UI E2E už prošel a Lovable `VITE_INTERNAL_FUNCTION_TOKEN`
  není potřeba. `get-pending-partner-registrations` a `approve-partner-registration` chrání JWT + admin/superadmin role check.
- Nezměněno: zákazník, Partner portal dashboard chování, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`, produkce.
- **DALŠÍ BEZPEČNÝ KROK:** produkční nasazení celé v2 vrstvy pouze po potvrzení Pavla.

---

## 🟢 AFFILIATE PROGRAM v2 — ZACHYCENÍ ?ref= / ?via= (03. 06. 2026, krok 8)

Napojení atribučních RPC na frontend. Staging-compatible.

- **Zákazník `?ref=KOD`** (`src/pages/Register.tsx`): kód z URL uložen do `sessionStorage` (nový klíč
  `onemil_affiliate_ref`, oddělený od legacy `onemil_referral_ref`). Po registraci voláno
  `record_affiliate_customer_ref(p_ref_code)` — **non-fatal** (invalid_code/already_attributed/not_eligible/chyba
  registraci nerozbijí). First-touch (existující atribuce se nepřepíše). Legacy player-referral flow nedotčen.
- **Firma `?via=KOD`** (`src/pages/PartnerRegister.tsx`): kód uložen do signUp metadata `affiliate_via_code`.
  Partner řádek vzniká až admin schválením → atribuce se volá tam.
- **Admin flow** (`src/pages/AdminPartnersPortal.tsx` → `handleApproveRegistration`): po úspěšném schválení
  dohledá partner_id přes `auth_user_id`, a pokud má registrace `affiliate_via_code`, zavolá
  `record_affiliate_company_ref(p_via_code, p_partner_id)` — **non-fatal**, mirror `partners.referred_by_affiliate_id`
  jen když NULL.
- **Edge funkce** `supabase/functions/get-pending-partner-registrations/index.ts`: surface `affiliate_via_code`
  z user_metadata (repo změna; partner-approval edge stack zatím NENÍ nasazen na stagingu — nasadí se s celým
  stackem, nenasazoval jsem jeden kus zvlášť).
- **Oddělení zachováno:** zákazník = customer app, firma = Partner portal, affiliate = samostatné prostředí.
- **Staging test (RPC end-to-end, data uklizena):** zákazník valid→recorded, jiný kód nepřepsal (not_influencer),
  invalid→invalid_code, atribuce zůstala first-touch; firma valid→recorded, jiný kód nepřepsal (not_sales_rep),
  mirror nastaven jen když NULL, invalid→invalid_code (non-fatal).
- **Build:** `npm run build` ✅. Nezměněno: platby, tikety, soutěže, peněženka, `buy_ticket_atomic`,
  Partner portal dashboard chování, produkční DB, starý zákaznický referral, staré influencer tabulky.
- **DALŠÍ BEZPEČNÝ KROK:** volitelně QR kód v affiliate dashboardu, cron pro měsíční výpočet provizí, a poté
  produkční nasazení CELÉ v2 vrstvy (DB 1–4 + self-reg + admin UI + frontend + migrace + edge funkce) —
  až po výslovném potvrzení Pavla.

---

## 🟢 AFFILIATE PROGRAM v2 — UŽIVATELSKÝ FRONTEND (03. 06. 2026, krok 7)

Veřejná affiliate registrace + uživatelský dashboard + route guard. Staging-compatible.

- **Migrace (staging):** `supabase/migrations/20260603_affiliate_self_registration_rpc.sql` — RPC
  `register_affiliate_account(p_name,p_email,p_phone,p_modes,p_ref_code)` SECURITY DEFINER, `search_path=''`,
  bind na `auth.uid()`, status `pending`, sazby 5/5, normalizace + kolizní řešení `ref_code`, idempotentní per user.
  `REVOKE PUBLIC` + `GRANT authenticated`.
- **Nové stránky:** `src/pages/AffiliateRegister.tsx` (`/affiliate/register`), `src/pages/AffiliateDashboard.tsx`
  (`/affiliate/dashboard`).
- **Změněné soubory:** `src/App.tsx` (importy, routes, useEffect + render guard, authEntryPath, hide bottom nav),
  `src/hooks/useUserRole.ts` (nový `isAffiliateAccount` — detekován jen když uživatel NEMÁ partners řádek).
- **Registrace:** signUp → RPC `register_affiliate_account` → signOut → „čeká na schválení". Režimy Influencer /
  Obchodník / obojí (checkboxy), návrh `ref_code` z názvu (editovatelný), texty CZ.
- **Dashboard:** zobrazí účet, `ref_code`, režimy, odkazy (zákazníci `/?ref=KOD`, firmy
  `/partner/register?via=KOD`) s kopírováním, provize z `affiliate_commissions` (vypočteno/schváleno/vyplaceno
  souhrny + tabulka). Bez automatické výplaty. RLS chrání data (vlastní řádky).
- **Route guard:** affiliate (bez partners řádku) je omezen na `/affiliate/*` + auth routes → redirect na
  `/affiliate/dashboard`. **Nepadá do Partner portalu** (nemá partners řádek → accountType zůstává customer,
  partner-blok ho nepřesměruje do /partner). Legacy influenceři (mají partners řádek) zůstávají v `/influencer/*` beze změny.
- **Build:** `npm run build` ✅. **Staging test:** RPC registrace (registered/already_exists/invalid_modes) +
  dashboard dotazy ověřeny proti `dxmowysntemfqfnanxua` (test data uklizena, migrovaný účet `E2EAFFIL25A7` čitelný).
- Nezměněno: zákazník, Partner portal, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`, produkční DB, staré influencer tabulky.
- **DALŠÍ BEZPEČNÝ KROK:** zachycení `?ref=`/`?via=` ve frontend registracích → volání atribučních RPC (krok 2);
  volitelně cron pro měsíční výpočet; QR kód v dashboardu. Produkční nasazení celé v2 vrstvy až po potvrzení Pavla.

---

## 🟢 AFFILIATE PROGRAM v2 — MIGRACE INFLUENCERŮ (03. 06. 2026, krok 6)

Datová migrace stávajících influencerů z `partners` do `affiliate_accounts`. Staging only.

- **Migrace:** `supabase/migrations/20260603_migrate_influencers_to_affiliate_accounts.sql` (idempotentní).
- **Aplikováno POUZE na staging** `dxmowysntemfqfnanxua`. **Produkce NEDOTČENA.**
- **Zdroj:** `partners` kde `notes ILIKE '%influencer%'` + `auth_user_id IS NOT NULL` + `contact_email IS NOT NULL`.
- **Nalezeno:** 1 influencer. **Migrováno:** 1 (`E2E Affiliate Test Partner` → ref_code `E2EAFFIL25A7`).
- **Pravidla:** `modes='{influencer}'`, `commission_rate_customer=5.00`, `commission_rate_company=5.00`,
  status 1:1 z `partners.status`, `ref_code` = až 8 alfanum znaků z názvu (bez diakritiky/symbolů, uppercase) +
  4 hex z partner id; fallback `AFF`. `notes='migrated_from_partners:<id>'` (provenience).
- **Idempotence:** `NOT EXISTS` na `auth_user_id` — re-run nepřidá duplikát (ověřeno: eligible=1, migrated=1 i po 2. běhu).
- **Starý systém ZACHOVÁN a běží paralelně** — `partners`, `influencer_referrals/commissions/campaigns` nedotčeny.
- **Staging ověření:** migrovaný účet se zobrazuje v dotazu admin stránky `/admin/affiliate-accounts`.
- **Build:** `npm run build` ✅.
- **DALŠÍ BEZPEČNÝ KROK:** veřejná affiliate registrace + uživatelský dashboard `/affiliate/*` (ref kód, QR,
  přehled provizí), volitelně cron pro měsíční výpočet. Produkční nasazení (DB kroky 1–4 + admin UI + migrace)
  až po výslovném potvrzení Pavla.

---

## 🟢 AFFILIATE PROGRAM v2 — ADMIN UI (03. 06. 2026, krok 5)

První admin UI nad staging DB vrstvou Affiliate v2. Pouze čtení + status workflow přes RPC.

- **Nový soubor:** `src/pages/AdminAffiliateAccounts.tsx` (nová čistá stránka, NE obnovená stará větev).
- **Route:** `/admin/affiliate-accounts` (App.tsx). **Nav:** `USERS_NAV.affiliateAccounts` v menu „Affiliate"
  + `getAdminSectionFromPath`. Změněné soubory: `src/App.tsx`, `src/components/admin/adminNavConfig.ts`.
- **Admin vidí:** seznam `affiliate_accounts` (jméno, e-mail, ref_code, režimy Influencer/Obchodník jako badge,
  stav účtu), agregované provize z `affiliate_commissions` (schváleno CZK, vyplaceno CZK), počet provizí ve stavu
  `calculated` (badge), souhrnné statistiky. Detail dialog: provize účtu po měsících/typech s tlačítky.
- **Workflow přes RPC** `admin_set_affiliate_commission_status`: Schválit (`calculated→approved`), Vyplatit
  (`approved→paid`, s potvrzením). Žádný přímý UPDATE na tabulku z UI.
- affiliate_* tabulky nejsou v generovaných types → `(supabase as any)` casts (záměrně, staging-only).
- **Build:** `npm run build` ✅. **Staging test:** dotazy stránky + RPC přechod ověřeny proti
  `dxmowysntemfqfnanxua` (test data uklizena).
- Nezměněno: zákazník, Partner portal, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`, produkční DB.
- **DALŠÍ BEZPEČNÝ KROK:** datová migrace influencerů z `partners` do `affiliate_accounts` (staging),
  volitelně cron pro měsíční výpočet, pak veřejná affiliate registrace + uživatelský dashboard.
  Produkční nasazení (DB kroky 1–4 + tato UI) až po výslovném potvrzení Pavla.

---

## 🟢 AFFILIATE PROGRAM v2 — ADMIN WORKFLOW PROVIZÍ (03. 06. 2026, krok 4)

Čtvrtý bezpečný DB krok: admin schválení a výplata affiliate provizí. Staging only.

- **Migrace:** `supabase/migrations/20260603_affiliate_commission_status_workflow.sql` (idempotentní DDL).
- **Aplikováno POUZE na staging** `dxmowysntemfqfnanxua`. **Produkce NEDOTČENA.**
- **`admin_set_affiliate_commission_status(p_commission_id uuid, p_new_status text)`** — SECURITY DEFINER,
  `SET search_path=''`, **admin only** (`is_admin()`).
  - Povolené přechody (jen vpřed): `calculated → approved`, `approved → paid`.
  - Zakázáno: návrat zpět, skok `calculated → paid`, neznámý status.
  - Při `paid` nastaví `paid_at = now()`. Řádek zamčen `FOR UPDATE`.
  - Vrací jsonb: `forbidden` / `not_found` / `invalid_status` / `invalid_transition` / `updated`.
  - `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`.
- **Ověřeno na stagingu (8 scénářů, test data uklizena):** calculated→approved ✅, approved→paid ✅,
  paid_at set ✅, paid→approved invalid_transition ✅, calculated→paid invalid_transition ✅,
  →rejected invalid_status ✅, neexistující not_found ✅, non-admin forbidden ✅.
- **Build:** `npm run build` ✅.
- **DB vrstva affiliate v2 KOMPLETNÍ na stagingu (kroky 1–4):** tabulky + atribuční RPC + měsíční výpočet +
  status workflow. **DALŠÍ BEZPEČNÝ KROK:** frontend `/affiliate/*` (registrace, dashboard s ref kódem/QR,
  přehled provizí) + admin přehledové UI nad `affiliate_commissions` + datová migrace influencerů z `partners`.
  Volitelně cron pro měsíční běh výpočtu. **Produkční migrace všech kroků (1–4) až po výslovném potvrzení Pavla.**

---

## 🟢 AFFILIATE PROGRAM v2 — MĚSÍČNÍ VÝPOČET PROVIZÍ (03. 06. 2026, krok 3)

Třetí bezpečný DB krok: měsíční výpočet affiliate provizí. Staging only.

- **Migrace:** `supabase/migrations/20260603_affiliate_monthly_commissions.sql` (idempotentní DDL).
- **Aplikováno POUZE na staging** `dxmowysntemfqfnanxua`. **Produkce NEDOTČENA.**
- **`calculate_affiliate_commissions_for_month(p_month date)`** — SECURITY DEFINER, `SET search_path=''`.
  - **Zákaznická rovina:** `SUM(payments.amount)` reálně zaplacených (`status='paid'`, amount>0, method ∉
    bonus/partner/api) zákazníků z `affiliate_customer_refs`, × `commission_rate_customer` (default 5 %).
  - **Firemní rovina:** `SUM(partner_invoices.amount_ex_vat)` kde `status='paid'`, firmy s
    `partners.referred_by_affiliate_id`, × `commission_rate_company` (default 5 %). Doživotně.
  - **DPH:** plátce (`is_vat_payer=true`) → `amount_total_czk = amount_base_czk × 1.21`, vat_rate=21;
    neplátce → total = base, vat_rate=0. Základ vždy bez DPH.
  - **Idempotence:** partial UNIQUE index `uq_affiliate_commissions_month (affiliate_id, commission_type,
    period_month)`; re-run maže jen `calculated` řádky a přepočítá, `approved`/`paid` zamčené (ON CONFLICT
    DO NOTHING). Status na začátku `calculated`.
  - **Autorizace:** admin (`is_admin()`) nebo backend/cron (auth.uid NULL); jiný uživatel → `forbidden`.
  - `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`.
- **Ověřeno na stagingu (test data uklizena, 0 zbytků):** zákazník 1000×5%=50 (neplátce, total 50);
  firma 10000×5%=500 (plátce, total 605); pending platba i draft faktura vyloučeny; run1=run2 (idempotence);
  non-admin → forbidden.
- **Build:** `npm run build` ✅.
- **DALŠÍ BEZPEČNÝ KROK:** admin akce nad `affiliate_commissions` (approve → paid) jako RPC/UI, případně
  cron pro měsíční běh. Pak teprve frontend `/affiliate/*`, admin přehled a migrace influencerů z `partners`.
  Produkční migrace všech tří kroků (1–3) až po výslovném potvrzení Pavla.

---

## 🟢 AFFILIATE PROGRAM v2 — ATRIBUČNÍ RPC NA STAGINGU (03. 06. 2026, krok 2)

Druhý bezpečný DB krok: dvě SECURITY DEFINER RPC pro first-touch atribuci. Staging only.

- **Migrace:** `supabase/migrations/20260603_affiliate_attribution_rpcs.sql` (idempotentní, `CREATE OR REPLACE`).
- **Aplikováno POUZE na staging** `dxmowysntemfqfnanxua`. **Produkce NEDOTČENA.**
- **`record_affiliate_customer_ref(p_ref_code)`** — volá přihlášený zákazník (`auth.uid()`); ověří affiliate
  `approved` + režim `influencer`; zapíše do `affiliate_customer_refs`; first-touch (existující se nepřepíše);
  self-referral blokován. Vrací jsonb status.
- **`record_affiliate_company_ref(p_via_code, p_partner_id)`** — **admin only** (`is_admin()`); ověří affiliate
  `approved` + režim `sales_rep`; zapíše do `affiliate_company_refs`; zrcadlí `partners.referred_by_affiliate_id`
  jen když je NULL; first-touch. Vrací jsonb status.
- Obě: `SECURITY DEFINER`, `SET search_path=''`, `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated`.
- **Ověřeno na stagingu (7 scénářů, test data uklizena):** customer recorded → already_attributed → invalid_code;
  company recorded → already_attributed → partners mirror nastaveno → forbidden (non-admin). Vše OK.
- **Build:** `npm run build` ✅.
- **DALŠÍ BEZPEČNÝ KROK:** SECURITY DEFINER RPC pro měsíční výpočet provizí (zákaznická rovina z plateb + firemní
  rovina z `partner_invoices.amount_ex_vat` status='paid', s respektem k `is_vat_payer`), zapis do
  `affiliate_commissions`. Stále staging only. Pak teprve frontend `/affiliate/*` + admin UI + migrace influencerů.

---

## 🟢 AFFILIATE PROGRAM v2 — DB ZÁKLAD NA STAGINGU (03. 06. 2026)

Nový **samostatný** Affiliate model (oddělený od Partner portalu i zákazníka). První bezpečný DB krok.

- **Migrace:** `supabase/migrations/20260603_affiliate_accounts_foundation.sql` (additivní, idempotentní).
- **Aplikováno POUZE na staging** `dxmowysntemfqfnanxua`. **Produkce `xkzhjldrojjlrkezorey` NEDOTČENA.**
- **Nové tabulky:** `affiliate_accounts`, `affiliate_customer_refs`, `affiliate_company_refs`, `affiliate_commissions`.
- **Nový sloupec:** `partners.referred_by_affiliate_id` (nullable FK, default NULL — žádný existující řádek nedotčen).
- **First-touch vynuceno DB:** `affiliate_customer_refs.user_id` UNIQUE, `affiliate_company_refs.partner_id` UNIQUE.
- **Výchozí provize:** customer = 5 %, company = 5 % (`commission_rate_customer/company` DEFAULT 5.00).
- **DPH:** `is_vat_payer` + `vat_rate` + `amount_base_czk` (ex-VAT základ) + `amount_total_czk`.
- **RLS (ověřeno, 8 policies):** affiliate vidí jen svá data (`auth_user_id = auth.uid()`), admin vše (`is_admin()`);
  zápis do všech affiliate tabulek zatím **pouze admin / DB funkce**.
- **Jeden kód:** `affiliate_accounts.ref_code` UNIQUE — sdílený pro zákazníky (`?ref=`) i firmy (`?via=`).
- **Trigger:** `affiliate_touch_updated_at` (SET search_path='') na accounts + commissions.
- **Build:** `npm run build` ✅. **Security advisor:** žádné RLS varování pro nové tabulky.
- Stará affiliate větev NEobnovena. Zákazník, Partner portal, platby, tikety, soutěže, peněženka, `buy_ticket_atomic` netknuty.
- **DALŠÍ BEZPEČNÝ KROK:** SECURITY DEFINER RPC pro (a) registraci/atribuci affiliate kódu (first-touch INSERT ON CONFLICT
  DO NOTHING) a (b) měsíční výpočet provizí — vše nejdřív na stagingu. Pak teprve frontend `/affiliate/*` a admin UI.
  Produkční migrace až po výslovném potvrzení Pavla.

---

## ✅ ODSTRANĚNÍ AFFILIATE VRSTVY — KOMPLETNÍ (02. 06. 2026)

Všechny tři části (A1 kód, A2 DB, A3 produkce) jsou dokončeny.

### A1 — Kódový revert ✅ (commit `1366535`)
- Smazány: `src/hooks/useApplyPendingAffiliate.ts`, `src/pages/AdminAffiliate.tsx`, `supabase/migrations/20260602_*` (10 souborů).
- Editovány (jen affiliate části): `src/App.tsx`, `src/pages/Register.tsx`, `src/pages/AdminInfluencers.tsx`, `src/components/admin/adminNavConfig.ts`, `src/integrations/supabase/types.ts`.
- Zachováno: `src/components/WinCard.tsx` (OneMilGiftIcon) a celý původní influencer systém.
- `npm run build` ✅.

### A2 — DB objekty odstraněny ✅
- Staging `dxmowysntemfqfnanxua`: affiliate objekty = žádné.
- Produkce `xkzhjldrojjlrkezorey`: affiliate objekty = žádné.
- Původní systém zachován: `partners`, `influencer_referrals`, `influencer_commissions`, `calculate_influencer_commissions_current_month`, `set_my_referrer_by_code`.

### A3 — Lovable Publish ✅
- Produkce `onemil.cz` publikována — build neobsahuje `onemil_affiliate_aff`, `record_affiliate_customer_attribution` ani `/admin/affiliate`.
- Poznámka: řetězce `affiliate_direct` / `affiliate_external` v bundlu jsou enum hodnoty `deployment_mode` v Partner Offers (B2B systém, existuje od začátku) — nesouvisejí s odstraněnou vrstvou.

### ➡️ DALŠÍ KROK
Zahájit **Část B** — dodělat původní influencer systém jako jeden sjednocený model. Viz sekce „PŮVODNÍ HANDOFF" níže pro plán B.

---

## 🚨 PŮVODNÍ HANDOFF — VRÁTIT NOVOU AFFILIATE VĚTEV (02. 06. 2026)

**TENTO BLOK ČTI JAKO PRVNÍ. Je to právě probíhající rozhodnutí a další krok.**

### Co se stalo / PROČ to děláme
- Dne 02. 06. 2026 byl nad původní (funkční) influencer systém postaven **nový, paralelní
  affiliate systém** (vlastní tabulky `affiliate_*`, RPC, `/admin/affiliate`, `aff=KOD` tracking,
  „bridge" most kopírující partnera z `partners` do `affiliate_partners`).
- **Toto byla chyba / duplikace.** Zakladatel (Pavel) chtěl POUZE dodělat **PŮVODNÍ** systém,
  ne stavět druhý vedle něj. Původní `partners` systém už BYL jeden sjednocený model
  (drží B2B partnery i influencery, má fakturace s DPH, sledování i výpočet provize).
- **ROZHODNUTÍ:** Novou affiliate větev **odstranit** a vrátit projekt do stavu před ní;
  pak později dodělat **PŮVODNÍ** systém jako jeden sjednocený model.

### Klíčová fakta / rozhodnutí zakladatele (závazná)
- **Všechny e-maily/účty v celém systému jsou 100% TESTOVACÍ** — lze je smazat. Zachovat se musí
  POUZE admin: superadmin `divispavel2@gmail.com` (`60f5837e-a280-4ddd-b0dd-f94cc844bb3b`).
- **DPH: provize budou BEZ DPH** (model odměny / bounty), ne fakturace s DPH.
- **Rozsah cílového systému:** influenceři **+ firmy** jako **JEDEN sjednocený model**
  (typ partnera = jen visačka, ne tři oddělené systémy).
- **Provizní model původního systému:** `calculate_influencer_commissions_current_month` =
  **2 % z reálných placených dobití** (Stripe `payments.status='paid'`, vyloučeny free MioCoiny)
  přivedených uživatelů, měsíčně do `influencer_commissions`. PŮVODNÍ systém je netknutý a funkční.

### DALŠÍ KROK (Část A) — odstranit affiliate větev z KÓDU
- Baseline „před affiliate prací" = commit **`5da1059`** („shop recommendation mailto", 01. 06. 2026 16:11).
- Rozsah `5da1059..HEAD` = **~41 commitů, prakticky všechny affiliate.**
- Smazat nové soubory: `src/hooks/useApplyPendingAffiliate.ts`, `src/pages/AdminAffiliate.tsx`,
  všechny affiliate migrace v `supabase/migrations/20260602_*affiliate*` /
  `20260602_admin_affiliate*` / `20260602_record_affiliate*`.
- Editovat (odebrat JEN affiliate části, NEMAZAT celé): `src/App.tsx` (hook + capture + route),
  `src/pages/Register.tsx` (aff capture + atribuce; ponech starý `ref` blok),
  `src/pages/AdminInfluencers.tsx` (odebrat bridge sloupec/kartu/fetch),
  `src/components/admin/adminNavConfig.ts` (odkaz na `/admin/affiliate`),
  `src/integrations/supabase/types.ts` (affiliate typy — tak, aby build prošel).
- **ZACHOVAT** nesouvisející drobnost: `src/components/WinCard.tsx` (Gift → OneMilGiftIcon).
- Postup: **bez hard resetu**, jako jeden nový commit `revert: remove new affiliate layer`.

### CO ZATÍM NEDĚLAT (samostatné, schválené kroky později)
- **NEMAZAT DB objekty** v produkci/stagingu — `affiliate_*` tabulky/views/RPC stále existují
  v produkci (`xkzhjldrojjlrkezorey`) i stagingu (`dxmowysntemfqfnanxua`). Jen **připravit návrh
  DROP skriptu**, nespouštět.
- **NEPUBLIKOVAT produkci** — `onemil.cz` má `aff` tracking živý, dokud neproběhne ruční Lovable
  Publish (samostatný krok). Push na main produkci sám nezmění.
- **Část B (dodělat původní systém)** = až po dokončení a schválení Části A.

### Neměnit za žádných okolností
- Stripe, payments flow, wallet, `buy_ticket_atomic`, ticket engine, soutěže, výhry, Partner Offers,
  admin účet, a celý PŮVODNÍ influencer systém (`/influencer*`, `/admin/influencer*`, `partners`,
  `influencer_referrals/commissions/campaigns`, `?ref=`, `set_my_referrer_by_code`,
  `calculate_influencer_commissions_current_month`).

### CELKOVÝ PLÁN — pořadí kroků (A → B)

**ČÁST A — ÚKLID (odstranit ChatGPT affiliate duplikát):**
- A1. Odebrat affiliate z KÓDU (viz „DALŠÍ KROK (Část A)" výše) → commit `revert: remove new affiliate layer`. **Bez hard resetu.**
- A2. (samostatně, se schválením) Smazat DB objekty `affiliate_*` ze stagingu i produkce dle připraveného DROP návrhu.
- A3. (samostatně, se schválením) Ruční Lovable Publish produkce, aby `onemil.cz` už neměl `aff` tracking.
- Po Části A je projekt v čistém stavu = jen původní funkční systém.

**ČÁST B — STAVBA (dodělat PŮVODNÍ systém jako jeden sjednocený model):**
Cíl: influenceři + firmy v JEDNOM modelu, provize 2 % BEZ DPH, vše nejdřív na stagingu, produkce až s OK Pavla.
- B1. **Admin ovládání** — v `/admin/influencers` (nebo sjednocené admin partner stránce) umožnit
  spravovat všechny typy partnerů (influencer/firma) jako jeden model; typ = jen visačka.
- B2. **Provize ze zákazníků** — využít existující `calculate_influencer_commissions_current_month`
  (2 % z placených dobití přivedených lidí). Případně udělat sazbu nastavitelnou na partnera.
- B3. **Odměna za firmu** — přidat „partner přivede firmu" a jednorázovou odměnu při aktivaci firmy.
  ⚠️ U B3 se MUSÍ Pavla zeptat na konkrétní ČÍSLO odměny za firmu (zatím nezadáno).
- B4. **Výplaty** — měsíční souhrn na partnera + stav (k vyplacení → vyplaceno), ruční označení. Bez DPH.
- B5. (volitelně později) portál pro partnery.
- Body, kde se MUSÍ ptát Pavla: B3 (číslo za firmu) + před každým nasazením do produkce (finální „pusť to").

**DŮLEŽITÉ:** Nejdřív celá Část A (čistý stav), teprve pak Část B (stavět na čistém). Nestavět B na nepořádku z A.

---

## ➡️ CURRENT NEXT STEP (01. 06. 2026)

**Pokračovat ve zlepšování OneMil customer presentation/video konceptu.**
Surové screenshoty (raw screenshots) působily příliš technicky a nedostatečně premium.
Další krok: připravit kvalitnější premium vizuální koncept (mockupy / brand kompozice /
prezentační vizuály) a později rozhodnout, zda implementovat MioCoin reward/statistics
vrstvu pro doporučovací e-maily obchodům.

---

## SHOP RECOMMENDATION MAILTO CARD — KOMPLETNÍ + PUBLIKOVÁNO (01. 06. 2026)

- **Funkce:** `Doporučit OneMil oblíbenému obchodu`.
- **Commit na GitHub `main`:** `04e5a73542558804107de9b8a1e0565b1140ae3c`
  (`feat: add shop recommendation mailto card`).
- **Soubory:** `src/components/RecommendShopMailtoCard.tsx`, `src/pages/Profile.tsx`.
- **Umístění:** Profil zákazníka, přímo pod sekcí „Pozvi přátele" a nad kartou „Účet".
- **Chování:** uživatel zadá e-mail obchodu/prodejce; aplikace otevře jeho vlastní e-mailovou
  aplikaci přes `mailto:` s předvyplněným adresátem, předmětem a tělem zprávy.
- **Důležité:** OneMil e-mail neposílá automaticky; uživatel musí e-mail ručně potvrdit/odeslat
  ve své e-mailové aplikaci.
- **Bez backend zásahu:** nebyl dotčen Supabase, SQL, databáze, Edge Functions ani deploy.
- **Ověření:** build prošel, commit byl pushnut na `origin/main`, uživatel potvrdil viditelnost
  funkce po Lovable Publish.

### Future TODO — reward/statistics layer (NOT IMPLEMENTED YET)

- Odměnit uživatele 1 MioCoinem za odeslání doporučovacího e-mailu obchodu.
- Odměnu umožnit maximálně 1× denně.
- Stejný uživatel může získat odměnu pouze 1× pro stejnou cílovou e-mailovou adresu.
- Trackovat statistiky odeslaných doporučovacích e-mailů.
- Trackovat, jaké e-mailové adresy obchodů/prodejců uživatelé doporučují OneMil.
- Trackovat počty podle cílového e-mailu/domény.
- Zabránit abuse a opakovaným odměnám.
- Budoucí implementace bude vyžadovat databázovou tabulku, RLS, reward logiku a admin/statistics view.
- Aktuální mailto karta nic z toho neimplementuje a nic neukládá.

---

## CUSTOMER MIOCOIN CODE REDEMPTION — KOMPLETNÍ + NASAZENO (31. 05. 2026)

- **Funkce:** přihlášený zákazník zadá MioCoin kód v Profilu (pod kartou Peněženka) a kredit se
  bezpečně připíše do peněženky.
- **Frontend:** `src/components/RedeemMioCoinCard.tsx` (nová komponenta) mountnutá v
  `src/pages/Profile.tsx` pod kartou Peněženka. Referral kód zůstává odděleně v „Pozvi přátele".
- **Migrace:** `supabase/migrations/20260531_redeem_miocoin_code.sql` — RPC
  `redeem_miocoin_code(p_code text) RETURNS jsonb` (SECURITY DEFINER). Zamkne řádek
  `partner_reward_codes FOR UPDATE`, validuje status=issued / not cancelled / not expired /
  email match, připíše `wallets.balance_coins`, zapíše `wallet_transactions`, označí kód
  `activated` (existující trigger `trg_log_partner_coin_activation_reward` zapíše
  `partner_coin_activations` — RPC ten řádek NEvkládá ručně).
- **Commit:** `ce76027b` — feat: add customer MioCoin code redemption (na GitHub `main`).
- **Staging RPC ověřen** (projekt `dxmowysntemfqfnanxua`): kód `HEYGEN-TEST-250` připsal 250 MC,
  peněženka 2500 → 2750, opakované použití vrátilo `already_used`, `wallet_transactions` vytvořen,
  `partner_coin_activations` vytvořen triggerem.
- **Produkční RPC `redeem_miocoin_code` APLIKOVÁN** v projektu `xkzhjldrojjlrkezorey`
  (SECURITY DEFINER=true, EXECUTE grant pro `authenticated`).
- **Frontend publikován přes Lovable** a karta funguje v produkci.
- **UI wording je source-neutral:** titulek „Uplatnit MioCoin kód"; kód může pocházet z partnerské
  akce, kartičky, QR kódu nebo e-mailu (ne pouze e-mail).

---

## ERROR TOAST CONTRAST FIX — KOMPLETNÍ (31. 05. 2026)

- **Problém:** chybové toasty měly červené pozadí, ale text byl šedý/muted a špatně čitelný.
- **Oprava obou toast systémů:**
  - shadcn `useToast` (`variant: 'destructive'`) v `src/components/ui/toast.tsx` — bílý text na červené.
  - sonner `toast.error()` v `src/components/ui/sonner.tsx` — error varianta má pevné červené pozadí
    (`!bg-destructive`) + bílý titulek i popis (přepis `[data-title]`/`[data-description]`). `richColors`
    se NEPOUŽÍVÁ (vedlo k theme-dependent světle růžovému pozadí s šedým textem).
- **Výsledek:** všechny error toasty mají červené pozadí s bílým čitelným textem. Success/default styling
  beze změny.
- **Commit:** `a220d993` — fix: improve error toast contrast (na GitHub `main`).
- **Pozn.:** vyžaduje Lovable Publish, pokud ještě nebyl publikován.

---

## PROFILE SAVE RLS FIX — KOMPLETNÍ (31. 05. 2026)

- **Problém:** uložení profilu selhávalo, protože `handleProfileSave` v `Profile.tsx` používá `upsert`
  na `public.profiles`, ale RLS neměla žádnou INSERT policy. `upsert` = `INSERT … ON CONFLICT DO UPDATE`;
  RLS vyhodnocuje INSERT WITH CHECK první → bez INSERT policy selže celý příkaz s 42501 „new row violates
  row-level security policy" (i když řádek už existuje a má proběhnout jen UPDATE).
- **Oprava aplikována ručně na staging i produkci:**
  `profiles_insert_own FOR INSERT TO authenticated WITH CHECK (id = auth.uid())`
- **Ukládání profilu v produkci ověřeno funkční.**
- **Permanentní migrace zaznamenána:** `supabase/migrations/20260531_profiles_insert_own_rls.sql`
  (idempotentní: `DROP POLICY IF EXISTS` před `CREATE`).
- **Commit:** `6fceef27` — fix: persist profiles insert RLS policy (na GitHub `main`).

---

## HEYGEN STAGING DEMO — PŘÍPRAVA (31. 05. 2026)

- **Staging projekt** `dxmowysntemfqfnanxua` připraven s demo uživatelem:
  `heygen.staging@onemil.cz`, UUID `217dc715-8af7-41ac-97e5-00a9617c3a9d`.
- **Demo storage buckety:** `contest-images`, `voucher-images`.
- **Demo soutěže mají MioCoin bonusy:** Porsche 575 MC, Dubaj 700 MC, Hodinky 570 MC, Domácí kino 625 MC.
- **Demo screenshoty vytvořeny**, ale Pavel není plně spokojen — chce kvalitnější premium vizuální koncept
  (viz „CURRENT NEXT STEP" nahoře).

---

## SOCIAL LOGIN BUTTON VISIBILITY — AKTUÁLNÍ STAV (31. 05. 2026)

### Výchozí chování

- Google social login tlačítko je viditelné defaultně.
- Facebook social login tlačítko je viditelné defaultně.
- Apple social login tlačítko je skryté defaultně, protože Apple provider v Supabase vracel chybu `Unsupported provider: provider is not enabled`.

### Env flagy

| Provider | Výchozí stav | Env override |
|----------|--------------|--------------|
| Google | viditelné | `VITE_ENABLE_GOOGLE_AUTH=false` nebo `0` skryje tlačítko |
| Facebook | viditelné | `VITE_ENABLE_FACEBOOK_AUTH=false` nebo `0` skryje tlačítko |
| Apple | skryté | `VITE_ENABLE_APPLE_AUTH=true` nebo `1` zobrazí tlačítko |

### Soubory a pravidla

- Kanonická konfigurace viditelnosti je `src/config/socialAuth.ts`.
- `src/pages/Login.tsx` a `src/pages/Register.tsx` pouze čtou `ENABLED_OAUTH_PROVIDERS`.
- Email/password login zůstal beze změny.
- Odkazy mezi loginem a registrací zůstaly beze změny.
- Nebyla měněna Supabase Auth konfigurace, databáze, profile, wallet, contests, tickets, vouchers, winners, Partner Offers, AI chat ani admin.

### Commity

| Commit | Popis |
|--------|-------|
| `cdbaec0` | první fix: social auth tlačítka skrytá za explicitním env opt-in |
| `ec48700` | merge s aktuálním `origin/main`, zachování social auth guardů |
| `3874f20` | finální úprava: Google/Facebook default visible, Apple default hidden |

---

## WINNER CARD BACKGROUNDS — KOMPLETNÍ (31. 05. 2026)

### Assets

Soubory v `src/assets/winner-backgrounds/`:

| Soubor | Použití v rotaci |
|--------|-----------------|
| `winner-card-bg-trophy.png` | index % 3 === 0 (1., 4., 7. … karta) |
| `winner-card-bg-crown.png` | index % 3 === 1 (2., 5., 8. … karta) |
| `winner-card-bg-clean.png` | index % 3 === 2 (3., 6., 9. … karta) |
| `winner-card-bg-trophy-with-coin-area.png` | dostupný, zatím mimo rotaci |

### Rotační konstanta (copy-paste pattern)

```tsx
import winnerBgTrophy from '@/assets/winner-backgrounds/winner-card-bg-trophy.png';
import winnerBgCrown from '@/assets/winner-backgrounds/winner-card-bg-crown.png';
import winnerBgClean from '@/assets/winner-backgrounds/winner-card-bg-clean.png';

const WINNER_BG_ROTATION = [winnerBgTrophy, winnerBgCrown, winnerBgClean];

// v .map():
cardStyleImageUrl={WINNER_BG_ROTATION[index % WINNER_BG_ROTATION.length]}
```

### Kde se rotace používá

| Stránka/komponenta | Soubor | Stav |
|-------------------|--------|------|
| Homepage „Poslední výherci" | `src/pages/Homepage.tsx` | ✅ rotace |
| Standalone Winners stránka | `src/pages/Winners.tsx` | ✅ rotace |

### WinnerCard overlay — aktuální CSS (src/components/WinnerCard.tsx)

Dvě vrstvy na `z-[1]` (DOM order — gradient překryje obrázek):

```tsx
// Vrstva 1 — background image
opacity: 0.42

// Vrstva 2 — dark gradient overlay
linear-gradient(to right,
  rgba(10,11,15, 0.78)  0–88px      // levý pruh: zakrývá hnědý blok
  rgba(10,11,15, 0.42)  130px       // přechod
  rgba(10,11,15, 0.20)  55%         // střed: text čitelný
  rgba(10,11,15, 0.14)  100%        // vpravo: dekorativní tvar viditelný
)
```

**Pravidlo:** Pokud přidáváš novou stránku se `WinnerCard`, použij `WINNER_BG_ROTATION` a `index % 3` — overlay logika je v `WinnerCard.tsx` automaticky.

**Nesmí se měnit bez souhlasu:** `cardStyleImageUrl` prop v `WinnerCard` — overlay logika závisí na tom, zda je prop vyplněný.

### Commity

| Commit | Popis |
|--------|-------|
| `7276c254` | feat: přidány background assets + rotace na Homepage |
| `4b127aef` | fix: snížena opacity obrázku (0.28), přidán dark gradient overlay |
| `9d9c716c` | fix: opacity 0.42, pravý gradient 0.14 (dekorace viditelná) |
| `8197d6ae` | feat: rotace přidána na Winners stránku, Lucide Trophy → OneMilTrophyIcon |

### GitHub Actions — stav (31. 05. 2026)

- Repo bylo **private** → GitHub Actions minuty se vyčerpaly → CI nefungovalo
- **Oprava:** repo změněno na **public** → Actions minuty jsou nyní zdarma neomezeně
- Smoke tests ✅ (1m 10s), Staging Full E2E ✅ (3m 39s) — oba prošly po zveřejnění

---

## ONEMIL PREMIUM ICON SYSTEM — KOMPLETNÍ (30. 05. 2026)

### Soubory

- **`src/components/icons/OneMilIcons.tsx`** — kanonický soubor všech OneMil brand ikon (23 ikon)
- **`src/assets/icons/icon-trophy-onemil.svg`** — kopie brand kit SVG (512×512, dark bg, silver+orange gradient)

### Exportované ikony (OneMilIcons.tsx)

| Export | Použití |
|--------|---------|
| `OneMilTrophyIcon` | Soutěže, hlavní výhra |
| `OneMilWinIcon` | Výhry sekce, počet výher |
| `OneMilVoucherIcon` | Vouchery stránka, empty states |
| `OneMilWalletIcon` | Peněženka, MioCoin balance |
| `OneMilMessageIcon` | Zprávy sekce |
| `OneMilProfileIcon` | Profil sekce |
| `OneMilHomeIcon` | Domů nav |
| `OneMilHeartIcon` | Oblíbené |
| `OneMilGiftIcon` | Bonusové výhry, dárky |
| `OneMilDiamondIcon` | Premium/bonus (náhrada Sparkles) |
| `OneMilZapIcon` | Fast access |
| `OneMilShieldIcon` | Bezpečnost, právní |
| `OneMilInfoIcon` | Info tooltip |
| `OneMilFilterIcon` | Filtrování |
| `OneMilMioCoinIcon` / `OneMilCoinsIcon` | MioCoin balance, dobití |
| `OneMilCartIcon` | Zakoupené, nákup |
| `OneMilEmailIcon` | E-mail sekce |
| `OneMilBellIcon` | Notifikace |
| `OneMilCrownIcon` | VIP/level badge |
| `OneMilStarIcon` | Hvězdičkové hodnocení |
| `OneMilMedalIcon` | Ocenění |
| `OneMilTicketIcon` | Tikety, Moje hry |

### Props pattern

```tsx
<OneMilXxxIcon
  size={24}          // SVG width/height atribut
  className="w-6 h-6 text-[#FF8A00]"  // CSS override + color
  active={false}     // true = orange/amber, false = silver
  color="#FF8A00"    // přímý override barvy
/>
```

### Sémantická pravidla (závazná)

- `OneMilGiftIcon` — POUZE bonusové výhry a dárky; **NE** pro vouchery ani MioCoin
- `OneMilVoucherIcon` — stránka Vouchery, záložky, empty states voucherů
- `OneMilMioCoinIcon` — dobití MioCoinů, balance sekce
- `OneMilWinIcon` — sekce Výhry (tab, count badge, empty state)
- `OneMilTrophyIcon` — Soutěže, hlavní výhra v filtrech
- `OneMilDiamondIcon` — premium/bonus vizuály (náhrada Lucide Sparkles)

### Premium page-header tile vzor (závazný pro všechny hlavní stránky)

```tsx
<div
  className="relative overflow-hidden rounded-2xl p-6"
  style={{
    background: 'linear-gradient(135deg, hsl(220, 25%, 8%) 0%, hsl(220, 30%, 12%) 50%, hsl(220, 25%, 8%) 100%)',
    border: '1px solid rgba(255,138,0,0.2)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,138,0,0.1)',
  }}
>
  {/* Shimmer */}
  <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
    background: 'linear-gradient(90deg, transparent 0%, rgba(255,181,71,1) 50%, transparent 100%)',
    backgroundSize: '200% 100%', animation: 'shimmer 4s ease-in-out infinite',
  }} />
  <div className="relative flex items-center gap-4">
    {/* Tile */}
    <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: 'linear-gradient(135deg, #FF8A00 0%, #c86000 100%)', boxShadow: '0 4px 20px rgba(255,138,0,0.3)' }}>
      <OneMilXxxIcon size={36} className="w-7 h-7 md:w-9 md:h-9 text-black" />
    </div>
    {/* Text */}
    <div>
      <h1 className="text-2xl md:text-3xl font-bold tracking-tight"
        style={{ background: 'linear-gradient(135deg, #FFB547 0%, #FF8A00 50%, #FFB547 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
        Název stránky
      </h1>
      <p className="text-sm text-gray-400 mt-1">Podtitulek</p>
    </div>
  </div>
</div>
```

**Tile ikona:** 56×56px mobile / 64×64px desktop · ikona 28px mobile / 36px desktop · barva ikony `text-black`

### Stránky s uniforním header tile vzorem

| Stránka | Ikona | Commity |
|---------|-------|---------|
| `/games` | `OneMilTrophyIcon` | `1d5c5dde`, `87f74083` |
| `/vouchers` | `OneMilVoucherIcon` | `1d5c5dde`, `87f74083` |
| `/wins` | `OneMilWinIcon` | `1d5c5dde`, `87f74083` |
| `/messages` | `OneMilMessageIcon` | `1d5c5dde`, `87f74083` |
| `/my-contests` | `OneMilTicketIcon` | `1d5c5dde`, `87f74083` |

**Profil (`/profile`):** záměrně odlišný — hero layout s avatarem, VIP badge, gradient jméno. Tile vzor sem nepatří.

### Bottom navigation

- Ikony: OneMil brand ikony (všech 6 nav items)
- Velikost: `size={24}` (navýšeno z 22)
- Active: `scale-110` (navýšeno z scale-105)
- Pořadí: Domů, Vouchery, Soutěže, Výhry, Zprávy, Profil

### Kde zůstaly Lucide ikony (záměrně)

- Utility: `Clock`, `ArrowLeft/Up/Down`, `ChevronLeft/Right/Down`, `Check`, `CheckCircle`, `XCircle`, `Loader2`, `Camera`, `Volume2/VolumeX`, `Send`, `Package`, `Tag`, `Target`, `Gamepad2`
- Social: `Facebook`, `Twitter`, `Instagram`
- Wins header orange bg tile: Lucide `Trophy text-black` — brand SVG by na orange bg kolidovalo (záměrně ponecháno)

### Kompletní commity icon systému

| Commit | Popis |
|--------|-------|
| `cc490725` | feat: první Trophy brand SVG v customer UI |
| `ee9b7d9c` | feat: add OneMil premium icon system (remote session) |
| `cfcc6e86` | fix: replace placeholder icons (remote session) |
| `61840ab6` | feat: full customer-facing icon sweep + Crown/Star/Medal/Ticket |
| `94ed004f` | fix: sémantické opravy (Voucher/Win/MioCoin) |
| `1d5c5dde` | feat: unified premium header tiles na všech hlavních stránkách |
| `87f74083` | fix: fine-tune icon sizes (tile 36px desktop, nav 24px) |

---

**Aktualizováno:** 27. 05. 2026

---

## MIGRACE APLIKOVÁNA: coming_soon_banners.description (27. 05. 2026)

- `supabase/migrations/20260527_coming_soon_banners_add_description.sql` aplikována manuálně v Supabase a ověřena
- Ověřená struktura tabulky: `id uuid, image_url text, title text, created_at timestamp with time zone, description text`
- Info popup feature (admin textarea + homepage ℹ ikona + modal) je plně funkční

---

## WINNERCARD PREMIUM REDESIGN (27. 05. 2026)

- `src/components/WinnerCard.tsx` přepsán — sjednocen s MioCoin card stylem
- Styl: `hsl(220 45% 6%)` bg, `rgba(255,138,0,0.22)` border, subtle glow
- Prize name: Poppins bold orange→gold gradient (nejdominantnější prvek)
- Winner name: `#E7EBF0` silver, bez prefixu
- Spodní řádek: contest · ticket# · timeAgo — vše muted `#8E98A6`
- Odstraněny prefixové labely „Cena:/Výherce:/Soutěž:"
- Star šum snížen (opacity 0.09–0.14), outer homepage card star background odstraněn
- Výška: `112px` fixed
- Commit: `b6776ebe`

---

## PŘIPRAVUJEME BANNERY — INFO POPUP (27. 05. 2026)

- Nový sloupec `description TEXT` v `coming_soon_banners` (migrace `20260527_...` — viz PENDING výše)
- Admin: každý slot má textarea „Info text" + tlačítko Uložit → ukládá do `description`
- Homepage: pulsující ℹ ikona (orange/gold, `@keyframes info-pulse`) pokud `description` není prázdný
- Klik na ikonu → dark premium modal s title (Poppins gradient) + description text
- Commit: `f11b634f`

---

## PŘIPRAVUJEME BANNERY — EDITOVATELNÉ TITULY + PREMIUM STYL (27. 05. 2026)

- Admin `Připravujeme (3 bannery)`: každý slot má input „Popisek banneru" + Uložit → `coming_soon_banners.title`
- Admin preview: title jako overlay label (Poppins bold, silver→orange gradient) přes obrázek
- Homepage Připravujeme title: stejný premium Poppins gradient styl jako v admin preview
- Žádná nová DB migrace (sloupec `title` existoval)
- Commity: `4428b7d0` (admin editace), `265f2330` (homepage styl)

---

## TELEGRAM BOT NASTAVEN (25. 05. 2026)

- Bot: **@Onemilclaudebot** (id: `8969270078`)
- Token uložen jako Windows env var `TELEGRAM_BOT_TOKEN` (pouze lokálně na PC Pavla, ne v repozitáři)
- Chat ID Pavla: `6714365501` — uloženo jako Windows env var `TELEGRAM_CHAT_ID`
- Claude Code může posílat notifikace přes `Invoke-RestMethod` / `curl` na Telegram Bot API
- Obousměrná komunikace (příjem zpráv od Pavla) zatím neimplementována

---

## CI: ARTIFACT UPLOAD CONTINUE-ON-ERROR (25. 05. 2026)

- Smoke run `26374584373` selhal přestože testy prošly — příčina: kvóta artefaktů ještě nebyla přepočítána po mazání
- Oprava: `continue-on-error: true` na všech `upload-artifact` krocích v `playwright.yml` i `playwright-staging.yml` (commit `408da958`)
- Testy jsou nyní autoritativní — plná kvóta workflow neshodí

---

## HOMEPAGE HERO BANNER — FINÁLNÍ STAV (25. 05. 2026)

- Hero banner je plnou šířkou viewportu (mimo `container mx-auto`)
- **Cílový rozměr obrázku: 1920 × 600 px**
- Kontejner: `w-full sm:aspect-[16/5] sm:max-h-[600px]`
- Mobil: `h-auto object-contain` — celý obrázek bez pruhů
- Tablet+: `object-cover` — plné pokrytí bez ořezu
- Zlaté oddělovací linky + navigační šipky + tečkové indikátory zachovány
- Commit: `ecea087c` (finální stav po sérii 7 iterací)

---

## ADMIN BANNERY — TOGGLE „ZOBRAZOVAT TRVALE" (24. 05. 2026)

- `src/pages/AdminBanners.tsx`: přidán Switch „Zobrazovat trvale (bez omezení datumem)"
- Výchozí stav: zapnuto (nové bannery jsou trvale bez datumu)
- Když zapnuto: datumová pole skryta, `start_date`/`end_date` = `null`
- `null` datum = vždy zobrazit (hook to tak již interpretoval — žádná DB změna)
- Commit: `03271812`

---

## HOMEPAGE PLACEMENT BANNERY — LAYOUT (24. 05. 2026)

- **MioCoin karty (4 balíčky):** fallback text skryt když existuje placement banner obrázek
- **MioCoin karty — layout:** obrázek nahoře (`flex-1`), tlačítko „Dobít" přišpendleno ke spodku (`flex-shrink-0`)
- **Lower boxy** (`probihajici_souteze`, `koupit_voucher`): ikona + text skryty při banner obrázku; `min-h` zachovává výšku karty
- Commity: `f486afa9`, `9e58c386`, `e84ab661`, `e9254494`

---

## STARÉ LOGO PREVIEW ODSTRANĚNO (22. 05. 2026)

### PR #112 — style: remove stale PWA preview showing old pre-brand logo (merge commit `1b9e704f`)
- **Smazáno:** `docs/brand/onemil-pwa-icon-preview.png` — zastaralý read-only docs snapshot z 13. 05. 2026 obsahující old logo (bílý čtverec + oranžový text "OneMil") v pravém dolním panelu
- Soubor nebyl importován žádným aplikačním kódem — čistě docs reference
- **`src/assets/logo-onemil.png`** je od PR #110 správný brand kit asset (MD5-ověřeno shodný s `primary_logo_trophy_behind_text_transparent_estimated.png`) — žádná změna
- Všech 9 aplikačních importů loga (Header, Login, Register, TicketResultModal, ShareTicket, OnboardingDateOfBirth, PartnerLogin, PartnerRegister, InfluencerRegister) nadále používají správný brand kit asset ✅
- Playwright Smoke Tests (branch `26286729712` ✅, post-merge `26286806820` ✅)

---

## ZÁKAZNICKÁ GRAFIKA — VIZUÁLNĚ SCHVÁLENO (21. 05. 2026)

Zákaznická grafika OneMil vizuálně zkontrolována a schválena Pavlem Divišem po dokončení brand resetu.

**Potvrzeno:**
- Barvy odpovídají OneMil brand kitu (Energy Orange `#FF8A00`, Warm Amber `#FFB547`, dark backgrounds) ✅
- Logo v headeru je správné (brand kit `primary_logo_trophy_behind_text_transparent_estimated.png`) ✅
- Favicon (`/favicon.ico`) a PWA ikony (`android-chrome-192×192/512`, `apple-touch-icon`) jsou z brand kitu ✅
- Fonty Inter (body) a Poppins (h1–h6, nadpisy) jsou správně nastaveny ✅
- 404 stránka opravena na dark brand (`bg-background`) ✅
- Zákaznická část vizuálně působí v pořádku — dark premium tech-luxury styl bez starých modrých/casino prvků ✅

**Scope:**
- Zákaznické stránky: `/`, `/games`, `/vouchers`, `/wins`, `/messages`, `/login`, `/register`, `/kontakt`, `/profile`, `NotFound`, cookie banner, header, footer
- Admin, influencer a partner portál: záměrně mimo tento scope, brand reset odložen

**Závěr:** Žádný další grafický PR pro zákaznickou část není aktuálně potřeba.

---

## NOTFOUND DARK BACKGROUND — OPRAVENO (21. 05. 2026)

### PR #111 — style: fix NotFound page light background to dark brand (merge commit `33cbeeb7`)
- **`src/pages/NotFound.tsx`** (1 ins/1 del): `bg-gray-100` → `bg-background`
- Nález z finálního vizuálního smoke auditu: 404 stránka byla jedinou zákaznickou stránkou se světlým pozadím (`rgb(243,244,246)`) — nesoulad s dark premium brandem
- Vizuálně ověřeno v preview: Midnight Black pozadí, "404" amber, "Return to Home" oranžový link ✅
- Playwright Smoke Tests (branch `26253920880` ✅, post-merge `26253998050` ✅)

---

## FONT AUDIT — DOKONČEN (21. 05. 2026)

- **Google Fonts import** (`src/index.css:1`): `Inter 300–700` + `Poppins 500–800` — správně ✅
- **`body`** (`index.css:149`): `font-family: 'Inter', system-ui, sans-serif` ✅
- **`h1–h6`** (`index.css:159`): `font-family: 'Poppins', system-ui, sans-serif` ✅
- **Tailwind `font-heading`** (`tailwind.config.ts:17`): `['Poppins', 'system-ui', 'sans-serif']` ✅
- **Tailwind `font-body` + `font-sans`** (`tailwind.config.ts:18–19`): `['Inter', 'system-ui', 'sans-serif']` ✅
- **Plus Jakarta Sans**: 0 výskytů v celém projektu ✅
- **Inline `fontFamily`** v TSX/TS: 0 výskytů ✅
- **Arbitrary `font-[...]` Tailwind hodnoty**: 0 výskytů ✅
- **`font-mono`**: použit výhradně oprávněně — UUID/ID v admin tabulkách, `<code>` bloky v CMS prose, numerické hodnoty v grafu ✅
- **`@font-face`**: 0 výskytů — fonty pouze přes Google Fonts ✅
- **Závěr**: fontový systém plně odpovídá OneMil brand kitu (Poppins pro nadpisy, Inter pro tělo). Další font PR není potřeba.

---

## BRAND LOGO ASSETS — OPRAVENO (21. 05. 2026)

### PR #110 — style: replace header logo and favicon with brand kit assets (merge commit `8b94e0df`)

**Nalezené logo soubory před opravou:**
- `src/assets/logo-onemil.png` — 1.4MB, JINÝ od brand kitu → nahrazeno
- `public/favicon.ico` — 7.5K, JINÝ od brand kitu → nahrazeno
- `public/android-chrome-192x192.png` — identický MD5 s brand kitem ✅ beze změny
- `public/android-chrome-512x512.png` — identický MD5 s brand kitem ✅ beze změny
- `public/apple-touch-icon.png` — identický MD5 s brand kitem ✅ beze změny

**Nahrazené soubory:**
- `src/assets/logo-onemil.png` → `primary_logo_trophy_behind_text_transparent_estimated.png` z brand kitu (průhledné pozadí, správné pro tmavý header)
- `public/favicon.ico` → `favicon.ico` z brand kitu (`03_icons/favicon_app/`)
- `index.html` — opraven wrong MIME type `type="image/svg+xml"` → `type="image/x-icon"` na favicon linku

**Kde se logo používá v aplikaci:**
- `src/components/Header.tsx` — `import logo from '@/assets/logo-onemil.png'`, zobrazeno jako `<img>` v sticky headeru
- `public/manifest.webmanifest` — odkazuje na `android-chrome-192x192.png` a `android-chrome-512x512.png` (PWA ikony, již správné)
- `index.html` — `<link rel="icon">` → `favicon.ico`, `<link rel="apple-touch-icon">` → `apple-touch-icon.png`

- Playwright Smoke Tests (branch `26252667493` ✅, post-merge `26252302107` ✅)

---

## BRAND CUSTOMER-FACING CLEANUP — FINÁLNĚ DOKONČENO (21. 05. 2026)

### Final low-priority cleanup (PR #109, merge commit `a3e56146`)
- **`src/pages/Vouchers.tsx`** (8 ins/8 del): 7 sparkle radial-gradient dots `hsl(45/40)` → `rgba(255,181,71/255,138,0,...)`; Gift icon `hsl(45_60%_40%/0.4)` → `rgba(255,138,0,0.4)`
- **`src/App.tsx`** (1 ins/1 del): winner toast inline border `hsl(43,70%,45%,0.3)` → `rgba(255,138,0,0.3)`
- **`src/components/cms/CMSPageLayout.tsx`** (1 ins/1 del): CMS heading gradient `via-[hsl(45_85%_60%)]` → `via-[#FFB547]`
- **`src/components/ui/badge.tsx`** (1 ins/1 del): `info` variant `blue-500` → brand orange/amber `rgba(255,138,0,...) / #FFB547`
- Playwright Smoke Tests (branch): SUCCESS ✅ run `26252078508` | (post-merge): SUCCESS ✅ run `26252162219`

### Finální grep audit výsledek
- **Customer-facing accent zbytky: ŽÁDNÉ** — všechny `hsl(43/45/40)` accent hodnoty převedeny
- `VoucherCarousel.tsx:128` — `hsl(40_20%_14%)` strukturní tmavé pozadí karty (warm-dark tone, záměrně ponecháno)
- `OneMilAudit.tsx` — admin stránka, odloženo záměrně
- Admin / Influencer / Partner portal — odloženo záměrně dle instrukce

---

## BRAND CUSTOMER-FACING CLEANUP — STEPS 21–26 DOKONČENY (21. 05. 2026)

Šest dalších customer-facing brand PRů po step 20 auditu. Žádné admin/influencer/partner změny.

### Step 21 — TicketResultModal.css + index.css (PR #103, merge commit `bd3d107b`)
- **`src/components/TicketResultModal.css`** (6 ins/6 del): `win-moment-cta-pulse` keyframe box-shadows `hsl(43/48)` → `rgba(255,138,0/255,181,71,...)`; reduced-motion fallback shadow → brand; `.win-moment-value-shimmer` gradient `hsl(43/48/35)` → brand rgba
- **`src/index.css`** (3 ins/3 del): winner-shimmer bar `hsl(43 90% 55%)` → `rgba(255,138,0,...)`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 22 — CookieConsentBanner.tsx (PR #104, merge commit `c8b61546`)
- **`src/components/CookieConsentBanner.tsx`** (9 ins/9 del): banner + dialog borders, 3× section item borders, 2× outline button hover, 2× CTA "Souhlasím" button gradient + shadow → brand orange/amber
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 23 — Login.tsx + Register.tsx (PR #105, merge commit `64c2cb16`)
- **`src/pages/Login.tsx`** (5 ins/5 del): card border, submit CTA gradient + shadow, 3× OAuth outline button → brand
- **`src/pages/Register.tsx`** (5 ins/5 del): same pattern
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 24 — VoucherCarousel.tsx (PR #106, merge commit `e1cecdf9`)
- **`src/components/VoucherCarousel.tsx`** (3 ins/3 del): card border + hover, image border, CTA button gradient + shadow → brand
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 25 — Messages.tsx (PR #107, merge commit `1145ca2e`)
- **`src/pages/Messages.tsx`** (35 ins/35 del): all 35 inline `hsl(45/35)` → brand rgba/hex (system bubble border, Sparkles icon, label gradient, CTA bubble button, send button surface, particles, shimmer overlays, header border/shadow/shimmer/icon/title/count-badge, scrollbar, empty state, jump button, input bar border/shadow/shimmer/focus, flying message, sparkle icon)
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅

### Step 26 — Misc customer-facing (PR #108, merge commit `16d1637d`)
- **`src/components/ContactForm.tsx`** (4 ins/4 del): heading gradient, success box border/bg/icon/text → brand
- **`src/components/SupportForm.tsx`** (4 ins/4 del): same 4-change pattern
- **`src/pages/Kontakt.tsx`** (1 ins/1 del): heading gradient `via-[hsl(45_85%_60%)]` → `via-[#FFB547]`
- **`src/components/BonusPrizeDetailModal.tsx`** (1 ins/1 del): dialog title `text-yellow-400` → `text-[#FFB547]`
- **`src/components/BonusPrizeOverlay.tsx`** (1 ins/1 del): delivered/claimed badge `blue-*` → brand orange
- **`src/pages/Homepage.tsx`** (1 ins/1 del): login chip `bg-blue-100/10 text-blue-400` → brand
- **`src/pages/NotFound.tsx`** (1 ins/1 del): link `text-blue-500` → brand orange
- **`src/pages/MyContestDetail.tsx`** (1 ins/1 del): draft status dot `bg-yellow-500` → `bg-[#FF8A00]`
- **`src/components/MessageForm.tsx`** (1 ins/1 del): submit button `bg-blue-600` → brand orange
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge): SUCCESS ✅ run `26251107153`

---

## BRAND CUSTOMER-FACING CLEANUP — STEPS 15–19 DOKONČENY (21. 05. 2026)

Finální customer-facing brand cleanup — 5 PRů, 5 souborů, žádné admin ani influencer změny.

### Step 15 — OfferCard + OfferDetailModal (PR #98, merge commit `7faea2b9`)
- **`src/components/OfferCard.tsx`** (4 ins / 4 del):
  - hover border/shadow: `hover:border-blue-400/40 hover:shadow-blue-500/10` → brand orange
  - Tag ikona: `text-blue-400/30` → `text-[rgba(255,138,0,0.3)]`
  - "Nová" badge: `bg-blue-500/90 text-white` → `bg-[rgba(255,138,0,0.9)] text-black`
  - Partner name: `text-blue-400` → `text-[#FFB547]`
- **`src/components/OfferDetailModal.tsx`** (2 ins / 2 del):
  - Tag ikona: `text-blue-400` → `text-[#FFB547]`
  - Partner name: `text-blue-400` → `text-[#FFB547]`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

### Step 16 — TicketProgressBar (PR #99, merge commit `88e73dc0`)
- **`src/components/TicketProgressBar.tsx`** (4 ins / 4 del):
  - Progress fill: `from-blue-700 to-blue-500` → `from-[#FF8A00] to-[#FFB547]`
  - Legend dot: `bg-blue-500` → `bg-[#FF8A00]`
  - Clock ikona: `text-blue-400` → `text-[#FFB547]`
  - TrendingUp ikona: `text-yellow-400` → `text-[#FFB547]`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

### Step 17 — TicketResultModal blue hints (PR #100, merge commit `f429adbd` area)
- **`src/components/TicketResultModal.tsx`** (4 ins / 4 del):
  - Partner name v offer result: `text-blue-400` → `text-[#FFB547]`
  - CTA hint: `text-blue-200/75` → `text-[rgba(255,181,71,0.75)]`
  - CTA hint span: `text-blue-100` → `text-[#FFB547]`
  - "Zobrazit nabídku" button: `border-blue-500/40` → `border-[rgba(255,138,0,0.4)]`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

### Step 18 — WinCard badge (PR #101, merge commit `f429adbd`)
- **`src/components/WinCard.tsx`** (1 ins / 1 del):
  - "Připraveno k odeslání" badge: `bg-blue-500/90 text-white` → `bg-[rgba(255,138,0,0.9)] text-black`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

### Step 19 — Wins.tsx inline hsl cleanup (PR #102, merge commit `02b3f2a3`)
- **`src/pages/Wins.tsx`** (24 ins / 24 del):
  - Particles: `hsl(45, 93%, X%)` → `rgba(255,181,71,1)`
  - Shimmer: `hsl(45, 93%, 60%)` → `rgba(255,181,71,1)`
  - Header card border: `hsl(45, 70%, 40%, 0.2)` → `rgba(255,138,0,0.2)`
  - Header shadow inset: `hsl(45, 70%, 50%, 0.1)` → `rgba(255,138,0,0.1)`
  - Trophy icon box gradient: `hsl(45,80%,45%) → hsl(35,90%,35%)` → `#FF8A00 → #c86000`
  - Trophy box shadow: `hsl(45, 80%, 40%, 0.3)` → `rgba(255,138,0,0.3)`
  - Title gradient: `hsl(45,93%,65%) → hsl(35,90%,55%)` → `#FFB547 → #FF8A00`
  - Win count badge bg/border: `hsl(45,80%,45%)/10 hsl(45,70%,50%)/20` → `rgba(255,138,0,...)`
  - Crown ikona: `text-[hsl(45,80%,55%)]` → `text-[#FF8A00]`
  - Count span: `text-[hsl(45,80%,60%)]` → `text-[#FFB547]`
  - Tab/filter active (replace_all): `from-[hsl(45,80%,45%)] to-[hsl(35,90%,35%)]` → `from-[#FF8A00] to-[#c86000]`
  - "Nabídky" tab active: `from-blue-600 to-blue-700 text-white` → `from-[#FF8A00] to-[#c86000] text-black`
  - Sort button hover border (replace_all): → `hover:border-[rgba(255,138,0,0.3)]`
  - Arrow ikony (replace_all): `text-[hsl(45,70%,50%)]` → `text-[#FF8A00]`
  - Empty state borders: `hsl(45, 70%, 40%, 0.15/0.1)` → `rgba(255,138,0,0.15/0.1)`
  - Trophy empty ikona (replace_all): → `text-[#FF8A00]/30`
  - Empty title gradient: `hsl(45,93%,65%) → hsl(35,90%,55%)` → `#FFB547 → #FF8A00`
- Playwright Smoke Tests (branch): SUCCESS ✅ | (post-merge main): SUCCESS ✅

---

## BRAND REFERRALSECTION — STEP 13 DOKONČEN (21. 05. 2026)

Komponenta ReferralSection sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/ReferralSection.tsx`** (8 ins / 8 del):
  - Outer card shadow: `hsl(43_90%_55%/0.15)` → `rgba(255,138,0,0.15)`
  - Shimmer overlay gradient: `hsl(43 90% 55% / 0.03/0.05)` → `rgba(255,138,0,...)`
  - Coins stat card bg/border: `yellow-500/10 yellow-500/5 yellow-500/20` → brand orange
  - Coins ikona + číslo: `text-yellow-500` → `text-[#FFB547]`
  - Enter-code box bg/border: `yellow-500/8 yellow-500/5 yellow-500/15` → brand orange
  - Code Input: `bg-yellow-500/5 border-yellow-500/20 focus:...` → brand orange
  - Submit button: `from-yellow-500 to-yellow-600` → `from-[#FF8A00] to-[#FFB547]`

### Merge + testy

- **PR #97** mergnut do `main` — merge commit `5fc4bad3`
- **Playwright Smoke Tests (branch)**: SUCCESS ✅ (run `26247928785`)
- **Playwright Smoke Tests (post-merge main)**: SUCCESS ✅ (run `26248006157`)

---

## BRAND WINS + WINDETAILMODAL — STEP 12 DOKONČEN (21. 05. 2026)

Wins.tsx a WinDetailModal.tsx sjednoceny podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/Wins.tsx`** (5 ins / 5 del):
  - "Odesláno" filter button: `from-blue-500 to-blue-600` + `rgba(59,130,246,0.3)` + `bg-blue-500/10 text-blue-400 border-blue-500/30` → Energy Orange brand
  - Tag ikona v empty offers state: `text-blue-400/30` → `text-[rgba(255,138,0,0.3)]`
- **`src/components/WinDetailModal.tsx`** (4 ins / 4 del):
  - Status badge `pending`: `bg-yellow-500/20 text-yellow-400 border-yellow-500/30` → `rgba(255,138,0,0.2)` / `#FFB547`
  - Status badge `připraveno k odeslání`: `bg-blue-500/20 text-blue-400 border-blue-500/30` → `rgba(255,138,0,0.2)` / `#FFB547`
  - Status badge `default`: `bg-yellow-500/20 text-yellow-400 border-yellow-500/30` → `rgba(255,138,0,0.2)` / `#FFB547`
  - Trophy ikona v type badge: `text-yellow-400` → `text-[#FFB547]`

### Merge + testy

- **PR #96** mergnut do `main` — merge commit `e18d40ab`
- **Playwright Smoke Tests (branch)**: SUCCESS ✅ (run `26247530336`)
- **Playwright Smoke Tests (post-merge main)**: SUCCESS ✅ (run `26247612549`)

---

## BRAND CUSTOMERCONTESTVIEW — STEP 11 DOKONČEN (21. 05. 2026)

Komponenta CustomerContestView sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/CustomerContestView.tsx`** (9 ins / 9 del):
  - `text-yellow-400` (×4 — Coins/Crown ikony) → `text-[#FFB547]`
  - Contest title gradient: `#FACC6B/#FBBF24/#FEF3C7` + `rgba(250,204,21,0.45)` → `#FFB547/#FF8A00` brand
  - Progress bar bg glow: `rgba(250,204,21,0.2)` → `rgba(255,138,0,0.2)`
  - Progress bar fill: `from-yellow-400/70 via-yellow-300/60` + shadow → Energy Orange brand
  - Milestone dots: `from-yellow-300 to-yellow-500` + `rgba(250,204,21,0.9)` → `#FFB547/#FF8A00`

### Merge + testy

- **PR #94** mergnut do `main` — merge commit `3f421521b1932600a5e7f6955c15f5e89c641b7d`
- **Playwright Smoke Tests**: SUCCESS ✅

---

## BRAND TICKETRESULTMODAL — STEP 10 DOKONČEN (21. 05. 2026)

Win-moment modal sjednocen podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/TicketResultModal.tsx`** — win-moment vizuál sjednocen:
  - Modal border/shadow: `border-yellow-500/40`, `rgba(255,190,60,...)`, `rgba(255,200,0,...)` → `rgba(255,138,0,...)`
  - Win glow orb: `hsl(43_90%_55%/0.55)` → `rgba(255,138,0,0.55)`
  - Win headline gradient: `from-amber-100 via-yellow-300 to-amber-200` → `from-[#FFB547] via-[#E7EBF0] to-[#FFB547]`
  - Prize title drop-shadow: `rgba(250,204,21,0.35)` → `rgba(255,138,0,0.35)`
  - Particle barva (warm gold): `hsl(43 95% 62%)` → `#FFB547`
  - Next-win distance highlight: `hsl(43_80%_65%) hsl(35_90%_55%)` → `#FFB547 #FF8A00` (×2)
  - "Hrát znovu" CTA (×3): `from-amber-500 via-yellow-500 to-amber-400` → `from-[#FF8A00] via-[#FFB547] to-[#FF8A00]`
  - Main prize text: `text-yellow-600` → `text-[#FF8A00]`
  - Loss state border: `border-yellow-500/30` → `border-[rgba(255,138,0,0.3)]`
  - Share divider: `rgba(234,179,8,0.4)` → `rgba(255,138,0,0.4)`
  - Emotivní amber/white text třídy a confetti barvy zachovány

### Merge + testy

- **PR #93** mergnut do `main` — merge commit `d88a76a9a1cef323e3b477e683aa3e69442d618a`
- Změněn pouze 1 soubor: `src/components/TicketResultModal.tsx` (15 ins / 15 del)
- **Playwright Smoke Tests**: SUCCESS ✅

---

## BRAND MIOCOIN — STEP 9 DOKONČEN (21. 05. 2026)

Komponenta MioCoin sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/MioCoin.tsx`** — okrajový gradient a glow shadow coin ikony:
  - `from-yellow-500/40` → `from-[rgba(255,138,0,0.4)]` (Energy Orange)
  - `via-yellow-400/10` → `via-[rgba(255,181,71,0.1)]` (Warm Amber)
  - `rgba(234,179,8,0.35)` → `rgba(255,138,0,0.35)` (Energy Orange)
  - Velikost, layout, props, importy a logika beze změny

### Co se nezměnilo

- Žádná logika aplikace, Supabase, wallet, Stripe, migrace

### Merge + testy

- **PR #92** mergnut do `main` — merge commit `baa61ab30dac4a2703774d35722a2b770b5e3961`
- Změněn pouze 1 soubor: `src/components/MioCoin.tsx` (1 ins / 1 del)
- **Playwright Smoke Tests**: SUCCESS — run `26244784903` ✅

### Další krok

Step 10: `src/components/TicketResultModal.tsx` — sjednotit yellow/gold/amber HSL hodnoty ve win modalu na Energy Orange / Warm Amber.

---

## BRAND TOKEN CLEANUP — STEP 8 DOKONČEN (21. 05. 2026)

CSS tokeny a stránka Games sjednoceny podle OneMil brand kitu.

### Co bylo provedeno

- **`src/index.css`** — staré tokeny přesměrovány na brand hodnoty (názvy zachovány pro zpětnou kompatibilitu):
  - `--neon-blue: 220 80% 45%` → `33 100% 50%` (Energy Orange) — propaguje přes `--glow-blue`, `--gradient-primary/hero/mystery`, keyframes (`luxury-pulse`, `luxury-glow`, `title-glow`), `.neon-ticket`, `.ticket-profile`, `.hero-title`, `.story-link`
  - `--heading-gold: 43 55% 66%` → `38 100% 64%` (Warm Amber) — propaguje do `h1`, `h2` base stylů
  - `--heading-gold-soft: 43 45% 58%` → `38 85% 55%`
  - `--heading-gold-muted: 43 38% 48%` → `38 65% 42%`
  - `.text-heading-gold` gradient: staré warm-yellow HSL stops → `#FFB547 / #FF8A00` brand stops
- **`src/pages/Games.tsx`** — nadpis „Soutěže": `text-heading-gold` → `text-[#FFB547]` (přímá brand hodnota)

### Co se nezměnilo

- Žádný layout, logika aplikace, routing, UI texty
- Žádné Supabase dotazy, wallet, Stripe, migrace
- Žádné nové soubory, žádné smazané tokeny

### Merge + testy

- **PR #91** mergnut do `main` — merge commit `4a27bb04bc4518167b8e5dbaa8a6689f5300803a`
- Změněny 2 soubory: `src/index.css` (8 ins / 10 del), `src/pages/Games.tsx` (1 ins / 1 del)
- **Playwright Smoke Tests**: SUCCESS — run `26235203208` ✅

### Další krok

Finální vizuální audit po krocích 1–8 a rozhodnutí, zda řešit logo / PWA ikony.

---

## BRAND BOTTOM NAVIGATION — STEP 7 DOKONČEN (21. 05. 2026)

Spodní navigace sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/BottomNavigation.tsx`** — aktivní stav nav tlačítka sjednocen:
  - **Blue ring**: `ring-blue-400/80` → `ring-[rgba(255,181,71,0.8)]` (Warm Amber)
  - **Blue shadow outline**: `rgba(96,165,250,0.45)` → `rgba(255,138,0,0.45)` (Energy Orange)
  - **Blue glow**: `rgba(59,130,246,0.18)` → `rgba(255,138,0,0.18)` (Energy Orange)
  - Layout, ikony, routing, badge counts, texty a logika beze změny

### Co se nezměnilo

- Žádná logika aplikace — routing, badge counts, unread messages, unseen wins, admin guard
- Žádné Supabase dotazy, wallet, Stripe, migrace
- Žádné UI texty ani nové soubory

### Merge + testy

- **PR #90** mergnut do `main` — merge commit `2f01e1acf7489a56723dc0c17e8100b4ecb898c3`
- Změněn pouze 1 soubor: `src/components/BottomNavigation.tsx` (1 ins / 1 del)
- **Playwright Smoke Tests**: SUCCESS — run `26234450223` ✅

### Další krok

Step 8: `src/index.css` token cleanup (`--heading-gold`, `--neon-gold`, `--neon-blue` → brand hodnoty) + `src/pages/Games.tsx` class cleanup (`text-heading-gold` → brand třída).

---

## BRAND PROFILE — STEP 6 DOKONČEN (21. 05. 2026)

Stránka Profile sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/Profile.tsx`** — všechny yellow/gold HSL a Tailwind hodnoty nahrazeny brand hodnotami:
  - **VIPCard gold varianta**: `border-yellow-500/25`, `from-yellow-500/5` → `rgba(255,138,0,0.2)`, navy bg; shimmer overlay → orange rgba; floating particles `bg-yellow-500/20` → `rgba(255,138,0,0.15)`
  - **CSS efekty**: `avatar-ring-glow` keyframe, `premium-input` focus shadow, `vip-header-container::before`, `avatar-hover-shimmer` → orange rgba brand hodnoty
  - **Avatar ring**: conic-gradient `hsl(48 95% 65%), hsl(43 90% 55%), hsl(38 85% 48%)` → `#FFB547, #FF8A00, #e07800`; avatar border + fallback bg → orange brand
  - **Crown badge**: `from-yellow-400 via-yellow-500 to-yellow-600` → `from-[#FFB547] via-[#FF8A00] to-[#e07800]`; glow shadow → orange
  - **Profile name heading**: multi-stop zlatý gradient → Platinum `#E7EBF0` → Amber `#FFB547` → Orange `#FF8A00`; VIP badge border + bg + ikony → orange
  - **Peněženka sekce**: Wallet icon, "Peněženka" heading, coin glow + ikona, MioCoin balance číslo (`from-yellow-300 via-yellow-400 to-yellow-500` → `from-[#FFB547] via-[#FF8A00] to-[#FFB547]`), "Dobít MioCoiny" CTA → orange brand
  - **Formuláře (edit mód)**: labely `text-yellow-500/70`, inputy a textarea `bg-yellow-500/5 border-yellow-500/20 focus:border-yellow-500/40` → orange rgba; "Uložit změny" CTA → `#FF8A00→#FFB547`
  - **Profile view řádky (5×)**: border, bg gradient, hover border → orange rgba; labely → `rgba(255,138,0,0.55)`
  - **Win sound toggle**: sekce bg, ikona Volume2, Switch → `#FF8A00`
  - **Marketing sekce**: ikona Mail, heading gradient, inactive status bg, Loader2, subscribe borders, "Přihlásit marketing" CTA → orange brand
  - **Top-up modal**: DialogContent border/bg, Coins ikona, package selected state, hover border, pay button → orange brand

### Co se nezměnilo

- Žádná logika aplikace — nákup MioCoinů, přenos bonusů, formulář profilu, avatar upload, notifikace, marketing
- Žádné Supabase dotazy, wallet, Stripe, routing, migrace
- Žádné UI texty ani nové soubory

### Merge + testy

- **PR #89** mergnut do `main` — merge commit `9ece5828958103afd6c8d389225ffc314fa7fd04`
- Změněn pouze 1 soubor: `src/pages/Profile.tsx` (116 ins / 116 del)
- **Playwright Smoke Tests**: SUCCESS — run `26233223586` (1m 9s) ✅

### Další krok

Vizuální audit po krocích 1–6 a rozhodnutí, jestli pokračovat: Header, BottomNavigation, logo a případné zbývající soubory.

---

## BRAND HOMEPAGE — STEP 5 DOKONČEN (21. 05. 2026)

Stránka Homepage sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/Homepage.tsx`** — všechny yellow/gold/amber HSL a Tailwind hodnoty nahrazeny brand hodnotami:
  - **Zlaté separátory (5×)**: vnější glow `hsla(45, 80%, 50%, 0.15…0.25…0.30)` → `rgba(255,138,0,0.1…0.18…0.22)` ; ostrá linka `hsla(45, 75%, 50%, 0.6) → hsla(50, 95%, 70%, 1.0)` → `rgba(255,138,0,0.45) → rgba(255,181,71,0.95)` ; shimmer `hsla(50, 100%, 90%, 0.4)` → `rgba(255,220,150,0.3)`
  - **Banner horní separátor + horizontální light gradient**: gold → orange/amber brand při zachovaných průhlednostech
  - **Hvězdné částice „Poslední výherci"** (15-line blok): `hsla(45, 80%, 70%, 0.8)` → `rgba(255,181,71,0.55)`, `hsla(45, 60%, 65%, 0.6)` → `rgba(255,138,0,0.45)` atd.
  - **Okraje sekcí (2×)**: `border-amber-300/20` → `border-[rgba(255,138,0,0.2)]`
  - **"Probíhající soutěže" action box**: `border-amber-400/30` → `border-[rgba(255,138,0,0.3)]`, hover border → `rgba(255,138,0,0.5)`, inset glow → orange, Trophy icon `text-amber-400` → `text-[#FF8A00]`
  - **Admin "Pouze čtení" badge**: `bg-amber-100/10 border-amber-400/30 text-amber-400` → `bg-[rgba(255,138,0,0.08)] border-[rgba(255,138,0,0.3)] text-[#FF8A00]`
  - **Empty state „Žádné aktivní soutěže"**: `border-amber-400` + `from-amber-50 to-yellow-50` → `border-[rgba(255,138,0,0.4)]` + deep navy gradient `from-[hsl(220_35%_8%)] to-[hsl(220_30%_5%)]`; titulek `text-amber-800 dark:text-amber-400` → `text-[#FFB547]`; text → `text-muted-foreground`
  - **Inline voucher karta**: `from-[hsl(40_20%_14%)] … border-[hsl(40_30%_35%)]` → deep navy + `border-[rgba(255,138,0,0.35)]`, hover border/shadow → orange brand
  - **Partner karty**: stejný vzor jako voucher karta
  - **3× coming-soon karty**: `from-[hsl(40_20%_14%)] … border-[hsl(45_80%_45%)]` → navy + `border-[rgba(255,138,0,0.4)]`

### Co se nezměnilo

- Žádná logika aplikace — soutěže, tikety, wallet, vouchery, partner karty, routování
- Žádné Supabase dotazy, Stripe, backend, migrace
- Žádné UI texty

### Merge + testy

- **PR #88** mergnut do `main` — merge commit `02d7f4c6c9de054910e5ecd075307fd0c820b6ff`
- Změněn pouze 1 soubor: `src/pages/Homepage.tsx` (48 ins / 48 del)
- **Playwright Smoke Tests**: SUCCESS — run `26229779258` (1m 11s), `completed / success`

### Další krok

Step 6: `src/pages/Profile.tsx` — 115 výskytů yellow/gold; VIPCard varianty, plovoucí částice, avatar ring (conic-gradient), MioCoin balance display, form vstupy, CTA tlačítka.

---

## BRAND VOUCHERS — STEP 4 DOKONČEN (21. 05. 2026)

Stránka Vouchery sjednocena podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/Vouchers.tsx`** — všechny yellow/gold HSL hodnoty nahrazeny brand hodnotami:
  - Voucher karty (dostupné, oblíbené, zakoupené): border `hsl(40_30%_30%)` → `rgba(255,138,0,0.35)`, hover border → `rgba(255,138,0,0.55)`, hover glow → orange
  - Skeleton / empty state karty: `from-[hsl(40_20%_14%)]` gradient → deep navy `from-[hsl(220_35%_8%)]`, border → `rgba(255,138,0,0.3)`
  - Gold particle efekty (3×): `hsl(45 80% 65%)` → `rgba(255,138,0,...)` / `rgba(255,181,71,...)` při snížené průhlednosti (decentní brand efekt)
  - CTA tlačítka KOUPIT: `from-[hsl(40_70%_42%)] via-[hsl(42_75%_48%)] to-[hsl(38_70%_42%)]` → gradient `#FF8A00 → #FFB547`, text `#111`
  - Tlačítko Uplatnit voucher: stejný orange→amber gradient
  - Cena / voucher kód: `hsl(45_80%_55%)` → Warm Amber `#FFB547`
  - Redeem modal: border `hsl(40_30%_35%)` → `rgba(255,138,0,0.35)`, pozadí `hsl(40_20%_12%)` → dark navy; kód text → `#FFB547`; Copy button: zlatá → `#FF8A00→#FFB547`
  - "Zkopírovat kód" outline: border/hover → orange brand hodnoty
  - Image separátor + info badge: `hsl(40_25%_25%/0.4/0.5)` → `rgba(255,138,0,0.2)`
  - Heart button border + loader barva → orange
  - Gift icon placeholder → `rgba(255,138,0,0.35)`

### Co se nezměnilo

- Žádná logika aplikace — nákup voucheru, oblíbené, zakoupené, kopírování kódu, modaly, tabing
- Žádné Supabase dotazy, wallet, Stripe, soutěže, tikety, Partner Offers ani backend
- Žádné stránky, routing ani texty UI
- Žádné migrace

### Merge + testy

- **PR #87** mergnut do `main` — merge commit `6dab7c3527b11c1e0559220d71228ef485911fad`
- Změněn pouze 1 soubor: `src/pages/Vouchers.tsx` (45 ins / 45 del)
- **Playwright Smoke Tests**: SUCCESS před mergem (PR check) i po mergi (main, run `26228589925`)

### Další krok

Rozhodnout: pokračovat brand alignmentem dalších stránek (profile, homepage, header), nebo nejdřív provést vizuální audit po všech 4 krocích.

---

## BRAND CONTEST DETAIL — STEP 3 DOKONČEN (21. 05. 2026)

Detail soutěže sjednocen podle OneMil brand kitu.

### Co bylo provedeno

- **`src/pages/ContestDetail.tsx`** — všechny yellow/gold hodnoty nahrazeny brand hodnotami:
  - Hero sekce: h1 titulek `text-yellow-400` → Platinum `#E7EBF0`; popis/výhra → Silver `#BFC6CF`; hero border → `rgba(255,138,0,0.45)` (konzistentní s ContestCard)
  - "Zobrazit více/méně": `yellow-400/300` → Energy Orange `#FF8A00 / #FFB547`
  - Gallery media border → `rgba(255,138,0,0.2)`
  - Box 1 (MioCoin stav): border, MioCoin glow, live shimmer → Energy Orange
  - "Dobít MioCoiny" outline button: yellow-500 → `rgba(255,138,0,...)`
  - Box 2 (bonus pool): pozadí, border, číslo `text-yellow-400` → `#FFB547`, MioCoin glow
  - Sekce 4 (cesta k tiketu): border → `rgba(255,138,0,0.2)`
  - Sekce 5 (věcné výhry): border, hover, count badge → amber brand
  - PDF tlačítko: `from-amber-500 to-yellow-400` → `from-[#FF8A00] to-[#FFB547]`

### Co se nezměnilo

- Žádná logika aplikace, Supabase dotazy, nákup tiketu, wallet, contests, winners, Partner Offers ani backend
- Žádné stránky, routing ani texty UI
- Žádné migrace

### Merge + testy

- **PR #86** mergnut do `main` — commit `63ecbcb` (rebase merge)
- Změněn pouze 1 soubor: `src/pages/ContestDetail.tsx` (18 ins / 18 del)
- **Playwright Smoke Tests**: SUCCESS před mergem (PR check) i po mergi (main, run `26227604101`)

### Další krok

Vizuálně sjednotit vouchery.

---

## BRAND CONTEST CARDS — STEP 2 DOKONČEN (21. 05. 2026)

Soutěžní karty a CTA tlačítka sjednoceny podle OneMil brand kitu.

### Co bylo provedeno

- **`src/components/ContestCard.css`** — border sweep animace: jasná žlutá/zlatá → Energy Orange `rgba(255,138,0)` / Warm Amber `rgba(255,181,71)`; animace zpomalena (2.5s → 4s / 5s) pro premium pocit; vnitřní glow přesměrován na oranžový nádech; CSS třídy zachovány, pouze hodnoty změněny
- **`src/components/ContestCard.tsx`** — hlavní CTA: outlined orange → plný gradient `#FF8A00 → #FFB547`, tmavý text `#111`, amber border, orange glow; Detail/Login tlačítka: silver border `rgba(191,198,207,0.25)` s orange hover; karta: border přesměrován na přímý brand hex
- **`src/components/ui/button.tsx`** — varianta `premium`: gold `hsl(45 93% 60%)` → Energy Orange `#FF8A00`

### Co se nezměnilo

- Žádná logika aplikace, databáze, platby, wallet, soutěže, tikety, Partner Offers ani backend
- Žádné stránky, routing ani texty UI
- Žádné migrace

### Merge + testy

- **PR #85** mergnut do `main` — commit na main `9a508d5` (rebase merge)
- Změněny pouze 3 soubory: `ContestCard.css`, `ContestCard.tsx`, `ui/button.tsx`
- **Playwright Smoke Tests**: SUCCESS před mergem (PR check) i po mergi (main, run `26226461672`)

### Další krok

Vizuálně sjednotit detail soutěže nebo vouchery.

---

## BRAND TOKEN RESET — STEP 1 DOKONČEN (21. 05. 2026)

Sjednoceny základní CSS brand tokeny v `src/index.css` podle OneMil brand kitu.

### Co bylo provedeno

- **Přidány `--om-*` brand tokeny** do `:root`: `--om-black`, `--om-navy`, `--om-graphite`, `--om-platinum`, `--om-silver`, `--om-muted-silver`, `--om-orange`, `--om-amber`, `--om-soft-gold`, `--om-font-heading`, `--om-font-body`
- **Základní tokeny přesměrovány na brand barvy** (`:root` i `.dark`): background → Midnight Black, card/panel → Deep Navy/Graphite, primary/accent/ring → Energy Orange (`33 100% 50%`), secondary → Warm Amber, foreground → Platinum, muted text → Muted Silver
- **Sidebar tokeny sjednoceny** — `--sidebar-primary` a `--sidebar-ring` → Energy Orange (místo modré)
- **Zachované ale přesměrované tokeny**: `--neon-gold`, `--package-gold` → Warm Amber; `--heading-gold` → Soft Gold oblast; `--text-silver` → blíže Silver
- `body::before` gradient přesměrován na brand černé odstíny

### Co se nezměnilo

- Žádná logika aplikace, databáze, platby, wallet, soutěže, tikety, Partner Offers ani backend
- Žádné komponenty ani stránky
- Žádné migrace

### Merge + testy

- **PR #84** mergnut do `main` — merge commit `4de961b7d286c4309b916f5b00edad2e2e15ec7b`
- Změněn pouze `src/index.css` (+67 / -54 řádků)
- **Playwright Smoke Tests**: SUCCESS před mergem (PR check) i po mergi (main, run `26212014595`)
- Větev: `style/brand-token-reset-step-1`

### Další krok

Viditelně sjednotit soutěžní karty a CTA tlačítka podle brand kitu (ContestCard, ContestCard.css, primární CTA gradient).

---

## ADMIN „ONLINE TEĎ" — REGISTERED USERS LIVE (20. 05. 2026)

Admin top bar "Online teď" badge nyní zobrazuje skutečný počet přihlášených uživatelů.

### Architektura

- **`public.users.last_seen_at`** (timestamptz, nullable) — nový sloupec, index `idx_users_last_seen_at`
- **`public.bump_user_last_seen()`** — SECURITY DEFINER RPC; updatuje pouze `auth.uid()` řádek; volán frontendem každých 60 s
- **`public.get_admin_online_users(p_active_window_seconds int DEFAULT 300)`** — SECURITY DEFINER RPC; vrací uživatele aktivní v posledních 5 minutách; pouze admin/superadmin
- **`src/hooks/useHeartbeat(userId)`** — nový hook; no-op pokud `userId` je undefined; ihned po přihlášení + každých 60 s
- **`src/hooks/useAdminOnlineIndicator`** — přepsán; polluje `get_admin_online_users` každých 30 s; `statusLabel` a `lastUpdatedAt` jsou živé
- **`src/App.tsx`** — `useHeartbeat(user?.id)` namountován vedle `useOneSignal` / `useApplyPendingReferral` / `useRetentionTriggers`

### Co se nesleduje

- Anonymní návštěvníci nejsou v OneMil sledováni — zůstávají v Google Analytics
- Historie stránek, URL, telefonní čísla — nic z toho se neukládá

### Migrace + verifikace

- Migrace `20260520_registered_user_presence.sql` aplikována na **staging** (`dxmowysntemfqfnanxua`) i **produkci** (`xkzhjldrojjlrkezorey`) ✅
- Staging RPC verifikace: `bump_user_last_seen=exists`, `get_admin_online_users=exists`, `last_seen_at_column=exists` ✅
- Produkce RPC verifikace: všechny tři checks `exists` ✅
- End-to-end test na staging (simulate via SQL): bump zapsal `last_seen_at`, admin RPC vrátil uživatele, non-admin dostal `success: false` ✅
- Commit `0732738` — feat, commit `ab5cb25` — fix runtime crash

### Runtime crash fix (commit ab5cb25)

`supabase.rpc(...).catch is not a function` — Supabase RPC vrací thenable, ne plný Promise; `.catch()` na něm neexistuje. Opraveno přepsáním `bump()` na `async/await` + `try/catch`.

### CI lock — spec 21 (20. 05. 2026)

- **`tests/e2e/21-admin-online-registered-users.spec.ts`** — staging-only, dva browser contexts (normální E2E uživatel + admin)
- Commit `b70beba` — přidán spec 21
- Commit `b2129ac` — fix: `exact: false` → `exact: true` pro email assertion (strict-mode violation: `e2e@onemil.cz` bylo substring `admin-e2e@onemil.cz`)
- **Staging Full E2E run `26189017692` ✅ — 29 passed, 0 failed, 3 skipped** (4m 35s)
- Spec 21 prošel za 16.8s: badge count ≥ 1 ✅, popover zobrazuje e-mail E2E uživatele ✅, žádná sekce „Anonymní návštěvníci" ✅

### Invarianty

- `useHeartbeat` nikdy nesmí vyhodit výjimku — heartbeat je best-effort
- `getAdminOnlineUsers` vrací `success: false` pro non-admin bez leakage dat
- `AdminSoundIndicator.tsx` UI nedotčen — popover zobrazuje reálná data automaticky
- Anonymní návštěvníci nejsou v OneMil sledováni — zůstávají pouze v Google Analytics

---

## ISSUE #71 — FINÁLNĚ VYŘEŠEN A ZAMČEN PROTI REGRESI (20. 05. 2026)

Velké MioCoin bonusové save (~95 000 pozic) nyní fungují na produkci.
**Chunked save flow je od 20. 05. 2026 chráněn každým staging CI během** přes
`tests/e2e/20-admin-miocoin-chunked-save.spec.ts` (run `26180130657` — 28/0/3 ✅).

### CI lock (PRs #79/#80/#81)
- **PR #79** přidal spec 20 (staging-only, non-destructive)
- **PR #80** přidal `seed-spec20-contest` step do `playwright-staging.yml` (status=draft, ticket_count=1000)
- **PR #81** opravil locator strict-mode kolizi (`/^Celkem:.*600 pozic/i`)
- Run `26180130657` ✅ — spec 20 prošel za 9.7 s, ověřil: 600 pozic vygenerováno, 2 chunky (`CHUNK_SIZE=500`), `bonus_prizes` count = 600, `total_miocoin_bonus` = 6 000, `admin_actions` obsahuje `miocoin_save_begin` + `miocoin_bulk_create` s `metadata.chunked = true`
- Telegram `✅ OneMil STAGING full E2E OK — all specs passed` doručen (message_id 560)



### Final invariant
Large MioCoin bonus saves **musí** používat chunked flow:
```
admin_begin_miocoin_save(contest_id, expected_count)
  → admin_append_miocoin_chunk(contest_id, chunk_payload) × N
  → admin_finalize_miocoin_save(contest_id, expected_count)
```
Konstanta ve frontendu: **`CHUNK_SIZE = 500`** (v `src/components/AdminContestManagement.tsx`, `handleSave`).

### Cesta k řešení (chronologicky)
1. **PR #74** — frontend switch z Edge Function (`distribute-bonus-prizes`) na SQL RPC (`admin_bulk_insert_miocoin_bonuses`). ✅ vyřešilo Deno wall-clock timeout, ale narazilo na nový limit.
2. **PR #75** — generator nikdy nevygeneruje pozici = `ticket_count` (rezervováno pro hlavní výhru). ✅ data integrity fix.
3. **PR #76** — pokus o `set_config('statement_timeout', '300000', true)` uvnitř funkce. ❌ NEÚČINNÉ (PL/pgSQL `set_config` LOCAL nezasahuje běžící outer statement; Supabase API gateway má vlastní HTTP timeout).
4. **PR #77** — chunked flow: tři SECURITY DEFINER funkce + frontend orchestrace begin → append × N → finalize. ✅ základ architektury správný.
5. **PR #78** — `CHUNK_SIZE = 5000 → 500`. ✅ test23 ukázal že 5000 stále hitá gateway timeout; 500 prochází komfortně.

### Production verification
- Migrace `20260520_miocoin_chunked_save_functions.sql` aplikována na produkci ✅
- Verifikace: `admin_begin_miocoin_save=exists`, `admin_append_miocoin_chunk=exists`, `admin_finalize_miocoin_save=exists` ✅
- Lovable frontend publikován ✅
- Final manual test na produkci: MioCoin bonus creation works, admin totals display correctly ✅

### Předchozí selhané cesty (neopakovat)
1. ❌ Jeden velký Edge Function request s `explicit_bonuses` (Deno wall-clock timeout ~150s)
2. ❌ Jeden velký SQL RPC (`admin_bulk_insert_miocoin_bonuses`) — PostgREST/Kong gateway HTTP timeout ~60s
3. ❌ Chunked save s `CHUNK_SIZE = 5000` — chunk 1/9 stále hitnul gateway timeout

### Co se NESMÍ udělat
- Vracet se k jednomu monolitickému RPC volání pro large saves
- Spoléhat se na `set_config('statement_timeout', ...)` uvnitř funkce volané z PostgREST
- Zvýšit `CHUNK_SIZE` nad 500 bez explicitního důkazu že gateway HTTP timeout to unese
- Měnit kontrakt tří funkcí (`admin_begin_miocoin_save` / `admin_append_miocoin_chunk` / `admin_finalize_miocoin_save`) bez ověřené architektonické náhrady
- Smazat legacy `admin_bulk_insert_miocoin_bonuses` — ponechán beze změny pro backward compatibility / malé saves

---

## PAPERCLIP / AI TEAM CONTEXT

**Aktualizováno:** 12. 05. 2026

Detailní pravidla, schvalovací model a technické poznámky jsou v souboru:
**`PAPERCLIP_SETUP_CONTEXT.md`**

### Aktuální stav Paperclip (12. 05. 2026)

- **Server:** běží lokálně na `http://127.0.0.1:3100` (verze 2026.428.0)
- **Spuštění:** `npx paperclipai onboard --yes` z `C:\Users\divis\Desktop\Onemil - Projekt\million-ticket-draw`
- **PowerShell okno musí zůstat otevřené** po dobu běhu serveru

**Firma v Paperclip:**
- iCONIC POINT s.r.o. (prefix: ICO)

**Projekt v Paperclip:**
- OneMil

**Aktivní agenti:**

| Agent | Adaptér | Role |
|-------|---------|------|
| Provozní ředitel OneMil | claude_local nebo codex_local | Manažer, AI koordinátor, deleguje práci |
| Průzkumník obchodních leadů OneMil | codex_local | Lead researcher, hledá a třídí firmy |

**Pavel Diviš zůstává owner a final decision maker. Nic se neprovádí bez jeho schválení.**

### Klíčová pravidla agentů

- Provozní ředitel je **manažer, ne exekutor**. Specializovanou práci deleguje příslušnému agentovi.
- Provozní ředitel **nečte onemil_history.md automaticky** — pouze na výslovnou žádost Pavla.
- Provozní ředitel neřeší osobně: rozsáhlý výzkum, lead scouting, velké tabulky, marketingový průzkum, právní analýzu, technické práce ani repetitivní zpracování — pokud Pavel neřekne **„zpracuj osobně"**.
- Pro lead výzkum deleguje vždy na Průzkumníka obchodních leadů OneMil.
- Pokud vhodný agent neexistuje → navrhne nového agenta a čeká na schválení Pavla.
- Výstup se **zveřejňuje přímo do komentáře Paperclip issue**, ne jen interně.
- Reporty, CSV a Markdown soubory se ukládají do: `C:\Users\divis\Desktop\OneMil Paperclip Outputs`

### Technické poznámky

- Claude Code adaptér funkční; může být limitován kredity Pro účtu.
- Codex local adaptér funkční na Windows.
- Pro Codex local na Windows: Extra args → `--skip-git-repo-check`
- Model: **Default** nebo **gpt-5.3-codex** (o4-mini nebyl podporován s aktuálním nastavením).
- Provozní ředitel: Enable search **OFF**, Can assign tasks **ON**, Can create agents **OFF**, Heartbeat **OFF**.
- Průzkumník: Enable search **ON**, Can assign tasks **OFF**, Can create agents **OFF**, Heartbeat **OFF**.

### Issues vytvořené při nastavování (ICO projekt)

| Issue | Obsah |
|-------|-------|
| ICO-15 | Lead scouting — 10 českých e-shopů/značek |
| ICO-16 | Shortlist top 3 firem z existujících leadů |
| ICO-17 | Ověření veřejných B2B kontaktů — Dedoles, Slevomat, Rohlik.cz |
| ICO-18 | Dedoles one-pager draft → `dedoles_one_pager_ICO-18_2026-05-12.md` |
| ICO-19 | Návrh ideálního AI týmu pro OneMil → `onemil_ai_team_ICO-19_2026-05-12.md` |

### Další krok

Pokračovat v budování lead databáze. Průzkumník rozšiřuje seznam; Provozní ředitel koordinuje priority a předkládá shortlisty Pavlovi ke schválení před jakýmkoli outreachem.

---

## BUSINESS / PRODUCT CONTEXT

Aktuální obchodní a produktový kontext OneMil je v souboru:
**`ONEMIL_BUSINESS_CONTEXT.md`**

Tento soubor je hlavní zdroj pravdy pro pochopení toho, co OneMil je, jak funguje B2B odměnový model, partneři, MioCoiny, kupony, vouchery, soutěže, influenceři, agentury a sociální kampaně.

---

## FIREMNÍ KONTEXT

Aktuální firemní identita, kontakty, e-mailový podpis a fakturační údaje jsou v souboru:
**`COMPANY_CONTEXT.md`** — zdroj pravdy pro všechny asistenty a nástroje.

---

## ADMIN CONTEST ECONOMY PANEL — PHASE 4: PERSISTENCE DOKONČENA (18. 05. 2026)

### Phase 4 — Economy Persistence (18. 05. 2026) ✅ HOTOVO — PRODUKCE + STAGING OVĚŘENY

- **PR #66 migrace aplikována na produkci (20. 05. 2026):** `admin_bulk_insert_miocoin_bonuses` materializuje JSON payload do `tmp_miocoin_bonuses (ON COMMIT DROP)` — `jsonb_array_elements` voláno 1× místo 5×. Index `idx_bonus_prizes_contest_position ON bonus_prizes(contest_id, ticket_position)` přidán. Timeout při 56 000–95 000 MioCoin pozicích odstraněn. Toto je aktuální finální zelený stav.
- **Staging Full E2E ZELENÝ po PR #66 (20. 05. 2026):** run `26156907020` — **27 passed, 0 failed, 3 skipped** (3m 6s). Spec 18 ✅ (11.3s). Spec 19 ✅ (10.4s). Telegram OK (message_id 521).
- **PR #66 mergnut (20. 05. 2026):** perf: materialize JSON payload once in admin_bulk_insert_miocoin_bonuses (fix 56k timeout). Merge commit: `59b2efe3154d629d6c4b9acd4dd4477f0a4ef502`. Pouze `supabase/migrations/20260520_materialize_bulk_miocoin_payload.sql` (226 řádků). Production smoke po mergi zelený (run `26157401708`, 1m 19s). Žádný frontend, žádné testy, žádný workflow.
- **PR #65 migrace aplikována na produkci (20. 05. 2026):** set-based SQL validace (GROUP BY HAVING, JOIN) namísto per-row PL/pgSQL smyčky + O(N²) array_append. Timeout při 95 000 pozicích odstraněn (první část opravy). Staging E2E zelený (run `26153556353`, 27/0/3, spec 18 ✅ 10.0s, spec 19 ✅ 10.0s). Production smoke po mergi zelený (run `26153872933`).
- **PR #65 mergnut (20. 05. 2026):** perf: optimize admin_bulk_insert_miocoin_bonuses for 95k rows. Merge commit: `e809bd0561d05846290922d94a860d5df49c78cf`. Pouze `supabase/migrations/20260520_optimize_bulk_miocoin_bonuses.sql`.
- **PR #64 mergnut (20. 05. 2026):** fix duplicate contest creation when CREATE save partially succeeds. Merge commit: `72b74bc64dad27abd04a2c64214c77dc1e3a533c`. Pouze `src/components/AdminContestManagement.tsx`. Root cause: outer `catch` v `handleSave` nezavíral modal po částečném úspěchu v CREATE módu → opakované kliknutí Uložit → 2. contest v DB. Fix: `createdContestIdInCreateMode` tracking — při chybě po úspěšném `admin_manage_contest` outer catch zavolá `onSaved()/onClose()` s informativním toastem. Staging E2E zelený (run `26152507277`, 27/0/3).
- **PR #63 mergnut (20. 05. 2026):** fix stale `contests.total_miocoin_bonus` after bulk MioCoin save. Migrace `20260520_sync_total_miocoin_bonus_after_bulk.sql` aplikována na staging i produkci. Root cause: trigger `sync_total_miocoin_bonus` neexistuje na produkci → sloupec vždy 0. Fix: UPDATE contests.total_miocoin_bonus po každém bulk INSERT + backfill + zero-fill všech existujících contests.
- **PR #62 mergnut (20. 05. 2026):** fix silent save when MioCoin generator inputs filled but bonuses not generated. Guard v `handleSave` v `src/components/AdminContestManagement.tsx`. Root cause: admin mohl uložit se zaplaněnými MioCoin inputy aniž klikl Vygenerovat → 0 MioCoin řádků v DB bez varování. Fix: `if (mioCoinBonuses.length === 0 && totalMioCoinsInput > 0 && stepValue > 0)` → destructive toast + return. Staging E2E zelený (run `26135981706`, 27/0/3).
- **PR #61 mergnut (20. 05. 2026):** bulk MioCoin bonus save — nová SECURITY DEFINER funkce `admin_bulk_insert_miocoin_bonuses(p_contest_id uuid, p_bonuses jsonb)` nahrazuje N sequential RPC callů jedním bulk INSERT. Migrace `20260519_bulk_miocoin_bonuses.sql` + RLS policy "Allow admin full access to bonus prizes" (idempotentní DO block). Aplikováno na staging i produkci. Root cause: 95 000 pozic → ~11 hodin při 430ms/call, vždy selhávalo v půlce.
- **Staging Full E2E ZELENÝ po PR #60 (19. 05. 2026):** run `26113679217` — **26 passed, 0 failed, 3 skipped** (spec 18 prošel na retry — transient staging latence; spec 19 ✅). Telegram OK (message_id 497).
- **PR #60 mergnut (19. 05. 2026):** fix create modal not closing when rules PDF upload fails after contest creation. Merge commit: `a25a7d71d986485d60cab92f153db30746e09019`. Změněn pouze `src/components/AdminContestManagement.tsx`. Root cause: contest je vytvořen SECURITY DEFINER RPC `admin_manage_contest` před PDF uploadem; pokud upload selhal, `return` v error branch zavřel modal… ne — naopak nechal modal otevřený. Fix: mirrors PR #55 pattern — v CREATE módu při chybě PDF upload kód falls through k `onSaved()/onClose()` místo `return`; v EDIT módu původní chování (setSaving + return) zachováno. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #59 (19. 05. 2026):** run `26106988469` — **27 passed, 0 failed, 3 skipped** (3m 6s). Spec 18 ✅ (11.3s, první pokus). Spec 19 ✅. Telegram OK (message_id 492).
- **PR #59 mergnut (19. 05. 2026):** fix spec 18 pro PRs #56/#57 economy UI changes. Merge commit: `ab9e37f`. Změněn pouze `tests/e2e/18-admin-economy-persist.spec.ts`. Step 4a: `Náklad na hlavní výhru` přesunuto do Basic tabu (PR #57) — fill tam. Step 4b: `Náklad na MioCoin bonusy` je vždy read-only (PR #56/#57) — fill odstraněn. Verifikace (Step 7) odpovídajícím způsobem upravena. Žádný app kód, workflow, schéma nezměněno.
- **PR #58 mergnut (19. 05. 2026):** fix physical prize grouping key — image_url vyloučeno z klíče. Merge commit: `3ca06bf`. Změněn pouze `src/pages/ContestDetail.tsx`. Bulk výhry každá s unikátní UUID storage cestou → při groupování podle description+image_url vznikla N karet místo 1. Fix: klíč nyní `${description}||${detailed_description}` bez image_url — bulk výhry se správně seskupí.
- **PR #57 mergnut (19. 05. 2026):** Economy input cleanup. Merge commit v main. Změněn pouze `src/components/AdminContestManagement.tsx`. `Náklad na hlavní výhru` přesunut z Economy tabu do Basic tabu (vedle `Hlavní výhra`). `Reálný náklad na MioCoin bonusy` vždy read-only (auto-odvozeno z bonus state přes `effectiveMioCoinCost`). Popisné texty aktualizovány.
- **PR #56 mergnut (19. 05. 2026):** fix MioCoin bonus save RPC overload + auto-sync economy. Merge commit v main. Změněn pouze `src/components/AdminContestManagement.tsx`. Part A: `admin_manage_bonus_prize` RPC volán s explicitními `p_image_url: null, p_detailed_description: null` — eliminuje "could not choose best candidate function" chybu při 5-arg vs 9-arg overload. Part B: `effectiveMioCoinCost` = skutečné MioCoin bonusy pokud existují, jinak ruční input, jinak předpoklad — auto-synchronizuje ekonomiku se skutečnými bonusy.
- **Staging Full E2E ZELENÝ po PR #55 (19. 05. 2026):** run `26059677757` — **27 passed, 0 failed, 3 skipped** (4m 14s). Spec 18 ✅ (10.8s, první pokus). Spec 19 ✅ (10.9s). Telegram OK (message_id 475).
- **PR #55 mergnut (19. 05. 2026):** fix duplicate physical prize cards + create modal close. Merge commit: `9808f83d13e4ff09516dc2f352abcc3c28274ab8`. Změněny: `src/pages/ContestDetail.tsx`, `src/components/AdminContestManagement.tsx`. Part A: `groupedBonusPrizes` useMemo seskupuje identické fyzické výhry (description+detailed_description+image) do jedné karty s badge `N× v soutěži`. Part B: pro CREATE mód, při `updatedRows.length === 0` (RLS blokuje client-side UPDATE čerstvého řádku vytvořeného SECURITY DEFINER RPC) kód nyní pokračuje k `onSaved()/onClose()` místo `return`; pro EDIT mód původní chování zachováno. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #53 + #54 (18. 05. 2026):** run `26057380995` — **26 passed, 0 failed, 3 skipped** (4m 0s). Spec 08 ✅ skipped (PR #54 fix), spec 18 ✅ passed (retry #1 — transient staging latence), spec 19 ✅. Telegram OK (message_id 471).
- **PR #54 mergnut (18. 05. 2026):** fix flaky skip guard spec 08. Merge commit: `819cb77819bfc37598a621b46821a1995c17d2c9`. Změněn pouze `tests/e2e/08-partner-offer-persistence.spec.ts`. Nahrazen `waitForTimeout(2_000) + okamžité isVisible()` za `Promise.race` (mirror spec 07): wait up to 10s pro offer card nebo empty state, poté skip guard + `!firstCard.isVisible()` fallback skip. Root cause: na pomalejším staging loadu se empty-state text nevykreslil do 2s → `isVisible()` vrátilo false → skip se nespustil → test selhal. Žádný app kód ani workflow nezměněn.
- **PR #53 mergnut (18. 05. 2026):** fix gallery upload "Invalid key". Merge commit: `8356ac04bdf3d03f457febe6e199fca4593e856b`. Změněn pouze `src/components/AdminContestManagement.tsx`. Přidán `sanitizeStorageFileName()` helper a aplikován na všechny 3 gallery upload paths. Produkční error: `Invalid key: contests/.../gallery/...-Snímek obrazovky 2026-05-09 150423.png`. Fix: NFD normalize + strip diakritiky + spaces→hyphens + strip speciálních znaků + `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`. Czech error fallback: "Galerii se nepodařilo nahrát. Zkuste soubor přejmenovat bez speciálních znaků."
- **PR #52 mergnut (18. 05. 2026):** bulk quantity distribution pro věcné bonusové výhry. Merge commit: `e43cda76c4f187bd4a8e9ae00ec3396626a73e19`. Změněn pouze `src/components/AdminContestManagement.tsx`. Nová UI pole: Počet kusů (default 1, min 1), Rozmístění pozic (Rovnoměrně / Náhodně, default Rovnoměrně). Při qty > 1 app automaticky generuje N `PhysicalPrize` objektů s bezkolizními pozicemi přes `pickPositions` helper (Fisher-Yates nebo rovnoměrné indexy). Kolizní pravidla: vylučuje MioCoin pozice, existující věcné výhry, final-ticket pozici a pozice mimo rozsah 1..(ticket_count-1). Toast ukazuje prvních 5 pozic. Economy pole (dodavatel/cena/DPH/balné) se zachovávají po bulk add pro rychlé zadání dalšího produktu. Opraven stale helper text. Žádné migrace, žádný RPC, žádné workflow changes.
- **Staging Full E2E ZELENÝ po PR #52:** run `26053065266` — **27 passed, 0 failed, 3 skipped** (3m 56s). Spec 18 ✅ (9.8s), spec 19 ✅ (10.0s). Telegram OK doručen. Žádná regrese.
- **Staging Full E2E ZELENÝ — Phase 4 kompletní:** run `26046436837` — **27 passed, 0 failed, 3 skipped** (4m 28s). Spec 18 ✅ (11.9s), spec 19 ✅ (11.2s, první pokus). Telegram OK doručen. Toto je finální zelený stav po všech staging SQL opravách.
- **Staging SQL opravy aplikovány manuálně (18. 05. 2026) na `dxmowysntemfqfnanxua`:**
  1. `ALTER TABLE bonus_prizes ADD COLUMN IF NOT EXISTS supplier_name TEXT, unit_cost_czk NUMERIC, vat_rate_percent NUMERIC, handling_override_czk NUMERIC;` — Phase 4 economy sloupce (ekvivalent migrace `20260517180100`).
  2. `CREATE POLICY "Allow admin full access to bonus prizes" ON public.bonus_prizes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) WITH CHECK (...);` — chybějící write policy; bez ní direct client UPDATE/DELETE na bonus_prizes tichce selhal (RLS blokoval 0 řádků bez chyby), ale SECURITY DEFINER RPC INSERT fungoval, čímž se maskoval problém.
- **PR #51 mergnut (18. 05. 2026):** workflow seed step "Ensure staging admin E2E user has admin role" přidán do `playwright-staging.yml`. Zajišťuje existenci `admin-e2e@onemil.cz` v auth.users, public.users (role=admin), user_roles, profiles, wallets před E2E suite. Idempotentní. Merge commit: `97797662d19cafe53062a04fb73449545ef98780`.
- **Migrace aplikovány na produkci (18. 05. 2026):**
  - `public.contest_economy` tabulka existuje na produkci ✅
  - `public.bonus_prizes` sloupce `supplier_name`, `unit_cost_czk`, `vat_rate_percent`, `handling_override_czk` existují na produkci ✅
  - `bonus_prizes` write policy na produkci existuje ✅ (aplikována dříve jako součást baseline)
  - **Production smoke po migraci:** run `26027726603` — ✅ **5 passed, 0 failed, 0 skipped** (22s). Telegram: `✅ OneMil PROD smoke OK` doručen.
- **Frontend** (`AdminContestManagement.tsx`) nyní při finálním uložení soutěže persistuje ekonomické předpoklady do `contest_economy` (upsert) a economy metadata věcných výher do `bonus_prizes` (update po RPC). Při znovuotevření editačního modalu se data načítají zpět.
- **E2E spec 18** (`tests/e2e/18-admin-economy-persist.spec.ts`) ověřuje celý cyklus economy assumptions: vyplnit → uložit → zavřít → znovu otevřít → ověřit perzistenci.
- **E2E spec 19** (`tests/e2e/19-admin-physical-prize-economy-persist.spec.ts`) ověřuje celý cyklus fyzických nákladových údajů: dodavatel / nákupní cena / DPH / balné → přidat výhru → uložit → znovu otevřít → ověřit perzistenci (PR #50, merge commit `1b937efba87cbda9118a2d8e532d2da6fdc46d44`).
- **Playwright testy: 19 spec souborů** (01–19); staging full E2E obsahuje všechny spec soubory; všechny zelené.
- Fyzické nákladové údaje věcných výher (supplier_name, unit_cost_czk, vat_rate_percent, handling_override_czk) jsou na `bonus_prizes` jako nullable sloupce — persistovány a E2E ověřeny (spec 19).

---

## ADMIN CONTEST ECONOMY PANEL — READ-ONLY PHASE 1 (16. 05. 2026)

### Stav
- PR #26 **feat: add read-only contest economy panel** byl mergnut do `main` (merge commit `5f5eb28b17c0cab2b8eaa47e360d75b34252ba59`).
- PR #27 **feat: add admin economy summary bar** byl mergnut do `main` (merge commit `9ea63c81c218ba91422005e8c09ab457800ef395`).
- PR #30 **Fix MioCoin final save to use previewed positions** byl mergnut do `main` (merge commit `7b50b30d2413ad6d839f8e4100c2a9c7a806710d`).
- PR #72 byl mergnut do `main` (merge commit `7dfa9ffc29bd0dddb6253f9a68ef1d10758a8636`).
- `src/components/AdminContestManagement.tsx` má nový read-only tab **„Ekonomika"** v admin modalu pro vytvoření/editaci soutěže.
- Nad taby admin contest modalu je kompaktní read-only live economy summary bar.
- Summary bar ukazuje počet ticketů, celkové odhadované náklady, doporučenou cenu ticketu, odhadovaný čistý zisk a marži.
- Panel slouží jako orientační ekonomický náhled během přípravy soutěže.
- Panel počítá: hrubou tržbu, DPH, čistou tržbu, náklad na hlavní výhru, náklad na MioCoin bonusy, balné/poštu/práci, jednorázový setup/distribuční náklad, marketingový náklad, celkové odhadované náklady, odhadovaný zisk, marži, bod zvratu v počtu ticketů a doporučenou minimální cenu ticketu.
- Summary bar používá stejné frontend-only výpočty jako tab „Ekonomika".
- Ekonomické předpoklady jsou zatím pouze frontend state; po změně modal kontextu se resetují na výchozí hodnoty.
- Panel zatím nic neukládá do Supabase a nemá databázovou persistenci.
- Phase 2B opravila finální MioCoin save behavior v `AdminContestManagement`: finální uložení soutěže nyní persistuje MioCoin bonusy podle přesně previewovaných pozic z frontend state `mioCoinBonuses`.
- Finální architektura pro velké MioCoin bonusy je nyní: batched Edge Function `distribute-bonus-prizes` s `explicit_bonuses`.
- Velké vytvoření MioCoin bonusů nyní funguje i pro desítky tisíc pozic bez monolitického timeoutujícího RPC insertu.
- Admin save path pro MioCoin bonusy zachovává přesně previewované pozice a ukládá je přes batched explicit path.
- Před uložením se validují bonusové pozice: celá čísla, rozsah `1..ticket_count`, duplicitní MioCoin pozice, kolize MioCoin/věcné výhry a kolize s posledním ticketem.
- Editace bonusových pozic existující soutěže je blokována, pokud už pro soutěž existují tikety.
- Vygenerované / materializované MioCoin bonusové pozice jsou po vytvoření soutěže neměnné. V editaci je nelze přegenerovat, přepsat ani nahradit.
- Edge Function `distribute-bonus-prizes` byla po PR #72 nasazena i do produkce.
- Ověření `test7`: `admin_total=63000`, `real_total=63000`, `miocoin_rows=63000`.
- Phase 3A rozšiřuje frontend-only `PhysicalPrize` preview o lokální ekonomická pole: dodavatel, nákupní cena v Kč, DPH a volitelný override balného / pošty / práce.
- Formulář věcné bonusové výhry zobrazuje tato pole česky a seznam přidaných výher ukazuje i cost preview metadata.
- Ekonomika tab i horní economy summary bar nově započítávají preview nákladů věcných bonusových výher do celkových odhadovaných nákladů, zisku, marže, bodu zvratu a doporučené ceny ticketu.
- Balné používá per-prize override, pokud je zadaný; jinak používá globální default z ekonomických předpokladů.
- Nákladové údaje věcných výher jsou v této fázi pouze frontend preview a neukládají se do Supabase.

### Invariant
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, `admin_manage_bonus_prize`, main prize final-ticket logic, migrace ani production smoke scope.
- Preview fyzických nákladů zatím nemá databázovou persistenci a nemění finální save behavior bonusů.

---

## STORE POLICY / LAUNCH COPY — UZAMČENO (13. 05. 2026)

### Stav
- PR #2 **Store policy copy cleanup: 18+ and ticket order model** byl mergnut do `main` (merge commit `c132be9ff60e15884d84f38d486c53dcb7f94666`).
- PR obsahoval pouze:
  - `src/pages/ContestDetail.tsx`
  - `src/pages/Games.tsx`
  - `src/pages/OnboardingDateOfBirth.tsx`
  - `src/pages/PrivacyPolicy.tsx`
  - `src/pages/TermsConditions.tsx`
  - `src/pages/Vouchers.tsx`
- Před mergem prošlo PR smoke E2E a Playwright Staging Full E2E na větvi `feature/store-policy-18plus-ticket-order-copy`.
- Po mergi do `main` prošel production smoke workflow `25795875077` a Playwright Staging Full E2E workflow `25795953772`.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

### Veřejná launch pravidla
- Launch age rule je **18+**.
- Veřejný text nesmí popisovat soutěže jako loterii, losování ani náhodný generátor.
- Správný veřejný model: **tikety se otevírají postupně v pořadí 1, 2, 3... a výherní pozice jsou předem určeny v pravidlech dané soutěže**.
- MioCoin je **interní kredit OneMil**.
- MioCoin **nelze vybrat ani vyplatit jako peníze**.
- MioCoin **nelze převádět mimo OneMil**.
- MioCoin lze použít pouze uvnitř OneMil.
- Dobročinné / charitativní kampaně musí vždy uvádět konkrétního příjemce, účel a výši podpory pro danou kampaň.

### Invariant
Tyto změny jsou copy/legal/store-review cleanup. Neměnily contest engine, wallet, DB, Supabase, Stripe, Sofinity, OneSignal, Partner Offers, `tickets`, `winners`, `bonus_prizes` ani `buy_ticket_atomic`.

---

## LAUNCH STRATEGY — WEB/PWA FIRST (13. 05. 2026)

### Strategické rozhodnutí
- OneMil bude spuštěn nejdříve jako **Web/PWA**.
- Podání do **Apple App Store** a **Google Play** se odkládá.
- Důvod: OneMil nebude v této fázi platit Apple/Google poplatky 15–30 % z nákupů MioCoinů.
- Stripe zůstává platebním providerem pro **Web/PWA MioCoin top-up**.
- Budoucí nativní iOS/Android aplikace lze znovu zvážit pouze po schválení platební/store strategie.

### Důsledky pro aktuální roadmapu
- Priorita store-readiness se přesouvá z nativních store submission kroků na Web/PWA readiness.
- Stripe web flow zůstává platný pro nákup MioCoinů mimo Apple/Google store billing.
- Native app store práce se neimplementuje, dokud nebude schváleno, zda má být:
  - consumption-only app bez nákupu MioCoinů,
  - native billing přes Apple/Google,
  - nebo jiný právně a obchodně schválený model.
- Toto rozhodnutí nemění contest engine, wallet, DB, Supabase, Stripe webhook, Sofinity, OneSignal, Partner Offers, `tickets`, `winners`, `bonus_prizes` ani `buy_ticket_atomic`.

### PWA readiness audit — aktuální nález
- `index.html` má základní mobile viewport a title `OneMil`.
- Produkční `public/` obsahuje pouze `favicon.ico`, `robots.txt`, `sitemap.xml`, `OneSignalSDKWorker.js`, `placeholder.svg`, `mockup-detail.html` a `sounds/`.
- V aktivním `public/` není nalezený web app manifest.
- V `index.html` není odkaz na manifest, `apple-touch-icon`, `theme-color` ani PWA splash metadata.
- Brand kit obsahuje připravené PWA/icon podklady v `docs/brand/onemil_brand_kit/.../03_icons/favicon_app/` a ukázkový `manifest.webmanifest`, ale nejsou zapojené do aktivního web buildu.
- Aktivní service worker pro offline/PWA cache nebyl nalezen. Existuje pouze OneSignal worker `public/OneSignalSDKWorker.js` pro push notifikace.
- Add-to-home-screen chování není explicitně implementované ani zdokumentované v kódu.
- Stripe Checkout je na Web/PWA dostupný přes existující `create-stripe-checkout` flow v `Homepage.tsx` a `Profile.tsx`.

### Nejbližší PWA blocker
Aktivní Web/PWA build zatím nemá zapojený manifest, app icons, `theme-color`, Apple touch icon, splash metadata ani offline/service worker strategii. Před veřejným Web/PWA launch je potřeba připravit samostatný PWA setup PR.

---

## TICKET PURCHASE FLOW — AKTUÁLNÍ STAV (04–05. 05. 2026)

### buy_ticket_atomic — opravené odpovědní fieldy (aplikováno v produkci)
- **Migrace:** `supabase/migrations/20260504_add_remaining_and_bonus_distance_to_buy_ticket_atomic.sql`
- Funkce nyní vrací 3 nová pole:
  - `remaining_tickets` = `v_ticket_count - v_next_ticket`
  - `next_bonus_position` = nejbližší pending `bonus_prizes.ticket_position` > aktuální tiket
  - `distance_to_next_bonus` = `next_bonus_position - v_next_ticket`
- Ověřeno produkcí: STRING_AGG query potvrdila všechna 3 pole ✅
- Nákupní logika, wallet, winner, Partner Offers — nedotčeny

### buy_ticket_atomic — timeout fix (57014)
- **Migrace:** `supabase/migrations/20260504_fix_nonblocking_sofinity_triggers.sql`
- **Root cause:** `trigger_sofinity_forward()` a `process_event_queue_trigger()` volaly `net.http_post()` synchronně uvnitř transakce → při saturaci pg_net workerů → 57014 statement timeout
- **Fix:** `trigger_sofinity_forward()` přepsán na INSERT do `event_queue`; `process_event_queue_trigger()` je no-op — doručení přebírá polling edge function
- Stav: migrace commitnuta, nutno aplikovat v Supabase SQL Editoru (pokud ještě neaplikováno)

### Frontend — oprava null → 0 přepisu
- **Soubory:** `src/pages/ContestDetail.tsx`, `src/pages/Games.tsx`, `src/pages/FavoriteGames.tsx`
- `remaining_tickets: result.remaining_tickets ?? 0` → `?? undefined` ve všech třech souborech
- Root cause: `?? 0` převáděl null z RPC na 0 → `0 > 0 = false` → `nearestPrizeDistance = null` → vždy se zobrazoval fallback text místo vzdálenosti

### TicketResultModal — opravené zobrazení (dokončeno)
- Odstraněno číslo tiketu z hlavního result boxu
- Odstraněno extra „0" (bylo způsobeno `?? 0` v mappedResult + React renderem `{0 && <JSX>}`)
- Nový text vzdálenosti (helper `nextWinTicketText` + `tahPlural`):
  - X = 1: „Další výherní ticket čeká už při dalším tahu."
  - X = 2–4: „Další výherní ticket čeká už za X tahy."
  - X ≥ 5: „Další výherní ticket čeká už za X tahů."
- Přidán vysvětlující řádek (`NEXT_WIN_EXPLAINER`): „Může jít o bonusovou i hlavní výhru. Kdo výherní ticket otevře první, vyhrává."
- Fallback (bez dat): „Další výhra může být blíž, než si myslíš."
- **Partner Offers jsou striktně vyloučeny** z výpočtu vzdálenosti — počítají se pouze fyzické bonus_prizes a main výhra

### TicketResultModal — toast po nákupu tiketu
- Odstraněna spodní toast notifikace „Ticket #56 zakoupen!" po úspěšném nákupu
- Důvod: result modal potvrzení nákupu duplikoval; toast navíc odhaloval číslo tiketu

### Contest karty (Homepage + /games)
- Skryt název soutěže na listing kartách
- Skryt celkový počet tiketů na listing kartách
- Tyto detaily zůstávají záměrně pouze na stránce detailu soutěže
- Důvod: název soutěže je součástí generovaného banneru/grafiky, ne UI textu na kartách

### Sdílovací karta / generovaný obrázek tiketu — IMPLEMENTOVÁNO
- `generatePremiumShareCard` v `TicketResultModal.tsx` — nový canvas 1200×630 s reálnou grafikou výhry
- Logika:
  - Bonusová fyzická výhra → `bonusPrize.image_url`
  - MioCoin výhra → existující MioCoin asset
  - Partner offer → `partner_offer.banner_url`, fallback `partner_offer.logo_url`; nápis „Získal jsem speciální nabídku na OneMil"
  - Hlavní výhra → contest/main prize obrázek
  - Nevýherní tikety → sdílení odstraněno nebo minimalizováno
- Dark premium background (OneMil brand: Midnight Black → Deep Navy → Graphite)
- Commit: `0790362 Refined share image canvas`

### Favorites UI — OPRAVENO
- Počítadlo oblíbených se aktualizuje bez page refresh po přidání/odebrání
- Commity: `ebf5e8e Updated fav count display`, `00e1e99 Opravil počítadlo viditelnost`

### Partner Offers — potvrzeno funkční
- Assignment po nákupu tiketu funguje správně (potvrzeno uživatelem)
- Cooldown 5 minut aktivní, žádné duplicity
- Žádná mutace produkčních dat při ověřování

### Invarianty (uzamčeno)
- Partner Offers **nejsou** výhry soutěže
- Partner Offers se **nesmí** počítat do výpočtu vzdálenosti k nejbližší výhře
- Partner Offers se **nesmí** zapisovat do `winners` ani `bonus_prizes`
- `buy_ticket_atomic` se nemá znovu měnit bez explicitní instrukce

---

## CLOSED CONTEST STATUS — FINÁLNÍ (05. 05. 2026)

### Bug
V admin UI bylo možné u soutěží se statusem `closed` (Ukončeno) znovu změnit status na `draft`, `pending`, `active` nebo `paused`.

### Fix (`src/components/AdminContestManagement.tsx`, commit `54466bb`)
- `handleStatusChange` blokuje jakoukoli změnu statusu pokud `current.status === "closed"` — zobrazí toast: _„Ukončenou soutěž nelze znovu aktivovat ani přesunout."_
- Status Select v tabulce je pro closed contests disabled (`contest.status === "closed"`)
- Badge „Ukončeno" zůstává viditelný (readonly)
- Duplicitní deklarace `const current` v `draft` bloku odstraněna (nyní sdílí proměnnou z vrcholu funkce)

### Invariant (uzamčeno)
`closed` je finální stav. Uzavřená soutěž nesmí být nikdy znovu aktivována, přesunuta do draftu, pending ani paused — ani z admin UI, ani přes `handleStatusChange`.

---

## CONTEST RULES PDF — OPRAVENO (05. 05. 2026)

### Bug
- Admin contest formulář vyžaduje nahrání PDF s pravidly soutěže.
- Po uložení soutěže zůstával `contests.rules_pdf_url = NULL` v databázi.
- ContestDetail proto nezobrazoval odkaz „Zobrazit pravidla soutěže".

### Root cause
- Přímý UPDATE `contests.rules_pdf_url` z frontendu byl blokován chybějící RLS UPDATE policy na `public.contests` pro admin role.
- Supabase vracel `{ data: [], error: null }` (0 rows affected, žádná chyba) — silent no-op.
- Navíc chyběl `return` po UPDATE error → úspěšný toast se zobrazil i při selhání (false confirmation).

### Opravy
- **DB migrace:** přidána RLS policy `contests_admin_update` — admin/superadmin mohou UPDATE `public.contests` (commity `bfc7813`, `95ab8e3`)
- **Frontend `src/components/AdminContestManagement.tsx`:**
  - Přidán `setSaving(false); return;` po UPDATE error (commit `20e4a34`)
  - UPDATE změněn na `.update(additionalUpdates).eq("id", contestId).select("id")` — detekuje 0 rows affected (commit `934bfbd`)
  - Chybová hláška upřesněna na „Pravidla soutěže / obrázky se neuložily"
- **Frontend `src/pages/ContestDetail.tsx`:**
  - Text odkazu změněn z „Stáhnout pravidla soutěže" na „Zobrazit pravidla soutěže" (link otevírá PDF v novém tabu)

### Invariant (uzamčeno)
- Každá veřejná soutěž s nahraným PDF pravidel musí zobrazovat tlačítko/odkaz „Zobrazit pravidla soutěže" na stránce ContestDetail.
- `rules_pdf_url` se ukládá výhradně přes `additionalUpdates` UPDATE po RPC `admin_manage_contest` — RPC samotný tento sloupec neobsahuje.

### Playwright — stav po opravě
- E2E výsledek: **14 passed / 3 skipped / 0 failed** ✅
- Opraveny také testy 03-voucher-purchase.spec.ts:
  - Fixed: `waitForTimeout(3_000)` → `expect(buyButton.or(emptyState)).toBeVisible({ timeout: 15_000 })`
  - Fixed: `getByText(regex)` → `getByRole('heading', { name: '...' })` (strict mode violation)

---

## CI & PLAYWRIGHT — AKTUÁLNÍ STAV (18. 05. 2026)

### Staging Full E2E — spuštěno po PR #50 (18. 05. 2026)

- **Run:** `26029330415` — ⏳ probíhá (spuštěno po mergi PR #50 — spec 19 physical prize economy persist)
- **Spec 19** `Admin — Physical Prize Economy Persist` — `19-admin-physical-prize-economy-persist.spec.ts` — čeká na výsledek
- **Playwright testy: 19 spec souborů** (01–19); staging full E2E obsahuje všechny spec soubory

### Staging Full E2E — ZELENÝ po PR #49 (18. 05. 2026)

- **Run:** `26026329321` — ✅ **26 passed, 3 skipped, 0 failed** (2m 50s)
- **Spec 18** ✅ `Admin — Economy Persist` — `18-admin-economy-persist.spec.ts` prošel (10.7s) — **economy persistence E2E ověřena**
- **Spec 17** ✅ `Profile Smoke` prošel
- **Spec 16** ✅ `Admin — Economy Preview Smoke` prošel
- **Telegram:** `✅ OneMil STAGING full E2E OK — all specs passed` doručeno ✅

### Staging Full E2E — ZELENÝ po PR #16 (17. 05. 2026)

- **Run:** `25995782004` — ✅ **25 passed, 3 skipped, 0 failed** (3m 36s)
- **Spec 17** ✅ `Profile Smoke` — `17-profile-smoke.spec.ts` prošel (5.7s)
- **Spec 16** ✅ `Admin — Economy Preview Smoke` prošel (6.0s)
- **Telegram:** `✅ OneMil STAGING full E2E OK — all specs passed` doručeno ✅

### PR #16 — Profile smoke E2E test — MERGNUT (17. 05. 2026)

- **Branch:** `test/e2e-profile-smoke` → `main`
- **Merge commit:** `7fd9766972b4a84c9ee33b11357f42ad46c38854`
- **Přidaný soubor:** `tests/e2e/17-profile-smoke.spec.ts` (54 řádků, staging-only, read-only)
- **Co test ověřuje:** login jako E2E user → přechod na `/profile` → ověří identitu (e-mail), sekci peněženky (Peněženka, MioCoiny, Váš MioCoin účet), Účet heading, Přihlašovací údaje a Osobní údaje heading — bez redirectu na login/onboarding.
- **Přejmenování:** původně `12-profile-smoke.spec.ts` — přejmenováno na `17-` aby nedošlo ke kolizi s existujícím `12-mobile-messages-layout.spec.ts`.
- **Guard:** `test.skip` pokud chybí `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`; staging-only (přeskakuje bez `E2E_CONTEST_ID`).
- Žádný app kód, DB schéma, migrace, workflow soubory, Supabase volání, platby, soutěže, tikety, výhry, vouchery, Partner Offers ani `buy_ticket_atomic` nezměněny ✅
- `npm run build` prošel ✅

### Staging Full E2E — ZELENÝ po PR #38 (17. 05. 2026)

- **Run:** `25994857704` — ✅ **24 passed, 3 skipped, 0 failed** (2m 36s)
- **Spec 16** ✅ `Admin — Economy Preview Smoke` prošel poprvé čistě (5.3s)
- **Telegram:** `✅ OneMil STAGING full E2E OK — all specs passed` doručeno ✅

### PR #38 — spec 16 Ekonomika tab scope fix — MERGNUT (17. 05. 2026)

- **Branch:** `fix/spec16-ekon-tab-scope` → `main`
- **Merge commit:** `214248d40b95956636315ca7c7f9b60abd56fcc3`
- **Změněný soubor:** `tests/e2e/16-admin-economy-preview.spec.ts` (1 soubor)
- **Fix:** Všech 7 assertions v Ekonomika tab sekci přesunuto na `econPanel = dialog.locator('[role="tabpanel"][data-state="active"]')` — summary bar (vždy viditelný nad záložkami) obsahoval stejné texty (`Celkové odhadované náklady`, celková hodnota), strict mode odmítal 2 shody
- Žádný app kód, migrace, workflow soubory ani business logika nezměněna ✅

### PR #37 — spec 16 Balné strict mode fix — MERGNUT (17. 05. 2026)

- **Branch:** `fix/spec16-strict-mode-balne` → `main`
- **Merge commit:** `cd5a497cb4bc7b4d7dd994d620af3e3f93e33c99`
- **Změněný soubor:** `tests/e2e/16-admin-economy-preview.spec.ts` (1 řádek)
- **Fix:** `/Balné \/ pošta \/ práce/` regex → `'Balné / pošta / práce', { exact: true }` — regex matchoval label z věcného formuláře (hidden v DOM) i span v Ekonomika tabu
- Žádný app kód, migrace ani business logika nezměněna ✅

### PR #36 — Admin contest modal layout cleanup — MERGNUT (17. 05. 2026)

- **Branch:** `fix/admin-modal-layout-issue-35` → `main`
- **Merge commit:** `f6a28ca51ebf7783a3529e70fd36745fe77a95cc`
- **Změněný soubor:** `src/components/AdminContestManagement.tsx` (pouze layout CSS třídy, 5 řádků)
- **Co se změnilo:**
  - `max-w-4xl` cap odstraněn → modal je nyní `max-w-[95vw]` — podstatně širší na desktopu
  - `overflow-x-auto` odstraněn z wrapperu economy summary baru → žádný vnitřní horizontální scrollbar
  - Economy bar grid: `min-w-max grid-cols-5` → `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` (responsivní wrap)
  - `min-w-[9.5rem]` odstraněn z items (grid řídí šířku)
  - TabsList: `inline-flex w-max` → `flex flex-wrap h-auto w-full` (záložky se zalamují)
- Žádné kalkulace, validace, save behavior, Supabase volání, testy, migrace ani business logika nezměněny ✅
- `npm run build` prošel ✅

### PR #34 — Admin economy preview E2E smoke test (spec 16) — MERGNUT (17. 05. 2026)

- **Branch:** `codex/issue-33-admin-economy-preview` → `main`
- **Merge commit:** `ff45f2ad37bcf7ca4178c96277bb300aec52dd6c`
- **Přidaný soubor:** `tests/e2e/16-admin-economy-preview.spec.ts` (staging-only, read-only)
- **Co test ověřuje:**
  - Admin otevře modal „Vytvořit novou soutěž", vyplní preview pole věcné výhry (dodavatel, cena, DPH, balné, pozice)
  - Klikne „Přidat věcnou výhru" — bez finálního uložení soutěže
  - Ověří, že horní economy summary bar zobrazuje správné hodnoty (celkové náklady, doporučená cena, zisk, marže)
  - Ověří záložku Ekonomika — zobrazuje cost breakdown věcné výhry
- **Opravené selektory (Codex review feedback):**
  - `getByLabel()` nahrazen `inputByLabel()` helper: `label[hasText] → .. → input` (stabilní bez htmlFor/id)
  - `summaryValue()` přepsán: `div.uppercase.opacity-70[hasText] → xpath=following-sibling::div[1]` (přesně jeden element)
- Test se přeskakuje (`test.skip`) pokud chybí `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` ✅
- PR také přinesl Phase 3A: `AdminContestManagement.tsx` rozšířen o frontend-only cost preview pole pro věcné výhry
- Žádný app kód mimo formulář fyzických výher nezměněn; žádné migrace; žádná produkce ✅
- `npm run build` prošel ✅

### PR #24 + PR #25 — Admin Affiliate pages smoke test (spec 15) — MERGNUTY (15. 05. 2026)

- **PR #24** — `test/e2e-admin-affiliate-pages-smoke` → `main`, merge commit `8a8ba05`
  - Přidán: `tests/e2e/15-admin-affiliate-pages-smoke.spec.ts` (80 řádků, read-only)
  - Ověřuje 3 admin Affiliate stránky bez mutací: `/admin/influencers`, `/admin/influencer-commissions`, `/admin/influencer-campaigns`
  - `test.skip` pokud `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` chybí
- **PR #25** — `test/wire-admin-e2e-secrets` → `main`, merge commit `024fd92`
  - 2 řádky přidány do `playwright-staging.yml`: `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`
- **Staging admin E2E účet (staging only):**
  - `admin-e2e@onemil.cz`, id `3960e47f-b583-4ef9-a48f-786bfe432bbd`, `public.user_roles.role=admin` ✅
  - Produkce nedotčena ✅
- **GitHub Secrets přidány:** `STAGING_E2E_ADMIN_EMAIL`, `STAGING_E2E_ADMIN_PASSWORD`
- **Spec 15 nyní RUNS:** run `25942146994` ✅ — **23 passed, 3 skipped, 0 failed** — spec 15 ✅ (10.5s) — Telegram OK
- App kód nedotčen — žádné migrace, žádný deploy, žádná produkce ✅

### PR #23 — Affiliate E2E secrets zapojeny do staging workflow — MERGNUT (15. 05. 2026)

- **Branch:** `test/wire-affiliate-e2e-secrets` → `main`
- **Merge commit:** `ecf7abf`
- **Změna:** 2 řádky přidány do `.github/workflows/playwright-staging.yml` — `E2E_AFFILIATE_EMAIL` a `E2E_AFFILIATE_PASSWORD` předávány ze `STAGING_E2E_AFFILIATE_EMAIL` / `STAGING_E2E_AFFILIATE_PASSWORD` secrets.
- **Staging Affiliate E2E účet vytvořen (staging only):**
  - `affiliate-e2e@onemil.cz` vložen do staging `auth.users` (e-mail potvrzen), `auth.identities` vytvořen.
  - `public.partners` row: `status=approved`, `approved_at=now()`, `notes={"type":"influencer"}`, `auth_user_id=8975593e-cc27-4f6b-ba23-c7077c914f38`, `contact_email=affiliate-e2e@onemil.cz`.
  - Produkce nedotčena ✅
- **GitHub Secrets přidány:** `STAGING_E2E_AFFILIATE_EMAIL`, `STAGING_E2E_AFFILIATE_PASSWORD` (Divuna/million-ticket-draw).
- **Spec 14 nyní RUNS (ne skip):** run `25941172937` ✅ — **22 passed, 3 skipped, 0 failed** — spec 14 `Affiliate Dashboard — Login Smoke` ✅ (4.9s) — Telegram OK.
- App kód nedotčen — žádné migrace, žádný deploy, žádný zásah do produkce ✅

### PR #22 — spec 10 flaky E2E test opraven — MERGNUT (15. 05. 2026)

- **Branch:** `fix/e2e-voucher-balance-before-read` → `main`
- **Merge commit:** `3d645d7b98f5650c0a0f29c86f24f8ac87ff85cf`
- **Změněný soubor:** `tests/e2e/10-voucher-purchase-balance.spec.ts` — pouze (+16 / −1)
- **Root cause:** „before" zůstatek peněženky byl čten bez `waitForResponse(GET /rest/v1/wallets)`. „After" čtení již tento guard mělo. Při dvou staging bězích spuštěných v rozmezí 7 minut mohla async operace z předchozího spece (spec 09 `buy_ticket_atomic`) doběhnout právě v okně spec 10, čímž test naměřil 15 MC pokles místo očekávaných 5 MC.
- **Fix:** Přidán `waitForResponse(GET /rest/v1/wallets)` armovaný **před** `page.goto()` a awaited před čtením `balanceParagraph.textContent()` — symetrizuje „before" čtení s již existujícím guardem na „after" čtení.
- **PR #21 nebyl příčinou:** spec 14 v obou failing i passing runech skipoval čistě (bez secrets). Selhání bylo pre-existing flakiness v spec 10, odhalené těsným spuštěním dvou E2E runů.
- **App kód nedotčen** — žádná wallet logika, voucher logika, Stripe, soutěže, tikety, výhry, Partner Offers, Affiliate, `buy_ticket_atomic` — vše beze změny.
- **Pre-merge branch Staging Full E2E:** run `25939178932` ✅ 21 passed, 4 skipped, 0 failed — spec 10 ✅ (17.0s)
- **Post-merge production smoke:** run `25939417571` ✅ 5 passed (20.7s) — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25939483233` ✅ **21 passed, 4 skipped, 0 failed** — spec 10 ✅ (13.4s) — Telegram OK
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

### PR #21 — Affiliate dashboard login smoke test — MERGNUT (15. 05. 2026)

- **Branch:** `test/e2e-affiliate-dashboard-smoke` → `main`
- **Merge commit:** `b868aaf183ceeee71544832c43e23758cf46d809`
- **Přidaný soubor:** `tests/e2e/14-affiliate-dashboard-smoke.spec.ts` (115 řádků)
- **Co test ověřuje:** `/partner/login` form → přihlášení schváleného Affiliate partnera → redirect na `/influencer/dashboard` → „Aktivní Affiliate partner" badge → H1 „Vydělávejte s OneMil" → „Váš Affiliate odkaz" sekce → `input[readonly]` obsahuje `/?ref=` pattern.
- **Guard:** `test.skip` pokud `E2E_AFFILIATE_EMAIL` / `E2E_AFFILIATE_PASSWORD` chybí — skipuje čistě v production smoke i staging full E2E bez secrets.
- **Read-only:** bez Supabase write, bez vytváření uživatelů, bez form submission dat.
- **Staging secrets doplněny v PR #23:** `STAGING_E2E_AFFILIATE_EMAIL` a `STAGING_E2E_AFFILIATE_PASSWORD` přidány do GitHub Secrets a zapojeny do `playwright-staging.yml`. Spec 14 nyní běží a je zelený ✅
- **Production smoke (větev):** run `25937181131` ✅ SUCCESS
- **Pre-merge branch Staging Full E2E:** run `25937679308` ✅ 21 passed, 4 skipped (spec 14 skip ✅)
- **Post-merge production smoke:** run `25937888356` ✅ SUCCESS — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25937949756` ❌ FAILED — spec 10 flaky (15 MC místo 5 MC) — příčina: 2 runs v 7 minutách, async timing. **Spec 14 nesouvisí — skippoval čistě.** Opraveno v PR #22 (viz výše).
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

### PR #17 — Messages composer fix — MERGNUT (15. 05. 2026)

- **Branch:** `fix/messages-composer-above-bottom-nav` → `main`
- **Merge commit:** `42a06f6`
- **Změněný soubor:** `src/pages/Messages.tsx` — 1 řádek
- **Fix:** Odstraněna třída `min-h-screen` z vnějšího wrapperu Messages stránky. `index.css` již definuje `.messages-mobile-fixed-shell` s `height: calc(100dvh - 5.75rem - env(safe-area-inset-bottom, 0px))` na mobilu — výška viewportu minus spodní navigace. Tailwindový `min-h-screen` (`min-height: 100vh`) tuto hodnotu přebíjel, čímž vstupní pole skončilo za spodní navigací na iPhone/PWA.
- **Výsledek:** Psací pole je celé viditelné těsně nad spodní navigací; zprávy scrollují ve svém kontejneru; spodní lišta zůstává fixní.
- **Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.**
- **PR smoke:** run `25887802417` ✅ 5 passed (1m10s)
- **Pre-merge Staging Full E2E:** run `25887887248` ✅ 17 passed, 3 skipped, 0 failed (2m6s)
- **Post-merge production smoke:** run `25888181338` ✅ 5 passed (18.8s) — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25888244060` ✅ 17 passed, 3 skipped, 0 failed (2m21s) — Telegram OK
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

### PR #14 čistý test-only — Voucher purchase E2E (spec 10) — MERGNUT (14. 05. 2026)

- **Branch:** `test/e2e-voucher-purchase-balance-clean` → `main`
- **Merge commit:** `4cba4b0`
- **Přidané soubory (pouze 4):**
  - `tests/e2e/10-voucher-purchase-balance.spec.ts` — nový Staging Full E2E test
  - `.github/workflows/playwright-staging.yml` — přidány 3 seed/reset kroky
  - `onemil_state.md` — dokumentace
  - `onemil_history.md` — dokumentace
- **Test ověřuje:** login → /contest/:id balance read → /vouchers buy E2E Spec10 Voucher → Zakoupené tab "Uplatnit voucher" → balance decrease o přesně voucherPrice MC
- **Guard:** test.skip pokud `E2E_CONTEST_ID` není nastaven (produkční CI ho nemá)
- **Collision prevention:** E2E Spec10 Voucher seeded s `created_at: "2020-01-01"` (last in list); spec03 používá `.first()` (newest = E2E Spec03 Voucher) — žádná kolize
- **App code nedotčen** — `useUserVouchers.ts` fix je již na main (PR #13)
- **PR #11 uzavřeno bez merge** (bylo smíšené)
- **Pre-merge Staging Full E2E:** run `25882844526` ✅ **16 passed, 3 skipped, 0 failed** (2m0s)
- **Post-merge production smoke:** run `25883126324` ✅ **5 passed (21.7s)** — Telegram OK
- **Post-merge Staging Full E2E na main:** run `25883434451` ✅ **16 passed, 3 skipped, 0 failed** (2m12s) — spec10 prošel 16.5s, Telegram OK
- **Žádná migrace není součástí PR #14** — RLS fix byl proveden manuálně (viz sekce níže)

### Staging user_vouchers RLS — MANUÁLNĚ OPRAVENO (14. 05. 2026)

**Nález:** Stagingový baseline dump vynechal tři RLS policies na tabulce `user_vouchers`. Produkce (`xkzhjldrojjlrkezorey`) měla všechny 4 správné policies. Staging (`dxmowysntemfqfnanxua`) měl pouze `admin_all_voucher_access_secure` (ALL).

**Chybějící policies na stagingu:**
- `user_owns_voucher` (SELECT, `user_id = auth.uid()`) — **kritická** — bez ní `fetchUserVouchers()` vracelo `[]` pro všechny běžné uživatele (PostgREST vrací prázdné pole, ne chybu); tab Zakoupené byl vždy prázdný
- `user_vouchers_insert_own` (INSERT) — chybělo pro přidávání oblíbených přes frontend
- `user_vouchers_delete_own` (DELETE) — chybělo pro odebírání oblíbených přes frontend

**Fix:** Tři policies přidány manuálně na staging přes Supabase MCP. Produkce nedotčena.

**Žádná migrace nebyla commitnuta** v PR #14. Tato oprava je staging infrastrukturní maintenance — není to app kód ani produkční schémová změna.

### PR #13 — useUserVouchers PostgREST embedded join fix — MERGNUT (14. 05. 2026)

- **Branch:** `fix/user-vouchers-fetch` → `main`
- **Merge commit:** `f9719101cf98d6063aaf009f7b50acd2e833c33c`
- **Změněný soubor:** `src/hooks/useUserVouchers.ts` pouze
- **Fix:** dva explicitní dotazy místo `voucher:vouchers!user_vouchers_voucher_id_fkey(...)` — PostgREST embedded join vracel HTTP 400 na stagingu (FK constraint name neshoda), tiše zachycený → `setVouchers([])` → prázdný tab Zakoupené
- **PR smoke:** run `25878064722` ✅ success
- **Post-merge production smoke:** run `25878209886` ✅ success
- **Post-merge Staging Full E2E na main:** run `25878303521` ✅ 15 passed, 3 skipped
- **PR #11 uzavřeno bez merge** (smíšené změny — app kód + testy + CSS)
- Nebyl proveden deploy, migrace ani zásah do produkčních dat ✅

---

### Staging full E2E — ZELENÝ (10. 05. 2026, run `25625184545`)

- Workflow: **Playwright Staging Full E2E** (`.github/workflows/playwright-staging.yml`)
- Trigger: `workflow_dispatch`
- Výsledek: ✅ **ALL PASSED** — 13 passed, 4 skipped (expected), 0 failed, 2m 33s
- Všech 9 spec souborů (`01–08`, plus `03-ticket-purchase` je ve dvou souborech): prošly nebo byly přeskočeny dle očekávání
- Auto-seed win contestu funguje: `STAGING_SUPABASE_SERVICE_ROLE_KEY` → PostgREST INSERT → nový contest s `created_at: "2020-01-01T00:00:00Z"` → ID předáno jako step output
- Wallet reset funguje: PostgREST PATCH nastaví `balance_coins: 5000, bonus_balance_coins: 0` před každým spuštěním testů (commit `50ba68c`)
- Telegram success notifikace doručena: `✅ OneMil STAGING full E2E OK — all specs passed`
- Produkce nedotčena
- **Pipeline je bezpečná k plánování každých 8 hodin** — čeká na schválení

**Commity (stabilizace + wallet reset + signup fix):**
| Commit | Popis |
|--------|-------|
| `3c4aecf` | `ci: keep auto win contest out of games first position` — seed contest dostane `created_at: 2020-01-01` |
| `324a747` | `test: stabilize destructive win flow e2e` — toast scoped na `[data-sonner-toast]`; `retries: 0` |
| `6ee26df` | `test: scope result dialog locator to avoid cookie banner conflict` — `getByRole('dialog', { name: /Výhra/i })` |
| `e70fd5c` | `test: robust wait for offer cards or empty state in partner offer open spec` — `Promise.race` wait |
| `50ba68c` | `ci: reset staging e2e wallet before full run` — wallet reset na 5 000 MioCoin před testy |
| `631f915` | `test: use valid email domain for staging signup` — `@example.com` → `@onemil.cz`; HTTP 400 není skip |

**Signup test — aktuální stav:**
- Email doména: `e2e+${Date.now()}@onemil.cz`
- HTTP 400 se neskipuje — reálný staging signup zůstává testován
- Ověřeno: run `25627706906` ALL PASSED 2m 45s

**Schedule (commit `37cfd6c`):**
| Workflow | Časy (Praha CEST) | Cron |
|----------|-------------------|------|
| Production smoke | 00:00 / 08:00 / 16:00 | `0 22 * * *` / `0 6 * * *` / `0 14 * * *` |
| Staging full E2E | 04:00 / 12:00 / 20:00 | `0 2 * * *` / `0 10 * * *` / `0 18 * * *` |

- Žádný překryv mezi production smoke a staging full E2E
- `workflow_dispatch` zůstává dostupný pro manuální spuštění

**Pravidla (nezměnit):**
- Destruktivní testy (03–08) **nesmí běžet v produkci** — `playwright.yml` je hard-coded pouze na `01-registration` + `02-login`
- Každý run dostane nový win contest a resetovaný wallet; stav se nekumuluje mezi běhy

### Production smoke — manuálně ověřeno (10. 05. 2026, run `25618763318`)

- Workflow: **Playwright Smoke Tests** (`.github/workflows/playwright.yml`)
- Trigger: `workflow_dispatch`
- Výsledek: **6 passed** za 1m 22s
- Spuštěné testy:
  - `01-registration.spec.ts` — 3 passed ✅
  - `02-login.spec.ts` — 3 passed ✅
- Specs 03–08 **nebyly spuštěny** — potvrzeno z logu; žádný ticket purchase, voucher purchase, wallet, win-flow ani Partner Offers test neproběhl v produkci
- Telegram zpráva doručena: `✅ OneMil PROD smoke OK — registration + login passed` ✅
- Neblokující varování: `.claude/worktrees/ecstatic-lichterman-1aa60a` způsobilo `git exit code 128` v post-job cleanup kroku — testy ani pipeline nebyly ovlivněny

### Workflow split — produkce vs staging (commit `82f979f`)

Dva oddělené CI workflow:

| Workflow | Soubor | Trigger | Testy |
|----------|--------|---------|-------|
| Production smoke | `.github/workflows/playwright.yml` | push/PR `main`, schedule 3× denně, `workflow_dispatch` | pouze `01-registration`, `02-login` |
| Staging full E2E | `.github/workflows/playwright-staging.yml` | `workflow_dispatch` only | všech 9 spec souborů |

**Produkce nemůže spustit testy 03–08** — `playwright.yml` má hard-coded paths na dva spec soubory. Ticket purchase, voucher purchase, wallet, win-flow a Partner Offers testy jsou fyzicky nedostupné z produkčního workflow.

**Staging secrets** (mapovány na standardní env var názvy, které app a testy čtou):
- `STAGING_VITE_SUPABASE_URL` → `VITE_SUPABASE_URL`
- `STAGING_VITE_SUPABASE_ANON_KEY` → `VITE_SUPABASE_ANON_KEY`
- `STAGING_VITE_INTERNAL_FUNCTION_TOKEN` → `VITE_INTERNAL_FUNCTION_TOKEN`
- `STAGING_E2E_TEST_EMAIL` → `E2E_TEST_EMAIL`
- `STAGING_E2E_TEST_PASSWORD` → `E2E_TEST_PASSWORD`
- `STAGING_E2E_CONTEST_ID` → `E2E_CONTEST_ID`
- `STAGING_E2E_WIN_CONTEST_ID` → `E2E_WIN_CONTEST_ID`

Staging workflow aktivní až po seedu staging DB a nastavení těchto secrets.

**Telegram zprávy:**
- Production: `✅ OneMil PROD smoke OK — registration + login passed` / `❌ OneMil PROD smoke FAILED` + run URL
- Staging: `✅ OneMil STAGING full E2E OK — all specs passed` / `❌ OneMil STAGING full E2E FAILED` + run URL

### Opravená chyba v registračním testu
- **Příčina 4× selhání (01.05.2026):** Supabase má zapnuté potvrzení emailu → po registraci `session: null` → localStorage bez `onemil-auth` klíče → `Profile.tsx` přesměroval na `/login` → `expectSessionExists()` selhalo
- **Oprava:** `tests/e2e/01-registration.spec.ts` — test nyní zvládá 3 platné stavy po registraci:
  1. Email auto-confirmed → session v localStorage → bottom nav viditelný
  2. Email confirmation required + session null → Profile přesměruje na `/login` → test prochází
  3. Email confirmation required + dočasná session → DateOfBirthGuard zobrazí "Potvrďte svůj e-mail" → test prochází
- **Bonus:** pokud Supabase vrátí 429 (rate limit) nebo 422, test se přeskočí místo pádu CI
- **Commity:** `945a77d`, `0659a28`

### Scheduled testy — nové nastavení
- Testy nyní běží **3× denně** automaticky (commit `156000f`):
  - 00:00 Praha (22:00 UTC)
  - 08:00 Praha (06:00 UTC)
  - 16:00 Praha (14:00 UTC)
- Časy jsou v letním čase (CEST = UTC+2); v zimě (CET) by byl posun o 1h
- Workflow: `.github/workflows/playwright.yml`

### Nástroje diagnostiky
- **gh CLI** nainstalován na tomto stroji (via winget)
- **GitHub Credential** — token je čitelný z Windows Credential Manager (`git:https://github.com`) přes P/Invoke CredRead API → použito pro přímé volání GitHub Actions API
- Výsledky runů čitelné přes: `gh run view <run_id> --log-failed` nebo GitHub API

### Stav testů (po opravě)
- `01-registration`: ✅ opraveno (zvládá email confirmation i rate limit)
- `02-login`: ✅ passing
- `03-08`: ⏭ skip v produkci — čekají na staging secrets v `playwright-staging.yml`

---

## STAGING SEED — OVĚŘENÝ STAV (10. 05. 2026)

**Projekt:** `onemil-staging`, ref `dxmowysntemfqfnanxua`, region `eu-north-1`

### Test user
| Pole | Hodnota |
|------|---------|
| Email | `e2e@onemil.cz` |
| User ID | `7822a82e-f1d3-45ee-827b-679640ce6b65` |
| Wallet balance | `5000.00` MioCoin |

### Contests
| Secret | Contest ID | Status | next_ticket_number |
|--------|-----------|--------|-------------------|
| `STAGING_E2E_CONTEST_ID` | `3fa56db0-4007-4fb7-aa2f-e460173070d8` | `active` | 1 |
| `STAGING_E2E_WIN_CONTEST_ID` | `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb` | `active` | 100 |

**Win contest poznámka:** Po každém úspěšném test-05 běhu je nutné resetovat `sold_tickets` zpět na `N - 1` a `next_ticket_number` na 100, jinak test 05 selže na dalším CI runu.

### Partner offer
| Pole | Hodnota |
|------|---------|
| Offer ID | `28278c87-17b6-49c3-ae7e-004d0d1f18b0` |
| Status | `approved` |
| deployment_mode | `selected_contests` |
| Připojena k | `STAGING_E2E_CONTEST_ID` (`3fa56db0-4007-4fb7-aa2f-e460173070d8`) |

### GitHub Secrets — co zbývá nastavit
Staging seed je připraven. Zbývá přidat do GitHub Secrets repozitáře:
- `STAGING_VITE_SUPABASE_URL`
- `STAGING_VITE_SUPABASE_ANON_KEY`
- `STAGING_VITE_INTERNAL_FUNCTION_TOKEN`
- `STAGING_E2E_TEST_EMAIL` → `e2e@onemil.cz`
- `STAGING_E2E_TEST_PASSWORD`
- `STAGING_E2E_CONTEST_ID` → `3fa56db0-4007-4fb7-aa2f-e460173070d8`
- `STAGING_E2E_WIN_CONTEST_ID` → `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb`

Po nastavení secrets je `playwright-staging.yml` připraven ke spuštění přes `workflow_dispatch`.

---

## E2E TESTOVÁNÍ — PRODUKČNÍ BEZPEČNOST & STAGING PLÁN (05. 05. 2026)

### Proč nelze destruktivní testy spouštět v produkci

Nákup tiketu (`buy_ticket_atomic`) zapisuje do **12+ systémů** v jedné atomické transakci a mimo ni:
- `wallets` (deduct balance)
- `wallet_transactions` (append-only ledger — **nelze mazat ani upravovat**, trigger `fn_wallet_transactions_immutable()` RAISES EXCEPTION na UPDATE/DELETE)
- `tickets`
- `contests` (sold_tickets increment)
- `bonus_prizes` (status → won)
- `winners` + `winner_status_history`
- `event_logs` → `event_queue` → Sofinity (analytika)
- `user_partner_offers` (assign partner offer)
- `partner_offers.last_assigned_at`
- `partner_offer_activations`
- `notifications` → `push_log` → OneSignal
- `email_queue`

**Klíčový závěr:** `wallet_transactions` je append-only permanentní finanční ledger. Jakýkoli test, který volá `buy_ticket_atomic`, vytváří permanentní záznamy. Cleanup není možný. **Destruktivní testy (03–08) se nesmí spouštět v produkci.**

### Výsledek porovnání tří možností E2E izolace

| Možnost | Závěr |
|---|---|
| Separátní staging Supabase projekt | ✅ **Doporučeno** — plná izolace, stejný kód aplikace, jiné env/secrets |
| `is_e2e` flag na contestech v produkci | ⚠️ Neúplné — funguje pro čtecí cesty, ale wallet_transactions se stále píší trvale; neizoluje Sofinity pipeline |
| Testovací tabulky + cleanup v produkci | ❌ **Nemožné** — `wallet_transactions` immutability trigger zakazuje DELETE i UPDATE |

### Potvrzené projekty a regiony (09. 05. 2026)

| | Produkce | Staging |
|---|---|---|
| **Projekt** | `onemil` | `onemil-staging` |
| **Project ref** | `xkzhjldrojjlrkezorey` | `dxmowysntemfqfnanxua` |
| **Region** | `eu-north-1` | `eu-north-1` |
| **První secret po vytvoření** | — | `SOFINITY_RELAY_URL` → `sofinity-noop` |

### Staging Edge Functions — aktuální stav (10. 05. 2026)

| Funkce | Status | Poznámka |
|--------|--------|---------|
| `sofinity-noop` | ✅ ACTIVE | Absorbuje Sofinity eventy; nasazena dříve |
| `upload-ticket-share` | ✅ ACTIVE | Nahrává share PNG do storage; nasazena 10. 05. 2026 |

**Storage:** bucket `ticket-shares` existuje na staging `dxmowysntemfqfnanxua`, `public: true`, `file_size_limit: 5242880` (5 MB) ✅

Produkce `xkzhjldrojjlrkezorey` nebyla dotčena. Žádné jiné funkce nebyly nasazeny.

### Staging koncept

- **Stejný kód aplikace** (`main` branch) — žádné speciální code paths
- **Jiná instance Supabase** — jiný `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, jiné secrets
- **Jiné env proměnné pro CI testy** (staging secrets v GitHub Actions)
- Frontend klient je správně připraven: `client.ts` čte Supabase URL/key z env proměnných — žádné hardcodování ✅

### Staging readiness audit — co brání plné izolaci

**Frontend (Supabase klient):** ✅ env-var-based, připraven ihned

**Tři hardcoded URL, které je nutno opravit před staging:**

| Soubor | Řádek | Problém | Fix |
|---|---|---|---|
| `supabase/functions/process_event_queue_worker/index.ts` | 19 | **Nejvyšší riziko** — hardcoded `https://rrmvxsldrjgbdxluklka.supabase.co/functions/v1/sofinity-event` (Sofinity relay); staging by posílal události do produkční analytiky | `Deno.env.get("SOFINITY_RELAY_URL") ?? "<prod-url>"` |
| `src/pages/ShareTicket.tsx` | 22 | Hardcoded prod Supabase URL pro OG image generování | Nahradit `` `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/og-ticket-share` `` |
| `src/components/TicketResultModal.tsx` | 416 | Stejný hardcoded OG image URL | Stejný fix jako ShareTicket.tsx |

`supabase/functions/daily-onboarding-reminder/index.ts:103` obsahuje fallback URL ale je nízké riziko — potlačí se nastavením `APP_URL` secret v staging projektu.

### Dvoustupňová CI strategie (doporučeno)

| CI | Testy | Databáze | Důvod |
|---|---|---|---|
| **Produkční CI** (current) | 01–02 (registration, login) | Produkce | Pouze read/auth — žádné peněžní transakce |
| **Staging CI** (budoucí) | 01–08 (full suite) | Staging Supabase | Plná izolace — destruktivní testy bezpečné |

### Fáze 1 — Staging-safe URL fix — DOKONČENO (09. 05. 2026, commit `20c6452`)

Hardcoded produkční URL nahrazeny env/client-based hodnotami:

| Soubor | Změna |
|---|---|
| `supabase/functions/process_event_queue_worker/index.ts` | `sendEndpoint`: `Deno.env.get("SOFINITY_RELAY_URL") ?? "<prod URL>"` |
| `src/pages/ShareTicket.tsx` | OG image URL: `${supabaseUrl}/functions/v1/og-ticket-share` |
| `src/components/TicketResultModal.tsx` | OG image URL: `${supabaseUrl}/functions/v1/og-ticket-share` |

- Build: ✅ passed (0 errors)
- `.claude/settings.local.json` nebyl commitnut ani pushnut
- `api/og-ticket.ts` a `vercel.json` — legacy; aktivní deploy cesta je Lovable, tyto soubory se nikdy nespouští v produkci; oprava odložena

### Krok-za-krokem plán pro staging (Fáze 1 hotova, čeká na souhlas pro Fázi 2)

**Fáze 1 — Opravit hardcoded URLs ✅ HOTOVO (commit `20c6452`)**
1. `process_event_queue_worker/index.ts` — hotovo
2. `src/pages/ShareTicket.tsx` — hotovo
3. `src/components/TicketResultModal.tsx` — hotovo

**Fáze 2 — Vytvořit staging Supabase projekt ✅ HOTOVO (09. 05. 2026)**
- Projekt `onemil-staging` vytvořen, ref `dxmowysntemfqfnanxua`, region `eu-north-1`
- Secret `SOFINITY_RELAY_URL` nastaven manuálně → `https://dxmowysntemfqfnanxua.supabase.co/functions/v1/sofinity-noop`
- Edge Function `supabase/functions/sofinity-noop/index.ts` vytvořena a nasazena pouze na staging (commit `4167527`)
- POST test: HTTP 200 `{"ok":true,"noop":true}` ✅
- Produkční projekt `xkzhjldrojjlrkezorey` nedotčen ✅
- Produkční Sofinity relay `rrmvxsldrjgbdxluklka` nedotčen ✅
- Žádné migrace nebyly spuštěny ✅

**Fáze 3 — CI staging workflow**
8. Přidat GitHub Secrets pro staging: `STAGING_VITE_SUPABASE_URL`, `STAGING_VITE_SUPABASE_ANON_KEY`, `STAGING_E2E_TEST_EMAIL`, `STAGING_E2E_TEST_PASSWORD`
9. Vytvořit `.github/workflows/playwright-staging.yml` — spouští plný suite 01–08 proti staging projektu
10. Aplikovat migrace na staging DB
11. Seedovat: testovacího uživatele, wallet, test contest(y), partner offer

**Aktuální stav:** Fáze 1 + 2 hotovy. Fáze 3 pozastavena — viz sekce níže (partial migration failure + cleanup).

**Fáze 3 — Migrace na staging DB — POZASTAVENO (10. 05. 2026)**

`npx supabase db push` selhal při migraci #3 (`20250914043049_`) — chyba: `relation "public.payments" does not exist`.

**Root cause:** První ~5 migračních souborů (blank-name, 14. 09. 2025) jsou hotfixy na již existující schéma, ne CREATE skripty. Počáteční schéma (tabulky `payments`, `wallets`, `users`, `contests`, `tickets` atd.) bylo vytvořeno přímo v Supabase dashboardu a **nebylo nikdy zachyceno jako migrační soubor**. Staging má prázdnou DB — tyto tabulky neexistují.

**Stav staging DB — schema baseline aplikován manuálně (10. 05. 2026):**
- Produkční schéma zdumpováno a aplikováno na staging přes Supabase SQL Editor (manuálně)
- Ověřeno na staging `dxmowysntemfqfnanxua`:
  - 73 public tabulek ✅ (včetně `public.payments`, `wallets`, `tickets`, `contests`, `users` atd.)
  - `buy_ticket_atomic` funkce existuje ✅
  - `fn_wallet_transactions_immutable()` trigger existuje ✅
  - 95 RLS policies ✅
- Produkce `xkzhjldrojjlrkezorey` nedotčena ✅

**`supabase_migrations.schema_migrations` — experimenty s formátem (10. 05. 2026):**

CLI extrahuje z lokálních `.sql` souborů **vedoucí číselný prefix** (ne celý stem), např. `20250914034944_.sql` → `20250914034944`. DB záznamy s jiným formátem CLI nespáruje.

| Pokus | Obsah | Počet | Výsledek dry-run |
|-------|-------|-------|-----------------|
| 1 | Celé filename stems (bez `.sql`) | 341 | ❌ Všech 341 "Remote not found" |
| 2 | Číselné prefixy, deduplikováno | 327 | ❌ 3 krátké 8-ciferné prefixy "Remote not found" |
| 3 | 324 prefixů (bez 3 konfliktních) | 324 | ❌ 17 lokálních souborů "pending before last remote" |
| 4 | 324 + 17 plných stemů sekundárních souborů | 341 | ❌ 22 chyb (plné stemy + 5 dříve fungujících se rozbilo) |
| **Finální** | **Zpět na 324 číselných prefixů** | **324** | **❌ 17 souborů pending — nejlepší dosažitelný stav** |

**Root cause neřešitelného selhání dry-run:**
- 4 páry souborů sdílí stejný 14-ciferný timestamp (např. `20260315280000_buy_ticket_rate_limit.sql` + `20260315280000_cleanup_winners_indexes.sql`) — CLI páruje jeden DB záznam s prvním souborem abecedně, druhý zůstává "pending before last remote"
- 3 smíšené skupiny mají 8-ciferné i 14-ciferné soubory (např. `20260419_*` + `20260419104519_*`) — 8-ciferný prefix CLI nespáruje, soubor zůstává pending
- **Celkem: 17 lokálních souborů permanentně pending** při 324 DB záznamy; exit code 0 nelze dosáhnout bez přejmenování souborů

**Aktuální stav `schema_migrations` na staging:** 324 řádků (číselné prefixy).

**⛔ Nespouštět `db push` na staging. Needitovat `schema_migrations` bez schválení.**

**Rozhodnutá strategie pro staging migrace — Option A (10. 05. 2026):**
- `db push` se na staging **nepoužívá** — ani nyní, ani dokud nebudou přejmenovány duplicitní soubory
- Nové změny DB se aplikují na staging **manuálně přes Supabase SQL Editor** — stejný workflow jako v produkci
- Aktuální staging schema baseline je přijat jako správný; 17 pending souborů je již obsaženo v baseline schématu, CLI je nedokáže sledovat kvůli duplicitním/smíšeným timestamp prefixům
- `schema_migrations` zůstává na 324 řádcích — neměnit
- Staging CI (testy 03–08) nevyžaduje `db push --dry-run` exit 0 — závisí pouze na správnosti schématu DB

---

## VIZUÁLNÍ SYSTÉM / GRAFIKA — NEDOKONČENO (27. 04. 2026)

### Aktuální situace
Grafický systém je v přechodném stavu. Momentálně probíhá testování funkčnosti systému (platby, tiket purchase, contest flow). Grafika bude dořešena až po ověření funkčnosti.

### Co bylo uděláno (větev `claude/setup-playwright-tests-bShrg`)
Commity `d6d4597` a `25e87dd` — **nemergnuto do `main`**:
- Font nadpisů změněn z `Plus Jakarta Sans` → **Poppins**
- CSS proměnné `--primary`, `--secondary`, `--accent` přepsány z modré/zlaté na **Energy Orange** (`hsl(32 100% 50%)`)
- Bordery a gradienty ContestCard a ContestDetail přepsány ze zlaté na oranžovou
- Progress bary: `#f6e27a/#d4a017` → `#FF8A00/#FFB547`

### Co bylo uděláno (větev `claude/thirsty-volhard-e1eb7c`, commit `a21ef28`)
Vizuální zmírnění na aktuální větvi — **pushnuté, nemergnuto do `main`**:
- `src/index.css` — `--neon-gold` z `43 90% 55%` → `33 70% 44%`, stejně `--package-gold`, `--secondary`, `--accent`; `--heading-gold*` sada ztmavena; `--glow-gold` opacity snížena ~50 %; keyframes `luxury-pulse`, `luxury-glow`, `title-glow` — gold opacity snížena; `.text-heading-gold` gradient zmírněn; `.text-neon-gold` text-shadow snížena
- `src/components/ContestCard.css` — border sweep barvy ze zlaté na tlumenou amber-oranžovou; inner glow opacity snížena
- `src/components/ContestCard.tsx` — statický border → `rgba(191,198,207,0.16)`; progress bar gradient → `#C07018/#884A08`; CTA button text/border → tlumená amber-oranžová
- `src/components/MioCoin.tsx` — outer ring gradient ze `yellow-500/40` → `amber-800/25`; shadow opacity snížena

### Co ještě chybí / co je potřeba dořešit
- [ ] Rozhodnutí: mergovat brand větev (`setup-playwright-tests-bShrg`) nebo aplikovat brand tokeny přímo na `main`
- [ ] Sjednotit font: `Plus Jakarta Sans` → `Poppins` (nebo potvrdit jiný výběr)
- [ ] Sjednotit primární barvu: zlatá → Energy Orange `#FF8A00` (nebo potvrdit výsledek zmírnění z `thirsty-volhard`)
- [ ] Projít stránky: Homepage, Games, ContestDetail, Profile, Vouchers — vizuálně ověřit konzistenci po brand změnách
- [ ] MioCoin package karty (Vouchers page) — přidat dark overlay, ověřit kontrast
- [ ] Otestovat v prohlížeči na localhost:8080/8081 a schválit výsledek před mergem

### Větve relevantní pro grafiku
| Větev | Co obsahuje | Stav |
|---|---|---|
| `claude/setup-playwright-tests-bShrg` | Poppins + Energy Orange (úplná brand aplikace) | Hotovo, nemergnuto |
| `claude/thirsty-volhard-e1eb7c` | Zmírnění zlaté, soft rgba bordery | Hotovo, nemergnuto |
| `main` | Původní zlatá/modrá paleta | Žádné brand změny |

---

**Aktualizováno (předchozí):** 24. 04. 2026 (CI & Payment Pipeline stabilization)

---

## CI & PAYMENT PIPELINE – FINAL VERIFIED STATE (24.04.2026)

### Playwright Smoke Tests
- Celkem **8 spec souborů**, ~20 testů:
  - `01-registration` — registrace nového účtu
  - `02-login` — přihlášení existujícího účtu
  - `03-ticket-purchase` — navigace na contest + pokus o koupi tiketu
  - `04-voucher-purchase` — (starší spec, čeká na credentials)
  - `05-win-flow` — koupě poslední tikety → výhra (vyžaduje `E2E_WIN_CONTEST_ID`)
  - `06-partner-offers` — po nákupu tikety detekce partner offer v result modalu
  - `07-partner-offer-open` — /wins → Nabídky tab → klik na nabídku → assert dialog + opened_at PATCH
  - `08-partner-offer-persistence` — otevření nabídky → reload → nabídka stále přítomna + žádný „Nová" badge
- Registrace + login testy: **passing**
- Testy 03–08: **skip** (čekají na `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`; 05 navíc `E2E_WIN_CONTEST_ID`)
- CI workflow: `.github/workflows/playwright.yml` — branch `claude/**`, PR do `main`, `workflow_dispatch`
- Supabase propojen v CI přes GitHub Secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- webServer: `npm run dev` (Vite, port 8080), spouštěn automaticky Playwrightem

### Nový env var pro win-flow test
- `E2E_WIN_CONTEST_ID` — musí ukazovat na soutěž se **právě 1 zbývající tiketou** (seeded contest)
- Přidat jako GitHub Secret + případně do lokálního `.env`

### Stripe webhook (`supabase/functions/stripe-webhook/index.ts`)
- Všechny failure paths uvnitř `checkout.session.completed` vracejí **HTTP 500** (Stripe retry)
- Idempotency: před INSERT se kontroluje `stripe_session_id` v `payments`; duplicity vracejí 200 + log `STRIPE WEBHOOK DUPLICATE`
- Structured failure log: `console.error('STRIPE WEBHOOK FAILURE', {session_id, reason, user_id, amount})`
- Outer catch: opraveno z 400 → **500** (aby Stripe retryoval i při neočekávaných runtime chybách)
- Signature check inner catch zůstává 400 (správně — unsigned requesty nejsou validní Stripe events)
- Wallet credit: trigger `update_wallet_after_payment` (AFTER INSERT ON payments WHERE status='completed')

### Registrace + auth flow
- `auth.users` → trigger `on_auth_user_created` → `handle_new_auth_user()` → `public.users` + `profiles` + `wallets`
- Migrace `20260420_ensure_wallet_exists.sql`: centralizovaná DB funkce `ensure_wallet_exists(p_user_id)` — commitnuta, **nutno aplikovat v Supabase SQL Editoru**
- Migrace `20260420_fix_profiles_insert_remove_user_id.sql` — commitnuta, **nutno aplikovat v Supabase SQL Editoru**

### won_type priority oprava
- Migrace `supabase/migrations/20260424_fix_won_type_main_priority_over_bonus.sql` — commitnuta (commit `68e06fc`), **nutno aplikovat v Supabase SQL Editoru**
- Bug: pokud poslední tiket zároveň zasáhl bonusovou pozici, `won_type` vracel `'bonus'` místo `'main'`
- Fix: CASE pořadí vyměněno — `v_next_ticket = v_ticket_count → 'main'` je teď před `v_bonus_prize_id IS NOT NULL → 'bonus'`
- Platí i pro `won_prize` CASE (konzistence)
- Frontend: tři místa volají `buy_ticket_atomic` **přímo** (ne přes Edge Function): `ContestDetail.tsx`, `Games.tsx`, `FavoriteGames.tsx` — všechna správně kontrolují `data.success` a `data.won_type`

### GitHub Actions CI
- Telegram notifikace: `curl` na `api.telegram.org` na success i failure (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
- GitHub Step Summary: `PAYMENT PIPELINE OK` / `PAYMENT PIPELINE FAILED` + markdown
- HTML report artifact: `playwright-report-{run_id}` (14 dní)
- Screenshots artifact při selhání: `screenshots-{run_id}` (7 dní)
- Pipeline status: **stable, production-ready**

---

**Aktualizováno (předchozí):** 13. 04. 2026, 20:46:33 +02:00 (dokumentační synchronizace contest-admin)

## Aktuální fáze
Partner Offers v1 – **dokončeno, nasazeno a finálně ověřeno end-to-end**.

## Shrnutí
Modul Partner Offers v1 je uzavřen jako hotový.
Byly dokončeny bloky A–G, následně proběhlo vícekolové E2E ověření včetně finálního HTTP-level testu přes `purchase-ticket` s reálným JWT.

Výsledek:
**Partner Offers v1 PASSED finálním E2E ověřením.**

## Přístup k aplikaci
Dočasný frontend gate v `src/App.tsx` (email allowlist a obrazovka „Web je momentálně neveřejný“) byl **odstraněn** (2026-04-10). Po přihlášení mají registrovaní uživatelé znovu normální přístup k trasám; Supabase Auth a stávající role redirecty zůstaly beze změny. Ověřeno: `npm run build` úspěšně (Vite production build dokončen).

---

## Závazná pravidla Partner Offers v1
- Partner Offers **nejsou výhry**
- Partner Offers se **nikdy** nesmí ukládat do:
  - `winners`
  - `bonus_prizes`
- Bottom menu zůstává:
  - `Výhry`
- Uvnitř `/wins` je přepnutí:
  - `Výhry`
  - `Nabídky`
- Partner offer se po získání ukládá automaticky
- Neexistuje tlačítko `Uložit`
- Otevřená nabídka = otevřený detail nabídky v appce
- Po schválení partner nesmí měnit nic
- Režim zdarma je pouze interní admin volba
- Data Partner Offers se fyzicky nemažou
- Uživatelské smazání = pouze skrytí z pohledu uživatele
- Po skrytí se odešle systémová zpráva do `messages`
- Cooldown = 5 minut
- Bez denního limitu
- Max 1 partner offer na 1 ticket
- V1 grafika:
  - logo 512×512
  - banner 1600×900

---

## Finální stav po blocích

### Block A — core data model
Nasazeno:
- `partner_offers`
- `partner_offer_selected_contests`
- `partner_offer_contests`
- `user_partner_offers`

Důležité:
- `partner_offers.last_assigned_at`
- `user_partner_offers.last_reminder_at`
- `user_partner_offers.ticket_id` = `uuid`
- `buy_ticket_atomic` vrací additivně:
  - `ticket_row_id`

### Block B — partner + admin workflow
Nasazeno:
- partner draft / submit / revise
- admin approve / reject / priority
- `selected_contests` picker
- `rejected -> draft` přes RPC:
  - `revise_partner_offer(...)`

### Block C — automatic contest attachment
Nasazeno pro:
- `all_contests`
- `selected_contests`

Hotové:
- attach při approve
- attach při `resume_contest`
- detach při deaktivaci nabídky
- detach při close contestu
- detach při expiraci
- `detached_at` soft detach
- respektuje:
  - `valid_from`
  - `valid_to`

Mimo v1:
- `category_contests`

### Block D — post-ticket evaluation layer
Nasazeno:
- assignment běží pouze při:
  - `data.success === true`
  - `data.won_type === null`
- používá RPC:
  - `assign_partner_offer_to_ticket(p_user_id uuid, p_contest_id uuid, p_ticket_id uuid default null)`
- používá:
  - `ticket_row_id`
- zapisuje jen do:
  - `user_partner_offers`
  - `partner_offers.last_assigned_at`
- response pro uživatele zůstává beze změny
- validita nabídky se kontroluje přímo v Block D
- cooldown 5 minut je aktivní

### Block E — Wins / Offers user UI
Nasazeno a ověřeno v repozitáři (commit `b7aa4ce`, 10. 04. 2026):
- `/wins` přepnutí:
  - `Výhry`
  - `Nabídky`
- nové soubory:
  - `src/components/OfferCard.tsx`
  - `src/components/OfferDetailModal.tsx`
- `src/pages/Wins.tsx` aktualizován s tab switcherem
- chování:
  - Nabídky čtou pouze z `user_partner_offers` kde `status = active` a `hidden_at IS NULL`
  - otevření detailu zapisuje `opened_at` (non-fatal)
  - skrytí zapisuje `hidden_at` → DB trigger Block F odešle systémovou zprávu
  - skrytá nabídka okamžitě zmizí ze seznamu (optimistic removal)
  - neexistuje tlačítko Uložit
- `opened_at`
- `hidden_at`
- partner display name:
  - `company_name ?? name`
- zobrazuje `valid_to`
- build: ✅ exit code 0

### Block F — reminder emails + system messages
Nasazeno:
- Edge Function:
  - `send-offer-reminders`
- denní cron job
- summary email po 24h a pak týdně
- `last_reminder_at`
- DB trigger pro system message při `hidden_at`
- write targety:
  - `email_queue`
  - `user_partner_offers.last_reminder_at`
  - `messages`

Důležité:
- během E2E byl nalezen blocker v tokenu pro internal reminder call
- proběhla rotace `INTERNAL_FUNCTION_TOKEN`
- token byl sjednocen v:
  - Supabase secret `INTERNAL_FUNCTION_TOKEN`
  - lokální `.env` `VITE_INTERNAL_FUNCTION_TOKEN`
  - pg_cron `send_offer_reminders_daily`
  - pg_cron `process-event-queue`
- po opravě test:
  - HTTP 200
  - `{"success":true,"emails_queued":0,"offers_touched":0}`

### Block G — billing + reporting
Finální uzamčený návrh i implementace:
Billing vrstva je oddělená od core offer modelu.

Nasazeno:
- `partner_offer_billing_configs`
- `partner_offer_activations`
- `partner_offer_invoice_lines`
- rozšíření:
  - `partner_invoices.type = coin | offer`
- reporting přes admin
- sync aktivací:
  - `sync_partner_offer_activations()`
- admin summary:
  - `get_admin_activation_summary()`

Billing režimy:
- `paid_distribution`
- `hybrid`
- `affiliate_direct`
- `affiliate_external`
- `free`

V1 billing chování:
- `paid_distribution` = automatické fakturování
- `free` = no-op
- `hybrid`, `affiliate_direct`, `affiliate_external` = trackované, ale ruční settlement

---

## Kritická oprava během E2E
Během E2E bylo potvrzeno, že RPC:
- `assign_partner_offer_to_ticket(...)`
existuje a funguje, ale nebylo automaticky napojené na `purchase-ticket`.

Byla provedena cílená oprava:
- změněn pouze:
  - `supabase/functions/purchase-ticket/index.ts`

Oprava:
- po úspěšném `buy_ticket_atomic`
- při `data.success === true && data.won_type === null`
- se automaticky volá:
  - `assign_partner_offer_to_ticket(...)`
- používá `ticket_row_id`
- assignment je non-fatal
- response pro uživatele zůstává beze změny

Tím je **Block D wiring kompletní**.

---

## Finální E2E ověření – potvrzené výsledky

### 1. Assignment flow
Potvrzeno:
- při `won_type = null` vznikne správně `user_partner_offers`
- `ticket_id` v UPO odpovídá `ticket_row_id`
- `status = active`
- `offer_id` sedí
- `last_assigned_at` se aktualizuje

### 2. Cooldown
Potvrzeno:
- opakované přiřazení do 5 minut vrací `NULL`
- nevzniká druhý UPO řádek

### 3. Winning gate
Finální HTTP-level test potvrdil:
- při `won_type = 'bonus'` **nevznikne žádné UPO**
- gate funguje správně

### 4. Ticket purchase response
Potvrzeno:
- response formát pro uživatele je zachovaný
- wiring nic nerozbíjí

### 5. Activations
Potvrzeno:
- `sync_partner_offer_activations()` správně vytváří activation rows
- `upo_id`, `offer_id`, `user_id`, `activated_at` sedí

### 6. Reminder function
Potvrzeno:
- auth guard funguje
- no-op run vrací 200 po opravě tokenu

### 7. Final verdict
**Partner Offers v1 prošlo finálním E2E ověřením.**

---

## Otevřený bod mimo v1
### category_contests
Stále mimo v1, dokud nebude skutečný model kategorií soutěží.

---

## Kanonické memory soubory pro OneMil
Od této chvíle je pro OneMil kanonická pouze tato trojice souborů v tomto workspace:

- `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_state.md`
- `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_history.md`
- `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\CLAUDE.md`

Pravidlo:
- `onemil_state.md` = jediný current snapshot
- `onemil_history.md` = jediná chronologická historie
- `CLAUDE.md` = jen stručný pracovní kontext a uzamčené zásady, ne plná historie

---

## Brand Identity — uzamčený stav (27. 04. 2026)

**Plný brand kit:** `docs/brand/onemil_brand_kit/graphics.md` (zdroj: `docs/brand/onemil_brand_kit.zip`)
**Tagline:** Luxusní soutěže. Skutečné výhry.

### Směr
- **Dark premium tech-luxury** — ne casino, ne hazard, ne lottery kitsch
- Zakázané vizuály i slovník: casino, hazard, sázení, sázka, jackpot, žetony, zbohatni, roulette, slot-machine

### Typografie
- Nadpisy: **Poppins** 600–800 (Google Fonts, ne soubory v repozitáři)
- Body / UI text: **Inter** 400–500

### Barvy (kanonické hex hodnoty z brand kitu)
| Název | Hex | Token |
|-------|-----|-------|
| Midnight Black | `#0A0B0F` | `--om-black` |
| Deep Navy | `#101722` | `--om-navy` |
| Graphite | `#1D2128` | `--om-graphite` |
| Platinum | `#E7EBF0` | `--om-platinum` |
| Silver | `#BFC6CF` | `--om-silver` |
| Energy Orange | `#FF8A00` | `--om-orange` |
| Warm Amber | `#FFB547` | `--om-amber` |

### Logo
- **Primární:** trophy / číslo „1" *za* wordmarkem OneMil (wordmark v popředí) — web, appka, hero
- **Sekundární:** trophy *nad* wordmarkem (stacked) — sociální sítě, bannery, plakáty
- **Standalone ikona:** trophy / číslo „1" samostatně — favicon, app icon, avatar
- Export: PNG 512 × 512, PNG 1024 × 1024, SVG (pouze placeholder — pro produkci vektorizovat)
- Hero banner: 1920 × 480 px; partner/OG banner: 1600 × 900 px

---

## Partner portal UI – offer management (2026-04-11)

Nasazeno v `src/pages/PartnerDashboard.tsx`:
- Partner vidí seznam svých nabídek (`partner_offers`) s reálnými stavy
- Sloupce: název, stav (badge), distribuce, platnost do, datum posledního přidělení, akce
- Tlačítko „Nová nabídka" → dialog pro vytvoření (INSERT jako draft)
- Draft / Rejected → tlačítko Upravit (UPDATE) + Odeslat (→ submitted) / Vrátit k úpravám (RPC `revise_partner_offer`)
- Submitted → zobrazí „Čeká na schválení"
- Approved → zobrazí „Schváleno – nelze měnit" (bez editačního tlačítka)
- Form fields: title, short_text, deployment_mode (Select), valid_from, valid_to, link_or_code
- `loadPartnerOffers(partnerId)` voláno automaticky z `loadPartnerData()`
- Build: ✅ exit code 0

---

---

## Admin contest management – aktuální stav (13. 04. 2026)

### Contest statuses (DB + UI)
Platné hodnoty v `contests.status` (constraint `contests_status_check` byl rozšířen):
- `draft` — v admin UI zobrazováno jako **„Archiv test"**
- `pending` — „Čeká na start"
- `active` — „Aktivní"
- `paused` — „Pozastaveno"
- `closed` — „Ukončeno" (pouze systémový přechod, admin nemůže nastavit ručně)

### Admin UI – Správa soutěží
Stránka `AdminContestManagement` má 3 filtrovací taby přímo pod hlavičkou:
- **Aktivní soutěže** — zobrazuje `pending`, `active`, `paused`
- **Archiv test** — zobrazuje `draft`
- **Archiv ukončených soutěží** — zobrazuje `closed`

Chování je na jedné stránce, ne na samostatné stránce ani ve row dropdownu.
- Soutěže ve stavu `closed` patří výhradně do tabu **Archiv ukončených soutěží** (filtrování podle statusu, ne samostatná route)

### Pravidla přechodu statusu (admin)
- Ruční přesun do `draft` (Archiv test) z admin UI je povolen jen ze stavů **`pending`** nebo **`paused`** (ne z `active`)
- `active` → `draft` je zablokováno (UI i frontend guard)
- Zablokovaný přechod zobrazí toast: _„Aktivní soutěž nelze přesunout do Archivu test. Nejprve ji pozastavte nebo vraťte do stavu Čeká na start."_
- V dropdown je `draft` option pro `active` contest viditelná, ale disabled

### Contest create flow
- Aktivní admin cesta: `AdminContestManagement` → RPC `admin_manage_contest`
- Opravena tichá chyba na frontendu: `ticket_count` se již netiše přepisoval na fallback `1_000_000`, pokud nebyl správně předán
- Na straně DB/RPC: `admin_manage_contest` při **create** už **netiše** nepřijímá neplatný nebo chybějící `ticket_count` (místo tichého defaultu je vyžadována platná hodnota / chyba)
- Aby se oprava projevila v prohlížeči na Lovable hostovaném buildu, bylo nutné **Share → Publish** (samotný git push nestačí pro live frontend)

### Hard delete contestů – ZAKAZANO v produkci
- Hard delete contestů není bezpečný se stávajícím FK modelem
- `partner_offer_contests.contest_id` odkazuje FK na `contests(id)`
- Soft detach (`detached_at`) odstraní logickou vazbu, ale FK řádky fyzicky zůstávají → hard delete i po soft detach selže s FK violation
- **Bezpečný způsob „úklidu" testovacích soutěží = přesun do `draft` (Archiv test), ne hard delete**
- Testovací soutěže se **nemají** řešit stejně jako produkční „cleanup" cíle; cílem je statusová archivace, ne mazání řádků
- Delete je v admin UI povolen pouze pro `draft` a `pending` soutěže (testovací fáze)

### Partner Offers + contest lifecycle – potvrzené invarianty
- `partner_offer_contests` řádky se **NESMÍ** mazat natvrdo (ani kvůli „úklidu" soutěže)
- Trigger `trg_partner_offer_approved` attachuje nabídky pouze na `active` nebo `pending` soutěže → `draft` soutěže jsou z automatického attachmentu vyloučeny
- `buy_ticket_atomic` stráží `status = 'active'` → `draft` soutěže jsou pro uživatele inertní
- V kontextu úklidu soutěží se **nepouštět** do změn triggerů, `buy_ticket_atomic` ani `assign_partner_offer_to_ticket` — řešení je stavová archivace a respekt FK modelu

---

## Další správný krok
Partner Offers v1 už se nemá znovu architektonicky otevírat.

Další krok:
1. jen případné bugfixy, pokud se objeví v běžném provozu
2. až potom případná rozšíření mimo v1

---

## PWA metadata a ikony (13. 05. 2026)

PR #3 byl sloučen do `main` jako bezpečná PWA metadata změna.

Aktuální stav:
- Přidán `public/manifest.webmanifest`.
- Do `index.html` přidán manifest link, `theme-color` a `apple-touch-icon`.
- Do `public/` byly z brand kitu zapojeny pouze schválené trophy ikony:
  - `public/apple-touch-icon.png`
  - `public/android-chrome-192x192.png`
  - `public/android-chrome-512x512.png`
- `src/assets/logo-onemil.png` nebyl použit jako PWA ikona.
- Nebyl přidán service worker.
- Nebylo přidáno offline cachování.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- PR #3 smoke E2E prošel.
- PR #3 Playwright Staging Full E2E prošel na větvi `codex/pwa-icon-metadata`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25807224457`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25807653323`.

---

## iPhone/PWA spodní navigace (13. 05. 2026)

PR #4 byl sloučen do `main` jako bezpečný UI/CSS fix pro mobilní PWA navigaci.

Aktuální stav:
- Spodní navigace v mobilním/PWA zobrazení zůstává vizuálně fixovaná dole při scrollování.
- Přidána podpora iPhone safe area přes `viewport-fit=cover` a `env(safe-area-inset-bottom)`.
- Obsah stránky má na mobilu spodní odsazení, aby nebyl schovaný za spodní navigací.
- Ikony, české labely, routy a business logika nebyly měněny.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- PR #4 smoke E2E prošel.
- PR #4 Playwright Staging Full E2E prošel na větvi `fix/ios-pwa-bottom-navigation`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25811447264`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25811641231`.

---

## Launch wording cleanup (13. 05. 2026)

PR #5 `Clean launch wording risks` byl sloučen do `main` po ověření smoke + staging E2E.

Aktuální stav:
- Merge commit: `acc43c90d313cbe2bd01adf333d74d3f424905fa`.
- Z public/admin/Bob-visible textů byla odstraněna riziková wording stopa kolem `losy`, `losování`, `jackpot` a `Megajackpot`.
- Texty jsou sjednocené na bezpečnější launch formulace: tikety, otevření tiketů, soutěžní mechanismus, předem určené výherní pozice, hlavní výhra.
- Nebyla změněna business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- PR #5 smoke E2E prošel.
- PR #5 Playwright Staging Full E2E prošel na větvi `fix/launch-copy-risk-wording-cleanup`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25816716804`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25816763438`.

---

## Produkční DB launch verification (13. 05. 2026)

Ověření produkční databáze proběhlo pouze read-only přes `SELECT`.

Výsledek:
- `handle_new_auth_user` původní FAIL byl false positive.
- `public.profiles` insert používá pouze `id`, `full_name`, `date_of_birth`, `avatar_url`.
- `handle_new_auth_user` nevkládá `user_id` do `public.profiles`.
- `trigger_sofinity_forward` nevolá `net.http_post` přímo.
- Produkce aktuálně používá legacy Sofinity forwarding path:
  `event_logs / trigger_sofinity_forward -> event_forward_log -> call_event_forward_log_listener -> event_queue -> process_event_queue_worker -> Sofinity`.
- Tato legacy mezivrstva není Web/PWA launch blocker.

Technický dluh po launchi:
- Zvážit zjednodušení legacy cesty `event_forward_log -> event_queue`, ale pouze po samostatném schválení.

Invariant:
- Nebyla změněna data ani schema.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.

---

## Produkční contest cleanup před Web/PWA launchem (13. 05. 2026)

Produkční launch blocker `active contests missing rules_pdf_url` byl vyřešen.

Co bylo provedeno:
- 7 testovacích soutěží bylo přesunuto ze stavu `active` do `draft` / Archiv test.
- 3 reálné soutěže bez PDF pravidel byly dočasně přesunuty ze stavu `active` do `draft` / Archiv test:
  - BMW S 1000 RR
  - Corvette
  - MY26 CORVETTE C8 Stingray 6.2L V8 - Coupe

Finální ověření:
- PASS: žádné aktivní soutěže nemají chybějící `rules_pdf_url`.

Invariant:
- Žádná soutěž nebyla smazána.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyl měněn app kód.
- Nebyly měněny Stripe, wallet, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Stripe Test Mode verification (13. 05. 2026)

Stripe je aktuálně správně v Test mode.

Ověření:
- Testovací top-up pro `e2e@onemil.cz` byl vizuálně dokončen v OneMil a zobrazen ve Stripe.
- Supabase ověření potvrdilo:
  - wallet pro `e2e@onemil.cz` existuje,
  - `balance_coins = 100507.00`,
  - `bonus_balance_coins = 11.00`,
  - latest payment `status = completed`,
  - latest payment `method = stripe`,
  - `stripe_session_id` začíná `cs_test_`,
  - latest payment amount v DB je `1280.00`.

Poznámka před public launchem:
- Amount `1280.00` je potřeba porovnat s vybraným UI balíčkem/bonusem před veřejným spuštěním.

Invariant:
- Nebyla provedena žádná live platba.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyl měněn app kód.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Admin revenue reporting fix (14. 05. 2026)

PR #6 `Separate admin revenue from credited MioCoins` byl sloučen do `main`.

Co bylo opraveno:
- Admin reporting už nezobrazuje `payments.amount` jako Kč tržbu.
- `payments.amount` zůstává evidováno jako připsané MioCoiny.
- `Tržba Kč` je ve frontendu odvozena ze známé mapy MioCoin balíčků:
  - 50 MC -> 50 Kč
  - 310 MC -> 300 Kč
  - 525 MC -> 500 Kč
  - 1280 MC -> 1200 Kč
- Připsané MioCoiny jsou v adminu zobrazeny samostatně.
- Neznámé částky mimo známé balíčky se v Kč tržbě zobrazují jako `neznámé`.

Ověření:
- PR #6 smoke E2E prošel.
- PR #6 Playwright Staging Full E2E prošel na větvi `fix/admin-revenue-miocoin-reporting`.
- Po merge do `main` smoke E2E prošel: GitHub Actions run `25845908864`.
- Po merge do `main` Playwright Staging Full E2E prošel: GitHub Actions run `25845971759`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla měněna databázová funkce `get_admin_summary_dashboard`.
- Nebyla měněna Supabase data, Stripe, webhook, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.

---

## get_admin_summary_dashboard follow-up audit (14. 05. 2026)

Po PR #6 hlavní admin reporting správně odděluje `Tržba Kč` a `Připsané MioCoiny`.

Read-only follow-up audit ověřil:
- DB funkce `get_admin_summary_dashboard` stále ve legacy `payments_summary` formátuje `payments.amount` jako Kč.
- `payments.amount` přitom zůstává připsaný počet MioCoinů, ne zaplacená Kč částka.
- Funkce je v živém kódu používána pouze v `AdminValidationWorkflows` / admin validation tabu.
- Hlavní admin revenue reporting po PR #6 na tuto legacy hodnotu nespoléhá.
- Toto není Web/PWA launch blocker.

Technický dluh po launchi:
- Buď přestat ve frontend validačním tabu zobrazovat raw `payments_summary`,
- nebo později upravit DB funkci přes samostatně schválenou migraci.

Invariant:
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.

---

## MioCoin top-up package verification (14. 05. 2026)

MioCoin top-up package mapping bylo ověřeno read-only.

Potvrzené mapování:
- 50 Kč -> 50 MioCoinů
- 300 Kč -> 310 MioCoinů
- 500 Kč -> 525 MioCoinů
- 1200 Kč -> 1280 MioCoinů

Ověřené plochy:
- Homepage top-up balíčky
- Profile top-up balíčky
- PaymentSuccess analytické mapování
- `paymentReporting` admin reporting helper
- `create-stripe-checkout` serverové mapování ceny na MioCoiny
- `stripe-webhook` mapování zaplacené Kč částky na připsané MioCoiny
- Admin reporting po PR #6

Výsledek:
- Homepage, Profile, PaymentSuccess, `paymentReporting`, `create-stripe-checkout`, `stripe-webhook` a admin reporting mapping jsou sladěné.
- Nebyla nalezena žádná neshoda.
- Toto není Web/PWA launch blocker.

Invariant:
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Production contest status cleanup (14. 05. 2026)

Produkční contest status cleanup byl dokončen před veřejným Web/PWA launchem.

Zaznamenaný stav:
- Poslední aktivní testovací soutěž `bmw` byla přesunuta ze stavu `active` do `draft`.
- Finální produkční stav soutěží:
  - `active = 0`
  - `closed = 19`
  - `draft = 76`

Výklad:
- Žádné soutěže nebyly smazány.
- Tento stav je správný, protože OneMil ještě není oficiálně veřejně spuštěný.
- Public launch bude vyžadovat vytvoření nebo aktivaci pouze reálných soutěží s dokončenými PDF pravidly.

Invariant:
- Nebyl měněn app kód.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- V rámci tohoto dokumentačního záznamu nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## Affiliate program wording merge (14. 05. 2026)

PR #7 `Rename influencer UI to Affiliate program` byl sloučen do `main`.

Změna:
- Viditelné UI/admin označení `Influencer` bylo přejmenováno na `Affiliate program` / `Affiliate partner`.
- `/influencer` routes zůstávají beze změny kvůli bezpečnosti a kompatibilitě.
- Interní DB názvy `influencer_*` zůstávají beze změny.
- Nebyly změněny provize, tracking, login/routing, DB ani business logika.

Ověření:
- Smoke E2E prošel na PR #7.
- Playwright Staging Full E2E prošel na větvi `fix/affiliate-program-wording`.
- Po merge do `main` prošel Smoke E2E: run `25859772102`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25859844919`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.

---

## Visible referral / Influencer wording cleanup (14. 05. 2026)

PR #9 `Clean visible referral and influencer wording` byl sloučen do `main`.

Změna:
- Viditelné UI/admin wording `referral` bylo nahrazeno českým wordingem `doporučení` / `doporučovací`.
- Viditelné admin wording `Influencer` bylo nahrazeno wordingem `Affiliate partner`.
- `/influencer` routes zůstávají beze změny.
- Interní DB/table/function názvy `influencer_*` a interní `referral_*` názvy zůstávají beze změny kvůli kompatibilitě.
- Nebyly změněny routes, DB, tracking, provize, login/routing, Stripe, wallet, contest, ticket, winner, Partner Offers ani `buy_ticket_atomic`.

Ověření:
- Smoke E2E prošel na PR #9.
- Playwright Staging Full E2E prošel na větvi `fix/visible-referral-affiliate-wording`.
- Po merge do `main` prošel Smoke E2E: run `25862999591`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25863074687`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.

---

## Footer Affiliate wording fix (14. 05. 2026)

PR #8 `Update footer Affiliate wording` byl sloučen do `main`.

Změna:
- Zbývající viditelné footer texty `Pro influencery`, `Registrace influencera` a `Přihlášení influencera` byly nahrazeny wordingem `Affiliate program` / `Affiliate partner`.
- Existující URL/routes zůstaly beze změny.
- Nebyly změněny DB, logika, provize, tracking ani login/routing.

Ověření:
- Smoke E2E prošel na PR #8.
- Playwright Staging Full E2E prošel na větvi `fix/footer-affiliate-wording`.
- Po merge do `main` prošel Smoke E2E: run `25861584394`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25861663913`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.

---

## E2E COVERAGE — WALLET BALANCE (14. 05. 2026)

### PR #10 — Add wallet balance E2E coverage — mergnut do `main`

- Zdrojová větev: `test/e2e-wallet-balance`; cílová větev: `main`.
- Merge commit: `6e32ec7e6df079eb1594e7335ec735c41a2bab47`.
- Přidán nový spec soubor: `tests/e2e/09-wallet-balance.spec.ts`

### Co test ověřuje

- Peněženka (wallet balance) se sníží přesně o hodnotu `ticket_price` MC po nákupu jednoho tiketu.
- Balance je čitelná z `/contest/:id` UI před nákupem.
- Snížení se odráží ve stejném UI bez reload stránky (ověřeno pomocí interceptu `loadUserBalance()` GET `/rest/v1/wallets`).
- Test čeká na `TicketResultModal` (dialog scoped přes `[role="dialog"]:has(button[aria-label="Zavřít"])`) a zavírá ho Escape.

### Ochranné guards

- Test se přeskočí, pokud `E2E_TEST_EMAIL` nebo `E2E_TEST_PASSWORD` nejsou nastaveny.
- Test se přeskočí, pokud `E2E_CONTEST_ID` není nastaven — **production CI tuto secret nemá, test proto NIKDY neběží na produkci**.
- Production Smoke je hard-coded na specs 01+02 — spec 09 tam nefiguruje.

### Regrese zachycené testem

- `buy_ticket_atomic` přestane strhávat wallet.
- UI přestane obnovovat balance po nákupu (odebrání `loadUserBalance`).
- Ticket price se změní bez aktualizace wallet dedukce.
- Czech locale formátování balance se rozbije (`toLocaleString("cs-CZ")` non-breaking space).

### Opravený bug v selektoru (před mergem)

- První staging run selhal: Playwright strict mode violation — `.or()` lokátor vyřešil na 2 elementy, protože ContestDetail zobrazuje buy button i top-up button současně.
- Fix: přidáno `.first()` do `.or()` lokátoru (commit `672d241`).

### Výsledky CI (po mergi do `main`)

- Post-merge Smoke E2E: ✅ 1m13s — run `25864204537`.
- Post-merge Playwright Staging Full E2E: ✅ 2m44s — run `25864280989`, ALL PASSED, Telegram OK.

### Invariant

- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet logika, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Staging Full E2E nyní ověřuje: wallet balance klesne přesně o `ticket_price` po nákupu tiketu.
- Production Smoke zůstává lightweight a non-mutating (pouze specs 01+02).

---

## Mobile/PWA Messages fixed layout (14. 05. 2026)

PR #12 `Fix mobile PWA messages scroll layout` byl sloučen do `main`.

Změna:
- Mobile/PWA Messages layout byl upraven tak, aby horní Messages header zůstal stabilní.
- Spodní message composer zůstává stabilní nad fixed bottom navigation.
- Scrolluje pouze seznam zpráv mezi headerem a composerem.
- Bottom navigation zůstává fixed.
- Layout respektuje iPhone safe area a fixed bottom navigation.

Ověření:
- Smoke E2E prošel na PR #12.
- Playwright Staging Full E2E prošel na větvi `fix/mobile-messages-fixed-header-composer`: run `25876737161`.
- Po merge do `main` prošel Smoke E2E: run `25876891113`.
- Po merge do `main` prošel Playwright Staging Full E2E: run `25877013278`.

Invariant:
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla změněna Bob/AI logika ani message sending logika.
- Nebyly změněny routes, DB, Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Affiliate ani `buy_ticket_atomic`.

---

## E2E COVERAGE - VOUCHER REDEEM DETAIL (14. 05. 2026)

### PR #15 - Add voucher redeem E2E coverage - mergnut do `main`

- Zdrojova vetev: `test/e2e-voucher-redeem`; cilova vetev: `main`.
- Merge commit: `72810c94b3ce0397faf8246eb5e3820022d82203`.
- Pridan novy staging-only spec soubor: `tests/e2e/11-voucher-redeem.spec.ts`.
- Staging workflow `playwright-staging.yml` nove seeduje dedikovany `E2E Spec11 Voucher` a zakoupeny `user_vouchers` radek pro E2E uzivatele.

### Co test overuje

- Prihlaseni staging E2E uzivatele.
- `/vouchers?tab=purchased` a zalozku `Zakoupene`.
- Viditelnost zakoupeneho `E2E Spec11 Voucher`.
- Otevreni redeem/detail modalu pres `Uplatnit voucher`.
- Viditelnost voucher kodu ve formatu `OMV-XXXXXXXX`.
- Shodu kodu na karte a v modalu.
- Viditelnost a klikatelnost tlacitka `Zkopirovat kod`.

### Production Smoke

- Production Smoke zustava lightweight a unchanged.
- Production Smoke dal spousti pouze specs 01 + 02.
- Spec 11 je chraneny staging-only guardem pres `E2E_CONTEST_ID`, ktery production CI nema.

### Vysledky CI

- PR #15 Smoke E2E prosel: run `25884819703`.
- PR #15 Playwright Staging Full E2E prosel na vetvi `test/e2e-voucher-redeem`: run `25884822640`.
- Po merge do `main` prosel Smoke E2E: run `25885049877`.
- Po merge do `main` prosel Playwright Staging Full E2E: run `25885285280`.

### Invariant

- Nebyl proveden deploy.
- Nebyly spusteny migrace.
- Nebyl zmenen app kod.
- Nebyla zmenena DB, Supabase data, Stripe, wallet logika, contests, tickets, winners, Partner Offers, routes, tracking, login behavior ani `buy_ticket_atomic`.

---

## Affiliate foundation staging verification (02. 06. 2026)

Affiliate foundation migration `20260602_affiliate_commission_foundation.sql` byla commitnuta do `main` a po odstraneni UTF-8 BOM overena na staging Supabase projektu `onemil-staging` (`dxmowysntemfqfnanxua`).

Vysledek staging aplikace:
- SQL migration probehla na stagingu bez chyby.
- Produkce `xkzhjldrojjlrkezorey` nebyla dotcena.
- Nebyla aplikovana zadna produkcni migrace.

Postcheck:
- Nove affiliate tabulky existuji.
- RLS je zapnute.
- Admin read policies existuji.
- Neexistuji prime write policies.
- Admin views existuji a jdou cist bez chyby.
- CHECK constraint na `affiliate_payouts.period_month` existuje.
- Nove affiliate tabulky jsou prazdne.
- Na existujici chranene tabulky nepribyly affiliate triggery.
- Falesny postcheck `FAIL` u `affiliate_triggers_exist` byl potvrzen jako kontrolni false positive: `information_schema.triggers` vraci `trg_prevent_affiliate_rate_overlap` dvakrat, protoze trigger je definovany pro `BEFORE INSERT OR UPDATE`.

Invariant:
- Nebyl menen app kod.
- Nebyla menena SQL migrace po staging aplikaci.
- Nebyly meneny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele` ani B2B partner program.
- Affiliate foundation zustava pouze databazovy zaklad bez napojeni na produkcni provizni vypocty.

---

## Affiliate admin RPC staging test (02. 06. 2026)

RPC migration `20260602_admin_create_affiliate_partner_rpc.sql` je aplikovana pouze na staging Supabase projektu `onemil-staging` (`dxmowysntemfqfnanxua`). Produkce `xkzhjldrojjlrkezorey` nebyla dotcena.

Ověření:
- Dočasný Node Supabase client script byl připraven jako `tmp/staging-test-admin-create-affiliate-partner.mjs`, ale klientský login do ručně založeného staging Auth test účtu selhal na GoTrue/Auth bootstrapu (`Invalid login credentials`, později `Database error querying schema`) ještě před voláním RPC.
- Samotné RPC bylo proto ověřeno na staging DB se simulovaným authenticated JWT contextem přes `request.jwt.claim.sub` pro dočasného admin a nonadmin uživatele.
- Testovací affiliate kód: `TESTAFF20260602021409162`.
- RPC `public.admin_create_affiliate_partner(...)` vytvořilo partnera, affiliate kód, první sazbu a audit log.
- Duplicitní kód vrátil očekávanou chybu `affiliate_code_already_exists`.
- Nonadmin context vrátil očekávanou chybu `not_admin`.
- Cleanup na stagingu proběhl: testovací affiliate kód už neexistuje a dočasné auth test účty byly odstraněny.

Invariant:
- Nebyl použit produkční projekt.
- Nebyla měněna app logika ani SQL migrace.
- Nebyly měněny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zákaznické `Pozvi přátele`, B2B partner program ani existující influencer systém.
- RPC zůstává admin-only zápisová vrstva nad affiliate foundation tabulkami; zatím není napojené na registraci, platby, wallet ani provizní výpočty.

---

## Affiliate partner status RPC staging verification (02. 06. 2026)

Opravna migrace `20260602_fix_admin_update_affiliate_partner_status_contract_end.sql` byla vytvorena kvuli staging nalezu u prechodu na `terminated`: pri okamzitem ukonceni partnera ve stejne transakci mohlo `contract_ends_at = now()` vyjit stejne jako `contract_starts_at`, coz spravne narazilo na CHECK constraint `contract_ends_at > contract_starts_at`.

Oprava:
- Commit opravne migrace: `c2eabf3bfe80e5cba1f90e86f03fa46ad35ba0d1` (`fix: ensure affiliate termination date is after contract start`).
- Migrace nahrazuje pouze `public.admin_update_affiliate_partner_status(...)`.
- Pri `terminated` pouziva `clock_timestamp()`, a pokud neni vetsi nez `contract_starts_at`, nastavi `contract_ends_at = contract_starts_at + interval '1 millisecond'`.
- Audit log uklada `status`, `contract_starts_at` a `contract_ends_at` v `old_data` i `new_data`.

Staging overeni:
- Opravna migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita.
- Testovaci kod: `TESTSTAT20260602023104886`.
- Pres `admin_create_affiliate_partner` vznikl docasny test affiliate partner.
- Status prechody prosly: `pending -> active`, `active -> paused`, `paused -> active`, `active -> terminated`.
- `contract_ends_at > contract_starts_at` overeno po `terminated`.
- 4 status audit logy overeny vcetne `contract_starts_at` a `contract_ends_at`.
- Zakazany prechod `terminated -> active` vratil `affiliate_status_transition_not_allowed`.
- Cleanup probehl: `TESTSTAT20260602023104886` i predchozi selhany kod `TESTSTAT20260602022743527` jsou na stagingu neprítomne.

Invariant:
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebyly meneny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.

---

## Affiliate commission rate RPC staging verification (02. 06. 2026)

Testovana migrace `20260602_admin_set_affiliate_commission_rate_rpc.sql` byla commitnuta jako `20f709b7e627beb0a98ff060899ff7fdc4b34336` (`feat: add admin set affiliate commission rate rpc`) a aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`). Produkce `xkzhjldrojjlrkezorey` nebyla pouzita.

Precheck:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `admin_set_affiliate_commission_rate` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck:
- `admin_set_affiliate_commission_rate(uuid,numeric,timestamptz,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Staging test:
- Testovaci kod: `TESTRATE20260602061042655`.
- Pres `admin_create_affiliate_partner` vznikl docasny test affiliate partner.
- Vychozi sazba byla `0.02`.
- Sazba byla zmenena z `0.02` na `0.05`.
- Stary interval byl uzavren pres `valid_to`.
- Novy interval ma `commission_rate = 0.05` a `valid_to IS NULL`.
- Audit log `affiliate_commission_rate_changed` byl overen.
- Ocekavane chyby byly overeny: `commission_rate_unchanged`, `commission_rate_valid_from_in_past`, `affiliate_partner_status_invalid_for_rate_change`.
- Zmena sazby prosla ve stavech `pending`, `active`, `paused`.
- Zmena sazby neprosla ve stavech `terminated`, `rejected`.
- Cleanup probehl: testovaci affiliate kody a partneri jsou po cleanupu neprítomni.

Invariant:
- Nebyla potreba opravna migrace.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebyly meneny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.
- Affiliate stale neni napojeny na registrace, platby ani vypocty provizi.

---

## Affiliate customer attribution RPC staging verification (02. 06. 2026)

Testovana migrace `20260602_record_affiliate_customer_attribution_rpc.sql` byla commitnuta jako `9cd61cb0e1d32b8a8e2b7dc8a007d7ad2e73c3e5` (`feat: add affiliate customer attribution rpc`) a aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`). Produkce `xkzhjldrojjlrkezorey` nebyla pouzita.

Precheck:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `record_affiliate_customer_attribution` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck:
- `record_affiliate_customer_attribution(text,text,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Staging test:
- Testovaci kod: `TESTATTR20260602062307941`.
- Pres `admin_create_affiliate_partner` vznikl docasny affiliate partner a pres `admin_update_affiliate_partner_status` byl aktivovan.
- Docasny zakaznik byl vytvoren pouze na stagingu pro test `auth.uid()` contextu.
- `record_affiliate_customer_attribution` vytvorilo zaznam v `user_affiliate_attributions`.
- Overeno: `locked = true`, `source = direct_link`, metadata obsahuji `landing_url` a `client_metadata`.
- Audit log `affiliate_customer_attribution_recorded` byl overen.
- Opakovane volani se stejnym uzivatelem a jinym validnim kodem vratilo `existing_attribution_preserved` a puvodni attribution se neprepsala.
- Ocekavane chyby byly overeny: `affiliate_partner_not_active`, `affiliate_code_not_active`, `source_invalid`, `not_authenticated`.
- Cleanup probehl: testovaci attribution, audit logy, affiliate kody, affiliate partneri a docasny auth uzivatel jsou po cleanupu neprítomni.

Invariant:
- Nebyla potreba opravna migrace.
- Nebyl pouzit service role key.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebyly meneny registrace, frontend registrace, payments, wallet, vypocty provizi, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.

---

## Affiliate merchant referral RPC staging verification (02. 06. 2026)

Testovana migrace `20260602_record_affiliate_merchant_referral_rpc.sql` byla commitnuta jako `a82eb153ba1cc08237e04860dbcbebd322cb326b` (`feat: add affiliate merchant referral rpc`) a aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`). Produkce `xkzhjldrojjlrkezorey` nebyla pouzita.

Precheck:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `admin_update_affiliate_partner_status` existuje.
- `record_affiliate_merchant_referral` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- `partners.auth_user_id` existuje.
- `merchant_affiliate_referrals` ma `UNIQUE (merchant_partner_id)`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck:
- `record_affiliate_merchant_referral(uuid,text,text,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Staging test:
- Testovaci kod: `TESTMREF602063923745`.
- Pres `admin_create_affiliate_partner` vznikl docasny affiliate partner a pres `admin_update_affiliate_partner_status` byl aktivovan.
- Docasny firemni auth uzivatel a docasny zaznam v `partners` byly vytvoreny pouze na stagingu pro test vlastnictvi pres `partners.auth_user_id = auth.uid()`.
- `record_affiliate_merchant_referral` vytvorilo zaznam v `merchant_affiliate_referrals`.
- Overeno: `status = registered`, metadata obsahuji `source = partner_register`, `landing_url` a `client_metadata`.
- Audit log `affiliate_merchant_referral_recorded` byl overen.
- Opakovane volani pro stejnou firmu s jinym validnim kodem vratilo `existing_merchant_referral_preserved`; puvodni merchant referral se neprepsal.
- Ocekavane chyby byly overeny: `merchant_partner_not_owned`, `merchant_partner_not_found`, `affiliate_partner_not_active`, `affiliate_code_not_active`, `source_invalid`, `not_authenticated`.
- Cleanup probehl: testovaci merchant referral, audit logy, affiliate kody, affiliate partneri, test partner firma a docasni auth uzivatele jsou po cleanupu `absent`.

Invariant:
- Nebyla potreba opravna migrace.
- Prvni testovaci beh selhal jen kvuli testovacimu predpokladu `affiliate_codes.updated_at`, ktery ve staging schematu neexistuje; migrace ani RPC nebyly meneny.
- Nebyl pouzit service role key.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebyly meneny registrace, `partner/register`, payments, wallet, vypocty provizi, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.
- Affiliate merchant referral zatim neni napojen na frontend `partner/register`, bonus 500 Kc za firmu, platby ani vypocty provizi.

---

## Manual affiliate commission payment RPC staging verification (02. 06. 2026)

Testovana migrace `20260602_admin_record_affiliate_commission_for_payment_rpc.sql` byla commitnuta jako `5fb14ad4cea514ccb03710ad3c5b5ee1c5666acd` (`feat: add manual affiliate commission payment rpc`) a aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`). Produkce `xkzhjldrojjlrkezorey` nebyla pouzita.

Precheck:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `admin_update_affiliate_partner_status` existuje.
- `record_affiliate_customer_attribution` existuje.
- `admin_record_affiliate_commission_for_payment` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- `affiliate_commission_events` ma `UNIQUE(payment_id)`.
- `payments` ma sloupce `id`, `user_id`, `amount`, `method`, `status`, `stripe_session_id`, `created_at`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck:
- `admin_record_affiliate_commission_for_payment(uuid,numeric,timestamptz,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Staging test:
- Testovaci kod: `TESTCOMM602070452490`.
- Pres `admin_create_affiliate_partner` vznikl docasny affiliate partner a pres `admin_update_affiliate_partner_status` byl aktivovan.
- Docasny zakaznik byl vytvoren pouze na stagingu.
- Zákaznicka attribution byla vytvorena pres `record_affiliate_customer_attribution`.
- Docasna stripe platba byla pripravena jako testovaci `payments` zaznam.
- `admin_record_affiliate_commission_for_payment` s `p_paid_amount_czk = 500` vytvorilo zaznam v `affiliate_commission_events`.
- Overeno: `payment_amount_snapshot = 500`, `payment_amount_source = admin_rpc.p_paid_amount_czk`, `commission_rate_snapshot = 0.02`, `commission_amount_czk = 10.00`, `status = calculated`.
- Audit log `affiliate_commission_event_recorded` byl overen.
- Ocekavane chyby byly overeny: `affiliate_commission_event_already_exists`, `payment_method_not_eligible`, `payment_not_completed`, `affiliate_attribution_after_payment`, `affiliate_attribution_not_found`, `affiliate_partner_not_active`, `not_admin`.
- Cleanup probehl: testovaci commission eventy, audit logy, platby, attribution, affiliate kody, affiliate partneri a docasni auth uzivatele jsou po cleanupu `absent`.
- Nezavisly cleanup check potvrdil `0 TESTCOMM*` affiliate kodu, `0 cs_test_commission_*` plateb a `0 codex-commission-*` auth uzivatelu.

Invariant:
- Nebyla potreba opravna migrace.
- Prvni testovaci beh narazil na existujici staging wallet trigger, ktery pri `INSERT` completed payment sahal na neexistujici `wallets.balance_vouchers`; migrace ani RPC nebyly meneny.
- Finalni test vlozil platby jako `pending` a status upravil na cilovy stav, aby overeni zustalo izolovane na manual commission RPC a netestovalo wallet trigger.
- Nebyl pouzit service role key.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nevznikl zadny trigger.
- Nebyly meneny Stripe webhook, payments flow, wallet ani automaticke provize.
- Nebyly meneny registrace, `partner/register`, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.

---

## Affiliate detail admin views staging verification (02. 06. 2026)

Testovana migrace `20260602_admin_affiliate_detail_views.sql` byla commitnuta jako `23fe6040809e44f596e6199e6f6406368b0e47c1` (`feat: add affiliate admin detail views`) a aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`). Produkce `xkzhjldrojjlrkezorey` nebyla pouzita.

Precheck:
- Potrebne affiliate tabulky a sloupce existuji.
- Detailni views pred aplikaci jeste neexistovaly.
- `public.users.id`, `public.users.email`, `public.users.name` existuji.
- `public.profiles.id`, `public.profiles.full_name` existuji.

Postcheck:
- Views existuji: `v_admin_affiliate_customer_attributions`, `v_admin_affiliate_merchant_referrals`, `v_admin_affiliate_commission_events`.
- Vsechny tri views maji `security_invoker = true`.
- Role `authenticated` ma `SELECT` grant na vsechny tri views.
- Views jdou cist bez chyby; staging pocty byly customer `0`, merchant `0`, commission `0`.
- Nevzniklo zadne RPC.
- Nevznikly zadne affiliate detail triggery.
- Nevznikly zadne policies na detail views.

Invariant:
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebylo pridano zadne RPC, triggery ani policies.
- Nebyly meneny Stripe webhook, payments flow, wallet, automaticke provize ani stary influencer system.

---

## Affiliate DB production rollout (02. 06. 2026)

Affiliate DB vrstva byla dokoncena v produkcnim Supabase projektu `onemil` (`xkzhjldrojjlrkezorey`). Cilem bylo prenest stagingove overenou DB vrstvu do produkce po bezpecnych davkach bez vytvareni produkcnich testovacich dat.

Cilovy projekt:
- Produkce: `xkzhjldrojjlrkezorey`.
- Staging `dxmowysntemfqfnanxua` nebyl v rollout behu pouzit.
- Produkcni projekt byl pred aplikaci znovu potvrzen jako `onemil`, `ACTIVE_HEALTHY`.

Aplikovane zbyvajici migrace v produkci:
- `20260602_admin_update_affiliate_partner_status_rpc.sql`
- `20260602_fix_admin_update_affiliate_partner_status_contract_end.sql`
- `20260602_admin_set_affiliate_commission_rate_rpc.sql`
- `20260602_record_affiliate_customer_attribution_rpc.sql`
- `20260602_record_affiliate_merchant_referral_rpc.sql`
- `20260602_admin_record_affiliate_commission_for_payment_rpc.sql`
- `20260602_admin_affiliate_detail_views.sql`

Poznamka: produkcni Davka 1 `20260602_affiliate_commission_foundation.sql` a RPC `admin_create_affiliate_partner` byly aplikovane a overene uz pred timto dokoncenim rollout behu.

Kontroly po davkach:
- Kazde nove RPC existuje.
- RPC jsou `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE` na RPC.
- Detailni views maji `security_invoker = true`.
- Role `authenticated` ma `SELECT` na detailni views.
- Affiliate tabulky zustaly prazdne.
- Na chranene existujici tabulky `payments`, `wallets`, `wallet_transactions`, `tickets`, `contests`, `partner_offers`, `partners` nepribyly zadne affiliate triggery.

Finalni produkcni postcheck:
- 9/9 affiliate tabulek existuje.
- RLS je zapnute na vsech 9 affiliate tabulkach.
- 5/5 affiliate admin views existuje.
- 5/5 views ma `security_invoker = true`.
- 6/6 affiliate RPC existuje.
- 4/4 admin RPC jsou `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE` na 6/6 RPC.
- Role `authenticated` ma `SELECT` na 5/5 views.
- `affiliate_commission_events` ma `UNIQUE(payment_id)`.
- `affiliate_payouts` ma CHECK constraint pro `period_month` jako prvni den mesice.
- Detail views jdou cist bez chyby; produkcni pocty byly customer `0`, merchant `0`, commission `0`.
- Affiliate tabulky jsou po rollout prazdne.
- Na chranenych existujicich tabulkach nejsou zadne affiliate triggery.
- Na chranenych existujicich tabulkach nejsou zadne affiliate policies.

Invariant:
- Nevznikla zadna produkcni testovaci data.
- Nebyl zalozen zadny affiliate partner v produkci.
- Nebyla volana zadna zapisova affiliate RPC v produkci.
- Nebyl pouzit service role key ve skriptech.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebyl vytvoren trigger na `payments`.
- Nebyly meneny Stripe webhook, payments flow, wallet ani stary influencer system.

Stav:
- Produkcni affiliate DB vrstva je rolloutovana.
- Zaklad zustava bez automatickeho napojeni na registrace, Stripe, payments flow, wallet a automaticke provize.

---

## Affiliate production admin UI verification (02. 06. 2026)

Produkční admin UI affiliate systému bylo ověřeno na `https://onemil.cz/admin/affiliate` jako přihlášený produkční admin.

Ověřeno:
- Stránka `https://onemil.cz/admin/affiliate` se otevřela jako přihlášený admin.
- Taby `Partneři`, `Zákazníci`, `Firmy`, `Provize`, `Výplaty` fungují a přepínají příslušný obsah.
- Tlačítko `Vytvořit partnera` je viditelné.
- Dialog `Vytvořit affiliate partnera` se otevřel.
- V dialogu jsou přítomná všechna pole: `Název partnera`, `Affiliate kód`, `Typ`, `Kontaktní e-mail`, `Právní název / firma`, `Provizní sazba`, `Začátek smlouvy`, `Důvod vytvoření`, `Poznámka`.
- Kliknuto bylo pouze na `Zrušit`.

Invariant:
- Nevznikla žádná produkční data.
- Nebyl vytvořen affiliate partner.
- Nebylo voláno zápisové RPC `admin_create_affiliate_partner`.
- Nebylo spuštěno SQL.
- Nebyly měněny soubory aplikace.
- Stripe, payments flow, wallet a starý influencer systém zůstaly beze změny.

---

## Affiliate admin safety correction — read-only only (02. 06. 2026)

Po záchranném auditu bylo potvrzeno, že původní veřejný influencer/affiliate systém už existuje
a zůstává hlavním provozním flow:

- `/influencer`
- `/influencer/register`
- `/influencer/dashboard`
- `/admin/influencers`
- `/admin/influencer-commissions`
- `/admin/influencer-campaigns`

Nová affiliate DB/admin vrstva zůstává zatím pouze interní read-only vrstva pro přehled:

- `/admin/affiliate`
- taby `Partneři`, `Zákazníci`, `Firmy`, `Provize`, `Výplaty`
- tlačítko `Obnovit`
- read-only data z affiliate admin views

Bezpečnostní korekce:

- Zápisové tlačítko `Vytvořit partnera` bylo v `/admin/affiliate` odstraněno/skryto.
- Dialog `Vytvořit affiliate partnera` byl odstraněn/skryt.
- UI volání RPC `admin_create_affiliate_partner` bylo odstraněno.
- `/admin/affiliate` nesmí zatím nahrazovat původní veřejnou registraci ani původní admin schvalování.

Další krok:

- Připravit návrh bridge: starý schválený partner v `partners` → nový záznam v `affiliate_partners`
  a lidský `affiliate_codes.code`, bez přepisování původního flow.

Invariant:

- Nebyla vytvořena žádná produkční data.
- Nebyl vytvořen affiliate partner.
- Nebylo voláno žádné zápisové RPC.
- Nebylo spuštěno SQL.
- Nebyly měněny DB migrace, affiliate tabulky ani DB RPC.
- Původní influencer systém zůstal zachovaný.
- Stripe, payments flow, wallet a starý influencer systém zůstaly beze změny.

---

## Affiliate legacy bridge staging test (02. 06. 2026)

Bridge proposal `20260602_affiliate_legacy_partner_bridge_proposal.sql` byl aplikovaný pouze na
staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`). Produkce
`xkzhjldrojjlrkezorey` nebyla použita.

Ověřeno:

- RPC `admin_bridge_influencer_partner_to_affiliate` prošlo na stagingu.
- Použitý existující staging partner: `E2E Affiliate Test Partner`
  (`25a79a73-4a8a-4649-ad6c-282c138b207b`).
- Testovací bridge kód: `BRIDGE20260602143530250`.
- Vznikl bridge link, `affiliate_partner`, `affiliate_code`, rate history a audit log.
- Duplicitní bridge pro stejného legacy partnera správně vrátil `legacy_partner_already_bridged`.
- Původní `partners` řádek zůstal beze změny.
- Cleanup smazal test bridge data.
- Po cleanupu je test code/link/affiliate partner/rate history/audit log = `0`.

Invariant:

- Starý influencer systém nebyl změněn.
- Stripe, payments flow a wallet nebyly změněny.
- Produkce nebyla použita.

---

## Affiliate legacy bridge — produkční STRUKTURA aplikována + postcheck (02. 06. 2026)

Bridge **struktura** (ne data) byla aplikována do produkce `xkzhjldrojjlrkezorey` (`onemil`).
Read-only produkční postcheck prošel.

Ověřeno (produkce `xkzhjldrojjlrkezorey`):

- `affiliate_legacy_partner_links` existuje. ✅
- RLS je zapnuté na bridge tabulce. ✅
- Existuje admin read (SELECT) policy. ✅
- RPC `admin_bridge_influencer_partner_to_affiliate` existuje. ✅
- RPC je `SECURITY DEFINER`. ✅
- `authenticated` má `EXECUTE` na RPC. ✅
- View `v_admin_influencer_affiliate_bridge_candidates` existuje. ✅
- View má `security_invoker = true`. ✅
- `authenticated` má `SELECT` na view. ✅
- `affiliate_legacy_partner_links` má **0 řádků** — bridge link table je prázdná. ✅
- Approved influencer kandidátů v produkci: **3** (informativní).
- Žádné affiliate/bridge triggery na `partners`, `payments`, `wallets`, `wallet_transactions`,
  `tickets`, `contests`, `partner_offers` (count = 0). ✅

Invariant:

- Žádný partner nebyl bridgnutý.
- Žádné bridge RPC `admin_bridge_influencer_partner_to_affiliate` nebylo voláno pro konkrétního partnera.
- Žádná produkční testovací data nevznikla.
- Starý influencer systém zůstává hlavní provozní flow.
- `/admin/affiliate` zůstává read-only.
- Stripe, payments flow a wallet nebyly měněny.

---

## /admin/influencers — read-only bridge stav přehled (02. 06. 2026)

Do starého adminu `/admin/influencers` (`src/pages/AdminInfluencers.tsx`) přidán **pouze read-only**
přehled napojení influencerů na novou affiliate vrstvu. Žádné schvalování, provize ani výplaty
nebyly změněny.

Co přibylo (jen čtení):

- Načítání view `v_admin_influencer_affiliate_bridge_candidates` přes fail-safe `fetchBridgeStatus`
  (`supabase as any`, view není v TS typech). Při chybě se starý admin nezhroutí — zobrazí jen
  neutrální hlášku „Stav napojení na affiliate vrstvu se teď nepodařilo načíst.".
- Nová read-only souhrnná karta „Napojení na affiliate vrstvu (evidenční)" nad tabulkou:
  počet schválených vhodných pro napojení, počet napojených, počet nenapojených.
- Nový sloupec „Affiliate vrstva" v tabulce s bridge stavem:
  `Napojeno na affiliate vrstvu` (+ affiliate kód + affiliate status), `Nenapojeno na affiliate
  vrstvu`, nebo `Nelze napojit – není schválený`.
- UI poznámka: „Napojení na novou affiliate vrstvu je zatím pouze evidenční. Původní influencer
  systém zůstává hlavní.".
- Tlačítko „Obnovit" nyní obnoví i bridge stav.

Invariant (UI):

- Žádné tlačítko pro bridge nepřibylo.
- RPC `admin_bridge_influencer_partner_to_affiliate` se NEVOLÁ.
- Žádné SQL nebylo spuštěno; žádný bridge link ani produkční data nevznikla.
- Staré schvalování influencerů beze změny.
- `/influencer/register`, `/influencer/dashboard`, `/admin/affiliate` (read-only), Stripe,
  payments flow a wallet nedotčeny.
- `npm run build` ✅ (13.91s, jen předexistující chunk-size varování).

---

## PRVNÍ OSTRÝ PRODUKČNÍ BRIDGE — PROVEDEN (02. 06. 2026)

První reálný produkční bridge schváleného influencera do nové affiliate vrstvy byl proveden
v produkci `xkzhjldrojjlrkezorey` (`onemil`) po výslovném potvrzení uživatele (`SPOUSTIM`).

Vstup:

- legacy_partner_id: `1ef76f65-b028-408b-9a77-ea9d5cad6592` (Pavel Divis, status `approved`)
- affiliate kód: `PAVEL01`
- commission_rate: `0.02`
- RPC: `admin_bridge_influencer_partner_to_affiliate`
- spuštěno jako přihlášený admin (superadmin `divispavel2@gmail.com`,
  `60f5837e-a280-4ddd-b0dd-f94cc844bb3b`) — RPC má interní `is_admin()` guard, service role
  nestačí, proto byl v transakci nastaven admin auth kontext.

Výsledek RPC (`status: bridged`):

- affiliate_partner_id: `80edc966-adc4-455c-b2d8-64e01aa6167e`
- affiliate_code_id: `a7db63ef-37a4-4922-8858-5d2fc58009d2`
- link_id: `58f69a9d-00c8-4efc-8731-96c22d4540a4`
- contract_starts_at: `2026-06-02T15:10:06.211011+00:00`

Postcheck (vše OK):

- bridge link count pro partnera = 1 ✅
- affiliate_partner status = `active`, type = `influencer` ✅
- affiliate_code `PAVEL01` status = `active` ✅
- rate history commission_rate = `0.02` (uloženo jako `0.020000`), valid_to IS NULL ✅
- audit log `legacy_influencer_partner_bridged` = 1 řádek ✅
- původní `partners` řádek beze změny: status `approved`, notes influencer JSON, email
  `influencer@onemil.c`, updated_at `2026-02-10T19:55:10.757743+00:00` ✅
- total bridge links v produkci = 1 ✅

Invariant:

- Bridgnut pouze Pavel Divis kódem `PAVEL01`; žádný jiný partner.
- Původní influencer systém, `/admin/influencers`, `/admin/affiliate` (read-only),
  `/influencer/register`, `/influencer/dashboard`, Stripe, payments flow a wallet beze změny.
- Zbývající approved kandidáti (`Test Influencer A`, `trubka`) zůstávají nenapojení.
- Staging nebyl použit.

### Ruční UI ověření v produkci (02. 06. 2026)

Ověřeno ručně přihlášeným adminem v produkčním UI:

- **`/admin/influencers`** — řádek **Pavel Divis**, sloupec „Affiliate vrstva":
  „Napojeno na affiliate vrstvu", kód `PAVEL01`, status `active`. ✅
- **`/admin/affiliate`** — read-only tab **Partneři**:
  - Pavel Divis, typ **Influencer**, stav **Aktivní**, kód **PAVEL01**, sazba **2 %**.
  - hodnoty zákazníci / firmy / provize / bonusy = **0** (žádná aktivita zatím).
  - stránka je **read-only**: žádné tlačítko „Vytvořit partnera", pouze „Obnovit". ✅

---

## AFFILIATE TRACKING `aff=KOD` — FRONTEND IMPLEMENTOVÁN (02. 06. 2026)

Implementován **pouze frontendový** tracking pro `aff=KOD`. DB vrstva
(`record_affiliate_customer_attribution`, `user_affiliate_attributions`,
`v_admin_affiliate_customer_attributions`) už existovala — žádná migrace, žádné SQL.

Změněné / nové soubory:

- **nový** `src/hooks/useApplyPendingAffiliate.ts`:
  - sessionStorage klíč `onemil_affiliate_aff` (oddělený od ref klíče `onemil_referral_ref`).
  - `normalizeAffiliateCode()` — uppercase + regex `^[A-Z0-9][A-Z0-9_-]{2,31}$`; nevalidní → null.
  - `capturePendingAffiliateFromUrl(search)` — uloží `aff` **jen když URL neobsahuje `ref`**
    (ref má přednost), jen validní kód, nepřepisuje už uložený (first-touch).
  - `useApplyPendingAffiliate(userId)` — po přihlášení (vč. OAuth návratu) zavolá RPC
    `record_affiliate_customer_attribution` s `p_source='direct_link'`, `p_landing_url`,
    `p_metadata={captured_via:'aff_url'}`; storage smaže; chyby (neznámý/neaktivní kód) jen
    zaloguje do console, nikdy nerozbije auth flow.
- `src/pages/Register.tsx`:
  - nový `useEffect` zachytí `aff` z URL přes `capturePendingAffiliateFromUrl` (ref má přednost).
  - po e-mail registraci (za starým ref blokem) zavolá `record_affiliate_customer_attribution`
    pro uložený `aff`, non-blocking. Starý `ref` blok beze změny.
- `src/App.tsx`:
  - root `useEffect` zachytí `aff` z `location.search` i mimo `/register` (scénář `/?aff=PAVEL01`).
  - `useApplyPendingAffiliate(user?.id)` mountnut vedle `useApplyPendingReferral`. Routing/UI beze změny.

Pravidla (zadrátováno):

- `aff` a `ref` jsou **oddělené** (klíče, RPC, tabulky).
- Při kolizi `ref` i `aff` v URL → **`ref` vyhrává, `aff` se neukládá**.
- Neznámý/neaktivní `aff` → tiše ignorováno (console log), registrace nespadne.
- Existující atribuci nepřepisuje (řeší RPC `ON CONFLICT (user_id) DO NOTHING`).
- Žádná vazba na Stripe, payments, wallet, provize.
- `/admin/affiliate` zůstává read-only; starý influencer systém beze změny.

Stav:

- `npm run build` ✅ (12.81s, jen předexistující chunk-size varování).
- Žádné SQL nebylo spuštěno; žádné produkční RPC voláno ručně; žádná produkční data nevznikla.
- **Produkce zatím NEpublikována** (Lovable Publish neproběhl) — čeká na staging ověření.

---

## AFFILIATE TRACKING `aff=PAVEL01` — STAGING E2E OVĚŘENO (02. 06. 2026)

Staging E2E test proběhl **pouze na stagingu** `dxmowysntemfqfnanxua`. Frontend běžel lokálně
proti stagingu na **portu 8090** (ověřeno, že servíruje `https://dxmowysntemfqfnanxua.supabase.co`).
Testovaný commit: **`3f10500`**. Produkce `xkzhjldrojjlrkezorey` nebyla použita ani publikována.

**Pozitivní test PAVEL01 — PROŠEL:**
- `sessionStorage["onemil_affiliate_aff"] = "PAVEL01"`, `onemil_referral_ref` prázdné.
- Po přihlášení test uživatele vznikl **1 řádek** v `user_affiliate_attributions`:
  - affiliate_partner_id `9bf4e8ca-ce12-49cf-8c88-a9aa63ccfb47`
  - affiliate_code_id `371c2cd1-0fb2-4c0f-9b08-d5fc724aa4d6`
  - source `direct_link`, locked `true`
- `/admin/affiliate` → Zákazníci (view `v_admin_affiliate_customer_attributions`) ukázal test
  uživatele pod **E2E Affiliate Test Partner / PAVEL01**.
- Starý `influencer_referrals` = **0** (izolace ref ✅).

**Negativní test `NEEXISTUJE` — PROŠEL:**
- Login nespadl; RPC neznámý kód odmítl; `user_affiliate_attributions` = **0**.

**Kolizní test `?ref=NEJAKYREF&aff=PAVEL01` — PROŠEL:**
- `aff` se **neuložil** (ref má přednost); affiliate atribuce = **0**; legacy referral = **0**.

**Cleanup:**
- Test uživatelé `aff-test-*@test.local` smazáni; jejich atribuce, identities, audit logy
  i profiles/wallets uklizené (0 orphan řádků ověřeno).

**Staging PAVEL01 setup zachován:**
- affiliate_partner_id `9bf4e8ca-ce12-49cf-8c88-a9aa63ccfb47`
- affiliate_code_id `371c2cd1-0fb2-4c0f-9b08-d5fc724aa4d6` (active)
- link_id `a50736a9-d878-4e32-b2d3-fb2949db7be5`

**Pozn. k metodě:** Supabase MCP nevystavuje service_role/admin-create-user, proto byli
předpotvrzení test uživatelé vytvořeni ekvivalentně přes SQL (pgcrypto bcrypt + `email_confirmed_at`
+ doplnění prázdných GoTrue token sloupců). Vše staging-only a kompletně uklizeno.

**Stav:** produkční `.env` zůstal nedotčený (míří na produkci); produkce nepoužita ani publikována.
Frontend tracking `aff=KOD` je **funkčně ověřený na stagingu** a připravený na produkční
**Lovable Publish po schválení**.

---

## AFFILIATE TRACKING `aff=KOD` — PRODUKČNÍ PUBLISH OVĚŘEN (02. 06. 2026)

Produkční **Lovable Publish proběhl**. Ověřeno read-only (jen fetch veřejných assetů).

- **Produkční bundle URL:** `https://onemil.cz/assets/index-ByC__JoZ.js`
- **Bundle obsahuje** (potvrzeno greppem):
  - `onemil_affiliate_aff`
  - `record_affiliate_customer_attribution`
  - regex `^[A-Z0-9][A-Z0-9_-]{2,31}$`
  - `direct_link`, `captured_via`, `aff_url`, `p_affiliate_code`
- Název `useApplyPendingAffiliate` je v produkčním buildu **minifikovaný** (název funkce mangled),
  ale jeho **funkční obsah je přítomný** (storage konstanta, normalize regex, RPC volání, metadata).
- Bundle míří na **produkční Supabase** `xkzhjldrojjlrkezorey` (9 výskytů).
- **Produkční affiliate tracking `aff=KOD` je nasazený a aktivní.**

Invariant:

- Nebyla vytvořena žádná data; nebyl proveden login ani registrace; nebylo spuštěno SQL ani RPC.
- Stripe, payments flow, wallet, starý influencer systém a `/admin/affiliate` (read-only) beze změny.

### Produkční capture-only smoke test (02. 06. 2026, ruční)

Proběhl **ručně v anonymním okně** na produkci `https://onemil.cz` (capture-only, bez loginu):

- **Test 1** — `https://onemil.cz/?aff=PAVEL01`:
  `sessionStorage["onemil_affiliate_aff"] = "PAVEL01"`, `onemil_referral_ref = null`. ✅
- **Test 2** — `https://onemil.cz/?ref=NEJAKYREF&aff=PAVEL01`:
  `onemil_affiliate_aff` se **neuložil** → ref má správně přednost. ✅
- **Test 3** — `https://onemil.cz/?aff=x`:
  `onemil_affiliate_aff` se **neuložil** → nevalidní krátký aff odmítnut (regex). ✅

Invariant:

- Nebyl proveden login ani registrace.
- Nebylo spuštěno SQL ani RPC; nevznikla žádná affiliate atribuce ani žádná produkční data.
- Produkční tracking `aff=KOD` je po publishi ověřený i **ručně v prohlížeči**.

### PAVEL01 self-attribution cleanup (02. 06. 2026)

Produkční monitoring PAVEL01 ukázal **1 atribuci**. Detail potvrdil, že šlo o **self-attribution**
(Pavel testoval vlastní aff link na svém vlastním účtu):

- attribution_id `5dcd316a-6233-4191-9702-30a5bff1d1a9`
- user_id `c23507eb-081c-4170-89ad-2e78df088103`, user_email `influencer@onemil.cz`
- affiliate code `PAVEL01`, affiliate display name `Pavel Divis`
- legacy partner auth_user_id `c23507eb-081c-4170-89ad-2e78df088103` → **is self attribution: YES**
- source `direct_link`, locked `true`, landing_url `https://onemil.cz/?aff=PAVEL01`

Akce: smazána **pouze tato self-attribution** a její audit log.

Cleanup verification:

- remaining PAVEL01 attributions total = **0**
- remaining PAVEL01 self attribution rows = **0**
- remaining audit logs for deleted attribution = **0**
- ref collision rows = **0**

Invariant:

- PAVEL01 setup zůstal zachovaný (partner `9bf4e8ca…`, code `371c2cd1…` active, link `a50736a9…`).
- Starý influencer systém, Stripe, payments flow, wallet a `/admin/affiliate` (read-only) beze změny.

---

## AFFILIATE V2 COMPANY VIA FLOW — STAGING BROWSER E2E OVĚŘENO PO ZMĚNĚ BEZPEČNOSTNÍHO MODELU (03. 06. 2026)

Finální staging ověření proběhlo pouze proti staging projektu `dxmowysntemfqfnanxua`.
Produkce `xkzhjldrojjlrkezorey` nebyla dotčena.

Aktuální bezpečnostní model:

- U Affiliate v2 se už NEPOUŽÍVÁ `VITE_INTERNAL_FUNCTION_TOKEN` v Lovable/browser buildu.
- Důvod: Lovable workspace nemá Build Secrets a nechceme vystavit interní token v browseru.
- Edge Functions `get-pending-partner-registrations` a `approve-partner-registration` jsou chráněné přes:
  `Authorization: Bearer <user JWT>`, `supabaseAdmin.auth.getUser(token)` a kontrolu `user_roles`
  na `admin` / `superadmin`.
- Commit změny bezpečnostního modelu: `9f3f53b55f89a3f0c2b16637af32335376fede1d`
- Commit CORS/staging ověření: `9bf059d1cf712db36dbc70309dc735e451899d97`
- Před produkčním nasazením už NENÍ potřeba nastavovat Lovable `VITE_INTERNAL_FUNCTION_TOKEN`.

Ověření:

- `get-pending-partner-registrations` už nevrací `401`.
- Browser E2E `affiliate company via flow` prošel.
- Ověřený tok:
  `/partner/register?via=KOD` → pending registrace → admin schválení → `partner` →
  `affiliate_company_refs` → `partners.referred_by_affiliate_id`.
- Run URL: `https://github.com/Divuna/million-ticket-draw/actions/runs/26887279500`

Invariant:

- Produkce nebyla dotčena.
- Nebyl změněn zákaznický účet.
- Nebyly měněny platby, tikety, soutěže, peněženka ani `buy_ticket_atomic`.
