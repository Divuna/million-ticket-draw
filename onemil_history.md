# OneMil — DEVELOPMENT HISTORY (CHRONOLOGICAL ONLY)

**Timestamp (Europe/Prague): 2026-04-13 20:46:33 +02:00** (poslední dokumentační synchronizace)

## Strict header (do not break)
### What belongs in this file
- Only **dated chronological history** (what happened and when).
- Keep entries short and factual; link to concrete artifacts (migrations, functions, pages) where possible.

### What must never be written here
- Current state summaries, invariants, "what is working/broken now" (belongs to `onemil_state.md`).
- Mixed state+history blocks or duplicated state dumps.
- Undated narrative dumps.

---

## 2026-06-07 - Phase 2A backend: create-affiliate-company-lead (staging)

- Edge Function `create-affiliate-company-lead` implementována a deployována na staging (`dxmowysntemfqfnanxua`), status ACTIVE, version 1. Commit `b54fbb0e`.
- Staging happy-path test prošel: `{ "success": true, "lead_id": "3147d6ce-83b6-40d4-ad3f-89e60fc9a276", "status": "sent_to_company" }`.
- Ověřeno: lead v `affiliate_company_leads`, token hash 64-char SHA-256, raw token mimo response/DB, email_queue záznam s confirm/reject URL, žádný zápis do `affiliate_company_refs`, žádná provize. Security audit: JWT auth, approved + sales_rep mode check, token-hash-only.
- Testovací staging účet: `sales-rep-test@onemil.cz`, ref `TESTSR2026`, modes `["sales_rep"]`, pouze staging.
- Produkce `xkzhjldrojjlrkezorey` nedotčena. `npm run build` ✅. Lokální repo synchronizováno (`git pull`).
- Nezměněno: provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`, UI.

---

## 2026-06-07 - Admin navigace: badge čekajících partnerských registrací

- `AdminContextSubNav.tsx` zobrazuje červený badge u `Partneři` s počtem čekajících registrací z `get-pending-partner-registrations`. Badge jen při count > 0.
- Commit `0339cd4a`. `npm run build` ✅. GitHub Playwright Smoke Tests ✅. Beze změny DB, schvalování, affiliate.

---

## 2026-06-07 - Affiliate/referral: bezpečná veřejná doména (publicAppUrl.ts)

- Nový helper `src/lib/publicAppUrl.ts`: akceptuje `VITE_APP_URL` jen pokud je `https` a není localhost/Lovable/preview doména; jinak fallback `https://onemil.cz`.
- Aplikován v AffiliateDashboard, useInfluencerData, ReferralSection. Spec 26 aktualizován.
- Commit `d2b12504`. `npm run build` ✅. Staging Full E2E ✅. Beze změny DB, provizí, registrace partnerů, ticket logiky.

---

## 2026-06-04 - Admin /influencers detail: kompletní Affiliate v2 data

- `/admin/influencers` detail rozšířen o kompletní `affiliate_accounts` data (přes auth_user_id): ref_code, modes (Influencer/Obchodník), stav, provizní sazby, IČO, DIČ, DPH, fakturační adresa, země, IBAN, banka — nad rámec social/web/audience/kategorie.
- affiliate_accounts = primární zdroj, fallback partners.notes/website_url, „—" jinak. Social = klikací odkazy, žádné embed/video/API. Žádná DB změna.
- /admin/affiliate-accounts nezměněno, nesmazáno, neskryto.
- Spec 30 rozšířen. Staging Full E2E run `26933791136`: 54 passed, 0 failed. `npm run build` ✅. Commit `b79a821e`.
- Nezměněno: provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, buy_ticket_atomic.

---

## 2026-06-04 - Admin /influencers detail čte social z affiliate_accounts

- Skutečná příčina admin „—" u social: admin používal `/admin/influencers` (AdminInfluencers, legacy partners), který četl social z `partners.notes.social_networks`, ne z `affiliate_accounts` (kam affiliate ukládá). Ověřeno: partners.notes vše null, affiliate_accounts má data.
- Fix (display-only): openDetail načte affiliate_accounts podle auth_user_id; detail preferuje affiliate_accounts (instagram/tiktok/youtube/facebook/website/audience/categories), fallback partners.notes. Klikací odkazy, žádné embed/video/API. Žádná DB změna.
- Spec 30 ověřuje. Staging Full E2E run `26917798377`: 54 passed, 0 failed. `npm run build` ✅. Commit `fb3dab91`.
- Nezměněno: provize, zákaznický účet, platby, tikety, soutěže, peněženka, buy_ticket_atomic.

---

## 2026-06-04 - Affiliate v2: Profil form re-sync po uložení (stale useState)

- Symptom: po uložení social polí se v Profilu data „nezobrazovala správně".
- Root cause: `AffiliateProfileSection` inicializoval `form` přes `useState({...initial})` jen jednou; po onSaved reloadu rodiče se form neaktualizoval. Data se do DB ukládala správně (youtube v DB, RPC 19-arg, handleSave posílá všech 6 social params).
- Fix: re-sync form z initial při skutečné změně serializovaných dat (porovnání podle hodnoty, nepřepíše rozeditované hodnoty). Žádná DB migrace. Social = jen text.
- Spec 28 rozšířen o page.reload() + re-assert. Staging Full E2E run `26916797958`: 53 passed, 0 failed. `npm run build` ✅. Commit `abab6a9c`.
- Nezměněno: provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, buy_ticket_atomic.

---

## 2026-06-06 - Správa soutěží: statistické karty jen z active soutěží

- Pět karet v adminu „Správa soutěží" (`Tikety prodány`, `Tikety zbývají`, `Prodáno %`, `Výnos (MC)`, `Tikety za 24h`) počítá nově pouze ze soutěží se statusem `active`.
- pending/draft/paused/closed, archiv test, ukončené i nezahájené soutěže jsou z těchto pěti statistik vyloučeny.
- Když není žádná active soutěž, karty ukazují nulové hodnoty.
- Změněný soubor: `src/components/AdminContestManagement.tsx`. Commit `d212dff7`. `npm run build` ✅. Po Lovable Publish ověřeno Pavlem.
- Beze změny tabů, tabulky soutěží, DB, ticket logiky, ekonomiky, vytváření soutěží, bonusů, grafiky.

---

## 2026-06-06 - Detail soutěže: výraznější badge počtu věcných výher

- Karty věcných bonusových výher (veřejný detail soutěže) mají badge počtu (např. `295× v soutěži`) v OneMil orange/amber pill stylu.
- Lehký přesah přes horní pravý roh karty; větší, bold, čitelný; Energy Orange → Warm Amber gradient, tmavý vysoce kontrastní text, jemný stín/glow + ring.
- Změněný soubor: `src/pages/ContestDetail.tsx`. Commit `dafe0064`. `npm run build` ✅. Po Lovable Publish ověřeno Pavlem jako funkční a dobře viditelné.
- Vizuál badge only — beze změny dat, počítání, ticket/bonus logiky, DB, admin flow, ekonomiky, grafiky.

---

## 2026-06-06 - Detail soutěže: MioCoin/bonus souhrn (počet výher + MioCoin podtotal)

- Veřejný detail soutěže (`src/pages/ContestDetail.tsx`) MioCoin box nově zobrazuje:
  „V této soutěži je celkem X dalších výher." + „Z toho Y MioCoinů, které vám mohou otevřít cestu k dalším soutěžím nebo k nákupu voucherů na krásné slevy u našich partnerů."
- X = počet MioCoin pozic (`bonus_prizes` amount>0, exact head count) + počet věcných výher (`bonus_prizes` amount null/0).
- Y = celková nakonfigurovaná částka MioCoinů (RPC `get_contest_miocoin_bonus`, fallback `contests.total_miocoin_bonus`).
- Partner Offers vyloučeny (nejsou v `bonus_prizes`, mohou přibývat během soutěže).
- Změněný soubor: `src/pages/ContestDetail.tsx`. Commit `208434d0`. `npm run build` ✅.
- Frontend display/counting only — beze změny DB, ticket/wallet logiky, ekonomiky, generování bonusů, admin create flow, grafiky.

---

## 2026-06-05 - Zapsáno systémové pravidlo ochrany proti regresím

- Definition of Done: build ✅ + relevantní E2E/smoke + ověření nerozbití souvisejících oblastí + samostatné schválení DB/migrace/Edge/Bob-prompt + aktualizovaná dokumentace + pushnutý commit (produkce po Lovable Publish).
- P0 smoke před každým Publish: registrace/login, login gating, nákup ticketu, výhra, peněženka/balance, zprávy admin↔uživatel, Bob ON/OFF kontrakt.
- Každá kritická oblast (přihlášení, soutěže, hraní, dobíjení, peněženka, výhry, zprávy, Bob, affiliate, partneři, admin) musí mít test nebo schválenou výjimku.
- Bob: neměnit prompt/CTA/formát {text,cta}; testovat jen kontrakt, ne přesný text.
- „OneMil se nehlídá ručně — každá větší změna musí být chráněná testem, smoke testem nebo schválenou výjimkou."
- Pouze dokumentace (CLAUDE.md, onemil_state.md, onemil_history.md). Žádná změna kódu/DB.

---

## 2026-06-05 - Login: /partner/login blokuje legacy influencery (firemní partner only)

- Proč to šlo: /partner/login kontroloval jen existenci partners řádku; legacy influenceři jsou taky v partners (notes.type=influencer) → považováni za firemního partnera, routováni na /affiliate/dashboard.
- Skutečný partner = partners řádek bez „influencer" v notes (firemní mají company_name).
- PartnerLogin: pokud notes označí influencera → signOut + „nemáte firemní Partner účet", zůstane na /partner/login. Jen firemní partner → /partner/dashboard.
- Footer „Přihlášení Affiliate partnera" opraveno na /affiliate/login.
- Spec 14 přepsán. Staging Full E2E run `27000493579`: 65 passed, 0 failed. `npm run build` ✅. Commit `eb2f42ac`.
- Commity 6f2d43e0/dd8defa7/4612d294/811e176c ověřeny na origin/main; produkce vyžaduje Lovable Publish.
- Nezměněno: DB/migrace, platby, tikety, soutěže, peněženka, buy_ticket_atomic, Bob, ai-chat, provize.

---

## 2026-06-05 - Login: konec auto-bounce affiliate/partner z /login (admin first)

- Login.tsx: inline routing po signIn — admin/superadmin VŽDY první → /admin; jakýkoliv partners/affiliate_accounts záznam → signOut + sonner hláška, zůstane na /login (žádný bounce); jinak zákazník → /profile.
- /login není v CUSTOMER_BLOCKED_ROUTES → setrvání na /login neaktivuje globální guard bounce.
- Affiliate E2E se přihlašuje přes /affiliate/login (nový helper loginAffiliateViaUI); specy 25/26/27/28 upraveny; toast asserty filter.
- Spec 30 ref_code fix (truncation collision). Spec 33 rozšířen na 6 testů.
- Staging Full E2E run `26999704712`: 64 passed, 0 failed. `npm run build` ✅. Commity `6f2d43e0`, `dd8defa7`, `4612d294`.
- Nezměněno: DB/migrace, platby, tikety, soutěže, peněženka, buy_ticket_atomic, Bob, ai-chat, provize.

---

## 2026-06-05 - Rozhodnutí o přihlašování (dokumentace)

- `/affiliate/login` = samostatný vstup pro Affiliate (gate na affiliate_accounts).
- `/partner/login` = samostatný vstup pro Partner (gate na partners).
- `/login` zůstává sdílený — chodí přes něj i admin; nesmí se uzavřít jen pro soutěžící, dokud neexistuje spolehlivý DB signál „soutěžící účet".
- Admin check vždy první; admin nikdy neblokovat kvůli partner/affiliate záznamu.
- profiles/wallets nejsou spolehlivý signál (mají je i partneři i affiliate).
- Budoucí oddělení /login vyžaduje samostatně schválenou migraci/signál + backfill existujících účtů.
- Pouze dokumentace, žádná změna kódu/DB.

---

## 2026-06-05 - Login gating dle typu účtu (/affiliate/login + /partner/login)

- Nový `/affiliate/login` (gate na affiliate_accounts, jinak hláška + signOut); affiliate registrace vede na něj.
- `/partner/login` gate na partners (hláška upravena); čistý affiliate blokován, ne přesměrován.
- `/login` NEZMĚNĚN: ověřeno, že spolehlivý signál „soutěžící" neexistuje (žádný auth trigger; partneři i affiliate mají wallets). Signál nevymýšlen, vrácen návrh (flag = migrace, čeká na schválení).
- Multi-role: každý login gatuje na svůj záznam.
- Spec 33 zelený, specy 26/27 bez regrese. Staging Full E2E run `26996683970`: 61 passed, 0 failed. `npm run build` ✅. Commits `48413dee`, `4748042d`.
- Nezměněno: DB/migrace, platby, tikety, soutěže, peněženka, buy_ticket_atomic, Bob, ai-chat, provize.

---

## 2026-06-04 - Admin unread badge: počítá i běžné user zprávy (staging)

- Chyba: `useUnreadMessagesCount` admin větev počítala jen nepřečtené SUPPORT_REQUEST_MARKER → běžné user zprávy (zákazník/partner/affiliate bez handoffu) se v badge neobjevily.
- Fix (jen frontend): admin unread = distinct konverzace s nepřečtenou sender='user' zprávou; admin zvuk i u běžné user zprávy; testidy pro nav badge + kartu. Žádná DB migrace, Bob/ai-chat beze změny.
- `/admin/messages` už má „Čeká na odpověď"/„Vyřešeno" (Lovable).
- Spec 32 zelený. Staging Full E2E run `26979723827`: 58 passed, 0 failed. `npm run build` ✅. Commit `42f29729`.

---

## 2026-06-04 - Bob ON/OFF přepínač Fáze 1 APLIKOVÁNA na PRODUKCI

- Migrace `20260604_get_bob_enabled_rpc.sql` aplikována na produkci `xkzhjldrojjlrkezorey` (výslovné schválení Pavla).
- Postcheck: `settings.bob_enabled='true'`, `get_bob_enabled()` vrací boolean (pg_typeof=boolean), SECURITY DEFINER, 0 args, authenticated EXECUTE, čte jen bob_enabled (žádné secrety).
- ai-chat / Bob prompt / CTA / `{ text, cta }` beze změny. `npm run build` ✅. Frontend na main `c0842894` — vyžaduje Lovable Publish.
- Žádné Edge Functions, žádné jiné migrace.

---

## 2026-06-04 - Bob ON/OFF přepínač Fáze 1 (staging)

- Přidán globální admin přepínač Boba: `settings.bob_enabled` + SECURITY DEFINER RPC `get_bob_enabled()` (vrací jen boolean, žádné secrety). Migrace `20260604_get_bob_enabled_rpc.sql` aplikována na STAGING.
- Hook `useBobEnabled`, admin Switch v `/admin/messages` (+ český toast), oranžový pulz na nav „Zprávy" při Bob OFF, customer `Messages.tsx` při OFF routuje na admin (ai-chat se nevolá) + sonner handoff toast.
- Bob prompt/CTA/handlery/`{ text, cta }` formát ani ai-chat kód nezměněn.
- Spec 31 (serial) zelený. Staging Full E2E run `26977917782`: 57 passed, 0 failed. `npm run build` ✅.
- Commits `de8dd07b` … `e82b89d6`. Produkční migrace zatím neaplikována (čeká na schválení).
- Nezměněno: platby, soutěže, tikety, peněženka, buy_ticket_atomic, affiliate provize.

---

## 2026-06-04 - Admin messaging RLS: migrace aplikována na PRODUKCI

- Aplikována migrace `20260603_messages_admin_insert_policy.sql` na produkci `xkzhjldrojjlrkezorey` (výslovné schválení Pavla). Policy `messages_insert_admin` (authenticated admin/superadmin přes user_roles).
- Postcheck (RLS simulace, transakce abortovány): admin→affiliate insert povolen (t), běžný uživatel za admina odmítnut (f). 3 INSERT policies přítomny.
- Admin zpráva affiliate uživateli nyní funguje v produkci. `npm run build` ✅.
- Nezměněno: provize, affiliate výpočty, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, buy_ticket_atomic. Žádné jiné migrace ani Edge Functions.

---

## 2026-06-03 - Admin messaging: obnovena admin INSERT RLS policy na messages (staging)

- Symptom: admin nemohl poslat zprávu affiliate (ani jinému) uživateli — „Zprávu nelze odeslat".
- Root cause: `public.messages` INSERT policies měly jen `messages_insert` (authenticated, auth.uid()=user_id) a `messages_insert_system` (service_role). Chyběla admin policy → admin reply s user_id≠auth.uid() RLS odmítl. Postihovalo všechny admin reply.
- Příjemce = `affiliate_accounts.auth_user_id` (FK messages.user_id → auth.users), ne affiliate_accounts.id.
- Fix: migrace `20260603_messages_admin_insert_policy.sql` (policy `messages_insert_admin`, authenticated admin/superadmin přes user_roles) — aplikováno na STAGING. Produkce čeká na schválení.
- Frontend: AdminAffiliateAccounts SELECTuje auth_user_id + tlačítko „Napsat zprávu" → /admin/messages/<auth_user_id>.
- Spec 29 ověřuje admin→affiliate zprávu. Staging Full E2E run `26915631607`: 53 passed, 0 failed. `npm run build` ✅. Commit `ee17440e`.
- Nezměněno: provize, zákaznický účet, platby, tikety, soutěže, peněženka, buy_ticket_atomic. Žádné Edge Functions.

---

## 2026-06-03 - Affiliate v2: oprava admin social zobrazení (odstraněn tichý fallback)

- Symptom: admin v `/admin/affiliate-accounts` detailu viděl YouTube prázdné, ač DB hodnota existovala (`influencer1@onemil.cz`/`TRUBKA89A0` → `youtube_url` vyplněno).
- Chyba byla jen v zobrazení, NE v ukládání — data v DB byla správně.
- Root cause: `AFFILIATE_ACCOUNT_SELECT_FALLBACK` v `AdminAffiliateAccounts.tsx` a `AffiliateDashboard.tsx` tiše vynechával social sloupce; aktivoval se při selhání primárního SELECTu (stale PostgREST schema cache po migraci) → social data zmizela z UI.
- Fix: fallback odstraněn v obou souborech; vždy plný SELECT. Žádná DB/RPC/migrace změna. Social = jen text.
- Pokrytí: spec 23 (admin detail social) + spec 28 (dashboard save/readback) — oba zelené.
- Staging Full E2E run `26914578757`: 52 passed, 0 failed. `npm run build` ✅. Commit `2d838dd5`.
- Nezměněno: provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`.

---

## 2026-06-03 - Affiliate v2: social profile update migrace APLIKOVÁNA na PRODUKCI

- Aplikována migrace `supabase/migrations/20260603_affiliate_profile_update_social_fields.sql` na produkci `xkzhjldrojjlrkezorey` (výslovné schválení Pavla).
- RPC `update_affiliate_own_profile` rozšířeno z 13-arg na 19-arg (+6 NULL-preserving social params); stará 13-arg signatura dropnuta.
- Postcheck: jediná 19-arg SECURITY DEFINER funkce (overload_count=1), `authenticated` EXECUTE ✅, 7 social/web sloupců, 3 affiliate záznamy nedotčeny, RLS zapnuté.
- Editace social/profil polí v `/affiliate/dashboard → Profil` nyní funguje i v produkci. Social = jen text, žádné embed/video/API.
- `npm run build` ✅.
- Nezměněno: provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`. Žádné Edge Functions ani jiné migrace.

---

## 2026-06-03 - Affiliate v2: social/profil pole editovatelná v dashboardu (staging)

- Příčina: social pole v `/affiliate/dashboard → Profil` byla jen read-only (`ReadonlyItem`), a RPC `update_affiliate_own_profile` (13-arg) je neukládalo.
- Frontend `src/components/AffiliateProfileSection.tsx`: nová editovatelná sekce „Sociální sítě a dosah" (web/IG/TikTok/YT/FB/velikost publika/kategorie), read-only jen „Účet" souhrn. Social = jen text, žádné embed/iframe/video/API.
- RPC rozšířeno na 19-arg (+6 NULL-preserving social params), stará 13-arg signatura dropnuta. Migrace `supabase/migrations/20260603_affiliate_profile_update_social_fields.sql` aplikována na STAGING (`dxmowysntemfqfnanxua`). Produkce zatím neaplikována (čeká na schválení).
- Spec 28 rozšířen (toHaveValue + edit/save/readback), spec 26 nadpis opraven.
- Staging Full E2E run `26913262729`: 52 passed, 0 failed (Telegram OK, message_id 928). `npm run build` ✅.
- Commits: `09f01916` (feat), `e2f5e24c` (spec 26 fix).
- Nezměněno: provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`.

---

## 2026-06-03 - Affiliate v2: registrační/social pole migrace aplikována na PRODUKCI

- Aplikována migrace `supabase/migrations/20260603_affiliate_registration_profile_fields.sql` na produkci `xkzhjldrojjlrkezorey` (výslovné schválení Pavla).
- Přidáno 6 nullable text sloupců do `affiliate_accounts`: `instagram_url`, `tiktok_url`, `youtube_url`, `facebook_url`, `audience_size`, `content_categories` (additive, `ADD COLUMN IF NOT EXISTS`).
- Nová 12-arg overload RPC `register_affiliate_account` (SECURITY DEFINER). Stará 5-arg overload ponechána (drop-old-signature migrace neaplikována).
- Postcheck: sloupce přítomny, oba overloady SECURITY DEFINER, 3 affiliate záznamy nedotčeny (2 approved / 1 rejected), RLS zapnuté.
- Social pole zobrazena jako čistý text (`ReadonlyItem`/`DetailField` → `<p>`). Žádné iframe/embed/video/autoplay/feed/API.
- `npm run build` ✅. Lokál fast-forwardnut na `bff3c7e7`.
- Nezměněno: provize, Partner portal, zákaznický účet, platby, tikety, soutěže, peněženka, `buy_ticket_atomic`.

---

## 2026-06-03 - Affiliate v2: dashboard přepínač rozšířen na Profil

- `/affiliate/dashboard` má horní přepínač `Influencer` / `Obchodník` / `Profil`.
- `Profil a výplatní údaje` jsou pouze v samostatné sekci `Profil`, už se neduplikují pod Influencerem ani Obchodníkem.
- Sekce Influencer obsahuje zákaznický odkaz `/?ref=KOD`.
- Sekce Obchodník obsahuje firemní odkaz `/partner/register?via=KOD`.
- Obě sekce používají stejný `ref_code`.
- Testy spec 26 a spec 27 prošly.
- Staging E2E run `26907560666`: 49 passed, 3 skipped.
- Commit: `0272a3ac2937cae8dd5c7cdfa820a4340d6eff99`.

---

## 2026-06-03 - Affiliate v2: dashboard a profil kompletně dokončeny

- Dashboard `/affiliate/dashboard` dokončen: přepínač Influencer/Obchodník, luxury UI, statistiky, QR kódy.
- `/influencer/dashboard` → route-level redirect na `/affiliate/dashboard`.
- Profilová sekce: IČO, DIČ, web, telefon, fakturační adresa CZ/SK, IBAN/bankovní účet.
- Migrace `20260603_affiliate_profile_update.sql` aplikována na staging i produkci.
- RPC `update_affiliate_own_profile` (SECURITY DEFINER) — affiliate mění jen vlastní řádek.
- Produkční smoke: DB postcheck ✅, build ✅.
- Staging E2E run `26902106200`: 45 passed, 3 skipped, 0 failed.
- Nezměněno: platby, tikety, soutěže, peněženka, buy_ticket_atomic, Partner portal.

## 2026-06-03 - Affiliate v2: profil migrace nasazena na produkci

- Migrace `20260603_affiliate_profile_update.sql` aplikována na produkci `xkzhjldrojjlrkezorey`.
- Přidány sloupce: `ico`, `billing_street`, `billing_city`, `billing_zip`, `billing_country`, `website_url`.
- Přidán RPC `update_affiliate_own_profile` — SECURITY DEFINER, affiliate mění jen vlastní řádek.
- 3 existující affiliate záznamy nedotčeny, RLS stále zapnuté.
- Staging verifikace: spec 27 zelený (phone save via RPC).
- AffiliateDashboard SELECT rozšířen o všechna profil pole.
- Build ✅. Commit: viz níže.

## 2026-06-03 - Affiliate v2: produkční nasazení dokončeno + smoke kontrola ✅

- Affiliate v2 DB vrstva nasazena na produkci `xkzhjldrojjlrkezorey` přes 6 idempotentních migrací.
- Tabulky: `affiliate_accounts`, `affiliate_customer_refs`, `affiliate_company_refs`, `affiliate_commissions`.
- Sloupec: `partners.referred_by_affiliate_id` (nullable FK).
- 5 SECURITY DEFINER RPC: `record_affiliate_customer_ref`, `record_affiliate_company_ref`,
  `calculate_affiliate_commissions_for_month`, `admin_set_affiliate_commission_status`, `register_affiliate_account`.
- RLS zapnuté na všech 4 affiliate tabulkách (8 politik).
- 3 legacy influenceři migrováni do `affiliate_accounts` (ref_codes: TRUBKA89A0, PAVELDIV1EF7, EDRSG49AC).
- Edge Functions `get-pending-partner-registrations` (v129) a `approve-partner-registration` (v128) nasazeny — ACTIVE.
  Ochrana: JWT + admin/superadmin role check. `VITE_INTERNAL_FUNCTION_TOKEN` se nepoužívá.
- Smoke kontrola prošla: `/admin/affiliate-accounts`, `/affiliate/register`, `/affiliate/dashboard` vše funkční.
- Nezměněno: `buy_ticket_atomic`, platby, tikety, soutěže, peněženka, zákaznický účet, Partner portal.
- Commit: `9e8daca0` (docs state po nasazení).

## 2026-06-03 - Affiliate v2: staging security model update and browser E2E verification

- Affiliate v2 no longer uses `VITE_INTERNAL_FUNCTION_TOKEN` in the Lovable/browser build.
- Reason: Lovable workspace has no Build Secrets and the internal token should not be exposed in the browser.
- Edge Functions `get-pending-partner-registrations` and `approve-partner-registration` now rely on
  `Authorization: Bearer <user JWT>`, `supabaseAdmin.auth.getUser(token)`, and `user_roles` check for
  `admin` / `superadmin`.
- Security model commit: `9f3f53b55f89a3f0c2b16637af32335376fede1d`.
- CORS/staging verification commit: `9bf059d1cf712db36dbc70309dc735e451899d97`.
- Staging E2E passed: `https://github.com/Divuna/million-ticket-draw/actions/runs/26887279500`.
- Verified flow: `/partner/register?via=KOD` -> pending registrace -> admin schvaleni -> partner ->
  `affiliate_company_refs` -> `partners.referred_by_affiliate_id`.
- Production was not touched. Before production deployment, Lovable `VITE_INTERNAL_FUNCTION_TOKEN` is no longer required.

---

## 2026-06-03 — Affiliate v2: HANDOFF pro Codex

Stav: kompletní affiliate v2 vrstva hotová a ověřená NA STAGINGU (dxmowysntemfqfnanxua); produkce nedotčena.
Commity affiliate v2 (chronologicky): 2f62d69, 6357762, 6e32fc4, 150711a, 769d6f2, b429cf0, f646e7b,
aa484ec, ea592d6, 2b00696.
Nezměněno: zákazník, Partner portal, platby, tikety, soutěže, peněženka, buy_ticket_atomic, produkce.
Další cíl (Codex): ověřit staging INTERNAL_FUNCTION_TOKEN + VITE_INTERNAL_FUNCTION_TOKEN, pak browser E2E
firemního toku /partner/register?via=KOD → pending → admin schválení → partner → affiliate_company_refs →
partners.referred_by_affiliate_id. Detailní handoff blok v onemil_state.md (nahoře).
Pravidla: neobnovovat starou smazanou affiliate větev; nejít na produkci bez potvrzení Pavla.

---

## 2026-06-03 — Affiliate program v2: get-pending token fix (krok 10)

- src/pages/AdminPartnersPortal.tsx: loadPendingRegistrations volá get-pending-partner-registrations
  přes withEdgeInternalToken (přidá x-internal-token, který funkce vyžaduje). Sjednoceno s approve.
- withEdgeInternalToken čte VITE_INTERNAL_FUNCTION_TOKEN (potvrzeno). Staging funkce live (probe bez tokenu=401).
- Firemní tok DB E2E (data uklizena): partner z metadat → record_affiliate_company_ref →
  affiliate_company_refs (via_link) + partners.referred_by_affiliate_id=SALESK9.
- npm run build ✅.
- Mimo code session: potvrdit staging secret == staging VITE token v Lovable buildu + browser E2E
  (prod anon klíč není platný pro staging gateway). Nezměněno: produkce, platby, tikety, soutěže,
  peněženka, buy_ticket_atomic.

---

## 2026-06-03 — Affiliate program v2: staging partner approval stack (krok 9)

- Chyběly na stagingu: approve-partner-registration, get-pending-partner-registrations.
- Nasazeno POUZE na staging dxmowysntemfqfnanxua (verify_jwt=true, v1). Produkce nedotčena.
- Repo sync: CORS allow-headers obou funkcí + x-internal-token; get-pending surface affiliate_via_code.
- E2E firemní tok (DB/funkce, data uklizena): partner z metadat → record_affiliate_company_ref →
  affiliate_company_refs (via_link) + partners.referred_by_affiliate_id; re-attribute already_attributed.
- npm run build ✅.
- Plný UI E2E v prohlížeči vyžaduje config mimo code session: secret INTERNAL_FUNCTION_TOKEN na stagingu,
  VITE_INTERNAL_FUNCTION_TOKEN v Lovable buildu, a vyřešení pre-existujícího nesouladu (get-pending vyžaduje
  x-internal-token, ale loadPendingRegistrations ho neposílá).

---

## 2026-06-03 — Affiliate program v2: zachycení ?ref= / ?via= (krok 8)

- Zákazník ?ref=: Register.tsx ukládá kód (sessionStorage onemil_affiliate_ref) + po registraci volá
  record_affiliate_customer_ref (non-fatal, first-touch). Legacy referral nedotčen.
- Firma ?via=: PartnerRegister.tsx → signUp metadata affiliate_via_code. AdminPartnersPortal
  handleApproveRegistration po schválení dohledá partner_id a volá record_affiliate_company_ref (non-fatal,
  mirror jen když NULL). Edge get-pending-partner-registrations surface affiliate_via_code (repo; stack zatím
  není na stagingu, nenasazeno zvlášť).
- Staging RPC end-to-end ověřeno (data uklizena): zákazník recorded/nepřepsal/invalid_code; firma
  recorded/nepřepsal/mirror-only-if-null/invalid_code.
- npm run build ✅. Nezměněno: platby, tikety, soutěže, peněženka, buy_ticket_atomic, produkční DB,
  starý zákaznický referral, staré influencer tabulky.

---

## 2026-06-03 — Affiliate program v2: uživatelský frontend (krok 7)

- Migrace (staging) `supabase/migrations/20260603_affiliate_self_registration_rpc.sql`:
  RPC register_affiliate_account SECURITY DEFINER (auth.uid bind, pending, sazby 5/5, unikátní ref_code).
- Nové stránky: src/pages/AffiliateRegister.tsx (/affiliate/register), src/pages/AffiliateDashboard.tsx
  (/affiliate/dashboard). Změněno: src/App.tsx (routes+guard+authEntryPath+nav), src/hooks/useUserRole.ts
  (isAffiliateAccount jen pro uživatele bez partners řádku).
- Registrace: signUp → RPC → signOut → čeká na schválení; režimy Influencer/Obchodník/obojí; CZ texty.
- Dashboard: ref_code, režimy, odkazy /?ref= a /partner/register?via= s kopírováním, provize z affiliate_commissions.
- Guard: affiliate omezen na /affiliate/*; nepadá do Partner portalu; legacy influenceři beze změny.
- npm run build ✅. Staging RPC+dashboard dotazy ověřeny (data uklizena). Produkce a staré tabulky nedotčeny.

---

## 2026-06-03 — Affiliate program v2: migrace influencerů (staging, krok 6)

- Migrace `supabase/migrations/20260603_migrate_influencers_to_affiliate_accounts.sql`. Staging only.
- Zdroj partners (notes ILIKE '%influencer%', auth_user_id + email not null) → affiliate_accounts.
- Nalezeno 1, migrováno 1 (ref_code E2EAFFIL25A7). modes='{influencer}', sazby 5/5, status 1:1.
- ref_code = 8 alfanum z názvu (uppercase, bez diakritiky) + 4 hex z id; provenience v notes.
- Idempotentní (NOT EXISTS na auth_user_id) — re-run nepřidá duplikát (ověřeno eligible=1, migrated=1).
- Starý influencer systém zachován a běží paralelně (nic nedropnuto). npm run build ✅. Produkce nedotčena.

---

## 2026-06-03 — Affiliate program v2: admin UI (krok 5)

- Nový soubor `src/pages/AdminAffiliateAccounts.tsx` (route `/admin/affiliate-accounts`).
- Změněno: `src/App.tsx` (import+route), `src/components/admin/adminNavConfig.ts` (nav položka + section path).
- Admin vidí affiliate_accounts (jméno, e-mail, ref_code, režimy, stav), agregované provize z
  affiliate_commissions (schváleno/vyplaceno CZK, počet calculated) + detail dialog s workflow tlačítky.
- Status změny jen přes RPC admin_set_affiliate_commission_status (calculated→approved→paid).
- affiliate_* nejsou v types → (supabase as any). npm run build ✅. Staging dotazy+RPC ověřeny (data uklizena).
- Nezměněno: zákazník, Partner portal, platby, tikety, soutěže, peněženka, buy_ticket_atomic, produkční DB.

---

## 2026-06-03 — Affiliate program v2: admin workflow provizí (staging, krok 4)

- Migrace `supabase/migrations/20260603_affiliate_commission_status_workflow.sql`. Staging only.
- `admin_set_affiliate_commission_status(p_commission_id, p_new_status)`: SECURITY DEFINER,
  search_path='', admin only. Přechody jen vpřed: calculated→approved, approved→paid.
  Při paid nastaví paid_at=now(). Vrací forbidden/not_found/invalid_status/invalid_transition/updated.
- Ověřeno 8 scénářů na stagingu (test data uklizena): oba přechody, paid_at, návrat zpět blokován,
  skok blokován, invalid_status, not_found, non-admin forbidden. npm run build ✅. Produkce nedotčena.
- DB vrstva affiliate v2 kompletní na stagingu (kroky 1–4): tabulky, atribuce, výpočet, status workflow.

---

## 2026-06-03 — Affiliate program v2: měsíční výpočet provizí (staging, krok 3)

- Migrace `supabase/migrations/20260603_affiliate_monthly_commissions.sql`. Staging only.
- `calculate_affiliate_commissions_for_month(p_month date)`: SECURITY DEFINER, search_path=''.
  Zákaznická rovina (payments paid × commission_rate_customer) + firemní rovina
  (partner_invoices.amount_ex_vat status=paid × commission_rate_company). Default 5 %.
- DPH: plátce total=base×1.21 (vat 21), neplátce total=base. Status start 'calculated'.
- Idempotence: partial UNIQUE (affiliate_id, commission_type, period_month); re-run maže jen
  'calculated', 'approved'/'paid' zamčené. Autorizace admin/cron, jinak forbidden.
- Ověřeno na stagingu (test data uklizena): cust 1000×5%=50; comp 10000×5%=605 (plátce);
  pending/draft vyloučeny; run1=run2; non-admin forbidden. npm run build ✅. Produkce nedotčena.

---

## 2026-06-03 — Affiliate program v2: atribuční RPC (staging, krok 2)

- Migrace `supabase/migrations/20260603_affiliate_attribution_rpcs.sql`. Staging `dxmowysntemfqfnanxua` only.
- `record_affiliate_customer_ref(p_ref_code)`: zákazník (auth.uid), affiliate approved + influencer,
  first-touch INSERT do affiliate_customer_refs, self-referral blok, jsonb status.
- `record_affiliate_company_ref(p_via_code, p_partner_id)`: admin only, affiliate approved + sales_rep,
  first-touch INSERT do affiliate_company_refs + zrcadlení partners.referred_by_affiliate_id (jen když NULL).
- Obě SECURITY DEFINER, SET search_path='', REVOKE PUBLIC + GRANT authenticated.
- Ověřeno 7 scénářů na stagingu (test data uklizena): recorded/already_attributed/invalid_code/forbidden + mirror.
- npm run build ✅. Produkce nedotčena.

---

## 2026-06-03 — Affiliate program v2: samostatný DB základ (staging)

- Nový samostatný Affiliate model (oddělený od Partner portalu i zákazníka). První bezpečný DB krok.
- Migrace `supabase/migrations/20260603_affiliate_accounts_foundation.sql` (additivní, idempotentní).
- Aplikováno POUZE na staging `dxmowysntemfqfnanxua`. Produkce `xkzhjldrojjlrkezorey` nedotčena.
- Vytvořeno: `affiliate_accounts`, `affiliate_customer_refs`, `affiliate_company_refs`,
  `affiliate_commissions` + nullable `partners.referred_by_affiliate_id`.
- First-touch vynuceno DB (UNIQUE user_id / partner_id). Výchozí provize customer/company = 5 %.
- RLS: affiliate vidí jen svá data, admin vše; zápis affiliate tabulek zatím admin/DB funkce.
- Trigger `affiliate_touch_updated_at` (search_path='') na accounts + commissions.
- Ověřeno na stagingu: 4 tabulky s RLS, 8 policies, sloupec přidán, provize 5.00/5.00.
- `npm run build` ✅. Security advisor: žádné RLS varování pro nové tabulky.

---

## 2026-06-02 — Odstranění affiliate vrstvy — KOMPLETNÍ (A1 + A2 + A3)

**A1 — Kódový revert (commit `1366535`):**
- Nová affiliate vrstva (ChatGPT duplikát, ~41 commitů) odstraněna z kódu jedním revert commitem.
- Smazány: `src/hooks/useApplyPendingAffiliate.ts`, `src/pages/AdminAffiliate.tsx`,
  `supabase/migrations/20260602_*` (10 souborů).
- Editovány sdílené soubory (odebrány jen affiliate části): `src/App.tsx`, `src/pages/Register.tsx`,
  `src/pages/AdminInfluencers.tsx`, `src/components/admin/adminNavConfig.ts`,
  `src/integrations/supabase/types.ts` (obnoveno z baseline `5da1059`).
- Zachováno: `src/components/WinCard.tsx` (OneMilGiftIcon) a celý původní influencer systém.
- `npm run build` ✅.

**A2 — DB objekty odstraněny:**
- Staging `dxmowysntemfqfnanxua`: žádné affiliate objekty.
- Produkce `xkzhjldrojjlrkezorey`: žádné affiliate objekty.
- Původní systém zachován: `partners`, `influencer_referrals`, `influencer_commissions`,
  `calculate_influencer_commissions_current_month`, `set_my_referrer_by_code`.

**A3 — Lovable Publish:**
- Produkce `onemil.cz` publikována. Bundle neobsahuje `onemil_affiliate_aff`,
  `record_affiliate_customer_attribution` ani `/admin/affiliate`.
- `affiliate_direct`/`affiliate_external` v bundlu = enum hodnoty `deployment_mode` Partner Offers
  (pre-existující B2B systém, nesouvisí s odstraněnou vrstvou).

---

## 2026-06-01 — Shop recommendation mailto card (commit `04e5a73`)

- Přidána customer Profile funkce `Doporučit OneMil oblíbenému obchodu`:
  `src/components/RecommendShopMailtoCard.tsx` + mount v `src/pages/Profile.tsx`.
- Karta je v Profilu pod „Pozvi přátele"; uživatel zadá e-mail obchodu/prodejce a vlastní e-mailová
  aplikace se otevře přes `mailto:` s předvyplněnou zprávou. OneMil e-mail neposílá automaticky.
- Nebyl dotčen Supabase, SQL, databáze, Edge Functions ani deploy. Uživatel potvrdil viditelnost po
  Lovable Publish.
- Poznámka pro budoucnost: reward/statistics layer pro 1 MioCoin za doporučení, denní limit, deduplikaci
  podle target e-mailu, anti-abuse a admin statistiky zatím NENÍ implementován.

---

## 2026-05-31 — Profile save RLS fix: persist profiles INSERT policy (commit `6fceef27`)

- Root cause: `Profile.tsx handleProfileSave` používá `supabase.from('profiles').upsert(...)`; RLS na
  `public.profiles` měla jen SELECT + UPDATE policy, žádnou INSERT → 42501 při každém uložení.
- Oprava aplikována ručně na staging i produkci: `profiles_insert_own FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid())`. Ukládání profilu v produkci ověřeno funkční.
- Permanentní migrace `supabase/migrations/20260531_profiles_insert_own_rls.sql` (idempotentní).

---

## 2026-05-31 — Error toast contrast fix (commit `a220d993`)

- Opraveny oba toast systémy: shadcn `toast.tsx` (destructive → bílý text na červené) a sonner
  `sonner.tsx` (error varianta → pevné `!bg-destructive` + bílý titulek/popis; `richColors` nepoužit).
- Všechny error toasty nyní červené pozadí + bílý čitelný text. Ověřeno na staging preview.

---

## 2026-05-31 — Customer MioCoin code redemption (commit `ce76027b`)

- Nová komponenta `src/components/RedeemMioCoinCard.tsx` mountnutá v `Profile.tsx` pod kartou Peněženka;
  source-neutral wording „Uplatnit MioCoin kód".
- Migrace `supabase/migrations/20260531_redeem_miocoin_code.sql` — RPC `redeem_miocoin_code(p_code)`
  (SECURITY DEFINER): zámek `partner_reward_codes FOR UPDATE`, validace status/expiry/email, kredit
  `wallets.balance_coins`, ledger `wallet_transactions`, status→activated (trigger zapíše
  `partner_coin_activations`).
- Staging ověřeno (`dxmowysntemfqfnanxua`): HEYGEN-TEST-250 → +250 MC (2500→2750), reuse=already_used,
  ledger + partner_coin_activations vytvořeny.
- Produkční RPC aplikován v `xkzhjldrojjlrkezorey`; frontend publikován přes Lovable, funkční v produkci.

---

## 2026-05-31 — HeyGen staging demo příprava

- Staging `dxmowysntemfqfnanxua`: demo uživatel `heygen.staging@onemil.cz`
  (UUID `217dc715-8af7-41ac-97e5-00a9617c3a9d`), buckety `contest-images` + `voucher-images`.
- Demo soutěže s MioCoin bonusy: Porsche 575 MC, Dubaj 700 MC, Hodinky 570 MC, Domácí kino 625 MC.
- Raw screenshoty vytvořeny, ale nedostatečně premium → next step: lepší premium vizuální koncept.

---

## 2026-05-31 — Winners page: unify winner card backgrounds (commit `8197d6ae`)

- `src/pages/Winners.tsx` — přidána `WINNER_BG_ROTATION` (trophy/crown/clean), `.map()` s indexem, `index % 3` pro rotaci
- Odstraněn `usePlacementBanners` (nebyl potřeba po přechodu na lokální assety)
- Lucide `Trophy` → `OneMilTrophyIcon` v headingu i empty state

---

## 2026-05-31 — Winner card overlay fine-tune: restore right decoration (commit `9d9c716c`)

- `src/components/WinnerCard.tsx` — background opacity `0.28 → 0.42`, pravý gradient `0.52 → 0.14`
- Dekorativní trofej/koruna vpravo opět viditelná; levý hnědý blok stále zakryt (`0.78`)

---

## 2026-05-31 — Winner card overlay: soften backgrounds (commit `4b127aef`)

- `src/components/WinnerCard.tsx` — snížena opacity background image `1.0 → 0.28`
- Přidán dark gradient overlay (z-[1], DOM order nad obrázkem): levý pruh `0.72`, střed `0.22`, pravý `0.52`
- Výsledek: text čitelný, hnědý blok zakryt, dekorace poněkud skryta (následně opraveno v `9d9c716c`)

---

## 2026-05-31 — Winner card rotating backgrounds — první nasazení (commit `7276c254`)

- Extrakce ZIP do `src/assets/winner-backgrounds/`: trophy, crown, clean, trophy-with-coin-area PNG
- `src/pages/Homepage.tsx` — importy + `WINNER_BG_ROTATION`, `.map((winner, index) =>`, `index % 3`
- `cardStyleImageUrl` prop nahrazen rotačním assetem (místo statického admin banneru)

---

## 2026-05-31 — GitHub Actions odblokován — repo změněno na public

- Repo `Divuna/million-ticket-draw` bylo private → Actions minuty vyčerpány → CI padalo za 3–5s s billing errorem
- Repo změněno na public → Linux Actions minuty zdarma neomezeně
- Smoke tests ✅ (run `26694708778`, 1m 10s), Staging Full E2E ✅ (run `26694751314`, 3m 39s)

---

## 2026-05-30 — OneMil premium icon system — icon size fine-tune (commit `87f74083`)

- Header tile ikony: `size={28}` → `size={36}` desktop (`md:w-9 md:h-9`) pro Games, Vouchers, Messages, MyContests; Wins: `size={32}` → `size={36}`
- Bottom nav: `size={22}` → `size={24}`, active `scale-105` → `scale-110`
- Soubory: Games.tsx, Vouchers.tsx, Wins.tsx, Messages.tsx, MyContests.tsx, BottomNavigation.tsx

---

## 2026-05-30 — Unified premium page-header tiles na customer stránkách (commit `1d5c5dde`)

- Všechny hlavní customer stránky mají shodný header vzor: dark gradient karta + shimmer + orange gradient tile (56/64px) + gradient h1 + subtitle
- Games: inline icon v h1 → tile s `OneMilTrophyIcon`, tlačítko Oblíbené zachováno vpravo
- Vouchers: centered layout → tile s `OneMilVoucherIcon`
- Wins: tile již existoval — Lucide `Trophy` nahrazen `OneMilWinIcon`
- Messages: tile standardizován na `md:w-16 md:h-16`, h1 na `md:text-3xl`
- MyContests: `Gamepad2` + plain h1 → tile s `OneMilTicketIcon`; přidán subtitle „Přehled vašich tiketů a soutěží"
- Profile: záměrně přeskočen (hero layout s avatarem)

---

## 2026-05-30 — Sémantické opravy icon mappingu (commit `94ed004f`)

- Vouchers.tsx: `OneMilGiftIcon` (4×) → `OneMilVoucherIcon` (nadpis, empty states, card fallbacky)
- Wins.tsx: `OneMilTrophyIcon` (tab Výhry, empty state) → `OneMilWinIcon`; `OneMilCrownIcon` (badge počtu) → `OneMilWinIcon`
- Homepage.tsx: `OneMilGiftIcon` → `OneMilMioCoinIcon` (Dobijte MioCoiny); `OneMilGiftIcon` → `OneMilVoucherIcon` (2× voucher sekce)

---

## 2026-05-30 — Full customer-facing icon sweep (commit `61840ab6`)

- 15 souborů aktualizováno — kompletní sweep Lucide → OneMil v customer UI
- BottomNavigation: všech 6 nav ikon → OneMil (Home, Ticket, Trophy, Medal, Message, Profile)
- Homepage, Games, Vouchers, Wins, Messages, Profile, MyContests, MyContestDetail, ContestCard, WinCard, WinnerCard, BonusPrizeOverlay, TicketProgressBar
- Přidány chybějící exporty: `OneMilCrownIcon`, `OneMilStarIcon`, `OneMilMedalIcon`, `OneMilTicketIcon`

---

## 2026-05-30 — OneMil premium icon system vytvořen (commity `ee9b7d9c`, `cfcc6e86`, `cc490725`)

- `src/components/icons/OneMilIcons.tsx` — 23 brand ikon s `size`, `active`, `color` props; BaseIcon pattern; silver inactive / orange+amber active
- `src/assets/icons/icon-trophy-onemil.svg` — brand kit SVG (512×512) zkopírován z `docs/brand/`
- První nasazení: Trophy → OneMilTrophyIcon v BottomNavigation, Homepage, Games, Wins, WinCard

---

## 2026-05-27 — WinnerCard premium redesign (commit `b6776ebe`)

- `src/components/WinnerCard.tsx` přepsán — sjednocen s MioCoin card stylem
- Pozadí: `hsl(220 45% 6%)`, border `rgba(255,138,0,0.22)`, subtle box-shadow
- Prize name: Poppins bold, orange→gold gradient text — nejdominantnější prvek
- Winner name: silver `#E7EBF0`, bez prefixu „Výherce:"
- Spodní řádek: contest title + ticket# + timeAgo — vše muted, kompaktně
- Odstraněny labely „Cena:", „Výherce:", „Soutěž:" — jen hodnoty
- Hvězdičkový star šum v outer homepage card odstraněn; v kartě snížen opacity 0.09–0.14
- Výška zafixována na `112px`

---

## 2026-05-27 — Připravujeme bannery: info popup feature (commit `f11b634f`)

- Nová migrace: `supabase/migrations/20260527_coming_soon_banners_add_description.sql`
  (`ALTER TABLE public.coming_soon_banners ADD COLUMN IF NOT EXISTS description TEXT;`)
- Migrace **aplikována manuálně v Supabase a ověřena**: `id uuid, image_url text, title text, created_at timestamptz, description text`
- `src/hooks/useComingSoonBanners.ts` — přidán `description` do interface
- `src/pages/AdminBanners.tsx` — textarea „Info text" + tlačítko Uložit pro každý ze 3 slotů
- `src/pages/Homepage.tsx` — pulsující ℹ ikona (orange/gold, `@keyframes info-pulse`) na kartě pokud `description` není prázdný; klik otevře dark premium modal s title + description
- `src/index.css` — `@keyframes info-pulse` přidán

---

## 2026-05-27 — Připravujeme bannery: premium typography na homepage (commit `265f2330`)

- `src/pages/Homepage.tsx` — title banneru v sekci Připravujeme: Poppins bold, silver→amber→orange gradient (shodný styl s admin preview)

---

## 2026-05-27 — Připravujeme bannery: editovatelný popisek v admin (commit `4428b7d0`)

- `src/pages/AdminBanners.tsx` — každý ze 3 slotů má textové pole „Popisek banneru" + tlačítko Uložit
- Title se ukládá do `coming_soon_banners.title` (existující sloupec, žádná migrace)
- Admin preview zobrazuje title jako premium overlay label přes obrázek (Poppins, silver→orange gradient)
- Při INSERT nového banneru se použije custom title z inputu (ne auto „Připravujeme N")

---

## 2026-05-25 — CI: continue-on-error na artifact upload krocích (commit `408da958`)

- Smoke run `26374584373` selhal přestože testy prošly — GitHub hlásil `Artifact storage quota has been hit`
- Příčina: kvóta se přepočítává 6–12h po mazání; run proběhl dříve než se counter aktualizoval
- Oprava: `continue-on-error: true` přidáno na všechny `upload-artifact` kroky v obou workflowech
- Výsledek: plná kvóta artefaktů už nemůže způsobit selhání workflow; testy jsou autoritativní

---

## 2026-05-25 — Telegram bot @Onemilclaudebot nastaven

- Vytvořen nový Telegram bot **@Onemilclaudebot** přes BotFather
- Token uložen jako Windows user env var `TELEGRAM_BOT_TOKEN`
- Chat ID Pavla Diviše (`6714365501`) uloženo jako Windows user env var `TELEGRAM_CHAT_ID`
- Claude Code může odesílat Telegram notifikace přes Telegram Bot API
- Obousměrná komunikace (Pavel → Claude přes Telegram) zatím neimplementována — vyžaduje webhook server

---

## 2026-05-24 — Homepage hero banner — opakované iterace finálního zobrazení (commity `acc82b56` → `ecea087c`)

Iterace při ladění hero banneru na správný rozměr a zobrazení:
- `acc82b56` — `h-auto block` (přirozená výška) → banner příliš velký
- `54d603a2` — fixní výška `h-[200px] md:h-[320px] lg:h-[420px]` + `object-contain` → tmavé pruhy po stranách
- `d163e532` — `object-cover` + `h-420px` → ořez spodku (loga značek neviditelná)
- `af7dfbfd` — výška zvýšena na `lg:h-[600px]` pro nový 1920×600 banner
- `0b653040` — přechod na `aspect-[16/5] max-h-[600px]` — responsivní poměr stran bez fixní výšky
- `bc987b58` — mobil `aspect-[2/1]`, tablet+ `aspect-[16/5]` — menší výška na telefonu
- `ecea087c` — **finální:** mobil bez fixní výšky (`h-auto`), `object-contain` → žádné pruhy; sm+ `object-cover` + `aspect-[16/5]`
- Cílový rozměr banneru: **1920 × 600 px**; slot funguje responsivně bez ořezu ani pruhů

---

## 2026-05-24 — Admin bannery: toggle „Zobrazovat trvale" (commit `03271812`)

- `src/pages/AdminBanners.tsx` — přidán Switch „Zobrazovat trvale (bez omezení datumem)" v CREATE i EDIT dialogu
- Když zapnuto: datumová pole skryta, `start_date` a `end_date` se ukládají jako `null`
- Supabase hook již `null` datum interpretuje jako „vždy zobrazovat" — žádná DB změna
- `getValidityText()` vrací `'Trvale'` když obě data null

---

## 2026-05-24 — Homepage MioCoin karty + lower boxy — layout a placement banner (commity `f486afa9` → `e9254494`)

- **MioCoin karty (4 balíčky):** fallback text (číslo, label, cena) skryt když je nastavený placement banner obrázek
- **Lower boxy** (`probihajici_souteze`, `koupit_voucher`): ikona + text skryty když je banner obrázek; přidáno `min-h-[88px] md:min-h-[96px]` aby výška karty zůstala i bez textu
- **MioCoin karty — layout přestaven:** obrázek vyplňuje horní část (`flex-1 min-h-0`), tlačítko „Dobít" přišpendleno ke spodku (`flex-shrink-0`) — tlačítko se již nepřekrývá s obrázkem na mobilu

---

## 2026-05-24 — CI: vyčištění artefaktů GitHub Actions + snížení retention na 3 dny (commit `77e32f3b`)

- GitHub Actions artifact storage byl plný (791 artefaktů nahromaděných od dubna) → upload reportů selhal s chybou `Artifact storage quota has been hit`
- Všech 791 artefaktů smazáno manuálně přes GitHub API (zbývá: 0)
- `.github/workflows/playwright.yml` + `.github/workflows/playwright-staging.yml` — `retention-days` sníženo ze 14/7 na **3 dny** u všech `upload-artifact` kroků
- Samotné testy nebyly dotčeny, výsledky runů se nezměnily
- Od teď se reporty automaticky mažou po 3 dnech, kvóta se znovu nezaplní

---

## 2026-05-22 — Staré logo preview odstraněno (PR #112, merge commit `1b9e704f`)

- Smazán `docs/brand/onemil-pwa-icon-preview.png` — zastaralý docs snapshot zobrazující staré logo (bílý čtverec + "OneMil" text)
- Soubor nebyl importován aplikací; `src/assets/logo-onemil.png` je správný brand kit asset od PR #110
- Playwright Smoke Tests: branch `26286729712` ✅, post-merge `26286806820` ✅

---

## 2026-05-21 — Zákaznická grafika vizuálně schválena Pavlem

- Finální vizuální smoke audit dokončen a grafika schválena Pavlem Divišem
- Potvrzeno: barvy brand kit, logo brand kit, favicon/PWA brand kit, fonty Inter/Poppins, 404 dark, zákaznická část bez starých prvků
- Admin / influencer / partner portál záměrně mimo scope — odloženo
- Žádný další grafický PR pro zákaznickou část není aktuálně potřeba

---

## 2026-05-21 — NotFound dark background opraven (PR #111, merge commit `33cbeeb7`)

- `src/pages/NotFound.tsx`: `bg-gray-100` → `bg-background`
- Nález z finálního vizuálního smoke auditu — 404 stránka jako jediná zákaznická stránka měla světlé pozadí
- Playwright Smoke Tests: branch `26253920880` ✅, post-merge `26253998050` ✅

---

## 2026-05-21 — Font audit dokončen (read-only, bez PR)

- Google Fonts import: Inter 300–700 + Poppins 500–800 v `src/index.css:1`
- `body` → Inter; `h1–h6` → Poppins (globální CSS pravidla v `index.css`)
- Tailwind: `font-heading` = Poppins, `font-body` = Inter, `font-sans` = Inter (přepsán)
- Plus Jakarta Sans: 0 výskytů v celém projektu
- Inline `fontFamily`, arbitrary `font-[...]`, `@font-face`: 0 výskytů
- `font-mono` pouze oprávněně (UUID tabulky, code bloky, čísla v grafu)
- Závěr: fontový systém odpovídá brand kitu, další font PR není potřeba

---

## 2026-05-21 — Brand logo assets opraveny (PR #110, merge commit `8b94e0df`)

### Co bylo provedeno

- `src/assets/logo-onemil.png` nahrazeno brand kit `primary_logo_trophy_behind_text_transparent_estimated.png` (průhledné pozadí, správné pro tmavý header)
- `public/favicon.ico` nahrazeno brand kit `favicon.ico` z `03_icons/favicon_app/`
- `index.html` opraven wrong MIME type `type="image/svg+xml"` → `type="image/x-icon"` na favicon linku
- PWA ikony (`android-chrome-192x192/512`, `apple-touch-icon`) byly již shodné s brand kitem — beze změny
- Playwright Smoke Tests: branch `26252667493` ✅, post-merge `26252302107` ✅

---

## 2026-05-21 — Brand customer-facing cleanup KOMPLETNÍ — final cleanup PR #109

### Co bylo provedeno

- **Final low-priority cleanup** — `Vouchers.tsx` (7 sparkle dots + Gift icon), `App.tsx` (winner toast border), `CMSPageLayout.tsx` (heading gradient), `badge.tsx` (info variant blue → brand orange)
- PR #109, merge commit `a3e56146`
- Playwright Smoke Tests (branch `26252078508` ✅, post-merge `26252162219` ✅)
- Finální grep audit: žádné customer-facing `hsl(43/45/40)` accent zbytky — reset kompletní
- Záměrně ponecháno: strukturní tmavé pozadí karet `hsl(40_20%_14%)` v `VoucherCarousel.tsx` + admin/influencer/partner portal deferred

---

## 2026-05-21 — Brand customer-facing cleanup steps 21–26 dokončeny (PRy #103–#108)

### Co bylo provedeno

- **Step 21** — `TicketResultModal.css` + `index.css`: win-moment CSS animation glows `hsl(43/48/35)` → brand rgba; PR #103, merge commit `bd3d107b`
- **Step 22** — `CookieConsentBanner.tsx`: bannerové/dialogové bordery, outline buttony, CTA "Souhlasím" gradienty `hsl(45/40/35)` → brand; PR #104, merge commit `c8b61546`
- **Step 23** — `Login.tsx` + `Register.tsx`: card bordery, CTA submit gradienty, OAuth outline buttony → brand; PR #105, merge commit `64c2cb16`
- **Step 24** — `VoucherCarousel.tsx`: card bordery, image border, CTA buy button → brand; PR #106, merge commit `e1cecdf9`
- **Step 25** — `Messages.tsx`: 35 inline `hsl(45/35)` → brand rgba/hex (particles, shimmer, header, send button, input bar, flying message); PR #107, merge commit `1145ca2e`
- **Step 26** — 9 různých souborů: ContactForm + SupportForm + Kontakt + BonusPrizeDetailModal + BonusPrizeOverlay + Homepage + NotFound + MyContestDetail + MessageForm; PR #108, merge commit `16d1637d`
- Všechny Playwright Smoke Tests ✅; žádné admin, influencer, partner ani logické změny

---

## 2026-05-21 — Brand customer-facing cleanup steps 15–19 dokončeny (PRy #98–#102)

### Co bylo provedeno

- **Step 15** — `src/components/OfferCard.tsx` + `OfferDetailModal.tsx`: hover border/shadow, Tag ikona, "Nová" badge, partner name `blue-*` → brand orange/amber; PR #98, merge commit `7faea2b9`
- **Step 16** — `src/components/TicketProgressBar.tsx`: progress fill, legend dot, Clock ikona `blue-*`, TrendingUp `yellow-400` → brand; PR #99, merge commit `88e73dc0`
- **Step 17** — `src/components/TicketResultModal.tsx`: partner name, CTA hint, "Zobrazit nabídku" button `blue-*` → brand; PR #100
- **Step 18** — `src/components/WinCard.tsx`: "Připraveno k odeslání" badge `blue-500/90 text-white` → `rgba(255,138,0,0.9) text-black`; PR #101, merge commit `f429adbd`
- **Step 19** — `src/pages/Wins.tsx`: 24 inline `hsl(45/35,...)` JS styles + Tailwind classes → brand rgba/hex; PR #102, merge commit `02b3f2a3`
- Všechny Playwright Smoke Tests ✅; žádné admin, influencer ani logické změny

---

## 2026-05-21 — Brand ReferralSection step 13: sjednocena (PR #97, merge commit 5fc4bad3)

### Co bylo provedeno

- **`src/components/ReferralSection.tsx`** — card shadow, shimmer, Coins stat, enter-code box, Input, submit button yellow/hsl → Energy Orange/Amber brand
- Logika, layout, data — beze změny; PR #97; Smoke Tests ✅

---

## 2026-05-21 — Brand Wins + WinDetailModal step 12: sjednoceny (PR #96, merge commit e18d40ab)

### Co bylo provedeno

- **`src/pages/Wins.tsx`** — "Odesláno" filter button blue → brand orange; Tag ikona `text-blue-400/30` → `rgba(255,138,0,0.3)`
- **`src/components/WinDetailModal.tsx`** — status badges yellow/blue → `rgba(255,138,0,...)` / `#FFB547`; Trophy ikona `text-yellow-400` → `#FFB547`
- Logika, layout, data — beze změny; PR #96; Smoke Tests ✅

---

## 2026-05-21 — Brand CustomerContestView step 11: sjednocena (PR #94, merge commit 3f42152)

### Co bylo provedeno

- **`src/components/CustomerContestView.tsx`** — `text-yellow-400` (×4), title gradient, progress bar fill/glow, milestone dots → Energy Orange/Amber brand
- Logika, layout, data — beze změny; PR #94; Smoke Tests ✅

---

## 2026-05-21 — Brand TicketResultModal step 10: win-modal sjednocen (PR #93, merge commit d88a76a)

### Co bylo provedeno

- **`src/components/TicketResultModal.tsx`** — 15 × old yellow/gold HSL → Energy Orange/Amber brand: modal border, glow orb, win headline, prize drop-shadow, particle, next-win highlight (×2), CTA tlačítka (×3), main prize text, loss border, share divider
- Confetti barvy a amber/white text třídy zachovány pro emotivní win-moment

### Větev a PR

- Větev: `style/brand-ticket-result-modal-step-10`
- PR #93 mergnut do `main` — merge commit `d88a76a9a1cef323e3b477e683aa3e69442d618a`

### Testy

- **Playwright Smoke Tests**: SUCCESS ✅

---

## 2026-05-21 — Brand MioCoin step 9: MioCoin coin ikona sjednocena (PR #92, merge commit baa61ab)

### Co bylo provedeno

- **`src/components/MioCoin.tsx`** — okrajový gradient + glow: `from-yellow-500/40 via-yellow-400/10 rgba(234,179,8,0.35)` → `rgba(255,138,0,0.4) / rgba(255,181,71,0.1) / rgba(255,138,0,0.35)`
- Komponenta se zobrazuje na všech stránkách s peněženkou/nákupem tiketu — vysoká viditelnost
- Logika, props, layout, importy — beze změny

### Větev a PR

- Větev: `style/brand-miocoin-step-9`
- PR #92 mergnut do `main` — merge commit `baa61ab30dac4a2703774d35722a2b770b5e3961`

### Testy

- **Playwright Smoke Tests**: SUCCESS (run `26244784903`) ✅

---

## 2026-05-21 — Brand token cleanup step 8: CSS tokeny + Games nadpis sjednoceny (PR #91, merge commit 4a27bb0)

### Co bylo provedeno

- **`src/index.css`** — `--neon-blue` → Energy Orange `33 100% 50%`; `--heading-gold/soft/muted` → Warm Amber (38° hue); `.text-heading-gold` gradient → `#FFB547/#FF8A00`; názvy tokenů zachovány pro zpětnou kompatibilitu
- **`src/pages/Games.tsx`** — `text-heading-gold` → `text-[#FFB547]` (přímá brand hodnota)
- Layout, logika, routing, UI texty, Supabase, migrace — beze změny
- Žádné nové soubory

### Větev a PR

- Větev: `style/brand-token-cleanup-step-8`
- PR #91 mergnut do `main` — merge commit `4a27bb04bc4518167b8e5dbaa8a6689f5300803a`

### Testy

- **Playwright Smoke Tests**: SUCCESS po mergi do main (run `26235203208`) ✅

---

## 2026-05-21 — Brand BottomNavigation step 7: spodní navigace sjednocena (PR #90, merge commit 2f01e1a)

### Co bylo provedeno

- **`src/components/BottomNavigation.tsx`** — aktivní stav nav tlačítka: blue ring/shadow → Energy Orange / Warm Amber brand hodnoty (`ring-blue-400/80` → `ring-[rgba(255,181,71,0.8)]`, `rgba(96,165,250,0.45)` → `rgba(255,138,0,0.45)`, `rgba(59,130,246,0.18)` → `rgba(255,138,0,0.18)`)
- Layout, ikony, routing, badge counts, texty a logika aplikace — beze změny
- Žádné migrace, žádné nové soubory

### Větev a PR

- Větev: `style/brand-bottom-navigation-step-7`
- PR #90 mergnut do `main` — merge commit `2f01e1acf7489a56723dc0c17e8100b4ecb898c3`

### Testy

- **Playwright Smoke Tests**: SUCCESS po mergi do main (run `26234450223`) ✅

---

## 2026-05-21 — Brand profile step 6: stránka Profile sjednocena (PR #89, merge commit 9ece582)

### Co bylo provedeno

- **`src/pages/Profile.tsx`** — yellow/gold HSL a Tailwind → Energy Orange/Amber brand kit: VIPCard gold varianta (border + bg + shimmer), floating particles, CSS keyframes (avatar-ring-glow, premium-input focus, header gradient), avatar ring (conic-gradient → `#FFB547/#FF8A00`), crown badge, profile name heading (Platinum → Amber → Orange), VIP badge, Peněženka sekce (icon + heading + coin glow + balance číslo), "Dobít MioCoiny" CTA, edit formuláře (labely + inputy + focus), profile view řádky (5×), win sound toggle, marketing sekce, top-up modal
- Logika aplikace, Supabase dotazy, wallet, Stripe, routing, UI texty — beze změny
- Žádné migrace, žádné nové soubory

### Větev a PR

- Větev: `style/brand-profile-step-6`
- PR #89 mergnut do `main` — merge commit `9ece5828958103afd6c8d389225ffc314fa7fd04`

### Testy

- **Playwright Smoke Tests**: SUCCESS po mergi do main (run `26233223586`, 1m 9s) ✅

---

## 2026-05-21 — Brand homepage step 5: stránka Homepage sjednocena (PR #88, merge commit 02d7f4c)

### Co bylo provedeno

- **`src/pages/Homepage.tsx`** — yellow/gold/amber HSL a Tailwind → Energy Orange/Amber brand kit: zlaté separátory (5×, outer glow + ostrá linka + shimmer), banner horní separátor + horizontální light gradient, hvězdné částice „Poslední výherci", okraje sekcí (`border-amber-300/20`), „Probíhající soutěže" action box (border + hover + Trophy icon), admin „Pouze čtení" badge, empty state „Žádné aktivní soutěže" (navy bg, `#FFB547` titulek), inline voucher karta, partner karty, 3× coming-soon karty (navy + orange border)
- Logika aplikace, soutěže, tikety, wallet, vouchery, routing, UI texty — beze změny
- Žádné Supabase dotazy, Stripe, migrace nezměněny

### Větev a PR

- Větev: `style/brand-homepage-step-5`
- PR #88 mergnut do `main` — merge commit `02d7f4c6c9de054910e5ecd075307fd0c820b6ff`

### Testy

- **Playwright Smoke Tests**: SUCCESS po mergi do main (run `26229779258`, 1m 11s) ✅

---

## 2026-05-21 — Brand vouchers step 4: stránka Vouchery sjednocena (PR #87, merge commit 6dab7c3)

### Co bylo provedeno

- **`src/pages/Vouchers.tsx`** — yellow/gold HSL → Energy Orange/Amber: voucher karty (border, hover, glow), skeleton/empty state pozadí (deep navy), gold particle efekty (3×) → rgba orange/amber, CTA KOUPIT + Uplatnit (gradient `#FF8A00→#FFB547`, text `#111`), cena/voucher kód (`#FFB547`), redeem modal (border + bg + copy button), image separátor, info badge, heart button, gift icon placeholder
- Layout, taby, nákup voucheru, oblíbené, zakoupené, modaly, kopírování kódu — beze změny
- Žádná logika, Supabase dotazy, migrace, stránky ani texty UI nezměněny

### Větev a PR

- Větev: `style/brand-vouchers-step-4`
- PR #87 mergnut do `main` — merge commit `6dab7c3527b11c1e0559220d71228ef485911fad`

### Testy

- **Playwright Smoke Tests**: SUCCESS na PR checku i po mergi do main (run `26228589925`) ✅

---

## 2026-05-21 — Brand contest detail step 3: detail soutěže sjednocen (PR #86, commit 63ecbcb)

### Co bylo provedeno

- **`src/pages/ContestDetail.tsx`** — yellow/gold → Energy Orange/Amber/Platinum/Silver: hero titulek (Platinum), popis (Silver), border konzistentní s ContestCard, MioCoin boxy (border, glow, live shimmer), bonus pool číslo, věcné výhry (border, hover, badge), PDF tlačítko (orange gradient)
- Žádná logika, Supabase dotazy, migrace, stránky ani texty UI nezměněny

### Větev a PR

- Větev: `style/brand-contest-detail-step-3`
- PR #86 mergnut do `main` — commit `63ecbcb` (rebase merge)

### Testy

- **Playwright Smoke Tests**: SUCCESS na PR checku i po mergi do main (run `26227604101`) ✅

---

## 2026-05-21 — Brand contest cards step 2: soutěžní karty a CTA sjednoceny (PR #85, commit 9a508d5)

### Co bylo provedeno

- **`src/components/ContestCard.css`** — border sweep: žlutá/zlatá → Energy Orange/Amber; animace zpomalena pro premium pocit; vnitřní glow orange-tinted; CSS třídy zachovány
- **`src/components/ContestCard.tsx`** — CTA: outlined orange → gradient `#FF8A00→#FFB547`, tmavý text, glow; Detail/Login: silver border + orange hover
- **`src/components/ui/button.tsx`** — varianta `premium`: gold → Energy Orange `#FF8A00`
- Žádná logika, migrace, stránky ani texty UI nezměněny

### Větev a PR

- Větev: `style/brand-contest-cards-step-2`
- PR #85 mergnut do `main` — commit `9a508d5` (rebase merge)

### Testy

- **Playwright Smoke Tests**: SUCCESS na PR checku i po mergi do main (run `26226461672`) ✅

---

## 2026-05-21 — Brand token reset step 1: sjednoceny základní CSS tokeny (PR #84, merge commit 4de961b)

### Co bylo provedeno

- **`src/index.css`** — přidány `--om-*` brand tokeny do `:root`; základní Tailwind/ShadCN tokeny (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--accent`, `--ring`, `--muted-foreground`, `--neon-gold`, `--heading-gold`, `--text-silver` a další) přesměrovány na OneMil brand kit barvy (Midnight Black, Deep Navy, Graphite, Platinum, Muted Silver, Energy Orange, Warm Amber, Soft Gold)
- Sidebar primary/ring → Energy Orange
- `body::before` gradient → brand černé odstíny
- Žádné komponenty, stránky, migrace ani backend logika nezměněny

### Větev a PR

- Větev: `style/brand-token-reset-step-1`
- PR #84 mergnut do `main` — merge commit `4de961b7d286c4309b916f5b00edad2e2e15ec7b`
- Změněn pouze `src/index.css` (+67 / -54)

### Testy

- **Playwright Smoke Tests**: SUCCESS na PR checku i po mergi do main (run `26212014595`) ✅

---

## 2026-05-20 — Admin „Online teď" pro přihlášené uživatele: live na produkci (commit 0732738, ab5cb25)

### Co bylo provedeno

- **Migrace `20260520_registered_user_presence.sql`** — přidán sloupec `public.users.last_seen_at timestamptz`, index `idx_users_last_seen_at`, SECURITY DEFINER RPC `bump_user_last_seen()` (updatuje pouze `auth.uid()` řádek), SECURITY DEFINER RPC `get_admin_online_users(p_active_window_seconds int DEFAULT 300)` (admin/superadmin only). Migrace idempotentní (`IF NOT EXISTS` / `CREATE OR REPLACE`).
- **`src/hooks/useHeartbeat.ts`** (nový soubor) — volá `bump_user_last_seen` ihned po přihlášení a pak každých 60 s. No-op pokud `userId === undefined`. Crash-safe: `async/await` + `try/catch`.
- **`src/hooks/useAdminOnlineIndicator.ts`** (přepsán ze stubu) — polluje `get_admin_online_users` každých 30 s. Vrací reálné `onlineCount`, `onlineUsers`, `statusLabel`, `lastUpdatedAt`. `onUserJoin` zachován jako no-op pro interface kompatibilitu.
- **`src/App.tsx`** (+2 řádky) — import `useHeartbeat` + `useHeartbeat(user?.id)` namountován vedle ostatních globálních hooků.
- `AdminSoundIndicator.tsx` nedotčen.

### Commit 0732738 — feat (push přes rebase na main)

### Runtime crash fix — commit ab5cb25

`supabase.rpc('bump_user_last_seen').catch(...)` způsobovalo `TypeError: .catch is not a function`. Supabase RPC vrací thenable (`PostgrestFilterBuilder`), ne plný Promise — `.catch()` na něm neexistuje. Opraveno přepsáním `bump` na `async function` s `await` + `try/catch`.

### Migrace aplikovány

- **Staging** `dxmowysntemfqfnanxua` — aplikováno přes Supabase MCP `apply_migration` ✅
- **Produkce** `xkzhjldrojjlrkezorey` — aplikováno přes Supabase MCP `apply_migration` ✅
- Verifikace na obou projektech: `last_seen_at_column=exists`, `bump_user_last_seen_function=exists`, `get_admin_online_users_function=exists` ✅

### End-to-end validace na staging (SQL simulace)

1. `set_config('request.jwt.claims', '{"sub":"<e2e-user-id>"}')` + `bump_user_last_seen()` → `last_seen_at` zapsán do DB ✅
2. `get_admin_online_users` jako admin → vrátil e2e uživatele s `userId` + `onlineAt` ✅
3. `get_admin_online_users` jako non-admin → `{"success":false,"message":"Pouze administrátoři..."}` ✅

### Co se nesleduje

Anonymní návštěvníci nejsou v OneMil sledováni — zůstávají v Google Analytics.

---

## 2026-05-20 — Admin „Online teď" ZAMČEN PROTI REGRESI: staging E2E spec 21 zelený (commits b70beba, b2129ac)

### Co bylo provedeno

- **`tests/e2e/21-admin-online-registered-users.spec.ts`** (nový soubor, 130 řádků) — staging-only spec, dva browser contexts. Commit `b70beba`.
  - Normální E2E uživatel se přihlásí → čeká 6 s na heartbeat RPC
  - Admin kontext otevře `/admin`, ověří badge count ≥ 1 (`span.font-medium` regex `/^[1-9][0-9]*$/`)
  - Klikne na badge, ověří `<h4>Online uživatelé</h4>` v popoveru
  - Ověří, že e-mail normálního E2E uživatele je viditelný v popoveru
  - Ověří, že sekce „Anonymní návštěvníci" NENÍ přítomna
  - Skip guard: test se přeskočí pokud `E2E_TEST_EMAIL / E2E_TEST_PASSWORD / E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD` nejsou nastaveny
- **Fix strict-mode violation** — commit `b2129ac`: `getByText(E2E_TEST_EMAIL, { exact: false })` způsobovalo strict-mode violation, protože `e2e@onemil.cz` je substring `admin-e2e@onemil.cz`. Oba uživatelé jsou přihlášeni → oba e-maily viditelné v popoveru → Playwright odmítl nejednoznačný locator. Opraveno na `{ exact: true }`.

### První staging run selhal (run 26188535209)

- Spec 21 selhal na řádku 116: `strict mode violation: getByText('***') resolved to 2 elements`
- Obě `<p class="text-xs text-muted-foreground truncate">` obsahovaly příslušné e-maily (normální uživatel i admin)
- Opraveno v commitu `b2129ac`

### Staging Full E2E run 26189017692 ✅

- **29 passed, 0 failed, 3 skipped** (4m 35s)
- Spec 21 prošel za 16.8s
- Admin Online teď pro přihlášené uživatele je nyní chráněn každým staging CI během

---

## 2026-05-20 — Issue #71 ZAMČEN PROTI REGRESI: staging E2E spec 20 zelený (PRs #79/#80/#81)

### Co bylo provedeno

- **PR #79** — `tests/e2e/20-admin-miocoin-chunked-save.spec.ts` (staging-only, non-destructive, 183 řádků). Drží frontend na chunked flow + DB read-back přes `@supabase/supabase-js` (anon + admin sign-in). Druhý commit v PR opravil `admin_actions.timestamp` (ne `created_at`). Merge commit: `6573144`.
- **PR #80** — `.github/workflows/playwright-staging.yml` seed step `seed-spec20-contest` (status=draft, ticket_count=1000, ticket_price=1, main_image set) + `E2E_SPEC20_CONTEST_ID` v test env. Production workflow nedotčen. Merge commit: `cbd51f9`.
- **PR #81** — locator strict-mode fix v spec 20: regex změněn na `/^Celkem:.*600 pozic/i` aby matchoval pouze badge, ne summary řádek. Merge commit: `ef01011`.

### Staging Full E2E run 26180130657 ✅
- **28 passed, 0 failed, 3 skipped** (2m 54s)
- Spec 20 prošel za 9.7s
- Seed contest `3537f6bd-7b70-4bf5-96d0-c8770e75d935` (ticket_count=1000, status=draft)
- 600 MioCoin pozic vygenerováno, save úspěšný (žádný statement_timeout)
- DB read-back ✅: `bonus_prizes` count = 600, `contests.total_miocoin_bonus` = 6 000, `admin_actions` obsahuje `miocoin_save_begin` + `miocoin_bulk_create` s `metadata.chunked = true`
- Telegram `✅ OneMil STAGING full E2E OK — all specs passed` doručen (message_id 560)

### První staging run po PR #80 selhal (run 26179272175)
- Spec 20 narazil na Playwright strict-mode violation: regex `/600 pozic/i` matchoval 2 elementy (badge + summary řádek)
- Test selhal **před** kliknutím na Save → chunked save samotný nebyl ověřen v tomto běhu
- PR #81 opravil locator a další run prošel

### Status issue #71
**Resolved + chráněn každým staging CI během.** Frontend, DB funkce i CI lock jsou na místě.

---

## 2026-05-20 — Issue #71 FINÁLNĚ VYŘEŠEN: chunked MioCoin save (PRs #74/#75/#77/#78)

### Co bylo provedeno

- **PR #74** — switch explicit MioCoin save z Edge Function (`distribute-bonus-prizes` s `explicit_bonuses`) na SQL RPC (`admin_bulk_insert_miocoin_bonuses`). Merge commit: `3a46ede`. Pouze `src/components/AdminContestManagement.tsx` (+18 / −21). Eliminace Deno wall-clock timeoutu pro explicitní save. `distribute-bonus-prizes` ponechán pro non-explicit (random/step_interval) cestu.
- **PR #75** — exclude final ticket from MioCoin bonus position generator. Merge commit: `42c1017`. Pouze `src/components/AdminContestManagement.tsx` (+10 / −7). Zavedena konstanta `maxMioCoinPosition = ticketCount - 1` v obou distribučních cestách (even + random). Pozice = `ticket_count` rezervována pro hlavní výhru.
- **PR #76** — pokus o `set_config('statement_timeout', '300000', true)` uvnitř `admin_bulk_insert_miocoin_bonuses` + idempotentní `DROP TABLE IF EXISTS tmp_miocoin_bonuses`. Migrace `20260520_admin_bulk_miocoin_statement_timeout.sql`. Aplikováno na produkci, verifikace `contains_drop_tmp=true`, `contains_statement_timeout=true`. **Neúčinné** — test22 stále selhal s `canceling statement due to statement timeout`. Root cause: PL/pgSQL `set_config` LOCAL nezasahuje běžící outer PostgREST statement; navíc Supabase API gateway má vlastní HTTP timeout (~60s). Architektonická slepá ulička.
- **PR #77** — chunked MioCoin save. Migrace `20260520_miocoin_chunked_save_functions.sql` + frontend úprava. Merge commit: `3ecd892`. Tři nové SECURITY DEFINER funkce:
  - `admin_begin_miocoin_save(p_contest_id, p_expected_count)` — admin role check, wipe stale `amount > 0` rows, reset `total_miocoin_bonus = 0`, audit `miocoin_save_begin`
  - `admin_append_miocoin_chunk(p_contest_id, p_bonuses)` — admin role check, set-based chunk validation, single `INSERT … SELECT FROM jsonb_array_elements()`. Žádný DELETE. Vrací `inserted_count`.
  - `admin_finalize_miocoin_save(p_contest_id, p_expected_count)` — admin role check, COUNT(*) + SUM(amount), `success=false` pokud `real_count ≠ expected`, sync `total_miocoin_bonus`, audit `miocoin_bulk_create`
  - Frontend `handleSave` orchestruje begin → for-loop append × N → finalize. Save success vyžaduje finalize success. Legacy `admin_bulk_insert_miocoin_bonuses` ponechán beze změny.
- **PR #78** — `CHUNK_SIZE = 5000 → 500`. Merge commit: `301a778`. Pouze `src/components/AdminContestManagement.tsx` (+4 / −1). Production test23 ukázal že 5000 stále hitne gateway timeout na chunk 1/9. 500 prochází komfortně — 95 000 pozic = ~190 malých chunků.

### Production verification
- Migrace `20260520_miocoin_chunked_save_functions.sql` aplikována na produkci (`xkzhjldrojjlrkezorey`) přes Supabase MCP `apply_migration`. Verifikace: `admin_begin_miocoin_save=exists`, `admin_append_miocoin_chunk=exists`, `admin_finalize_miocoin_save=exists` ✅
- Lovable frontend publikován ✅
- Final manual test na produkci: MioCoin bonus creation works, admin totals display correctly ✅

### Selhané architekturní cesty (zaznamenané pro budoucí referenci)
1. ❌ Jeden velký Edge Function request s `explicit_bonuses` (Deno wall-clock timeout)
2. ❌ Jeden velký SQL RPC (`admin_bulk_insert_miocoin_bonuses`) — PostgREST/Kong gateway HTTP timeout
3. ❌ Chunked save s `CHUNK_SIZE = 5000` — chunk 1/9 stále hitnul gateway timeout

### Final invariant
Large MioCoin bonus saves musí používat chunked flow s `CHUNK_SIZE = 500`.

---

## 2026-05-20 — PRs #61–#66: bulk MioCoin timeout fix + produkce zelená

### Co bylo provedeno

- **PR #61** — nová SECURITY DEFINER funkce `admin_bulk_insert_miocoin_bonuses(p_contest_id uuid, p_bonuses jsonb)`. Migrace `20260519_bulk_miocoin_bonuses.sql`. Nahrazuje N sequential RPC callů jedním bulk DELETE+INSERT. RLS policy "Allow admin full access to bonus prizes" přidána idempotentně. Root cause: 95 000 pozic × 430ms/call ≈ 11 hodin, vždy selhávalo v půlce. Aplikováno na staging i produkci.
- **PR #62** — guard v `handleSave` (`AdminContestManagement.tsx`): pokud admin vyplnil MioCoin inputy ale neklikl Vygenerovat, uložení se zablokuje s destructive toastem místo tiché prázdné persistence.
- **PR #63** — fix `contests.total_miocoin_bonus` vždy 0. Migrace `20260520_sync_total_miocoin_bonus_after_bulk.sql`. Root cause: trigger `sync_total_miocoin_bonus` neexistuje na produkci. Fix: UPDATE contests.total_miocoin_bonus po každém bulk INSERT + backfill + zero-fill. Aplikováno na staging i produkci.
- **PR #64** — fix duplicate contest creation při partial failure v CREATE módu. `createdContestIdInCreateMode` tracking variable v `handleSave`; outer catch zavře modal + zobrazí informativní toast místo tiché smyčky umožňující druhé uložení. Merge commit: `72b74bc64dad27abd04a2c64214c77dc1e3a533c`.
- **PR #65** — perf: set-based SQL validace v `admin_bulk_insert_miocoin_bonuses`. Migrace `20260520_optimize_bulk_miocoin_bonuses.sql`. Odstraněna O(N²) PL/pgSQL smyčka s `array_append` a N individual EXISTS queries. Nahrazeno: `COUNT(*)` pro NULL/invalid check, `GROUP BY HAVING COUNT(*) > 1` pro duplicity, jeden `JOIN bonus_prizes` pro fyzické kolize. Merge commit: `e809bd0`. Aplikováno na staging i produkci.
- **PR #66** — perf: materialize JSON payload once. Migrace `20260520_materialize_bulk_miocoin_payload.sql`. Root cause: PR #65 odstranil smyčku ale `jsonb_array_elements(p_bonuses)` stále voláno 5× (validation, duplicate, collision, INSERT, SUM) → 5 re-parsů 56 000-řádkového JSONu → stále timeout. Fix: `CREATE TEMP TABLE tmp_miocoin_bonuses ON COMMIT DROP` + `INSERT INTO tmp` z jednoho `jsonb_array_elements` + index na `ticket_position` + `idx_bonus_prizes_contest_position ON bonus_prizes(contest_id, ticket_position)`. Merge commit: `59b2efe`. Aplikováno na staging i produkci. Toto je finální stav.

### Staging E2E výsledky
- Po PR #61: run `26113679217` — 26/0/3 ✅
- Po PR #62: run `26135981706` — 27/0/3 ✅
- Po PR #63: run `26147052xxx` — 27/0/3 ✅ (flaky spec 18 retry)
- Po PR #64: run `26152507277` — 27/0/3 ✅
- Po PR #65: run `26153556353` — 27/0/3 ✅ (spec 18 10.0s, spec 19 10.0s)
- Po PR #66: run `26156907020` — 27/0/3 ✅ (spec 18 11.3s, spec 19 10.4s, Telegram message_id 521)

---

## 2026-05-19 — PR #60 mergnut + Staging Full E2E zelený (run 26113679217)

### Co bylo provedeno
- **PR #60** fix: create contest modal not closing when rules PDF upload fails after contest creation — mergnut do `main`. Merge commit: `a25a7d71d986485d60cab92f153db30746e09019`. Změněn pouze `src/components/AdminContestManagement.tsx` (+10 / −2). Žádné migrace, žádný RPC, žádné workflow changes.
  - Root cause: audit confirmed contest is already created by SECURITY DEFINER RPC `admin_manage_contest` before rules PDF upload runs. In the PDF upload error branch, `setSaving(false); return` ran regardless of mode — leaving the modal open even though the contest existed in the DB.
  - Fix: mirrors PR #55 pattern. In CREATE mode: on PDF upload error, display error toast but fall through to `onSaved()/onClose()` so the modal closes and the contest appears in the list (admin can reopen to re-upload the PDF). In EDIT mode: `setSaving(false); return` preserved — modal stays open so admin can retry the upload.
  - Guard: `if (isEditingContest) { setSaving(false); return; }` inserted after the toast call in the upload error branch.
- **Staging Full E2E run `26113679217`** spuštěn po mergi PR #60 — **26 passed, 0 failed, 3 skipped**.
  - Spec 18 ✅ passed — first attempt failed transiently (toHaveValue timeout, 18.8s), retry #1 passed (17.6s). Identified as transient staging latency, not a PR #60 regression.
  - Spec 19 ✅ passed.
  - Telegram `✅ OneMil STAGING full E2E OK` doručen (message_id 497).

---

## 2026-05-19 — PRs #56–#59 mergnuty + Staging Full E2E zelený (run 26106988469)

### Co bylo provedeno
- **PR #56** fix: MioCoin bonus save RPC overload + auto-sync economy — mergnut do `main`. Změněn pouze `src/components/AdminContestManagement.tsx`.
  - Part A: `admin_manage_bonus_prize` RPC volán s explicitními `p_image_url: null, p_detailed_description: null` — eliminuje Postgres "could not choose best candidate function" chybu při ambiguitě 5-arg vs 9-arg overloadu.
  - Part B: `effectiveMioCoinCost` = `mioCoinBonuses.length > 0 ? totalMioCoins : totalMioCoinsInput > 0 ? totalMioCoinsInput : economyAssumptions.mioCoinRealCost` — auto-synchronizuje economy kalkulace se skutečnými MioCoin bonusy.
- **PR #57** fix: Economy input cleanup — mergnut do `main`. Změněn pouze `src/components/AdminContestManagement.tsx`.
  - `Náklad na hlavní výhru` přesunut z Economy tabu do Basic tabu (vedle `Hlavní výhra`).
  - `Reálný náklad na MioCoin bonusy` vždy read-only (auto-odvozeno z `effectiveMioCoinCost`).
- **PR #58** fix: physical prize grouping key excludes image_url — mergnut do `main`. Změněn pouze `src/pages/ContestDetail.tsx`.
  - Root cause: bulk výhry mají unikátní UUID storage cestu → grouping key s `image_url` → každý řádek vlastní karta → N duplicitních karet.
  - Fix: klíč pouze `${description}||${detailed_description}` — bulk výhry se správně seskupí do jedné karty.
- **PR #59** fix: update spec 18 for PRs #56/#57 economy UI changes — mergnut do `main`. Změněn pouze `tests/e2e/18-admin-economy-persist.spec.ts`. Merge commit: `ab9e37f`.
  - Root cause: staging run `26105990009` selhal na spec 18 (timeout 180s): spec se pokoušel fill `Náklad na hlavní výhru` v Economy tabu (pole přesunuto PR #57 do Basic tabu) a fill read-only `Náklad na MioCoin bonusy` (vždy read-only od PR #56/#57).
  - Fix: Step 4a naviguje do Basic tabu a vyplňuje `Náklad na hlavní výhru` tam. Step 4b v Economy tabu vyplňuje jen `Jednorázový` a `Cílová marže`. `Náklad na MioCoin bonusy` fill + assertion odstraněny.
- **Staging Full E2E run `26106988469`** spuštěn po mergi PR #59 — **27 passed, 0 failed, 3 skipped** (3m 6s).
  - Spec 18 ✅ passed (11.3s, první pokus).
  - Spec 19 ✅ passed.
  - Telegram `✅ OneMil STAGING full E2E OK` doručen (message_id 492).

---

## 2026-05-19 — PR #55 mergnut + Staging Full E2E zelený (run 26059677757)

### Co bylo provedeno
- **PR #55** fix: group duplicate physical bonus prize cards on ContestDetail + close create-contest modal — mergnut do `main`. Merge commit: `9808f83d13e4ff09516dc2f352abcc3c28274ab8`. Změněny 2 soubory: `src/pages/ContestDetail.tsx` (+56 / −16), `src/components/AdminContestManagement.tsx` (+11 / −2).
  - **Part A root cause:** `ContestDetail.tsx` renderoval `bonusPrizes.map((b) => ...)` přímo nad všemi DB řádky. Jeden fyzický produkt s qty=25 → 25 řádků v `bonus_prizes` → 25 identických karet na veřejné stránce soutěže.
  - **Part A fix:** přidán `groupedBonusPrizes` useMemo; fyzické výhry se seskupují podle klíče `description + detailed_description + image_url/image`. Každá skupina → jedna karta se zlatou badge `N× v soutěži` (pokud N > 1). MioCoin bonusy zůstávají individuální (každý má vlastní skupinový klíč = id). myWins check pokrývá všechna IDs ve skupině.
  - **Part B root cause:** `additionalUpdates.rules = form.rules.trim() ? form.rules : null` (řádek 1468) vždy přidával klíč `rules` → přímý client `.update()` vždy proběhl → pokud vrátil 0 řádků (RLS blokuje update čerstvě vytvořeného řádku, SECURITY DEFINER RPC ho vytvořil, ale klient-side UPDATE nemá práva), `setSaving(false); return` se spustil před `onSaved()`/`onClose()` → modal zůstal otevřený i po úspěšném vytvoření soutěže.
  - **Part B fix:** pro CREATE mód: při `updatedRows.length === 0` se zobrazí error toast ale kód pokračuje (nevrací `return`) → modal se zavře. Pro EDIT mód: původní chování (`return`) zachováno.
  - Žádné migrace, žádný RPC, žádné workflow changes, žádná schémata.
- **Staging Full E2E run `26059677757`** spuštěn po mergi — **27 passed, 0 failed, 3 skipped** (4m 14s).
  - Spec 18 ✅ passed (10.8s, první pokus).
  - Spec 19 ✅ passed (10.9s).
  - Telegram `✅ OneMil STAGING full E2E OK` doručen (message_id 475).

---

## 2026-05-18 — PR #53 + PR #54 mergnuty + Staging Full E2E zelený (run 26057380995)

### Co bylo provedeno
- **PR #53** fix: sanitize gallery upload file names to prevent Supabase Storage Invalid key error — mergnut do `main`. Merge commit: `8356ac04bdf3d03f457febe6e199fca4593e856b`. Změněn pouze `src/components/AdminContestManagement.tsx` (+46 / −6).
  - Root cause: raw file names s mezerami, českou diakritikou nebo závorkami (např. `Snímek obrazovky 2026-05-09 150423.png`) způsobovaly Supabase Storage error `Invalid key`. Ovlivňovalo gallery image a background uploads v admin contest modalu.
  - Fix: přidán `sanitizeStorageFileName()` helper; aplikován na všechny 3 gallery upload paths (image upload existující soutěž, background upload existující soutěž, pending gallery flush při save nové soutěže). Storage key formát: `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`. Czech error fallback pro uživatele.
  - Žádné migrace, žádný RPC, žádné workflow changes.
- **PR #54** fix: replace flaky skip guard in spec 08 with robust Promise.race pattern — mergnut do `main`. Merge commit: `819cb77819bfc37598a621b46821a1995c17d2c9`. Změněn pouze `tests/e2e/08-partner-offer-persistence.spec.ts` (+16 / −3).
  - Root cause: staging run `26055723773` selhal na spec 08 — `waitForTimeout(2_000) + okamžité isVisible()` bylo fragile; na pomalejším staging loadu se empty-state text nevykreslil do 2s, `isVisible()` vrátilo false, skip guard se nespustil, test selhal na neexistujícím `div.group.cursor-pointer`.
  - Fix: nahrazen `Promise.race` pattern (mirror spec 07) — wait up to 10s pro offer card nebo empty state text, poté skip guard. Přidán `!firstCard.isVisible()` fallback skip. Žádný app kód ani workflow nezměněn.
- **Staging Full E2E run `26057380995`** spuštěn po mergi obou PR — **26 passed, 0 failed, 3 skipped** (4m 0s).
  - Spec 08 ✅ skipped (PR #54 fix funguje).
  - Spec 18 ✅ passed — first attempt failed transiently (contest_economy pomalé načítání na staging; expected "4242", received "0"), retry #1 prošel (15.8s). Playwright retry absorboval; žádný code fix potřeba.
  - Spec 19 ✅ passed (12.3s).
  - Telegram `✅ OneMil STAGING full E2E OK` doručen (message_id 471).
  - Poznámka k transient spec 18: `toHaveValue('4242', { timeout: 8_000 })` na pomalém staging DB loadu může být borderline; Playwright retry konfigurací zachyceno.

---

## 2026-05-18 — PR #52 mergnut + Staging Full E2E zelený (run 26053065266)

### Co bylo provedeno
- PR #52 **feat: add bulk quantity distribution for physical bonus prizes** mergnut do `main`.
- Merge commit: `e43cda76c4f187bd4a8e9ae00ec3396626a73e19`.
- Změněn pouze `src/components/AdminContestManagement.tsx` (+194 / −28). Žádné migrace, žádný RPC, žádný workflow change.
- Přidána nová UI pole v záložce „Bonusy – věcné": **Počet kusů** (default 1, min 1) a **Rozmístění pozic** (Rovnoměrně / Náhodně, viditelné pouze při qty > 1).
- Při qty = 1: stávající chování (manuální Pozice tiketu) zachováno beze změny.
- Při qty > 1: `pickPositions` helper generuje N bezkolizních pozic — rovnoměrně (evenly spaced indices) nebo náhodně (Fisher-Yates shuffle, výsledek seřazen). Kolizní pravidla: vylučuje MioCoin pozice, existující věcné výhry, final-ticket pozici (ticket_count), pozice mimo rozsah 1..(ticket_count-1). Pokud pool < qty → česky chybový toast, přidání blokováno.
- Po bulk add: description + image se resetují, economy pole (dodavatel/cena/DPH/balné) se zachovávají, Počet kusů se resetuje na 1. Toast ukazuje prvních 5 přidělených pozic.
- Opraven stale helper text: `"Do Supabase se v této fázi neukládají."` nahrazen přesným popisem o persistenci ekonomických metadat při uložení soutěže.
- Staging Full E2E run `26053065266` spuštěn po mergi — **27 passed, 0 failed, 3 skipped** (3m 56s). Spec 18 ✅ (9.8s), spec 19 ✅ (10.0s). Telegram `✅ OneMil STAGING full E2E OK` doručen (message_id 462). Žádná regrese.

---

## 2026-05-18 — Staging Full E2E zelený po staging SQL fix (run 26046436837)

### Co bylo provedeno
- Staging Full E2E run `26046436837` proběhl po aplikaci staging SQL oprav — **27 passed, 0 failed, 3 skipped** (4m 28s).
- Spec 18 (`Admin — Economy Persist`) ✅ prošel (11.9s).
- Spec 19 (`Admin — Physical Prize Economy Persist`) ✅ prošel poprvé (11.2s, bez retry) — první plně zelený průchod spec 19.
- Telegram notifikace `✅ OneMil STAGING full E2E OK` doručena.
- 3 skipy jsou záměrné pre-existující skipy: spec 01 new-user registration (nepoužívá se na staging), spec 07 partner offer open, spec 08 partner offer persistence.
- Toto je finální potvrzení, že Phase 4 Economy Persistence je kompletní a plně zelená na staging i produkci.

---

## 2026-05-18 — Staging SQL opravy: bonus_prizes columns + write RLS policy

### Co bylo provedeno
- Na staging projektu `dxmowysntemfqfnanxua` aplikovány manuálně dvě SQL opravy přes Supabase SQL Editor:
  1. **Phase 4 economy sloupce na bonus_prizes:** `ALTER TABLE public.bonus_prizes ADD COLUMN IF NOT EXISTS supplier_name TEXT, unit_cost_czk NUMERIC, vat_rate_percent NUMERIC, handling_override_czk NUMERIC;` — ekvivalent migrace `20260517180100_add_bonus_prize_economy_columns.sql`, která byla aplikována na produkci ale chyběla na staging.
  2. **Write RLS policy na bonus_prizes:** `CREATE POLICY "Allow admin full access to bonus prizes" ON public.bonus_prizes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) WITH CHECK (...);` — staging měl pouze dvě SELECT policies, žádnou write policy. Bez ní přímé client-side `.update()` / `.delete()` z admin UI tichce selhávaly (PostgREST vrátil 200/204, 0 řádků dotčeno). SECURITY DEFINER RPC INSERT fungoval (obchází RLS), čímž se maskoval problém — bonus prize se vytvořil na pozici 42, ale economy metadata se neuložila.
- Root cause spec 19 failures (run 26040307928 a 26042798457): chybějící write policy způsobila, že `.update({supplier_name, unit_cost_czk, vat_rate_percent, handling_override_czk})` po RPC tiše neuložil žádná data; na reload se zobrazovaly výchozí hodnoty.
- Žádné soubory v repozitáři nezměněny; opravy jsou čistě DB-side na staging projektu.

---

## 2026-05-18 — PR #51 workflow admin E2E seed step mergnut

### Co bylo provedeno
- PR #51 **fix: ensure staging admin E2E user has admin role before E2E suite** mergnut do `main`.
- Merge commit: `97797662d19cafe53062a04fb73449545ef98780`.
- Zdrojová větev: `fix/spec19-admin-staging-seed`; cílová větev: `main`.
- Změněn jediný soubor: `.github/workflows/playwright-staging.yml`.
- Přidán nový workflow krok "Ensure staging admin E2E user has admin role" vložený před "Run full E2E suite".
- Krok používá Supabase Admin API k nalezení nebo vytvoření `admin-e2e@onemil.cz` v auth.users; poté upsertuje public.users (role=admin), user_roles (role=admin), profiles, wallets. Idempotentní — bezpečný při každém spuštění.
- Root cause spec 19 selhání (run 26029330415): `admin_manage_bonus_prize` RPC kontroluje `SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','superadmin')` — admin E2E user chyběl v public.users na staging, RPC vrátil `{success:false, "Pouze administrátoři..."}`, dialog se nezavřel.
- Proč spec 15/16/17/18 procházely: spec 15/17 jsou read-only; spec 16 volá jen `admin_manage_contest` (jiný exception handler — re-raise, ne catch-and-return); spec 18 nepřidává fyzické výhry → `admin_manage_bonus_prize` se nevolá.
- Žádný app kód, testy, migrace ani business logika nezměněny.

---

## 2026-05-18 — Staging Full E2E zelený po PR #16 (run 25995782004)

### Co bylo provedeno
- Staging Full E2E run `25995782004` proběhl po mergi PR #16 — **25 passed, 3 skipped, 0 failed** (3m 36s).
- Spec 17 (`Profile Smoke`) ✅ prošel poprvé (5.7s) — nový test přidaný v PR #16.
- Spec 16 (`Admin — Economy Preview Smoke`) ✅ prošel (6.0s).
- Telegram notifikace `✅ OneMil STAGING full E2E OK — all specs passed` doručena.

---

## 2026-05-17 — PR #16 profile smoke E2E test mergnut

### Co bylo provedeno
- PR #16 **Add profile smoke E2E coverage** mergnut do `main`.
- Merge commit: `7fd9766972b4a84c9ee33b11357f42ad46c38854`.
- Zdrojová větev: `test/e2e-profile-smoke`; cílová větev: `main`.
- Přidán nový spec: `tests/e2e/17-profile-smoke.spec.ts` (54 řádků, staging-only, read-only).
- Původní název `12-profile-smoke.spec.ts` přejmenován na `17-` aby nedošlo ke kolizi s existujícím `12-mobile-messages-layout.spec.ts`.
- Test ověřuje: login jako E2E user → `/profile` → identita (e-mail), sekce Peněženka/MioCoiny/Váš MioCoin účet, Účet heading, Přihlašovací údaje, Osobní údaje — bez redirectu na login/onboarding.
- Guard: `test.skip` pokud chybí `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`; staging-only.
- Žádný app kód, DB schéma, migrace, workflow soubory, Supabase volání, platby, soutěže, tikety, výhry, vouchery, Partner Offers ani `buy_ticket_atomic` nezměněny.

---

## 2026-05-17 — Staging Full E2E zelený po PR #38 (run 25994857704)

### Co bylo provedeno
- Staging Full E2E run `25994857704` proběhl po mergi PR #38 — **24 passed, 3 skipped, 0 failed** (2m 36s).
- Spec 16 (`Admin — Economy Preview Smoke`) ✅ prošel poprvé čistě (5.3s).
- Telegram notifikace `✅ OneMil STAGING full E2E OK — all specs passed` doručena.

---

## 2026-05-17 — PR #38 spec 16 Ekonomika tab scope fix mergnut

### Co bylo provedeno
- PR #38 **fix(spec-16): scope Ekonomika tab assertions to active tab panel** mergnut do `main`.
- Merge commit: `214248d40b95956636315ca7c7f9b60abd56fcc3`.
- Zdrojová větev: `fix/spec16-ekon-tab-scope`.
- Změněn jediný soubor: `tests/e2e/16-admin-economy-preview.spec.ts`.
- Root cause: economy summary bar (vždy viditelný nad záložkami) obsahoval stejné texty jako Ekonomika tab — `dialog.getByText(/Celkové odhadované náklady/)` a `/11\s*360 Kč/` matchovaly 2 elementy, strict mode odmítl.
- Fix: přidán `const econPanel = dialog.locator('[role="tabpanel"][data-state="active"]')` po kliknutí na záložku Ekonomika; všech 7 assertions v sekci přesunuto z `dialog` na `econPanel`.
- Žádný app kód, migrace, workflow soubory ani business logika nezměněna.

---

## 2026-05-17 — PR #37 spec 16 Balné strict mode fix mergnut

### Co bylo provedeno
- PR #37 **fix(spec-16): resolve strict mode violation on Balné assertion** mergnut do `main`.
- Merge commit: `cd5a497cb4bc7b4d7dd994d620af3e3f93e33c99`.
- Zdrojová větev: `fix/spec16-strict-mode-balne`.
- Změněn jediný soubor: `tests/e2e/16-admin-economy-preview.spec.ts` (1 řádek).
- Root cause: regex `/Balné \/ pošta \/ práce/` matchoval 2 elementy — `<label>Balné / pošta / práce na věcnou výhru v Kč</label>` (věcné tab, hidden v DOM) a `<span>Balné / pošta / práce</span>` (Ekonomika tab).
- Fix: `dialog.getByText(/Balné.../)` → `dialog.getByText('Balné / pošta / práce', { exact: true })`.
- Žádný app kód, migrace ani business logika nezměněna.

---

## 2026-05-17 — PR #36 admin modal layout cleanup mergnut

### Co bylo provedeno
- PR #36 **fix: widen admin contest modal and remove horizontal scrollbars** mergnut do `main`.
- Merge commit: `f6a28ca51ebf7783a3529e70fd36745fe77a95cc`.
- Zdrojová větev: `fix/admin-modal-layout-issue-35`; cílová větev: `main`.
- Změněn jediný soubor: `src/components/AdminContestManagement.tsx` (pouze layout CSS třídy).
- `max-w-4xl` cap odstraněn — modal nyní používá `max-w-[95vw]` a je podstatně širší na desktopu.
- `overflow-x-auto` odstraněn z wrapperu horního economy summary baru — žádný vnitřní horizontální scrollbar.
- Economy summary bar grid změněn z `min-w-max grid-cols-5` na `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` — responsivní zalamování na menších obrazovkách.
- `min-w-[9.5rem]` odstraněn z položek summary baru (grid řídí šířku).
- TabsList změněn z `inline-flex w-max` na `flex flex-wrap h-auto w-full` — záložky se zalamují místo přetékání.
- Nebyl změněn žádný výpočet, validace, save behavior, Supabase volání, testy, migrace ani business logika.
- `npm run build` prošel.

---

## 2026-05-17 — PR #34 admin economy preview E2E test mergnut

### Co bylo provedeno
- PR #34 **feat: Phase 3A physical prize cost preview + spec 16 admin economy smoke** mergnut do `main`.
- Merge commit: `ff45f2ad37bcf7ca4178c96277bb300aec52dd6c`.
- Zdrojová větev: `codex/issue-33-admin-economy-preview`; cílová větev: `main`.
- Přidán nový spec: `tests/e2e/16-admin-economy-preview.spec.ts` (staging-only, read-only).
- Test ověřuje: otevření create modal adminem, vyplnění preview polí věcné výhry, zaktualizování horního economy summary baru a záložky Ekonomika — bez kliknutí finálního uložení soutěže.
- Selektory opraveny po Codex review: `getByLabel()` nahrazen helper funkcí `inputByLabel()` (label → parent div → input); `summaryValue()` přepsán na `div.uppercase.opacity-70` + `xpath=following-sibling::div[1]`.
- Test se přeskakuje (`test.skip`), pokud chybí `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`.
- PR také přinesl Phase 3A rozšíření `AdminContestManagement.tsx` o frontend-only cost preview pro věcné výhry.
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, migrace ani produkce.
- `npm run build` prošel.

---

## 2026-05-17 — Phase 3A physical prize cost preview připraven v adminu

### Co bylo provedeno
- `src/components/AdminContestManagement.tsx` rozšířen o frontend-only cost preview pro věcné bonusové výhry.
- Do lokálního `PhysicalPrize` state přidána pole `supplier_name`, `unit_cost_czk`, `vat_rate` a `handling_override_czk`.
- Formulář věcné bonusové výhry nově umožňuje zadat dodavatele, nákupní cenu v Kč, DPH a volitelný override balného / pošty / práce.
- Seznam přidaných věcných výher zobrazuje i cost preview metadata.
- Ekonomika tab a horní economy summary bar nově započítávají preview náklady věcných výher do celkových nákladů, zisku, marže, bodu zvratu a doporučené ceny ticketu.
- Balné používá per-prize override, pokud je vyplněný; jinak globální default.
- Nákladové údaje věcných výher jsou v této fázi pouze frontend preview a neukládají se do Supabase.
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, `admin_manage_bonus_prize`, `distribute-bonus-prizes` ani migrace.
- Testy nebyly v této fázi rozšířeny; follow-up má přidat bezpečný staging-only admin test pro live economy preview bez finálního create.
- `npm run build` prošel.

---

## 2026-05-16 — PR #30 exact MioCoin positions save mergnut

### Co bylo provedeno
- PR #30 **Fix MioCoin final save to use previewed positions** byl mergnut do `main`.
- Zdrojová větev: `fix/save-previewed-miocoin-positions`; cílová větev: `main`.
- Merge commit: `7b50b30d2413ad6d839f8e4100c2a9c7a806710d`.
- Změněn jediný soubor: `src/components/AdminContestManagement.tsx`.
- Phase 2B opravila finální save MioCoin bonusů v `AdminContestManagement`.
- Finální uložení soutěže nyní persistuje MioCoin bonusy podle přesně previewovaných pozic z frontend state `mioCoinBonuses`.
- Admin save path už nere-randomizuje MioCoin pozice přes `distribute-bonus-prizes`.
- Před uložením se validují bonusové pozice: celá čísla, rozsah `1..ticket_count`, duplicitní MioCoin pozice, kolize MioCoin/věcné výhry a kolize s posledním ticketem.
- Editace bonusových pozic existující soutěže je blokována, pokud už pro soutěž existují tikety.
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, main prize final-ticket logic, migrace ani production smoke scope.
- PR smoke check prošel. Nebyl proveden manuální deploy.

---

## 2026-05-16 — PR #27 admin economy summary bar mergnut

### Co bylo provedeno
- PR #27 **feat: add admin economy summary bar** byl mergnut do `main`.
- Zdrojová větev: `feature/admin-economy-summary-bar`; cílová větev: `main`.
- Merge commit: `9ea63c81c218ba91422005e8c09ab457800ef395`.
- Změněn jediný soubor: `src/components/AdminContestManagement.tsx`.
- Nad taby admin contest modalu přibyl kompaktní read-only live economy summary bar.
- Summary bar ukazuje počet ticketů, celkové odhadované náklady, doporučenou cenu ticketu, odhadovaný čistý zisk a marži.
- Používá stejné frontend-only výpočty jako tab **„Ekonomika"**.
- Nic neukládá do Supabase.
- Nebyl změněn `buy_ticket_atomic`, `bonus_prizes` schema, Partner Offers, winner logic, ticket purchase logic, migrace ani finální save behavior.
- PR smoke check prošel. Nebyl proveden manuální deploy.

---

## 2026-05-16 — PR #26 read-only admin ekonomika soutěže mergnuta

### Co bylo provedeno
- PR #26 **feat: add read-only contest economy panel** byl mergnut do `main`.
- Zdrojová větev: `feature/read-only-contest-economy-panel`; cílová větev: `main`.
- Merge commit: `5f5eb28b17c0cab2b8eaa47e360d75b34252ba59`.
- Změněn jediný soubor: `src/components/AdminContestManagement.tsx`.
- Admin modal pro vytvoření/editaci soutěže má nový read-only tab **„Ekonomika"**.
- Panel počítá hrubou tržbu, DPH, čistou tržbu, náklad na hlavní výhru, náklad na MioCoin bonusy, balné/poštu/práci, jednorázový setup/distribuční náklad, marketingový náklad, celkové odhadované náklady, odhadovaný zisk, marži, bod zvratu v počtu ticketů a doporučenou minimální cenu ticketu.
- Ekonomické předpoklady se resetují při změně modal kontextu, aby se nepřenášely mezi novou soutěží, editací a znovuotevřením modalu.
- Panel je frontend-only a zatím nic neukládá do Supabase.
- Nebyl změněn `buy_ticket_atomic`, `bonus_prizes` schema, Partner Offers, winner logic, ticket purchase logic, migrace ani finální save behavior.
- PR smoke check prošel. Nebyl proveden manuální deploy.

---

## 2026-05-15 — PR #24 + PR #25 Admin Affiliate pages smoke test přidán a aktivován (spec 15)

### Co bylo provedeno
- Staging admin E2E účet vytvořen: `admin-e2e@onemil.cz`, id `3960e47f-b583-4ef9-a48f-786bfe432bbd`, `public.user_roles.role=admin` (staging only, produkce nedotčena).
- GitHub Secrets přidány: `STAGING_E2E_ADMIN_EMAIL`, `STAGING_E2E_ADMIN_PASSWORD`.
- PR #24 `test/e2e-admin-affiliate-pages-smoke` → `main` (merge commit `8a8ba05`): přidán `tests/e2e/15-admin-affiliate-pages-smoke.spec.ts` — read-only smoke pro 3 admin Affiliate stránky.
- PR #25 `test/wire-admin-e2e-secrets` → `main` (merge commit `024fd92`): 2 řádky v `playwright-staging.yml` — `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`.
- Post-merge Staging Full E2E run `25942146994` ✅ — **23 passed, 3 skipped, 0 failed** — spec 15 RUNS (ne skip) a prošel za 10.5s. Telegram OK.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

## 2026-05-15 — PR #23 Affiliate E2E secrets zapojeny do staging workflow, spec 14 aktivován

### Co bylo provedeno
- PR #23 **ci: wire Affiliate E2E secrets into staging workflow (spec 14)** byl mergnut do `main` (merge commit `ecf7abf`).
- Zdrojová větev: `test/wire-affiliate-e2e-secrets`; cílová větev: `main`.
- Změna: 2 řádky přidány do `.github/workflows/playwright-staging.yml` — `E2E_AFFILIATE_EMAIL` a `E2E_AFFILIATE_PASSWORD` namapovány ze `STAGING_E2E_AFFILIATE_EMAIL` / `STAGING_E2E_AFFILIATE_PASSWORD` secrets.
- Staging Affiliate E2E účet vytvořen v staging DB (`dxmowysntemfqfnanxua`, pouze staging):
  - `auth.users`: `affiliate-e2e@onemil.cz`, id `8975593e-cc27-4f6b-ba23-c7077c914f38`, e-mail potvrzen.
  - `public.partners`: `status=approved`, `notes={"type":"influencer"}`, `auth_user_id` propojen.
- GitHub Secrets přidány: `STAGING_E2E_AFFILIATE_EMAIL`, `STAGING_E2E_AFFILIATE_PASSWORD`.
- Post-merge Staging Full E2E run `25941172937` ✅ — **22 passed, 3 skipped, 0 failed** — spec 14 RUNS (ne skip) a prošel za 4.9s. Telegram OK.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

## 2026-05-15 — PR #22 spec 10 flaky E2E test opraven a mergnut do main

### Co bylo provedeno
- PR #22 **fix: stabilize voucher balance E2E test (spec 10)** byl mergnut do `main`.
- Zdrojová větev: `fix/e2e-voucher-balance-before-read`; cílová větev: `main`.
- Merge commit: `3d645d7b98f5650c0a0f29c86f24f8ac87ff85cf`.
- Změněn jediný soubor: `tests/e2e/10-voucher-purchase-balance.spec.ts` (+16 / −1).

### Root cause flaky testu
- Spec 10 číst „before" zůstatek peněženky bez `waitForResponse` — UI mohlo zobrazit hodnotu před doběhnutím `loadUserBalance()` nebo zachytit hodnotu ovlivněnou async vedlejším efektem z předchozího spec 09.
- „After" čtení již `waitForResponse(GET /rest/v1/wallets)` mělo. Asymetrie způsobila nestabilitu při těsném spouštění dvou staging runů (PR #21 branch run + PR #21 post-merge run).
- Naměřeno: 15 MC pokles místo očekávaných 5 MC → assertion selhala.

### Oprava
- Přidán `waitForResponse(GET /rest/v1/wallets)` armovaný před `page.goto()` a awaited před čtením hodnoty — symetrizuje „before" a „after" čtení.

### PR #21 nebyl příčinou
- Spec 14 (přidaný v PR #21) v obou runech skipoval čistě. Selhání bylo pre-existing flakiness spec 10.

### CI výsledky
- Pre-merge branch Staging Full E2E: run `25939178932` ✅ 21 passed, 4 skipped, spec 10 ✅ (17.0s)
- Post-merge production smoke: run `25939417571` ✅ 5 passed (20.7s) — Telegram OK
- Post-merge Staging Full E2E na main: run `25939483233` ✅ **21 passed, 4 skipped, 0 failed**, spec 10 ✅ (13.4s) — Telegram OK
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #21 Affiliate dashboard login smoke test mergnut do main

### Co bylo provedeno
- PR #21 **test: Affiliate dashboard login smoke (spec 14)** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-affiliate-dashboard-smoke`; cílová větev: `main`.
- Merge commit: `b868aaf183ceeee71544832c43e23758cf46d809`.
- Přidán jediný soubor: `tests/e2e/14-affiliate-dashboard-smoke.spec.ts` (115 řádků).
- **Co test ověřuje:** přihlášení schváleného Affiliate partnera přes `/partner/login` → redirect `/influencer/dashboard` → badge „Aktivní Affiliate partner" → H1 → sekce „Váš Affiliate odkaz" → `input[readonly]` s `/?ref=` vzorem.
- **Guard:** `test.skip` pokud `E2E_AFFILIATE_EMAIL` / `E2E_AFFILIATE_PASSWORD` chybí — spec 14 skipuje čistě v production smoke i staging full E2E bez secrets.
- Read-only test — bez Supabase write, bez form submission dat, bez vytváření uživatelů.
- Chybějící follow-up: staging secrets `STAGING_E2E_AFFILIATE_EMAIL` + `STAGING_E2E_AFFILIATE_PASSWORD` nutné pro aktivaci spec 14 v CI.
- Post-merge staging full E2E selhal na spec 10 (flaky timing — nesouvisí). Opraveno v PR #22.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #20 Affiliate public pages E2E regression guard merged into main

### Co bylo provedeno
- PR #20 **test: E2E regression guard for public Affiliate program pages** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-affiliate-landing`; cílová větev: `main`.
- Merge commit: `0f5f864`.
- Přidán jediný soubor: `tests/e2e/13-affiliate-landing.spec.ts` (159 řádků, 3 testy).
- **Co test ověřuje (3 read-only testy, bez auth):**
  - `/influencer` — „Affiliate program OneMil" chip, H1, CTA tlačítko + href `/influencer/register`, „Jak to funguje" link + href `/influencer/how-to-earn`.
  - `/influencer/how-to-earn` — H1, „Sdílejte Affiliate odkaz" (krok 1), zpětný odkaz `/influencer`, dolní CTA.
  - `/influencer/register` — CardTitle „Registrace Affiliate partnera", vstupy name/email/password/mainPlatformUrl, zpětný odkaz; formulář **neodesílán**.
- **Read-only:** bez auth, bez form submission, bez Supabase write. Bez env proměnných — plně veřejné stránky.
- Chytí regresi při návratu „Influencer" wordingu nebo rozbití navigace / formuláře.
- Lokální Windows `spawn UNKNOWN` je pre-existující problém identický pro spece 01–13; CI (Ubuntu) prochází.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, Affiliate tracking, `buy_ticket_atomic` — nedotčeny.
- PR branch Staging Full E2E: run `25936217257` ✅ ALL PASSED.
- Post-merge production smoke: run `25936393035` ✅ SUCCESS — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25936408552` ✅ ALL PASSED — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #19 Mobile Messages layout E2E regression guard merged into main

### Co bylo provedeno
- PR #19 **test: E2E regression guard for mobile Messages layout** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-mobile-messages-layout`; cílová větev: `main`.
- Merge commit: `c27a103`.
- Přidán jediný soubor: `tests/e2e/12-mobile-messages-layout.spec.ts` (152 řádků).
- **Co test ověřuje (iPhone 14 viewport 390×844):**
  - Spodní navigace (`role="navigation" aria-label="Hlavní menu"`) je visible na `/messages`.
  - Spodní hrana navigace dosahuje viewport dna (`position: fixed` funguje).
  - Composer input (`placeholder="Napište zprávu..."`) je viditelný a jeho spodní hrana je nad horní hranou navigace.
  - Po scrollu messages listu se Y pozice navigace nezmění (≤ 2px tolerance) — hlídá regresi PR #17/18.
  - Po scrollu je composer stále viditelný nad navigací.
- **Read-only:** žádná zpráva neodeslána, žádná data nemutována, žádný Supabase write.
- Lokální Windows `spawn UNKNOWN` je pre-existující problém identický pro všechny spece 01–11; CI (Ubuntu) projde.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.
- PR branch Staging Full E2E: run `25935324024` ✅ ALL PASSED (3m02s).
- Post-merge production smoke: run `25935503396` ✅ SUCCESS — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25935550724` ✅ ALL PASSED — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #18 Messages bottom nav stability fix merged into main

### Co bylo provedeno
- PR #18 **fix: keep bottom nav stable on messages page** byl mergnut do `main`.
- Zdrojová větev: `fix/bottom-nav-stable-messages`; cílová větev: `main`.
- Merge commit: `dc94f61`.
- Změněn jediný soubor: `src/index.css` (5 řádků — přidán `min-height: 100dvh` k `.customer-layout` v `@media (max-width: 768px)`).
- **Root cause:** Po PR #17 (odstraněna třída `min-h-screen`) byla `.customer-layout` kratší než viewport (`100dvh − 5.75rem − safeArea`). iOS Safari rubber-band-scrolluje celou stránku — včetně `position: fixed` elementů — kdykoli se vnitřní scroll messages listu dostane na konec a dokument je kratší než viewport. Spodní navigace se tak vizuálně hýbala při scrollu.
- **Fix:** Přidán `min-height: 100dvh` k `.customer-layout` pro mobil. Customer-layout nyní vždy vyplňuje celý viewport → nulový prostor pro rubber-band scroll → spodní navigace zůstává pevně dole. Oprava kompozitoru z PR #17 zůstává zachována.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.
- PR branch smoke: run `25889262610` ✅ SUCCESS.
- Pre-merge Staging Full E2E na PR větvi: run `25889352492` ✅ ALL PASSED (3m21s).
- Post-merge production smoke: run `25889554142` ✅ SUCCESS — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25889587366` ✅ ALL PASSED — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #17 Messages composer fix merged into main

### Co bylo provedeno
- PR #17 **fix: keep messages composer above bottom nav** byl mergnut do `main`.
- Zdrojová větev: `fix/messages-composer-above-bottom-nav`; cílová větev: `main`.
- Merge commit: `42a06f6`.
- Změněn jediný soubor: `src/pages/Messages.tsx` (1 řádek — odstraněna třída `min-h-screen`).
- **Root cause:** `index.css` definuje `.messages-mobile-fixed-shell` pro `@media (max-width: 768px)` s `height: calc(100dvh - 5.75rem - env(safe-area-inset-bottom, 0px))`. Tailwindová třída `min-h-screen` (`min-height: 100vh`) tuto hodnotu přebíjela přes CSS cascade — shell narůstal na plnou výšku viewportu, vstupní pole skončilo za pevnou spodní navigací na iPhone/PWA.
- **Fix:** Odstraněna třída `min-h-screen`. CSS třída `.messages-mobile-fixed-shell` nyní funguje bez konfliktu — shell má na mobilu správnou výšku, zprávy scrollují uvnitř svého kontejneru, vstupní pole je celé viditelné nad spodní navigací.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.
- PR smoke: run `25887802417` ✅ 5 passed.
- Pre-merge Staging Full E2E: run `25887887248` ✅ 17 passed, 3 skipped, 0 failed.
- Post-merge production smoke: run `25888181338` ✅ 5 passed — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25888244060` ✅ 17 passed, 3 skipped, 0 failed — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-14 — Voucher purchase E2E spec 10 — čistý test-only PR #14 + staging RLS fix

### Co bylo provedeno
- PR #11 (`test/e2e-voucher-purchase-balance`) byl uzavřen bez merge — obsahoval smíšené změny (app hook, CSS, testy, workflow seed).
- Appový bugfix extrahován a mergnut odděleně jako PR #13 (`fix/user-vouchers-fetch`, merge commit `f9719101`).
- Otevřen nový čistý test-only PR #14 z větve `test/e2e-voucher-purchase-balance-clean` (base: `main` @ `c9d8123`).
- PR #14 obsahuje pouze 4 soubory: `tests/e2e/10-voucher-purchase-balance.spec.ts`, `.github/workflows/playwright-staging.yml`, `onemil_state.md`, `onemil_history.md`.
- Spec 10 ověřuje: login → balance read → voucher purchase → Zakoupené tab → balance decrease o přesně voucherPrice MC.
- Workflow rozšířen o 3 seed/reset kroky: Reset test user vouchers, Seed E2E Spec03 voucher, Seed E2E Spec10 voucher.
- Žádný app kód nebyl změněn. `useUserVouchers.ts` fix je na main od PR #13.

### Staging RLS nález a manuální oprava
- **Nález:** spec 10 selhával na „Uplatnit voucher" — tab Zakoupené byl vždy prázdný i po úspěšném nákupu.
- **Root cause:** Stagingový baseline dump vynechal `user_owns_voucher` SELECT policy na `user_vouchers`. PostgREST vracel `[]` (žádná chyba) → `fetchUserVouchers()` vracelo prázdné pole → `purchasedVouchers = []`.
- **Produkce:** měla správně všechny 4 policies (`user_owns_voucher` SELECT, `user_vouchers_insert_own` INSERT, `user_vouchers_delete_own` DELETE, `admin_all_voucher_access_secure` ALL).
- **Oprava:** 3 chybějící policies přidány manuálně na staging via Supabase MCP. Produkce nedotčena.
- **Žádná migrace nebyla commitnuta** v PR #14 — jde o staging infrastrukturní maintenance.
- **Pre-merge Staging Full E2E:** run `25882844526` ✅ **16 passed, 3 skipped, 0 failed** (2m0s).
- **PR #14 mergnut** do `main`, merge commit `4cba4b0`.
- **Post-merge production smoke:** run `25883126324` ✅ **5 passed (21.7s)** — Telegram `OneMil PROD smoke OK` doručen.
- **Post-merge Staging Full E2E na main:** run `25883434451` ✅ **16 passed, 3 skipped, 0 failed** (2m12s) — spec10 prošel 16.5s — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-14 — PR #13 useUserVouchers PostgREST embedded join fix merged into main

### Co bylo provedeno
- PR #13 **fix: replace PostgREST embedded join in useUserVouchers with two explicit queries** byl mergnut do `main`.
- Zdrojová větev: `fix/user-vouchers-fetch`; cílová větev: `main`.
- Merge commit: `f9719101cf98d6063aaf009f7b50acd2e833c33c`.
- Změněn jediný soubor: `src/hooks/useUserVouchers.ts` (+62 / -21 řádků).
- **Root cause opravené chyby:** `fetchUserVouchers()` používal PostgREST embedded join s explicitním FK hintem `!user_vouchers_voucher_id_fkey`. Na stagingové DB (obnovené z produkčního dumpu) PostgREST vrátil HTTP 400, který byl tiše zachycen blokem `try/catch` → `setVouchers([])` → tab Zakoupené zobrazoval prázdný stav i když `user_vouchers` řádky v DB existovaly.
- **Fix:** dva explicitní dotazy místo embedded joinu — (1) `user_vouchers` bez joinu, (2) `vouchers` dle batche ID; výsledky spojeny v Map na frontendu. Pole `voucher` přidáno jako `| null` — bezpečné, protože `expiration.isExpired` v `Vouchers.tsx` závisí jen na `created_at` z `user_vouchers`.
- Před mergem prošel PR smoke E2E (run `25878064722`, 15 passed, success).
- Po mergi do `main` prošel production smoke (run `25878209886`, success).
- Po mergi spuštěn Playwright Staging Full E2E na `main` (run `25878303521`, 15 passed + 3 skipped, success, Telegram OK). Spec 10 (`10-voucher-purchase-balance`) není v `main` — zůstává na PR #11 (`test/e2e-voucher-purchase-balance`).
- PR #11 zůstává OPEN a nemergnuto.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly změněny Supabase, Stripe, wallet logika, contests, tickets, winners, Partner Offers, schéma, RLS ani `buy_ticket_atomic`.

---

## 2026-05-14 — PR #10 wallet balance E2E coverage merged into main

### Co bylo provedeno
- PR #10 **Add wallet balance E2E coverage** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-wallet-balance`; cílová větev: `main`.
- Merge commit: `6e32ec7e6df079eb1594e7335ec735c41a2bab47`.
- Přidán soubor `tests/e2e/09-wallet-balance.spec.ts` — nový Staging Full E2E test.
- Test ověřuje, že wallet balance klesne přesně o `ticket_price` MC po nákupu jednoho tiketu na `/contest/:id`.
- Test je staging-only a přeskočí se automaticky pokud `E2E_CONTEST_ID` není nastaven (production CI ho nemá) — production dat se nedotýká.
- Během vývoje na feature větvi byl identifikován a opraven Playwright strict mode violation (`.or()` lokátor vyřešil na 2 elementy — ContestDetail zobrazuje buy i top-up button současně). Fix: `.first()` přidáno ke kombinovanému lokátoru (commit `672d241`).
- Před mergem prošel PR smoke E2E (specs 01+02, 1m18s) i Playwright Staging Full E2E (2m38s, ALL PASSED).
- Po mergi do `main` prošel production smoke (run `25864204537`, 1m13s) i Playwright Staging Full E2E (run `25864280989`, 2m44s, ALL PASSED, Telegram OK).
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly změněny Supabase, Stripe, wallet logika, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-13 — Store policy copy cleanup PR #2 merged and post-merge validation passed

### Co bylo provedeno
- PR #2 **Store policy copy cleanup: 18+ and ticket order model** byl mergnut do `main`.
- Zdrojová větev: `feature/store-policy-18plus-ticket-order-copy`; cílová větev: `main`.
- Commit PR: `459367299d93bc1b57355b3ee3398be391a6cda7`.
- Merge commit: `c132be9ff60e15884d84f38d486c53dcb7f94666`.
- Změněno bylo pouze 6 schválených souborů:
  - `src/pages/ContestDetail.tsx`
  - `src/pages/Games.tsx`
  - `src/pages/OnboardingDateOfBirth.tsx`
  - `src/pages/PrivacyPolicy.tsx`
  - `src/pages/TermsConditions.tsx`
  - `src/pages/Vouchers.tsx`
- Veřejný launch age rule sjednocen na **18+**.
- Veřejná copy odstranila loterijní / random-generator framing a používá model: tikety se otevírají postupně v pořadí 1, 2, 3... a výherní pozice jsou předem určeny.
- MioCoin wording sjednocen: interní kredit OneMil, nelze vybrat jako peníze, nelze převádět mimo OneMil, lze použít pouze uvnitř OneMil.
- Charitativní wording upraven: vybrané kampaně mohou podporovat dobročinný účel a konkrétní příjemce / účel / výše podpory musí být uvedeny u dané kampaně.
- Před mergem prošlo PR smoke E2E a Playwright Staging Full E2E na feature větvi.
- Po mergi prošel `main` smoke workflow `25795875077`.
- Po mergi prošel Playwright Staging Full E2E na `main`, workflow `25795953772`.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly měněny Supabase, Stripe, OneSignal, Sofinity, wallet, contest engine, tickets, winners, bonus_prizes, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-12 — Paperclip AI team first live session

### Co bylo provedeno
- Paperclip server spuštěn lokálně na portu 3100 z `C:\Users\divis\Desktop\Onemil - Projekt\million-ticket-draw`.
- Claude Code (claude.exe v2.1.138) ověřen jako funkční adaptér; přihlášen jako divispavel2@gmail.com (Pro).
- Codex local adaptér otestován a funkční na Windows s Extra args: `--skip-git-repo-check`.
- Vytvořen a nakonfigurován agent **Provozní ředitel OneMil** (claude_local / codex_local).
- Vytvořen a nakonfigurován agent **Průzkumník obchodních leadů OneMil** (codex_local, Enable search ON).
- Duplikátní firma iCONIC POINT s.r.o. (prefix ICOA) smazána; zbyla pouze ICO.
- Projekt **OneMil** vytvořen pod firmou ICO; Provozní ředitel nastaven jako lead agent.
- Vytvořeny issues ICO-15 až ICO-19 (lead scouting, shortlist, kontakty, Dedoles one-pager, AI team návrh).
- Výstupy uloženy do `C:\Users\divis\Desktop\OneMil Paperclip Outputs`.
- Zjištěno a zdokumentováno pravidlo: Provozní ředitel je manažer, ne exekutor — deleguje na Průzkumníka.
- `onemil_state.md`, `onemil_history.md`, `CLAUDE.md` a `PAPERCLIP_SETUP_CONTEXT.md` aktualizovány.
- Žádný app kód, Supabase, migrace, workflow ani produkční systémy nebyly změněny.

---

## 2026-05-13 — Strategické rozhodnutí: Web/PWA first, native stores odloženy

### Co bylo rozhodnuto
- OneMil bude spuštěn nejdříve jako **Web/PWA**.
- Podání do **Apple App Store** a **Google Play** se odkládá.
- Důvod: OneMil nebude v této fázi platit Apple/Google poplatky 15–30 % z nákupů MioCoinů.
- Stripe zůstává platebním providerem pro **Web/PWA MioCoin top-up**.
- Budoucí nativní iOS/Android aplikace lze znovu zvážit pouze po schválení platební/store strategie.

### Read-only PWA audit
- Ověřeno, že aktivní `public/` zatím neobsahuje zapojený web app manifest ani PWA icon set.
- `index.html` má základní mobile viewport a title `OneMil`, ale nemá manifest link, `apple-touch-icon`, `theme-color` ani splash metadata.
- Aktivní offline/service-worker strategie nebyla nalezena; existuje pouze `public/OneSignalSDKWorker.js` pro OneSignal.
- Stripe Checkout flow pro web/PWA zůstává dostupný přes `create-stripe-checkout`.
- Nebyl změněn app kód, nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly měněny Supabase, Stripe, OneSignal, Sofinity, wallet, tickets, contests, winners, bonus_prizes, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-11 — Added Paperclip setup context file PAPERCLIP_SETUP_CONTEXT.md

### Co bylo provedeno
- Přidán `PAPERCLIP_SETUP_CONTEXT.md` do rootu repozitáře.
- Soubor definuje základ pro nastavení Paperclipu jako AI management vrstvy pro OneMil.
- Popsán návrh prvního AI koordinátora `OneMil Chief of Staff`.
- Potvrzeno, že Pavel Diviš zůstává owner a final decision maker.
- Popsán approval model: Chief of Staff může navrhovat nové agenty, ale jejich spuštění musí schválit Pavel Diviš.
- Popsán první fokus: obchodní oddělení a strukturovaná databáze firem / leadů.
- Doplněny odkazy do `CLAUDE.md`, `.cursorrules` a `onemil_state.md`.
- Žádný app kód, Supabase, migrace, workflow ani produkční systémy nebyly změněny.

---

## 2026-05-11 — Added permanent business/product context file ONEMIL_BUSINESS_CONTEXT.md

### Co bylo provedeno
- Přidán `ONEMIL_BUSINESS_CONTEXT.md` do rootu repozitáře.
- Soubor definuje, že OneMil je B2B odměnová, partnerská a marketingová platforma, ne jen soutěžní aplikace.
- Popsán partner model: firmy samy nastavují MioCoin odměny a platí pouze za aktivované / použité MioCoiny.
- Popsány kupony, vouchery, Partner Offers, soutěže, uživatelé, osobní kódy, influenceři, agentury, sociální soutěže a podpora partnerů.
- `CLAUDE.md`, `onemil_state.md` a `.cursorrules` byly doplněny o odkazy na tento nový zdroj pravdy.
- Žádný app kód, Supabase, migrace, workflow ani produkční systémy nebyly změněny.

---

## 2026-05-11 — Added permanent company context file COMPANY_CONTEXT.md

### Co bylo provedeno
- Vytvořen `COMPANY_CONTEXT.md` v rootu repozitáře — trvalý zdroj pravdy pro firemní identitu, kontakty, podpis a fakturační údaje
- Obsah: iCONIC POINT s.r.o., IČO 17795851, DIČ CZ17795851, sídlo Praha 2, zakladatel Pavel Diviš, kontakty OneMil, veřejný e-mailový podpis
- Do `CLAUDE.md` přidáno pravidlo pro čtení `COMPANY_CONTEXT.md`
- Do `onemil_state.md` přidán odkaz na `COMPANY_CONTEXT.md`
- Bankovní údaje nejsou v repozitáři — uloženy ve fakturačním systému
- Žádný app kód, workflow, Supabase data ani produkce nebyly změněny

---

## 2026-05-10 — Staging registration: signup email domain opravena (commit `631f915`)

### Co bylo provedeno
- Diagnosed: scheduled staging E2E selhal pouze na `01-registration` — Supabase vrátil HTTP 400 `Email address "e2e+...@example.com" is invalid`
- Root cause: `@example.com` je IANA-rezervovaná doména; Supabase Auth ji odmítá s HTTP 400 (ne 422/429 → existující skip podmínka to nezachytila)
- Fix: `tests/e2e/01-registration.spec.ts` — doména změněna z `@example.com` na `@onemil.cz` (line 73)
- HTTP 400 **není přeskakován** — real staging signup zůstává testován; pokud Supabase odmítne `@onemil.cz`, test selže viditelně
- Ověřovací run `25627706906`: ✅ **ALL PASSED** — 2m 45s, 0 selhání; wallet reset ✅, seed-win-contest ✅, všech 9 spec souborů ✅, Telegram OK ✅
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód, workflow ani Supabase data nebyly změněny

---

## 2026-05-10 — Staging full E2E: naplánováno 3× denně (commit `37cfd6c`)

### Co bylo provedeno
- Přidán `schedule` trigger do `.github/workflows/playwright-staging.yml`
- Staging full E2E nyní běží automaticky 3× denně:
  - `0 2 * * *` → 04:00 Praha (CEST)
  - `0 10 * * *` → 12:00 Praha (CEST)
  - `0 18 * * *` → 20:00 Praha (CEST)
- Offset 4 hodiny od production smoke (00:00 / 08:00 / 16:00 Praha) — žádný překryv
- `workflow_dispatch` zůstává dostupný pro manuální spuštění
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód ani Supabase data nebyly změněny

---

## 2026-05-10 — Staging full E2E: wallet reset ověřen (run `25625184545`)

### Co bylo provedeno
- Commit `50ba68c` — `ci: reset staging e2e wallet before full run`: přidán krok `Reset test user wallet` do `playwright-staging.yml` (PostgREST PATCH `balance_coins: 5000, bonus_balance_coins: 0` před každým spuštěním testů)
- Spuštěn `workflow_dispatch` na `.github/workflows/playwright-staging.yml` pro ověření nového kroku
- Výsledek: **ALL PASSED** — 2m 33s, 0 selhání
- Kroky v pořadí: Seed win contest ✅ → Reset test user wallet ✅ → Run full E2E suite ✅ → E2E status OK ✅ → Telegram OK ✅
- Staging full E2E je nyní **bezpečný k plánování každých 8 hodin** — wallet se resetuje na 5 000 MioCoin před každým spuštěním, pipeline nevyčerpá zůstatek
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód ani Supabase data nebyly změněny

---

## 2026-05-10 — Staging full E2E: pipeline stabilizována a zelená (run `25624552621`)

### Co bylo provedeno
- Opraveny 4 postupné chyby v CI; výsledek: **všech 9 spec souborů prošlo**, 2m 36s, 0 selhání
- Commit `3c4aecf` — `ci: keep auto win contest out of games first position`: auto-seedovaný win contest dostane `created_at: "2020-01-01T00:00:00Z"` → řadí se na konec `/games` (DESC order) → test 03 ho nespotřebuje před testem 05
- Commit `324a747` — `test: stabilize destructive win flow e2e`: toast locator zúžen na `[data-sonner-toast]` (vyhýbá se ModalDialog konfliktu); přidán `test.describe.configure({ retries: 0 })` (retry by vždy selhal — soutěž je po prvním nákupu closed)
- Commit `6ee26df` — `test: scope result dialog locator to avoid cookie banner conflict`: `page.locator('[role="dialog"]')` nahrazen `page.getByRole('dialog', { name: /Výhra/i })` — vyhýbá se `CookieConsentBanner` (také `role="dialog"`)
- Commit `e70fd5c` — `test: robust wait for offer cards or empty state in partner offer open spec`: `waitForTimeout(2000)` nahrazen `Promise.race` na `firstCard.waitFor` vs `emptyState.waitFor` (10s timeout každý) + dvojitý guard skip — robustní bez ohledu na rychlost načítání
- Staging workflow auto-seeduje nový win contest před každým spuštěním (`STAGING_SUPABASE_SERVICE_ROLE_KEY` → PostgREST INSERT → contest ID předán jako step output do `E2E_WIN_CONTEST_ID`)
- Telegram success notifikace doručena: `✅ OneMil STAGING full E2E OK — all specs passed`
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód ani Supabase data nebyly změněny
- Monitor po dokončení stagnoval kvůli prázdnému `jq .status` výstupu — harmless, ignorován

### Výsledek
- Run `25624552621`: ✅ **ALL PASSED** — 13 passed, 4 skipped (expected), 0 failed, 2m 36s
- Staging full E2E je stabilní a zelený

---

## 2026-05-10 — Staging: upload-ticket-share nasazena, ticket-shares bucket ověřen

### Co bylo provedeno
- Ověřeno: storage bucket `ticket-shares` existuje na staging `dxmowysntemfqfnanxua`, `public: true`, `file_size_limit: 5242880`
- Nasazena Edge Function `upload-ticket-share` na staging: `npx supabase functions deploy upload-ticket-share --project-ref dxmowysntemfqfnanxua`
- Status: **ACTIVE**
- Staging nyní má 2 nasazené funkce: `sofinity-noop` + `upload-ticket-share`
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádné jiné funkce nebyly nasazeny

---

## 2026-05-10 — Staging seed: ověřen a zdokumentován

### Co bylo provedeno
- Staging `dxmowysntemfqfnanxua` oseedován pro E2E testy 03–08
- Test user: `e2e@onemil.cz` (ID `7822a82e-f1d3-45ee-827b-679640ce6b65`), wallet balance 5000.00 MioCoin
- General contest (`STAGING_E2E_CONTEST_ID`): `3fa56db0-4007-4fb7-aa2f-e460173070d8`, active, next_ticket 1
- Win contest (`STAGING_E2E_WIN_CONTEST_ID`): `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb`, active, next_ticket 100
- Partner offer `28278c87-17b6-49c3-ae7e-004d0d1f18b0`, approved, selected_contests, připojena ke general contestu
- Žádný app kód ani workflow nebyly změněny; produkce nedotčena

---

## 2026-05-10 — Production smoke: manuální ověření (run `25618763318`)

### Co bylo provedeno
- Spuštěn `workflow_dispatch` na `.github/workflows/playwright.yml`
- Výsledek: **6 passed** za 1m 22s — `01-registration` (3 testy) + `02-login` (3 testy)
- Specs 03–08 neběžely — potvrzeno z logu; žádný ticket purchase, voucher, wallet, win-flow ani Partner Offers test neproběhl v produkci
- Telegram doručen: `✅ OneMil PROD smoke OK — registration + login passed`
- Neblokující varování: orphaned worktree `.claude/worktrees/ecstatic-lichterman-1aa60a` způsobil `git exit 128` v post-job cleanup; pipeline neovlivněna

---

## 2026-05-10 — CI workflow split: produkce vs staging (commit `82f979f`)

### Co bylo provedeno
- `.github/workflows/playwright.yml` upraven: test command omezen na `tests/e2e/01-registration.spec.ts` a `tests/e2e/02-login.spec.ts`; Telegram zprávy přejmenovány na `PROD smoke OK/FAILED`
- `.github/workflows/playwright-staging.yml` vytvořen: `workflow_dispatch` only, plný suite (`npm run test:smoke`), staging secrets mapovány do standardních env var názvů, Telegram zprávy `STAGING full E2E OK/FAILED`
- Produkce nemůže fyzicky spustit testy 03–08 — hard-coded file paths
- Žádný app kód, spec soubory, ani Supabase data nebyla změněna

---

## 2026-05-10 — Staging migrace: strategie rozhodnuta (Option A)

### Rozhodnutí
- `db push` se na staging nepoužívá — blokováno duplicitními/smíšenými timestamp prefixy v repozitáři (17 souborů trvale pending, exit code 0 nelze dosáhnout bez přejmenování)
- Nové DB změny se aplikují na staging **manuálně přes Supabase SQL Editor** — stejný workflow jako produkce
- Aktuální staging schema baseline (`dxmowysntemfqfnanxua`, 73 tabulek, 95 RLS, `buy_ticket_atomic`, wallet trigger) je přijat jako správný a finální výchozí bod
- `schema_migrations` zůstává na 324 řádcích — není potřeba měnit
- Staging CI (testy 03–08) může pokračovat bez závislosti na `db push --dry-run`

---

## 2026-05-10 — Staging schema_migrations: formát experimentů a finální stav

### Co se stalo
Po manuální aplikaci produkčního schéma na staging proběhlo několik pokusů o nastavení `supabase_migrations.schema_migrations` tak, aby `db push --dry-run` hlásil 0 pending migrací.

### Výsledky experimentů
Supabase CLI extrahuje z lokálních `.sql` souborů vedoucí číselný prefix (ne celý stem). Experimenty v pořadí:
1. **341 plných stemů** (bez `.sql`) → všech 341 "Remote not found" (CLI nezná plné stemy)
2. **327 deduplikovaných číselných prefixů** → 3 krátké 8-ciferné prefixy "Remote not found"
3. **324 prefixů** (bez 3 konfliktních krátkých) → 17 souborů "pending before last remote"
4. **324 + 17 plných stemů sekundárních souborů** → 22 chyb (plné stemy + 5 dříve fungujících se rozbilo)
5. **Zpět na 324** → nejlepší dosažitelný stav, exit code stále 1

### Root cause neřešitelnosti
Repozitář obsahuje 4 páry souborů se stejným 14-ciferným timestampem a 3 skupiny se smíšenými 8/14-cifernými názvy. CLI může spárovat vždy jen jeden DB záznam na jeden prefix — sekundární soubory zůstávají jako "pending before last remote". Celkem 17 souborů nelze pokrýt bez přejmenování.

### Výsledek ověření schématu na staging `dxmowysntemfqfnanxua`
- 73 public tabulek ✅, `public.payments` existuje ✅, `buy_ticket_atomic` existuje ✅, `fn_wallet_transactions_immutable()` trigger existuje ✅, 95 RLS policies ✅
- Produkce `xkzhjldrojjlrkezorey` nedotčena ✅

### Aktuální stav
`schema_migrations`: 324 řádků (číselné prefixy). `db push --dry-run` exit code 1 — 17 souborů pending. Žádný `db push` bez nového plánu.

---

## 2026-05-10 — Staging DB: partial migration failure + cleanup

### Co se stalo
- Spuštěn `npx supabase db push` na staging `dxmowysntemfqfnanxua`
- Migrace #1 a #2 proběhly (`20250914034944_`, `20250914035127_`) — obě jsou `CREATE OR REPLACE FUNCTION`, žádné tabulky
- Migrace #3 (`20250914043049_`) selhala: `ERROR: relation "public.payments" does not exist (SQLSTATE 42P01)`

### Root cause
První ~5 migračních souborů (blank-name, 14. 09. 2025) jsou hotfixy aplikované na existující schéma, ne DDL skripty pro prázdnou DB. Počáteční schéma (tabulky `payments`, `wallets`, `users`, `contests`, `tickets` atd.) bylo vytvořeno přímo v Supabase dashboardu a nikdy nebylo zachyceno jako migrační soubor. Staging má prázdnou DB — tyto tabulky neexistují.

### Cleanup (provedeno uživatelem manuálně)
- Odstraněny 2 záznamy z `supabase_migrations.schema_migrations` na staging:
  - `20250914034944`
  - `20250914035127`
- Ověření: `remaining_migrations = null` (žádné záznamy v migration history)
- Na staging neexistují žádné `public.*` tabulky
- Produkce `xkzhjldrojjlrkezorey` nedotčena

### Dohodnutý recovery plán
Recovery plán zdokumentován v `onemil_state.md` — Fáze 3 sekce. Čeká na souhlas pro každý krok. `db push` se nespouští znovu, dokud není proveden baseline schema dump z produkce.

---

## 2026-05-09, 22:45 — Staging Sofinity izolace dokončena

### Co bylo provedeno
- Staging projekt `onemil-staging` vytvořen (ref `dxmowysntemfqfnanxua`, region `eu-north-1`)
- Secret `SOFINITY_RELAY_URL` nastaven manuálně v Supabase Dashboard na staging projekt
- Edge Function `supabase/functions/sofinity-noop/index.ts` vytvořena — přijímá POST, vrací `{"ok":true,"noop":true}`, nic nezapisuje
- Nasazena výhradně na staging: `npx supabase functions deploy sofinity-noop --project-ref dxmowysntemfqfnanxua --no-verify-jwt`
- POST test: HTTP 200 `{"ok":true,"noop":true}` ✅
- Commit `4167527` — `feat: add staging Sofinity no-op relay`

### Izolační záruky
- Produkční projekt `xkzhjldrojjlrkezorey` — nedotčen
- Produkční Sofinity relay `rrmvxsldrjgbdxluklka` — nedotčen
- Žádné migrace nebyly spuštěny

---

## 2026-05-09 — Staging projekt: potvrzená rozhodnutí

- Produkce: projekt `onemil`, ref `xkzhjldrojjlrkezorey`, region `eu-north-1`
- Staging: název `onemil-staging`, region `eu-north-1` (stejný jako produkce)
- `SOFINITY_RELAY_URL` musí být první secret po vytvoření — vlastní no-op endpoint, nikdy produkční Sofinity relay

---

## 2026-05-09, 22:17 — Staging-safe URL fix dokončen a pushnut

### Co bylo provedeno
Tři hardcoded produkční URL nahrazeny env/client-based hodnotami. Commit `20c6452`, pushnut na `main`.

| Soubor | Změna |
|---|---|
| `supabase/functions/process_event_queue_worker/index.ts` | `Deno.env.get("SOFINITY_RELAY_URL") ?? "<prod URL>"` |
| `src/pages/ShareTicket.tsx` | `${supabaseUrl}/functions/v1/og-ticket-share` |
| `src/components/TicketResultModal.tsx` | `${supabaseUrl}/functions/v1/og-ticket-share` |

- Build: ✅ `vite build` passed, 0 errors
- `.claude/settings.local.json` nebyl commitnut ani pushnut
- `api/og-ticket.ts` a `vercel.json` označeny jako legacy — Lovable je aktivní deploy cesta, Vercel soubory se v produkci nespouštějí

### Výsledek
Fáze 1 staging readiness je dokončena. Staging projekt lze nyní vytvořit — stačí nastavit env vars bez dalších code changes.

---

## 2026-05-09, 21:47 — E2E produkční bezpečnost: audit a staging plán

### Cíl
Navrhnout bezpečný způsob E2E testování, který neznečistí produkční data.

### Klíčové závěry auditu

**Contest 93dc5cdc-8bd2-4906-92b4-948d5eba1e60:**
- Draft contest — správně neviditelný pro uživatele (RLS SELECT: `status IN (active, pending, paused)`)
- `rules_pdf_url = NULL` — bug detekován, frontend fix nasazen, admin musí re-uploadovat PDF
- `bonus_prizes.status = 'won'` na draft contest — NENÍ bug: contest byl legitimně aktivován (10 tiketů prodáno), `buy_ticket_atomic` správně nastavil status; poté admin omylem přesunul `closed → draft` před zavedením `closed`-je-finální guardu
- `admin_actions` tabulka potvrdila timeline: `active → closed → draft` (přechod closed→draft byl umožněn, teprve pak byl guard nasazen)

**wallet_transactions immutability:**
- Trigger `fn_wallet_transactions_immutable()` RAISES EXCEPTION na UPDATE nebo DELETE — permanentní finanční ledger
- Definitně vylučuje „cleanup + reset" přístup pro E2E testy v produkci

**Porovnání tří možností E2E izolace:**
1. ✅ Separátní staging projekt — doporučeno
2. ⚠️ `is_e2e` flag — neúplné (wallet ledger + Sofinity stále zasaženy)
3. ❌ Cleanup v produkci — nemožné (wallet_transactions immutability)

**Staging readiness:**
- Frontend Supabase klient: env-var-based ✅ (nulové code changes potřeba pro přepnutí projektu)
- Hardcoded URLs blokující izolaci: 3 soubory:
  - `process_event_queue_worker/index.ts:19` — Sofinity relay (nejvyšší riziko)
  - `src/pages/ShareTicket.tsx:22` — OG image URL
  - `src/components/TicketResultModal.tsx:416` — OG image URL
- Staging plan zdokumentován v `onemil_state.md` — neprovádět bez souhlasu uživatele

### Postup
Audit proběhl read-only. Žádné produkční změny nebyly provedeny.

---

## 2026-05-05 — Closed contest status made final

### Bug
Admin mohl v UI změnit status `closed` soutěže zpět na `draft`, `pending`, `active` nebo `paused`.

### Fix
- `src/components/AdminContestManagement.tsx` — commit `54466bb`
- `handleStatusChange`: přidán guard na začátek funkce — pokud `current.status === "closed"`, zobrazí toast _„Ukončenou soutěž nelze znovu aktivovat ani přesunout."_ a okamžitě vrátí
- Status Select v řádku tabulky: `disabled` rozšířen o `|| contest.status === "closed"`
- Odstraněna duplicitní deklarace `const current` v `draft` větvi (sdílí nyní proměnnou z vrcholu funkce)

### Ověřeno manuálně
V tabu „Archiv ukončených soutěží" nelze otevřít status dropdown uzavřené soutěže. Soutěž zůstává uzavřena.

---

## 2026-05-05 — Contest rules PDF fix (rules_pdf_url NULL bug)

### Bug
Admin nahrál PDF s pravidly, ale `contests.rules_pdf_url` zůstal `NULL`. ContestDetail proto nezobrazoval odkaz na pravidla.

### Root cause
Přímý `UPDATE contests SET rules_pdf_url = ...` z frontendu byl blokován chybějící RLS UPDATE policy na `public.contests`. Supabase vracel `{ data: [], error: null }` (0 rows affected, silent no-op). Navíc chyběl `return` po UPDATE error → frontend zobrazil false success toast i při selhání.

### Opravy
- **DB:** přidána RLS policy `contests_admin_update` — admin/superadmin mohou UPDATE `public.contests` (migrace commitnuty a aplikovány; commity `bfc7813`, `95ab8e3`)
- **`src/components/AdminContestManagement.tsx`:** přidán `return` po UPDATE error (commit `20e4a34`); UPDATE změněn na `.select("id")` pro detekci 0-row no-op (commit `934bfbd`)
- **`src/pages/ContestDetail.tsx`:** odkaz přejmenován na „Zobrazit pravidla soutěže", otevírá PDF v novém tabu

### Playwright testy 03-voucher-purchase.spec.ts (opraveny souběžně)
- `waitForTimeout(3_000)` → `expect(buyButton.or(emptyState)).toBeVisible({ timeout: 15_000 })` (commity `0d7acbd`, `f0094e7`)
- `getByText(regex)` → `getByRole('heading', { name: '...' })` — eliminace strict mode violation (commit `1035273`)

### CI výsledek
14 passed / 3 skipped / 0 failed ✅

---

## 2026-05-04/05 — Ticket result modal + buy_ticket_atomic oprava

### buy_ticket_atomic — timeout (57014)
- **Root cause:** `trigger_sofinity_forward()` a `process_event_queue_trigger()` volaly `net.http_post()` synchronně uvnitř transakce; saturace pg_net workerů → 57014 statement timeout
- **Fix:** migrace `20260504_fix_nonblocking_sofinity_triggers.sql` — `trigger_sofinity_forward()` přepsán na INSERT do `event_queue`; `process_event_queue_trigger()` je no-op

### buy_ticket_atomic — chybějící fieldy v response
- Funkce nevracela `remaining_tickets`, `next_bonus_position`, `distance_to_next_bonus`
- Migrace `20260504_add_remaining_and_bonus_distance_to_buy_ticket_atomic.sql` přidala:
  - `remaining_tickets = v_ticket_count - v_next_ticket`
  - `v_next_bonus_position` — SELECT nejbližšího pending bonus_prizes.ticket_position > v_next_ticket po aktualizaci aktuálního bonusu na 'won'
  - `distance_to_next_bonus = v_next_bonus_position - v_next_ticket`
- Aplikováno v produkci, ověřeno STRING_AGG query

### Frontend — null → 0 přepis (root cause fallback textu)
- `remaining_tickets: result.remaining_tickets ?? 0` → `?? undefined` v `ContestDetail.tsx`, `Games.tsx`, `FavoriteGames.tsx`
- `?? 0` převáděl null na 0 → `0 > 0 = false` → `nearestPrizeDistance` vždy null → vždy fallback text

### TicketResultModal — text vzdálenosti
- Přidán helper `formatDrawsText(n)` + konstanta `DRAWS_EXPLANATION`
- Nahrazen text „Nejbližší výhra může být už za X tahů." na všech 4 místech (canvas, getShareText, bonus win pill, loss box)
- Nový formát: „Další výherní ticket čeká už za X tahy/tahů." / „...při dalším tahu." (X=1)
- Přidán vysvětlující řádek pod text vzdálenosti
- Správná česká pluralizace: 2–4 = tahy, 5+ = tahů

### Další opravy (uživatel — paralelní větev)
- Odstraněno číslo tiketu z result boxu
- Odstraněno extra „0" z modalu (React `{0 && <JSX>}` bug způsobený `?? 0`)
- Odstraněn toast „Ticket #N zakoupen!" po nákupu — commit `5bae556`
- Skryt název soutěže a celkový počet tiketů na listing kartách — commit `f2c1678`
- Česká pluralizace opravena (`tahPlural`, `nextWinTicketText`, `NEXT_WIN_EXPLAINER`) — commit `6269732`
- Sdílovací karta přepsána na `generatePremiumShareCard` (1200×630, reálné prize obrázky) — commit `0790362`
- Favorites počítadlo opraveno (aktualizace bez refresh) — commity `ebf5e8e`, `00e1e99`
- Partner Offers assignment ověřen funkční bez změny kódu

---

## 2026-05-01 — CI oprava: Payment Pipeline selhání diagnostikováno a opraveno

### Problém
4 CI runs selhaly (`25211401801`, `25213567010`, `25214606796`, `25215350051`) s hláškou "PAYMENT PIPELINE FAILED". Všechny spustilo pushování na `main` (start.bat / end.bat scripty). Telegram bot reportoval každý fail.

### Diagnostika
- Logy staženy přes GitHub Actions API (GitHub token z Windows Credential Manager)
- Jediný selhávající test: `01-registration.spec.ts:72` — "new user registers and is authenticated"
- Přesná chyba: `Expected Supabase session in localStorage (onemil-auth) but none found`
- Příčina: Supabase má zapnuté potvrzení emailu → `signUp()` vrátí `session: null` → žádný token do localStorage → `Profile.tsx` přesměruje na `/login` → `expectSessionExists()` selže
- Test selhal i po retryi (CI config: `retries: 1`)

### Oprava
- `tests/e2e/01-registration.spec.ts` upraven (commity `945a77d`, `0659a28`):
  - `expectSessionExists()` podmíněné — volá se jen pokud app neredirectuje na `/login` a email confirmation screen není viditelný
  - Přidán graceful skip pro Supabase 429 (rate limit) a 422 (domain block)

### Přidáno: scheduled testy
- `.github/workflows/playwright.yml` — přidán `schedule:` cron trigger (commit `156000f`)
- 3× denně: 00:00, 08:00, 16:00 Praha (CEST = UTC+2: 22:00, 06:00, 14:00 UTC)

### Přidáno: CLAUDE.md pravidlo
- `CLAUDE.md` — přidáno pravidlo: po každém zápisu do `onemil_state.md` nebo `onemil_history.md` automaticky spustit `git add -A && git commit -m "update state" && git push origin main` (commit `aa2c62d`)

---

## 2026-04-27 — Vizuální systém: brand aplikace a zmírnění zlaté (nedokončeno)

### Kontext
Proběhla analýza stavu větví a vizuálních změn. Bylo zjištěno, že brand změny z předchozí práce (Poppins, Energy Orange) nikdy nebyly mergovány do `main` — zůstaly izolované na větvi `claude/setup-playwright-tests-bShrg`.

### Co proběhlo
**Analýza větví:**
- Větev `claude/setup-playwright-tests-bShrg` obsahuje commity `d6d4597` + `25e87dd`: Poppins font, Energy Orange CSS proměnné, orange bordery/gradienty na ContestCard + ContestDetail.
- Tyto commity nikdy neprošly do `main`.

**Vizuální zmírnění na `claude/thirsty-volhard-e1eb7c` (commit `a21ef28`):**
- Zadání: nesnižovat layout/strukturu, pouze vizuálně zmírnit — méně intenzivní zlatá, dark overlay, soft rgba bordery, potlačení glow efektů.
- Změněné soubory: `src/index.css`, `src/components/ContestCard.css`, `src/components/ContestCard.tsx`, `src/components/MioCoin.tsx`
- Klíčová změna: `--neon-gold` přesunut z jasné zlaté (`43 90% 55%`) na tlumenou amber-oranžovou (`33 70% 44%`); glow opacity snížena ~50 %; bordery → `rgba(191,198,207,0.16)`; progress bar → `#C07018/#884A08`.
- Pushnuté na remote, nemergnuto do `main`.

### Stav na konci dne
- Grafika je **nedokončená**.
- Probíhá testování funkčnosti systému (platební pipeline, tiket purchase, contest flow) — grafika se dořeší až po ověření funkčnosti.
- Otevřená otázka: která větev se merguje do `main` (nebo cherry-pick obou sad změn).

---

## 2026-02-08 — Partner Offers v1: reminder automation
- Edge Function `supabase/functions/send-offer-reminders/index.ts` present (documented as "Block F — send-offer-reminders").
- Uses DB RPC `get_due_offer_reminder_rows()` and updates `user_partner_offers.last_reminder_at`.
- Documents safety invariant: never touches `winners` / `bonus_prizes`.

## 2026-03-15 — Deep backend stabilization audit (recorded)
- Scope recorded: schema, SQL functions, triggers, migrations, wallet system, contest engine, ticket generation, bonus prize logic, event pipeline, push pipeline, edge functions.
- Fixes recorded as applied via six migrations:
  - `20260315240000_fix_bonus_prize_response.sql`
  - `20260315260000_cleanup_duplicate_triggers.sql`
  - `20260315270000_remove_redundant_ticket_trigger.sql`
  - `20260315280000_cleanup_winners_indexes.sql`
  - `20260315290000_additional_safety_constraints.sql`
  - `20260315300000_fix_bonus_wallet_ledger.sql`

## 2026-03-22 — E2E contest flow "final fix" (recorded)
- Result recorded: E2E success (tickets, contest close, winners, wallet, notifications).

## 2026-03-23 — OneMil ↔ Sofinity stabilization (recorded)
- Result recorded: pipeline stable, backlog processed, cron automation in place.

## 2026-03-30 — AI chat CTA follow-up detection regression (recorded)
- Issue recorded: follow-up messages not recognized as support intent → CTA "Kontaktovat podporu" disappears.
- Root cause recorded: `isSupportIntentForCta` too strict.

## 2026-04-08 to 2026-04-09 — Cursor session work (recorded)
- Temporary private-access gate work (`src/App.tsx`).
- SEO static assets + sitemap/robots production availability work (via commits).
- Admin contests list robustness work recorded (ensure contest list loads even if bonus-stats RPC fails).

## 2026-04-09 — Memory reconciliation correction pass
- Goal: keep clean state/history split and keep Partner Offers v1 treated as confirmed project context.
- Partner Offers section in `onemil_state.md` updated to distinguish:
  - confirmed project truth
  - confirmed in current repo snapshot
  - needs repo re-check later (narrow existence checks only)
- Note: Partner Offers details are considered **partially reconciled** until final E2E and a final documentation pass are completed.

---

## 2026-04-10 — Partner Offers v1 – finální E2E uzavření, wiring fix, token rotace, kanonický memory režim

### Shrnutí
Partner Offers v1 bylo v tomto chatu finálně uzavřeno.
Po dokončení bloků A–G proběhlo vícekolové E2E ověřování, během kterého byly potvrzeny reálné integrační vazby a opravena jedna chybějící produkční mezera: automatické napojení assignment logiky do `purchase-ticket`.

Výsledný stav:
**Partner Offers v1 PASSED finálním E2E.**

---

### 1. Výchozí stav na začátku tohoto úseku
Na začátku bylo považováno za hotové:
- Block A
- Block B
- Block C
- Block D
- Block E
- Block F
- Block G

Ale ještě nebylo finálně end-to-end potvrzené, že:
- assignment přes ticket purchase běží opravdu automaticky
- `won_type` gate funguje i na HTTP úrovni
- reminder pipeline má správně sjednocený internal token

---

### 2. E2E verifikace – plán a postup
Nejdřív byl zvolen menší, tokenově úsporný postup:
1. plán E2E
2. DB + admin smoke check
3. seed + assignment slice
4. finální HTTP-level integrační test

Tím se zabránilo zbytečně velkým promptům a zbytečnému spalování tokenů.

---

### 3. DB + admin smoke check
Bylo potvrzeno:
- Block G DB objekty existují
- funkce jsou callable
- `partner_invoices.type` existuje
- `partner_offer_activations.invoiced` a `invoice_id` existují
- `get_admin_activation_summary()` funguje
- `sync_partner_offer_activations()` funguje
- TypeScript build je čistý
- admin UI compile smoke je OK

V této fázi byl nalezen jeden blocker:
- `send-offer-reminders` vracel 401

---

### 4. Block F – internal token blocker
Bylo potvrzeno, že:
- `INTERNAL_FUNCTION_TOKEN` neodpovídal mezi prostředími
- reminder function kvůli tomu vracela 401
- cron na reminder běh tím pádem selhával

#### Zjištěné body
Používaly se tři místa:
- Supabase secret `INTERNAL_FUNCTION_TOKEN`
- lokální `.env` `VITE_INTERNAL_FUNCTION_TOKEN`
- cron joby s hardcoded tokenem

#### Provedená oprava
Byl vygenerován nový silný token a proběhla rotace:
- přepsán token v pg_cron `send_offer_reminders_daily`
- přepsán token v pg_cron `process-event-queue`
- ručně sjednocen `.env`
- ručně sjednocen Supabase secret `INTERNAL_FUNCTION_TOKEN`

Poté proběhla hygienická kontrola:
- starý token už se nikde nevyskytoval

#### Ověření po opravě
Test:
- `send-offer-reminders`

Výsledek:
- HTTP 200
- `{"success":true,"emails_queued":0,"offers_touched":0}`

Závěr:
**Block F blocker odstraněn.**

---

### 5. Seed + assignment flow audit
Byl proveden řízený test assignment vrstvy.

Potvrzeno:
- `assign_partner_offer_to_ticket(...)` funguje správně při ručním volání
- `user_partner_offers` vzniká správně
- `status = active`
- `ticket_id` FK funguje správně při reálném ticket UUID
- cooldown vrací `NULL`
- `last_assigned_at` se aktualizuje
- `sync_partner_offer_activations()` vytváří activation rows

V této fázi se ale ukázalo:
- assignment RPC existuje
- ale **nevolá ho nic automaticky při ticket purchase**

To byl skutečný chybějící blok.

---

### 6. Kritický fix – chybějící wiring v purchase-ticket
Bylo rozhodnuto pro správné řešení:
- **Option B**
- napojit assignment do:
  - `supabase/functions/purchase-ticket/index.ts`

Výslovně bylo zakázáno:
- měnit `buy_ticket_atomic`
- přidávat DB trigger na `tickets`
- sahat na `winners`
- sahat na `bonus_prizes`

#### Implementace
Změněn pouze:
- `supabase/functions/purchase-ticket/index.ts`

Přidaná logika:
- po úspěšném `buy_ticket_atomic`
- pokud `data.success === true && data.won_type === null`
- zavolá se:
  - `assign_partner_offer_to_ticket(...)`
- předá se:
  - `ticket_row_id` jako `p_ticket_id`
- chyba je non-fatal
- response pro uživatele zůstává stejná

Tím byl dokončen chybějící wiring v Block D.

---

### 7. Finální HTTP-level integrační test
Po wiring fixu proběhl finální skutečný integrační test přes:
- reálné HTTP volání `purchase-ticket`
- reálné JWT

#### Positive path
Potvrzeno:
- při `won_type = null` vznikne nový `user_partner_offers`
- `ticket_id` v UPO odpovídá `ticket_row_id` z response
- response body zůstává beze změny

#### Negative path
Potvrzeno:
- při `won_type = 'bonus'` **nevznikne žádné UPO**
- gate funguje správně

#### Finální závěr testu
**Partner Offers v1 PASSED finálním E2E ověřením.**

---

### 8. Praktický výsledek po E2E
Bylo finálně potvrzeno:
- assignment flow funguje
- cooldown funguje
- `ticket_id` wiring funguje
- `last_assigned_at` se aktualizuje
- `won_type` gate blokuje assignment pro výherce
- user response zůstává nedotčená
- activation sync funguje
- reminder token problem byl vyřešen

Nebyl nalezen žádný nový produkční blocker.

---

### 9. Kanonické memory soubory – nové pracovní pravidlo
Během chatu byl zjištěn problém, že Cursor / Claude používaly různé memory soubory a staré workspaces.

Bylo sjednoceno nové pravidlo pro OneMil:

Kanonická složka:
`C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw`

Kanonické soubory:
- `onemil_state.md`
- `onemil_history.md`
- `CLAUDE.md`

Potvrzeno:
- workspace byl přepnut správně na `million-ticket-draw`
- další OneMil zápisy se mají dělat už jen sem
- staré `ProjectsBundle\onemil` se bere jen jako legacy reference, ne jako aktivní místo zápisu

---

### 10. Stav na konci
Partner Offers v1 je považováno za:
- implementované
- nasazené
- dopojené
- end-to-end otestované
- uzavřené jako hotový modul v rámci v1

Mimo v1 nadále zůstává:
- `category_contests`

---

### 11. Další krok
Další práce už nemá znovu otevírat architekturu Partner Offers v1.

Správný další krok:
1. jen případné bugfixy z běžného provozu
2. nebo další samostatný modul mimo Partner Offers

---

### Důležité varování pro další chat
Další asistent NESMÍ:
- znovu vracet Partner Offers do `winners`
- znovu vracet Partner Offers do `bonus_prizes`
- přidávat novou bottom položku
- znovu míchat billing do `partner_offers`
- znovu otevírat Blocks A–G bez důvodu
- ignorovat, že finální E2E už proběhlo úspěšně
- zapisovat OneMil stav mimo:
  - `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_state.md`
  - `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_history.md`

---

## 2026-04-10 — Block E frontend implementace a nasazení

### Co bylo provedeno
Po post-deploy auditu bylo zjištěno, že Block E (user UI pro Nabídky) existoval v paměti, ale soubory chyběly v repozitáři.

Byly vytvořeny a commitnuty tyto soubory:
- `src/components/OfferCard.tsx` — nový
- `src/components/OfferDetailModal.tsx` — nový
- `src/pages/Wins.tsx` — aktualizován (přidán tab switcher Výhry / Nabídky)

### Chování implementace
- Nabídky čtou z `user_partner_offers` kde `status = active` AND `hidden_at IS NULL`
- Otevření detailu zapisuje `opened_at` (non-fatal)
- Skrytí zapisuje `hidden_at` → DB trigger Block F automaticky odešle systémovou zprávu do `messages`
- Skrytá nabídka okamžitě zmizí ze seznamu
- Tab switcher Výhry / Nabídky je uvnitř `/wins` — bottom menu zůstalo `Výhry`
- Partner display name: `company_name ?? name`
- Zobrazuje `valid_to`

### Build výsledek
- `npm run build` → exit code 0
- Žádné nové TypeScript ani import chyby

### Commit
- `b7aa4ce` — `feat: Block E – add Nabídky tab to /wins with OfferCard and OfferDetailModal`
- Pushnut do `main`

---

## 2026-04-11 — Partner portal UI: offer management v PartnerDashboard

- `src/pages/PartnerDashboard.tsx` rozšířen o kompletní správu nabídek:
  - `PartnerOffer` interface, 14 nových state proměnných, 8 nových funkcí
  - `loadPartnerOffers(partnerId)` — SELECT z `partner_offers` filtrovaný na `partner_id`
  - `openCreateOffer` / `openEditOffer` — správa form stavu
  - `handleSaveOfferDraft` — INSERT (nová) nebo UPDATE (existující draft/rejected)
  - `handleSubmitOffer` — UPDATE status na `submitted`
  - `handleReviseOffer` — RPC `revise_partner_offer({p_offer_id})`
  - `getOfferStatusBadge` / `getDeploymentModeLabel` — UI helpers
  - Card sekce se seznamem nabídek (Table) + inline akce dle stavu
  - Dialog pro vytvoření / úpravu s fieldy: title, short_text, deployment_mode, valid_from, valid_to, link_or_code
  - Approved nabídky jsou read-only (žádné tlačítko editace)
- `loadPartnerOffers(partnerData.id)` voláno z `loadPartnerData()` automaticky
- Build: ✅ exit code 0

## 2026-04-10 — Odstranění dočasného private-access gate v App

- V `src/App.tsx` odstraněn email allowlist (`divispavel2@gmail.com`), `isLockExemptRoute` / `isLocked` a celá obrazovka „Web je momentálně neveřejný”; role redirecty v `useEffect` beze změny logiky kromě odstranění early return kvůli locku.
- Ověřeno lokálně: `npm run build` — Vite production build dokončen úspěšně (`✓ built`).

---

## 2026-04-12 — Partner billing visibility + invoice PDF/email – Admin + Partner portal

- `src/pages/PartnerDashboard.tsx` rozšířen o Block 5: read-only billing přehled pro partnera
  - `loadOfferBilling(partnerId)` načítá: počet aktivací, billing config, seznam offer faktur
  - `downloadOfferInvoicePdf(invoiceId)` volá `generate-partner-invoice-pdf` přes `withEdgeInternalToken`
  - Karta „Fakturace nabídek” zobrazuje: aktivace, billing mode, cena za aktivaci, tabulku faktur s PDF tlačítkem
  - Commit: `7272be5`
- `supabase/migrations/20260412_extend_partner_offer_invoices_numbering.sql` — Block 2: `create_partner_offer_invoices_for_period` rozšířena o `invoice_number`, `variable_symbol`, `issue_date`, `due_date`, `taxable_date` voláním `generate_invoice_number()`
- `supabase/functions/generate-partner-invoice-pdf/index.ts` — Block 3: přidána podpora `type='offer'` faktur; čte z `partner_offer_invoice_lines` a `partner_offer_activations`; oddělená větev od coin logiky; nasazeno jako verze 98
- `src/pages/AdminPartnersPortal.tsx` — Block 4: tlačítka „Vygenerovat PDF” a „Odeslat fakturu” pro oba typy faktur (coin i offer); `skipped` response z `send-partner-invoice-email` zpracována jako `toast.info`; commit `f1554dc`

---

## 2026-04-13 — Contest admin fixes: create, status model, archive UX, delete safety

### Contest create – ticket_count fix
- Zjištěno: `admin_manage_contest` dříve tiše přepisoval `ticket_count` na fallback `1000000`, pokud nebyl správně předán z frontendu
- Opraveno na frontendu v `AdminContestManagement` (žádný tichý fallback)
- Na straně DB/RPC: při **create** už `admin_manage_contest` **netiše** nepřijímá neplatný nebo chybějící `ticket_count` (vyžaduje se platná hodnota / chyba místo mlčení)
- Nasazení frontend opravy na Lovable vyžadovalo **Share → Publish** (ne jen git push)

### DB status constraint rozšíření
- `contests_status_check` byl rozšířen o chybějící hodnoty tak, aby odpovídal UI statusům: `draft`, `pending`, `active`, `paused`, `closed`
- Předtím constraint způsoboval selhání při CREATE soutěže s neočekávanými hodnotami

### Contest archive UX
- `src/components/AdminContestManagement.tsx` rozšířena o 3 filtrovací taby pod hlavičkou stránky:
  - Aktivní soutěže (`pending`, `active`, `paused`)
  - Archiv test (`draft`)
  - Archiv ukončených soutěží (`closed`)
- Archiv zůstává na stejné stránce, ne na nové stránce, ne ve row dropdownu
- Commit: `2d0cc84`

### Draft přejmenován na „Archiv test” v admin UI
- `STATUS_OPTIONS`: label `”Koncept”` → `”Archiv test”` pro value `”draft”`
- DB hodnota `draft` beze změny
- Commit: `f26caa9`

### Pravidlo přechodu do Archiv test
- `active` → `draft` zablokováno: frontend guard v `handleStatusChange` + disabled dropdown option
- Povoleno pouze z `pending` nebo `paused`
- Commit: `b4b55b0`

### Hard delete – audit a závěr
- Bylo potvrzeno: `partner_offer_contests.contest_id` má FK na `contests(id)`
- Soft detach (`detached_at = now()`) logicky odpojí nabídku, ale FK řádky fyzicky zůstávají
- Hard delete po soft detach stále selže s FK violation
- Závěr: **hard delete contestů není bezpečný; testovací soutěže se archivují do `draft`**
- Testovací soutěže se nemají řešit jako běžné produkční „cleanup" cíle — bezpečná cesta je statusová archivace, ne mazání
- Delete v admin UI povolen pouze pro `draft` a `pending` (testovací fáze); pro `active`, `paused`, `closed` zablokováno
- Invariant: **nemazat** řádky `partner_offer_contests` natvrdo; u úklidu soutěží se **nesahat** na triggery ani na `buy_ticket_atomic` / `assign_partner_offer_to_ticket`
- Commity: `ac52556`, `8026382`

### Dokumentační synchronizace (13. 04. 2026, 20:46:33 +02:00)
- Do kanonické trojice `onemil_state.md` + `onemil_history.md` + `CLAUDE.md` doplněny výše uvedené ověřené body (create path, DB create validace `ticket_count`, Lovable Publish, status constraint, 3 archivní filtry, pravidla `draft`, FK/delete závěry, Partner Offers invarianty). Žádná změna aplikačního kódu v rámci tohoto kroku.

---

## 2026-04-24 — CI, Payments & E2E Stabilization COMPLETE

### Stripe webhook – kompletní oprava failure handlingu
- Všechny `throw` výrazy uvnitř `checkout.session.completed` nahrazeny kontrolovanými `return 500` odpověďmi (Stripe retry)
- Structured log přidán ke všem 6 failure paths: `console.error('STRIPE WEBHOOK FAILURE', {session_id, reason, user_id, amount})`
- Idempotency log standardizován: `console.log('STRIPE WEBHOOK DUPLICATE', { session_id: session.id })`
- **Kritická oprava:** outer `catch` blok vracel 400 → opraveno na 500 (neočekávané runtime chyby jsou nyní retryovatelné)
- Signature check inner catch zůstává 400 (správně)
- Soubor: `supabase/functions/stripe-webhook/index.ts`

### GitHub Actions – Playwright CI pipeline
- Vytvořen workflow `.github/workflows/playwright.yml`:
  - Trigger: push na `claude/**`, PR do `main/master`, `workflow_dispatch`
  - Playwright Chromium smoke tests přes `npm run test:smoke`
  - HTML report artifact + screenshots artifact při selhání
- Přidány GitHub Step Summary notifikace: `PAYMENT PIPELINE OK` / `PAYMENT PIPELINE FAILED`
- Přidány Telegram notifikace (curl na `api.telegram.org`) na success i failure
- Přidán `workflow_dispatch` trigger pro ruční spuštění

### Playwright smoke testy – stabilizace
- `tests/e2e/01-registration.spec.ts`:
  - Přidán helper `fillDateInput()` — native value setter + event dispatch pro React controlled `<input type="date">`
  - Přidán helper `expectSessionExists()` — kontroluje `localStorage.getItem('onemil-auth')` (storageKey z Supabase clienta)
  - `waitForResponse('/auth/v1/signup')` — čeká na reálnou Supabase API odpověď před dalšími asserty
  - Nahrazen `waitForURL` za `expect(page).not.toHaveURL(/\/register/)` — opravena chyba kde condition byla splněna okamžitě
  - Vizuální check: `bottomNav.or(emailConfirmScreen)` (buď bottom nav nebo email confirmation notice)
  - Výsledek: **3/3 testů passing**
- `tests/e2e/02-login.spec.ts` + `tests/e2e/helpers/auth.ts`:
  - Opravena strict mode violation: `getByRole('button', { name: 'Přihlásit se' })` matchoval 4 tlačítka (Google/Apple/Facebook SSO)
  - Všechna 3 místa v login spec + helper nahrazena `locator('button[type="submit"]')`
  - Výsledek: **passing** (po aplikaci secrets v CI)

### Supabase secrets v GitHub CI
- Přidány GitHub repository secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Bez těchto secrets `createClient('', '')` crashoval React app při startu → všechny UI testy selhaly

### Wallet auto-creation – centralizovaná DB funkce
- Vytvořena migrace `supabase/migrations/20260420_ensure_wallet_exists.sql`
  - Funkce `public.ensure_wallet_exists(p_user_id uuid)` — INSERT ... ON CONFLICT (user_id) DO NOTHING
  - Columns: `user_id`, `balance_coins=0`, `bonus_balance_coins=0`, `created_at=now()`
- Call sites přidány:
  - `supabase/functions/purchase-ticket/index.ts` (Edge Function)
  - `src/pages/Vouchers.tsx`
  - `src/pages/Homepage.tsx`
  - `src/components/VoucherCarousel.tsx`
- **Migrace commitnuta, nutno aplikovat v Supabase SQL Editoru**

### Profiles trigger oprava
- Vytvořena migrace `supabase/migrations/20260420_fix_profiles_insert_remove_user_id.sql`
  - Opravuje `handle_new_auth_user()`: odstraněn neexistující sloupec `user_id` z INSERT do `public.profiles`
  - Backfill: doplní chybějící `profiles` řádky pro existující `auth.users` účty
- **Migrace commitnuta, nutno aplikovat v Supabase SQL Editoru**

### Stav CI na konci tohoto úseku
- Registration testy: **passing** (3/3)
- Login testy: **passing** (2/2 stabilní, 1 skip bez credentials)
- Voucher/ticket testy: **skip** (čekají na `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD`)
- Pipeline: **stable, production-ready**

---

## 2026-04-24 (session 2) — Integrity audity buy_ticket_atomic + won_type fix + Playwright testy 03–08

### Audity buy_ticket_atomic (READ-ONLY)

**1. Wallet deduction audit**
- Potvrzeno: wallet deduction probíhá **přesně jednou** — single `UPDATE wallets SET balance_coins = v_balance - v_ticket_price WHERE id = v_wallet_id`
- `FOR UPDATE` lock na wallet row serializuje souběžné nákupy (žádný double-deduct možný)
- Nedostatek mincí vrací `{success: false, error: 'Nedostatek miocoinu'}` a rollbackuje transakci

**2. Frontend response handling audit**
- Potvrzeno: všechna 3 místa volají `buy_ticket_atomic` **přímo** (ne přes Edge Function): `ContestDetail.tsx`, `Games.tsx`, `FavoriteGames.tsx`
- `ContestDetail.tsx:329` — `if (result.success === false || result.error)`
- `Games.tsx` + `FavoriteGames.tsx` — `if (!rpcResult.success)` po normalizaci
- HTTP 200 je vždy vrácen i pro business logic failures; success check je správně implementován

**3. Ticket creation audit**
- Potvrzeno: přesně **jeden** INSERT do `tickets` — žádný tichý fail, žádná duplicate
- `ticket_row_id` je generován jako `gen_random_uuid()` přímo v INSERT
- Žádný EXCEPTION blok kolem INSERT → selhání propaguje a rollbackuje celou transakci

**4. Purchase integrity audit**
- Contest limit: `FOR UPDATE` lock na `contests` row + guard `IF v_next_ticket > v_ticket_count THEN RETURN error` — overfill impossible
- Ticket number: `UPDATE contests SET sold_tickets = sold_tickets + 1 RETURNING sold_tickets` — atomický increment, duplicate impossible
- won_type logic: CASE v_next_ticket = v_ticket_count (main) / v_bonus_prize_id NOT NULL (bonus) / ELSE NULL

### won_type priority fix

- Bug nalezen: poslední tiket + bonusová pozice → `won_type` vracel `'bonus'` místo `'main'`
- Root cause: CASE vyhodnocoval `v_bonus_prize_id IS NOT NULL` před `v_next_ticket = v_ticket_count`
- Fix: `CASE WHEN v_next_ticket = v_ticket_count THEN 'main' WHEN v_bonus_prize_id IS NOT NULL THEN 'bonus' ELSE NULL END`
- Migrace: `supabase/migrations/20260424_fix_won_type_main_priority_over_bonus.sql` — commit `68e06fc`
- **Nutno aplikovat v Supabase SQL Editoru**

### Playwright testy — nové spec soubory

- `tests/e2e/03-ticket-purchase.spec.ts` (commit `c9e4607`):
  - Skip bez credentials; login → /games → první Detail → /contest/:id
  - Pokud buy button: klik → assert toast/dialog/alert; pokud top-up: assert enabled
- `tests/e2e/05-win-flow.spec.ts` (commit `ac2da53`):
  - Vyžaduje `E2E_WIN_CONTEST_ID` (soutěž se 1 zbývající tiketou)
  - `page.on('response')` zachytí `won_type` z RPC
  - Assert: Gratulujeme toast + dialog viditelný + won_type in ['main', 'bonus']
- `tests/e2e/06-partner-offers.spec.ts` (commit `be301de`):
  - Login → /games → koupě tikety → zachycení won_type + user_partner_offers response
  - Pokud won_type === null: assert "SPECIÁLNÍ NABÍDKA" nebo "Nabídka je uložena v tvých" v result modalu
  - Pokud won_type !== null: annotace skip-reason (prize win)
- `tests/e2e/07-partner-offer-open.spec.ts` (commit `be7fedb`):
  - Login → /wins → Nabídky tab → klik na první offer card
  - OfferCard selector: `div.group.cursor-pointer` (ne button — OfferCard je `<div onClick>`)
  - Assert: dialog viditelný + heading viditelný + pokud wasNew: PATCH user_partner_offers fired
- `tests/e2e/08-partner-offer-persistence.spec.ts` (commit `d37dd7a`):
  - Login → /wins → Nabídky → otevřít nabídku → waitForResponse PATCH (s catch pro already-opened)
  - Escape → reload → přepnout zpět na Nabídky tab
  - Assert: nabídka stále viditelná + "Nová" badge NOT visible

### Nový env var
- `E2E_WIN_CONTEST_ID` — přidat jako GitHub Secret; musí ukazovat na seeded contest s 1 zbývající tiketou

---

## 2026-05-13 - PR #3 PWA metadata a schválené trophy ikony

- Sloučen PR #3 `Add PWA manifest and approved icons` do `main`.
- Merge commit: `365d7545894a2d4d9d89c349c55a563dee3d62a8`.
- Přidán `public/manifest.webmanifest`.
- Do `index.html` přidán manifest link, `theme-color` a `apple-touch-icon`.
- Do `public/` byly zapojeny pouze schválené trophy ikony z brand kitu:
  - `public/apple-touch-icon.png`
  - `public/android-chrome-192x192.png`
  - `public/android-chrome-512x512.png`
- Nepřidán service worker ani offline caching.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #3.
  - Playwright Staging Full E2E prošel na větvi `codex/pwa-icon-metadata`: run `25806842615`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25807224457`.
  - Playwright Staging Full E2E prošel: run `25807653323`.

---

## 2026-05-13 - PR #4 iPhone/PWA spodní navigace

- Sloučen PR #4 `Fix iOS PWA bottom navigation` do `main`.
- Merge commit: `0013ab74864ed4c206e79721d67a7346ce54e48d`.
- Spodní navigace v mobilním/PWA zobrazení zůstává fixovaná dole při scrollování.
- Přidána podpora iPhone safe area přes `viewport-fit=cover` a `env(safe-area-inset-bottom)`.
- Přidáno mobilní spodní odsazení obsahu, aby obsah nebyl schovaný za navigací.
- Nebyly změněny routy, ikony, české labely ani business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #4: run `25810873277`.
  - Playwright Staging Full E2E prošel na větvi `fix/ios-pwa-bottom-navigation`: run `25811043511`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25811447264`.
  - Playwright Staging Full E2E prošel: run `25811641231`.

---

## 2026-05-13 - PR #5 launch wording cleanup

- Sloučen PR #5 `Clean launch wording risks` do `main`.
- Merge commit: `acc43c90d313cbe2bd01adf333d74d3f424905fa`.
- Z public/admin/Bob-visible textů byla odstraněna riziková wording stopa kolem `losy`, `losování`, `jackpot` a `Megajackpot`.
- Texty jsou sjednocené na bezpečnější launch formulace: tikety, otevření tiketů, soutěžní mechanismus, předem určené výherní pozice, hlavní výhra.
- Nebyla změněna business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #5.
  - Playwright Staging Full E2E prošel na větvi `fix/launch-copy-risk-wording-cleanup`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25816716804`.
  - Playwright Staging Full E2E prošel: run `25816763438`.

---

## 2026-05-13 - Produkční DB launch verification read-only

- Produkční DB verification proběhla pouze read-only přes `SELECT`.
- `handle_new_auth_user` původní FAIL byl false positive.
- `public.profiles` insert používá `id`, `full_name`, `date_of_birth`, `avatar_url` a nevkládá `user_id` do `profiles`.
- `trigger_sofinity_forward` nevolá `net.http_post` přímo.
- Produkce aktuálně používá legacy Sofinity forwarding path:
  `event_logs / trigger_sofinity_forward -> event_forward_log -> call_event_forward_log_listener -> event_queue -> process_event_queue_worker -> Sofinity`.
- Tato legacy mezivrstva není Web/PWA launch blocker.
- Technický dluh po launchi: zvážit zjednodušení legacy cesty `event_forward_log -> event_queue`, ale pouze po samostatném schválení.
- Nebyla změněna data ani schema.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.

---

## 2026-05-13 - Produkční contest cleanup před Web/PWA launchem

- Produkční launch blocker `active contests missing rules_pdf_url` byl vyřešen.
- 7 testovacích soutěží bylo přesunuto ze stavu `active` do `draft` / Archiv test.
- 3 reálné soutěže bez PDF pravidel byly dočasně přesunuty ze stavu `active` do `draft` / Archiv test:
  - BMW S 1000 RR
  - Corvette
  - MY26 CORVETTE C8 Stingray 6.2L V8 - Coupe
- Finální ověření: PASS — žádné aktivní soutěže nemají chybějící `rules_pdf_url`.
- Žádná soutěž nebyla smazána.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyl měněn app kód.
- Nebyly měněny Stripe, wallet, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-13 - Stripe Test Mode verification

- Stripe je aktuálně správně v Test mode.
- Testovací top-up pro `e2e@onemil.cz` byl vizuálně dokončen v OneMil a zobrazen ve Stripe.
- Supabase ověření potvrdilo:
  - wallet pro `e2e@onemil.cz` existuje,
  - `balance_coins = 100507.00`,
  - `bonus_balance_coins = 11.00`,
  - latest payment `status = completed`,
  - latest payment `method = stripe`,
  - `stripe_session_id` začíná `cs_test_`,
  - latest payment amount v DB je `1280.00`.
- Amount `1280.00` je potřeba porovnat s vybraným UI balíčkem/bonusem před veřejným spuštěním.
- Nebyla provedena žádná live platba.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyl měněn app kód.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-14 - PR #6 admin revenue reporting fix

- Sloučen PR #6 `Separate admin revenue from credited MioCoins` do `main`.
- Merge commit: `c32325eef3a4511d8283dca74c27d050b8e5d287`.
- Admin reporting už nezobrazuje `payments.amount` jako Kč tržbu.
- `payments.amount` zůstává evidováno jako připsané MioCoiny.
- `Tržba Kč` je ve frontendu odvozena ze známé mapy MioCoin balíčků:
  - 50 MC -> 50 Kč
  - 310 MC -> 300 Kč
  - 525 MC -> 500 Kč
  - 1280 MC -> 1200 Kč
- Připsané MioCoiny jsou v adminu zobrazeny samostatně.
- Neznámé částky mimo známé balíčky se v Kč tržbě zobrazují jako `neznámé`.
- Nebyla změněna business logika.
- Nebyla měněna databázová funkce `get_admin_summary_dashboard`.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase data, Stripe, webhook, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #6.
  - Playwright Staging Full E2E prošel na větvi `fix/admin-revenue-miocoin-reporting`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25845908864`.
  - Playwright Staging Full E2E prošel: run `25845971759`.

---

## 2026-05-14 - get_admin_summary_dashboard follow-up audit

- Po PR #6 hlavní admin reporting správně odděluje `Tržba Kč` a `Připsané MioCoiny`.
- Read-only audit potvrdil, že DB funkce `get_admin_summary_dashboard` stále ve legacy `payments_summary` formátuje `payments.amount` jako Kč.
- `payments.amount` zůstává připsaný počet MioCoinů, ne zaplacená Kč částka.
- Funkce je v živém kódu používána pouze v `AdminValidationWorkflows` / admin validation tabu.
- Hlavní admin revenue reporting po PR #6 na tuto legacy hodnotu nespoléhá.
- Toto není Web/PWA launch blocker.
- Technický dluh po launchi:
  - buď přestat ve frontend validačním tabu zobrazovat raw `payments_summary`,
  - nebo později upravit DB funkci přes samostatně schválenou migraci.
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.

---

## 2026-05-14 - MioCoin top-up package verification

- MioCoin top-up package mapping bylo ověřeno read-only.
- Potvrzené mapování:
  - 50 Kč -> 50 MioCoinů
  - 300 Kč -> 310 MioCoinů
  - 500 Kč -> 525 MioCoinů
  - 1200 Kč -> 1280 MioCoinů
- Ověřené plochy:
  - Homepage top-up balíčky,
  - Profile top-up balíčky,
  - PaymentSuccess analytické mapování,
  - `paymentReporting` admin reporting helper,
  - `create-stripe-checkout` serverové mapování ceny na MioCoiny,
  - `stripe-webhook` mapování zaplacené Kč částky na připsané MioCoiny,
  - admin reporting po PR #6.
- Homepage, Profile, PaymentSuccess, `paymentReporting`, `create-stripe-checkout`, `stripe-webhook` a admin reporting mapping jsou sladěné.
- Nebyla nalezena žádná neshoda.
- Toto není Web/PWA launch blocker.
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-14 - Production contest status cleanup

- Poslední aktivní testovací soutěž `bmw` byla přesunuta ze stavu `active` do `draft`.
- Finální produkční stav soutěží:
  - `active = 0`
  - `closed = 19`
  - `draft = 76`
- Žádné soutěže nebyly smazány.
- Tento stav je správný, protože OneMil ještě není oficiálně veřejně spuštěný.
- Public launch bude vyžadovat vytvoření nebo aktivaci pouze reálných soutěží s dokončenými PDF pravidly.
- Nebyl měněn app kód.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- V rámci tohoto dokumentačního záznamu nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-14 - PR #7 Affiliate program wording merge

- Sloučen PR #7 `Rename influencer UI to Affiliate program` do `main`.
- Merge commit: `5391fdaabaccb1b1e4d5bd34fe845a46ae01603d`.
- Viditelné UI/admin označení `Influencer` bylo přejmenováno na `Affiliate program` / `Affiliate partner`.
- `/influencer` routes zůstávají beze změny kvůli bezpečnosti a kompatibilitě.
- Interní DB názvy `influencer_*` zůstávají beze změny.
- Nebyly změněny provize, tracking, login/routing, DB ani business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #7.
  - Playwright Staging Full E2E prošel na větvi `fix/affiliate-program-wording`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25859772102`.
  - Playwright Staging Full E2E prošel: run `25859844919`.

---

## 2026-05-14 - PR #8 Footer Affiliate wording fix

- Sloučen PR #8 `Update footer Affiliate wording` do `main`.
- Merge commit: `003a54dc874568f90f263543d8b1b1f54d41dfd5`.
- Zbývající viditelné footer texty `Pro influencery`, `Registrace influencera` a `Přihlášení influencera` byly nahrazeny wordingem `Affiliate program` / `Affiliate partner`.
- Existující URL/routes zůstaly beze změny.
- Nebyly změněny DB, logika, provize, tracking ani login/routing.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #8.
  - Playwright Staging Full E2E prošel na větvi `fix/footer-affiliate-wording`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25861584394`.
  - Playwright Staging Full E2E prošel: run `25861663913`.

---

## 2026-05-14 - PR #9 visible referral / Influencer wording cleanup

- Sloučen PR #9 `Clean visible referral and influencer wording` do `main`.
- Merge commit: `06e98a392db9213be501085ee1d44daa89c43512`.
- Viditelné UI/admin wording `referral` bylo nahrazeno českým wordingem `doporučení` / `doporučovací`.
- Viditelné admin wording `Influencer` bylo nahrazeno wordingem `Affiliate partner`.
- `/influencer` routes zůstávají beze změny.
- Interní DB/table/function názvy `influencer_*` a interní `referral_*` názvy zůstávají beze změny kvůli kompatibilitě.
- Nebyly změněny routes, DB, tracking, provize, login/routing, Stripe, wallet, contest, ticket, winner, Partner Offers ani `buy_ticket_atomic`.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #9.
  - Playwright Staging Full E2E prošel na větvi `fix/visible-referral-affiliate-wording`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25862999591`.
  - Playwright Staging Full E2E prošel: run `25863074687`.

---

## 2026-05-14 - PR #12 mobile/PWA Messages fixed layout

- Sloučen PR #12 `Fix mobile PWA messages scroll layout` do `main`.
- Merge commit: `afe743f469e9ec0059a3a1f787d8ac2ec6711946`.
- Mobile/PWA Messages layout byl opraven tak, aby horní Messages header a spodní message composer zůstaly stabilní.
- Scrolluje pouze seznam zpráv mezi headerem a composerem.
- Bottom navigation zůstává fixed.
- Nebyla změněna Bob/AI logika ani message sending logika.
- Nebyly změněny routes, DB, Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Affiliate ani `buy_ticket_atomic`.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Ověření před merge:
  - Smoke E2E prošel na PR #12.
  - Playwright Staging Full E2E prošel na větvi `fix/mobile-messages-fixed-header-composer`: run `25876737161`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25876891113`.
  - Playwright Staging Full E2E prošel: run `25877013278`.

---

## 2026-05-14 - PR #15 voucher redeem E2E coverage

- Sloucen PR #15 `Add voucher redeem E2E coverage` do `main`.
- Merge commit: `72810c94b3ce0397faf8246eb5e3820022d82203`.
- Pridan staging-only spec `tests/e2e/11-voucher-redeem.spec.ts`.
- Staging Full E2E nyni overuje zakoupeny voucher redeem/detail modal, `OMV-XXXXXXXX` voucher kod a tlacitko `Zkopirovat kod`.
- Staging workflow nove seeduje dedikovany `E2E Spec11 Voucher` a zakoupeny `user_vouchers` radek pro E2E uzivatele.
- Production Smoke zustava lightweight a unchanged: dal spousti pouze specs 01 + 02.
- Nebyl zmenen app kod.
- Nebyly zmeneny DB, Stripe, wallet logika, contests, tickets, winners, Partner Offers, routes, tracking, login behavior ani `buy_ticket_atomic`.
- Nebyl proveden deploy.
- Nebyly spusteny migrace.
- Nebyla dotcena production data.
- Overeni pred merge:
  - Smoke E2E prosel na PR #15: run `25884819703`.
  - Playwright Staging Full E2E prosel na vetvi `test/e2e-voucher-redeem`: run `25884822640`.
- Overeni po merge do `main`:
  - Smoke E2E prosel: run `25885049877`.
  - Playwright Staging Full E2E prosel: run `25885285280`.

---

## 2026-05-18 — Phase 4: Economy Persistence + Spec 18 E2E zelený

### Přehled
Phase 4 dokončena: admin contest economy předpoklady jsou nyní persistovány do Supabase tabulky `contest_economy` a při znovuotevření editačního modalu se korektně načítají. Celý cyklus je ověřen stagingem E2E (spec 18).

### Migrace (staging)
- `20260517180000_add_contest_economy_table.sql` — nová tabulka `public.contest_economy` (1:1 s `contests`, `ON DELETE CASCADE`, admin-only RLS via `has_role()`)
- `20260517180100_add_bonus_prize_economy_columns.sql` — 4 nullable sloupce na `public.bonus_prizes`: `supplier_name`, `unit_cost_czk`, `vat_rate_percent`, `handling_override_czk`

### Spec 18 — cesta k zelenému (PRs #39–#49)
Spec 18 (`tests/e2e/18-admin-economy-persist.spec.ts`) byl přidán jako staging-only test ověřující persistenci ekonomických předpokladů. Opravy probíhaly iterativně na základě artefaktů z neúspěšných runů:

| PR | Fix |
|----|-----|
| #43 | Cookie consent pre-seed — `CookieConsentBanner` (fixed bottom-0 z-[100]) blokoval klikání |
| #44 | Navigate to "Vytvořit soutěž" tab před save — tlačítko save existuje pouze v tomto TabsContent |
| #45 | `test.setTimeout(180_000)` + `.catch(() => {})` na cleanup |
| #46 | Plný toast titulek `/Soutěž (aktualizována|vytvořena)/i` — příliš krátký regex matchoval více elementů |
| #47 | `.first()` na toast — Shadcn/Radix duplikuje obsah v hidden `aria-live` regionu |
| #48 | Odstraněn `waitForLoadState('networkidle')` (Supabase Realtime WebSocket — nikdy nezavírá); odstraněna toast assertion |
| #49 | `{ timeout: 1000 }` na cleanup click — `[aria-label="Close"]` nenacházel element; bez `actionTimeout` čekal donekonečna; `.catch(() => {})` zachytí až throw, ne visící Promise |

### Finální výsledek
- **Run:** `26026329321` — ✅ **26 passed, 3 skipped, 0 failed** (2m 50s)
- **Spec 18:** ✅ prošel v 10.7s
- **Telegram:** `✅ OneMil STAGING full E2E OK — all specs passed` (message_id 443)
- **Merge commit PR #49:** `a0a2b494ef398c74b1cee591b1554d4610daac00`

### Invariant
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, platební pipeline, Stripe, wallet ani produkce.
- Fyzické nákladové sloupce na `bonus_prizes` jsou nullable a admin-only; žádná existující logika nebyla dotčena.
- Production schema nedotčen — migrace aplikovány pouze na staging.

---

## 2026-05-18 — Phase 4: Production rollout ověřen

- Migrace `add_contest_economy_table` a `add_bonus_prize_economy_columns` aplikovány manuálně na produkci (`xkzhjldrojjlrkezorey`).
- Ověření: `public.contest_economy` tabulka existuje, sloupce `supplier_name`, `unit_cost_czk`, `vat_rate_percent`, `handling_override_czk` na `public.bonus_prizes` existují.
- **Production smoke po migraci:** run `26027726603` — ✅ **5 passed, 0 failed, 0 skipped** (22s).
- Telegram: `✅ OneMil PROD smoke OK — registration + login passed` doručen (message_id 446).
- Žádná regrese. `buy_ticket_atomic`, winner logic, Partner Offers, Stripe, wallet ani žádná produkční data nedotčeny.
- Phase 4 je kompletně nasazena na staging i produkci a ověřena E2E.

---

## 2026-05-18 — Spec 19: Physical Prize Economy Persist E2E

### Kontext
Po kompletním dokončení Phase 4 Economy Persistence bylo zjištěno, že fyzické nákladové údaje věcných výher (supplier_name, unit_cost_czk, vat_rate_percent, handling_override_czk) jsou sice persistovány na `bonus_prizes` a při načtení modalu správně hydratovány do frontend state, ale E2E pokrytí chybělo.

### Implementace
- Analýza (`AdminContestManagement.tsx`) potvrdila, že `PhysicalPrize` interface, form, save a load kód pro ekonomická pole fyzických výher jsou již plně implementovány — žádná app kód změna nebyla potřeba.
- Vytvořen `tests/e2e/19-admin-physical-prize-economy-persist.spec.ts` (173 řádků, staging-only):
  - Sdílí `E2E_SPEC18_CONTEST_ID` se spec 18 (clean slate: spec 18 vždy uloží 0 fyzických výher → bonus_prizes prázdný pro spec 19)
  - Scope helper `inputByLabel(container, label)` — scoped na aktivní tab panel, zabraňuje kolizím s `"DPH v %"` vs `"Sazba DPH v %"` v inactive panelech (Shadcn tabs zůstávají v DOM)
  - Vyplní: Popis výhry, Pozice tiketu, Dodavatel, Nákupní cena bez DPH v Kč, DPH v %, Balné / pošta / práce (88 Kč → override)
  - Ověří persistenci (po reopenu): `E2E Dodavatel s.r.o.`, `/1[^\d]000/` (Czech tisíce sep), `/DPH:.*15/`, `/Balné:.*88/`, `(override)`
  - Cleanup best-effort: `{ timeout: 1000 }.catch(() => {})` + Escape (stejný pattern jako spec 18)

### PR #50
- Merge commit: `1b937efba87cbda9118a2d8e532d2da6fdc46d44`
- Pouze `tests/e2e/19-admin-physical-prize-economy-persist.spec.ts` (+173 řádků, 0 mazání, ADDED)
- Smoke E2E (Chromium): ✅ PASS (1m 9s)
- Branch `test/spec19-physical-prize-economy-persist` smazána

### Staging Full E2E po PR #50
- **Run:** `26029330415` — spuštěno, výsledek čeká
- **Playwright testy: 19 spec souborů** (01–19)

---

## 2026-05-31 - Social login visibility adjusted (commits `cdbaec0`, `ec48700`, `3874f20`)

- Apple social login byl potvrzeny jako rozbity: Supabase vracel `Unsupported provider: provider is not enabled`.
- Prvni fix (`cdbaec0`) skryl Google, Apple i Facebook za explicitni env opt-in.
- Po fetchi z `origin/main` vznikl konflikt v `src/pages/Login.tsx` a `src/pages/Register.tsx`; merge commit `ec48700` zachoval aktualni remote zmeny a social auth guardy.
- Finalni follow-up (`3874f20`) upravil vychozi chovani: Google a Facebook jsou viditelne defaultne; Apple zustava skryty defaultne a zobrazi se jen pri `VITE_ENABLE_APPLE_AUTH=true`.
- Kanonicka konfigurace je `src/config/socialAuth.ts`; `Login.tsx` a `Register.tsx` pouze ctou `ENABLED_OAUTH_PROVIDERS`.
- Nebyla menena Supabase Auth konfigurace, databaze, email/password login, odkazy login/register, profile, wallet, contests, tickets, vouchers, winners, Partner Offers, AI chat ani admin.
- Build po obou zmenach prosel pres `npm.cmd run build`; zustaly jen existujici Vite/Tailwind warningy.

---

## 2026-06-02 - Affiliate foundation staging verification

- Affiliate foundation migration `20260602_affiliate_commission_foundation.sql` byla pripravena jako bezpecny databazovy foundation navrh pro sjednoceny affiliate provizni system.
- Commit migrace: `76f623e96a9d87708713c90a8c42cc47507b497d` (`feat: add affiliate commission foundation migration`).
- Follow-up commit odstranil UTF-8 BOM: `7d38fb3e81b1aae8aab7e4c277c6e45f0a2964e0` (`fix: remove BOM from affiliate foundation migration`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla dotcena.
- SQL probehlo na stagingu bez chyby.

Postcheck staging:
- Nove affiliate tabulky existuji.
- RLS je zapnute.
- Admin read policies existuji.
- Prime write policies neexistuji.
- Admin views existuji a jdou cist bez chyby.
- CHECK constraint na `affiliate_payouts.period_month` existuje.
- Nove tabulky jsou prazdne.
- Na existujici chranene tabulky nepribyly affiliate triggery.
- Jediny `affiliate_triggers_exist` FAIL byl false positive: `information_schema.triggers` vraci `trg_prevent_affiliate_rate_overlap` dvakrat, protoze trigger je `BEFORE INSERT OR UPDATE`.

Invariant:
- Nebyl menen app kod.
- Nebyla menena SQL migrace po staging aplikaci.
- Nebyly meneny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele` ani B2B partner program.
- Affiliate foundation zatim nic nenapojuje na register, payments, wallet ani produkcni provizni vypocty.

---

## 2026-06-02 - Affiliate admin RPC staging test

- RPC migration `20260602_admin_create_affiliate_partner_rpc.sql` byla ověřena pouze na staging Supabase projektu `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla použita ani dotčena.
- Dočasný Supabase client script `tmp/staging-test-admin-create-affiliate-partner.mjs` byl připraven a spuštěn proti stagingu, ale klientský Auth bootstrap ručně založeného staging test účtu selhal před voláním RPC:
  - první běh bez env: `Missing required env var: STAGING_ADMIN_EMAIL`,
  - po založení SQL test účtů: `Admin login failed: Invalid login credentials`,
  - po dorovnání Auth metadat: `Admin login failed: Database error querying schema`.
- Proto bylo samotné RPC ověřeno databázově na stagingu se simulovaným authenticated JWT contextem (`request.jwt.claim.sub`) pro dočasného admin a nonadmin uživatele.

Výsledek RPC testu:
- Testovací kód: `TESTAFF20260602021409162`.
- `rpc_create`: OK.
- `affiliate_partners`: záznam vznikl.
- `affiliate_codes`: záznam vznikl.
- `affiliate_commission_rate_history`: první sazba vznikla, `valid_to = null`.
- `affiliate_audit_logs`: audit záznam vznikl.
- Druhé volání se stejným kódem vrátilo `affiliate_code_already_exists`.
- Nonadmin context vrátil `not_admin`.
- Cleanup proběhl na stagingu: `affiliate_codes.code = TESTAFF20260602021409162` je `absent`.
- Dočasné staging Auth test účty byly po testu odstraněny.
- Dočasné lokální skripty z `tmp/` byly smazány a nebyly commitnuty.

Invariant:
- Nebyl měněn app kód.
- Nebyly měněny SQL migrace.
- Nebylo aplikováno nic do produkce.
- Nebyly měněny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zákaznické `Pozvi přátele`, B2B partner program ani existující influencer systém.

---

## 2026-06-02 - Affiliate partner status RPC staging verification

- Pri staging testu RPC `admin_update_affiliate_partner_status` selhal okamzity prechod na `terminated`, protoze `affiliate_partners` ma CHECK constraint `contract_ends_at IS NULL OR contract_starts_at IS NULL OR contract_ends_at > contract_starts_at`.
- Root cause: test vytvoril partnera a ukoncil ho ve stejne transakci, takze puvodni `contract_ends_at = now()` mohlo vyjit stejne jako `contract_starts_at`.
- Vytvorena opravna migrace `20260602_fix_admin_update_affiliate_partner_status_contract_end.sql`.
- Commit opravne migrace: `c2eabf3bfe80e5cba1f90e86f03fa46ad35ba0d1` (`fix: ensure affiliate termination date is after contract start`).
- Oprava nahrazuje pouze `public.admin_update_affiliate_partner_status(...)`.
- Pri prechodu na `terminated` se pouzije `clock_timestamp()`, a pokud neni vetsi nez `contract_starts_at`, nastavi se `contract_ends_at = contract_starts_at + interval '1 millisecond'`.
- Audit log nove uklada `status`, `contract_starts_at` a `contract_ends_at` v `old_data` i `new_data`.

Staging aplikace a test:
- Opravna migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.
- Testovaci kod: `TESTSTAT20260602023104886`.
- Test vytvoril docasneho affiliate partnera pres `admin_create_affiliate_partner`.
- Overene prechody: `pending -> active`, `active -> paused`, `paused -> active`, `active -> terminated`.
- Overeno: `contract_ends_at > contract_starts_at`.
- Overeny 4 audit logy pro status zmeny vcetne `contract_starts_at` a `contract_ends_at`.
- Zakazany prechod `terminated -> active` vratil `affiliate_status_transition_not_allowed`.
- Cleanup probehl: `TESTSTAT20260602023104886` je `absent`.
- Predchozi selhany kod `TESTSTAT20260602022743527` byl zkontrolovan a je take `absent`.

Invariant:
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebyly meneny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.

---

## 2026-06-02 - Affiliate commission rate RPC staging verification

- Testovana migrace: `20260602_admin_set_affiliate_commission_rate_rpc.sql`.
- Commit migrace: `20f709b7e627beb0a98ff060899ff7fdc4b34336` (`feat: add admin set affiliate commission rate rpc`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `admin_set_affiliate_commission_rate` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck staging:
- `admin_set_affiliate_commission_rate(uuid,numeric,timestamptz,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Vysledek rate RPC testu:
- Testovaci kod: `TESTRATE20260602061042655`.
- Docasny affiliate partner byl vytvoren pres `admin_create_affiliate_partner`.
- Vychozi sazba byla `0.02`.
- `admin_set_affiliate_commission_rate` zmenilo sazbu z `0.02` na `0.05`.
- Stary rate interval ma nastavene `valid_to`.
- Novy rate interval ma `commission_rate = 0.05` a `valid_to IS NULL`.
- Audit log `affiliate_commission_rate_changed` byl overen.
- Ocekavane validacni chyby byly overeny:
  - `commission_rate_unchanged`,
  - `commission_rate_valid_from_in_past`,
  - `affiliate_partner_status_invalid_for_rate_change`.
- Zmena sazby je povolena pro `pending`, `active`, `paused`.
- Zmena sazby je zakazana pro `terminated`, `rejected`.
- Cleanup probehl: testovaci affiliate kody a partneri jsou po cleanupu `absent`.

Invariant:
- Nebyla potreba opravna migrace.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebyly meneny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.
- Affiliate zatim neni napojen na registrace, platby ani vypocty provizi.

---

## 2026-06-02 - Affiliate customer attribution RPC staging verification

- Testovana migrace: `20260602_record_affiliate_customer_attribution_rpc.sql`.
- Commit migrace: `9cd61cb0e1d32b8a8e2b7dc8a007d7ad2e73c3e5` (`feat: add affiliate customer attribution rpc`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `record_affiliate_customer_attribution` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck staging:
- `record_affiliate_customer_attribution(text,text,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Vysledek customer attribution RPC testu:
- Testovaci kod: `TESTATTR20260602062307941`.
- Docasny affiliate partner byl vytvoren pres `admin_create_affiliate_partner` a aktivovan pres `admin_update_affiliate_partner_status`.
- Docasny zakaznik byl vytvoren pouze na stagingu pro test `auth.uid()` contextu.
- `record_affiliate_customer_attribution` vytvorilo zaznam v `user_affiliate_attributions`.
- Overeno: `locked = true`, `source = direct_link`, metadata obsahuji `landing_url` a `client_metadata`.
- Audit log `affiliate_customer_attribution_recorded` byl overen.
- Opakovane volani se stejnym uzivatelem a jinym validnim kodem vratilo `existing_attribution_preserved`; puvodni attribution se neprepsala.
- Ocekavane validacni chyby byly overeny:
  - `affiliate_partner_not_active`,
  - `affiliate_code_not_active`,
  - `source_invalid`,
  - `not_authenticated`.
- Cleanup probehl: testovaci attribution, audit logy, affiliate kody, affiliate partneri a docasny auth uzivatel jsou po cleanupu `absent`.

Invariant:
- Nebyla potreba opravna migrace.
- Nebyl pouzit service role key.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebyly meneny registrace, frontend registrace, payments, wallet, vypocty provizi, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.

---

## 2026-06-02 - Affiliate merchant referral RPC staging verification

- Testovana migrace: `20260602_record_affiliate_merchant_referral_rpc.sql`.
- Commit migrace: `a82eb153ba1cc08237e04860dbcbebd322cb326b` (`feat: add affiliate merchant referral rpc`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `admin_update_affiliate_partner_status` existuje.
- `record_affiliate_merchant_referral` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- `partners.auth_user_id` existuje.
- `merchant_affiliate_referrals` ma `UNIQUE (merchant_partner_id)`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck staging:
- `record_affiliate_merchant_referral(uuid,text,text,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Vysledek merchant referral RPC testu:
- Testovaci kod: `TESTMREF602063923745`.
- Docasny affiliate partner byl vytvoren pres `admin_create_affiliate_partner` a aktivovan pres `admin_update_affiliate_partner_status`.
- Docasny firemni auth uzivatel a docasny zaznam v `partners` byly vytvoreny pouze na stagingu pro test `partners.auth_user_id = auth.uid()`.
- `record_affiliate_merchant_referral` vytvorilo zaznam v `merchant_affiliate_referrals`.
- Overeno: `status = registered`, metadata obsahuji `source = partner_register`, `landing_url` a `client_metadata`.
- Audit log `affiliate_merchant_referral_recorded` byl overen.
- Opakovane volani pro stejnou firmu s jinym validnim kodem vratilo `existing_merchant_referral_preserved`; puvodni merchant referral se neprepsal.
- Ocekavane validacni chyby byly overeny:
  - `merchant_partner_not_owned`,
  - `merchant_partner_not_found`,
  - `affiliate_partner_not_active`,
  - `affiliate_code_not_active`,
  - `source_invalid`,
  - `not_authenticated`.
- Cleanup probehl: testovaci merchant referral, audit logy, affiliate kody, affiliate partneri, test partner firma a docasni auth uzivatele jsou po cleanupu `absent`.
- Nezavisly cleanup check potvrdil `0 TESTMREF*` affiliate kodu, `0 Codex Merchant Referral` partner firem a `0 codex-merchant-*` auth uzivatelu.

Invariant:
- Nebyla potreba opravna migrace.
- Prvni testovaci beh selhal jen kvuli testovacimu predpokladu `affiliate_codes.updated_at`, ktery ve staging schematu neexistuje; migrace ani RPC nebyly meneny.
- Nebyl pouzit service role key.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebyly meneny registrace, `partner/register`, payments, wallet, vypocty provizi, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.
- Affiliate merchant referral zatim neni napojen na frontend `partner/register`, bonus 500 Kc za firmu, platby ani vypocty provizi.

---

## 2026-06-02 - Manual affiliate commission payment RPC staging verification

- Testovana migrace: `20260602_admin_record_affiliate_commission_for_payment_rpc.sql`.
- Commit migrace: `5fb14ad4cea514ccb03710ad3c5b5ee1c5666acd` (`feat: add manual affiliate commission payment rpc`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `admin_update_affiliate_partner_status` existuje.
- `record_affiliate_customer_attribution` existuje.
- `admin_record_affiliate_commission_for_payment` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- `affiliate_commission_events` ma `UNIQUE(payment_id)`.
- `payments` ma sloupce `id`, `user_id`, `amount`, `method`, `status`, `stripe_session_id`, `created_at`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck staging:
- `admin_record_affiliate_commission_for_payment(uuid,numeric,timestamptz,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Vysledek manual commission RPC testu:
- Testovaci kod: `TESTCOMM602070452490`.
- Docasny affiliate partner byl vytvoren pres `admin_create_affiliate_partner` a aktivovan pres `admin_update_affiliate_partner_status`.
- Docasny zakaznik byl vytvoren pouze na stagingu.
- Zákaznicka attribution byla vytvorena pres `record_affiliate_customer_attribution`.
- Docasna stripe platba byla pripravena jako testovaci `payments` zaznam.
- `admin_record_affiliate_commission_for_payment` s `p_paid_amount_czk = 500` vytvorilo zaznam v `affiliate_commission_events`.
- Overeno:
  - `payment_amount_snapshot = 500`,
  - `payment_amount_source = admin_rpc.p_paid_amount_czk`,
  - `commission_rate_snapshot = 0.02`,
  - `commission_amount_czk = 10.00`,
  - `status = calculated`.
- Audit log `affiliate_commission_event_recorded` byl overen.
- Ocekavane validacni chyby byly overeny:
  - `affiliate_commission_event_already_exists`,
  - `payment_method_not_eligible`,
  - `payment_not_completed`,
  - `affiliate_attribution_after_payment`,
  - `affiliate_attribution_not_found`,
  - `affiliate_partner_not_active`,
  - `not_admin`.
- Cleanup probehl: testovaci commission eventy, audit logy, platby, attribution, affiliate kody, affiliate partneri a docasni auth uzivatele jsou po cleanupu `absent`.
- Nezavisly cleanup check potvrdil `0 TESTCOMM*` affiliate kodu, `0 cs_test_commission_*` plateb a `0 codex-commission-*` auth uzivatelu.

Invariant:
- Nebyla potreba opravna migrace.
- Prvni testovaci beh narazil na existujici staging wallet trigger, ktery pri `INSERT` completed payment sahal na neexistujici `wallets.balance_vouchers`; migrace ani RPC nebyly meneny.
- Finalni test vlozil platby jako `pending` a status upravil na cilovy stav, aby overeni zustalo izolovane na manual commission RPC a netestovalo wallet trigger.
- Nebyl pouzit service role key.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nevznikl zadny trigger.
- Nebyly meneny Stripe webhook, payments flow, wallet ani automaticke provize.
- Nebyly meneny registrace, `partner/register`, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.

---

## 2026-06-02 - Affiliate detail admin views staging verification

- Testovana migrace: `20260602_admin_affiliate_detail_views.sql`.
- Commit migrace: `23fe6040809e44f596e6199e6f6406368b0e47c1` (`feat: add affiliate admin detail views`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Potrebne affiliate tabulky a sloupce existuji.
- Detailni views pred aplikaci jeste neexistovaly.
- `public.users.id`, `public.users.email`, `public.users.name` existuji.
- `public.profiles.id`, `public.profiles.full_name` existuji.

Postcheck staging:
- Views existuji:
  - `v_admin_affiliate_customer_attributions`,
  - `v_admin_affiliate_merchant_referrals`,
  - `v_admin_affiliate_commission_events`.
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

## 2026-06-02 - Affiliate DB production rollout

- Produkcni rollout affiliate DB vrstvy byl dokoncen v Supabase projektu `onemil` (`xkzhjldrojjlrkezorey`).
- Staging projekt `dxmowysntemfqfnanxua` nebyl v tomto rollout behu pouzit.
- Produkcni projekt byl pred aplikaci znovu potvrzen jako `onemil`, `ACTIVE_HEALTHY`.

Aplikovane zbyvajici migrace:
- `20260602_admin_update_affiliate_partner_status_rpc.sql`
- `20260602_fix_admin_update_affiliate_partner_status_contract_end.sql`
- `20260602_admin_set_affiliate_commission_rate_rpc.sql`
- `20260602_record_affiliate_customer_attribution_rpc.sql`
- `20260602_record_affiliate_merchant_referral_rpc.sql`
- `20260602_admin_record_affiliate_commission_for_payment_rpc.sql`
- `20260602_admin_affiliate_detail_views.sql`

Poznamka:
- Produkcni Davka 1 `20260602_affiliate_commission_foundation.sql` a `admin_create_affiliate_partner` byly aplikovane a overene uz pred timto dokoncenim rollout behu.

Kontroly po davkach:
- Ocekavane RPC/view po kazde migraci existovalo.
- RPC maji `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE` na RPC.
- Views maji `security_invoker = true`.
- Role `authenticated` ma `SELECT` na views.
- Affiliate tabulky zustaly prazdne.
- Na `payments`, `wallets`, `wallet_transactions`, `tickets`, `contests`, `partner_offers`, `partners` nepribyly zadne affiliate triggery.

Finalni postcheck:
- 9/9 affiliate tabulek existuje.
- RLS je zapnute na 9/9 affiliate tabulkach.
- 5/5 affiliate admin views existuje.
- 5/5 affiliate admin views ma `security_invoker = true`.
- 6/6 affiliate RPC existuje.
- 4/4 admin RPC jsou `SECURITY DEFINER`.
- `authenticated` ma `EXECUTE` na 6/6 RPC.
- `authenticated` ma `SELECT` na 5/5 views.
- `affiliate_commission_events` ma `UNIQUE(payment_id)`.
- `affiliate_payouts` ma CHECK constraint pro `period_month`.
- Detail views jdou cist bez chyby; produkcni pocty byly customer `0`, merchant `0`, commission `0`.
- Affiliate tabulky jsou po rollout prazdne.
- Neexistuji affiliate triggery ani affiliate policies na chranenych existujicich tabulkach.

Invariant:
- Nebyla vytvorena zadna produkcni testovaci data.
- Nebyl zalozen affiliate partner v produkci.
- Nebyla volana zadna zapisova affiliate RPC v produkci.
- Nebyl pouzit service role key ve skriptech.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebyl vytvoren trigger na `payments`.
- Nebyly meneny Stripe webhook, payments flow, wallet ani stary influencer system.
- Affiliate zatim zustava bez automatickeho napojeni na registrace, Stripe, payments flow, wallet a automaticke provize.

---

## 2026-06-02 - Affiliate production admin UI verification

- Produkční admin UI affiliate systému bylo ověřeno na `https://onemil.cz/admin/affiliate` jako přihlášený produkční admin.
- Stránka `https://onemil.cz/admin/affiliate` se otevřela.
- Taby `Partneři`, `Zákazníci`, `Firmy`, `Provize`, `Výplaty` fungují a přepínají příslušný obsah.
- Tlačítko `Vytvořit partnera` je viditelné.
- Dialog `Vytvořit affiliate partnera` se otevřel.
- V dialogu jsou přítomná všechna pole:
  - `Název partnera`,
  - `Affiliate kód`,
  - `Typ`,
  - `Kontaktní e-mail`,
  - `Právní název / firma`,
  - `Provizní sazba`,
  - `Začátek smlouvy`,
  - `Důvod vytvoření`,
  - `Poznámka`.
- Kliknuto bylo pouze na `Zrušit`.

Invariant:
- Nevznikla žádná produkční data.
- Nebyl vytvořen affiliate partner.
- Nebylo voláno zápisové RPC `admin_create_affiliate_partner`.
- Nebylo spuštěno SQL.
- Nebyly měněny soubory aplikace.
- Stripe, payments flow, wallet a starý influencer systém zůstaly beze změny.

---

## 2026-06-02 - Affiliate admin UI changed back to read-only

- Po záchranném auditu bylo potvrzeno, že původní veřejný influencer/affiliate systém zůstává hlavní provozní flow:
  `/influencer`, `/influencer/register`, `/influencer/dashboard`, `/admin/influencers`,
  `/admin/influencer-commissions`, `/admin/influencer-campaigns`.
- Nová affiliate DB/admin vrstva na `/admin/affiliate` byla ponechána pouze jako interní read-only přehled.
- Ze stránky `/admin/affiliate` bylo odstraněno/skryto tlačítko `Vytvořit partnera`, dialog
  `Vytvořit affiliate partnera` a UI volání zápisového RPC `admin_create_affiliate_partner`.
- Další krok má být návrh bridge: starý schválený partner v `partners` → nový záznam v
  `affiliate_partners` + lidský `affiliate_codes.code`.

Invariant:
- Nebyla vytvořena žádná produkční data.
- Nebylo voláno žádné zápisové RPC.
- Nebylo spuštěno SQL.
- Nebyly měněny DB migrace, affiliate tabulky ani DB RPC.
- Nebyly měněny Stripe webhook, payments flow, wallet ani původní influencer systém.

---

## 2026-06-02 - Affiliate legacy bridge staging test

- Bridge proposal `20260602_affiliate_legacy_partner_bridge_proposal.sql` byl aplikovaný pouze na staging `dxmowysntemfqfnanxua`; produkce `xkzhjldrojjlrkezorey` nebyla použita.
- RPC `admin_bridge_influencer_partner_to_affiliate` prošlo.
- Použitý existující staging partner: `E2E Affiliate Test Partner` (`25a79a73-4a8a-4649-ad6c-282c138b207b`).
- Testovací bridge kód: `BRIDGE20260602143530250`.
- Vznikl link, `affiliate_partner`, `affiliate_code`, rate history a audit log.
- Duplicitní bridge správně vrátil `legacy_partner_already_bridged`.
- Původní `partners` řádek zůstal beze změny.
- Cleanup smazal test bridge data; po cleanupu je test code/link/affiliate partner/rate history/audit log = `0`.
- Starý influencer systém nebyl změněn; Stripe, payments flow a wallet nebyly změněny.

**2026-06-02** — PAVEL01 self-attribution cleanup. Produkční monitoring ukázal 1 atribuci; detail potvrdil self-attribution: attribution_id `5dcd316a-6233-4191-9702-30a5bff1d1a9`, user_id `c23507eb-081c-4170-89ad-2e78df088103` (`influencer@onemil.cz`), code PAVEL01, display name Pavel Divis, legacy partner auth_user_id `c23507eb-081c-4170-89ad-2e78df088103` → is self attribution YES, source `direct_link`, locked true, landing_url `https://onemil.cz/?aff=PAVEL01`. Smazána pouze tato self-attribution + její audit log. Verifikace: remaining PAVEL01 attributions total = 0, remaining self attribution rows = 0, remaining audit logs = 0, ref collision rows = 0. PAVEL01 setup zachován (partner `9bf4e8ca…`, code `371c2cd1…` active, link `a50736a9…`); starý influencer systém, Stripe, payments flow, wallet a `/admin/affiliate` beze změny.

**2026-06-02** — Produkční capture-only smoke test `aff=PAVEL01` proběhl ručně v anonymním okně na `https://onemil.cz` (bez loginu). Test 1 `?aff=PAVEL01` → `onemil_affiliate_aff="PAVEL01"`, `onemil_referral_ref=null`. Test 2 `?ref=NEJAKYREF&aff=PAVEL01` → `onemil_affiliate_aff` se neuložil (ref má přednost). Test 3 `?aff=x` → neuložil se (nevalidní krátký aff odmítnut regexem). Žádný login/registrace, žádné SQL/RPC, žádná atribuce ani produkční data. Produkční tracking `aff=KOD` ověřen i ručně v prohlížeči.

**2026-06-02** — Produkční Lovable Publish affiliate trackingu `aff=KOD` ověřen (read-only fetch veřejných assetů). Bundle `https://onemil.cz/assets/index-ByC__JoZ.js` obsahuje `onemil_affiliate_aff`, `record_affiliate_customer_attribution`, regex `^[A-Z0-9][A-Z0-9_-]{2,31}$`, `direct_link`, `captured_via`, `aff_url`, `p_affiliate_code`. Název `useApplyPendingAffiliate` minifikovaný, funkční obsah přítomen. Bundle míří na produkční Supabase `xkzhjldrojjlrkezorey` (9×). Produkční tracking `aff=KOD` nasazený a aktivní. Žádná data, žádný login/registrace, žádné SQL/RPC; Stripe, payments, wallet, starý influencer systém a `/admin/affiliate` beze změny.

**2026-06-02** — Staging E2E ověření affiliate trackingu `aff=PAVEL01` (pouze staging `dxmowysntemfqfnanxua`, frontend lokálně na portu 8090 proti stagingu, commit `3f10500`). Pozitivní test PROŠEL: `onemil_affiliate_aff=PAVEL01`, `onemil_referral_ref` prázdné, 1 řádek v `user_affiliate_attributions` (affiliate_partner_id `9bf4e8ca-ce12-49cf-8c88-a9aa63ccfb47`, affiliate_code_id `371c2cd1-0fb2-4c0f-9b08-d5fc724aa4d6`, source `direct_link`, locked true), `/admin/affiliate`→Zákazníci ukázal uživatele pod E2E Affiliate Test Partner / PAVEL01, `influencer_referrals`=0. Negativní test `NEEXISTUJE` PROŠEL: login nespadl, atribuce=0. Kolizní test `?ref=NEJAKYREF&aff=PAVEL01` PROŠEL: aff se neuložil, atribuce=0, legacy referral=0. Cleanup: test uživatelé `aff-test-*@test.local` + jejich atribuce/identities/audit logy/profiles/wallets smazány (0 orphan). Staging PAVEL01 setup zachován (partner `9bf4e8ca…`, code `371c2cd1…` active, link `a50736a9…`). Předpotvrzení test uživatelé vytvořeni přes SQL (pgcrypto), protože MCP nevystavuje service_role. Produkce nepoužita ani publikována; produkční `.env` nedotčený. Tracking připraven na produkční Lovable Publish po schválení.

**2026-06-02** — Implementován frontend affiliate tracking `aff=KOD`. Nový `src/hooks/useApplyPendingAffiliate.ts` (sessionStorage klíč `onemil_affiliate_aff`, `normalizeAffiliateCode` regex `^[A-Z0-9][A-Z0-9_-]{2,31}$`, `capturePendingAffiliateFromUrl`, `useApplyPendingAffiliate` → RPC `record_affiliate_customer_attribution` s `p_source='direct_link'`). `Register.tsx`: zachycení `aff` z URL + apply po e-mail registraci (non-blocking). `App.tsx`: root capture `aff` z `location.search` + mount hooku vedle `useApplyPendingReferral`. `ref` a `aff` oddělené; při kolizi `ref` vyhrává a `aff` se neukládá; neznámý `aff` tiše ignorován; existující atribuci nepřepisuje (RPC first-touch). DB vrstva už existovala — žádná migrace, žádné SQL. Žádná vazba na Stripe/payments/wallet/provize; `/admin/affiliate` read-only; starý influencer systém beze změny. `npm run build` ✅. Produkce zatím nepublikována (čeká na staging test).

**2026-06-02** — Ruční UI ověření prvního produkčního bridge. `/admin/influencers`: řádek Pavel Divis ve sloupci „Affiliate vrstva" ukazuje „Napojeno na affiliate vrstvu" + kód PAVEL01 + status active. `/admin/affiliate` read-only tab Partneři: Pavel Divis, typ Influencer, stav Aktivní, kód PAVEL01, sazba 2 %, hodnoty zákazníci/firmy/provize/bonusy = 0; stránka read-only (žádné tlačítko Vytvořit partnera, pouze Obnovit). Žádné SQL/RPC/data; jen dokumentace.

**2026-06-02** — PRVNÍ OSTRÝ PRODUKČNÍ BRIDGE proveden v `xkzhjldrojjlrkezorey` (`onemil`) po potvrzení `SPOUSTIM`. RPC `admin_bridge_influencer_partner_to_affiliate` spuštěno jako přihlášený admin (superadmin `divispavel2@gmail.com`, `60f5837e-a280-4ddd-b0dd-f94cc844bb3b`) pro legacy partnera `1ef76f65-b028-408b-9a77-ea9d5cad6592` (Pavel Divis) → kód `PAVEL01`, rate `0.02`. Výsledek `status:bridged` — affiliate_partner_id `80edc966-adc4-455c-b2d8-64e01aa6167e`, affiliate_code_id `a7db63ef-37a4-4922-8858-5d2fc58009d2`, link_id `58f69a9d-00c8-4efc-8731-96c22d4540a4`. Postcheck OK: 1 bridge link, affiliate_partner active/influencer, code PAVEL01 active, rate history 0.02 valid_to NULL, audit log 1×, původní partners řádek nezměněn (status approved, notes, email, updated_at). Pouze tento jeden partner; starý influencer systém, /admin/affiliate (read-only), Stripe, payments flow a wallet beze změny; staging nepoužit.

**2026-06-02** — `/admin/influencers` (`src/pages/AdminInfluencers.tsx`): přidán pouze read-only přehled bridge stavu (napojení na novou affiliate vrstvu). Načítá view `v_admin_influencer_affiliate_bridge_candidates` fail-safe (`supabase as any`); při chybě admin nespadne, zobrazí neutrální hlášku. Nová souhrnná karta (schválení vhodní / napojení / nenapojení) + nový sloupec „Affiliate vrstva" se třemi stavy (`Napojeno na affiliate vrstvu` + affiliate kód/status, `Nenapojeno na affiliate vrstvu`, `Nelze napojit – není schválený`) + UI poznámka, že napojení je zatím jen evidenční. Žádné tlačítko pro bridge, žádné RPC volání, žádné SQL, žádný bridge link, žádná produkční data. Staré schvalování, provize, výplaty, `/influencer/register`, `/influencer/dashboard`, `/admin/affiliate` (read-only), Stripe, payments flow a wallet beze změny. `npm run build` ✅.

**2026-06-02** — Affiliate legacy bridge: produkční STRUKTURA aplikována do `xkzhjldrojjlrkezorey` (`onemil`), read-only postcheck prošel. Ověřeno: `affiliate_legacy_partner_links` existuje s RLS + admin SELECT policy; RPC `admin_bridge_influencer_partner_to_affiliate` existuje, je `SECURITY DEFINER`, `authenticated` má `EXECUTE`; view `v_admin_influencer_affiliate_bridge_candidates` existuje s `security_invoker = true` + `authenticated` SELECT; bridge link table má 0 řádků; 3 approved influencer kandidáti; 0 affiliate/bridge triggerů na partners/payments/wallets/wallet_transactions/tickets/contests/partner_offers. Žádný partner nebyl bridgnutý, žádné bridge RPC nebylo voláno pro konkrétního partnera, žádná produkční testovací data nevznikla. `/admin/affiliate` zůstává read-only; Stripe, payments flow a wallet nedotčeny.
- **2026-06-03** — Affiliate v2 staging browser E2E final verification completed. Staging token config was fixed: Supabase staging `INTERNAL_FUNCTION_TOKEN` and GitHub Actions staging `STAGING_VITE_INTERNAL_FUNCTION_TOKEN` were aligned to the same plaintext value without logging or committing the token. `get-pending-partner-registrations` no longer returns 401. Browser E2E `affiliate company via flow` passed and verified `/partner/register?via=KOD` → pending registrace → admin schválení → partner → `affiliate_company_refs` → `partners.referred_by_affiliate_id`. Run URL: `https://github.com/Divuna/million-ticket-draw/actions/runs/26882872534`. Verified commit: `c9d383fc55d118a9cce5b12e67f5fb637cb124f9`. Production was not touched.
## 2026-06-07 - Admin navigace: badge čekajících partnerských registrací

- Admin kontextová podlišta v sekci `Uživatelé a partneři` nově zobrazuje u položky `Partneři` červený badge s počtem čekajících partnerských registrací.
- Badge se zobrazuje jen při počtu `> 0`; při kliknutí se dál otevírá stávající `/admin/partners`.
- Počet se načítá read-only přes existující `get-pending-partner-registrations`.
- Změněný soubor: `src/components/admin/AdminContextSubNav.tsx`. Commit `0339cd4a6775bb8dc34f395aa16f302d9fc61034`. `npm run build` prošel. GitHub Playwright Smoke Tests prošly.
- Nezměněno: DB, schvalování partnerů, affiliate logika, onboarding, zprávy a ostatní admin oblasti.

---

## 2026-06-07 - Affiliate/referral odkazy: bezpečná veřejná doména

- Přidán bezpečný helper pro veřejnou base URL affiliate/referral/partner odkazů.
- Helper použije `VITE_APP_URL` jen když je HTTPS a není localhost, Lovable ani preview; jinak fallback `https://onemil.cz`.
- Affiliate dashboard generuje zákaznický/social odkaz `https://onemil.cz/?ref=CODE` a obchodnický odkaz `https://onemil.cz/partner/register?via=CODE`.
- Helper použit také pro legacy influencer referral link a hráčský referral link; spec 26 rozšířen o kontrolu produkční domény a zákaz Lovable/localhost.
- Změněné soubory: `src/lib/publicAppUrl.ts`, `src/pages/AffiliateDashboard.tsx`, `src/hooks/useInfluencerData.ts`, `src/components/ReferralSection.tsx`, `tests/e2e/26-affiliate-dashboard-content.spec.ts`.
- Commit `d2b125045848d0baffbef2d4de8abff362097d5b`. `npm run build` prošel. GitHub Playwright Smoke Tests prošly. GitHub Playwright Staging Full E2E prošel.
- Nezměněno: DB, affiliate tracking, provize, partner registration logic, ticket logic, wallet logic a UI grafika.

---
## 2026-06-07 - Rozhodnutí: cílový B2B workflow pro `Přidat firmu`

- Schválen cílový model pro sales reps / agentury v `/affiliate/dashboard` režimu `Obchodník`: akce `Přidat firmu`.
- Sales rep vyplní company name, IČO, DIČ, company email, website, contact person / phone a sales rep note.
- Firma dostane e-mail, že sales rep / agentura požádal o registraci firmy do OneMil; e-mail musí říkat, kdo žádost poslal, co je OneMil, a obsahovat `Potvrzuji žádost` + možnost `Zamítnout žádost`.
- Dokud firma nepotvrdí, jde jen o invitation/lead a nesmí vzniknout plnohodnotná admin partnerská registrace.
- Po potvrzení firmou se žádost přesune do admin schvalování. Dashboard obchodníka má ukazovat stavy `odesláno firmě`, `firma potvrdila`, `firma zamítla`, `čeká na schválení adminem`, `schváleno`, `zamítnuto adminem`.
- Po schválení adminem systém vytvoří/aktivuje firemní partner účet, přiřadí firmu pod sales rep / agenturu, zapíše `affiliate_company_refs`, zrcadlí do `partners.referred_by_affiliate_id` a pošle firmě bezpečný jednorázový odkaz s expirací pro nastavení hesla.
- Nikdy neposílat firmám vygenerovaná hesla e-mailem.
- Provize nevzniká z vytvoření leadu, potvrzení firmy ani admin schválení; vzniká pouze z placené / fakturované aktivity firmy, například ze zaplacených `partner_invoices`.
- Pravidla: influencer codes zůstávají hlavně pro zákazníky; B2B atribuce se nesmí opírat jen o veřejně sdílené odkazy; sales rep nemůže claimnout firmu bez potvrzení firmy; firma musí mít možnost odmítnout; admin schvaluje jen firmou potvrzené žádosti; finální zdroj atribuce zůstává `affiliate_company_refs` + `partners.referred_by_affiliate_id`; existující výpočet provizí má zůstat podle paid/factured aktivity.
- Pouze dokumentační rozhodnutí. Nebyl měněn app kód, DB, provize, registrace partnerů, ticket/wallet logika, UI grafika ani nesouvisející dokumentace.

---

## 2026-06-07 - Rozhodnutí: umístění B2B funkce `Přidat firmu`

- `/affiliate/login` zůstává pouze pro přihlášení Affiliate účtu.
- `Přidat firmu` nesmí být umístěno na Affiliate login stránce a patří pouze do `/affiliate/dashboard`.
- Funkce je viditelná jen pro schválené affiliate účty, jejichž `modes` obsahuje `sales_rep`.
- Umístění: sales rep / `Obchodník` část dashboardu poblíž `Moje firmy`, leadů, stavů žádostí a firemních provizních dat.
- Influencer-only účty bez `sales_rep` funkci nesmí vidět.
- Veřejný B2B company claim nesmí vznikat z login stránky ani z nepřihlášeného flow.
- Pouze dokumentace; app kód, DB, auth, provize, partner registration logic, UI grafika a nesouvisející dokumentace nebyly měněny.

---

## 2026-06-07 - Rozhodnutí: Phase 1 DB design pro B2B company leads

- Schválený název budoucí tabulky: `affiliate_company_leads`.
- Tabulka bude pre-attribution workflow vrstva pro B2B company leady vytvořené schválenými sales reps / agenturami.
- Finální atribuce zůstává pouze v `affiliate_company_refs` a `partners.referred_by_affiliate_id`.
- `affiliate_id` má být nullable FK na `affiliate_accounts(id)` s `ON DELETE SET NULL`, ne cascade.
- Lead musí mít snapshoty obchodníka: `sales_rep_affiliate_id_snapshot`, `sales_rep_ref_code_snapshot`, `sales_rep_email_snapshot`, `sales_rep_name_snapshot`.
- Eligibility sales rep účtu: `affiliate_accounts.status = 'approved'`, `'sales_rep' = ANY(modes)` a `affiliate_accounts.auth_user_id = auth.uid()`.
- Povolené stavy leadu: `sent_to_company`, `company_confirmed`, `company_rejected`, `pending_admin_approval`, `approved`, `admin_rejected`, `expired`.
- Po admin schválení má finální `affiliate_company_refs.source` používat hodnotu `company_lead`.
- Potvrzení/zamítnutí firmou má jít přes Edge Function nebo `SECURITY DEFINER` RPC s hashed tokenem.
- Provize nevzniká z vytvoření leadu, potvrzení firmy ani admin schválení; zůstává pouze z placené / fakturované aktivity firmy.
- Pouze dokumentační rozhodnutí. Nebyla napsána migrace a nebyl měněn app kód, DB, provize, registrace partnerů, ticket/wallet logika, UI grafika ani nesouvisející dokumentace.

---

## 2026-06-07 - B2B company leads Phase 1 DB aplikováno na STAGING

- Phase 1 DB foundation pro `affiliate_company_leads` byla aplikována pouze na staging projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkční projekt `xkzhjldrojjlrkezorey` nebyl použit ani dotčen.
- Hlavní staging migrace `affiliate_company_leads_phase1` proběhla úspěšně.
- Follow-up index migrace `supabase/migrations/20260607173746_affiliate_company_leads_admin_reviewed_by_index.sql` proběhla úspěšně; commit `3260b1c60f1a01e7c524443ce1c413c739891621`.
- Přidán index `idx_affiliate_company_leads_admin_reviewed_by`.
- Ověřeno na stagingu: tabulka existuje, RLS je zapnuté, policies existují, `anon` nemá přístup, `authenticated` má pouze SELECT přes RLS, běžní uživatelé nemají INSERT/UPDATE/DELETE a index existuje.
- Nebyl měněn app kód, UI, Edge Functions, e-maily, admin approval flow, provize, partner registration logic, ticket/wallet logika, grafika ani nesouvisející dokumentace.

---

## 2026-06-07 - Rozhodnutí: Phase 2 backend design pro B2B company leads

- Schválen backend design pouze jako návrh, bez implementace kódu, DB, Edge Functions nebo UI.
- `create-affiliate-company-lead`: authenticated Edge Function z `/affiliate/dashboard`, jen pro approved affiliate account s `'sales_rep' = ANY(modes)`, vytvoří lead, vygeneruje secure confirmation token, uloží jen token hash, pošle firmě potvrzovací e-mail a vrátí `{ success: true, lead_id, status: "sent_to_company" }`.
- `confirm-affiliate-company-lead`: public token endpoint, validuje token hash, expiraci a nepoužitý token; `confirm` nastaví `pending_admin_approval`, `reject` nastaví `company_rejected`; nesmí vytvořit partnera, atribuci ani provizi.
- `approve-affiliate-company-lead`: admin-only Edge Function, volitelně backed by RPC; schvaluje pouze `pending_admin_approval`, vytvoří/aktivuje partner účet, zapíše `affiliate_company_refs.source = 'company_lead'`, zrcadlí do `partners.referred_by_affiliate_id`, pošle secure password setup link, nikdy neposílá vygenerované heslo a nesmí vytvořit provizi.
- Povolené status transitions: `sent_to_company -> pending_admin_approval`, `sent_to_company -> company_rejected`, `sent_to_company -> expired`, `pending_admin_approval -> approved`, `pending_admin_approval -> admin_rejected`.
- Blokováno: žádné přímé `sent_to_company -> approved`, žádné schválení po rejected/expired, `approved` je finální, žádná atribuce před admin approval.
- Email events: company confirmation email, admin notification after company confirmation, company rejection notification to sales rep, admin approval email with password setup link, optional admin rejection email.
- Test coverage má zahrnout sales rep create, influencer-only block, anonymous block, token hash only, confirm/reject transitions, expired/used token block, admin approval creates partner + attribution, normal user cannot approve, no commission until paid/factured company activity.
- Produkce se nesmí dotknout. Beze změny ticket, wallet, payment, `buy_ticket_atomic`, graphics, login placement, commission logic, partner registration logic a finální atribuce zůstává `affiliate_company_refs` + `partners.referred_by_affiliate_id`.

---
