# CLAUDE.md

## CONTACT / LEGAL EMAIL CONSISTENCY AUDIT (14. 06. 2026, jen dokumentace)

Repo audit verejnych e-mailu: app/legal/contact/footer/delete-account/support fallback a partner docs konzistentne pouzivaji `podpora@onemil.cz`; `COMPANY_CONTEXT.md` stale uvadi `support@onemil.cz` jako podporu a `info@onemil.cz` jako hlavni e-mail, `b2b@onemil.cz` jen pro spoluprace. `accounting_email` je interni affiliate payout setting, ne verejny support. Znamy DB vysledek doplnen do `LAUNCH_TODO.md`: CMS `vop`, `gdpr`, `pravidla-souteze` a `cookies` existuji, ale pravni kvalita/aktualnost zustava neoverena. Doporuceni: potvrdit `podpora@onemil.cz` jako kanonicky verejny support e-mail nebo sjednotit zdroj pravdy. Zadny kod, SQL, deploy, produkcni data, Partner API, fakturace ani reward logika.

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

Documentation-only static audit. `/terms`, `/privacy`, `/kontakt`, cookie banner/settings, footer legal links, and CMS route wiring were reviewed. Static pages exist and are not obvious placeholders, but CMS-backed legal routes `/vop`, `/gdpr`, `/pravidla-souteze`, and `/legal/cookies` still require owner/environment confirmation of real content. Contact/support e-mail must be confirmed because app pages use `podpora@onemil.cz` while `COMPANY_CONTEXT.md` lists `support@onemil.cz`/`info@onemil.cz`. Do not invent legal wording or edit legal text without owner approval. No code, SQL, deploy, production data, Partner API, invoice, reward, or migration change.

---
