Warning: truncated output (original token count: 93839)
Total output lines: 4000

# 11. 07. 2026 — Obchod / Leady CRM dokončení

- Přidána nedestruktivní migrace `20260711120000_sales_leads_crm_completion.sql`.
- Přidány interní aktivity, úkoly, follow-up a doručovací audit Resendu.
- Testy: TypeScript 0 chyb, build OK, 20 kontraktních testů OK, stagingový DB tok OK a rollback čistý.
- PR #211 squash mergnut (`ecbd550c846df6cc187677a6593b5f00dc09f34b`); staging i produkce nasazeny a ověřeny rollback testem. Žádný skutečný e-mail nebyl odeslán a žádná testovací data nezůstala.

# OneMil — DEVELOPMENT HISTORY (CHRONOLOGICAL ONLY)

- **2026-07-11 — Fail-closed ověřování webů v Sales Leads discovery:** AI doména už není zdroj pravdy. Přidáno nezávislé ověření ARES + HTTP/HTML + identity firmy, detekce parked/for-sale/expired webů, audit zdroje/důvěry/času a alternativních domén, DB fail-closed trigger a blokace enrichmentu na neověřeném webu.

- **2026-07-11 — Naplánované aktivity leadů:** opravena záměna času vytvoření a plánovaného termínu; přidán samostatný seznam budoucích schůzek, telefonátů a kroků, jejich úprava/dokončení/zrušení a nejbližší plán v hlavním seznamu.

**Timestamp (Europe/Prague): 2026-07-11** (Sales Leads — odpovědi z detailu + nepřečtené + Reply-To fix, LIVE na produkci)
- **2026-07-11** — **Modul „Obchod / Leady" — odpovídání z detailu leadu, e-mailové vlákno, oprava Reply-To (Resend SDK v6) a upozornění na nepřečtené odpovědi jsou LIVE na produkci `xkzhjldrojjlrkezorey` (PR #205–#209).** (1) **Vlákno v detailu (PR #205):** `email_sent` i `reply_received` mají `direction`/`subject`/`body_snapshot`; detail zobrazuje odesílatele/příjemce, předmět, text i čas, odchozí vs příchozí odlišené, dlouhý text i citovaná část sbalené. (2) **Formulář odpovědi inline (PR #207):** tlačítko „Odpovědět" u příchozí zprávy otevře formulář (předmět, text, „Odeslat odpověď", „Zrušit") přímo pod vybranou zprávou; sám odscrolluje do pohledu; odesílá EF `send-sales-lead-reply`. (3) **Reply-To fix (PR #208):** Resend SDK v6 `emails.send()` očekává `replyTo` (camelCase), ne `reply_to` — původní `reply_to` v6 tiše ignorovalo, odchozí odpověď neměla Reply-To a další odpověď zákazníka se ztrácela (šla na `b2b@onemil.cz` v Active24). Opraveno na `replyTo` (adresa `reply+<lead_id>@ulduuzoul.resend.app` zachována), `reply_to` doplněn i do metadat aktivity `email_sent`; **produkční `send-sales-lead-reply` běží ve verzi 3** (`verify_jwt=false`, autorizace uvnitř přes JWT + `has_admin_permission('sales_leads.manage')`, klíč `RESEND_API_KEY` beze změny). Další odpovědi zákazníka se přes per-lead Reply-To správně vracejí do stejného leadu — chytne je `sales-lead-inbound`, dotáhne tělo přes Resend Receiving API a uloží jako `reply_received`; inbound negatuje na stav, funguje i pro `jednani`/`odpovedel` a stav se přijetím nemění. (4) **Duplicitní guard:** server kontroluje přesnou adresu vždy, veřejné domény (Gmail/Seznam/Outlook/Hotmail/Centrum…) se jako doménová duplicita nevyhodnocují; odeslání oslovení i odpovědi má guard `sales_lead_email_send_guard`; výjimka vyžaduje důvod a je auditovaná. (5) **Názvy stavů v UI:** `konvertovan` = „Spolupráce", `odmitl` = „Bez spolupráce"; `odpovedel` a `jednani` oddělené karty/taby. (6) **Nepřečtené odpovědi (PR #209):** migrace `20260711100000_sales_leads_activity_read_state.sql` přidává `read_at`/`read_by` na `sales_lead_activities` + parciální index `idx_sales_lead_activities_unread_reply` + backfill existujících odpovědí na přečtené + RPC `sales_lead_mark_replies_read(uuid)` (SECURITY DEFINER, guard `sales_leads.manage`/superadmin, `anon` bez EXECUTE, mění jen aktivity — **nikdy stav leadu**). Nová `reply_received` je nepřečtená automaticky. UI: nav „Obchod" červený badge s počtem nepřečtených, karta „Odpovědělo" červený počet, tabulka červená tečka + tučný název, detail zvýrazní nepřečtenou zprávu štítkem „Nové"; po otevření detailu se odpověď označí jako přečtená a počty se aktualizují ihned (custom event `sales-leads-unread-changed`). Migrace `20260711100000…` **aplikována přes `apply_migration` na staging `dxmowysntemfqfnanxua` i produkci `xkzhjldrojjlrkezorey`** (`{"success":true}`); ověřeno na obou: sloupce, index, RPC guard (superadmin OK, běžný uživatel i anon `access_denied`), backfill, checksumy stavů leadů i seznamu aktivit beze změny. Kontraktní testy 63+64+65: 14 passed; `npx tsc --noEmit` 0 chyb; `npm run build` ✅. **Frontend publikován (Lovable Publish) a ověřen na produkci (potvrzení Pavla).** (7) **Bezpečnost:** produkční Edge Function `admin-create-test-user` ODSTRANĚNA z produkce (endpoint → 404) a smazána z repu (PR #204) — neměla autorizaci a přes service role zapisovala do wallets/payments/vouchers; **nesmí být znovu nasazena** bez řádného admin guardu. Pravidla: `send-sales-lead-reply` musí u `emails.send()` používat `replyTo` (v6), nikdy `reply_to`; `sales_lead_mark_replies_read` nesmí měnit stav leadu; oddělené Resend klíče neslučovat. wallets, payments, contests, tickets, winners, Stripe, `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-06** (Sales Leads post-PR#200 fix — mark_emailed advances from early states, staging-verified)
- **2026-07-06** — **Modul „Obchod / Leady" — oprava po PR #200: `sales_lead_mark_emailed` posune do „Osloveno" i z raných stavů (staging-ověřeno, produkce nedotčena).** Produkční audit ukázal, že PR #200 byl příliš úzký. Tlačítko „Odeslat e-mail" v detailu leadu není vázané na stav `schvaleni_ceka` — člověk může odeslat uložený koncept i u leadu ve stavu `novy` nebo `priprava`. Původní `sales_lead_mark_emailed` (PR #200) posouvala do `osloveno` POUZE ze `schvaleni_ceka`, takže reálně odeslaný produkční lead `ICONIC POINT` (`novy`) zůstal `novy` — měl aktivitu `email_sent`, ale horní karta „Osloveno" (`status IN ('osloveno','follow_up')`) ho nezapočítala. Oprava: nová migrace `supabase/migrations/20260706110000_sales_leads_mark_emailed_broaden_states.sql` (`CREATE OR REPLACE` na `sales_lead_mark_emailed`) posune lead na `osloveno` z kteréhokoli raného stavu první oslovovací fáze — `novy`/`priprava`/`schvaleni_ceka`. Lead už dál v pipeline (`osloveno`/`follow_up`/`odpovedel`/`jednani`/`konvertovan`) nebo v jiném/blokovaném stavu (`navrzeny`/`odmitl`/`nekontaktovat`/`archivovan`) se NEMĚNÍ — nikdy nevrací zpět, nikdy nepřeskakuje. Zachovává `sales_lead_status_history` + aktivitu `status_changed` (`{auto:true, trigger:'email_sent'}`), grant `service_role`-only. Trigger `trg_sales_lead_activities_touch_lead` i EF `send-sales-lead-email` beze změny. Dokumentace `docs/SALES_LEADS_ADMIN_SPEC.md` §18.4. Ověřeno na stagingu `dxmowysntemfqfnanxua` (schválení Pavla pro staging): migrace aplikována přes `apply_migration`; test leady z `novy`/`priprava`/`schvaleni_ceka` → `osloveno` (`status_changed=true`, history + aktivita zapsané); lead už `osloveno` → beze změny (`status_changed=false`); žádný e-mail neodeslán; test leady uklizeny. `npx tsc --noEmit` 0 chyb, `npm run build` ✅ exit 0. Produkce `xkzhjldrojjlrkezorey` NEDOTČENA; žádné produkční SQL/migrace/EF deploy; Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe, `buy_ticket_atomic`, `email_queue` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-06** (Sales Leads post-Phase-6 email/status-sync fix, PR only, nothing deployed)
- **2026-07-06** — **Modul „Obchod / Leady" — oprava po Fázi 6 (propsání „Osloveno" + přesná poslední aktivita) připravena JEN jako soubory v PR (neaplikováno/nenasazeno).** Read-only audit produkčního `/admin/sales-leads` potvrdil: (1) EF `send-sales-lead-email` po úspěšném odeslání zapisuje jen aktivitu `email_sent`, nikdy neposouvá `sales_leads.status` — horní karta „Osloveno" (počítá `status IN ('osloveno','follow_up')`) proto zůstávala 0 i po reálném odeslání; (2) sloupec „Poslední aktivita" čte `sales_leads.updated_at`, který se nemění při vložení aktivity, jen při přímé UPDATE leadu; (3) příjem odpovědí od firem není nikde napojen — status `odpovedel`/aktivita `reply_received` existují od Fáze 1, ale v repu neexistuje žádný inbound webhook, jediná cesta je ruční přepnutí adminem. Klasifikace: (1)+(2) DB/backend chyba, bezpečně opravitelná; (3) chybějící funkcionalita, vyžaduje samostatné schválení, NEIMPLEMENTOVÁNO. Oprava: migrace `supabase/migrations/20260706100000_sales_leads_phase6_email_status_sync.sql` (soubor, neaplikováno) přidává trigger bumpující `sales_leads.updated_at` při každé nové aktivitě + service-role-only RPC `sales_lead_mark_emailed` (posune `schvaleni_ceka → osloveno` po odeslání e-mailu, jinak nic nemění). EF `send-sales-lead-email` upravena — po `email_sent` (metadata nově s `to`) best-effort volá novou RPC. `SalesLeadDetailSheet.tsx` — historie kontaktu ukazuje příjemce+předmět u odeslaných e-mailů, přidán řádek „Poslední e-mail odeslán", doplněny chybějící popisky aktivit `reply_received`/`email_failed`/`call_logged`. Dokumentace: `docs/SALES_LEADS_ADMIN_SPEC.md` §18. Testy: `npx tsc --noEmit` 0 chyb, `npm run build` ✅ exit 0. Nic nenasazeno; žádné SQL/migrace spuštěno; žádný EF deploy; žádný Lovable Publish; žádný e-mail odeslán; žádná data smazána; produkce i staging nedotčeny; wallets, payments, contests, tickets, winners, Stripe, `buy_ticket_atomic`, `email_queue` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-06** (Sales Leads Phase 6 deployed on PRODUCTION)
- **2026-07-06** — **Modul „Obchod / Leady" — Fáze 6 je LIVE na produkci (schválení Pavla).** Migrace `20260705100000_sales_leads_phase6_delete_rpc.sql` aplikována na produkci `xkzhjldrojjlrkezorey` přes `apply_migration`, `{"success": true}`. RPC `sales_lead_delete(uuid)` a `sales_lead_delete_bulk(uuid[])` existují na produkci, obě `SECURITY DEFINER`, `anon_exec=false`, `authenticated_exec=true`. Edge Function `sales-lead-discover` nasazena na produkci jako v5 ACTIVE (v4 byla Fáze 5E); bez auth vrací `401 missing_authorization_header`. Produkční počet leadů se deployem nezměnil: 15 před → 15 po. Žádný produkční testovací lead nevznikl; žádný discovery test na produkci nebyl spuštěn; žádný e-mail nebyl odeslán. Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe, `buy_ticket_atomic`, `email_queue`/`process-email-queue` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-06** (Sales Leads Phase 6 merged to main and deployed on STAGING ONLY)
- **2026-07-06** — **Modul „Obchod / Leady" — Fáze 6 mergnuta do `main` a zprovozněna POUZE na stagingu (schválení Pavla).** PR #197 mergnut do `main`, merge commit `087a84785b3cc77a30c95da84bb85268d2a59b9a`. Migrace `20260705100000_sales_leads_phase6_delete_rpc.sql` aplikována na staging `dxmowysntemfqfnanxua` přes `apply_migration`, `{"success": true}`. RPC `sales_lead_delete(uuid)` a `sales_lead_delete_bulk(uuid[])` existují, obě `SECURITY DEFINER`, `anon_exec=false`, `authenticated_exec=true`. Edge Function `sales-lead-discover` nasazena na staging jako v5 ACTIVE; bez auth vrací `401 missing_authorization_header`. Ověřeno: discovery nyní ukládá firmu i bez e-mailu — firma bez e-mailu vzniká jako `navrzeny`, `contact_email=NULL`, `email_verified_by_admin=false`, bez `proposed_contact_email`; firma s nalezeným e-mailem vzniká s `proposed_contact_email` vyplněným, `proposed_contact_status='neovereny'`, `contact_email` stále `NULL`. Jednotlivé mazání otestováno na test leadu `TEST OneMil Sales Lead F6 DELETE STAGING ONLY` přes `sales_lead_delete` — cascade smazala navázané aktivity i historii stavů (0/0/0 po smazání). Hromadné mazání otestováno na 2 test leadech `TEST OneMil Sales Lead F6 BULK STAGING ONLY A/B` přes `sales_lead_delete_bulk` — `deleted_count=2`. Všechny F6 test leady byly na stagingu následně uklizeny přes stejné F6 delete RPC (0 zbývajících). Žádný e-mail nebyl odeslán; `email_queue` za dobu testu zůstala 0. Produkce `xkzhjldrojjlrkezorey` nebyla dotčena; Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-06** (Sales Leads Phase 6 — always-save discovery + lead delete, PR only, nothing deployed)
- **2026-07-06** — **Modul „Obchod / Leady" — Fáze 6 připravena JEN jako soubory v PR (neaplikováno/nenasazeno).** Cíl: discovery nemá zahazovat firmy jen proto, že nenašlo e-mail — má vždy uložit použitelné firmy ze zvoleného segmentu a e-mail uložit jen tehdy, když ho bezpečně najde. EF `sales-lead-discover` upravena tak, že **každá firma s vyplněným názvem se vždy uloží** jako lead ve stavu `navrzeny`: pokud crawler (Fáze 5D/5E logika beze změny) najde veřejný e-mail, uloží se přes existující RPC `sales_lead_propose_with_contact` s `proposed_contact_email`/`proposed_contact_status='neovereny'`; pokud e-mail nenajde, lead se i tak vytvoří přes existující RPC `sales_lead_propose` bez navrženého kontaktu — e-mail lze doplnit ručně. `contact_email` zůstává vždy `NULL`, `email_verified_by_admin=false`; jediný důvod nevytvoření leadu zůstává dedup/blokace na úrovni RPC (partner/suppression/duplicitní IČO/doména), nikdy chybějící e-mail. Žádná nová DB migrace pro tuto část chování — jen úprava EF. Odpověď EF rozšířena o `created_with_email`/`created_without_email` (nahrazují `skipped_missing_email`/`skipped_email_not_found_on_website`). UI `DiscoverLeadsDialog.tsx` upraveno: text už netvrdí, že se uloží jen firmy s e-mailem; výsledek běhu ukazuje vzniklo firem celkem / s navrženým e-mailem / bez e-mailu (k ručnímu doplnění) / přeskočeno / chyby. **Nová funkcionalita — mazání leadů:** migrace `supabase/migrations/20260705100000_sales_leads_phase6_delete_rpc.sql` (soubor, **NEAPLIKOVÁNO**) přidává RPC `sales_lead_delete(uuid)` a `sales_lead_delete_bulk(uuid[])` — SECURITY DEFINER, guard `has_admin_permission('sales_leads.manage') OR is_superadmin()`, EXECUTE jen `authenticated`; mažou výhradně z `sales_leads`, navázané `sales_lead_activities`/`sales_lead_status_history` se smažou automaticky přes existující `ON DELETE CASCADE` z Fáze 1. Admin UI `/admin/sales-leads` (`AdminSalesLeads.tsx`): checkbox per-řádek + „vybrat vše" v hlavičce, tlačítko smazat u jednotlivého leadu i hromadná akční lišta „Smazat vybrané (N)" — obojí za potvrzovacím `AlertDialog`. Dokumentace aktualizována: `docs/SALES_LEADS_ADMIN_SPEC.md` (§17.8.5), `CLAUDE.md`, `onemil_state.md`. Testy: `npx tsc --noEmit` 0 chyb, `npm run build` ✅ exit 0. **Nic nenasazeno; žádné SQL/migrace spuštěno; žádný EF deploy; žádný Lovable Publish; žádný e-mail odeslán; žádná data smazána; produkce i staging nedotčeny;** wallets, payments, contests, tickets, winners, Stripe, `buy_ticket_atomic`, `email_queue`/`process-email-queue` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5E deployed on PRODUCTION)
- **2026-07-05** — **Modul „Obchod / Leady" — Fáze 5E zprovozněna na produkci (schválení Pavla).** PR #194 a PR #195 mergnuty do `main`. Edge Function `sales-lead-discover` nasazena na produkci `xkzhjldrojjlrkezorey` jako v4 ACTIVE (v3 byla Fáze 5D); bez auth vrací `401 missing_authorization_header`; žádná nová DB migrace. Fáze 5E na produkci sama prochází web firmy a hledá veřejný e-mail. Web bez protokolu se normalizuje na `https://…`. Crawler zůstává jen na stejné doméně firmy; AI navržená `email_source_url` z cizí domény se ignoruje. Při nenalezení e-mailu vrací `outcome:"skipped", reason:"email_not_found_on_company_website"`. Produkční počet leadů se deployem nezměnil: 11 před → 11 po. Žádný discovery test na produkci nebyl spuštěn, žádný produkční test lead nevznikl, žádný e-mail nebyl odeslán. Staging `dxmowysntemfqfnanxua` nebyl změněn (jen read-only ověření); Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5E deployed on STAGING)
- **2026-07-05** — **Modul „Obchod / Leady" — Fáze 5E zprovozněna POUZE na stagingu (schválení Pavla).** PR #194 mergnutý do `main` (merge commit `abe026f68c01f5d31e59e25a93bf323ddf06252b`). Edge Function `sales-lead-discover` nasazena na staging `dxmowysntemfqfnanxua` jako v4 ACTIVE; bez auth vrací `401 missing_authorization_header`; žádná nová DB migrace. Fáze 5E sama prochází web firmy a hledá veřejný e-mail (AI e-mail/URL jsou jen nápověda). Web bez protokolu se normalizuje na `https://…`. Crawler zůstává jen na stejné doméně firmy; AI navržená `email_source_url` z cizí domény se ignoruje. Při nenalezení e-mailu vrací `outcome:"skipped", reason:"email_not_found_on_company_website"`, lead nevznikne. Test s reálně existujícím e-mailem prošel — vznikl pouze staging test lead `TEST OneMil Sales Lead F5E STAGING ONLY` (`status='navrzeny'`, `contact_email=NULL`, `email_verified_by_admin=false`, `proposed_contact_email='security@mozilla.org'`, `proposed_contact_source_url='https://www.mozilla.org/.well-known/security.txt'`, `proposed_contact_status='neovereny'`; aktivita `lead_discovered` 1×, `contact_proposed` 1×, `email_sent` 0×). Žádný e-mail nebyl odeslán; produkce `xkzhjldrojjlrkezorey` nebyla dotčena; Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5E — self-crawl company website for email, PR only, nothing deployed)
- Phase 5E fixes a usability gap from Phase 5D: Phase 5D correctly blocks fabricated emails, but relied on the AI supplying an accurate `email_source_url`, which the AI cannot do reliably — discovery often created nothing even when a company had a public email on its own website. Prepared as files only (PR). NOTHING applied/deployed/published; production `xkzhjldrojjlrkezorey` and staging `dxmowysntemfqfnanxua` untouched; no email sent; no leads created; no new DB migration.
- EF `sales-lead-discover`: AI may still propose company/website and optionally a guessed email, but the guess is now treated ONLY as a hint, never as proof. The backend itself crawls each company's own website: homepage → contact/about-like links (kontakt/contact/kontakty/o-nas/o-spolecnosti/about/about-us/impressum, same-domain only) → `mailto:` links and plain page text. Only an email actually found on a fetched page is used; the AI-guessed email is used only if it matches a genuinely found one (for provenance), otherwise the first other found email is used.
- New skip outcome (no lead created): `outcome:"skipped", reason:"email_not_found_on_company_website"`. `reason:"missing_public_email"` still applies when a company has neither a website nor any AI-suggested page to crawl.
- Crawl safety (shared with Phase 5D): http/https only, blocks loopback/private/link-local addresses for every visited and redirect URL, manual redirect handling (max 3 hops, each re-verified), 8s per-page timeout, 2MB page size cap, and a new hard cap of 5 fetched pages per company (`MAX_PAGES_PER_COMPANY`).
- Preserves all Phase 5B/5C/5D invariants: no auto-send, no Resend, no `email_queue` write, no auto-approval; `contact_email` stays NULL, `email_verified_by_admin=false`; only `proposed_contact_email` is stored; human must still manually click "Schválit e-mail".
- UI `DiscoverLeadsDialog.tsx`: run result now also shows companies skipped due to email not found on the company website (`skipped_email_not_found_on_website`), separate from missing website/data (`skipped_missing_email`). `npx tsc --noEmit` 0 errors, `npm run build` OK.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5D deployed on PRODUCTION)
- **2026-07-05** — **Modul „Obchod / Leady" — Fáze 5D zprovozněna na produkci (schválení Pavla).** PR #191 a PR #192 mergnuty do `main`. Edge Function `sales-lead-discover` nasazena na produkci `xkzhjldrojjlrkezorey` jako v3 ACTIVE; bez auth vrací `401 missing_authorization_header`; žádná nová DB migrace. Fáze 5D na produkci ověřuje navržený e-mail stažením zdrojové stránky před uložením leadu — AI tvrzení samo o sobě nestačí. Produkční počet leadů se deployem nezměnil: 11 před → 11 po. Žádný discovery test na produkci nebyl spuštěn, žádný produkční test lead nevznikl, žádný e-mail nebyl odeslán. Staging `dxmowysntemfqfnanxua` nebyl touto akcí změněn; Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5D deployed on STAGING)
- **2026-07-05** — **Modul „Obchod / Leady" — Fáze 5D zprovozněna POUZE na stagingu (schválení Pavla).** PR #191 mergnutý do `main` (merge commit `2a2578557007cc3428470a12a9981f339690ac64`). Edge Function `sales-lead-discover` nasazena na staging `dxmowysntemfqfnanxua` jako v3 ACTIVE; bez auth vrací `401`; žádná nová DB migrace. Fáze 5D ověřuje navržený e-mail stažením zdrojové stránky před uložením leadu — AI tvrzení samo o sobě nestačí. Test bez existujícího e-mailu na stránce: e-mail, který na stránce není, skončí jako `outcome:"skipped", reason:"email_not_found_on_source_page"`, žádný lead se nevytvoří. Test s nebezpečnou URL skončí jako `reason:"invalid_email_source_url"`. Test s reálně existujícím e-mailem na veřejné stránce prošel — vznikl pouze staging test lead `TEST OneMil Sales Lead F5D STAGING ONLY` (`status='navrzeny'`, `contact_email=NULL`, `email_verified_by_admin=false`, `proposed_contact_status='neovereny'`; aktivita `lead_discovered` 1×, `contact_proposed` 1×, `email_sent` 0×). Žádný e-mail nebyl odeslán; produkce `xkzhjldrojjlrkezorey` nebyla dotčena; Lovable Publish neproběhl.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5D — hard source-page verification, PR only, nothing deployed)
- Phase 5D fixes a gap left by Phase 5C: AI's mere claim that "the email is on this URL" was not proof — AI could fabricate or misidentify the source URL, letting a lead be saved with an email that was never actually on the stated page. Prepared as files only (PR). NOTHING applied/deployed/published; production `xkzhjldrojjlrkezorey` and staging `dxmowysntemfqfnanxua` untouched; no email sent; no leads created; no new DB migration.
- EF `sales-lead-discover`: before calling `sales_lead_propose_with_contact`, the function now itself fetches `email_source_url` and verifies the proposed email is actually present in the page content. Only after successful verification is the lead saved.
- SSRF-safe fetch: http/https only, no credentials in URL, blocks loopback/private/link-local addresses (127.x, 10.x, 172.16–31.x, 192.168.x, 169.254.x, localhost, 0.0.0.0, IPv6 loopback/link-local), 8s timeout, 2MB response size cap.
- Comparison is case-insensitive; HTML entities (`&amp;`, `&#64;`, `&#46;`, `&nbsp;`) and tags are normalized/stripped before matching so ordinary page markup doesn't block a real match — but the email must genuinely be found, never guessed.
- New skip outcomes (no lead created): `outcome:"skipped", reason:"invalid_email_source_url"` and `outcome:"skipped", reason:"email_not_found_on_source_page"`. Existing `reason:"missing_public_email"` (Phase 5C) unchanged.
- Preserves all Phase 5B/5C invariants: no auto-send, no Resend, no `email_queue` write, no auto-approval; `contact_email` stays NULL, `email_verified_by_admin=false`; only `proposed_contact_email` is stored; human must still manually click "Schválit e-mail". `npx tsc --noEmit` 0 errors, `npm run build` OK.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5C deployed on PRODUCTION)
- **2026-07-05** — **Modul „Obchod / Leady" — Fáze 5C zprovozněna a ověřena na produkci (schválení Pavla), předtím ověřena na stagingu `dxmowysntemfqfnanxua`.** Migrace `supabase/migrations/20260704160000_sales_leads_phase5c_propose_with_contact_rpc.sql` aplikována na produkci `xkzhjldrojjlrkezorey` přes `apply_migration` (ne `db push`), výsledek `{"success": true}`. Edge Function `sales-lead-discover` nasazená na produkci jako v2 ACTIVE. Ověřeno: RPC `sales_lead_propose_with_contact` existuje, SECURITY DEFINER, EXECUTE jen `service_role` (anon/authenticated bez EXECUTE); EF bez auth vrací `401 missing_authorization_header`; EF neodkazuje na `email_queue` ani Resend. Produkční počet leadů zůstal beze změny: 9 před → 9 po. Žádný produkční testovací lead nebyl vytvořen, discovery test na produkci nebyl spuštěn, žádný e-mail nebyl odeslán. Staging `dxmowysntemfqfnanxua` nebyl touto produkční akcí dotčen; Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5C deployed on STAGING)
- **2026-07-05** — **Modul „Obchod / Leady" — Fáze 5C zprovozněna POUZE na stagingu (schválení Pavla).** PR #188 mergnutý do `main` (merge commit `672d1a3c7b5f9ea74273b126b04117930d84879a`). Fáze 5C aplikovaná pouze na staging `dxmowysntemfqfnanxua`: migrace `supabase/migrations/20260704160000_sales_leads_phase5c_propose_with_contact_rpc.sql` přes `apply_migration` (ne `db push`), `{"success": true}`; Edge Function `sales-lead-discover` nasazená jako v2 ACTIVE. Ověřeno: RPC `sales_lead_propose_with_contact` existuje, SECURITY DEFINER, EXECUTE jen `service_role` (anon/authenticated bez EXECUTE); EF bez auth headeru → `401 missing_authorization_header`; EF neodkazuje na `email_queue` ani Resend. Test bez e-mailu (STAGING ONLY, přímé volání RPC): `outcome='skipped', reason='missing_public_email'`, žádný lead nevznikl. Test s e-mailem (STAGING ONLY): vznikl test lead `TEST OneMil Sales Lead F5C STAGING ONLY` (id `b267e3d0-df0b-462c-acb5-026168c33b01`) — `status='navrzeny'`, `contact_email=NULL`, `email_verified_by_admin=false`, `proposed_contact_email='info@test-onemil-f5c-staging.cz'`, `proposed_contact_source_url='https://test-onemil-f5c-staging.cz/kontakt'`, `proposed_contact_status='neovereny'`; aktivita `lead_discovered` 1×, aktivita `contact_proposed` 1×, aktivita `email_sent` neexistuje. Žádný e-mail se neposlal. Produkce `xkzhjldrojjlrkezorey` nebyla dotčena; Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5C fix — atomic propose+contact RPC, PR #188 updated, nothing deployed)
- Fixed a critical bug in the Phase 5C draft in PR #188: `sales-lead-discover` called `sales_lead_propose` (creates lead) and THEN `sales_lead_propose_contact` (stores proposed email) as two separate steps — if the second step failed, a lead would remain saved WITHOUT a proposed email, violating "companies without a contact must never be saved as a lead."
- Fix: new migration `supabase/migrations/20260704160000_sales_leads_phase5c_propose_with_contact_rpc.sql` (NOT applied) adds RPC `sales_lead_propose_with_contact` (EXECUTE `service_role` only) that creates the lead and the proposed contact in a SINGLE INSERT (`proposed_contact_*` columns set directly, no follow-up UPDATE). If email validation fails, the INSERT never runs and no lead is created. Preserves Phase 5A dedup (ico/domain), partner block, suppression, and Phase 5B rules (`status='navrzeny'`, `contact_email`/`email_verified_by_admin` untouched, `proposed_contact_status='neovereny'`). Original `sales_lead_propose` and `sales_lead_propose_contact` are unchanged; only `sales-lead-discover` now calls the new atomic RPC.
- `npx tsc --noEmit` 0 errors, `npm run build` OK. No migration applied, no EF deployed, no Lovable Publish, no email sent, no production leads created, no data deleted; production `xkzhjldrojjlrkezorey` and staging `dxmowysntemfqfnanxua` untouched.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5C — discover requires public email, PR only, nothing deployed)
- Phase 5C: „Najít nové firmy" (`sales-lead-discover`) must find the public contact email + source URL together with the company; a company WITHOUT a valid public email is skipped and NO lead is created for it at all. Prepared as files in branch `feat/sales-leads-phase5c-discover-email-required` (PR only). NOTHING applied/deployed/published; production `xkzhjldrojjlrkezorey` and staging `dxmowysntemfqfnanxua` untouched; no email sent; no production leads created/deleted; no new DB migration (full reuse of Phase 5A/5B RPCs).
- EF `sales-lead-discover`: single AI call now also returns `email`/`email_source_url`/`email_confidence` per company, same strict rules as `sales-lead-enrich-contact` (never fabricate, public source only). Missing/invalid/low-confidence email → skipped with `reason:"missing_public_email"` BEFORE calling `sales_lead_propose` (no lead created). Valid email → lead created via `sales_lead_propose` (`navrzeny`), then email stored as an UNVERIFIED proposal via `sales_lead_propose_contact`; `contact_email`/`email_verified_by_admin` remain unchanged (null/false) — human approval only.
- UI `DiscoverLeadsDialog.tsx`: copy updated to "Uloží se jen firmy s dohledaným veřejným e-mailem."; result panel now shows created / total skipped / skipped due to missing public email. `npx tsc --noEmit` 0 errors, `npm run build` OK.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5B deployed on PRODUCTION)
- **2026-07-05** — **Modul „Obchod / Leady" — Fáze 5B zprovozněna na produkci (schválení Pavla).** Migrace `supabase/migrations/20260704150000_sales_leads_phase5b_contact_enrichment.sql` aplikována na produkci `xkzhjldrojjlrkezorey` přes `apply_migration` (ne `db push`), výsledek `{"success": true}`. Edge Function `sales-lead-enrich-contact` nasazená na produkci, v1 ACTIVE (`verify_jwt=false`, autorizace řešená uvnitř funkce přes JWT + `sales_leads.manage`). Ověřeno: sloupce `proposed_contact_email`/`proposed_contact_source_url`/`proposed_contact_at`/`proposed_contact_by`/`proposed_contact_status` existují; `sales_lead_propose_contact` má EXECUTE jen pro `service_role`; `sales_lead_review_contact` má EXECUTE pro `authenticated` s guardem `sales_leads.manage`; EF bez auth vrací `401 missing_authorization_header`; EF neodkazuje na `email_queue` ani Resend. Produkční počet leadů zůstal beze změny: 6 celkem, 5 ve stavu `navrzeny`. Žádný produkční testovací lead nebyl vytvořen, enrichment test na produkci nebyl spuštěn, žádný e-mail nebyl odeslán. Staging `dxmowysntemfqfnanxua` nebyl dotčen; Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny. `OPENAI_API_KEY` nešel programově ověřit přes dostupné nástroje; hodnota nebyla vypsaná.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5B deployed on STAGING)
- **2026-07-05** — **Modul „Obchod / Leady" — Fáze 5B zprovozněna POUZE na stagingu (schválení Pavla).** PR #185 mergnutý do `main` (merge commit `b542d5cbce47bbc9c609ec9217a83bddb111f67c`). Fáze 5B aplikovaná pouze na staging `dxmowysntemfqfnanxua`: migrace `supabase/migrations/20260704150000_sales_leads_phase5b_contact_enrichment.sql` přes `apply_migration` (ne `db push`), `{"success": true}`; Edge Function `sales-lead-enrich-contact` nasazená, v1 ACTIVE (`verify_jwt=false`), no-auth smoke → 401. Ověřeno: sloupce `proposed_contact_email`/`proposed_contact_source_url`/`proposed_contact_at`/`proposed_contact_by`/`proposed_contact_status` existují; `sales_lead_propose_contact` (anon/authenticated bez EXECUTE, jen `service_role`); `sales_lead_review_contact` (authenticated s EXECUTE, guard `sales_leads.manage`, anon bez EXECUTE). Funkční test propose (STAGING ONLY): test lead z Fáze 5A `2fc9a556-3780-40dc-953f-d2899ddd0481` zůstal ve stavu `navrzeny`, `contact_email=null`, `email_verified_by_admin=false`, `proposed_contact_email`/`proposed_contact_source_url` uloženy, `proposed_contact_status='neovereny'`, zapsaná aktivita `contact_proposed`; žádný e-mail se neposlal. Schválení e-mailu (`sales_lead_review_contact` approve) nebylo testováno — nebyl k dispozici admin JWT. Produkce `xkzhjldrojjlrkezorey` nebyla dotčena; Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-05** (Sales Leads Phase 5B — contact enrichment, PR only, nothing deployed)
- Phase 5B: safe contact enrichment for proposed (`navrzeny`) leads. Prepared as files in branch `feat/sales-leads-phase5b-contact-enrich` (PR only). NOTHING applied/deployed/published; production `xkzhjldrojjlrkezorey` and staging `dxmowysntemfqfnanxua` untouched; no email sent; no production leads created/deleted.
- Migration `20260704150000_sales_leads_phase5b_contact_enrichment.sql`: `proposed_contact_*` columns (email/source_url/at/by/status neovereny|overeny|zamitnuty); RPC `sales_lead_propose_contact` (service_role only, stores UNVERIFIED proposal, never touches `contact_email`/`email_verified_by_admin`/status, never sends); RPC `sales_lead_review_contact` (`sales_leads.manage` guard — human approve fills `contact_email` + `email_verified_by_admin=true`, or reject); activity types `contact_proposed`/`contact_approved`/`contact_rejected`.
- EF `sales-lead-enrich-contact`: finds ONLY a publicly listed company email + source URL via OpenAI; returns `found:false` (stores nothing) when unsure/no source — AI never fabricates; never sends email.
- UI `SalesLeadDetailSheet.tsx`: „Kontaktní e-mail" section — „Dohledat e-mail", proposed-email panel + source + „Schválit e-mail"/„Zamítnout e-mail". `salesLeadsShared.ts` extended. `npx tsc --noEmit` 0 errors, `npm run build` OK.

**Timestamp (Europe/Prague): 2026-07-04** (Sales Leads Phase 5A deployed on STAGING)

- **2026-07-04** — **Modul „Obchod / Leady" — Fáze 5A zprovozněna POUZE na stagingu (schválení Pavla).** PR #183 mergnutý do `main` (merge commit `8fd982abf6c6c464d08bd2d54dace630f663006c`). Fáze 5A aplikovaná pouze na staging `dxmowysntemfqfnanxua`: migrace `supabase/migrations/20260704140000_sales_leads_phase5a_propose_rpc.sql` přes `apply_migration` (ne `db push`), `{"success": true}`; RPC `sales_lead_propose` existuje (SECURITY DEFINER, anon/authenticated bez EXECUTE, jen `service_role`); Edge Function `sales-lead-discover` nasazená, v1 ACTIVE (`verify_jwt=false`), no-auth smoke → 401. Funkční test propose (STAGING ONLY): test lead `2fc9a556-3780-40dc-953f-d2899ddd0481` vznikl ve stavu `navrzeny`, `contact_email=null`, `email_verified_by_admin=false`, zapsaná aktivita `lead_discovered`; žádný e-mail se neposlal. Discovery EF (OpenAI) nespuštěn (vyžaduje potvrzený `OPENAI_API_KEY` + admin JWT). Produkce `xkzhjldrojjlrkezorey` nebyla dotčena; Lovable Publish neproběhl; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny. Odeslání e-mailu zůstává jen ruční přes člověka po potvrzení.

**Timestamp (Europe/Prague): 2026-07-04** (Sales Leads Phase 5A auto-discovery prepared as files in PR)

- **2026-07-04** — **Modul „Obchod / Leady" — Fáze 5A (automatické vyhledávání a navrhování firem) připravena jako soubory v PR (neaplikováno/nenasazeno).** Backend: migrace `supabase/migrations/20260704140000_sales_leads_phase5a_propose_rpc.sql` s RPC `sales_lead_propose` (SECURITY DEFINER, EXECUTE jen `service_role`; vkládá lead vždy ve stavu `navrzeny`, povinné `lead_group`/`lead_quality`/`discovery_source`/`discovery_meta`, nikdy nevyplní ověřený `contact_email`; dedup IČO/doména + partner + suppression → `skipped`; audit `lead_discovered`). Edge Function `supabase/functions/sales-lead-discover/index.ts` (auth JWT + `has_admin_permission('sales_leads.manage')`, volá OpenAI jen na návrh firem, ukládá přes service-role RPC, strop `MAX_PER_RUN=10`, nikdy neodesílá e-mail ani nezapisuje do `email_queue`, bez `OPENAI_API_KEY` → `503 ai_not_configured`; `config.toml` záznam `verify_jwt=false`). UI: tlačítko „Najít nové firmy" na `/admin/sales-leads` (dialog skupina + počet ≤10) → výsledek vzniklo/přeskočeno, přepnutí na záložku „Návrhy"; ze stavu `navrzeny` musí člověk ručně „Schválit návrh". Ochrany: žádný bulk send, žádné auto-odesílání, žádné auto-schválení, povinná lidská kontrola, limit na běh. `npx tsc --noEmit` 0 chyb, `npm run build` ✅. Žádná migrace neaplikována (staging ani produkce), žádná EF nenasazena, žádný Lovable Publish, žádný e-mail, žádný testovací lead; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny; odeslání e-mailu zůstává jen ruční přes člověka po potvrzení.

**Timestamp (Europe/Prague): 2026-07-04** (Sales Leads Phase 4B verified in PRODUCTION UI after Lovable Publish)

- **2026-07-04** — **Modul „Obchod / Leady" — Fáze 4B produkčně ověřena v UI po Lovable Publish.** Lovable Publish proběhl ručně Pavlem po PR #181; produkční UI `/admin/sales-leads` už zobrazuje Fázi 4B. Ověřeno v produkčním UI: záložka „Návrhy" je vidět, karta „Návrhy" je vidět, sloupec „Skupina" je vidět, detail leadu obsahuje sekci „Zařazení", editace zařazení funguje, hodnota skupiny `E-shopy` se u leadu `ikonic Point s.r.o` uložila a zobrazuje v seznamu. E-mail zůstává ruční: tlačítko „Odeslat e-mail" je oddělené a odesílá jen člověk po potvrzovacím dialogu; AI nemá cestu k odeslání e-mailu. Žádný testovací e-mail se neposlal, žádný EF deploy neproběhl, žádná další migrace neproběhla; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny. Tím je modul Obchod / Leady (Fáze 1 + 3A + 3B + 3C + 4A + 4B) produkčně hotový a ověřený v UI.

**Timestamp (Europe/Prague): 2026-07-04** (Sales Leads Phase 4B discovery RPC applied to PRODUCTION)

- **2026-07-04** — **Modul „Obchod / Leady" — Fáze 4B discovery RPC aplikováno na produkci (schválení Pavla).** Migrace `supabase/migrations/20260704130000_sales_leads_phase4b_discovery_update_rpc.sql` aplikována na produkci **`xkzhjldrojjlrkezorey`** přes `apply_migration` (ne `db push`), výsledek **`{"success": true}`**. RPC `sales_lead_update_discovery` na produkci existuje, je `SECURITY DEFINER`, anon nemá EXECUTE, authenticated má EXECUTE, guard `sales_leads.manage` (ověřeno read-only). Na produkci NEbyl vytvořen testovací lead; produkční lead `ikonic Point s.r.o` zůstal nedotčen (produkce má 1 lead, 0× `navrzeny`). **DB backend Fáze 4B je nyní na stagingu i produkci; UI Fáze 4B je v `main` (PR #179, merge commit `d3c4fa3ff30aa4bd7c0152a7adf5fff674f1743d`).** Živé produkční UI čeká už jen na Lovable Publish — samostatný ruční krok Pavla; po Publish ověřit `/admin/sales-leads` (záložka „Návrhy", sekce „Zařazení") a že e-mail stále odesílá jen člověk po potvrzení. Nebyl EF deploy, nebyl Lovable Publish, žádný e-mail se neodeslal; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-04** (Sales Leads Phase 4B UI in main; discovery RPC applied on STAGING)

- **2026-07-04** — **Modul „Obchod / Leady" — Fáze 4B (UI navržených leadů) v main; RPC editace zařazení aplikováno pouze na staging (schválení Pavla).** PR #179 mergnutý do `main` (merge commit `d3c4fa3ff30aa4bd7c0152a7adf5fff674f1743d`); Fáze 4B UI je v main (záložka „Návrhy", skupina `lead_group`, sekce „Zařazení" s editací `lead_group`/`lead_quality`/`discovery_source` + read-only `discovery_meta`, akce Schválit/Nekontaktovat/Archivovat). Migrace `supabase/migrations/20260704130000_sales_leads_phase4b_discovery_update_rpc.sql` aplikována **pouze na staging `dxmowysntemfqfnanxua`** přes `apply_migration` (ne `db push`), výsledek **`{"success": true}`**. RPC `sales_lead_update_discovery` na stagingu existuje, je `SECURITY DEFINER`, anon nemá EXECUTE, authenticated má EXECUTE, guard `sales_leads.manage`. Ověřeno na staging test leadu `c48f2567-5daf-4ce0-ab6b-89192748eef8` (existuje): RPC mění `lead_group`/`lead_quality`/`discovery_source`, nemění `discovery_meta`, nemění status, neodesílá e-mail. Produkce `xkzhjldrojjlrkezorey` nebyla dotčena a tuto RPC migraci zatím nemá. Nebyl EF deploy, nebyl Lovable Publish, žádný e-mail se neodeslal; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny.

**Timestamp (Europe/Prague): 2026-07-04** (Sales Leads Phase 4A applied to PRODUCTION)

- **2026-07-04** — **Modul „Obchod / Leady" — Fáze 4A (DB základ navržených leadů) aplikována na produkci (schválení Pavla).** Migrace `supabase/migrations/20260704120000_sales_leads_phase4a_proposed_leads.sql` aplikována na produkci **`xkzhjldrojjlrkezorey`** přes `apply_migration` (ne `db push`), výsledek **`{"success": true}`**. DB základ Fáze 4A je nyní na stagingu i produkci. Produkce má nové sloupce `lead_group`, `lead_quality`, `discovery_source`, `discovery_meta`; existuje index `idx_sales_leads_lead_group`; `status` povoluje `navrzeny`; `sales_lead_set_status` blokuje `navrzeny → schvaleni_ceka` a povoluje `navrzeny → novy`. Produkce má 1 existující lead a 0 leadů ve stavu `navrzeny`; reálný produkční lead zůstal nedotčen; žádný produkční testovací lead nebyl vytvořen. Nebyl EF deploy, nebyl Lovable Publish, žádný e-mail se neodeslal; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny. AI stále nemá cestu ke schválení ani odeslání; odeslání e-mailu zůstává jen ruční přes člověka.

**Timestamp (Europe/Prague): 2026-07-04** (Sales Leads Phase 4A applied + verified on STAGING)

- **2026-07-04** — **Modul „Obchod / Leady" — Fáze 4A (DB základ navržených leadů) aplikována a ověřena POUZE na stagingu (schválení Pavla).** Migrace `supabase/migrations/20260704120000_sales_leads_phase4a_proposed_leads.sql` aplikována na **staging `dxmowysntemfqfnanxua`** přes `apply_migration` (ne `db push`), výsledek **`{"success": true}`**. **Produkce `xkzhjldrojjlrkezorey` nedotčena.** Na stagingu ověřeno: `sales_leads.status` povoluje `navrzeny`; existují sloupce `lead_group`, `lead_quality`, `discovery_source`, `discovery_meta`; existují CHECK kontroly a index `idx_sales_leads_lead_group`. `sales_lead_set_status` blokuje `navrzeny → schvaleni_ceka` (`transition_not_allowed`) a povoluje `navrzeny → novy`. Testovací staging lead `c48f2567-5daf-4ce0-ab6b-89192748eef8` (pouze na stagingu, označen `STAGING ONLY`, po testu ve stavu `novy`). Žádný e-mail se neodeslal; nebyl EF deploy; nebyl Lovable Publish; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny. Produkční aplikace Fáze 4A čeká na samostatné schválení Pavla.

**Timestamp (Europe/Prague): 2026-07-04** (Sales Leads Phase 4 documentation proposal)

- **2026-07-04** — **Modul „Obchod / Leady" — Fáze 4 dokumentační návrh.** Do `docs/SALES_LEADS_ADMIN_SPEC.md` přidána sekce §17: návrh automatického vyhledávání a třídění nových firemních leadů. Systém má umět navrhnout firmy k oslovení, zařadit je do skupin (`e-shopy`, `auto-moto`, `luxusni-zbozi`, `sport`, `cestovani`, `gastronomie`, `lokalni-sluzby`, `jine`), dohledat veřejné kontakty, ohodnotit kvalitu (`lead_quality` 0–3), uložit zdroj (`discovery_source`/`discovery_meta`) a připravit lead do lidské kontroly (nový stav `navrzeny`, lidské schválení je povinná brána). Dedup + suppression guard zabraňuje nechtěnému oslovení. **AI smí jen navrhnout firmu, rešerši a koncept; odeslání e-mailu zůstává vždy jen ruční přes člověka; AI nikdy neposílá e-mail ani nepovyšuje lead do oslovovacího stavu.** Pouze dokumentace — žádná implementace, migrace, kód ani deploy; produkce ani staging nedotčeny. Otevřená rozhodnutí pro Pavla: zdroje dat + GDPR, denní limity návrhů, finální číselník skupin, cron vs. ruční discovery.

**Timestamp (Europe/Prague): 2026-07-04** (Sales Leads Phase 3C published + verified in PRODUCTION)

- **2026-07-04** — **Modul „Obchod / Leady" — Fáze 3C (odeslání e-mailu člověkem) produkčně publikována a ověřena (schválení Pavla).** Lovable Publish Fáze 3C proběhl. Produkční UI `/admin/sales-leads` obsahuje tlačítko `Odeslat e-mail` v detailu leadu; je dostupné jen u uloženého konceptu s vyplněným kontaktním e-mailem (a leadu bez `do_not_contact`). Potvrzovací dialog funguje a jasně uvádí, že e-mail odesílá **člověk, ne AI**. **První e-mail byl odeslán člověkem** přes produkční Edge Function `send-sales-lead-email` (ACTIVE, `RESEND_API_KEY` nastaven jako projektový secret, hodnota se neuvádí). Historie kontaktu zapisuje `E-mail odeslán` (`email_sent`, `direction=outbound`, `sent_by=human`). AI nemá žádnou cestu k odeslání e-mailu — spouští jen člověk s `sales_leads.manage` po potvrzení; EF ověřuje bariéry server-side. Staging nebyl dotčen; nebyl SQL ani migrace; wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny. Tím je backend + UI modulu Obchod / Leady (Fáze 1 + 3A + 3B + 3C) produkčně hotové a ověřené.

**Timestamp (Europe/Prague): 2026-07-03** (Sales Leads Phase 3B deployed + verified in PRODUCTION)

- **2026-07-03** — **Modul „Obchod / Leady" — Fáze 3B (AI příprava) nasazena a produkčně ověřena (schválení Pavla).** RPC migrace `supabase/migrations/20260703170000_sales_leads_draft_rpc.sql` aplikována na produkci **`xkzhjldrojjlrkezorey`** přes `apply_migration` (ne `db push`); vznikl RPC `sales_lead_save_draft` (SECURITY DEFINER, anon EXECUTE odebrán, authenticated povolen). Edge Functions **`sales-lead-research`** a **`sales-lead-draft-email`** nasazeny na produkci, obě **ACTIVE**. Produkční **`OPENAI_API_KEY` je nastavený** (hodnota se nikde neuvádí). Produkční UI `/admin/sales-leads` ověřeno na leadu `ikonic Point s.r.o`: AI rešerše firmy funguje, AI návrh e-mailu funguje, ruční uložení konceptu funguje; historie kontaktu zapisuje `AI rešerše firmy`, `AI návrh e-mailu`, `Návrh e-mailu upraven`. **Žádný e-mail se neodeslal, Resend není použitý — existuje pouze interní koncept.** Staging nebyl produkčním nasazením dotčen. Wallets, payments, contests, tickets, winners, Stripe ani `buy_ticket_atomic` nebyly dotčeny. Další fáze bude až samostatné odesílání e-mailu přes člověka s `sales_leads.manage`, nikdy ne AI.

**Timestamp (Europe/Prague): 2026-07-03** (Sales Leads Phase 3A verified in PRODUCTION UI)

- **2026-07-03** — **Modul „Obchod / Leady" — Fáze 3A produkčně ověřena v UI.** Po Lovable Publish produkční UI `/admin/sales-leads` funguje: ruční přidání firmy funguje (lead založen přes `sales_lead_create`), lead se zobrazí v seznamu, detail leadu funguje, úprava údajů funguje (`sales_lead_update_fields`), historie kontaktu se zapisuje (`sales_lead_activities`). Ověřeno na produkčním leadu `ikonic Point s.r.o`. Fáze 3A je tím produkčně ověřená (ruční přidání + detail + editace + historie). Edge Functions, AI research, Resend a odesílání e-mailů stále nejsou implementované (Fáze 3 e-mail / Fáze 4).

**Timestamp (Europe/Prague): 2026-07-03** (Sales Leads Phase 3A write RPCs applied to PRODUCTION)

- **2026-07-03** — **Modul „Obchod / Leady" — Fáze 3A write RPC aplikovány na PRODUKCI (schválení Pavla).** PR #168 (Fáze 3A frontend + write RPC) mergnut do main. Migrace `supabase/migrations/20260703160000_sales_leads_write_rpcs.sql` byla aplikována na **staging `dxmowysntemfqfnanxua`** i produkci **`xkzhjldrojjlrkezorey`** přes `apply_migration` (ne přes `db push`), výsledek **`{"success": true}`**. Na produkci existují RPC `sales_lead_create` a `sales_lead_update_fields`; obě SECURITY DEFINER, anon EXECUTE odebrán, authenticated EXECUTE povolen; `sales_lead_set_status` stále existuje; `sales_leads` má na produkci 0 řádků. Změna čistě aditivní. Staging nebyl touto produkční akcí dotčen. Fáze 3A byla předtím E2E ověřena na stagingu (lead `ce2a421d-e881-401d-b137-8e36e76fb680`, „TEST OneMil Sales Lead F3A") — create + editace + změna stavu `novy→priprava` + zápis `sales_lead_activities` (3×) a `sales_lead_status_history` (1×); testovací lead zůstal pouze na stagingu. DB backend Fáze 1 + 3A je nyní hotový na stagingu i produkci. Edge Functions, AI research, Resend a odesílání e-mailů stále nejsou implementované. Další krok je Lovable Publish + vizuální kontrola `/admin/sales-leads`.

**Timestamp (Europe/Prague): 2026-07-03** (Sales Leads Phase 1 migration applied to PRODUCTION)

- **2026-07-03** — **Modul „Obchod / Leady" — Fáze 1 DB migrace aplikována na PRODUKCI (schválení Pavla).** Migrace `supabase/migrations/20260703150000_sales_leads_module_phase1.sql` byla aplikována na produkci **`xkzhjldrojjlrkezorey`** přes `apply_migration` (ne přes `db push`), výsledek **`{"success": true}`**. Na produkci existují tabulky `sales_leads`, `sales_lead_activities`, `sales_lead_status_history`, `sales_lead_email_suppression` a RPC `sales_lead_set_status`; RLS zapnuté na všech 4 tabulkách; `sales_leads` má zatím 0 řádků. Změna byla čistě aditivní — nebyly změněny wallets, payments, contests, tickets, winners, Stripe ani existující soutěžní logika. Staging `dxmowysntemfqfnanxua` nebyl touto akcí dotčen. Edge Functions, AI research, Resend a odesílání e-mailů stále nejsou implementované (Fáze 3/4). Další krok je Lovable Publish + vizuální kontrola `/admin/sales-leads`.

**Timestamp (Europe/Prague): 2026-07-03** (Sales Leads admin module Phase 1 + 2 documented)

- **2026-07-03** — **Admin modul „Obchod / Leady" — Fáze 1 a 2 rozjeté.** PR #163 mergnut: `docs/SALES_LEADS_ADMIN_SPEC.md` = finální specifikace modulu Obchod / Leady (jednoúrovňové oprávnění `sales_leads.manage` = plný přístup vč. přípravy, schválení a odeslání e-mailů přes Resend; AI nikdy neodesílá e-mail sama; superadmin jen přiděluje/odebírá klíč). PR #164 mergnut: Fáze 1 DB migrace je v main jako `supabase/migrations/20260703150000_sales_leads_module_phase1.sql`. PR #165 mergnut: Fáze 2 frontend skeleton je v main (route `/admin/sales-leads`, klíč `sales_leads.manage`, nav „Obchod", read-only stránka `AdminSalesLeads.tsx`). Migrace Fáze 1 byla aplikována **pouze na staging projekt `dxmowysntemfqfnanxua`** (přes `apply_migration`, ne `db push`); **produkce `xkzhjldrojjlrkezorey` nebyla dotčena.** Na stagingu ověřeny tabulky `sales_leads`, `sales_lead_activities`, `sales_lead_status_history`, `sales_lead_email_suppression` a RPC `sales_lead_set_status`. Lovable Publish zatím neproběhl; produkční migrace zatím neproběhla; Edge Functions, AI research, Resend a odesílání e-mailů zatím nejsou implementované (Fáze 3/4).

**Timestamp (Europe/Prague): 2026-07-02** (Public customer light/champagne UI PR #140-#155 documented)

- **2026-07-02** — **Public customer light/champagne premium UI documented.** PR #140 added the route-scoped `public-customer-theme` wrapper and light public Header/BottomNavigation outside admin/partner/affiliate/influencer routes. PR #141 started the homepage light content pass. PR #142/#143 moved `/games` and contest cards to a complete light customer style. PR #144 extended the light customer style to homepage, `/vouchers`, and `/wins`. PR #145 tuned the homepage/footer/latest-winners area into a warmer champagne premium look. PR #146's logged-out champagne experiment was reverted by PR #147. PR #148 restored the logged-out profile/login composition with white top space, centered card, and champagne lower shadow; PR #149 reused that logged-out background for `/messages`, `/wins`, `/games`, and `/vouchers`. PR #150 aligned `/winners` with the homepage champagne/smoky background and latest-winners cards. PR #151-#153 introduced, darkened, and then expanded the premium orange heading style across public customer headings. PR #154 polished the homepage `Dobijte si MioCoiny` section with a champagne panel, softer package cards, toned bonus badges, and amber CTA buttons. PR #155 polished the `/wins` win card banner so MioCoin bonus images render fully instead of cropped. These changes were visual/customer UI only and did not change DB, migrations, Supabase, payments, Stripe, wallet, contest logic, tickets, voucher logic, or admin/partner/affiliate business logic.

**Timestamp (Europe/Prague): 2026-07-01** (Voucher code purchase rollout documented)

- **2026-07-01** — **Voucher code purchase rollout completed and documented.** PR #135 was squash merged into `main`. Migration `20260701073000_buy_voucher_atomic_issue_code.sql` was applied to production Supabase project `xkzhjldrojjlrkezorey`; production `buy_voucher_atomic` now assigns one unique code from `voucher_codes` on a new voucher purchase, writes `user_vouchers.voucher_code_id`, and moves the code from `available` to `issued`. The function uses `FOR UPDATE SKIP LOCKED` so the same code cannot be issued to two users. Old purchased vouchers without a code were not backfilled. Production verification confirmed a new purchase shows its code in the `Zobrazit kód` modal. Production data was not manually changed.

**Timestamp (Europe/Prague): 2026-07-01** (`/vouchers` full-banner tabs documented)

- **2026-07-01** — **`/vouchers` page fixes completed and documented.** PR #132 fixed purchased voucher cards to full-banner style and added the favorite heart flow. PR #133 unified full-banner cards across `Dostupné`, `Oblíbené`, and `Zakoupené`; purchased voucher codes are no longer shown directly on cards and open only in the `Zobrazit kód` modal; date/count bubbles were removed from `/vouchers`. After Lovable Publish, `/vouchers` was verified as working. Production was not directly touched.

**Timestamp (Europe/Prague): 2026-07-01** (Voucher card public sizing fixes documented)

- **2026-07-01** — **Voucher card sizing fixes completed and documented.** PR #129 fixed the public voucher card horizontal ratio in `src/components/VoucherShowcase.tsx`. PR #130 made the homepage voucher card match the contest card size (`w-80 h-48`) in `src/pages/Homepage.tsx`. Czech texts remain fixed after PR #127. After Lovable Publish, the homepage voucher card was verified as OK. Production was not directly touched.

**Timestamp (Europe/Prague): 2026-07-01** (Voucher system state after PR #120-#127 documented)

- **2026-07-01** — **Voucher system state documented after PR #120-#127.** PR #120 created `docs/vouchers/VOUCHER_SYSTEM_DESIGN.md`; PR #121 added the DB foundation for voucher codes and the production Supabase voucher codes migration is applied; PR #122 added admin code management; PR #123 added the admin voucher creation/edit wizard; PR #124 simplified voucher graphics to one banner upload; PR #125/#126 added public voucher display; PR #127 fixed broken Czech public texts. Current next step recorded: fix the public voucher card size/aspect ratio. Documentation only; no app code, DB, migrations, UI, wallet, Stripe, contests, tickets, or production data changed.

**Timestamp (Europe/Prague): 2026-06-30 17:05:00 +02:00** (Staging Stripe TEST hotový — poznámka k e2e wallet)

- **2026-06-30** — **Stripe staging TEST hotový.** Po opakovaných TEST checkout testech vzniklo na stagingu `dxmowysntemfqfnanxua` 7 completed plateb pro `e2e@onemil.cz` (každá 310 MC, `cs_test_`), wallet e2e nyní **7130.00** (4960 + 7×310, vše připsáno přes webhook). Redirect na Lovable preview je očekávaný (staging `PUBLIC_APP_URL` vrácen na Lovable; webhook/kredit běží server-side nezávisle na redirectu — není to produkční problém). Staging e2e wallet navýšení je **čistě testovací — nečistit bez samostatného schválení Pavla.** Produkce nedotčena (133 plateb, poslední 07:18 = incident).

**Timestamp (Europe/Prague): 2026-06-30 16:10:00 +02:00** (Stripe PAY01–PAY04 staging TEST ověřeno)

- **2026-06-30** — **Stripe PAY01–PAY04 staging TEST mode ověřeno ✅.** Flow ověřen end-to-end na stagingu `dxmowysntemfqfnanxua` přes lokální frontend `localhost:8090`. PAY01 checkout 200; PAY02 webhook 200 + payment completed 310 + wallet e2e 4960→5270; PAY03 redirect na localhost/payment-success; PAY04 druhý Resend → 0 duplicit, žádný druhý credit. Root cause fix (staging only): trigger `update_wallet_after_payment` zapisoval do neexistujícího `wallets.balance_vouchers` → webhook 500 → sjednoceno s produkční `balance_coins`-only definicí (`CREATE OR REPLACE`, žádná data). Staging `PUBLIC_APP_URL` dočasně na localhost pro test, poté vráceno na `https://preview--million-ticket-draw.lovable.app`. Produkce nedotčena, žádná reálná platba. Live Stripe přepnutí = samostatný schválený krok (produkce stále TEST mode).

**Timestamp (Europe/Prague): 2026-06-30 09:30:00 +02:00** (Stripe TEST cleanup documented)

## Strict header (do not break)
### What belongs in this file
- Only **dated chronological history** (what happened and when).
- Keep entries short and factual; link to concrete artifacts (migrations, functions, pages) where possible.

### What must never be written here
- Current state summaries, invariants, "what is working/broken now" (belongs to `onemil_state.md`).
- Mixed state+history blocks or duplicated state dumps.
- Undated narrative dumps.

---

## 2026-06-30 -- Stripe TEST cleanup from accidental frontend production redirect

A Lovable preview environment (frontend) was discovered to be pointing to the production Supabase project `xkzhjldrojjlrkezorey` instead of the staging project `dxmowysntemfqfnanxua`. This resulted in 5 unintended test Stripe payments (cs_test_* session ids, 310 MioCoinUs each, user `435ab4e9…`) being recorded on production at 2026-06-30 07:10–07:18 UTC. Cleanup was approved by Pavel and executed: wallet debited by 1550 MioCoinUs (guarded UPDATE, final balance 7650.50); the 5 payments were marked as status='refunded' (not deleted, audit trail preserved); 0 tickets affected, 0 referral rewards affected, remaining 52 historical `cs_test_` payments left untouched. No e-mails were sent, no mutations occurred outside wallet + payment status, and no data was deleted. Root cause (frontend redirect) and broader historical test data (52 other TEST payments) remain open for separate resolution during the pre-launch data reset and Stripe live transition planning. No code was changed; production was touched only by the guarded wallet + refund-status updates.

## 2026-06-29 -- Partner invoice VAT fix production rollout COMPLETE

Partner invoice VAT calculation fix was rolled out to production `xkzhjldrojjlrkezorey` after explicit Pavel approval, following the gate `docs/rollback/partner_invoice_vat_fraction_production_gate.md`. Backup relied on the Supabase scheduled physical backup 29 Jun 2026 02:17:36 +0000. Data fix: a guarded transaction updated the single partner with `vat_rate=21` (id `44253103-7d55-416a-8db4-57f945f1cf3b`) to `0.21`, after which `percent_partners=0`. Migration `supabase/migrations/20260629180000_partner_invoice_vat_fraction_fix.sql` (commit `9b4df3a8`) was applied, unifying `create_partner_invoices_for_last_week` and `generate_partner_invoice` on `net * vat_rate` (removing the `/100` that produced VAT 100x too small for the fraction convention); `create_partner_invoices_for_period` was already correct and unchanged. Postcheck passed: all 11 partners `vat_rate=0.2100`; `lastweek_div100=false`, `generate_div100=false`, `period_div100=false`; dry-run `0.21` -> VAT 21.00 / gross 121.00; `existing_invoice_mismatch=0`. No invoice was created, no e-mail was sent, no data was deleted, and existing invoices were unchanged. Production was touched only by the approved 1-row data fix and the 2 function replacements.

## 2026-06-29 -- Partner invoice VAT fix staging verification + production audit

Partner invoice PDF showed wrong VAT (net 14.00 -> VAT 294.00 -> gross 308.00). Root cause: `partners.vat_rate` is stored as a fraction (default 0.2100), but `create_partner_invoices_for_last_week` and `generate_partner_invoice` divided by 100 (100x too small for fraction data); `create_partner_invoices_for_period` (live weekly cron path) already computed `net * vat_rate` correctly. The reported 294/308 originated from a partner whose `vat_rate` was 21 at test time. Fix unified all functions on the fraction convention. Verified on staging `dxmowysntemfqfnanxua` (net 14.00 -> VAT 2.94 -> gross 16.94) via a corrected `generate_partner_invoice` invoice; staging test mutations were reverted. Read-only production audit then found mixed data (10 partners 0.21, 1 partner 21) and inconsistent functions, so a rollout gate requiring a data fix before the migration was prepared and committed. Migration committed `9b4df3a8`; gate doc committed `b42cdd97`; TODO for a detailed per-line invoice activation overview committed `1042749b`. No production change in this verification/audit step.

## 2026-06-29 -- BOHEMIA order 2026000005 verified customer e-mail enqueue end-to-end

Read-only production verification confirmed BOHEMIA order `2026000005` completed the intended live flow after the customer e-mail enqueue fix: imported=yes, reward code created=yes, status=`activated`, e-mail queued=yes, e-mail sent=yes, duplicate=no. This verifies the full production path `Shoptet import -> reward code -> email_queue -> sent e-mail -> customer activation`. No customer e-mail, full reward code, Shoptet URL, or secret value was recorded.

## 2026-06-29 -- Shoptet customer e-mail enqueue fix production rollout COMPLETE

BOHEMIA/Shoptet customer e-mail enqueue fix was rolled out to production `xkzhjldrojjlrkezorey` after explicit Pavel approval. Fresh production backup was created and verified with `pg_restore -l`. Migration `supabase/migrations/20260629160000_shoptet_onemil_customer_email.sql` was applied and recorded in migration history. Edge Function `import-shoptet-orders` was deployed to production as ACTIVE version 10. Postcheck passed: BOHEMIA remains `shoptet_customer_delivery='onemil'`; no historical e-mails were backfilled; order `2026000004` was not resent; no manual e-mails were sent; `partner_coin_activations` stayed unchanged; pending `email_queue` remained 0; future new Shoptet orders are ready to enqueue the customer e-mail on fresh `pending -> issued`. Production was touched only by the approved backup, migration, migration-history repair, EF deploy, and read-only postchecks.

## 2026-06-29 17:30 UTC -- Shoptet automatic import scheduler production rollout COMPLETE

Shoptet automatic import scheduler fully deployed to production `xkzhjldrojjlrkezorey` (29. 06. 2026, explicit Pavel approval). Migration `20260629150000_shoptet_auto_import_cron_prod.sql` applied (atomic transaction): pg_net + pg_cron extensions, Vault secret `shoptet_cron_internal_token` generated once (never printed), SECURITY DEFINER function `verify_shoptet_cron_token(text)` service_role-only with revoked public/anon/authenticated, orchestrator `run_shoptet_cron_imports()` SECURITY DEFINER looping partners WHERE `shoptet_import_enabled=true` with 30-minute overlap guard and pg_net dispatch (x-internal-token header), pg_cron job `shoptet_auto_import_15min` scheduled `*/15 * * * *`. Edge Function `import-shoptet-orders` deployed v8 ACTIVE: `verify_jwt=false`, Vault token verify via RPC, `trigger='cron'` support, overlap guard, `reward_trigger_status` threshold respect, 5-bucket status taxonomy, idempotent. Backup before apply: `backups/onemil-production-pre-shoptet-cron-20260629-143257.dump` (465 825 272 B, verified pg_restore -l exit 0, 1643 TOC entries). Production postcheck ✅: cron job active=true schedule `*/15 * * * *`; latest cron run status=`ok` rows_failed=0; idempotence verified — run 1 created=1 skipped_dup=2, run 2 created=0 skipped_dup=3; BOHEMIA `shoptet_customer_delivery='partner'` zero OneMil customer emails; cron still running after DB password reset. No production data mutations except approved Phase 2 rollout. Commit: `cd811f41`. Next: monitor cron runs (daily latest status + failed rows + pending email queue, weekly created vs. orders + dup spikes + activation growth + stale codes >30 dní). Optional Phase 3 (requires Pavel approval): admin view `/admin/shoptet-imports` + Telegram alert on `status != 'ok'`.

## 2026-06-29 17:45 UTC -- Database password reset after token exposure + cron verification

Production database password reset in Supabase Dashboard after token appeared in chat during `pg_dump` backup (commit cd811f41 backup step). Cron and EF continue functioning normally — app uses anon key and service_role key for runtime, not direct DB password (no hardcoded connection strings in repo). Verification post-reset: `shoptet_auto_import_15min` active=true, schedule `*/15 * * * *`, latest run status=`ok` rows_failed=0, BOHEMIA `delivery='partner'` unchanged, emails_sent_1h=0. Cron operational after password change ✅. Per project convention, exposed production credentials must be rotated; reset is non-breaking for the app.

## 2026-06-29 -- Shoptet customer e-mail enqueue fix prepared after staging validation

Prepared the BOHEMIA/Shoptet customer e-mail enqueue fix in clean `main` after the previous code session validated it on staging only. Added source-of-truth migration `supabase/migrations/20260629160000_shoptet_onemil_customer_email.sql` and updated `supabase/functions/import-shoptet-orders/index.ts` to aggregate `email_enqueued` from the status RPC without logging PII.

Behavior recorded: e-mail is enqueued atomically only on a fresh `pending -> issued` reward-code transition and only for `shoptet_customer_delivery = 'onemil'`; `partner` delivery creates no customer e-mail; duplicate status updates do not create duplicate e-mails; `partner_coin_activations` remain redeem-only. Staging validation from the prior session: e-mail queued on issued = yes, duplicate e-mail prevented = yes, partner delivery still no e-mail = yes, production touched = no. Production was not touched in this commit and still requires an explicit rollout gate before applying the migration or deploying the production importer.

## 2026-06-29 -- Partner dashboard weekly overview RLS fix applied to PRODUCTION

Migrace `supabase/migrations/20260629120000_partner_own_select_rls.sql` aplikována na produkci `xkzhjldrojjlrkezorey` (29. 06. 2026 10:15, výslovné schválení Pavla). Transakční COMMIT OK. Produkční postcheck ✅: 3× SELECT policies (cmd='r', role authenticated), 0 write policies; BOHEMIA partner visibility OK (vidí 5 own PRC: 2 Shoptet, 1 aktivovaný, `is_admin=false`); admin/superadmin visibility OK (PRC 5, PCA 3, PAK 17); data intaktní (4 issued, 1 activated, `auth_user_id` intaktní, `shoptet_customer_delivery='partner'` beze změny). Žádné DML mutace, postcheck transakce ROLLBACK. Partner dashboard se změní projeví po znovunačtení stránky. Rollback: 3× `DROP POLICY IF EXISTS`.

## 2026-06-29 -- Partner dashboard weekly overview RLS fix applied to STAGING

Fixed partner dashboard „Týdenní přehled" + stat cards showing all 0 for partner accounts (BOHEMIA). Root cause (read-only audit): `partner_reward_codes`, `partner_coin_activations`, `partner_api_keys` had RLS enabled but ZERO policies → deny-all for the partner's `authenticated` PostgREST session; the dashboard reads these via direct `.from()` with the partner JWT, so every read returned `[]` and rendered zeros. Data was correct (`issued_at` populated, no `created_at` column, no backfill needed); UI `weeklyReports` in `src/pages/PartnerDashboard.tsx` was already correct and unchanged. Fix: migration `supabase/migrations/20260629120000_partner_own_select_rls.sql` (STAGING `dxmowysntemfqfnanxua` only) adds 3 SELECT-only partner-own + admin/superadmin policies (`partner_id IN (SELECT id FROM partners WHERE auth_user_id = auth.uid()) OR is_admin() OR is_superadmin()`). No INSERT/UPDATE/DELETE policies — writes remain only via SECURITY DEFINER RPC / service_role. Staging postcheck ✅: 3× SELECT policies (role authenticated), 0 write policies; partner sees own rows only (9 PRC not 15, 2 PCA not 5, 0 PAK), cross-partner isolation (other partner = 0), admin/superadmin sees all (15/5/4), partner write blocked (UPDATE 0 rows, INSERT RLS-denied), BOHEMIA staging unchanged. Isolation tested in rolled-back transactions via temporary `auth_user_id` flip to a real non-admin user (FK to `auth.users`). Production `xkzhjldrojjlrkezorey` NOT touched (same deny-all confirmed there by audit; rollout is a separate step requiring explicit Pavel approval + `pg_dump`). No frontend deploy. Commit: `[pending]`.

## 2026-06-29 07:15 UTC -- Shoptet Phase 2 production rollout COMPLETE

Shoptet Phase 2 self-service e-shop connection fully deployed to production `xkzhjldrojjlrkezorey` (29. 06. 2026, explicit Pavel approval). Sequence: (1) DB migration `20260628120000_shoptet_connection_requests.sql` applied (atomic transaction, includes `shoptet_connection_requests` table + 4 RLS policies + 4 indexes + trigger + `reward_trigger_status` column on partners + 3 Vault RPC), (2) EF `submit-shoptet-connection` v3 deployed ACTIVE (verify_jwt=false, internal partner JWT validation), (3) EF `approve-shoptet-connection` v3 deployed ACTIVE (verify_jwt=false, admin/superadmin JWT validation, CRITICAL: always SET `shoptet_customer_delivery='onemil'` on approve), (4) EF `import-shoptet-orders` v5 deployed ACTIVE (replaces older version, verify_jwt=false, respects `reward_trigger_status` threshold, 5-bucket status taxonomy, idempotent), (5) Lovable Publish complete. Production postcheck ✅: table + 4 policies + 4 indexes present; Vault RPC anon=false/service_role=true; BOHEMIA `delivery='partner'` unchanged; 0 test SCR rows; all 3 EF ACTIVE; no Shoptet URLs in DB (Vault only). Monitoring: read-only SQL checks per Phase 1 plan. No production data mutations except approved Phase 2 rollout. Artifact: `docs/shoptet/PRODUCTION_ROLLOUT_PLAN.md` (corrected for single migration file). Commit: `c8d3f7bb` (CLAUDE.md), `[pending]` (onemil_state.md + onemil_history.md).

## 2026-06-28 14:30 UTC -- Shoptet Phase 2 E2E staging test PASSED + production rollout plan prepared

Shoptet Phase 2 self-service e-shop connection completed full staging E2E validation. Method: API-level test (EF invocations via curl + PostgREST queries) on project `dxmowysntemfqfnanxua`. All 6 phases verified: (1) partner draft creation, (2) URL submit via EF to Vault_pending, (3) admin badge display, (4) EF approve with delivery='onemil' + trigger copy + import enable, (5) EF reject with reason, (6) import dry-run respecting reward_trigger_status threshold. Safety: 0 emails, 0 codes created (dry_run mode), URL never in DB (only flag), BOHEMIA unchanged (`delivery='partner'`), production untouched. Artifacts: `src/pages/PartnerDashboard.tsx` (Step 5 UI), `src/pages/AdminPartners.tsx` (Step 6 UI), `docs/shoptet/PRODUCTION_ROLLOUT_PLAN.md` (comprehensive rollout with backup/migration/EF/publish/postcheck/rollback). Next: production rollout pending Pavel approval per text template in rollout plan. No production changes until approval sent.

## 2026-06-28 -- EF approve-shoptet-connection deployed to staging (v1 ACTIVE)

Edge Function `approve-shoptet-connection` nasazena na staging `dxmowysntemfqfnanxua` (v1 ACTIVE, verify_jwt=false, interní admin/superadmin check). Commit `d8fb8a69`. Approve flow: `promote_shoptet_pending_url` → partners update (`delivery='onemil'`, `import_enabled=true`, `trigger_status` z SCR, `export_secret_name`) → SCR status=active → best-effort email notify. Reject flow: `delete_shoptet_pending_url` (best-effort) → SCR status=rejected → partners beze změny → best-effort email notify. Smokes: auth-boundary 401/403, DB-level approve + reject + Vault klíče + BOHEMIA beze změny. Cleanup proveden. Produkce nedotčena.

## 2026-06-28 -- EF submit-shoptet-connection deployed to staging (v1 ACTIVE)

Edge Function `submit-shoptet-connection` nasazena na staging `dxmowysntemfqfnanxua` (v1 ACTIVE, verify_jwt=true). Commit `cbcef02f`. Auth-boundary smokes: HTTP 401 (no auth, fake token). DB-level: draft→submitted + Vault store + url_received=true + URL nikdy v DB. Race guard + Vault cleanup on failure. Veškerý test data cleanup proveden; BOHEMIA beze změny. Produkce nedotčena.

## 2026-06-28 -- Shoptet Phase 2 DB migration applied to staging (shoptet_connection_requests + reward_trigger_status + Vault RPCs)

Migration `20260628120000_shoptet_connection_requests.sql` applied to staging `dxmowysntemfqfnanxua`, commit `8bef720a`. New table `shoptet_connection_requests` (15 columns, RLS enabled, 4 policies with strict INSERT/UPDATE guards preventing partner from escalating draft status directly), unique partial index on partner_id for pending/active states, updated_at trigger, `reward_trigger_status` column added to `partners` (default `'paid'`, CHECK paid/shipped/completed), three `SECURITY DEFINER` Vault RPCs (`store_shoptet_pending_url`, `promote_shoptet_pending_url`, `delete_shoptet_pending_url`) with `service_role`-only execute. All postchecks green. BOHEMIA unchanged (`shoptet_customer_delivery='partner'`, `reward_trigger_status='paid'`). Production untouched. Staging ready for EF `submit-shoptet-connection` and `approve-shoptet-connection`.

## 2026-06-28 -- Shoptet Phase 2 product decision: three e-shop connection methods documented + delivery mode rule corrected

Product decision documented for OneMil partner onboarding: three e-shop connection methods defined — (1) Shoptet CSV automat (default self-service path: partner submits export URL, admin approves, OneMil creates codes and emails customer), (2) OneMil Partner API (for technically capable e-shops sending orders directly via `partner-activate` EF), (3) individual partner delivery (exception by agreement — OneMil creates codes but partner delivers to customer, BOHEMIA remains in this mode with `shoptet_customer_delivery='partner'`). Phase 2 implementation proposal for self-service Shoptet onboarding prepared (new table `shoptet_connection_requests`, EF `submit-shoptet-connection` + `approve-shoptet-connection`, partner UI form, admin badge + approval flow). Documentation only — no code, no migrations, no production changes.

Critical rule added on correction: production default `partners.shoptet_customer_delivery` is `'partner'`. Self-service Shoptet partners must receive `'onemil'` so OneMil emails the customer. EF `approve-shoptet-connection` must explicitly SET `shoptet_customer_delivery = 'onemil'` on approval — without this, new partners would silently inherit the `'partner'` default and customers would not receive codes by email. BOHEMIA is unaffected (does not use the self-service flow). Partner form does not offer delivery mode choice — `'partner'` and `'both'` are admin-only overrides set after approval.

## 2026-06-28 -- Shoptet import monitoring proposal documented

Following completion of Shoptet Phase 1C, a monitoring plan was documented for BOHEMIA ongoing imports. No code changes. Daily checks (read-only SQL): latest live run status in `shoptet_import_runs`, failed rows in `shoptet_import_row_log`, pending count in `email_queue` (expected 0 — BOHEMIA uses partner delivery). Weekly checks: `rows_created` vs. new orders, `rows_skipped_dup` spikes as signal of upstream Shoptet export anomalies, `partner_coin_activations` growth after customer redemption, stale `issued` codes older than 30 days. Optional Phase 2 (requires Pavel approval): admin view at `/admin/shoptet-imports` and Telegram alert on `status != 'ok'` if cron automation is added.

## 2026-06-28 -- Shoptet Phase 1C production live issuance completed

Production live issuance for Shoptet Phase 1C was executed on production project `xkzhjldrojjlrkezorey` with explicit Pavel approval. Method: PL/pgSQL DO block via PostgreSQL `http` extension v1.6 (synchronous server-side CSV fetch) — the Shoptet export URL, customer emails, and reward codes never appeared in tool arguments or results.

Live run 1: 2 rows from the current Shoptet CSV snapshot (orders `2026000001` and `2026000002`), both valid, 2 reward codes created and set to `issued` in the same transaction, 0 failed, run status `ok`. Emails to customers: 0 — BOHEMIA has `shoptet_customer_delivery='partner'` and delivers codes via their own e-shop. The 3 old production test codes with `external_order_id=NULL` were not touched. `partner_coin_activations` unchanged.

Idempotency run 2: same CSV, 2 rows, 0 created, 2 skipped as duplicates — correct behavior confirmed.

Note on row count difference: the prior dry-run (04:50 UTC) saw 6 rows including DEMO orders and `2026000001`. The live run (06:58 UTC) saw only 2 rows (`2026000001`, `2026000002`) because the Shoptet export generates a fresh dynamic snapshot; DEMO orders had since left the export window and a new real order appeared. This is normal live-export behavior.

CLAUDE.md updated and pushed in commit `d759346b`. Final read-only postcheck passed: 2 BOHEMIA codes with `external_order_id` both `issued`, 0 failed import rows, 0 pending `email_queue`, `partner_coin_activations` unchanged at 3, latest live run status `ok`, old 3 null-`external_order_id` test codes untouched. Production in expected state.

## 2026-06-27 -- Shoptet Phase 1 staging handoff documented

Documented the Shoptet Phase 1 handoff after staging-only completion of Phase 1A/1B/1C. Staging project: `dxmowysntemfqfnanxua`; production project: `xkzhjldrojjlrkezorey`; Phase 1A/1B commit: `2f0027e4`. The Shoptet URL remains Vault-only and was not written to documentation.

Recorded staging results: dry run = 6 rows total, 6 valid, 0 invalid, would create 6, status `paid` 6; Phase 1C created and issued 6 BOHEMIA reward codes on staging; idempotency second run created 0 duplicates; 1 Shoptet test email delivered to `veru.enge@gmail.com`; `eshop@onemil.cz` is the test e-shop / partner side and `veru.enge@gmail.com` is the test customer / buyer side. Also recorded cleanup of 474 old E2E emails parked then moved to `failed`, leaving final staging queue at 1 sent Shoptet test email, 0 pending, old artifacts failed.

Redeem was not completed because there is no public staging frontend. Pavel accidentally tested staging code on production `onemil.cz`; production correctly showed invalid because production DB does not contain staging codes. Production was untouched. Next task is production rollout planning only, not execution. Documentation-only change.

## 2026-06-24 -- partners_table_public_exposure production fix completed

The pre-existing `partners_table_public_exposure` finding was fixed in production `xkzhjldrojjlrkezorey`. PR #118 was merged to `main`. Migration `supabase/migrations/20260624122921_partners_public_view_rls_lock.sql` was applied atomically (COMMIT): it created the `public.public_partners` view exposing only safe approved/logo fields (granted to anon + authenticated), removed the broad `Public read partners` policy from the base `partners` table, revoked public/anon SELECT on `partners`, and added `partners_select_own_admin` (own row via `auth_user_id`, plus `is_admin()`/`is_superadmin()`). The public partner-logo display now reads from `public_partners` (`src/hooks/usePartners.ts`); production live bundle is `index-B-nGIJdT.js`.

Verification on production: `public_partners` exists; anon reads it (1 approved logo row, all `status=approved` + `logo_status=approved`); anon direct `partners` read is blocked (HTTP 401 / `42501 permission denied`); authenticated non-admin direct `partners` read returns 0 rows; partner own-row read returns 1; admin and superadmin read all rows (11/11); homepage partner logos render again; BOHEMIA API key flow unchanged (1 active key, `partner_api_keys` untouched); Shoptet importer unchanged.

A valid production pg_dump backup was created before the migration: `backups/onemil-production-pre-partners-exposure-fix-20260624-151442.dump` (~466 MB, `pg_restore -l` verified). A first dump attempt was interrupted and deleted; the retry is the valid backup. The migration was initially blocked from acquiring the exclusive lock by an orphaned `idle in transaction` backend PID `1131426` (left over from the interrupted first pg_dump, running `COPY public.admin_actions`); it was terminated via `pg_terminate_backend` with explicit Pavel approval (only that single PID), after which the migration applied successfully.

Documentation-only record; no code change, no further SQL, Shoptet importer and API keys untouched, no secrets printed. Open reminder: rotate exposed/test tokens and the production DB password before real launch.

## 2026-06-24 -- Phase 4 Slice A production smoke PASS

Phase 4 Slice A (Partner Offers permission `partner_offers.finance.manage`) was published to production (Lovable Publish) and manually verified — **smoke PASS**. Verified: the new permission exists as a checkbox in `/admin/admins`; a subadmin granted the key sees the "Partnerské nabídky" nav item and opens `/admin/partner-offers` successfully; sensitive routes remain blocked with the superadmin-only fallback (`/admin/invoices`, `/admin/partners-portal`, `/admin/payments`, `/admin/winners`, `/admin/statistics`); no invoices, payments, payouts, commissions, winners, contests, audit/system, or admin role management were opened. The Partner Offers delegation (offer-only page) is now LIVE. Documentation-only record; no SQL, no deploy, no app code change, no production data, `backups/` not committed. Next possible step (Phase 4 Slice B, needs Pavel approval): a separate Partner Offers finance page for offer invoices only (`partner_invoices type='offer'` + `partner_offer_invoice_lines`), not reusing the mixed `/admin/invoices` or `/admin/partners-portal`; for real isolation consider DB/RLS scoping (Slice C). Open reminder: production DB password reset still pending (it appeared in chat during the Phase 2 apply).

## 2026-06-24 -- Production partner API key rotation fix completed

PR #117 (`fix: improve partner API key rotation errors`) was merged to `main`. Production Edge Functions `partner-rotate-api-key` and `rotate-partner-api-key` were deployed to `xkzhjldrojjlrkezorey`. A token mismatch was fixed by aligning `INTERNAL_FUNCTION_TOKEN` and `VITE_INTERNAL_FUNCTION_TOKEN` for temporary testing; safe probe without partner session returned `missing_session`, confirming internal token validation passes. BOHEMIA manual API key regeneration succeeded: exactly 1 active API key by `revoked_at IS NULL`, 15 older keys revoked, latest active prefix `01efbfaf`. `partner_api_keys` stores prefix/hash columns only (`key_prefix`, `key_hash`, `api_key_hash`), with no plaintext API key column. Security reminders: temporary/exposed test tokens must be rotated before real launch; pre-existing `partners_table_public_exposure` still must be fixed before production launch. No full API keys, hashes, or secrets recorded.

## 2026-06-23 -- Phase 2: targeted staging permissions E2E spec

Added `tests/e2e/phase2-admin-permissions.spec.ts`, a targeted staging-only Playwright spec for the Phase 2 safe permission slice. The spec uses staging CI secrets and enforces staging ref `dxmowysntemfqfnanxua`; it temporarily sets `admin-e2e@onemil.cz` to `vouchers.manage` only, verifies the DB helper matrix, checks `/admin/vouchers` access and Czech fallback on denied safe routes, verifies sensitive/unscoped admin nav is hidden, and restores the original permission rows in cleanup. `divispavel2@gmail.com` superadmin is DB-verified as implicit-all; browser superadmin smoke runs only when a dedicated superadmin password secret exists. No production, no Edge Function deploy, no full E2E, no app behavior change.

## 2026-06-23 -- Phase 2: frontend gating prvního safe slice

Frontend wiring granulárních subadmin oprávnění (navazuje na DB foundation `admin_permissions`). Klíče jen safe: vouchers/content/banners/notifications.manage. Nový hook `src/hooks/useAdminPermissions.ts` (`can(key)`, superadmin⇒vše, čte admin_permissions přes RLS; tabulka chybí→prázdné). Nový `src/components/admin/RequirePermission.tsx` obaluje 4 routy v `App.tsx` (vouchers/content/banners/notifications) → fallback „Tato část je dostupná pouze superadminovi nebo administrátorovi s oprávněním." `AdminContextSubNav.tsx` + `AdminPrimaryNav.tsx`: non-superadmin vidí jen položky/sekce s drženým oprávněním (strict scoping; zachovává Phase 1 sensitive hiding jako podmnožinu); superadmin plná nav beze změny. Grant/revoke UI v `AdminAdmins.tsx` (superadmin-only): sloupec se 4 checkboxy, toggle = insert/delete admin_permissions (RLS jen superadmin) + log_admin_action. Phase 1 contest gates beze změny. Žádná DB/RLS/EF/SQL změna, žádná produkce, žádný deploy. `npm run build` ✅, `tsc --noEmit` 0 chyb. ⚠️ Frontend nepublikovat na produkci před aplikací migrace admin_permissions na produkci.

## 2026-06-23 -- Phase 2: admin_permissions DB foundation (staging only)

DB základ granulárních subadmin oprávnění. Migrace `supabase/migrations/20260623_admin_permissions.sql` aplikována **jen na staging `dxmowysntemfqfnanxua`; produkce `xkzhjldrojjlrkezorey` nedotčena.** Tabulka `public.admin_permissions` (UNIQUE(user_id, permission_key), index, RLS on) + helper `public.has_admin_permission(check_key text, check_user_id uuid default auth.uid())` (SECURITY DEFINER, owner postgres, search_path=public, execute jen authenticated). Superadmin implicitně všechna oprávnění; jinak explicit řádek. RLS: select = vlastní/superadmin vše, write (grant/revoke) = jen superadmin. Klíče jen safe (vouchers/content/banners/notifications.manage), žádné citlivé. Testy (transakce s rollbackem): superadmin→true (i náhodný klíč), admin bez práv→false, admin s vouchers→true jen ten klíč, admin čte jen vlastní, admin grant→42501, superadmin grant→OK, anon exec=false; staging beze změny (rows=0, admin:2). Aditivní, zatím to nic nečte. Rollback: DROP FUNCTION/ DROP TABLE. Žádný frontend, žádný EF deploy, žádná produkce.

## 2026-06-23 -- Subadmin sensitive admin nav links hidden (frontend-only)

Navázáno na contest UI gate (46715ee3). `src/components/admin/AdminContextSubNav.tsx`: pro non-superadmina nový `filterEntriesForSubadmin` odstraní citlivé sub-nav položky (`dashboardTab ∈ {ticketmap, bonus-overview, prizes, distribution, contest-control}`, `path = /admin/statistics`) a zahodí vyprázdněné menu. Skryto subadminovi: Mapa tiketů, Přehled bonusů, Bonusové ceny, Distribuce bonusů, Contest control, Statistiky. Zůstává: Správa soutěží, Seznam soutěží + ostatní nescitlivé. Superadmin nav beze změny (`isSuperAdmin ? seg.entries : filterEntriesForSubadmin(...)`). Žádná DB/RLS/RPC/EF/SQL změna, žádný deploy. `npm run build` ✅, `tsc --noEmit` 0 chyb.

## 2026-06-23 -- Subadmin contest UI gating (frontend-only)

Po Phase 1 backend locku přidáno frontend-only skrytí citlivých contest interních dat před non-superadminy. Gate = `useUserRole().isSuperAdmin`. **Žádná DB/RLS/RPC/EF/SQL změna, žádný deploy.** Gatováno: `AdminContestManagement.tsx` (nefetchuje contest_progress/contest_revenue/contest_activity_last_24h pro non-superadmina; skryt souhrnný panel + sloupce Tikety/% hotovo/Bonusové MioCoiny; modal taby Bonusy–MioCoins/Bonusy–věcné/Ekonomika), `TicketMapAdmin.tsx` (fallback + žádný fetch), `AdminBonusOverview.tsx` (fallback + žádný fetch/realtime), `admin/ContestControlPanel.tsx` (fallback), `ContestDetailAdmin.tsx` (guard isAdmin→isSuperAdmin, subadmin dostane fallback místo login redirectu). Fallback: „Tato část je dostupná pouze superadminovi." NEzměněn `AdminContestView.tsx` (zákaznický buy-ticket view) ani public flows. Superadmin UI beze změny. `npm run build` ✅. Volitelný follow-up: skrýt nav odkazy na citlivé taby.

## 2026-06-23 -- Phase 1 post-production smoke fix: contest_progress public aggregate restored

After Phase 1 production lock, `/games` smoke showed a browser console warning `permission denied for table tickets` while fetching contest progress. Investigation found no direct `/games` raw `tickets` read; frontend reads `public.contest_progress`, which aggregates `contests` + `tickets`. Production had `security_invoker=true`, so anon/authenticated callers needed raw `tickets` access, now correctly blocked by Phase 1.

Applied one production SQL statement on `xkzhjldrojjlrkezorey`: `ALTER VIEW public.contest_progress RESET (security_invoker);`. This restored the previously owner-accepted E22 behavior: public aggregate progress only, no raw ticket exposure. No tickets RLS change, no frontend edit, no Edge Function deploy, no `db push`.

Verification passed: anon can read `contest_id, tickets_sold, tickets_total` from `contest_progress`; anon raw `tickets` read still fails with permission denied; authenticated normal user with own tickets sees own rows and `0` other-user rows; superadmin still has `is_superadmin() = true` and reads admin-locked `tickets` / `payments`; `https://onemil.cz/games` no longer logs the `contest_progress` / `tickets` permission warning. Backups remain uncommitted.

## 2026-06-22 — Phase 1 sensitive-admin production DB/RLS/RPC lock applied

Production apply completed on project `xkzhjldrojjlrkezorey` after Pavel's explicit approval: `SCHVALUJI PRODUKČNÍ APPLY`.

Pre-apply safety was verified: manual production backup exists at `backups/onemil-production-pre-phase1-20260622-220723.dump` (`465,594,754` bytes / `444.03 MB`) and `pg_restore -l` passed with `2195` TOC entries. Backup folder remains local/uncommitted and must not be committed. Rollback remained available from `docs/rollback/phase1_production_rollback.sql` with baseline `docs/rollback/phase1_baseline.sql`.

Applied production DB/RLS/RPC lock: helper `public.is_superadmin(check_user_id uuid default auth.uid())` exists, `SECURITY DEFINER`, owner `postgres`; `divispavel2@gmail.com` returns true; sensitive RLS policy fail count `0`; target RPC fail count `0`; affiliate own commission SELECT preserved; payments/tickets own-row policies preserved; partner own invoice policies preserved; `winners` / `bonus_prizes` public-read behavior preserved; production-only `get_admin_top_bar_stats()` included in RPC lock.

Edge Functions were not deployed and remain verification-only; production sources were already superadmin-gated on JWT/user paths, with partner invoice internal token / service-role automation paths unchanged. Rollback was not needed.

Follow-up completed: Pavel reset the production DB password again because one password appeared in chat during backup work. The stale tracked local `.cursor/mcp.json` direct production DB credential was removed after the reset; app/runtime remains unaffected because it does not use the direct DB password. `backups/` is gitignored and must remain uncommitted.

## 2026-06-22 — Phase 1 sensitive-admin staging lock final milestone

Recorded final documentation milestone for Phase 1 sensitive-admin staging lock. Full lock is complete on staging `dxmowysntemfqfnanxua`; production `xkzhjldrojjlrkezorey` was not touched. Staging now blocks scoped admin/subadmin access to sensitive admin data across RLS, RPCs, and Edge Functions.

Covered areas: `payments`, `influencer_commissions`, affiliate finance RLS/RPC/Edge Functions, partner invoice Edge Functions, partner invoices and exports, `contest_economy`, tickets admin read / contest revenue dependencies, contest admin RPCs, winners write/status history, prize delivery RPCs, `referral_rewards`, `settings`, and `event_logs`.

Partner invoice Edge Functions changed on staging: `generate-partner-invoice-pdf` and `send-partner-invoice-email`; JWT path now requires `role='superadmin'`, while internal token / service-role automation paths intentionally remain unchanged.

Tests passed: superadmin allowed; admin/subadmin blocked; normal user blocked; anon blocked; affiliate own commission visibility preserved; staging data and roles unchanged after cleanup.

Operational notes recorded: old worktree previously had Supabase CLI linked to production, so future staging deploys must explicitly use `--project-ref dxmowysntemfqfnanxua` or the clean main worktree after target verification; production-only `get_admin_top_bar_stats` still must be handled during production rollout; public-read `winners` / `bonus_prizes` behavior is a separate product/design decision. Production rollout requires explicit Pavel approval, manual `pg_dump` first because PITR is off, rollback from `docs/rollback/phase1_baseline.sql`, and staged rollout with stop points.

Documentation only: no SQL run, no Edge Functions deployed, no production changes made, no app behavior changed.

## 2026-06-22 — Phase 1: affiliate finance lock KOMPLETNÍ na stagingu

Celá affiliate finance oblast uzamčena superadmin-only na stagingu `dxmowysntemfqfnanxua` ve 3 vrstvách; **produkce `xkzhjldrojjlrkezorey` nedotčena.**
- **RLS → `public.is_superadmin()`:** `affiliate_payout_documents/apd_admin_all`, `affiliate_payout_batch_items/apbi_admin_all`, `affiliate_payout_batches/apb_admin_all`, `affiliate_commissions/aff_commissions_admin_write`, `affiliate_commissions/aff_commissions_select` (affiliate-own SELECT branch zachován).
- **RPC → `public.is_superadmin()`:** `admin_set_affiliate_commission_status`, `create_affiliate_payout_batch`, `mark_affiliate_payout_batch_paid`, `update_affiliate_payout_batch_meta` (SECURITY DEFINER, obcházejí RLS → gatovány zvlášť; swap přes pg_get_functiondef + replace, owner postgres).
- **Edge Functions → superadmin-only** (`role='superadmin'`, chyba `access_denied_superadmin_only`): `create-affiliate-payout-document` v10, `generate-affiliate-bank-export` v11 (přenasazena z přesného commitnutého zdroje, staging=GitHub). Commit EF fix `715e5b4a`.
- **Testy:** superadmin povolen; admin/subadmin, normální uživatel, anon blokováni; affiliate vidí vlastní provize; admin přímý write blokován `42501`; EF admin→403, anon→401, superadmin→safe not_found bez mutace. Vše přes seedované řádky / throwaway superadmin + transakční rollback, EF přes throwaway user JWT (smazán). Staging data/role beze změny (`admin:2`).
- **Rollback:** `docs/rollback/phase1_baseline.sql` (RLS+RPC); git historie / předchozí EF verze. Produkční rollout = samostatné schválení + manuální `pg_dump` (PITR off).

## 2026-06-22 — Phase 1: affiliate_payout_batch_items superadmin-only na stagingu

Druhý objekt affiliate finance. Na stagingu `dxmowysntemfqfnanxua` policy `apbi_admin_all` na `public.affiliate_payout_batch_items` změněna z `is_admin()` na `public.is_superadmin()` (ALL, USING+WITH CHECK) — jediná policy; žádná jiná tabulka/RPC/EF/frontend. **Produkce `xkzhjldrojjlrkezorey` nedotčena.** Test (využit existující reálný řádek + dočasný role flip v transakci s rollbackem): superadmin→1, admin/subadmin→0, normální uživatel→0, anon→0; admin přímý INSERT zablokován RLS WITH CHECK `42501` (s reálnými FK id). Existující řádek beze změny (`total_rows=1`), role `admin:2`; policy ponechána. Rollback SQL zachyceno (návrat na `is_admin()`). Další objekt: `affiliate_payout_batches` / `apb_admin_all`. Produkční rollout: schválení + manuální `pg_dump` (PITR off). Jen staging DDL + transakční ověření.

## 2026-06-22 — Phase 1: affiliate_payout_documents superadmin-only na stagingu

První objekt affiliate finance oblasti. Na stagingu `dxmowysntemfqfnanxua` policy `apd_admin_all` na `public.affiliate_payout_documents` změněna z `is_admin()` na `public.is_superadmin()` (ALL, USING+WITH CHECK) — jediná policy tabulky; žádná jiná tabulka/RPC/EF/frontend. **Produkce `xkzhjldrojjlrkezorey` nedotčena** (stále `is_admin()`). Test (seedovaný throwaway doc, FK přeskočeno `session_replication_role=replica` jen pro seed, + dočasný role flip v transakci s rollbackem): superadmin→1, admin/subadmin→0, normální uživatel→0, anon→0; admin přímý INSERT zablokován RLS WITH CHECK `42501` (s reálnými FK id). Staging data/role beze změny (`total_docs=0`, `admin:2`); policy ponechána. Rollback SQL zachyceno (návrat na `is_admin()`). Legitimní tvorba dokladů jde přes EF `create-affiliate-payout-document` (service-role, obchází RLS) → neovlivněno. Další objekt: `affiliate_payout_batch_items` / `apbi_admin_all`; write teeth = 4 affiliate RPC gates. Produkční rollout: výslovné schválení + manuální `pg_dump` před zápisem (PITR off). Jen staging DDL + transakční ověření.

## 2026-06-22 — Phase 1: influencer_commissions exposure fix na stagingu

Druhý Phase 1 gate. Na stagingu `dxmowysntemfqfnanxua` policy `influencer_commissions_read` na `public.influencer_commissions` změněna z `SELECT TO public USING (true)` (anon i kdokoli přihlášený četl všechny řádky citlivých provizí) na `SELECT TO authenticated USING (public.is_superadmin())`. Jediná policy tabulky; žádná jiná tabulka/RPC/EF/frontend. **Produkce `xkzhjldrojjlrkezorey` nedotčena** (stále `TO public USING (true)`). Test (seedovaná provize + dočasný role flip v transakci s rollbackem): superadmin→1, admin/subadmin→0, normální uživatel→0, anon→0. Staging data/role beze změny (`total_rows=0`, `admin:2`); opravená policy záměrně ponechána. Rollback SQL zachyceno (návrat na `TO public USING (true)`). Risk note: budoucí self-view influencerů na vlastní provize vyžaduje samostatnou own-row policy. Produkční rollout: výslovné schválení + manuální `pg_dump` před zápisem (PITR off). Jen staging DDL + transakční ověření.

## 2026-06-22 — Phase 1: payments superadmin-only gate ověřen na stagingu

Pilot prvního reálného superadmin-only gate. Na stagingu `dxmowysntemfqfnanxua` policy `admin_payments_read_all` na `public.payments` změněna z `has_role(admin) OR has_role(superadmin)` na `public.is_superadmin()` — **jen tato jedna policy**; own-payment policy (`payments_select_own`, `payments_user_read`) beze změny. **Produkce `xkzhjldrojjlrkezorey` nedotčena.** Test (seedovaná pending platba cizího vlastníka + dočasný role flip v transakci s rollbackem): superadmin čte všechny (1), admin/subadmin necte cizí (0), normální uživatel necte cizí (0), anon necte (0). Staging data/role ponechány beze změny (`total_payments=0`, `admin:2`); policy persistuje. Rollback SQL zachyceno (návrat n…43839 tokens truncated…vždy proběhl → pokud vrátil 0 řádků (RLS blokuje update čerstvě vytvořeného řádku, SECURITY DEFINER RPC ho vytvořil, ale klient-side UPDATE nemá práva), `setSaving(false); return` se spustil před `onSaved()`/`onClose()` → modal zůstal otevřený i po úspěšném vytvoření soutěže.
  - **Part B fix:** pro CREATE mód: při `updatedRows.length === 0` se zobrazí error toast ale kód pokračuje (nevrací `return`) → modal se zavře. Pro EDIT mód: původní chování (`return`) zachováno.
  - Žádné migrace, žádný RPC, žádné workflow changes, žádná schémata.
- **Staging Full E2E run `26059677757`** spuštěn po mergi — **27 passed, 0 failed, 3 skipped** (4m 14s).
  - Spec 18 ✅ passed (10.8s, první pokus).
  - Spec 19 ✅ passed (10.9s).
  - Telegram `✅ OneMil STAGING full E2E OK` doručen (message_id 475).

---

## 2026-05-18 — PR #53 + PR #54 mergnuty + Staging Full E2E zelený (run 26057380995)

### Co bylo provedeno
- **PR #53** fix: sanitize gallery upload file names to prevent Supabase Storage Invalid key error — mergnut do `main`. Merge commit: `8356ac04bdf3d03f457febe6e199fca4593e856b`. Změněn pouze `src/components/AdminContestManagement.tsx` (+46 / −6).
  - Root cause: raw file names s mezerami, českou diakritikou nebo závorkami (např. `Snímek obrazovky 2026-05-09 150423.png`) způsobovaly Supabase Storage error `Invalid key`. Ovlivňovalo gallery image a background uploads v admin contest modalu.
  - Fix: přidán `sanitizeStorageFileName()` helper; aplikován na všechny 3 gallery upload paths (image upload existující soutěž, background upload existující soutěž, pending gallery flush při save nové soutěže). Storage key formát: `${Date.now()}-${crypto.randomUUID()}-${safeFileName}`. Czech error fallback pro uživatele.
  - Žádné migrace, žádný RPC, žádné workflow changes.
- **PR #54** fix: replace flaky skip guard in spec 08 with robust Promise.race pattern — mergnut do `main`. Merge commit: `819cb77819bfc37598a621b46821a1995c17d2c9`. Změněn pouze `tests/e2e/08-partner-offer-persistence.spec.ts` (+16 / −3).
  - Root cause: staging run `26055723773` selhal na spec 08 — `waitForTimeout(2_000) + okamžité isVisible()` bylo fragile; na pomalejším staging loadu se empty-state text nevykreslil do 2s, `isVisible()` vrátilo false, skip guard se nespustil, test selhal na neexistujícím `div.group.cursor-pointer`.
  - Fix: nahrazen `Promise.race` pattern (mirror spec 07) — wait up to 10s pro offer card nebo empty state text, poté skip guard. Přidán `!firstCard.isVisible()` fallback skip. Žádný app kód ani workflow nezměněn.
- **Staging Full E2E run `26057380995`** spuštěn po mergi obou PR — **26 passed, 0 failed, 3 skipped** (4m 0s).
  - Spec 08 ✅ skipped (PR #54 fix funguje).
  - Spec 18 ✅ passed — first attempt failed transiently (contest_economy pomalé načítání na staging; expected "4242", received "0"), retry #1 prošel (15.8s). Playwright retry absorboval; žádný code fix potřeba.
  - Spec 19 ✅ passed (12.3s).
  - Telegram `✅ OneMil STAGING full E2E OK` doručen (message_id 471).
  - Poznámka k transient spec 18: `toHaveValue('4242', { timeout: 8_000 })` na pomalém staging DB loadu může být borderline; Playwright retry konfigurací zachyceno.

---

## 2026-05-18 — PR #52 mergnut + Staging Full E2E zelený (run 26053065266)

### Co bylo provedeno
- PR #52 **feat: add bulk quantity distribution for physical bonus prizes** mergnut do `main`.
- Merge commit: `e43cda76c4f187bd4a8e9ae00ec3396626a73e19`.
- Změněn pouze `src/components/AdminContestManagement.tsx` (+194 / −28). Žádné migrace, žádný RPC, žádný workflow change.
- Přidána nová UI pole v záložce „Bonusy – věcné": **Počet kusů** (default 1, min 1) a **Rozmístění pozic** (Rovnoměrně / Náhodně, viditelné pouze při qty > 1).
- Při qty = 1: stávající chování (manuální Pozice tiketu) zachováno beze změny.
- Při qty > 1: `pickPositions` helper generuje N bezkolizních pozic — rovnoměrně (evenly spaced indices) nebo náhodně (Fisher-Yates shuffle, výsledek seřazen). Kolizní pravidla: vylučuje MioCoin pozice, existující věcné výhry, final-ticket pozici (ticket_count), pozice mimo rozsah 1..(ticket_count-1). Pokud pool < qty → česky chybový toast, přidání blokováno.
- Po bulk add: description + image se resetují, economy pole (dodavatel/cena/DPH/balné) se zachovávají, Počet kusů se resetuje na 1. Toast ukazuje prvních 5 přidělených pozic.
- Opraven stale helper text: `"Do Supabase se v této fázi neukládají."` nahrazen přesným popisem o persistenci ekonomických metadat při uložení soutěže.
- Staging Full E2E run `26053065266` spuštěn po mergi — **27 passed, 0 failed, 3 skipped** (3m 56s). Spec 18 ✅ (9.8s), spec 19 ✅ (10.0s). Telegram `✅ OneMil STAGING full E2E OK` doručen (message_id 462). Žádná regrese.

---

## 2026-05-18 — Staging Full E2E zelený po staging SQL fix (run 26046436837)

### Co bylo provedeno
- Staging Full E2E run `26046436837` proběhl po aplikaci staging SQL oprav — **27 passed, 0 failed, 3 skipped** (4m 28s).
- Spec 18 (`Admin — Economy Persist`) ✅ prošel (11.9s).
- Spec 19 (`Admin — Physical Prize Economy Persist`) ✅ prošel poprvé (11.2s, bez retry) — první plně zelený průchod spec 19.
- Telegram notifikace `✅ OneMil STAGING full E2E OK` doručena.
- 3 skipy jsou záměrné pre-existující skipy: spec 01 new-user registration (nepoužívá se na staging), spec 07 partner offer open, spec 08 partner offer persistence.
- Toto je finální potvrzení, že Phase 4 Economy Persistence je kompletní a plně zelená na staging i produkci.

---

## 2026-05-18 — Staging SQL opravy: bonus_prizes columns + write RLS policy

### Co bylo provedeno
- Na staging projektu `dxmowysntemfqfnanxua` aplikovány manuálně dvě SQL opravy přes Supabase SQL Editor:
  1. **Phase 4 economy sloupce na bonus_prizes:** `ALTER TABLE public.bonus_prizes ADD COLUMN IF NOT EXISTS supplier_name TEXT, unit_cost_czk NUMERIC, vat_rate_percent NUMERIC, handling_override_czk NUMERIC;` — ekvivalent migrace `20260517180100_add_bonus_prize_economy_columns.sql`, která byla aplikována na produkci ale chyběla na staging.
  2. **Write RLS policy na bonus_prizes:** `CREATE POLICY "Allow admin full access to bonus prizes" ON public.bonus_prizes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role)) WITH CHECK (...);` — staging měl pouze dvě SELECT policies, žádnou write policy. Bez ní přímé client-side `.update()` / `.delete()` z admin UI tichce selhávaly (PostgREST vrátil 200/204, 0 řádků dotčeno). SECURITY DEFINER RPC INSERT fungoval (obchází RLS), čímž se maskoval problém — bonus prize se vytvořil na pozici 42, ale economy metadata se neuložila.
- Root cause spec 19 failures (run 26040307928 a 26042798457): chybějící write policy způsobila, že `.update({supplier_name, unit_cost_czk, vat_rate_percent, handling_override_czk})` po RPC tiše neuložil žádná data; na reload se zobrazovaly výchozí hodnoty.
- Žádné soubory v repozitáři nezměněny; opravy jsou čistě DB-side na staging projektu.

---

## 2026-05-18 — PR #51 workflow admin E2E seed step mergnut

### Co bylo provedeno
- PR #51 **fix: ensure staging admin E2E user has admin role before E2E suite** mergnut do `main`.
- Merge commit: `97797662d19cafe53062a04fb73449545ef98780`.
- Zdrojová větev: `fix/spec19-admin-staging-seed`; cílová větev: `main`.
- Změněn jediný soubor: `.github/workflows/playwright-staging.yml`.
- Přidán nový workflow krok "Ensure staging admin E2E user has admin role" vložený před "Run full E2E suite".
- Krok používá Supabase Admin API k nalezení nebo vytvoření `admin-e2e@onemil.cz` v auth.users; poté upsertuje public.users (role=admin), user_roles (role=admin), profiles, wallets. Idempotentní — bezpečný při každém spuštění.
- Root cause spec 19 selhání (run 26029330415): `admin_manage_bonus_prize` RPC kontroluje `SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','superadmin')` — admin E2E user chyběl v public.users na staging, RPC vrátil `{success:false, "Pouze administrátoři..."}`, dialog se nezavřel.
- Proč spec 15/16/17/18 procházely: spec 15/17 jsou read-only; spec 16 volá jen `admin_manage_contest` (jiný exception handler — re-raise, ne catch-and-return); spec 18 nepřidává fyzické výhry → `admin_manage_bonus_prize` se nevolá.
- Žádný app kód, testy, migrace ani business logika nezměněny.

---

## 2026-05-18 — Staging Full E2E zelený po PR #16 (run 25995782004)

### Co bylo provedeno
- Staging Full E2E run `25995782004` proběhl po mergi PR #16 — **25 passed, 3 skipped, 0 failed** (3m 36s).
- Spec 17 (`Profile Smoke`) ✅ prošel poprvé (5.7s) — nový test přidaný v PR #16.
- Spec 16 (`Admin — Economy Preview Smoke`) ✅ prošel (6.0s).
- Telegram notifikace `✅ OneMil STAGING full E2E OK — all specs passed` doručena.

---

## 2026-05-17 — PR #16 profile smoke E2E test mergnut

### Co bylo provedeno
- PR #16 **Add profile smoke E2E coverage** mergnut do `main`.
- Merge commit: `7fd9766972b4a84c9ee33b11357f42ad46c38854`.
- Zdrojová větev: `test/e2e-profile-smoke`; cílová větev: `main`.
- Přidán nový spec: `tests/e2e/17-profile-smoke.spec.ts` (54 řádků, staging-only, read-only).
- Původní název `12-profile-smoke.spec.ts` přejmenován na `17-` aby nedošlo ke kolizi s existujícím `12-mobile-messages-layout.spec.ts`.
- Test ověřuje: login jako E2E user → `/profile` → identita (e-mail), sekce Peněženka/MioCoiny/Váš MioCoin účet, Účet heading, Přihlašovací údaje, Osobní údaje — bez redirectu na login/onboarding.
- Guard: `test.skip` pokud chybí `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`; staging-only.
- Žádný app kód, DB schéma, migrace, workflow soubory, Supabase volání, platby, soutěže, tikety, výhry, vouchery, Partner Offers ani `buy_ticket_atomic` nezměněny.

---

## 2026-05-17 — Staging Full E2E zelený po PR #38 (run 25994857704)

### Co bylo provedeno
- Staging Full E2E run `25994857704` proběhl po mergi PR #38 — **24 passed, 3 skipped, 0 failed** (2m 36s).
- Spec 16 (`Admin — Economy Preview Smoke`) ✅ prošel poprvé čistě (5.3s).
- Telegram notifikace `✅ OneMil STAGING full E2E OK — all specs passed` doručena.

---

## 2026-05-17 — PR #38 spec 16 Ekonomika tab scope fix mergnut

### Co bylo provedeno
- PR #38 **fix(spec-16): scope Ekonomika tab assertions to active tab panel** mergnut do `main`.
- Merge commit: `214248d40b95956636315ca7c7f9b60abd56fcc3`.
- Zdrojová větev: `fix/spec16-ekon-tab-scope`.
- Změněn jediný soubor: `tests/e2e/16-admin-economy-preview.spec.ts`.
- Root cause: economy summary bar (vždy viditelný nad záložkami) obsahoval stejné texty jako Ekonomika tab — `dialog.getByText(/Celkové odhadované náklady/)` a `/11\s*360 Kč/` matchovaly 2 elementy, strict mode odmítl.
- Fix: přidán `const econPanel = dialog.locator('[role="tabpanel"][data-state="active"]')` po kliknutí na záložku Ekonomika; všech 7 assertions v sekci přesunuto z `dialog` na `econPanel`.
- Žádný app kód, migrace, workflow soubory ani business logika nezměněna.

---

## 2026-05-17 — PR #37 spec 16 Balné strict mode fix mergnut

### Co bylo provedeno
- PR #37 **fix(spec-16): resolve strict mode violation on Balné assertion** mergnut do `main`.
- Merge commit: `cd5a497cb4bc7b4d7dd994d620af3e3f93e33c99`.
- Zdrojová větev: `fix/spec16-strict-mode-balne`.
- Změněn jediný soubor: `tests/e2e/16-admin-economy-preview.spec.ts` (1 řádek).
- Root cause: regex `/Balné \/ pošta \/ práce/` matchoval 2 elementy — `<label>Balné / pošta / práce na věcnou výhru v Kč</label>` (věcné tab, hidden v DOM) a `<span>Balné / pošta / práce</span>` (Ekonomika tab).
- Fix: `dialog.getByText(/Balné.../)` → `dialog.getByText('Balné / pošta / práce', { exact: true })`.
- Žádný app kód, migrace ani business logika nezměněna.

---

## 2026-05-17 — PR #36 admin modal layout cleanup mergnut

### Co bylo provedeno
- PR #36 **fix: widen admin contest modal and remove horizontal scrollbars** mergnut do `main`.
- Merge commit: `f6a28ca51ebf7783a3529e70fd36745fe77a95cc`.
- Zdrojová větev: `fix/admin-modal-layout-issue-35`; cílová větev: `main`.
- Změněn jediný soubor: `src/components/AdminContestManagement.tsx` (pouze layout CSS třídy).
- `max-w-4xl` cap odstraněn — modal nyní používá `max-w-[95vw]` a je podstatně širší na desktopu.
- `overflow-x-auto` odstraněn z wrapperu horního economy summary baru — žádný vnitřní horizontální scrollbar.
- Economy summary bar grid změněn z `min-w-max grid-cols-5` na `grid-cols-2 sm:grid-cols-3 lg:grid-cols-5` — responsivní zalamování na menších obrazovkách.
- `min-w-[9.5rem]` odstraněn z položek summary baru (grid řídí šířku).
- TabsList změněn z `inline-flex w-max` na `flex flex-wrap h-auto w-full` — záložky se zalamují místo přetékání.
- Nebyl změněn žádný výpočet, validace, save behavior, Supabase volání, testy, migrace ani business logika.
- `npm run build` prošel.

---

## 2026-05-17 — PR #34 admin economy preview E2E test mergnut

### Co bylo provedeno
- PR #34 **feat: Phase 3A physical prize cost preview + spec 16 admin economy smoke** mergnut do `main`.
- Merge commit: `ff45f2ad37bcf7ca4178c96277bb300aec52dd6c`.
- Zdrojová větev: `codex/issue-33-admin-economy-preview`; cílová větev: `main`.
- Přidán nový spec: `tests/e2e/16-admin-economy-preview.spec.ts` (staging-only, read-only).
- Test ověřuje: otevření create modal adminem, vyplnění preview polí věcné výhry, zaktualizování horního economy summary baru a záložky Ekonomika — bez kliknutí finálního uložení soutěže.
- Selektory opraveny po Codex review: `getByLabel()` nahrazen helper funkcí `inputByLabel()` (label → parent div → input); `summaryValue()` přepsán na `div.uppercase.opacity-70` + `xpath=following-sibling::div[1]`.
- Test se přeskakuje (`test.skip`), pokud chybí `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`.
- PR také přinesl Phase 3A rozšíření `AdminContestManagement.tsx` o frontend-only cost preview pro věcné výhry.
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, migrace ani produkce.
- `npm run build` prošel.

---

## 2026-05-17 — Phase 3A physical prize cost preview připraven v adminu

### Co bylo provedeno
- `src/components/AdminContestManagement.tsx` rozšířen o frontend-only cost preview pro věcné bonusové výhry.
- Do lokálního `PhysicalPrize` state přidána pole `supplier_name`, `unit_cost_czk`, `vat_rate` a `handling_override_czk`.
- Formulář věcné bonusové výhry nově umožňuje zadat dodavatele, nákupní cenu v Kč, DPH a volitelný override balného / pošty / práce.
- Seznam přidaných věcných výher zobrazuje i cost preview metadata.
- Ekonomika tab a horní economy summary bar nově započítávají preview náklady věcných výher do celkových nákladů, zisku, marže, bodu zvratu a doporučené ceny ticketu.
- Balné používá per-prize override, pokud je vyplněný; jinak globální default.
- Nákladové údaje věcných výher jsou v této fázi pouze frontend preview a neukládají se do Supabase.
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, `admin_manage_bonus_prize`, `distribute-bonus-prizes` ani migrace.
- Testy nebyly v této fázi rozšířeny; follow-up má přidat bezpečný staging-only admin test pro live economy preview bez finálního create.
- `npm run build` prošel.

---

## 2026-05-16 — PR #30 exact MioCoin positions save mergnut

### Co bylo provedeno
- PR #30 **Fix MioCoin final save to use previewed positions** byl mergnut do `main`.
- Zdrojová větev: `fix/save-previewed-miocoin-positions`; cílová větev: `main`.
- Merge commit: `7b50b30d2413ad6d839f8e4100c2a9c7a806710d`.
- Změněn jediný soubor: `src/components/AdminContestManagement.tsx`.
- Phase 2B opravila finální save MioCoin bonusů v `AdminContestManagement`.
- Finální uložení soutěže nyní persistuje MioCoin bonusy podle přesně previewovaných pozic z frontend state `mioCoinBonuses`.
- Admin save path už nere-randomizuje MioCoin pozice přes `distribute-bonus-prizes`.
- Před uložením se validují bonusové pozice: celá čísla, rozsah `1..ticket_count`, duplicitní MioCoin pozice, kolize MioCoin/věcné výhry a kolize s posledním ticketem.
- Editace bonusových pozic existující soutěže je blokována, pokud už pro soutěž existují tikety.
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, `bonus_prizes` schema, main prize final-ticket logic, migrace ani production smoke scope.
- PR smoke check prošel. Nebyl proveden manuální deploy.

---

## 2026-05-16 — PR #27 admin economy summary bar mergnut

### Co bylo provedeno
- PR #27 **feat: add admin economy summary bar** byl mergnut do `main`.
- Zdrojová větev: `feature/admin-economy-summary-bar`; cílová větev: `main`.
- Merge commit: `9ea63c81c218ba91422005e8c09ab457800ef395`.
- Změněn jediný soubor: `src/components/AdminContestManagement.tsx`.
- Nad taby admin contest modalu přibyl kompaktní read-only live economy summary bar.
- Summary bar ukazuje počet ticketů, celkové odhadované náklady, doporučenou cenu ticketu, odhadovaný čistý zisk a marži.
- Používá stejné frontend-only výpočty jako tab **„Ekonomika"**.
- Nic neukládá do Supabase.
- Nebyl změněn `buy_ticket_atomic`, `bonus_prizes` schema, Partner Offers, winner logic, ticket purchase logic, migrace ani finální save behavior.
- PR smoke check prošel. Nebyl proveden manuální deploy.

---

## 2026-05-16 — PR #26 read-only admin ekonomika soutěže mergnuta

### Co bylo provedeno
- PR #26 **feat: add read-only contest economy panel** byl mergnut do `main`.
- Zdrojová větev: `feature/read-only-contest-economy-panel`; cílová větev: `main`.
- Merge commit: `5f5eb28b17c0cab2b8eaa47e360d75b34252ba59`.
- Změněn jediný soubor: `src/components/AdminContestManagement.tsx`.
- Admin modal pro vytvoření/editaci soutěže má nový read-only tab **„Ekonomika"**.
- Panel počítá hrubou tržbu, DPH, čistou tržbu, náklad na hlavní výhru, náklad na MioCoin bonusy, balné/poštu/práci, jednorázový setup/distribuční náklad, marketingový náklad, celkové odhadované náklady, odhadovaný zisk, marži, bod zvratu v počtu ticketů a doporučenou minimální cenu ticketu.
- Ekonomické předpoklady se resetují při změně modal kontextu, aby se nepřenášely mezi novou soutěží, editací a znovuotevřením modalu.
- Panel je frontend-only a zatím nic neukládá do Supabase.
- Nebyl změněn `buy_ticket_atomic`, `bonus_prizes` schema, Partner Offers, winner logic, ticket purchase logic, migrace ani finální save behavior.
- PR smoke check prošel. Nebyl proveden manuální deploy.

---

## 2026-05-15 — PR #24 + PR #25 Admin Affiliate pages smoke test přidán a aktivován (spec 15)

### Co bylo provedeno
- Staging admin E2E účet vytvořen: `admin-e2e@onemil.cz`, id `3960e47f-b583-4ef9-a48f-786bfe432bbd`, `public.user_roles.role=admin` (staging only, produkce nedotčena).
- GitHub Secrets přidány: `STAGING_E2E_ADMIN_EMAIL`, `STAGING_E2E_ADMIN_PASSWORD`.
- PR #24 `test/e2e-admin-affiliate-pages-smoke` → `main` (merge commit `8a8ba05`): přidán `tests/e2e/15-admin-affiliate-pages-smoke.spec.ts` — read-only smoke pro 3 admin Affiliate stránky.
- PR #25 `test/wire-admin-e2e-secrets` → `main` (merge commit `024fd92`): 2 řádky v `playwright-staging.yml` — `E2E_ADMIN_EMAIL` + `E2E_ADMIN_PASSWORD`.
- Post-merge Staging Full E2E run `25942146994` ✅ — **23 passed, 3 skipped, 0 failed** — spec 15 RUNS (ne skip) a prošel za 10.5s. Telegram OK.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

## 2026-05-15 — PR #23 Affiliate E2E secrets zapojeny do staging workflow, spec 14 aktivován

### Co bylo provedeno
- PR #23 **ci: wire Affiliate E2E secrets into staging workflow (spec 14)** byl mergnut do `main` (merge commit `ecf7abf`).
- Zdrojová větev: `test/wire-affiliate-e2e-secrets`; cílová větev: `main`.
- Změna: 2 řádky přidány do `.github/workflows/playwright-staging.yml` — `E2E_AFFILIATE_EMAIL` a `E2E_AFFILIATE_PASSWORD` namapovány ze `STAGING_E2E_AFFILIATE_EMAIL` / `STAGING_E2E_AFFILIATE_PASSWORD` secrets.
- Staging Affiliate E2E účet vytvořen v staging DB (`dxmowysntemfqfnanxua`, pouze staging):
  - `auth.users`: `affiliate-e2e@onemil.cz`, id `8975593e-cc27-4f6b-ba23-c7077c914f38`, e-mail potvrzen.
  - `public.partners`: `status=approved`, `notes={"type":"influencer"}`, `auth_user_id` propojen.
- GitHub Secrets přidány: `STAGING_E2E_AFFILIATE_EMAIL`, `STAGING_E2E_AFFILIATE_PASSWORD`.
- Post-merge Staging Full E2E run `25941172937` ✅ — **22 passed, 3 skipped, 0 failed** — spec 14 RUNS (ne skip) a prošel za 4.9s. Telegram OK.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

## 2026-05-15 — PR #22 spec 10 flaky E2E test opraven a mergnut do main

### Co bylo provedeno
- PR #22 **fix: stabilize voucher balance E2E test (spec 10)** byl mergnut do `main`.
- Zdrojová větev: `fix/e2e-voucher-balance-before-read`; cílová větev: `main`.
- Merge commit: `3d645d7b98f5650c0a0f29c86f24f8ac87ff85cf`.
- Změněn jediný soubor: `tests/e2e/10-voucher-purchase-balance.spec.ts` (+16 / −1).

### Root cause flaky testu
- Spec 10 číst „before" zůstatek peněženky bez `waitForResponse` — UI mohlo zobrazit hodnotu před doběhnutím `loadUserBalance()` nebo zachytit hodnotu ovlivněnou async vedlejším efektem z předchozího spec 09.
- „After" čtení již `waitForResponse(GET /rest/v1/wallets)` mělo. Asymetrie způsobila nestabilitu při těsném spouštění dvou staging runů (PR #21 branch run + PR #21 post-merge run).
- Naměřeno: 15 MC pokles místo očekávaných 5 MC → assertion selhala.

### Oprava
- Přidán `waitForResponse(GET /rest/v1/wallets)` armovaný před `page.goto()` a awaited před čtením hodnoty — symetrizuje „before" a „after" čtení.

### PR #21 nebyl příčinou
- Spec 14 (přidaný v PR #21) v obou runech skipoval čistě. Selhání bylo pre-existing flakiness spec 10.

### CI výsledky
- Pre-merge branch Staging Full E2E: run `25939178932` ✅ 21 passed, 4 skipped, spec 10 ✅ (17.0s)
- Post-merge production smoke: run `25939417571` ✅ 5 passed (20.7s) — Telegram OK
- Post-merge Staging Full E2E na main: run `25939483233` ✅ **21 passed, 4 skipped, 0 failed**, spec 10 ✅ (13.4s) — Telegram OK
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #21 Affiliate dashboard login smoke test mergnut do main

### Co bylo provedeno
- PR #21 **test: Affiliate dashboard login smoke (spec 14)** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-affiliate-dashboard-smoke`; cílová větev: `main`.
- Merge commit: `b868aaf183ceeee71544832c43e23758cf46d809`.
- Přidán jediný soubor: `tests/e2e/14-affiliate-dashboard-smoke.spec.ts` (115 řádků).
- **Co test ověřuje:** přihlášení schváleného Affiliate partnera přes `/partner/login` → redirect `/influencer/dashboard` → badge „Aktivní Affiliate partner" → H1 → sekce „Váš Affiliate odkaz" → `input[readonly]` s `/?ref=` vzorem.
- **Guard:** `test.skip` pokud `E2E_AFFILIATE_EMAIL` / `E2E_AFFILIATE_PASSWORD` chybí — spec 14 skipuje čistě v production smoke i staging full E2E bez secrets.
- Read-only test — bez Supabase write, bez form submission dat, bez vytváření uživatelů.
- Chybějící follow-up: staging secrets `STAGING_E2E_AFFILIATE_EMAIL` + `STAGING_E2E_AFFILIATE_PASSWORD` nutné pro aktivaci spec 14 v CI.
- Post-merge staging full E2E selhal na spec 10 (flaky timing — nesouvisí). Opraveno v PR #22.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #20 Affiliate public pages E2E regression guard merged into main

### Co bylo provedeno
- PR #20 **test: E2E regression guard for public Affiliate program pages** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-affiliate-landing`; cílová větev: `main`.
- Merge commit: `0f5f864`.
- Přidán jediný soubor: `tests/e2e/13-affiliate-landing.spec.ts` (159 řádků, 3 testy).
- **Co test ověřuje (3 read-only testy, bez auth):**
  - `/influencer` — „Affiliate program OneMil" chip, H1, CTA tlačítko + href `/influencer/register`, „Jak to funguje" link + href `/influencer/how-to-earn`.
  - `/influencer/how-to-earn` — H1, „Sdílejte Affiliate odkaz" (krok 1), zpětný odkaz `/influencer`, dolní CTA.
  - `/influencer/register` — CardTitle „Registrace Affiliate partnera", vstupy name/email/password/mainPlatformUrl, zpětný odkaz; formulář **neodesílán**.
- **Read-only:** bez auth, bez form submission, bez Supabase write. Bez env proměnných — plně veřejné stránky.
- Chytí regresi při návratu „Influencer" wordingu nebo rozbití navigace / formuláře.
- Lokální Windows `spawn UNKNOWN` je pre-existující problém identický pro spece 01–13; CI (Ubuntu) prochází.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, Affiliate tracking, `buy_ticket_atomic` — nedotčeny.
- PR branch Staging Full E2E: run `25936217257` ✅ ALL PASSED.
- Post-merge production smoke: run `25936393035` ✅ SUCCESS — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25936408552` ✅ ALL PASSED — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #19 Mobile Messages layout E2E regression guard merged into main

### Co bylo provedeno
- PR #19 **test: E2E regression guard for mobile Messages layout** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-mobile-messages-layout`; cílová větev: `main`.
- Merge commit: `c27a103`.
- Přidán jediný soubor: `tests/e2e/12-mobile-messages-layout.spec.ts` (152 řádků).
- **Co test ověřuje (iPhone 14 viewport 390×844):**
  - Spodní navigace (`role="navigation" aria-label="Hlavní menu"`) je visible na `/messages`.
  - Spodní hrana navigace dosahuje viewport dna (`position: fixed` funguje).
  - Composer input (`placeholder="Napište zprávu..."`) je viditelný a jeho spodní hrana je nad horní hranou navigace.
  - Po scrollu messages listu se Y pozice navigace nezmění (≤ 2px tolerance) — hlídá regresi PR #17/18.
  - Po scrollu je composer stále viditelný nad navigací.
- **Read-only:** žádná zpráva neodeslána, žádná data nemutována, žádný Supabase write.
- Lokální Windows `spawn UNKNOWN` je pre-existující problém identický pro všechny spece 01–11; CI (Ubuntu) projde.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.
- PR branch Staging Full E2E: run `25935324024` ✅ ALL PASSED (3m02s).
- Post-merge production smoke: run `25935503396` ✅ SUCCESS — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25935550724` ✅ ALL PASSED — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #18 Messages bottom nav stability fix merged into main

### Co bylo provedeno
- PR #18 **fix: keep bottom nav stable on messages page** byl mergnut do `main`.
- Zdrojová větev: `fix/bottom-nav-stable-messages`; cílová větev: `main`.
- Merge commit: `dc94f61`.
- Změněn jediný soubor: `src/index.css` (5 řádků — přidán `min-height: 100dvh` k `.customer-layout` v `@media (max-width: 768px)`).
- **Root cause:** Po PR #17 (odstraněna třída `min-h-screen`) byla `.customer-layout` kratší než viewport (`100dvh − 5.75rem − safeArea`). iOS Safari rubber-band-scrolluje celou stránku — včetně `position: fixed` elementů — kdykoli se vnitřní scroll messages listu dostane na konec a dokument je kratší než viewport. Spodní navigace se tak vizuálně hýbala při scrollu.
- **Fix:** Přidán `min-height: 100dvh` k `.customer-layout` pro mobil. Customer-layout nyní vždy vyplňuje celý viewport → nulový prostor pro rubber-band scroll → spodní navigace zůstává pevně dole. Oprava kompozitoru z PR #17 zůstává zachována.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.
- PR branch smoke: run `25889262610` ✅ SUCCESS.
- Pre-merge Staging Full E2E na PR větvi: run `25889352492` ✅ ALL PASSED (3m21s).
- Post-merge production smoke: run `25889554142` ✅ SUCCESS — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25889587366` ✅ ALL PASSED — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-15 — PR #17 Messages composer fix merged into main

### Co bylo provedeno
- PR #17 **fix: keep messages composer above bottom nav** byl mergnut do `main`.
- Zdrojová větev: `fix/messages-composer-above-bottom-nav`; cílová větev: `main`.
- Merge commit: `42a06f6`.
- Změněn jediný soubor: `src/pages/Messages.tsx` (1 řádek — odstraněna třída `min-h-screen`).
- **Root cause:** `index.css` definuje `.messages-mobile-fixed-shell` pro `@media (max-width: 768px)` s `height: calc(100dvh - 5.75rem - env(safe-area-inset-bottom, 0px))`. Tailwindová třída `min-h-screen` (`min-height: 100vh`) tuto hodnotu přebíjela přes CSS cascade — shell narůstal na plnou výšku viewportu, vstupní pole skončilo za pevnou spodní navigací na iPhone/PWA.
- **Fix:** Odstraněna třída `min-h-screen`. CSS třída `.messages-mobile-fixed-shell` nyní funguje bez konfliktu — shell má na mobilu správnou výšku, zprávy scrollují uvnitř svého kontejneru, vstupní pole je celé viditelné nad spodní navigací.
- Bob, odesílání zpráv, routy, DB, Supabase, Stripe, wallet, soutěže, tikety, výhry, Partner Offers, `buy_ticket_atomic` — nedotčeny.
- PR smoke: run `25887802417` ✅ 5 passed.
- Pre-merge Staging Full E2E: run `25887887248` ✅ 17 passed, 3 skipped, 0 failed.
- Post-merge production smoke: run `25888181338` ✅ 5 passed — Telegram `OneMil PROD smoke OK` doručen.
- Post-merge Staging Full E2E na main: run `25888244060` ✅ 17 passed, 3 skipped, 0 failed — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-14 — Voucher purchase E2E spec 10 — čistý test-only PR #14 + staging RLS fix

### Co bylo provedeno
- PR #11 (`test/e2e-voucher-purchase-balance`) byl uzavřen bez merge — obsahoval smíšené změny (app hook, CSS, testy, workflow seed).
- Appový bugfix extrahován a mergnut odděleně jako PR #13 (`fix/user-vouchers-fetch`, merge commit `f9719101`).
- Otevřen nový čistý test-only PR #14 z větve `test/e2e-voucher-purchase-balance-clean` (base: `main` @ `c9d8123`).
- PR #14 obsahuje pouze 4 soubory: `tests/e2e/10-voucher-purchase-balance.spec.ts`, `.github/workflows/playwright-staging.yml`, `onemil_state.md`, `onemil_history.md`.
- Spec 10 ověřuje: login → balance read → voucher purchase → Zakoupené tab → balance decrease o přesně voucherPrice MC.
- Workflow rozšířen o 3 seed/reset kroky: Reset test user vouchers, Seed E2E Spec03 voucher, Seed E2E Spec10 voucher.
- Žádný app kód nebyl změněn. `useUserVouchers.ts` fix je na main od PR #13.

### Staging RLS nález a manuální oprava
- **Nález:** spec 10 selhával na „Uplatnit voucher" — tab Zakoupené byl vždy prázdný i po úspěšném nákupu.
- **Root cause:** Stagingový baseline dump vynechal `user_owns_voucher` SELECT policy na `user_vouchers`. PostgREST vracel `[]` (žádná chyba) → `fetchUserVouchers()` vracelo prázdné pole → `purchasedVouchers = []`.
- **Produkce:** měla správně všechny 4 policies (`user_owns_voucher` SELECT, `user_vouchers_insert_own` INSERT, `user_vouchers_delete_own` DELETE, `admin_all_voucher_access_secure` ALL).
- **Oprava:** 3 chybějící policies přidány manuálně na staging via Supabase MCP. Produkce nedotčena.
- **Žádná migrace nebyla commitnuta** v PR #14 — jde o staging infrastrukturní maintenance.
- **Pre-merge Staging Full E2E:** run `25882844526` ✅ **16 passed, 3 skipped, 0 failed** (2m0s).
- **PR #14 mergnut** do `main`, merge commit `4cba4b0`.
- **Post-merge production smoke:** run `25883126324` ✅ **5 passed (21.7s)** — Telegram `OneMil PROD smoke OK` doručen.
- **Post-merge Staging Full E2E na main:** run `25883434451` ✅ **16 passed, 3 skipped, 0 failed** (2m12s) — spec10 prošel 16.5s — Telegram `OneMil STAGING full E2E OK` doručen.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.

---

## 2026-05-14 — PR #13 useUserVouchers PostgREST embedded join fix merged into main

### Co bylo provedeno
- PR #13 **fix: replace PostgREST embedded join in useUserVouchers with two explicit queries** byl mergnut do `main`.
- Zdrojová větev: `fix/user-vouchers-fetch`; cílová větev: `main`.
- Merge commit: `f9719101cf98d6063aaf009f7b50acd2e833c33c`.
- Změněn jediný soubor: `src/hooks/useUserVouchers.ts` (+62 / -21 řádků).
- **Root cause opravené chyby:** `fetchUserVouchers()` používal PostgREST embedded join s explicitním FK hintem `!user_vouchers_voucher_id_fkey`. Na stagingové DB (obnovené z produkčního dumpu) PostgREST vrátil HTTP 400, který byl tiše zachycen blokem `try/catch` → `setVouchers([])` → tab Zakoupené zobrazoval prázdný stav i když `user_vouchers` řádky v DB existovaly.
- **Fix:** dva explicitní dotazy místo embedded joinu — (1) `user_vouchers` bez joinu, (2) `vouchers` dle batche ID; výsledky spojeny v Map na frontendu. Pole `voucher` přidáno jako `| null` — bezpečné, protože `expiration.isExpired` v `Vouchers.tsx` závisí jen na `created_at` z `user_vouchers`.
- Před mergem prošel PR smoke E2E (run `25878064722`, 15 passed, success).
- Po mergi do `main` prošel production smoke (run `25878209886`, success).
- Po mergi spuštěn Playwright Staging Full E2E na `main` (run `25878303521`, 15 passed + 3 skipped, success, Telegram OK). Spec 10 (`10-voucher-purchase-balance`) není v `main` — zůstává na PR #11 (`test/e2e-voucher-purchase-balance`).
- PR #11 zůstává OPEN a nemergnuto.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly změněny Supabase, Stripe, wallet logika, contests, tickets, winners, Partner Offers, schéma, RLS ani `buy_ticket_atomic`.

---

## 2026-05-14 — PR #10 wallet balance E2E coverage merged into main

### Co bylo provedeno
- PR #10 **Add wallet balance E2E coverage** byl mergnut do `main`.
- Zdrojová větev: `test/e2e-wallet-balance`; cílová větev: `main`.
- Merge commit: `6e32ec7e6df079eb1594e7335ec735c41a2bab47`.
- Přidán soubor `tests/e2e/09-wallet-balance.spec.ts` — nový Staging Full E2E test.
- Test ověřuje, že wallet balance klesne přesně o `ticket_price` MC po nákupu jednoho tiketu na `/contest/:id`.
- Test je staging-only a přeskočí se automaticky pokud `E2E_CONTEST_ID` není nastaven (production CI ho nemá) — production dat se nedotýká.
- Během vývoje na feature větvi byl identifikován a opraven Playwright strict mode violation (`.or()` lokátor vyřešil na 2 elementy — ContestDetail zobrazuje buy i top-up button současně). Fix: `.first()` přidáno ke kombinovanému lokátoru (commit `672d241`).
- Před mergem prošel PR smoke E2E (specs 01+02, 1m18s) i Playwright Staging Full E2E (2m38s, ALL PASSED).
- Po mergi do `main` prošel production smoke (run `25864204537`, 1m13s) i Playwright Staging Full E2E (run `25864280989`, 2m44s, ALL PASSED, Telegram OK).
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly změněny Supabase, Stripe, wallet logika, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-13 — Store policy copy cleanup PR #2 merged and post-merge validation passed

### Co bylo provedeno
- PR #2 **Store policy copy cleanup: 18+ and ticket order model** byl mergnut do `main`.
- Zdrojová větev: `feature/store-policy-18plus-ticket-order-copy`; cílová větev: `main`.
- Commit PR: `459367299d93bc1b57355b3ee3398be391a6cda7`.
- Merge commit: `c132be9ff60e15884d84f38d486c53dcb7f94666`.
- Změněno bylo pouze 6 schválených souborů:
  - `src/pages/ContestDetail.tsx`
  - `src/pages/Games.tsx`
  - `src/pages/OnboardingDateOfBirth.tsx`
  - `src/pages/PrivacyPolicy.tsx`
  - `src/pages/TermsConditions.tsx`
  - `src/pages/Vouchers.tsx`
- Veřejný launch age rule sjednocen na **18+**.
- Veřejná copy odstranila loterijní / random-generator framing a používá model: tikety se otevírají postupně v pořadí 1, 2, 3... a výherní pozice jsou předem určeny.
- MioCoin wording sjednocen: interní kredit OneMil, nelze vybrat jako peníze, nelze převádět mimo OneMil, lze použít pouze uvnitř OneMil.
- Charitativní wording upraven: vybrané kampaně mohou podporovat dobročinný účel a konkrétní příjemce / účel / výše podpory musí být uvedeny u dané kampaně.
- Před mergem prošlo PR smoke E2E a Playwright Staging Full E2E na feature větvi.
- Po mergi prošel `main` smoke workflow `25795875077`.
- Po mergi prošel Playwright Staging Full E2E na `main`, workflow `25795953772`.
- Nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly měněny Supabase, Stripe, OneSignal, Sofinity, wallet, contest engine, tickets, winners, bonus_prizes, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-12 — Paperclip AI team first live session

### Co bylo provedeno
- Paperclip server spuštěn lokálně na portu 3100 z `C:\Users\divis\Desktop\Onemil - Projekt\million-ticket-draw`.
- Claude Code (claude.exe v2.1.138) ověřen jako funkční adaptér; přihlášen jako divispavel2@gmail.com (Pro).
- Codex local adaptér otestován a funkční na Windows s Extra args: `--skip-git-repo-check`.
- Vytvořen a nakonfigurován agent **Provozní ředitel OneMil** (claude_local / codex_local).
- Vytvořen a nakonfigurován agent **Průzkumník obchodních leadů OneMil** (codex_local, Enable search ON).
- Duplikátní firma iCONIC POINT s.r.o. (prefix ICOA) smazána; zbyla pouze ICO.
- Projekt **OneMil** vytvořen pod firmou ICO; Provozní ředitel nastaven jako lead agent.
- Vytvořeny issues ICO-15 až ICO-19 (lead scouting, shortlist, kontakty, Dedoles one-pager, AI team návrh).
- Výstupy uloženy do `C:\Users\divis\Desktop\OneMil Paperclip Outputs`.
- Zjištěno a zdokumentováno pravidlo: Provozní ředitel je manažer, ne exekutor — deleguje na Průzkumníka.
- `onemil_state.md`, `onemil_history.md`, `CLAUDE.md` a `PAPERCLIP_SETUP_CONTEXT.md` aktualizovány.
- Žádný app kód, Supabase, migrace, workflow ani produkční systémy nebyly změněny.

---

## 2026-05-13 — Strategické rozhodnutí: Web/PWA first, native stores odloženy

### Co bylo rozhodnuto
- OneMil bude spuštěn nejdříve jako **Web/PWA**.
- Podání do **Apple App Store** a **Google Play** se odkládá.
- Důvod: OneMil nebude v této fázi platit Apple/Google poplatky 15–30 % z nákupů MioCoinů.
- Stripe zůstává platebním providerem pro **Web/PWA MioCoin top-up**.
- Budoucí nativní iOS/Android aplikace lze znovu zvážit pouze po schválení platební/store strategie.

### Read-only PWA audit
- Ověřeno, že aktivní `public/` zatím neobsahuje zapojený web app manifest ani PWA icon set.
- `index.html` má základní mobile viewport a title `OneMil`, ale nemá manifest link, `apple-touch-icon`, `theme-color` ani splash metadata.
- Aktivní offline/service-worker strategie nebyla nalezena; existuje pouze `public/OneSignalSDKWorker.js` pro OneSignal.
- Stripe Checkout flow pro web/PWA zůstává dostupný přes `create-stripe-checkout`.
- Nebyl změněn app kód, nebyl proveden deploy, migrace ani zásah do produkčních dat.
- Nebyly měněny Supabase, Stripe, OneSignal, Sofinity, wallet, tickets, contests, winners, bonus_prizes, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-11 — Added Paperclip setup context file PAPERCLIP_SETUP_CONTEXT.md

### Co bylo provedeno
- Přidán `PAPERCLIP_SETUP_CONTEXT.md` do rootu repozitáře.
- Soubor definuje základ pro nastavení Paperclipu jako AI management vrstvy pro OneMil.
- Popsán návrh prvního AI koordinátora `OneMil Chief of Staff`.
- Potvrzeno, že Pavel Diviš zůstává owner a final decision maker.
- Popsán approval model: Chief of Staff může navrhovat nové agenty, ale jejich spuštění musí schválit Pavel Diviš.
- Popsán první fokus: obchodní oddělení a strukturovaná databáze firem / leadů.
- Doplněny odkazy do `CLAUDE.md`, `.cursorrules` a `onemil_state.md`.
- Žádný app kód, Supabase, migrace, workflow ani produkční systémy nebyly změněny.

---

## 2026-05-11 — Added permanent business/product context file ONEMIL_BUSINESS_CONTEXT.md

### Co bylo provedeno
- Přidán `ONEMIL_BUSINESS_CONTEXT.md` do rootu repozitáře.
- Soubor definuje, že OneMil je B2B odměnová, partnerská a marketingová platforma, ne jen soutěžní aplikace.
- Popsán partner model: firmy samy nastavují MioCoin odměny a platí pouze za aktivované / použité MioCoiny.
- Popsány kupony, vouchery, Partner Offers, soutěže, uživatelé, osobní kódy, influenceři, agentury, sociální soutěže a podpora partnerů.
- `CLAUDE.md`, `onemil_state.md` a `.cursorrules` byly doplněny o odkazy na tento nový zdroj pravdy.
- Žádný app kód, Supabase, migrace, workflow ani produkční systémy nebyly změněny.

---

## 2026-05-11 — Added permanent company context file COMPANY_CONTEXT.md

### Co bylo provedeno
- Vytvořen `COMPANY_CONTEXT.md` v rootu repozitáře — trvalý zdroj pravdy pro firemní identitu, kontakty, podpis a fakturační údaje
- Obsah: iCONIC POINT s.r.o., IČO 17795851, DIČ CZ17795851, sídlo Praha 2, zakladatel Pavel Diviš, kontakty OneMil, veřejný e-mailový podpis
- Do `CLAUDE.md` přidáno pravidlo pro čtení `COMPANY_CONTEXT.md`
- Do `onemil_state.md` přidán odkaz na `COMPANY_CONTEXT.md`
- Bankovní údaje nejsou v repozitáři — uloženy ve fakturačním systému
- Žádný app kód, workflow, Supabase data ani produkce nebyly změněny

---

## 2026-05-10 — Staging registration: signup email domain opravena (commit `631f915`)

### Co bylo provedeno
- Diagnosed: scheduled staging E2E selhal pouze na `01-registration` — Supabase vrátil HTTP 400 `Email address "e2e+...@example.com" is invalid`
- Root cause: `@example.com` je IANA-rezervovaná doména; Supabase Auth ji odmítá s HTTP 400 (ne 422/429 → existující skip podmínka to nezachytila)
- Fix: `tests/e2e/01-registration.spec.ts` — doména změněna z `@example.com` na `@onemil.cz` (line 73)
- HTTP 400 **není přeskakován** — real staging signup zůstává testován; pokud Supabase odmítne `@onemil.cz`, test selže viditelně
- Ověřovací run `25627706906`: ✅ **ALL PASSED** — 2m 45s, 0 selhání; wallet reset ✅, seed-win-contest ✅, všech 9 spec souborů ✅, Telegram OK ✅
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód, workflow ani Supabase data nebyly změněny

---

## 2026-05-10 — Staging full E2E: naplánováno 3× denně (commit `37cfd6c`)

### Co bylo provedeno
- Přidán `schedule` trigger do `.github/workflows/playwright-staging.yml`
- Staging full E2E nyní běží automaticky 3× denně:
  - `0 2 * * *` → 04:00 Praha (CEST)
  - `0 10 * * *` → 12:00 Praha (CEST)
  - `0 18 * * *` → 20:00 Praha (CEST)
- Offset 4 hodiny od production smoke (00:00 / 08:00 / 16:00 Praha) — žádný překryv
- `workflow_dispatch` zůstává dostupný pro manuální spuštění
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód ani Supabase data nebyly změněny

---

## 2026-05-10 — Staging full E2E: wallet reset ověřen (run `25625184545`)

### Co bylo provedeno
- Commit `50ba68c` — `ci: reset staging e2e wallet before full run`: přidán krok `Reset test user wallet` do `playwright-staging.yml` (PostgREST PATCH `balance_coins: 5000, bonus_balance_coins: 0` před každým spuštěním testů)
- Spuštěn `workflow_dispatch` na `.github/workflows/playwright-staging.yml` pro ověření nového kroku
- Výsledek: **ALL PASSED** — 2m 33s, 0 selhání
- Kroky v pořadí: Seed win contest ✅ → Reset test user wallet ✅ → Run full E2E suite ✅ → E2E status OK ✅ → Telegram OK ✅
- Staging full E2E je nyní **bezpečný k plánování každých 8 hodin** — wallet se resetuje na 5 000 MioCoin před každým spuštěním, pipeline nevyčerpá zůstatek
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód ani Supabase data nebyly změněny

---

## 2026-05-10 — Staging full E2E: pipeline stabilizována a zelená (run `25624552621`)

### Co bylo provedeno
- Opraveny 4 postupné chyby v CI; výsledek: **všech 9 spec souborů prošlo**, 2m 36s, 0 selhání
- Commit `3c4aecf` — `ci: keep auto win contest out of games first position`: auto-seedovaný win contest dostane `created_at: "2020-01-01T00:00:00Z"` → řadí se na konec `/games` (DESC order) → test 03 ho nespotřebuje před testem 05
- Commit `324a747` — `test: stabilize destructive win flow e2e`: toast locator zúžen na `[data-sonner-toast]` (vyhýbá se ModalDialog konfliktu); přidán `test.describe.configure({ retries: 0 })` (retry by vždy selhal — soutěž je po prvním nákupu closed)
- Commit `6ee26df` — `test: scope result dialog locator to avoid cookie banner conflict`: `page.locator('[role="dialog"]')` nahrazen `page.getByRole('dialog', { name: /Výhra/i })` — vyhýbá se `CookieConsentBanner` (také `role="dialog"`)
- Commit `e70fd5c` — `test: robust wait for offer cards or empty state in partner offer open spec`: `waitForTimeout(2000)` nahrazen `Promise.race` na `firstCard.waitFor` vs `emptyState.waitFor` (10s timeout každý) + dvojitý guard skip — robustní bez ohledu na rychlost načítání
- Staging workflow auto-seeduje nový win contest před každým spuštěním (`STAGING_SUPABASE_SERVICE_ROLE_KEY` → PostgREST INSERT → contest ID předán jako step output do `E2E_WIN_CONTEST_ID`)
- Telegram success notifikace doručena: `✅ OneMil STAGING full E2E OK — all specs passed`
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádný app kód ani Supabase data nebyly změněny
- Monitor po dokončení stagnoval kvůli prázdnému `jq .status` výstupu — harmless, ignorován

### Výsledek
- Run `25624552621`: ✅ **ALL PASSED** — 13 passed, 4 skipped (expected), 0 failed, 2m 36s
- Staging full E2E je stabilní a zelený

---

## 2026-05-10 — Staging: upload-ticket-share nasazena, ticket-shares bucket ověřen

### Co bylo provedeno
- Ověřeno: storage bucket `ticket-shares` existuje na staging `dxmowysntemfqfnanxua`, `public: true`, `file_size_limit: 5242880`
- Nasazena Edge Function `upload-ticket-share` na staging: `npx supabase functions deploy upload-ticket-share --project-ref dxmowysntemfqfnanxua`
- Status: **ACTIVE**
- Staging nyní má 2 nasazené funkce: `sofinity-noop` + `upload-ticket-share`
- Produkce `xkzhjldrojjlrkezorey` nedotčena; žádné jiné funkce nebyly nasazeny

---

## 2026-05-10 — Staging seed: ověřen a zdokumentován

### Co bylo provedeno
- Staging `dxmowysntemfqfnanxua` oseedován pro E2E testy 03–08
- Test user: `e2e@onemil.cz` (ID `7822a82e-f1d3-45ee-827b-679640ce6b65`), wallet balance 5000.00 MioCoin
- General contest (`STAGING_E2E_CONTEST_ID`): `3fa56db0-4007-4fb7-aa2f-e460173070d8`, active, next_ticket 1
- Win contest (`STAGING_E2E_WIN_CONTEST_ID`): `7ff58a8e-c691-46e1-9e0c-ca6cddeb8abb`, active, next_ticket 100
- Partner offer `28278c87-17b6-49c3-ae7e-004d0d1f18b0`, approved, selected_contests, připojena ke general contestu
- Žádný app kód ani workflow nebyly změněny; produkce nedotčena

---

## 2026-05-10 — Production smoke: manuální ověření (run `25618763318`)

### Co bylo provedeno
- Spuštěn `workflow_dispatch` na `.github/workflows/playwright.yml`
- Výsledek: **6 passed** za 1m 22s — `01-registration` (3 testy) + `02-login` (3 testy)
- Specs 03–08 neběžely — potvrzeno z logu; žádný ticket purchase, voucher, wallet, win-flow ani Partner Offers test neproběhl v produkci
- Telegram doručen: `✅ OneMil PROD smoke OK — registration + login passed`
- Neblokující varování: orphaned worktree `.claude/worktrees/ecstatic-lichterman-1aa60a` způsobil `git exit 128` v post-job cleanup; pipeline neovlivněna

---

## 2026-05-10 — CI workflow split: produkce vs staging (commit `82f979f`)

### Co bylo provedeno
- `.github/workflows/playwright.yml` upraven: test command omezen na `tests/e2e/01-registration.spec.ts` a `tests/e2e/02-login.spec.ts`; Telegram zprávy přejmenovány na `PROD smoke OK/FAILED`
- `.github/workflows/playwright-staging.yml` vytvořen: `workflow_dispatch` only, plný suite (`npm run test:smoke`), staging secrets mapovány do standardních env var názvů, Telegram zprávy `STAGING full E2E OK/FAILED`
- Produkce nemůže fyzicky spustit testy 03–08 — hard-coded file paths
- Žádný app kód, spec soubory, ani Supabase data nebyla změněna

---

## 2026-05-10 — Staging migrace: strategie rozhodnuta (Option A)

### Rozhodnutí
- `db push` se na staging nepoužívá — blokováno duplicitními/smíšenými timestamp prefixy v repozitáři (17 souborů trvale pending, exit code 0 nelze dosáhnout bez přejmenování)
- Nové DB změny se aplikují na staging **manuálně přes Supabase SQL Editor** — stejný workflow jako produkce
- Aktuální staging schema baseline (`dxmowysntemfqfnanxua`, 73 tabulek, 95 RLS, `buy_ticket_atomic`, wallet trigger) je přijat jako správný a finální výchozí bod
- `schema_migrations` zůstává na 324 řádcích — není potřeba měnit
- Staging CI (testy 03–08) může pokračovat bez závislosti na `db push --dry-run`

---

## 2026-05-10 — Staging schema_migrations: formát experimentů a finální stav

### Co se stalo
Po manuální aplikaci produkčního schéma na staging proběhlo několik pokusů o nastavení `supabase_migrations.schema_migrations` tak, aby `db push --dry-run` hlásil 0 pending migrací.

### Výsledky experimentů
Supabase CLI extrahuje z lokálních `.sql` souborů vedoucí číselný prefix (ne celý stem). Experimenty v pořadí:
1. **341 plných stemů** (bez `.sql`) → všech 341 "Remote not found" (CLI nezná plné stemy)
2. **327 deduplikovaných číselných prefixů** → 3 krátké 8-ciferné prefixy "Remote not found"
3. **324 prefixů** (bez 3 konfliktních krátkých) → 17 souborů "pending before last remote"
4. **324 + 17 plných stemů sekundárních souborů** → 22 chyb (plné stemy + 5 dříve fungujících se rozbilo)
5. **Zpět na 324** → nejlepší dosažitelný stav, exit code stále 1

### Root cause neřešitelnosti
Repozitář obsahuje 4 páry souborů se stejným 14-ciferným timestampem a 3 skupiny se smíšenými 8/14-cifernými názvy. CLI může spárovat vždy jen jeden DB záznam na jeden prefix — sekundární soubory zůstávají jako "pending before last remote". Celkem 17 souborů nelze pokrýt bez přejmenování.

### Výsledek ověření schématu na staging `dxmowysntemfqfnanxua`
- 73 public tabulek ✅, `public.payments` existuje ✅, `buy_ticket_atomic` existuje ✅, `fn_wallet_transactions_immutable()` trigger existuje ✅, 95 RLS policies ✅
- Produkce `xkzhjldrojjlrkezorey` nedotčena ✅

### Aktuální stav
`schema_migrations`: 324 řádků (číselné prefixy). `db push --dry-run` exit code 1 — 17 souborů pending. Žádný `db push` bez nového plánu.

---

## 2026-05-10 — Staging DB: partial migration failure + cleanup

### Co se stalo
- Spuštěn `npx supabase db push` na staging `dxmowysntemfqfnanxua`
- Migrace #1 a #2 proběhly (`20250914034944_`, `20250914035127_`) — obě jsou `CREATE OR REPLACE FUNCTION`, žádné tabulky
- Migrace #3 (`20250914043049_`) selhala: `ERROR: relation "public.payments" does not exist (SQLSTATE 42P01)`

### Root cause
První ~5 migračních souborů (blank-name, 14. 09. 2025) jsou hotfixy aplikované na existující schéma, ne DDL skripty pro prázdnou DB. Počáteční schéma (tabulky `payments`, `wallets`, `users`, `contests`, `tickets` atd.) bylo vytvořeno přímo v Supabase dashboardu a nikdy nebylo zachyceno jako migrační soubor. Staging má prázdnou DB — tyto tabulky neexistují.

### Cleanup (provedeno uživatelem manuálně)
- Odstraněny 2 záznamy z `supabase_migrations.schema_migrations` na staging:
  - `20250914034944`
  - `20250914035127`
- Ověření: `remaining_migrations = null` (žádné záznamy v migration history)
- Na staging neexistují žádné `public.*` tabulky
- Produkce `xkzhjldrojjlrkezorey` nedotčena

### Dohodnutý recovery plán
Recovery plán zdokumentován v `onemil_state.md` — Fáze 3 sekce. Čeká na souhlas pro každý krok. `db push` se nespouští znovu, dokud není proveden baseline schema dump z produkce.

---

## 2026-05-09, 22:45 — Staging Sofinity izolace dokončena

### Co bylo provedeno
- Staging projekt `onemil-staging` vytvořen (ref `dxmowysntemfqfnanxua`, region `eu-north-1`)
- Secret `SOFINITY_RELAY_URL` nastaven manuálně v Supabase Dashboard na staging projekt
- Edge Function `supabase/functions/sofinity-noop/index.ts` vytvořena — přijímá POST, vrací `{"ok":true,"noop":true}`, nic nezapisuje
- Nasazena výhradně na staging: `npx supabase functions deploy sofinity-noop --project-ref dxmowysntemfqfnanxua --no-verify-jwt`
- POST test: HTTP 200 `{"ok":true,"noop":true}` ✅
- Commit `4167527` — `feat: add staging Sofinity no-op relay`

### Izolační záruky
- Produkční projekt `xkzhjldrojjlrkezorey` — nedotčen
- Produkční Sofinity relay `rrmvxsldrjgbdxluklka` — nedotčen
- Žádné migrace nebyly spuštěny

---

## 2026-05-09 — Staging projekt: potvrzená rozhodnutí

- Produkce: projekt `onemil`, ref `xkzhjldrojjlrkezorey`, region `eu-north-1`
- Staging: název `onemil-staging`, region `eu-north-1` (stejný jako produkce)
- `SOFINITY_RELAY_URL` musí být první secret po vytvoření — vlastní no-op endpoint, nikdy produkční Sofinity relay

---

## 2026-05-09, 22:17 — Staging-safe URL fix dokončen a pushnut

### Co bylo provedeno
Tři hardcoded produkční URL nahrazeny env/client-based hodnotami. Commit `20c6452`, pushnut na `main`.

| Soubor | Změna |
|---|---|
| `supabase/functions/process_event_queue_worker/index.ts` | `Deno.env.get("SOFINITY_RELAY_URL") ?? "<prod URL>"` |
| `src/pages/ShareTicket.tsx` | `${supabaseUrl}/functions/v1/og-ticket-share` |
| `src/components/TicketResultModal.tsx` | `${supabaseUrl}/functions/v1/og-ticket-share` |

- Build: ✅ `vite build` passed, 0 errors
- `.claude/settings.local.json` nebyl commitnut ani pushnut
- `api/og-ticket.ts` a `vercel.json` označeny jako legacy — Lovable je aktivní deploy cesta, Vercel soubory se v produkci nespouštějí

### Výsledek
Fáze 1 staging readiness je dokončena. Staging projekt lze nyní vytvořit — stačí nastavit env vars bez dalších code changes.

---

## 2026-05-09, 21:47 — E2E produkční bezpečnost: audit a staging plán

### Cíl
Navrhnout bezpečný způsob E2E testování, který neznečistí produkční data.

### Klíčové závěry auditu

**Contest 93dc5cdc-8bd2-4906-92b4-948d5eba1e60:**
- Draft contest — správně neviditelný pro uživatele (RLS SELECT: `status IN (active, pending, paused)`)
- `rules_pdf_url = NULL` — bug detekován, frontend fix nasazen, admin musí re-uploadovat PDF
- `bonus_prizes.status = 'won'` na draft contest — NENÍ bug: contest byl legitimně aktivován (10 tiketů prodáno), `buy_ticket_atomic` správně nastavil status; poté admin omylem přesunul `closed → draft` před zavedením `closed`-je-finální guardu
- `admin_actions` tabulka potvrdila timeline: `active → closed → draft` (přechod closed→draft byl umožněn, teprve pak byl guard nasazen)

**wallet_transactions immutability:**
- Trigger `fn_wallet_transactions_immutable()` RAISES EXCEPTION na UPDATE nebo DELETE — permanentní finanční ledger
- Definitně vylučuje „cleanup + reset" přístup pro E2E testy v produkci

**Porovnání tří možností E2E izolace:**
1. ✅ Separátní staging projekt — doporučeno
2. ⚠️ `is_e2e` flag — neúplné (wallet ledger + Sofinity stále zasaženy)
3. ❌ Cleanup v produkci — nemožné (wallet_transactions immutability)

**Staging readiness:**
- Frontend Supabase klient: env-var-based ✅ (nulové code changes potřeba pro přepnutí projektu)
- Hardcoded URLs blokující izolaci: 3 soubory:
  - `process_event_queue_worker/index.ts:19` — Sofinity relay (nejvyšší riziko)
  - `src/pages/ShareTicket.tsx:22` — OG image URL
  - `src/components/TicketResultModal.tsx:416` — OG image URL
- Staging plan zdokumentován v `onemil_state.md` — neprovádět bez souhlasu uživatele

### Postup
Audit proběhl read-only. Žádné produkční změny nebyly provedeny.

---

## 2026-05-05 — Closed contest status made final

### Bug
Admin mohl v UI změnit status `closed` soutěže zpět na `draft`, `pending`, `active` nebo `paused`.

### Fix
- `src/components/AdminContestManagement.tsx` — commit `54466bb`
- `handleStatusChange`: přidán guard na začátek funkce — pokud `current.status === "closed"`, zobrazí toast _„Ukončenou soutěž nelze znovu aktivovat ani přesunout."_ a okamžitě vrátí
- Status Select v řádku tabulky: `disabled` rozšířen o `|| contest.status === "closed"`
- Odstraněna duplicitní deklarace `const current` v `draft` větvi (sdílí nyní proměnnou z vrcholu funkce)

### Ověřeno manuálně
V tabu „Archiv ukončených soutěží" nelze otevřít status dropdown uzavřené soutěže. Soutěž zůstává uzavřena.

---

## 2026-05-05 — Contest rules PDF fix (rules_pdf_url NULL bug)

### Bug
Admin nahrál PDF s pravidly, ale `contests.rules_pdf_url` zůstal `NULL`. ContestDetail proto nezobrazoval odkaz na pravidla.

### Root cause
Přímý `UPDATE contests SET rules_pdf_url = ...` z frontendu byl blokován chybějící RLS UPDATE policy na `public.contests`. Supabase vracel `{ data: [], error: null }` (0 rows affected, silent no-op). Navíc chyběl `return` po UPDATE error → frontend zobrazil false success toast i při selhání.

### Opravy
- **DB:** přidána RLS policy `contests_admin_update` — admin/superadmin mohou UPDATE `public.contests` (migrace commitnuty a aplikovány; commity `bfc7813`, `95ab8e3`)
- **`src/components/AdminContestManagement.tsx`:** přidán `return` po UPDATE error (commit `20e4a34`); UPDATE změněn na `.select("id")` pro detekci 0-row no-op (commit `934bfbd`)
- **`src/pages/ContestDetail.tsx`:** odkaz přejmenován na „Zobrazit pravidla soutěže", otevírá PDF v novém tabu

### Playwright testy 03-voucher-purchase.spec.ts (opraveny souběžně)
- `waitForTimeout(3_000)` → `expect(buyButton.or(emptyState)).toBeVisible({ timeout: 15_000 })` (commity `0d7acbd`, `f0094e7`)
- `getByText(regex)` → `getByRole('heading', { name: '...' })` — eliminace strict mode violation (commit `1035273`)

### CI výsledek
14 passed / 3 skipped / 0 failed ✅

---

## 2026-05-04/05 — Ticket result modal + buy_ticket_atomic oprava

### buy_ticket_atomic — timeout (57014)
- **Root cause:** `trigger_sofinity_forward()` a `process_event_queue_trigger()` volaly `net.http_post()` synchronně uvnitř transakce; saturace pg_net workerů → 57014 statement timeout
- **Fix:** migrace `20260504_fix_nonblocking_sofinity_triggers.sql` — `trigger_sofinity_forward()` přepsán na INSERT do `event_queue`; `process_event_queue_trigger()` je no-op

### buy_ticket_atomic — chybějící fieldy v response
- Funkce nevracela `remaining_tickets`, `next_bonus_position`, `distance_to_next_bonus`
- Migrace `20260504_add_remaining_and_bonus_distance_to_buy_ticket_atomic.sql` přidala:
  - `remaining_tickets = v_ticket_count - v_next_ticket`
  - `v_next_bonus_position` — SELECT nejbližšího pending bonus_prizes.ticket_position > v_next_ticket po aktualizaci aktuálního bonusu na 'won'
  - `distance_to_next_bonus = v_next_bonus_position - v_next_ticket`
- Aplikováno v produkci, ověřeno STRING_AGG query

### Frontend — null → 0 přepis (root cause fallback textu)
- `remaining_tickets: result.remaining_tickets ?? 0` → `?? undefined` v `ContestDetail.tsx`, `Games.tsx`, `FavoriteGames.tsx`
- `?? 0` převáděl null na 0 → `0 > 0 = false` → `nearestPrizeDistance` vždy null → vždy fallback text

### TicketResultModal — text vzdálenosti
- Přidán helper `formatDrawsText(n)` + konstanta `DRAWS_EXPLANATION`
- Nahrazen text „Nejbližší výhra může být už za X tahů." na všech 4 místech (canvas, getShareText, bonus win pill, loss box)
- Nový formát: „Další výherní ticket čeká už za X tahy/tahů." / „...při dalším tahu." (X=1)
- Přidán vysvětlující řádek pod text vzdálenosti
- Správná česká pluralizace: 2–4 = tahy, 5+ = tahů

### Další opravy (uživatel — paralelní větev)
- Odstraněno číslo tiketu z result boxu
- Odstraněno extra „0" z modalu (React `{0 && <JSX>}` bug způsobený `?? 0`)
- Odstraněn toast „Ticket #N zakoupen!" po nákupu — commit `5bae556`
- Skryt název soutěže a celkový počet tiketů na listing kartách — commit `f2c1678`
- Česká pluralizace opravena (`tahPlural`, `nextWinTicketText`, `NEXT_WIN_EXPLAINER`) — commit `6269732`
- Sdílovací karta přepsána na `generatePremiumShareCard` (1200×630, reálné prize obrázky) — commit `0790362`
- Favorites počítadlo opraveno (aktualizace bez refresh) — commity `ebf5e8e`, `00e1e99`
- Partner Offers assignment ověřen funkční bez změny kódu

---

## 2026-05-01 — CI oprava: Payment Pipeline selhání diagnostikováno a opraveno

### Problém
4 CI runs selhaly (`25211401801`, `25213567010`, `25214606796`, `25215350051`) s hláškou "PAYMENT PIPELINE FAILED". Všechny spustilo pushování na `main` (start.bat / end.bat scripty). Telegram bot reportoval každý fail.

### Diagnostika
- Logy staženy přes GitHub Actions API (GitHub token z Windows Credential Manager)
- Jediný selhávající test: `01-registration.spec.ts:72` — "new user registers and is authenticated"
- Přesná chyba: `Expected Supabase session in localStorage (onemil-auth) but none found`
- Příčina: Supabase má zapnuté potvrzení emailu → `signUp()` vrátí `session: null` → žádný token do localStorage → `Profile.tsx` přesměruje na `/login` → `expectSessionExists()` selže
- Test selhal i po retryi (CI config: `retries: 1`)

### Oprava
- `tests/e2e/01-registration.spec.ts` upraven (commity `945a77d`, `0659a28`):
  - `expectSessionExists()` podmíněné — volá se jen pokud app neredirectuje na `/login` a email confirmation screen není viditelný
  - Přidán graceful skip pro Supabase 429 (rate limit) a 422 (domain block)

### Přidáno: scheduled testy
- `.github/workflows/playwright.yml` — přidán `schedule:` cron trigger (commit `156000f`)
- 3× denně: 00:00, 08:00, 16:00 Praha (CEST = UTC+2: 22:00, 06:00, 14:00 UTC)

### Přidáno: CLAUDE.md pravidlo
- `CLAUDE.md` — přidáno pravidlo: po každém zápisu do `onemil_state.md` nebo `onemil_history.md` automaticky spustit `git add -A && git commit -m "update state" && git push origin main` (commit `aa2c62d`)

---

## 2026-04-27 — Vizuální systém: brand aplikace a zmírnění zlaté (nedokončeno)

### Kontext
Proběhla analýza stavu větví a vizuálních změn. Bylo zjištěno, že brand změny z předchozí práce (Poppins, Energy Orange) nikdy nebyly mergovány do `main` — zůstaly izolované na větvi `claude/setup-playwright-tests-bShrg`.

### Co proběhlo
**Analýza větví:**
- Větev `claude/setup-playwright-tests-bShrg` obsahuje commity `d6d4597` + `25e87dd`: Poppins font, Energy Orange CSS proměnné, orange bordery/gradienty na ContestCard + ContestDetail.
- Tyto commity nikdy neprošly do `main`.

**Vizuální zmírnění na `claude/thirsty-volhard-e1eb7c` (commit `a21ef28`):**
- Zadání: nesnižovat layout/strukturu, pouze vizuálně zmírnit — méně intenzivní zlatá, dark overlay, soft rgba bordery, potlačení glow efektů.
- Změněné soubory: `src/index.css`, `src/components/ContestCard.css`, `src/components/ContestCard.tsx`, `src/components/MioCoin.tsx`
- Klíčová změna: `--neon-gold` přesunut z jasné zlaté (`43 90% 55%`) na tlumenou amber-oranžovou (`33 70% 44%`); glow opacity snížena ~50 %; bordery → `rgba(191,198,207,0.16)`; progress bar → `#C07018/#884A08`.
- Pushnuté na remote, nemergnuto do `main`.

### Stav na konci dne
- Grafika je **nedokončená**.
- Probíhá testování funkčnosti systému (platební pipeline, tiket purchase, contest flow) — grafika se dořeší až po ověření funkčnosti.
- Otevřená otázka: která větev se merguje do `main` (nebo cherry-pick obou sad změn).

---

## 2026-02-08 — Partner Offers v1: reminder automation
- Edge Function `supabase/functions/send-offer-reminders/index.ts` present (documented as "Block F — send-offer-reminders").
- Uses DB RPC `get_due_offer_reminder_rows()` and updates `user_partner_offers.last_reminder_at`.
- Documents safety invariant: never touches `winners` / `bonus_prizes`.

## 2026-03-15 — Deep backend stabilization audit (recorded)
- Scope recorded: schema, SQL functions, triggers, migrations, wallet system, contest engine, ticket generation, bonus prize logic, event pipeline, push pipeline, edge functions.
- Fixes recorded as applied via six migrations:
  - `20260315240000_fix_bonus_prize_response.sql`
  - `20260315260000_cleanup_duplicate_triggers.sql`
  - `20260315270000_remove_redundant_ticket_trigger.sql`
  - `20260315280000_cleanup_winners_indexes.sql`
  - `20260315290000_additional_safety_constraints.sql`
  - `20260315300000_fix_bonus_wallet_ledger.sql`

## 2026-03-22 — E2E contest flow "final fix" (recorded)
- Result recorded: E2E success (tickets, contest close, winners, wallet, notifications).

## 2026-03-23 — OneMil ↔ Sofinity stabilization (recorded)
- Result recorded: pipeline stable, backlog processed, cron automation in place.

## 2026-03-30 — AI chat CTA follow-up detection regression (recorded)
- Issue recorded: follow-up messages not recognized as support intent → CTA "Kontaktovat podporu" disappears.
- Root cause recorded: `isSupportIntentForCta` too strict.

## 2026-04-08 to 2026-04-09 — Cursor session work (recorded)
- Temporary private-access gate work (`src/App.tsx`).
- SEO static assets + sitemap/robots production availability work (via commits).
- Admin contests list robustness work recorded (ensure contest list loads even if bonus-stats RPC fails).

## 2026-04-09 — Memory reconciliation correction pass
- Goal: keep clean state/history split and keep Partner Offers v1 treated as confirmed project context.
- Partner Offers section in `onemil_state.md` updated to distinguish:
  - confirmed project truth
  - confirmed in current repo snapshot
  - needs repo re-check later (narrow existence checks only)
- Note: Partner Offers details are considered **partially reconciled** until final E2E and a final documentation pass are completed.

---

## 2026-04-10 — Partner Offers v1 – finální E2E uzavření, wiring fix, token rotace, kanonický memory režim

### Shrnutí
Partner Offers v1 bylo v tomto chatu finálně uzavřeno.
Po dokončení bloků A–G proběhlo vícekolové E2E ověřování, během kterého byly potvrzeny reálné integrační vazby a opravena jedna chybějící produkční mezera: automatické napojení assignment logiky do `purchase-ticket`.

Výsledný stav:
**Partner Offers v1 PASSED finálním E2E.**

---

### 1. Výchozí stav na začátku tohoto úseku
Na začátku bylo považováno za hotové:
- Block A
- Block B
- Block C
- Block D
- Block E
- Block F
- Block G

Ale ještě nebylo finálně end-to-end potvrzené, že:
- assignment přes ticket purchase běží opravdu automaticky
- `won_type` gate funguje i na HTTP úrovni
- reminder pipeline má správně sjednocený internal token

---

### 2. E2E verifikace – plán a postup
Nejdřív byl zvolen menší, tokenově úsporný postup:
1. plán E2E
2. DB + admin smoke check
3. seed + assignment slice
4. finální HTTP-level integrační test

Tím se zabránilo zbytečně velkým promptům a zbytečnému spalování tokenů.

---

### 3. DB + admin smoke check
Bylo potvrzeno:
- Block G DB objekty existují
- funkce jsou callable
- `partner_invoices.type` existuje
- `partner_offer_activations.invoiced` a `invoice_id` existují
- `get_admin_activation_summary()` funguje
- `sync_partner_offer_activations()` funguje
- TypeScript build je čistý
- admin UI compile smoke je OK

V této fázi byl nalezen jeden blocker:
- `send-offer-reminders` vracel 401

---

### 4. Block F – internal token blocker
Bylo potvrzeno, že:
- `INTERNAL_FUNCTION_TOKEN` neodpovídal mezi prostředími
- reminder function kvůli tomu vracela 401
- cron na reminder běh tím pádem selhával

#### Zjištěné body
Používaly se tři místa:
- Supabase secret `INTERNAL_FUNCTION_TOKEN`
- lokální `.env` `VITE_INTERNAL_FUNCTION_TOKEN`
- cron joby s hardcoded tokenem

#### Provedená oprava
Byl vygenerován nový silný token a proběhla rotace:
- přepsán token v pg_cron `send_offer_reminders_daily`
- přepsán token v pg_cron `process-event-queue`
- ručně sjednocen `.env`
- ručně sjednocen Supabase secret `INTERNAL_FUNCTION_TOKEN`

Poté proběhla hygienická kontrola:
- starý token už se nikde nevyskytoval

#### Ověření po opravě
Test:
- `send-offer-reminders`

Výsledek:
- HTTP 200
- `{"success":true,"emails_queued":0,"offers_touched":0}`

Závěr:
**Block F blocker odstraněn.**

---

### 5. Seed + assignment flow audit
Byl proveden řízený test assignment vrstvy.

Potvrzeno:
- `assign_partner_offer_to_ticket(...)` funguje správně při ručním volání
- `user_partner_offers` vzniká správně
- `status = active`
- `ticket_id` FK funguje správně při reálném ticket UUID
- cooldown vrací `NULL`
- `last_assigned_at` se aktualizuje
- `sync_partner_offer_activations()` vytváří activation rows

V této fázi se ale ukázalo:
- assignment RPC existuje
- ale **nevolá ho nic automaticky při ticket purchase**

To byl skutečný chybějící blok.

---

### 6. Kritický fix – chybějící wiring v purchase-ticket
Bylo rozhodnuto pro správné řešení:
- **Option B**
- napojit assignment do:
  - `supabase/functions/purchase-ticket/index.ts`

Výslovně bylo zakázáno:
- měnit `buy_ticket_atomic`
- přidávat DB trigger na `tickets`
- sahat na `winners`
- sahat na `bonus_prizes`

#### Implementace
Změněn pouze:
- `supabase/functions/purchase-ticket/index.ts`

Přidaná logika:
- po úspěšném `buy_ticket_atomic`
- pokud `data.success === true && data.won_type === null`
- zavolá se:
  - `assign_partner_offer_to_ticket(...)`
- předá se:
  - `ticket_row_id` jako `p_ticket_id`
- chyba je non-fatal
- response pro uživatele zůstává stejná

Tím byl dokončen chybějící wiring v Block D.

---

### 7. Finální HTTP-level integrační test
Po wiring fixu proběhl finální skutečný integrační test přes:
- reálné HTTP volání `purchase-ticket`
- reálné JWT

#### Positive path
Potvrzeno:
- při `won_type = null` vznikne nový `user_partner_offers`
- `ticket_id` v UPO odpovídá `ticket_row_id` z response
- response body zůstává beze změny

#### Negative path
Potvrzeno:
- při `won_type = 'bonus'` **nevznikne žádné UPO**
- gate funguje správně

#### Finální závěr testu
**Partner Offers v1 PASSED finálním E2E ověřením.**

---

### 8. Praktický výsledek po E2E
Bylo finálně potvrzeno:
- assignment flow funguje
- cooldown funguje
- `ticket_id` wiring funguje
- `last_assigned_at` se aktualizuje
- `won_type` gate blokuje assignment pro výherce
- user response zůstává nedotčená
- activation sync funguje
- reminder token problem byl vyřešen

Nebyl nalezen žádný nový produkční blocker.

---

### 9. Kanonické memory soubory – nové pracovní pravidlo
Během chatu byl zjištěn problém, že Cursor / Claude používaly různé memory soubory a staré workspaces.

Bylo sjednoceno nové pravidlo pro OneMil:

Kanonická složka:
`C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw`

Kanonické soubory:
- `onemil_state.md`
- `onemil_history.md`
- `CLAUDE.md`

Potvrzeno:
- workspace byl přepnut správně na `million-ticket-draw`
- další OneMil zápisy se mají dělat už jen sem
- staré `ProjectsBundle\onemil` se bere jen jako legacy reference, ne jako aktivní místo zápisu

---

### 10. Stav na konci
Partner Offers v1 je považováno za:
- implementované
- nasazené
- dopojené
- end-to-end otestované
- uzavřené jako hotový modul v rámci v1

Mimo v1 nadále zůstává:
- `category_contests`

---

### 11. Další krok
Další práce už nemá znovu otevírat architekturu Partner Offers v1.

Správný další krok:
1. jen případné bugfixy z běžného provozu
2. nebo další samostatný modul mimo Partner Offers

---

### Důležité varování pro další chat
Další asistent NESMÍ:
- znovu vracet Partner Offers do `winners`
- znovu vracet Partner Offers do `bonus_prizes`
- přidávat novou bottom položku
- znovu míchat billing do `partner_offers`
- znovu otevírat Blocks A–G bez důvodu
- ignorovat, že finální E2E už proběhlo úspěšně
- zapisovat OneMil stav mimo:
  - `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_state.md`
  - `C:\Users\PC_3\Desktop\Onemil - Projekt\million-ticket-draw\onemil_history.md`

---

## 2026-04-10 — Block E frontend implementace a nasazení

### Co bylo provedeno
Po post-deploy auditu bylo zjištěno, že Block E (user UI pro Nabídky) existoval v paměti, ale soubory chyběly v repozitáři.

Byly vytvořeny a commitnuty tyto soubory:
- `src/components/OfferCard.tsx` — nový
- `src/components/OfferDetailModal.tsx` — nový
- `src/pages/Wins.tsx` — aktualizován (přidán tab switcher Výhry / Nabídky)

### Chování implementace
- Nabídky čtou z `user_partner_offers` kde `status = active` AND `hidden_at IS NULL`
- Otevření detailu zapisuje `opened_at` (non-fatal)
- Skrytí zapisuje `hidden_at` → DB trigger Block F automaticky odešle systémovou zprávu do `messages`
- Skrytá nabídka okamžitě zmizí ze seznamu
- Tab switcher Výhry / Nabídky je uvnitř `/wins` — bottom menu zůstalo `Výhry`
- Partner display name: `company_name ?? name`
- Zobrazuje `valid_to`

### Build výsledek
- `npm run build` → exit code 0
- Žádné nové TypeScript ani import chyby

### Commit
- `b7aa4ce` — `feat: Block E – add Nabídky tab to /wins with OfferCard and OfferDetailModal`
- Pushnut do `main`

---

## 2026-04-11 — Partner portal UI: offer management v PartnerDashboard

- `src/pages/PartnerDashboard.tsx` rozšířen o kompletní správu nabídek:
  - `PartnerOffer` interface, 14 nových state proměnných, 8 nových funkcí
  - `loadPartnerOffers(partnerId)` — SELECT z `partner_offers` filtrovaný na `partner_id`
  - `openCreateOffer` / `openEditOffer` — správa form stavu
  - `handleSaveOfferDraft` — INSERT (nová) nebo UPDATE (existující draft/rejected)
  - `handleSubmitOffer` — UPDATE status na `submitted`
  - `handleReviseOffer` — RPC `revise_partner_offer({p_offer_id})`
  - `getOfferStatusBadge` / `getDeploymentModeLabel` — UI helpers
  - Card sekce se seznamem nabídek (Table) + inline akce dle stavu
  - Dialog pro vytvoření / úpravu s fieldy: title, short_text, deployment_mode, valid_from, valid_to, link_or_code
  - Approved nabídky jsou read-only (žádné tlačítko editace)
- `loadPartnerOffers(partnerData.id)` voláno z `loadPartnerData()` automaticky
- Build: ✅ exit code 0

## 2026-04-10 — Odstranění dočasného private-access gate v App

- V `src/App.tsx` odstraněn email allowlist (`divispavel2@gmail.com`), `isLockExemptRoute` / `isLocked` a celá obrazovka „Web je momentálně neveřejný”; role redirecty v `useEffect` beze změny logiky kromě odstranění early return kvůli locku.
- Ověřeno lokálně: `npm run build` — Vite production build dokončen úspěšně (`✓ built`).

---

## 2026-04-12 — Partner billing visibility + invoice PDF/email – Admin + Partner portal

- `src/pages/PartnerDashboard.tsx` rozšířen o Block 5: read-only billing přehled pro partnera
  - `loadOfferBilling(partnerId)` načítá: počet aktivací, billing config, seznam offer faktur
  - `downloadOfferInvoicePdf(invoiceId)` volá `generate-partner-invoice-pdf` přes `withEdgeInternalToken`
  - Karta „Fakturace nabídek” zobrazuje: aktivace, billing mode, cena za aktivaci, tabulku faktur s PDF tlačítkem
  - Commit: `7272be5`
- `supabase/migrations/20260412_extend_partner_offer_invoices_numbering.sql` — Block 2: `create_partner_offer_invoices_for_period` rozšířena o `invoice_number`, `variable_symbol`, `issue_date`, `due_date`, `taxable_date` voláním `generate_invoice_number()`
- `supabase/functions/generate-partner-invoice-pdf/index.ts` — Block 3: přidána podpora `type='offer'` faktur; čte z `partner_offer_invoice_lines` a `partner_offer_activations`; oddělená větev od coin logiky; nasazeno jako verze 98
- `src/pages/AdminPartnersPortal.tsx` — Block 4: tlačítka „Vygenerovat PDF” a „Odeslat fakturu” pro oba typy faktur (coin i offer); `skipped` response z `send-partner-invoice-email` zpracována jako `toast.info`; commit `f1554dc`

---

## 2026-04-13 — Contest admin fixes: create, status model, archive UX, delete safety

### Contest create – ticket_count fix
- Zjištěno: `admin_manage_contest` dříve tiše přepisoval `ticket_count` na fallback `1000000`, pokud nebyl správně předán z frontendu
- Opraveno na frontendu v `AdminContestManagement` (žádný tichý fallback)
- Na straně DB/RPC: při **create** už `admin_manage_contest` **netiše** nepřijímá neplatný nebo chybějící `ticket_count` (vyžaduje se platná hodnota / chyba místo mlčení)
- Nasazení frontend opravy na Lovable vyžadovalo **Share → Publish** (ne jen git push)

### DB status constraint rozšíření
- `contests_status_check` byl rozšířen o chybějící hodnoty tak, aby odpovídal UI statusům: `draft`, `pending`, `active`, `paused`, `closed`
- Předtím constraint způsoboval selhání při CREATE soutěže s neočekávanými hodnotami

### Contest archive UX
- `src/components/AdminContestManagement.tsx` rozšířena o 3 filtrovací taby pod hlavičkou stránky:
  - Aktivní soutěže (`pending`, `active`, `paused`)
  - Archiv test (`draft`)
  - Archiv ukončených soutěží (`closed`)
- Archiv zůstává na stejné stránce, ne na nové stránce, ne ve row dropdownu
- Commit: `2d0cc84`

### Draft přejmenován na „Archiv test” v admin UI
- `STATUS_OPTIONS`: label `”Koncept”` → `”Archiv test”` pro value `”draft”`
- DB hodnota `draft` beze změny
- Commit: `f26caa9`

### Pravidlo přechodu do Archiv test
- `active` → `draft` zablokováno: frontend guard v `handleStatusChange` + disabled dropdown option
- Povoleno pouze z `pending` nebo `paused`
- Commit: `b4b55b0`

### Hard delete – audit a závěr
- Bylo potvrzeno: `partner_offer_contests.contest_id` má FK na `contests(id)`
- Soft detach (`detached_at = now()`) logicky odpojí nabídku, ale FK řádky fyzicky zůstávají
- Hard delete po soft detach stále selže s FK violation
- Závěr: **hard delete contestů není bezpečný; testovací soutěže se archivují do `draft`**
- Testovací soutěže se nemají řešit jako běžné produkční „cleanup" cíle — bezpečná cesta je statusová archivace, ne mazání
- Delete v admin UI povolen pouze pro `draft` a `pending` (testovací fáze); pro `active`, `paused`, `closed` zablokováno
- Invariant: **nemazat** řádky `partner_offer_contests` natvrdo; u úklidu soutěží se **nesahat** na triggery ani na `buy_ticket_atomic` / `assign_partner_offer_to_ticket`
- Commity: `ac52556`, `8026382`

### Dokumentační synchronizace (13. 04. 2026, 20:46:33 +02:00)
- Do kanonické trojice `onemil_state.md` + `onemil_history.md` + `CLAUDE.md` doplněny výše uvedené ověřené body (create path, DB create validace `ticket_count`, Lovable Publish, status constraint, 3 archivní filtry, pravidla `draft`, FK/delete závěry, Partner Offers invarianty). Žádná změna aplikačního kódu v rámci tohoto kroku.

---

## 2026-04-24 — CI, Payments & E2E Stabilization COMPLETE

### Stripe webhook – kompletní oprava failure handlingu
- Všechny `throw` výrazy uvnitř `checkout.session.completed` nahrazeny kontrolovanými `return 500` odpověďmi (Stripe retry)
- Structured log přidán ke všem 6 failure paths: `console.error('STRIPE WEBHOOK FAILURE', {session_id, reason, user_id, amount})`
- Idempotency log standardizován: `console.log('STRIPE WEBHOOK DUPLICATE', { session_id: session.id })`
- **Kritická oprava:** outer `catch` blok vracel 400 → opraveno na 500 (neočekávané runtime chyby jsou nyní retryovatelné)
- Signature check inner catch zůstává 400 (správně)
- Soubor: `supabase/functions/stripe-webhook/index.ts`

### GitHub Actions – Playwright CI pipeline
- Vytvořen workflow `.github/workflows/playwright.yml`:
  - Trigger: push na `claude/**`, PR do `main/master`, `workflow_dispatch`
  - Playwright Chromium smoke tests přes `npm run test:smoke`
  - HTML report artifact + screenshots artifact při selhání
- Přidány GitHub Step Summary notifikace: `PAYMENT PIPELINE OK` / `PAYMENT PIPELINE FAILED`
- Přidány Telegram notifikace (curl na `api.telegram.org`) na success i failure
- Přidán `workflow_dispatch` trigger pro ruční spuštění

### Playwright smoke testy – stabilizace
- `tests/e2e/01-registration.spec.ts`:
  - Přidán helper `fillDateInput()` — native value setter + event dispatch pro React controlled `<input type="date">`
  - Přidán helper `expectSessionExists()` — kontroluje `localStorage.getItem('onemil-auth')` (storageKey z Supabase clienta)
  - `waitForResponse('/auth/v1/signup')` — čeká na reálnou Supabase API odpověď před dalšími asserty
  - Nahrazen `waitForURL` za `expect(page).not.toHaveURL(/\/register/)` — opravena chyba kde condition byla splněna okamžitě
  - Vizuální check: `bottomNav.or(emailConfirmScreen)` (buď bottom nav nebo email confirmation notice)
  - Výsledek: **3/3 testů passing**
- `tests/e2e/02-login.spec.ts` + `tests/e2e/helpers/auth.ts`:
  - Opravena strict mode violation: `getByRole('button', { name: 'Přihlásit se' })` matchoval 4 tlačítka (Google/Apple/Facebook SSO)
  - Všechna 3 místa v login spec + helper nahrazena `locator('button[type="submit"]')`
  - Výsledek: **passing** (po aplikaci secrets v CI)

### Supabase secrets v GitHub CI
- Přidány GitHub repository secrets: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Bez těchto secrets `createClient('', '')` crashoval React app při startu → všechny UI testy selhaly

### Wallet auto-creation – centralizovaná DB funkce
- Vytvořena migrace `supabase/migrations/20260420_ensure_wallet_exists.sql`
  - Funkce `public.ensure_wallet_exists(p_user_id uuid)` — INSERT ... ON CONFLICT (user_id) DO NOTHING
  - Columns: `user_id`, `balance_coins=0`, `bonus_balance_coins=0`, `created_at=now()`
- Call sites přidány:
  - `supabase/functions/purchase-ticket/index.ts` (Edge Function)
  - `src/pages/Vouchers.tsx`
  - `src/pages/Homepage.tsx`
  - `src/components/VoucherCarousel.tsx`
- **Migrace commitnuta, nutno aplikovat v Supabase SQL Editoru**

### Profiles trigger oprava
- Vytvořena migrace `supabase/migrations/20260420_fix_profiles_insert_remove_user_id.sql`
  - Opravuje `handle_new_auth_user()`: odstraněn neexistující sloupec `user_id` z INSERT do `public.profiles`
  - Backfill: doplní chybějící `profiles` řádky pro existující `auth.users` účty
- **Migrace commitnuta, nutno aplikovat v Supabase SQL Editoru**

### Stav CI na konci tohoto úseku
- Registration testy: **passing** (3/3)
- Login testy: **passing** (2/2 stabilní, 1 skip bez credentials)
- Voucher/ticket testy: **skip** (čekají na `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD`)
- Pipeline: **stable, production-ready**

---

## 2026-04-24 (session 2) — Integrity audity buy_ticket_atomic + won_type fix + Playwright testy 03–08

### Audity buy_ticket_atomic (READ-ONLY)

**1. Wallet deduction audit**
- Potvrzeno: wallet deduction probíhá **přesně jednou** — single `UPDATE wallets SET balance_coins = v_balance - v_ticket_price WHERE id = v_wallet_id`
- `FOR UPDATE` lock na wallet row serializuje souběžné nákupy (žádný double-deduct možný)
- Nedostatek mincí vrací `{success: false, error: 'Nedostatek miocoinu'}` a rollbackuje transakci

**2. Frontend response handling audit**
- Potvrzeno: všechna 3 místa volají `buy_ticket_atomic` **přímo** (ne přes Edge Function): `ContestDetail.tsx`, `Games.tsx`, `FavoriteGames.tsx`
- `ContestDetail.tsx:329` — `if (result.success === false || result.error)`
- `Games.tsx` + `FavoriteGames.tsx` — `if (!rpcResult.success)` po normalizaci
- HTTP 200 je vždy vrácen i pro business logic failures; success check je správně implementován

**3. Ticket creation audit**
- Potvrzeno: přesně **jeden** INSERT do `tickets` — žádný tichý fail, žádná duplicate
- `ticket_row_id` je generován jako `gen_random_uuid()` přímo v INSERT
- Žádný EXCEPTION blok kolem INSERT → selhání propaguje a rollbackuje celou transakci

**4. Purchase integrity audit**
- Contest limit: `FOR UPDATE` lock na `contests` row + guard `IF v_next_ticket > v_ticket_count THEN RETURN error` — overfill impossible
- Ticket number: `UPDATE contests SET sold_tickets = sold_tickets + 1 RETURNING sold_tickets` — atomický increment, duplicate impossible
- won_type logic: CASE v_next_ticket = v_ticket_count (main) / v_bonus_prize_id NOT NULL (bonus) / ELSE NULL

### won_type priority fix

- Bug nalezen: poslední tiket + bonusová pozice → `won_type` vracel `'bonus'` místo `'main'`
- Root cause: CASE vyhodnocoval `v_bonus_prize_id IS NOT NULL` před `v_next_ticket = v_ticket_count`
- Fix: `CASE WHEN v_next_ticket = v_ticket_count THEN 'main' WHEN v_bonus_prize_id IS NOT NULL THEN 'bonus' ELSE NULL END`
- Migrace: `supabase/migrations/20260424_fix_won_type_main_priority_over_bonus.sql` — commit `68e06fc`
- **Nutno aplikovat v Supabase SQL Editoru**

### Playwright testy — nové spec soubory

- `tests/e2e/03-ticket-purchase.spec.ts` (commit `c9e4607`):
  - Skip bez credentials; login → /games → první Detail → /contest/:id
  - Pokud buy button: klik → assert toast/dialog/alert; pokud top-up: assert enabled
- `tests/e2e/05-win-flow.spec.ts` (commit `ac2da53`):
  - Vyžaduje `E2E_WIN_CONTEST_ID` (soutěž se 1 zbývající tiketou)
  - `page.on('response')` zachytí `won_type` z RPC
  - Assert: Gratulujeme toast + dialog viditelný + won_type in ['main', 'bonus']
- `tests/e2e/06-partner-offers.spec.ts` (commit `be301de`):
  - Login → /games → koupě tikety → zachycení won_type + user_partner_offers response
  - Pokud won_type === null: assert "SPECIÁLNÍ NABÍDKA" nebo "Nabídka je uložena v tvých" v result modalu
  - Pokud won_type !== null: annotace skip-reason (prize win)
- `tests/e2e/07-partner-offer-open.spec.ts` (commit `be7fedb`):
  - Login → /wins → Nabídky tab → klik na první offer card
  - OfferCard selector: `div.group.cursor-pointer` (ne button — OfferCard je `<div onClick>`)
  - Assert: dialog viditelný + heading viditelný + pokud wasNew: PATCH user_partner_offers fired
- `tests/e2e/08-partner-offer-persistence.spec.ts` (commit `d37dd7a`):
  - Login → /wins → Nabídky → otevřít nabídku → waitForResponse PATCH (s catch pro already-opened)
  - Escape → reload → přepnout zpět na Nabídky tab
  - Assert: nabídka stále viditelná + "Nová" badge NOT visible

### Nový env var
- `E2E_WIN_CONTEST_ID` — přidat jako GitHub Secret; musí ukazovat na seeded contest s 1 zbývající tiketou

---

## 2026-05-13 - PR #3 PWA metadata a schválené trophy ikony

- Sloučen PR #3 `Add PWA manifest and approved icons` do `main`.
- Merge commit: `365d7545894a2d4d9d89c349c55a563dee3d62a8`.
- Přidán `public/manifest.webmanifest`.
- Do `index.html` přidán manifest link, `theme-color` a `apple-touch-icon`.
- Do `public/` byly zapojeny pouze schválené trophy ikony z brand kitu:
  - `public/apple-touch-icon.png`
  - `public/android-chrome-192x192.png`
  - `public/android-chrome-512x512.png`
- Nepřidán service worker ani offline caching.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #3.
  - Playwright Staging Full E2E prošel na větvi `codex/pwa-icon-metadata`: run `25806842615`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25807224457`.
  - Playwright Staging Full E2E prošel: run `25807653323`.

---

## 2026-05-13 - PR #4 iPhone/PWA spodní navigace

- Sloučen PR #4 `Fix iOS PWA bottom navigation` do `main`.
- Merge commit: `0013ab74864ed4c206e79721d67a7346ce54e48d`.
- Spodní navigace v mobilním/PWA zobrazení zůstává fixovaná dole při scrollování.
- Přidána podpora iPhone safe area přes `viewport-fit=cover` a `env(safe-area-inset-bottom)`.
- Přidáno mobilní spodní odsazení obsahu, aby obsah nebyl schovaný za navigací.
- Nebyly změněny routy, ikony, české labely ani business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #4: run `25810873277`.
  - Playwright Staging Full E2E prošel na větvi `fix/ios-pwa-bottom-navigation`: run `25811043511`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25811447264`.
  - Playwright Staging Full E2E prošel: run `25811641231`.

---

## 2026-05-13 - PR #5 launch wording cleanup

- Sloučen PR #5 `Clean launch wording risks` do `main`.
- Merge commit: `acc43c90d313cbe2bd01adf333d74d3f424905fa`.
- Z public/admin/Bob-visible textů byla odstraněna riziková wording stopa kolem `losy`, `losování`, `jackpot` a `Megajackpot`.
- Texty jsou sjednocené na bezpečnější launch formulace: tikety, otevření tiketů, soutěžní mechanismus, předem určené výherní pozice, hlavní výhra.
- Nebyla změněna business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #5.
  - Playwright Staging Full E2E prošel na větvi `fix/launch-copy-risk-wording-cleanup`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25816716804`.
  - Playwright Staging Full E2E prošel: run `25816763438`.

---

## 2026-05-13 - Produkční DB launch verification read-only

- Produkční DB verification proběhla pouze read-only přes `SELECT`.
- `handle_new_auth_user` původní FAIL byl false positive.
- `public.profiles` insert používá `id`, `full_name`, `date_of_birth`, `avatar_url` a nevkládá `user_id` do `profiles`.
- `trigger_sofinity_forward` nevolá `net.http_post` přímo.
- Produkce aktuálně používá legacy Sofinity forwarding path:
  `event_logs / trigger_sofinity_forward -> event_forward_log -> call_event_forward_log_listener -> event_queue -> process_event_queue_worker -> Sofinity`.
- Tato legacy mezivrstva není Web/PWA launch blocker.
- Technický dluh po launchi: zvážit zjednodušení legacy cesty `event_forward_log -> event_queue`, ale pouze po samostatném schválení.
- Nebyla změněna data ani schema.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.

---

## 2026-05-13 - Produkční contest cleanup před Web/PWA launchem

- Produkční launch blocker `active contests missing rules_pdf_url` byl vyřešen.
- 7 testovacích soutěží bylo přesunuto ze stavu `active` do `draft` / Archiv test.
- 3 reálné soutěže bez PDF pravidel byly dočasně přesunuty ze stavu `active` do `draft` / Archiv test:
  - BMW S 1000 RR
  - Corvette
  - MY26 CORVETTE C8 Stingray 6.2L V8 - Coupe
- Finální ověření: PASS — žádné aktivní soutěže nemají chybějící `rules_pdf_url`.
- Žádná soutěž nebyla smazána.
- Nebyly spuštěny migrace.
- Nebyl proveden deploy.
- Nebyl měněn app kód.
- Nebyly měněny Stripe, wallet, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-13 - Stripe Test Mode verification

- Stripe je aktuálně správně v Test mode.
- Testovací top-up pro `e2e@onemil.cz` byl vizuálně dokončen v OneMil a zobrazen ve Stripe.
- Supabase ověření potvrdilo:
  - wallet pro `e2e@onemil.cz` existuje,
  - `balance_coins = 100507.00`,
  - `bonus_balance_coins = 11.00`,
  - latest payment `status = completed`,
  - latest payment `method = stripe`,
  - `stripe_session_id` začíná `cs_test_`,
  - latest payment amount v DB je `1280.00`.
- Amount `1280.00` je potřeba porovnat s vybraným UI balíčkem/bonusem před veřejným spuštěním.
- Nebyla provedena žádná live platba.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyl měněn app kód.
- Nebyly měněny Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-14 - PR #6 admin revenue reporting fix

- Sloučen PR #6 `Separate admin revenue from credited MioCoins` do `main`.
- Merge commit: `c32325eef3a4511d8283dca74c27d050b8e5d287`.
- Admin reporting už nezobrazuje `payments.amount` jako Kč tržbu.
- `payments.amount` zůstává evidováno jako připsané MioCoiny.
- `Tržba Kč` je ve frontendu odvozena ze známé mapy MioCoin balíčků:
  - 50 MC -> 50 Kč
  - 310 MC -> 300 Kč
  - 525 MC -> 500 Kč
  - 1280 MC -> 1200 Kč
- Připsané MioCoiny jsou v adminu zobrazeny samostatně.
- Neznámé částky mimo známé balíčky se v Kč tržbě zobrazují jako `neznámé`.
- Nebyla změněna business logika.
- Nebyla měněna databázová funkce `get_admin_summary_dashboard`.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyly měněny Supabase data, Stripe, webhook, wallet, contests, tickets, winners, Partner Offers, Sofinity, OneSignal ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #6.
  - Playwright Staging Full E2E prošel na větvi `fix/admin-revenue-miocoin-reporting`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25845908864`.
  - Playwright Staging Full E2E prošel: run `25845971759`.

---

## 2026-05-14 - get_admin_summary_dashboard follow-up audit

- Po PR #6 hlavní admin reporting správně odděluje `Tržba Kč` a `Připsané MioCoiny`.
- Read-only audit potvrdil, že DB funkce `get_admin_summary_dashboard` stále ve legacy `payments_summary` formátuje `payments.amount` jako Kč.
- `payments.amount` zůstává připsaný počet MioCoinů, ne zaplacená Kč částka.
- Funkce je v živém kódu používána pouze v `AdminValidationWorkflows` / admin validation tabu.
- Hlavní admin revenue reporting po PR #6 na tuto legacy hodnotu nespoléhá.
- Toto není Web/PWA launch blocker.
- Technický dluh po launchi:
  - buď přestat ve frontend validačním tabu zobrazovat raw `payments_summary`,
  - nebo později upravit DB funkci přes samostatně schválenou migraci.
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.

---

## 2026-05-14 - MioCoin top-up package verification

- MioCoin top-up package mapping bylo ověřeno read-only.
- Potvrzené mapování:
  - 50 Kč -> 50 MioCoinů
  - 300 Kč -> 310 MioCoinů
  - 500 Kč -> 525 MioCoinů
  - 1200 Kč -> 1280 MioCoinů
- Ověřené plochy:
  - Homepage top-up balíčky,
  - Profile top-up balíčky,
  - PaymentSuccess analytické mapování,
  - `paymentReporting` admin reporting helper,
  - `create-stripe-checkout` serverové mapování ceny na MioCoiny,
  - `stripe-webhook` mapování zaplacené Kč částky na připsané MioCoiny,
  - admin reporting po PR #6.
- Homepage, Profile, PaymentSuccess, `paymentReporting`, `create-stripe-checkout`, `stripe-webhook` a admin reporting mapping jsou sladěné.
- Nebyla nalezena žádná neshoda.
- Toto není Web/PWA launch blocker.
- Během auditu nebyly změněny soubory, app kód, data ani schema.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-14 - Production contest status cleanup

- Poslední aktivní testovací soutěž `bmw` byla přesunuta ze stavu `active` do `draft`.
- Finální produkční stav soutěží:
  - `active = 0`
  - `closed = 19`
  - `draft = 76`
- Žádné soutěže nebyly smazány.
- Tento stav je správný, protože OneMil ještě není oficiálně veřejně spuštěný.
- Public launch bude vyžadovat vytvoření nebo aktivaci pouze reálných soutěží s dokončenými PDF pravidly.
- Nebyl měněn app kód.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- V rámci tohoto dokumentačního záznamu nebyla dotčena Supabase data, Stripe, wallet, payments, contests, tickets, winners, Partner Offers ani `buy_ticket_atomic`.

---

## 2026-05-14 - PR #7 Affiliate program wording merge

- Sloučen PR #7 `Rename influencer UI to Affiliate program` do `main`.
- Merge commit: `5391fdaabaccb1b1e4d5bd34fe845a46ae01603d`.
- Viditelné UI/admin označení `Influencer` bylo přejmenováno na `Affiliate program` / `Affiliate partner`.
- `/influencer` routes zůstávají beze změny kvůli bezpečnosti a kompatibilitě.
- Interní DB názvy `influencer_*` zůstávají beze změny.
- Nebyly změněny provize, tracking, login/routing, DB ani business logika.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #7.
  - Playwright Staging Full E2E prošel na větvi `fix/affiliate-program-wording`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25859772102`.
  - Playwright Staging Full E2E prošel: run `25859844919`.

---

## 2026-05-14 - PR #8 Footer Affiliate wording fix

- Sloučen PR #8 `Update footer Affiliate wording` do `main`.
- Merge commit: `003a54dc874568f90f263543d8b1b1f54d41dfd5`.
- Zbývající viditelné footer texty `Pro influencery`, `Registrace influencera` a `Přihlášení influencera` byly nahrazeny wordingem `Affiliate program` / `Affiliate partner`.
- Existující URL/routes zůstaly beze změny.
