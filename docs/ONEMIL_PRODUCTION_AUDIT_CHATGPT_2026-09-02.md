# OneMil — produkční audit ChatGPT

Datum: 2026-09-02
Rozsah: read-only kontrola produkčního Supabase + aktuálních provozních logů. Nebyly provedeny žádné destruktivní změny ani opravy.

## 1. Základní stav dat

- auth.users: 781
- profiles: 781
- wallets: 781
- contests: 45
- tickets: 4 142
- winners: 139
- payments: 138
- vouchers: 33
- messages: 2 486
- audit_logs: 49 034

### Potvrzená integrita

- 0 auth uživatelů bez wallet
- 0 auth uživatelů bez profile
- 0 záporných wallet zůstatků
- 0 duplicitních wallet na jednoho uživatele
- 0 duplicitních čísel tiketů v rámci stejné soutěže
- 0 orphan tickets bez contestu
- 0 orphan winners bez ticketu
- 0 winner/ticket contest mismatch
- 0 duplicitních Stripe session ID

To je silný pozitivní signál pro základní integritu hlavních dat.

## 2. Wallet / tiket / voucher — důležité potvrzení z produkční DB

### buy_ticket_atomic

Produkční funkce kontroluje:
- uživatel musí být přihlášený,
- p_user_id nesmí být jiný než auth.uid(),
- soutěž musí existovat a být active,
- nesmí být vyprodaná,
- wallet musí existovat,
- zůstatek musí stačit,
- soutěž i wallet se zamykají pro souběh,
- po nákupu se zapisuje wallet_transactions.

Aktuální stav: konstrukce je bezpečná proti běžnému přístupu k cizímu účtu a používá zamykání pro souběžné operace. Plný živý E2E test ještě musí potvrdit UI → DB → výhra → notifikace.

### buy_voucher_atomic

Produkční funkce kontroluje:
- p_user_id musí odpovídat auth.uid(),
- wallet se zamyká,
- cena je kanonicky 5 MC,
- nedostatek prostředků se blokuje,
- voucher musí být veřejný a v platném termínu,
- hlídá se max_quantity,
- již zakoupený voucher se blokuje,
- voucher kód se vybírá přes FOR UPDATE SKIP LOCKED,
- vydaný kód se označí jako issued,
- odečet se zapíše do wallet_transactions.

Aktuální stav: návrh je výrazně odolný proti paralelnímu přidělení stejného voucher kódu. Plný paralelní E2E test ještě chybí.

## 3. Platby

- 130 payments má status completed.
- 8 payments má status refunded.
- 81 payment řádků má Stripe session ID.
- 0 duplicitních Stripe session ID.
- 0 payments bez statusu.

Pozitivní: aktuální data nevykazují duplicitu stripe_session_id.

Neuzavřené: stále je potřeba cílený souběžný test dvojího doručení webhooku a kompletní reconciliation payment → wallet_transaction → wallet balance.

## 4. Výhry

Stav produkčních winners:
- celkem 139
- delivered=false: 139
- user_seen=false: 9
- status „čeká na potvrzení“: 137
- status „pending“: 1
- status „připraveno k odeslání“: 1

Nález:
- datově existuje rozlišení status + delivered + user_seen,
- většina výher je stále ve stavu čekajícím na potvrzení,
- žádná výhra není označená jako delivered.

To samo o sobě nemusí být chyba, ale je povinné ověřit, že administrace tyto čekající případy jasně zvýrazňuje a že po vyřízení badge/count zmizí.

## 5. Zprávy

- messages celkem: 2 486
- unread: 226

Nález:
- v produkci reálně existuje významný počet nepřečtených zpráv,
- databáze tedy read/unread stav skutečně používá.

Je potřeba E2E ověřit, že všechny odpovídající badge/count v administraci a uživatelském UI přesně odpovídají databázi a po přečtení se správně sníží.

## 6. E-mail queue

Stavy:
- sent: 235
- failed: 4
- ignored: 4
- pending: 1

Časové rozložení:
- poslední sent: 2026-08-31
- jediný pending je starý od 2026-07-12
- failed záznamy jsou staré z února 2026

Provozní logy 2026-09-02:
- process-email-queue vrací opakovaně HTTP 200
- process-sales-lead-email-batch vrací opakovaně HTTP 200

Nález:
- samotný worker běží,
- queue má ale jeden dlouhodobě visící pending záznam, který musí být vysvětlen,
- HTTP 200 ještě nedokazuje fyzické doručení každého e-mailu.

## 7. Push notifikace / OneSignal

push_log:
- sent: 9
- pending: 15
- error: 9
- failed: 2

Časově:
- poslední sent: 2026-08-24
- pending záznamy jsou staré až do 2026-07-23
- failed jsou z 2026-07-23
- error jsou starší březen–květen

Nález:
- push pipeline prokazatelně někdy odeslala notifikace,
- zároveň existuje 15 historických pending položek a 11 error/failed položek,
- bez device E2E nelze push označit jako plně funkční.

## 8. Cron úlohy

Aktivní:
- forward_messages_to_sofinity — každou minutu
- process_email_queue_every_10_min
- weekly_partner_invoices
- referral_inactivity_daily
- influencer_commissions_monthly
- send_offer_reminders_daily
- affiliate_company_commissions_monthly
- sales_lead_discovery_worker_min
- sales_lead_email_batch_worker_every_5_min
- sales_lead_discovery_scheduler_daily
- shoptet_auto_import_1min

Vypnutý:
- process-event-queue — active=false

Důležitý nález:
- přestože hlavní Sofinity process-event-queue je vypnutý, cron `forward_messages_to_sofinity` stále běží každou minutu a za posledních 24 h měl 1 440 úspěšných spuštění na úrovni DB cronu.
- To je potřeba prověřit proti aktuálnímu rozhodnutí „Sofinity nyní nepoužíváme“. Není vhodné nic vypínat bez samostatného potvrzení, ale musí být jasné, co tento cron reálně dělá.

Pozor: stav cron.job_run_details `succeeded` znamená, že databázový cron příkaz doběhl; neznamená automaticky úspěch vzdálené Edge Function.

## 9. Shoptet import — potvrzený provozní problém

Edge Function `import-shoptet-orders` v dnešních produkčních logách opakovaně střídá HTTP 200 a HTTP 500 při minutovém volání.

Zároveň cron `shoptet_auto_import_1min` běží každou minutu.

Stav: CHYBA / nestabilní tok.

Není možné Shoptet import označit jako plně funkční, dokud se nezjistí přesná příčina 500 odpovědí a neověří se, zda 500 nezpůsobují chybějící/duplicitní objednávky nebo opakované zpracování.

## 10. RLS na hlavních tabulkách

RLS je zapnuté na:
- profiles
- wallets
- vouchers
- payments
- contests
- tickets
- winners
- messages
- bonus_prizes
- partners
- audit_logs

Hlavní tabulky mají RLS policies kromě audit_logs, kde je RLS zapnuté a policy_count=0. To znamená, že běžný klient audit_logs přímo číst nemá; není to samo o sobě chyba, pokud jsou logy záměrně pouze pro server/admin cesty.

## 11. Supabase Security Advisor — závažné nálezy

### ERROR

`public.public_partners` je SECURITY DEFINER view.

To musí být ručně posouzeno, protože takový view může obcházet oprávnění volajícího podle oprávnění vlastníka view.

Remediation dokumentace Supabase:
https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

### WARN — SECURITY DEFINER funkce dostupné anon/authenticated

Supabase aktuálně hlásí velké množství SECURITY DEFINER funkcí, které mají EXECUTE pro anon a/nebo authenticated. Mezi citlivými názvy jsou například:
- admin_manage_contest
- admin_manage_bonus_prize
- admin_begin_miocoin_save
- admin_append_miocoin_chunk
- admin_finalize_miocoin_save
- admin_block_referrer
- create_partner_api_key
- update_bonus_prize_delivery_status
- get_admin_top_bar_stats
- set_user_role
- buy_ticket_atomic
- buy_voucher_atomic
- další finanční, partner a sales RPC

Důležité upřesnění:
- samotný lint NEZNAMENÁ, že je funkce zneužitelná.
- například `admin_manage_contest`, `admin_manage_bonus_prize`, `get_admin_top_bar_stats` a `set_user_role` mají uvnitř vlastní kontrolu role uživatele.
- `buy_ticket_atomic` a `buy_voucher_atomic` uvnitř ověřují auth.uid() proti p_user_id.

Proto se nesmí plošně revoke EXECUTE bez auditu každé funkce. Je ale nutné udělat úplnou matici: kdo má EXECUTE + jaká je vnitřní ochrana + zda lze RPC zavolat přímo z REST API.

Remediation:
https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable

### WARN — mutable search_path

Supabase hlásí řadu funkcí bez pevně nastaveného search_path. Mezi citlivými oblastmi jsou například:
- admin_manage_contest
- create_winner_for_contest
- notify_winner
- partner API funkce
- referral funkce
- invoice funkce
- push funkce
- Sofinity funkce

Část novějších funkcí už search_path nastavený má, část ne. Toto je samostatná security-hardening oblast.

Remediation:
https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

### WARN — leaked password protection disabled

Supabase Auth má vypnutou ochranu proti známým uniklým heslům.

Remediation:
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## 12. RLS enabled bez policy

Security Advisor uvádí více tabulek s RLS enabled a bez policy. Některé jsou záměrně interní a mohou být správně úplně nepřístupné klientům, např.:
- audit_logs
- email_queue
- push_log
- push_retry
- user_security_signals
- partner_api_key_usage
- referral_attempts
- referral_blocked_users
- některé sales/influencer interní tabulky
- staré backup tabulky

To není automaticky chyba. Musí se ověřit, zda je každá taková tabulka opravdu server-only. Backup/debug tabulky by měly být samostatně posouzeny, zda v produkci ještě mají být.

## 13. Co je dnes možné označit jako silně potvrzené

- každý auth user má profile i wallet
- žádná wallet není záporná
- žádný uživatel nemá více walletů
- ticket čísla nejsou duplicitní v rámci soutěží
- nejsou orphan tickets
- nejsou orphan winners
- winner/ticket contest vazby sedí
- nejsou duplicitní Stripe session ID
- buy_ticket_atomic má vlastní user guard a transakční zamykání
- buy_voucher_atomic má vlastní user guard, zamykání a SKIP LOCKED na voucher kódech
- process-email-queue nyní běží s HTTP 200
- process-sales-lead-email-batch nyní běží s HTTP 200
- process-event-queue cron je vypnutý

## 14. Co dnes nelze označit jako plně funkční

- Shoptet import — reálné HTTP 500 v produkci
- push notifikace — historické pending/error/failed a bez reálného device E2E
- kompletní e-mail doručitelnost — worker běží, ale 1 starý pending záznam a bez mailbox E2E
- kompletní winner pending/badge workflow — data existují, ale UI E2E chybí
- kompletní messages unread/badge workflow — data existují, UI E2E chybí
- Stripe concurrent webhook idempotence — chybí aktuální cílený paralelní test
- kompletní wallet reconciliation
- kompletní provizní/fakturační reconciliation
- partner/influencer/referral end-to-end
- úplná bezpečnostní matice SECURITY DEFINER RPC
- public_partners SECURITY DEFINER view
- vypnutá leaked-password protection
- staré backup/debug tabulky v produkci
- důvod, proč forward_messages_to_sofinity stále běží každou minutu, když Sofinity nyní nepoužíváme

## 15. Priorita dalšího auditu / oprav

1. Bezpečnostní prověření `public_partners` SECURITY DEFINER view.
2. Matice všech citlivých SECURITY DEFINER RPC: ACL + vnitřní role guard + přímé REST volání.
3. Přesná příčina HTTP 500 u `import-shoptet-orders`.
4. Winner pending workflow a admin badge/count.
5. Messages unread workflow a badge/count.
6. Push OneSignal reálný device test + vysvětlení pending/error/failed.
7. E-mail reálné doručení + vysvětlení starého pending řádku.
8. Stripe paralelní webhook/idempotence test.
9. Wallet/payment/voucher/provize reconciliation.
10. Sofinity: vysvětlit aktivní `forward_messages_to_sofinity` cron před dalším rozhodnutím.

## 16. Důležité omezení tohoto reportu

Toto je read-only produkční audit databáze a logů. Neověřuje vizuální UI chování v browseru, skutečné doručení push na fyzické zařízení, skutečné doručení e-mailu do mailboxu ani všechny možné uživatelské role. Tyto části musí doplnit Code/E2E/browser audit podle master checklistu A01–A16.
