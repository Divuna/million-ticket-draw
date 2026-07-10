Warning: truncated output (original token count: 117737)
Total output lines: 4955

# OneMil — DEVELOPMENT HISTORY (CHRONOLOGICAL ONLY)

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

Pilot prvního reálného superadmin-only gate. Na stagingu `dxmowysntemfqfnanxua` policy `admin_payments_read_all` na `public.payments` změněna z `has_role(admin) OR has_role(superadmin)` na `public.is_superadmin()` — **jen tato jedna policy**; own-payment policy (`payments_select_own`, `payments_user_read`) beze změny. **Produkce `xkzhjldrojjlrkezorey` nedotčena.** Test (seedovaná pending platba cizího vlastníka + dočasný role flip v transakci s rollbackem): superadmin čte všechny (1), admin/subadmin necte cizí (0), normální uživatel necte cizí (0), anon necte (0). Staging data/role ponechány beze změny (`total_payments=0`, `admin:2`); policy persistuje. Rollback SQL zachyceno (návrat na admin∨superadmin). Validuje vzor pro další Phase 1 gating. Produkční krok: výslovné schválení + manuální `pg_dump` před zápisem (PITR off). Bez git migrace pro produkci. Jen staging DDL + transakční ověření.

## 2026-06-22 — Phase 1: `is_superadmin()` helper aplikován na staging

První reálná Phase 1 změna. Migrace `supabase/migrations/20260622_is_superadmin_helper.sql` (commit `059dd981`) vytváří `public.is_superadmin(check_user_id uuid default auth.uid())` → true jen pro `role='superadmin'` v `user_roles`; SECURITY DEFINER, owner postgres, `SET search_path=public`, execute jen `authenticated` (revoke public/anon). **Aplikováno POUZE na staging `dxmowysntemfqfnanxua`; produkce `xkzhjldrojjlrkezorey` nedotčena.** Staging testy: superadmin→true, admin/subadmin→false, neznámý→false, anon→false, authenticated execute ✅, anon ✗, secdef owner postgres (true case přes dočasný transaction-rollback flip, bez rezidua). Aditivní — žádná RLS/RPC/EF/frontend změna. Rollback: `DROP FUNCTION IF EXISTS public.is_superadmin(uuid);`. Další krok (samostatně): aplikovat helper na produkci před superadmin-only gatingem.

## 2026-06-22 — Phase 1 backup stav potvrzen (subadmin permissions readiness)

Ověřen produkční backup stav `xkzhjldrojjlrkezorey` (Dashboard → Database → Backups) před superadmin-only re-gatingem. Plánované denní DB zálohy existují; poslední viditelná **22. 06. 2026 02:16:36 UTC**, starší 21./20./19./18./17./16./15. 06. 2026 (~7denní okno). **PITR NENÍ zapnuté** (Pro Plan add-on). **Storage objekty nejsou v DB zálohách.** Rollback baseline = `docs/rollback/phase1_baseline.sql` (živý zachycený RLS+RPC stav, autoritativní kvůli migration-history driftu); checklist = `docs/rollback/phase1_backup_checklist.md`. Phase 1 pravidlo: jen malé staged migrace + rollback SQL z baseline + manuální `pg_dump` před zápisem. Jen dokumentace — žádné SQL/RLS/EF/frontend/produkční změny. Commit `60587fa8` (baseline) + tento záznam.

## 2026-06-22 — invite-subadmin audit fix: caller superadmin id do `audit_logs`

`subadmin_invited` řádky v `public.audit_logs` měly `user_id = null`. Root cause: `invite-subadmin` volal RPC `log_admin_action` (zapisuje `user_id = auth.uid()`), ale EF běží pod service-role klientem → `auth.uid()` NULL. Fix: EF (`supabase/functions/invite-subadmin/index.ts`, krok 7) nyní zapisuje **přímo do `public.audit_logs`** s `user_id = caller.id` (ověřený volající z JWT); metadata `entity_type='user'`, `entity_id`, `target_user_id`, `invited_email`, `new_data.role='admin'`. Historické null řádky nebackfillnuté (caller nerekonstruovatelný). Redeploy: produkce v3, staging v2. Beze změny role logiky/RLS/schématu/auth/plateb/soutěží/voucherů/peněženky/tiketů/partnerů/Sofinity. Commit `0808aaad`.

## 2026-06-22 — Správa subadminů: `/admin/admins` + invite e-mailem + status overview

Dokončena superadmin-only správa adminů.
- **`/admin/admins`** (`src/pages/AdminAdmins.tsx`) live, gated `isSuperAdmin`; nav „Správa adminů" v sekci Uživatelé jen pro superadmina (`AdminContextSubNav.tsx`). Jediný superadmin: divispavel2@gmail.com.
- Superadmin **povyšuje** existující uživatele na `admin` a **odebírá** práva přímým zápisem do `user_roles` (RLS = superadmin-only). Subadmin dostane **vždy `admin`, nikdy `superadmin`**; superadmin řádky display-only.
- **Pozvánka e-mailem:** EF `invite-subadmin` nasazena na produkci (`xkzhjldrojjlrkezorey` v2, `verify_jwt=false`): superadmin guard (401/403), `createUser` bez hesla → role `admin` → recovery `generateLink` (`redirectTo=${SITE_URL}/reset-password`) → e-mail přes `email_queue`; nikdy nevrací/neloguje odkaz ani heslo; existující superadmin → 409. Staging smoke kompletní (401/403/200, role admin, e-mail queued, type=recovery); produkce smoke 401/401/OPTIONS-200.
- Pozvaný subadmin nastaví heslo na sdíleném `/reset-password` (min. 8 znaků) a přihlásí se přes `/login`. `ResetPassword.tsx` doplněn o detekci expirovaného/použitého odkazu + logování přesné Supabase chyby + české mapování. Reálný subadmin `bamadar@me.com` prošel celým flow.
- **Status overview:** RPC `get_admin_subadmins_overview()` (migrace `supabase/migrations/20260622_admin_subadmins_overview.sql`, SECURITY DEFINER owner postgres, interní admin gate, execute authenticated). UI badge: pozvánka odeslána/čeká/selhala (z `email_queue`, ne `auth.invited_at`), účet aktivní/čeká na aktivaci (`last_sign_in_at`), online teď (reuse `get_admin_online_users(300)`), naposledy online (`public.users.last_seen_at`). **Migrace aplikována na staging i produkci** — produkce `xkzhjldrojjlrkezorey` ověřena 22. 06. 2026 (`get_admin_subadmins_overview` existuje, SECURITY DEFINER owner postgres, execute authenticated, anon blokován); status-badge UI na produkci ožije po Lovable Publish.
- Žádná změna RLS/schématu/auth nastavení; nedotčeno payments, contests, vouchers, wallets, tickets, partners, Sofinity. Commity: `3478c060`, `6efd7a8f` (nav), `69ef161a` (reset-password diagnostika), `c4f423af` (overview RPC + UI), invite EF/page dříve (`d9e87c94`).

## 2026-06-16 — PWA footer install CTA visual po…67737 tokens truncated…telné admin wording `Influencer` bylo nahrazeno wordingem `Affiliate partner`.
- `/influencer` routes zůstávají beze změny.
- Interní DB/table/function názvy `influencer_*` a interní `referral_*` názvy zůstávají beze změny kvůli kompatibilitě.
- Nebyly změněny routes, DB, tracking, provize, login/routing, Stripe, wallet, contest, ticket, winner, Partner Offers ani `buy_ticket_atomic`.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Nebyla dotčena Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, commissions, tracking, routes, login behavior ani `buy_ticket_atomic`.
- Ověření před merge:
  - Smoke E2E prošel na PR #9.
  - Playwright Staging Full E2E prošel na větvi `fix/visible-referral-affiliate-wording`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25862999591`.
  - Playwright Staging Full E2E prošel: run `25863074687`.

---

## 2026-05-14 - PR #12 mobile/PWA Messages fixed layout

- Sloučen PR #12 `Fix mobile PWA messages scroll layout` do `main`.
- Merge commit: `afe743f469e9ec0059a3a1f787d8ac2ec6711946`.
- Mobile/PWA Messages layout byl opraven tak, aby horní Messages header a spodní message composer zůstaly stabilní.
- Scrolluje pouze seznam zpráv mezi headerem a composerem.
- Bottom navigation zůstává fixed.
- Nebyla změněna Bob/AI logika ani message sending logika.
- Nebyly změněny routes, DB, Supabase data, Stripe, wallet, contests, tickets, winners, Partner Offers, Affiliate ani `buy_ticket_atomic`.
- Nebyl proveden deploy.
- Nebyly spuštěny migrace.
- Ověření před merge:
  - Smoke E2E prošel na PR #12.
  - Playwright Staging Full E2E prošel na větvi `fix/mobile-messages-fixed-header-composer`: run `25876737161`.
- Ověření po merge do `main`:
  - Smoke E2E prošel: run `25876891113`.
  - Playwright Staging Full E2E prošel: run `25877013278`.

---

## 2026-05-14 - PR #15 voucher redeem E2E coverage

- Sloucen PR #15 `Add voucher redeem E2E coverage` do `main`.
- Merge commit: `72810c94b3ce0397faf8246eb5e3820022d82203`.
- Pridan staging-only spec `tests/e2e/11-voucher-redeem.spec.ts`.
- Staging Full E2E nyni overuje zakoupeny voucher redeem/detail modal, `OMV-XXXXXXXX` voucher kod a tlacitko `Zkopirovat kod`.
- Staging workflow nove seeduje dedikovany `E2E Spec11 Voucher` a zakoupeny `user_vouchers` radek pro E2E uzivatele.
- Production Smoke zustava lightweight a unchanged: dal spousti pouze specs 01 + 02.
- Nebyl zmenen app kod.
- Nebyly zmeneny DB, Stripe, wallet logika, contests, tickets, winners, Partner Offers, routes, tracking, login behavior ani `buy_ticket_atomic`.
- Nebyl proveden deploy.
- Nebyly spusteny migrace.
- Nebyla dotcena production data.
- Overeni pred merge:
  - Smoke E2E prosel na PR #15: run `25884819703`.
  - Playwright Staging Full E2E prosel na vetvi `test/e2e-voucher-redeem`: run `25884822640`.
- Overeni po merge do `main`:
  - Smoke E2E prosel: run `25885049877`.
  - Playwright Staging Full E2E prosel: run `25885285280`.

---

## 2026-05-18 — Phase 4: Economy Persistence + Spec 18 E2E zelený

### Přehled
Phase 4 dokončena: admin contest economy předpoklady jsou nyní persistovány do Supabase tabulky `contest_economy` a při znovuotevření editačního modalu se korektně načítají. Celý cyklus je ověřen stagingem E2E (spec 18).

### Migrace (staging)
- `20260517180000_add_contest_economy_table.sql` — nová tabulka `public.contest_economy` (1:1 s `contests`, `ON DELETE CASCADE`, admin-only RLS via `has_role()`)
- `20260517180100_add_bonus_prize_economy_columns.sql` — 4 nullable sloupce na `public.bonus_prizes`: `supplier_name`, `unit_cost_czk`, `vat_rate_percent`, `handling_override_czk`

### Spec 18 — cesta k zelenému (PRs #39–#49)
Spec 18 (`tests/e2e/18-admin-economy-persist.spec.ts`) byl přidán jako staging-only test ověřující persistenci ekonomických předpokladů. Opravy probíhaly iterativně na základě artefaktů z neúspěšných runů:

| PR | Fix |
|----|-----|
| #43 | Cookie consent pre-seed — `CookieConsentBanner` (fixed bottom-0 z-[100]) blokoval klikání |
| #44 | Navigate to "Vytvořit soutěž" tab před save — tlačítko save existuje pouze v tomto TabsContent |
| #45 | `test.setTimeout(180_000)` + `.catch(() => {})` na cleanup |
| #46 | Plný toast titulek `/Soutěž (aktualizována|vytvořena)/i` — příliš krátký regex matchoval více elementů |
| #47 | `.first()` na toast — Shadcn/Radix duplikuje obsah v hidden `aria-live` regionu |
| #48 | Odstraněn `waitForLoadState('networkidle')` (Supabase Realtime WebSocket — nikdy nezavírá); odstraněna toast assertion |
| #49 | `{ timeout: 1000 }` na cleanup click — `[aria-label="Close"]` nenacházel element; bez `actionTimeout` čekal donekonečna; `.catch(() => {})` zachytí až throw, ne visící Promise |

### Finální výsledek
- **Run:** `26026329321` — ✅ **26 passed, 3 skipped, 0 failed** (2m 50s)
- **Spec 18:** ✅ prošel v 10.7s
- **Telegram:** `✅ OneMil STAGING full E2E OK — all specs passed` (message_id 443)
- **Merge commit PR #49:** `a0a2b494ef398c74b1cee591b1554d4610daac00`

### Invariant
- Nebyl změněn `buy_ticket_atomic`, ticket purchase logic, winner logic, Partner Offers, platební pipeline, Stripe, wallet ani produkce.
- Fyzické nákladové sloupce na `bonus_prizes` jsou nullable a admin-only; žádná existující logika nebyla dotčena.
- Production schema nedotčen — migrace aplikovány pouze na staging.

---

## 2026-05-18 — Phase 4: Production rollout ověřen

- Migrace `add_contest_economy_table` a `add_bonus_prize_economy_columns` aplikovány manuálně na produkci (`xkzhjldrojjlrkezorey`).
- Ověření: `public.contest_economy` tabulka existuje, sloupce `supplier_name`, `unit_cost_czk`, `vat_rate_percent`, `handling_override_czk` na `public.bonus_prizes` existují.
- **Production smoke po migraci:** run `26027726603` — ✅ **5 passed, 0 failed, 0 skipped** (22s).
- Telegram: `✅ OneMil PROD smoke OK — registration + login passed` doručen (message_id 446).
- Žádná regrese. `buy_ticket_atomic`, winner logic, Partner Offers, Stripe, wallet ani žádná produkční data nedotčeny.
- Phase 4 je kompletně nasazena na staging i produkci a ověřena E2E.

---

## 2026-05-18 — Spec 19: Physical Prize Economy Persist E2E

### Kontext
Po kompletním dokončení Phase 4 Economy Persistence bylo zjištěno, že fyzické nákladové údaje věcných výher (supplier_name, unit_cost_czk, vat_rate_percent, handling_override_czk) jsou sice persistovány na `bonus_prizes` a při načtení modalu správně hydratovány do frontend state, ale E2E pokrytí chybělo.

### Implementace
- Analýza (`AdminContestManagement.tsx`) potvrdila, že `PhysicalPrize` interface, form, save a load kód pro ekonomická pole fyzických výher jsou již plně implementovány — žádná app kód změna nebyla potřeba.
- Vytvořen `tests/e2e/19-admin-physical-prize-economy-persist.spec.ts` (173 řádků, staging-only):
  - Sdílí `E2E_SPEC18_CONTEST_ID` se spec 18 (clean slate: spec 18 vždy uloží 0 fyzických výher → bonus_prizes prázdný pro spec 19)
  - Scope helper `inputByLabel(container, label)` — scoped na aktivní tab panel, zabraňuje kolizím s `"DPH v %"` vs `"Sazba DPH v %"` v inactive panelech (Shadcn tabs zůstávají v DOM)
  - Vyplní: Popis výhry, Pozice tiketu, Dodavatel, Nákupní cena bez DPH v Kč, DPH v %, Balné / pošta / práce (88 Kč → override)
  - Ověří persistenci (po reopenu): `E2E Dodavatel s.r.o.`, `/1[^\d]000/` (Czech tisíce sep), `/DPH:.*15/`, `/Balné:.*88/`, `(override)`
  - Cleanup best-effort: `{ timeout: 1000 }.catch(() => {})` + Escape (stejný pattern jako spec 18)

### PR #50
- Merge commit: `1b937efba87cbda9118a2d8e532d2da6fdc46d44`
- Pouze `tests/e2e/19-admin-physical-prize-economy-persist.spec.ts` (+173 řádků, 0 mazání, ADDED)
- Smoke E2E (Chromium): ✅ PASS (1m 9s)
- Branch `test/spec19-physical-prize-economy-persist` smazána

### Staging Full E2E po PR #50
- **Run:** `26029330415` — spuštěno, výsledek čeká
- **Playwright testy: 19 spec souborů** (01–19)

---

## 2026-05-31 - Social login visibility adjusted (commits `cdbaec0`, `ec48700`, `3874f20`)

- Apple social login byl potvrzeny jako rozbity: Supabase vracel `Unsupported provider: provider is not enabled`.
- Prvni fix (`cdbaec0`) skryl Google, Apple i Facebook za explicitni env opt-in.
- Po fetchi z `origin/main` vznikl konflikt v `src/pages/Login.tsx` a `src/pages/Register.tsx`; merge commit `ec48700` zachoval aktualni remote zmeny a social auth guardy.
- Finalni follow-up (`3874f20`) upravil vychozi chovani: Google a Facebook jsou viditelne defaultne; Apple zustava skryty defaultne a zobrazi se jen pri `VITE_ENABLE_APPLE_AUTH=true`.
- Kanonicka konfigurace je `src/config/socialAuth.ts`; `Login.tsx` a `Register.tsx` pouze ctou `ENABLED_OAUTH_PROVIDERS`.
- Nebyla menena Supabase Auth konfigurace, databaze, email/password login, odkazy login/register, profile, wallet, contests, tickets, vouchers, winners, Partner Offers, AI chat ani admin.
- Build po obou zmenach prosel pres `npm.cmd run build`; zustaly jen existujici Vite/Tailwind warningy.

---

## 2026-06-02 - Affiliate foundation staging verification

- Affiliate foundation migration `20260602_affiliate_commission_foundation.sql` byla pripravena jako bezpecny databazovy foundation navrh pro sjednoceny affiliate provizni system.
- Commit migrace: `76f623e96a9d87708713c90a8c42cc47507b497d` (`feat: add affiliate commission foundation migration`).
- Follow-up commit odstranil UTF-8 BOM: `7d38fb3e81b1aae8aab7e4c277c6e45f0a2964e0` (`fix: remove BOM from affiliate foundation migration`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla dotcena.
- SQL probehlo na stagingu bez chyby.

Postcheck staging:
- Nove affiliate tabulky existuji.
- RLS je zapnute.
- Admin read policies existuji.
- Prime write policies neexistuji.
- Admin views existuji a jdou cist bez chyby.
- CHECK constraint na `affiliate_payouts.period_month` existuje.
- Nove tabulky jsou prazdne.
- Na existujici chranene tabulky nepribyly affiliate triggery.
- Jediny `affiliate_triggers_exist` FAIL byl false positive: `information_schema.triggers` vraci `trg_prevent_affiliate_rate_overlap` dvakrat, protoze trigger je `BEFORE INSERT OR UPDATE`.

Invariant:
- Nebyl menen app kod.
- Nebyla menena SQL migrace po staging aplikaci.
- Nebyly meneny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele` ani B2B partner program.
- Affiliate foundation zatim nic nenapojuje na register, payments, wallet ani produkcni provizni vypocty.

---

## 2026-06-02 - Affiliate admin RPC staging test

- RPC migration `20260602_admin_create_affiliate_partner_rpc.sql` byla ověřena pouze na staging Supabase projektu `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla použita ani dotčena.
- Dočasný Supabase client script `tmp/staging-test-admin-create-affiliate-partner.mjs` byl připraven a spuštěn proti stagingu, ale klientský Auth bootstrap ručně založeného staging test účtu selhal před voláním RPC:
  - první běh bez env: `Missing required env var: STAGING_ADMIN_EMAIL`,
  - po založení SQL test účtů: `Admin login failed: Invalid login credentials`,
  - po dorovnání Auth metadat: `Admin login failed: Database error querying schema`.
- Proto bylo samotné RPC ověřeno databázově na stagingu se simulovaným authenticated JWT contextem (`request.jwt.claim.sub`) pro dočasného admin a nonadmin uživatele.

Výsledek RPC testu:
- Testovací kód: `TESTAFF20260602021409162`.
- `rpc_create`: OK.
- `affiliate_partners`: záznam vznikl.
- `affiliate_codes`: záznam vznikl.
- `affiliate_commission_rate_history`: první sazba vznikla, `valid_to = null`.
- `affiliate_audit_logs`: audit záznam vznikl.
- Druhé volání se stejným kódem vrátilo `affiliate_code_already_exists`.
- Nonadmin context vrátil `not_admin`.
- Cleanup proběhl na stagingu: `affiliate_codes.code = TESTAFF20260602021409162` je `absent`.
- Dočasné staging Auth test účty byly po testu odstraněny.
- Dočasné lokální skripty z `tmp/` byly smazány a nebyly commitnuty.

Invariant:
- Nebyl měněn app kód.
- Nebyly měněny SQL migrace.
- Nebylo aplikováno nic do produkce.
- Nebyly měněny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zákaznické `Pozvi přátele`, B2B partner program ani existující influencer systém.

---

## 2026-06-02 - Affiliate partner status RPC staging verification

- Pri staging testu RPC `admin_update_affiliate_partner_status` selhal okamzity prechod na `terminated`, protoze `affiliate_partners` ma CHECK constraint `contract_ends_at IS NULL OR contract_starts_at IS NULL OR contract_ends_at > contract_starts_at`.
- Root cause: test vytvoril partnera a ukoncil ho ve stejne transakci, takze puvodni `contract_ends_at = now()` mohlo vyjit stejne jako `contract_starts_at`.
- Vytvorena opravna migrace `20260602_fix_admin_update_affiliate_partner_status_contract_end.sql`.
- Commit opravne migrace: `c2eabf3bfe80e5cba1f90e86f03fa46ad35ba0d1` (`fix: ensure affiliate termination date is after contract start`).
- Oprava nahrazuje pouze `public.admin_update_affiliate_partner_status(...)`.
- Pri prechodu na `terminated` se pouzije `clock_timestamp()`, a pokud neni vetsi nez `contract_starts_at`, nastavi se `contract_ends_at = contract_starts_at + interval '1 millisecond'`.
- Audit log nove uklada `status`, `contract_starts_at` a `contract_ends_at` v `old_data` i `new_data`.

Staging aplikace a test:
- Opravna migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.
- Testovaci kod: `TESTSTAT20260602023104886`.
- Test vytvoril docasneho affiliate partnera pres `admin_create_affiliate_partner`.
- Overene prechody: `pending -> active`, `active -> paused`, `paused -> active`, `active -> terminated`.
- Overeno: `contract_ends_at > contract_starts_at`.
- Overeny 4 audit logy pro status zmeny vcetne `contract_starts_at` a `contract_ends_at`.
- Zakazany prechod `terminated -> active` vratil `affiliate_status_transition_not_allowed`.
- Cleanup probehl: `TESTSTAT20260602023104886` je `absent`.
- Predchozi selhany kod `TESTSTAT20260602022743527` byl zkontrolovan a je take `absent`.

Invariant:
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebyly meneny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.

---

## 2026-06-02 - Affiliate commission rate RPC staging verification

- Testovana migrace: `20260602_admin_set_affiliate_commission_rate_rpc.sql`.
- Commit migrace: `20f709b7e627beb0a98ff060899ff7fdc4b34336` (`feat: add admin set affiliate commission rate rpc`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `admin_set_affiliate_commission_rate` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck staging:
- `admin_set_affiliate_commission_rate(uuid,numeric,timestamptz,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Vysledek rate RPC testu:
- Testovaci kod: `TESTRATE20260602061042655`.
- Docasny affiliate partner byl vytvoren pres `admin_create_affiliate_partner`.
- Vychozi sazba byla `0.02`.
- `admin_set_affiliate_commission_rate` zmenilo sazbu z `0.02` na `0.05`.
- Stary rate interval ma nastavene `valid_to`.
- Novy rate interval ma `commission_rate = 0.05` a `valid_to IS NULL`.
- Audit log `affiliate_commission_rate_changed` byl overen.
- Ocekavane validacni chyby byly overeny:
  - `commission_rate_unchanged`,
  - `commission_rate_valid_from_in_past`,
  - `affiliate_partner_status_invalid_for_rate_change`.
- Zmena sazby je povolena pro `pending`, `active`, `paused`.
- Zmena sazby je zakazana pro `terminated`, `rejected`.
- Cleanup probehl: testovaci affiliate kody a partneri jsou po cleanupu `absent`.

Invariant:
- Nebyla potreba opravna migrace.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebyly meneny registrace, `partner/register`, payments, wallet, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.
- Affiliate zatim neni napojen na registrace, platby ani vypocty provizi.

---

## 2026-06-02 - Affiliate customer attribution RPC staging verification

- Testovana migrace: `20260602_record_affiliate_customer_attribution_rpc.sql`.
- Commit migrace: `9cd61cb0e1d32b8a8e2b7dc8a007d7ad2e73c3e5` (`feat: add affiliate customer attribution rpc`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `record_affiliate_customer_attribution` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck staging:
- `record_affiliate_customer_attribution(text,text,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Vysledek customer attribution RPC testu:
- Testovaci kod: `TESTATTR20260602062307941`.
- Docasny affiliate partner byl vytvoren pres `admin_create_affiliate_partner` a aktivovan pres `admin_update_affiliate_partner_status`.
- Docasny zakaznik byl vytvoren pouze na stagingu pro test `auth.uid()` contextu.
- `record_affiliate_customer_attribution` vytvorilo zaznam v `user_affiliate_attributions`.
- Overeno: `locked = true`, `source = direct_link`, metadata obsahuji `landing_url` a `client_metadata`.
- Audit log `affiliate_customer_attribution_recorded` byl overen.
- Opakovane volani se stejnym uzivatelem a jinym validnim kodem vratilo `existing_attribution_preserved`; puvodni attribution se neprepsala.
- Ocekavane validacni chyby byly overeny:
  - `affiliate_partner_not_active`,
  - `affiliate_code_not_active`,
  - `source_invalid`,
  - `not_authenticated`.
- Cleanup probehl: testovaci attribution, audit logy, affiliate kody, affiliate partneri a docasny auth uzivatel jsou po cleanupu `absent`.

Invariant:
- Nebyla potreba opravna migrace.
- Nebyl pouzit service role key.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebyly meneny registrace, frontend registrace, payments, wallet, vypocty provizi, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.

---

## 2026-06-02 - Affiliate merchant referral RPC staging verification

- Testovana migrace: `20260602_record_affiliate_merchant_referral_rpc.sql`.
- Commit migrace: `a82eb153ba1cc08237e04860dbcbebd322cb326b` (`feat: add affiliate merchant referral rpc`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `admin_update_affiliate_partner_status` existuje.
- `record_affiliate_merchant_referral` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- `partners.auth_user_id` existuje.
- `merchant_affiliate_referrals` ma `UNIQUE (merchant_partner_id)`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck staging:
- `record_affiliate_merchant_referral(uuid,text,text,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Vysledek merchant referral RPC testu:
- Testovaci kod: `TESTMREF602063923745`.
- Docasny affiliate partner byl vytvoren pres `admin_create_affiliate_partner` a aktivovan pres `admin_update_affiliate_partner_status`.
- Docasny firemni auth uzivatel a docasny zaznam v `partners` byly vytvoreny pouze na stagingu pro test `partners.auth_user_id = auth.uid()`.
- `record_affiliate_merchant_referral` vytvorilo zaznam v `merchant_affiliate_referrals`.
- Overeno: `status = registered`, metadata obsahuji `source = partner_register`, `landing_url` a `client_metadata`.
- Audit log `affiliate_merchant_referral_recorded` byl overen.
- Opakovane volani pro stejnou firmu s jinym validnim kodem vratilo `existing_merchant_referral_preserved`; puvodni merchant referral se neprepsal.
- Ocekavane validacni chyby byly overeny:
  - `merchant_partner_not_owned`,
  - `merchant_partner_not_found`,
  - `affiliate_partner_not_active`,
  - `affiliate_code_not_active`,
  - `source_invalid`,
  - `not_authenticated`.
- Cleanup probehl: testovaci merchant referral, audit logy, affiliate kody, affiliate partneri, test partner firma a docasni auth uzivatele jsou po cleanupu `absent`.
- Nezavisly cleanup check potvrdil `0 TESTMREF*` affiliate kodu, `0 Codex Merchant Referral` partner firem a `0 codex-merchant-*` auth uzivatelu.

Invariant:
- Nebyla potreba opravna migrace.
- Prvni testovaci beh selhal jen kvuli testovacimu predpokladu `affiliate_codes.updated_at`, ktery ve staging schematu neexistuje; migrace ani RPC nebyly meneny.
- Nebyl pouzit service role key.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebyly meneny registrace, `partner/register`, payments, wallet, vypocty provizi, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.
- Affiliate merchant referral zatim neni napojen na frontend `partner/register`, bonus 500 Kc za firmu, platby ani vypocty provizi.

---

## 2026-06-02 - Manual affiliate commission payment RPC staging verification

- Testovana migrace: `20260602_admin_record_affiliate_commission_for_payment_rpc.sql`.
- Commit migrace: `5fb14ad4cea514ccb03710ad3c5b5ee1c5666acd` (`feat: add manual affiliate commission payment rpc`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Affiliate foundation tabulky existuji.
- `admin_create_affiliate_partner` existuje.
- `admin_update_affiliate_partner_status` existuje.
- `record_affiliate_customer_attribution` existuje.
- `admin_record_affiliate_commission_for_payment` pred aplikaci jeste neexistovalo.
- `public.is_admin()` existuje.
- `affiliate_commission_events` ma `UNIQUE(payment_id)`.
- `payments` ma sloupce `id`, `user_id`, `amount`, `method`, `status`, `stripe_session_id`, `created_at`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Postcheck staging:
- `admin_record_affiliate_commission_for_payment(uuid,numeric,timestamptz,text,jsonb)` existuje.
- Funkce je `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE`.
- Na chranene existujici tabulky nepribyly affiliate triggery.

Vysledek manual commission RPC testu:
- Testovaci kod: `TESTCOMM602070452490`.
- Docasny affiliate partner byl vytvoren pres `admin_create_affiliate_partner` a aktivovan pres `admin_update_affiliate_partner_status`.
- Docasny zakaznik byl vytvoren pouze na stagingu.
- Zákaznicka attribution byla vytvorena pres `record_affiliate_customer_attribution`.
- Docasna stripe platba byla pripravena jako testovaci `payments` zaznam.
- `admin_record_affiliate_commission_for_payment` s `p_paid_amount_czk = 500` vytvorilo zaznam v `affiliate_commission_events`.
- Overeno:
  - `payment_amount_snapshot = 500`,
  - `payment_amount_source = admin_rpc.p_paid_amount_czk`,
  - `commission_rate_snapshot = 0.02`,
  - `commission_amount_czk = 10.00`,
  - `status = calculated`.
- Audit log `affiliate_commission_event_recorded` byl overen.
- Ocekavane validacni chyby byly overeny:
  - `affiliate_commission_event_already_exists`,
  - `payment_method_not_eligible`,
  - `payment_not_completed`,
  - `affiliate_attribution_after_payment`,
  - `affiliate_attribution_not_found`,
  - `affiliate_partner_not_active`,
  - `not_admin`.
- Cleanup probehl: testovaci commission eventy, audit logy, platby, attribution, affiliate kody, affiliate partneri a docasni auth uzivatele jsou po cleanupu `absent`.
- Nezavisly cleanup check potvrdil `0 TESTCOMM*` affiliate kodu, `0 cs_test_commission_*` plateb a `0 codex-commission-*` auth uzivatelu.

Invariant:
- Nebyla potreba opravna migrace.
- Prvni testovaci beh narazil na existujici staging wallet trigger, ktery pri `INSERT` completed payment sahal na neexistujici `wallets.balance_vouchers`; migrace ani RPC nebyly meneny.
- Finalni test vlozil platby jako `pending` a status upravil na cilovy stav, aby overeni zustalo izolovane na manual commission RPC a netestovalo wallet trigger.
- Nebyl pouzit service role key.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nevznikl zadny trigger.
- Nebyly meneny Stripe webhook, payments flow, wallet ani automaticke provize.
- Nebyly meneny registrace, `partner/register`, `buy_ticket_atomic`, Partner Offers, zakaznicke `Pozvi pratele`, B2B partner program ani existujici influencer system.

---

## 2026-06-02 - Affiliate detail admin views staging verification

- Testovana migrace: `20260602_admin_affiliate_detail_views.sql`.
- Commit migrace: `23fe6040809e44f596e6199e6f6406368b0e47c1` (`feat: add affiliate admin detail views`).
- Migrace byla aplikovana pouze na staging Supabase projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkce `xkzhjldrojjlrkezorey` nebyla pouzita ani dotcena.

Precheck staging:
- Potrebne affiliate tabulky a sloupce existuji.
- Detailni views pred aplikaci jeste neexistovaly.
- `public.users.id`, `public.users.email`, `public.users.name` existuji.
- `public.profiles.id`, `public.profiles.full_name` existuji.

Postcheck staging:
- Views existuji:
  - `v_admin_affiliate_customer_attributions`,
  - `v_admin_affiliate_merchant_referrals`,
  - `v_admin_affiliate_commission_events`.
- Vsechny tri views maji `security_invoker = true`.
- Role `authenticated` ma `SELECT` grant na vsechny tri views.
- Views jdou cist bez chyby; staging pocty byly customer `0`, merchant `0`, commission `0`.
- Nevzniklo zadne RPC.
- Nevznikly zadne affiliate detail triggery.
- Nevznikly zadne policies na detail views.

Invariant:
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebylo aplikovano nic do produkce.
- Nebylo pridano zadne RPC, triggery ani policies.
- Nebyly meneny Stripe webhook, payments flow, wallet, automaticke provize ani stary influencer system.

---

## 2026-06-02 - Affiliate DB production rollout

- Produkcni rollout affiliate DB vrstvy byl dokoncen v Supabase projektu `onemil` (`xkzhjldrojjlrkezorey`).
- Staging projekt `dxmowysntemfqfnanxua` nebyl v tomto rollout behu pouzit.
- Produkcni projekt byl pred aplikaci znovu potvrzen jako `onemil`, `ACTIVE_HEALTHY`.

Aplikovane zbyvajici migrace:
- `20260602_admin_update_affiliate_partner_status_rpc.sql`
- `20260602_fix_admin_update_affiliate_partner_status_contract_end.sql`
- `20260602_admin_set_affiliate_commission_rate_rpc.sql`
- `20260602_record_affiliate_customer_attribution_rpc.sql`
- `20260602_record_affiliate_merchant_referral_rpc.sql`
- `20260602_admin_record_affiliate_commission_for_payment_rpc.sql`
- `20260602_admin_affiliate_detail_views.sql`

Poznamka:
- Produkcni Davka 1 `20260602_affiliate_commission_foundation.sql` a `admin_create_affiliate_partner` byly aplikovane a overene uz pred timto dokoncenim rollout behu.

Kontroly po davkach:
- Ocekavane RPC/view po kazde migraci existovalo.
- RPC maji `SECURITY DEFINER`.
- Role `authenticated` ma `EXECUTE` na RPC.
- Views maji `security_invoker = true`.
- Role `authenticated` ma `SELECT` na views.
- Affiliate tabulky zustaly prazdne.
- Na `payments`, `wallets`, `wallet_transactions`, `tickets`, `contests`, `partner_offers`, `partners` nepribyly zadne affiliate triggery.

Finalni postcheck:
- 9/9 affiliate tabulek existuje.
- RLS je zapnute na 9/9 affiliate tabulkach.
- 5/5 affiliate admin views existuje.
- 5/5 affiliate admin views ma `security_invoker = true`.
- 6/6 affiliate RPC existuje.
- 4/4 admin RPC jsou `SECURITY DEFINER`.
- `authenticated` ma `EXECUTE` na 6/6 RPC.
- `authenticated` ma `SELECT` na 5/5 views.
- `affiliate_commission_events` ma `UNIQUE(payment_id)`.
- `affiliate_payouts` ma CHECK constraint pro `period_month`.
- Detail views jdou cist bez chyby; produkcni pocty byly customer `0`, merchant `0`, commission `0`.
- Affiliate tabulky jsou po rollout prazdne.
- Neexistuji affiliate triggery ani affiliate policies na chranenych existujicich tabulkach.

Invariant:
- Nebyla vytvorena zadna produkcni testovaci data.
- Nebyl zalozen affiliate partner v produkci.
- Nebyla volana zadna zapisova affiliate RPC v produkci.
- Nebyl pouzit service role key ve skriptech.
- Nebyl menen app kod.
- Nebyly meneny existujici migrace.
- Nebyl vytvoren trigger na `payments`.
- Nebyly meneny Stripe webhook, payments flow, wallet ani stary influencer system.
- Affiliate zatim zustava bez automatickeho napojeni na registrace, Stripe, payments flow, wallet a automaticke provize.

---

## 2026-06-02 - Affiliate production admin UI verification

- Produkční admin UI affiliate systému bylo ověřeno na `https://onemil.cz/admin/affiliate` jako přihlášený produkční admin.
- Stránka `https://onemil.cz/admin/affiliate` se otevřela.
- Taby `Partneři`, `Zákazníci`, `Firmy`, `Provize`, `Výplaty` fungují a přepínají příslušný obsah.
- Tlačítko `Vytvořit partnera` je viditelné.
- Dialog `Vytvořit affiliate partnera` se otevřel.
- V dialogu jsou přítomná všechna pole:
  - `Název partnera`,
  - `Affiliate kód`,
  - `Typ`,
  - `Kontaktní e-mail`,
  - `Právní název / firma`,
  - `Provizní sazba`,
  - `Začátek smlouvy`,
  - `Důvod vytvoření`,
  - `Poznámka`.
- Kliknuto bylo pouze na `Zrušit`.

Invariant:
- Nevznikla žádná produkční data.
- Nebyl vytvořen affiliate partner.
- Nebylo voláno zápisové RPC `admin_create_affiliate_partner`.
- Nebylo spuštěno SQL.
- Nebyly měněny soubory aplikace.
- Stripe, payments flow, wallet a starý influencer systém zůstaly beze změny.

---

## 2026-06-02 - Affiliate admin UI changed back to read-only

- Po záchranném auditu bylo potvrzeno, že původní veřejný influencer/affiliate systém zůstává hlavní provozní flow:
  `/influencer`, `/influencer/register`, `/influencer/dashboard`, `/admin/influencers`,
  `/admin/influencer-commissions`, `/admin/influencer-campaigns`.
- Nová affiliate DB/admin vrstva na `/admin/affiliate` byla ponechána pouze jako interní read-only přehled.
- Ze stránky `/admin/affiliate` bylo odstraněno/skryto tlačítko `Vytvořit partnera`, dialog
  `Vytvořit affiliate partnera` a UI volání zápisového RPC `admin_create_affiliate_partner`.
- Další krok má být návrh bridge: starý schválený partner v `partners` → nový záznam v
  `affiliate_partners` + lidský `affiliate_codes.code`.

Invariant:
- Nebyla vytvořena žádná produkční data.
- Nebylo voláno žádné zápisové RPC.
- Nebylo spuštěno SQL.
- Nebyly měněny DB migrace, affiliate tabulky ani DB RPC.
- Nebyly měněny Stripe webhook, payments flow, wallet ani původní influencer systém.

---

## 2026-06-02 - Affiliate legacy bridge staging test

- Bridge proposal `20260602_affiliate_legacy_partner_bridge_proposal.sql` byl aplikovaný pouze na staging `dxmowysntemfqfnanxua`; produkce `xkzhjldrojjlrkezorey` nebyla použita.
- RPC `admin_bridge_influencer_partner_to_affiliate` prošlo.
- Použitý existující staging partner: `E2E Affiliate Test Partner` (`25a79a73-4a8a-4649-ad6c-282c138b207b`).
- Testovací bridge kód: `BRIDGE20260602143530250`.
- Vznikl link, `affiliate_partner`, `affiliate_code`, rate history a audit log.
- Duplicitní bridge správně vrátil `legacy_partner_already_bridged`.
- Původní `partners` řádek zůstal beze změny.
- Cleanup smazal test bridge data; po cleanupu je test code/link/affiliate partner/rate history/audit log = `0`.
- Starý influencer systém nebyl změněn; Stripe, payments flow a wallet nebyly změněny.

**2026-06-02** — PAVEL01 self-attribution cleanup. Produkční monitoring ukázal 1 atribuci; detail potvrdil self-attribution: attribution_id `5dcd316a-6233-4191-9702-30a5bff1d1a9`, user_id `c23507eb-081c-4170-89ad-2e78df088103` (`influencer@onemil.cz`), code PAVEL01, display name Pavel Divis, legacy partner auth_user_id `c23507eb-081c-4170-89ad-2e78df088103` → is self attribution YES, source `direct_link`, locked true, landing_url `https://onemil.cz/?aff=PAVEL01`. Smazána pouze tato self-attribution + její audit log. Verifikace: remaining PAVEL01 attributions total = 0, remaining self attribution rows = 0, remaining audit logs = 0, ref collision rows = 0. PAVEL01 setup zachován (partner `9bf4e8ca…`, code `371c2cd1…` active, link `a50736a9…`); starý influencer systém, Stripe, payments flow, wallet a `/admin/affiliate` beze změny.

**2026-06-02** — Produkční capture-only smoke test `aff=PAVEL01` proběhl ručně v anonymním okně na `https://onemil.cz` (bez loginu). Test 1 `?aff=PAVEL01` → `onemil_affiliate_aff="PAVEL01"`, `onemil_referral_ref=null`. Test 2 `?ref=NEJAKYREF&aff=PAVEL01` → `onemil_affiliate_aff` se neuložil (ref má přednost). Test 3 `?aff=x` → neuložil se (nevalidní krátký aff odmítnut regexem). Žádný login/registrace, žádné SQL/RPC, žádná atribuce ani produkční data. Produkční tracking `aff=KOD` ověřen i ručně v prohlížeči.

**2026-06-02** — Produkční Lovable Publish affiliate trackingu `aff=KOD` ověřen (read-only fetch veřejných assetů). Bundle `https://onemil.cz/assets/index-ByC__JoZ.js` obsahuje `onemil_affiliate_aff`, `record_affiliate_customer_attribution`, regex `^[A-Z0-9][A-Z0-9_-]{2,31}$`, `direct_link`, `captured_via`, `aff_url`, `p_affiliate_code`. Název `useApplyPendingAffiliate` minifikovaný, funkční obsah přítomen. Bundle míří na produkční Supabase `xkzhjldrojjlrkezorey` (9×). Produkční tracking `aff=KOD` nasazený a aktivní. Žádná data, žádný login/registrace, žádné SQL/RPC; Stripe, payments, wallet, starý influencer systém a `/admin/affiliate` beze změny.

**2026-06-02** — Staging E2E ověření affiliate trackingu `aff=PAVEL01` (pouze staging `dxmowysntemfqfnanxua`, frontend lokálně na portu 8090 proti stagingu, commit `3f10500`). Pozitivní test PROŠEL: `onemil_affiliate_aff=PAVEL01`, `onemil_referral_ref` prázdné, 1 řádek v `user_affiliate_attributions` (affiliate_partner_id `9bf4e8ca-ce12-49cf-8c88-a9aa63ccfb47`, affiliate_code_id `371c2cd1-0fb2-4c0f-9b08-d5fc724aa4d6`, source `direct_link`, locked true), `/admin/affiliate`→Zákazníci ukázal uživatele pod E2E Affiliate Test Partner / PAVEL01, `influencer_referrals`=0. Negativní test `NEEXISTUJE` PROŠEL: login nespadl, atribuce=0. Kolizní test `?ref=NEJAKYREF&aff=PAVEL01` PROŠEL: aff se neuložil, atribuce=0, legacy referral=0. Cleanup: test uživatelé `aff-test-*@test.local` + jejich atribuce/identities/audit logy/profiles/wallets smazány (0 orphan). Staging PAVEL01 setup zachován (partner `9bf4e8ca…`, code `371c2cd1…` active, link `a50736a9…`). Předpotvrzení test uživatelé vytvořeni přes SQL (pgcrypto), protože MCP nevystavuje service_role. Produkce nepoužita ani publikována; produkční `.env` nedotčený. Tracking připraven na produkční Lovable Publish po schválení.

**2026-06-02** — Implementován frontend affiliate tracking `aff=KOD`. Nový `src/hooks/useApplyPendingAffiliate.ts` (sessionStorage klíč `onemil_affiliate_aff`, `normalizeAffiliateCode` regex `^[A-Z0-9][A-Z0-9_-]{2,31}$`, `capturePendingAffiliateFromUrl`, `useApplyPendingAffiliate` → RPC `record_affiliate_customer_attribution` s `p_source='direct_link'`). `Register.tsx`: zachycení `aff` z URL + apply po e-mail registraci (non-blocking). `App.tsx`: root capture `aff` z `location.search` + mount hooku vedle `useApplyPendingReferral`. `ref` a `aff` oddělené; při kolizi `ref` vyhrává a `aff` se neukládá; neznámý `aff` tiše ignorován; existující atribuci nepřepisuje (RPC first-touch). DB vrstva už existovala — žádná migrace, žádné SQL. Žádná vazba na Stripe/payments/wallet/provize; `/admin/affiliate` read-only; starý influencer systém beze změny. `npm run build` ✅. Produkce zatím nepublikována (čeká na staging test).

**2026-06-02** — Ruční UI ověření prvního produkčního bridge. `/admin/influencers`: řádek Pavel Divis ve sloupci „Affiliate vrstva" ukazuje „Napojeno na affiliate vrstvu" + kód PAVEL01 + status active. `/admin/affiliate` read-only tab Partneři: Pavel Divis, typ Influencer, stav Aktivní, kód PAVEL01, sazba 2 %, hodnoty zákazníci/firmy/provize/bonusy = 0; stránka read-only (žádné tlačítko Vytvořit partnera, pouze Obnovit). Žádné SQL/RPC/data; jen dokumentace.

**2026-06-02** — PRVNÍ OSTRÝ PRODUKČNÍ BRIDGE proveden v `xkzhjldrojjlrkezorey` (`onemil`) po potvrzení `SPOUSTIM`. RPC `admin_bridge_influencer_partner_to_affiliate` spuštěno jako přihlášený admin (superadmin `divispavel2@gmail.com`, `60f5837e-a280-4ddd-b0dd-f94cc844bb3b`) pro legacy partnera `1ef76f65-b028-408b-9a77-ea9d5cad6592` (Pavel Divis) → kód `PAVEL01`, rate `0.02`. Výsledek `status:bridged` — affiliate_partner_id `80edc966-adc4-455c-b2d8-64e01aa6167e`, affiliate_code_id `a7db63ef-37a4-4922-8858-5d2fc58009d2`, link_id `58f69a9d-00c8-4efc-8731-96c22d4540a4`. Postcheck OK: 1 bridge link, affiliate_partner active/influencer, code PAVEL01 active, rate history 0.02 valid_to NULL, audit log 1×, původní partners řádek nezměněn (status approved, notes, email, updated_at). Pouze tento jeden partner; starý influencer systém, /admin/affiliate (read-only), Stripe, payments flow a wallet beze změny; staging nepoužit.

**2026-06-02** — `/admin/influencers` (`src/pages/AdminInfluencers.tsx`): přidán pouze read-only přehled bridge stavu (napojení na novou affiliate vrstvu). Načítá view `v_admin_influencer_affiliate_bridge_candidates` fail-safe (`supabase as any`); při chybě admin nespadne, zobrazí neutrální hlášku. Nová souhrnná karta (schválení vhodní / napojení / nenapojení) + nový sloupec „Affiliate vrstva" se třemi stavy (`Napojeno na affiliate vrstvu` + affiliate kód/status, `Nenapojeno na affiliate vrstvu`, `Nelze napojit – není schválený`) + UI poznámka, že napojení je zatím jen evidenční. Žádné tlačítko pro bridge, žádné RPC volání, žádné SQL, žádný bridge link, žádná produkční data. Staré schvalování, provize, výplaty, `/influencer/register`, `/influencer/dashboard`, `/admin/affiliate` (read-only), Stripe, payments flow a wallet beze změny. `npm run build` ✅.

**2026-06-02** — Affiliate legacy bridge: produkční STRUKTURA aplikována do `xkzhjldrojjlrkezorey` (`onemil`), read-only postcheck prošel. Ověřeno: `affiliate_legacy_partner_links` existuje s RLS + admin SELECT policy; RPC `admin_bridge_influencer_partner_to_affiliate` existuje, je `SECURITY DEFINER`, `authenticated` má `EXECUTE`; view `v_admin_influencer_affiliate_bridge_candidates` existuje s `security_invoker = true` + `authenticated` SELECT; bridge link table má 0 řádků; 3 approved influencer kandidáti; 0 affiliate/bridge triggerů na partners/payments/wallets/wallet_transactions/tickets/contests/partner_offers. Žádný partner nebyl bridgnutý, žádné bridge RPC nebylo voláno pro konkrétního partnera, žádná produkční testovací data nevznikla. `/admin/affiliate` zůstává read-only; Stripe, payments flow a wallet nedotčeny.
- **2026-06-03** — Affiliate v2 staging browser E2E final verification completed. Staging token config was fixed: Supabase staging `INTERNAL_FUNCTION_TOKEN` and GitHub Actions staging `STAGING_VITE_INTERNAL_FUNCTION_TOKEN` were aligned to the same plaintext value without logging or committing the token. `get-pending-partner-registrations` no longer returns 401. Browser E2E `affiliate company via flow` passed and verified `/partner/register?via=KOD` → pending registrace → admin schválení → partner → `affiliate_company_refs` → `partners.referred_by_affiliate_id`. Run URL: `https://github.com/Divuna/million-ticket-draw/actions/runs/26882872534`. Verified commit: `c9d383fc55d118a9cce5b12e67f5fb637cb124f9`. Production was not touched.
## 2026-06-07 - Admin navigace: badge čekajících partnerských registrací

- Admin kontextová podlišta v sekci `Uživatelé a partneři` nově zobrazuje u položky `Partneři` červený badge s počtem čekajících partnerských registrací.
- Badge se zobrazuje jen při počtu `> 0`; při kliknutí se dál otevírá stávající `/admin/partners`.
- Počet se načítá read-only přes existující `get-pending-partner-registrations`.
- Změněný soubor: `src/components/admin/AdminContextSubNav.tsx`. Commit `0339cd4a6775bb8dc34f395aa16f302d9fc61034`. `npm run build` prošel. GitHub Playwright Smoke Tests prošly.
- Nezměněno: DB, schvalování partnerů, affiliate logika, onboarding, zprávy a ostatní admin oblasti.

---

## 2026-06-07 - Affiliate/referral odkazy: bezpečná veřejná doména

- Přidán bezpečný helper pro veřejnou base URL affiliate/referral/partner odkazů.
- Helper použije `VITE_APP_URL` jen když je HTTPS a není localhost, Lovable ani preview; jinak fallback `https://onemil.cz`.
- Affiliate dashboard generuje zákaznický/social odkaz `https://onemil.cz/?ref=CODE` a obchodnický odkaz `https://onemil.cz/partner/register?via=CODE`.
- Helper použit také pro legacy influencer referral link a hráčský referral link; spec 26 rozšířen o kontrolu produkční domény a zákaz Lovable/localhost.
- Změněné soubory: `src/lib/publicAppUrl.ts`, `src/pages/AffiliateDashboard.tsx`, `src/hooks/useInfluencerData.ts`, `src/components/ReferralSection.tsx`, `tests/e2e/26-affiliate-dashboard-content.spec.ts`.
- Commit `d2b125045848d0baffbef2d4de8abff362097d5b`. `npm run build` prošel. GitHub Playwright Smoke Tests prošly. GitHub Playwright Staging Full E2E prošel.
- Nezměněno: DB, affiliate tracking, provize, partner registration logic, ticket logic, wallet logic a UI grafika.

---
## 2026-06-07 - Rozhodnutí: cílový B2B workflow pro `Přidat firmu`

- Schválen cílový model pro sales reps / agentury v `/affiliate/dashboard` režimu `Obchodník`: akce `Přidat firmu`.
- Sales rep vyplní company name, IČO, DIČ, company email, website, contact person / phone a sales rep note.
- Firma dostane e-mail, že sales rep / agentura požádal o registraci firmy do OneMil; e-mail musí říkat, kdo žádost poslal, co je OneMil, a obsahovat `Potvrzuji žádost` + možnost `Zamítnout žádost`.
- Dokud firma nepotvrdí, jde jen o invitation/lead a nesmí vzniknout plnohodnotná admin partnerská registrace.
- Po potvrzení firmou se žádost přesune do admin schvalování. Dashboard obchodníka má ukazovat stavy `odesláno firmě`, `firma potvrdila`, `firma zamítla`, `čeká na schválení adminem`, `schváleno`, `zamítnuto adminem`.
- Po schválení adminem systém vytvoří/aktivuje firemní partner účet, přiřadí firmu pod sales rep / agenturu, zapíše `affiliate_company_refs`, zrcadlí do `partners.referred_by_affiliate_id` a pošle firmě bezpečný jednorázový odkaz s expirací pro nastavení hesla.
- Nikdy neposílat firmám vygenerovaná hesla e-mailem.
- Provize nevzniká z vytvoření leadu, potvrzení firmy ani admin schválení; vzniká pouze z placené / fakturované aktivity firmy, například ze zaplacených `partner_invoices`.
- Pravidla: influencer codes zůstávají hlavně pro zákazníky; B2B atribuce se nesmí opírat jen o veřejně sdílené odkazy; sales rep nemůže claimnout firmu bez potvrzení firmy; firma musí mít možnost odmítnout; admin schvaluje jen firmou potvrzené žádosti; finální zdroj atribuce zůstává `affiliate_company_refs` + `partners.referred_by_affiliate_id`; existující výpočet provizí má zůstat podle paid/factured aktivity.
- Pouze dokumentační rozhodnutí. Nebyl měněn app kód, DB, provize, registrace partnerů, ticket/wallet logika, UI grafika ani nesouvisející dokumentace.

---

## 2026-06-07 - Rozhodnutí: umístění B2B funkce `Přidat firmu`

- `/affiliate/login` zůstává pouze pro přihlášení Affiliate účtu.
- `Přidat firmu` nesmí být umístěno na Affiliate login stránce a patří pouze do `/affiliate/dashboard`.
- Funkce je viditelná jen pro schválené affiliate účty, jejichž `modes` obsahuje `sales_rep`.
- Umístění: sales rep / `Obchodník` část dashboardu poblíž `Moje firmy`, leadů, stavů žádostí a firemních provizních dat.
- Influencer-only účty bez `sales_rep` funkci nesmí vidět.
- Veřejný B2B company claim nesmí vznikat z login stránky ani z nepřihlášeného flow.
- Pouze dokumentace; app kód, DB, auth, provize, partner registration logic, UI grafika a nesouvisející dokumentace nebyly měněny.

---

## 2026-06-07 - Rozhodnutí: Phase 1 DB design pro B2B company leads

- Schválený název budoucí tabulky: `affiliate_company_leads`.
- Tabulka bude pre-attribution workflow vrstva pro B2B company leady vytvořené schválenými sales reps / agenturami.
- Finální atribuce zůstává pouze v `affiliate_company_refs` a `partners.referred_by_affiliate_id`.
- `affiliate_id` má být nullable FK na `affiliate_accounts(id)` s `ON DELETE SET NULL`, ne cascade.
- Lead musí mít snapshoty obchodníka: `sales_rep_affiliate_id_snapshot`, `sales_rep_ref_code_snapshot`, `sales_rep_email_snapshot`, `sales_rep_name_snapshot`.
- Eligibility sales rep účtu: `affiliate_accounts.status = 'approved'`, `'sales_rep' = ANY(modes)` a `affiliate_accounts.auth_user_id = auth.uid()`.
- Povolené stavy leadu: `sent_to_company`, `company_confirmed`, `company_rejected`, `pending_admin_approval`, `approved`, `admin_rejected`, `expired`.
- Po admin schválení má finální `affiliate_company_refs.source` používat hodnotu `company_lead`.
- Potvrzení/zamítnutí firmou má jít přes Edge Function nebo `SECURITY DEFINER` RPC s hashed tokenem.
- Provize nevzniká z vytvoření leadu, potvrzení firmy ani admin schválení; zůstává pouze z placené / fakturované aktivity firmy.
- Pouze dokumentační rozhodnutí. Nebyla napsána migrace a nebyl měněn app kód, DB, provize, registrace partnerů, ticket/wallet logika, UI grafika ani nesouvisející dokumentace.

---

## 2026-06-07 - B2B company leads Phase 1 DB aplikováno na STAGING

- Phase 1 DB foundation pro `affiliate_company_leads` byla aplikována pouze na staging projekt `onemil-staging` (`dxmowysntemfqfnanxua`).
- Produkční projekt `xkzhjldrojjlrkezorey` nebyl použit ani dotčen.
- Hlavní staging migrace `affiliate_company_leads_phase1` proběhla úspěšně.
- Follow-up index migrace `supabase/migrations/20260607173746_affiliate_company_leads_admin_reviewed_by_index.sql` proběhla úspěšně; commit `3260b1c60f1a01e7c524443ce1c413c739891621`.
- Přidán index `idx_affiliate_company_leads_admin_reviewed_by`.
- Ověřeno na stagingu: tabulka existuje, RLS je zapnuté, policies existují, `anon` nemá přístup, `authenticated` má pouze SELECT přes RLS, běžní uživatelé nemají INSERT/UPDATE/DELETE a index existuje.
- Nebyl měněn app kód, UI, Edge Functions, e-maily, admin approval flow, provize, partner registration logic, ticket/wallet logika, grafika ani nesouvisející dokumentace.

---

## 2026-06-07 - Rozhodnutí: Phase 2 backend design pro B2B company leads

- Schválen backend design pouze jako návrh, bez implementace kódu, DB, Edge Functions nebo UI.
- `create-affiliate-company-lead`: authenticated Edge Function z `/affiliate/dashboard`, jen pro approved affiliate account s `'sales_rep' = ANY(modes)`, vytvoří lead, vygeneruje secure confirmation token, uloží jen token hash, pošle firmě potvrzovací e-mail a vrátí `{ success: true, lead_id, status: "sent_to_company" }`.
- `confirm-affiliate-company-lead`: public token endpoint, validuje token hash, expiraci a nepoužitý token; `confirm` nastaví `pending_admin_approval`, `reject` nastaví `company_rejected`; nesmí vytvořit partnera, atribuci ani provizi.
- `approve-affiliate-company-lead`: admin-only Edge Function, volitelně backed by RPC; schvaluje pouze `pending_admin_approval`, vytvoří/aktivuje partner účet, zapíše `affiliate_company_refs.source = 'company_lead'`, zrcadlí do `partners.referred_by_affiliate_id`, pošle secure password setup link, nikdy neposílá vygenerované heslo a nesmí vytvořit provizi.
- Povolené status transitions: `sent_to_company -> pending_admin_approval`, `sent_to_company -> company_rejected`, `sent_to_company -> expired`, `pending_admin_approval -> approved`, `pending_admin_approval -> admin_rejected`.
- Blokováno: žádné přímé `sent_to_company -> approved`, žádné schválení po rejected/expired, `approved` je finální, žádná atribuce před admin approval.
- Email events: company confirmation email, admin notification after company confirmation, company rejection notification to sales rep, admin approval email with password setup link, optional admin rejection email.
- Test coverage má zahrnout sales rep create, influencer-only block, anonymous block, token hash only, confirm/reject transitions, expired/used token block, admin approval creates partner + attribution, normal user cannot approve, no commission until paid/factured company activity.
- Produkce se nesmí dotknout. Beze změny ticket, wallet, payment, `buy_ticket_atomic`, graphics, login placement, commission logic, partner registration logic a finální atribuce zůstává `affiliate_company_refs` + `partners.referred_by_affiliate_id`.

---

---

**Timestamp (Europe/Prague): 2026-06-14** — Partner API PR #114 produkcni rollout checklist pripraven (NEPROVEDEN). Produkce `xkzhjldrojjlrkezorey` netknuta: zadny merge, zadne SQL, zadny deploy. Rollout vyzaduje vyslovne pisemne schvaleni Pavla pred (1) merge PR #114, (2) aplikaci migraci `20260613200202` a `20260613200849` na produkci, (3) deploy EF `partner-activate`. Staging spec 48 proslo v runu `27490386537`. Pred rolloutem nutno potvrdit partner reward settings (`reward_base_czk`/`reward_mc`). Pri `create_order_reward` nesmi vzniknout faktura/e-mail/PDF/platba/wallet credit/`partner_coin_activations` radek; wallet credit a `partner_coin_activations` vznikaji az po redempci zakaznikem. Schvalovaci fraze: „Schvaluji produkcni rollout Partner API (PR #114): aplikovat migrace 20260613200202 a 20260613200849 na produkci xkzhjldrojjlrkezorey a nasadit Edge Function partner-activate. Rozumim, ze se nevytvari zadna faktura/e-mail/PDF/platba/wallet credit pri vytvoreni objednavky."

---

**Timestamp (Europe/Prague): 2026-06-14** — Partner API partner-facing pruvodce revidovan na order-event model a ulozen do `docs/partner-api/PARTNER_API_GUIDE.md` (PR #114 branch). Model: objednavka vytvorena → cekajici odmena; paid/delivered/completed → aktivni odmena; cancelled/returned/unpaid/not_picked_up → zrusena odmena. Checkout neceka na OneMil (async, retry se stejnym `external_order_id`, idempotence vraci stejny kod). Partner neposila konecny pocet MioCoinu — pocita OneMil z nastaveni partnera. Pripraveno pro stav PO rolloutu PR #114, NE zive v produkci; `settings.partner_api_documentation` nezmenen. Pouze dokumentace — zadny kod, SQL, deploy, merge ani produkcni zmena.

---

**Timestamp (Europe/Prague): 2026-06-14** — Vytvorena kompletni Partner API onboarding sada ve `docs/partner-api/` (PR #114 branch): `README.md` (index), `PARTNER_OWNER_OVERVIEW.md` (netechnicky prehled pro majitele), `PARTNER_API_GUIDE.md` (vyvojarsky order-event guide, beze zmeny), `PARTNER_HANDOFF_EMAIL.md` (cesky predavaci e-mail). Jedna sada bez konkurencnich verzi, bez zminky o Botanicu, vsude oznaceno jako pripravene PO rolloutu PR #114 a NE zive v produkci. `settings.partner_api_documentation` nezmenen. Pouze dokumentace — zadny kod, SQL, deploy, merge ani produkcni zmena.

---

**Timestamp (Europe/Prague): 2026-06-14** — PARTNER API PR #114 PRODUKCNI ROLLOUT PROVEDEN se schvalenim Pavla. PR #114 mergnuto do `main` (merge commit `f5e508ca`). Na produkci `xkzhjldrojjlrkezorey` aplikovany migrace `20260613200202` a `20260613200849`; nasazena EF `partner-activate` v130 (`verify_jwt=false`). Postchecky OK: enum `pending` pridan, oba nove RPC (`create_partner_order_reward`, `update_partner_order_reward_status`) jen pro `service_role` (anon/authenticated revoked), idempotency index existuje, `redeem_miocoin_code` odmita `pending`, zadny `partner_api_v1` objekt. Smoke (RPC service_role + EF 401 boundary): create → `pending` 2 coiny, duplicate → stejny kod, pri create 0 activations/invoices/wallet txns; EF bez/se spatnym klicem → 401; probe radek smazan. `settings.partner_api_documentation` NEZMENEN (vyzaduje realny base URL + schvaleni wordingu). Rollback info zachyceno (partner-activate v129, md5 definic). Pri `create_order_reward` nevznika faktura/e-mail/PDF/platba/wallet credit/activation.

---

**Timestamp (Europe/Prague): 2026-06-14** — Staging-only realignment secretu `INTERNAL_FUNCTION_TOKEN`. Drift z drivejsich partner-API rotaci zpusobil, ze staging Supabase `INTERNAL_FUNCTION_TOKEN` (projekt `dxmowysntemfqfnanxua`) neodpovidal GitHub secretu `STAGING_VITE_INTERNAL_FUNCTION_TOKEN` → spec 44 (44c) 401. Vygenerovan novy sdileny token, nastaven na obou mistech (token netisten). `VITE_INTERNAL_FUNCTION_TOKEN` a produkcni secrety nezmeneny; produkce netknuta. Prvni pokus pres PowerShell pipe pridal BOM (U+FEFF) → 44c TypeError; opraveno pres `gh secret set --body`. Cilene staging runy zelene: spec 44 `27500754646` (7 passed), spec 43 `27500810383`, spec 22 `27500856702`. Zadny kod/test/migrace/EF/deploy nezmenen.

---

**Timestamp (Europe/Prague): 2026-06-14** — Pripravena launch readiness dokumentace ve `docs/launch-readiness/`: `LAUNCH_TEST_PLAN.md` (sekce A–H), `ROUTE_CHECKLIST.md` (mapa ~70 rout z routeru s P0/P1/P2), `LAUNCH_TODO.md` (65 testovacich bodu, P0=48/P1=16/P2=1). Pokryva zakaznicke, admin, partner, platebni, pravni a CI testy + zaver (co je hotove, co rucne, co automaticky, co blokuje spusteni, doporuceny poradek). P0 blockery NEOVERENO: pravni obsah VOP/GDPR/pravidla souteze, cookies, realne kontaktni/reklamacni udaje, zeleny Full E2E + P0 smoke, realne partner reward settings. `onemil_spec.md` neexistuje. Pouze dokumentace — zadny kod/SQL/deploy/produkce/testovaci data nezmeneno.

---

**Timestamp (Europe/Prague): 2026-06-14** — Launch plan gap audit (read-only). Doplneno do `docs/launch-readiness/*`: cookie banner existuje (L04 preformulovan), GAP P0 zakaznicky reset hesla (C22, nenalezen forgot/reset-password flow), zakaznicke doporuceni/invite (C23), affiliate/influencer sekce AF01–AF05 + rozhodnuti o rozsahu pro 1. test, security sekce SEC01–SEC03 (23 pre-existing advisor nalezu jako P0 consideration). Bodu 65 → 75. Nove P0 blockery: reset hesla zakaznika, security backlog. Pouze dokumentace.
**Timestamp (Europe/Prague): 2026-06-14** - C22 customer password reset prenesen na cistou vetev `codex/customer-password-reset-clean` z aktualniho `main`. Preneseny pouze soubory souvisejici se zakaznickou obnovou hesla ze source commitu `daafb1d0`: `useAuth`, router, login odkaz, nova `ResetPassword` stranka, DOB guard exempt route, E2E smoke spec 44 a minimalni dokumentacni zaznamy. `docs/launch-readiness/LAUNCH_TODO.md` zustal aktualni z main a byl upraven jen radek C22. Bez SQL, deploye, produkcnich dat, Partner API, fakturace a reward logiky.

---

**Timestamp (Europe/Prague): 2026-06-14** - C22 customer password reset mergnut a overen. PR #115 -> `main` merge commit `a7690d0b63b9f0c46bcf96f8e2810605dd5e934a`. Prvni lokalni post-merge run spec 44 selhal na timeoutu `page.goto('/login')`; lokalni CI-mode rerun prosel 3/3 a targeted staging workflow `27507097356` na `main`/`a7690d0b` prosel. Root cause: lokalni dev-server reuse/startup timing, ne realna `/login` runtime chyba. C22 v `docs/launch-readiness/LAUNCH_TODO.md` oznacen jako `proslo`. Pouze dokumentace; zadny SQL, deploy, produkcni data, Partner API, fakturace, reward logika ani migrace.

---

**Timestamp (Europe/Prague): 2026-06-14** - Legal/public texts P0 review (documentation-only). Zkontrolovany routy a zdroje: `/terms` -> `TermsConditions.tsx`, `/privacy` -> `PrivacyPolicy.tsx`, `/kontakt` -> `Kontakt.tsx`, `/vop`/`/gdpr`/`/pravidla-souteze` -> `SlugContentPage`/`content_pages`, `/legal/cookies` -> dynamic CMS route z footeru, cookie banner -> `CookieConsentBanner`/`consent.ts`, footer -> `Footer.tsx`, registrace -> odkazy na `/terms` a `/privacy`. Static pages maji vecny obsah a kontaktni udaje, ale CMS legal routes nemaji v repu seed/prokazatelny obsah; cookie policy `/legal/cookies` take zavisi na CMS; app pouziva `podpora@onemil.cz`, zatimco `COMPANY_CONTEXT.md` uvadi `support@onemil.cz`/`info@onemil.cz`. `LAUNCH_TODO.md` legal radky A13/L01-L06 aktualizovany: P0 pravni blokery zustavaji do potvrzeni CMS obsahu, cookie policy a kanonickeho support e-mailu. Zadny kod, SQL, deploy, produkcni data, Partner API, fakturace, reward logika ani migrace.

---

**Timestamp (Europe/Prague): 2026-06-14** - Contact/legal email consistency audit (documentation-only). Repo audit nasel, ze app/legal/contact/footer/delete-account/support fallback a partner docs konzistentne pouzivaji `podpora@onemil.cz`; `COMPANY_CONTEXT.md` stale uvadi `support@onemil.cz` jako podporu a `info@onemil.cz` jako hlavni e-mail, `b2b@onemil.cz` jen pro spoluprace. `accounting_email` je interni affiliate payout setting, ne verejny support. `LAUNCH_TODO.md` aktualizovan podle znameho DB vysledku: CMS `vop`, `gdpr`, `pravidla-souteze` a `cookies` existuji, ale pravni kvalita/aktualnost zustava neoverena. Doporuceni: potvrdit `podpora@onemil.cz` jako kanonicky verejny support e-mail nebo sjednotit zdroj pravdy. Pouze dokumentace; zadny kod, SQL, deploy, produkcni data, Partner API, fakturace, reward logika ani migrace.

---

**Timestamp (Europe/Prague): 2026-06-14** - Owner decision applied for public support e-mail (documentation-only). Owner confirmed `podpora@onemil.cz` as the canonical public support e-mail for OneMil launch readiness. `COMPANY_CONTEXT.md` was aligned so the main public support contact and support line use `podpora@onemil.cz`; `b2b@onemil.cz` remains business cooperation only. `LAUNCH_TODO.md` L05 marked `proslo` for public support e-mail consistency. L01-L04 remain unverified for legal/owner review of VOP/GDPR/rules/cookies content quality. No app code, SQL, deploy, production data, Partner API, invoices, reward logic, or migrations touched.

---

**Timestamp (Europe/Prague): 2026-06-14** - Public support e-mail cleanup complete (documentation-only). Full repo search for `support@onemil.cz` found no remaining live app code, email template, Edge Function, settings doc, or current source-of-truth usage. Remaining occurrences are old audit/history notes and were intentionally left unchanged. `podpora@onemil.cz` is canonical for public support; `LAUNCH_TODO.md` L05 remains `proslo`. No legal text content, app code, SQL, deploy, production data, Partner API, invoices, reward logic, or migrations touched.

---

---

**Timestamp (Europe/Prague): 2026-06-14** — P0 launch readiness: review exportovanych produkcnich CMS pravnich textu (`content_pages`). L01–L04 + nove L09 v `docs/launch-readiness/LAUNCH_TODO.md` = **selhalo / blocker**: /vop prilis kratky; /pravidla-souteze obsahuje placeholdery ([NÁZEV SOUTĚŽE], [DATUM], [POPIS HLAVNÍ VÝHRY], [HODNOTA]); /gdpr a /legal/ochrana-osobnich-udaju se lisi (sjednotit); /legal/cookies overit proti realnym cookie nastrojum a banneru; nektere pravni texty maji info@onemil.cz vs verejny podpora@onemil.cz (kontaktni e-maily v pravnich textech vyzaduji owner/legal potvrzeni pred editaci, L09 — L05 resil jen verejny support display). Zadny pravni text nezmenen, zadny CMS obsah nezmenen, zadne SQL, zadny deploy, zadna produkcni data dotcena. Dalsi krok: owner/legal review CMS pravnich textu pred verejnym spustenim.

---

**Timestamp (Europe/Prague): 2026-06-14** — SEC01: vytvoren read-only security findings inventar `docs/launch-readiness/SECURITY_FINDINGS.md` z `get_advisors(security)` na produkci `xkzhjldrojjlrkezorey`. 467 nalezu (23 ERROR / 20 INFO / 424 WARN); 23 ERROR = puvodni „23" (2 Exposed Auth Users, 1 RLS Disabled in Public na _messages_policies_backup, 20 Security Definer View). Kazdy ERROR + INFO vypsan jako radek, WARN seskupeny po kategoriich s objekty. Fixnuto=0 (drivejsi invite/affiliate fixy se v aktualnim seznamu neobjevuji). SEC01 oznacen v LAUNCH_TODO jako selhalo/P0 blocker dokud nejsou ERRORy fixnuty nebo ownerem akceptovany. Read-only: zadny kod, SQL, RLS, deploy, produkcni data nezmeneno.

---

**Timestamp (Europe/Prague): 2026-06-14** — SEC01 Group 1 aplikován a ověřen POUZE na stagingu `dxmowysntemfqfnanxua` (migrace `sec01_group1_safe_view_hardening`): REVOKE SELECT od anon/authenticated + `SET (security_invoker = on)` na 11 app-unused SECURITY DEFINER views (daily_platform_metrics, v_influencer_referrals_valid, v_user_wallets, contest_analytics, contest_ticket_map, event_queue_monitoring, event_queue_failed_summary, contest_integrity_check, system_health_monitor, admin_winner_delivery_detail, v_first_topup_valid). Postcheck: všech 11 anon=false/auth=false/security_invoker=on. Advisor staging: 11 cílených ERROR zmizelo (21→10). Full Staging E2E run 27510668205 = success, 121 passed, 0 failures. Produkce xkzhjldrojjlrkezorey NEDOTČENA (stále 23 ERROR). SEC01 zůstává P0 blocker — zbývá 10 ERROR (Group 2/3) na stagingu a produkce neopravena. Žádný deploy, žádná změna app kódu, žádné produkční SQL.

---

**Timestamp (Europe/Prague): 2026-06-14** — SEC01 Group 1 aplikován na PRODUKCI `xkzhjldrojjlrkezorey` (schválení Pavla, migrace `sec01_group1_safe_view_hardening`): REVOKE SELECT od anon/authenticated + `SET (security_invoker = on)` na 11 app-unused SECURITY DEFINER views. Precheck = zachycený baseline (shoda). Postcheck: 11/11 anon revoked / auth revoked / security_invoker on. Produkční advisor: ERROR 23 → 10 (všech 11 cílených views vyřešeno vč. obou Exposed Auth Users). Produkční P0 smoke run 27511158470 = success, 5 passed. Bez rollbacku. SEC01 zůstává P0 blocker — zbývá 10 ERROR (1 RLS Disabled in Public + 9 Security Definer View = Group 2/3) + WARN/INFO. Žádný deploy, žádná změna app kódu, Group 2/3 a WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-14** — Dokumentační konzistence: v `docs/launch-readiness/SECURITY_FINDINGS.md` přepnuto 13 Group 1 řádků (E01, E02, E04, E06, E07, E08, E10, E11, E12, E13, E15, E16, E21) na status `fixed (production, verified)` v souladu s ověřenou hlavičkou (advisor 23→10, smoke 27511158470). Group 2/3 řádky (E03, E05, E09, E14, E17–E20, E22, E23) nedotčeny. Pouze dokumentace — žádné SQL, deploy, app kód ani produkční data.

---

**Timestamp (Europe/Prague): 2026-06-14** — SEC01 Group 2 safe/interim aplikován a ověřen POUZE na stagingu `dxmowysntemfqfnanxua` (migrace `sec01_group2_safe_interim_hardening`): E14 valid_partner_api_keys (revoke anon/auth + security_invoker=on, cleared); E03 _messages_policies_backup (ENABLE ROW LEVEL SECURITY + revoke anon/auth, NEsmazáno, „RLS Disabled in Public" cleared); E05 contest_activity_last_24h / E09 admin_winner_delivery_stats / E23 contest_revenue (revoke anon only, authenticated ponechán pro admin UI, Security Definer View ERROR zůstává — security_invoker = owner decision). Postcheck OK. Staging advisor ERROR 10→8 (zbytek = Security Definer View). Full Staging E2E run 27511465619 = success, 122 passed, 0 failures → žádná regrese admin stránek. Produkce pro Group 2 NEDOTČENA. SEC01 zůstává P0 blocker (na produkci 10 ERROR). Žádný deploy, žádná změna app kódu, žádný DROP tabulky, Group 3 a WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-14** — SEC01 Group 2 safe/interim aplikován na PRODUKCI `xkzhjldrojjlrkezorey` (schválení Pavla, migrace `sec01_group2_safe_interim_hardening`): E14 valid_partner_api_keys (revoke anon/auth + security_invoker=on, cleared); E03 _messages_policies_backup (ENABLE ROW LEVEL SECURITY + revoke anon/auth, NEsmazáno, „RLS Disabled in Public" cleared); E05/E09/E23 admin views (revoke anon, authenticated ponechán, Security Definer View ERROR zůstává — security_invoker = owner decision). Precheck = baseline (shoda). Postcheck OK. Produkční advisor ERROR 10→8 (zbytek vše Security Definer View). Produkční P0 smoke run 27511945205 = success, 5 passed. Bez rollbacku. SEC01 zůstává P0 blocker (8 ERROR na produkci). Žádný deploy, žádná změna app kódu, žádný DROP tabulky, Group 3 a WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-14** — SEC01 E09 `admin_winner_delivery_stats` přepnuto na `security_invoker = on` POUZE na staging `dxmowysntemfqfnanxua` (migrace `sec01_e09_admin_winner_delivery_stats_security_invoker`). Bezpečné — podkladové tabulky contests (contests_admin_select_all) + winners (authenticated read) mají admin-čitelné RLS. Postcheck: security_invoker=on, výstup nezměněn (786 řádků / 297 winners). Staging advisor ERROR 8→7 (E09 zmizel). Full Staging E2E run 27512219000 = success, 122 passed, 0 failures → /admin/prize-delivery funguje. Produkce pro E09 NEDOTČENA. E05/E23 nelze přepnout na security_invoker (tickets RLS zapnuté bez policy = deny-all → vynulovalo by admin totaly); zůstávají interim. SEC01 zůstává P0 blocker (produkce 8 ERROR). Žádný deploy, žádná změna app kódu, E05/E23/Group 3/WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-14** — SEC01 E09 `admin_winner_delivery_stats` přepnuto na `security_invoker = on` na PRODUKCI `xkzhjldrojjlrkezorey` (schválení Pavla, migrace `sec01_e09_admin_winner_delivery_stats_security_invoker`). Baseline invoker off / 127 řádků / 101 winners → postcheck invoker on, output nezměněn (127/101). Produkční advisor ERROR 8→7 (E09 zmizel). Produkční P0 smoke run 27512629715 = success, 5 passed. Bez rollbacku. SEC01 zůstává P0 blocker — produkce 7 ERROR (E05 contest_activity_last_24h, E23 contest_revenue + Group 3: contest_miocoin_totals, contest_progress, partner_api_activity, v_influencer_referrals_paid, winners_with_contest). E05/E23 nelze přepnout na security_invoker (tickets RLS zapnuté bez policy = deny-all). Žádný deploy, žádná změna app kódu, E05/E23/Group 3/WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-14** — SEC01 E05/E23 vyřešeno POUZE na stagingu `dxmowysntemfqfnanxua` (migrace `sec01_e05_e23_tickets_admin_read_and_invoker`): přidána aditivní RLS policy `tickets_admin_select_all` (has_role admin/superadmin) na public.tickets, pak `security_invoker = on` na E05 contest_activity_last_24h a E23 contest_revenue. Baseline/postcheck (service-role) nezměněn: activity 7 řádků, revenue 789 řádků, tickets_sold 1153; oba views invoker on; policy přítomná. Admin policy gated rolí → žádný customer-privacy leak (zákazníci dál vidí jen vlastní tikety). Staging advisor ERROR 7→5 (E05+E23 zmizely; zbývá Group 3: contest_miocoin_totals, contest_progress, partner_api_activity, v_influencer_referrals_paid, winners_with_contest). Full Staging E2E run 27512846743 = success, 122 passed, 0 failures → /admin/contest/:id, TicketMapAdmin, AdminContestManagement OK. Produkce pro E05/E23 security_invoker NEDOTČENA (prod má jen interim anon-revoke, stále 7 ERROR). SEC01 zůstává P0 blocker. Žádný deploy, žádná změna app kódu, Group 3 a WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-15** — SEC01 E05/E23 aplikováno na PRODUKCI `xkzhjldrojjlrkezorey` (schválení Pavla, migrace `sec01_e05_e23_tickets_admin_read_and_invoker`): aditivní RLS policy `tickets_admin_select_all` (has_role admin/superadmin) na public.tickets + `security_invoker = on` na E05 contest_activity_last_24h a E23 contest_revenue. Precheck = baseline (tickets 2 own-row policy, žádná admin policy, invoker off). Postcheck: tickets_admin_select_all přítomná (tickets nyní 3 policy), oba views invoker on, výstup nezměněn (activity 0 řádků, revenue 127 řádků, tickets_sold 4000); customer own-row reads beze změny. Produkční advisor ERROR 7→5 (E05+E23 zmizely; zbývá Group 3: v_influencer_referrals_paid, partner_api_activity, contest_miocoin_totals, winners_with_contest, contest_progress). Produkční P0 smoke run 27525944645 = success, 5 passed. Bez rollbacku. SEC01 zůstává P0 blocker (5 ERROR = Group 3 + WARN/INFO). Žádný deploy, žádná změna app kódu, Group 3 a WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-15** — SEC01 Group 3 safe/interim aplikován a ověřen POUZE na stagingu `dxmowysntemfqfnanxua` (migrace `sec01_group3_safe_interim_hardening`): E19 contest_miocoin_totals + E20 winners_with_contest (unused) → revoke anon/auth + security_invoker=on (cleared); E18 partner_api_activity + E17 v_influencer_referrals_paid → revoke anon (interim, Security Definer View ERROR zůstává — full fix vyžaduje RLS redesign, owner decision); E22 contest_progress ponechán beze změny (owner-accept candidate, veřejný agregát; security_invoker by rozbil zákaznické počty tiketů). Postcheck: E19/E20 anon=f/auth=f/invoker=on, E17/E18 anon=f/auth=t, E22 beze změny. Staging advisor ERROR 5→3 (zbývá E17, E18, E22). Full Staging E2E run 27526273831 = success, 122 passed, 0 failures → Games/ContestDetail, partner dashboard, affiliate dashboard fungují. Produkce pro Group 3 NEDOTČENA (stále 5 ERROR). SEC01 zůstává P0 blocker. Žádný deploy, žádná změna app kódu, WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-15** — SEC01 Group 3 safe/interim aplikován na PRODUKCI `xkzhjldrojjlrkezorey` (schválení Pavla, migrace `sec01_group3_safe_interim_hardening`): E19 contest_miocoin_totals + E20 winners_with_contest (unused) → revoke anon/auth + security_invoker=on (cleared); E17 v_influencer_referrals_paid + E18 partner_api_activity → REVOKE anon no-op (anon už false na prod), zůstávají interim (auth ponechán, Security Definer View ERROR zůstává, full fix = RLS redesign owner decision); E22 contest_progress NEDOTČENO (owner-accept candidate). Precheck = baseline. Postcheck: E19/E20 anon=f/auth=f/invoker=on, E17/E18 anon=f/auth=t, E22 beze změny. Produkční advisor ERROR 5→3 (zbývá E17, E18, E22). Produkční P0 smoke run 27526912855 = success, 5 passed. Bez rollbacku. SEC01 zůstává P0 blocker (3 ERROR). Progrese produkčních ERROR: 23→10→8→7→5→3. Žádný deploy, žádná změna app kódu, E22/WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-15** — SEC01 E18 partner-own RLS redesign ověřen POUZE na stagingu `dxmowysntemfqfnanxua` (migrace `sec01_e18_partner_api_activity_partner_own_rls`): přidána SELECT policy `partner_api_requests_partner_own` na public.partner_api_requests (partner-own přes partners.auth_user_id = auth.uid() + admin/superadmin), poté `security_invoker = on` na partner_api_activity. Baseline: partner_api_requests RLS on, 0 policy, 8 partnerů s auth_user_id, 0 řádků. Postcheck: policy přítomná, invoker on, anon=false, authenticated=true. Staging advisor ERROR 3→2 (E18 zmizel; zbývá E22 contest_progress + E17 v_influencer_referrals_paid). Full Staging E2E run 27527383016 = success, 122 passed, 0 failures (spec 47 partner dashboard 47e/47f green) → partner vidí jen vlastní API aktivitu, admin vše. Produkce pro E18 NEDOTČENA (připraveno pro samostatné produkční schválení). SEC01 zůstává P0 blocker (produkce 3 ERROR). Žádný deploy, žádná změna app kódu, E17/E22/WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-15** — SEC01 E18 partner-own RLS redesign aplikován na PRODUKCI `xkzhjldrojjlrkezorey` (schválení Pavla, migrace `sec01_e18_partner_api_activity_partner_own_rls`): SELECT policy `partner_api_requests_partner_own` na public.partner_api_requests (partner-own přes partners.auth_user_id = auth.uid() + admin/superadmin) + `security_invoker = on` na partner_api_activity. Precheck = baseline (RLS on, 0 policy, invoker off, 5 partnerů s auth_user_id, 6 reálných řádků). Postcheck: policy přítomná, invoker on, anon=false, authenticated=true. Produkční advisor ERROR 3→2 (E18 zmizel; zbývá E17 v_influencer_referrals_paid + E22 contest_progress). Produkční P0 smoke run 27528174542 = success, 5 passed. Bez rollbacku. SEC01 zůstává P0 blocker (2 ERROR). Progrese produkčních ERROR: 23→10→8→7→5→3→2. Žádný deploy, žádná změna app kódu, E17/E22/WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-15** — SEC01 E22 `public.contest_progress` formálně owner-accepted (Pavel) jako záměrný veřejný agregát (počet prodaných/zbývajících tiketů, % naplnění); view neobsahuje osobní ani citlivá data, ponechává se SECURITY DEFINER (security_invoker=on by rozbil veřejné zobrazení — zákazník by viděl jen své tikety). Jen dokumentace: `docs/launch-readiness/SECURITY_FINDINGS.md` (E22 → accepted-risk, owner: Pavel, 15.06.2026) + `LAUNCH_TODO.md` (E22 not blocker). Žádné SQL, žádná změna advisor countu. Produkční raw advisor stále 2 ERROR, ale efektivní nevyřešený SEC01 ERROR = 1 (E17 v_influencer_referrals_paid, affiliate-scoped RLS redesign). SEC01 zůstává P0 blocker kvůli E17. Žádný deploy, žádná změna app kódu, E17/WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-15** — SEC01 E17 affiliate-scoped redesign ověřen POUZE na stagingu `dxmowysntemfqfnanxua` (migrace `sec01_e17_influencer_referrals_paid_affiliate_scoped`): (1) influencer_referrals broad `influencer_referrals_read USING(true)` nahrazeno `influencer_referrals_owner_admin` (affiliate-own přes partners.auth_user_id=auth.uid() + admin/superadmin); (2) přidány minimal-disclosure SECURITY DEFINER helpery user_completed_first_topup(uuid) + referral_user_is_valid(uuid) (anon exec=false, authenticated=true) → žádné raw platby ani auth.users se neexponují; (3) v_influencer_referrals_paid přestavěn na security_invoker=on nad influencer_referrals. Baseline paid count 0. Postcheck: invoker on, anon=false, authenticated=true, count zachován 0=0, influencer_referrals policy owner+admin, helpery anon=false/auth=true. Staging advisor E17 zmizel (ERROR 2→1; zbývá E22 contest_progress, již owner-accepted → effective unresolved 0). Full Staging E2E run 27528853194 = success, 122 passed, 0 failures (affiliate dashboard paying-users count scoped + admin influencers OK). Produkce pro E17 NEDOTČENA (připraveno pro samostatné produkční schválení). Po produkčním rolloutu E17 lze SEC01 uzavřít (E22 accepted), mimo WARN/INFO. Žádný deploy, žádná změna app kódu, E22/WARN/INFO nedotčeny.

---

**Timestamp (Europe/Prague): 2026-06-15** — ✅ SEC01 EFEKTIVNĚ VYŘEŠEN. E17 `v_influencer_referrals_paid` affiliate-scoped redesign aplikován na PRODUKCI `xkzhjldrojjlrkezorey` (schválení Pavla, migrace `sec01_e17_influencer_referrals_paid_affiliate_scoped`): influencer_referrals owner+admin RLS (broad USING(true) odstraněn), minimal-disclosure SECURITY DEFINER helpery user_completed_first_topup(uuid) + referral_user_is_valid(uuid) (anon exec=false, auth=true), v_influencer_referrals_paid přestavěn na security_invoker=on nad base tabulkou. Precheck=baseline. Postcheck: count zachován (0=0), invoker on, anon=false, auth=true, influencer_referrals policy owner+admin, helpery anon=false/auth=true. Produkční advisor ERROR 2→1 (E17 zmizel; jediný zbývající raw ERROR E22 contest_progress je formálně owner-accepted). Produkční P0 smoke run 27529591097 = success, 5 passed. Bez rollbacku. Affiliate vidí jen své, admin vše, běžný uživatel/anon nic, žádná raw payment data ani auth.users. SEC01 už NENÍ launch blocker — všechny ERROR fixnuty nebo accepted. Progrese produkčních ERROR: 23→10→8→7→5→3→2→1(accepted). Zbývá jen WARN/INFO backlog (non-blocking). Žádný deploy, žádná změna app kódu.

---

**Timestamp (Europe/Prague): 2026-06-15** — Launch L02 překlasifikován (jen dokumentace). Re-audit potvrdil, že závazná pravidla soutěže jsou per-soutěžní: public.contests.rules + public.contests.rules_pdf_url; admin nahrává PDF ke konkrétní soutěži do bucketu contest-rules; ContestDetail.tsx zobrazuje pravidla z dané soutěže; žádná PDF šablona → žádné placeholdery v generování. /pravidla-souteze je jen obecná CMS stránka (content_pages slug pravidla-souteze), ne závazný právní zdroj konkrétní soutěže. V docs/launch-readiness/LAUNCH_TODO.md byl L02 rozdělen: L02a (P1, downgrade z P0 — obecná CMS stránka /pravidla-souteze stále obsahuje placeholdery → content cleanup/owner-legal, NENÍ blocker per-soutěžních pravidel) a L02b (P0 — per-contest QA: každá aktivní soutěž musí mít před spuštěním vlastní zkontrolovaný rules_pdf_url bez placeholderů). Produkční check: 127 soutěží, 34 s rules PDF, 0 rules textů s placeholdery, 0 aktivních soutěží → per-contest pravidla teď nic živého neblokují. Žádný kód, SQL, deploy ani právní text nezměněn.

## 2026-06-15 — L09 kontaktní e-maily v CMS sjednoceny (schválení Pavla)

Kanonický support e-mail = `podpora@onemil.cz`. Produkční CMS `content_pages`: `info@onemil.cz` → `podpora@onemil.cz` (jen e-mail substring) ve 3 aktivních legal stránkách: `ochrana-osobnich-udaju`, `cookies`, `autorska-prava` (3. nalezena při precheck). Postcheck: 0× `info@`, 0× `support@`, 5 stránek s `podpora@`. App kód už čistý. Žádný deploy/kód/migrace — jen UPDATE 3 řádků. L09 → prošlo.

---

## 2026-06-15 — L04 cookies policy clean audit z aktuálního origin/main (read-only)

L04 cookies audit byl zopakován z čistého detached checkoutu aktuálního `origin/main` na commitu `2eb29291166bea4685d8f11184e999766403fb06`; worktree byl čistý. Tento audit nahrazuje předchozí L04 audit z větve `codex/affiliate-payouts-audit`. Produkční CMS `content_pages` `/legal/cookies` (`section=legal`, `slug=cookies`) je aktivní, `content_length=2328`, obsahuje `podpora@onemil.cz`; L09 e-mail mismatch je vyřešený i pro cookies (`info@onemil.cz` 0×, `support@onemil.cz` 0× v aktivním CMS, `podpora@onemil.cz` 5×). L04 zůstává P0 blocker, protože Pavel/legal musí potvrdit aktualizovaný cookies text proti reálným nástrojům: Supabase Auth `localStorage.onemil-auth`, `localStorage.cookie_consent`, `public.cookie_consents`, GA4, GTM, Meta Pixel, Meta noscript fallback, OneSignal SDK/worker/cache/IndexedDB/`user_devices`, Stripe checkout redirect a aplikační `localStorage`/`sessionStorage` klíče. Samostatný technický follow-up: prověřit Meta noscript fallback. Žádný kód, SQL, deploy ani CMS content změněn.

---

## 2026-06-15 — L04 technický follow-up: Meta noscript fallback odstraněn

Se schválením Pavla odstraněn z `index.html` pouze Meta Pixel `<noscript>` tracking image fallback (`https://www.facebook.com/tr?id=1412172897183369&ev=PageView&noscript=1`). Důvod: při vypnutém JavaScriptu neběží React cookie banner ani `consent.ts`, ale noscript image mohl odeslat Meta PageView před souhlasem. `consent.ts` nezměněn: Meta `fbq('init')` + `PageView` zůstává jen při `marketing=true`; GTM/GA4 nezměněny. Ověření: v `index.html` nezůstává Meta noscript image, `consent.ts` gate zachována, `npm run build` prošel. Žádný SQL, deploy ani CMS content změněn. L04 technický follow-up vyřešen; L04 zůstává P0 do owner/legal potvrzení finálního cookies textu.

---

## 2026-06-15 — L03 privacy/GDPR routy technicky sjednoceny na /gdpr

Owner decision Pavel: kanonická privacy/GDPR stránka je `/gdpr`, protože je CMS editovatelná přes `/admin/content` a registrace ukládá `document_slug='gdpr'`. Implementace změnila pouze routy/odkazy: `/gdpr` zůstává CMS přes `SlugContentPage slug="gdpr"`, `/privacy` a `/legal/ochrana-osobnich-udaju` jsou kompatibilní redirecty na `/gdpr`; footer ukazuje jen jeden privacy/GDPR odkaz; registrace, cookie banner a související odkazy míří na `/gdpr`. Právní text, CMS `content_pages`, SQL, cookies logika/`consent.ts` a deploy beze změny. L03 zůstává P0 pouze do owner/legal potvrzení finálního právního obsahu `/gdpr`.

---

## 2026-06-15 — L01 VOP routy technicky sjednoceny na /vop

Owner decision Pavel: kanonická stránka obchodních podmínek je `/vop`, protože je owner-managed CMS editovatelná přes `/admin/content` a Pavel si VOP text spravuje sám. Implementace změnila pouze routy/odkazy: `/vop` zůstává CMS přes `SlugContentPage slug="vop"`, `/terms` je kompatibilní redirect na `/vop`; registrace míří na `/vop`; footer už vedl na `/vop`. Právní text, CMS `content_pages`, SQL a deploy beze změny. L01 zůstává P0 pouze do owner/legal potvrzení finálního právního obsahu `/vop`.

---

## 2026-06-15 — L04 cookie banner link opraven na /legal/cookies

Owner decision Pavel: kanonická cookies stránka je `/legal/cookies`, owner-managed CMS obsah přes `/admin/content` (`content_pages section=legal slug=cookies`). Technický mismatch v cookie banneru opraven: odkazy v `CookieConsentBanner.tsx` nyní míří na `/legal/cookies`. Právní text a CMS beze změny. Meta `<noscript>` tracking image fallback zůstává pryč z `index.html`; `consent.ts` beze změny, Meta init/PageView stále jen při `marketing=true`. Žádný SQL ani deploy. L04 zůstává P0 pouze do owner/legal potvrzení finálního cookies textu `/legal/cookies`.
## 2026-06-16 — PWA install CTA připraveno na větvi `feature/pwa-install-ui`

Vytvořen plán `docs/launch-readiness/PWA_INSTALL_IMPLEMENTATION_PLAN.md` před kódem. Implementační commit `a030ad512f2b01fa81ec84de110e92dabdbf9ddd` přidal `src/hooks/usePwaInstallPrompt.ts`, `src/components/InstallAppButton.tsx` a napojení do `src/pages/Homepage.tsx`. Build `npm run build` prošel. Runtime ověřeno simulací: desktop bez promptu CTA hidden, Android `beforeinstallprompt` → CTA + `prompt()`, accepted → hidden, iPhone Safari UA → instruction modal, standalone mode → hidden. Nedotčeno: `public/manifest.webmanifest`, public ikony, `public/OneSignalSDKWorker.js`, Supabase, Stripe, payments, wallet, contests, tickets, winners, Partner Offers, affiliate, Bob, routes a legal pages. Zbývá ruční ověření na reálném Android Chrome a iPhone Safari/home-screen režimu. Nemergovat do `main` bez Pavlova potvrzení manual phone testingu.

---

## 2026-06-23 — Phase 2 granulární subadmin oprávnění: targeted staging E2E prošel, staging-validated

Targeted Phase 2 staging E2E **prošel**: GitHub Actions run `28043183824`, workflow `playwright-staging.yml`, spec `tests/e2e/phase2-admin-permissions.spec.ts`, conclusion **success**, headSha `d92c5ca2` (ověřeno přes `gh run view`). Související commity: `6330a060` (staging DB foundation `admin_permissions` + `has_admin_permission()`), `6d04d82b` (frontend permission gating — `useAdminPermissions()`, `RequirePermission`, route/nav gating pro vouchers/content/banners/notifications, grant/revoke UI v `/admin/admins`), `d92c5ca2` (targeted Phase 2 staging E2E spec). Phase 2 je nyní **staging-validated** na stagingu `dxmowysntemfqfnanxua`. **Produkční DB apply `admin_permissions` NENÍ schválen — produkce `xkzhjldrojjlrkezorey` nedotčena.** Další krok: připravit produkční apply migrace `admin_permissions` POUZE po výslovném schválení Pavla + kontrole zálohy (manuální `pg_dump`, PITR off); frontend Phase 2 nepublikovat na produkci PŘED aplikací migrace. Dokumentace-only změna; žádný kód, SQL, deploy ani produkční zásah.

---

## 2026-06-23 — Phase 2 produkční apply package připraven (NEAPLIKOVÁNO)

Připraven bezpečný produkční apply package pro aditivní `admin_permissions` DB foundation (jen Phase 2 foundation). **Nic neaplikováno na produkci `xkzhjldrojjlrkezorey`; žádný produkční SQL nespuštěn; žádný EF deploy; žádný frontend publish; žádné secrets v commitu; `backups/` nedotčeno.** Vytvořeny 4 soubory v `docs/rollback/`: `phase2_admin_permissions_production_plan.md` (plán + pre-apply checklist + deploy-order), `phase2_admin_permissions_apply.sql` (transakční, idempotentní, pre-apply guard na `is_superadmin()`; vytvoří tabulku `public.admin_permissions` s UNIQUE(user_id,permission_key) + index + RLS, helper `public.has_admin_permission(text, uuid default auth.uid())` SECURITY DEFINER s execute jen authenticated, policy `admin_permissions_select` + `admin_permissions_superadmin_write`), `phase2_admin_permissions_rollback.sql` (dropuje JEN Phase 2 objekty — policies → helper → table; **netýká se** `is_superadmin()`, `user_roles`, Phase 1), `phase2_admin_permissions_verification.sql` (10 read-only checků se STRING_AGG folded výstupy). Povolené klíče: `vouchers.manage`, `content.manage`, `banners.manage`, `notifications.manage`; žádná citlivá oblast. Package mirroruje staging migraci `supabase/migrations/20260623_admin_permissions.sql` validovanou run `28043183824`. ⛔ Produkční apply NENÍ schválen — vyžaduje výslovné schválení Pavla + manuální `pg_dump` (PITR off); frontend Phase 2 nepublikovat před DB apply.

---

## 2026-06-23 — Phase 2 `admin_permissions` APLIKOVÁN NA PRODUKCI (schválení Pavla)

Pavel výslovně schválil („SCHVALUJI PHASE 2 PRODUKČNÍ APPLY"). Aditivní `admin_permissions` DB foundation aplikován na produkci `xkzhjldrojjlrkezorey`. **Žádný frontend publish, žádný Edge Function deploy, žádný `db push`, žádná jiná produkční změna; `backups/` necommitováno.**

Pre-apply backup: `backups/onemil-production-pre-phase2-admin-permissions-20260623-195824.dump` (465 655 142 B, `pg_restore -l` OK, 2197 TOC entries). Precheck před apply: `is_superadmin` existuje, `admin_permissions`/`has_admin_permission` neexistovaly, `user_roles` baseline 565 (admin:1, superadmin:1, user:563), Phase 1 objekty přítomny.

Apply: `docs/rollback/phase2_admin_permissions_apply.sql` přes psql (BEGIN…COMMIT, exit 0; NOTICE u `DROP POLICY IF EXISTS` očekávané). Vytvořeno: `public.admin_permissions` (RLS on, UNIQUE(user_id,permission_key), index `idx_admin_permissions_user_id`), helper `public.has_admin_permission(text, uuid default auth.uid())` (SECURITY DEFINER, owner postgres), policy `admin_permissions_select` (own/superadmin SELECT) + `admin_permissions_superadmin_write` (superadmin ALL).

Verifikace `docs/rollback/phase2_admin_permissions_verification.sql` — všech 10 checků ✅: dependency is_superadmin t; table exists+RLS t/t; sloupce OK; UNIQUE+index OK; obě policy OK; helper SECURITY DEFINER owner postgres; helper EXECUTE = authenticated+postgres+service_role (anon/PUBLIC NEMAJÍ, `anon_can_execute=f`); 0 řádků / 0 unexpected keys; `user_roles=565` beze změny. Post-apply potvrzeno: Phase 1 funkce (is_superadmin, is_admin, has_role, get_admin_subadmins_overview) i superadmin-only policy (apd_admin_all, apbi_admin_all, apb_admin_all, aff_commissions_admin_write, aff_commissions_select, admin_payments_read_all) beze změny. **Rollback nebyl potřeba.**

Connection string použit jen in-memory pro pg_dump + psql, neuložen, necommitnut. **Po dokončení rolloutu resetovat produkční DB heslo** (objevilo se v chatu). Další krok: samostatně publikovat Phase 2 frontend (DB ready), poté grantovat subadminům konkrétní klíče v `/admin/admins`.

---

## 2026-06-23 — Phase 2 oprava: subadmin už nevidí Dashboard / Statistiky / platform metriky (frontend-only)

Po grantu safe oprávnění subadmin stále viděl Dashboard pill, Statistiky aplikace a agregátní platform karty (počty uživatelů, aktivní soutěže, bonusy, vouchery). Příčina: „Dashboard" sekční pill (→ `/admin/statistics`) se zobrazoval non-superadminovi a `/admin` (AdminDashboard) i `/admin/statistics` (AdminStatistics) nebyly permission-gated. **Frontend-only oprava; žádná DB/RLS/EF/produkční změna, žádné SQL, žádný deploy.**

Změny: (1) `src/hooks/useAdminPermissions.ts` — přidán `SUBADMIN_ENTRY_ROUTES` (ordered safe entry routes: vouchers → content → banners → notifications). (2) `src/components/admin/RequireSuperadminOrRedirect.tsx` (nový) — superadmin render beze změny; non-superadmin redirect na první držený safe route, bez oprávnění text „Nemáte přiřazené žádné oprávnění administrace."; wrapuje `/admin` a `/admin/statistics` v `src/App.tsx`. (3) `src/components/admin/AdminPrimaryNav.tsx` — non-superadmin row 1 přepsán z sekčních pills na přímé safe odkazy jen na držené klíče (Vouchery/Obsah stránek/Bannery/Notifikace, ikony Gift/BookOpen/Image/Bell), aktivní stav dle path matchů; superadmin sekční nav beze změny. AdminLayout dál redirectuje ne-adminy na `/`.

Subadmin po fixu: row 1 jen grantnuté safe oblasti, žádný Dashboard; přímý vstup na `/admin` nebo `/admin/statistics` → redirect na první grantnutou oblast (nebo no-permission hláška). Superadmin: Dashboard + Statistiky + plná nav beze změny. `npm run build` ✅ exit 0, `npx tsc --noEmit` ✅ 0 chyb. Vyžaduje Lovable Publish, aby se projevilo na produkci.

---

## 2026-06-23 — Phase 2 produkční frontend smoke ✅ PASS

Phase 2 frontend publikován na produkci (Lovable Publish) a ručně ověřen — **smoke PASS**. DB apply `admin_permissions` byl dokončen a ověřen dříve; tím jsou granulární subadmin oprávnění LIVE end-to-end. **Dokumentace-only zápis; žádné SQL, žádný deploy, žádná změna app kódu, žádná produkční data, `backups/` necommitováno.**

Ověřeno ručně na produkci: superadmin vidí Phase 2 permission checkboxy v `/admin/admins`; subadmin se všemi 4 safe oprávněními vidí JEN Vouchery / Obsah stránek / Bannery / Notifikace; subadmin už NEvidí Dashboard ani Statistiky aplikace; přímý `/admin` redirectuje subadmina na `/admin/vouchers`; `/admin/statistics` je subadminovi nepřístupné; contest internals, finance, users/admin management, winners a audit/system zůstávají skryté.

Otevřený follow-up: **produkční DB heslo (objevilo se v chatu) ZATÍM NEresetovat** — Pavel ho resetuje až po dokončení veškerých zbývajících rollout prací.

---

## 2026-06-23 — Phase 3 route-level hardening citlivých admin rout (frontend-only)

Před přidáním support oprávnění uzavřena díra přímého URL přístupu: non-superadmin admin (subadmin) se nedostane na citlivé admin routy ani přes přímý odkaz (dříve Phase 2 jen skrývala nav, ale routy chránil pouze `AdminLayout` is_admin). **Frontend-only; žádné DB/RLS/SQL/EF/produkční změny; support oprávnění zatím NEPŘIDÁNA.**

Změny: (1) `src/components/admin/RequireSuperadmin.tsx` (nový) — superadmin render beze změny; non-superadmin → „Tato část je dostupná pouze superadminovi." (page body se nenamountuje); čeká na role resolution. (2) `src/App.tsx` — wrapnuto `RequireSuperadmin` na: `/admin/users`, `/admin/admins`, `/admin/payments`, `/admin/winners`, `/admin/prize-delivery`, `/admin/tests`, `/admin/partners`, `/admin/partner-offers`, `/admin/messages`, `/admin/messages/:userId`, `/admin/audit-logs`, `/admin/event-queue`, `/admin/audit-repair`, `/admin/onemil-audit`, `/admin/contest/:contestId`, `/admin/legal-acceptances`, `/admin/onboarding-incomplete`, `/admin/partners-portal`, `/admin/invoices`, `/admin/referrals`, `/admin/referral-dashboard`, `/admin/influencers`, `/admin/affiliate-accounts`, `/admin/influencer-commissions`, `/admin/influencer-campaigns`, `/admin/company-leads`, `/admin/affiliate-commissions`, `/admin/affiliate-payouts`, `/admin/affiliate-payouts/:batchId`.

Beze změny: `/admin` + `/admin/statistics` (`RequireSuperadminOrRedirect`, efektivně superadmin-only); Phase 2 safe routy `/admin/vouchers`, `/admin/content`, `/admin/banners`, `/admin/notifications` (`RequirePermission`); `/admin/*` 404. Superadmin chování beze změny.

Pozn.: `/admin/messages` a `/admin/users` jsou pro teď superadmin-only; Phase 3b je přepne na `support.messages` / `users.view.basic` (swap `RequireSuperadmin` → `RequirePermission`). Ochrana dat zůstává per-table superadmin RLS (Phase 1) — toto je UI/route vrstva defense-in-depth. `npm run build` ✅ exit 0, `npx tsc --noEmit` ✅ 0 chyb. Vyžaduje Lovable Publish, aby se projevilo na produkci.

---

## 2026-06-23 — Phase 3b support oprávnění (frontend-only)

Přidána dvě safe support oprávnění pro subadminy, aby mohli bezpečně pomáhat uživatelům. **Frontend-only; žádné DB/RLS/SQL/EF/produkční změny.** Grant = vložení řádku do `admin_permissions` (klíče jsou volný text, bez migrace).

Změny: (1) `src/hooks/useAdminPermissions.ts` — přidány klíče `support.messages` (label „Zprávy (podpora)") a `users.view.basic` (label „Uživatelé (základní)") do `ADMIN_PERMISSION_KEYS`/`ADMIN_PERMISSION_LABELS`; mapy `ADMIN_ROUTE_PERMISSION` (`/admin/messages`→support.messages, `/admin/users`→users.view.basic) a `SUBADMIN_ENTRY_ROUTES` (nav labels „Zprávy"/„Uživatelé"). (2) `src/App.tsx` — `/admin/messages` + `/admin/messages/:userId` přepnuty z `RequireSuperadmin` na `RequirePermission("support.messages")`; `/admin/users` na `RequirePermission("users.view.basic")`. (3) `src/components/admin/AdminPrimaryNav.tsx` — ikony MessageSquare/Users pro nové klíče (non-superadmin tak vidí „Zprávy" jen s support.messages, „Uživatelé" jen s users.view.basic). (4) `src/pages/AdminMessages.tsx` — globální Bob ON/OFF toggle zabalen do `isSuperAdmin` (support subadmin ho nevidí; reply/ukončit/označit přečtené fungují dál přes RLS `is_admin`). (5) `src/pages/AdminUsers.tsx` — pro non-superadmina `profiles` SELECT zúžen na `id, full_name, first_name, last_name, phone, updated_at` (žádné `date_of_birth/street/city/zip/country/avatar` neopustí server); role-change UI zůstává superadmin-only.

Support smí: číst support konverzace, odpovídat, označit přečtené, ukončit chat, vidět základní seznam uživatelů. Support NESMÍ: přepínat Boba, měnit role, vidět DOB/adresu/citlivá finanční data, ani contest internals/tikety/progress/platby/faktury/výherce/audit (chrání Phase 3 route guardy + Phase 1 superadmin RLS). Superadmin chování beze změny. `npm run build` ✅ exit 0, `npx tsc --noEmit` ✅ 0 chyb. Vyžaduje Lovable Publish + grant klíčů subadminům v `/admin/admins`.

---

## 2026-06-23 — Phase 3b produkční smoke ✅ PASS

Phase 3b support oprávnění publikována na produkci (Lovable Publish) a ručně ověřena — **smoke PASS**. Granulární support role je tím LIVE end-to-end (Phase 2 DB foundation + Phase 3 route hardening + Phase 3b support klíče). **Dokumentace-only zápis; žádné SQL, žádný deploy, žádná změna app kódu, žádná produkční data, `backups/` necommitováno.**

Ověřeno ručně na produkci: superadmin vidí v `/admin/admins` nové checkboxy `support.messages` + `users.view.basic`; subadmin se `support.messages` vidí jen „Zprávy", NEvidí Bob ON/OFF a může používat support zprávy; subadmin s `users.view.basic` vidí „Uživatelé", NEvidí adresu ani datum narození a NEmůže měnit role; přímé citlivé URL (`/admin/payments`, `/admin/winners`, `/admin/statistics` a další) jsou blokovány superadmin-only fallbackem („Tato část je dostupná pouze superadminovi."); superadmin chování beze změny.

**Finální akce (poslední otevřený rollout follow-up): resetovat produkční DB heslo** `xkzhjldrojjlrkezorey` — objevilo se v chatu během Phase 2 produkčního apply. Reset proběhne hned po tomto dokumentačním zápisu (Supabase Dashboard → Settings → Database → Reset database password).

---

## 2026-06-23 — Phase 4 Slice A: Partner Offers oprávnění (frontend-only)

## 2026-07-10 — Obchod / Leady: odpovědi a řízené výjimky duplicit připraveny v PR

Připravena samostatná neaplikovaná migrace s rozšiřitelným seznamem veřejných e-mailových domén, auditovanými výjimkami duplicit, RPC kontrolou pro vytvoření/editaci a service-role-only ochranou každého odeslání. Přesná adresa se kontroluje vždy; shoda domény jen mimo veřejné služby. Přidána odpověď z detailu na konkrétní `reply_received`, serverové ověření JWT + `sales_leads.manage`, suppression, `do_not_contact`, cílové aktivity a duplicit. UI zobrazuje červené upozornění, původní lead, první oslovení a povinný důvod. Stavové hodnoty se nemění, pouze české popisky. Migrace nebyla aplikována, Edge Function nebyla nasazena, žádný e-mail nebyl odeslán a produkce/staging zůstaly nedotčeny.

Nejmenší safe krok delegace Partner Offers: nový klíč `partner_offers.finance.manage` pro jedinou offer-only stránku `/admin/partner-offers`. **Frontend-only; žádné DB/RLS/SQL/EF/produkční změny; faktury, partner portál, platby, payouty, provize, výherci, soutěže, tikety, audit ani admin role logika netknuty.** Grant = řádek v `admin_permissions` (volný textový klíč, bez migrace).

Změny: (1) `src/hooks/useAdminPermissions.ts` — `partner_offers.finance.manage` (label „Partnerské nabídky (finance)") do `ADMIN_PERMISSION_KEYS`/`ADMIN_PERMISSION_LABELS`; `ADMIN_ROUTE_PERMISSION['/admin/partner-offers']`; položka v `SUBADMIN_ENTRY_ROUTES` (nav label „Partnerské nabídky"). (2) `src/App.tsx` — `/admin/partner-offers` přepnuto z `RequireSuperadmin` na `RequirePermission("partner_offers.finance.manage")` (jediná změněná routa). (3) `src/components/admin/AdminPrimaryNav.tsx` — ikona `Tag` pro nový klíč. Grant UI v `/admin/admins` se zobrazí automaticky (iteruje `ADMIN_PERMISSION_KEYS`). `AdminPartnerOffers` business logika beze změny.

Rozsah role: jen `/admin/partner-offers` (moderace nabídek + per-offer billing `billing_mode`/`price_per_activation`/`billing_admin_override` + aktivace/kliky — čistě offer tabulky). Superadmin-only zůstává (Slice B/C, mimo tento krok): offer faktury (`partner_invoices type='offer'`, `partner_offer_invoice_lines`) ve smíšených `/admin/invoices` + `/admin/partners-portal`, globální platby, affiliate/influencer commissions+payouts, výherci, prize-delivery, contest internals, audit/system, `/admin/admins`. Superadmin chování beze změny. `npm run build` ✅ exit 0, `npx tsc --noEmit` ✅ 0 chyb. Vyžaduje Lovable Publish + grant klíče subadminovi v `/admin/admins`.
