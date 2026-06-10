# Dávkové výplaty provizí OneMil → affiliate / obchodník — technický návrh

> **Stav:** NÁVRH. Žádná implementace nasazená, žádná migrace aplikovaná. Samostatná pracovní větev. Produkce nedotčena.
> **Banka:** Air Bank. **Formát:** ABO (`.kpc`) — viz „Air Bank / ABO" níže.
> **Nahrazuje:** předchozí návrh `00a52bc0` (ruční reference/VS/datum) — ten se NEAPLIKUJE.

## 1. Princip

Výplaty řeší **systém automaticky**; admin jen kontroluje a fyzicky odesílá peníze ve své bance.

- Systém generuje: doklad/samofakturu, číslo dokladu, VS/referenci, PDF, e-maily, platební dávku, **Air Bank ABO export**.
- Admin: zkontroluje schválené provize → vybere k proplacení → vytvoří dávku → stáhne hromadný příkaz (`.kpc`) → vloží do Air Bank → odešle platby → **označí celou dávku jako zaplacenou**.
- Tlačítko „Označit jako vyplacené" je **jen na úrovni dávky**, nikdy na jednotlivé provizi.
- Admin **NEzadává** ručně datum platby, VS ani referenci.

## 2. Stavový automat

**Provize (`affiliate_commissions.status`):**
`calculated → approved → payout_document_created → ready_to_pay → in_payment_batch → paid`

**Dávka (`affiliate_payout_batches.status`):**
`created → exported → paid` (+ `cancelled`)

| Pavlův stav | Realizace |
|-------------|-----------|
| `payment_batch_created` | batch `created`, provize `in_payment_batch` |
| `bank_export_generated` | batch `exported`, `bank_export_url` vyplněn |
| `paid` | batch `paid` → propíše provizím `status='paid'`, `paid_at`, `paid_by` |
| `payment_confirmation_sent` | `affiliate_commissions.confirmation_sent_at` (ne samostatný status) |

## 3. DB model (Fáze A — soubor `20260609_affiliate_payouts_phase_a.sql`, NEAPLIKOVÁNO)

- **`affiliate_commissions`** rozšíření: status CHECK +`payout_document_created`/`ready_to_pay`/`in_payment_batch`; sloupce `payout_document_id`, `payout_batch_id`, `paid_by`, `confirmation_sent_at`.
- **`affiliate_payout_documents`** — doklad 1:1 k provizi: `document_number` (UNIQUE, formát `APD-YYYY-000001`), `document_type` (`commission_statement`/`self_billed_tax_invoice`), částky, `pdf_url`, `email_status`, `affiliate_email`, `accounting_email`.
- **Snapshot příjemce na dokladu:** `recipient_name`, `recipient_email`, `recipient_ico`, `recipient_vat_id`, `recipient_billing_address`, `recipient_is_vat_payer`, `recipient_subject_type`.
- **`affiliate_payout_batches`** — dávka: `batch_number` (UNIQUE, formát `APB-YYYY-000001`), `status`, `bank='airbank'`, `bank_export_format='abo_kpc'`, `bank_export_encoding='windows-1250'`, `bank_export_line_endings='crlf'`, `bank_export_url`, `due_date`, `payer_account`, `payer_bank_code='3030'`, součty, `created_by`, `marked_paid_by/at`.
- **`affiliate_payout_batch_items`** — položky: `commission_id` (UNIQUE), `amount_czk`, **snapshot** `recipient_account`/`recipient_bank_code`/`recipient_name`, systémový `variable_symbol` (CHECK: číslice, max 10), `payment_message` (max 35 znaků), `constant_symbol='0000'`, volitelný `specific_symbol`.
- **Sekvence:** `affiliate_payout_document_seq`, `affiliate_payout_batch_seq`.
- **Storage (PRIVÁTNÍ):** `affiliate-payout-docs`, `affiliate-bank-exports` (citlivé — nikdy public).
- **RLS:** jen admin/superadmin (`is_admin()`) na všech 3 tabulkách + storage objektech.

## 4. Air Bank / ABO formát (ověřeno + co potvrdit)

**Ověřeno (airbank.cz):** Air Bank importuje hromadné tuzemské CZK platby ve **formátu ABO**, přípona **`.kpc`**, znaková sada **Windows-1250**, max **50 KB**, jen přes internetové bankovnictví. Záznamy ukončeny **CR+LF**.

**ABO struktura (kanonická, dle bankovních specifikací):** věta **1501** = příkaz k úhradě; **částky v 1/100 (haléře)**, numerické, doplnění zleva nulami; pole: **číslo účtu příkazce/příjemce, kód banky, částka, VS, KS, SS, datum splatnosti (ne do minulosti, max +364 dní)**.

**Export musí obsahovat** (Pavlův seznam): číslo účtu, kód banky, částka, měna (CZK), VS, zpráva pro příjemce, datum splatnosti.

> ⚠️ **Před produkčním použitím Fáze D:** ABO `.kpc` struktura je dostatečně ověřená pro návrh, ale výsledný export musí projít importním testem v Air Bank internetovém bankovnictví. Datum splatnosti a případné použití KS/SS ještě potvrdit s účetní / Air Bank.

Zdroje: [Air Bank — Import hromadných plateb](https://www.airbank.cz/co-vas-nejvic-zajima/import-hromadnych-plateb/), [Air Bank — tech. specifikace (PDF)](https://www.airbank.cz/file-download/technicke-pozadavky-a-specifikace-hromadnych-plateb-a-export-vypisu.pdf), [ČSAS — ABO formát pro programátory (PDF)](https://www.csas.cz/banka/content/inet/internet/cs/ABO_format.pdf), [CREDITAS — popis ABO/KPC (PDF)](https://www.creditas.cz/files/popis-formatu-abo-kpc-pro-platebni-prikazy-172021-revize.pdf).

## 5. Edge Functions / RPC (Fáze B–E)

| Jednotka | Fáze | Účel | Reuse |
|----------|------|------|-------|
| `create-affiliate-payout-document` (EF/RPC) | C | vznik dokladu + `document_number` (sekvence) | — |
| `generate-affiliate-payout-pdf` (EF) | C | PDF (pdf-lib) → bucket `affiliate-payout-docs` (signed URL) | `generate-partner-invoice-pdf` (pdf-lib+fontkit+QRCode) |
| `send-affiliate-payout-document-email` (EF) | C | `email_queue` insert (affiliate + účetní), `attachment_url`=PDF | `send-partner-invoice-email`, `process-email-queue` |
| `admin_set_affiliate_commission_status` (RPC) | B | zúžení starého RPC jen na `calculated → approved`; `approved → paid` vrací `invalid_transition` | paid smí vzniknout jen přes dávku |
| `create-affiliate-payout-batch` (RPC) | B | z vybraných `ready_to_pay` → batch + items + VS, provize→`in_payment_batch` | návrh v `20260610_affiliate_payouts_phase_b.sql`, NEAPLIKOVÁNO |
| `generate-affiliate-bank-export` (EF) | D | ABO `.kpc` (Windows-1250) → bucket `affiliate-bank-exports`, batch→`exported` | — |
| `mark-affiliate-payout-batch-paid` (RPC) | B | batch→`paid`, provize→`paid`, `marked_paid_by/at` (atomicky, FOR UPDATE) | návrh v `20260610_affiliate_payouts_phase_b.sql`, NEAPLIKOVÁNO |
| `cancel-affiliate-payout-batch` (RPC) | B | jednoduché zrušení dávky `created` → `cancelled`, provize zpět `ready_to_pay` | návrh v `20260610_affiliate_payouts_phase_b.sql`, NEAPLIKOVÁNO |
| `send-affiliate-payment-confirmation` (EF) | E | potvrzení obchodníkovi + souhrn účetní, `confirmation_sent_at` | `email_queue` |

**Číslování/VS:** sekvence v DB → `document_number = 'APD-YYYY-' || lpad(nextval, 6)`, `batch_number = 'APB-YYYY-' || lpad(nextval, 6)`, `VS` generuje systém jako numerický max 10 znaků. Nikdy admin.

**E-mail infra (ověřeno):** `email_queue(email, subject, body, attachment_url, status, sent_at)` + worker `process-email-queue`. Účetní e-mail: zatím **nepotvrzeno** (`COMPANY_CONTEXT.md`: Veronika Engeová / info@onemil.cz) → přidat `settings.accounting_email`.

## 6. UI (Fáze B+)

- **`/admin/affiliate-commissions`**: checkboxy pro výběr `ready_to_pay` provizí + tlačítko **`Vytvořit platební dávku`**. Z řádku provize se ruční „paid" odebere.
- **`/admin/affiliate-payouts`** (nová): seznam dávek (číslo, stav, součet, počet, datum, kdo).
- **`/admin/affiliate-payouts/:id`** (detail Fáze B): položky (příjemce, účet, VS, částka) + tlačítko **`Označit dávku jako zaplacenou`** (dialog: „Tato akce neposílá peníze. Pouze potvrzuje, že platba byla provedena v bance."). PDF, e-maily a Air Bank export jsou mimo Fázi B.

## 7. Testy

- **Cílený spec** `tests/e2e/40-affiliate-payouts.spec.ts` (staging-only, gated `E2E_AFFILIATE_PAYOUTS=1`): vytvoření dávky z `ready_to_pay`, systémový VS, `mark-paid` propíše provizím `paid` + audit. Bez PDF, bez e-mailů, bez Air Bank exportu.
- **Rozšířit spec 39**: tlačítko paid NENÍ na provizi; je na dávce.
- **Staging Full E2E** jako finální regrese (po cíleném zeleném).
- **Produkce** až po výslovném schválení Pavla + postcheck.

## 8. Fázování (nic nenasazovat bez schválení)

| Fáze | Obsah | Výstup |
|------|-------|--------|
| **A** | DB základ (tabulky, sloupce, sekvence, buckety, RLS) | `20260609_affiliate_payouts_phase_a.sql` (✅ připraveno) |
| **B** | zúžení starého paid RPC + `create-batch` + `mark-paid` RPC + volitelný `cancel-batch` + UI výběr/detail dávky + paid jen na dávce | návrh připraven: `20260610_affiliate_payouts_phase_b.sql`, nové admin stránky a gated E2E; NEAPLIKOVÁNO |
| **C** | doklady: `create-document` + PDF + e-maily (obchodník+účetní), stav `payout_document_created` | |
| **D** | Air Bank ABO `.kpc` export + `Stáhnout hromadný příkaz` | po potvrzení přesného formátu |
| **E** | `payment_confirmation_sent` (potvrzení po zaplacení) | |

## 9. Rizika

| Riziko | Poznámka |
|--------|----------|
| **ABO formát Air Bank** | Základní ABO `.kpc` struktura je ověřená pro návrh. Před produkčním použitím musí projít importní test v Air Bank. |
| **Samofakturace (legal)** | self-billing vyžaduje souhlas obchodníka → zařazeno do podmínek affiliate/partner programu (právní review). |
| **Atomicita `mark-paid`** | batch + items + provize v jedné transakci, FOR UPDATE. |
| **Citlivá data** | bankovní exporty + doklady = PRIVÁTNÍ buckety + signed URL, admin-only RLS. |
| **Idempotence e-mailů** | `email_status` + `email_queue`, neposlat 2×. |
| **Zrušení dávky** | `cancelled` → provize zpět `ready_to_pay` (jen před `exported`/`paid`). |
| **Účetní e-mail** | nepotvrzený → `settings.accounting_email` + potvrdit s Veronikou Engeovou. |
| **VS délka** | max 10 číslic, systémově generovaný; admin ho nikdy nezadává ručně. |
| **Měna** | jen CZK tuzemské (ABO). Zahraniční/EUR = mimo rozsah. |

## 10. Co musí potvrdit účetní / právník

1. **Účetní (Veronika Engeová):** typ dokladu (samofaktura vs. výplatní avízo), náležitosti dokladu, účetní e-mail pro kopie, číselná řada dokladů.
2. **Účetní / Air Bank:** datum splatnosti, KS/SS pravidla a produkční importní test ABO `.kpc`.
3. **Právník:** znění souhlasu se samofakturací v podmínkách affiliate/partner programu; DPH režim provize (plátce/neplátce).

## Sign-off checklist před implementací

Tento checklist je schválený pracovní podklad. Slouží k potvrzení účetních, právních a bankovních bodů před aplikací Fáze A na staging a před zahájením Fáze B. Nejde o finální právní ani daňové stanovisko.

### 1. Účetní — pracovní rozhodnutí pro návrh systému

Pro návrh systému použít tento model:

- neplátce DPH: `Vyúčtování provize`,
- plátce DPH: `Faktura – daňový doklad, vystaveno zákazníkem`,
- doklad vzniká na základě affiliate / partner podmínek a souhlasu se samofakturací,
- doklad se vytvoří po schválení provize,
- doklad se ihned odešle obchodníkovi / affiliate a kopie účetnímu,
- účetní e-mail nebude hardcoded, bude přes `settings.accounting_email`,
- číselná řada bude oddělená od běžných partner faktur:
  - payout doklady: `APD-YYYY-000001`,
  - payout dávky: `APB-YYYY-000001`,
- u neplátce nepoužívat text `DPH 0 %`, ale text: `Příjemce není plátce DPH, DPH se neuplatňuje.`,
- u plátce DPH použít daňový doklad s textem `vystaveno zákazníkem`,
- systém musí ukládat snapshot režimu příjemce při vytvoření dokladu.

Účetní musí ještě finálně potvrdit:

- [ ] přesnou podobu dokladu,
- [ ] účtování provize,
- [ ] účetní e-mail,
- [ ] finální náležitosti PDF.

### 2. Právník — pracovní rozhodnutí pro návrh systému

Pro návrh systému počítat s tím, že:

- souhlas se samofakturací bude součástí affiliate / partner podmínek,
- bezpečnější je mít samostatné potvrzení / checkbox pro samofakturaci,
- příjemce odpovídá za vlastní daně, odvody a registrační povinnosti,
- systém musí rozlišovat:
  - nepodnikatel,
  - OSVČ neplátce,
  - OSVČ plátce,
  - firma neplátce,
  - firma plátce,
- u plátce DPH musí být DIČ a souhlas se samofakturací,
- bez souhlasu se samofakturací nesmí systém vystavit daňový doklad jménem příjemce.

Právník musí ještě finálně potvrdit:

- [ ] přesné znění podmínek,
- [ ] zda stačí obecný souhlas s podmínkami, nebo samostatný checkbox,
- [ ] zda a jak pustit nepodnikatele do opakovaných provizí.

### 3. Air Bank / ABO export — ověřeno z oficiální specifikace

Air Bank potvrzuje:

- import hromadných plateb je přes internetové bankovnictví,
- pro tuzemské CZK příkazy používá ABO formát,
- soubor má příponu `.kpc`,
- soubor je ve znakové sadě Windows-1250,
- maximální velikost souboru je 50 KB,
- soubor slouží pro jednorázové tuzemské příkazy k úhradě z korunových účtů v korunách.

Oficiální specifikace uvádí strukturu:

- `UHL1`,
- hlavička účetního souboru,
- hlavička skupiny,
- účetní položky,
- konec skupiny,
- konec účetního souboru.

Hlavička účetního souboru:

- začátek účetního souboru: `1`,
- druh dat: `1501`,
- kód banky: `3030`,
- konec řádku: `CR LF`.

Hlavička skupiny pro jeden účet:

- začátek skupiny: `2`,
- účet plátce,
- celková částka skupiny v haléřích,
- datum splatnosti ve formátu `DDMMRR`,
- konec řádku: `CR LF`.

Účetní položka pro debet z jednoho účtu:

- číslo účtu příjemce,
- částka v haléřích,
- variabilní symbol,
- kód banky příjemce,
- konstantní symbol, případně `0000`,
- specifický symbol volitelně,
- zpráva pro příjemce max 35 znaků,
- konec řádku: `CR LF`.

Poznámky k importu:

- Air Bank uvádí, že platby s datem splatnosti v minulosti provede v nejbližším možném čase.
- Při importu se dávka nahraje v internetovém bankovnictví v sekci Placení / Hromadné platby.
- Po nahrání se dávka potvrzuje v internetovém nebo mobilním bankovnictví.

Pro implementaci:

- použít ABO `.kpc`,
- použít Windows-1250,
- používat CRLF,
- částky zapisovat v haléřích,
- VS generovat systémově jako numerický max 10 znaků,
- konstantní symbol zatím `0000`,
- specifický symbol nepoužívat, pokud účetní neřekne jinak,
- zprávu pro příjemce držet do 35 znaků,
- datum splatnosti generovat jako dnešní datum nebo nejbližší pracovní den podle pravidel, která ještě potvrdí účetní / Air Bank.

### 4. Technické dopady

- **Fáze A:** může pokračovat, pokud DB model zůstane obecný pro `document_type`, snapshoty, doklady, dávky a položky.
- **Fáze B:** může pokračovat s minimem: příjemce, účet, banka, částka, systémový VS, stav dávky. Není nutné čekat na finální PDF šablonu.
- **Fáze C:** blokuje finální účetní/právní potvrzení dokladu a textů.
- **Fáze D:** Air Bank formát je už dostatečně ověřený pro návrh, ale před produkčním použitím musí být export otestovaný importem v Air Bank.
- **Fáze E:** závisí na e-mailové šabloně a účetním e-mailu.

### 5. Doporučení podle fází

- **Před Fází A:** potvrdit, že DB model je dostatečně obecný: doklady, dávky, položky, snapshoty, sekvence a privátní storage. Fázi A lze připravovat jako staging migraci až po Pavlově schválení.
- **Před Fází B:** potvrdit minimální bankovní údaje pro `ready_to_pay`; není nutné čekat na finální PDF šablonu.
- **Před Fází C:** počkat na finální účetní/právní podobu dokladu a textů.
- **Před Fází D:** použít ověřený Air Bank ABO `.kpc` návrh, ale před produkčním použitím provést importní test v Air Bank.
- **Před Fází E:** potvrdit e-mailové šablony a finální účetní e-mail.

### 6. Zdroje pro ověření

- [Air Bank — Import hromadných plateb](https://www.airbank.cz/co-vas-nejvic-zajima/import-hromadnych-plateb/)
- [Air Bank — technická specifikace hromadných plateb a exportu výpisů](https://www.airbank.cz/file-download/5092-technicke-pozadavky-a-specifikace-hromadnych-plateb-a-export-vypisu.pdf)
- [Zákon o účetnictví č. 563/1991 Sb.](https://www.zakonyprolidi.cz/cs/1991-563)
- [Zákon o DPH č. 235/2004 Sb.](https://www.zakonyprolidi.cz/cs/2004-235)

## 11. HANDOFF — pokračování v novém chatu / Codexu (10. 06. 2026)

**Fáze A i Fáze B jsou pouze reviewable návrh v samostatné větvi. Žádná migrace nebyla aplikována na staging ani produkci. Nic nebylo nasazeno.**

### Co je hotovo
- Fáze A návrh: commit **`6711e648`**, později doplněno podle sign-off odpovědí. Soubory:
  - `supabase/migrations/20260609_affiliate_payouts_phase_a.sql` (DB základ — **NEAPLIKOVÁNO** na staging ani produkci)
  - `docs/affiliate-payouts/DESIGN.md` (tento dokument)
- Fáze B návrh: lokálně připravené reviewable soubory:
  - `supabase/migrations/20260610_affiliate_payouts_phase_b.sql` (RPC `create_affiliate_payout_batch`, `mark_affiliate_payout_batch_paid`, `cancel_affiliate_payout_batch` — **NEAPLIKOVÁNO**)
  - `src/pages/AdminAffiliateCommissions.tsx` (výběr `ready_to_pay`, bez per-row paid tlačítka)
  - `src/pages/AdminAffiliatePayouts.tsx`
  - `src/pages/AdminAffiliatePayoutDetail.tsx`
  - routing/nav pro `/admin/affiliate-payouts`
  - gated E2E specy `tests/e2e/39-admin-affiliate-commissions.spec.ts` a `tests/e2e/40-affiliate-payouts.spec.ts`
- Ověřeno: Air Bank = ABO `.kpc` (Windows-1250, 50 KB, CRLF, částky v haléřích); reuse `generate-partner-invoice-pdf` + `email_queue`/`process-email-queue`; číslování `APD-YYYY-000001` / `APB-YYYY-000001`.

### Co je ZAKÁZÁNO
- Aplikovat jakoukoli migraci (staging i produkce) bez výslovného schválení Pavla.
- Aplikovat migraci `20260609_affiliate_commission_payout_evidence.sql` (NAHRAZENA, mrtvá).
- Lovable Publish, deploy EF, produkční změny.
- Smazat produkční testovací řádek `dddddddd-dddd-dddd-dddd-dddddddddddd` (stav `paid`).
- Měnit hlavní roadmapu, wallet, soutěže, tikety, Stripe, Bob, Sofinity, Partner Offers, `buy_ticket_atomic`.
- Použít bankovní export v produkci bez importního testu v Air Bank.

### Kde pokračovat + další bezpečný krok
1. **Sign-off** (účetní/Air Bank/právník — viz §10 a checklist) — hlavně finální podoba dokladu, účetní e-mail, právní texty a pozdější Air Bank import test.
2. Po Pavlově schválení aplikovat **nejdřív Fázi A na staging** + postcheck.
3. Poté aplikovat / ověřit Fázi B na stagingu: RPC `create_affiliate_payout_batch` + `mark_affiliate_payout_batch_paid` + UI výběr provizí / `/admin/affiliate-payouts` / detail dávky + tlačítko „Označit dávku jako zaplacenou" (jen na dávce). BEZ PDF/banky/e-mailů/exportu.

### Testovací strategie
- Cílený spec `tests/e2e/40-affiliate-payouts.spec.ts` (staging-only, gated `E2E_AFFILIATE_PAYOUTS=1`): create-batch z `ready_to_pay`, systémový VS, detail dávky, `mark-paid` propíše provize `paid` + audit. Bez PDF, e-mailů a Air Bank exportu.
- Rozšířit spec 39: paid jen na dávce, ne na provizi.
- Pak staging Full E2E (finální regrese). Produkce po schválení.

### Otevřené otázky pro účetní / Air Bank
- Air Bank `.kpc` export: před produkčním použitím provést importní test v internetovém bankovnictví.
- Typ dokladu: samofaktura vs. výplatní avízo; náležitosti; číselná řada.
- Účetní e-mail OneMil (zatím nepotvrzen; default info@onemil.cz / V. Engeová).
- DPH režim provize (plátce/neplátce) na dokladu.
