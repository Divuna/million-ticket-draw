# OneMil — Paperclip setup context

**Status:** hlavní zdroj pravdy pro Paperclip / AI zaměstnance OneMil  
**Aktualizováno:** 2026-08-11  
**Firma:** iCONIC POINT s.r.o.  
**Projekt:** OneMil  
**Vlastník / konečné rozhodnutí:** Pavel Diviš

Tento soubor je autoritativní kontext pro nastavení a provoz Paperclipu v OneMil. Starší údaje o Paperclipu v jiných dokumentech, které mu odporují, se považují za překonané a musí se před použitím ověřit proti skutečnému Paperclipu.

## 1. Co načíst před prací s Paperclipem

Při každé práci s Paperclipem načti podle potřeby minimálně:

- `PAPERCLIP_SETUP_CONTEXT.md` — tento soubor, Paperclip a AI tým
- `ONEMIL_BUSINESS_CONTEXT.md` — obchodní model a produkt OneMil
- `COMPANY_CONTEXT.md` — identita firmy a kontakty
- `CLAUDE.md` — pracovní a bezpečnostní pravidla
- `onemil_state.md` — aktuální technický/provozní stav
- `onemil_history.md` pouze když je potřeba historie

Nevymýšlej stav Paperclipu. Pokud je dostupný lokální Paperclip/API/bridge, skutečný stav nejdřív ověř.

## 2. Úloha Paperclipu v OneMil

Paperclip je řídicí vrstva AI firmy OneMil. Cílový model je:

**Pavel Diviš → Provozní ředitel OneMil → specializovaní AI zaměstnanci.**

Pavel zůstává konečný rozhodovatel. Provozní ředitel koordinuje práci, rozděluje úkoly správným specialistům, kontroluje výsledky a eskaluje rozhodnutí, která vyžadují Pavlovo schválení.

Specializovaní agenti nemají dělat práci mimo svou roli jen proto, že ji technicky zvládnou.

## 3. Aktuální hlavní OneMil agenti

### Provozní ředitel OneMil

- Role: hlavní AI manažer OneMil a delegační uzel
- Reports to: Pavel Diviš
- Adapter: `codex_local`
- Model: `gpt-5.5`
- Heartbeat enabled: `true`
- Má řídit ostatní OneMil agenty, ne nahrazovat jejich specializovanou práci.
- Nové agenty smí navrhovat; jejich vytvoření/aktivace podléhá schválení Pavla.

### Magin — CRM operátor OneMil

- Agent id: `3ef09c71-d9a0-43f3-8ce8-c5e9938dae64`
- Adapter: `codex_local`
- Model: `gpt-5.5`
- Search: OFF
- Heartbeat enabled: `true`
- Reports to: Provozní ředitel OneMil
- `canCreateAgents=false`, `canCreateSkills=false`
- Úloha: spustit serverem řízenou denní dávku prvních obchodních e-mailů. Magin sám nevybírá leady, nepíše text e-mailu, nevolá Resend a nepíše přímo do databáze.

Routine `Denní dávka prvních obchodních e-mailů`:

- id `a3ac40b2-7d58-4207-9c5d-1ffc52ee8c8c`
- status `active`
- projectId `b9aafaa8-fbf3-4c65-ae28-b11eafd12b3a` (OneMil)
- cron `30 7 * * 1-5`
- timezone `Europe/Prague`
- `catchUpPolicy=skip_missed`
- `concurrencyPolicy=skip_if_active`
- první ostrý plán: 12. 8. 2026 07:30 Praha, 40 e-mailů

Secret:

- `SALES_LEAD_BATCH_AGENT_SECRET`
- uložen v Paperclip credential store
- Magin má v UI **Secret access → API access → Bound to latest** pouze pro tento secret
- secret nikdy nepatří do promptu, issue, dokumentace, gitu ani logu
- **API Access binding je funkční** (`access.SALES_LEAD_BATCH_AGENT_SECRET`, cíl = Maginovo agent id)

**Instrukce rutiny srovnány s ověřeným vzorem Synchronizátora (11. 8. 2026):**

- **HTTP klient: výhradně Node fetch**, nikdy PowerShell `Invoke-WebRequest` ani `curl.exe`.
- **Přesný kontrakt** Edge Function `sales-lead-daily-batch-agent` — pouze tři klíče, jakýkoli
  další vrací `400 unexpected_field`:
  `{"schema_version":1,"target_date":"YYYY-MM-DD","requested_count":<počet>}`
- Hlavičky `Authorization: Bearer <secret>` + `Content-Type: application/json`.
- `target_date` je **pražské** datum, ne UTC ani čas Windows. Skupinu, šablonu i výběr leadů určuje
  server; agent je neposílá.
- `action: created_and_activated` i `already_exists` jsou **obojí úspěch** a neopakují se.
- Při chybě nahlásit Provoznímu řediteli a skončit — žádný retry, žádná druhá dávka pro stejný den,
  žádná aktivace staré pozastavené dávky.

**Magin je připravený na první ostrý běh 12. 8. 2026 v 7:30 Europe/Prague**
(`nextRunAt = 2026-08-12T05:30:00Z`, počet 40). Na rozdíl od Synchronizátora **nebyl ověřen
skutečným během** — každé úspěšné volání zakládá reálnou dávku, takže nanečisto to nejde.
Instrukce stojí na ověřeném vzoru; první důkaz přinese až ten ostrý běh.

### Průzkumník obchodních leadů OneMil

- Adapter: `codex_local`
- Model: `gpt-5.5`
- Heartbeat enabled: `true`
- Reports to: Provozní ředitel OneMil
- Úloha (**změna 11. 8. 2026**): je **operátorem existujícího OneMil discovery systému**, ne
  paralelní samostatný vyhledávač leadů. Pracuje se stávajícím discovery workflow OneMilu
  (fronta discovery jobů, ověřování webu, ukládání do Návrhů) a jeho výstupy jsou leady v OneMilu,
  ne vlastní seznamy stranou.
- **Nesmí budovat druhou lead databázi** ani vlastní paralelní vyhledávání mimo OneMil systém.
- Nesmí sám kontaktovat firmy ani odesílat e-maily bez příslušného schváleného workflow.

### Synchronizátor Paperclip OneMil

- Agent id `a4609906-2a83-4d61-b66a-652cdcecc8b1`
- Adapter: `codex_local`
- Model: `gpt-5.5`
- Heartbeat enabled: `true`
- Reports to: Provozní ředitel OneMil
- Úloha: read-only snapshot stavu Paperclipu → OneMil STAGING bridge.

Routine `Synchronizace stavu Paperclipu do OneMil STAGING`:

- id `52328b78-f0cc-4afe-9429-2548b10c927e`
- status `active`
- projectId `b9aafaa8-fbf3-4c65-ae28-b11eafd12b3a` (OneMil)
- cron `*/15 * * * *`
- timezone `Europe/Prague`
- `catchUpPolicy=skip_missed`
- `concurrencyPolicy=skip_if_active`

Secret:

- `PAPERCLIP_BRIDGE_SECRET`
- uložen v Paperclip credential store
- Synchronizátor má v UI **Secret access → API access → Bound to latest** pouze pro tento secret
- žádný jiný OneMil agent ho nemá dostat bez výslovného důvodu

Bridge je pouze read-only přehled do STAGING. Produkční data nesmí synchronizátor měnit.

**Stav: funkční end-to-end (ověřeno 11. 8. 2026).** Poslední ověřený staging snapshot
`7be66d9c-e984-42d3-9d1e-1e5e4001260a` (`captured_at 17:26:45`, 43 kB, klíče
`agents, issues, routines, runs, errors`). Úkol `ICO-41` skončil jako `done`, ingest vrátil
**HTTP 200**. API Access na `PAPERCLIP_BRIDGE_SECRET` prokazatelně funguje — v access-events je
úspěšné načtení přes run-bound agent JWT.

Dvě věci v instrukci rutiny, bez kterých to nefunguje (nevracet zpět):

- **HTTP klient: výhradně Node fetch.** Ve Windows sandboxu selhává PowerShell `Invoke-WebRequest`
  („Nadřízené připojení bylo uzavřeno") i `curl.exe` (vrací `000`), přestože síť funguje.
  Ověřeno protikladem: `node -e "fetch(...)"` na tentýž endpoint odpoví korektně.
- **Payload v `snake_case`.** Edge Function vyžaduje přesně `source_instance`, **`captured_at`**
  a `payload`; `capturedAt` v camelCase vrací `HTTP 400`. Tělo drží pod 1 MB — posílají se jen
  id/název/stav, ne celé objekty ani logy.

## 4. Vestavění pomocní agenti Paperclipu

`Reflection Coach` a `Summarizer` nejsou hlavní OneMil provozní agenti. Jejich automatické používání se zapíná jen tehdy, když pro ně existuje konkrétní schválený účel.

Reflection Coach je podle Paperclipu určen ke kontrolovaným návrhům zlepšení instrukcí/skillů agentů; změny nemá aplikovat bez review. Nepovažovat ho za náhradu Provozního ředitele.

## 5. Heartbeat a rutiny — závazný provozní model

Paperclip agenti neběží nepřetržitě. Pracují v krátkých bězích (heartbeats).

Oficiální Paperclip model rozlišuje:

- přiřazení úkolu → probudí agenta
- komentář / mention → může probudit agenta
- ruční `Run Heartbeat` → probudí agenta
- rutina → vytvoří/přiřadí práci a probudí agenta
- intervalový heartbeat → pravidelně budí agenta i bez nové práce

**Důležité:** pro plánovanou práci používej primárně rutiny. Intervalový heartbeat nepoužívej jako náhradu rutiny, pokud agent nemusí něco skutečně pollovat.

Aktuálně je `heartbeat.enabled=true` u čtyř hlavních OneMil agentů. Před případnou optimalizací spotřeby ověř, zda jde o intervalové buzení nebo jen povolení běhu/wake-on-demand v konkrétní verzi Paperclipu. Nevypínej agenta (`Pause`) jen kvůli omezení zbytečných intervalových běhů — Pause blokuje i legitimní probuzení úkolem/rutinou.

## 6. Kritické pravidlo rutin: vždy projekt OneMil

Aktivní OneMil rutina, která má běžet v izolovaném git worktree, musí mít:

`projectId = b9aafaa8-fbf3-4c65-ae28-b11eafd12b3a`

Bez projektu Paperclip vytvoří issue, ale execution workspace policy ho před skutečným během může převést na `blocked` (`workspace_worktree_requires_project`).

Tato chyba už byla nalezena u Magina i Synchronizátora a `projectId` byl 11. 8. 2026 doplněn do obou rutin.

Staré testovací issues ICO-26 až ICO-32 vznikly bez projectId a mohou zůstat `blocked`; nejsou zdrojem pravdy pro nové běhy.

## 7. Codex local na Windows — aktuální ověřené nastavení

OneMil `codex_local` agenti používají model:

`gpt-5.5`

Starší hodnoty `gpt-5.3-codex` a `gpt-5.6-sol` jsou pro tento ChatGPT/Codex účet v tomto prostředí neplatné a nesmí se vracet bez nového ověření.

Osobní Codex config:

- `model = "gpt-5.5"`
- `service_tier = "fast"`
- `sandbox_mode = "workspace-write"`
- `[sandbox_workspace_write] network_access = true`

Paperclip používá vlastní per-company `CODEX_HOME`, nikoli automaticky osobní `~/.codex/config.toml`.

V Paperclip per-company `codex-home/config.toml` bylo 11. 8. 2026 ověřeně nastaveno:

- `model = "gpt-5.5"`
- `sandbox_mode = "workspace-write"`
- `[sandbox_workspace_write] network_access = true`
- `[windows] sandbox = "unelevated"`

Důvod `unelevated`: `elevated` na tomto Windows končil `CreateProcessWithLogonW failed: 1326`.

Paperclip existující per-company config při startu celý nepřepisuje: kopírovací logika existující soubor ponechá a managed MCP writer mění jen svůj označený managed blok.

Pozor: `curl.exe` může ve Windows sandboxu vracet HTTP `000`, i když síť funguje. Síť byla ověřena skutečným HTTPS `fetch`. Při diagnostice proto nevyvozuj nedostupnost sítě pouze z `curl.exe` HTTP 000.

Varování `codex_acp_credentials_missing` bylo 11. 8. 2026 vyhodnoceno jako falešné pro aktuální formát Codex credentials (`tokens.refresh_token` vs. top-level kontrola adaptéru). Reálné `codex_local` běhy přes ChatGPT účet fungují. Neopravovat ho kopírováním živého refresh tokenu ani přechodem na placený API key jen kvůli odstranění warningu.

## 8. Secrets — závazné pravidlo

Paperclip secret nestačí pouze vytvořit v credential store. Agent musí mít explicitně přidělený přístup.

Pro OneMil používej nejmenší oprávnění:

- UI agenta → Configuration → Secret access
- **API access** pro on-demand čtení
- **Bound to latest**, pokud má agent používat aktuální rotovanou hodnotu
- každý agent dostane pouze secret, který skutečně potřebuje

Run-bound secret API je určen pouze pro běžícího agenta s platným run-bound agent JWT. Úspěšné čtení secretu je auditované.

Nikdy:

- nevkládat secret do promptu
- nevkládat secret do issue/commentu
- nevkládat secret do GitHubu nebo dokumentace
- nevypisovat hodnotu do logu
- nedávat agentovi service-role klíč, pokud existuje úzký agent-specific secret

## 9. Skills — jak je používat v OneMil

Paperclip skill je opakovaně použitelný pracovní postup. Typicky je to složka se `SKILL.md`; krátký popis říká agentovi, kdy skill použít, a plné instrukce se načtou až při relevantním úkolu.

To je preferovaný způsob pro opakované postupy. Nezahlcuj hlavní instrukce agenta dlouhými návody, které potřebuje jen někdy.

Paperclip má:

- company skill library
- bundled catalog skills
- optional catalog skills
- Paperclip-managed vlastní skills
- importované/připnuté skills z externích zdrojů
- přiřazení skillů jednotlivým agentům

Před přiřazením externího skillu agentovi s vyššími oprávněními vždy přečti celý `SKILL.md` a ověř původ/verzi.

### Relevantní oficiální Paperclip skills pro OneMil

Před tvorbou vlastního skillu nejdřív zkontroluj aktuální katalog Paperclipu. Mezi oficiálně dokumentované patří například:

- `paperclip` — základní heartbeat/work protocol
- `paperclip-board` — board/company management
- `paperclip-create-agent` — řízené vytváření agentů
- `paperclip-converting-plans-to-tasks` — převod plánu na správně delegované issues
- `summarize-status` — manažerský stručný stav a rozhodnutí
- `task-planning`
- `issue-triage`
- `qa-acceptance`
- `doc-maintenance`
- `github-pr-workflow`
- `wireframe`
- optional `agent-browser` — pouze řízené ověřování webu, ne unattended scraping
- optional `last30days` — aktuální research, pokud je pro úkol vhodný

Skills neinstaluj hromadně „pro jistotu“. Každému agentovi dej jen ty, které odpovídají jeho práci; snižuje to šum, spotřebu a riziko chybného použití.

## 10. Doporučené rozdělení skillů

Toto je výchozí návrh, ne automatické schválení instalace:

**Provozní ředitel:** `paperclip`, `paperclip-converting-plans-to-tasks`, `summarize-status`; případně `issue-triage`.

**Magin:** pouze základní Paperclip workflow a budoucí vlastní úzký OneMil CRM runbook, pokud bude potřeba. Nepotřebuje obecný browser ani research skill pro svou denní dávku.

**Průzkumník:** základní Paperclip workflow + vhodný research/browser skill podle schváleného způsobu hledání leadů.

**Synchronizátor:** pouze základní Paperclip workflow + úzké instrukce synchronizace. Nepotřebuje marketingové, browser ani research skills.

Vlastní OneMil skill vytvoř až tehdy, když jde o opakovatelný postup, který nechceme držet v dlouhém promptu agenta. Nevytvářej nový duplicitní zdroj obchodní pravdy; obchodní fakta zůstávají v `ONEMIL_BUSINESS_CONTEXT.md`.

## 11. Schvalování a bezpečnost

Bez výslovného schválení Pavla žádný Paperclip agent nesmí provést destruktivní nebo citlivou produkční změnu, zejména:

- mazání produkčních dat
- změny peněženek/MioCoinů
- změny plateb/Stripe
- změny soutěžní logiky
- změny RLS
- produkční migrace
- zásahy do peněz

U obchodních a komunikačních akcí se řiď konkrétním schváleným workflow. Pokud je akce serverem předem bezpečně omezená (např. Maginova denní dávka), agent smí pouze parametry výslovně povolené daným kontraktem.

## 12. Výstupy agentů

Výsledek práce musí být viditelný v Paperclip issue/commentu. Pokud vznikne soubor určený pro člověka, preferuj Paperclip artifact/attachment workflow, aby výsledek nezůstal pouze v lokálním workspace.

Lokální pracovní soubory nejsou samy o sobě dostatečný finální výstup.

## 13. Výsledek testu k 11. 8. 2026 — uzavřeno

**Synchronizátor je funkční end-to-end.** Ingest vrátil **HTTP 200**, úkol `ICO-41` skončil `done`
a ve OneMil STAGING vznikl snapshot **`7be66d9c-e984-42d3-9d1e-1e5e4001260a`**
(`captured_at 17:26:45`, 43 kB). API Access na `PAPERCLIP_BRIDGE_SECRET` funguje.

Cesta k tomu odhalila čtyři vrstvy, které bylo nutné postupně odstranit — všechny jsou popsané
v oddílech 3, 6 a 7 a žádnou z nich nevracet zpět:

1. rutiny bez `projectId` → Paperclip úkol zablokuje ještě před odesláním agentovi,
2. vypnutý heartbeat → úkol vznikne, ale nikdo ho nezpracuje,
3. Windows sandbox: `elevated` končí na `CreateProcessWithLogonW failed: 1326`; nutné
   `unelevated` + `sandbox_mode = "workspace-write"` + `network_access = true`,
4. HTTP klient a tvar payloadu — Node fetch a `snake_case` (viz oddíl 3).

**Magin ověřený skutečným během není** a ani být nemůže: každé úspěšné volání jeho Edge Function
zakládá reálnou dávku. Jeho rutina byla srovnána s ověřeným vzorem Synchronizátora a je připravená
na první ostrý běh **12. 8. 2026 v 7:30 Europe/Prague** (40 e-mailů). Ostrou denní rutinu
**nespouštět ručně jen kvůli testu**.

Otevřené a neblokující: `codex_acp_credentials_missing` je falešný poplach — kontrola adaptéru
hledá `refresh_token` na top-level, zatímco Codex ho ukládá pod `tokens`. Na běh vliv nemá.

## 14. Oficiální Paperclip dokumentace používaná jako referenční základ

Při změnách Paperclipu ověř aktuální verzi dokumentace, protože produkt se vyvíjí rychle. Referenční oblasti:

- Agents
- Heartbeats & Routines
- Skills / Skills Reference
- Routines API
- Secrets API / Run-Bound Agent Secret Access
- Roles & Permissions

Dokumentace Paperclipu je referenční zdroj pro chování platformy; tento soubor je zdroj pravdy pro to, jak je Paperclip použit konkrétně v OneMil.
