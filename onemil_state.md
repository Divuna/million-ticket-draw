# OneMil – aktuální stav projektu

## MODUL OBCHOD / LEADY — AUTOMATICKÉ PŘÍCHOZÍ ODPOVĚDI (PR, neaplikováno/nenasazeno) (09. 07. 2026)

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
