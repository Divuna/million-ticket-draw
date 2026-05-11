# OneMil — Paperclip setup context

**Status:** permanent Paperclip / AI employee setup context  
**Last updated:** 2026-05-11  
**Company:** iCONIC POINT s.r.o.  
**Project:** OneMil  
**Owner / final decision maker:** Pavel Diviš

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

## 3. First AI manager

Recommended first AI manager:

OneMil Chief of Staff

Meaning:
AI right hand / operations coordinator for Pavel Diviš.

This agent is not the company owner. Pavel Diviš remains the owner and final decision maker.

The OneMil Chief of Staff should:

- read the GitHub source-of-truth files
- understand OneMil before proposing work
- organize tasks
- prepare plans
- check risks
- suggest needed agents
- review outputs from other agents
- summarize decisions for Pavel
- ask for approval before execution

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

## 8. First suggested agents

Do not create these automatically. The OneMil Chief of Staff may propose them for Pavel approval.

### Partner Growth Researcher

Purpose:
Find and classify suitable e-shops, brands, partners, agencies, and starting companies.

Expected output:
Structured lead database with ranked opportunities.

### Campaign & Offer Planner

Purpose:
Prepare campaign, contest, product, voucher, and partner offer ideas based on approved partners and products.

Expected output:
Campaign drafts, contest ideas, partner activation ideas, moderator/script notes.

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

## 10. Next step

Next confirmed task:

Prepare the exact Paperclip setup for:

1. Company: iCONIC POINT s.r.o.
2. Main project: OneMil
3. First manager: OneMil Chief of Staff
4. Approval workflow for new agents
5. Sales department lead database structure
6. First two proposed agents for Pavel review

Do not invent missing business rules. Ask Pavel Diviš or mark items as TODO until confirmed.
