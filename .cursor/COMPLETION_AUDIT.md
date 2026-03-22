# Application completion audit (summary)

## 1. Voucher redeem flow

**DB:** `redeem_voucher(p_voucher_id)` exists but references `vouchers.value` and `vouchers.code`. Those columns were removed in migrations (e.g. `20250922182656`, `20250922173229`). So the function would raise at runtime if called.

**Current app flow:** User buys a voucher with 5 MioCoin (`buy_voucher_atomic`) → gets a `user_vouchers` row with `redeemed=true` and a display code `OMV-{id}`. "Copy code" is used to use the voucher elsewhere.

**Planned UI:** Add an "Uplatnit voucher" (Redeem) action that calls `supabase.rpc('redeem_voucher', { p_voucher_id })` for a voucher the user has. Handle JSON response (`success`, `message`) and show toast. When the DB is updated (restore `value`/`code` on `vouchers` or change `redeem_voucher` to match current schema), the button will work. No DB changes in this task.

---

## 2. Admin tools and missing screens

**AdminMenu (sidebar)** has: Dashboard, Výhry, Uživatelé, Onboarding, Zprávy, Platby, Vouchery, Bannery, Partneři, Faktury, Referral, Ref. Dashboard, Influenceři, Kampaně, Výplaty, Obsah, Souhlasy, Notifikace, Statistiky, Audit, Testy.

**Routes in App.tsx** also include:
- `/admin/contest/:contestId` → ContestDetailAdmin (linked from AdminContestManagement table)
- `/admin/audit-repair` → AdminAuditRepair
- `/admin/onemil-audit` → OneMilAudit  
- `/admin/partners-portal` → AdminPartnersPortal

**Gap:** Audit repair, OneMil audit, and Partners portal are not in the AdminMenu nav, so admins may not discover them. **Action:** Add these to AdminMenu.

**SYSTEM_MAP admin views:** admin_contest_status, admin_bonus_overview, admin_bonus_delivery_status are used by AdminPrizeDelivery / AdminBonusOverview. No dedicated "Cron" or "Email queue" admin screen; deferred.

---

## 3. Contest management UI

- **AdminContestManagement:** Table of contests, create/edit modal, status change, close contest button (calls edge function), link to `/admin/contest/:contestId`.
- **ContestDetailAdmin:** Single contest view, prize management, close contest (hardcoded Supabase URL).
- **Close contest** is invoked via `fetch('https://xkzhjldrojjlrkezorey.supabase.co/functions/v1/close-contest', ...)` in two places — should use `import.meta.env.VITE_SUPABASE_URL` for production.

---

## 4. Production readiness

**Hardcoded Supabase URL** (`https://xkzhjldrojjlrkezorey.supabase.co`) appears in:
- TicketResultModal.tsx, AdminWinners.tsx, WinDetailModal.tsx, WinCard.tsx, useLatestWinners.ts, useAdminPresenceCount.ts, ShareTicket.tsx, MioCoin.tsx
- AdminPayments.tsx (stripe-refund URL), AdminContestManagement.tsx (close-contest URL), ContestDetailAdmin.tsx (close-contest URL)
- AdminDashboard.tsx (sofinityUrl, contest image base)

**Action (done):** Replaced hardcoded Supabase URL with `import.meta.env.VITE_SUPABASE_URL` or `supabaseUrl` from `@/integrations/supabase/client` in: TicketResultModal, AdminWinners, AdminPayments, useLatestWinners, WinDetailModal, WinCard, useAdminPresenceCount, ShareTicket, MioCoin, ContestDetailAdmin, AdminContestManagement, AdminDashboard. Exported `supabaseUrl` from client. AdminPayments and useAdminPresenceCount use `VITE_SUPABASE_ANON_KEY` from env.

**No DB changes** in this task.

---

## Production checklist (summary)

- **Env:** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in production (no hardcoded URLs/keys in app code).
- **Voucher redeem (DB):** The RPC `redeem_voucher` still references removed columns (`vouchers.value`, `vouchers.code`). To support “spend voucher balance to get voucher” flow, add a migration that either restores those columns or rewrites the function to match the current schema.
- **Admin:** Audit repair, OneMil audit, and Partners portal are linked from AdminMenu.
- **Contest close:** Close-contest edge function is called with env-based URL in both AdminContestManagement and ContestDetailAdmin.
