# Full system audit – pre-production

**Date:** After voucher DB migration applied.  
**Scope:** Database, backend (edge functions), frontend, security, production readiness.

---

## 1. Database

### 1.1 Security (RPCs and RLS)

| Area | Status | Notes |
|------|--------|--------|
| **buy_ticket_atomic** | OK | Enforces `p_user_id = auth.uid()` (20260315130000). |
| **buy_voucher_atomic** | OK | Same. |
| **redeem_miocoin** | OK | Uses contest_id + ticket_position and winners; no bonus_prizes.user_id. |
| **redeem_voucher** | OK | Fixed in 20260315150000; uses `redeem_price_vouchers`. |
| **close_contest** | OK | SECURITY DEFINER, `SET search_path TO 'public'`; used by edge function. |
| **deduct_wallet_for_refund** | OK | Atomic update; used by stripe-refund. |
| **RLS user_contest_favorites** | OK | SELECT/INSERT/DELETE with `user_id = auth.uid()`. |
| **RLS user_vouchers** | OK | SELECT/INSERT/DELETE with `user_id = auth.uid()`. |

### 1.2 event_queue RLS – superadmin

- **Issue:** Policy "Admins can view event queue" uses `users.role = 'admin'` only (20251030191723).  
- **Effect:** Users with `role = 'superadmin'` cannot SELECT from `event_queue`; Admin Event Queue page will show empty or error for them.  
- **Fix (optional):** Run in SQL Editor when you use superadmin:

```sql
DROP POLICY IF EXISTS "Admins can view event queue" ON public.event_queue;
CREATE POLICY "Admins can view event queue"
ON public.event_queue FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role IN ('admin', 'superadmin')
  )
);
```

### 1.3 Wallets

- **CHECK constraint** `wallets_balance_coins_non_negative` added as NOT VALID. After ensuring no negative balances, run:  
  `ALTER TABLE public.wallets VALIDATE CONSTRAINT wallets_balance_coins_non_negative;`

---

## 2. Edge functions

### 2.1 Env and secrets

- All functions use `Deno.env.get('SUPABASE_URL')` and `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` (or ANON where appropriate). No hardcoded URLs or keys in code.
- **Exception (low risk):** `daily-onboarding-reminder` has fallback  
  `const appUrl = Deno.env.get("APP_URL") || "https://xkzhjldrojjlrkezorey.lovableproject.com";`  
  **Recommendation:** Set `APP_URL` in production (e.g. your real app domain) so the fallback is not used.

### 2.2 close-contest – admin check

- **Issue:** Function checks `userData.role !== 'admin'` (from `users` table). Users with `role = 'superadmin'` get "Admin access required".
- **Recommendation:** Allow both roles, e.g.  
  `if (userError || !userData || !['admin', 'superadmin'].includes(userData.role)) { throw new Error('Admin access required'); }`

### 2.3 stripe-refund – admin check

- Uses `user_roles` table with `.eq('role', 'admin')`. If your app grants admin via `users.role` (admin/superadmin) and not via `user_roles`, ensure stripe-refund’s role check matches your model (e.g. check `users.role IN ('admin','superadmin')` if that’s the source of truth).

---

## 3. Frontend

### 3.1 Env and config

- No hardcoded Supabase URL or anon key. All use `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` or `supabaseUrl` from `@/integrations/supabase/client`.
- **Production:** Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build environment.

### 3.2 Admin role

- **useUserRole:** `isAdmin = role === 'admin' || role === 'superadmin'` (from `users.role`). Consistent with SYSTEM_MAP and most RLS.
- **Admin routes:** Protected by `isAdmin`; unauthenticated or non-admin get redirect/empty state where implemented.

### 3.3 Error handling

- **ErrorBoundary** wraps the app (App.tsx); catches render errors and shows a fallback with “Return to Homepage”. No per-route boundaries; consider adding for critical flows if desired.

---

## 4. Production checklist

| Item | Action |
|------|--------|
| **Env (app)** | Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` for production build. |
| **Env (Supabase)** | Edge secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, etc. as needed. |
| **Wallets CHECK** | After confirming no negative balances: `ALTER TABLE public.wallets VALIDATE CONSTRAINT wallets_balance_coins_non_negative;` |
| **Superadmin** | If you use `superadmin`: apply event_queue RLS fix and close-contest role check change above. |
| **APP_URL** | Set in edge function secrets for daily-onboarding-reminder (and any other function that builds links). |

---

## 5. Remaining issues summary

| Severity | Issue | Where | Fix |
|----------|--------|--------|-----|
| **Low** | event_queue RLS allows only `role = 'admin'` | DB policy | Optional SQL above to include superadmin. |
| **Low** | close-contest allows only `role === 'admin'` | Edge function | Allow `['admin','superadmin']` in code. |
| **Low** | APP_URL fallback to lovable URL | daily-onboarding-reminder | Set APP_URL in production. |
| **Info** | stripe-refund uses user_roles.role = 'admin' | Edge function | Align with your admin model (users.role vs user_roles) if needed. |
| **Info** | Wallets CHECK not validated | Migration note | Run VALIDATE after checking data. |

---

## 6. No critical bugs found

- No exposed secrets in repo.
- Critical RPCs (buy ticket, buy voucher, redeem_miocoin, redeem_voucher, close_contest, deduct_wallet_for_refund) are secured and schema-aligned.
- RLS on user_contest_favorites and user_vouchers is correct. event_queue is admin-only; only superadmin needs the optional policy update if you use that role.
- Frontend uses env for Supabase; ErrorBoundary is in place.

**Conclusion:** System is in good shape for production. Address the low-severity items (superadmin consistency, APP_URL, wallet VALIDATE) as part of your go-live steps.
