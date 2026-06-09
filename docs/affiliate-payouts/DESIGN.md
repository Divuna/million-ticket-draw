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
- **`affiliate_payout_documents`** — doklad/samofaktura 1:1 k provizi: `document_number` (UNIQUE), `document_type` (`self_invoice`/`payout_statement`), částky, `pdf_url`, `email_status`, `affiliate_email`, `accounting_email`.
- **`affiliate_payout_batches`** — dávka: `batch_number` (UNIQUE), `status`, `bank='airbank'`, `bank_export_format='abo_kpc'`, `bank_export_url`, součty, `created_by`, `marked_paid_by/at`.
- **`affiliate_payout_batch_items`** — položky: `commission_id` (UNIQUE), `amount_czk`, **snapshot** `recipient_account`/`recipient_name`, systémový `variable_symbol`/`payment_reference`.
- **Sekvence:** `affiliate_payout_document_seq`, `affiliate_payout_batch_seq`.
- **Storage (PRIVÁTNÍ):** `affiliate-payout-docs`, `affiliate-bank-exports` (citlivé — nikdy public).
- **RLS:** jen admin/superadmin (`is_admin()`) na všech 3 tabulkách + storage objektech.

## 4. Air Bank / ABO formát (ověřeno + co potvrdit)

**Ověřeno (airbank.cz):** Air Bank importuje hromadné tuzemské CZK platby ve **formátu ABO**, přípona **`.kpc`**, znaková sada **Windows-1250**, max **50 KB**, jen přes internetové bankovnictví. Záznamy ukončeny **CR+LF**.

**ABO struktura (kanonická, dle bankovních specifikací):** věta **1501** = příkaz k úhradě; **částky v 1/100 (haléře)**, numerické, doplnění zleva nulami; pole: **číslo účtu příkazce/příjemce, kód banky, částka, VS, KS, SS, datum splatnosti (ne do minulosti, max +364 dní)**.

**Export musí obsahovat** (Pavlův seznam): číslo účtu, kód banky, částka, měna (CZK), VS, zpráva pro příjemce, datum splatnosti.

> ⚠️ **K POTVRZENÍ před implementací Fáze D:** přesné offsety/délky polí věty 1501 a hlavičky **podle oficiální Air Bank technické specifikace** (PDF `technicke-pozadavky-a-specifikace-hromadnych-plateb-a-export-vypisu.pdf` se nepodařilo strojově přečíst). Nedomýšlet — ověřit s účetní / Air Bank supportem.

Zdroje: [Air Bank — Import hromadných plateb](https://www.airbank.cz/co-vas-nejvic-zajima/import-hromadnych-plateb/), [Air Bank — tech. specifikace (PDF)](https://www.airbank.cz/file-download/technicke-pozadavky-a-specifikace-hromadnych-plateb-a-export-vypisu.pdf), [ČSAS — ABO formát pro programátory (PDF)](https://www.csas.cz/banka/content/inet/internet/cs/ABO_format.pdf), [CREDITAS — popis ABO/KPC (PDF)](https://www.creditas.cz/files/popis-formatu-abo-kpc-pro-platebni-prikazy-172021-revize.pdf).

## 5. Edge Functions / RPC (Fáze B–E — návrh, zatím bez kódu)

| Jednotka | Fáze | Účel | Reuse |
|----------|------|------|-------|
| `create-affiliate-payout-document` (EF/RPC) | C | vznik dokladu + `document_number` (sekvence) | — |
| `generate-affiliate-payout-pdf` (EF) | C | PDF (pdf-lib) → bucket `affiliate-payout-docs` (signed URL) | `generate-partner-invoice-pdf` (pdf-lib+fontkit+QRCode) |
| `send-affiliate-payout-document-email` (EF) | C | `email_queue` insert (affiliate + účetní), `attachment_url`=PDF | `send-partner-invoice-email`, `process-email-queue` |
| `create-affiliate-payout-batch` (RPC) | B | z vybraných `ready_to_pay` → batch + items + VS, provize→`in_payment_batch` | — |
| `generate-affiliate-bank-export` (EF) | D | ABO `.kpc` (Windows-1250) → bucket `affiliate-bank-exports`, batch→`exported` | — |
| `mark-affiliate-payout-batch-paid` (RPC) | B | batch→`paid`, items→`paid`, `marked_paid_by/at` (atomicky, FOR UPDATE) | rozšíření logiky `admin_set_...` |
| `send-affiliate-payment-confirmation` (EF) | E | potvrzení obchodníkovi + souhrn účetní, `confirmation_sent_at` | `email_queue` |

**Číslování/VS:** sekvence v DB → `document_number = 'AP-YYYY-' || lpad(nextval, 6)`, `VS` deterministicky z čísla dokladu (max 10 číslic). Nikdy admin.

**E-mail infra (ověřeno):** `email_queue(email, subject, body, attachment_url, status, sent_at)` + worker `process-email-queue`. Účetní e-mail: zatím **nepotvrzeno** (`COMPANY_CONTEXT.md`: Veronika Engeová / info@onemil.cz) → přidat `settings.accounting_email`.

## 6. UI (Fáze B+)

- **`/admin/affiliate-commissions`**: checkboxy pro výběr `ready_to_pay` provizí + tlačítko **`Vytvořit platební dávku`**. Z řádku provize se ruční „paid" odebere.
- **`/admin/affiliate-payouts`** (nová): seznam dávek (číslo, stav, součet, počet, datum, kdo).
- **`/admin/affiliate-payouts/:id`** (detail): položky (příjemce, účet, VS, částka, doklad PDF), tlačítka **`Stáhnout hromadný příkaz`** (`.kpc`) a **`Označit dávku jako zaplacenou`** (dialog: „Tato akce neposílá peníze. Pouze potvrzuje, že platba byla provedena v bance."), přehled dokladů + stav e-mailů/exportu.

## 7. Testy

- **Cílený spec** `tests/e2e/40-affiliate-payouts.spec.ts` (staging-only, gated `E2E_AFFILIATE_PAYOUTS=1`): vytvoření dávky z `ready_to_pay`, generování ABO (struktura/encoding), `mark-paid` propíše provizím `paid` + audit, e-mail enqueue, idempotence.
- **Rozšířit spec 39**: tlačítko paid NENÍ na provizi; je na dávce.
- **Staging Full E2E** jako finální regrese (po cíleném zeleném).
- **Produkce** až po výslovném schválení Pavla + postcheck.

## 8. Fázování (nic nenasazovat bez schválení)

| Fáze | Obsah | Výstup |
|------|-------|--------|
| **A** | DB základ (tabulky, sloupce, sekvence, buckety, RLS) | `20260609_affiliate_payouts_phase_a.sql` (✅ připraveno) |
| **B** | `create-batch` + `mark-paid` RPC + UI výběr/detail dávky + paid na dávce | bez PDF/banky/e-mailů — paid ověřitelné |
| **C** | doklady: `create-document` + PDF + e-maily (obchodník+účetní), stav `payout_document_created` | |
| **D** | Air Bank ABO `.kpc` export + `Stáhnout hromadný příkaz` | po potvrzení přesného formátu |
| **E** | `payment_confirmation_sent` (potvrzení po zaplacení) | |

## 9. Rizika

| Riziko | Poznámka |
|--------|----------|
| **ABO formát Air Bank** | přesné offsety věty 1501 NEPOTVRZENY (PDF nečitelné) → potvrdit před Fází D. Nedomýšlet. |
| **Samofakturace (legal)** | self-billing vyžaduje souhlas obchodníka → zařazeno do podmínek affiliate/partner programu (právní review). |
| **Atomicita `mark-paid`** | batch + items + provize v jedné transakci, FOR UPDATE. |
| **Citlivá data** | bankovní exporty + doklady = PRIVÁTNÍ buckety + signed URL, admin-only RLS. |
| **Idempotence e-mailů** | `email_status` + `email_queue`, neposlat 2×. |
| **Zrušení dávky** | `cancelled` → provize zpět `ready_to_pay` (jen před `exported`/`paid`). |
| **Účetní e-mail** | nepotvrzený → `settings.accounting_email` + potvrdit s Veronikou Engeovou. |
| **VS délka** | max 10 číslic, deterministicky z čísla dokladu. |
| **Měna** | jen CZK tuzemské (ABO). Zahraniční/EUR = mimo rozsah. |

## 10. Co musí potvrdit účetní / právník

1. **Účetní (Veronika Engeová):** typ dokladu (samofaktura vs. výplatní avízo), náležitosti dokladu, účetní e-mail pro kopie, číselná řada dokladů.
2. **Účetní / Air Bank:** přesný ABO `.kpc` layout (offsety polí, hlavička, KS/SS povinnost, datum splatnosti pravidla).
3. **Právník:** znění souhlasu se samofakturací v podmínkách affiliate/partner programu; DPH režim provize (plátce/neplátce).
