# OneMil — SECURITY FINDINGS INVENTORY (SEC01)

> Documentation-only inventory of the production Supabase **Security Advisor** findings.
> Source: `get_advisors(security)` on production `xkzhjldrojjlrkezorey`, read-only, 14. 06. 2026.
> No code, SQL, RLS, deploy, or production data changed. Nothing marked fixed without proof.
>
> **Totals (production, 14.06): 467 findings — 23 ERROR · 20 INFO · 424 WARN.**
> The **23 ERROR-level findings = the "23 pre-existing findings" referenced in SEC01** (2 Exposed Auth Users + 1 RLS Disabled in Public + 20 Security Definer View).
>
> **SEC01 remains a P0 launch blocker** until each finding below is individually fixed or explicitly accepted by the owner.
>
> ### UPDATE 14.06.2026 — Group 1 safe fixes APPLIED + VERIFIED on STAGING **and PRODUCTION**
> 11 app-unused SECURITY DEFINER views had `SELECT` revoked from `anon`/`authenticated` and `security_invoker=on` set (migration `sec01_group1_safe_view_hardening`).
> **STAGING** (`dxmowysntemfqfnanxua`): postcheck 11/11 (anon=f, auth=f, invoker=t); Full E2E `27510668205` = 121 passed/0 fail.
> **PRODUCTION** (`xkzhjldrojjlrkezorey`, owner-approved by Pavel): precheck matched baseline → forward SQL applied → postcheck 11/11 (anon revoked, auth revoked, invoker on) → advisor **ERROR 23 → 10** (all 11 targeted views' findings gone, incl. both Exposed Auth Users) → production P0 smoke `27511158470` = success, 5 passed. **No rollback needed.**
> Group-1 ERROR findings (E01/E02/E04/E06/E07/E08/E10/E11/E12/E13/E15/E16/E21) are now **fixed (production, verified)**.
> **SEC01 STILL A P0 BLOCKER:** 10 ERROR remain in production — **1 RLS Disabled in Public** (`_messages_policies_backup`, Group 2) + **9 Security Definer View** (Group 2/3). Plus the WARN/INFO categories. Group 1 only is closed.
>
> ### UPDATE 14.06.2026 — Group 2 safe/interim APPLIED + VERIFIED on PRODUCTION (`xkzhjldrojjlrkezorey`, owner-approved by Pavel)
> Same migration `sec01_group2_safe_interim_hardening` applied to production after precheck matched baseline. Postcheck: E03 rls_enabled=true/anon=f/auth=f; E14 anon=f/auth=f/invoker=on; 3 admin views anon=f/auth=t. Production advisor **ERROR 10 → 8** (E03 + E14 cleared; remaining 8 all Security Definer View). Production P0 smoke `27511945205` = success, 5 passed. **No rollback needed.**
> E03/E14 now **fixed (production, verified)**; E05/E09/E23 **interim (production): anon revoked; Security Definer View ERROR remains** (security_invoker = owner decision). SEC01 stays **P0 blocker** — 8 ERROR remain in production.
>
> ### (earlier) Group 2 safe/interim APPLIED + VERIFIED on STAGING (`dxmowysntemfqfnanxua`)
> Migration `sec01_group2_safe_interim_hardening` (no table drops, no `security_invoker` on admin views):
> - **E14 `valid_partner_api_keys`** — revoked anon+auth + `security_invoker=on` → **cleared on staging**.
> - **E03 `_messages_policies_backup`** — `ENABLE ROW LEVEL SECURITY` + revoked anon+auth (table NOT dropped) → **cleared on staging** ("RLS Disabled in Public" gone).
> - **E05 `contest_activity_last_24h` / E09 `admin_winner_delivery_stats` / E23 `contest_revenue`** — **anon revoked, authenticated kept** (interim hardening; admin UI reads as authenticated). Their **Security Definer View ERROR REMAINS** (no `security_invoker` yet → owner decision pending).
> Postcheck: E03 rls_enabled=true/anon=f/auth=f; E14 anon=f/auth=f/invoker=on; 3 admin views anon=f/auth=t.
> Staging advisor: **ERROR 10 → 8** (E03 + E14 cleared; 8 remaining all Security Definer View). Full Staging E2E `27511465619` = success, **122 passed, 0 failures** → no admin-page regression (`/admin/contest/:id`, `/admin/prize-delivery` covered).
> **Production NOT touched.** SEC01 stays **P0 blocker** (8 ERROR remain on staging; production unchanged).
>
> ### UPDATE 14.06.2026 — E09 `security_invoker` APPLIED + VERIFIED on PRODUCTION (`xkzhjldrojjlrkezorey`, owner-approved)
> Same `ALTER VIEW ... SET (security_invoker = on)` applied to production after baseline capture. Postcheck: invoker on; output unchanged (127 rows / 101 winners). Production advisor **ERROR 8 → 7** (E09 gone). Production P0 smoke `27512629715` = success, 5 passed. **No rollback needed.** E09 now **fixed (production, verified)**. SEC01 stays **P0 blocker** — 7 ERROR remain in production (E05, E23 + Group 3).
>
> ### (earlier) E09 `security_invoker` APPLIED + VERIFIED on STAGING only
> `ALTER VIEW public.admin_winner_delivery_stats SET (security_invoker = on)` (migration `sec01_e09_admin_winner_delivery_stats_security_invoker`). Safe because its underlying tables have admin-readable RLS (`contests.contests_admin_select_all` + `winners` authenticated read). Postcheck: invoker on; output unchanged (786 rows / 297 winners). Staging advisor **ERROR 8 → 7** (E09 gone). Full Staging E2E `27512219000` = success, **122 passed, 0 failures** → `/admin/prize-delivery` works. **Production NOT touched.**
> **Important:** E05 (`contest_activity_last_24h`) and E23 (`contest_revenue`) must NOT get `security_invoker` — they read `tickets`, which has RLS enabled with **no policy** (deny-all for authenticated) → would zero out admin totals. They stay interim (anon revoked) pending a `tickets` admin-read policy (separate owner decision) or formal accept.
>
> ### UPDATE 14.06.2026 — E05/E23 RESOLVED on STAGING via tickets admin-read policy + `security_invoker`
> Migration `sec01_e05_e23_tickets_admin_read_and_invoker` (staging `dxmowysntemfqfnanxua`): added additive `tickets_admin_select_all` SELECT policy (`has_role admin/superadmin`), then set `security_invoker=on` on E05 + E23. The tickets policy is gated by admin role → no customer-privacy impact (non-admins keep own-row reads). Postcheck: policy present, both invoker on, service-role output unchanged (activity 7 rows / revenue 789 rows / tickets_sold 1153). Staging advisor **ERROR 7 → 5** (E05+E23 gone; remaining 5 = Group 3 only: `contest_miocoin_totals`, `contest_progress`, `partner_api_activity`, `v_influencer_referrals_paid`, `winners_with_contest`). Full Staging E2E `27512846743` = success, **122 passed, 0 failures** → `/admin/contest/:id`, TicketMapAdmin, AdminContestManagement work with correct numbers. **Production NOT touched** (prod still has E05/E23 as interim anon-revoked). SEC01 stays **P0 blocker**.
>
> Status values: `fixed` (proof in repo/docs) · `open` (must fix/triage) · `needs owner decision` · `accepted-risk candidate`.

## A) ERROR-level findings — the SEC01 "23" (must resolve or owner-accept before launch)

| # | Severity | Category | Affected object | Status | Evidence | Recommended next action |
|---|----------|----------|-----------------|--------|----------|--------------------------|
| E01 | ERROR | Exposed Auth Users | `public.v_influencer_referrals_valid` (view) | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E02 | ERROR | Exposed Auth Users | `public.daily_platform_metrics` (view) | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E03 | ERROR | RLS Disabled in Public | `public._messages_policies_backup` (table) | fixed (production, verified) | migration `sec01_group2_safe_interim_hardening`; prod advisor 10→8; smoke 27511945205 | Done (ENABLE RLS + revoke; NOT dropped). Optional DROP = separate owner decision |
| E04 | ERROR | Security Definer View | `public.v_user_wallets` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E05 | ERROR | Security Definer View | `public.contest_activity_last_24h` | fixed (staging, verified) / prod pending | `security_invoker=on` + new `tickets_admin_select_all` policy (staging, migration `sec01_e05_e23_tickets_admin_read_and_invoker`); staging advisor 7→5; E2E 27512846743; output unchanged | Safe once tickets has admin read-all. Prod apply pending owner approval (interim anon-revoke already on prod) |
| E06 | ERROR | Security Definer View | `public.daily_platform_metrics` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E07 | ERROR | Security Definer View | `public.contest_analytics` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E08 | ERROR | Security Definer View | `public.contest_ticket_map` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E09 | ERROR | Security Definer View | `public.admin_winner_delivery_stats` | fixed (production, verified) | `security_invoker=on` (prod, migration `sec01_e09_admin_winner_delivery_stats_security_invoker`); prod advisor 8→7; smoke 27512629715; output unchanged 127 rows/101 winners | Done — contests (admin read-all) + winners (authenticated read) cover RLS |
| E10 | ERROR | Security Definer View | `public.event_queue_monitoring` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E11 | ERROR | Security Definer View | `public.event_queue_failed_summary` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E12 | ERROR | Security Definer View | `public.contest_integrity_check` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E13 | ERROR | Security Definer View | `public.system_health_monitor` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E14 | ERROR | Security Definer View | `public.valid_partner_api_keys` | fixed (production, verified) | migration `sec01_group2_safe_interim_hardening`; prod advisor 10→8; smoke 27511945205 | Done (unused → revoked anon/auth + security_invoker on) |
| E15 | ERROR | Security Definer View | `public.admin_winner_delivery_detail` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E16 | ERROR | Security Definer View | `public.v_first_topup_valid` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E17 | ERROR | Security Definer View | `public.v_influencer_referrals_paid` | open | advisor 14.06 | Review exposure |
| E18 | ERROR | Security Definer View | `public.partner_api_activity` | open | advisor 14.06 | Confirm partner-scoped, no cross-partner leak |
| E19 | ERROR | Security Definer View | `public.contest_miocoin_totals` | needs owner decision | advisor 14.06 | Likely public/contest data |
| E20 | ERROR | Security Definer View | `public.winners_with_contest` | needs owner decision | advisor 14.06 | Likely intentional public winners |
| E21 | ERROR | Security Definer View | `public.v_influencer_referrals_valid` | fixed (production, verified) | migration `sec01_group1_safe_view_hardening`; advisor 23→10; smoke 27511158470 | Done — revoked anon/auth + security_invoker on |
| E22 | ERROR | Security Definer View | `public.contest_progress` | needs owner decision | advisor 14.06 | Likely public contest data |
| E23 | ERROR | Security Definer View | `public.contest_revenue` | fixed (staging, verified) / prod pending | `security_invoker=on` + `tickets_admin_select_all` policy (staging, migration `sec01_e05_e23_tickets_admin_read_and_invoker`); staging advisor 7→5; E2E 27512846743; output unchanged | Safe once tickets has admin read-all. Prod apply pending owner approval (interim anon-revoke already on prod) |

## B) INFO-level findings — RLS Enabled, No Policy (20) — deny-all by default, confirm intended

One row per affected table; default behavior is deny-all to anon/authenticated (data reached only via `SECURITY DEFINER` RPC), which is usually safe but must be confirmed per table.

| # | Severity | Category | Affected table | Status | Evidence | Recommended next action |
|---|----------|----------|----------------|--------|----------|--------------------------|
| I01 | INFO | RLS Enabled No Policy | `audit_logs` | accepted-risk candidate | advisor 14.06 | Confirm admin-only access path |
| I02 | INFO | RLS Enabled No Policy | `cron_audit_log` | accepted-risk candidate | advisor 14.06 | Internal |
| I03 | INFO | RLS Enabled No Policy | `debug_event_log` | accepted-risk candidate | advisor 14.06 | Internal/debug |
| I04 | INFO | RLS Enabled No Policy | `email_queue` | accepted-risk candidate | advisor 14.06 | Service-role only |
| I05 | INFO | RLS Enabled No Policy | `influencer_campaign_bonuses_czk` | needs owner decision | advisor 14.06 | Confirm no UI read needed |
| I06 | INFO | RLS Enabled No Policy | `influencer_campaign_events` | needs owner decision | advisor 14.06 | Confirm |
| I07 | INFO | RLS Enabled No Policy | `influencer_campaign_partners` | needs owner decision | advisor 14.06 | Confirm |
| I08 | INFO | RLS Enabled No Policy | `influencer_campaigns` | needs owner decision | advisor 14.06 | Confirm |
| I09 | INFO | RLS Enabled No Policy | `partner_api_key_usage` | accepted-risk candidate | advisor 14.06 | Service-role/EF only |
| I10 | INFO | RLS Enabled No Policy | `partner_api_keys` | open | advisor 14.06 | **Priority** — confirm keys never reach client |
| I11 | INFO | RLS Enabled No Policy | `partner_api_requests` | accepted-risk candidate | advisor 14.06 | Internal |
| I12 | INFO | RLS Enabled No Policy | `partner_coin_activations` | needs owner decision | advisor 14.06 | Billing rows; confirm read path |
| I13 | INFO | RLS Enabled No Policy | `partner_reward_codes` | open | advisor 14.06 | Confirm codes not anon-readable (redeem is SECURITY DEFINER) |
| I14 | INFO | RLS Enabled No Policy | `push_log` | accepted-risk candidate | advisor 14.06 | Internal |
| I15 | INFO | RLS Enabled No Policy | `push_retry` | accepted-risk candidate | advisor 14.06 | Internal |
| I16 | INFO | RLS Enabled No Policy | `referral_attempts` | needs owner decision | advisor 14.06 | Confirm |
| I17 | INFO | RLS Enabled No Policy | `referral_blocked_users` | needs owner decision | advisor 14.06 | Confirm |
| I18 | INFO | RLS Enabled No Policy | `roles` | needs owner decision | advisor 14.06 | Confirm |
| I19 | INFO | RLS Enabled No Policy | `user_play_activity` | needs owner decision | advisor 14.06 | Confirm |
| I20 | INFO | RLS Enabled No Policy | `user_security_signals` | needs owner decision | advisor 14.06 | Confirm |

## C) WARN-level findings — grouped by category (424 total)

| # | Severity | Category | Count | Affected objects (sample) | Status | Evidence | Recommended next action |
|---|----------|----------|-------|---------------------------|--------|----------|--------------------------|
| W1 | WARN | Function Search Path Mutable | 102 | `public.*` functions w/o `SET search_path` (e.g. `buy_voucher_atomic`, `generate_referral_code`, `rotate_partner_api_key`, `send_push_via_onesignal`) | open (hardening) | advisor 14.06 | Add `SET search_path = ''` per function; bulk hardening migration (owner-approved) |
| W2 | WARN | Public Can Execute SECURITY DEFINER Function | 151 | incl. `buy_ticket_atomic`, `admin_manage_contest`, `activate_partner_reward_sql`, `ensure_wallet_exists` | needs owner decision | advisor 14.06 | Triage: most rely on internal guards (`is_admin()`, auth.uid()) = by-design; REVOKE public where not needed |
| W3 | WARN | Signed-In Users Can Execute SECURITY DEFINER Function | 156 | incl. `admin_*`, `create_affiliate_payout_batch`, `buy_ticket_atomic` | needs owner decision | advisor 14.06 | Same triage; admin RPCs WARN-by-design (is_admin guard) per CLAUDE.md |
| W4 | WARN | Public Bucket Allows Listing | 9 | `avatars`, `banner-images`, `contest-banners`, `contest-images`, `contest-rules`, `partner-logos`, `partner-offer-assets`, `ticket-shares`, `voucher-images` | needs owner decision | advisor 14.06 | Confirm each is intentional public asset bucket (note: `partner-invoices` is correctly NOT public) |
| W5 | WARN | RLS Policy Always True | 3 | `cookie_consents`, `event_queue` (×2) | accepted-risk candidate | advisor 14.06 | `cookie_consents` insert-true = by design (anon consent); confirm `event_queue` intended |
| W6 | WARN | Extension in Public | 2 | `pg_net`, `citext` | accepted-risk candidate | advisor 14.06 | Commonly accepted; owner sign-off (moving schemas is risky) |
| W7 | WARN | Leaked Password Protection Disabled | 1 | Supabase Auth (project setting) | needs owner decision | advisor 14.06 | **Quick win** — enable HaveIBeenPwned check in Auth settings (owner toggle) |

## D) Separately-completed security work (context, not in current findings)
Earlier targeted audits removed their items from the advisor list entirely (so they do **not** appear above). Proof in CLAUDE.md:
- CRITICAL `create_referral_reward_from_wallet_credit` public execute → `REVOKE` (CLAUDE.md "KRITICKÁ PRODUKČNÍ OPRAVA", postcheck anon=false).
- HIGH `referrals`/`referral_rewards`/`referral_codes` broad `USING(true)` SELECT → own-row + admin policies (CLAUDE.md "RLS OPRAVA EXPOZICE DAT"; these 3 tables are absent from B above = consistent).
- MEDIUM `admin-create-test-user` EF removed from production (CLAUDE.md).
- Affiliate-payout ACL patch — document/export RPCs service_role-only (DESIGN.md §17.3).

## E) Summary tally
- **Total current findings: 467** (23 ERROR · 20 INFO · 424 WARN).
- **Fixed/proven within current list: 0** (prior fixes are reflected by absence, not as resolved rows here).
- **Open (must fix/triage): 23 ERROR** + W1 (102 search_path hardening) + W7 (leaked password) flagged for action.
- **Needs owner decision / accepted-risk candidate: the INFO (20) + WARN (424)** categories above.

**SEC01 stays a P0 launch blocker** until each ERROR finding is individually fixed or explicitly accepted by the owner, and the owner-decision items are signed off. No fixes applied — this is enumeration only.
