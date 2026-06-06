# CLAUDE.md

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
