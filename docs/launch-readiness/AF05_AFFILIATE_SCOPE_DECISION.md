# AF05 — Affiliate scope rozhodnutí (první veřejný test)

> Podklad pro rozhodnutí Pavla: patří Affiliate program do prvního veřejného testu, nebo se odloží?
> Read-only audit + dokumentační návrh. Žádný kód, SQL, CMS, Stripe, deploy. Vytvořeno 16. 06. 2026.
> Souvisí s [OWNER_LEGAL_DECISION_SHEET.md](./OWNER_LEGAL_DECISION_SHEET.md) (položka AF05).

---

## 1. Co Affiliate aktuálně znamená v systému (stav teď)

**Affiliate v2 je technicky hotový a LIVE v produkci** (rollout 12.06.); deferral je čistě scope/provozní rozhodnutí, ne technický blocker.

### Veřejné / zákaznické vstupní body
- **Patička (Footer):** odkazy na `/influencer`, `/influencer/how-to-earn`, `/influencer/register`, `/affiliate/login` → affiliate je **veřejně dostupný a registrovatelný** i bez aktivní propagace.
- Influencer referral odkaz `https://onemil.cz/?ref=CODE`; firemní odkaz `https://onemil.cz/partner/register?via=CODE`.
- `/partner/invite` — veřejné potvrzení B2B company leadu (token z e-mailu).

### Affiliate uživatelská oblast
- `/affiliate/login`, `/affiliate/register`, `/affiliate/dashboard` (sekce Influencer / Obchodník / Profil).
- `/influencer`, `/influencer/how-to-earn`, `/influencer/register`, `/influencer/messages`; `/influencer/dashboard` → redirect na `/affiliate/dashboard`.

### Admin oblast
- `/admin/referrals`, `/admin/influencers`, `/admin/affiliate-accounts`, `/admin/company-leads`, `/admin/affiliate-commissions`, `/admin/affiliate-payouts` + detail `/admin/affiliate-payouts/:batchId`.

### Edge Functions
- `create-affiliate-company-lead`, `confirm-affiliate-company-lead`, `approve-affiliate-company-lead`, `create-affiliate-payout-document`, `generate-affiliate-bank-export`, `get-pending-partner-registrations`, `approve-partner-registration`.

### Testy / specy (staging, zelené)
- Affiliate/influencer/company-lead: spec 13, 14, 15, 22, 23, 25, 26, 27, 28, 29, 30, 34, 35, 36, 37, 46, 55.
- Provize + payouty: spec 39 (commissions), 40 (payouts), 41 (payout documents), 42 (bank export) — zelené v cíleném run `27372767070` (40:4, 41:5, 42:6). **Ve standardním Full E2E se 39–42 SKIPují** (chybí payout secrets).

### Payout / Stripe závislosti
- **Affiliate payouty (OneMil → obchodník/influencer) NEJSOU přes Stripe** — používají **Air Bank `.kpc` ABO export** + privátní bucket `affiliate-bank-exports` + e-maily přes RESEND + `accounting_email`.
- **Affiliate/B2B provize vzniká VÝHRADNĚ z placených `partner_invoices`** (B2B partner billing), nikdy ze zákaznických Stripe plateb. → affiliate provize nezávisí na zákaznickém Stripe checkoutu.
- **Pozn.:** zákaznická invite/referral odměna (C23, wallet credit) JE závislá na zákaznické Stripe platbě (`create_referral_reward_from_payment`) — to je ale samostatná „pozvi přítele" mechanika, ne affiliate program; je `BLOCKED-BY-PAY01–PAY03` bez ohledu na AF05.

---

## 2. Varianta A — Affiliate ZAHRNOUT do prvního veřejného testu

- **Dopad:** aktivně onboardovat influencery/obchodníky; jejich referral odkazy přivádějí zákazníky; B2B company lead flow běží naživo; admin spravuje schvalování, provize a payout dávky.
- **Rizika:**
  - Payout flow pohybuje **reálnými penězi** (OneMil → obchodník přes Air Bank) — během „testu" vyšší riziková plocha.
  - Otevřené body payoutů: potvrdit produkční payout secrets / `accounting_email`, reálný plátcovský účet, nahradit Botanic `[TEST DATA]` reálnými údaji.
  - Provize se generuje jen z **placených `partner_invoices`** → vyžaduje reálnou B2B fakturaci (sama o sobě plně neprovětraná naživo).
- **Co ještě otestovat před A:** plný payout E2E s reálným Air Bank importem (proběhl test 1 Kč), reálné doručení `accounting_email`, generace provize z reálně zaplacené partner faktury, potvrzení payout secrets na produkci, nahrazení Botanic `[TEST DATA]`.
- **Doporučení k A:** širší rozsah, více reálných peněz a více k ověření → vhodné až po prvním veřejném testu jádra.

## 3. Varianta B — Affiliate ODLOŽIT mimo první veřejný test

- **Dopad:** první veřejný test se soustředí na **jádro zákaznického flow** (registrace → top-up → tikety → soutěž → výhra → peněženka/MioCoin → zprávy) + uplatnění partnerské odměny. Affiliate program zůstává živý v kódu, ale **aktivně se neonboarduje/nepropaguje**.
- **Rizika:**
  - Patička stále odkazuje na `/influencer` a `/affiliate/login` → zvídavý uživatel se může zaregistrovat jako affiliate; čekající registrace by jen ležely neschválené (admin je prostě neschválí). Login gating affiliate oblast izoluje.
  - Volitelné zpřísnění: skrýt affiliate/influencer odkazy v patičce (drobná kódová změna — samostatné schválení; není nutné, gating to izoluje).
- **Co ještě otestovat před B:** nic navíc — affiliate je staging-zelený + live v kódu; pro první test se jen aktivně neonboarduje.
- **Doporučení k B:** čistší, nízkorizikový první veřejný test; affiliate zůstává připravený a zapne se později.

---

## 4. Doporučení (finální rozhodnutí = Pavel)

**Doporučená varianta: B — Affiliate ODLOŽIT mimo první veřejný test.**

Důvody:
1. **Reálné peníze:** affiliate payouty posílají skutečné prostředky (OneMil → obchodník) a mají otevřené body (payout secrets, reálný plátcovský účet, Botanic `[TEST DATA]` → reálná data, provize z reálně zaplacené partner faktury) — nežádoucí riziko během prvního veřejného testu.
2. **Nezávislost jádra:** hlavní hodnota prvního testu je zákaznická smyčka + platby (Stripe), což je na affiliate nezávislé.
3. **Nulové náklady odkladu:** affiliate je už technicky hotový, staging-ověřený a live v kódu → odklad nic nestojí a kdykoli se zapne.
4. **Jediný volitelný follow-up:** skrýt affiliate/influencer odkazy v patičce, aby během testu nevznikaly nahodilé registrace (drobná kódová změna, samostatné schválení; není blokující).

> **Rozhodnutí Pavla:** `[ ] A — zahrnout` / `[ ] B — odložit (doporučeno)` / `[ ] odložit rozhodnutí`
> Pokud B a chceš skrýt footer odkazy: `[ ] ano, připravit skrytí footer affiliate/influencer odkazů (samostatné schválení kódové změny)` / `[ ] ne, ponechat`

---

## 5. Co je blocked-by-Stripe a NEŘEŠÍ se zde
- PAY01–PAY04 (Stripe checkout/webhook/routy/fail).
- C23 zákaznická invite reward (wallet credit) — `BLOCKED-BY-PAY01–PAY03`.
- Plný partner invoice flow z reálných plateb (P13) — vyžaduje reálnou partner paid aktivitu.

Viz [PAY01_PAYMENTS_TEST_MODE_NOTE.md](./PAY01_PAYMENTS_TEST_MODE_NOTE.md).
