# První předstartovní reset OneMil — mapa dat a postup

**Stav: PŘIPRAVENO, NESPUŠTĚNO.** Reset je destruktivní produkční operace a smí proběhnout jen
po novém výslovném schválení Pavla (CLAUDE.md, „PŘEDSTARTOVNÍ RESET SYSTÉMU").

Mapa vytvořena read-only nad produkcí `xkzhjldrojjlrkezorey` dne 30. 9. 2026 (`main` `937a030c`).
Před spuštěním se musí zopakovat `02_precheck.sql` — skript resetu navíc sám odmítne běžet,
pokud v `public` najde tabulku, kterou tato mapa nezná, nebo mu nějaká chybí.

| Soubor | Co dělá | Zapisuje? |
|---|---|---|
| `01_backup_production.ps1` | úplný `pg_dump -Fc` produkce + ověření `pg_restore -l` | jen lokální soubor |
| `02_precheck.sql` | kontrola před resetem | ne |
| `03_reset.sql` | reset v jedné transakci s kontrolami před a po | **ano** (s `c_dry_run = true` ne) |
| `04_postcheck.sql` | kontrola po resetu | ne |
| `05_vault_cleanup.sql` | smazání osiřelých Shoptet odkazů ve Vaultu | ano, samostatný krok |

## Zachovaný účet

| Položka | Hodnota |
|---|---|
| e-mail | `divispavel2@gmail.com` (jediný účet s tímto e-mailem) |
| auth user ID | `60f5837e-a280-4ddd-b0dd-f94cc844bb3b` |
| role | `user_roles.role = superadmin` (jediný superadmin), `public.users.role = superadmin` |
| přihlášení | 2 identity (e-mail + OAuth), e-mail potvrzen 14. 9. 2025 |
| profil | `public.profiles` + `public.users` řádek |

**Beze změny zůstane:** `auth.users`, `auth.identities`, `public.users`, `public.profiles`,
`public.user_roles` superadmina. Skript si před resetem spočítá otisk (md5) těchto řádků a po
resetu ho porovná — jakákoli změna = rollback.

**Zůstane, ale bez testovacích dat:** peněženka superadmina (řádek zůstává, `balance_coins`
10 077,91 → 0, `bonus_balance_coins` 8 → 0; jeho MIO sady, pohyby, platby, tikety, výhry,
zprávy a notifikace jsou testovací a mažou se). Jeho 3 zařízení pro push a 12 cookie souhlasů
zůstávají. Oprávnění z `admin_permissions` nepotřebuje — superadmin má vše implicitně.

## Co se smaže

**Účty:** všech ostatních 776 auth účtů (vč. adminů `jan.bulir@onemil.cz`, `admintest@onemil.cz`,
provozního `pepca@onemil.cz` a všech testovacích/CI účtů) + kaskádou jejich identity, relace,
refresh tokeny, `public.users`, profily, peněženky, role, oprávnění, zařízení, právní souhlasy.
Navíc 3 osiřelé záznamy `auth.identities` (uživatel už neexistuje).

**Provozní data — `TRUNCATE` 102 tabulek (počty 30. 9. 2026):**

| Oblast | Tabulky (řádky) |
|---|---|
| Soutěže | contests (45), bonus_prizes (1 043 656), tickets (4 179), winners (158), winner_status_history (2), contest_media (43), contest_economy (9), contest_bundle_purchases (57), user_contest_favorites (3), prizes, partner_offer_contests (136), partner_offer_selected_contests, voucher_distribution_contests (5) |
| Peněženky a platby | payments (139), payment_immediate_use_consents, wallet_lots (73), wallet_lot_movements (73), wallet_transactions (3 815), bonus_transfer_history (9) |
| Vouchery / garantované benefity | vouchers (34), voucher_versions (2), voucher_codes (650), voucher_code_batches (6), voucher_distribution_orders (2), voucher_distribution_price_rules (2), voucher_issuances (57), voucher_audit_events (182), voucher_gallery_images (6), user_vouchers (102) |
| Partneři, Shoptet, faktury, nabídky | partner_api_keys (17), partner_api_key_usage (1), partner_api_requests (6), partner_coin_activations (6), partner_customer_refs, partner_invoices (7), partner_invoice_exports (15), partner_invoice_items, partner_invoice_item_sources, partner_invoice_lines (3), partner_offers (4), partner_offer_activations (113), partner_offer_billing_configs, partner_offer_clicks (94), partner_offer_invoice_lines, user_partner_offers (121), partner_pending_attributions, partner_product_reward_rules (1), partner_reward_codes (29), partner_seen_products (12), shoptet_connection_requests (5), shoptet_connection_baseline_orders, shoptet_import_runs (94 976), shoptet_import_row_log (2 073 320), merchant_affiliate_referrals |
| Affiliate / výplaty / influenceři / doporučení | affiliate_commissions (1), affiliate_commission_payments, affiliate_commission_recoveries, affiliate_commission_recovery_allocations, affiliate_company_leads (1), affiliate_company_refs (1), affiliate_customer_refs, affiliate_payout_batches, affiliate_payout_batch_items, affiliate_payout_documents, affiliate_payout_document_snapshots, influencer_campaigns (1), influencer_campaign_bonuses_czk (1), influencer_campaign_events (1), influencer_campaign_partners (1), influencer_commissions (4), influencer_referrals (2), referrals (2), referral_codes (71), referral_rewards (17), referral_reward_adjustments, referral_shortfalls, referral_shortfall_repayments, referral_attempts, referral_blocked_users (1), user_security_signals |
| Komunikace | messages (2 454), notifications (3 985), push_log (41), push_retry, email_queue (327) |
| Události, audit, logy | event_logs (710), event_queue (14 394), event_forward_log (754), debug_event_log (30 211), audit_logs (49 143), admin_actions (37 696), cron_audit_log (3), user_play_activity, user_legal_acceptances (744) |
| Bannery | banners (13), coming_soon_banners (3) |
| Staré zálohovací tabulky | backup_audit_logs (47 124), backup_contests (21), backup_tickets (3 265), backup_winners (20), winners_orphan_backup, _backup_vereonika_bad_codes_20260817 (12) |

**`DELETE`:** partners (14 — mj. BOHEMIA INFINITY, vereonika sro, Apartmán Portus, botanic,
Iconic Point, testovací), affiliate_accounts (3). Ostatní cookie souhlasy (92).

**Vault (samostatný krok 05):** 2 Shoptet exportní odkazy smazaných partnerů.

## Co zůstane

- **Struktura:** všechny tabulky, sloupce, indexy, cizí klíče, RLS policy, funkce, triggery,
  views, migrace (`supabase_migrations` 559 záznamů), role, granty.
- **Edge Functions:** všechny beze změny (nejsou v databázi).
- **Konfigurace:** `settings` (22 klíčů), `roles` (2), `_messages_policies_backup` (13).
- **Právní a informační texty:** `content_pages` (18 — VOP, GDPR, pravidla soutěže, cookies,
  autorská práva, kontakt, FAQ…). Zdroj pravdy zůstává `docs/pravni-dokumenty/`.
- **Obchodní CRM — konfigurace:** `sales_lead_groups` (11), `sales_lead_public_email_domains` (26),
  `sales_lead_email_templates` (7), `sales_lead_email_automation_settings` (1) a vždy seznam
  „nekontaktovat" `sales_lead_email_suppression` (9).
- **Obchodní CRM — data:** podle rozhodnutí D1 (níže).
- **Crony** (13 jobů), **Vault** systémové secrety (9), **pg_net**, **realtime**,
  `auth.audit_log_entries` (spravuje Supabase Auth; skript na ně nesahá).
- **Soubory ve Storage** (5 080 objektů) — SQL je smazat nesmí (`storage.protect_delete`);
  viz rozhodnutí D4.

## Pořadí resetu

1. Pavel spustí `01_backup_production.ps1` → ověřená záloha (restore se neprovádí).
2. `02_precheck.sql` (read-only) — porovnat s touto mapou (136 tabulek v `public`).
3. `03_reset.sql` s `c_dry_run = true` na produkci — suchý běh, vše se vrátí.
4. Po výslovném schválení: `03_reset.sql` s `c_dry_run = false`. Uvnitř jedné transakce:
   1. kontroly před (parametry, superadmin, úplná klasifikace tabulek, zámek zachovaných tabulek,
      počty zachovaných tabulek, otisk účtu superadmina),
   2. přepis autorství ve sloupcích s RESTRICT na `auth.users` v tabulkách, které zůstávají,
   3. `TRUNCATE … RESTART IDENTITY` 102 tabulek (+16 CRM v režimu `delete`) bez `CASCADE` —
      pokud by na ně odkazovala tabulka mimo sadu, reset se celý vrátí,
   4. vynulování číselných řad affiliate dokladů a dávek,
   5. `DELETE` partnerů a affiliate účtů,
   6. peněženka superadmina na 0 (bez spuštění synchronizace MIO sad), cizí cookie souhlasy,
   7. `DELETE` ostatních auth účtů (kaskády) + osiřelé auth záznamy + pojistka pro osiřelé řádky,
   8. kontroly po (níže) — při jakékoli odchylce rollback,
   9. jeden záznam `audit_logs` `first_prelaunch_reset`.
5. `04_postcheck.sql` (read-only).
6. Po schválení `05_vault_cleanup.sql`.
7. Úklid Storage (D4) — samostatně.

Doporučení: spustit v klidném okně. Skript má `lock_timeout` 15 s; pokud cron zrovna drží
zámek, reset skončí chybou bez změn a stačí ho zopakovat.

## Očekávané počty po resetu

| Objekt | Po resetu |
|---|---|
| auth.users / auth.identities | 1 / 2 |
| public.users / profiles / user_roles / wallets | 1 / 1 / 1 (superadmin) / 1 (0 MIO, 0 bonus) |
| admin_permissions | 0 |
| user_devices / cookie_consents | 3 / 12 (superadmin) |
| 102 provozních tabulek + partners + affiliate_accounts | 0 |
| audit_logs | 1 (`first_prelaunch_reset`) |
| wallet_lot_consistency_issues() | 0 |
| settings / content_pages / roles | 22 / 18 / 2 |
| CRM data | `keep_reassign`: beze změny počtu (30. 9.: leady 503, aktivity 1 304, doručení 244…) · `delete`: 0 |
| suppression / šablony / skupiny / veřejné domény | 9 / 7 / 11 / 26 |
| cron.job / vault.secrets | 13 / 11 (9 po kroku 05) |

## Rozhodnutí, která musí udělat Pavel

**D1 — obchodní CRM (blokuje spuštění, `c_crm_mode` je bez něj `null` a skript skončí chybou).**
CRM **nejsou testovací data**: 244 skutečně odeslaných e-mailů reálným firmám, 288 oslovených,
9 odpovědí, 10 leadů „nekontaktovat". 275 leadů, 3 dávky, 132 doručení a 15 běhů příjmu leadů
založil účet `pepca@onemil.cz`, který má reset smazat — a tyto sloupce mají na auth účet
RESTRICT, takže nejde smazat účet a zároveň nechat CRM beze změny.
- `keep_reassign` (**doporučeno**): CRM zůstane, u 425 záznamů se autor přepíše na superadmina
  (zapíše se do auditu resetu); u 579 aktivit a 134 změn stavu se autor vynuluje kaskádou
  (`SET NULL`). Deduplikace i agent Magin pokračují bez rizika opakovaného oslovení.
- `delete`: CRM se smaže (zůstane jen seznam „nekontaktovat" a šablony). **Riziko:** discovery
  a Magin mohou znovu najít a oslovit 288 už oslovených firem.

**D2 — admin účty.** Podle zadání zůstane jen superadmin; smažou se i `jan.bulir@onemil.cz`
(admin) a `pepca@onemil.cz`. Po resetu je nutné je znovu pozvat přes `/admin/admins`.

**D3 — spuštění soutěží po resetu.** Smaže se i neomezený fallback benefit (Apartmán Portus,
`PORTUS26`). Guard `guaranteed_benefit_active_contest_guard_enabled = true` pak nedovolí
aktivovat žádnou soutěž, dokud se nezaloží nový neomezený benefit. `settings.
guaranteed_benefit_purchase_contest_allowlist` bude obsahovat ID smazaných soutěží — při
zakládání první ostré soutěže je nutné ho aktualizovat. Skript nastavení nemění.

**D4 — soubory ve Storage (5 080).** Obrázky a PDF testovacích soutěží, sdílecí obrázky tiketů,
faktury, loga, vouchery a bannery zůstanou dostupné na starých veřejných URL, dokud se nesmažou
přes Storage API (Dashboard → Storage, nebo skript se service klíčem). Doporučené bucket:
`contest-images` (3 438), `ticket-shares` (1 304), `voucher-images` (92), `banner-images` (91),
`contest-banners` (73), `contest-rules` (48), `partner-invoices` (15), `partner-logos` (8),
`partner-offer-assets` (6), `affiliate-bank-exports` (1), `affiliate-payout-docs` (1).
Ponechat `assets` (1) a `avatars` (2 — ověřit vlastníka).

**D5 — číslování dokladů.** Faktury se číslují z nejvyššího existujícího čísla → po resetu
začnou znovu od `OMA-20260001`. Skript vynuluje i řady výplatních dokladů a dávek affiliate.
Testovací faktury `OMA-20260001–0004` byly odeslány jen interně (`eshop@onemil.cz`); pokud
by účetní chtěla navazující řadu, nesmí se nulovat — jinak je nová řada čistá.

## Rizika

- **Nevratnost.** Po commitu jde vrátit jen obnovou celé databáze ze zálohy (PITR je vypnutý)
  — proto je ověřená záloha podmínkou a skript bez `c_backup_file` neběží.
- **Souběžné crony** (Shoptet import každou minutu, obchodní worker) mohou reset zablokovat
  zámkem → skončí chybou bez změn; opakovat.
- **Skutečné firmy v CRM** — viz D1.
- **Po resetu:** Shoptet import nemá žádného partnera (cron běží naprázdno), partneři se musí
  znovu registrovat a Shoptet napojit od nuly (baseline se vytvoří při schválení).
- **Staré veřejné soubory ve Storage** — viz D4.

## Ověření skriptu

`03_reset.sql` prošel 30. 9. 2026 suchým během na **stagingu** `dxmowysntemfqfnanxua`
(kopie jen s ID stagingového superadmina a stagingovými rozdíly v tabulkách), transakce se
pokaždé vrátila a staging zůstal beze změny:
- `keep_reassign`: 1 143 auth účtů, 104 vyprázdněných tabulek, všechny kontroly po OK;
- `delete`: 1 143 auth účtů, 119 vyprázdněných tabulek, kontroly po OK.
Suchý běh odhalil a opravil: osiřelé auth relace/identity (kaskáda je nezachytí) a kontrolu
role superadmina (nahrazena otiskem účtu). Úklid Vaultu byl opraven: nekvalifikované `name`
se vázalo na `partners.name` a smazalo by i odkazy živých partnerů.
