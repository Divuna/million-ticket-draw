# OneMil — SECURITY FINDINGS INVENTORY (SEC01)

> Documentation-only inventory of the production Supabase **Security Advisor** findings.
> Source: `get_advisors(security)` on production `xkzhjldrojjlrkezorey`, read-only, 14. 06. 2026.
> No code, SQL, RLS, deploy, or production data changed. Nothing marked fixed without proof.
>
> **Totals: 467 findings — 23 ERROR · 20 INFO · 424 WARN.**
> The **23 ERROR-level findings = the "23 pre-existing findings" referenced in SEC01** (2 Exposed Auth Users + 1 RLS Disabled in Public + 20 Security Definer View).
>
> **SEC01 remains a P0 launch blocker** until each finding below is individually fixed or explicitly accepted by the owner.
>
> Status values: `fixed` (proof in repo/docs) · `open` (must fix/triage) · `needs owner decision` · `accepted-risk candidate`.

## A) ERROR-level findings — the SEC01 "23" (must resolve or owner-accept before launch)

| # | Severity | Category | Affected object | Status | Evidence | Recommended next action |
|---|----------|----------|-----------------|--------|----------|--------------------------|
| E01 | ERROR | Exposed Auth Users | `public.v_influencer_referrals_valid` (view) | open | advisor 14.06 | Review view; stop exposing `auth.users` to anon/authenticated or restrict grants |
| E02 | ERROR | Exposed Auth Users | `public.daily_platform_metrics` (view) | open | advisor 14.06 | Same — remove `auth.users` exposure / revoke PostgREST access |
| E03 | ERROR | RLS Disabled in Public | `public._messages_policies_backup` (table) | needs owner decision | advisor 14.06; name suggests a backup | Confirm it's an obsolete backup → drop it (owner approval), or enable RLS |
| E04 | ERROR | Security Definer View | `public.v_user_wallets` | open | advisor 14.06 | Review: view runs as owner, bypasses RLS — confirm no customer wallet leak |
| E05 | ERROR | Security Definer View | `public.contest_activity_last_24h` | needs owner decision | advisor 14.06 | Likely admin analytics — confirm not anon/authenticated readable |
| E06 | ERROR | Security Definer View | `public.daily_platform_metrics` | open | advisor 14.06 | Admin metrics + also Exposed Auth Users (E02) — prioritize |
| E07 | ERROR | Security Definer View | `public.contest_analytics` | needs owner decision | advisor 14.06 | Confirm admin-only access |
| E08 | ERROR | Security Definer View | `public.contest_ticket_map` | open | advisor 14.06 | Review exposure |
| E09 | ERROR | Security Definer View | `public.admin_winner_delivery_stats` | needs owner decision | advisor 14.06 | Admin view — confirm scoping |
| E10 | ERROR | Security Definer View | `public.event_queue_monitoring` | needs owner decision | advisor 14.06 | Internal monitoring — confirm not exposed |
| E11 | ERROR | Security Definer View | `public.event_queue_failed_summary` | needs owner decision | advisor 14.06 | Internal monitoring |
| E12 | ERROR | Security Definer View | `public.contest_integrity_check` | needs owner decision | advisor 14.06 | Internal/admin |
| E13 | ERROR | Security Definer View | `public.system_health_monitor` | needs owner decision | advisor 14.06 | Internal/admin |
| E14 | ERROR | Security Definer View | `public.valid_partner_api_keys` | open | advisor 14.06 | **Priority** — partner API key view; confirm no key/hash exposure |
| E15 | ERROR | Security Definer View | `public.admin_winner_delivery_detail` | needs owner decision | advisor 14.06 | Admin view |
| E16 | ERROR | Security Definer View | `public.v_first_topup_valid` | open | advisor 14.06 | Review exposure |
| E17 | ERROR | Security Definer View | `public.v_influencer_referrals_paid` | open | advisor 14.06 | Review exposure |
| E18 | ERROR | Security Definer View | `public.partner_api_activity` | open | advisor 14.06 | Confirm partner-scoped, no cross-partner leak |
| E19 | ERROR | Security Definer View | `public.contest_miocoin_totals` | needs owner decision | advisor 14.06 | Likely public/contest data |
| E20 | ERROR | Security Definer View | `public.winners_with_contest` | needs owner decision | advisor 14.06 | Likely intentional public winners |
| E21 | ERROR | Security Definer View | `public.v_influencer_referrals_valid` | open | advisor 14.06 | Also E01 (Exposed Auth Users) |
| E22 | ERROR | Security Definer View | `public.contest_progress` | needs owner decision | advisor 14.06 | Likely public contest data |
| E23 | ERROR | Security Definer View | `public.contest_revenue` | open | advisor 14.06 | Revenue data — confirm admin-only |

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
