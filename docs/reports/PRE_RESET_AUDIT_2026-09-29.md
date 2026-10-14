# Předstartovní audit OneMil před prvním resetem — 29. 9. 2026

Výchozí stav: `main` `58409753`. Produkce `xkzhjldrojjlrkezorey` — **pouze read-only** (SQL SELECT,
veřejné GET). Staging `dxmowysntemfqfnanxua` — testy, testovací data a bezpečné opravy.
Opravy kódu: větev `claude/pre-reset-audit-fixes` (nemergnuto).

## 1. Co bylo testováno a jak

| Oblast | Způsob | Výsledek |
|---|---|---|
| Build / typecheck / lint | `npm run build`, `tsc --noEmit` | build OK; tsc 17 chyb jen v typech (zúžení unionů, `replaceAll` lib) — bez dopadu za běhu |
| Kontraktní testy (sales leads) | `playwright.contract.config.ts` | 81/81 |
| Staging E2E dávka 1 (01–37, 100–199) | naplánovaný běh `36540169899` (zrušen po 30 min) | 966 testů prošlo, 10 selhalo (viz níže) |
| Staging E2E dávka 2 (37–69 + phase2) | `36545901026` | 147 passed / 2 failed / 27 skipped |
| Staging E2E dávka 3 (70–99 + opravené 05/09/45/128/152/157) | `36568763341` | 321 passed / 2 failed (72 = 502 z EF na stagingu, 84 = chyba kontraktu → opraveno) / 21 skipped; všechny opravené specy zelené |
| Staging P0 smoke (větev) | `36571332968` | ✅ success (po opravách seedu, superadmin env a resetu voucherů) |
| Cílené přeběhnutí selhaných | `36543440935` | 05 ✅ po zapnutí flagu, 194a ✅ |
| Refund / MIO sady / FEFO / expirace | `supabase/tests/refund_block_wallet_lots_scenarios.sql` | 34/34 |
| Hráčské doporučení 5 % + 15 MIO | `phase5_player_referral_scenarios.sql` | 48/48 |
| Jeden odměňovaný zdroj | `single_acquisition_source_scenarios.sql` | 12/12 |
| Affiliate provize v Kč (zákaznická + firemní) | `phase6_affiliate_commissions_scenarios.sql` | 29/29 (izolace cizích stagingových vazeb v transakci) |
| Affiliate recovery + výplatní doklady | `phase6_affiliate_recovery_scenarios.sql` | 35/35 |
| Stripe TEST platba end-to-end | lokální frontend → staging → Stripe Sandbox | 300 Kč → 300 + 10 MIO, 2 sady (+12 měsíců), peněženka 310, 1 ledger |
| Soutěž: vstup, bonus MIO, věcný bonus, hlavní výhra | vlastní soutěž (10 tiketů) + UI | tiket 1 bez výhry + voucher; 3 = 25 MIO; 5 = věcná; 10 = hlavní; soutěž `closed`; peněženka 210; FEFO čerpá placenou sadu |
| Výhry v UI | `/wins` | nalezena chyba (viz § 3) → opraveno ve větvi |
| Bob | `/messages` | odpovídá s CTA |
| Produkce — crony | `cron.job_run_details` 3 dny | 0 selhání; Shoptet 1 440 × `ok` / 24 h |
| Produkce — peněženky | `wallet_lot_consistency_issues()`, záporné zůstatky | 0 / 0 |
| Produkce — invarianty | dva zdroje hráče, prošlé sady, živé platby, fallback benefit | 0 / 0 / 0 / OK |
| Produkce — e-maily, push | `email_queue`, `push_log` | 20 odesláno / 7 dní, 1 pending (známá zadržená faktura); push 6 × sent / 30 dní |
| Produkce — advisor | security | 1 ERROR = záměrný view `public_partners` |
| Produkce — VOP | `https://onemil.cz/vop` | bod 8 „Vrácení platby za MIO“ živý |

## 2. Opraveno

**Staging (provedeno):**
- `guaranteed_benefit_purchase_enabled` → `true` (jako produkce) — specy 05/09 předtím padaly na `feature_disabled`.
- `get_admin_top_bar_stats` doplněna (přesná produkční definice).

**Větev `claude/pre-reset-audit-fixes` (nenasazeno):**
- `/wins`: skutečný název bonusové výhry místo „Bonusová cena“.
- `AdminContestManagement`: explicitní NULL v aktivačním volání (spec 152).
- `get-pending-partner-registrations`: stránkování všech auth účtů (dřív jen 50).
- Specy 09, 45, 84, 128, 157 sladěny s aktuálním stavem; CI timeout 90 min; P0 seed s `rules_pdf_url`.

## 3. Nálezy

Viz `onemil_state.md` § -14 (OPEN ISSUE staging + produkční rizika 1–7).

## 4. Známé problémy znovu ověřené

| Problém | Skutečný stav |
|---|---|
| spec 05 | příčina = vypnutý flag na stagingu; po opravě prošel |
| spec 09 / výsledkový dialog | dialog se zobrazuje správně; spec hledal starý `TicketResultModal` → opraven test |
| `guaranteed_benefit_purchase_enabled` staging | opraveno |
| `get_admin_top_bar_stats` staging | opraveno |
| specy 18/19/20 | příčina = stagingové legacy přetížení `admin_manage_contest` (PGRST203) — čeká na schválení |
| P0 workflow | seed bez `rules_pdf_url`, chybějící superadmin env (specy 29/31/32) a vadný reset voucherů (spec 03) — opraveno ve větvi, P0 zelený |
| plný staging E2E „cancelled“ | timeout 30 min < délka suite → opraveno ve větvi |
| 142 osiřelých bonusových výher | aktuálně 0 v produkci (dokumentace neaktuální) |
| staging 975 auth účtů | specy čtoucí jen 1. stránku `listUsers` (37, 56) začnou padat nad 1 000 |
