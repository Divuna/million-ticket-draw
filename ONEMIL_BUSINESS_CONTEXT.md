# OneMil — business context

**Status:** permanent business/product context  
**Last updated:** 2026-07-24  
**Owner:** Pavel Diviš  
**Company context:** see `COMPANY_CONTEXT.md`

This file is the source of truth for understanding what OneMil is, how the business model works, and how assistants should describe the project.

All AI assistants, Claude Code, Cursor, ChatGPT, Paperclip agents, Lovable, Codex, and future automation systems must read this file before working on OneMil strategy, product positioning, partner outreach, marketing, business documentation, Paperclip setup, or public explanation of the project.

Do not treat OneMil as only a contest app. OneMil is primarily a partner reward and marketing platform for companies, e-shops, brands, influencers, agencies, and end users.

---

## 1. OneMil in one sentence

OneMil is a B2B reward, partner, and marketing platform that allows companies and e-shops to reward customers with MioCoins, coupons, vouchers, partner offers, and consumer-contest experiences, while giving end users a premium app experience with physical prizes and partner benefits.

---

## 2. Core positioning

OneMil must be understood in this order:

1. Partner reward system for companies and e-shops.
2. Marketing and loyalty tool for customer motivation.
3. Consumer-facing premium reward and contest app.
4. Partner offer and voucher distribution channel.
5. Growth ecosystem for influencers, agencies, users, and partner brands.

OneMil is not only a contest platform. The contest experience is the attractive user-facing layer of a broader B2B reward system.

---

## 3. Market focus

OneMil is designed primarily for the Czech and Slovak market.

It should be presented as a local, premium, partner-driven reward platform for e-shops, brands, companies, influencers, agencies, and customers.

---

## 4. Main customer loop

The core loop is:

```text
purchase at partner → customer receives MioCoins / coupon → customer activates reward in OneMil → customer uses MioCoins in contest / voucher / offer → customer returns to partner or OneMil
```

This loop is the key business logic. OneMil gives the customer a reason to come back and gives the partner a measurable reward system.

---

## 5. B2B partner model

A partner company can use OneMil to reward its customers.

A partner can give customers MioCoins or reward coupons for:

- purchase
- registration
- repeat purchase
- loyalty
- campaign participation
- apology / goodwill compensation
- birthday or seasonal action
- promo action
- custom business activity

The partner decides how generous the reward should be.

OneMil does not force a fixed reward amount per purchase. Each partner can set its own reward logic in the partner dashboard.

Examples:

- 5 MioCoins for a small purchase
- 50 MioCoins for a larger order
- special MioCoin amount for a campaign
- higher reward for selected product categories
- one-time customer reward

---

## 6. Partner dashboard and reward control

The partner dashboard is a central part of OneMil.

Partners should be able to control:

- how many MioCoins they give customers
- for which purchase or action
- campaign rules
- reward value
- partner offers
- voucher / coupon logic
- performance and usage

The partner has control over how many MioCoins are distributed. OneMil measures what customers actually activate and use.

### 6.0 One partner company can connect several e-shops — confirmed

A partner is a **company**, and one company may operate and connect **several separate
e-shops** to OneMil. This is a confirmed part of the product model, not a hypothetical.

The consequence to keep in mind everywhere: an order number is unique only **within one
e-shop**. Two different e-shops of the same company can legitimately issue the same order
number (a newly launched shop typically starts numbering from the beginning again). Anything
that identifies an order — deduplication, reward issuance, reporting — therefore has to be tied
to the **specific e-shop connection**, not just to the partner company.

The relationship to model is:

```text
partner / company  →  e-shop connection  →  order
```

### 6.1 Product-level reward rules — confirmed target model

A partner chooses **how** they reward, in one place in the partner dashboard:

1. **Whole e-shop** — the partner's global conversion applies to the whole order
   (`100 Kč = 5 MioCoins`). This is the default and today's behaviour.
2. **Selected products only** — only products with an explicit rule earn MioCoins.
   Everything else in the basket earns nothing.
3. **Whole e-shop + exceptions** — the global conversion applies, but individual
   products can override it.

Confirmed rules:

- The partner can change the global conversion at any time (`100/5 → 100/10`) **without any
  superadmin approval**. The new rate applies to new orders only. Orders and MioCoin rewards that
  already exist are never recalculated.
- A product rule is matched **only by the stable product code / SKU**. The product name is
  display-only information for the partner. Example: `ABC123 — Parfém do auta — 10 MioCoins`.
- **Quantity multiplies the reward.** `ABC123 = 10 MC` and the customer buys 2 pieces → 20 MioCoins.
- A ratio-based product reward uses the **real after-discount price** of the product.
- Rounding happens **once**, on the reward for the whole relevant purchase — never separately per
  item.

### 6.2 What the customer sees in the partner's Shoptet

A small OneMil widget (one JS snippet, no secret key) shows the customer, before they buy:

- a badge on the product listing and product detail — e.g. *"Za tento produkt získáte 10 MioCoinů"*
- the expected reward for the current basket — e.g. *"Za tento nákup získáte přibližně 37 MioCoinů"*

The basket figure recalculates whenever quantity, products or prices change. The partner can switch
the **product badge** off; the **basket information stays on** whenever the Shoptet MioCoin
connection is active.

**Non-negotiable technical invariant:** the amount shown to the customer and the amount OneMil
actually issues after the order are produced by **one shared server-side reward engine**. The widget
only displays the result of that engine — it never calculates a reward itself. The Shoptet import and
the Partner Order API issue MioCoins through the same engine, so a preview and a real payout can
never drift apart.

### 6.3 Required Shoptet order-export fields — confirmed partner setup

For OneMil to import a partner order correctly, the partner creates a custom Shoptet **CSV order
export**, uses **PŘIDAT** to add fields to the export template, and enters the exact values in the
**Exportovat jako** column below. The source of the live partner guide is
`src/content/partnerGuides/shoptetGuide.ts`; its published PDF is
`public/navody/OneMil-navod-Shoptet.pdf`.

| Zákaznická skupina | Pole | Exportovat jako |
|---|---|---|
| Objednávka | kód | `code` |
| Objednávka | status | `statusName` |
| Celková cena objednávky | celková cena s daní | `totalPriceWithVat` |
| Celková cena objednávky | zaplaceno | `paid` |
| Základní informace o zákazníkovi | e-mail | `email` |
| Položky objednávky | položka objednávky - typ | `orderItemType` |
| Položky objednávky | položka objednávky - název | `orderItemName` |
| Položky objednávky | položka objednávky - množství | `orderItemAmount` |
| Položky objednávky | položka objednávky - kód | `orderItemCode` |
| Položky objednávky | položka objednávky - cena s daní za jednotku po slevě | `orderItemUnitDiscountPriceWithVat` |

> **Important:** names in **Exportovat jako** must be entered exactly as shown in the table.
> `paid` is the actual payment signal; it remains separate from the order lifecycle value
> `statusName`.

---

## 7. Performance-based billing model

This is one of the most important business rules of OneMil.

A company does not pay for all coupons, promised rewards, or MioCoin value it distributes.

The company pays only when the customer actually activates the coupon and loads / uses the MioCoins inside OneMil.

Confirmed pricing principle:

```text
1 used MioCoin = 1 Kč + 21 % VAT
```

The price is the same for every company unless a future confirmed agreement changes this.

Example:

```text
A company distributes coupons with total potential value of 1,000,000 MioCoins.
Customers activate only 100,000 MioCoins.
The company pays only for 100,000 activated / used MioCoins.
The remaining 900,000 unused MioCoins create no cost for the company.
```

Business value for partners:

- low risk
- no payment for unused coupons
- large campaign potential
- cost tied to real customer activity
- measurable performance
- reward can be more attractive than a standard discount

---

## 8. MioCoin

MioCoin is the internal credit unit of OneMil.

Users can get MioCoins through:

- direct top-up inside OneMil
- partner reward after purchase or other action
- activated partner coupon
- bonus rewards
- social contests and community campaigns
- campaigns from influencers or brands

MioCoins can be used for:

- tickets in contests
- vouchers
- selected benefits
- partner offers or other in-app reward flows

MioCoins cannot be withdrawn or exchanged back for money.

MioCoin must never be publicly described as a gambling token, betting token, casino chip, or money-equivalent withdrawal product.

### 8.1 MioCoin decimal rule — confirmed (16. 08. 2026)

**MioCoiny mají maximálně 1 desetinné místo.**

Platné hodnoty: `0,5` · `0,6` · `1,0` · `1,2` · `4,9` · `5,0` · `15,7`.
Neplatné jako výsledná MioCoin hodnota: `1,25` · `4,333` · `0,55`.

**Partnerská odměna**

- Minimální výsledná odměna je **0,5 MC**. Pokud je výsledná odměna po zaokrouhlení
  menší než 0,5 MC, odměna se **nevydá**.
- Ručně zadávaná partnerská odměna musí být **minimálně 0,5 MC** a smí mít
  **maximálně 1 desetinné místo**.
- `0,4` je neplatné · `1,25` je neplatné · `0,6` je platné · `1,2` je platné.
- Neplatná ručně zadaná hodnota se **odmítne**, nikdy se tiše nezaokrouhlí
  (`1,25` se nesmí sama změnit na `1,3`).

**Automatický výpočet z poměru**

Interní mezivýpočet (např. `100 Kč = 5 MC`, objednávka 99 Kč → `4,95`) smí mít
libovolnou přesnost. **Zaokrouhlení na 1 desetinné místo se provede právě jednou,
až na výsledku celé objednávky** — nikdy po jednotlivých položkách.

- `4,95 MC` → `5,0 MC`
- `4,85 MC` → `4,9 MC`
- `4,84 MC` → `4,8 MC`
- `24,42 MC` → `24,4 MC` (660 Kč při 100 Kč = 3,7 MC)

**MioCoin množství vs. peníze:** MioCoin množství má max. 1 desetinné místo;
finanční částky v CZK (faktury, DPH, ceny) zůstávají standardně na 2 desetinných
místech. Tato dvě pravidla se nemíchají.

**1 MC = 1 Kč** (`partners.price_per_coin`) tímto pravidlem není dotčeno — mění se
jen počet desetinných míst množství, nikoli cena za MioCoin.

> **Stav implementace (18. 08. 2026):** technická implementace pro **partnerský
> reward řetězec** (numerické coin sloupce, `compute_partner_reward`, issuance,
> widget, preview a fakturace) je **nasazená v produkci** `xkzhjldrojjlrkezorey`.
> Produkce používá pravidlo nejvýše jednoho desetinného místa; staré chování
> `floor()` na celé číslo už pro partnerskou odměnu neplatí.
>
> **Mimo rozsah této změny:** Stripe top-up / refundace / referral odměna
> (`payments.amount` → `wallets.balance_coins`). Je to samostatná odměnová cesta;
> `payments.amount` je dnes vždy celé číslo, protože `stripe-webhook` odmítne
> jinou než celou CZK částku.

---

## 9. Coupon, voucher, and partner offer

These terms must be used consistently.

### Coupon

A coupon is a prepaid or promised reward from a company to a customer. The customer activates it in OneMil to receive MioCoins.

A company may distribute many coupons, but pays only for the part that customers actually activate and use.

### Voucher

A voucher is an offer that the customer can buy or unlock with MioCoins inside OneMil.

The proceeds from selected vouchers may support a good cause.

### Partner offer

A partner offer is a free or special offer from a partner shown inside the OneMil flow.

Partner offers are not contest prizes. They should be different from vouchers, so users do not see the same thing twice.

Partner offers are a partner marketing and distribution channel.

---

## 10. Consumer contests

Contests are the user-facing excitement layer of OneMil.

Every contest should be transparent and clearly structured:

- physical main prize
- optional bonus physical prizes
- optional MioCoin bonuses
- fixed number of tickets
- visible rules
- clear contest conditions

The main prize principle currently used in OneMil:

```text
The main prize belongs to the holder of the last ticket.
```

Contests must be presented as consumer contests with physical prizes, not as gambling.

Forbidden public framing:

- casino
- hazard
- sázení
- sázka
- jackpot
- gambling
- betting
- žetony

Use instead:

- soutěž
- tiket
- MioCoin
- voucher
- věcná výhra
- hlavní výhra
- partnerská nabídka
- odměna

---

## 11. User rewards and personal codes

Users are not only passive contestants.

Every user can have a personal OneMil code, public wording should avoid the English word referral.

Recommended public wording:

- osobní kód
- můj OneMil kód
- kód hráče
- soutěžní kód
- doporučovací kód when the context is formal

Current player reward system:

- user shares personal code or link
- invited user registers / uses the code
- rewards are non-monetary
- rewards are paid in MioCoins only
- current reward: 5 % in MioCoins from paid top-ups of the invited user
- current one-time bonus: 15 MC after the invited user’s first paid top-up
- no reward is paid for registration alone
- MioCoins cannot be withdrawn or exchanged for money

Important separation:

```text
Regular users receive non-monetary MioCoin rewards.
Influencers / partners / agencies may have monetary commission models controlled by admin.
```

---

## 12. Influencer system

Influencers are a growth and acquisition channel.

The influencer system is separate from the regular user personal-code system.

Influencers may work with:

- tracking links
- campaign assignments
- user registrations
- conversion tracking
- CZK commissions
- invoicing
- campaign bonuses
- MioCoin bonuses for referred users

Influencer payouts are monetary, CZK-based, invoiced, and admin-controlled.

The influencer system must not be merged with the regular user reward system.

---

## 13. Agencies, sales representatives, and e-shop managers

Agencies, sales representatives, and people who manage e-shops or marketing for companies can bring partner companies and customers into OneMil.

The model is long-term and has two separate commission streams.

### 13.1 Commission from a brought e-shop

An agency or sales representative brings an e-shop or company into OneMil. After approval, the company is linked to the affiliate account that brought it.

The commission is calculated from the amount excluding VAT that OneMil actually invoices to the brought e-shop for activated / used MioCoins.

It is not calculated from the e-shop's turnover and not from the potential value of all distributed coupons.

Example:

```text
The e-shop distributes rewards with a potential value of 100,000 Kč.
Customers activate rewards worth 20,000 Kč.
OneMil invoices the e-shop 20,000 Kč excluding VAT.
At a 5 % commission rate, the agency or sales representative receives 1,000 Kč.
```

The intended model is long-term. If the brought e-shop continues using OneMil and OneMil continues invoicing the e-shop, the linked agency or sales representative can continue receiving commission according to the approved agreement.

### 13.2 Commission from customer top-ups

An agency can also bring end users through its tracking link or code. Paid top-ups of these customers can create a separate customer commission.

For this customer commission, the agency can determine who receives it:

- the agency can keep the commission itself,
- the agency can assign it to a specific sales representative or collaborator,
- the agency can assign it to another approved affiliate account in its structure.

This allows the agency to own the relationship with the e-shop while the person who manages promotion or brings customers receives the commission from their paid top-ups.

### 13.3 Practical flow

```text
agency / sales representative brings an e-shop
→ the e-shop is approved and linked to the affiliate account
→ OneMil invoices the e-shop for actually activated / used MioCoins
→ the linked affiliate receives an agreed commission from the invoiced amount excluding VAT
→ the agency selects who will receive customer top-up commissions
→ customers register through the relevant code or link
→ their paid top-ups are attributed to the selected recipient
→ OneMil records, approves, and pays monetary commissions
```

Changing the recipient of customer top-up commissions applies only to future commission attribution. Commission already created must not be reassigned retroactively unless an admin-approved correction is explicitly made.

All monetary commissions are recorded, approved, invoiced, and paid under admin control.

Public summary:

```text
An agency or sales representative can receive two long-term commissions. The first is based on amounts excluding VAT that OneMil actually invoices to e-shops brought by that partner. The second can arise from paid top-ups of brought customers. The agency can decide whether it keeps the customer commission or assigns it to a specific sales representative, collaborator, or another approved affiliate account.
```

---

## 14. Partners as sponsors and product suppliers

Partner companies can support OneMil contests by providing products, discounts, offers, or sponsored prizes.

OneMil can give partners:

- visibility
- product presentation
- social media exposure
- campaign exposure
- new customers
- measurable activations
- long-term reward partnership

Important business direction:

Companies that want long-term contest or product cooperation should also become OneMil partners and distribute MioCoins to their own customers.

OneMil can also support partner sales by buying products from partner companies for contests when it makes sense.

Example:

```text
A partner sells small electronics.
OneMil prepares a larger electronics contest.
OneMil may buy part of the contest products from that partner, according to the individual agreement and contest economics.
```

This creates a mutual support loop:

```text
partner gives MioCoins to customers → OneMil gives partner visibility → OneMil may buy partner products for contests → partner gains both promotion and real sales
```

---

## 15. Support for small and starting companies

OneMil can help smaller and starting companies get visibility.

A starting brand can provide a product or offer.
OneMil can include it in a contest, campaign, social post, voucher, or partner offer.
The brand receives visibility, product presentation, and potential customers.
OneMil receives interesting rewards and new partner content.

This should be part of the OneMil brand story:

```text
OneMil can support not only large e-shops, but also smaller brands that want to get their products in front of people.
```

---

## 16. Social and community contests

OneMil can support growth through regular social contests on:

- Facebook
- Instagram
- TikTok
- X

Planned campaign rhythm:

- daily small contests, for example products up to about 200 Kč
- weekly contests, for example products around 3,000 Kč
- monthly larger contests, for example products around 10,000 Kč

These contests may use a live moderator.

The purpose is:

- daily visibility
- community growth
- personal code usage
- user acquisition
- partner exposure
- low-cost marketing content
- testing of viral mechanics

Participants can be asked to write their personal OneMil code and answer a simple question.

Detailed technical handling of social comments, imports, and centralized draws is not defined in this file and should be designed separately later.

---

## 17. Vouchers and good-cause model

Vouchers are a separate user-facing value layer.

A customer may buy or unlock a voucher with MioCoins.

The proceeds from selected voucher activity can go to a good cause.

Vouchers should not be identical to partner offers. A voucher is an unlocked/bought offer; a partner offer is a free or special in-flow offer from a partner.

### 17.1 Partner vouchers in the main OneMil voucher offer

A partner can place its own voucher in the main OneMil voucher section. Users can buy or unlock this voucher with MioCoins.

This can bring users directly back to the partner's e-shop, selected category, product page, seasonal campaign, or clearance sale.

### 17.2 Classic partner vouchers placed into contests

A partner can also provide its own vouchers for selected OneMil contests as additional contest rewards or promotional benefits.

This is the classic contest-placement voucher model. It is optional, can be limited to only some users or ticket positions, and is not guaranteed with every supported purchase. It must remain separate from the **garantovaný nákupní benefit** defined below.

This is suitable especially for:

- clearance sales,
- seasonal campaigns,
- selling older stock,
- supporting a selected product or category,
- attracting new customers to a specific offer.

Example:

```text
An e-shop needs to support the clearance sale of an older collection.
It provides 100 vouchers with a 20 % discount for a selected OneMil contest.
Users receive the vouchers during the contest and the e-shop brings new customers directly to its clearance offer.
```

### 17.3 Partner cost

Placing the partner's own vouchers in the OneMil voucher section or into selected contests is free for the partner as part of the cooperation with OneMil.

The partner defines the voucher value, validity, conditions, quantity, and target offer. Any direct discount or product benefit provided to the customer is covered by the partner, but OneMil does not charge the partner a separate placement fee for inserting these vouchers within the cooperation.

This free-placement rule applies to the classic partner vouchers described in sections 17.1 and 17.2. It does not define the pricing of the separate **garantovaný nákupní benefit**.

### 17.4 Garantovaný nákupní benefit — confirmed target model

The official product name is **garantovaný nákupní benefit**. It is a separate voucher distribution model for supported OneMil purchases and must never be labelled as a contest voucher.

This is the confirmed priority product and business model for the next contest-system extension.

OneMil will not create a second public voucher section or a separate public voucher product. The existing voucher system will be extended so that every supported purchase issues exactly one garantovaný nákupní benefit and the contest ticket is supplied free as a bonus.

Public presentation must make the purchase clear, for example:

```text
Garantovaný nákupní benefit + 1 ticket zdarma
Za 20 MioCoinů
```

The customer must see before confirmation that MioCoins are used for the garantovaný nákupní benefit and that the contest ticket is included free of charge.

After purchase:

- the garantovaný nákupní benefit is stored in the existing purchased-vouchers area,
- the ticket is stored in the existing contests area,
- the ticket links to the garantovaný nákupní benefit received with that purchase,
- classic contest vouchers, partner offers, winning vouchers, bonus prizes, and garantovaný nákupní benefit remain separate concepts.

A supported purchase must not complete without an available garantovaný nákupní benefit. Benefit assignment, code issue, MioCoin deduction, and ticket creation must succeed together; if any part fails, none of them may be completed.

### 17.5 Partner creation and voucher codes

A partner can create its own garantovaný nákupní benefit as a draft in the partner portal and submit it for superadmin approval.

The partner defines:

- voucher name and description,
- real discount or benefit,
- minimum purchase if applicable,
- validity,
- conditions and method of use,
- graphics,
- requested quantity.

The partner has two code options:

1. import its own unique codes from its own system,
2. ask OneMil to generate the required number of unique codes and download them for import into the partner's own system.

OneMil assigns one available unique code when the garantovaný nákupní benefit is issued. The code is then marked as issued and cannot be issued again.

The partner cannot activate a garantovaný nákupní benefit for distribution without superadmin approval.

### 17.6 Superadmin approval

The superadmin checks that:

- the discount or benefit is real and usable,
- the value is sufficient for the MioCoin amount connected to the purchase,
- the minimum purchase and conditions are reasonable,
- the garantovaný nákupní benefit is not only a formal or misleading substitute,
- the validity is reasonable,
- enough valid codes are available.

The superadmin can approve, reject, return for correction, pause, or end distribution of the garantovaný nákupní benefit.

Approved terms of the garantovaný nákupní benefit must not be silently changed. A material partner change requires a new approval while earlier issued benefits keep their original approved conditions.

### 17.7 Partner distribution orders for contests

After benefit approval, the partner chooses a specific contest and orders a quantity of distribution positions, for example 200 positions.

The partner sees:

- ordered quantity,
- actually issued quantity,
- remaining quantity,
- available code count,
- price excluding VAT per billable distribution,
- estimated amount for the next invoice.

The order can be pending approval, active, paused, completed, or cancelled.

One order can be distributed and invoiced gradually across multiple billing periods and multiple invoices until the requested quantity is exhausted or the order is ended.

### 17.8 Distribution rules and fallback

Every supported purchase receives exactly one garantovaný nákupní benefit and the related contest ticket free as a bonus.

The system should maximise partner reach and minimise repeated issuance of the same garantovaný nákupní benefit to the same customer:

1. prefer a benefit from a company from which the customer has not yet received that benefit,
2. prefer a benefit variant the customer has not yet received,
3. then prefer the least-used or longest-not-issued suitable benefit,
4. distribute active partner orders fairly,
5. use an approved fallback benefit if no other suitable benefit is available.

The same code must never be issued twice and the ordered quantity must never be exceeded.

If a customer receives the same garantovaný nákupní benefit again, it may receive a new valid code, but the partner is charged only for the first issue of that same benefit to that customer.

Iconic Point will be handled as a standard partner with an individual distribution price of 0 Kč and may provide approved fallback benefits that ensure a garantovaný nákupní benefit is always available.

### 17.9 Billing for garantovaný nákupní benefit distribution

Distribution of the garantovaný nákupní benefit is a marketing service provided by OneMil to the partner.

The partner does not pay for the value of the discount. The partner covers the discount or benefit itself and pays OneMil only for the distribution service according to the approved price.

Billing rules:

- only actually issued benefits are considered,
- only the first issue of the same benefit to the same customer is billable,
- repeated issue of that same benefit to that customer is not billed again,
- only issued and not-yet-invoiced items are added to an invoice,
- the same issue must never be invoiced twice,
- one distribution order may appear gradually on several invoices,
- distribution of the garantovaný nákupní benefit appears as a separate item on the existing partner invoice,
- the partner receives one combined invoice for existing services and benefit distribution.

Example invoice item:

```text
Distribuce garantovaného nákupního benefitu [název] v soutěži [název] – 45 účtovaných vydání × 1 Kč
```

The superadmin sets the distribution price excluding VAT.

Example:

```text
1 Kč bez DPH za jedno účtované vydání
+ 21 % DPH
= 1,21 Kč včetně DPH
```

The superadmin can:

- set a global price for all partners,
- set the global price to 0 Kč,
- set an individual partner price including 0 Kč,
- change future pricing without changing historical billed amounts.

An individual partner price has priority over the global price. The price used for an approved order and issue must be stored as a historical snapshot so later price changes do not alter older billing.

The standard VAT rate is 21 %. The administration displays and stores the service price excluding VAT, and the invoice automatically adds the partner's applicable VAT rate.

### 17.10 Safe implementation requirement

The target model must be implemented additively and safely:

- existing historical vouchers, tickets, partner offers, winnings, and invoices must remain unchanged,
- the current ticket purchase must not be directly replaced without a rollback path,
- the new combined voucher-and-ticket purchase should use a new versioned atomic purchase flow,
- repeated requests must not cause double deduction, double ticket creation, double code issue, or double billing,
- approved voucher conditions and prices must be historically preserved,
- rollout should begin with Iconic Point and one controlled contest before broader activation.

This section describes the confirmed target model. It is not a statement that the full feature is already implemented in production.

The classic vouchers in sections 17.1–17.3 remain free for the partner. Their placement, contest-reward role, and business rules are not changed by the garantovaný nákupní benefit model.

---

## 18. Partner Offers

Partner Offers are a completed business module in OneMil.

They are not contest prizes.
They must not be stored in `winners` or `bonus_prizes`.
They are shown to users as offers, not as wins.
They are a partner distribution and performance channel.

Possible business modes include free placement, paid distribution, affiliate-like cooperation, direct partner activation, or hybrid models.

Partner Offers are important because they let companies reach users without becoming a contest prize sponsor.

---

## 19. Technology context for business understanding

Only high-level understanding is needed for business agents.

- Frontend: React
- Backend: Supabase
- Payments: Stripe
- Notifications: OneSignal
- AI chat: Bob via Supabase Edge Function `ai-chat`
- Marketing / reporting pipeline: Sofinity
- Hosting / publishing: Lovable
- Versioning: GitHub

Business agents do not need to modify these systems. They need to understand that they exist and are part of the operating model.

---

## 20. Bob AI chat

Bob is the AI assistant inside OneMil.

Bob helps users:

- understand contests
- navigate the app
- understand winnings
- find vouchers and offers
- request support

Bob is part of user support and user experience, not the business definition of OneMil.

---

## 21. Sofinity

Sofinity is the marketing, event, and reporting pipeline connected to OneMil.

It can receive event data such as:

- registrations
- voucher purchases
- MioCoin activity
- ticket purchases
- wins
- contest events
- notifications
- partner offer activity

Sofinity helps with reporting, marketing automation, and operational intelligence.

---

## 22. Admin and operations

The admin side of OneMil controls:

- contests
- prizes
- partners
- partner offers
- users
- payments
- support
- rules
- test data
- operational checks

Admin and production actions are sensitive and must follow the existing project rules in `CLAUDE.md` and `onemil_state.md`.

---

## 23. Main business value by audience

### For companies and e-shops

- reward customers without paying for unused rewards
- increase repeat purchases
- motivate larger orders
- create campaigns
- get measurable performance
- get product and brand exposure
- use OneMil as a loyalty and marketing channel
- place their own vouchers in the main OneMil voucher offer for free within the cooperation
- place their own vouchers into selected contests
- order paid or zero-price distribution of the garantovaný nákupní benefit in selected contests
- use vouchers to support clearance sales, seasonal campaigns, selected products, and older stock

### For end users

- get MioCoins
- activate coupons
- unlock vouchers
- receive one garantovaný nákupní benefit with each supported purchase
- receive the related contest ticket free as a bonus
- enter contests
- win physical prizes
- receive partner offers
- use personal codes to earn MioCoin rewards

### For influencers

- promote OneMil and partner campaigns
- bring users
- receive measurable commissions or campaign rewards
- participate in campaigns with tracked performance

### For agencies and sales representatives

- bring e-shops and brands to OneMil
- receive long-term commission from amounts excluding VAT actually invoiced by OneMil to brought e-shops
- bring end users and receive commission from their paid top-ups
- keep customer top-up commission or assign it to a selected sales representative, collaborator, or approved affiliate account
- help clients use OneMil as a customer reward channel

### For starting brands

- get visibility
- provide products into contests or campaigns
- reach new customers
- benefit from OneMil promotion

---

## 24. Short official description

OneMil is a B2B reward, partner, and marketing platform for e-shops, companies, brands, influencers, and agencies. It lets companies reward customers with MioCoins, coupons, vouchers, partner offers, and contest experiences. For end users, OneMil works as a premium reward app where they can activate rewards, use MioCoins, receive a garantovaný nákupní benefit with a free contest ticket, access partner offers, and join consumer contests for physical prizes.

---

## 25. Czech official description

OneMil je B2B odměnová, partnerská a marketingová platforma pro e-shopy, firmy, značky, influencery a agentury. Firmám umožňuje odměňovat zákazníky pomocí MioCoinů, kuponů, voucherů, partnerských nabídek a soutěžních zážitků. Pro koncového uživatele OneMil funguje jako prémiová odměnová aplikace, kde může aktivovat odměny, používat MioCoiny, získat garantovaný nákupní benefit a k němu soutěžní tiket zdarma, využívat partnerské nabídky a zapojovat se do spotřebitelských soutěží o věcné výhry.

---

## 26. What assistants must understand

Every assistant must understand this:

```text
OneMil is not just a contest app.
OneMil is a partner reward system for companies, with a premium contest and reward experience for users.
```

The partner pays only for activated / used MioCoins, not for all distributed coupons.

Companies choose how many MioCoins they want to give customers.

Users can earn MioCoins through personal codes.

Influencers and agencies can be growth and commission channels.

Agencies and sales representatives can receive commission from amounts excluding VAT actually invoiced by OneMil to brought e-shops and can control who receives customer top-up commissions within their approved affiliate structure.

Partners can place their own classic vouchers in the main OneMil voucher offer or into selected contests free of charge as part of the cooperation. These vouchers can support clearance sales, seasonal campaigns, selected products, and older stock.

The **garantovaný nákupní benefit** is a separate supported-purchase model: the customer receives one garantovaný nákupní benefit and a contest ticket free as a bonus. Its distribution can be priced globally or per partner, including an explicit 0 CZK price, and only the first issuance of the same benefit to the same customer is billable.

This is a confirmed target model, not confirmation that the full feature is already deployed.

Partner Offers, vouchers, coupons, contests, MioCoins, and social campaigns are different parts of the same reward ecosystem.

---

## 27. Open items to define later

- exact billing email
- exact legal wording for partner contracts
- exact customer-facing legal wording for the garantovaný nákupní benefit + free ticket model
- final VAT and accounting review for the combined invoice implementation
- exact influencer commission model if it changes from current implementation
- exact B2B onboarding flow for e-shops
- exact API integration package for partners
- exact rules for social contests
- exact draw method for social contests
- final public wording for personal code system
- brand rules for business documents

Do not invent these details. Ask Pavel Diviš or mark them as TODO until confirmed.
