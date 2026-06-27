# Shoptet Phase 1A Production Reconciliation Plan

Date: 2026-06-27

## Scope

This is a preparation package only. Do not execute it until Pavel explicitly approves production reconciliation.

Target production project: `xkzhjldrojjlrkezorey`

Observed read-only production state:

- `shoptet_import_runs` exists and is empty.
- `shoptet_import_row_log` exists and is empty.
- `partners.shoptet_import_enabled` is missing.
- `partners.shoptet_export_secret_name` is missing.
- `partners.shoptet_customer_delivery` is missing.
- `set_shoptet_export_secret(uuid, text)` is missing.
- `get_shoptet_export_url(uuid)` is missing.
- Edge Functions `import-shoptet-orders` and `set-shoptet-export-secret` are already deployed and active version 1.
- `email_queue` has 3 risky pending invoice emails from 2026-02-08.

## Prepared SQL

Prepared file:

- `docs/sql/shoptet_phase1a_production_reconcile.sql`

The SQL is idempotent and conservative:

- Adds only missing Shoptet columns to `public.partners`.
- Adds the Shoptet delivery check constraint only if absent.
- Creates/verifies the two Shoptet monitoring tables.
- Enables RLS on both monitoring tables.
- Recreates the intended admin/superadmin read policies.
- Creates/verifies the two service-role-only Vault RPCs.
- Revokes RPC execution from public, anon, and authenticated.
- Grants RPC execution only to service_role.
- Does not enable BOHEMIA import.
- Does not store or change Vault secrets.
- Does not touch `email_queue`.
- Does not touch `partner_reward_codes`.
- Does not deploy Edge Functions.
- Does not create reward codes or send emails.

## Email Queue Owner Decision

The 3 pending invoice emails are outside Shoptet Phase 1A and must be handled only after explicit Pavel approval.

Allowed later decisions:

- Leave untouched.
- Park for later manual review.
- Mark failed.

Forbidden without explicit approval:

- Sending them.
- Editing recipients/body.
- Deleting them.
- Using Shoptet rollout as a reason to process the queue.

## Approval Gate

Production dry-run rollout remains blocked until this reconciliation is approved and applied, then the final precheck passes.

Pavel approval wording for reconciliation only:

```text
SCHVALUJI SHOPTET PHASE 1A PRODUKČNÍ RECONCILIATION: na produkci xkzhjldrojjlrkezorey spustit pouze reviewed SQL docs/sql/shoptet_phase1a_production_reconcile.sql, které doplní chybějící Phase 1A DB objekty, ověří tabulky/policies/indexy/RLS/RPC, nezapne BOHEMIA import, nezmění Vault secrets, neodešle e-maily, nevytvoří reward kódy, nedotkne se email_queue ani partner_reward_codes a nenasadí žádné Edge Functions.
```

Separate owner decision still needed for the 3 pending invoice emails.

Separate approval still needed later for Shoptet production dry-run rollout.
