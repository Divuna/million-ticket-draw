# OneMil Shoptet Phase 1 Handoff

Date: 2026-06-27

## Scope

Shoptet Phase 1A, 1B, and 1C were completed on staging only.

- Staging project: `dxmowysntemfqfnanxua`
- Production project: `xkzhjldrojjlrkezorey`
- Phase 1A/1B commit: `2f0027e4`
- Production was not touched.
- No production SQL was run.
- No deploy was performed as part of this handoff documentation update.
- No emails were sent as part of this handoff documentation update.

## Phase 1A/1B

Phase 1A/1B completed the staging-side Shoptet foundation. The Shoptet URL is stored in Vault only and must not be copied into docs, logs, commits, issues, or prompts.

Dry-run result on staging:

- Rows total: 6
- Valid rows: 6
- Invalid rows: 0
- Would create: 6
- Status `paid`: 6

## Phase 1C

Phase 1C created and issued 6 BOHEMIA reward codes on staging.

- Reward codes are intentionally not recorded here.
- Idempotency was verified: a second run created 0 duplicate reward codes.
- 1 test email was delivered to `veru.enge@gmail.com`.
- `eshop@onemil.cz` is the test e-shop / partner side.
- `veru.enge@gmail.com` is the test customer / buyer side.

## Email Queue Cleanup

The old staging E2E email artifacts were cleaned up:

- 474 old E2E emails were parked and then moved to `failed`.
- Final staging email queue: 1 sent Shoptet test email, 0 pending, old artifacts failed.

## Redeem Status

Redeem was not completed because there is no public staging frontend.

Pavel accidentally tested a staging reward code on production `onemil.cz`; production correctly showed it as invalid because the production database does not contain staging codes.

## Next Task

The next task is production rollout planning only, not execution.

Do not run production SQL, deploy, send emails, touch production, or reveal Shoptet URL, reward codes, API keys, tokens, hashes, or CSV customer emails during the planning task.
