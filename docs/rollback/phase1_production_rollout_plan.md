# Phase 1 Production Rollout Plan - Sensitive Admin Lock

Status: prepared package only. Do not execute without Pavel's explicit approval.

Production project: `xkzhjldrojjlrkezorey`  
Staging project already tested: `dxmowysntemfqfnanxua`  
Rollback baseline: `docs/rollback/phase1_baseline.sql`

## Read-Only Recheck Finding

Production DB/RLS/RPC still has the original gates:
- `is_admin()`
- `has_role(..., 'admin') OR has_role(..., 'superadmin')`
- direct `role IN ('admin','superadmin')`
- `public.is_superadmin(uuid)` does not exist yet on production.

Production Edge Function sources already contain `role='superadmin'` JWT checks:
- `create-affiliate-payout-document` production v9
- `generate-affiliate-bank-export` production v9
- `generate-partner-invoice-pdf` production v136
- `send-partner-invoice-email` production v127

Therefore this rollout package includes no Edge Function deploy step. Edge Functions are verification-only: confirm they remain superadmin-gated and that internal token / service-role automation paths remain unchanged.

## Scope

DB/RLS/RPC areas covered by `phase1_production_apply.sql`:
- `public.is_superadmin(check_user_id uuid default auth.uid())`
- `payments`
- `influencer_commissions`
- affiliate finance RLS
- affiliate finance RPCs
- partner invoices, invoice lines, and invoice exports
- `contest_economy`
- tickets admin read / contest revenue dependencies
- contest admin RPCs
- winners write/status history
- prize delivery RPCs
- `referral_rewards`
- `settings`
- `event_logs`
- production-only `get_admin_top_bar_stats`

Preserved intentionally:
- `affiliate_commissions` own-row SELECT branch.
- `payments` and `tickets` own-row read policies.
- partner-own invoice, line, and export read policies.
- `referral_rewards` own-row SELECT.
- public-read `winners` policies.
- public-read `bonus_prizes` behavior. This is a separate product/design decision and is not changed by Phase 1.

## Pre-Flight Checklist

Do all of this before any production write:
- Confirm the latest scheduled daily DB backup in Supabase Dashboard.
- Run a manual `pg_dump` because PITR is off.
- Confirm these files exist in the exact deployed commit:
  - `docs/rollback/phase1_baseline.sql`
  - `docs/rollback/phase1_production_apply.sql`
  - `docs/rollback/phase1_production_rollback.sql`
  - `docs/rollback/phase1_production_verification.sql`
- Confirm production superadmin `divispavel2@gmail.com` exists and can sign in.
- Confirm no deploy command targets the wrong Supabase project.
- If any Supabase CLI command is used later, explicitly pass `--project-ref xkzhjldrojjlrkezorey` for production. For staging, explicitly pass `--project-ref dxmowysntemfqfnanxua`.
- Confirm the old dirty worktree is not used for rollout.
- Confirm Edge Function deploys are not part of this package.

## Stop Points

1. Apply only section 1 of `phase1_production_apply.sql` (`public.is_superadmin`) and run helper verification.
2. Apply section 2 (RLS policies) and run RLS verification.
3. Apply section 3 (RPC gates) and run RPC verification.
4. Verify Edge Functions only; do not deploy.
5. Run the full `phase1_production_verification.sql`.
6. Stop and have Pavel confirm the result before any next production action.

## Expected Results

- Superadmin allowed.
- Admin/subadmin blocked from sensitive admin data.
- Normal user blocked.
- Anon blocked.
- Affiliate own commission visibility preserved.
- Edge Functions already superadmin-gated; no deploy needed.
- Internal token / service-role automation paths in partner invoice Edge Functions remain unchanged.

## Rollback

Rollback source is the captured production baseline, not migration history. If rollback is needed, run `phase1_production_rollback.sql` in reverse scope order after confirming the incident and expected blast radius.

Rollback restores the original admin/admin+superadmin DB/RLS/RPC gates and drops `public.is_superadmin(uuid)` after no remaining policies/functions depend on it.

## Non-Goals

- No production SQL is run by preparing this package.
- No Edge Functions are deployed by preparing this package.
- No app behavior is changed by preparing this package.
- No public-read `winners` / `bonus_prizes` product decision is made here.
