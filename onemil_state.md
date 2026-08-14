# OneMil – aktuální stav projektu

> **Autoritativní aktuální stav. Aktualizováno 13. 8. 2026.**
> Historický vývoj je v `onemil_history.md` a v Git historii. Pokud starší dokumentace odporuje tomuto souboru, pro současný provoz platí tento soubor a skutečný stav ověřený v GitHubu/Supabase.

## 0b. Paperclip marketingový tým OneMil (ověřeno 13. 8. 2026)

Živý Paperclip stav marketingového týmu:

- Hierarchie: Pavel → Provozní ředitel OneMil → Martin – vedoucí marketingu OneMil → Content & Community Planner OneMil / Performance Analyst OneMil.
- **Martin – vedoucí marketingu OneMil** (`be26a7d0-bb12-4720-b535-a1c656f355ae`): `idle`, model `gpt-5.5`, reportsTo Provozní ředitel OneMil, `canCreateAgents=false`, `canCreateSkills=false`, `heartbeat.enabled=false`, budget `0 Kč`. Řídí oba marketingové specialisty a připravuje jeden konsolidovaný marketingový výstup pro Provozního ředitele. OneMil Brand Kit / Brand Manual je závazný zdroj.
- **Content & Community Planner OneMil** (`2c257400-e694-4286-be4a-b015d23221f9`): `idle`, model `gpt-5.5`, reportsTo Martin – vedoucí marketingu OneMil, `canCreateAgents=false`, `canCreateSkills=false`, `heartbeat.enabled=false`, budget `0 Kč`. Připravuje content plány, copy, captiony, CTA, scénáře krátkých videí/Reels/TikTok, kreativní briefy a community návrhy.
- **Performance Analyst OneMil** (`16844c6f-8960-43a8-a71c-f599e33c3ee2`): `idle`, model `gpt-5.5`, reportsTo Martin – vedoucí marketingu OneMil, `canCreateAgents=false`, `canCreateSkills=false`, `heartbeat.enabled=false`, budget `0 Kč`. Řeší KPI, reporting a vyhodnocení výkonu obsahu; dokud nemá skutečná data, nemá zbytečně běhat pravidelně.
- Marketingoví agenti jsou přesně 3, žádná duplicita. Nemají social secrets, publishing práva, ads práva ani možnost utrácet. `ICO-53` už není v permanentních agent instructions; jednorázové úkoly patří do Paperclip issues.
- Magin a Synchronizátor zůstali nedotčeni: jejich modely, permissions, heartbeat, secrets a rutiny nebyly změněny. Žádná nová marketingová rutina nebyla aktivována. Board approval nebyl potřeba, protože nevznikal nový agent.

## 0. Denní e-mailové dávky a propojení pro externího agenta (ověřeno 11. 8. 2026)

Read-only ověřeno přímo na produkci `xkzhjldrojjlrkezorey`:

- **Automatika je zapnutá** (`enabled = true`), pásmo `Europe/Prague`, okno `08:30–16:30`.
- **Denní limit je 90.** Starší dokumentace uvádějící 20 je neplatná; 20 je hodnota stagingu.
- **Worker běží každých 5 minut.** pg_cron job 30 `sales_lead_email_batch_worker_every_5_min`
  (`*/5 * * * *`, aktivní) volá `run_sales_lead_email_batch_worker_cron()`, ta si vezme token a URL
  z Vaultu, ověří, že URL míří na produkční projekt, a zavolá Edge Function
  `process-sales-lead-email-batch` (ACTIVE v10). Za 24 h 288 běhů, všechny `succeeded`.
- **Kapacita okna je těsná.** Worker zpracuje nejvýš jednu položku na běh → v okně 08:30–16:30
  je ~96 slotů. Při cílových 90 e-mailech denně to je ~94 % kapacity, prakticky bez rezervy.
  Sledovat od 17. 8. 2026 (70 e-mailů) výš.
- **Edge Function `sales-lead-daily-batch-agent` je nasazená na produkci** (v1 ACTIVE,
  `verify_jwt=false`, autorizace vlastním secretem `SALES_LEAD_BATCH_AGENT_SECRET`).
  Produkční secret je jiná hodnota než stagingový.
- RPC `sales_lead_email_batch_agent_run(date, integer)`: `SECURITY DEFINER`, `search_path = ''`,
  EXECUTE **pouze `service_role`** (`anon = false`, `authenticated = false`).
- **Bezpečnostní kontroly na produkci prošly** (bez vytvoření dávky): bez secretu → 401,
  špatný secret → 401, GET → 405, nepovolené pole `lead_group` → 400 `unexpected_field`,
  neplatné datum → 400 `invalid_target_date`.
- Po nasazení **nevznikla žádná nová dávka, neodešel žádný e-mail** a pozastavená dávka z 6. 8.
  zůstala pozastavená. Checksum stavů dávek byl před i po nasazení `b42bb7f7…`.
- **Agent Magin je vytvořený a naplánovaný** (Paperclip 2026.722.0, firma `iCONIC POINT s.r.o.`).
  Agent id `3ef09c71-d9a0-43f3-8ce8-c5e9938dae64`, adaptér `codex_local`, search OFF,
  `canCreateAgents=false`, `canCreateSkills=false`, `budgetMonthlyCents=0` (firemní výchozí),
  nadřízený `Provozní ředitel OneMil`. Routine `Denní dávka prvních obchodních e-mailů`
  (`a3ac40b2-7d58-4207-9c5d-1ffc52ee8c8c`, `active`, `catchUpPolicy=skip_missed`,
  `concurrencyPolicy=skip_if_active`) s cron triggerem `30 7 * * 1-5`, `timezone=Europe/Prague`.
  **První ostrý běh 12. 8. 2026 v 7:30 Praha** (`nextRunAt = 2026-08-12T05:30:00Z`), počet 40.
- **Credential je hotový.** `SALES_LEAD_BATCH_AGENT_SECRET` je bezpečně uložený v Paperclip
  credential store (`local_encrypted`, `paperclip_managed`, stav `active`) a **stejná nová hodnota
  je nastavená v produkčním Supabase**. Hodnota vznikla jen v paměti a **není nikde zveřejněná ani
  uložená** — v dokumentaci, gitu, promptu, instrukcích agenta, issue ani logu; Paperclip API ji
  nevrací. Shodu obou uložených hodnot **definitivně potvrdí až první ostrý běh 12. 8. 2026**,
  protože každé úspěšné volání funkce zakládá dávku, a proto se novou hodnotou vědomě nevolalo.
- **Paperclip nepodporuje vlastní profilový obrázek agenta.** Pole `icon` je pevný výčet 41
  vestavěných ikon; `iconAssetId` ani `avatarAssetId` neexistuje (nahrávání obrázků je jen pro
  logo firmy). Magin má proto vestavěnou ikonu `mail` a schválená postavička je uložená jako
  cesta v jeho `metadata.approvedAvatarPath`.
- Schválený profilový obrázek Magina je na cestě
  `C:\Users\divis\Downloads\ChatGPT Image 11. 8. 2026 11_37_39.png` (3D postavička s headsetem).
  **Obrázek MioCoinu se pro Magina nesmí použít**, ani když se automaticky přiloží do konverzace.

## 0c. Paperclip — finální ověřený stav k 11. 8. 2026

Zdroj pravdy pro Paperclip je `PAPERCLIP_SETUP_CONTEXT.md`; tohle je jen shrnutí.

- **Synchronizátor Paperclip OneMil je funkční end-to-end.** Ingest vrátil **HTTP 200**, úkol
  `ICO-41` skončil `done` a ve stagingu vznikl snapshot
  **`7be66d9c-e984-42d3-9d1e-1e5e4001260a`** (`captured_at 17:26:45`, 43 kB).
- **API Access na `PAPERCLIP_BRIDGE_SECRET` funguje** — načtení přes run-bound agent JWT je
  doložené v access-events.
- **Synchronizátor odesílá přes Node fetch, nikdy PowerShell ani `curl.exe`.** Ve Windows sandboxu
  oba selhávají (`curl` vrací `000`, PowerShell hlásí „Nadřízené připojení bylo uzavřeno"),
  přestože síť funguje.
- **Payload kontrakt je `snake_case`** — `source_instance`, **`captured_at`**, `payload`.
  `capturedAt` v camelCase vrací `HTTP 400`.
- **Magin má funkční API Access na `SALES_LEAD_BATCH_AGENT_SECRET`**
  (`access.SALES_LEAD_BATCH_AGENT_SECRET` vázaný na jeho agent id).
- **Magin má funkční API Access na STAGING lead-supply adapter**
  (`access.SALES_LEAD_MAGIN_SUPPLY_AGENT_SECRET` vázaný na jeho agent id). Hodnota secretu není
  v dokumentaci, gitu, promptu, issue ani logu.
- **Maginova rutina používá Node fetch a přesný kontrakt** `sales-lead-daily-batch-agent`:
  `{"schema_version":1,"target_date":"YYYY-MM-DD","requested_count":<počet>}` — jakýkoli klíč navíc
  vrací `400 unexpected_field`; `target_date` je pražské datum.
- **Magin před denní dávkou zajišťuje i zásobu leadů**, ale pouze přes existující OneMil lead-supply
  adapter a existující OneMil discovery systém. Schvaluje jen backendově ověřené návrhy `navrzeny`,
  které adapter dovolí schválit; pokud zásoba nestačí a neběží aktivní discovery job, spustí přes
  adapter discovery job. Segment je pevně `e-shopy` a Magin ho nesmí měnit.
- **Magin je připravený na první ostrý běh 12. 8. 2026 v 7:30 Europe/Prague** (40 e-mailů).
  Skutečným během ověřen **není** a nemůže být — každé úspěšné volání zakládá reálnou dávku.
- **Průzkumník obchodních leadů OneMil byl z Paperclipu odstraněn** 11. 8. 2026. Jeho zastaralý
  paralelní lead-research úkol `ICO-17` byl zrušen/skryt a pending potvrzení odmítnuta.
- **Provozní ředitel OneMil má funkční nouzové upozornění přes Telegram bota `@OneMilDirectorBot`.**
  Používá ho pouze pro chyby, blokace a důležité eskalace podřízených agentů; neposílá běžné statusy,
  marketing ani zprávy leadům. Bot token a `chat_id` jsou uložené pouze v Paperclip `local_encrypted`
  secrets a oba mají **API Access → Bound to latest** pouze pro Provozního ředitele. Testovací zpráva
  byla úspěšně doručena.

## 1. Obchod / Leady – první automatické e-maily jsou produkčně funkční

Automatické dávkové odesílání prvního obchodního e-mailu je na produkci **hotové a ověřené end-to-end**.

Aktuální produkční stav `xkzhjldrojjlrkezorey`:
- `sales_lead_email_automation_settings.enabled = true`.
- Časové pásmo `Europe/Prague`.
- Odesílací okno `08:30–16:30`.
- Automatické/dávkové první e-maily mají globální limit **20 `batch_initial` za den**.
- Ruční první e-maily (`manual_initial`) jsou **bez tohoto limitu** a nesnižují automatickou kapacitu 20.
- Worker cron je aktivní a zpracovává naplánované dávky po jednotlivých položkách.
- Produkčně jsou evidovány úspěšné `batch_initial` deliveries ve stavu `committed`; skutečný test z 9. 8. 2026 proběhl úspěšně.

### Potvrzený produkční E2E test 9. 8. 2026

Dávka `31251e38-e770-455e-aa49-769f614ed7d6` byla naplánovaná pro `eshop@onemil.cz` na 14:54 Praha. Worker ji zpracoval při nejbližším běhu v 14:55.

Výsledek:
- batch `completed`,
- item `sent`,
- `attempt_count = 1`,
- delivery `batch_initial / committed`,
- provider zprávu přijal,
- `provider_accepted_at` i `committed_at` jsou zapsané,
- žádný duplicitní pokus.

Tím je reálně potvrzen celý tok: **příprava → ruční aktivace dávky → cron worker → provider → commit → dokončená dávka**.

## 2. Příprava a aktivace dávky

Aktuální pravidlo:

1. Admin vybere leady, šablonu a datum.
2. `sales_lead_email_batch_prepare_paused(...)` **vždy připraví novou dávku jako `paused`**, a to i když je globální automatika zapnutá.
3. Samotná příprava nikdy nesmí odeslat e-mail.
4. Dávka začne být způsobilá pro worker teprve po výslovném kliknutí **„Spustit dávku“**.
5. Aktivace používá admin RPC `sales_lead_email_batch_activate_admin(...)`.
6. Přímá klientská cesta `sales_lead_email_batch_create(...)` je pro `authenticated` odebraná; klient používá bezpečný wrapper.

Oprava tohoto toku je v PR #334, merge commit `8f1dfa0e7ad9525d6c54dfae42b83255d5873f16`. Migrace `20260809170000_sales_lead_prepare_paused_when_automation_on.sql` je aplikovaná na stagingu i produkci.

## 3. Přepínač automatiky v administraci

Frontend obsahuje stavový panel:
- `Automatika zapnutá` / `Automatika vypnutá`,
- tlačítko pro zapnutí/vypnutí vidí pouze superadmin,
- používá existující `sales_lead_email_automation_set_enabled(boolean)`,
- stav se po změně znovu načte z DB,
- přepínač sám nevytváří, neaktivuje ani neodesílá dávku.

PR #333 je mergnutý. Produkční frontend byl publikován a ovládání je viditelné v administraci.

**Důležité:** backend RPC pro změnu `enabled` je záměrně **superadmin-only**. Nerozšiřovat na běžného admina bez samostatného schválení.

## 4. Denní limit dávkového odesílání

Produkční `sales_lead_email_batch_claim_next()` obsahuje skutečný claim-time limit:
- max. **20 dávkových e-mailů denně**,
- limit je napříč všemi dávkami daného dne,
- rozhoduje `Europe/Prague`,
- po dosažení limitu vrací `noop / daily_limit_reached`, položka zůstává `pending` a nic se neodešle.

Do spotřeby se počítá dávkový tok:
- item `processing`,
- delivery `batch_initial` ve stavu `sending`, `provider_accepted`, `committed`, `uncertain`.

Do limitu se nezapočítává:
- `prepared`,
- `provider_rejected`,
- `manual_initial`.

Ruční odesílání prvního e-mailu zůstává bez limitu.

Produkční migrace byly aplikovány v pořadí:
1. `20260809120000_sales_lead_daily_send_cap.sql`
2. `20260809140000_sales_lead_daily_cap_batch_only.sql`

Race ochrana zůstává přes `FOR UPDATE`; kill-switch se kontroluje před denním limitem i před claimem položky.

## 5. Bezpečnost prvního e-mailu

Před skutečným dávkovým odesláním se znovu kontroluje zejména:
- automatika je zapnutá,
- dávka je `scheduled`,
- položka je ve svém dni a časovém okně,
- lead stále existuje a je v povoleném stavu,
- `do_not_contact` / suppression,
- lead už není partner,
- e-mail se od vytvoření snapshotu nezměnil,
- e-mail je ověřený,
- první e-mail už nebyl odeslán ani bezpečně claimnut,
- lead není v jiné aktivní dávce,
- duplicitní ochrany.

Delivery tok je dvoufázový a idempotentní. Stavy zahrnují `prepared`, `sending`, `provider_accepted`, `committed`, `provider_rejected`, `uncertain`. `uncertain` se automaticky neopakuje. Pokud provider přijal zprávu a DB commit se nedokončil, další běh provádí pouze `commit_only` a provider se znovu nevolá.

## 6. CTA reakce a inbound odpovědi

První obchodní e-mail používá dvě reakce:
- **Mám zájem**,
- **Nemám zájem**.

`Mám zájem` zapisuje reakci, prioritu a posune lead do odpovědního toku. `Nemám zájem` nastaví `do_not_contact`, `nekontaktovat` a suppression, takže další obchodní e-mail nesmí odejít.

Administrace má přehled `Kontaktovat` a `Nekontaktovat` včetně nepřečtených reakcí.

Běžné odpovědi e-mailem jsou přijímány přes Resend Receiving a `sales-lead-inbound`, párují se k leadu a zapisují `reply_received`. Nepřiřazené zprávy se uchovávají v `sales_lead_unassigned_emails`.

## 7. Stav existujících dávek po testech

K poslední kontrole 9. 8. 2026:
- produkce neměla žádnou čekající `scheduled` dávku po dokončení E2E testu,
- existuje jedna stará `paused` dávka s 19 historickými pending položkami; sama se nikdy neaktivuje,
- dřívější testovací dávka `a3b9fda8-a6f9-4bbe-8442-8aec7e555e45` byla cíleně zrušena (`cancelled`, její položka `cancelled`, `pending=0`),
- nová testovací dávka `31251e38-e770-455e-aa49-769f614ed7d6` byla úspěšně dokončena.

Starou paused dávku neměnit/aktivovat bez výslovného rozhodnutí.

## 8. Discovery nových firem

Discovery infrastruktura je postavená, ale kandidátní vyhledávání je aktuálně blokované OpenAI účtem pro staging:
- diagnostika ukázala `openai_http_status = 429`,
- nejde o neplatný klíč (není 401), ale o kvótu/limit/kredit,
- DuckDuckGo fallback z candidate discovery byl odstraněn, protože z Edge runtime vracel anti-bot odpověď a jako pojistka nebyl použitelný,
- OpenAI je nyní jediný candidate source.

**Klíče nyní nerotovat.** Uživatel chce rotaci secretů/klíčů řešit souhrnně až před produkčním spuštěním. Po doplnění/obnovení OpenAI kvóty je potřeba pouze znovu ověřit discovery job a návazný tok; nestavět nový discovery systém.

Paperclip tok pro doplňování zásoby leadů je nyní soustředěný do Magina. Magin nevytváří vlastní
vyhledávání ani databázi; používá jen úzký STAGING adapter `sales-lead-magin-supply-agent`, který
deleguje na existující OneMil mechanismy. Schvalování návrhů jde přes existující schvalovací cestu
po backendové kontrole bezpečně ověřeného veřejného firemního e-mailu; zakládání discovery jobu jde
přes existující OneMil discovery systém a pouze pro segment `e-shopy`. Stávající denní e-mailová
rutina `sales-lead-daily-batch-agent` zůstává beze změny.

## 9. Co ještě chybí k úplnému dokončení automatického obchodního e-mailového procesu

První automatické oslovení je hotové. Zbývají navazující části:

1. **Automatický follow-up** – dnes existuje ruční follow-up cesta, ale není automatické pravidlo/fronta typu „po N dnech bez odpovědi pošli další e-mail“.
2. **Žádná odpověď** – po posledním follow-upu není automatické pravidlo, které lead uzavře/přesune, takže může zůstat `osloveno` dlouhodobě.
3. **Admin řešení `failed / uncertain`** – bezpečnostní stav existuje, ale chybí jasné UI/workflow, kde člověk rozhodne, co s takovou položkou udělat.
4. **Discovery po obnovení OpenAI kvóty** – ověřit, že automatické hledání firem opět vrací kandidáty a navazuje na ověření firemního webu/e-mailu.
5. **Finální celý obchodní E2E** – po dokončení follow-up části otestovat: discovery → ověření kontaktu → první e-mail → reakce / bez odpovědi → follow-up → finální stav leadu.

### Doporučené pořadí další práce

**Nejbližší další modul: automatické follow-upy.**

Před jeho implementací nový chat musí nejdřív read-only ověřit existující:
- `send-sales-lead-follow-up`,
- dostupné typy šablon a jejich aktuální produkční data,
- stavy leadu `osloveno` / `follow_up` / `odpovedel` / `nekontaktovat`,
- `next_action_at` a existující plánované CRM aktivity,
- suppression/do-not-contact ochrany,
- aby se nevytvářel druhý paralelní systém.

## 10. Známý testovací dluh mimo funkční provoz

P0 Smoke E2E měl historicky červené admin specy 29/31/32 kvůli chybějícímu `E2E_SUPERADMIN_*` seedu v `playwright-staging-p0.yml`. Tento problém je testovací infrastruktura, ne chyba dávkového e-mailového systému. Pozdější Smoke pro PR #334 byl zelený.

## 11. Další důležité aktuální části projektu

- Stripe sandbox tok dobití a refundace je otestovaný a funkční; ochrana proti refundaci již utracených MioCoinů je nasazená.
- Android Capacitor aplikace je v `main`, Application ID `cz.onemil.app`; nativní aplikace skrývá Stripe dobíjení podle store pravidel.
- CSP je aktivní; P2 iframe ochrana a P3 `Cross-Origin-Resource-Policy` jsou vědomě odložené, Cloudflare se nyní nezavádí.
- SPF/DKIM/DMARC stav OneMil byl opraven a apex `onemil.cz` má mít právě jeden SPF; SES/Resend patří na `send.onemil.cz`.
- Live Stripe webhook refundních událostí byl dříve evidován jako samostatný otevřený rollout; před změnou vždy ověřit skutečný aktuální Stripe stav, nic nepředpokládat.
- Shoptet samoobslužné napojení zůstává samostatná oblast; při další práci vždy nejdřív ověřit aktuální GitHub stav.

## 12. Pravidlo pro nový chat / nového agenta

Nový chat nesmí znovu stavět již hotový e-mailový systém. Má vycházet z toho, že **produkční první automatické e-maily jsou hotové a reálně fungují**.

Při pokračování:
1. načíst tento `onemil_state.md`, `onemil_history.md`, `CLAUDE.md` a relevantní `docs/SALES_LEADS_ADMIN_SPEC.md`,
2. ověřit aktuální runtime stav přes GitHub/Supabase,
3. pokračovat pouze v otevřených bodech z §9,
4. vždy řešit jeden krok,
5. nevytvářet paralelní e-mailový/discovery systém,
6. destruktivní produkční změny, peníze, RLS a produkční migrace vyžadují výslovné schválení.

> Doplněno z historického auditu (14. 8. 2026): následující 4 sekce z 17.–18. 07. 2026 chyběly v aktuálním stavu, ale nejsou v rozporu s ničím výše — jde o nejstarší dochovaný záznam v tomto souboru.

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

