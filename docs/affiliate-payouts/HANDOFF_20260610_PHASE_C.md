# OneMil — handoff pro nový chat

## Téma

Samostatná větev: dávkové výplaty affiliate / obchodních provizí.

Hlavní roadmapa OneMil se zatím nemění. Produkce se zatím nespouští.

## Branch

`codex/affiliate-payouts-audit`

## Produkce

Produkce `xkzhjldrojjlrkezorey` je netknutá pro payout Fáze A/B/C. Neproběhl produkční deploy ani Lovable Publish.

Produkční testovací řádek `dddddddd-dddd-dddd-dddd-dddddddddddd` zatím nemazat.

Zakázaná stará migrace:

`supabase/migrations/20260609_affiliate_commission_payout_evidence.sql`

Tato migrace patří ke starému ručnímu návrhu a nesmí se aplikovat.

## Staging

Staging Supabase:

`dxmowysntemfqfnanxua`

## Fáze A+B — hotovo na stagingu

Fáze A+B jsou aplikované na stagingu a ověřené automaticky i ručně Pavlem.

### Ověřené body

- Fáze A: payout tabulky, statusy, storage buckety, RLS.
- Fáze B: dávky, položky dávky, systémový VS, paid jen na dávce.
- Bezpečnostní patch temp tabulky aplikovaný.
- Per-row `Označit jako vyplacené` odstraněno.
- Dávka se vytváří přes `/admin/affiliate-commissions`.
- Detail dávky je na `/admin/affiliate-payouts/:id`.
- `Označit dávku jako zaplacenou` pouze eviduje platbu, neposílá peníze.

### Automatické testy

- spec 40 run `27258741085` — 4 passed.
- spec 39 run `27270797466` — 2 passed.
- staging UI smoke run `27271124754` — 2 passed.

### Ruční test Pavlem

Pavel ručně vytvořil dávku:

- dávka `APB-2026-000016`
- částka `123,45 Kč`
- potvrzovací dialog správně říkal, že akce neposílá peníze
- dávka označena jako `Zaplaceno`
- původní provize už nejde znovu zařadit do další dávky

## Fáze C — aktuální stav

Fáze C byla připravena, zreviewována, opravena a aplikována pouze na staging.

### Commit návrhu Fáze C

`b540838d0691490c25c598285d32c4f51863c05a`

Obsahoval reviewable návrh:

- `docs/affiliate-payouts/DESIGN.md`
- `src/pages/AdminAffiliateCommissions.tsx`
- `src/pages/AdminAffiliatePayoutDetail.tsx`
- `supabase/functions/create-affiliate-payout-document/index.ts`
- `supabase/functions/process-email-queue/index.ts`
- `supabase/migrations/20260610140000_affiliate_payouts_phase_c.sql`
- `tests/e2e/41-affiliate-payout-documents.spec.ts`

### Commit opravy Fáze C před stagingem

`205562bab741c85068f8566385e06d3d3b4d25b0`

Opravy:

- DB část přesunuta do transakčních RPC:
  - `prepare_affiliate_payout_document`
  - `finalize_affiliate_payout_document`
- Edge Function nejdřív kontroluje existující doklad přes prepare, až potom generuje PDF.
- Pokud po uploadu PDF selže finalizace, Edge Function smaže nahrané PDF.
- `finalize` vrací `document_already_exists`, když už doklad existuje.
- Update provize na `ready_to_pay` se kontroluje přes `ROW_COUNT`; chyba vrací `commission_update_failed`.
- `process-email-queue` zůstává kompatibilní se starým `attachment_url`.
- Required payout příloha nemůže odejít bez PDF; při chybě skončí e-mail jako `failed`.
- Test `41b` stabilně čte JSON chybu z Edge Function.
- Přidán test `41d` pro chybějící required přílohu bez reálného odeslání e-mailu.

### Staging aplikace Fáze C

Fáze C je aplikovaná na stagingu `dxmowysntemfqfnanxua`.

DB:

- aplikována migrace `20260610140000_affiliate_payouts_phase_c.sql`
- nové sloupce v `affiliate_payout_documents`
- nové sloupce v `email_queue`
- existují RPC:
  - `prepare_affiliate_payout_document`
  - `finalize_affiliate_payout_document`

Edge Functions:

- `create-affiliate-payout-document` nasazená na staging, verze 1
- `process-email-queue` nasazený na staging, verze 2

Settings:

- `settings.accounting_email = accounting-test@onemil.test`

Test:

- `tests/e2e/41-affiliate-payout-documents.spec.ts`
- výsledek: `4 passed`
- cleanup čistý:
  - `email_queue`: 0 zbytků pro spec41
  - `affiliate_accounts`: 0 zbytků pro spec41
  - `affiliate_payout_documents`: 0 zbytků pro spec41

### Commit opravy workeru během staging testu

`6f998677c4fc5ccb085f9e511d625c58579d6f62`

Důvod:

- staging neměl `RESEND_API_KEY`
- `process-email-queue` inicializoval Resend už při startu funkce
- oprava: Resend se inicializuje až těsně před skutečným odesláním
- required PDF příloha bez souboru skončí řízeně jako `failed`, bez reálného odeslání

## Co je hotové

- Fáze A+B+C jsou hotové a ověřené na stagingu.
- PDF doklad vzniká přes Fázi C.
- PDF se ukládá do privátního bucketu `affiliate-payout-docs`.
- E-maily se vkládají do `email_queue`.
- Required payout příloha nesmí odejít bez PDF.
- Provize přechází do `ready_to_pay` až po úspěšném dokladu/PDF/e-mail queue.

## Co není hotové

- Fáze D: Air Bank export.
- Fáze E: potvrzení o zaplacení.
- Produkční rollout.
- Finální účetní/právní potvrzení textů PDF.
- Potvrzení účetní, zda jsou přípustné mezery v číselné řadě APD.

## Důležité riziko před produkcí

`prepare_affiliate_payout_document` rezervuje číslo APD před PDF uploadem/finalizací. Při chybě může vzniknout mezera v číselné řadě. Pro staging přijatelné. Před produkcí potvrdit s účetní.

## Další krok

Pokračovat Fází D na stagingu: Air Bank export.

Nejdřív jen návrh/audit, ne implementace.

Zkontrolovat:

- přesný ABO `.kpc` formát pro Air Bank,
- encoding Windows-1250,
- CRLF,
- částky v haléřích,
- VS max 10 číslic,
- KS default `0000`,
- zpráva pro příjemce max 35 znaků,
- zda export vzniká z dávky ve stavu `created` nebo `ready_to_export`,
- kam uložit export do privátního bucketu `affiliate-bank-exports`,
- jak admin stáhne export z `/admin/affiliate-payouts/:id`.

## Zákazy pro další chat

- Nesahej na produkci.
- Nedělej Lovable Publish.
- Nespouštěj full E2E, pokud Pavel výslovně neřekne.
- Neaplikuj nic do produkce.
- Nemazat produkční testovací řádek `dddddddd-dddd-dddd-dddd-dddddddddddd`.
- Neaplikovat starou migraci `20260609_affiliate_commission_payout_evidence.sql`.

## Startovací text pro další chat

Pokračujeme v OneMil na větvi `codex/affiliate-payouts-audit`, samostatný úkol dávkové výplaty affiliate / obchodních provizí. Produkce je netknutá. Fáze A+B+C jsou aplikované a ověřené na stagingu `dxmowysntemfqfnanxua`. Další krok je Fáze D — Air Bank export — nejdřív pouze návrh/audit, bez implementace, bez staging aplikace a bez produkce.
