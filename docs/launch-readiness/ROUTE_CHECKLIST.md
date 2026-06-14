# OneMil — ROUTE CHECKLIST (mapa stránek a odkazů)

> Připraveno pro launch testing. Pouze dokumentace — žádná změna kódu/SQL/produkce.
> Zdroj rout: `src/App.tsx` (router). Stránky: `src/pages/*`.
> Legenda priority: **P0** = blokuje veřejné spuštění · **P1** = důležité, ne nutně blokující · **P2** = nice-to-have.
> Kde si nejsem jist přesným chováním bez ručního ověření, je uvedeno **NEOVĚŘENO**.

## Zákaznické stránky (public / přihlášený zákazník)

### `/` — Homepage
- **Pro koho:** veřejnost + zákazník
- **Vidět:** hero banner, aktivní soutěže, karty výherců (rotující pozadí), „Připravujeme" bannery, MioCoin sekce
- **Klik:** soutěž → `/contest/:id`, login/register, navigace
- **Stane se:** načte aktivní soutěže a výherce
- **DB:** pouze čtení (contests, winners, banners)
- **Nesmí:** zobrazit hazardní/loterie wording; zobrazit B2B/partner billing text
- **Stav:** P0

### `/login` — Login (sdílený: zákazník + admin/superadmin)
- **Pro koho:** zákazník, admin
- **Vidět:** e-mail/heslo, social tlačítka (Google/Facebook dle configu), odkaz na registraci
- **Klik:** přihlásit, social login
- **Stane se:** admin check první → admin projde vždy; zákazník na `/`
- **DB:** auth session
- **Nesmí:** blokovat admina kvůli partners/affiliate; uzavřít jen pro zákazníky
- **Stav:** P0

### `/register` — Register
- **Pro koho:** nový zákazník
- **Vidět:** registrační formulář, social tlačítka
- **Klik:** registrovat
- **Stane se:** vytvoření auth usera; onboarding (date-of-birth 18+)
- **DB:** auth.users, profiles, wallets (dle triggerů/flow)
- **Nesmí:** povolit <18; tichý fail
- **Stav:** P0

### `/onboarding/date-of-birth` — OnboardingDateOfBirth
- **Pro koho:** nový zákazník · **Vidět:** zadání data narození (18+) · **DB:** profiles · **Nesmí:** pustit <18 · **Stav:** P0

### `/profile` — Profile
- **Pro koho:** zákazník
- **Vidět:** identita, peněženka/MioCoin, „Pozvi přátele" (ReferralSection), „Doporučit OneMil oblíbenému obchodu" (mailto), Účet, přihlašovací/osobní údaje, **Uplatnit MioCoin kód** (RedeemMioCoinCard)
- **Klik:** uložit profil, uplatnit kód, mailto doporučení
- **Stane se:** redeem kódu → wallet credit; profile upsert
- **DB:** profiles (insert/update own), wallets, wallet_transactions, partner_reward_codes (redeem)
- **Nesmí:** uplatnit `pending`/`cancelled`/`activated` kód; připsat bez platného kódu
- **Stav:** P0

### `/games` — Games
- **Pro koho:** zákazník · **Vidět:** seznam soutěží · **Klik:** detail soutěže · **DB:** read contests · **Stav:** P0

### `/favorite-games` — FavoriteGames
- **Pro koho:** zákazník · **Vidět:** oblíbené soutěže · **Stav:** P1

### `/contest/:id` — ContestDetail
- **Pro koho:** zákazník
- **Vidět:** detail soutěže, hlavní výhra, bonusové/věcné výhry (badge `N× v soutěži`), MioCoin/bonus souhrn, nákup ticketu
- **Klik:** koupit ticket
- **Stane se:** `buy_ticket_atomic` RPC; výsledek (won_type) → modal
- **DB:** tickets, wallets, winners/bonus dle výsledku
- **Nesmí:** Partner Offers počítat do vzdálenosti k výhře; měnit `buy_ticket_atomic` chování
- **Stav:** P0

### `/my-contests` — MyContests / `/my-contest/:id` — MyContestDetail
- **Pro koho:** zákazník · **Vidět:** moje účasti, moje tikety · **DB:** read tickets · **Stav:** P1

### `/bonus/:id` — BonusDetail
- **Pro koho:** zákazník · **Vidět:** detail bonusu · **Stav:** P2

### `/vouchers` — Vouchers
- **Pro koho:** zákazník
- **Vidět:** tři taby (katalog/koupené/…), voucher karty
- **Klik:** koupit/uplatnit voucher
- **Stane se:** voucher redemption / nákup
- **DB:** vouchers (world-readable katalog), user_vouchers, wallets
- **Stav:** P0

### `/wins` — Wins
- **Pro koho:** zákazník · **Vidět:** taby Výhry / Nabídky (Partner Offers) · **Nesmí:** Partner Offers jako výhry soutěže · **Stav:** P0

### `/winners` — Winners
- **Pro koho:** veřejnost · **Vidět:** výherci (WinnerCard, rotující pozadí) · **DB:** read winners · **Stav:** P1

### `/messages` — Messages / `/messages/:id` — MessageDetail
- **Pro koho:** zákazník
- **Vidět:** chat s Bobem (AI) nebo adminem; při Bob OFF routuje na admina + handoff toast (sonner)
- **Klik:** poslat zprávu
- **Stane se:** AI odpověď (ai-chat) nebo admin handoff; realtime
- **DB:** messages
- **Nesmí:** volat ai-chat při Bob OFF; měnit `{ text, cta }` kontrakt / CTA routing
- **Stav:** P0

### `/payment/success` + `/payment-success` — PaymentSuccess
- **Pro koho:** zákazník po Stripe · **Vidět:** potvrzení · **DB:** wallet credit přes stripe-webhook (ne zde) · **Stav:** P0

### `/payment/cancel` + `/payment-cancel` — PaymentCancel
- **Pro koho:** zákazník · **Vidět:** zrušená platba · **Stav:** P1

### `/share/ticket/:ticketId` — ShareTicket
- **Pro koho:** veřejnost (sdílení) · **Vidět:** OG sdílení ticketu · **Stav:** P2

## Právní / veřejné stránky

| URL | Stránka | Pro koho | Obsah | Stav |
|-----|---------|----------|-------|------|
| `/privacy` | PrivacyPolicy | veřejnost | ochrana osobních údajů | P0 |
| `/terms` | TermsConditions | veřejnost | obchodní podmínky | P0 |
| `/kontakt` | Kontakt | veřejnost | kontaktní údaje | P0 |
| `/vop` | SlugContentPage(vop) | veřejnost | VOP (CMS obsah) | P0 — **NEOVĚŘENO zda naplněno** |
| `/gdpr` | SlugContentPage(gdpr) | veřejnost | GDPR (CMS obsah) | P0 — **NEOVĚŘENO zda naplněno** |
| `/pravidla-souteze` | SlugContentPage(pravidla-souteze) | veřejnost | pravidla soutěží (CMS) | P0 — **NEOVĚŘENO zda naplněno** |
| `/:section/:slug` | ContentPage | veřejnost | dynamický CMS obsah | P1 |
| `/unsubscribe/marketing` | UnsubscribeMarketing | příjemce e-mailu | odhlášení marketingu | P1 |
| `/delete-account` | DeleteAccount | zákazník | smazání účtu (GDPR) | P0 |

## Partner stránky

| URL | Stránka | Pro koho | Klíčové chování | Nesmí | Stav |
|-----|---------|----------|-----------------|-------|------|
| `/partner/login` | PartnerLogin | partner | pustí jen účet s `partners` řádkem | pustit ne-partnera | P0 |
| `/partner/register` | PartnerRegister | nový partner | žádost o registraci | vytvořit provizi | P1 |
| `/partner/invite` | CompanyLeadConfirm | firma (public, token) | confirm/reject lead | partner/refs/provizi při confirm | P1 |
| `/partner/set-password` | PartnerSetPassword | partner (recovery link) | nastavení hesla | logovat recovery link | P1 |
| `/partner/dashboard` | PartnerDashboard | schválený partner | konverze MioCoinů + helper, Fakturace MioCoinů karta, API klíče, **Stav napojení API** karta | měnit billing/konverzní logiku | P0 |
| `/partner/invoices` | PartnerInvoices | partner | vlastní faktury, PDF download (signed URL) | vidět cizí faktury | P0 |
| `/partner/messages` | PartnerMessages | partner | zprávy | — | P2 |

## Affiliate / influencer stránky

| URL | Stránka | Pro koho | Stav |
|-----|---------|----------|------|
| `/affiliate/login` | AffiliateLogin | affiliate (jen `affiliate_accounts` řádek) | P1 |
| `/affiliate/register` | AffiliateRegister | nový affiliate | P1 |
| `/affiliate/dashboard` | AffiliateDashboard | affiliate (Influencer/Obchodník/Profil) | P1 |
| `/influencer` | InfluencerLanding | veřejnost | P2 |
| `/influencer/how-to-earn` | InfluencerHowToEarn | veřejnost | P2 |
| `/influencer/register` | InfluencerRegister | nový influencer | P2 |
| `/influencer/dashboard` | → redirect `/affiliate/dashboard` | affiliate | P2 |
| `/influencer/messages` | InfluencerMessages | influencer | P2 |

## Admin stránky (guard: admin/superadmin; ne-admin redirect)

| URL | Stránka | Účel | Stav |
|-----|---------|------|------|
| `/admin` | AdminDashboard | rozcestník | P0 |
| `/admin/users` | AdminUsers | správa uživatelů | P1 |
| `/admin/banners` | AdminBanners | homepage bannery | P1 |
| `/admin/vouchers` | AdminVouchers | přehled voucherů | P0 |
| `/admin/payments` | AdminPayments | platby | P1 |
| `/admin/statistics` | AdminStatistics | statistiky | P2 |
| `/admin/notifications` | AdminNotifications | push/notifikace | P2 |
| `/admin/winners` | AdminWinners | výherci | P1 |
| `/admin/prize-delivery` | AdminPrizeDeliveryPage | předání výher | P1 |
| `/admin/tests` | AdminTests | test dashboard (`admin-create-test-user` VYPNUT) | P2 |
| `/admin/partners` | AdminPartners | partneři (+ pending badge) | P0 |
| `/admin/partner-offers` | AdminPartnerOffers | partner nabídky | P1 |
| `/admin/messages` + `/:userId` | AdminMessages / AdminMessageThread | zprávy + Bob ON/OFF přepínač | P0 |
| `/admin/audit-logs` | AdminAuditLogs | audit | P2 |
| `/admin/event-queue` | AdminEventQueue | event pipeline | P2 |
| `/admin/audit-repair` | AdminAuditRepair | oprava eventů | P2 |
| `/admin/onemil-audit` | OneMilAudit | interní audit | P2 |
| `/admin/contest/:contestId` | ContestDetailAdmin | detail/úprava soutěže (Ekonomika tab) | P0 |
| `/admin/content` | AdminContentPages | CMS stránky (VOP/GDPR/pravidla) | P0 |
| `/admin/legal-acceptances` | AdminLegalAcceptances | souhlasy | P1 |
| `/admin/onboarding-incomplete` | AdminOnboardingIncomplete | nedokončený onboarding | P2 |
| `/admin/partners-portal` | AdminPartnersPortal | partner portál admin | P1 |
| `/admin/invoices` | AdminInvoices | partner faktury (draft→Odeslat, issued→Znovu odeslat) | P0 |
| `/admin/referrals` | AdminReferrals | doporučení a odměny | P1 |
| `/admin/referral-dashboard` | AdminReferralDashboard | referral přehled | P2 |
| `/admin/influencers` | AdminInfluencers | affiliate partneři (legacy) | P1 |
| `/admin/affiliate-accounts` | AdminAffiliateAccounts | affiliate v2 účty | P1 |
| `/admin/influencer-commissions` | AdminInfluencerCommissions | výplaty affiliate | P1 |
| `/admin/influencer-campaigns` | AdminInfluencerCampaigns | affiliate kampaně | P2 |
| `/admin/company-leads` | AdminCompanyLeads | B2B leady (approve/reject) | P1 |
| `/admin/affiliate-commissions` | AdminAffiliateCommissions | provize obchodníků | P1 |
| `/admin/affiliate-payouts` + `/:batchId` | AdminAffiliatePayouts / Detail | dávkové výplaty + Air Bank export | P1 |
| `/admin/*` | AdminNotFound | fallback | P2 |

## Fallback / ostatní
- `*` → `NotFound` (P1) — musí korektně zobrazit 404, ne bílou stránku.
- `TestLogin.tsx`, `InfluencerDashboard.tsx` — v `src/pages/` existují, ale **nejsou v routeru** (NEOVĚŘENO zda mrtvý kód) → todo.
