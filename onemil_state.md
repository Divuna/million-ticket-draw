# OneMil – aktuální stav projektu

## PŘEHLED REAKCÍ „MÁM ZÁJEM“ / „NEMÁM ZÁJEM“ V ADMINISTRACI — DRAFT (06. 08. 2026)

Draft PR nad `main` (`b9febb47`). **Nic nenasazeno** — migrace
`20260806160000_sales_lead_response_overview.sql` NENÍ aplikovaná na staging ani produkci, žádný
EF deploy, žádný merge, žádný e-mail, žádná dávka, žádná automatika, žádný cron. Staging automatika
zůstává `enabled=false`; produkce odpovědní systém stále nemá (tabulka tokenů ani RPC tam neexistují).

- **Nová záložka „Kontaktovat“** mezi „Osloveno“ a „Odpovědělo“ — samostatný pohled na firmy, které
  klikly „Mám zájem“. **NENÍ to nový stav leadu** (lead zůstává `odpovedel`); stav `kontaktovat` se
  nezavádí. Řazení: nepřečtené → nejnovější → ostatní.
- **Odmítnutí zůstávají v „Nekontaktovat“** — žádná duplicitní záložka, přibyl jen červený počet
  NOVÝCH odmítnutí z tlačítka.
- **Červené počty jdou z DB** přes RPC: zájem = nepřečtené `reply_received` se `source=interest_link`,
  odmítnutí = nepřečtené `do_not_contact_set` se `source=decline_link`. Ručně nastavené
  „Nekontaktovat“ ani běžná e-mailová odpověď se nezapočítají (ověřeno na reálných staging datech).
- **Autoritativní je konečný stav response tokenu** (nejnovější zodpovězený token na lead), takže
  jeden lead nikdy nespadne do obou skupin. Bez tokenu rozhodne aktivita — fallback je
  **symetrický** (`interest_link` → `interested`, `decline_link` → `declined`). Opraveno po
  read-only kontrole: dřívější jednostranný fallback ztrácel odmítnutí bez tokenu (token na
  položku dávky kaskáduje, aktivita ne).
- **Nová RPC `sales_lead_response_overview()`** — `STABLE SECURITY DEFINER`, `search_path=''`,
  guard `sales_leads.manage`/superadmin, bez `anon`, **bez zápisu**, nevrací token ani jeho hash.
  Tabulka tokenů je pro `authenticated` zamčená, proto se čte výhradně přes RPC; frontend nepoužívá
  service-role klíč.
- **Rozšířena existující** `sales_lead_mark_replies_read(uuid)` — nově označí i odmítnutí z tlačítka.
  Mění výhradně `read_at`/`read_by`; **neruší `do_not_contact`, suppression ani stav `nekontaktovat`**.
- **Nová migrace na metadata nebyla potřeba** — `interest_link` i `decline_link` už jsou bezpečně
  rozlišitelné (ověřeno read-only auditem stagingu).
- Testy: nový `tests/e2e/106-sales-lead-response-overview.spec.ts` (19 testů) + specy 104/105 a další
  specy modulu zelené (89 passed). `tsc --noEmit` 0 chyb, `npm run build` OK. Logika RPC ověřena
  read-only dotazem proti reálným staging datům (žádný zápis).
- Opraven latentní bug ve specu 105: četl migraci bez normalizace konců řádků, takže po checkoutu
  s CRLF selhal. Nově se konce řádků normalizují.

## DENNÍ DÁVKY PRVNÍCH OBCHODNÍCH E-MAILŮ — PR 4 WORKER V DRAFTU (06. 08. 2026)

PR 1 (PR #312), bezpečná delivery vrstva PR 2 (PR #313) i administrační příprava pozastavených
dávek PR 3 (PR #314) jsou **v produkci**; PR 3 je **produkčně ověřené**. **PR 4 je pouze Draft.**

PR 4 přidává interní dávkový worker, který umí zpracovat výhradně ručně připravené a vědomě
aktivované položky: service-role RPC `sales_lead_email_batch_claim_next()` (kill switch první, jen
`scheduled` dávka, jen dnešní plán a okno podle `Europe/Prague`, `FOR UPDATE SKIP LOCKED`, nejvýše
jedna položka, plné znovuověření ochran před přepnutím na `processing`),
`sales_lead_email_batch_activate(uuid)` pro řízený přechod `paused → scheduled`,
`sales_lead_email_batch_item_record_failure(uuid,text,text)` pro auditovaný neúspěch a rozšíření
sdílené delivery vrstvy i evidence o režim `batch_initial`. Edge Function
`process-sales-lead-email-batch` je interní (secret `SALES_LEAD_BATCH_WORKER_SECRET`, POST only,
fail-closed) a zavolá poskytovatele nejvýše jednou za request.

**Stav nasazení PR 4:** worker **není nasazený**, secret **není nastavený**, **cron neexistuje**,
automatika je stále **`enabled=false`** a PR 4 **neodeslal žádný e-mail**. Staging ani produkce
nebyly PR 4 nijak změněny. Zapnutí vyžaduje pět samostatných schválení: secret → nasazení funkce →
případný cron → `enabled=true` → aktivace konkrétní dávky.

## DENNÍ DÁVKY PRVNÍCH OBCHODNÍCH E-MAILŮ — PR 3 V PRODUKCI (05. 08. 2026)

PR 1 z PR #312 a bezpečná delivery vrstva PR 2 z PR #313 jsou v produkci. Automatika zůstává
`enabled=false` a neexistuje batch cron.
PR 3 je v produkci a produkčně ověřené: administrátor může vybrat leady, aktivní první šablonu a den, zobrazit
serverový náhled a po druhém potvrzení uložit dávku. Při vypnuté automatice vznikne výhradně
`paused` dávka s `pending` položkami. Přehled ukazuje posledních 20 dávek, položky i skip audit a
umožňuje pouze guardované zrušení. PR 3 nemá sender, worker, cron, Resend volání ani `email_queue`.
Worker a řízené zapnutí patří až do samostatně schváleného PR 4.

## DENNÍ DÁVKY PRVNÍCH OBCHODNÍCH E-MAILŮ — PR 1 V PRODUKCI, VYPNUTO (05. 08. 2026)

V samostatné větvi je připraven pasivní databázový základ: tabulky
`sales_lead_email_automation_settings`, `sales_lead_email_batches`,
`sales_lead_email_batch_items` a úzký audit `sales_lead_email_batch_skips` plus guardované RPC pro
náhled, atomické vytvoření a zrušení.
Výchozí `enabled=false`; maximum 20 za den; zmrazené recipient/source/verification/template/text/HTML
snapshoty; RLS jen `sales_leads.manage`; přímé klientské zápisy zakázané; souběh chrání zámky a
unikátní lead/e-mail indexy pro `pending`/`processing`/`sent`/`failed`. Stejné stavy spotřebovávají
denní kapacitu; idempotence je vázaná na SHA-256 otisk požadavku; dnešní sloty jsou nejdříve za pět minut a
před 16:30; cancel při `processing` selže bez částečné změny. Návrh nepoužívá obecnou `email_queue`, protože aktuální první
obchodní sender posílá přímo přes Resend. V PR 1 není worker, cron, UI ani odesílací volání.
PR #312 je mergnutý a migrace PR 1 je v produkci. Nastavení zůstává `enabled=false`, tabulky jsou
prázdné, worker ani cron neexistuje a nasazení neodeslalo žádný e-mail.

## AKTUÁLNÍ STAV — SANDBOX TOK DOBÍJENÍ A REFUNDACÍ OTESTOVÁN A FUNKČNÍ (04. 08. 2026)

**Celý tok Stripe dobití → připsání MioCoinů → refundace je ve Stripe Sandboxu ověřený a funguje.** Backend i frontend jsou nasazené, Sandbox webhook posílá refundní události, ochrana proti refundaci již utracených MioCoinů je potvrzená reálným testem.

- **Backend:** PR #309 mergnut do `main` (commit `e0f7514d`); produkční migrace refundací evidována jako **`20260803201005` / `harden_stripe_refund_flow`**; `stripe-refund` běží ve **v137** (`verify_jwt = true`), `stripe-webhook` ve **v338** (`verify_jwt = false`, ověřuje Stripe podpis).
- **Role:** `stripe-refund` povoluje spuštění refundace rolím **`admin` i `superadmin`** (oprava v commitu **`ffc0aac8`**).
- **Frontend:** **Lovable Publish proběhl** — administrace zobrazuje dokončené, čekající i selhané refundace.
- **Stripe Sandbox webhook** pro `https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/stripe-webhook` poslouchá přesně `checkout.session.completed`, `refund.created`, `refund.updated` a `refund.failed`.
- **Live Stripe webhook** zůstává zatím pouze na `checkout.session.completed`.

**Ověřené Sandbox testy:**

| Test | Výsledek |
|---|---|
| **50 Kč** | platba připsala 50 MioCoinů; právě jeden `payment_credit` **+50**; refundace skončila jako `refunded`, `stripe_refund_status = succeeded`; právě jeden `refund_debit` **−50**; **žádný** `refund_reversal` |
| **300 Kč (balíček s bonusem)** | platba připsala **310** MioCoinů včetně bonusu; refundace odečetla přesně **310** včetně bonusu; právě jeden `payment_credit` **+310**; právě jeden `refund_debit` **−310**; Stripe stav `succeeded`; bez duplicity |
| **Ochrana proti utraceným MioCoinům** | účet `kutil@opravo.cz` byl pro test nastaven z 1 427 MioCoinů na 0 (odpovídající účetní záznam **−1 427**), pak koupen balíček 50 Kč a utraceno 5 MioCoinů → zůstatek 45. **Refundace byla správně odmítnuta ještě před voláním Stripe**: platba zůstala `completed`, `stripe_refund_id` i `stripe_refund_status` prázdné, nevznikl `refund_debit` ani `refund_reversal` |

## REVERZE ODMĚNY ZA DOPORUČENÍ — OPRAVENA NA PRODUKCI (03. 08. 2026, schválení Pavla)

**Migrace `supabase/migrations/20260803120000_fix_referral_reversal_ambiguous_call.sql` aplikována na produkci `xkzhjldrojjlrkezorey`.** V `schema_migrations` je zapsaná jako **`20260803192609` / `fix_referral_reversal_ambiguous_call`** — apply nástroj razítkuje vlastní čas, takže se produkční verze **liší od čísla souboru v repu** (`20260803120000`). Stejně je na tom `restore_wallet_payment_ledger` (soubor `20260802120000`, produkce `20260802205656`). Repozitářní čísla proto v `schema_migrations` nejsou; `db push` se na tomto projektu nepoužívá, takže to nic neblokuje.

**Problém (odhalen rollback-only testem PR #309):** `reverse_referral_reward_on_payment_status_change()` volala `PERFORM public.try_credit_wallet_mc(v_referrer, (0 - v_reward))`. V produkci existují tři overloady — `(uuid)`, `(uuid, numeric) → boolean` a `(uuid, numeric, text DEFAULT 'topup')` — takže **poziční dvouargumentové volání vyhovuje dvěma kandidátům** a Postgres ho odmítne chybou `42725: function ... is not unique`. Výjimka z triggeru rušila celou transakci, takže **každá změna stavu platby z `completed` na jiný u platby s odměnou `earned` se vrátila zpět**. Odpovídal tomu i produkční stav: 16 odměn `earned`, 0 `reversed` — reverzní větev nikdy neproběhla.

**Oprava:** změněn **výhradně** ten jeden řádek na pojmenované argumenty `p_user_id => v_referrer, p_amount_mc => (0 - v_reward)`, které váží právě booleanovou variantu `(uuid, numeric)`. Podmínky, výběr odměny, zápis `reversed`/`reversed_at`/`reverse_reason`, návratová hodnota, `SECURITY DEFINER`, absence `SET search_path` i trigger samotný zůstávají beze změny.

**Ověřeno rollback-only testem před ostrým nasazením:** před opravou UPDATE selhal (`42725`, platba zůstala `completed`, odměna `earned`), po opravě prošly všechny kontroly — `completed → refund_pending` i `completed → refunded` stornuje odměnu se správným `reverse_reason` a odečte `reward_mc` doporučujícímu, zákazníkův zůstatek trigger nemění, počet triggerů na `payments` zůstal 4.

**Produkční postcheck ✅:** funkce používá pojmenované argumenty, poziční volání zmizelo, `SECURITY DEFINER` + owner `postgres` + `proconfig = null` beze změny, trigger `trg_payments_referral_reverse` (AFTER UPDATE OF status) beze změny. **Data nedotčena:** 135 plateb, 775 peněženek, 139 856,41 MC, 3 733 ledger řádků, 17 odměn, checksum `referral_rewards` **identický před i po** (`3d32ff33…`). Žádný zpětný doplněk odměn, které kvůli defektu nebyly stornovány, se **vědomě nedělá**.

## STRIPE REFUNDACE — DB I EDGE FUNCTIONS NA PRODUKCI (03. 08. 2026)

**PR #309 mergnut do `main`** (merge commit `e0f7514d`), **migrace `20260803090000_harden_stripe_refund_flow.sql` aplikována na produkci `xkzhjldrojjlrkezorey`** (v `schema_migrations` jako **`20260803201005` / `harden_stripe_refund_flow`**) a **obě Edge Functions nasazené z `main`** (schválení Pavla):
- `stripe-refund` — aktuálně **v137**, `verify_jwt = true`; povoluje role **`admin` i `superadmin`** (oprava role v commitu `ffc0aac8`),
- `stripe-webhook` — aktuálně **v338**, `verify_jwt = false`, ověřuje Stripe podpis.

**Smoke po deployi ✅:** `stripe-refund` bez JWT → **401**; `stripe-webhook` bez Stripe podpisu → **`No Stripe signature found`** (podpis zůstává povinný).

**Frontend:** Lovable Publish proběhl — administrace zobrazuje dokončené, čekající i selhané refundace.

**Stripe webhooky:** Sandbox endpoint poslouchá `checkout.session.completed`, `refund.created`, `refund.updated`, `refund.failed`. **Live webhook zůstává zatím jen na `checkout.session.completed`** a bez výslovného schválení Pavla se nemění.

**Co platí:** refundace spuštěná z administrace jde novou cestou — nejdřív `prepare_stripe_refund` (kontrola celého zůstatku + odečet), teprve pak Stripe, a `finalize_stripe_refund` jen po `succeeded`. Zákazník nemůže utratit MioCoiny a přesto dostat celou platbu zpět; ověřeno reálným Sandbox testem (viz sekce nahoře).

**Produkční postcheck po nasazení DB vrstvy ✅:** 3 nové sloupce, 3 unikátní indexy, 4 nové funkce (`SECURITY DEFINER` + `search_path=public`), 0 grantů pro `anon`/`authenticated`, 4× EXECUTE pro `service_role`; `admin_manage_payment` má refundní větev blokovanou, žádný `admin_refund_credit`, `anon`/`authenticated` bez EXECUTE; `reverse_failed_stripe_refund` používá pojmenované argumenty. Stav dat bezprostředně po tomto nasazení (tj. **před** Sandbox testy popsanými nahoře): 135 plateb, 139 856,41 MC, 3 733 ledger řádků, 0 řádků `refund_debit`/`refund_reversal`, checksum `referral_rewards` identický.

Popis samotné změny (proč a co dělá) zůstává níže.

**Potvrzený současný (rozbitý) tok — read-only ověřeno na produkci:**
1. `/admin/payments` → tlačítko „Vrátit" → `fetch` na Edge Function `stripe-refund` (v135, `verify_jwt = true`; nasazený kód je znak po znaku shodný s repem).
2. EF ověří JWT + roli, načte platbu, **zavolá Stripe refund** a teprve potom nastaví `status = 'refunded'` a zavolá `deduct_wallet_for_refund`.
3. `deduct_wallet_for_refund` odečte `GREATEST(0, balance − amount)` — **při nedostatku MioCoinů odečte jen zbytek a zůstatek srazí na nulu**. Zákazník tak může MioCoiny utratit a přesto dostat celou platbu zpět.
4. Selhání odečtu i selhání zápisu stavu se pouze zaloguje — EF stejně vrátí `success: true`.
5. Stará `admin_manage_payment(uuid, text, text)` má v refundní větvi opačné znaménko: MioCoiny **přičítá** a zapisuje `admin_refund_credit`. Má `EXECUTE` pro `PUBLIC`/`anon`/`authenticated` (vnitřní guard vyžaduje admin roli). **Aktuální administrace ani žádná Edge Function ji nevolá** — v repu je jen v generovaných typech a v testech; v produkci 0 řádků `admin_refund_credit`.

**Nové obchodní pravidlo:** refundaci lze zahájit jen tehdy, má-li uživatel v běžném zůstatku alespoň celý počet MioCoinů z dané platby. Jinak se zastaví **před** voláním Stripe s hláškou `Refundaci nelze provést, protože část MioCoinů z této platby již byla použita.`

**Cílový stavový tok platby:**

```
completed
  → refund_pending   (prepare_stripe_refund: odečet MioCoinů ještě PŘED Stripe)
      → refunded    Stripe `succeeded`  → finalize_stripe_refund
      → refund_pending  Stripe `pending` / `requires_action` (čeká se dál, HTTP 202)
      → completed   Stripe `failed` / `canceled` → reverse_failed_stripe_refund
                    (MioCoiny i odměna za doporučení se právě jednou vrátí,
                     na platbě zůstane stripe_refund_status = failed|canceled)
```

**Terminální Stripe refundní stavy jsou `succeeded`, `failed` i `canceled`; starší nebo přeházené webhook události je nesmí přepsat.** Stripe negarantuje pořadí doručení — bez této ochrany by pozdní `pending` smazal informaci o selhané refundaci, administrace by přestala zobrazovat „Refundace selhala", `prepare_stripe_refund` by povolil nový automatický pokus a platba by mohla uváznout v `refund_pending`. Obě Edge Functions proto po `record_stripe_refund_status` větví podle **efektivního stavu vráceného databází** (`recorded.stripe_refund_status`), ne podle stavu z právě doručené události.

**Trvalý stav `refund_failed` záměrně neexistuje.** Při neúspěšné Stripe refundaci peníze zákazníkovi vráceny nebyly, takže platba musí zůstat ekonomicky dokončená (`completed`) a dál se počítat do tržeb. Selhání se pozná z `stripe_refund_status`. Nový automatický pokus `prepare_stripe_refund` odmítne kódem `refund_failed_needs_manual_review`, jakmile je na platbě evidovaná refundace se stavem `failed`/`canceled`.

**Účetní důvod (potvrzeno na produkci):** trigger `trg_payments_referral_reverse` → `reverse_referral_reward_on_payment_status_change()` stornuje `referral_rewards` a odečte odměnu doporučujícímu při každém přechodu `completed → cokoli jiného`. Při přípravě refundace je to správně. Pokud ale Stripe refundace selže, musí se odměna vrátit — jinak by doporučující přišel o odměnu za platbu, která nikdy vrácena nebyla. Zpětný přechod `refund_pending → completed` trigger neaktivuje (podmínka `OLD.status = 'completed'`), takže obnovu dělá přímo `reverse_failed_stripe_refund`: zamkne řádek `referral_rewards` podle `payment_id`, obnoví **jen** ten stornovaný přechodem na `refund_pending` (`status = 'reversed'` a `reverse_reason = 'payment_status_changed:refund_pending'`) zpět na `earned` s `reversed_at = NULL` / `reverse_reason = NULL` a přičte `reward_mc` přes produkční `try_credit_wallet_mc(uuid, numeric)`. Ta vrací **boolean**; při neúspěchu funkce vyvolá výjimku a celá transakce se vrátí zpět. Platba bez odměny za doporučení projde normálně.

**Co Draft PR mění:**
- **Migrace `supabase/migrations/20260803090000_harden_stripe_refund_flow.sql`** (jediná, upravovaná přímo — nebyla nikde aplikovaná) — sloupce `payments.stripe_refund_id` / `stripe_refund_status` / `refund_updated_at` + unikátní index na `stripe_refund_id` (pokud není NULL); parciální unikátní indexy `uniq_wallet_tx_refund_debit_per_payment` a `uniq_wallet_tx_refund_reversal_per_payment` (jedna platba = nejvýše jeden odečet a nejvýše jedno vrácení); `prepare_stripe_refund(uuid)` (zámek platby i peněženky, povolen jen stav `completed`/`refund_pending`, kontrola celého zůstatku, jednorázový odečet přesné částky, právě jeden záporný `refund_debit`, posun na `refund_pending`; **odmítne platbu s `stripe_refund_id` a `stripe_refund_status IN ('failed','canceled')`** kódem `refund_failed_needs_manual_review`); `record_stripe_refund_status(uuid, text, text)` (uloží Stripe refund ID, stav a čas — nikdy nemění stav platby ani zůstatky; přijímá jen `pending`/`requires_action`/`succeeded`/`failed`/`canceled`, jinak `invalid_stripe_status` bez zápisu; **terminální jsou `succeeded`, `failed` i `canceled`** — jakmile je některý uložený, žádná pozdější událost ho nepřepíše jiným stavem a vrátí se `ok: true, ignored: true, code: 'terminal_state'` se **skutečně uloženým** `stripe_refund_status` a `status`; druhé odlišné refund ID zůstává `refund_id_conflict`); `finalize_stripe_refund(uuid)` (jen `refund_pending → refunded`, **databáze si sama vyžádá `stripe_refund_id IS NOT NULL` a `stripe_refund_status = 'succeeded'`**, jinak `missing_stripe_refund_id` / `stripe_refund_not_succeeded`); `reverse_failed_stripe_refund(uuid, text)` (přijme jen `failed`/`canceled`, dokončenou refundaci odmítne, první běh vyžaduje `refund_pending`, vrátí přesně odečtenou částku právě jedním kladným `refund_reversal`, obnoví doporučovací odměnu a vrátí platbu na `completed`; opakované volání nesahá na peněženku ani odměnu, ale platbu **nikdy nenechá viset v `refund_pending`** — dorovná ji na `completed` a zachová terminální `stripe_refund_status`). Všechny čtyři funkce **jen pro `service_role`** (revoke `PUBLIC`/`anon`/`authenticated`). `admin_manage_payment` má refundní větev **natvrdo zablokovanou** (`RAISE EXCEPTION`), větev `update_status` beze změny, a odebrané granty pro `PUBLIC`/`anon`/`authenticated`. `deduct_wallet_for_refund` zůstává beze změny těla a jen pro `service_role`, označená jako legacy — **Edge Function ji už nevolá**.
- **Edge Function `stripe-refund`** — nejdřív `prepare_stripe_refund`, teprve pak Stripe. Pokud platba už má `stripe_refund_id`, použije se **`stripe.refunds.retrieve`**, ne nový `create` (opakovaný POST se stejným idempotency key vrací původní uloženou odpověď, takže aktuální stav neukazuje). Chybí-li refund ID po předchozí síťové chybě, zopakuje se `create` se **stejným** `idempotencyKey = onemil-refund-<payment_id>` a do refundace jde `metadata.onemil_payment_id`. Refund ID a stav se ukládají hned po odpovědi Stripe. Rozpad: `succeeded` → finalize → HTTP 200; `pending`/`requires_action` → platba zůstává `refund_pending`, HTTP **202** a hláška „Refundace byla přijata a čeká na dokončení u Stripe."; `failed`/`canceled` → vrácení MioCoinů i odměny za doporučení a **návrat platby na `completed`**, HTTP 409. Při nejasné síťové chybě zůstává `refund_pending`. **Úspěch se nikdy nevrací, pokud selhal odečet, uložení refundace nebo uložení stavu.** Logy ani audit neobsahují Stripe session ID.
- **Edge Function `stripe-webhook`** — celý tok `checkout.session.completed` **beze změny**. Nově zpracovává `refund.created` / `refund.updated` / `refund.failed`: platbu hledá primárně přes `refund.metadata.onemil_payment_id` (záloha: `payments.stripe_refund_id`), uloží Stripe stav a podle **efektivního** stavu z databáze buď dokončí `refund_pending → refunded`, nebo jednou vrátí MioCoiny i odměnu za doporučení a vrátí platbu na `completed`, nebo jen aktualizuje stav. Ignorovanou starší událost (terminální stav) webhook jen potvrdí a nevrací kvůli ní chybu 500; pozdní `failed` po dokončené refundaci RPC navíc odmítne (`already_refunded`). Ověření podpisu zůstává povinné. Idempotence stojí na unikátních indexech v databázi, takže opakovaná událost nezmění zůstatek podruhé, nevytvoří druhý ledger řádek, nepřipíše odměnu podruhé a `refunded` se nevrací zpět.
- **`src/pages/AdminPayments.tsx`** — stav „Refundace čeká" (`refund_pending`) a **„Refundace selhala" odvozená z `payment.status === 'completed'` + `stripe_refund_status IN ('failed','canceled')`** (badge i filtr); u `refund_pending` tlačítko **„Ověřit stav refundace"**; u selhané refundace **žádné tlačítko** pro novou refundaci, jen informace, že je nutná ruční kontrola a že MioCoiny i odměna za doporučení byly vráceny; platba se **dál počítá mezi dokončené platby a tržby**; blokace opakovaného klikání během požadavku; HTTP 202 se zobrazí jako „Refundace čeká na Stripe".

**Stripe konfigurace:** Sandbox endpoint už poslouchá `checkout.session.completed` + `refund.created` + `refund.updated` + `refund.failed`. **Live endpoint zůstává jen na `checkout.session.completed`** — jeho rozšíření vyžaduje výslovné schválení Pavla. Dokud live webhook refundní události neposílá, zůstane tam refundace ve stavu `pending`/`requires_action` v `refund_pending`, dokud ji administrátor ručně neověří tlačítkem.

**Poznámky ke schématu (ověřeno proti produkci):** `payments.status` je `text` bez CHECK constraintu → přechodný `refund_pending` nevyžaduje změnu schématu; v produkci neexistuje žádný řádek `refund_debit`, takže nové unikátní indexy nemohou selhat na historických datech. Trigger `trg_payments_referral_reverse` provede reverzi odměny za doporučení při `completed → refund_pending`; následné `refund_pending → refunded` ani `refund_pending → completed` už nic nereverzuje (podmínka `OLD.status = 'completed'`), reverze tedy proběhne právě jednou a obnovu při selhání dělá `reverse_failed_stripe_refund`. Produkční `try_credit_wallet_mc(uuid, numeric)` vrací `boolean` (existují ještě overloady `(uuid)` a `(uuid, numeric, text)` vracející `void` — používá se ta booleanová).

**Otevřené pozorování (nezměněno v tomto PR):** EF kontroluje roli přes `user_roles.role = 'admin'`, takže účet pouze se `superadmin` rolí dostane 403 — autorizaci jsem záměrně neměnil.

**Kontroly:** `npx tsc --noEmit` exit 0, `npm run build` exit 0, ESLint změněných souborů 0 chyb, statické kontraktní specy 83/86/87 zelené (**24 passed**), CI Smoke E2E zelený. Databázový spec 88 (**21 scénářů**) je staging-only a opt-in (`E2E_REFUND_HARDENING=1`) — neproběhl, protože migrace není aplikovaná na žádné databázi. **Stripe se v testech nevolá vůbec, žádná skutečná refundace neproběhla.**

### ✅ Rollback-only test proti produkčnímu schématu — PROŠEL (03. 08. 2026, schválení Pavla)

Test běžel jako **jediný `DO` blok zakončený `RAISE EXCEPTION`** — migrace i všechna testovací data se vrátily zpět jako jedna atomická operace. **23 z 23 kontrol PASS:** přesný odečet celé částky + jeden `refund_debit` s `reference_id`; opakovaná příprava bez druhého odečtu; neplatný Stripe stav nic nezapíše; `finalize` odmítnut bez refund ID i při `pending`; `succeeded` → `refunded` a opakovaný `finalize` bezpečný; pozdní `failed` po `succeeded` ignorován (`terminal_state`, zůstává `refunded`/`succeeded`); reverze dokončené refundace odmítnuta; nedostatek MioCoinů zastaví refundaci **před** Stripe přesnou hláškou; `failed` i `canceled` vrátí MioCoiny právě jednou a platbu na `completed` se zachovaným `stripe_refund_status`; **doporučovací odměna obnovena na `earned` s prázdným `reversed_at`/`reverse_reason` a `reward_mc` připsán právě jednou**; opakovaná reverze nic nepřipíše podruhé; pozdní `pending` i `succeeded` po `failed` ignorovány; nový automatický pokus zablokován; existující `refund_reversal` dorovná platbu na `completed`; žádná nová funkce nemá `anon`/`authenticated` EXECUTE a `service_role` má EXECUTE na všech čtyřech; všechny tři unikátní indexy existují.

**Oprava odhalená testem (v migraci již provedena):** poziční volání `try_credit_wallet_mc(v_referrer, v_reward_mc)` je v produkci **nejednoznačné** (`42725`), protože vedle booleanové `(uuid, numeric)` existuje i `(uuid, numeric, text DEFAULT 'topup')`. Migrace proto používá pojmenované argumenty `p_user_id => …, p_amount_mc => …`, které váží právě booleanovou variantu.

### ✅ Pre-existující produkční defekt odhalený testem — OPRAVEN NA PRODUKCI (03. 08. 2026)

Migrace `20260803120000_fix_referral_reversal_ambiguous_call.sql` je aplikovaná na produkci (schválení Pavla, samostatně od tohoto PR; v `schema_migrations` jako **`20260803192609`**). Blokátor popsaný níže tím **odpadl** — `prepare_stripe_refund` u platby s odměnou `earned` už neselže.

Původní stav: produkční trigger funkce `reverse_referral_reward_on_payment_status_change()` volala `PERFORM public.try_credit_wallet_mc(v_referrer, (0 - v_reward))` — tedy **stejné nejednoznačné poziční volání**. Test to potvrdil: jakákoli změna stavu platby z `completed` na jiný, u které existovala `referral_rewards` se `status = 'earned'`, skončila chybou `42725` a **UPDATE se vrátil zpět**. V produkci bylo 16 odměn ve stavu `earned` a 0 ve stavu `reversed`, což s tím sedělo — reverzní větev nikdy úspěšně neproběhla.

**Produkce po testu beze změny:** 135 plateb, 775 peněženek, 3 733 ledger řádků, součet zůstatků 139 856,41 MC, checksum `referral_rewards` shodný, 0 nových sloupců/funkcí/indexů, migrace stále nezapsaná v `schema_migrations`, `admin_manage_payment` md5 `96955099709e26fafacb10138d4a8adf` beze změny, 0 testovacích uživatelů, 0 testovacích plateb, 0 řádků `refund_debit`/`refund_reversal`. (Mezi dřívějším a testovacím baseline se čísla posunula o −35 MC a +10 ledger řádků kvůli **souběžné reálné aktivitě aplikace** — 7× `benefit_purchase` a 3× `bonus_credit` v 16:35–16:40 UTC; s testem to nesouvisí.)

## PLATEBNÍ TRIGGER — OPRAVA `update_wallet_after_payment()` APLIKOVÁNA NA PRODUKCI (02. 08. 2026, schválení Pavla)

**PR #308 mergnut do `main` (merge commit `2f607232`) a migrace `20260802120000_restore_wallet_payment_ledger.sql` byla aplikována na produkci `xkzhjldrojjlrkezorey`.** Nové dokončené platby už zakládají řádek účetní historie.

**Zjištěný nesoulad (read-only audit 02. 08. 2026):** produkční `public.update_wallet_after_payment()` byla zjednodušená na pouhé `UPDATE wallets SET balance_coins = balance_coins + NEW.amount` — bez kontroly stavu platby, bez `SECURITY DEFINER` a **bez zápisu do `wallet_transactions`**. Zpevněná verze z `20260315200000_wallet_hardening.sql` aplikovaná byla a 16.–21. 3. 2026 fungovala (71 řádků `payment_credit`), pak ji ale někdo přepsal přímo v databázi mimo migraci. Důvod: původní verze zapisovala do `wallets.balance_vouchers`, který v produkčním schématu **neexistuje** → každá dokončená platba končila chybou a Stripe webhook vracel 500 (incident PAY03, 30. 06. 2026).

**Dopad:** peníze jsou v pořádku, chybí účetní historie. **15 dokončených plateb od 22. 3. 2026 nemá řádek v `wallet_transactions`** (dalších 43 je z doby před vznikem ledgeru, což není regrese). Ověřeno: 0 záporných peněženek, 0 duplicitních `stripe_session_id`, 0 dvojích připsání, 0 plateb bez peněženky; bonusové balíčky 50/310/525/1280 se připisují správně.

**Co migrace dělá:** mění **pouze** tělo funkce. Připíše jen platbu se `status = 'completed'`, `SECURITY DEFINER` + `SET search_path TO 'public'`, upsert peněženky (založí ji, když chybí), přičte jen `balance_coins`, **nikdy nesahá na `balance_vouchers`**, vloží právě jeden řádek `payment_credit` / `update_wallet_after_payment` / `reference_id = NEW.id` a je idempotentní (existující ledger řádek zastaví připsání i zápis). Do `metadata` jde jen metoda, stav a čas vzniku platby — **žádné `stripe_session_id`**. Nově se ignoruje nekladná nebo chybějící částka.

**Co se vědomě nedělá:** žádný zpětný doplněk historie starých plateb, žádná změna zůstatků, žádná změna refundní logiky (`admin_manage_payment` dál při refundu částku **připisuje** místo odečtení — samostatný otevřený nález), žádné přejmenování ani opětovné spuštění kolidujících migrací `20260315290000` / `20260315300000`, žádný UPDATE trigger pro přechod `pending → completed`.

**Runtime ověřeno rollback-only testem proti produkčnímu schématu (02. 08. 2026, schválení Pavla).** Test běžel jako jediný `DO` blok zakončený `RAISE EXCEPTION`, takže se dočasné nasazení funkce i všechny vložené řádky vrátily zpět jako jedna atomická operace. Výsledky:

| Scénář | Výsledek |
|--------|----------|
| `completed` platba 310 MC | zůstatek **+310** (10 152,91 → 10 462,91) a **přesně 1** ledger řádek |
| Metadata ledger řádku | obsahují pouze `method`, `payment_status`, `payment_created_at` — **žádné `stripe_session_id`** |
| Opakované zpracování téže platby | **žádné druhé připsání** (rozdíl zůstatku 0,00, ledger zůstal 1) |
| `pending` platba | nepřipsala nic (rozdíl 0,00, ledger 0) |
| `refunded` platba | nepřipsala nic (rozdíl 0,00, ledger 0) |
| Uživatel bez peněženky | vznikla nová peněženka se zůstatkem 50,00 a **1** ledger řádek |
| Nekladná částka | **nešlo testovat** — databáze ji blokuje přes `CHECK (amount > 0)` na `payments`; guard ve funkci zůstává jako neaktivní pojistka |

**Po testu zůstala produkce beze změny** (135 plateb, 775 peněženek, 3 723 ledger řádků, 139 891,41 MC, 0 testovacích reziduí), teprve pak proběhlo ostré nasazení.

**Produkční apply (02. 08. 2026, výslovné schválení Pavla):** migrace aplikována přes `apply_migration`, zapsána do `supabase_migrations.schema_migrations` jako **`20260802205656` / `restore_wallet_payment_ledger`** (apply nástroj razítkuje vlastní čas, ne číslo souboru `20260802120000` — repozitářní verze proto v `schema_migrations` není; `db push` se na tomto projektu stejně nepoužívá).

**Postcheck ✅:** funkce má `SECURITY DEFINER`, `search_path=public`, tělo 1 393 znaků, **0× `balance_vouchers`**, zapisuje `payment_credit`, upsertuje peněženku přes `ON CONFLICT (user_id)`, komentář nastaven, owner `postgres`. Trigger beze změny: `CREATE TRIGGER trg_update_wallet_after_payment AFTER INSERT ON public.payments FOR EACH ROW`. Data nedotčena: 135 plateb, 775 peněženek, 3 723 ledger řádků, 90 `payment_credit`, součet zůstatků 139 891,41 MC — **před i po apply identické**. Integrita: 0 záporných peněženek, 0 dvojích ledger kreditů. 58 historických `completed` plateb zůstává bez ledger řádku — backfill se vědomě nedělá.

**Poznámka k ACL:** funkce má `EXECUTE` pro `anon`/`authenticated` (výchozí `PUBLIC` grant, existoval i před opravou). Není to expozice — Postgres odmítá přímé volání funkce vracející `trigger` a PostgREST takové funkce nevystavuje.

Dále ověřeno: `npx tsc --noEmit` exit 0, `npm run build` exit 0, read-only integritní kontroly bez nálezu, shoda všech odkazovaných sloupců se skutečným produkčním schématem.

## BEZPEČNOSTNÍ KONTAKT — `security.txt` PŘIDÁN (02. 08. 2026)

Do repozitáře byl přidán **`public/.well-known/security.txt`** — jediný soubor, nic dalšího.

```
Contact: mailto:podpora@onemil.cz
Expires: 2027-08-01T00:00:00.000Z
Preferred-Languages: cs, en
Canonical: https://onemil.cz/.well-known/security.txt
```

- Build ho kopíruje do `dist/.well-known/security.txt` (ověřeno, 150 B) — Vite bere `public/` jako statický kořen, žádná konfigurace nebyla potřeba.
- **Po Lovable Publish má být dostupný na `https://onemil.cz/.well-known/security.txt`.** Do publishe vrací adresa 404.
- **`Expires` je nutné obnovit před 1. 8. 2027.** Podle RFC 9116 je pole povinné a po vypršení se soubor považuje za neplatný; při obnově stačí posunout datum o rok.
- **Beze změny zůstávají P2 (ochrana proti iframu), P3 (`Cross-Origin-Resource-Policy`) i SRI u externích skriptů.** SRI se u `googletagmanager.com/gtag/js` a `cdn.onesignal.com` záměrně nepoužívá — obě služby obsah průběžně mění a hash by je rozbil; roli protiváhy plní CSP allowlist.
- **CSP zůstává aktivní přes meta tag** v `index.html` (P1, PR #304) — tato změna se jí nijak nedotýká.

## BEZPEČNOSTNÍ STAV — A1–A5, P1 A SPF V POŘÁDKU, P2/P3 VĚDOMĚ ODLOŽENÉ (02. 08. 2026)

Znovu ověřeno 2. 8. 2026 přímo v GitHubu, produkční databázi a veřejném DNS. **Aplikační nálezy A1–A5, webový nález P1 i SPF jsou v pořádku.**

| Nález | Stav | Doklad |
|-------|------|--------|
| A1 `get_admin_activation_summary()` | ✅ opraveno | `anon`/`PUBLIC` bez EXECUTE, uvnitř `WHERE public.is_admin()`; migrace `20260801180617_secure_admin_activation_summary.sql` je v `main` (PR #302, merge `a59bd674`) |
| A2 `create_partner_offer_invoices_for_period(date,date)` | ✅ opraveno | jen `service_role`; migrace `20260801180912_secure_partner_offer_invoice_creation.sql` je v `main` (PR #302) |
| A3 `assign_partner_offer_to_ticket(uuid,uuid,uuid)` | ✅ opraveno | jen `service_role`; migrace `20260801181421…` (PR #298, merge `b7155665`) |
| A4 `sync_partner_offer_activations()` | ✅ opraveno | jen `service_role`; migrace `20260801185927…` (PR #300, merge `e09733ce`) |
| A5 `upload-ticket-share` | ✅ opraveno a nasazeno | Edge Function verze 177 ACTIVE, `verify_jwt = true`, ověření vlastníka tiketu, jen PNG, `upsert: false` (PR #299, merge `e67ff359`) |
| A6 `activate_partner_reward_sql` | ℹ️ informativní | mrtvá funkce bez praktického rizika |
| **P1** Content-Security-Policy | ✅ **aktivní na produkci** | meta tag v HTML `https://onemil.cz` (PR #304, merge `93e18dc6`) |
| **P2** ochrana proti iframu, **P3** `Cross-Origin-Resource-Policy` | 🟡 **vědomě odložené, nekritické** | hlavičky na produkci chybí; opravitelné jen na edge vrstvě |
| SPF / pošta | ✅ v pořádku | viz sekce níže |

**Migrace A1 a A2 jsou v repozitáři.** Dřívější závěr o nesouladu repo × produkce („migrace A1/A2 chybí v `supabase/migrations/`") **už neplatí** — doplnil je PR #302. V `main` jsou všechny čtyři bezpečnostní migrace z 1. 8. 2026.

**P2/P3 se teď neřeší.** Nejsou vyhodnoceny jako kritické a jediná cesta k nim vede přes předřazení vlastní Cloudflare vrstvy, tedy migraci celé DNS zóny včetně pošty — to riziko aktuálně nevyváží. Plán zůstává jen jako návrh; **Cloudflare se nyní nezavádí**.

**Zbylé větve nejsou otevřená chyba.** `fix/add-missing-a1-a2-migrations` je plně obsažená v `main` (PR #302 mergnut) a `fix/web-security-headers-p1-p3` patří k **uzavřenému PR #303** (měnila jen `vercel.json`, který produkční Lovable hosting nepoužívá). Obě jsou neškodné zbytky po uzavřených PR, ne aktivní řešení.

## DNS A POŠTA — SPF OPRAVENO A VEŘEJNĚ OVĚŘENO (02. 08. 2026)

**SPF `onemil.cz` je v pořádku a bylo 2. 8. 2026 veřejně ověřeno.** Doména má právě jeden SPF záznam a odesílání přes Amazon SES / Resend je odděleno na `send.onemil.cz`.

| Záznam | Typ | Ověřená hodnota |
|--------|-----|-----------------|
| `onemil.cz` | TXT (SPF) | `v=spf1 a mx include:_spf.websupport.cz -all` — **právě jeden SPF** |
| `send.onemil.cz` | TXT (SPF) | `v=spf1 include:amazonses.com ~all` |
| `onemil.cz` | MX | `10 mx10.active24.cz`, `100 mx20.active24.cz` |
| `_dmarc.onemil.cz` | TXT | `v=DMARC1; p=quarantine` |
| `resend._domainkey.onemil.cz` | TXT (DKIM) | `p=MIGfMA0GCSqGSIb3DQEBAQU…` (aktivní) |

Na apexu se `include:amazonses.com` **nevyskytuje** — ověřeno negativním testem. MX, DKIM i DMARC jsou aktivní beze změny.

**Ověřeno ze tří nezávislých zdrojů:** Google Public DNS (`dns.google`), Cloudflare DNS (`cloudflare-dns.com`) a autoritativní nameserver `ns1.websupport.cz`. Všechny tři vracejí shodné hodnoty. (Quad9 DoH endpoint byl v době kontroly nedostupný, proto ho nahradil autoritativní dotaz — ten je pro tento účel průkaznější.)

**Zastaralá analýza:** dřívější zjištění, že `onemil.cz` má **dva SPF záznamy** (druhý s `include:amazonses.com`), **už neplatí**. Popisovalo stav před opravou; SES SPF byl mezitím správně přesunut na `send.onemil.cz`. Tuto zastaralou informaci dál nepoužívat.

**Cloudflare se zatím nezavádí.** Připravený plán předřazení vlastní Cloudflare vrstvy zůstává jen jako návrh — nálezy **P2** (ochrana proti vložení do iframu) a **P3** (`Cross-Origin-Resource-Policy`) nejsou vyhodnoceny jako kritické a nevyváží riziko migrace celé DNS zóny včetně pošty. **P1 (CSP) je od 2. 8. 2026 aktivní na produkci** přes meta tag z PR #304, takže hlavní část webové ochrany je pokrytá bez zásahu do DNS.

**Pravidlo (neměnit bez samostatného ověření):** apex `onemil.cz` musí mít vždy **právě jeden** SPF záznam; SES/Resend odesílání patří na `send.onemil.cz`. Dva SPF na jednom jménu znamenají podle RFC 7208 `permerror` a rozbily by vyhodnocení SPF u příjemců.

## DOBÍJENÍ MIOCOINŮ A PARTNERSKÝ BLOK — ČÁSTI A A B ISSUE #289 MERGNUTÉ A NASAZENÉ (30. 07. 2026, aktualizováno 02. 08. 2026)

**Části A a B issue #289 jsou mergnuté v `main` a publikované na produkci.** PR #290 (merge `2c53a162`) a navazující PR #291–#297 jsou všechny mergnuté; produkční bundle obsahuje `/top-up`, `ticket_row_id` i stránku `/partnerstvi`. Část C (Shoptet) není součástí těchto PR a zůstává neprovedená.

> Poznámka k historii: text níže vznikl v době otevřeného Draft PR #290 a popisuje průběh práce. Formulace typu „připraveno ve worktree / zatím nemergnuto / čeká na Lovable Publish" jsou **překonané** — vše je mergnuté a publikované.

Jednotlivé kroky v pořadí, jak vznikly:

- **První krok — extrakce dobíjecího panelu.** Dobíjecí panel MioCoinů (nadpis, popis, čtyři balíčky, jejich placement bannery, `handleCoinPurchase`, `topUpLoading`, Stripe monitoring, `setPendingPaymentSuccessContext`) byl 1:1 přesunut z `src/pages/Homepage.tsx` do nového `src/components/MioCoinTopUpSection.tsx`.
- Homepage komponentu vykresluje na stejném místě uvnitř karty; markup, třídy, texty ani částky se nezměnily. Ověřeno v dev serveru: pořadí sourozenců uvnitř panelu zůstalo `homepage-miocoin-header` → mřížka balíčků → dva navigační boxy, 4 balíčky, 4 tlačítka `Dobít`, bonusové odznaky `+10/+25/+80`.
- Guard `isNativeApp()` (`src/lib/nativeApp.ts`) je zachován beze změny — v nativní aplikaci komponenta nerenderuje nic a nespouští checkout.
- Boxy „Probíhající soutěže" a „Koupit voucher se slevou" v tomto kroku ještě zůstávaly na Homepage; odstranil je až čtvrtý krok.
- **Druhý krok — samostatná stránka `/top-up`.** Nový `src/pages/TopUp.tsx` vykresluje sdílenou `MioCoinTopUpSection` ve stejném obalu jako Homepage (`homepage-light-page` → `homepage-light-content` → `homepage-light-panel homepage-miocoin-panel`), pod zákaznickým motivem `public-customer-theme`, který nastavuje `src/App.tsx`. Route `/top-up` přidána mezi zákaznické routy a do `CUSTOMER_BLOCKED_ROUTES` (zakázaná pro partnera a affiliate). Do spec 54 doplněna route `/top-up`.
- **Nativní aplikace:** `TopUp.tsx` při `isNativeApp() === true` okamžitě přesměruje na `/profile` (`navigate('/profile', { replace: true })`) a nevykreslí nic — stejný vzor jako `PaymentSuccess`/`PaymentCancel`. Detekce výhradně přes `src/lib/nativeApp.ts`.
- **Třetí krok — spodní menu a přesun vstupu do Zpráv.** `BottomNavigation.tsx`: položka `Zprávy` nahrazena položkou `Dobít` (`/top-up`, `OneMilMioCoinIcon`); v nativní aplikaci se položka `Dobít` odfiltruje přes `isNativeApp()`. Badge nepřečtených zpráv přesunut z `/messages` na `/profile` (stejný `useUnreadMessagesCount`, stejné číslo); badge Výher na `/wins` beze změny. `Profile.tsx`: nová karta `Zprávy` nad `RedeemMioCoinCard` s počtem nepřečtených a tlačítkem `Otevřít zprávy` → `/messages`; funguje na webu, v PWA i v nativní aplikaci. Dobíjecí tlačítko a modal v profilu beze změny.
- **Výsledné spodní menu:** web/PWA `Domů · Vouchery · Soutěže · Výhry · Dobít · Můj profil`; nativní aplikace `Domů · Vouchery · Soutěže · Výhry · Můj profil`.
- **Čtvrtý krok — partnerský náborový blok nahradil dobíjení na Homepage.** Z `Homepage.tsx` odstraněn `MioCoinTopUpSection`, box „Probíhající soutěže", box „Koupit voucher se slevou", celý `usePlacementBanners` (Homepage už žádný placement banner nepoužívá) a nepoužívané importy. Na jejich místo přišel nový `src/components/PartnerRecruitmentCard.tsx` — nadpis „Staňte se partnerem OneMil", text „Odměňte své zákazníky za nákup. Zaslouží si něco navíc.", 5 schválených odrážek a CTA „Chci se stát partnerem" → `/partner/register`. Blok používá jen existující OneMil ikony, žádné logo ani cizí grafiku, a je viditelný i v nativní aplikaci (žádný `isNativeApp()` guard — neobsahuje platby).
- **Rozložení Homepage:** desktop dva sloupce (partnerský blok vlevo, `Poslední výherci` vpravo, stejná šířka i výška), mobil oba bloky pod sebou v přirozeném pořadí, bez horizontálního přetékání. Pravý panel `Poslední výherci` beze změny.
- **Zatím neprovedeno (issue #289):** část C — samoobslužný test Shoptet exportu a ochrana proti starým objednávkám. Dále staging ověření, test Stripe návratu a chybových stavů, merge a produkční nasazení; po případném merge bude aktivace na produkčním webu vyžadovat ruční Lovable `Share → Publish`.
- **Bez zásahu v celém PR #290:** databáze, migrace, Supabase, Edge Functions `create-stripe-checkout` i `stripe-webhook`, `/payment-success`, `/payment-cancel`, peněženky, platby, soutěže, tikety a vouchery. Změny jsou výhradně frontendové (`src/App.tsx`, `src/pages/Homepage.tsx`, `src/pages/Profile.tsx`, `src/pages/TopUp.tsx`, `src/components/BottomNavigation.tsx`, `src/components/MioCoinTopUpSection.tsx`, `src/components/PartnerRecruitmentCard.tsx`, spec 54). Kontroly na HEAD `cf9198e5`: `npx tsc --noEmit` exit 0, `npm run build` exit 0, CI Smoke E2E (Chromium) pass.

## GARANTOVANÝ NÁKUPNÍ BENEFIT — DATOVÝ ZÁKLAD PŘIPRAVEN, FUNKCE JEŠTĚ NENÍ AKTIVNÍ (24. 07. 2026)

Na samostatné větvi je připraven pouze aditivní návrh Fáze 1: verze podmínek, distribuční objednávky a ceny, evidence vydání, budoucí idempotence nákupu, audit a budoucí společné položky faktur. Migrace nebyla aplikována na staging ani produkci. Nový nákup není zapojený; `buy_ticket_atomic`, současné soutěže, historická data, existující fakturace, PDF a e-mailový tok zůstávají beze změny.

## ANDROID APLIKACE — DOKONČENÍ INTEGRACE (19. 07. 2026)

**Android Capacitor projekt byl úspěšně sloučen do `main` (PR #266, merge commit `310e7ff`).** Aplikace OneMil je nyní dostupná jako nativní Android balíček.

- **Identifikace:** Android Application ID je `cz.onemil.app`.
- **Sestavení:** Debug build byl úspěšně spuštěn v emulátoru Android 16. TypeScript kontrola i kompletní produkční sestavení (`npm run build`) prošly bez chyb.
- **Specifické chování pro Store:** Nativní aplikace automaticky skrývá možnosti dobíjení MioCoinů (Stripe checkout) a texty odkazující na nákup digitálních voucherů. Toto zajišťuje soulad s pravidly Google Play a Apple App Store.
- **Implementace:** Detekce platformy probíhá přes centrální modul `src/lib/nativeApp.ts` (`isNativeApp()`).
- **Obsah stránek:** Stránka „Jak to funguje“ čerpá obsah ze Supabase tabulky `content_pages` (slug `jak-to-funguje`). Úprava pro skrytí věty o nákupu voucherů v nativní aplikaci byla implementována v `src/pages/ContentPage.tsx` a následně ověřena přímo v emulátoru.
- **Web a PWA:** Chování pro webové prohlížeče a instalovanou PWA verzi zůstává nezměněno — všechny funkce včetně dobíjení jsou nadále dostupné.

## PARTNERSKÉ FAKTURY — CRON AUTH FIX (email-queue + offer-reminders) LIVE (18. 07. 2026)

**PR #241 (`fix/cron-internal-token-auth`) je nasazený a ověřený na produkci `xkzhjldrojjlrkezorey`.** Opravuje opakované HTTP 401 dvou nedělně/denně/10min plánovaných automatů, jejichž kořenová příčina byl drift Edge secretu `INTERNAL_FUNCTION_TOKEN` proti Vault secretu `internal_function_token` (cron posílá Vault hodnotu, funkce porovnávaly jen s Edge hodnotou).

- **Migrace `20260718120000_fix_cron_internal_token_vault_auth.sql` aplikována na produkci.** Přidána `verify_internal_function_token(text)` (SECURITY DEFINER, ověřuje token proti Vaultu, EXECUTE jen `service_role`; vzor `verify_shoptet_cron_token`) a Vault dispatcher `run_process_email_queue_cron()`. Cron `process_email_queue_every_10_min` (jobid 16) přepojen na `SELECT public.run_process_email_queue_cron();` — schedule `*/10 * * * *` zachován, žádný nový/duplicitní cron, token není v textu cronu ani v repu.
- **Edge Functions na produkci:** `process-email-queue` **v154** a `send-offer-reminders` **v61** (obě ACTIVE, `verify_jwt=false`) nově přijmou `x-internal-token` ověřený proti Vaultu (stávající env-token / service-role / admin-JWT cesty zachovány). Do `config.toml` doplněn chybějící `[functions.send-offer-reminders] verify_jwt = false`.
- **Ověřeno na produkci:** job 16 v 12:40 UTC vrátil **HTTP 200** `{"success":true,"processed":1,"sent":1,"failed":0}`; fronta `email_queue` pending **2 → 1** (odeslán referral e-mail; zbylý 1 je „faktura …připravena“ bez přílohy, kterou fronta záměrně vynechává pre-existujícím filtrem — mimo tuto opravu). `send-offer-reminders` (denní 08:00 UTC) vrátí 200 při dalším plánovaném běhu; nespouštěno ručně (42 čekajících připomínek). Pravidla připomínek (první po 24 h, další po 7 dnech, pak vždy po 7 dnech, stop po otevření/skrytí) jsou v DB funkci `get_due_offer_reminder_rows()` — beze změny.
- **Pravidlo (neměnit):** funkce ani cron token nehardcodovat; token držet ve Vaultu (`internal_function_token`) a ověřovat přes `verify_internal_function_token`. Cron 16 nepřidávat druhý; schedule `*/10` neměnit.

## SOFINITY `process_event_queue_worker` — NEPOUŽÍVANÁ INTEGRACE, CRON PONECHÁN (18. 07. 2026, jen prošetřeno)

`process_event_queue_worker` **zůstává nezměněný**; jeho cron `process-event-queue` (jobid 23, `* * * * *`) je **stále aktivní a každou minutu vrací HTTP 401** `Unauthorized worker call` (stejný token drift). Read-only audit: `event_queue` má 2577 pending, 20 MB (0,8 % DB), jen 2 nové události za 7 dní (backlog neroste), **0 FK potomků**, jediní konzumenti jsou worker + `sofinity-chat-callback` → čistě (aktivně nepoužívaná) Sofinity integrace bez reálného dopadu na soutěže/peněženky/platby/faktury. **Otevřený bod (neprovedeno):** cron 23 lze bezpečně vypnout (`SELECT cron.unschedule('process-event-queue');`) pro odstranění log šumu; data nemazat, funkci ani token neopravovat. Cron 23 nebyl bez výslovného pokynu měněn.

## PARTNERSKÉ FAKTURY — AUTO-VYSTAVENÍ PŘEPÍNAČ: PRODUKČNÍ BACKEND ROLLOUT (18. 07. 2026)

**PR #240 backend je nasazený na produkci `xkzhjldrojjlrkezorey`.** Superadmin přepínač automatického vystavení + odeslání partnerských faktur.

- **Nastavení:** klíč `settings.partner_invoice_auto_send_enabled`, **výchozí `false` (VYPNUTO)**. Čtení i zápis řídí RLS `settings` (jen superadmin). Přepínač je v `/admin/partners-portal` v záložce Faktury (jen superadmin) — aktivace UI vyžaduje ruční Lovable Publish.
- **Omezení oprávnění:** `is_partner_invoice_auto_send_enabled()` má EXECUTE jen `service_role` (revoke authenticated/anon); `claim_partner_invoice_for_auto_send`, `release_partner_invoice_auto_send_claim`, `run_partner_invoice_weekly_automation` a `create_partner_invoices_for_last_week` — EXECUTE jen `service_role` (anon/authenticated = false).
- **Edge Functions na produkci:** `send-partner-invoice-email` **v149**, `partner-invoice-auto-send` **v2** (obě ACTIVE, `verify_jwt=false`).
- **Cron:** `weekly_partner_invoices` (jobid 17, `0 2 * * 0` zachováno) přepojen na `SELECT public.run_partner_invoice_weekly_automation();` (jediný job).
- **Chování:** VYPNUTO → nedělní automat vytvoří jen `draft` (bez PDF, bez e-mailu). ZAPNUTO → po vytvoření PDF + právě jeden e-mail + stav `issued` **až po úspěchu** (chyba → zůstává `draft`). DB-side dedup: sdílená atomická rezervace `auto_email_sent_at` (ruční „Odeslat e-mailem“ i automat sdílí stejný claim → nikdy dva e-maily); `create_partner_invoices_for_last_week()` vrací ID faktur vytvořených v aktuálním běhu → zpracují se jen ty, staré drafty zůstávají k ručnímu schválení; poslední PDF export se reusuje (žádné duplicitní PDF); `draft → issued` ověřuje přesně 1 změněný řádek. Ruční „Znovu odeslat“ zůstává samostatná superadmin akce. Migrace byla aplikována na produkci dříve; flag zůstává `false`.

## BEZPEČNOSTNÍ OPRAVY ZÁKAZNICKÝCH FLOW (17. 07. 2026)

- **PR #239 — `wallets` přímý INSERT jen s nulovým zůstatkem: LIVE na produkci.** RLS INSERT policy `Users can insert own wallet` nově vyžaduje `auth.uid() = user_id AND balance_coins = 0 AND bonus_balance_coins = 0`; přímý klientský INSERT tak nemůže vytvořit peněženku s nenulovým zůstatkem. Migrace aplikována na produkci (merge `25199f9ca7`); vytváření peněženek jde dál přes `ensure_wallet_exists` (0/0), admin/superadmin a nákupní RPC nedotčeny.
- **PR #237 — soukromí výherců + vlastní tikety: DB část LIVE na produkci.** Na produkci: `get_latest_winners(integer)` odebrán anon/authenticated EXECUTE; nový `get_latest_winners_public(integer)` (anon-callable, sanitizovaný — bez interních UUID, e-mailu, telefonu, poznámek a avatarové cesty s UUID); `tickets`/`winners` mají partner/own-row RLS. Frontend (přepnutí na `get_latest_winners_public`) vyžaduje ruční Lovable Publish; do publishe volá live bundle ještě starou funkci → veřejný feed výherců je do publishe prázdný (viz onemil_history).
- **PR #236 (`buy_ticket_atomic` vždy `auth.uid()` + zápis `wallet_transactions`) a PR #238 (`user_vouchers` INSERT jen pro oblíbené):** mergnuté do `main`, **ověřené na stagingu**; produkční apply migrací v tomto dokumentačním auditu nepotvrzen (zaznamenat jako otevřené před produkčním nasazením).

## OBCHOD / LEADY — RUČNÍ PSANÍ E-MAILU (16. 07. 2026)

V detailu leadu je primární akcí `Napsat e-mail`, která otevře prázdný existující editor předmětu
a textu. Šablona je dostupná až uvnitř editoru přes volitelnou akci `Použít šablonu` a pouze
vyplní editovatelná pole. Stejné chování používá follow-up přes `Napsat follow-up`. Inline odpověď
pod konkrétní zprávou, validace, koncepty, historie i všechny odesílací Edge Functions zůstávají
beze změny. Jde pouze o frontend; po merge do `main` je k aktivaci na produkčním webu nutný ruční
Lovable krok `Share → Publish`.

## OBCHOD / LEADY — RUČNÍ NAČTENÍ FIRMY Z ARES (15. 07. 2026)

PR #224 na větvi `codex/sales-lead-ares-lookup` doplňuje do ručního formuláře leadu akci **Načíst z ARES**. Po zadání osmimístného IČO se bez automatického uložení doplní oficiální název, normalizované IČO, dostupné DIČ, úplná adresa sídla a město; web, obor a kontaktní údaje se nemění a všechna pole zůstávají editovatelná. Adresa je nově uložena v `sales_leads.address` a zobrazena také v editaci a detailu leadu.

**BACKEND LIVE:** PR #224 je squash-merge do `main` (`230e55a98d03d387c38ca76bf5ca18a0ee5ffc54`). Migrace `sales_lead_ares_lookup_address` je na stagingu `dxmowysntemfqfnanxua` i produkci `xkzhjldrojjlrkezorey`. Edge Function `sales-lead-ares-lookup` je ACTIVE: staging v1, produkce v2, shodný checksum `d5313b8b…`. Funkce používá existující sdílený ARES helper, vyžaduje JWT + `sales_leads.manage` a nic nezapisuje. Živé API testy a staging UI E2E prošly; create/update RPC zachovávají RLS, duplicitní kontroly a audit. Produkční frontend čeká pouze na ruční Lovable Publish, který Codex neumí bezpečně spustit programově.

## OBCHOD / LEADY — DENNÍ PRACOVNÍ PŘEHLED A ČISTÉ E-MAILOVÉ ODPOVĚDI LIVE (14. 07. 2026)

**PR #220 a PR #221 jsou kompletně nasazené na produkci.** PR #220 (`0c27aa174419414e0171158da7f54b95d1bfe04a`) nahradil viditelnou technickou Reply-To adresu běžnou adresou `OneMil obchodní tým <b2b@onemil.cz>`. Active24 uchovává kopii a přesměrovává odpovědi do Resend Receiving; systém je bezpečně páruje podle skutečného RFC e-mailového vlákna (`In-Reply-To`/`References`/provider thread ID). Nenavázané nebo nejednoznačné zprávy končí v sekci „Nepřiřazené e-maily“. Migrace `sales_lead_inbound_thread_routing`, nové inbound RPC/tabulka a dotčené Edge Functions jsou na produkci; živý test Active24 → Resend → správný lead prošel bez duplicity.

PR #221 (`cc9a06d95fd5501314c5a7fbb1d0c5c55e5f0ff7`) přidal do `Administrace → Obchod → Leady` záložku **Dnes**. Přehled sjednocuje existující CRM úkoly a plánované aktivity napříč leady: zobrazuje firmu, typ, termín, odpovědnou osobu a stav; podporuje „Rozpracováno“, dokončení a přesunutí termínu. Dnešní i zmeškané nedokončené položky zůstávají viditelné; poznámky bez termínu zůstávají jen v historii leadu. Migrace `sales_leads_today_work_queue` je aplikovaná na stagingu i produkci, šest zápisových RPC má EXECUTE pouze pro `authenticated` a oprávnění `sales_leads.manage`/superadmin. Funkční stagingový i produkční rollback test prošel a nezanechal testovací data. Lovable Publish proběhl; produkční asset `onemil.cz/assets/index-DBJulzUv.js` obsahuje novou pracovní frontu. Produkční CI je zelené.

## OBCHOD / LEADY — OVĚŘOVÁNÍ FIREMNÍCH WEBŮ (11. 07. 2026)

Discovery ukládá web pouze po skutečném ověření: identita firmy se porovná s ARES (IČO nebo jednoznačný právní název), kandidátní web musí vrátit HTTP 200 a neprázdné HTML, nesmí být zaparkovaný/prodávaný/expirovaný a obsah musí potvrdit firmu. Bez důkazu vznikne lead s `website=NULL` a stavem `neovereny`. Kontaktní enrichment odmítne lead bez ověřeného webu a navržený e-mail znovu fyzicky hledá na zdrojové stránce stejné domény.

**LIVE:** PR #214 je mergnutý (`e200b49ae005cb322704d4fae24c6478df6015bc`). Migrace `sales_leads_verified_company_websites` je aplikovaná na stagingu i produkci. Staging: `sales-lead-discover` v10 a `sales-lead-enrich-contact` v5 ACTIVE. Produkce: `sales-lead-discover` v11 a `sales-lead-enrich-contact` v7 ACTIVE. Produkční rollback test nezanechal žádný testovací lead; počet leadů po ověření je 16. Žádný e-mail nebyl odeslán.

## OBCHOD / LEADY — NAPLÁNOVANÉ AKTIVITY (11. 07. 2026)

Oprava odděluje čas vytvoření od termínu schůzky/telefonátu (`scheduled_for`), zachovává existující budoucí záznamy a přidává samostatnou sekci Naplánované aktivity. Budoucí položky jsou řazené podle termínu, zobrazují autora, účel, poznámku a další krok; lze je upravit, dokončit nebo zrušit bez mazání historie. Hlavní seznam ukazuje nejbližší plán. Český čas se zobrazuje explicitně přes `Europe/Prague`.

# OneMil – aktuální stav projektu

## OBCHOD / LEADY — CRM DOKONČENÍ (11. 07. 2026)

Na větvi `feature/sales-leads-production-crm` je dokončeno: telefonáty, schůzky a poznámky ve společné historii; úkoly s termínem, odpovědným a trvalou historií; ručně potvrzovaný AI follow-up; Resend doručovací události; přehled úspěšnosti podle období a odpovědného administrátora. Staging: migrace `sales_leads_crm_completion` aplikována, `sales-lead-draft-email` v8, `send-sales-lead-follow-up` v1 a `sales-lead-inbound` v7 ACTIVE. Produkce: stejná migrace aplikována, `sales-lead-draft-email` v6, `send-sales-lead-follow-up` v1 a `sales-lead-inbound` v7 ACTIVE. Databázový tok byl v obou prostředích ověřen transakčním testem a uklizen rollbackem; testovací data ani e-maily nezůstaly.


## MODUL OBCHOD / LEADY — ODPOVĚDI + NEPŘEČTENÉ + REPLY-TO FIX PRODUKČNĚ LIVE (11. 07. 2026)

**Autoritativní aktuální stav modulu Obchod / Leady po PR #206–#209. Odpovídání z detailu leadu,
ukládání celého e-mailového vlákna a upozornění na nepřečtené odpovědi jsou LIVE na produkci
`xkzhjldrojjlrkezorey`. Nahrazuje starší zápisy níže, které tyto věci označovaly jako „POUZE PR" /
„neaplikováno/nenasazeno" — ty jsou překonané.**

- **Odpovídání přímo z detailu leadu je na produkci.** V historii kontaktu je u příchozí zprávy
  tlačítko „Odpovědět"; formulář (předmět, text, „Odeslat odpověď", „Zrušit") se zobrazí inline
  přímo pod vybranou zprávou a sám odscrolluje do pohledu (PR #207). Odesílá EF `send-sales-lead-reply`.
- **Do historie se ukládají příchozí i odchozí e-maily.** `email_sent` (odchozí) i `reply_received`
  (příchozí) mají `direction`, `subject` a `body_snapshot`; detail je zobrazuje jako vlákno
  (odesílatel/příjemce, předmět, text, čas), odchozí vs příchozí odlišené, dlouhý text i citovaná
  část sbalené (PR #205).
- **Reply-To chyba Resend SDK v6 opravena; produkční `send-sales-lead-reply` běží ve verzi 3.**
  SDK v6 `emails.send()` očekává `replyTo` (camelCase), ne `reply_to` (PR #208). Odchozí odpověď
  nyní má správnou Reply-To hlavičku `reply+<lead_id>@ulduuzoul.resend.app` a `reply_to` se zapisuje
  i do metadat aktivity `email_sent`.
- **Další odpovědi zákazníka se správně vracejí do stejného leadu** — přes per-lead Reply-To je chytne
  `sales-lead-inbound`, dotáhne tělo přes Resend Receiving API a uloží jako `reply_received`. Inbound
  negatuje na stav leadu; příjem funguje i pro `jednani`/`odpovedel` (stav se přijetím nemění).
- **Názvy stavů v UI:** `konvertovan` = „Spolupráce", `odmitl` = „Bez spolupráce". `odpovedel` a
  `jednani` jsou oddělené karty/taby („Odpovědělo" vs „Jednání"), nepočítají se dvakrát.
- **Kontrola duplicit e-mailu i firemní domény s auditovanou výjimkou** funguje: server ověřuje
  přesnou adresu vždy; veřejné domény (Gmail, Seznam, Outlook, Hotmail, Centrum a další seedované) se
  jako doménová duplicita nevyhodnocují. Odeslání oslovení i odpovědi má serverový guard
  `sales_lead_email_send_guard`; výjimka vyžaduje důvod a je auditovaná.
- **Nepřečtené odpovědi evidované přes `read_at` + `read_by`** na `sales_lead_activities` (PR #209).
  `read_at IS NULL` = nepřečteno; nová `reply_received` je nepřečtená automaticky (inbound `read_at`
  nenastavuje).
- **V administraci se zobrazuje počet nových odpovědí, červená tečka a zvýraznění zprávy:** nav
  položka „Obchod" má červený badge s počtem nepřečtených, karta „Odpovědělo" červený počet, lead
  s nepřečtenou odpovědí má v tabulce červenou tečku + tučný název, nepřečtená zpráva v detailu je
  zvýrazněná se štítkem „Nové". Počty se aktualizují ihned (custom event `sales-leads-unread-changed`
  + refetch při návratu okna do popředí), bez ručního obnovení.
- **Po otevření detailu se odpověď označí jako přečtená** přes RPC `sales_lead_mark_replies_read(uuid)`
  (SECURITY DEFINER, guard `sales_leads.manage`/superadmin, `anon` bez EXECUTE). RPC mění jen
  `sales_lead_activities`, **nikdy stav leadu**.
- **Migrace `20260711100000_sales_leads_activity_read_state.sql` je aplikována na stagingu
  `dxmowysntemfqfnanxua` i produkci `xkzhjldrojjlrkezorey`** (přes `apply_migration`, `{"success":true}`).
  Ověřeno na obou: sloupce `read_at`/`read_by`, parciální index `idx_sales_lead_activities_unread_reply`,
  RPC guard (superadmin OK, běžný uživatel i anon `access_denied`), backfill existujících odpovědí na
  přečtené, checksumy stavů leadů i seznamu aktivit beze změny (jen backfill `read_at`).
- **Frontend publikován (Lovable Publish) a funkce ověřena na produkci** (potvrzení Pavla).
- **Produkční Edge Function `admin-create-test-user` byla ODSTRANĚNA** z produkce (endpoint → 404) a
  smazána z repu (PR #204). **Nesmí být znovu nasazena** — neměla autorizaci a přes service role
  zapisovala do wallets/payments/vouchers.

**Pravidla (neměnit bez samostatného schválení Pavla):** `send-sales-lead-reply` musí u `emails.send()`
používat `replyTo` (SDK v6), nikdy `reply_to`; `sales_lead_mark_replies_read` nesmí měnit stav leadu;
`admin-create-test-user` neobnovovat bez řádného admin guardu; oddělené Resend klíče (`RESEND_API_KEY`
sending-only vs `RESEND_RECEIVING_API_KEY` full-access) neslučovat.

## MODUL OBCHOD / LEADY — INBOUND OPRAVEN NA RESEND RECEIVING API (10. 07. 2026)

Původní návrh (`reply.onemil.cz` + vlastní MX) je **nahrazen**: používáme **bezplatnou Resend
receiving doménu `ulduuzoul.resend.app`**, placenou custom doménu nechceme. Důsledek: **žádný DNS/MX
zásah** — kořenové `onemil.cz` i schránka `b2b@onemil.cz` v Active24 zůstávají nedotčené.

- `send-sales-lead-email`: `reply_to = reply+<lead_id>@ulduuzoul.resend.app` (`from` dál `b2b@onemil.cz`).
- Webhook `email.received` nese **jen metadata, ne tělo**. `sales-lead-inbound` proto z `data.email_id`
  načte celý e-mail přes `resend.emails.receiving.get()` a uloží `text` (fallback `html`), subject,
  odesílatele a `message_id`. SDK povýšeno na `npm:resend@6.17.2` (`2.0.0` receiving nemá).
- Lead ID se dál čte z adresy příjemce `reply+<uuid>@ulduuzoul.resend.app`.
- Dedup se vyhodnocuje **před** voláním Resendu (replay webhooku nestojí API request); tvrdá pojistka
  zůstává unikátní index `uq_sales_lead_activities_inbound_reply`.
- Ověření podpisu webhooku (Svix) i posun na `odpovedel` beze změny. Funkce nikdy neodesílá e-mail.
- **Oddělené Resend klíče (least privilege, neslučovat):**
  - `RESEND_API_KEY` = `sending_access` — čtou ho jen odesílací funkce
    (`send-sales-lead-email`, `process-email-queue`, `send-partner-invoice-email`, `send-support-email`).
  - `RESEND_RECEIVING_API_KEY` = `full_access` — čte ho **jen** `sales-lead-inbound`.
  Důvod: `GET /emails/receiving/{id}` je read operace; `sending_access` klíč ji neumí
  („can only send emails"). Na stagingu to shodilo webhook na **502** ve třech Svix retry,
  aniž by vznikla jakákoli aktivita nebo duplicita.
- Při selhání Receiving API vrací funkce interní kód `receiving_api_access_failed` (502) a bezpečně
  zaloguje jen `lead_id`, `email_id`, `resend_error_name`, `resend_error_message`, `resend_status_code`.
  **Nikdy neloguje API klíč, hlavičky ani obsah e-mailu.** Chybí-li secret → `receiving_api_not_configured` (503).

## MODUL OBCHOD / LEADY — AUTOMATICKÉ PŘÍCHOZÍ ODPOVĚDI (09. 07. 2026) — ⚠️ PŘEKONÁNO, VIZ NAHOŘE

> **PŘEKONÁNO (11. 07. 2026):** níže uvedený návrh počítal s doménou `reply.onemil.cz` + vlastním MX.
> Reálné produkční řešení používá bezplatnou Resend receiving doménu `ulduuzoul.resend.app` (bez DNS
> zásahu) a je **LIVE na produkci** — viz autoritativní sekce na začátku souboru. Text níže je
> historický a už neplatí doslovně.

Karta „Odpovědělo" se dosud nezvedala sama, protože příjem odpovědí od firem nebyl nikde napojen
(`reply_received` existoval jen jako povolená hodnota v CHECK constraintu, nikde se nevytvářel).
Připraveno **jen jako soubory v PR** — nic nenasazeno, žádné produkční SQL, žádný EF deploy, žádný
DNS zásah, žádný odeslaný e-mail. Řešení = Resend inbound na **subdoméně** `reply.onemil.cz`
(kořenové MX `onemil.cz` + schránka `b2b@onemil.cz` v Active24 NEDOTČENY).

- **`send-sales-lead-email` (úprava):** `reply_to` je nově **per-lead** `reply+<lead_id>@reply.onemil.cz`
  (`from` zůstává `b2b@onemil.cz`). Metadata aktivity `email_sent` obsahují i `reply_to`.
- **Nová EF `sales-lead-inbound`** (`verify_jwt=false`): ověří podpis webhooku (Svix HMAC-SHA256,
  secret `SALES_LEAD_INBOUND_WEBHOOK_SECRET`) → vytáhne `LEAD_ID` z adresy příjemce → dedup přes
  `email_message_id` → zapíše aktivitu `reply_received` (`direction='inbound'`, subject/odesílatel/text)
  → zavolá RPC `sales_lead_mark_replied`. **Nikdy neodesílá e-mail.** Neznámá/cizí adresa nebo
  neexistující lead → `{success:true, ignored:true}` (přijme, nezapíše).
- **Nová migrace `20260709100000_sales_leads_mark_replied_rpc.sql`:** RPC
  `sales_lead_mark_replied(p_lead_id uuid, p_performed_by uuid default null)` — SECURITY DEFINER,
  EXECUTE jen `service_role`. Posune lead na `odpovedel` z `novy`/`priprava`/`schvaleni_ceka`/
  `osloveno`/`follow_up`; pokud je dál (`odpovedel`/`jednani`/`konvertovan`) nebo blokovaný
  (`navrzeny`/`odmitl`/`nekontaktovat`/`archivovan`), NEDĚLÁ nic (nikdy zpět, nikdy přeskočení,
  idempotentní). Zapisuje status_history + aktivitu `status_changed`
  (`{auto:true, trigger:'reply_received'}`). Trigger `trg_sales_lead_activities_touch_lead` zvedne
  „Poslední aktivita".
- **Před nasazením musí Pavel nastavit:** v Resendu inbound doménu `reply.onemil.cz` (verifikace +
  webhook), v DNS **MX pro `reply.onemil.cz`** (Resend host) + případné DKIM/TXT (NE měnit MX kořenové
  `onemil.cz`), v Supabase secret `SALES_LEAD_INBOUND_WEBHOOK_SECRET`.
- **Rozsah:** wallets/payments/contests/tickets/winners/Stripe/`buy_ticket_atomic`/`email_queue`
  NEDOTČENY. Produkce `xkzhjldrojjlrkezorey` i staging `dxmowysntemfqfnanxua` nedotčeny.

## MODUL OBCHOD / LEADY — OPRAVA PO PR #200 (mark_emailed z raných stavů) OVĚŘENA NA STAGINGU (06. 07. 2026)

Produkční audit po PR #200 potvrdil, že propsání do „Osloveno" bylo příliš úzké. Tlačítko
„Odeslat e-mail" v detailu leadu **není vázané na stav `schvaleni_ceka`** — člověk může odeslat
uložený koncept i u leadu ve stavu `novy` nebo `priprava`. Původní `sales_lead_mark_emailed`
(PR #200) posouvala do `osloveno` jen ze `schvaleni_ceka`, takže reálně odeslaný produkční lead
`ICONIC POINT` (`novy`) zůstal `novy` — měl `email_sent`, ale horní karta „Osloveno"
(`status IN ('osloveno','follow_up')`) ho nezapočítala.

- **Oprava:** nová migrace `supabase/migrations/20260706110000_sales_leads_mark_emailed_broaden_states.sql`
  (`CREATE OR REPLACE` na `sales_lead_mark_emailed`) posune lead na `osloveno` z kteréhokoli
  raného stavu — `novy` / `priprava` / `schvaleni_ceka`. Lead už dál v pipeline nebo v jiném/
  blokovaném stavu se NEMĚNÍ (nikdy nevrací zpět, nikdy nepřeskakuje). Zachovává
  `sales_lead_status_history` + aktivitu `status_changed` (`{auto:true, trigger:'email_sent'}`),
  grant `service_role`-only. Trigger i EF `send-sales-lead-email` beze změny.
- **Ověřeno na stagingu `dxmowysntemfqfnanxua`** (schválení Pavla pro staging): migrace
  aplikována přes `apply_migration`; test leady z `novy`/`priprava`/`schvaleni_ceka` → `osloveno`
  (`status_changed=true`, history + aktivita zapsané); lead už `osloveno` → beze změny
  (`status_changed=false`, žádný nový history řádek); žádný e-mail neodeslán; test leady uklizeny
  přes `sales_lead_delete`.
- **Testy:** `npx tsc --noEmit` 0 chyb; `npm run build` ✅ exit 0.
- **Produkce `xkzhjldrojjlrkezorey` NEDOTČENA** (žádné produkční SQL/migrace/EF deploy); Lovable
  Publish neproběhl; nedotčeno wallets/payments/contests/tickets/winners/Stripe/`buy_ticket_atomic`/
  `email_queue`.

## VIZUÁLNÍ SMĚR PRO E-MAILY A OBCHODNÍ ŠABLONY — AKTUALIZOVÁNO (07. 07. 2026)

Aktuální veřejný web OneMil používá **světlé premium/champagne provedení**, ne původní tmavou dark-only grafiku.

Podle aktuálního screenshotu webu platí pro další HTML e-maily, B2B grafiku a obchodní rozesílky:
- základ je světlé ivory/champagne pozadí, jemné šedobéžové přechody a hodně vzduchu,
- karty jsou bílé až krémové, s jemným okrajem a měkkým stínem,
- hlavní akcent je oranžová / amber (`#FF8A00`, `#FFB547`), hlavně pro CTA, nadpisy a aktivní prvky,
- text je tmavý antracit / šedomodrý, ne čistě bílý na černé,
- vizuál používá jemné linky, světlý luxusní prostor, MioCoin obrázky a champagne/oranžové detaily,
- mobilní spodní navigace je světlá, aktivní stav je oranžově orámovaný,
- header je světlý s logem OneMil vlevo a tlačítky Přihlásit / Registrovat vpravo,
- kategorie nahoře používají tenké linky a oranžové ikonky,
- nepoužívat casino/hazard/jackpot/žetony/ruletu ani podobný vizuál nebo slovník.

Důležité pravidlo: další e-mailové HTML šablony se mají vizuálně podobat aktuálnímu světlému webu `onemil.cz`, ne staré tmavé šabloně. Pokud se bude dělat nový e-mail, musí působit jako součást stejného světlého OneMil UI.

## MODUL OBCHOD / LEADY — OPRAVA PO FÁZI 6 PŘIPRAVENA JEN JAKO SOUBORY V PR (06. 07. 2026, neaplikováno/nenasazeno)

## MODUL OBCHOD / LEADY — ODPOVĚDI + DUPLICITNÍ E-MAILY (10. 07. 2026) — ✅ NASAZENO (viz sekce nahoře)

Migrace `20260710180000_sales_leads_replies_duplicate_overrides.sql`, serverová kontrola přesného
e-mailu a firemní e-mailové domény, auditovaná admin výjimka s důvodem a Edge Function
`send-sales-lead-reply` — **aplikováno/nasazeno** (odpovídání z detailu leadu je LIVE na produkci; viz
autoritativní sekce na začátku souboru; Reply-To fix v `send-sales-lead-reply` v3, PR #208). Veřejné
služby (Gmail, Seznam, Outlook, Hotmail, Centrum a další seedované domény) se jako doménová duplicita
nevyhodnocují; přesná adresa se kontroluje vždy. Odeslání oslovovacího e-mailu i odpovědi má serverový
guard `sales_lead_email_send_guard`. UI zobrazuje původní lead, první oslovení a historii výjimky.
`konvertovan` = „Spolupráce", `odmitl` = „Bez spolupráce", `nekontaktovat` beze změny.

Read-only audit produkční administrace `/admin/sales-leads` (po zprovoznění Fáze 6) potvrdil
hlášený problém: po ručním odeslání e-mailu se stav leadu nepropisoval na „Osloveno" a horní
karta zůstávala 0.

### Zjištěno (audit)
1. **EF `send-sales-lead-email` (Fáze 3C) nikdy neposouvá `sales_leads.status`.** Po úspěšném
   odeslání zapisuje pouze aktivitu `email_sent`. Horní karta „Osloveno" v `AdminSalesLeads.tsx`
   počítá `status IN ('osloveno','follow_up')` — proto zůstávala 0. Tlačítko „Odeslat e-mail"
   navíc není vázané na stav `schvaleni_ceka` — odeslání a změna stavu jsou dvě zcela oddělené
   akce.
2. **Sloupec „Poslední aktivita" čte `sales_leads.updated_at`**, které se nemění při vložení
   řádku do `sales_lead_activities` — jen při přímé UPDATE `sales_leads`. Odeslání e-mailu,
   poznámka nebo jiná aktivita se proto v „poslední aktivitě" neprojevily.
3. **Příjem odpovědí od firem není nikde napojen.** Status `odpovedel` a aktivita
   `reply_received` existují ve schématu od Fáze 1, ale v repu neexistuje žádný webhook/cron,
   který by odpověď firmy zachytil — jediná cesta je ruční přepnutí stavu adminem po přečtení
   odpovědi ve schránce `b2b@onemil.cz`.

**Klasifikace:** body 1–2 = DB/backend chyba (bezpečně opravitelná, viz níže); bod 3 = chybějící
funkcionalita, vyžaduje samostatné schválení a návrh inbound e-mail mechanismu — NEIMPLEMENTOVÁNO.

### Oprava (soubory, neaplikováno/nenasazeno)
- **Migrace `supabase/migrations/20260706100000_sales_leads_phase6_email_status_sync.sql`:**
  (a) trigger `trg_sales_lead_activities_touch_lead` (`AFTER INSERT ON sales_lead_activities` →
  `UPDATE sales_leads SET updated_at = now()`) — „Poslední aktivita" pak vždy odpovídá realitě
  bez ohledu na typ aktivity; (b) RPC `sales_lead_mark_emailed(p_lead_id uuid, p_performed_by
  uuid)` — SECURITY DEFINER, EXECUTE jen `service_role`, posune lead `schvaleni_ceka → osloveno`
  (status_history + activity `status_changed`, metadata `{auto:true, trigger:'email_sent'}`);
  na leady dál v pipeline nebo v jiném stavu nesahá (žádný návrat, žádné přeskočení).
- **EF `send-sales-lead-email`:** po zápisu `email_sent` (metadata nově obsahuje i
  `to: <příjemce>`) best-effort zavolá `sales_lead_mark_emailed` — pokud selže, úspěšně odeslaný
  e-mail se nevrací zpět, jen se nepropíše stav.
- **`SalesLeadDetailSheet.tsx`:** historie kontaktu u „E-mail odeslán" nově zobrazuje příjemce +
  předmět; přidán řádek „Poslední e-mail odeslán: …"; doplněny chybějící popisky aktivit
  `reply_received`/`email_failed`/`call_logged` (existovaly v DB od Fáze 1, ale v UI se
  zobrazovaly jako syrový kód).
- **Dokumentace:** `docs/SALES_LEADS_ADMIN_SPEC.md` §18.
- **Testy:** `npx tsc --noEmit` 0 chyb; `npm run build` ✅ exit 0.
- **Nic nenasazeno.** Žádné SQL/migrace spuštěno, žádný EF deploy, žádný Lovable Publish, žádný
  e-mail odeslán, žádná data smazána, žádný zásah do produkce ani stagingu. Nedotčeno:
  wallets/payments/contests/tickets/winners/Stripe/`buy_ticket_atomic`/`email_queue`.

## MODUL OBCHOD / LEADY — FÁZE 6 JE LIVE NA PRODUKCI (06. 07. 2026, schválení Pavla)

Fáze 6 (discovery vždy uloží použitelnou firmu + bezpečné mazání leadů) je nasazená na
**produkci `xkzhjldrojjlrkezorey`**. Nasazení proběhlo po předchozím ověření na stagingu
`dxmowysntemfqfnanxua` (viz sekce níže).

- **Migrace:** `20260705100000_sales_leads_phase6_delete_rpc.sql` aplikována na produkci přes
  `apply_migration` — `{"success": true}`.
- **RPC ověřeny na produkci:** `sales_lead_delete(uuid)` a `sales_lead_delete_bulk(uuid[])`
  existují; obě `SECURITY DEFINER`; `anon_exec=false`; `authenticated_exec=true`.
- **EF `sales-lead-discover` nasazena na produkci jako v5 ACTIVE** (v4 byla Fáze 5E). Bez auth
  headeru → `401 missing_authorization_header`.
- **Produkční počet leadů beze změny: 15 před → 15 po.** Žádný produkční testovací lead
  nevznikl.
- **Žádný discovery test na produkci nebyl spuštěn** (jen 401-boundary smoke bez JWT). Žádný
  e-mail nebyl odeslán.
- **Lovable Publish neproběhl.**
- Nedotčeno: wallets, payments, contests, tickets, winners, Stripe, `buy_ticket_atomic`,
  `email_queue`/`process-email-queue`.

## MODUL OBCHOD / LEADY — FÁZE 6 ZPROVOZNĚNA POUZE NA STAGINGU (06. 07. 2026, schválení Pavla)

PR #197 mergnut do `main` (merge commit `087a84785b3cc77a30c95da84bb85268d2a59b9a`). Aplikováno
POUZE na **staging `dxmowysntemfqfnanxua`**. Produkce `xkzhjldrojjlrkezorey` NEDOTČENA, Lovable
Publish neproběhl.

- **Migrace:** `20260705100000_sales_leads_phase6_delete_rpc.sql` aplikována na staging přes
  `apply_migration` — `{"success": true}`.
- **RPC ověřeny:** `sales_lead_delete(uuid)` a `sales_lead_delete_bulk(uuid[])` existují; obě
  `SECURITY DEFINER`; `anon_exec=false`; `authenticated_exec=true`.
- **EF `sales-lead-discover` nasazena na staging jako v5 ACTIVE.** Bez auth headeru → `401
  missing_authorization_header`.
- **Test discovery bez e-mailu (`sales_lead_propose`):** lead vznikl se `status='navrzeny'`,
  `contact_email=NULL`, `email_verified_by_admin=false`, bez `proposed_contact_email`.
