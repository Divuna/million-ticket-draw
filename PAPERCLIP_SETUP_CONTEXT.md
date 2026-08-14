# OneMil — Paperclip setup context

**Status:** permanent Paperclip / AI employee setup context  
**Last updated:** 2026-08-14 (§14 doplněna; §1–§13 ponechány jako historický záznam z 2026-05-12)  
**Company:** iCONIC POINT s.r.o.  
**Project:** OneMil  
**Owner / final decision maker:** Pavel Diviš

> ⚠️ **AKTUÁLNÍ PROVOZNÍ STAV JE V §14.** Sekce §3, §8 a §10 popisují stav z 12. 05. 2026 a v částech
> „Paperclip settings“, „Active agents“ a „Model“ jsou **neaktuální**. Agenti se pro složení týmu,
> heartbeat nastavení, adaptéry a přístupy řídí výhradně §14. Obchodní pravidla, lead databáze,
> restrikce (§9) a schvalovací model (§4) platí beze změny.

This file is the source of truth for setting up Paperclip and AI employees for OneMil.

Paperclip and all AI agents must read these files before working on OneMil:

- `COMPANY_CONTEXT.md` — company identity, contacts, public signature, billing identity
- `ONEMIL_BUSINESS_CONTEXT.md` — what OneMil is, B2B reward model, partners, MioCoins, vouchers, coupons, Partner Offers, influencers, agencies, social campaigns
- `CLAUDE.md` — project rules and safety rules
- `onemil_state.md` — current project state
- `onemil_history.md` — project history
- `.cursorrules` — centralized Cursor / AI work rules

---

## 1. Purpose

Paperclip is being set up as the AI management layer for OneMil.

The goal is not to let AI decide everything alone. The goal is to create a structured AI team that can understand OneMil, organize work, prepare plans, research partners, evaluate opportunities, and ask Pavel Diviš for approval before anything is executed.

---

## 2. Paperclip company setup

Use this setup:

Company name:
iCONIC POINT s.r.o.

Main project:
OneMil

Main business context:
ONEMIL_BUSINESS_CONTEXT.md

Company identity context:
COMPANY_CONTEXT.md

OneMil must be understood as a B2B reward, partner, and marketing platform with a premium contest and reward experience for users.

---

## 3. Manager agent — Provozní ředitel OneMil

**Agent name:** Provozní ředitel OneMil
**Adapter:** claude_local or codex_local
**Role:** AI operations coordinator / right hand for Pavel Diviš

This agent is not the company owner. Pavel Diviš remains the owner and final decision maker.

The Provozní ředitel OneMil:

- reads only the minimum necessary files before each task
- does NOT read onemil_history.md automatically — only when Pavel explicitly asks for history
- organizes tasks and prepares plans
- checks risks
- proposes new agents (does not create or activate without Pavel approval)
- reviews outputs from other agents
- summarizes decisions for Pavel
- asks for approval before any execution

**Delegation rule (critical):**
Provozní ředitel is a manager, not an executor. He must delegate specialized work to the correct agent:
- lead research → Průzkumník obchodních leadů OneMil
- large tables, repetitive processing, marketing research → appropriate specialized agent
- technical work, legal analysis → appropriate specialized agent

He processes tasks personally only when Pavel explicitly says: **"zpracuj osobně"**.

If no suitable agent exists for a task, he proposes a new agent and waits for Pavel approval.

**Paperclip settings:**
> ⚠️ **NEAKTUÁLNÍ od 2026-08-14 — platné hodnoty viz §14.** Zejména „Heartbeat: OFF“ už neplatí:
> Provozní ředitel má `heartbeatEnabled = true`. Ostatní řádky odpovídají realitě.
- Enable search: OFF
- Can assign tasks: ON
- Can create new agents: OFF
- Heartbeat: OFF <!-- neplatí, viz §14 -->
- Reports to: Pavel Diviš; podřízení: Martin, Magin, Synchronizátor, Meta API Integrator

---

## 4. Approval model

The OneMil Chief of Staff may propose new AI agents, but must not create, launch, or activate them without Pavel Diviš approval.

Every proposed new agent must include:

- agent name
- why the agent is needed
- exact responsibility
- expected output
- data it will read
- monthly budget
- restrictions
- who it reports to
- how usefulness will be measured

Pavel Diviš can approve, reject, or request revision.

---

## 5. First focus: sales department

The first practical focus for Paperclip is the OneMil sales department.

The sales department must not start with random outreach.

First, it must create a clear lead database structure and have it approved.

The sales system should collect companies in a structured way so OneMil can evaluate, filter, contact, and track them.

---

## 6. Lead database fields

Every company / lead should be tracked with at least these fields:

- company name
- website
- industry
- company type: e-shop / brand / agency / local company / starting company / other
- products or services
- OneMil fit: high / medium / low
- reason why it fits OneMil
- possible MioCoin reward use
- voucher fit
- partner offer fit
- contest product supplier fit
- estimated company size
- public contact email
- public phone if available
- social media links
- priority: A / B / C
- sales status
- outreach note
- source where the lead was found
- date added
- last checked date

Suggested sales statuses:

- found
- needs review
- approved for outreach
- outreach drafted
- outreach approved
- contacted
- replied
- meeting planned
- partner negotiation
- partner active
- rejected
- not suitable

---

## 7. What sales agents should evaluate

Sales agents should evaluate:

- whether the company can reward customers with MioCoins
- whether the company has products suitable for contests
- whether the company can provide vouchers
- whether the company can provide Partner Offers
- whether the company is suitable for long-term cooperation
- whether the company could benefit from performance-based billing
- whether an agency manages the company and could become a commission channel
- whether the company is a starting brand that OneMil can help promote

---

## 8. Active agents (as of 2026-05-12) — HISTORICKÝ ZÁZNAM

> ⚠️ **Tato sekce je historická.** Aktuální složení týmu je v §14. Agent
> „Průzkumník obchodních leadů OneMil“ **v instanci k 14. 08. 2026 neexistuje** a „Campaign & Offer
> Planner“ nebyl vytvořen. Nemazáno kvůli historické hodnotě.

### Provozní ředitel OneMil

Status: active
Adapter: claude_local or codex_local
Role: manager, operations coordinator, delegation hub
Reports to: Pavel Diviš
See section 3 for full rules.

### Průzkumník obchodních leadů OneMil

Status: active
Adapter: codex_local
Role: business lead researcher — finds and classifies companies, e-shops, brands, agencies, product suppliers
Reports to: Provozní ředitel OneMil
Must not: contact anyone, send emails, publish content, change any system without Pavel approval

Paperclip settings:
- Enable search: ON
- Can assign tasks: OFF
- Can create new agents: OFF
- Heartbeat: OFF

Expected outputs:
- Structured lead list with classification (fit: high/medium/low, type, contact, priority A/B/C)
- Saved as Markdown and CSV to: `C:\Users\divis\Desktop\OneMil Paperclip Outputs`
- Summary posted directly into Paperclip issue comment

### Campaign & Offer Planner (proposed, not yet created)

Purpose:
Prepare campaign, contest, product, voucher, and partner offer ideas based on approved partners.

Expected output:
Campaign drafts, contest ideas, partner activation ideas, moderator/script notes.
Do not create without Pavel Diviš approval.

---

## 9. Restrictions

No Paperclip agent may execute these without Pavel Diviš approval:

- send emails
- send partner outreach
- publish posts
- contact customers
- contact partners
- approve contracts
- approve legal wording
- approve financial terms
- change production
- change Supabase
- change Stripe
- change GitHub code
- change contest engine
- change wallet, MioCoin, voucher, ticket, winner, Partner Offers, Sofinity, or Bob logic

Agents may prepare drafts, reports, proposals, lead lists, campaign ideas, and risk checks.

---

## 10. Technical notes (Codex local on Windows)

- Codex local adapter is functional on Windows.
- Required Extra args in agent settings: `--skip-git-repo-check`
- Model: use **Default** or **gpt-5.3-codex** (o4-mini was not supported with current Codex + ChatGPT account setup).
- Claude Code adapter (claude_local) also works; may be credit-limited on Pro subscription.
- Claude.exe path: `C:\Users\divis\.local\bin\claude.exe`
- C:\Users\divis\.local\bin is in user PATH registry — new terminal windows pick it up automatically.

---

## 11. Output file handling

All Paperclip agent outputs (reports, lead lists, one-pagers, proposals) must be:
1. Posted as a comment directly into the Paperclip issue (visible in UI).
2. Saved as Markdown and/or CSV files to: `C:\Users\divis\Desktop\OneMil Paperclip Outputs`

Internal `.paperclip` folder files must never be the only output.

---

## 12. Issues created during first live session (2026-05-12)

| Issue | Content |
|-------|---------|
| ICO-15 | Lead scouting — 10 Czech e-shops/brands |
| ICO-16 | Shortlist of top 3 from existing leads |
| ICO-17 | Public B2B contact verification — Dedoles, Slevomat, Rohlik.cz |
| ICO-18 | Dedoles one-pager draft → `dedoles_one_pager_ICO-18_2026-05-12.md` |
| ICO-19 | Ideal AI team proposal → `onemil_ai_team_ICO-19_2026-05-12.md` |

Top candidates: Dedoles, Slevomat, Rohlik.cz, Aktin/Vilgain, Vuch, DATART.

---

## 13. Next confirmed steps

- Continue building the lead database (Průzkumník extends the list).
- Provozní ředitel coordinates priorities and presents shortlists to Pavel before any outreach.
- Outreach drafts are prepared only after Pavel explicitly approves the shortlist.
- Do not invent missing business rules. Ask Pavel Diviš or mark as TODO until confirmed.

---

## 14. AKTUÁLNÍ PROVOZNÍ STAV (ověřeno 14. 08. 2026, Fáze 0)

Tato sekce je **jediný platný zdroj pravdy** pro složení týmu, runtime nastavení a přístupy.
Všechny hodnoty níže byly odečteny z běžící instance přes lokální Paperclip API, ne odhadnuty.

### 14.1 Instance

| Položka | Hodnota |
|---|---|
| Paperclip | `2026.722.0`, instance `default` |
| Režim | authenticated · private · loopback `127.0.0.1:3100` · strict secrets |
| Company | iCONIC POINT s.r.o. — `cbea91fc-fb4b-4c00-bee8-7c3e4e6230d7`, prefix `ICO` |
| Projekt | OneMil — `b9aafaa8-fbf3-4c65-ae28-b11eafd12b3a` |
| Nový agent | vyžaduje schválení boardu (`requireBoardApprovalForNewAgents = true`) |

### 14.2 Aktivní agenti (9)

| Agent | Role | Adapter / model | Heartbeat | Reportuje |
|---|---|---|---|---|
| Provozní ředitel OneMil | manager, delegační uzel | `codex_local` / gpt-5.5 | **enabled = true** | Pavel |
| Magin – CRM operátor OneMil | denní dávka obchodních e-mailů | `codex_local` / gpt-5.5 | **enabled = true** | Provozní ředitel |
| Synchronizátor Paperclip OneMil | synchronizace stavu do OneMil STAGING | `codex_local` / gpt-5.5 | **enabled = true** | Provozní ředitel |
| Martin – vedoucí marketingu OneMil | řízení marketingu | `codex_local` / gpt-5.5 | enabled = false | Provozní ředitel |
| Performance Analyst OneMil | vyhodnocení Meta KPI | `codex_local` / gpt-5.5 | enabled = false | Martin |
| Content & Community Planner OneMil | obsah na zadání | `codex_local` / gpt-5.5 | enabled = false | Martin |
| Meta API Integrator OneMil | technická integrace (engineer) | `codex_local` / gpt-5.5 | enabled = false | Provozní ředitel |
| Summarizer | vestavěný, rutina pozastavena | `claude_local` / haiku-4.5 | false | Provozní ředitel |
| Reflection Coach | vestavěný, rutina pozastavena | `codex_local` | false | Provozní ředitel |

**Agent „Průzkumník obchodních leadů OneMil“ (§8) v instanci neexistuje.**

### 14.3 Heartbeat — skutečný stav

**Timerový heartbeat dnes nikoho nebudí.** U všech devíti agentů platí `intervalSec = 0` a
`schedulerActive = false`. Příznak `heartbeatEnabled = true` u tří agentů je proto bez efektu,
dokud není nastaven interval. Veškerá práce se dnes rozjíždí událostmi (`assignment`) a rutinami
(`automation`).

### 14.4 Rutiny

| Rutina | Agent | Trigger | Concurrency | Catch-up | Stav |
|---|---|---|---|---|---|
| Denní dávka prvních obchodních e-mailů | Magin | cron `30 7 * * 1-5`, `Europe/Prague` | `skip_if_active` | `skip_missed` | active |
| Synchronizace stavu Paperclipu do OneMil STAGING | Synchronizátor | schedule | `skip_if_active` | `skip_missed` | active |
| Review recent agent trajectories | Reflection Coach | — | `coalesce_if_active` | `skip_missed` | **paused** |
| Refresh stale summary slots | Summarizer | — | `coalesce_if_active` | `skip_missed` | **paused** |

Maginova rutina volá produkční Edge Function `sales-lead-daily-batch-agent`. Rozesílku a rozložení
do okna 08:30–16:30 dělá OneMil sám; agent e-maily neodesílá.

### 14.5 Meta → Supabase broker

- Produkční read-only broker je **VERIFIED**.
- Referenci na broker mají **Martin** a **Performance Analyst**.
- **Content & Community Planner broker credential nemá a nesmí dostat.** Potřebné údaje dostává
  výhradně jako odvozené zadání od Martina nebo Analysta.
- Přístup je **výhradně read-only**. Žádný agent nesmí přes Metu zapisovat, publikovat ani utrácet.

### 14.6 Ověřené chování platformy (Fáze 0)

- **Přiřazení issue probudí agenta i s `heartbeatEnabled = false`.** Ověřeno na reálných bězích
  Martina, Performance Analysta a Content Plannera — `invocationSource = assignment`,
  `reason = issue_assigned`, `status = completed`, při `schedulerActive = false`.
- **Komentář probudí agenta** (`issue_commented`), duplicitní probuzení se slučují (`coalesced`).
- **Rutina → issue → assignment wake** funguje bez timeru (ověřeno na ICO-138).
- Wake se **nespustí pro issue ve stavu `backlog`** (ověřeno ve zdrojovém kódu
  `queueIssueAssignmentWakeup`; runtime test zatím neproveden).

### 14.7 Otevřené provozní nálezy

1. **82 ze 137 issues je `blocked`** a **žádné z nich nepoužívá `blockedByIssueIds`.** Bez
   first-class blockerů nemůže nikdy nastat `issue_blockers_resolved`, takže se zablokovaná práce
   sama nikdy neprobudí. Agenti musí přejít na `blockedByIssueIds`.
2. **Execution policy (review/approval brány) se nepoužívá u žádného issue.** Nadřízený se proto
   dnes nedozví o dokončené práci podřízeného automaticky.
3. **Všichni agenti mají `budgetMonthlyCents = 0`**, takže ochrana „zpomal nad 80 %, pauza na 100 %“
   je fakticky neaktivní.

### 14.8 Model a technické poznámky (nahrazuje §10)

Produkčně používaný model je `gpt-5.5` na `codex_local` u všech OneMil agentů
(`--skip-git-repo-check`, `fastMode`, sandbox zapnutý — `dangerouslyBypassApprovalsAndSandbox = false`).
Vestavěný Summarizer běží na `claude_local` / `claude-haiku-4-5`. Údaj „gpt-5.3-codex / o4-mini“ v §10
je historický.
