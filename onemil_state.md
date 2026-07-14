# OneMil – aktuální stav projektu

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
