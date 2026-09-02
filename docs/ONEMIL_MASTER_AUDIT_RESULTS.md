# OneMil — Master funkční + bezpečnostní audit: VÝSLEDKY

**Datum auditu:** 2. 9. 2026
**Auditovaný commit:** `origin/main` @ `313b08dfa531db23f61c4f0269a46a4238852b1c`
**Rozsah:** READ-ONLY statická analýza kódu, migrací a testů v tomto checkoutu. Žádná změna kódu,
databáze, migrací, Edge Functions ani produkční konfigurace nebyla provedena.
**Zdroj specifikace:** `docs/OneMil_MASTER_FUNKCNI_BEZPECNOSTNI_AUDIT_CHECKLIST_2026-09-02.docx`,
bloky A01–A16.

## Jak číst tento dokument

- Každý blok má souhrnný stavový tag: **[OK]** / **[ČÁSTEČNĚ]** / **[NEOVĚŘENO]** / **[CHYBA]** /
  **[ODLOŽENO]**, a u jednotlivých položek vlastní tag, pokud se od bloku liší.
- **NEOVĚŘENO** znamená: nelze potvrdit ani vyvrátit ze statického kódu — vyžaduje přímý přístup
  k produkční/staging databázi, Supabase Dashboardu, Vercelu nebo živému běhu aplikace, který tato
  relace neměla k dispozici (žádné Supabase/Vercel credentials; odchozí HTTPS jde přes sandboxovaný
  proxy, který by případný `curl` na produkci stejně znevěrohodnil).
- Starší tvrzení v `CLAUDE.md`/`onemil_state.md`/`onemil_history.md` byla brána jako **kontext, ne
  jako důkaz** — u každého bodu, kde audit checklistu tvrdí „[OK]" nebo „opraveno", bylo provedeno
  nezávislé ověření proti aktuálnímu kódu; kde se checklist a kód rozešly, je to výslovně uvedeno.
- Zásadní strukturální zjištění platné napříč téměř všemi bloky: **RLS politiky a schéma několika
  klíčových tabulek (`payments`, `tickets`, `winners`, `wallets`, `public.users`, `content_pages`,
  `profiles` u zakládajících sloupců) nejsou vůbec zachyceny v `supabase/migrations/`** — původní
  schéma bylo v tomto projektu opakovaně aplikováno přímo přes SQL Editor mimo verzovanou historii.
  To znamená, že „soubor migrace existuje" **není** důkaz, že daný stav skutečně běží na produkci,
  a naopak absence migrace neznamená, že daná ochrana v produkci chybí — jen že ji nelze touto cestou
  ověřit. Tento fakt se v textu níže neopakuje u každé položky zvlášť, ale platí univerzálně.

---

## A01 — Registrace + profil + role + přístup k vlastním/cizím datům

**Stav bloku: [ČÁSTEČNĚ]** (jedna položka reálně nefunguje jako celopodnikový bezpečnostní/compliance
mechanismus — viz věk 18+)

### Registrace vytvoří účet a navazující profil/peněženku — [ČÁSTEČNĚ]
- **Očekávané:** `auth.signUp` → `auth.users` → automatické `profiles`, `wallets`, `user_roles`.
- **Zjištěno:** Trigger `handle_new_auth_user()` (`supabase/migrations/20260420_fix_profiles_insert_remove_user_id.sql:14-78`)
  vkládá `users`/`profiles`/`wallets`, každý insert v `BEGIN...EXCEPTION WHEN OTHERS THEN RAISE LOG`
  bloku — **selhání kteréhokoli je jen zalogováno, `auth.users` řádek vznikne vždy** (design „registrace
  nikdy neselže", `20260320140000_auth_registration_never_fail.sql`). Historicky se to už jednou reálně
  stalo: dřívější verze vkládala neexistující sloupec `user_id` do `profiles`, což tiše produkovalo
  **nula** `profiles` řádků pro každou registraci, dokud nebylo opraveno (stejný soubor, backfill
  přiložen).
  Samostatně: `src/hooks/useAuth.ts:183` dělá `await supabase.from('user_legal_acceptances').insert(...)`
  bez kontroly `error` — selhání zápisu souhlasu (ToS/GDPR/18+) je tiché.
- **Důkaz:** viz výše; test `tests/e2e/01-registration.spec.ts:44-105` **vůbec nekontroluje**
  `profiles`/`wallets` — jen session v `localStorage` a render nav.
- **Riziko:** Design „nikdy neselže" je vědomá volba, ale bez testu ověřujícího vznik `profiles`/`wallets`
  by budoucí regrese (přejmenování sloupce, změna FK) prošla nepovšimnuta — přesně jako už jednou prošla.
- **Co ověřit v produkci:** dotaz na `auth.users` bez odpovídajícího `profiles`/`wallets` řádku (orphan
  check, viz i A11).
- **Co opravit (popis):** E2E test ověřující reálný vznik `profiles`+`wallets` po registraci; kontrola
  `error` u `user_legal_acceptances` insertu.

### Přihlášení funguje, admin-first invariant — [ČÁSTEČNĚ→OK v jádru]
- **Zjištěno — POTVRZENO PŘESNĚ podle CLAUDE.md invariantu:** `src/pages/Login.tsx:66-90` — krok 1 je
  vždy kontrola `user_roles` (kanonická tabulka), admin routuje na `/admin` bez ohledu na partner/affiliate
  záznam; teprve pak partner/affiliate dedikované loginy; pak zákazník. Session handling `useAuth.ts:84-256`
  je solidní (listener první, pak `getSession()`, `PASSWORD_RECOVERY`/`USER_UPDATED` batchováno).
- **Riziko:** nízké pro samotnou logiku. Chybí jeden komplexní test přihlášení pro všechny 4 typy účtů
  z jednoho specu (checklist to sám takto označuje).

### Profil ukládá jméno/kontakt správnému uživateli — [ČÁSTEČNĚ]
- **Zjištěno:** `Profile.tsx` nemá žádný URL parametr uživatele — vždy `user.id` ze session, žádný IDOR
  vektor v samotné stránce. Historicky ale existoval **reálný, nasazený bug**: `profiles` upsert
  (INSERT-on-conflict) padal na `42501` (RLS), protože INSERT `WITH CHECK` politika `profiles_insert_own`
  chyběla navzdory tomu, že prakticky identická politika byla v migracích už 5 měsíců předtím — konkrétní
  doklad, že „migrace v repu" ≠ „politika v produkci" (`20251217170601_.sql` vs. oprava
  `20260531_profiles_insert_own_rls.sql`).
- **Riziko:** nízké dnes, ale bez regresního testu na živý upsert by se stejný scénář mohl zopakovat
  nepozorovaně.

### Věkové pravidlo 18+ — **[CHYBA]** (nejzávažnější nález bloku A01)
- **Očekávané:** registrace/onboarding konzistentně vynucují 18+.
- **Zjištěno:** Produkt od DOB ověřování **zcela upustil**. `src/pages/Register.tsx:38,131-133` v kódu
  sám přiznává: *„Datum narození se už nesbírá ani neukládá... věk NENÍ perzistován, profiles nemá
  žádný sloupec pro potvrzení věku."* Jediná ochrana je klientský checkbox, který blokuje odeslání
  formuláře, a zápis do `user_legal_acceptances` je **jen auditní záznam sebeprohlášení**, ne skutečná
  kontrola věku. `useDateOfBirthCheck.ts`/`DateOfBirthGuard.tsx` explicitně dokumentují, že DOB guard
  byl odstraněn a `/onboarding/date-of-birth` je dnes no-op redirect. **Neexistuje žádná cesta v kódu,
  která by ze skutečného data narození spočítala věk a odmítla registraci pod 18 let.**
- **Důkaz:** `src/pages/Register.tsx:38-46,73-171`; `src/hooks/useDateOfBirthCheck.ts:4-11`;
  `src/components/DateOfBirthGuard.tsx:8-13,24`. Test `tests/e2e/49-age-gating.spec.ts:16` sám sebe
  popisuje jako *„čistě frontendový — žádný Supabase signup se neprovede"*.
- **Riziko:** Vysoké — reálná compliance expozice pro platformu se skutečnými penězi; jde o produktové/
  právní rozhodnutí, ne malý bug, ale checklistové tvrzení „18+ se uplatní konzistentně" dnes neplatí
  jako skutečná kontrola.
- **Co opravit (popis):** buď vědomě zdokumentovat sebeprohlášení jako přijatý compliance postoj (a
  přeformulovat checklist), nebo znovu zavést reálné ověření (server-side).

### Cross-user přístup k datům — [NEOVĚŘENO], s reálnou historií nálezů
- **Zjištěno:** dva reálné, dříve existující a nyní opravené bugy stejné třídy: `ensure_referral_code(uuid)`
  bez `auth.uid()` kontroly (opraveno `20260826090000_ensure_referral_code_owner_guard.sql`, reprodukováno
  na stagingu jako `anon` — vracelo cizí referral kód a i vytvořilo řádek pro smyšlené UUID); `wallets`
  self-mint díra (`WITH CHECK (auth.uid()=user_id)` bez kontroly hodnot — uživatel si mohl vložit vlastní
  wallet s libovolným zůstatkem, reprodukováno na stagingu: `999999`/`555`; opraveno
  `20260717220000_wallets_insert_zero_balance_only.sql`).
- **Riziko:** oba doložené případy byly nalezeny manuálně, ne testem — žádný committed regresní test
  pro cross-user RLS izolaci `profiles`/`wallets` neexistuje.
- **Co opravit (popis):** committed E2E RLS-izolační test pro `profiles`/`wallets` (dva reálné účty,
  ověřit nulovou viditelnost), po vzoru existujících voucher/referral RLS testů.

---

## A02 — MioCoin wallet + všechny pohyby + reconciliation

**Stav bloku: [CHYBA]** (reálný, konkrétně doložený double-credit bug + potvrzená absence jakékoli
reconciliace)

### Každý příjem/výdej změní peněženku přesně jednou — **[CHYBA]**
- **Zjištěno — silné strany:** Stripe top-up (trigger `update_wallet_after_payment`, `UNIQUE` index na
  `stripe_session_id`), `buy_ticket_atomic` (`FOR UPDATE` na `contests`+`wallets`), `buy_voucher_atomic`
  (`FOR UPDATE`+`SKIP LOCKED`), `redeem_miocoin_code` (`FOR UPDATE` na kódu), refund flow
  (`prepare_stripe_refund`/`finalize_stripe_refund`/`reverse_failed_stripe_refund`, kryto reálnými
  unikátními indexy `uniq_wallet_tx_refund_debit_per_payment`/`_reversal_per_payment`) — všechny tyto
  cesty jsou atomické a mají ledger zápis ve stejné transakci.
- **KRITICKÝ nález — reálný double-credit MioCoin bonusu:**
  1. `on_bonus_winner_add_to_bonus_wallet()` trigger při výhře bonusu připisuje do **`bonus_balance_coins`**
     (samostatný sloupec, ne utratitelný zůstatek).
  2. Zákazník klikne „Uplatnit výhru" v `TicketResultModal.tsx:484-519` → RPC `claim_miocoin_bonus`
     (`20260718155740_restrict_bonus_wallet_rpc_access.sql:20-68`) — připíše stejnou částku do
     **`balance_coins`** (utratitelný zůstatek). **Nikdy nesníží `bonus_balance_coins`.**
  3. Zákazník později klikne „Převést bonusové MioCoiny do hlavní peněženky" v `Profile.tsx:446-470` →
     RPC `transfer_bonus_to_main` — přesune **celý** (stále nafouknutý) `bonus_balance_coins` pool do
     `balance_coins` a vynuluje ho.
  4. **Výsledek: stejný bonus lze legitimním, běžným používáním UI (dvě různá tlačítka) připsat do
     utratitelného zůstatku dvakrát.** Jediná funkce, která by drift opravila (`recalculate_bonus_wallet()`),
     nemá žádného volajícího nikde v repu (`service_role`-only, žádný cron).
- **Důkaz:** `20260718155740_restrict_bonus_wallet_rpc_access.sql:20-68,140-173,219-236`;
  `TicketResultModal.tsx:484-519`; `Profile.tsx:446-470`. Existující test
  `tests/e2e/85-bonus-wallet-rpc-ownership-contract.spec.ts` je **čistě statický string-match test proti
  textu migrace** — nespouští žádné RPC, tento scénář vůbec neověřuje.
- **Riziko:** VYSOKÉ — přímý finanční bug, nevyžaduje útok, jen běžné sekvenční použití dvou legitimních
  tlačítek.
- **Co ověřit v produkci:** dotaz na `wallet_transactions` na uživatele s `bonus_claim` i `bonus_transfer`
  řádkem v překrývajícím se okně; zda `wallets.bonus_balance_coins` zůstává nenulový u již uplatněných
  výher.
- **Co opravit (popis):** `claim_miocoin_bonus` musí ve stejné transakci snížit `bonus_balance_coins`
  o stejnou částku, nebo sjednotit oba mechanismy do jednoho.

### Historie odpovídá zůstatku (reconciliation) — **[NEOVĚŘENO → potvrzeno chybí]**
- **Zjištěno:** `tests/wallet-integrity-queries.sql` (ruční SQL skript, není napojen na CI) sám ve svém
  komentáři říká, že `balance ≠ SUM(payments.amount)` je „očekávané" a jediná ověřovaná invarianta je
  `balance_coins &gt;= 0` — **skutečná reconciliace `SUM(wallet_transactions) == balance_coins` neexistuje
  nikde**. Views `contest_integrity_check`/`system_health_monitor` existují v DB, ale nikde v repu nejsou
  volané (jen v auto-generovaných typech).
- **Riziko:** Vysoké — přesně to, co checklist označuje jako povinné před ostrým masovým provozem.

### Souběh (double-click/retry) — [ČÁSTEČNĚ]
- **Zjištěno:** server-side dobře chráněno (`FOR UPDATE` lockování na hlavních cestách). Existuje
  load-test skript `scripts/concurrency-test-race-condition.mjs`, ale jeho **výchozí URL míří na
  produkci** (`xkzhjldrojjlrkezorey`), ne staging — riziko samo o sobě. Žádný důkaz, že byl kdy spuštěn
  (žádný uložený výstup v repu). Staging-only test `tests/e2e/88-stripe-refund-flow-db.spec.ts` je
  v CI trvale vypnutý (`E2E_REFUND_HARDENING` se nikde nenastavuje).
- **Riziko:** Střední — návrh zamykání vypadá správně, ale nebyl nikdy prokazatelně zatížen souběhem.
- **Co opravit (popis):** přesměrovat výchozí URL skriptu na staging; zapojit spec 88 do plánovaného
  staging běhu.

### Osiřelé peněženky — [ČÁSTEČNĚ]
- **Zjištěno:** reálná FK (`wallets_user_id_fkey`) je doložena přímo citací produkční chybové hlášky
  v migraci (`20260315310000_fix_handle_new_auth_user.sql:2-4`), ne jen předpokladem — solidní důkaz i
  bez `CREATE TABLE` v migracích. `ON DELETE` chování neznámé.

### Extra nález — 16 nezvrácených referral odměn
- `20260803120000_fix_referral_reversal_ambiguous_call.sql` dokumentuje, že `reverse_referral_reward_on_payment_status_change()`
  volala přetíženou funkci nejednoznačně a **tiše selhávala** (`42725`) — produkční stav v době zápisu
  „16 odměn earned, 0 reversed", migrace **záměrně nebackfilluje** tyto řádky.
- **Co ověřit v produkci:** `SELECT COUNT(*) FROM referral_rewards rr JOIN payments p ON p.id=rr.payment_id
  WHERE rr.status='earned' AND p.status &lt;&gt; 'completed'`.

---

## A03 — Stripe platba + webhook + refund + souběh

**Stav bloku: [ČÁSTEČNĚ]** (kód je velmi dobře ošetřený; hlavní mezera je evidenční — `payments` nemá
žádnou RLS politiku nikde v migracích)

### Úspěšná platba připíše jen jednou — [OK]
- Server derivuje MioCoin částku ze **skutečné** Stripe částky (`session.amount_total`), ne z klientem
  poslaného `priceInCzk` — nezávislé přepočítání přes stejnou tier-tabulku na obou koncích. Trigger
  credituje jen na `status='completed'` a jen při INSERTu (nikdy UPDATE).

### Opakovaný webhook nesmí dvojitě připsat — [ČÁSTEČNĚ]
- **Zjištěno:** aplikační kód dělá klasický SELECT-before-INSERT (TOCTOU race), ale je **kryt reálným
  DB partial UNIQUE indexem** (`idx_payments_stripe_session_id_unique`) — souběžné duplicitní INSERTy
  jeden prohrají s `23505`, žádné dvojité připsání nevznikne (jen zbytečný 500 + Stripe retry).
  **Žádný test v repu neexistuje**, který by tento souběh skutečně vyzkoušel paralelně.
- **Riziko:** nízko-střední — finanční výsledek je bezpečný, ale chybí explicitní ošetření `23505` a
  chybí test.

### Neúspěšná/zrušená platba nesmí připsat — [OK]
- Žádný handler pro `checkout.session.expired`/`payment_intent.payment_failed` neexistuje, `session.payment_status !== 'paid'`
  je explicitně kontrolováno — strukturálně nelze omylem připsat.
- **Extra nález:** `PaymentSuccess.tsx` zobrazuje úspěšný toast **nepodmíněně** hned při načtení stránky,
  nezávisle na skutečném ověření, že platba je `completed` — kosmetický/UX problém (bod 14 metody), ne
  finanční.

### Refundace — [OK] (nejsilněji ošetřená část celého systému)
- Pořadí opraveno (debit→pak Stripe, ne naopak jako u historického bugu), plný zůstatek vyžadován
  (žádné částečné clawbacky), `FOR UPDATE` zamykání, terminal-state ochrana, `reverse_failed_stripe_refund`
  i vrací referral odměnu zpět. Legacy `admin_manage_payment` refund cesta je natvrdo zablokovaná.
  Rozsáhle pokryto staging testem `tests/e2e/88-stripe-refund-flow-db.spec.ts` (88a–88u) — ale ten je
  v CI trvale vypnutý (viz A02).

### Extra nález — `payments` RLS neviditelná
- V celé historii migrací nebyla nalezena **žádná** `CREATE POLICY`/RLS-enable pro `payments`, ani
  `CREATE TABLE`. Nelze potvrdit, zda produkce vůbec RLS na této tabulce má.

---

## A04 — Vouchery a partner odměny

**Stav bloku: [ČÁSTEČNĚ]**

### Cena a efekt voucheru — [ČÁSTEČNĚ]
- Cena `5` MioCoinů potvrzena přímo v aktuální definici `buy_voucher_atomic`
  (`20260718163000_security_rpc_hardening.sql:66,236-244`), shoda všech 4 UI míst. `redeem_price_vouchers`
  potvrzeně nepoužitý.
- **Otevřená otázka:** aktuální `buy_voucher_atomic` tvrdě závisí na `voucher_codes`/`voucher_code_batches`
  z migrace, jejíž **vlastní hlavička výslovně tvrdí „staging-only, no production apply in this phase"**
  — žádná pozdější migrace apply na produkci nepotvrzuje. NEOVĚŘENO, zda tato verze skutečně běží
  v produkci.

### Dvojí použití / cizí uživatel — [OK] strukturálně
- `auth.uid()` vlastnictví, `FOR UPDATE SKIP LOCKED` na `voucher_codes`, žádný race ve fyzickém přiřazení
  kódu. Chybí ale skutečný **souběžný** (Promise.all) test posledního kusu voucheru.

### Partner odměny podle objednávek — [ČÁSTEČNĚ]
- `create_partner_order_reward`/`update_partner_order_reward_status`/`redeem_miocoin_code` solidně
  zamčené (advisory lock + `FOR UPDATE`), `service_role`-only granty, email-mismatch ochrana potvrzena
  v aktuálním kódu. Shoptet import volá **stejné** RPC jako přímé Partner API.
- **Potvrzeno stále otevřené:** idempotence je klíčovaná `(partner_id, external_order_id)` — **žádný**
  e-shop-scoping sloupec nikde neexistuje. Partner s více e-shopy může tiše přijít o odměnu při kolizi
  čísel objednávek.
- **Extra nález:** dva nezávislé enginy pro výpočet partnerské odměny — `create_partner_order_reward`
  (celočíselný floor) vs. `compute_partner_reward` (zaokrouhlení na 1 des. místo) — různá pravidla pro
  zdánlivě stejný typ události.

---

## A05 — Soutěž + atomický ticket + bonus + hlavní výhra

**Stav bloku: [CHYBA]** (kritická autorizační díra)

### Tikety se otevírají postupně a atomicky — [OK]
- `buy_ticket_atomic` (`20260717190000_...sql:43-181`) — `FOR UPDATE` na `contests`+`wallets`,
  identita vždy `auth.uid()`, `UNIQUE(contest_id, number)` jako druhá pojistka. Solidní.

### Hlavní výhra na pevné pozici, jen jednou — **[CHYBA]**
- **Zjištěno:** organický sellout je skutečně deterministický (pozice = `ticket_count`). **Ale existuje
  druhá, zcela odlišná cesta**: admin „Ukončit tažení" → `trigger_contest_draw` → `close_contest`
  (`20260322150000_...sql:310-389`) — **skutečný náhodný los** (`ORDER BY random() LIMIT 1`) mezi již
  prodanými tikety. Toto přímo popírá produktové tvrzení „výherní pozice jsou předem dané" pro případ
  ručního předčasného uzavření administrátorem — a nikde v UI není varování, že jde o jiný mechanismus.
- **KRITICKÝ nález — privilege escalation:** `pause_contest(uuid)` a `resume_contest(uuid)`
  (`20260316120000_contest_control_rpcs.sql:8-35`) **nemají žádnou interní kontrolu role** — pouhé
  `UPDATE contests SET status=... WHERE id=...`. Pozdější migrace (`20260718153015_...sql`) jen mění
  granty a **tvrdí ve vlastním komentáři, že tělo funkcí kontrolu role má** — což čtení skutečného těla
  vyvrací. **Grant je `authenticated`, ne jen `service_role`.** Důsledek: **jakýkoli přihlášený zákazník
  může zavolat `resume_contest` na libovolnou i uzavřenou soutěž a znovu ji aktivovat, nebo zavolat
  `pause_contest` a zastavit prodej živé soutěže** — čistě přímým RPC voláním, mimo UI. Existující test
  `tests/e2e/84-contest-rpc-grants-contract.spec.ts` **potvrzuje grant jako očekávaný fakt, ale
  nekontroluje absenci role-guardu** — neodhalil by tuto díru.
- **Vedlejší nález:** `admin_manage_contest` mění `ticket_count` bez jakékoli kontroly na už prodané
  tikety — může tiše posunout pozici hlavní výhry uprostřed prodeje, nebo trvale „zaseknout" soutěž bez
  výherce, pokud je nový `ticket_count` nižší než `next_ticket_number`.
- **Riziko:** KRITICKÉ. Reálná autorizační díra dostupná každému přihlášenému uživateli.
- **Co ověřit v produkci:** živé granty na `pause_contest`/`resume_contest` (`SELECT has_function_privilege(...)`).
- **Co opravit (popis):** přidat `IF NOT (has_role admin/superadmin) THEN RAISE EXCEPTION` do obou
  funkcí; server-side blokovat přechod z `closed` v `admin_manage_contest`/`resume_contest`; zamknout
  `ticket_count` po prvním prodeji.

### Bonusové výhry na správných pozicích — [ČÁSTEČNĚ]
- RLS skrývající `pending` pozice je aktuální a správně navržená (`bonus_prizes_select_resolved`).
  **Ale:** chunked bonus-save RPC (`admin_append_miocoin_chunk`) nekontroluje horní hranici pozice —
  pokud bonusová pozice někdy padne na poslední tiket, `buy_ticket_atomic` vytvoří **oba** `winners`
  řádky (main i bonus) najednou, protože neexistuje `UNIQUE(ticket_id)`.

### Uzavřenou soutěž nelze znovu aktivovat — **[CHYBA]**, ne [OK] jak tvrdí checklist
- Enforcement je jen klientský (disabled Select). `resume_contest` (viz výše) to obchází úplně.

### Pravidla soutěže PDF — [OK]
- Upload → storage → `rules_pdf_url` → zobrazení funguje, chráněno reálnou admin RLS politikou s OR
  fallbackem přes obě zdrojové role (řeší drift `users.role` vs `user_roles`).

### Zbývající tikety / vzdálenost k bonusu — [OK]
- Partner Offers jsou strukturálně vyloučeny (jiná tabulka), ne jen konvencí ve filtru.

---

## A06 — Výhry + čeká na vyřízení + admin badge + uzavření

**Stav bloku: [CHYBA]**

### Každá výhra právě jednou, FK, orphan — [ČÁSTEČNĚ]
- Silné DB záruky (`UNIQUE(contest_id) WHERE type='main'`, `UNIQUE(prize_id) WHERE type='bonus'`, FK
  `ON DELETE SET NULL`, existuje i historická opravná migrace orphan winners). Chybí `UNIQUE(ticket_id)`
  — viz A05 nález o kolizi hlavní/bonus pozice.

### Uživatel vidí jasný stav výhry — **[CHYBA]**
- **Zjištěno:** existují **dva nezávislé, nesynchronizované admin systémy** zapisující do dvou různých
  tabulek pro stejnou fyzickou výhru: `/admin/winners` píše `winners.status`/`winners.delivered` (jediné
  pole, které `Wins.tsx` skutečně čte); `/admin/prize-delivery` píše výhradně `bonus_prizes.status` přes
  RPC `update_bonus_prize_delivery_status`, **nikdy nedotkne se `winners`**. **Admin, který označí
  fyzickou bonusovou výhru jako „Předáno" přes `/admin/prize-delivery`, nezpůsobí žádnou viditelnou
  změnu na zákaznické stránce `/wins`** — ta zůstane napořád „čeká", i když cena byla reálně doručena.
  Hlavní výhry (`prize_id IS NULL`) navíc nemají `bonus_prizes` řádek vůbec, takže je `/admin/prize-delivery`
  ani nezobrazí — jediná cesta k jejich uzavření je `/admin/winners`.
- **Riziko:** VYSOKÉ — přímý dopad na důvěru zákazníka a zátěž podpory.
- **Co opravit (popis):** buď `update_bonus_prize_delivery_status` musí zapsat i do `winners` (join přes
  `winners.prize_id`), nebo sjednotit na jednu admin obrazovku jako jediný zdroj pravdy.

### Admin badge pro výhry vyžadující zásah — **[CHYBA]**
- **Zjištěno:** žádný `pendingWinnersCount`/ekvivalent neexistuje nikde v `src/`. Existující červený
  badge na tabu „Výhry" v adminské navigaci je ve skutečnosti `useUnseenWinsCount()` — počítá
  **vlastní** nepřečtené výhry přihlášeného admina (`user_id = auth.uid()`), tedy zcela nesouvisející
  koncept. Checklistová položka je fakticky neimplementovaná, jen zamaskovaná podobně vypadajícím
  badge.
- **Co opravit (popis):** skutečný admin-scoped count (`WHERE status='pending' OR status IS NULL`)
  napojený na nav badge stejným vzorem jako `pendingOffersCount`.

### Předání ceny — auditovatelný záznam — [ČÁSTEČNĚ]
- `/admin/prize-delivery` cesta je atomická a auditovaná (jedna RPC, `admin_actions` zápis).
  `/admin/winners` cesta (`updateWinnerStatus`) je **tři samostatné, sekvenční, netransakční** klientské
  zápisy (status → historie → zpráva uživateli); selhání kroku 2 nebo 3 je jen `console.error`
  s komentářem „Continue anyway", **úspěšný toast se zobrazí bez ohledu na to, zda historie/zpráva
  skutečně proběhly** — konkrétní, doložitelný false-positive UX bug. Navíc přímý `.update()` na
  `winners` bez RPC obálky — RLS UPDATE politika pro tuto tabulku nebyla v migracích nalezena vůbec
  (NEOVĚŘENO, zda je produkce chráněná).
- **Co opravit (popis):** sjednotit do jedné `SECURITY DEFINER` RPC (status+historie+zpráva atomicky,
  admin-gated), podmínit úspěšný toast na skutečném úspěchu všech kroků.

---

## A07 — Zprávy + unread badge + Bob + support

**Stav bloku: [ČÁSTEČNĚ]**

### Zpráva se uloží správnému user_id, správný read stav — [OK], s historií driftu
- Aktuální stav správný (`user_id` vždy z JWT). **Ale** migrace `20260718190001_...sql` sama ve
  vlastním komentáři popisuje stav, kdy běžný uživatel mohl vložit zprávu s libovolným `sender` a
  upravit všechna pole vlastní zprávy — to znamená, že mezi listopadem 2025 a červencem 2026 se živá
  RLS politika **změnila mimo jakoukoli sledovanou migraci**. Oprava (column-level GRANT, jen `read`
  sloupec zapisovatelný) je dnes v repu přítomná a kryta statickým contract testem.

### Unread indikátor — **[CHYBA]** (potvrzený nesoulad)
- **Zjištěno:** globální nav badge (`useUnreadMessagesCount`) počítá jakýkoli nepřečtený `sender='user'`
  řádek napříč uživateli. Tečka u konkrétní konverzace v `/admin/messages` gridu **navzdory
  komentáři ve vlastním kódu tvrdícímu opak** kontroluje něco úplně jiného — zda je stále nepotvrzený
  interní „SUPPORT REQUEST" marker řádek, který se odškrtává jen ručním „ukončit chat", ne otevřením
  vlákna. Důsledek: běžná zpráva bez CTA handoffu rozsvítí globální badge, ale nikdy tečku u karty;
  a naopak už vyřešená konverzace může zůstat s rozsvícenou tečkou, dokud admin výslovně neukončí chat.
- **Co opravit (popis):** sjednotit tečku s globálním kritériem, nebo opravit zavádějící komentář a
  chování podle skutečného záměru.

### Bob CTA whitelist — [OK]
- Skutečná, běhová (ne jen promptová) kontrola: `BOB_CTA_BY_ACTION` whitelist + `if (!(action in ...))
  return {text}` — halucinovaná akce je vždy odstřižena. `/messages` je explicitně vyloučeno z whitelistu.

### Bob cross-user ochrana — [OK] pro JWT cestu, [ČÁSTEČNĚ] pro interní token
- JWT cesta: ověřeno kódem i skutečným E2E testem (`tests/e2e/61-...spec.ts` — cizí `message_id` → 403).
  Interní-token cesta (`x-internal-token`) obchází vlastnickou kontrolu úplně — dnes nikde volaná
  z produkčního kódu (DB trigger byl zrušen), ale zůstává latentní schopnost; relevantní vzhledem
  k potvrzenému historickému úniku `.env`/interních tokenů jinde v tomto auditu.

### Extra nález — role-zdroj nesoulad
- Admin SELECT politika na `messages` čte `public.users.role`, admin INSERT politika čte `user_roles`
  — u dokumentovaného drift účtu (`user_roles.role='admin'`, `users.role='user'`) by takový admin mohl
  psát zprávy, ale neviděl by je všechny.

---

## A08 — Push notifikace, e-maily a upozornění

**Stav bloku: [ČÁSTEČNĚ]**

### Push dorazí správnému uživateli, deep link — **[CHYBA]** na deep linku
- Registrace zařízení a cílení jsou v pořádku (vlastnický zápis, admin-all pro zbytek). **Cílí se ale
  vždy jen na JEDNO, naposledy aktualizované zařízení uživatele** — druhé zařízení nikdy nedostane push.
  **Deep link neexistuje vůbec** — payload posílaný do OneSignal API (`send-push/core.ts:170-176`)
  nemá žádné pole `url`/`web_url`; žádný sloupec pro odkaz v `notifications`/`push_log`; žádný click
  handler v service workeru. Kliknutí na jakýkoli push dnes vždy otevře jen kořen aplikace bez ohledu
  na obsah (kontrastuje s výherním e-mailem, který odkaz skutečně má).

### Duplicity, retry, opt-out — [ČÁSTEČNĚ]
- Skutečná atomická claim logika (`status='pending'→'processing'`) je solidní a **kryta reálným
  souběžným (Promise.all) unit testem** — nejlépe otestovaná část celého A08 bloku. **Ale** vrstva
  o úroveň výš (`notifications`→`push_log` insert, 5minutové dedup okno) je jen měkký SELECT-then-branch
  **bez podpůrného unikátního indexu** — reálné, i když úzké okno pro race. Kontrastuje s `email_queue`,
  kde stejný problém má správné řešení (`dedupe_key` + `ON CONFLICT`).
- **KRITICKÝ evidenční nález:** `process_push_retries` — funkce zmíněná checklistem jako mechanismus
  retry — **nemá své tělo nikde v repu**. Existuje jen jako typový stub a jedna zmínka v komentáři
  jiné migrace. Nelze z kódu zjistit, zda vůbec kdy běží, natož jak.

### Email queue — [ČÁSTEČNĚ]
- Bezpečnostní pojistka proti odeslání faktury bez přílohy potvrzena přítomná ve zdroji. Auth matice
  (401/200/200/403) skutečně otestována E2E testem na stagingu. Samotný cron job **nebyl založen žádnou
  sledovanou migrací** — jen dodatečně „re-pointnut" pozdějšími migracemi, které samy tvrdí „no-op,
  pokud job už neexistuje".

### Selhání e-mailu zůstává viditelné a opakovatelné — **[CHYBA]**
- **Zjištěno:** `email_queue` nemá žádný `retry_count`/`error_message` sloupec — skutečný text chyby se
  nikam nezapisuje, jen do logu Edge Function. Řádek jednou `failed` **není nikdy automaticky znovu
  vyzvednut**. **V celém `src/` neexistuje žádná admin obrazovka, která by zobrazila nebo umožnila
  opakovat neúspěšné e-maily** — jediný soubor mimo generované typy, který `email_queue` čte, je
  nesouvisející zobrazení stavu pozvánky subadmina.
- **Co opravit (popis):** přidat `error_message`/`retry_count`, admin UI pro seznam/retry `failed` řádků
  nebo ohraničený automatický retry.

### Extra nález — mrtvý/rozbitý kód v ručním odeslání notifikace adminem
- `AdminNotifications.tsx` volá `send-push` Edge Function přímo z prohlížeče bez povinné hlavičky
  `x-internal-token` a bez požadovaného `push_log_id` — toto volání **strukturálně nemůže uspět**
  (401/400), ale selhání je tiše pohlceno (`Promise.allSettled` počítá jen `rejected`, ne HTTP chybu),
  takže admin vidí falešné „Notifikace byla odeslána". Push samotný pravděpodobně **stejně dorazí**
  díky nezávislému DB triggeru spuštěnému stejným INSERTem do `notifications` — ale pokud by tento
  triggerový kanál sám kdy selhal (např. chybějící Vault secret), admin by o tom neměl žádný signál.

---

## A09 — Admin role + zakázané zásahy + audit log

**Stav bloku: [ČÁSTEČNĚ]**, s jednou vysoce rizikovou položkou

### Route/nav gating (RequireSuperadmin/RequirePermission) — [OK]
- Čestně sebe-popsané jako čistě UI vrstva, autoritativní ochrana je RLS/RPC — architektura je zdravá,
  problém je v nedůslednosti té skutečné ochrany (viz níže).

### Admin editace soutěže chráněná — [ČÁSTEČNĚ], reálný nedořešený gap
- `admin_manage_contest` kontroluje `public.users.role`, **ne** kanonickou `user_roles` tabulku, kterou
  používá zbytek novějšího hardeningu — u dokumentovaného drift účtu by legitimní admin mohl být
  zamítnut. Závažnější: **žádná `ALTER TABLE public.users ENABLE ROW LEVEL SECURITY` ani vlastní-řádková
  UPDATE politika pro `public.users` nebyla nalezena v žádné migraci** — pokud by RLS na této tabulce
  chyběla nebo UPDATE politika nevylučovala sloupec `role`, běžný uživatel by mohl triviálně
  `UPDATE users SET role='admin' WHERE id=auth.uid()` a tuto konkrétní RPC guard obejít, přestože
  hardenutá `user_roles` tabulka by správně dál ukazovala `'user'`.
- **Riziko:** potenciálně KRITICKÉ, pokud se potvrdí chybějící/permisivní RLS na `public.users` —
  NEOVĚŘENO z repa.
- **Co ověřit v produkci:** `SELECT relrowsecurity FROM pg_class WHERE relname='users'` a
  `pg_policies` pro `public.users`, konkrétně UPDATE politiku a to, zda vylučuje sloupec `role`.

### Admin editace výher — **[NEOVĚŘENO, trendující CHYBA]**
- Viz A06 — přímý klientský zápis na `winners`, žádná nalezená UPDATE RLS politika v repu, žádná RPC
  obálka, žádný centrální audit zápis z této cesty.

### Admin zásah do plateb — **[OK]**
- Jediná zjištěná dobře ošetřená cesta v tomto bloku: refundace jde výhradně přes Edge Function
  `stripe-refund`, žádný přímý klientský `.update()` na `payments`, EF interně kontroluje `user_roles`
  (kanonicky, ne `users.role`).

### Audit log — **[CHYBA]**, fragmentovaný + reálný historický únik
- Pokrytí je nesourodé — `admin_manage_contest` loguje do `admin_actions`, ale `AdminWinners.tsx` nikdy
  (jen do samostatné `winner_status_history`). Napříč 35 admin stránkami jen 3 skutečně píší do
  centrálního `admin_actions`.
- **Potvrzen reálný, nyní opravený historický únik:** `get_admin_actions_summary`/`get_admin_summary_dashboard`
  měly `EXECUTE` pro `anon` a vracely e-maily/akce administrátorů (`STRING_AGG` přes `users`) —
  reprodukováno na stagingu jako `anon`, vráceno skutečné jméno superadmina a jeho akce. Opraveno
  guardem + revoke granty (`20260826110000_admin_actions_summary_admin_guard.sql`).

### Extra nález — confused-deputy pattern, opraveno jen granty
- `approve_affiliate_company_lead_txn` interně ověřuje **klientem dodaný** `p_admin_user_id`, ne
  `auth.uid()` — reprodukováno jako `anon` s podstrčeným admin UUID. Jediná ochrana dnes jsou zúžené
  granty (`service_role`-only); samotná logika zůstává vědomě neopravená a je to zdokumentovaná past
  pro budoucí re-grant.

---

## A10 — Partner/influencer/agentura + attribution + provize

**Stav bloku: [ČÁSTEČNĚ]**

### Partner Offer assignment — jen `won_type IS NULL` — [ČÁSTEČNĚ], strukturální riziko
- **Zjištěno:** zdroj `assign_partner_offer_to_ticket` **není v repu vůbec** (aplikováno mimo migrace).
  Jediný volající je DB trigger `trg_assign_offer_on_ticket_insert` (AFTER INSERT ON `tickets`),
  spouštěný **před** tím, než `buy_ticket_atomic` ve stejné transakci zapíše `winners`/`bonus_prizes`
  — pokud neviditelná funkce určuje výhru dotazem na `winners`, byla by tato kontrola v okamžiku spuštění
  triggeru vždy prázdná (potenciálně rozbitý gate). Historicky dokumentovaná Edge Function cesta
  (`purchase-ticket/index.ts`), kterou `onemil_history.md` popisuje jako „finálně E2E ověřenou", je
  dnes mrtvý kód — už vůbec `assign_partner_offer_to_ticket` nevolá.
- **Test gap:** `tests/e2e/06-partner-offers.spec.ts:87-92` **explicitně přeskakuje** větev, kdy koupený
  tiket vyhrává — jediný test, který by tuto invariantu mohl ověřit, to vědomě nedělá.
- **Co ověřit v produkci:** živá definice funkce, konkrétně jak určuje „je to výherní tiket".

### Referral attribution `/a/:refCode`, `/i/:refCode` — [ČÁSTEČNĚ]
- `/a/:refCode` (firma/sales_rep): šťastná cesta je **skutečně** dobře otestovaná plným E2E testem
  (`tests/e2e/141-...spec.ts`, klik na URL → registrace → schválení → ověření DB). **Ale** samotná
  atribuce po schválení je druhé, samostatné, „fire-and-forget" klientské RPC volání s pouhým
  `console.warn` při selhání — žádný retry, žádná admin viditelnost, žádná ruční oprava.
- `/i/:refCode` (zákazník/influencer): kód přežije jen jednou konkrétní, křehkou cestou (kliknutí na
  odkaz „Registrovat" v hlavičce před jakoukoli jinou navigací) — žádný test toto neověřuje.
- Dva nezávislé prostory kódů (`referral_codes.code` vs `affiliate_accounts.ref_code`) nemají prokazatelně
  vyloučenou kolizi, což by při shodě vedlo k duplicitní atribuci.

### Provize — přesnost, žádné dvojí počítání — [OK] pro aktuální engine
- Nezávisle ověřeno proti zdroji (ne jen citováno z CLAUDE.md): `payments.status='completed'` filtr
  (potvrzeno proti `stripe-webhook`), reálné unikátní indexy `uq_affiliate_commissions_invoice`/`_month_customer`
  fakticky brání dvojímu počítání.
- **Extra nález — vysoce relevantní:** existuje **druhý, starší, nezávislý** engine (`calculate_influencer_commissions_current_month`
  → `influencer_commissions` tabulka), stále aktivně čtený třemi živými soubory a stále dosažitelný
  přes `/admin/influencer-commissions`/`/admin/influencers` vedle nové `/admin/affiliate-commissions`.
  Nic v repu neříká, zda je starý systém záměrně stále aktivní pro nějakou skupinu partnerů, nebo měl
  být už vyřazen. Stejná duplicita platí pro Air Bank export (dvě nezávislé implementace, jedna
  bez auditní stopy).

### Partner invoice cron — [ČÁSTEČNĚ→lepší než checklist tvrdí]
- Checklistové „NOT TESTED" je zastaralé — existuje reálný DB-úrovňový test (`tests/e2e/43-...spec.ts`,
  test `43e`) volající skutečnou cron RPC a ověřující výběr aktivací i výpočet DPH ve zdroji
  (`round(v_amount_net * v_vat_rate, 2)`, žádné `/100`).

---

## A11 — Datová integrita + orphan + duplicity + finanční součty

**Stav bloku: [ČÁSTEČNĚ]**

- Silné pozitivní nálezy: `UNIQUE(contest_id) WHERE type='main'`, `UNIQUE(prize_id) WHERE type='bonus'`
  na `winners` — skutečně brání duplicitám na DB úrovni, ne jen aplikační logikou. `wallets_user_id_fkey`
  doložena reálnou chybovou hláškou v produkčním kódu.
- Slabé nálezy: **žádná FK deklarace** pro `tickets.contest_id`, `winners.ticket_id` nikde v migracích
  (funkčně chráněno jen tím, že nic v repu nikdy neprovádí `DELETE FROM contests`/`tickets`).
  `wallet_transactions` má **nulovou referenční integritu** na `user_id`/`wallet_id`/`reference_id` —
  vědomé rozhodnutí zdokumentované přímo v komentáři kódu, ale znamená to, že samotná ledger tabulka
  nemůže být DB-úrovňově ověřena proti tomu, na co odkazuje.
- `user_vouchers.user_id` nemá žádnou FK deklaraci (na rozdíl od `voucher_id`, který ji má).
- Existuje `tests/wallet-integrity-queries.sql` — ruční, nikdy do CI nezapojený skript s explicitními
  orphan/duplicate kontrolami pro tickets/winners/bonus_prizes/payments, ale **žádný doklad, že byl kdy
  spuštěn a výsledek uložen** (checklist to sám takto přesně popisuje — potvrzeno).
- **Co ověřit v produkci:** spustit sekce 1–7 `tests/wallet-integrity-queries.sql` proti produkci a
  výsledek zaznamenat.

---

## A12 — Bezpečnost celé DB/API/Edge/Frontend/GitHub

**Stav bloku: [CHYBA]**

### `.env` únik v git historii — **[CHYBA], potvrzeno stále aktivní**
- Nezávisle re-ověřeno: `SUPABASE_SERVICE_ROLE_KEY` a `VITE_INTERNAL_FUNCTION_TOKEN` čitelné v commitu
  `63fcdd5` (17.08.2026), stále living ancestor `origin/main` (`git merge-base --is-ancestor` = true).
  PR #375 (mergnutý) pouze zastavil budoucí sledování (`git rm --cached`), **nerotoval hodnoty, nepřepsal
  historii** — potvrzeno vlastním textem commit message.
- **Riziko:** KRITICKÉ, pokud klíč nebyl rotován — plný service-role (RLS-bypass) přístup k produkční DB
  pro kohokoli s přístupem k veřejné historii repa.
- **Co ověřit v produkci:** zda byly obě hodnoty od 17.08.2026 skutečně rotovány v Supabase.

### `vercel.json` bezpečnostní hlavičky — [ČÁSTEČNĚ]
- 5 hlaviček potvrzeno přesně (CSP frame-ancestors, XFO, Permissions-Policy, nosniff, referrer-policy).
  **HSTS není mezi nimi** — checklist tvrdí „ověřeno A+ vč. HSTS", ale v `vercel.json` žádná
  `Strict-Transport-Security` direktiva není; může jít o automatické vkládání Vercelem na edge úrovni
  (NEOVĚŘENO odsud).
- **Extra nález:** `index.html` má stále zastaralý komentář tvrdící, že produkce běží na Lovable a
  `vercel.json` se nepoužívá — přímo v rozporu s aktuálním CLAUDE.md stavem (dokumentační drift, sám
  CLAUDE.md to už jako otevřený bod eviduje).

### `content_pages` (a `profiles`, `partners`) RLS mezera — nezávisle POTVRZENO, ne vyvráceno
- Přesně dvě migrace existují pro `content_pages`, obě obsahují jen `GRANT SELECT ... TO anon, authenticated`
  — **žádná** `ENABLE ROW LEVEL SECURITY` ani `CREATE POLICY` nikde. Stejný vzor (holý GRANT bez RLS)
  platí i pro `profiles` a `partners` ve stejných dvou migracích. Frontendové filtry (`is_active`,
  `deleted_at`) jsou funkční, ale pokud je RLS skutečně vypnutá, přímé volání PostgREST API tyto filtry
  obejde úplně.
- **Co ověřit v produkci:** `pg_policies`/`pg_tables.rowsecurity` pro `content_pages` přímo na produkci.

### RLS matice pro citlivé tabulky — [NEOVĚŘENO], strukturálně neúplné
- Spot-check 11 tabulek: `messages`, `affiliate_commissions`, `bonus_prizes`, `partners`,
  `partner_invoices` mají solidní own-row+admin politiky v migracích. `payments`, `wallets` (own-row
  SELECT), `tickets` (admin politika), `winners` (admin politika), `admin_actions` (starší politiky)
  mají admin ochranu doloženou **jen v nesledovaném dokumentačním snapshotu**
  (`docs/rollback/phase1_baseline.sql`), jehož vlastní hlavička říká, že historie migrací „NENÍ
  spolehlivý zdroj" produkčního stavu.
- **Extra nález:** několik původních admin politik (`wallets`, `tickets`, `admin_actions`) je stále
  vázáno na legacy `public.users.role`, ne kanonickou `user_roles` — u zdokumentovaného drift účtu
  hrozí nekonzistentní (pod-privilegovaný) admin přístup napříč různými tabulkami.

### Secret exposure mimo `.env`, console/log leakage — [OK]/[ČÁSTEČNĚ]
- Žádné další natvrdo zapsané klíče nalezeny. `ai-chat`/debug logy obsahují jen vlastní data volajícího,
  ne cizí — ale hustota nechráněného `console.log` v `ai-chat/index.ts` je hygienické riziko do budoucna.

---

## A13 — Hosting/PWA/dostupnost/error states

**Stav bloku: [ČÁSTEČNĚ]**

### Vercel hosting, rewrites — [OK]
- Potvrzeno: `api/og-ticket.ts` skutečně smazán, žádná zbylá reference. Rewrites správně seřazené.

### PWA manifest/instalace — [ČÁSTEČNĚ], lepší než checklist předpokládá
- `manifest.webmanifest` existuje a je kompletní; `InstallAppButton`/`usePwaInstallPrompt` jsou **skutečně
  živé na `main`** (checklistové „starší stav upozorňoval na chybějící PWA setup" je zastaralé).
  **Chybí ale úplně offline service worker/asset cache** — jediný registrovaný worker je OneSignalův,
  ne aplikační; po výpadku sítě po instalaci se aplikace chová jako běžná rozbitá webová stránka, ne
  jako odolná PWA.

### Chování při výpadku API — **[CHYBA]**, konkrétní doložený nález
- **Zjištěno:** `Profile.tsx:253-297` a `Games.tsx:100-111` při selhání dotazu na `wallets` **tiše
  vykreslí vyfabrikovaný zůstatek `0`** bez jakéhokoli toastu/chybové hlášky — uživatel by mohl uvěřit,
  že přišel o zůstatek při běžném síťovém výpadku. Kontrastuje s `Games.tsx`'s vlastním zpracováním
  chyby soutěží, které správně zobrazuje toast.
- **Co opravit (popis):** explicitní chybový stav odlišný od skutečné nuly, případně retry před fallbackem.

---

## A14 — Veřejné stránky/právní texty/odkazy

**Stav bloku: [ČÁSTEČNĚ]**

- Routing pro `/vop`, `/gdpr`, `/pravidla-souteze`, `/legal/cookies` potvrzen funkční a napojený na CMS
  (`content_pages`), včetně kompatibilních redirectů. Kvalita právního textu záměrně nehodnocena (mimo
  rozsah tohoto READ-ONLY auditu, sám checklist to takto rámuje).
- `onemil.lovable.app`/`lovableproject.com` — žádný nový aktivní výskyt nenalezen; zbylé výskyty jsou
  dokumentačního rázu (`README.md`, historické changelogy) nebo přímo bezpečnostní pojistka
  (`publicAppUrl.ts`, která tyto domény aktivně **odmítá** jako platnou veřejnou URL).

---

## A15 — Účetnictví/banka/Pohoda

**Stav bloku: [ODLOŽENO]/[NEOVĚŘENO]** (odpovídá vlastnímu rámování checklistu)

- **Bankovní párování:** potvrzeno neexistuje žádný kód pro čtení bankovního výpisu ani automatické
  párování příchozích plateb — jen odchozí `.kpc` export pro affiliate výplaty (a to ve dvou paralelních,
  nestejně auditovaných implementacích, viz A10). `admin_mark_partner_invoice_paid` je čistě ruční
  účetní úkon bez jakéhokoli napojení na skutečný pohyb peněz.
- **Pohoda:** **nulový výskyt** slova „Pohoda" kdekoli v celém repu (case-insensitive, bez omezení na
  příponu souboru) — potvrzeno jako čistě budoucí/neimplementovaná integrace, přesně jak checklist sám
  uvádí.
- **Traceability:** `affiliate_commissions.company_ref_id` je nullable `LEFT JOIN` — B2B provize může
  vzniknout bez dohledatelné vazby na konkrétní referral, i když samotná finanční částka je správná.

---

## A16 — Sofinity (odloženo)

**Stav bloku: [NEOVĚŘENO]** na konkrétní tvrzení checklistu — přímý rozpor s vlastní dokumentací projektu

- Kód/Edge Functions pro Sofinity jsou potvrzeně zachovány, ale nepoužívány — v pořádku.
- **Checklist tvrdí [OK]** „cron `process-event-queue` byl 2. 9. 2026 dočasně vypnut". **Žádná migrace
  ani zmínka v `CLAUDE.md` toto nepotvrzuje.** Naopak, nejnovější dohledatelný záznam v `onemil_state.md`
  (18. 07. 2026) výslovně říká, že cron 23 **je stále aktivní, běží každou minutu a vrací HTTP 401**, a
  že vypnutí bylo vědomě odloženo. Buď se vypnutí odehrálo živě v Supabase téhož dne jako datum tohoto
  checklistu a nebylo ještě zpětně zapsáno do dokumentace (proces-lag), nebo je checklistové tvrzení
  nepřesné — z repa nelze rozhodnout.
- **Co ověřit v produkci:** `SELECT * FROM cron.job WHERE jobname='process-event-queue'` — jednoznačně
  to vyřeší.

---

## Souhrn 1 — KRITICKÉ CHYBY

Řazeno bez pořadí důležitosti uvnitř kategorie — vše vyžaduje akci před ostrým masovým provozem.

1. **`.env` s reálným `SUPABASE_SERVICE_ROLE_KEY` a `VITE_INTERNAL_FUNCTION_TOKEN` zůstává čitelný
   v git historii (commit `63fcdd5`), nikdy nerotováno.** (A12) — pokud nebyl klíč mezitím rotován
   mimo tento audit, jde o plný service-role přístup k produkční DB pro kohokoli s přístupem k historii
   veřejného repa.
2. **`pause_contest`/`resume_contest` RPC nemají žádnou interní kontrolu role a jsou grantované
   `authenticated`.** (A05) — jakýkoli přihlášený zákazník může přímým RPC voláním pozastavit živou
   soutěž nebo znovu aktivovat uzavřenou, mimo jakoukoli UI ochranu. Přímo popírá checklistovou
   položku „uzavřenou soutěž nelze znovu aktivovat" ([OK] v checklistu je nesprávné).
3. **MioCoin bonusový double-credit**: `claim_miocoin_bonus` + `transfer_bonus_to_main` mohou běžným
   sekvenčním použitím dvou legitimních tlačítek připsat stejnou bonusovou částku do utratitelného
   zůstatku dvakrát. (A02)
4. **Přímý, netransakční klientský zápis na `winners.status` bez ověřitelné RLS UPDATE politiky a bez
   centrálního audit logu**, s falešně-pozitivním „úspěch" toastem i při selhání audit/notifikačního
   kroku. (A06/A09)
5. **`admin_manage_contest` kontroluje `public.users.role`, ne kanonickou `user_roles`; RLS/UPDATE
   politika `public.users` samotné nebyla v repu vůbec nalezena** — pokud je permisivní, jde
   o obchoditelnou admin-only ochranu soutěží. (A09)
6. **Věkové pravidlo 18+ dnes neexistuje jako serverová kontrola** — jen klientský sebe-potvrzující
   checkbox bez uloženého data narození. (A01) — produktové/právní rozhodnutí, ale je to reálná
   compliance mezera pro platformu se skutečnými penězi.

## Souhrn 2 — VYSOKÁ RIZIKA

1. Dva nesynchronizované admin systémy pro stav doručení výhry (`/admin/winners` vs.
   `/admin/prize-delivery`) mohou nechat zákazníkovu skutečně doručenou cenu navždy zobrazenou jako
   „čeká". (A06)
2. Neexistuje žádný skutečný „čekající výhry" admin badge — zobrazený badge měří něco jiného
   (vlastní nepřečtené výhry admina). (A06)
3. `content_pages`, `profiles`, `partners` mají v migracích jen holý `GRANT SELECT`, žádnou nalezenou
   RLS politiku — přímé volání API by mohlo obejít frontendové filtry. (A12)
4. Chybí jakákoli finanční reconciliace (`SUM(wallet_transactions)` vs. `balance_coins`) kdekoli
   v systému. (A02/A11)
5. Multi-e-shop idempotence pro partnerské odměnové kódy je potvrzeně stále otevřená v aktuálním kódu.
   (A04)
6. Dva nezávislé enginy pro výpočet partnerské odměny s různým zaokrouhlováním. (A04)
7. Dva paralelní, nestejně auditované systémy pro výpočet provizí a bankovní export
   (`influencer_commissions` legacy vs. `affiliate_commissions` v2) bez zdokumentovaného plánu
   vyřazení staršího. (A10)
8. Partner Offer „není to výhra" invarianta je vynucována funkcí bez zdroje v repu, volanou triggerem,
   jehož pořadí spouštění vůči zápisu výherců je podezřelé — a jediný test tuto větev explicitně
   přeskakuje. (A10)
9. Neúspěšné e-maily nemají uložený důvod selhání, nikdy se automaticky neopakují a nemají žádnou
   admin obrazovku pro správu. (A08)
10. Push notifikace nemají žádný deep link a cílí jen na jedno (nejnovější) zařízení uživatele. (A08)
11. `process_push_retries` nemá tělo nikde v repu — zcela neprůhledný mechanismus. (A08)
12. Ruční odeslání notifikace adminem (`AdminNotifications.tsx`) obsahuje mrtvý/rozbitý přímý push
    volání, jehož selhání je tiše pohlceno a maskuje případné selhání skutečného doručovacího kanálu.
    (A08)
13. Wallet-fetch chyby na `Profile.tsx`/`Games.tsx` se tiše vykreslí jako vyfabrikovaná nula bez
    chybové indikace. (A13)
14. `/a/:refCode` atribuce po schválení partnera je fire-and-forget bez retry; `/i/:refCode` přežívá
    jen jednou konkrétní navigační cestou. (A10)
15. Confused-deputy vzor v `approve_affiliate_company_lead_txn`, opraveno jen granty — logika zůstává
    vědomě neopravená. (A09)
16. Historický, mimo migrace vzniklý drift RLS politiky `messages` (širší UPDATE než zamýšleno) —
    ukazuje, že migrace nejsou spolehlivým zdrojem historie RLS. (A07)
17. Nekonzistentní unread indikátor v admin zprávách (globální badge vs. tečka u karty měří dvě různé
    věci navzdory komentáři tvrdícímu opak). (A07)
18. Checklistové tvrzení o vypnutí Sofinity cronu 2.9.2026 je v přímém rozporu s nejnovějším záznamem
    ve vlastní dokumentaci projektu (18.07.2026: cron stále aktivní a chybující). (A16)

## Souhrn 3 — NEOVĚŘENÉ TOKY (vyžadují přímý přístup k produkci/stagingu)

- Zda byly `SUPABASE_SERVICE_ROLE_KEY`/`VITE_INTERNAL_FUNCTION_TOKEN` z uniklého `.env` skutečně
  rotovány.
- Živé granty na `pause_contest`/`resume_contest`.
- Živý stav RLS (`ENABLE ROW LEVEL SECURITY`, konkrétní politiky) pro `payments`, `tickets`, `winners`,
  `wallets`, `public.users`, `content_pages`, `profiles`, `partners`, `admin_actions` — základní
  schéma těchto tabulek není v migracích vůbec zachyceno.
- Zda aktuální `buy_voucher_atomic` (závislý na `voucher_codes`) skutečně běží na produkci, nebo zda
  produkce ještě používá starší verzi bez inventáře kódů.
- Živé tělo a plán volání `process_push_retries`.
- Živý stav pg_cron jobů 16 (`process_email_queue_every_10_min`), 17 (`weekly_partner_invoices`), 20
  (`influencer_commissions_monthly`), 23 (`process-event-queue`), 25 (`affiliate_company_commissions_monthly`)
  — žádný z nich nebyl založen sledovanou migrací, jen dodatečně upravován.
- Zda `wallets.bonus_balance_coins` zůstává nenulový u již uplatněných bonusových výher (přímý test
  double-credit nálezu).
- Zda `content_pages`/`payments` skutečně mají RLS zapnutou.
- Celkový počet `wallet_transactions` nesouhlasících s `balance_coins` napříč všemi uživateli.
- Zda 16 nezvrácených referral odměn (dokumentováno migrací) stále existuje.
- Zda skript `scripts/concurrency-test-race-condition.mjs` byl kdy skutečně spuštěn (a ne proti
  produkci, kam dnes míří jako výchozí).
- Zda `tests/wallet-integrity-queries.sql` byl kdy skutečně spuštěn proti produkci a s jakým výsledkem.
- Zda pg_cron `process-event-queue` (Sofinity) byl skutečně vypnut 2.9.2026.
- Zda je live `admin_manage_contest`/RLS `public.users` bezpečná proti self-escalaci role.
- Frekvence a objem `email_queue`/`push_log` selhání v reálném provozu.

## Souhrn 4 — POTVRZENĚ FUNKČNÍ TOKY

- `buy_ticket_atomic` — sekvenční číslování, atomický debet, identita vždy z JWT, `UNIQUE(contest_id, number)`
  jako druhá pojistka.
- Stripe checkout → webhook → wallet credit — server nezávisle přepočítává částku ze skutečné Stripe
  platby, nikdy z klientského vstupu; idempotence kryta reálným DB unikátním indexem.
- Stripe refund flow — nejsilněji ošetřená část celého systému (pořadí operací, plný zůstatek, zamykání,
  terminal-state ochrana, referral reversal).
- `buy_voucher_atomic`/`redeem_miocoin_code` — vlastnictví, zamykání, email-mismatch ochrana.
- `bonus_prizes` RLS skrývající budoucí výherní pozice před zákazníky (F1 oprava) — aktuální a dobře
  navržená.
- Admin-first kontrola v `Login.tsx` — přesně podle deklarovaného invariantu.
- Bob CTA whitelist — skutečná běhová kontrola, ne jen promptová instrukce.
- Bob cross-user ochrana pro standardní JWT cestu — kryta reálným E2E testem.
- Partner invoice VAT výpočet — aktuální, správný, nezávisle ověřen proti zdroji.
- Provizní dedup (`uq_affiliate_commissions_invoice`/`_month_customer`) — skutečně brání dvojímu
  počítání.
- Winner e-mail queue — dedup klíč, HTML escaping, izolace chyb od hlavní transakce.
- `process-email-queue` auth matice — reálně otestována E2E na stagingu.
- `push_log` claim/dedup logika — jediná část A08, kde existuje skutečný souběžný unit test.
- Admin pending-offers badge (`pendingOffersCount`) — Realtime-based, korektně se odškrtává.
- `content_pages` frontendové filtry (`is_active`+`deleted_at`) — opraveno v tomto sezení (PR #372–374),
  potvrzeno funkční na úrovni kódu.
- `/a/:refCode` šťastná cesta atribuce — plně E2E otestována proti skutečnému UI.

## Souhrn 5 — CO MUSÍ OVĚŘIT SUPABASE/PRODUKČNÍ AUDIT MIMO GITHUB

1. Rotace `SUPABASE_SERVICE_ROLE_KEY` a `VITE_INTERNAL_FUNCTION_TOKEN`.
2. `SELECT has_function_privilege(...)` pro `pause_contest`/`resume_contest` — a pokud je grant
   potvrzen, okamžitá oprava má přednost před čímkoli jiným v tomto seznamu.
3. `pg_policies`/`pg_class.relrowsecurity` pro všech 9 tabulek uvedených v Souhrnu 3.
4. Živý dotaz na double-credit MioCoin scénář (`wallet_transactions` s `bonus_claim`+`bonus_transfer`
   pro stejného uživatele/období; nenulový `bonus_balance_coins` u již uplatněných výher).
5. Živý stav a plán volání `process_push_retries` (`pg_proc.prosrc`, případný cron).
6. Živý stav pg_cron jobů 16/17/20/23/25 (`active`, poslední běh, poslední chyba).
7. Kontrola `email_queue WHERE status='failed'` — kolik řádků, jak staré, jaký dopad.
8. Spuštění `tests/wallet-integrity-queries.sql` (sekce 1–7) proti produkci a uložení výsledku.
9. Dotaz na 16 (nebo aktuální počet) nezvrácených referral odměn.
10. Kontrola, zda je aktuální (`voucher_codes`-závislá) verze `buy_voucher_atomic` skutečně nasazená.
11. Manuální reprodukce nesouladu unread indikátoru v `/admin/messages` (globální badge vs. tečka).
12. Manuální test doručení fyzické bonusové výhry přes `/admin/prize-delivery` a ověření, zda se
    zobrazí na `/wins`.

## Souhrn 6 — DOPORUČENÉ POŘADÍ OPRAV

1. **Okamžitě, mimo běžný release cyklus:** rotace `.env` uniklých secretů (pokud ještě neproběhla) —
   nejvyšší blast radius ze všech nálezů.
2. **Okamžitě:** doplnit role guard do `pause_contest`/`resume_contest` (nebo je alespoň zúžit na
   `service_role`) — jde o triviální opravu s obrovským rizikem bez ní.
3. **Před dalším Lovable/Vercel publishem:** oprava double-credit MioCoin bonusu
   (`claim_miocoin_bonus`/`transfer_bonus_to_main`).
4. **Před dalším publishem:** ověřit a případně doplnit RLS na `public.users` (blokuje sebe-eskalaci
   role) a sjednotit `admin_manage_contest` na kanonickou `user_roles`/`is_admin()`.
5. **Krátkodobě:** sjednotit `AdminWinners.tsx`/`/admin/prize-delivery` do jedné atomické, auditované
   RPC cesty; opravit/nahradit admin „čekající výhry" badge; ověřit RLS UPDATE na `winners`.
6. **Krátkodobě:** rozhodnutí o 18+ compliance postoji (produktové/právní, ne technické) a odpovídající
   zdokumentování nebo re-implementace.
7. **Krátkodobě:** postavit skutečnou finanční reconciliaci (ledger vs. balance) a spustit ji jednorázově
   proti produkci před jakýmkoli větším marketingovým náběhem.
8. **Střednědobě:** rozhodnout osud legacy `influencer_commissions` systému (retirement, nebo
   zdokumentovat proč zůstává); doplnit e-shop-scoping do partnerské idempotence; sjednotit dva
   partnerské reward enginy.
9. **Střednědobě:** doplnit `error_message`/retry admin UI pro `email_queue`; doplnit deep-link a
   multi-device fan-out pro push; zprůhlednit `process_push_retries`.
10. **Průběžně, nízké riziko:** dokumentační úklid (zastaralý Lovable komentář v `index.html`,
    README.md, Sofinity cron stav v `onemil_state.md`).

---

*Konec auditního reportu. Žádná změna kódu, databáze, migrací ani produkční konfigurace nebyla v rámci
tohoto auditu provedena — jde výhradně o READ-ONLY zjištění.*
