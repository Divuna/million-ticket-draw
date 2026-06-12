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

## 12. AKTUALNI STAV PO STAGING OVERENI (10. 06. 2026)

Faze A+B+C jsou aplikovane a overene pouze na staging Supabase projektu `dxmowysntemfqfnanxua`. Produkce `xkzhjldrojjlrkezorey` je netknuta. Nebyl proveden web deploy, Lovable Publish ani full E2E.

### Dulezite commity

- Faze A uprava: `3b2ba8a65c7480636045440f15998a5d79abc082`
- Faze B navrh: `ab44ffa04b54ab405ef17de502e5ef986f710c98`
- Faze B cleanup: `74cf175fea8f514001728160ec4f044beaddc54b`
- temp table patch: `0915b03e0d3dc8a235e4ff12aba079875557ef4b`
- CI workflow inputy: `1bcf3221829f238a94ae8534aeeda495af8dfea0`
- test email fix: `2b9b6b07c549fb2f26dcab22f95c9967f68284a5`
- cookie consent fix: `7e061f1b6737435939eb3d1a6250301bccd7fb06`
- Faze C worker fix: `6f998677c4fc5ccb085f9e511d625c58579d6f62`

### Overene testy

- spec 40 run `27258741085` - 4 passed
- spec 39 run `27270797466` - 2 passed
- staging UI smoke run `27271124754` - 2 passed
- `tests/e2e/41-affiliate-payout-documents.spec.ts` - 4 passed

### Faze A+B staging stav

- `/admin/affiliate-commissions` ma davkove workflow.
- Per-row `Oznacit jako vyplacene` je odstraneno.
- Eligible provize maji checkbox a akci `Vytvorit platebni davku`.
- `/admin/affiliate-payouts/:id` ma detail davky a tlacitko `Oznacit davku jako zaplacenou`.
- Akce `Oznacit davku jako zaplacenou` pouze eviduje platbu provedenou v bance; neposila penize.
- Pavel rucne overil davku `APB-2026-000016` na `123,45 Kc`; puvodni provize uz nejde znovu zaradit do dalsi davky.

### Faze C staging stav

- Aplikovana migrace `20260610140000_affiliate_payouts_phase_c.sql`.
- `affiliate_payout_documents` ma nove PDF/e-mail auditni sloupce.
- `email_queue` ma nove sloupce pro privatni storage prilohy a `attachment_required`.
- Existuji RPC `prepare_affiliate_payout_document` a `finalize_affiliate_payout_document`.
- Edge Function `create-affiliate-payout-document` je nasazena na staging, verze 1.
- Edge Function `process-email-queue` je nasazena na staging, verze 2.
- `settings.accounting_email = accounting-test@onemil.test`.
- Cleanup testu 41 je cisty: `email_queue`, `affiliate_accounts`, `affiliate_payout_documents` pro spec41 = 0.
- `process-email-queue` uz neinicializuje Resend pri startu funkce; required PDF priloha bez souboru skonci rizene jako `failed`.

### Zakazy a dalsi bezpecny krok

- Produkci `xkzhjldrojjlrkezorey` zatim nespoustet.
- Nedelat Lovable Publish, web deploy ani produkcni rollout.
- Nemazat produkcni testovaci radek `dddddddd-dddd-dddd-dddd-dddddddddddd`.
- Neaplikovat starou migraci `20260609_affiliate_commission_payout_evidence.sql`.
- Dalsi krok: Faze D / Air Bank export, nejdriv pouze audit a navrh, bez implementace.
## 13. PRODUKČNÍ ROLLOUT PLÁN FÁZE A+B — OPRAVENÝ ZÁVĚR

Produkční rollout Fáze A+B se nesmí dělat jako samotná DB změna bez nasazení aktuálního UI.

### Důvod

- Staré produkční UI může pořád zobrazovat per-row `Označit jako vyplacené`.
- Fáze B ale staré RPC `admin_set_affiliate_commission_status` pro přechod `approved → paid` už blokuje.
- Výsledkem by bylo, že staré produkční ruční paid flow začne vracet chybu.

### Doporučený postup

1. Vyhlásit krátké produkční okno.
2. Aplikovat DB Fázi A: `supabase/migrations/20260609_affiliate_payouts_phase_a.sql`.
3. Aplikovat DB Fázi B: `supabase/migrations/20260610_affiliate_payouts_phase_b.sql`.
4. Aplikovat temp-table guard: `supabase/migrations/20260610120000_affiliate_payouts_phase_b_temp_table_guard.sql`.
5. Ihned nasadit aktuální UI / Lovable Publish z větve s dávkovým workflow.
6. Udělat produkční smoke.

### Storage postcheck

Správné názvy privátních storage bucketů jsou:

- `affiliate-payout-docs`
- `affiliate-bank-exports`

Postcheck:

```sql
select id, name, public
from storage.buckets
where id in (
  'affiliate-payout-docs',
  'affiliate-bank-exports'
);
```

Očekávání: oba buckety existují a `public = false`.

### Zakázané

- Neaplikovat `supabase/migrations/20260609_affiliate_commission_payout_evidence.sql`.
- Nedělat samostatný DB rollout bez UI deploye.
- Nedělat produkční test reálné dávky bez výslovného schválení Pavla.

## 14. FAZE C - PDF DOKLADY A E-MAILY NA STAGINGU

Faze C je aplikovana a overena pouze na stagingu `dxmowysntemfqfnanxua`. Produkce `xkzhjldrojjlrkezorey` je netknuta. Nebyl proveden web deploy, Lovable Publish ani full E2E.

### Aktualni staging stav

- DB migrace `20260610140000_affiliate_payouts_phase_c.sql` aplikovana na staging.
- `affiliate_payout_documents` ma nove PDF/e-mail auditni sloupce.
- `email_queue` ma nove sloupce pro privatni storage prilohy a `attachment_required`.
- Existuji RPC:
  - `prepare_affiliate_payout_document`
  - `finalize_affiliate_payout_document`
- Edge Function `create-affiliate-payout-document` je nasazena na staging, verze 1.
- Edge Function `process-email-queue` je nasazena na staging, verze 2.
- `settings.accounting_email = accounting-test@onemil.test`.
- Test `tests/e2e/41-affiliate-payout-documents.spec.ts` prosel: `4 passed`.
- Cleanup testu 41 cisty:
  - `email_queue`: 0 zbytku pro spec41
  - `affiliate_accounts`: 0 zbytku pro spec41
  - `affiliate_payout_documents`: 0 zbytku pro spec41

### Oprava behem staging testu

- `process-email-queue` uz neinicializuje Resend pri startu funkce.
- Resend se inicializuje az pred skutecnym odeslanim.
- Required PDF priloha bez souboru skonci rizene jako `failed`.
- Commit opravy: `6f998677c4fc5ccb085f9e511d625c58579d6f62`.

### Cil

- Vytvorit payout doklad k provizi ve stavu `approved`.
- Vygenerovat PDF doklad.
- Ulozit PDF do privatniho bucketu `affiliate-payout-docs`.
- Vlozit e-mail affiliate / obchodnikovi do `email_queue`.
- Vlozit kopii e-mailu ucetnimu podle `settings.accounting_email`.
- Posunout provizi do `ready_to_pay` az po uspesnem PDF + zarazeni obou e-mailu do fronty.
- Neresit Air Bank export, produkci ani Lovable Publish.

### Bezpecny model priloh

Nepouzivat dlouhodobe ulozenou signed URL jako jediny zdroj prilohy.

Faze C uklada:

- `affiliate_payout_documents.pdf_storage_path`
- `email_queue.attachment_storage_bucket`
- `email_queue.attachment_storage_path`
- `email_queue.attachment_required = true`

Worker `process-email-queue` si prilohu stahne pres service role z privatniho storage az pri odesilani. Pokud je `attachment_required = true` a soubor nejde stahnout, e-mail skonci jako `failed`; nesmi odejit bez PDF.

### Soubory Faze C

- `supabase/migrations/20260610140000_affiliate_payouts_phase_c.sql`
- `supabase/functions/create-affiliate-payout-document/index.ts`
- `supabase/functions/process-email-queue/index.ts`
- `src/pages/AdminAffiliateCommissions.tsx`
- `src/pages/AdminAffiliatePayoutDetail.tsx`
- `tests/e2e/41-affiliate-payout-documents.spec.ts`

### Overeny cilene test

Gated staging test `tests/e2e/41-affiliate-payout-documents.spec.ts` vyzaduje:

- `E2E_AFFILIATE_PAYOUTS=1`
- staging Supabase `dxmowysntemfqfnanxua`
- staging admin credentials
- staging service-role key

Overuje:

- doklad vznikne,
- PDF vznikne v privatnim bucketu,
- `email_queue` ma affiliate i ucetni e-mail,
- chybejici `settings.accounting_email` vraci rizenou chybu `missing_accounting_email`,
- provize prejde do `ready_to_pay`,
- payout e-mail ma povinnou privatni prilohu pres bucket/path.

### Stav po aplikaci

- Faze C je aplikovana a overena na stagingu.
- Produkce je netknuta.
- Web deploy ani Lovable Publish neprobehl.
- Full E2E nebezelo.
- Finalni produkcni text a podoba PDF porad vyzaduji ucetni/pravni potvrzeni pred produkcnim roll-outem.
- Faze D / Air Bank export zatim neni hotova.

### Provedene poradi staging aplikace Faze C

1. Aplikovat DB migraci `supabase/migrations/20260610140000_affiliate_payouts_phase_c.sql`.
2. Nasadit Edge Functions na staging:
   - `create-affiliate-payout-document`
   - `process-email-queue`
3. Nastavit / overit `settings.accounting_email`.
4. Spustit pouze cilene gated testy:
   - `E2E_AFFILIATE_PAYOUTS=1`
   - `tests/e2e/41-affiliate-payout-documents.spec.ts`

Poznamka: `process-email-queue` s podporou `attachment_storage_bucket/path` se nesmi deploynout pred DB migraci Faze C, protoze worker po deployi cte nove sloupce v `email_queue`.

### Mimo rozsah Faze C

- Air Bank ABO `.kpc` export.
- Potvrzeni o zaplaceni.
- Produkcni rollout.
- Lovable Publish.

## 15. FAZE D - AIR BANK ABO `.kpc` EXPORT (REVIEWABLE NAVRH, NEAPLIKOVANO)

Faze D ma pripraveny reviewable implementacni navrh jako soubory v repu. Nic nebylo aplikovano na staging ani produkci, zadna Edge Function nebyla nasazena, produkce `xkzhjldrojjlrkezorey` je netknuta.

Aktualni potvrzeny stav:

- Faze A+B+C jsou aplikovane a overene pouze na stagingu `dxmowysntemfqfnanxua`.
- Produkce `xkzhjldrojjlrkezorey` je netknuta.
- Web deploy ani Lovable Publish neprobehl.
- Migrace `supabase/migrations/20260610170000_affiliate_payouts_phase_d.sql` je pouze navrh; neaplikovat bez Pavlova schvaleni.
- Edge Function `supabase/functions/generate-affiliate-bank-export/index.ts` je pouze navrh; nedeployovat bez Pavlova schvaleni.
- Stara migrace `20260609_affiliate_commission_payout_evidence.sql` se nesmi aplikovat.
- Produkcni testovaci radek `dddddddd-dddd-dddd-dddd-dddddddddddd` se nema mazat.

### Cil Faze D

- Vygenerovat Air Bank ABO `.kpc` export z payout davky.
- Ulozit export do privatniho bucketu `affiliate-bank-exports`.
- Nastavit davku z `created` na `exported`.
- Umoznit adminovi stahnout `.kpc` z detailu `/admin/affiliate-payouts/:id`.
- Neodesilat penize automaticky; Air Bank import a potvrzeni plateb zustava rucni krok admina.

### Navrzena architektura

- Edge Function `generate-affiliate-bank-export`
  - admin-only,
  - vstup `batch_id`,
  - vola prepare RPC,
  - generuje ABO `.kpc`,
  - prevadi obsah do Windows-1250,
  - uklada soubor do `affiliate-bank-exports`,
  - vola finalize RPC,
  - pri pozdni chybe maze orphan export soubor.
- RPC `prepare_affiliate_bank_export(p_batch_id uuid)`
  - zamkne davku pres `FOR UPDATE`,
  - povoli jen davku ve stavu `created`,
  - validuje polozky, ucty, banky, castky, VS, KS, SS, zpravu, `due_date`, `payer_account`,
  - vraci snapshot dat pro export.
- RPC `finalize_affiliate_bank_export(...)`
  - transakcne ulozi metadata exportu,
  - nastavi `affiliate_payout_batches.status = 'exported'`,
  - kontroluje `ROW_COUNT`,
  - vraci rizene JSON chyby.

### Technicka pravidla exportu

- Format: Air Bank ABO `.kpc`.
- Bucket: privatni `affiliate-bank-exports`.
- Encoding: Windows-1250.
- Konce radku: CRLF.
- Castky: v halerich, bez desetinne carky.
- VS: numericky, max 10 cislic.
- KS: default `0000`.
- SS: nullable, pokud ucetni neurci jinak.
- Zprava pro prijemce: max 35 znaku.
- Soubor musi zustat do limitu Air Bank 50 KB.

### Dopad na stavovy model

Soucasny stav davky je `created -> exported -> paid` (+ `cancelled`).

Faze D by mela pozdeji zprisnit `mark_affiliate_payout_batch_paid` tak, aby v produkcnim workflow neslo oznacit davku jako zaplacenou primo ze stavu `created`. Doporuceny cilovy prechod je:

- `created -> exported` po uspesnem `.kpc` exportu,
- `exported -> paid` az po rucnim importu a odeslani plateb v Air Bank.

### Review opravy (commit `7890dc0c745a0659354d0378a97fe35d4c9fd606`)

Pred staging aplikaci byl navrh reviewovan a opraveny 4 chyby:

1. **ABO layout** — `buildAboKpc` byl placeholder; opraven dle oficialniho CSAS ABO specifikace: polozka zacina uctem prijemce (bez debetniho uctu), bez `AV:` prefixu, item amount max 12 cislic (ne 14), KS pole = `bank_code(4) + KS(4)`.
2. **Path-traversal regex** — `\\.\\.` v CHECK constraintu a ve `finalize` RPC nefungovalo spravne (`standard_conforming_strings = on`); opraveno na `\.\.`.
3. **Items-sum integrity check** — pridana kontrola `sum(amount_czk) = total_amount_czk`; chyba `amount_sum_mismatch`.
4. **`due_date` horni limit** — pridana kontrola `due_date > current_date + 364`; chyba `invalid_due_date_too_far`.

### Vzorovy soubor pro rucni importni test

Pripraveny vzorovy Air Bank `.kpc` soubor pro overeni importu v internetovem bankovnictvi pred staging aplikaci Faze D.

- **Soubor:** `docs/affiliate-payouts/sample-bank-export/sample-onemil-20260625.kpc`
- **Generátor:** `docs/affiliate-payouts/sample-bank-export/generate-sample.cjs`
- **README:** `docs/affiliate-payouts/sample-bank-export/README.md` (postup a blokujici checklist)
- **Ucet platce:** `3151752019/3030` (Iconic Point s.r.o., Air Bank)

### Vysledek rucniho importniho testu Air Bank (10. 06. 2026)

Pavel rucne nahral `sample-onemil-20260625.kpc` do Air Bank internetoveho bankovnictvi.

**Test 1** (`sample-onemil-20260625.kpc`, 2 fiktivni prijemci, 579,45 Kc):
- Air Bank soubor akceptovala, otevrela „Detail hromadne uhrady". ✅
- Spravne zobrazeny: ucet platce `3151752019/3030`, 2 platby, celkova castka 579,45 Kc. ✅
- Platby oznaceny „K oprave" — fiktivni ucty prijemcu neexistuji v bankovnim systemu. ⚠️
- Pavel platbu nepotvrdil ani neodeslal.

**Test 2** (`sample2-real-recipient-20260625.kpc`, prijemce `225259937/0600` MONETA, 1,00 Kc):
- Air Bank soubor akceptovala, stav „Vytvořena". ✅
- Platba zobrazena spravne: `225259937/0600`, VS `2026060010`, 1,00 CZK, datum 25.06.2026. ✅
- **Zadne „K oprave"** ✅ — s realnym uctem prijemce problema neni.
- Pavel platbu nepotvrdil ani neodeslal.

**Zaver: format `.kpc` je plne funkcni. „K oprave" bylo artefaktem neexistujicich fiktivnich uctu prijemcu, nikoli chybou struktury souboru.**

### Rizika

- **[SPLNENO] Importni test Air Bank** — format `.kpc` overen, „K oprave" vysvetleno. ✅
- Windows-1250 a CRLF overeny bajtove (vsechny bajty <= 0x7F, CRLF konce radku). ✅
- `payer_account` a `due_date` jsou dnes nullable; export vrati rizenou chybu pri chybejicich hodnotach; pred aplikaci musi byt potvrzeno, odkud se hodnoty nastavuji.
- **Zbyvajici bloker pred staging aplikaci:** vyhradne schvaleni Pavla.

### Test plan — SPLNĚNO na staging ✅ (10. 06. 2026)

- `tests/e2e/42-affiliate-bank-export.spec.ts`: **3 passed** (run `27301399760`) ✅
  - 42a) vytvoří Air Bank `.kpc` export a povolí paid až po exportu ✅
  - 42b) chybějící účet plátce vrátí řízenou chybu ✅
  - 42c) `created` dávku nelze označit jako paid před exportem ✅
- `tests/e2e/40-affiliate-payouts.spec.ts`: **4 passed** (run `27301606390`) ✅
  - 40a) batch lze vytvořit, ale paid je blokován před exportem ✅
  - 40b) admin UI zobrazí detail dávky a nabídne export před paid ✅
  - 40c) staré per-row RPC odmítne approved → paid ✅
  - 40d) AdminAffiliateAccounts detail nemá per-row paid akci ✅

**Fáze D staging ověření kompletní. Produkce nedotčena.**

### Pripravene reviewable soubory

- `supabase/migrations/20260610170000_affiliate_payouts_phase_d.sql`
- `supabase/functions/generate-affiliate-bank-export/index.ts`
- `src/pages/AdminAffiliatePayoutDetail.tsx`
- `src/pages/AdminAffiliatePayouts.tsx`
- `tests/e2e/40-affiliate-payouts.spec.ts`
- `tests/e2e/42-affiliate-bank-export.spec.ts`
- `docs/affiliate-payouts/sample-bank-export/sample-onemil-20260625.kpc` (vzorovy .kpc pro importni test)
- `docs/affiliate-payouts/sample-bank-export/generate-sample.cjs` (generator)
- `docs/affiliate-payouts/sample-bank-export/README.md` (postup importniho testu)
- `docs/affiliate-payouts/DESIGN.md`
- `onemil_state.md`
- `onemil_history.md`
- `CLAUDE.md`

Poznamka: `src/pages/AdminAffiliatePayouts.tsx` ani `src/integrations/supabase/types.ts` zatim nebylo nutne menit; detail davky pouziva stavajici `any` pristup k payout tabulkam.

## 16. FAZE D.1 - ZDROJ PAYER_ACCOUNT A DUE_DATE (APLIKOVANO NA STAGING 10. 06. 2026 ✅)

Faze D.1 resi automaticke plneni `payer_account` a `due_date` pri vytvoreni payout davky. Implementovano a overeno **pouze na staging** `dxmowysntemfqfnanxua` (10. 06. 2026). Produkce `xkzhjldrojjlrkezorey` zustava nedotcena a blokovana.

### Staging stav (10. 06. 2026)

- Migrace `supabase/migrations/20260610180000_affiliate_payouts_phase_d1.sql` aplikovana na staging.
- Settings seed OK: `affiliate_payout_payer_account = 3151752019`, `affiliate_payout_payer_bank_code = 3030`.
- ACL OK: `create_affiliate_payout_batch` nema `anon` EXECUTE (explicitni REVOKE proveden po aplikaci — Supabase pridava implicitni grant), `update_affiliate_payout_batch_meta` nema `anon` EXECUTE.
- Nove RPC `update_affiliate_payout_batch_meta(uuid, text, text, date)` — admin-only, FOR UPDATE lock, guard `status = 'created'`, validace uctu/bank_code/due_date.
- Spec 42 `42-affiliate-bank-export.spec.ts`: **6 passed, 0 failed**, run `27303172376` (42a–42f, `prepareBatchForExport` workaround odstranen).
- Spec 40 `40-affiliate-payouts.spec.ts`: **4 passed, 0 failed**, run `27303389522` (zadne regrese).
- Faze D.1 staging overeni kompletni. Produkce blokovana bez vyslovneho schvaleni Pavla.

### Rozhodnutí

**`payer_account` a `payer_bank_code`:**
- Ulozit jako settings klice do existujici tabulky `public.settings(key text, value text)`.
- Klice: `affiliate_payout_payer_account = 3151752019`, `affiliate_payout_payer_bank_code = 3030`.
- `create_affiliate_payout_batch` RPC nacte tyto hodnoty automaticky pri vytvoreni davky a ulozi je do `affiliate_payout_batches.payer_account` a `payer_bank_code`.
- Vzor: stejny jako `accounting_email` v Fazi C.
- Novy settings migration soubor (NEAPLIKOVAT bez Pavlova schvaleni).

**`due_date`:**
- Automaticky `current_date + 2` pri vytvoreni davky (nastavi `create_affiliate_payout_batch`).
- Admin muze editovat pole `due_date` v detailu davky `/admin/affiliate-payouts/:id` pred spustenim exportu.
- UI edit field: date input, validace `due_date >= current_date`, `due_date <= current_date + 364`.

**Rizena chyba pri chybejicich hodnotach:**
- `prepare_affiliate_bank_export` vrati chybu `missing_payer_account` pokud `affiliate_payout_batches.payer_account IS NULL`.
- `prepare_affiliate_bank_export` vrati chybu `missing_due_date` pokud `affiliate_payout_batches.due_date IS NULL`.

### Staging testovani bez Faze D.1

Soucasna migrace Faze D a EF `generate-affiliate-bank-export` jsou pro staging testovani pouzitelne i bez Faze D.1 — spec 42 pomocna funkce `prepareBatchForExport` nastavuje `payer_account = '1234567890'`, `payer_bank_code = '3030'` a `due_date = today` primo pres UPDATE. Faze D.1 nevyzaduje zmenu v spec 42.

### Soubory pro Fazi D.1 (NEAPLIKOVAT, NENASAZOVAT bez Pavlova schvaleni)

- Nova migrace pro settings klice (zatim nepripravena).
- Uprava `create_affiliate_payout_batch` RPC (zatim neupravena).
- UI edit fields pro `payer_account` a `due_date` v `src/pages/AdminAffiliatePayoutDetail.tsx` (zatim neimplementovano).

## 17. PRODUCTION ROLLOUT CHECKLIST — Affiliate Payouts Phase A+B+C+D+D.1

**Target production:** `xkzhjldrojjlrkezorey`. **Status: ⛔ BLOKOVANO** — viz Final Gate.

> ⚠️ **Filename sort ≠ apply order.** Phase B base soubor `20260610_affiliate_payouts_phase_b.sql` se v `ls` razeni objevi POSLEDNI (kvuli podtrzitku), ale musi se aplikovat PRED timestamped B/C/D soubory. Aplikovat v explicitnim logickem poradi nize, ne podle `ls`.

### 17.1 Exact migration order (manualne v Supabase SQL Editoru, jeden po druhem, postcheck po kazdem)

1. `supabase/migrations/20260609_affiliate_payouts_phase_a.sql` — DB base: tabulky, sequences, RLS, status enums.
2. `supabase/migrations/20260610_affiliate_payouts_phase_b.sql` — batch + paid flow, `create_affiliate_payout_batch`, `mark_affiliate_payout_batch_paid`.
3. `supabase/migrations/20260610120000_affiliate_payouts_phase_b_temp_table_guard.sql` — temp-table guard hardening pro B.
4. `supabase/migrations/20260610140000_affiliate_payouts_phase_c.sql` — payout documents, email-queue private attachment sloupce, `prepare_/finalize_affiliate_payout_document`.
5. `supabase/migrations/20260610170000_affiliate_payouts_phase_d.sql` — Air Bank ABO export sloupce, `prepare_/finalize_affiliate_bank_export`, bucket `affiliate-bank-exports`.
6. `supabase/migrations/20260610180000_affiliate_payouts_phase_d1.sql` — settings seed (payer account/bank), auto-fill v `create_affiliate_payout_batch`, `update_affiliate_payout_batch_meta`.
7. `supabase/migrations/20260611090000_affiliate_payouts_acl_patch.sql` — **ACL patch (audit 11. 06. 2026)**: explicitni REVOKE implicitnich Supabase EXECUTE grantu. Nahrazuje drivejsi manualni post-apply REVOKE krok. MUSI byt aplikovan jako POSLEDNI. **APLIKOVAN NA STAGING `dxmowysntemfqfnanxua` ✅ (11. 06. 2026, schvaleni Pavla); ACL postcheck prosel pro vsech 10 funkci** (document/export RPC = pouze `postgres + service_role`; admin RPC = `postgres + authenticated + service_role`, zadny `anon`). Produkce nedotcena.

**Duvod ACL patche (nalez auditu 11. 06. 2026):** `REVOKE ALL ... FROM PUBLIC` v puvodnich migracich NEodstrani implicitni per-role granty, ktere Supabase pridava pri CREATE FUNCTION. Staging postcheck nasel: `prepare_affiliate_payout_document`, `finalize_affiliate_payout_document` a `next_affiliate_payout_document_number` mely `anon` + `authenticated` EXECUTE — tyto funkce NEMAJI vnitrni auth guard (service_role-only by design, volane jen z EF), takze slo o realnou diru: kazdy prihlaseny uzivatel mohl vkladat payout doklady, queue emaily a posouvat provize do `ready_to_pay`. Dale `admin_set_affiliate_commission_status` a `cancel_affiliate_payout_batch` mely `anon` EXECUTE (maji vnitrni `is_admin()` guard — defense-in-depth nalez). Patch je idempotentni, pokryva vsech 10 payout funkci. Regresni lock: spec 41e.

**Postcheck po #7 (zadna funkce nesmi mit `anon`; document/export RPC nesmi mit ani `authenticated`):**
```sql
SELECT proname, proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND proname IN ('prepare_affiliate_payout_document','finalize_affiliate_payout_document',
 'next_affiliate_payout_document_number','prepare_affiliate_bank_export','finalize_affiliate_bank_export',
 'admin_set_affiliate_commission_status','cancel_affiliate_payout_batch','mark_affiliate_payout_batch_paid',
 'create_affiliate_payout_batch','update_affiliate_payout_batch_meta');
```

**Settings k potvrzeni na produkci po #6:**
- `affiliate_payout_payer_account = 3151752019`
- `affiliate_payout_payer_bank_code = 3030`
- `accounting_email` = produkcni ucetni adresa (NE staging `accounting-test@onemil.test`).

### 17.2 Edge Functions to deploy (produkce, az po vsech migracich + postcheck)

1. `create-affiliate-payout-document` (Phase C) — overit admin guard v `supabase/config.toml`.
2. `generate-affiliate-bank-export` (Phase D) — JWT-protected; smoke bez JWT → 401.
3. `process-email-queue` (Phase C update) — Resend init posunut tesne pred odeslani; required PDF priloha bez souboru → rizeny `failed`.

**⚠️ `process-email-queue` JWT pozor (audit 11. 06. 2026):** funkce NEMA zadny vnitrni auth check — spoleha vyhradne na platform `verify_jwt` (deploy-time flag). Staging je nasazen s `verify_jwt = true`. Produkci verzi vola pg_cron job 16 kazdych 10 minut — pred produkcnim redeployem OVERIT aktualni produkci `verify_jwt` setting a zpusob, jakym cron predava Authorization header; redeploy musi zachovat kompatibilni nastaveni, jinak prestanou odchazet vsechny emaily. Staging pg_cron neexistuje, takze tato kombinace cron+EF nebyla na stagingu testovatelna. Vsechny 3 payout EF jsou na stagingu `verify_jwt = true`; `create-affiliate-payout-document` a `generate-affiliate-bank-export` maji navic vnitrni admin JWT guard.

### 17.3 Required postchecks (per phase, na produkci)

- **A:** tabulky existuji, RLS enabled, sequences present.
- **B:** `create_affiliate_payout_batch` + `mark_affiliate_payout_batch_paid` existuji; `mark_..._paid` vyzaduje `exported` pred `paid`; zadny `anon` EXECUTE.
- **C:** `affiliate_payout_documents` PDF/email audit sloupce; `email_queue` private-attachment + `attachment_required` sloupce; `prepare_/finalize_affiliate_payout_document` existuji.
- **D:** 5 export sloupcu, 3 CHECK constrainty, export index, bucket `affiliate-bank-exports` PRIVATNI; `prepare_/finalize_affiliate_bank_export` = service_role only.
- **D.1:** settings seed present; auto-fill payer_account/bank_code + `due_date = current_date + 2`; `update_affiliate_payout_batch_meta` admin-only s `status='created'` guard; ZADNY `anon` EXECUTE na obou funkcich (`proacl` check).
- **Edge Functions:** vsechny 3 ACTIVE; `generate-affiliate-bank-export` no-JWT → 401.
- **Advisors:** `get_advisors` (security + performance), triage novych nalezu (pre-existing security backlog je samostatny).

### 17.4 Required smoke tests (pred Lovable Publish — P0)

P0 Smoke dle CLAUDE.md: registrace/login (01,02), login gating (33,14), ticket (04), vyhra (05), penezenka/balance (09,03-voucher), zpravy (29,32), Bob ON/OFF (31). Plus curl smoke: `generate-affiliate-bank-export` no-JWT → 401.

### 17.5 Required E2E tests (staging, zelene tesne pred produkcni gate)

- `tests/e2e/40-affiliate-payouts.spec.ts` → 4 passed (last green run `27303389522`).
- `tests/e2e/41-affiliate-payout-documents.spec.ts` → **5 passed** ✅ (run `27371575748`, 11. 06. 2026, po aplikaci ACL patche na staging — 41a–41e vc. 41e ACL regression locku; 41e vyzaduje aplikovany ACL patch `20260611090000`).
- `tests/e2e/42-affiliate-bank-export.spec.ts` → **6 passed** ✅ (last green run `27372071508`, 11. 06. 2026, po ACL patchi; predchozi zeleny run `27303172376`).
- **Full Staging E2E suite zeleny ✅ (run `27372767070`, 11. 06. 2026): 123 passed · 4 skipped · 0 failed (11m49s). Spec 40: 4 ✅ · Spec 41: 5 ✅ · Spec 42: 6 ✅. Zadne regrese. Vetev `codex/affiliate-payouts-audit` PRODUCTION-READY.**
- E2E vzdy proti staging `dxmowysntemfqfnanxua`; produkce nikdy neni E2E cil.

### 17.6 Rollback plan

- **Edge Functions:** net-new (`create-affiliate-payout-document`, `generate-affiliate-bank-export`) → delete; `process-email-queue` → redeploy prior version.
- **DB (reverzni poradi D.1 → A):** D.1 drop `update_affiliate_payout_batch_meta` + restore Phase B verzi `create_affiliate_payout_batch` (+ pripadne smazat 2 settings klice); D drop export RPC/sloupce/constrainty/index + bucket (jen pokud prazdny); C drop document RPC + revert sloupce; B drop batch RPC + tabulky; A drop base tabulky/sequences/policies.
- **Data safety:** rollback jen na cistem/prazdnem payout datasetu. Pokud existuji realne batch/document/export radky → NEDROPOVAT, eskalovat Pavlovi. Nikdy nemazat produkcni testovaci radek `dddddddd-dddd-dddd-dddd-dddddddddddd`.
- **Frontend:** `git revert` UI commitu + re-Publish prior build pres Lovable.

### 17.7 Production risks

- Implicitni `anon`/`authenticated` granty re-added pri kazdem CREATE/REPLACE FUNCTION → ACL patch `20260611090000` musi byt VZDY posledni aplikovana migrace; po jakemkoli budoucim REPLACE payout funkce znovu spustit patch + postcheck. Regresni lock spec 41e.
- `process-email-queue` bez vnitrniho auth checku — produkci redeploy musi zachovat verify_jwt kompatibilni s pg_cron job 16 invokaci (viz §17.2), jinak prestanou odchazet emaily.
- Migration ordering trap (podtrzitko razeni).
- `accounting_email` mireny na staging test adresu → realne payout emaily uniknou do test inboxu. Nastavit produkcni hodnotu pred deployem.
- Bucket privacy — `affiliate-bank-exports` musi byt privatni; verejny bucket leakuje bankovni ucty prijemcu.
- Realny money path — Air Bank `.kpc` import rizi skutecne prevody; payer `3151752019/3030` (Iconic Point s.r.o.) musi byt spravny. Import test jiz uspesny na realnem prijemci (`225259937/0600`, 1,00 Kc), zadne chybne „K oprave".
- Email attachment flow — required PDF bez souboru → rizeny `failed` (worker nesmi spadnout); overit po deployi.
- Pre-existing security backlog (23 nalezu) nesouvisi, ale nesmi byt nove zhorseno; recheck advisors.
- Adjacent regression — payout RPC se dotykaji `affiliate_commissions` status flow; overit commissions UI (spec 39) a B2B fakturaci.

### 17.8 ⛔ FINAL GATE — ✅ SCHVALENO A BACKEND PROVEDEN (12. 06. 2026)

Pavel dal 12. 06. 2026 vyslovne pisemne schvaleni produkce. **Backend rollout PROVEDEN** dle tohoto checklistu:

- **Migrace 1–7 ✅** aplikovany v presnem poradi (A → B → B guard → C → D → D.1 → ACL patch), per-faze postchecky prosly.
- **Settings ✅:** `accounting_email = divispavel2@gmail.com` (produkcni hodnota dle Pavla), payer `3151752019` / `3030` (seed D.1).
- **EF ✅:** `create-affiliate-payout-document` v1 (`verify_jwt=true`), `generate-affiliate-bank-export` v1 (`verify_jwt=true`), `process-email-queue` v124 (`verify_jwt=false` — §17.2 risk vyresen: `cron.job` 16 overen, vola bez Authorization headeru, predchozi v123 mel rovnez `verify_jwt=false`; deploy pres CLI `--no-verify-jwt` po samostatnem schvaleni Pavla).
- **Postchecky §17.3 ✅:** tabulky+RLS, privatni buckety, ACL service_role-only / bez anon, no-JWT 401 smoke, email worker no-auth 200 processed:0, advisors bez novych payout nalezu.
- **Data safety ✅:** `dddddddd-…` nedotcen, 0 batchu, 0 dokladu, zadna platba, zadny e-mail.
- **✅ Merge + smoke (12. 06. 2026):** Vetev `codex/affiliate-payouts-audit` fast-forward merguta do `main` (commit `fc7c08ec`). Produkcni smoke run `27395842847` ✅ passed. P0 staging smoke run `27395845092` ✅ passed. Zadne regrese.
- **⏳ ZBYVA: Lovable Publish (manualni akce Pavla).** Payout admin UI (`/admin/affiliate-payouts`, `/admin/affiliate-payouts/:id`) neni v live buildu dokud Pavel nepublikuje. Po publishi: UI smoke (nacteni stranek, EF no-JWT → 401).
