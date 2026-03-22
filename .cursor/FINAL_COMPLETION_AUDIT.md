# Final completion audit

## 1. Voucher database functions – audit and fix

### Audit

- **`redeem_voucher(p_voucher_id)`** (in `20250922170617`): Used `vouchers.value` and `vouchers.code`, which were removed in `20250922182558` / `20250922173229`. The function would raise at runtime if called.
- **`get_available_vouchers(p_user_id)`** (same migration): Returned `v.code` and `v.value` from `vouchers`; same column mismatch.
- **`buy_voucher_atomic`** (in `20260315130000_security_fix_buy_and_redeem.sql`): Uses only current columns (MioCoin price 5, vouchers.redeemed_count, user_vouchers). No change needed.

### Fix (do not run automatically)

Migration **`supabase/migrations/20260315150000_fix_redeem_voucher.sql`**:

1. Adds **`vouchers.redeem_price_vouchers`** (NUMERIC DEFAULT 1): cost in `wallet.balance_vouchers` to redeem one voucher.
2. Replaces **`redeem_voucher`** to use `redeem_price_vouchers` instead of `value`, and logs `voucher_name` instead of `voucher_code`.
3. Replaces **`get_available_vouchers`** to return `v.name` as `code` and `COALESCE(v.redeem_price_vouchers, 1)` as `value`.

**Run manually** in Supabase SQL Editor when ready. No automatic DB changes.

---

## 2. Admin tools and missing screens

### Current coverage

- **AdminMenu** already includes: Dashboard, Výhry, Uživatelé, Onboarding, Zprávy, Platby, Vouchery, Bannery, Partneři, Faktury, Referral, Ref. Dashboard, Influenceři, Kampaně, Výplaty, Obsah, Souhlasy, Notifikace, Statistiky, Audit (audit-logs), Audit repair, OneMil audit, Partneři portál, Testy.
- **Routes:** All of the above have routes; `/admin/contest/:contestId` is reached from Dashboard (AdminContestManagement) table.

### SYSTEM_MAP vs UI

| SYSTEM_MAP entity / view   | Admin UI |
|----------------------------|----------|
| admin_contest_status       | Used in Dashboard (AdminContestManagement, tabs) |
| admin_bonus_overview       | AdminBonusOverview on Dashboard |
| admin_bonus_delivery_status| AdminPrizeDelivery on Dashboard |
| event_queue                | **Added:** Admin Event Queue screen (read-only list) |
| email_queue                | No screen – optional future |
| cron_audit_log             | No screen – optional future |
| event_forward_log          | No screen – optional future |

### Change made

- **New screen:** **Admin Event Queue** – page that lists `event_queue` (id, event_name, status, created_at, processed_at, retry_count, last_error, user_id, contest_id). Route: `/admin/event-queue`. Added to AdminMenu and App.tsx.

---

## 3. Final production readiness audit

- **Env:** All Supabase URLs and anon key use `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or `supabaseUrl` from client). No hardcoded host or key in app code.
- **Edge / backend:** close-contest, stripe-refund, and other edge calls use env-based URL where invoked from the app.
- **DB:** Run migration `20260315150000_fix_redeem_voucher.sql` manually when deploying; ensure `wallets.balance_coins >= 0` is validated (see `20260315140000_audit_improvements_close_wallet.sql`).
- **Voucher redeem:** After applying the migration, “spend voucher balance to get voucher” works via `redeem_voucher`. Current “buy with 5 MioCoin” flow is unchanged (`buy_voucher_atomic`).

---

## 4. Remaining critical bugs (identified)

- **None critical** from this pass. Observations:
  - **Admin Event Queue RLS:** Policy uses `users.role = 'admin'`. If your app uses `superadmin`, ensure admins can SELECT from `event_queue` (e.g. `role IN ('admin', 'superadmin')`) if needed.
  - **Voucher UI:** The “Uplatnit voucher” modal for **purchased** vouchers only shows/copies the code; it does not call `redeem_voucher`. That RPC is for the separate “voucher balance” redemption path. No bug; semantics are correct.
  - **Optional:** Add error boundaries on key admin pages to avoid full white-screen on uncaught errors.

---

## Summary

| Task                         | Outcome |
|-----------------------------|--------|
| Audit voucher DB functions  | Done; migration added to fix `redeem_voucher` and `get_available_vouchers`. |
| Review admin tools          | Done; Admin Event Queue screen added; other gaps documented. |
| Final production readiness  | Done; env-based config confirmed; migration run is manual. |
| Critical bugs               | None critical; minor notes above. |
